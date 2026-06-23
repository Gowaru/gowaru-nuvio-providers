import { safeFetch, fetchWithRetry, createProviderRateLimiter } from '../utils/resolvers.js'

const rateLimit = createProviderRateLimiter(300, 0.4);
const DOMAIN = 'otakufr.beer';

export const BASE_URL = 'https://otakufr.beer'

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${BASE_URL}/`,
}

export async function fetchText(url, options = {}) {
  await rateLimit(DOMAIN);
  const mergedHeaders = { ...HEADERS, ...(options.headers || {}) }
  const retries = options.retries ?? 2

  return fetchWithRetry(async () => {
    const res = await safeFetch(url, { headers: mergedHeaders, timeout: options.timeout ?? 12000 })
    if (!res) return ''
    if (!res.ok) {
      const status = typeof res.status === 'number' ? res.status : 0
      if (status === 404) return ''
      throw new Error(`HTTP error ${status}`)
    }
    return await res.text()
  }, { retries })
}

/**
 * Fetch JSON depuis l'API REST WordPress (plus fiable que le JSON.parse direct de QuickJS)
 */
export async function fetchJson(url, options = {}) {
  await rateLimit(DOMAIN);
  const mergedHeaders = {
    ...HEADERS,
    Accept: 'application/json, */*',
    ...(options.headers || {}),
  }
  const retries = options.retries ?? 1

  return fetchWithRetry(async () => {
    const res = await safeFetch(url, { headers: mergedHeaders, timeout: options.timeout ?? 8000 })
    if (!res || !res.ok) return null
    const text = await res.text()
    if (!text) return null
    try { return JSON.parse(text) } catch { return null }
  }, { retries })
}
