/**
 * Extractor Logic for VoirAnime
 */

import { fetchText } from './http.js';
import * as cheerio from 'cheerio';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';
const BASE_URL = "https://v6.voiranime.com";

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

    const matches = [];

    for (const slug of allSlugs) {
        const url = `${BASE_URL}/anime/${slug}/`;
        try {
            await fetchText(url, { method: 'HEAD' });
            console.log(`[VoirAnime] Predicted slug found: ${slug}`);
            matches.push({ title: title, url: url });
            break; // Found a direct match, no need to check other slugs
        } catch (e) { /* Predict failed */ }
    }

    if (matches.length > 0) return matches;

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
        
        // Find all matches that contain the title
        let searchMatches = results.filter(r => normalize(r.title).includes(simplifiedTitle));

        if (searchMatches.length === 0 && results.length > 0) {
            // Fallback: trust the search engine if exact match fails
            searchMatches = results;
        }

        if (searchMatches.length > 0) {
            console.log(`[VoirAnime] Found ${searchMatches.length} matches for ${title}`);
            return searchMatches;
        }

        return [];
    } catch (e) {
        console.error(`[VoirAnime] Search error: ${e.message}`);
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];

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
        console.warn(`[VoirAnime] ArmSync failed: ${e.message}`);
    }
    // ------------------------------------

    let matches = [];
    for (const title of titles) {
        matches = await searchAnime(title);
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
    const checkedUrls = new Set();

    for (const match of matches) {
        if (checkedUrls.has(match.url)) continue;
        checkedUrls.add(match.url);

        const matchLower = match.title.toLowerCase();
        const animeUrl = match.url;
        const lang = (match.title.toUpperCase().includes('VF') || animeUrl.includes('-vf')) ? 'VF' : 'VOSTFR';

        // Optimization: if the result is explicitly for a different season, 
        // skip it unless targetEpisodes contains an absolute episode
        const seasonMatch = matchLower.match(/saison\s*(\d+)/);
        if (seasonMatch && parseInt(seasonMatch[1]) !== season && targetEpisodes.length === 1) {
            continue;
        }

        try {
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
                    const regex = new RegExp(`(?:^|[^0-9])${pattern}(?:$|[^0-9])`, 'i');
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

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[VoirAnime] Total streams found: ${validStreams.length}`);
    return validStreams;
}
