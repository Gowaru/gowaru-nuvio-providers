import { extractStreams } from './extractor.js';
import { expandStreamQualities, configureStreamConfig } from '../utils/resolvers.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    const se = mediaType === 'movie' ? '' : ` S${season}E${episode}`;
    console.log(`[Mugiwara] Request: ${mediaType} ${tmdbId}${se}`);

    try {
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        return await expandStreamQualities(streams);
    } catch (error) {
        console.error(`[Mugiwara] Extraction error for ${tmdbId}:`, error);
        return [];
    }
}

module.exports = { getStreams, configureStreamConfig };
