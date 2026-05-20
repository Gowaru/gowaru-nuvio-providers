/**
 * Movix Provider
 * Main entry point for Nuvio.
 */

import { extractStreams } from './extractor.js';
import { expandStreamQualities, configureStreamConfig } from '../utils/resolvers.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        console.log(`[Movix] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        const result = await expandStreamQualities(streams);
        console.log(`[Movix] Found ${result.length} streams`);
        return result;
    } catch (error) {
        console.error(`[Movix] Error: ${error.message}`);
        return [];
    }
}

module.exports = { getStreams, configureStreamConfig };
