/**
 * Extractor Logic for Anime-Sama
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://anime-sama.tv";

/**
 * Search for a slug on Anime-Sama
 */
async function searchSlugs(title) {
    try {
        const html = await fetchText(`${BASE_URL}/template-php/defaut/fetch.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': BASE_URL
            },
            body: `query=${encodeURIComponent(title)}`
        });
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
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];
    const title = titles[0]; // Primary title (EN)

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
                const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm;
                let match;
                while ((match = varRegex.exec(jsContent)) !== null) {
                    const varName = match[1];
                    const urls = match[2].match(/['"]([^'"]+)['"]/g)?.map(u => u.slice(1, -1)) || [];
                    
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
        // Search with all title variations (EN, FR, Original romaji)
        const foundSlugs = [];
        for (const t of titles) {
            const slugs = await searchSlugs(t);
            slugs.forEach(s => { if (!foundSlugs.includes(s)) foundSlugs.push(s); });
        }
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
                        const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm;
                        let match;
                        while ((match = varRegex.exec(jsContent)) !== null) {
                            const varName = match[1];
                            const urls = match[2].match(/['"]([^'"]+)['"]/g)?.map(u => u.slice(1, -1)) || [];
                            
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
    
    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[Anime-Sama] Total streams found: ${validStreams.length}`);
    
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
