/**
 * HTTP Utilities for Aniverse (aniverse.fr — Next.js/Turbopack, API JSON, diag live 2026-10).
 *
 * Points clés :
 *  - Pas de challenge Cloudflare bloquant sur aniverse.fr ni sur api.onefy.me
 *    avec un User-Agent Chrome complet (les UA courts sont rejetés).
 *  - API JSON publique :
 *      GET /api/anime/search?q=            → { data: [...] } (catalogue + ids)
 *      GET /api/anime/quicksearch?q=       → [...] (léger)
 *      GET /api/anime/episode/episodes?animeId=<uuid>&episodeNumber=1&limit=-1
 *                                          → [ {episodeNumber, episodeTitle, ...} ]
 *      GET /api/anime/stream/<uuid>/<ep>/<sub|dub>
 *                                          → { source, tracks[], headers, proxy }
 *  - Le CDN api.onefy.me EXIGE le header Authorization Bearer (JWT ~2h) renvoyé
 *    par l'API stream. Sans lui → 401 sur le manifest ET les segments.
 *    `proxy:false` dans la réponse : le site ne proxifie pas ce CDN.
 *  - Le manifest HLS est chiffré (EXT-X-KEY AES-128, URI relative "/v1/stream/<id>/key")
 *    → l'app (ExoPlayer/AVPlayer) gère la clé via les mêmes headers.
 */

import { safeFetch, sleep, isAborted } from '../utils/resolvers.js'

const BASE = 'https://aniverse.fr'
const API_BASE = 'https://aniverse.fr/api'
const STREAM_CDN = 'https://api.onefy.me'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

const BASE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${BASE}/`,
  Origin: BASE,
}

const RETRY_DELAYS = [800, 2000]

function isChallenge(text) {
  if (!text) return false
  return (
    text.includes('Just a moment') ||
    text.includes('cf-browser-verification') ||
    text.includes('Attention Required') ||
    text.includes('error code: 1010')
  )
}

/** GET texte avec retry ; '' en 404, null en erreur finale. */
export async function fetchPage(url, options = {}) {
  const { timeout = 12000, signal } = options
  const headers = { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', Referer: `${BASE}/`, ...(options.headers || {}) }
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (isAborted(signal)) return null
    try {
      const res = await safeFetch(url, { headers, timeout, signal, redirect: 'follow' })
      if (!res) return null
      const status = typeof res.status === 'number' ? res.status : 0
      if (status === 404) return ''
      const text = await res.text()
      if (isChallenge(text) && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      return text
    } catch (e) {
      if (isAborted(signal)) return null
      if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt])
      else return null
    }
  }
  return null
}

/**
 * GET JSON sur /api d'aniverse.fr. Retourne l'objet parsé, ou null.
 * 404 → null (épisode indisponible, ex: "Episode not available in French yet").
 * 422 (validation oRPC) → null.
 */
export async function fetchApi(url, options = {}) {
  const { timeout = 12000, signal } = options
  const headers = { ...BASE_HEADERS, ...(options.headers || {}) }
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (isAborted(signal)) return null
    try {
      const res = await safeFetch(url, { headers, timeout, signal, redirect: 'follow' })
      if (!res) return null
      const status = typeof res.status === 'number' ? res.status : 0
      if (status === 404 || status === 422) return null
      if (status === 429 && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt] * 2)
        continue
      }
      const text = await res.text()
      if (isChallenge(text) && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      if (status < 200 || status >= 300) return null
      if (!text || text.length === 0) return null
      try {
        const json = JSON.parse(text)
        // response.json() peut retourner null (pas de throw) sur certains runtimes
        if (json == null) return null
        return json
      } catch (e) {
        // Page HTML inattendue (route inexistante) → null
        return null
      }
    } catch (e) {
      if (isAborted(signal)) return null
      if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt])
      else return null
    }
  }
  return null
}

export { BASE, API_BASE, STREAM_CDN }

/** Headers à attacher au stream final (l'app les rejoue sur le CDN + segments). */
export function cdnHeaders(authHeader) {
  const h = {
    Referer: `${BASE}/`,
    'User-Agent': USER_AGENT,
  }
  if (authHeader) h.Authorization = authHeader
  return h
}
