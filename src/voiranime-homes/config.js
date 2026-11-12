export const SITE = {
  BASE_URL: 'https://voiranime.homes',
  DOMAIN: 'voiranime.homes',
}

export const ENDPOINTS = {
  // /?s= est un leurre : le site renvoie TOUJOURS la home (36 dernières
  // sorties), quelle que soit la requête → inutilisable comme recherche.
  SEARCH_AJAX: '/engine/ajax/search.php',
  EPISODES_API: '/engine/ajax/manga_episodes_api.php?id=',
}

export const PATTERNS = {
  NEWSID: /index\.php\?newsid=(\d+)/,
  SLUG_ID: /^\/(\d+)-/,
  SEASON_IN_TITLE: /Saison\s*(\d+)/i,
  SEASON_NUM: /Saison\s+(\d+)/i,
  EPISODE_NUM: /Épisode\s+(\d+)/i,
}

export const TIMEOUTS = {
  SEARCH: 15000,
  PAGE: 15000,
  API: 10000,
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

/** Titres TMDB essayés avant les replis (FR localisé, alt_titles). */
export const MAX_SEARCH_TITLES = 3
/** Pages de l'AJAX search (le endpoint pagine : page=2 donne d'autres fiches). */
export const MAX_SEARCH_PAGES = 1
/** Lecteurs résolus par langue (2 pour VF et VOSTFR). */
export const MAX_SERVERS_PER_LANG = 3

/**
 * Lecteurs morts constatés (diag 2026-11) :
 * - `vidhsareup.*` : plus aucun DNS (io/fun/com/net/xyz → getent vide) ;
 * - `luluvid./luluvdo.` : résolvent vers `*.tnmr.org` qui répond **403** sur
 *   toute URL tokenisée → flux qui ne démarre jamais (filtré après résolution).
 */
export const SKIP_HOSTS = ['vidhsareup.']

/** Hôtes dont le CDN final est inutilisable (403), rejetés post-résolution. */
export const BLOCKED_CDN_TOKENS = ['tnmr.org']
export const ALLOWED_CDN_TOKENS = ['cdn-tnmr.org']
