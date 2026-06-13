import { safeFetch, sanitizeSearchQuery, fetchWithRetry } from '../utils/resolvers.js'
import { SITE, TIMEOUTS } from './config.js'

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${SITE.BASE_URL}/`,
}

export const AJAX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${SITE.BASE_URL}/`,
  'X-Requested-With': 'XMLHttpRequest',
}

export async function fetchText(url, options = {}) {
  const timeout = options.timeout ?? TIMEOUTS.PAGE
  const mergedHeaders = { ...HEADERS, ...(options.headers || {}) }
  const retries = options.retries ?? 2

  return fetchWithRetry(async () => {
    const res = await safeFetch(url, { headers: mergedHeaders, timeout })
    if (!res) throw new Error(`No response from ${url}`)
    if (!res.ok) {
      const status = typeof res.status === 'number' ? res.status : 'no-response'
      if (status === 404) return ''
      throw new Error(`HTTP error ${status} for ${url}`)
    }
    return await res.text()
  }, { retries })
}

export async function fetchJson(url, options = {}) {
  const mergedHeaders = { ...AJAX_HEADERS, ...(options.headers || {}) }

  return fetchWithRetry(async () => {
    const res = await safeFetch(url, { headers: mergedHeaders, timeout: options.timeout ?? TIMEOUTS.API })
    if (!res) throw new Error(`No response from ${url}`)
    const text = await res.text()
    if (!text || text === '[]') return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }, { retries: 2 })
}

export async function postSearch(query, options = {}) {
  const sanitized = sanitizeSearchQuery(query)
  const body = `do=search&subaction=search&story=${encodeURIComponent(sanitized)}`
  const mergedHeaders = {
    ...HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `${SITE.BASE_URL}/`,
    Origin: SITE.BASE_URL,
    ...(options.headers || {}),
  }

  return fetchWithRetry(async () => {
    const res = await safeFetch(SITE.BASE_URL, {
      method: 'POST',
      headers: mergedHeaders,
      body,
      timeout: options.timeout ?? TIMEOUTS.SEARCH,
    })
    if (!res || !res.ok) throw new Error(`No response from search`)
    return await res.text()
  }, { retries: 2 })
}

