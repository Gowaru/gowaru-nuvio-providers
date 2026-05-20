import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_FRENCHSTREAM', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `Frenchstream ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[Frenchstream] Request: ${label}`);

    try {
        const streams = await withTimeout(
            extractStreams(tmdbId, mediaType, season, episode),
            PROVIDER_TIMEOUT,
            label
        );
        const expanded = await expandStreamQualities(streams, {
            includeCodec: true,
        });
        console.log(`[Frenchstream] Found ${expanded.length} stream(s)`);
        return expanded;
    } catch (error) {
        if (error.message?.includes('[Timeout]')) {
            console.warn(`[Frenchstream] ${error.message}`);
        } else {
            console.error(`[Frenchstream] Error:`, error);
        }
        return [];
    }
}

module.exports = { getStreams };
