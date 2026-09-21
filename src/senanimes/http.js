/**
 * HTTP Utilities for SenAnimes (senanimes.com — Next.js 15, diag live 2026-09).
 *
 * Points clés :
 *  - Aucun challenge Cloudflare sur le site ; en revanche les API /api/* exigent
 *    un Referer https://senanimes.com/ sinon {"error":"origine-refusee"} (403).
 *  - Le CDN cdn.senanimes.com renvoie error 1027 (429) si on le sonde trop —
 *    ne JAMAIS télécharger le manifest côté provider : le wrapper de l'app le
 *    fait (expandStreamQualities, cap 12 s). On sert l'URL + Referer CDN.
 *  - Rate-limit sévère : 1 seule requête de résolution par épisode, retries
 *    espacés, pas de fanion parallel.
 *  - Timeout par défaut 12 s : la réponse API est minuscule (JSON {url,type}).
 */

const BASE = 'https://senanimes.com'
export const CDN_BASE = 'https://cdn.senanimes.com'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

const BASE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': `${BASE}/`,
}

const RETRY_DELAYS = [1200, 2500]

function isChallenge(text) {
  if (!text) return false
  return (
    text.includes('Just a moment') ||
    text.includes('cf-browser-verification') ||
    text.includes('Checking your browser') ||
    text.includes('error code: 1010')
  )
}

export async function fetchPage(url, options = {}) {
  const { timeout = 12000, signal } = options
  const headers = { ...BASE_HEADERS, ...(options.headers || {}) }
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (signal && signal.aborted) return null
    try {
      const res = await fetch(url, { headers, signal, redirect: 'follow' })
      const text = await res.text()
      if (isChallenge(text)) {
        if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt])
        continue
      }
      return text
    } catch (e) {
      if (signal && signal.aborted) return null
      if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt])
      else return null
    }
  }
  return null
}

/**
 * GET JSON sur une route /api/ du site. Referer obligatoire (garde serveur).
 * Retourne l'objet parsé ou null (404 / 403 / JSON invalide).
 */
export async function fetchApi(path, options = {}) {
  const { timeout = 12000, signal } = options
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const headers = { ...BASE_HEADERS, Accept: 'application/json', ...(options.headers || {}) }
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (signal && signal.aborted) return null
    try {
      const res = await fetch(url, { headers, signal, redirect: 'follow' })
      const text = await res.text()
      try {
        const json = JSON.parse(text)
        // {"error":"origine-refusee"} / {"error":"Introuvable"} → null
        if (json && json.error) return { status: res.status, error: json.error }
        return json
      } catch {
        if (isChallenge(text)) {
          if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt])
          continue
        }
        // Page HTML inattendue (route inexistante) → null
        return null
      }
    } catch (e) {
      if (signal && signal.aborted) return null
      if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt])
      else return null
    }
  }
  return null
}

// sleep sans setTimeout (interdit sur QuickJS) — busy-wait par microtasks,
// même convention que resolvers.js.
export function sleep(ms) {
  const target = Date.now() + ms
  return new Promise(resolve => {
    const check = () => (Date.now() >= target ? resolve() : Promise.resolve().then(check))
    check()
  })
}

/** Headers à attacher au stream final (l'app les rejoue sur le CDN). */
export function cdnHeaders() {
  return {
    Referer: `${BASE}/`,
    Origin: BASE,
    'User-Agent': USER_AGENT,
  }
}
