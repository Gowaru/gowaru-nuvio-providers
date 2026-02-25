/**
 * Shared Metadata Utilities
 * Uses the TMDB JSON API (much more reliable than HTML scraping in apps)
 */

const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

async function safeFetch(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json",
            },
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        return res;
    } catch (e) {
        return null;
    }
}

/**
 * Get multiple titles for an anime from TMDB ID.
 * Returns an array with [English title, French title, Original title (romaji)]
 * All unique values, ordered by priority for searching.
 *
 * @param {string|number} tmdbId
 * @param {'tv'|'movie'} mediaType
 * @returns {Promise<string[]>}
 */
export async function getTmdbTitles(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const titles = [];

    try {
        // 1. Main API call — English title + original title
        const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const mainRes = await safeFetch(mainUrl);
        if (mainRes) {
            const data = await mainRes.json();
            const titleEn = (type === 'movie' ? data.title : data.name)?.trim();
            const titleOriginal = (type === 'movie' ? data.original_title : data.original_name)?.trim();

            if (titleEn) titles.push(titleEn);
            // Only add original if it differs and uses latin chars (romaji)
            if (titleOriginal && titleOriginal !== titleEn && /^[\x00-\x7F\u00C0-\u024F\s]+$/.test(titleOriginal)) {
                titles.push(titleOriginal);
            }
        }

        // 2. French title via translations
        const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
        const transRes = await safeFetch(transUrl);
        if (transRes) {
            const transData = await transRes.json();
            const frTrans = (transData.translations || []).find(t => t.iso_639_1 === 'fr');
            const titleFr = frTrans?.data?.name?.trim() || frTrans?.data?.title?.trim();
            if (titleFr && !titles.includes(titleFr)) {
                titles.push(titleFr);
            }
        }
    } catch (e) {
        console.error(`[Metadata] TMDB API error: ${e.message}`);
    }

    console.log(`[Metadata] Titles for ${tmdbId}: ${titles.join(' | ')}`);
    return titles;
}
