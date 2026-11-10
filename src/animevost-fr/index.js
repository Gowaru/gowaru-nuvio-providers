import { extractStreams } from './extractor.js';
import { dedupeStreams, MAX_STREAMS_PER_PROVIDER } from '../utils/resolvers.js';

/**
 * AnimeVost-fr (animevost.fr) — catalogue VOSTFR (hébergeur gupload).
 * @param {string|number} tmdbId
 * @param {'tv'|'series'|'movie'} mediaType - 'series' normalisé en 'tv'
 * @param {string|number} [season]
 * @param {string|number} [episode]
 * @param {object} [options]
 * @returns {Promise<Array>}
 */
export async function getStreams(tmdbId, mediaType, season, episode, options = {}) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    try {
        const streams = await extractStreams(tmdbId, type, season, episode, options);
        // Dédup/filtrage : NuvioTV déduplique par URL et plafonne à 150 résultats globaux.
        return dedupeStreams(streams).slice(0, MAX_STREAMS_PER_PROVIDER);
    } catch (e) {
        if (e && String(e.message || e).includes('AbortError')) throw e;
        console.warn(`[AnimeVostFR] Error: ${e && e.message ? e.message : e}`);
        return [];
    }
}

export default { getStreams };
