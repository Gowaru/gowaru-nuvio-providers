import { extractStreams } from './extractor.js';
import { expandStreamQualities } from '../utils/resolvers.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[Mugiwara] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

    try {
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        return await expandStreamQualities(streams);
    } catch (error) {
        console.error(`[Mugiwara] Extraction error for ${tmdbId}:`, error);
        return [];
    }
}

module.exports = { getStreams };
