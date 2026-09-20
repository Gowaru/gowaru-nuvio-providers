/**
 * HTTP Utilities for Jetanimes (jetanimes.com → on.jetanimes.com)
 * Gateway search + WordPress Dooplay content site.
 */

import { safeFetch, createProviderRateLimiter, isAborted, USER_AGENT } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const rateLimit = createProviderRateLimiter(350, 0.3);
const DOMAIN = 'on.jetanimes.com';

export const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    "Referer": "https://on.jetanimes.com/",
};

export async function fetchText(url, options = {}) {
    const r = await fetchMeta(url, options);
    if (!r || !r.text) return r ? '' : null;
    return r.text;
}

/**
 * Fetch renvoyant aussi l'URL FINALE (après redirections) — indispensable
 * pour les raccourcisseurs de lecteur (secured.lol → hdsplay2.xyz/e/{code}).
 */
export async function fetchMeta(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, {
        ...rest,
        headers: { ...HEADERS, ...(customHeaders || {}) },
        signal,
    });
    if (!res || !res.ok) return null;
    const text = await res.text().catch(() => '');
    return { text, finalUrl: res.url || url, status: res.status };
}

export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

/** POST form-urlencodé (admin-ajax) — Content-Type explicite (exigence runtime). */
export async function postForm(url, body, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, {
        ...rest,
        method: 'POST',
        headers: {
            ...HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            ...(customHeaders || {}),
        },
        body: typeof body === 'string' ? body : new URLSearchParams(body).toString(),
        signal,
    });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}
