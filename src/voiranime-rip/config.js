export const SITE = {
  BASE_URL: 'https://voiranime.rip',
  DOMAIN: 'voiranime.rip',
}

export const PATTERNS = {
  SLUG: /^\/([^/]+)\/$/,
  SEASON_LINK: /\/([^/]+)\/saison-(\d+)\//,
  EPISODE_LINK: /\/([^/]+)\/saison-(\d+)\/episode-(\d+)\//,
  VIDEO_URLS: /(vostfr|vf)\s*:\s*['"]([^'"]+)['"]/gi,
  SIBNET_VIDEO: /video\.sibnet\.ru\/shell\.php\?videoid=(\d+)/,
}

export const TIMEOUTS = {
  SEARCH: 10000,
  PAGE: 15000,
  RESOLVE: 15000,
  PROVIDER: 60000,
}

export const SCORES = {
  MIN_MATCH: 30,
  EXACT_MATCH: 150,
  STRONG_MATCH: 100,
}

export const CACHE_TTL = 5 * 60 * 1000
export const MAX_SEARCH_TITLES = 6
