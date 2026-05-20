/**
 * Extractor Logic for AnimeVOSTFR
 * Site: animevostfr.org (WordPress + ToroPlay theme)
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://v2.animevostfr.org";
const MAX_SEARCH_TITLES = 8;
const SEARCH_TIMEOUT = 10000;

/**
 * Parse anime search results from HTML using regex (avoids cheerio corruption in QuickJS)
 */
function parseSearchResults(html) {
    const results = [];
    const seenUrls = new Set();

    // Match links containing /animes/ with their text and image alt
    const linkRegex = /<a\s+[^>]*href="([^"]*\/animes\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const url = match[1];
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const inner = match[2];
        const text = inner.replace(/<[^>]+>/g, '').trim();
        if (text.length <= 2) continue;

        // Look for an image alt near this link
        const imgAltMatch = html.slice(Math.max(0, match.index - 500), match.index + match[0].length + 500)
            .match(/<img[^>]+alt="([^"]*)"/i);
        const title = (imgAltMatch && imgAltMatch[1].trim()) || text || url.split('/').pop().replace(/-/g, ' ');

        results.push({ title, url, rawText: text });
    }

    return results;
}

/**
 * Search for anime on AnimeVOSTFR
 */
async function searchAnime(title) {
    try {
        const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`, { timeout: SEARCH_TIMEOUT });
        let results = parseSearchResults(html);

        // Deduplicate
        const seen = new Set();
        const unique = results.filter(r => {
            if (seen.has(r.url)) return false;
            seen.add(r.url);
            return true;
        });

        console.log(`[AnimeVOSTFR] Search results for "${title}": ${unique.length}`);

        const normalize = (s) => s.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/['\u2018\u2019:!.,?"]/g, '').replace(/\b(?:the|an?)\s+/g, '').replace(/\s+/g, ' ').trim();
        const simplifiedTitle = normalize(title);
        const titleWords = simplifiedTitle.split(/\s+/).filter(w => w.length > 2);

        // Score each result by how many title words it matches
        const scored = unique.map(r => {
            const n = normalize(r.title);
            let score = 0;
            if (simplifiedTitle.length >= 5 && n.includes(simplifiedTitle)) {
                score = 100;
            } else if (n === simplifiedTitle) {
                score = 200;
            } else {
                for (const w of titleWords) {
                    if (n.includes(w)) score += 20;
                }
                const lenRatio = Math.min(n.length, simplifiedTitle.length) / Math.max(n.length, simplifiedTitle.length);
                score = Math.round(score * lenRatio);
            }
            return { ...r, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        const bestScore = best ? best.score : 0;

        let matches;
        if (best && bestScore >= 25) {
            const threshold = Math.max(20, bestScore * 0.5);
            matches = scored.filter(r => r.score >= threshold);
        } else {
            matches = [];
        }

        console.log(`[AnimeVOSTFR] Best match: "${best?.title}" (score ${bestScore}) -> ${matches.length} results kept`);
        return matches.map(r => ({ title: r.title, url: r.url }));
    } catch (e) {
        console.error(`[AnimeVOSTFR] Search error: ${e.message}`);
        return [];
    }
}

/**
 * Find the episode URL from the series page
 */
async function findEpisodeUrl(seriesUrl, season, episode, isAbsolute = false) {
    try {
        const html = await fetchText(seriesUrl, { timeout: SEARCH_TIMEOUT });
        const $ = cheerio.load(html);
        const episodeLinks = [];

        // Collect all episode links
        $('a[href*="/episode/"]').each((i, el) => {
            const h = $(el).attr('href') || '';
            const t = $(el).text().trim();
            episodeLinks.push({ url: h, text: t });
        });

        console.log(`[AnimeVOSTFR] Found ${episodeLinks.length} episode links`);

        // If this is a movie (no season/episode), use the first episode URL found
        if (season == null || episode == null) {
            if (episodeLinks.length > 0) {
                console.log(`[AnimeVOSTFR] Movie mode: using episode URL ${episodeLinks[0].url}`);
                return episodeLinks[0].url;
            }
            // Maybe it's a direct page with embedded player, try the series URL itself
            return seriesUrl;
        }

        const epStr = String(episode);
        const epPadded = epStr.padStart(2, '0');
        
        // 1. Try to find match in URL first (more reliable)
        // AnimeVOSTFR URL format: {slug}-{season_num}-episode-{ep_num}  (no "saison" word)
        // Also support legacy pattern with "saison" word
        const seasonPattern = season ? String(season) : '';
        const sortedUrlPatterns = [
            // Primary: no "saison" word (real URL format: -1-episode-1)
            new RegExp(`-${seasonPattern}-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-${seasonPattern}-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            // Legacy: with "saison" word
            new RegExp(`-saison-${seasonPattern}-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-saison-${seasonPattern}-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            // No season number in URL (single-season animes)
            new RegExp(`-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-ep-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-ep-${epPadded}(?:-vostfr|-vf|/|$)`, 'i')
        ];

        const matchEpisode = (links, pattern) => {
            return links.find(l => {
                if (!pattern.test(l.url)) return false;
                if (!isAbsolute && season != null) {
                    const seasonMatch = l.url.match(/-(?:saison-)?(\d+)-episode-/i);
                    if (seasonMatch && parseInt(seasonMatch[1]) !== Number(season)) {
                        return false;
                    }
                }
                return true;
            });
        };

        // Try forward search (newest-first order)
        for (const pattern of sortedUrlPatterns) {
            const match = matchEpisode(episodeLinks, pattern);
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in URL: ${match.url}`);
                return match.url;
            }
        }

        const reversedLinks = [...episodeLinks].reverse();

        // Fallback: try reverse order (oldest-first)
        for (const pattern of sortedUrlPatterns) {
            const match = matchEpisode(reversedLinks, pattern);
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in URL (reversed fallback): ${match.url}`);
                return match.url;
            }
        }

        const textPatterns = [
            new RegExp(`^\\s*Episode\\s+${epStr}\\s*$`, 'i'),
            new RegExp(`^\\s*Ep\\s*${epStr}\\s*$`, 'i'),
            new RegExp(`(?:^|[^0-9])${epStr}(?:$|[^0-9])`)
        ];

        const matchByText = (links, pattern) => {
            return links.find(l => {
                if (!pattern.test(l.text)) return false;
                if (!isAbsolute && season != null) {
                    const seasonMatch = l.url.match(/-(?:saison-)?(\d+)-episode-/i);
                    if (seasonMatch && parseInt(seasonMatch[1]) !== Number(season)) {
                        return false;
                    }
                }
                return true;
            });
        };

        // 2. Try to find match in link text (forward)
        for (const pattern of textPatterns) {
            const match = matchByText(episodeLinks, pattern);
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in text: ${match.url}`);
                return match.url;
            }
        }

        // Fallback: try reverse order (oldest-first)
        for (const pattern of textPatterns) {
            const match = matchByText(reversedLinks, pattern);
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in text (reversed fallback): ${match.url}`);
                return match.url;
            }
        }

        return null;
    } catch (e) {
        console.error(`[AnimeVOSTFR] Error finding episode: ${e.message}`);
        return null;
    }
}

/**
 * Extract player URLs from an episode page via trembed redirects
 */
async function extractPlayersFromEpisode(episodeUrl) {
    const streams = [];
    try {
        const html = await fetchText(episodeUrl, { timeout: SEARCH_TIMEOUT });
        const $ = cheerio.load(html);

        // Get server names and their tab IDs from TPlayerNv
        const serverNames = {};
        $('.TPlayerNv li').each((i, el) => {
            const tabId = $(el).attr('data-tplayernv') || $(el).attr('id') || `Opt${i+1}`;
            serverNames[tabId] = $(el).text().trim() || `Lecteur ${i + 1}`;
        });

        // Collect trembed/iframe URLs from each TPlayerTb
        // Structure: <div class="TPlayerTb" id="OptN">
        //              <iframe src="?trembed=0&trid=TERM_ID&trtype=2" .../>
        //              OR <div class="lazy-player" data-src="?trembed=..."/>
        const trembedEntries = [];
        $('.TPlayerTb, .TPlayer .TPlayerTb').each((i, el) => {
            const tabId = $(el).attr('id') || `Opt${i+1}`;
            const serverName = serverNames[tabId] || `Lecteur ${i + 1}`;

            const iframe = $(el).find('iframe');
            const lazyDiv = $(el).find('.lazy-player, [data-src]');

            let src = null;
            if (iframe.length && iframe.attr('src')) {
                src = iframe.attr('src');
            } else if (lazyDiv.length && lazyDiv.attr('data-src')) {
                src = lazyDiv.attr('data-src');
            }
            if (src) trembedEntries.push({ src, serverName });
        });

        // If no TPlayerTb found, try any iframe with trembed param directly
        if (trembedEntries.length === 0) {
            $('iframe[src*="trembed"]').each((i, el) => {
                const src = $(el).attr('src');
                if (src) trembedEntries.push({ src, serverName: `Lecteur ${i + 1}` });
            });
        }

        console.log(`[AnimeVOSTFR] Found ${trembedEntries.length} player tabs`);

        // Resolve each trembed URL to get the real player iframe
        const trembedPromises = trembedEntries.map(async (entry) => {
            try {
                let trembedUrl = entry.src;
                if (trembedUrl.startsWith('/')) trembedUrl = BASE_URL + trembedUrl;
                else if (trembedUrl.startsWith('?')) trembedUrl = BASE_URL + trembedUrl;
                if (!trembedUrl.startsWith('http')) return null;

                const embedHtml = await fetchText(trembedUrl, { timeout: SEARCH_TIMEOUT, headers: { 'Referer': episodeUrl } });
                const $embed = cheerio.load(embedHtml);

                // Find the real player iframe src
                let playerSrc = $embed('iframe').first().attr('src') ||
                                $embed('[data-src]').first().attr('data-src');

                if (!playerSrc) {
                    // fallback: look for any external http URL in embed HTML
                    const extMatch = embedHtml.match(/(?:src|href)=["'](https?:\/\/(?!animevostfr)[^"']+)["']/i);
                    if (extMatch) playerSrc = extMatch[1];
                }

                if (playerSrc && playerSrc.startsWith('http')) {
                    const playerName = getPlayerName(playerSrc);
                    const stream = await resolveStream({
                        name: `AnimeVOSTFR`,
                        title: `${playerName} (${entry.serverName})`,
                        url: playerSrc,
                        quality: "HD",
                        headers: { "Referer": BASE_URL }
                    });
                    return stream;
                }
            } catch (err) {
                console.error(`[AnimeVOSTFR] Failed to resolve player "${entry.serverName}": ${err.message}`);
            }
            return null;
        });

        const playerStreams = await Promise.all(trembedPromises);
        for (const stream of playerStreams) {
            if (stream) streams.push(stream);
        }
    } catch (e) {
        console.error(`[AnimeVOSTFR] Error extracting players: ${e.message}`);
    }
    return streams;
}

/**
 * Get player name from URL domain
 */
function getPlayerName(url) {
    if (url.includes('sibnet')) return 'Sibnet';
    if (url.includes('vidmoly')) return 'Vidmoly';
    if (url.includes('christopheruntilpoint') || url.includes('voe')) return 'Voe';
    if (url.includes('luluvid')) return 'Luluvid';
    if (url.includes('savefiles')) return 'Savefiles';
    if (url.includes('uqload') || url.includes('oneupload')) return 'Uqload';
    if (url.includes('hgcloud')) return 'HGCloud';
    if (url.includes('dood') || url.includes('ds2play')) return 'Doodstream';
    if (url.includes('myvi') || url.includes('mytv')) return 'MyVi';
    if (url.includes('sendvid')) return 'Sendvid';
    if (url.includes('stape') || url.includes('streamtape')) return 'Streamtape';
    if (url.includes('moon')) return 'Moon';
    return 'Player';
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];

    // Sort titles: French titles first (AnimeVOSTFR is French-language, search works better with FR)
    const isFrenchTitle = (t) => /[àâéèêëîïôùûüçœæ']/i.test(t);
    const titlesOrdered = [
        ...titles.filter(isFrenchTitle),
        ...titles.filter(t => !isFrenchTitle(t))
    ];

    // --- ARMSYNC Metadata Resolution ---
    let targetEpisodes = [episode];
    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId) {
            const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
            if (absoluteEpisode && absoluteEpisode !== episode) {
                targetEpisodes.push(absoluteEpisode);
            }
        }
    } catch (e) {
        console.warn(`[AnimeVOSTFR] ArmSync failed: ${e.message}`);
    }
    // ------------------------------------

    // For movies, use season=1, episode=1 to search episode pages
    const searchSeason = (mediaType === 'movie' && season == null) ? 1 : season;
    const searchEpisode = (mediaType === 'movie' && episode == null) ? 1 : episode;

    const baseTitles = titlesOrdered.slice(0, MAX_SEARCH_TITLES);
    // Also generate shorter title forms for search
    const shortTitles = [];
    for (const t of baseTitles) {
        shortTitles.push(t);
        // Try shorter forms: split on ":", "-", "–"
        const parts = t.split(/[:\–\-]+/).map(s => s.trim()).filter(s => s.length > 5);
        for (const p of parts) {
            if (p !== t) shortTitles.push(p);
        }
        // Try first 3-4 significant words
        const words = t.split(/\s+/).filter(w => w.length > 2);
        if (words.length > 3) {
            shortTitles.push(words.slice(0, 3).join(' '));
            shortTitles.push(words.slice(0, 4).join(' '));
        }
    }

    let matches = [];
    const triedTitles = new Set();
    for (const t of shortTitles) {
        const key = t.toLowerCase().trim();
        if (triedTitles.has(key)) continue;
        triedTitles.add(key);
        matches = await searchAnime(t);
        if (matches && matches.length > 0) break;
    }
    if (!matches || matches.length === 0) return [];

    // Prioritize results that match the season if explicitly mentioned
    const seasonStr = searchSeason ? String(searchSeason) : '';
    matches = matches.sort((a, b) => {
        const aT = a.title.toLowerCase();
        const bT = b.title.toLowerCase();
        const sMatch = `saison ${seasonStr}`;
        const hasA = aT.includes(sMatch);
        const hasB = bT.includes(sMatch);
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        return 0;
    });

    const streams = [];
    const checkedEpisodeUrls = new Set();
    const checkedSeriesUrls = new Set();
    const mainTitle = titlesOrdered[0]?.toLowerCase() || '';
    const mainWords = mainTitle.split(/\s+/).filter(w => w.length > 3);

    for (const match of matches) {
        if (checkedSeriesUrls.has(match.url)) continue;
        checkedSeriesUrls.add(match.url);

        const matchLower = match.title.toLowerCase();
        const isVf = matchLower.includes(' vf') || match.url.includes('vf');
        const langSuffix = isVf ? 'VF' : 'VOSTFR';

        // Detect spinoff/prelude: if match title contains spinoff keywords not in the main title
        const spinoffKeywords = ['vigilantes', 'prelude', 'special', 'ova', 'ona'];
        const isSpinoff = spinoffKeywords.some(k => matchLower.includes(k))
            && !mainWords.some(w => matchLower.includes(w));
        // If it looks like a spinoff and we have other matches, skip it
        if (isSpinoff && matches.length > 1) {
            console.log(`[AnimeVOSTFR] Skipping spinoff match: ${match.title}`);
            continue;
        }

        // Optimization: if the result is explicitly for a different season, 
        // skip it unless targetEpisodes contains an absolute episode (which might be in any season page)
        const seasonMatchText = matchLower.match(/saison\s*(\d+)/);
        if (seasonMatchText && parseInt(seasonMatchText[1]) !== Number(searchSeason) && targetEpisodes.length === 1) {
            continue;
        }

        for (const ep of targetEpisodes) {
            // Find the episode URL from the series page
            const isAbsolute = ep !== searchEpisode;
            const episodeUrl = await findEpisodeUrl(match.url, searchSeason, ep, isAbsolute);
            if (episodeUrl && !checkedEpisodeUrls.has(episodeUrl)) {
                checkedEpisodeUrls.add(episodeUrl);
                const playerStreams = await extractPlayersFromEpisode(episodeUrl);
                
                // Add language/episode context to names
                const epType = ep === searchEpisode ? "" : ` (Abs ${ep})`;
                playerStreams.forEach(s => {
                    if (!s.name.includes('(')) {
                        s.name = `AnimeVOSTFR (${langSuffix})`;
                    }
                    if (!s.title.includes(langSuffix)) {
                        s.title = `${s.title}${epType} - ${langSuffix}`;
                    } else {
                        s.title = `${s.title}${epType}`;
                    }
                });
                
                streams.push(...playerStreams);
            }
        }
    }

    if (streams.length === 0) {
        console.warn(`[AnimeVOSTFR] Episode S${searchSeason}E${searchEpisode} not found (targets: ${targetEpisodes.join(', ')})`);
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[AnimeVOSTFR] Total streams found: ${validStreams.length}`);
    
    // Sort streams to prioritize VF (French) over VOSTFR
    validStreams.sort((a, b) => {
        const isVf = (str) => str && (str.toUpperCase().includes('VF') || str.toUpperCase().includes('FRENCH'));
        const aIsVf = isVf(a.name) || isVf(a.title);
        const bIsVf = isVf(b.name) || isVf(b.title);
        
        if (aIsVf && !bIsVf) return -1;
        if (!aIsVf && bIsVf) return 1;
        return 0;
    });

    return validStreams;
}
