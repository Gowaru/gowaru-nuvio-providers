export const SITE = {
  BASE_URL: 'https://flemmix.me',
  DOMAIN: 'flemmix.me',
}

export const ENDPOINTS = {
  SEARCH: `${SITE.BASE_URL}/search?q=`,
}

export const SELECTORS = {
  SEARCH_JSON: null,
  MOVIE_TITLE: 'h1.movie-title',
  MOVIE_PLAYER_TABS: 'button.video-server-tab',
  MOVIE_PLAYER_MOUNT: '#player-mount',
  MOVIE_PLAYER_CONTAINER: '#player-container',
  MOVIE_QUALITY_PILL: '.quality-pill',
  MOVIE_LANG_PILL: '.lang-pill',
  MOVIE_IMDB: 'a[href*="imdb.com/title/tt"]',
  MOVIE_YEAR: '.movie-meta-value',
  MOVIE_CTA: 'a.movie-cta-primary',

  SERIES_TITLE: 'h1.show-title',
  SERIES_SEASON_CARD: 'a.season-card',
  SERIES_SEASON_BADGE: '.season-badge',
  SERIES_SEASON_TITLE: '.season-title',
  SERIES_EPISODE_CARD: 'a.episode-card',
  SERIES_EPISODE_NUMBER: '.episode-number',
  SERIES_EPISODE_TITLE: '.episode-title',

  EPISODE_PLAYER_TABS: 'button.episode-server-tab',
  EPISODE_PLAYER_MOUNT: '#episode-player-mount',
  EPISODE_PLAYER_CONTAINER: '#episode-player-container',
  EPISODE_QUALITY_PILL: '.quality-pill',
  EPISODE_LANG_PILL: '.lang-pill',

  TAB_DATA_URL: 'data-url',
  TAB_ACTIVE: 'is-active',
  MOUNT_DATA_INITIAL_URL: 'data-initial-url',
  PLAYER_IFRAME: 'iframe[src*="minochinos"]',
}

export const PATTERNS = {
  SEASON_LINK: /\/saison-(\d+)$/i,
  EPISODE_LINK: /\/(\d+)x(\d+)$/i,
  IMDB_ID: /tt(\d+)/,
  TMDB_IMAGE: /image\.tmdb\.org\/t\/p\/[^/]+\/([a-zA-Z0-9]+)\.jpg/,
}

export const TIMEOUTS = {
  SEARCH: 15000,
  PAGE: 15000,
  RESOLVE: 20000,
  PROVIDER: 60000,
}

export const SCORES = {
  MIN_MATCH: 30,
  EXACT_MATCH: 150,
  STRONG_MATCH: 100,
}

export const LANGUAGE_MAP = {
  fr: 'VF',
  en: 'VO',
  us: 'VO',
  vf: 'VF',
  vo: 'VO',
  vostfr: 'VOSTFR',
}

export const QUALITY_KEYWORDS = [
  { pattern: /4k|2160p?/i, label: '4K' },
  { pattern: /1080p?|hd|fullhd/i, label: '1080p' },
  { pattern: /720p?|hd-ready/i, label: '720p' },
  { pattern: /480p?|sd/i, label: '480p' },
]

export const ANIME_GENRE_ID = 16

export const ANIME_KEYWORDS = /\b(?:anime|japonais|japon|shonen|shoujo|seinen|manga)\b/i

export const CACHE_TTL = 5 * 60 * 1000
export const MAX_SEARCH_TITLES = 3
