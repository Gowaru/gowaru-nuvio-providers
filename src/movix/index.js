import { extractStreams } from './extractor.js';
import { withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_MOVIX', 30000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `Movix ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[Movix] Request: ${label}`);

    try {
        const streams = await withTimeout(
            extractStreams(tmdbId, mediaType, season, episode),
            PROVIDER_TIMEOUT,
            label
        );
        console.log(`[Movix] Found ${streams.length} streams`);
        return streams;
    } catch (error) {
        if (error.message?.includes('[Timeout]')) {
            console.warn(`[Movix] ${error.message}`);
        } else {
            console.error(`[Movix] Error: ${error.message}`);
        }
        return [];
    }
}

module.exports = { getStreams };
