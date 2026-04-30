/**
 * Anime-Sama Provider
 * Main entry point.
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
function getStreams(tmdbId, mediaType, season, episode) {
    console.log('[Anime-Sama] Request: ' + mediaType + ' ' + tmdbId + ' S' + season + 'E' + episode);

    return extractStreams(tmdbId, mediaType, season, episode)
        .then(function(streams) {
            return expandStreamQualities(streams);
        })
        .catch(function(error) {
            console.error('[Anime-Sama] Error: ' + (error ? error.message : 'unknown'));
            return [];
        });
}

module.exports = { getStreams };
