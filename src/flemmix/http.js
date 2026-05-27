import { safeFetch } from '../utils/resolvers.js'
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

const RETRY_DELAYS = [1000, 2500, 5000]

function sleep(ms) {
  return new Promise(resolve => {
    const start = Date.now()
    function check() { if (Date.now() - start >= ms) resolve(); else Promise.resolve().then(check) }
    check()
  })
}

export async function fetchText(url, options = {}) {
  const retries = options.retries ?? 2
  const timeout = options.timeout ?? TIMEOUTS.PAGE
  const mergedHeaders = { ...HEADERS, ...(options.headers || {}) }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await safeFetch(url, { headers: mergedHeaders, timeout })
      if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response'
        if (attempt < retries && status >= 500) {
          console.warn(`[Flemmix] HTTP ${status} for ${url}, retrying (${attempt + 1}/${retries})...`)
          await sleep(RETRY_DELAYS[attempt] || 3000)
          continue
        }
        if (status === 404) return ''
        throw new Error(`HTTP error ${status} for ${url}`)
      }
      return await res.text()
    } catch (e) {
      if (attempt >= retries || (e.message && /HTTP error 4(?:0[0-9]|1[0-79]|29)/.test(e.message))) throw e
      console.warn(`[Flemmix] Attempt ${attempt + 1} failed for ${url}: ${e.message}`)
      await sleep(RETRY_DELAYS[attempt] || 3000)
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`)
}

export async function fetchJson(url, options = {}) {
  const mergedHeaders = { ...AJAX_HEADERS, ...(options.headers || {}) }
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await safeFetch(url, { headers: mergedHeaders, timeout: options.timeout ?? TIMEOUTS.SEARCH })
      if (!res) continue
      const text = await res.text()
      if (!text || text === '[]') return []
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(RETRY_DELAYS[attempt] || 3000)
    }
  }
  return null
}
