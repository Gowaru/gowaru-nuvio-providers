import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_ANIME_SAMA', 45000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const label = `Anime-Sama ${mediaType} ${tmdbId} S${season}E${episode}`;
    console.log(`[Anime-Sama] Request: ${label}`);

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
            console.warn(`[Anime-Sama] ${error.message}`);
        } else {
            console.error(`[Anime-Sama] Error:`, error);
        }
        return [];
    }
}

module.exports = { getStreams };
