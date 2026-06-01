import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_FRENCHMANGA', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `FrenchManga ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[FrenchManga] Request: ${label}`);

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
            console.warn(`[FrenchManga] ${error.message}`);
        } else {
            console.error(`[FrenchManga] Error:`, error);
        }
        return [];
    }
}

module.exports = { getStreams };
