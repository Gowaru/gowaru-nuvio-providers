/**
 * AnimoFlix Provider for Nuvio
 */

import { extractStreams } from './extractor.js';
import { expandStreamQualities, configureStreamConfig } from '../utils/resolvers.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[AnimoFlix] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

    try {
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        return await expandStreamQualities(streams);
    } catch (error) {
        console.error(`[AnimoFlix] Error:`, error);
        return [];
    }
}

module.exports = { getStreams, configureStreamConfig };
