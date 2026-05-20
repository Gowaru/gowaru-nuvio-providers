import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_ANIMESULTRA', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `AnimesUltra ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[AnimesUltra] Request: ${label}`);

    try {
        const streams = await withTimeout(
            extractStreams(tmdbId, mediaType, season, episode),
            PROVIDER_TIMEOUT,
            label
        );
        return await expandStreamQualities(streams, {
            includeCodec: true,
            includeFps: true,
        });
    } catch (error) {
        if (error.message?.includes('[Timeout]')) {
            console.warn(`[AnimesUltra] ${error.message}`);
        } else {
            console.error(`[AnimesUltra] Error: ${error.message}`);
        }
        return [];
    }
}

module.exports = { getStreams };
