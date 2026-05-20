/**
 * Shared Metadata Utilities
 * Uses the TMDB JSON API (much more reliable than HTML scraping in apps)
 */

const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

import { safeFetch } from './resolvers.js';

/**
 * Get multiple titles for an anime from TMDB ID.
 * Returns an array with [English title, French title, Original title (romaji)]
 * All unique values, ordered by priority for searching.
 *
 * @param {string|number} tmdbId
 * @param {'tv'|'movie'} mediaType
 * @returns {Promise<string[]>}
 */
async function tryFetchTitle(url, processor) {
    try {
        const res = await safeFetch(url);
        if (res) {
            const data = await res.json();
            return processor(data);
        }
    } catch (e) {
        console.log(`[Metadata] Skipping endpoint: ${e.message}`);
    }
    return null;
}

export async function getTmdbTitles(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const titles = [];

    // 1. Main API call — English title + original title
    const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
    await tryFetchTitle(mainUrl, (data) => {
        const titleEn = (type === 'movie' ? data.title : data.name)?.trim();
        const titleOriginal = (type === 'movie' ? data.original_title : data.original_name)?.trim();

        if (titleEn) titles.push(titleEn);
        if (titleOriginal && titleOriginal !== titleEn && /^[\x00-\x7F\u00C0-\u024F\s]+$/.test(titleOriginal)) {
            titles.push(titleOriginal);
        }
    });

    // 2. French title via translations
    const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
    await tryFetchTitle(transUrl, (transData) => {
        const frTrans = (transData.translations || []).find(t => t.iso_639_1 === 'fr');
        const titleFr = frTrans?.data?.name?.trim() || frTrans?.data?.title?.trim();
        if (titleFr && !titles.includes(titleFr)) {
            titles.push(titleFr);
        }
    });

    // 3. Alternative titles (covers Romaji, English aliases, etc.)
    const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
    await tryFetchTitle(altUrl, (altData) => {
        const altList = type === 'movie' ? altData.titles : altData.results;
        if (altList && Array.isArray(altList)) {
            const isLatin = (str) => /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()]+$/.test(str);

            altList.forEach(alt => {
                const t = alt.title?.trim();
                if (t && !titles.some(existing => existing.toLowerCase() === t.toLowerCase()) && isLatin(t)) {
                    if (alt.type === 'Romaji' || alt.iso_3166_1 === 'US' || alt.iso_3166_1 === 'FR') {
                        titles.splice(1, 0, t);
                    } else {
                        titles.push(t);
                    }
                }
            });
        }
    });

    const uniqueTitles = [...new Set(titles)];
    console.log(`[Metadata] Titles for ${tmdbId}: ${uniqueTitles.join(' | ')}`);
    return uniqueTitles;
}
