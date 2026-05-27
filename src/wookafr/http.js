import { safeFetch } from '../utils/resolvers.js'
import { SITE, TIMEOUTS } from './config.js'

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${SITE.BASE_URL}/`,
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
      console.log(`[Wookafr] Fetching: ${url}`)
      const res = await safeFetch(url, { headers: mergedHeaders, timeout })
      if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response'
        if (attempt < retries && status >= 500) {
          console.warn(`[Wookafr] HTTP ${status} for ${url}, retrying (${attempt + 1}/${retries})...`)
          await sleep(RETRY_DELAYS[attempt] || 3000)
          continue
        }
        throw new Error(`HTTP error ${status} for ${url}`)
      }
      return await res.text()
    } catch (e) {
      if (attempt >= retries || (e.message && /HTTP error 4(?:0[0-9]|1[0-79]|29)/.test(e.message))) throw e
      console.warn(`[Wookafr] Attempt ${attempt + 1} failed for ${url}: ${e.message}`)
      await sleep(RETRY_DELAYS[attempt] || 3000)
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`)
}

export async function postForm(url, data, options = {}) {
  const body = Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const res = await safeFetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${SITE.BASE_URL}/`,
      Origin: SITE.BASE_URL,
      ...(options.headers || {}),
    },
    body,
  })

  if (!res) return null
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options)
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error(`[Wookafr] Failed to parse JSON from ${url}`)
    throw e
  }
}
