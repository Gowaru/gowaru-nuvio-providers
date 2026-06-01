export const SITE = {
  BASE_URL: 'https://w16.french-manga.net',
  DOMAIN: 'french-manga.net',
}

export const ENDPOINTS = {
  SEARCH: `${SITE.BASE_URL}/?s=`,
  EPISODES_API: `${SITE.BASE_URL}/engine/ajax/manga_episodes_api.php?id=`,
}

export const SELECTORS = {
  SEARCH_CONTAINER: 'div.short',
  SEARCH_POSTER: 'a.short-poster',
  SEARCH_TITLE: 'div.short-title',
  SEARCH_VERSION: 'span.film-version a',
  SEARCH_EPS: 'span.mli-eps',
  SEARCH_TYPE: 'span.mli-type a',
  SERIE_CONFIG: '#serie-config',
  SERIE_DATA_TITLE: 'data-title',
  SERIE_DATA_NEWS_ID: 'data-news-id',
  SERIE_DATA_PAGE_URL: 'data-page-url',
  PLAYER_IFRAME: '#player-iframe-container iframe',
}

export const PATTERNS = {
  NEWSID: /index\.php\?newsid=(\d+)/,
  SEASON_IN_TITLE: /Saison\s*(\d+)/i,
  SEASON_COLON: /Saison\s*\d+\s*:\s*(.+)/i,
  SEASON_NUM: /Saison\s+(\d+)/i,
  EPISODE_NUM: /Épisode\s+(\d+)/i,
}

export const TIMEOUTS = {
  SEARCH: 15000,
  PAGE: 15000,
  API: 10000,
  RESOLVE: 15000,
  PROVIDER: 60000,
}

export const SCORES = {
  MIN_MATCH: 30,
  EXACT_MATCH: 150,
  STRONG_MATCH: 100,
}

export const LANGUAGE_MAP = {
  vf: 'VF',
  vostfr: 'VOSTFR',
  vo: 'VO',
  multi: 'MULTI',
}

export const CACHE_TTL = 5 * 60 * 1000
export const MAX_SEARCH_TITLES = 3
