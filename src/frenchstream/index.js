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
function getStreams(tmdbId, mediaType, season, episode) {
    console.log('[Frenchstream] Request: ' + mediaType + ' ' + tmdbId + ' S' + season + 'E' + episode);

    return extractStreams(tmdbId, mediaType, season, episode)
        .then(function(streams) { return expandStreamQualities(streams); })
        .then(function(expanded) {
            if (expanded.length > 0) return expanded;
            console.warn('[Frenchstream] No streams with default profile, retrying with TV-safe profile');
            return extractStreams(tmdbId, mediaType, season, episode, { forceTvProfile: true })
                .then(function(tvStreams) { return expandStreamQualities(tvStreams); });
        })
        .then(function(finalStreams) {
            console.log('[Frenchstream] Found ' + finalStreams.length + ' stream(s)');
            return finalStreams;
        })
        .catch(function(error) {
            console.error('[Frenchstream] Error:', error);
            return [];
        });
}

module.exports = { getStreams };