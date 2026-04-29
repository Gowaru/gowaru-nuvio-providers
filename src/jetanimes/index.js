import { extractStreams } from './extractor.js';
import { expandStreamQualities } from '../utils/resolvers.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        console.log(`[JetAnimes] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        return await expandStreamQualities(streams);
    } catch (error) {
        console.error(`[JetAnimes] Error: ${error.message}`);
        return [];
    }
}

module.exports = { getStreams };
