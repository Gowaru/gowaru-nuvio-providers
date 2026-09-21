/**
 * HTTP Utilities for AnimeSite (animesite.fr — Next.js 15 / RSC, diag live 2026-09).
 *
 * Points clés :
 *  - Aucun challenge Cloudflare (IP datacenter OK) mais /api/stream/token exige
 *    des COOKIES de session (toute requête GET du site en pose) + Origin ;
 *    sinon {"status":"forbidden"}.
 *  - POST /api/stream/token { idAndSlugTitle, seasonNumber, episodeNumber,
 *    playerIndex } → { status:"ok", kind, isHls, src:"/v/{token signé}" }.
 *  - GET /v/{token} → 302 vers l'embed réel (sibnet / byse / sendvid...).
 *  - Le token est signé + daté côté serveur (expiry ~x:17900xxxxx) → chaque
 *    requête doit refaire l'appel API (pas de cache long sur /v/).
 */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export const BASE = 'https://animesite.fr'

/** Cookie jar minimal — les cookies sont posés par toute page du site. */
let cookieLine = ''
let cookieAt = 0
const COOKIE_TTL = 15 * 60 * 1000

async function refreshCookies(signal) {
  const res = await fetch(BASE + '/', {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7',
    },
    redirect: 'follow',
    signal,
  })
  const raw = res.headers.get('set-cookie') || res.headers.get('Set-Cookie') || ''
  const parts = []
  for (const seg of raw.split(/,(?=[^;]+?=)/)) {
    const kv = seg.split(';')[0].trim()
    if (kv && parts.indexOf(kv) === -1) parts.push(kv)
  }
  if (parts.length > 0) cookieLine = parts.join('; ')
  cookieAt = Date.now()
}

export async function ensureCookies(signal) {
  if (!cookieLine || Date.now() - cookieAt > COOKIE_TTL) await refreshCookies(signal)
  return cookieLine
}

/** Réinitialise le jar (utilisé quand l'API renvoie forbidden). */
export function resetCookies() {
  cookieLine = ''
}

function baseHeaders(extra) {
  return {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7',
    ...(extra || {}),
  }
}

/**
 * GET HTML d'une page du site (fiche, search). Pose les cookies au passage.
 * @returns {Promise<string|null>} HTML ou null
 */
export async function fetchPage(url, options = {}) {
  const { signal, headers } = options
  try {
    await ensureCookies(signal)
    const res = await fetch(url, {
      headers: baseHeaders({
        ...(headers || {}),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Cookie: cookieLine,
        Referer: BASE + '/',
      }),
      redirect: 'follow',
      signal,
    })
    if (!res.ok) {
      console.log(`[AnimeSite] fetchPage ${res.status} ${url}`)
      return null
    }
    const setCookie = res.headers.get('set-cookie') || res.headers.get('Set-Cookie') || ''
    if (setCookie) {
      for (const seg of setCookie.split(/,(?=[^;]+?=)/)) {
        const kv = seg.split(';')[0].trim()
        if (kv && cookieLine.indexOf(kv.split('=')[0] + '=') === -1) {
          cookieLine = cookieLine ? cookieLine + '; ' + kv : kv
        }
      }
    }
    return await res.text()
  } catch (e) {
    if (e && e.name === 'AbortError') throw e
    console.log(`[AnimeSite] fetchPage error: ${e.message}`)
    return null
  }
}

/** Résultat de resolveEmbedSrc : embed tiers détecté. */
/** @typedef {{kind:'embed', embedUrl:string}} EmbedResult */
/** Résultat direct : flux lisible sans embed. */
/** @typedef {{kind:'hls'|'mp4', url:string, headers?:Object}} DirectResult */

/**
 * POST /api/stream/token puis GET /v/{token} → URL finale.
 * @param {string} idAndSlugTitle ex "2104032-frieren-beyond-journey-s-end"
 * @param {number|string} season
 * @param {number|string} episode
 * @param {number} playerIndex
 * @param {object} [options] { signal }
 * @returns {Promise<EmbedResult|DirectResult|null>}
 */
export async function resolveStreamSrc(idAndSlugTitle, season, episode, playerIndex, options = {}) {
  const { signal } = options
  try {
    await ensureCookies(signal)
    const post = await fetch(BASE + '/api/stream/token', {
      method: 'POST',
      headers: baseHeaders({
        'Content-Type': 'application/json',
        Origin: BASE,
        Referer: BASE + '/' + idAndSlugTitle,
        Cookie: cookieLine,
      }),
      body: JSON.stringify({
        idAndSlugTitle,
        seasonNumber: parseInt(season, 10) || 1,
        episodeNumber: parseInt(episode, 10) || 1,
        playerIndex: parseInt(playerIndex, 10) || 0,
      }),
      redirect: 'follow',
      signal,
    })
    if (post.status === 403 || post.status === 401) {
      if (options._retried) return null
      // cookies expirés → un refresh puis un seul retry
      resetCookies()
      await refreshCookies(signal)
      return resolveStreamSrc(idAndSlugTitle, season, episode, playerIndex, { ...options, _retried: true })
    }
    if (!post.ok) {
      console.log(`[AnimeSite] stream/token ${post.status}`)
      return null
    }
    const data = await post.json().catch(() => null)
    if (!data || data.status !== 'ok' || !data.src) return null

    // GET /v/{token} → 302 vers l'embed (ou flux direct si isHls)
    const vres = await fetch(BASE + data.src, {
      headers: baseHeaders({ Cookie: cookieLine, Referer: BASE + '/' + idAndSlugTitle }),
      redirect: 'manual',
      signal,
    })
    const loc = vres.headers.get('location') || vres.headers.get('Location')
    if (data.isHls && !loc) {
      const text = await vres.text().catch(() => '')
      if (/\.m3u8/i.test(data.src) || text.startsWith('#EXTM3U')) {
        return { kind: 'hls', url: BASE + data.src, headers: { Referer: BASE + '/', 'User-Agent': USER_AGENT } }
      }
      return null
    }
    if (!loc) {
      // pas de 302 : le corps peut contenir l'embed ou un m3u8
      const text = await vres.text().catch(() => '')
      const m = /https?:\/\/[^"'\s\\]+/.exec(text)
      if (m) return { kind: 'embed', embedUrl: m[0] }
      return null
    }
    if (/\.m3u8/i.test(loc)) return { kind: 'hls', url: loc, headers: { Referer: BASE + '/', 'User-Agent': USER_AGENT } }
    return { kind: 'embed', embedUrl: loc }
  } catch (e) {
    if (e && e.name === 'AbortError') throw e
    console.log(`[AnimeSite] resolveStreamSrc error: ${e.message}`)
    return null
  }
}
