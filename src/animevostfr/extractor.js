/**
 * Extractor Logic for AnimeVOSTFR
 * Site: animevostfr.org (WordPress + ToroPlay theme)
 */

import { stripSeasonSuffix, resolveTargetEpisodes, countExtraWords } from '../utils/dle-extractor.js';
import { fetchText, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, sortStreamsByLanguage, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://v2.animevostfr.org";
const MAX_SEARCH_TITLES = 8;
const SEARCH_TIMEOUT = 10000;

/**
 * Search for anime on AnimeVOSTFR
 */
async function searchAnime(title) {
    try {
        const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`, { timeout: SEARCH_TIMEOUT });
        const $ = cheerio.load(html);
        const results = [];

        // Only extract links from search result items, not from sidebar/menus/footer
        $('.post-title a, .TPost a, .TPostMv a, article a[href*="/animes/"]').each((i, el) => {
            const h = $(el).attr('href') || '';
            const t = $(el).text().trim();
            if (h.includes('/animes/')) {
                // Use image alt as title if available (more accurate than link text)
                // TV-safe : .closest() n'existe pas dans le runtime cheerio de NuvioTV
                const imgAlt = (typeof $(el).closest === 'function')
                    ? $(el).closest('.TPost, .TPostMv, article').find('img').first().attr('alt')
                    : null;
                results.push({ title: imgAlt || t || h.split('/').pop().replace(/-/g, ' '), url: h, rawText: t });
            }
        });

        // Fallback: if no structured results, look for any /animes/ link in likely content areas
        if (results.length === 0) {
            $('.content, #main, main, .result-item, li > a[href*="/animes/"]').each((i, el) => {
                const h = $(el).attr('href') || '';
                const t = $(el).text().trim();
                if (h.includes('/animes/') && t.length > 2) {
                    const imgAlt = (typeof $(el).closest === 'function')
                        ? $(el).closest('li, div').find('img').first().attr('alt')
                        : null;
                    results.push({ title: imgAlt || t, url: h, rawText: t });
                }
            });
        }

        // Last resort: grab /animes/ links from the whole page
        if (results.length === 0) {
            $('a[href*="/animes/"]').each((i, el) => {
                const h = $(el).attr('href') || '';
                const t = $(el).text().trim();
                if (h.includes('/animes/') && t.length > 2) {
                    results.push({ title: t, url: h, rawText: t });
                }
            });
        }

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

        // Score each result by how many title words it matches.
        // ATTENTION : l'égalité exacte doit être testée AVANT l'includes,
        // sinon "Naruto" (exact) et "Naruto Shippuden" (contient "naruto")
        // sont ex æquo à 100 et le tri stable garde l'ordre du site → la
        // mauvaise série (suite/fan-edit) est extraite pour la S1.
        const scored = unique.map(r => {
            const n = normalize(r.title);
            let score = 0;
            if (n === simplifiedTitle) {
                score = 200;
            } else if (simplifiedTitle.length >= 5 && n.includes(simplifiedTitle)) {
                // Includes match : pénalité par mot significatif en trop
                // (anti fan-edit/dérivés : "Naruto Shippuden Kai" vs "Naruto" → -50)
                score = 100;
                const extra = countExtraWords(n, simplifiedTitle);
                if (extra > 0) score -= Math.min(extra * 25, 60);
            } else {
                for (const w of titleWords) {
                    if (n.includes(w)) score += 20;
                }
                // Penalize length difference
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
            // Keep only results with score at least 50% of best score
            const threshold = Math.max(20, bestScore * 0.5);
            matches = scored.filter(r => r.score >= threshold);
        } else {
            // No good match - return empty rather than garbage
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

        // Resolve each trembed URL to get the real player iframe (séquentiel + early-exit)
        const DIRECT_HOSTS = ['vidmoly', 'sibnet', 'luluvid', 'uqload', 'myvi', 'mytv', 'dood', 'ds2play', 'hgcloud', 'stape', 'streamtape'];
        let directCount = 0;
        for (const entry of trembedEntries) {
            try {
                let trembedUrl = entry.src;
                if (trembedUrl.startsWith('/')) trembedUrl = BASE_URL + trembedUrl;
                else if (trembedUrl.startsWith('?')) trembedUrl = BASE_URL + trembedUrl;
                if (!trembedUrl.startsWith('http')) continue;

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
                    if (stream) {
                        streams.push(stream);
                        if (DIRECT_HOSTS.some(h => playerSrc.toLowerCase().includes(h))) directCount++;
                        if (directCount >= 2) break;
                    }
                }
            } catch (err) {
                console.error(`[AnimeVOSTFR] Failed to resolve player "${entry.serverName}": ${err.message}`);
            }
        }
    } catch (e) {
        console.error(`[AnimeVOSTFR] Error extracting players: ${e.message}`);
    }
    return streams;
}

/**
 * Get player name from URL domain
 */
function detectLang(url, title) {
    const u = url.toLowerCase();
    const t = (title || '').toLowerCase();
    // Check VOSTFR first (must be before VF check since 'vostfr' contains 'vf')
    if (/\/animes\/[^/]*-vostfr(?:\/|$)/.test(u) || /\bvostfr\b/.test(t)) return 'VOSTFR';
    if (/\/animes\/[^/]*-vf(?:\/|$)/.test(u) || /\bvf\b/.test(t)) return 'VF';
    if (/\/animes\/[^/]*-vo(?:\/|$)/.test(u) || /\bvo\b/.test(t)) return 'VO';
    // Default: VOSTFR pour un site spécialisé VOSTFR (animevostfr.org)
    return 'VOSTFR';
}

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

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    // Sort titles: French titles first (AnimeVOSTFR is French-language, search works better with FR)
    const isFrenchTitle = (t) => /[àâéèêëîïôùûüçœæ']/i.test(t);
    const titlesOrdered = [
        ...titles.filter(isFrenchTitle),
        ...titles.filter(t => !isFrenchTitle(t))
    ];

    // --- ArmSync: resolve absolute episode for TV series ---
    const targetEpisodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode);

    // For movies, use season=1, episode=1 to search episode pages
    const searchSeason = (mediaType === 'movie' && season == null) ? 1 : effectiveSeason;
    const searchEpisode = (mediaType === 'movie' && episode == null) ? 1 : episode;

    // OPTIMISATION: Limiter les recherches à 3 titres max (au lieu de 8+)
    // Prioriser le titre principal + 1 variante courte
    const baseTitles = titlesOrdered.slice(0, 3);
    const shortTitles = [];
    for (const t of baseTitles) {
        const cleanT = stripSeasonSuffix(t);
        shortTitles.push(cleanT);
        // Juste 1 variante courte (split sur ":" ou "-")
        const parts = cleanT.split(/[:\–\-]+/).map(s => s.trim()).filter(s => s.length > 5);
        if (parts.length > 0 && parts[0] !== cleanT) shortTitles.push(parts[0]);
    }

    let matches = [];
    const seenKeys = new Set();
    const uniqueTitles = shortTitles.filter(t => {
        const key = t.toLowerCase().trim();
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });

    // OPTIMISATION: Recherche séquentielle avec early-exit
    // Au lieu de lancer toutes les recherches en parallèle, on arrête dès
    // qu'on trouve un bon résultat (score >= 100). Cela réduit le temps de
    // 15s à ~3s pour la plupart des titres.
    for (const title of uniqueTitles) {
        const results = await searchAnime(title);
        if (results && results.length > 0) {
            matches = results;
            break;
        }
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
    const mainTitle = titlesOrdered[0]?.toLowerCase() || '';
    const mainWords = mainTitle.split(/\s+/).filter(w => w.length > 3);

    const uniqueMatches = [];
    const seenMatchUrls = new Set();
    for (const m of matches) {
        if (!seenMatchUrls.has(m.url)) {
            seenMatchUrls.add(m.url);
            uniqueMatches.push(m);
        }
    }

    // Movie mode: only try the first match (1 hop) to avoid excessive chaining
    const matchesToProcess = mediaType === 'movie' ? uniqueMatches.slice(0, 1) : uniqueMatches;

    // Résolution séquentielle avec early-exit (target 2 streams directs)
    let directStreamCount = 0;
    for (const match of matchesToProcess) {
        if (directStreamCount >= 2) break;

        const langSuffix = detectLang(match.url, match.title);
        const matchLower = (match.title + ' ' + match.url).toLowerCase();

        const spinoffKeywords = ['vigilantes', 'prelude', 'special', 'ova', 'ona'];
        const isSpinoff = spinoffKeywords.some(k => matchLower.includes(k))
            && !mainWords.some(w => matchLower.includes(w));
        if (isSpinoff && uniqueMatches.length > 1) {
            console.log(`[AnimeVOSTFR] Skipping spinoff match: ${match.title}`);
            continue;
        }

        const seasonMatchText = matchLower.match(/saison\s*(\d+)/);
        if (seasonMatchText && parseInt(seasonMatchText[1]) !== Number(searchSeason) && targetEpisodes.length === 1) {
            continue;
        }

        const epResults = [];
        for (const ep of targetEpisodes) {
            const isAbsolute = ep !== searchEpisode;
            const episodeUrl = await findEpisodeUrl(match.url, searchSeason, ep, isAbsolute);
            if (episodeUrl && !checkedEpisodeUrls.has(episodeUrl)) {
                checkedEpisodeUrls.add(episodeUrl);
                const playerStreams = await extractPlayersFromEpisode(episodeUrl);
                epResults.push({ ep, playerStreams });
            }
        }

        for (const { ep, playerStreams } of epResults) {
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
                s.language = langSuffix;
            });
            streams.push(...playerStreams);
            if (playerStreams.some(s => s.isDirect)) directStreamCount++;
        }
    }

    if (streams.length === 0) {
        console.warn(`[AnimeVOSTFR] Episode S${searchSeason}E${searchEpisode} not found (targets: ${targetEpisodes.join(', ')})`);
    }

    // Dédupliquer les streams par URL ( VF/VOSTFR peuvent servir les mêmes sources)
    const seenUrls = new Set();
    const deduped = [];
    for (const s of streams) {
        if (!s || !s.url) continue;
        const baseUrl = s.url.split('?')[0];
        if (seenUrls.has(baseUrl)) continue;
        seenUrls.add(baseUrl);
        deduped.push(s);
    }

    const directStreams = deduped.filter(s => s && s.isDirect);
    const embedStreams = deduped.filter(s => s && !s.isDirect && s.url);

    // Prefer direct streams. If none found, include embed URLs as fallback
    // so the native player can attempt playback (ExoPlayer/AVPlayer handle some embeds).
    const validStreams = directStreams.length > 0 ? directStreams : embedStreams;
    if (directStreams.length === 0 && embedStreams.length > 0) {
        console.log(`[AnimeVOSTFR] No direct streams, using ${embedStreams.length} embed URL(s) as fallback`);
    }
    console.log(`[AnimeVOSTFR] Total streams found: ${validStreams.length} (${directStreams.length} direct, ${embedStreams.length} embed)`);
    
    return sortStreamsByLanguage(validStreams);
}
