import { extractStreams } from './extractor.js';
import { withTimeout, safeConfig, expandStreamQualities } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_MOVIX', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `Movix ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[Movix] Request: ${label}`);

    try {
        const streams = await withTimeout(
            extractStreams(tmdbId, mediaType, season, episode),
            PROVIDER_TIMEOUT,
            label
        );
        const expanded = await expandStreamQualities(streams, {
            includeCodec: true,
        });
        console.log(`[Movix] Found ${expanded.length} streams`);
        return expanded;
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
