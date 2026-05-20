import { extractStreams } from './extractor.js';
import { expandStreamQualities, withTimeout, safeConfig } from '../utils/resolvers.js';

const PROVIDER_TIMEOUT = safeConfig('NUVIO_TIMEOUT_DULOURD', 60000);

async function getStreams(tmdbId, mediaType, season, episode) {
  const label = `DuLourd ${mediaType} ${tmdbId} S${season}E${episode}`;
  console.log(`[DuLourd] Request: ${label}`);

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
      console.warn(`[DuLourd] ${error.message}`);
    } else {
      console.error(`[DuLourd] Error:`, error);
    }
    return [];
  }
}

module.exports = { getStreams };
