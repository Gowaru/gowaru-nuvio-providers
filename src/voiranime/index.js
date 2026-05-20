import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_VOIRANIME', 90000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `VoirAnime ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[VoirAnime] Request: ${label}`);

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
            console.warn(`[VoirAnime] ${error.message}`);
        } else {
            console.error(`[VoirAnime] Error:`, error);
        }
        return [];
    }
}

module.exports = { getStreams };
