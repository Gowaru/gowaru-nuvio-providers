import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_MUGIWARA', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
    const se = mediaType === 'movie' ? '' : ` S${season}E${episode}`;
    const label = `Mugiwara ${mediaType} ${tmdbId}${se}`;
    console.log(`[Mugiwara] Request: ${label}`);

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
            console.warn(`[Mugiwara] ${error.message}`);
        } else {
            console.error(`[Mugiwara] Extraction error for ${tmdbId}:`, error);
        }
        return [];
    }
}

module.exports = { getStreams };
