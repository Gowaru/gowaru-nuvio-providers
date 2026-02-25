/**
 * Extractor Logic for Anime-Sama
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';

const BASE_URL = "https://anime-sama.tv";

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
        console.log(`[Anime-Sama] TMDB Title found: ${title}`);
        return title;
    } catch (e) {
        console.error(`[Anime-Sama] Failed to get title from TMDB: ${e.message}`);
        return null;
    }
}

/**
 * Search for a slug on Anime-Sama
 */
async function searchSlug(title) {
    try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl);
        const $ = cheerio.load(html);

        const firstResult = $('a[href*="/catalogue/"]').first();
        if (firstResult.length) {
            const href = firstResult.attr('href');
            const match = href.match(/\/catalogue\/([^/]+)\/?/);
            if (match) {
                console.log(`[Anime-Sama] Search found slug: ${match[1]}`);
                return match[1];
            }
        }
        return null;
    } catch (e) {
        console.error(`[Anime-Sama] Search Error: ${e.message}`);
        return null;
    }
}

/**
 * Clean title to create a slug
 */
function toSlug(title) {
    return title.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Map variable names to player names
 */
function getPlayerName(varName, url) {
    if (url.includes('sibnet')) return 'Sibnet';
    if (url.includes('sendvid')) return 'Sendvid';
    if (url.includes('mycloud')) return 'MyCloud';
    if (url.includes('vidmoly')) return 'Vidmoly';
    if (url.includes('vido')) return 'Vido';
    if (url.includes('voe')) return 'Voe';
    if (url.includes('stape') || url.includes('streamtape')) return 'Streamtape';
    if (url.includes('dood') || url.includes('ds2play')) return 'Doodstream';
    if (url.includes('uqload') || url.includes('oneupload')) return 'Uqload';
    return `Player ${varName.toUpperCase()}`;
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) return [];

    // --- ARMSYNC Metadata Resolution ---
    let absoluteEpisode = episode;
    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId) {
            const resolvedAbsolute = await getAbsoluteEpisode(imdbId, season, episode);
            if (resolvedAbsolute) {
                console.log(`[Anime-Sama] ArmSync: Resolved S${season}E${episode} -> Absolute Ep ${resolvedAbsolute}`);
                absoluteEpisode = resolvedAbsolute;
            }
        }
    } catch (e) {
        console.warn(`[Anime-Sama] ArmSync resolution failed, falling back to episode ${episode}`);
    }
    // ------------------------------------

    const slug = toSlug(title);
    const languages = ['vostfr', 'vf'];
    const streams = [];

    for (const lang of languages) {
        const jsUrl = `${BASE_URL}/catalogue/${slug}/saison${season}/${lang}/episodes.js`;
        try {
            const jsContent = await fetchText(jsUrl);
            const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[(.*?)\s*\]/gs;
            let match;

            while ((match = varRegex.exec(jsContent)) !== null) {
                const varName = match[1];
                const arrayContent = match[2];
                const urls = arrayContent.match(/'(.*?)'/g)?.map(u => u.slice(1, -1)) || [];
                
                // Try both absolute and seasonal index
                const playerUrl = urls[episode - 1] || urls[absoluteEpisode - 1];
                
                if (playerUrl && playerUrl.startsWith('http')) {
                    const stream = await resolveStream({
                        name: `Anime-Sama (${lang.toUpperCase()})`,
                        title: `${getPlayerName(varName, playerUrl)} - Ep ${episode}`,
                        url: playerUrl,
                        quality: "HD",
                        headers: { "Referer": BASE_URL }
                    });
                    streams.push(stream);
                }
            }
        } catch (e) {
            console.warn(`[Anime-Sama] episodes.js not found or error for ${lang}: ${e.message}`);

            if (lang === languages[0] && streams.length === 0) {
                const foundSlug = await searchSlug(title);
                if (foundSlug && foundSlug !== slug) {
                    for (const retryLang of languages) {
                        const retryJsUrl = `${BASE_URL}/catalogue/${foundSlug}/saison${season}/${retryLang}/episodes.js`;
                        try {
                            const retryJsContent = await fetchText(retryJsUrl);
                            const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[(.*?)\s*\]/gs;
                            let retryMatch;
                            while ((retryMatch = varRegex.exec(retryJsContent)) !== null) {
                                const varName = retryMatch[1];
                                const arrayContent = retryMatch[2];
                                const urls = arrayContent.match(/'(.*?)'/g)?.map(u => u.slice(1, -1)) || [];
                                
                                const playerUrl = urls[episode - 1] || urls[absoluteEpisode - 1];
                                
                                if (playerUrl && playerUrl.startsWith('http')) {
                                    const stream = await resolveStream({
                                        name: `Anime-Sama (${retryLang.toUpperCase()})`,
                                        title: `${getPlayerName(varName, playerUrl)} - Ep ${episode}`,
                                        url: playerUrl,
                                        quality: "HD",
                                        headers: { "Referer": BASE_URL }
                                    });
                                    streams.push(stream);
                                }
                            }
                        } catch (retryErr) { /* Ignore */ }
                    }
                    if (streams.length > 0) return streams;
                }
            }
        }
    }
    return streams;
}
