import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js'
import { SITE, TIMEOUTS } from './config.js'

const rateLimit = createProviderRateLimiter()

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = SITE.DOMAIN
const RETRY_DELAYS = [1000, 3000, 5000]

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

function isCloudflareBlock(text) {
  return text && (
    text.includes('Cloudflare') ||
    text.includes('cf-browser-verification') ||
    text.includes('challenge-form') ||
    text.includes('Attention Required') ||
    text.includes('Just a moment...') ||
    text.length < 200
  )
}

export async function fetchText(url, options = {}) {
  const signal = options.signal || _currentSignal

  // Bail out immédiat si le signal est déjà avorté
  if (isAborted(signal)) {
    console.log('[Streamzo] Request aborted before fetch:', url)
    throw new Error('AbortError: Request aborted')
  }

  await rateLimit(DOMAIN)

  const timeout = options.timeout ?? TIMEOUTS.PAGE
  const mergedHeaders = { ...HEADERS, ...(options.headers || {}) }
  const retries = options.retries ?? 2

  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Vérifier l'abort à chaque itération de retry
    if (isAborted(signal)) {
      lastError = new Error('AbortError: Request aborted during retry')
      break
    }

    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 5000
      console.log(`[Streamzo] Retry ${attempt}/${retries} in ${delay}ms`)
      await sleep(delay)
      // Re-vérifier après le sleep au cas où l'abort a eu lieu pendant l'attente
      if (isAborted(signal)) {
        lastError = new Error('AbortError: Request aborted during retry delay')
        break
      }
    }

    try {
      const res = await safeFetch(url, { headers: mergedHeaders, timeout, signal })
      if (!res) {
        lastError = new Error(`No response from ${url}`)
        continue
      }

      const status = typeof res.status === 'number' ? res.status : 0

      if (status === 403 || status === 503 || status === 429) {
        const text = await res.text()
        if (isCloudflareBlock(text)) {
          console.log(`[Streamzo] Cloudflare block (attempt ${attempt + 1}), retrying...`)
          lastError = new Error(`Cloudflare block (${status})`)
          continue
        }
        if (status === 429) {
          const waitMs = 3000 * (attempt + 1)
          await sleep(waitMs)
          continue
        }
        throw new Error(`HTTP ${status} for ${url}`)
      }

      if (!res.ok) {
        if (status === 404) return ''
        throw new Error(`HTTP ${status} for ${url}`)
      }

      return await res.text()
    } catch (e) {
      // Ne pas retry si l'abort a été déclenché
      if (e.name === 'AbortError' || isAborted(signal)) {
        throw e
      }
      lastError = e
      if (attempt < retries && (
        e.message?.includes('fetch failed') ||
        e.message?.includes('NetworkError') ||
        e.message?.includes('timeout') ||
        e.message?.includes('no response') ||
        e.message?.includes('Cloudflare')
      )) {
        continue
      }
      throw e
    }
  }

  if (lastError && (lastError.name === 'AbortError' || lastError.message?.includes('AbortError'))) {
    throw lastError
  }

  throw lastError || new Error(`Failed after ${retries + 1} attempts: ${url}`)
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, { ...options, headers: { ...AJAX_HEADERS, ...(options.headers || {}) } })
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (e) {
    console.warn(`[Streamzo] JSON parse error: ${e.message}`)
    return null
  }
}
