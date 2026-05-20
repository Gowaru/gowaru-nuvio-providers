import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_JETANIMES', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `JetAnimes ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[JetAnimes] Request: ${label}`);

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
            console.warn(`[JetAnimes] ${error.message}`);
        } else {
            console.error(`[JetAnimes] Error: ${error.message}`);
        }
        return [];
    }
}

module.exports = { getStreams };
