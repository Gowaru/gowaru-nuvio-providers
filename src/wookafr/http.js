import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js'
import { SITE, TIMEOUTS } from './config.js'

const rateLimit = createProviderRateLimiter()

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const RETRY_DELAYS = [1000, 2000, 4000]

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
}

/**
 * Détecte si la réponse est un blocage Cloudflare
 */
function isCloudflareBlock(text) {
  if (!text) return false
  return text.includes('error code: 1010') ||
         text.includes('cf-browser-verification') ||
         text.includes('Just a moment') ||
         text.includes('Checking your browser')
}

/**
 * Tente de récupérer du contenu depuis un domaine, avec retry.
 */
async function fetchFromDomain(domain, path, options = {}) {
  const signal = options.signal || _currentSignal
  if (isAborted(signal)) return null

  // Si path est déjà une URL absolue, l'utiliser directement (pas de préfixe domaine)
  const url = (path && (path.startsWith('http://') || path.startsWith('https://')))
    ? path
    : `${domain}${path}`
  const mergedHeaders = { ...HEADERS, ...(options.headers || {}) }
  const retries = options.retries ?? 1

  await rateLimit(new URL(domain).hostname)

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (isAborted(signal)) return null
    try {
      const timeout = options.timeout ?? TIMEOUTS.PAGE
      const res = await safeFetch(url, { headers: mergedHeaders, timeout, signal })

      if (!res) {
        console.log(`[Wookafr] No response from ${domain} (attempt ${attempt + 1})`)
        if (attempt < retries) await sleep(RETRY_DELAYS[attempt] || 2000)
        continue
      }

      const text = await res.text()

      // Détection Cloudflare
      if (isCloudflareBlock(text)) {
        console.log(`[Wookafr] Cloudflare block on ${domain} (attempt ${attempt + 1})`)
        if (attempt < retries) await sleep(RETRY_DELAYS[attempt] || 2000)
        continue
      }

      if (!res.ok) {
        if (res.status === 404) return ''
        console.log(`[Wookafr] HTTP ${res.status} on ${domain}`)
        if (attempt < retries) await sleep(RETRY_DELAYS[attempt] || 2000)
        continue
      }

      return text

    } catch (e) {
      console.log(`[Wookafr] Error on ${domain} (attempt ${attempt + 1}): ${e.message}`)
      if (attempt < retries) await sleep(RETRY_DELAYS[attempt] || 2000)
    }
  }

  return null
}

/**
 * Récupère du HTML en essayant chaque domaine Wookafr.
 */
export async function fetchText(path, options = {}) {
  const domains = [...new Set([SITE.BASE_URL, ...SITE.DOMAINS])]
  for (const domain of domains) {
    const result = await fetchFromDomain(domain, path, options)
    if (result) return result
  }
  throw new Error(`[Wookafr] All domains failed for ${path}`)
}

/**
 * POST form data avec fallback multi-domain pour l'URL de base.
 */
export async function postForm(url, data, options = {}) {
  const signal = options.signal || _currentSignal;
  if (isAborted(signal)) return null;

  const body = Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const domains = [...new Set([SITE.BASE_URL, ...SITE.DOMAINS])]

  for (const domain of domains) {
    if (isAborted(signal)) return null;

    const ajaxUrl = `${domain}/wp-admin/admin-ajax.php`
    await rateLimit(new URL(domain).hostname)

    try {
      const res = await safeFetch(ajaxUrl, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${domain}/`,
          Origin: domain,
          ...(options.headers || {}),
        },
        body,
        timeout: options.timeout ?? TIMEOUTS.AJAX,
        signal,
      })

      if (!res) continue
      const text = await res.text()
      if (isCloudflareBlock(text)) continue
      try { return JSON.parse(text) } catch { continue }
    } catch (e) {
      console.log(`[Wookafr] AJAX error on ${domain}: ${e.message}`)
    }
  }

  return null
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options)
  try { return JSON.parse(text) }
  catch { return null }
}
