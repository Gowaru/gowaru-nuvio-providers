/**
 * Movix Provider
 * Main entry point for Nuvio.
 */

import { extractStreams } from './extractor.js';
import { expandStreamQualities } from '../utils/resolvers.js';

/**
 * Main function called by Nuvio
 * @param {string} tmdbId - TMDB ID of the media
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {number} season - Season number (for TV)
 * @param {number} episode - Episode number (for TV)
 */
/**
 * Main function called by Nuvio
 * @param {string} tmdbId - TMDB ID of the media
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {number} season - Season number (for TV)
 * @param {number} episode - Episode number (for TV)
 */
function getStreams(tmdbId, mediaType, season, episode) {
    console.log('[Movix] Request: ' + mediaType + ' ' + tmdbId + ' S' + season + 'E' + episode);
    
    return extractStreams(tmdbId, mediaType, season, episode)
        .then(function(streams) {
            return expandStreamQualities(streams);
        })
        .then(function(expanded) {
            console.log('[Movix] Found ' + expanded.length + ' streams');
            return expanded;
        })
        .catch(function(error) {
            console.error('[Movix] Error: ' + (error ? error.message : 'unknown'));
            return [];
        });
}

module.exports = { getStreams };
