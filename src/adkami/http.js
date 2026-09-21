/**
 * HTTP Utilities for ADKami (www.adkami.com — PHP custom, diag live 2026-09).
 *
 * Points clés :
 *  - Aucun challenge Cloudflare en SSR (curl simple passe) ;
 *  - Search : GET /video?search={q} (renvoie fiches + posts communautaires —
 *    il faut filtrer les cartes réelles : span.title + image miniature) ;
 *  - Fiche : /anime/{id} liste TOUS les épisodes avec variantes ;
 *  - Page épisode : /anime/{id}/{ep}/{lang}/{qual}/{serveur}/ — segment 3
 *    contient la langue ET la segment 1 l'épisode ABSOLU. Il faut lire le
 *    TITLE ("Episode {n} (vf sai{n})") pour connaître l'épisode de saison réel ;
 *  - Les embeds sont chiffrés dans data-url : préfixe leurre
 *    "https://www.youtube.com/embed/" + base64(atob) → (175^c)-key[i]
 *    (clé extraite de main.min.js) — cf. decryptAdkUrl() ;
 *  - Serveurs observés : dood, lulustream, vidmoly, voe, streamtape, byse, sibnet ;
 *  - Rate-limit : aucun observé en SSR — garder des retries courts.
 */

const BASE = 'https://www.adkami.com'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

const BASE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${BASE}/`,
}

const RETRY_DELAYS = [1000, 2200]

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
  const { timeout = 13000, signal, headers } = options
  const merged = { ...BASE_HEADERS, ...(headers || {}) }
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (signal && signal.aborted) return null
    try {
      const res = await fetch(url, { headers: merged, signal, redirect: 'follow' })
      const text = await res.text()
      if (isChallenge(text)) {
        if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt])
        continue
      }
      // Page vide / erreur applicative → null (pas de retry)
      if (!res.ok) return null
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
 * GET + renvoie { text, finalUrl } — nécessaire pour les embeds par
 * redirection JS (protected streamers).
 */
export async function fetchMeta(url, options = {}) {
  const { timeout = 13000, signal, headers } = options
  const merged = { ...BASE_HEADERS, ...(headers || {}) }
  try {
    const res = await fetch(url, { headers: merged, signal, redirect: 'follow' })
    const text = await res.text()
    return { text, finalUrl: res.url || url }
  } catch {
    return null
  }
}

// sleep sans setTimeout (interdit sur QuickJS) — même convention que resolvers.js
export function sleep(ms) {
  const target = Date.now() + ms
  return new Promise(resolve => {
    const check = () => (Date.now() >= target ? resolve() : Promise.resolve().then(check))
    check()
  })
}

/** Clé + préfixe leurre du décodeur ADKami (extraits de main.min.js). */
export const ADK_PREFIX = 'https://www.youtube.com/embed/'
export const ADK_KEY = 'ETEfazefzeaZa13MnZEe'

/**
 * Décode un data-url ADKami :
 *   "https://www.youtube.com/embed/{base64}"
 *   → atob(base64) → pour chaque char : (175 ^ c) - key[i % (key.length-1)]
 * Retourne l'URL d'embed réelle ou null.
 */
export function decryptAdkUrl(value) {
  const v = String(value || '')
  const idx = v.indexOf(ADK_PREFIX)
  if (idx === -1) return null
  let bin
  try {
    bin = atob(v.slice(idx + ADK_PREFIX.length))
  } catch {
    return null
  }
  let out = ''
  let i = 0
  for (const ch of bin) {
    out += String.fromCharCode((175 ^ ch.charCodeAt()) - ADK_KEY.charCodeAt(i))
    i = i > ADK_KEY.length - 2 ? 0 : i + 1
  }
  return /^https?:\/\//.test(out) ? out : null
}
