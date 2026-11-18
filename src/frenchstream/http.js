/**
 * HTTP Utilities for Frenchstream
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

const rateLimit = createProviderRateLimiter();

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'french-stream.one';

// 2026-10 : french-stream.one redirige TOUS ses chemins en 301 vers
// french-stream.net (migration de domaine côté site). L'ancien code postait
// ses recherches sur .one ; la 301 transformait le POST en GET sans corps →
// réponse = page d'accueil générique (36 cartes fixes) → la recherche DLE
// fallback ne trouvait jamais rien. .net est le domaine canonique actuel —
// sans 301 (vérifié en live) et tous les endpoints (xfsearch, POST search,
// engine/ajax/get_seasons.php, film_api) y répondent correctement.
// .one est conservé en fallback multi-domain au cas où .net sature/404.
export const BASE_URLS = ['https://french-stream.net', 'https://french-stream.one'];
export const BASE_URL = BASE_URLS[0];
export const GLOBAL_TIMEOUT_MS = 20000;

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
    'Connection': 'keep-alive'
};

/* ---------- Anti-429 : cooldown par domaine + cache de réponses ---------- */

// Le site renvoie 429 dès quelques requêtes rapprochées. On mémorise une
// fenêtre de blocage par host (Retry-After si fourni) et on bascule sur
// l'autre domaine au lieu de marteler celui qui limite.
const COOLDOWN_MS = 30000;
const COOLDOWN_MAX_MS = 120000;
const cooldownUntil = Object.create(null);

// Cache partagé des réponses GET (pages HTML/JSON) : une même page demandée
// deux fois dans la même exécution ne repart pas sur le réseau.
const RESPONSE_TTL_MS = 300000;
const RESPONSE_MAX = 120;
const responseCache = new Map();

function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return ''; }
}

/** Le domaine de cette URL est-il en fenêtre 429 ? */
export function isDomainCooling(url) {
    return (cooldownUntil[hostOf(url)] || 0) > Date.now();
}

function markCooldown(url, res) {
    let ms = COOLDOWN_MS;
    try {
        const h = res && res.headers && (typeof res.headers.get === 'function'
            ? res.headers.get('retry-after')
            : res.headers['retry-after']);
        const secs = parseInt(h, 10);
        if (secs > 0) ms = Math.min(secs * 1000, COOLDOWN_MAX_MS);
    } catch (e) { /* headers indisponibles */ }
    cooldownUntil[hostOf(url)] = Date.now() + ms;
    console.warn(`[Frenchstream] 429 sur ${hostOf(url)} — pause ${Math.round(ms / 1000)}s`);
}

function isRateLimited(res) {
    const s = res && typeof res.status === 'number' ? res.status : 0;
    return s === 429 || s === 503;
}

/** Même chemin sur l'autre domaine, si celui-ci n'est pas en cooldown. */
function alternateUrl(url) {
    let origin = '';
    try { origin = new URL(url).origin; } catch (e) { return null; }
    if (!BASE_URLS.includes(origin)) return null;
    for (const base of BASE_URLS) {
        if (base === origin) continue;
        if ((cooldownUntil[hostOf(base)] || 0) > Date.now()) continue;
        return base + url.slice(origin.length);
    }
    return null;
}

function cacheGet(url) {
    const e = responseCache.get(url);
    if (!e) return undefined;
    if (Date.now() - e.ts >= RESPONSE_TTL_MS) { responseCache.delete(url); return undefined; }
    return e.data;
}

function cacheSet(url, data) {
    if (responseCache.size >= RESPONSE_MAX) {
        let oldestKey = null, oldestTs = Infinity;
        for (const [k, v] of responseCache) { if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; } }
        if (oldestKey) responseCache.delete(oldestKey);
    }
    responseCache.set(url, { data, ts: Date.now() });
}

async function requestOnce(url, options) {
    const signal = options.signal || _currentSignal;
    await rateLimit(DOMAIN);
    const base = options.baseUrl || (() => { try { return new URL(url).origin; } catch (e) { return BASE_URL; } })();
    const timeout = options.timeout || GLOBAL_TIMEOUT_MS;
    const mergedHeaders = {
        ...HEADERS,
        Referer: `${base}/`,
        Origin: base,
        ...(options.headers || {})
    };
    const { baseUrl, headers, cache, ...restOptions } = options;
    return safeFetch(url, { headers: mergedHeaders, ...restOptions, timeout, signal });
}

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const useCache = options.cache !== false;
    if (useCache) {
        const hit = cacheGet(url);
        if (hit !== undefined) {
            console.log(`[Frenchstream] Page en cache: ${url}`);
            return hit;
        }
    }

    // Domaine déjà limité → tenter directement l'autre.
    let target = url;
    if (isDomainCooling(target)) {
        const alt = alternateUrl(target);
        if (alt) { console.log(`[Frenchstream] ${hostOf(target)} en cooldown → ${hostOf(alt)}`); target = alt; }
    }

    console.log(`[Frenchstream] Fetching: ${target}`);
    let res = await requestOnce(target, options);

    if (isRateLimited(res)) {
        markCooldown(target, res);
        const alt = alternateUrl(target);
        if (alt) {
            console.log(`[Frenchstream] Retry anti-429 sur ${hostOf(alt)}`);
            res = await requestOnce(alt, { ...options, baseUrl: alt.slice(0, alt.indexOf('/', 8)) });
            if (isRateLimited(res)) markCooldown(alt, res);
            else target = alt;
        }
    }

    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${target}`);
    }

    const text = await res.text();
    if (useCache) cacheSet(url, text);
    return text;
}

export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`[Frenchstream] Failed to parse JSON for ${url}`);
        throw e;
    }
}

/**
 * GET JSON avec bascule de domaine (.net → .one). Les endpoints de données
 * (get_seasons.php, data/eps_*.txt, film_api.php) sont servis par le domaine
 * canonique ; si .net tombe ou renvoie une erreur, .one reste jouable.
 * `path` doit commencer par '/'.
 */
export async function fetchJsonFailover(path, options = {}) {
    let lastErr = null;
    for (const base of BASE_URLS) {
        try {
            return await fetchJson(base + path, { ...options, baseUrl: base });
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('Frenchstream: all domains failed for ' + path);
}

export async function fetchPost(url, body, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    await rateLimit(DOMAIN);
    console.log(`[Frenchstream] POST: ${url}`);
    const base = options.baseUrl || (() => { try { return new URL(url).origin; } catch (e) { return BASE_URL; } })();
    const timeout = options.timeout || GLOBAL_TIMEOUT_MS;
    const mergedHeaders = {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${base}/`,
        Origin: base,
        ...(options.headers || {})
    };
    const { baseUrl, headers, cache, ...restOptions } = options;
    let res = await safeFetch(url, { method: 'POST', body, headers: mergedHeaders, ...restOptions, timeout, signal });

    if (isRateLimited(res)) {
        markCooldown(url, res);
        const alt = alternateUrl(url);
        if (alt) {
            console.log(`[Frenchstream] POST retry anti-429 sur ${hostOf(alt)}`);
            const altBase = alt.slice(0, alt.indexOf('/', 8));
            res = await safeFetch(alt, {
                method: 'POST', body, timeout, signal,
                headers: { ...mergedHeaders, Referer: `${altBase}/`, Origin: altBase }
            });
            if (isRateLimited(res)) markCooldown(alt, res);
        }
    }

    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for POST ${url}`);
    }
    return await res.text();
}