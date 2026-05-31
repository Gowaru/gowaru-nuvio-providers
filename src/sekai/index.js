import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_SEKAI', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `Sekai ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[Sekai] Request: ${label}`);

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
            console.warn(`[Sekai] ${error.message}`);
        } else {
            console.error(`[Sekai] Extraction error for ${tmdbId}:`, error);
        }
        return [];
    }
}

module.exports = { getStreams };
