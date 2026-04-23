/**
 * Movix Provider
 * Main entry point for Nuvio.
 */

import { extractStreams } from './extractor.js';

/**
 * Main function called by Nuvio
 * @param {string} tmdbId - TMDB ID of the media
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {number} season - Season number (for TV)
 * @param {number} episode - Episode number (for TV)
 */
async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        console.log(`[Movix] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        console.log(`[Movix] Found ${streams.length} streams`);
        return streams;
    } catch (error) {
        console.error(`[Movix] Error: ${error.message}`);
        return [];
    }
}

module.exports = { getStreams };
