import { safeFetch, sanitizeSearchQuery, createProviderRateLimiter, isAborted, sleep } from '../utils/resolvers.js'
import { SITE, ENDPOINTS, TIMEOUTS } from './config.js'

/**
 * Le site throttle par FENÊTRE (mesuré 2026-11) : quelques requêtes passent,
 * puis tout répond 429 pendant ~30 s — insister ne fait que consommer le
 * budget du plugin (60 s). On espace les appels, on mémorise la fenêtre de
 * throttle et on attend (au lieu d'abandonner) avant de réessayer une fois.
 */
const rateLimit = createProviderRateLimiter(600)

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const THROTTLE_COOLDOWN_MS = 7000
const THROTTLE_MAX_WAIT_MS = 9000
let _throttledUntil = 0
// Une seule attente de fenêtre par exécution : au-delà, mieux vaut rendre
// partiellement que brûler le budget du plugin (60 s app).
let _throttleWaits = 0

export function isThrottled() { return Date.now() < _throttledUntil }
function markThrottled() { _throttledUntil = Math.max(_throttledUntil, Date.now() + THROTTLE_COOLDOWN_MS) }

/** Attend la fin de la fenêtre de throttle (borné, jamais bloquant à l'infini). */
async function waitCooldown() {
  const started = Date.now()
  while (Date.now() < _throttledUntil) {
    if (Date.now() - started > THROTTLE_MAX_WAIT_MS) return false
    await sleep(1000)
  }
  return true
}

const DOMAIN = 'voiranime.homes'

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${SITE.BASE_URL}/`,
}

export const AJAX_HEADERS = {
  ...HEADERS,
  Accept: 'application/json, text/html, */*',
  'X-Requested-With': 'XMLHttpRequest',
}

/**
 * Requête unique vers le site avec gestion du 429 :
 *  - attente de la fenêtre en cours,
 *  - 1 seul retry (après 6-7 s), puis échec explicite.
 */
async function request(url, options = {}) {
  const signal = options.signal || _currentSignal
  if (isAborted(signal)) throw new Error('AbortError: Request aborted')
  await rateLimit(DOMAIN)

  for (let attempt = 0; attempt < 2; attempt++) {
    await waitCooldown()
    const res = await safeFetch(url, { ...options, signal })
    if (!res) throw new Error(`No response from ${url}`)
    if (res.status === 429) {
      markThrottled()
      if (attempt === 0 && _throttleWaits < 1) { _throttleWaits++; await sleep(THROTTLE_COOLDOWN_MS); continue }
      throw new Error(`HTTP error 429 for ${url}`)
    }
    return res
  }
  throw new Error(`HTTP error 429 for ${url}`)
}

export async function fetchText(url, options = {}) {
  const signal = options.signal || _currentSignal
  if (isAborted(signal)) throw new Error('AbortError: Request aborted')
  const timeout = options.timeout ?? TIMEOUTS.PAGE
  const headers = { ...HEADERS, ...(options.headers || {}) }
  const res = await request(url, { headers, timeout })
  if (!res.ok) {
    const status = typeof res.status === 'number' ? res.status : 'no-response'
    if (status === 404) return ''
    throw new Error(`HTTP error ${status} for ${url}`)
  }
  return await res.text()
}

export async function fetchJson(url, options = {}) {
  const signal = options.signal || _currentSignal
  const headers = { ...AJAX_HEADERS, ...(options.headers || {}) }
  const res = await request(url, { headers, timeout: options.timeout ?? TIMEOUTS.API })
  const text = await res.text()
  if (!text || text === '[]') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * AJAX search DLE (POST /engine/ajax/search.php).
 * Le endpoint pagine (`page=1..N`) — la page 2 ne sert que pour les titres à
 * beaucoup de saisons, chaque appel comptant dans le quota du site.
 */
export async function ajaxSearch(query, options = {}) {
  const sanitized = sanitizeSearchQuery(query)
  if (!sanitized) return ''
  const page = options.page || 1
  const headers = {
    ...AJAX_HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: SITE.BASE_URL,
    ...(options.headers || {}),
  }
  const res = await request(`${SITE.BASE_URL}${ENDPOINTS.SEARCH_AJAX}`, {
    method: 'POST',
    headers,
    body: `query=${encodeURIComponent(sanitized)}&page=${page}`,
    timeout: options.timeout ?? TIMEOUTS.SEARCH,
  })
  if (!res.ok) throw new Error(`No response from search (page ${page})`)
  return await res.text()
}
