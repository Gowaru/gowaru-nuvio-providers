/**
 * HTTP Fluneo (myfluneo.eu)
 *
 * Deux modes de lecture :
 *  - fetchHtml()        : safeFetch strict (HTML complet obligatoire).
 *  - fetchHtmlPartial() : fetch natif tolérant à la troncature runtime 1 Mo.
 *    Les pages d'épisode des longues séries font 1,2 à 3,4 Mo ; le runtime
 *    coupe à 1 Mo et safeFetch refuse alors le corps → 0 stream. Or les
 *    `embeds_json` de l'épisode courant arrivent très tôt dans le document
 *    (≈ 12 à 60 Ko sur Bleach/One Piece) : parser le préfixe suffit.
 *
 * Cloudflare : le domaine renvoie un challenge managé (403 `cf-mitigated`)
 * à tout client non-navigateur. On détecte, on bascule en « circuit ouvert »
 * pour ne pas brûler le budget, et on laisse l'utilisateur fournir un cookie
 * `cf_clearance` via les réglages du provider (même UA + même IP).
 */

import { isAborted, getScraperSettings } from '../utils/resolvers.js';
import { SITE, TIMEOUTS, LIMITS, USER_AGENT } from './config.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

/** Circuit Cloudflare : une fois le challenge confirmé, on arrête tout. */
let cfBlocked = false;
export function isCfBlocked() { return cfBlocked; }
export function resetCfState() { cfBlocked = false; }

/** Cache mémoire (une exécution = un contexte QuickJS frais). */
const pageCache = new Map();

/** Single-flight : deux fetch identiques concurrents = une seule requête. */
const inflight = new Map();

function cacheGet(url) {
  const e = pageCache.get(url);
  if (!e) return undefined;
  if (Date.now() - e.ts > 300000) { pageCache.delete(url); return undefined; }
  return e.text;
}

function cacheSet(url, text) {
  if (pageCache.size >= LIMITS.MAX_PAGE_CACHE) {
    let oldest = null, ts = Infinity;
    for (const [k, v] of pageCache) if (v.ts < ts) { ts = v.ts; oldest = k; }
    if (oldest) pageCache.delete(oldest);
  }
  pageCache.set(url, { text, ts: Date.now() });
}

/** Réglages utilisateur → headers (cookie cf_clearance + UA optionnel). */
function buildHeaders() {
  const s = getScraperSettings() || {};
  const ua = (s.userAgent && String(s.userAgent).trim()) || USER_AGENT;
  let cookie = s.cfClearance || s.cookie || '';
  cookie = String(cookie).trim();
  if (cookie && cookie.indexOf('=') === -1) cookie = 'cf_clearance=' + cookie;
  const headers = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
    // Seul levier inter-appels : aucune API de stockage n'est exposée au
    // plugin (instance QuickJS fraîche à chaque getStreams). Cette directive
    // permet à NuvioMobile Android de resservir la page depuis son cache
    // disque OkHttp (50 Mo) pendant 5 min — à condition que le site renvoie
    // lui-même une réponse stockable (sans `no-store` / `must-revalidate`).
    'Cache-Control': 'max-age=300, max-stale=300',
  };
  if (cookie) headers['Cookie'] = cookie;
  return headers;
}

export function hasCookie() {
  const s = getScraperSettings() || {};
  return !!(String(s.cfClearance || s.cookie || '').trim());
}

function challengeError(url, status) {
  cfBlocked = true;
  const e = new Error(
    'Cloudflare challenge (' + status + ') sur ' + url +
    (hasCookie() ? ' — cookie cf_clearance refusé (IP ou UA différent ?)' :
      ' — ajoutez le cookie cf_clearance dans les réglages Fluneo')
  );
  e.isChallenge = true;
  return e;
}

function looksChallenged(status, text) {
  if (status !== 403 && status !== 503) return false;
  if (!text) return true;
  return /Just a moment|Un instant|cf-mitigated|challenge-platform|Attention Required|Checking your browser/i.test(text);
}

/**
 * GET tolérant : renvoie le texte même tronqué à 1 Mo (suffixe runtime).
 * Utilisé pour les pages d'épisode, dont le début contient les embeds.
 */
export async function fetchHtmlPartial(url, options = {}) {
  const signal = options.signal || _currentSignal;
  if (isAborted(signal)) throw new Error('AbortError: Request aborted');
  if (cfBlocked) throw challengeError(url, 403);

  const cached = cacheGet(url);
  if (cached !== undefined) return cached;
  if (inflight.has(url)) return inflight.get(url);

  const pending = loadPage(url, options, signal);
  inflight.set(url, pending);
  try {
    return await pending;
  } finally {
    inflight.delete(url);
  }
}

/**
 * Le cache disque OkHttp (NuvioMobile Android) ne peut resservir que ce que
 * le site autorise à stocker. On le signale une fois par exécution : sans ce
 * message, un `Cache-Control: no-store` côté site passe inaperçu.
 */
let _cachePolicyLogged = false;
function noteCachePolicy(res) {
  if (_cachePolicyLogged) return;
  try {
    const cc = res && res.headers && typeof res.headers.get === 'function'
      ? String(res.headers.get('cache-control') || '')
      : '';
    if (cc && /no-store|no-cache|must-revalidate/i.test(cc)) {
      _cachePolicyLogged = true;
      console.log('[Fluneo] cache disque inactif (site: ' + cc + ')');
    }
  } catch (e) { /* headers indisponibles */ }
}

async function loadPage(url, options, signal) {
  const headers = buildHeaders();
  const fetchOptions = { headers, redirect: 'follow' };
  const ms = options.timeout || TIMEOUTS.PAGE;
  if (signal) {
    fetchOptions.signal = signal;
  } else if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' && ms > 0) {
    fetchOptions.signal = AbortSignal.timeout(ms);
  }

  let res;
  try {
    res = await fetch(url, fetchOptions);
  } catch (e) {
    if (isAborted(signal)) throw e;
    throw new Error('HTTP no-response for ' + url + ' (' + (e && e.message) + ')');
  }
  if (!res) throw new Error('HTTP no-response for ' + url);

  let text = '';
  try { text = await res.text(); } catch (e) { text = ''; }
  if (looksChallenged(res.status, text)) throw challengeError(url, res.status);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  noteCachePolicy(res);
  // Corps tronqué : on garde le préfixe (les embeds sont en tête de document).
  cacheSet(url, text);
  return text;
}

export { SITE };
