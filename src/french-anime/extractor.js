/**
 * Extractor Logic for French-Anime
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getEpisodeAirDate, resolveMalMetadata } from '../utils/armsync.js';

const BASE_URL = "https://french-anime.com";

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
        console.log(`[French-Anime] TMDB Title found: ${title}`);
        return title;
    } catch (e) {
        console.error(`[French-Anime] Failed to get title from TMDB: ${e.message}`);
        return null;
    }
}

/**
 * Search for the anime on French-Anime using DLE POST search
 */
async function searchAnime(title) {
    try {
        const formData = `do=search&subaction=search&story=${encodeURIComponent(title)}`;
        const html = await fetchText(`${BASE_URL}/index.php?do=search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': BASE_URL
            },
            body: formData
        });

        const $ = cheerio.load(html);
        const results = [];

        // Extract search results from mov-t links
        $('a.mov-t').each((i, el) => {
            const h = $(el).attr('href');
            const t = $(el).text().trim();
            if (h && h.includes('.html')) {
                results.push({ title: t, url: h });
            }
        });

        const normalize = (s) => s.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
        const simplifiedTitle = normalize(title);

        console.log(`[French-Anime] Search results: ${results.length}`);

        // 1. Exact match (VOSTFR preferred)
        let bestMatch = results.find(r =>
            normalize(r.title).includes(simplifiedTitle) && r.url.includes('animes-vostfr'));

        // 2. Exact match (any language)
        if (!bestMatch) {
            bestMatch = results.find(r => normalize(r.title).includes(simplifiedTitle));
        }

        // 3. Fallback to first result
        if (!bestMatch) bestMatch = results[0];

        if (bestMatch) {
            console.log(`[French-Anime] Selected: ${bestMatch.title} -> ${bestMatch.url}`);
            return bestMatch;
        }

        return null;
    } catch (e) {
        console.error(`[French-Anime] Search error: ${e.message}`);
        return null;
    }
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
    if (url.includes('up4fun')) return 'Up4Fun';
    if (url.includes('uqload')) return 'Uqload';
    if (url.includes('hgcloud')) return 'HGCloud';
    if (url.includes('myvi')) return 'MyVi';
    if (url.includes('rutube')) return 'Rutube';
    if (url.includes('ok.ru')) return 'OK.ru';
    if (url.includes('doodstream') || url.includes('vvide0')) return 'Doodstream';
    if (url.includes('mail.ru')) return 'Mail.ru';
    return 'Player';
}

/**
 * Extract episode data from the page HTML
 * Format: N!url1,url2,...
 */
function parseEpisodeData(html, targetEpisode) {
    const streams = [];
    // Match pattern: episodeNumber!url1,url2,...
    const regex = /(\d+)!((?:https?:\/\/[^,<\s]+)(?:,(?:https?:\/\/[^,<\s]+))*)/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
        const epNum = parseInt(match[1]);
        if (epNum === targetEpisode) {
            const urls = match[2].split(',').filter(u => u.startsWith('http'));
            for (const url of urls) {
                const cleanUrl = url.trim();
                if (cleanUrl.length > 10) {
                    streams.push(cleanUrl);
                }
            }
        }
    }

    return streams;
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) return [];

    // --- ARMSYNC Metadata Resolution ---
    let targetEpisodes = [episode];
    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId) {
            const airDate = await getEpisodeAirDate(imdbId, season, episode);
            if (airDate) {
                const malData = await resolveMalMetadata(imdbId, airDate);
                if (malData && malData.absoluteEpisode) {
                    console.log(`[French-Anime] ArmSync: S${season}E${episode} -> Absolute ${malData.absoluteEpisode}`);
                    targetEpisodes.push(malData.absoluteEpisode);
                }
            }
        }
    } catch (e) {
        console.warn(`[French-Anime] ArmSync failed: ${e.message}`);
    }
    // ------------------------------------

    const searchResult = await searchAnime(title);
    if (!searchResult) return [];

    const streams = [];
    const pagesChecked = new Set();
    const pagesToCheck = [searchResult.url];

    try {
        const searchHtml = await fetchText(`${BASE_URL}/index.php?do=search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': BASE_URL
            },
            body: `do=search&subaction=search&story=${encodeURIComponent(title)}`
        });

        const $ = cheerio.load(searchHtml);
        const normalize = (s) => s.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
        const simplifiedTitle = normalize(title);

        $('a.mov-t').each((i, el) => {
            const h = $(el).attr('href');
            const t = normalize($(el).text().trim());
            if (h && h.includes('.html') && t.includes(simplifiedTitle)) {
                if (!pagesToCheck.includes(h)) {
                    pagesToCheck.push(h);
                }
            }
        });
    } catch (e) { /* Ignore duplicate search error */ }

    for (const pageUrl of pagesToCheck) {
        if (pagesChecked.has(pageUrl)) continue;
        pagesChecked.add(pageUrl);

        try {
            const html = await fetchText(pageUrl);

            // Determine language from URL
            let langName = 'VOSTFR';
            if (pageUrl.includes('animes-vf/') || pageUrl.toLowerCase().includes('french')) {
                langName = 'VF';
            }

            // Parse episode data for each targeted episode number (absolute or original)
            const allPlayerUrls = [];
            for (const ep of targetEpisodes) {
                const playerUrls = parseEpisodeData(html, ep);
                allPlayerUrls.push(...playerUrls);
            }

            for (const url of allPlayerUrls) {
                const playerName = getPlayerName(url);
                const stream = await resolveStream({
                    name: `French-Anime (${langName})`,
                    title: `${playerName} Player`,
                    url: url,
                    quality: "HD",
                    headers: { "Referer": BASE_URL }
                });
                streams.push(stream);
            }

            if (allPlayerUrls.length > 0) {
                console.log(`[French-Anime] Found ${allPlayerUrls.length} players on ${pageUrl}`);
            }
        } catch (err) {
            console.error(`[French-Anime] Failed to fetch ${pageUrl}: ${err.message}`);
        }
    }

    return streams;
}
