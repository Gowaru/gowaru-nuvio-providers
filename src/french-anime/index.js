/**
 * French-Anime Provider for Nuvio
 */

import { extractStreams } from './extractor.js';

/**
 * Main function to get streams for a specific media
 * @param {string} tmdbId - TMDb ID of the media
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {number} season - Season number (null for movies)
 * @param {number} episode - Episode number (null for movies)
 */
async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[French-Anime] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

    try {
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        return streams;
    } catch (error) {
        console.error(`[French-Anime] Error:`, error);
        return [];
    }
}

module.exports = { getStreams };
