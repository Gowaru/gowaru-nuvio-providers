/**
 * AnimeSite (animesite.fr) — provider Nuvio.
 *
 * Next.js 15 / RSC : fiche /{id}-{slug}, lecteurs via POST /api/stream/token
 * (cookies de session + Origin requis) → /v/{token} → 302 embed tiers
 * (sibnet VF/VOSTFR, bysedikamoum = Byse AES-GCM, sendvid...).
 * 5 lecteurs par épisode, sondés en parallèle.
 */
import { extractStreams } from './extractor.js';
import { dedupeStreams, MAX_STREAMS_PER_PROVIDER } from '../utils/resolvers.js';

const PROVIDER_ID = 'animesite';

export async function getStreams(tmdbId, mediaType, season, episode, options = {}) {
  // NuvioTV peut envoyer 'series' ; seuls 'movie' et 'tv' sont attendus en aval.
  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const streams = await extractStreams(tmdbId, type, season, episode, options);
  // Dédup/filtrage : NuvioTV déduplique par URL et plafonne à 150 résultats globaux.
  return dedupeStreams(streams).slice(0, MAX_STREAMS_PER_PROVIDER);
}

export default { getStreams };
