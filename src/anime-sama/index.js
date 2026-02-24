/**
 * Anime-Sama Provider
 * Main entry point.
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
        console.log(`[Anime-Sama] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

        // Call extraction logic
        const streams = await extractStreams(tmdbId, mediaType, season, episode);

        return streams;
    } catch (error) {
        console.error(`[Anime-Sama] Error: ${error.message}`);
        return [];
    }
}

module.exports = { getStreams };
