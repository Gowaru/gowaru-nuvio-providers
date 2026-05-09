/**
 * Movix Provider
 * Main entry point for Nuvio.
 */

import { extractStreams } from './extractor.js';

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
