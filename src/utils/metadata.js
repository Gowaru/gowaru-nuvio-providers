/**
 * Shared Metadata Utilities
 * Uses the TMDB JSON API (much more reliable than HTML scraping in apps)
 */

const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

import { safeFetch } from './resolvers.js';

function pushUniqueTitle(list, value) {
    const title = typeof value === 'string' ? value.trim() : '';
    if (!title) return;
    if (!list.some((existing) => existing.toLowerCase() === title.toLowerCase())) {
        list.push(title);
    }
}

function looksLikeJson(text) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
}

async function fetchJsonSafe(url, options = {}) {
    try {
        const res = await safeFetch(url, options);
        if (!res || (typeof res.status === 'number' && res.status >= 400)) return null;
        const text = await res.text();
        if (!looksLikeJson(text)) return null;
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function extractTitleFromTmdbHtml(html) {
    if (!html || typeof html !== 'string') return '';
    const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
    if (og) {
        const cleaned = og.replace(/\s*\(\d{4}\)\s*[-|].*$/i, '').trim();
        if (cleaned) return cleaned;
    }

    const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
    const cleanedTag = titleTag.replace(/\s*\(\d{4}\)\s*[-|].*$/i, '').trim();
    return cleanedTag;
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
    const isLatin = (str) => /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()]+$/.test(str || '');

    try {
        // 1. Main API call — English title + original title
        const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const data = await fetchJsonSafe(mainUrl);
        if (data) {
            const titleEn = (type === 'movie' ? data.title : data.name)?.trim();
            const titleOriginal = (type === 'movie' ? data.original_title : data.original_name)?.trim();

            pushUniqueTitle(titles, titleEn);
            // Only add original if it differs and uses latin chars (romaji)
            if (titleOriginal && titleOriginal !== titleEn && isLatin(titleOriginal)) {
                pushUniqueTitle(titles, titleOriginal);
            }
        }

        // 2. French title via translations
        const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
        const transData = await fetchJsonSafe(transUrl);
        if (transData) {
            const frTrans = (transData.translations || []).find(t => t.iso_639_1 === 'fr');
            const titleFr = frTrans?.data?.name?.trim() || frTrans?.data?.title?.trim();
            pushUniqueTitle(titles, titleFr);
        }

        // 3. Alternative titles (covers Romaji, English aliases, etc.)
        const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
        const altData = await fetchJsonSafe(altUrl);
        if (altData) {
            const altList = type === 'movie' ? altData.titles : altData.results;
            if (altList && Array.isArray(altList)) {
                // Priority: Romaji or English, then everything else in latin alphabet

                altList.forEach(alt => {
                    const t = alt.title?.trim();
                    if (t && !titles.some(existing => existing.toLowerCase() === t.toLowerCase()) && isLatin(t)) {
                        if (alt.type === 'Romaji' || alt.iso_3166_1 === 'US' || alt.iso_3166_1 === 'FR') {
                            // Insert near the top, after the primary names
                            titles.splice(1, 0, t);
                        } else {
                            titles.push(t);
                        }
                    }
                });
            }
        }

        // 4. HTML fallback when API cannot be parsed/reached (rate limits/WAF)
        if (titles.length === 0) {
            const tmdbUrl = `https://www.themoviedb.org/${type}/${tmdbId}`;
            const tmdbRes = await safeFetch(tmdbUrl, {
                timeoutMs: 12000,
                headers: {
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            if (tmdbRes && tmdbRes.ok) {
                const html = await tmdbRes.text();
                const htmlTitle = extractTitleFromTmdbHtml(html);
                if (htmlTitle) pushUniqueTitle(titles, htmlTitle);
            }
        }
    } catch (e) {
        console.error(`[Metadata] TMDB API error: ${e.message}`);
    }

    // Deduplicate array completely
    const uniqueTitles = [...new Set(titles)];
    console.log(`[Metadata] Titles for ${tmdbId}: ${uniqueTitles.join(' | ')}`);
    return uniqueTitles;
}
