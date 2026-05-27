import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_WOOKAFR', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `Wookafr ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[Wookafr] Request: ${label}`);

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
            console.warn(`[Wookafr] ${error.message}`);
        } else {
            console.error(`[Wookafr] Error:`, error);
        }
        return [];
    }
}

module.exports = { getStreams };
