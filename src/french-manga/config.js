export const SITE = {
  BASE_URL: 'https://w16.french-manga.net',
  DOMAIN: 'french-manga.net',
}

/**
 * Miroir dynamique : la racine french-manga.net 301-redirect vers le miroir
 * courant (wNN.french-manga.net). Le miroir codé en dur meurt à chaque
 * rotation — détecté live (2026-09) : w16 actuel, w15/w17 → 301 vers w16.
 * Réglé une fois par instance (TTL cache), 2 requêtes HEAD max.
 */
let _mirrorReady = null
export async function ensureMirror() {
  if (_mirrorReady) return _mirrorReady
  _mirrorReady = (async () => {
    const before = SITE.BASE_URL
    try {
      // ⚠️ fetch suit les 301 automatiquement → la réponse finale est 200
      // sur le miroir courant. L'URL finale (res.url) est la source de vérité,
      // le header Location n'est présent qu'en redirect:manual.
      const res = await fetch(before, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
          Accept: 'text/html',
        },
      })
      const finalUrl = res.url || res.headers.get('location') || ''
      if (/^https?:\/\//.test(finalUrl)) {
        const u = new URL(finalUrl)
        if (u.hostname.endsWith('.french-manga.net') && u.origin !== before) {
          console.log(`[FrenchManga] Mirror rotation: ${before} → ${u.origin}`)
          SITE.BASE_URL = u.origin
          rebuildEndpoints()
        }
      }
    } catch (e) {
      // Le miroir codé en dur répond peut-être quand même : on garde
      console.warn(`[FrenchManga] Mirror check failed: ${e.message}`)
    }
  })()
  return _mirrorReady
}

export const ENDPOINTS = {
  SEARCH: `${SITE.BASE_URL}/?s=`,
  EPISODES_API: `${SITE.BASE_URL}/engine/ajax/manga_episodes_api.php?id=`,
}

/** Reconstruit les endpoints après rotation de miroir (mutation in place) */
function rebuildEndpoints() {
  ENDPOINTS.SEARCH = `${SITE.BASE_URL}/?s=`
  ENDPOINTS.EPISODES_API = `${SITE.BASE_URL}/engine/ajax/manga_episodes_api.php?id=`
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
export const MAX_SEARCH_TITLES = 5
