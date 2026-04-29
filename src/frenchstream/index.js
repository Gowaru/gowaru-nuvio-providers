/**
 * Frenchstream Provider for Nuvio
 */

import { extractStreams } from './extractor.js';
import { expandStreamQualities } from '../utils/resolvers.js';

/**
 * Main function to get streams for a specific media
 * @param {string} tmdbId - TMDb ID of the media
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {number} season - Season number (null for movies)
 * @param {number} episode - Episode number (null for movies)
 */
async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[Frenchstream] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

    try {
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        const expanded = await expandStreamQualities(streams);
        console.log(`[Frenchstream] Found ${expanded.length} stream(s)`);
        return expanded;
    } catch (error) {
        console.error(`[Frenchstream] Error:`, error);
        return [];
    }
}

module.exports = { getStreams };