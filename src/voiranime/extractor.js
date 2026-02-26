/**
 * Extractor Logic for VoirAnime
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
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
 * Extract the base slug from a VoirAnime URL (strips season/vf suffixes)
 * e.g. ".../shingeki-no-kyojin-3-vf/" -> "shingeki-no-kyojin"
 * Returns null for OVA/special/film slugs so they are skipped.
 */
const SPECIAL_SLUG_RE = /(?:chronicle|ova|oav|gaiden|film|movie|lost-girls|kakusei|zenpen|kouhen|specials?|hors-serie|memories|recap|recaps|compilation)(?:-|$)/i;
function extractBaseSlug(url) {
    const m = url.match(/\/anime\/([^/]+)\//); 
    if (!m) return null;
    const slug = m[1];
    // Skip slugs belonging to OVAs, films, specials, etc.
    if (SPECIAL_SLUG_RE.test(slug)) return null;
    // Strip trailing -N, -N-vf, -vf, -vostfr suffixes
    return slug
        .replace(/-(?:the-final-season|saison-\d+|\d+|vf|vostfr|part-\d+|cour-\d+)(?:-(?:vf|vostfr))?$/i, '')
        .replace(/-+$/, '');
}

/**
 * Search for the anime slug on VoirAnime
 * @param {string} title
 * @param {number} season
 */
async function searchAnime(title, season = 1) {
    const baseSlug = toSlug(title);
    const baseSlugNoThe = baseSlug.startsWith('the-') ? baseSlug.substring(4) : baseSlug;

    // Season-aware slug candidates
    const slugCandidates = [];
    if (season === 1) {
        // For S1, try the bare slug without season suffix
        slugCandidates.push(baseSlug, baseSlugNoThe);
        // Also try with season 1 explicit
        slugCandidates.push(`${baseSlug}-1`, `${baseSlug}-1-vostfr`, `${baseSlug}-saison-1`);
    } else {
        // For later seasons try numbered variants first
        slugCandidates.push(
            `${baseSlug}-${season}`, `${baseSlug}-${season}-vostfr`, `${baseSlug}-${season}-vf`,
            `${baseSlug}-saison-${season}`,
            `${baseSlug}-the-final-season`, // common S4 alias
            baseSlug, baseSlugNoThe
        );
    }
    // Also try without 's
    const slugNoApost = toSlug(title.replace(/'s/gi, ''));
    if (slugNoApost !== baseSlug) slugCandidates.push(slugNoApost);

    const allSlugs = [...new Set(slugCandidates.filter(Boolean))];
    console.log(`[VoirAnime] Probing slugs (S${season}): ${allSlugs.join(', ')}`);

    for (const slug of allSlugs) {
        const url = `${BASE_URL}/anime/${slug}/`;
        try {
            await fetchText(url, { method: 'HEAD' });
            console.log(`[VoirAnime] Predicted slug found: ${slug}`);
            return [{ title: title, url: url }];
        } catch (e) { /* Predict failed */ }
    }

    // Fallback: keyword search
    try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl);
        const $ = cheerio.load(html);

        const results = [];
        $('.post-title a, .c-image-hover a, h3.h5 a').each((i, el) => {
            const href = $(el).attr('href') || '';
            if (href.includes('/anime/') && !href.includes('/feed/')) {
                results.push({ title: $(el).text().trim(), url: href });
            }
        });

        console.log(`[VoirAnime] Search results: ${results.length}`);
        if (results.length === 0) return [];

        // Try to derive the base slug from search results and probe season-specific URLs
        const baseSlugsFromSearch = [...new Set(results.map(r => extractBaseSlug(r.url)).filter(Boolean))];
        for (const bs of baseSlugsFromSearch) {
            const seasonSlugs = season === 1
                ? [bs, `${bs}-1`, `${bs}-1-vostfr`]
                : [`${bs}-${season}`, `${bs}-${season}-vostfr`, `${bs}-${season}-vf`, `${bs}-saison-${season}`];
            for (const sl of seasonSlugs) {
                const url = `${BASE_URL}/anime/${sl}/`;
                try {
                    await fetchText(url, { method: 'HEAD' });
                    console.log(`[VoirAnime] Derived slug found: ${sl}`);
                    return [{ title: title, url: url }];
                } catch (e) { /* try next */ }
            }
        }

        // Filter search results by season relevance
        const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
        const simplifiedTitle = normalize(title);

        // Season-score: higher = better match for requested season
        const scored = results.map(r => {
            const u = r.url.toLowerCase();
            let score = 0;
            if (season === 1) {
                // Penalise URLs that explicitly have a season > 1
                const m = u.match(/\/anime\/[^/]+-(?:saison-)?(\d+)(?:-vf|-vostfr)?\//);
                const urlSeason = m ? parseInt(m[1]) : null;
                if (urlSeason && urlSeason > 1) score -= 10;
                else if (!urlSeason) score += 5; // No season number = likely base/S1
            } else {
                if (u.includes(`-${season}-`) || u.includes(`-${season}/`) || u.includes(`-saison-${season}`)) score += 10;
                else if (u.includes(`-${season}`)) score += 5;
            }
            if (normalize(r.title).includes(simplifiedTitle)) score += 3;
            return { ...r, score };
        }).filter(r => r.score >= 0).sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
            console.log(`[VoirAnime] Best search match (score=${scored[0].score}): ${scored[0].url}`);
            return scored;
        }

        return results;
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
    // Try titles in order: EN first, then FR (slug "shingeki-no-kyojin" found via EN search results)
    for (const title of titles) {
        matches = await searchAnime(title, season);
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
                // Catch any external iframe (not voiranime's own domain)
                let iframe = null;
                ep$('iframe').each((_, el) => {
                    const src = ep$(el).attr('src') || '';
                    if (src.startsWith('http') && !src.includes('voiranime.com')) {
                        iframe = src; return false;
                    }
                });
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
                        // Parse iframe src more flexibly (any attribute order)
                        const iframeMatch = hostHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
                        let embedUrl = iframeMatch ? iframeMatch[1] : null;
                        if (!embedUrl) {
                            // Fallback: scan for any external embed URL in the page source
                            const scriptMatch = hostHtml.match(/https?:\/\/[^"'\s<>]+\/(?:embed|e|v|player)\/[^"'\s<>]+/);
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
