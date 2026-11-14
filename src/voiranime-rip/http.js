import { safeFetch, sanitizeSearchQuery, fetchWithRetry, createProviderRateLimiter, isAborted } from '../utils/resolvers.js'
import { SITE, TIMEOUTS } from './config.js'

const rateLimit = createProviderRateLimiter()

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = SITE.DOMAIN

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${SITE.BASE_URL}/`,
}

export const AJAX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${SITE.BASE_URL}/`,
  'X-Requested-With': 'XMLHttpRequest',
}

export async function fetchText(url, options = {}) {
  const signal = options.signal || _currentSignal
  if (isAborted(signal)) throw new Error('AbortError: Request aborted')

  await rateLimit(DOMAIN)
  const timeout = options.timeout ?? TIMEOUTS.PAGE
  const mergedHeaders = { ...HEADERS, ...(options.headers || {}) }
  const retries = options.retries ?? 2

  return fetchWithRetry(async () => {
    if (isAborted(signal)) throw new Error('AbortError: Request aborted')
    const res = await safeFetch(url, { headers: mergedHeaders, timeout, signal })
    if (!res) throw new Error(`No response from ${url}`)
    if (!res.ok) {
      const status = typeof res.status === 'number' ? res.status : 'no-response'
      if (status === 404) return ''
      throw new Error(`HTTP error ${status} for ${url}`)
    }
    return await res.text()
  }, { retries })
}

export async function postSearch(query, options = {}) {
  await rateLimit(DOMAIN)
  // `raw: true` : la recherche du site est un LIKE sur la chaîne entière.
  // sanitizeSearchQuery (partagé) remplace « : » par une espace, ce qui casse
  // TOUS les titres TMDB à deux-points ("Demon Slayer: Kimetsu no Yaiba" →
  // 0 résultat) alors que le site stocke "Demon Slayer : Kimetsu no Yaiba".
  const sanitized = options.raw ? String(query || '').trim() : sanitizeSearchQuery(query)
  const body = `query=${encodeURIComponent(sanitized)}`
  const mergedHeaders = {
    ...AJAX_HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(options.headers || {}),
  }

  return fetchWithRetry(async () => {
    const res = await safeFetch(`${SITE.BASE_URL}/template-php/defaut/fetch.php`, {
      method: 'POST',
      headers: mergedHeaders,
      body,
      timeout: options.timeout ?? TIMEOUTS.SEARCH,
    })
    if (!res || !res.ok) throw new Error(`No response from search`)
    return await res.text()    }, { retries: 2 })
}

/**
 * Extracteur DLE côté site : `?vr_extract_embed=1&url=<embed>` renvoie
 * `{"ok":true,"m3u8":"…"}`. Utile quand le CDN de l'embed refuse l'IP de
 * l'appareil (Cloudflare/geo) mais que le serveur du site, lui, passe.
 */
export async function extractEmbedViaSite(pageUrl, embedUrl) {
  await rateLimit(DOMAIN)
  const sep = pageUrl.includes('?') ? '&' : '?'
  const target = `${pageUrl}${sep}vr_extract_embed=1&url=${encodeURIComponent(embedUrl)}`
  const res = await safeFetch(target, {
    headers: { ...HEADERS, Referer: pageUrl, Accept: 'application/json' },
    timeout: 15000,
  })
  if (!res || !res.ok) return null
  const json = await res.json().catch(() => null)
  if (!json || !json.ok || !json.m3u8) return null
  return json.m3u8
}

