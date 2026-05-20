import { extractStreams } from './extractor.js';
import { expandStreamQualities, configureStreamConfig } from '../utils/resolvers.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[AnimeSite] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

    try {
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        return streams;
    } catch (error) {
        console.error(`[AnimeSite] Error:`, error);
        return [];
    }
}

module.exports = { getStreams, configureStreamConfig };
