import { extractStreams } from './extractor.js';
import { expandStreamQualities, configureStreamConfig } from '../utils/resolvers.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        console.log(`[AnimesUltra] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        const result = await expandStreamQualities(streams);
        return result;
    } catch (error) {
        console.error(`[AnimesUltra] Error: ${error.message}`);
        return [];
    }
}

module.exports = { getStreams, configureStreamConfig };
