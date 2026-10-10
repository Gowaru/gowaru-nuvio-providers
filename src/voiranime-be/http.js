/**
 * HTTP Utilities for VoiranimeBE (voiranime.be)
 * Site WordPress (thème dramastream) : pages épisodes publiques + sitemaps.
 */

import { safeFetch, createProviderRateLimiter, isAborted, USER_AGENT } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const rateLimit = createProviderRateLimiter(350, 0.3);
const DOMAIN = 'voiranime.be';
const SITE = 'https://voiranime.be';

export const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    "Referer": "https://voiranime.be/",
};

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, {
        ...rest,
        headers: { ...HEADERS, ...(customHeaders || {}) },
        signal,
    });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
}

export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        return null; // QuickJS : response.json() peut renvoyer null — garde symétrique
    }
}

/**
 * Comme fetchText mais expose aussi l'URL finale après redirects.
 * Sert la garde 404-déguisée : URL inconnue → 301 → homepage HTTP 200.
 */
export async function fetchPage(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, {
        ...rest,
        headers: { ...HEADERS, ...(customHeaders || {}) },
        signal,
    });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return { html: await res.text(), finalUrl: res.url || url };
}

/** Vrai si l'URL finale est la homepage (redirigée depuis une 404 déguisée). */
export function isHomepageUrl(u) {
    if (!u || typeof u !== 'string') return false;
    const norm = u.split('#')[0].split('?')[0].replace(/\/+$/, '');
    return norm === SITE || norm === 'http://voiranime.be';
}
