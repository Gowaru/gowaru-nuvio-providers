export const SITE = {
  // Domaine actuel vérifié en live (2026-09) : les anciens domaines
  // redirigent tous en 301 vers boston (et certains en boucle circulaire).
  BASE_URL: 'https://wookafr.boston',
  DOMAINS: ['https://wookafr.boston', 'https://wookafr.center'],
  DOMAIN: 'wookafr.boston',
}

export const ENDPOINTS = {
  SEARCH: `${SITE.BASE_URL}/?s=`,
  AJAX: `${SITE.BASE_URL}/wp-admin/admin-ajax.php`,
  WP_API: '/wp-json/wp/v2/posts',
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
  // URLs épisode vérifiées en live (2026-10) sur wookafr.boston :
  //   …/episodes/squid-game-saison-3-episode-1/       (format classique)
  //   …/episodes/squid-game-saison-3-episode-1-2/     (suffixe -2 = 2e version
  //     de l'épisode republié — l'ancienne regex exigeait digits+fin et
  //     échouait sur « 1-2 » → « No episodes for season 3 » → 0 stream).
  // [1] = saison, [2] = numéro d'épisode ; le suffixe de version final est
  // ignoré (tolérant aux -2, -3 futurs).
  EPISODE_URL: /\/episodes\/.*-saison-(\d+)-episode-(\d+)(?:-\d+)?\/?$/i,
  SEASON_TITLE: /(\d+)/,
  IMDB_ID: /tt(\d+)/,
  // Format actuel vérifié en live (2026-10) sur wookafr.boston : le nonce est
  // publié en JSON strict (var sm_Public = {"url":"…","nonce":"1bde284a9f"})
  // — l'ancienne regex exigait url: non-quoté (ancien format JS) et échouait
  // systématiquement → "No AJAX nonce" → toutes les séries en AJAX mortes.
  // Accepte les deux formats (JSON "key": value et JS bare key: value).
  SM_PUBLIC: /sm_Public\s*=\s*\{[^}]*?["']?url["']?\s*:\s*["']([^"']+)["'][^}]*?["']?nonce["']?\s*:\s*["']([^"']+)["']/,
}

export const TIMEOUTS = {
  SEARCH: 8000,
  PAGE: 12000,
  AJAX: 8000,
  RESOLVE: 12000,
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

/**
 * Sections de langue de l'embed lecteurvideo.com → tag langue normalisé.
 * L'embed classe ses serveurs dans des div class="OD OD_XX" :
 *   OD_FR (Sélection FR) / OD_VFF (VF original) / OD_VFQ (Québec) /
 *   OD_VOSTFR (VOSTFR) / OD_EN (VO) / OD_down (onglet Télécharger)
 * Vérifié en live : Arcane S01E01 → sections OD_FR + OD_down.
 */
export const LECTEURVIDEO_LANG_SECTIONS = {
  FR: 'VF',
  VFF: 'VFF',
  VFQ: 'VFQ',
  VFI: 'VF',
  VOSTFR: 'VOSTFR',
  VOST: 'VOSTFR',
  EN: 'VO',
  VO: 'VO',
}

/**
 * Hébergeurs connus acceptés depuis les sections de langue de l'embed.
 * Ces URLs (embeds uqload/vidmoly/veev/…) sont ensuite résolues en flux
 * directs par resolveStream (résolveurs spécifiques déjà présents).
 */
export const LECTEURVIDEO_KNOWN_HOSTS = [
  'uqload.', 'vidmoly.', 'veev.', 'waaw.to', 'voe.', 'filemoon',
  'emmmmbed.com', 'wishonly.site', 'coflix.', 'oneupload.', 'vidoza.',
  'sendvid.', 'sibnet.ru', 'myvi.', 'luluvid.', 'upn.one',
  // Hosts vérifiés en live (2026-10, squid-game E2, lecteurvideo OD_FR) :
  // xtremestream = lecteur majeur VF (~60-70% des liens, résolveur dédié
  // resolveXtremeStream ajouté au resolvers.js central)
  'xtremestream.',
]

export const ANIME_GENRE_ID = 16

export const ANIME_KEYWORDS = /\b(?:anime|japonais|japon|shonen|shoujo|seinen|manga)\b/i

export const CACHE_TTL = 5 * 60 * 1000
export const MAX_CANDIDATES = 8
export const MAX_SEARCH_TITLES = 2
export const CACHE_NAMESPACE = 'wk'
export const CACHE_TAG = 'Wookafr'
