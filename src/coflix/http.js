/**
 * HTTP Utilities for Coflix
 * - Multi-domain fallback (coflix.cymru → coflix.boston)
 * - Retry avec backoff pour Cloudflare
 * - Rate limiting intégré
 */
import { safeFetch, fetchWithRetry, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js'

const rateLimit = createProviderRateLimiter();

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

// Domaines Coflix actifs (ordonnés par fiabilité — coflix.boston est le seul qui répond)
// Les domaines morts (SSL error, 301, 404) sont gardés en fallback avec timeout réduit
const DOMAINS = ['coflix.boston', 'coflix.to', 'coflix.cymru', 'coflix.fr', 'coflix.blog'];

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

export const AJAX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'X-Requested-With': 'XMLHttpRequest',
};

// Délais de retry pour Cloudflare (ms) — réduits pour les domaines morts
const RETRY_DELAYS = [500, 1000, 2000];

/**
 * Détecte si une réponse est un blocage Cloudflare
 */
function isCloudflareBlock(text) {
  if (!text) return false;
  return text.includes('error code: 1010') ||
         text.includes('cf-browser-verification') ||
         text.includes('Just a moment') ||
         text.includes('Checking your browser') ||
         (text.length < 20 && text.length > 0); // Réponse vide/minimale (<20 chars) = bloquée
}

/**
 * Tente de récupérer du contenu sur un domaine spécifique.
 * Retourne null si Cloudflare bloque ou si le domaine est inaccessible.
 */
async function fetchFromDomain(domain, path, options = {}) {
  const signal = options.signal || _currentSignal;
  if (isAborted(signal)) return null;

  const url = `https://${domain}${path}`;
  const isJson = options.responseType === 'json';
  const mergedHeaders = { ...(isJson ? AJAX_HEADERS : HEADERS), ...(options.headers || {}) };

  await rateLimit(domain);    const isBoston = domain === 'coflix.boston';
    // Les domaines non-boston sont systématiquement morts (SSL, 301, 404)
    // → pas de retry, timeout réduit pour échouer vite
    const maxRetries = isBoston ? (options.retries ?? 1) : 0;
    const timeout = isBoston ? (options.timeout ?? 8000) : 3000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (isAborted(signal)) return null;
    try {
      const res = await safeFetch(url, {
        headers: mergedHeaders,
        timeout,
        signal,
      });

      if (!res) {
        console.log(`[Coflix] No response from ${domain} (attempt ${attempt + 1})`);
        if (attempt < maxRetries) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      const text = await res.text();

      // Détection blocage Cloudflare
      if (isCloudflareBlock(text)) {
        console.log(`[Coflix] Cloudflare block on ${domain} (attempt ${attempt + 1})`);
        if (attempt < maxRetries) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      if (!res.ok) {
        if (res.status === 404) return isJson ? null : '';
        console.log(`[Coflix] HTTP ${res.status} on ${domain}`);
        if (attempt < maxRetries) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      if (isJson) {
        try { return JSON.parse(text); } catch { return null; }
      }

      return text;

    } catch (e) {
      console.log(`[Coflix] Error on ${domain} (attempt ${attempt + 1}): ${e.message}`);
      if (attempt < maxRetries) await sleep(RETRY_DELAYS[attempt] || 2000);
    }
  }

  return null;
}

/**
 * Récupère du contenu HTML en essayant chaque domaine Coflix.
 * Retourne dès qu'un domaine répond (avec données valides).
 */
export async function fetchText(path, options = {}) {
  for (const domain of DOMAINS) {
    const result = await fetchFromDomain(domain, path, { ...options, responseType: 'text' });
    if (result) return result;
  }
  return null;
}

/**
 * Récupère du JSON via l'API REST WordPress.
 * Essaie chaque domaine jusqu'à trouver une réponse valide.
 */
export async function fetchJson(path, options = {}) {
  for (const domain of DOMAINS) {
    const result = await fetchFromDomain(domain, path, { ...options, responseType: 'json' });
    if (result) return result;
  }
  return null;
}

export { DOMAINS };
