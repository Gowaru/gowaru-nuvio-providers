/**
 * Configuration for French-Anime.com provider
 */
export const CONFIG = {
  BASE_URL: 'https://french-anime.com',
  DOMAIN: 'french-anime.com',
  // DLE categories
  CATEGORIES: {
    ANIME_VF: '/animes-vf/',
    ANIME_VOSTFR: '/animes-vostfr/',
    EXCLU: '/exclue/',
  },
  // Embed hosts to try (priority order)
  PREFERRED_HOSTS: ['vidmoly', 'luluvid', 'savefiles', 'hgcloud', 'up4fun'],
  // Hosts to skip (ads, dead, or unresolvable)
  SKIP_HOSTS: ['jessicayeahcatch', 'facebook', 'twitter', 'ok.ru'],
  // Timeouts
  PAGE_TIMEOUT: 10000,
  HOST_TIMEOUT: 8000,
  PROBE_TIMEOUT: 6000,
  BUDGET_MS: 45000,
};
