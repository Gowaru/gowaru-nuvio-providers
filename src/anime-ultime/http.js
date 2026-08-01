/**
 * HTTP Utilities for Anime-Ultime (v5.anime-ultime.net)
 * Site DLE sans Cloudflare : GET pages HTML + POST form-urlencoded (MenuSearch/VideoPlayer) renvoyant du JSON.
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'v5.anime-ultime.net';
const rateLimit = createProviderRateLimiter(250, 0.3);

export const BASE_URL = "https://v5.anime-ultime.net";

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": BASE_URL + "/",
    "Origin": BASE_URL,
    "X-Requested-With": "XMLHttpRequest"
};

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, { headers: { ...HEADERS, ...(customHeaders || {}) }, ...rest, signal });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
}

/**
 * POST form-urlencoded, retourne le JSON parsé (ou null).
 * Utilisé par /MenuSearch.html (recherche) et /VideoPlayer.html (player API).
 */
export async function postForm(url, body, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, {
        method: 'POST',
        headers: {
            ...HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            ...(customHeaders || {})
        },
        body,
        ...rest,
        signal
    });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    const raw = await res.text();
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}
