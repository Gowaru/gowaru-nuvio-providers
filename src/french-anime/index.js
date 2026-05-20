import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_FRENCH_ANIME', 90000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `French-Anime ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[French-Anime] Request: ${label}`);

    try {
        const streams = await withTimeout(
            extractStreams(tmdbId, mediaType, season, episode),
            PROVIDER_TIMEOUT,
            label
        );
        return await expandStreamQualities(streams, {
            includeCodec: true,
        });
    } catch (error) {
        if (error.message?.includes('[Timeout]')) {
            console.warn(`[French-Anime] ${error.message}`);
        } else {
            console.error(`[French-Anime] Error:`, error);
        }
        return [];
    }
}

module.exports = { getStreams };
