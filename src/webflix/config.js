export const PROVIDER_NAME = 'Webflix';

export const SITE = {
  BASE_URL: 'https://webflix.art',
  DOMAIN: 'webflix.art',
};

export const API = {
  FASTFLUX_MOVIE: (tmdbId) =>
    `${SITE.BASE_URL}/api/fastflux?type=movie&tmdb_id=${encodeURIComponent(tmdbId)}`,
  FASTFLUX_EPISODE: (tmdbId, season, episode) =>
    `${SITE.BASE_URL}/api/fastflux?type=episode&tmdb_id=${encodeURIComponent(tmdbId)}&season=${Number(season) || 1}&episode=${Number(episode) || 1}`,
  DISCOVERY: (tmdbId) =>
    `${SITE.BASE_URL}/api/series-season-discovery?tmdb_id=${encodeURIComponent(tmdbId)}`,
  SEARCH: (query) =>
    `${SITE.BASE_URL}/api/search?q=${encodeURIComponent(query)}&page=1&limit=5`,
  MOVIE_BY_SLUG: (slug) =>
    `${SITE.BASE_URL}/api/movies?slug=${encodeURIComponent(slug)}`,
  SERIES_BY_SLUG: (slug) =>
    `${SITE.BASE_URL}/api/series?slug=${encodeURIComponent(slug)}`,
};

export const TIMEOUTS = {
  SEARCH: 10000,
  FASTFLUX: 10000,
  DISCOVERY: 12000,
  FICHE: 10000,
  RESOLVE: 8000,
  PROVIDER: 45000,
};

export const MAX_STREAMS = 6;
export const TARGET_STREAMS = 4;
export const BUDGET_MS = 40000;

// Hard-exclus (timeout/morts vérifiés) : kakaflix + dood + streamtape.
// vidzy figure ici pour traçabilité mais n'est pas hard-exclu : la fiche
// l'expose en player1 et la spec impose de le tenter en dernier recours
// (dépriorisé, jamais exclu). Voir isDeadHost() dans extractor.js.
export const DEAD_HOSTS = ['kakaflix.lol', 'dood', 'streamtape', 'vidzy.live'];
export const SLOW_HOSTS = ['uqload'];

export const SCORES = {
  MIN_MATCH: 30,
  EXACT_MATCH: 150,
  STRONG_MATCH: 100,
};
