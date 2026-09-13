/**
 * Search Fallback — Module utilitaire partagé
 *
 * Centralise les fonctions TMDB utilisées par les providers pour le fallback
 * search (recherche par titre quand l'ID direct échoue).
 *
 * Avant : chaque provider (Nakios, Movix, etc.) dupliquait getTmdbTitle
 * avec sa propre instance de cache → code mort, maintenance lourde.
 *
 * Après : un seul getTmdbTitle partagé, le cache global de safeFetch
 * (30s TTL) évite les appels redondants même entre providers différents.
 *
 * Usage :
 *   import { getTmdbTitle, searchTmdb } from '../utils/search-fallback.js';
 */

const TMDB_API_KEY = '8265bd1679663a7ea12ac168da84d2e8';
const TMDB_API_BASE = 'https://api.themoviedb.org/3';

import { safeFetch } from './resolvers.js';

/**
 * Récupère le titre TMDB (français si disponible) d'un film ou d'une série.
 *
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @returns {Promise<string|null>}
 *
 * Cache : safeFetch intègre déjà un cache global GET (30s TTL),
 * pas besoin de wrapper withCache supplémentaire.
 */
export async function getTmdbTitle(tmdbId, mediaType) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`;

    try {
        const res = await safeFetch(url);
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (!data || data.success === false) return null;

        const title = data.title || data.name || null;
        if (title) {
            console.log(`[SearchFallback] TMDB title: ${title} (${tmdbId})`);
        }
        return title;
    } catch (e) {
        console.warn(`[SearchFallback] TMDB title error for ${tmdbId}: ${e?.message}`);
        return null;
    }
}

/**
 * Variante de getTmdbTitle qui renvoie aussi l'année de sortie.
 * Même URL que getTmdbTitle → cache safeFetch (30s) → requête partagée.
 *
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @returns {Promise<{title: string|null, year: number|null}>}
 */
export async function getTmdbTitleYear(tmdbId, mediaType) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`;

    try {
        const res = await safeFetch(url);
        if (!res || !res.ok) return { title: null, year: null };
        const data = await res.json();
        if (!data || data.success === false) return { title: null, year: null };

        const title = data.title || data.name || null;
        const year = parseInt((data.release_date || data.first_air_date || '').slice(0, 4), 10) || null;
        if (title) {
            console.log(`[SearchFallback] TMDB title: ${title} (${year || '?'}) (${tmdbId})`);
        }
        return { title, year };
    } catch (e) {
        console.warn(`[SearchFallback] TMDB title error for ${tmdbId}: ${e?.message}`);
        return { title: null, year: null };
    }
}

/**
 * Cherche un contenu sur TMDB par titre pour trouver des IDs alternatifs.
 * Utile : certains contenus ont plusieurs TMDB IDs (ex: série avec spin-off).
 *
 * @param {string} title
 * @param {'movie'|'tv'} mediaType
 * @returns {Promise<Array<{id: number, media_type: string, title: string, year: string}>>}
 *
 * Cache : idem, safeFetch gère le cache global.
 */
export async function searchTmdb(title, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const encoded = encodeURIComponent(title);
    const url = `${TMDB_API_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encoded}&language=fr-FR`;

    try {
        const res = await safeFetch(url);
        if (!res || !res.ok) return [];
        const data = await res.json();
        if (!data?.results || !Array.isArray(data.results)) return [];

        const results = data.results.map(r => ({
            id: r.id,
            media_type: r.media_type || mediaType,
            title: r.title || r.name || '',
            year: (r.release_date || r.first_air_date || '').slice(0, 4),
        }));

        console.log(`[SearchFallback] TMDB search "${title}" → ${results.length} résultat(s)`);
        return results;
    } catch (e) {
        console.warn(`[SearchFallback] TMDB search error for "${title}": ${e?.message}`);
        return [];
    }
}
