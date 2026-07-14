/**
 * HTTP Utilities for Coflix
 * - Multi-domain fallback (coflix.cymru → coflix.boston)
 * - Retry avec backoff pour Cloudflare
 * - Rate limiting intégré
 */
import { safeFetch, fetchWithRetry, createProviderRateLimiter, sleep } from '../utils/resolvers.js'

const rateLimit = createProviderRateLimiter();

// Domaines Coflix actifs (ordonnés par fiabilité)
const DOMAINS = ['coflix.boston', 'coflix.to', 'coflix.fr', 'coflix.cymru', 'coflix.blog'];

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

// Délais de retry pour Cloudflare (ms)
const RETRY_DELAYS = [1000, 2000, 4000];

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
  const url = `https://${domain}${path}`;
  const isJson = options.responseType === 'json';
  const mergedHeaders = { ...(isJson ? AJAX_HEADERS : HEADERS), ...(options.headers || {}) };

  await rateLimit(domain);

  for (let attempt = 0; attempt <= (options.retries ?? 1); attempt++) {
    try {
      const res = await safeFetch(url, {
        headers: mergedHeaders,
        timeout: options.timeout ?? 10000
      });

      if (!res) {
        console.log(`[Coflix] No response from ${domain} (attempt ${attempt + 1})`);
        if (attempt < (options.retries ?? 1)) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      const text = await res.text();

      // Détection blocage Cloudflare
      if (isCloudflareBlock(text)) {
        console.log(`[Coflix] Cloudflare block on ${domain} (attempt ${attempt + 1})`);
        if (attempt < (options.retries ?? 1)) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      if (!res.ok) {
        if (res.status === 404) return isJson ? null : '';
        console.log(`[Coflix] HTTP ${res.status} on ${domain}`);
        if (attempt < (options.retries ?? 1)) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      if (isJson) {
        try { return JSON.parse(text); } catch { return null; }
      }

      return text;

    } catch (e) {
      console.log(`[Coflix] Error on ${domain} (attempt ${attempt + 1}): ${e.message}`);
      if (attempt < (options.retries ?? 1)) await sleep(RETRY_DELAYS[attempt] || 2000);
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
