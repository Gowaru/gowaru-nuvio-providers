/**
 * HTTP Utilities for Webflix
 * - API 100% JSON (/api/*), pas de parsing HTML
 * - UA Chrome complet requis (Cloudflare rejette les UA courts)
 * - Retry 1 sur erreur réseau uniquement (pas sur HTTP/parse définitif)
 */
import { safeFetch, sleep, isAborted, USER_AGENT, createProviderRateLimiter } from '../utils/resolvers.js';
import { SITE } from './config.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const rateLimit = createProviderRateLimiter(200, 0.4);

export const HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: SITE.BASE_URL,
  Referer: `${SITE.BASE_URL}/`,
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  DNT: '1',
};

function isCloudflareBlockText(text) {
  if (!text || typeof text !== 'string') return false;
  return text.includes('Just a moment') ||
    text.includes('challenge-platform') ||
    text.includes('cf-browser-verification') ||
    text.includes('Checking your browser') ||
    text.includes('error code: 1010');
}

function hostOf(url) {
  try { return new URL(url).hostname || SITE.DOMAIN; } catch (e) { return SITE.DOMAIN; }
}

export async function fetchJson(url, options = {}) {
  const { headers: customHeaders, retries = 1, timeout = 10000, signal: optSignal, ...rest } = options;
  const signal = optSignal || _currentSignal;
  if (isAborted(signal)) return null;

  // Rate-limit 200ms sur le domaine (anti-burst Cloudflare)
  try { await rateLimit(hostOf(url)); } catch (e) {}

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (isAborted(signal)) return null;
    try {
      return await attemptFetch(url, customHeaders, { ...rest, timeout, signal });
    } catch (e) {
      // Retry uniquement sur erreur réseau/Cloudflare (throw), pas sur
      // réponse HTTP définitive ou JSON invalide (return null direct)
      lastError = e;
      if (attempt < retries) {
        await sleep(800);
      }
    }
  }
  console.log(`[Webflix] fetch failed ${url}: ${lastError?.message}`);
  return null;
}

async function attemptFetch(url, customHeaders, opts) {
  const res = await safeFetch(url, {
    timeout: opts.timeout || 10000,
    headers: { ...HEADERS, ...(customHeaders || {}) },
    signal: opts.signal,
  });

  if (!res) throw new Error('network: no response');

  const status = typeof res.status === 'number' ? res.status : 0;
  if (status === 403 || status === 503) throw new Error(`network: HTTP ${status}`);
  if (!res.ok && status !== 200) return null;

  // Cloudflare peut servir une page challenge en 200 → détecter avant parse
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (data == null) {
    // response.json() rend null en QuickJS sur échec → tenter text()
    try {
      const text = await res.text();
      if (!text) return null;
      if (isCloudflareBlockText(text)) throw new Error('network: cloudflare challenge');
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { data = JSON.parse(trimmed); } catch (e2) { return null; }
      } else {
        if (isCloudflareBlockText(text)) throw new Error('network: cloudflare challenge');
        return null;
      }
    } catch (e) {
      if (e && e.message && e.message.startsWith('network:')) throw e;
      return null;
    }
  }
  if (typeof data === 'string' && isCloudflareBlockText(data)) {
    throw new Error('network: cloudflare challenge');
  }
  return data;
}

/**
 * GET HTML/texte (pages embed fluxora/zenix, fiches HTML si besoin).
 * Même garde-fous que fetchJson (rate-limit, Cloudflare, signal).
 * @returns {Promise<string|null>}
 */
export async function fetchText(url, options = {}) {
  const { headers: customHeaders, timeout = 10000, signal: optSignal } = options;
  const signal = optSignal || _currentSignal;
  if (isAborted(signal)) return null;
  try { await rateLimit(hostOf(url)); } catch (e) {}
  try {
    const res = await safeFetch(url, {
      timeout,
      headers: { ...HEADERS, Accept: 'text/html,*/*', ...(customHeaders || {}) },
      signal,
    });
    if (!res) return null;
    const text = await res.text();
    if (!text || isCloudflareBlockText(text)) return null;
    return text;
  } catch (e) {
    return null;
  }
}
