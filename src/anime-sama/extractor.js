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
        const url = `https://www.themoviedb.org/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}?language=en-US`;
        const html = await fetchText(url);
        const $ = cheerio.load(html);
        let title = $('meta[property="og:title"]').attr('content') || $('h1').first().text();
        if (title && title.includes(' (')) title = title.split(' (')[0];
        if (title && title.includes(' - ')) title = title.split(' - ')[0];
        return title ? title.trim() : null;
    } catch (e) { return null; }
}

/**
 * Search for a slug on Anime-Sama
 */
async function searchSlugs(title) {
    try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl);
        const $ = cheerio.load(html);
        const slugs = [];
        $('a[href*="/catalogue/"]').each((i, el) => {
            const h = $(el).attr('href');
            const match = h.match(/\/catalogue\/([^/]+)\/?/);
            if (match && !slugs.includes(match[1])) {
                slugs.push(match[1]);
            }
        });
        return slugs;
    } catch (e) { return []; }
}

function toSlug(title) {
    return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getPlayerName(varName, url) {
    if (url.includes('sibnet')) return 'Sibnet';
    if (url.includes('vidmoly')) return 'Vidmoly';
    if (url.includes('sendvid')) return 'Sendvid';
    if (url.includes('voe')) return 'Voe';
    if (url.includes('stape') || url.includes('streamtape')) return 'Streamtape';
    if (url.includes('dood')) return 'Doodstream';
    if (url.includes('uqload') || url.includes('oneupload')) return 'Uqload';
    return 'Player';
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) return [];

    let absoluteEpisode = episode;
    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId) {
            const resolved = await getAbsoluteEpisode(imdbId, season, episode);
            if (resolved) absoluteEpisode = resolved;
        }
    } catch (e) {}

    const slug = toSlug(title);
    const languages = ['vostfr', 'vf'];
    const streams = [];

    for (const lang of languages) {
        const paths = [
            `${BASE_URL}/catalogue/${slug}/saison${season}/${lang}/episodes.js`,
            `${BASE_URL}/catalogue/${slug}/${lang}/episodes.js`
        ];
        if (season > 1 && absoluteEpisode) paths.push(`${BASE_URL}/catalogue/${slug}/saison1/${lang}/episodes.js`);

        for (const jsUrl of paths) {
            try {
                const jsContent = await fetchText(jsUrl);
                const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[(.*?)\s*\]/gs;
                let match;
                while ((match = varRegex.exec(jsContent)) !== null) {
                    const varName = match[1];
                    const urls = match[2].match(/['"](.*?)['"]/g)?.map(u => u.slice(1, -1)) || [];
                    
                    let playerUrl = null;
                    if (jsUrl.includes(`saison${season}`)) {
                        playerUrl = urls[episode - 1];
                    } else if (jsUrl.includes('saison1') || !jsUrl.includes('saison')) {
                        // If we are on season 1 or root, and we want season > 1, we MUST use absolute episode
                        if (season > 1 && absoluteEpisode !== episode) {
                            playerUrl = urls[absoluteEpisode - 1];
                        } else {
                            playerUrl = urls[episode - 1];
                        }
                    }
                    
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
            } catch (e) {}
        }
    }

    if (streams.length === 0) {
        const foundSlugs = await searchSlugs(title);
        const checkedSlugs = new Set([slug]);

        for (const fSlug of foundSlugs) {
            if (checkedSlugs.has(fSlug)) continue;
            checkedSlugs.add(fSlug);

            for (const lang of languages) {
                const retryPaths = [
                    `${BASE_URL}/catalogue/${fSlug}/saison${season}/${lang}/episodes.js`,
                    `${BASE_URL}/catalogue/${fSlug}/${lang}/episodes.js`
                ];
                if (season > 1 && absoluteEpisode) retryPaths.push(`${BASE_URL}/catalogue/${fSlug}/saison1/${lang}/episodes.js`);

                for (const jsUrl of retryPaths) {
                    try {
                        const jsContent = await fetchText(jsUrl);
                        const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[(.*?)\s*\]/gs;
                        let match;
                        while ((match = varRegex.exec(jsContent)) !== null) {
                            const varName = match[1];
                            const urls = match[2].match(/['"](.*?)['"]/g)?.map(u => u.slice(1, -1)) || [];
                            
                            let playerUrl = null;
                            if (jsUrl.includes(`saison${season}`)) {
                                playerUrl = urls[episode - 1];
                            } else if (jsUrl.includes('saison1') || !jsUrl.includes('saison')) {
                                if (season > 1 && absoluteEpisode !== episode) {
                                    playerUrl = urls[absoluteEpisode - 1];
                                } else {
                                    playerUrl = urls[episode - 1];
                                }
                            }
                            
                            if (playerUrl && playerUrl.startsWith('http')) {
                                const stream = await resolveStream({
                                    name: `Anime-Sama (${lang.toUpperCase()})`,
                                    title: `${getPlayerName(varName, playerUrl)} - Ep ${episode}`,
                                    url: playerUrl,
                                    quality: "HD",
                                    headers: { "Referer": BASE_URL }
                                });
                                if (stream) streams.push(stream);
                            }
                        }
                    } catch (e) {}
                }
            }
        }
    }
    return streams;
}
