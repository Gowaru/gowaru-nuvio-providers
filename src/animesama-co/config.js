export const SITE = {
  BASE_URL: 'https://animesama.co',
  DOMAIN: 'animesama.co',
}

export const PATTERNS = {
  ANIME_ID: /\/anime\/(\d+)-([^/]+)\.html/,
  SEASON_LINK: /\/anime\/\d+-[^/]+\/saison-(\d+)\.html/,
  EPISODE_LINK: /\/anime\/\d+-[^/]+\/saison-\d+\/episode-(\d+)\.html/,
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
