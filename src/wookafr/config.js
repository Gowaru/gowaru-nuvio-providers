export const SITE = {
  BASE_URL: 'https://wookafr.cymru',  // .fyi → .cymru (301 redirect)
  DOMAINS: ['https://wookafr.cymru'],
  DOMAIN: 'wookafr.cymru',
}

export const ENDPOINTS = {
  SEARCH: `${SITE.BASE_URL}/?s=`,
  AJAX: `${SITE.BASE_URL}/wp-admin/admin-ajax.php`,
}

export const SELECTORS = {
  SEARCH_CARD: 'article.moviecard',
  SEARCH_LINK: 'figure a[href]',
  SEARCH_IMAGE_ALT: 'figure img',
  MOVIE_IFRAME: '#download .videoWrapper iframe',
  MOVIE_IFRAME_FALLBACK: 'iframe[src*="lecteurvideo"]',
  MOVIE_IFRAME_ANY: 'iframe[src*="embed"]',
  IMDB_LINK: 'a[href*="imdb.com/title/tt"]',
  SEASON_BUTTON: 'button.btgy[data-season]',
  EPISODE_CONTAINER: 'div.lpep',
  EPISODE_ITEM: 'div.itlep',
  EPISODE_LINK: 'a[href]',
  EPISODE_TITLE: 'h6.title',
  SM_PUBLIC: 'sm_Public',
  AJAX_EPISODE_HTML: 'div.lpep > div.itlep > a[href]',
}

export const PATTERNS = {
  EPISODE_URL: /\/episodes\/.*-saison-(\d+)-episode-(\d+)\/?$/i,
  SEASON_TITLE: /(\d+)/,
  IMDB_ID: /tt(\d+)/,
  SM_PUBLIC: /sm_Public\s*=\s*\{[^}]*?url\s*:\s*["']([^"']+)["'][^}]*?nonce\s*:\s*["']([^"']+)["']/,
}

export const TIMEOUTS = {
  SEARCH: 5000,
  PAGE: 6000,
  AJAX: 5000,
  RESOLVE: 8000,
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
  vff: 'VF',
  vfq: 'VF',
  vost: 'VOSTFR',
}

export const ANIME_GENRE_ID = 16

export const ANIME_KEYWORDS = /\b(?:anime|japonais|japon|shonen|shoujo|seinen|manga)\b/i

export const CACHE_TTL = 5 * 60 * 1000
export const MAX_CANDIDATES = 8
export const MAX_SEARCH_TITLES = 2
