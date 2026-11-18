export const SITE = {
  BASE_URL: 'https://flemmix.me',
  DOMAIN: 'flemmix.me',
}

export const ENDPOINTS = {
  SEARCH: `${SITE.BASE_URL}/search?q=`,
  // Sitemaps publics mis à jour quotidiennement (fallback si la recherche échoue)
  SITEMAP_INDEX: `${SITE.BASE_URL}/sitemap.xml`,
  SITEMAP_MOVIES: `${SITE.BASE_URL}/sitemap-movies-1.xml`,
  SITEMAP_TVSHOWS: `${SITE.BASE_URL}/sitemap-tvshows-1.xml`,
  // Sitemaps de structure : listent les pages saison et CHAQUE page épisode
  // (`/{slug}/{s}x{e}`), y compris pour les séries dont la page série est
  // incomplète (saisons absentes du HTML). Vérifié en live 2026-11 :
  // 74 saisons / 848 épisodes sur 192 séries.
  SITEMAP_SEASONS: `${SITE.BASE_URL}/sitemap-seasons-1.xml`,
  SITEMAP_EPISODES: `${SITE.BASE_URL}/sitemap-episodes-1.xml`,
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
  EPISODE_PLAYER_CONTAINER: '#player-container',
  EPISODE_QUALITY_PILL: '.quality-pill',
  EPISODE_LANG_PILL: '.lang-pill',

  TAB_DATA_URL: 'data-url',
  TAB_ACTIVE: 'is-active',
  MOUNT_DATA_INITIAL_URL: 'data-initial-url',
  PLAYER_IFRAME: 'iframe[src*="minochinos"]',
}

export const PATTERNS = {
  // Pages saison : /{slug}/saison-{n} — le site ajoute souvent un SOUS-TITRE
  // après le numéro (`saison-1-murder-house`, `saison-3-partie-3`,
  // `saison-3-vf`). Sans ce suffixe optionnel, parseSeasons() renvoyait [] et
  // TOUTE la série tombait à 0 flux (vérifié en live 2026-11 sur AHS).
  SEASON_LINK: /\/saison-(\d+)(?:-[^/?#]+)?$/i,
  // Pages épisode : /{slug}/{s}x{e} — même chose, le slug porte le titre de
  // l'épisode (`1x1-la-maison`, `5x1-the-crawl`).
  EPISODE_LINK: /\/([a-z0-9-]+)\/(\d+)x(\d+)(?:-[^/?#]+)?$/i,
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

export const ANIME_GENRE_ID = 16

export const ANIME_KEYWORDS = /\b(?:anime|japonais|japon|shonen|shoujo|seinen|manga)\b/i

export const CACHE_TTL = 5 * 60 * 1000
export const MAX_SEARCH_TITLES = 3
