/**
 * Extractor Logic for AnimeVOSTFR
 * Site: animevostfr.org (WordPress + ToroPlay theme)
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://animevostfr.org";

/**
 * Search for anime on AnimeVOSTFR
 */
async function searchAnime(title) {
    try {
        const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`);
        const $ = cheerio.load(html);
        const results = [];

        // ToroPlay search results use .TPost or .Result links
        $('a').each((i, el) => {
            const h = $(el).attr('href') || '';
            const t = $(el).text().trim();
            if (h.includes('/animes/') && t.length > 2) {
                results.push({ title: t, url: h });
            }
        });

        // Deduplicate
        const seen = new Set();
        const unique = results.filter(r => {
            if (seen.has(r.url)) return false;
            seen.add(r.url);
            return true;
        });

        console.log(`[AnimeVOSTFR] Search results: ${unique.length}`);

        const normalize = (s) => s.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
        const simplifiedTitle = normalize(title);

        // Find all matches that contain the title
        let matches = unique.filter(r => normalize(r.title).includes(simplifiedTitle));

        // If no exact match but we have search results, trust the search engine
        // This helps with English/French title differences (e.g. "Attack on Titan" -> "L'Attaque des Titans")
        if (matches.length === 0 && unique.length > 0) {
            console.log(`[AnimeVOSTFR] No exact match for "${title}", falling back to ${unique.length} search results`);
            matches = unique;
        }

        if (matches.length > 0) {
            console.log(`[AnimeVOSTFR] Found ${matches.length} matches for ${title}`);
        }
        return matches;
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
        const html = await fetchText(seriesUrl);
        const $ = cheerio.load(html);
        const episodeLinks = [];

        // Collect all episode links
        $('a[href*="/episode/"]').each((i, el) => {
            const h = $(el).attr('href') || '';
            const t = $(el).text().trim();
            episodeLinks.push({ url: h, text: t });
        });

        console.log(`[AnimeVOSTFR] Found ${episodeLinks.length} episode links`);

        // Create strict regex patterns for the episode number
        const epStr = String(episode);
        const epPadded = epStr.padStart(2, '0');
        
        // 1. Try to find match in URL first (more reliable)
        // AnimeVOSTFR URL format: {slug}-{season_num}-episode-{ep_num}  (no "saison" word)
        // Also support legacy pattern with "saison" word
        const sortedUrlPatterns = [
            // Primary: no "saison" word (real URL format: -1-episode-1)
            new RegExp(`-${season}-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-${season}-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            // Legacy: with "saison" word
            new RegExp(`-saison-${season}-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-saison-${season}-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            // No season number in URL (single-season animes)
            new RegExp(`-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-ep-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-ep-${epPadded}(?:-vostfr|-vf|/|$)`, 'i')
        ];

        for (const pattern of sortedUrlPatterns) {
            const match = episodeLinks.find(l => {
                if (!pattern.test(l.url)) return false;
                
                // If we are looking for a relative episode, reject URLs that explicitly mention a different season
                if (!isAbsolute) {
                    const seasonMatch = l.url.match(/-(?:saison-)?(\d+)-episode-/i);
                    if (seasonMatch && parseInt(seasonMatch[1]) !== season) {
                        return false;
                    }
                }
                return true;
            });
            
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in URL: ${match.url}`);
                return match.url;
            }
        }

        const textPatterns = [
            new RegExp(`^\\s*Episode\\s+${epStr}\\s*$`, 'i'),
            new RegExp(`^\\s*Ep\\s*${epStr}\\s*$`, 'i'),
            new RegExp(`(?:^|[^0-9])${epStr}(?:$|[^0-9])`)
        ];

        // 2. Try to find match in link text
        for (const pattern of textPatterns) {
            const match = episodeLinks.find(l => {
                if (!pattern.test(l.text)) return false;
                
                // If we are looking for a relative episode, reject URLs that explicitly mention a different season
                if (!isAbsolute) {
                    const seasonMatch = l.url.match(/-(?:saison-)?(\d+)-episode-/i);
                    if (seasonMatch && parseInt(seasonMatch[1]) !== season) {
                        return false;
                    }
                }
                return true;
            });
            
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in text: ${match.url}`);
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
        const html = await fetchText(episodeUrl);
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
        for (const entry of trembedEntries) {
            try {
                let trembedUrl = entry.src;
                if (trembedUrl.startsWith('/')) trembedUrl = BASE_URL + trembedUrl;
                else if (trembedUrl.startsWith('?')) trembedUrl = BASE_URL + '/' + trembedUrl;
                if (!trembedUrl.startsWith('http')) continue;

                const embedHtml = await fetchText(trembedUrl, { headers: { 'Referer': episodeUrl } });
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
                    if (stream) streams.push(stream);
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

    let matches = [];
    for (const t of titlesOrdered) {
        matches = await searchAnime(t);
        if (matches && matches.length > 0) break;
    }
    if (!matches || matches.length === 0) return [];

    // Prioritize results that match the season if explicitly mentioned
    matches = matches.sort((a, b) => {
        const aT = a.title.toLowerCase();
        const bT = b.title.toLowerCase();
        const sMatch = `saison ${season}`;
        const hasA = aT.includes(sMatch);
        const hasB = bT.includes(sMatch);
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        return 0;
    });

    const streams = [];
    const checkedEpisodeUrls = new Set();
    const checkedSeriesUrls = new Set();

    for (const match of matches) {
        if (checkedSeriesUrls.has(match.url)) continue;
        checkedSeriesUrls.add(match.url);

        const matchLower = match.title.toLowerCase();
        const isVf = matchLower.includes(' vf') || match.url.includes('vf');
        const langSuffix = isVf ? 'VF' : 'VOSTFR';

        // Optimization: if the result is explicitly for a different season, 
        // skip it unless targetEpisodes contains an absolute episode (which might be in any season page)
        const seasonMatch = matchLower.match(/saison\s*(\d+)/);
        if (seasonMatch && parseInt(seasonMatch[1]) !== season && targetEpisodes.length === 1) {
            continue;
        }

        for (const ep of targetEpisodes) {
            // Find the episode URL from the series page
            const isAbsolute = ep !== episode;
            const episodeUrl = await findEpisodeUrl(match.url, season, ep, isAbsolute);
            if (episodeUrl && !checkedEpisodeUrls.has(episodeUrl)) {
                checkedEpisodeUrls.add(episodeUrl);
                const playerStreams = await extractPlayersFromEpisode(episodeUrl);
                
                // Add language/episode context to names
                const epType = ep === episode ? "" : ` (Abs ${ep})`;
                playerStreams.forEach(s => {
                    if (!s.name.includes('(')) {
                        s.name = `AnimeVOSTFR (${langSuffix})`;
                    }
                    s.title = `${s.title}${epType}`;
                });
                
                streams.push(...playerStreams);
            }
        }
        
        // If we found streams for the primary season, we can stop searching other entries 
        // unless we want to be exhaustive. Let's be exhaustive for VF/VOSTFR balance.
    }

    if (streams.length === 0) {
        console.warn(`[AnimeVOSTFR] Episode S${season}E${episode} not found (targets: ${targetEpisodes.join(', ')})`);
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[AnimeVOSTFR] Total streams found: ${validStreams.length}`);
    return validStreams;
}
