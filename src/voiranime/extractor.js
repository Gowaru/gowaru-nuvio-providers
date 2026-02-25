/**
 * Extractor Logic for VoirAnime
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
const BASE_URL = "https://v6.voiranime.com";

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
        console.log(`[VoirAnime] TMDB Title found: ${title}`);
        return title;
    } catch (e) {
        console.error(`[VoirAnime] Failed to get title from TMDB: ${e.message}`);
        return null;
    }
}

/**
 * Clean title to create a slug
 */
function toSlug(title) {
    return title.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Search for the anime slug on VoirAnime
 */
async function searchAnime(title) {
    const slugs = [
        toSlug(title),
        toSlug(title.replace(/'s/gi, '')),
        toSlug(title.replace(/'s/gi, 's'))
    ];

    const withThe = [];
    slugs.forEach(s => {
        if (s.startsWith('the-')) withThe.push(s.substring(4));
        else withThe.push('the-' + s);
    });

    const allSlugs = [...new Set([...slugs, ...withThe])];
    console.log(`[VoirAnime] Probing slugs: ${allSlugs.join(', ')}`);

    for (const slug of allSlugs) {
        const url = `${BASE_URL}/anime/${slug}/`;
        try {
            await fetchText(url, { method: 'HEAD' });
            console.log(`[VoirAnime] Predicted slug found: ${slug}`);
            return url;
        } catch (e) { /* Predict failed */ }
    }

    try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl);
        const $ = cheerio.load(html);

        const results = [];
        $('.post-title a').each((i, el) => {
            results.push({
                title: $(el).text().trim(),
                url: $(el).attr('href')
            });
        });

        const normalize = (s) => s.toLowerCase().replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
        const simplifiedTitle = normalize(title);

        console.log(`[VoirAnime] Search results: ${results.length}`);
        let bestMatch = results.find(r => normalize(r.title) === simplifiedTitle);

        if (!bestMatch) {
            bestMatch = results.find(r => {
                const rt = normalize(r.title);
                return rt.includes(simplifiedTitle) && !rt.includes('film') && !rt.includes('log') && !rt.includes('kai');
            });
        }

        if (!bestMatch) bestMatch = results[0];

        if (bestMatch) {
            console.log(`[VoirAnime] Selected from search: ${bestMatch.title} -> ${bestMatch.url}`);
            return bestMatch.url;
        }

        return null;
    } catch (e) {
        console.error(`[VoirAnime] Search error: ${e.message}`);
        return null;
    }
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
        console.warn(`[VoirAnime] ArmSync failed: ${e.message}`);
    }
    // ------------------------------------

    const matches = await searchAnime(title);
    if (!matches || matches.length === 0) return [];

    const streams = [];
    const checkedUrls = new Set();

    for (const match of matches) {
        if (checkedUrls.has(match.url)) continue;
        checkedUrls.add(match.url);

        try {
            const animeUrl = match.url;
            const lang = (match.title.toUpperCase().includes('VF') || animeUrl.includes('-vf')) ? 'VF' : 'VOSTFR';
            
            const html = await fetchText(animeUrl);
            const $ = cheerio.load(html);

            const paddings = ['', '0', '00'];
            const epPatterns = [];
            for (const ep of targetEpisodes) {
                const epS = ep.toString();
                paddings.forEach(p => epPatterns.push(p + epS));
            }

            let episodeUrl = null;
            $('.listing-chapters a, .list-chapter a, .wp-manga-chapter a').each((i, el) => {
                const text = $(el).text().trim();
                const href = $(el).attr('href');
                for (const pattern of epPatterns) {
                    const regex = new RegExp(`(?:[^0-9]|^)${pattern}(?:[^0-9]|$)`);
                    if (regex.test(text) || regex.test(href)) {
                        episodeUrl = href;
                        return false;
                    }
                }
            });

            if (!episodeUrl) continue;

            const epRawHtml = await fetchText(episodeUrl);
            const ep$ = cheerio.load(epRawHtml);

            const hosts = [];
            ep$('[name="host"] option, .host-select option').each((i, el) => {
                const val = ep$(el).val();
                if (val && val !== "Choisir un lecteur") hosts.push(val);
            });

            if (hosts.length === 0) {
                const iframe = ep$('iframe[src*="embed"], iframe[src*="e/"]').first().attr('src');
                if (iframe) {
                    const stream = await resolveStream({
                        name: `VoirAnime (${lang})`,
                        title: `Default Player - ${lang}`,
                        quality: "HD",
                        url: iframe,
                        headers: { "Referer": BASE_URL }
                    });
                    if (stream) streams.push(stream);
                }
            } else {
                for (const host of hosts) {
                    try {
                        const hostUrl = `${episodeUrl}${episodeUrl.includes('?') ? '&' : '?'}host=${encodeURIComponent(host)}`;
                        const hostHtml = await fetchText(hostUrl);
                        const iframeMatch = hostHtml.match(/<iframe\s+.*?src="(https?:\/\/[^"]+)".*?><\/iframe>/i);
                        let embedUrl = iframeMatch ? iframeMatch[1] : null;
                        if (!embedUrl) {
                            const scriptMatch = hostHtml.match(/https?:\/\/[^"']+\/(?:embed|e)\/[^"']+/);
                            if (scriptMatch && !scriptMatch[0].includes('voiranime.com')) embedUrl = scriptMatch[0];
                        }
                        if (embedUrl) {
                            const stream = await resolveStream({
                                name: `VoirAnime (${lang})`,
                                title: `${host} - ${lang}`,
                                url: embedUrl,
                                quality: "HD",
                                headers: { "Referer": BASE_URL }
                            });
                            if (stream) streams.push(stream);
                        }
                    } catch (err) {}
                }
            }
        } catch (e) {}
    }

    return streams;
}
