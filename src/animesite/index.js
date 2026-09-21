/**
 * AnimeSite (animesite.fr) — provider Nuvio.
 *
 * Next.js 15 / RSC : fiche /{id}-{slug}, lecteurs via POST /api/stream/token
 * (cookies de session + Origin requis) → /v/{token} → 302 embed tiers
 * (sibnet VF/VOSTFR, bysedikamoum = Byse AES-GCM, sendvid...).
 * 5 lecteurs par épisode, sondés en parallèle.
 */
import { extractStreams } from './extractor.js';

const PROVIDER_ID = 'animesite';

export async function getStreams(tmdbId, mediaType, season, episode, options = {}) {
  return extractStreams(tmdbId, mediaType, season, episode, options);
}

export default { getStreams };
