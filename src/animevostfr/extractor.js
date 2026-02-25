/**
 * Extractor Logic for AnimeVOSTFR
 * Site: animevostfr.org (WordPress + ToroPlay theme)
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';

const BASE_URL = "https://animevostfr.org";

/**
 * Get the title of a media from TMDB ID
 */
async function getTmdbTitle(tmdbId, mediaType) {
    try {
        // Use language=en-US to always get English titles
        const url = `https://www.themoviedb.org/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}?language=en-US`;
        const html = await fetchText(url);
        const $ = cheerio.load(html);

        let title = $('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('h2').first().text();

        if (title && title.includes(' (')) title = title.split(' (')[0];
        if (title && title.includes(' - ')) title = title.split(' - ')[0];

        title = title ? title.trim() : null;
        console.log(`[AnimeVOSTFR] TMDB Title found: ${title}`);
        return title;
    } catch (e) {
        console.error(`[AnimeVOSTFR] Failed to get title from TMDB: ${e.message}`);
        return null;
    }
}

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

        // Prefer VOSTFR version
        let bestMatch = unique.find(r =>
            normalize(r.title).includes(simplifiedTitle) && (r.url.includes('vostfr') || r.url.includes('voir-')));

        // Fallback: any match
        if (!bestMatch) {
            bestMatch = unique.find(r => normalize(r.title).includes(simplifiedTitle));
        }

        // Fallback: first result
        if (!bestMatch && unique.length > 0) bestMatch = unique[0];

        if (bestMatch) {
            console.log(`[AnimeVOSTFR] Selected: ${bestMatch.title} -> ${bestMatch.url}`);
        }
        return bestMatch || null;
    } catch (e) {
        console.error(`[AnimeVOSTFR] Search error: ${e.message}`);
        return null;
    }
}

/**
 * Find the episode URL from the series page
 */
async function findEpisodeUrl(seriesUrl, season, episode) {
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

        // Try to match episode number in URL
        const epPatterns = [
            `episode-${episode}/`,
            `episode-${episode}`,
            `saison-${season}-episode-${episode}`,
            `-${season}-episode-${episode}`,
        ];

        for (const pattern of epPatterns) {
            const match = episodeLinks.find(l => l.url.includes(pattern));
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode: ${match.url}`);
                return match.url;
            }
        }

        // Fallback: try to match by episode number at end of URL
        const padded = String(episode).padStart(1, '0');
        const match = episodeLinks.find(l => {
            const urlLower = l.url.toLowerCase();
            return urlLower.includes(`episode-${padded}/`) || urlLower.includes(`episode-${padded}`);
        });

        if (match) {
            console.log(`[AnimeVOSTFR] Found episode (fallback): ${match.url}`);
            return match.url;
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

        // Get server names from TPlayerNv tabs
        const serverNames = [];
        $('.TPlayerNv li').each((i, el) => {
            serverNames.push($(el).text().trim());
        });

        // Get trembed data-src URLs from TPlayerTb divs
        const trembedUrls = [];

        // First tab may be an iframe directly (Current)
        $('.TPlayerTb').each((i, el) => {
            const iframe = $(el).find('iframe');
            const lazyDiv = $(el).find('.lazy-player');

            if (iframe.length && iframe.attr('src')) {
                trembedUrls.push(iframe.attr('src'));
            } else if (lazyDiv.length && lazyDiv.attr('data-src')) {
                trembedUrls.push(lazyDiv.attr('data-src'));
            }
        });

        console.log(`[AnimeVOSTFR] Found ${trembedUrls.length} player tabs`);

        // Resolve each trembed URL to get final player URL
        for (let i = 0; i < trembedUrls.length; i++) {
            try {
                let trembedUrl = trembedUrls[i];
                if (trembedUrl.startsWith('/')) {
                    trembedUrl = BASE_URL + trembedUrl;
                }

                const embedHtml = await fetchText(trembedUrl);
                const $embed = cheerio.load(embedHtml);

                // Find the iframe src inside the embed page
                const playerSrc = $embed('iframe').attr('src');

                if (playerSrc && playerSrc.startsWith('http')) {
                    const serverName = serverNames[i] || `Lecteur ${i + 1}`;
                    const playerName = getPlayerName(playerSrc);

                    const stream = await resolveStream({
                        name: `AnimeVOSTFR`,
                        title: `${playerName} (${serverName})`,
                        url: playerSrc,
                        quality: "HD",
                        headers: { "Referer": BASE_URL }
                    });
                    streams.push(stream);
                }
            } catch (err) {
                console.error(`[AnimeVOSTFR] Failed to resolve player ${i}: ${err.message}`);
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
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) return [];

    // --- ARMSYNC Metadata Resolution ---
    let targetEpisodes = [episode];
    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId) {
            const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
            if (absoluteEpisode) {
                targetEpisodes.push(absoluteEpisode);
            }
        }
    } catch (e) {
        console.warn(`[AnimeVOSTFR] ArmSync failed: ${e.message}`);
    }
    // ------------------------------------

    const searchResult = await searchAnime(title);
    if (!searchResult) return [];

    const streams = [];
    const foundEpisodes = new Set();

    for (const ep of targetEpisodes) {
        // Find the episode URL from the series page
        const episodeUrl = await findEpisodeUrl(searchResult.url, season, ep);
        if (episodeUrl && !foundEpisodes.has(episodeUrl)) {
            foundEpisodes.add(episodeUrl);
            const playerStreams = await extractPlayersFromEpisode(episodeUrl);
            streams.push(...playerStreams);
        }
    }

    if (streams.length === 0) {
        console.warn(`[AnimeVOSTFR] Episode S${season}E${episode} not found (targets: ${targetEpisodes.join(', ')})`);
    }

    console.log(`[AnimeVOSTFR] Total streams found: ${streams.length}`);
    return streams;
}
