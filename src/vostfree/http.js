/**
 * HTTP Utilities for Vostfree
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

const DOMAIN = 'ipv4.vostfree.ws';
const rateLimit = createProviderRateLimiter();

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
};

const HTTP_SKIP_CODES = [403, 404, 429, 500, 502, 503, 504, 522, 523, 524];

/**
 * Fetch text content from a URL
 *
 * @param {string} url - URL to fetch
 * @param {object} [options] - Options de fetch
 * @param {object} [options.headers] - Headers additionnels
 * @param {AbortSignal} [options.signal] - Signal d'annulation
 * @returns {Promise<string>}
 */
export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;

    // Abort immédiat si le signal est déjà avorté
    if (isAborted(signal)) {
        throw new Error('AbortError: Request aborted');
    }

    console.log(`[Vostfree] Fetching: ${url}`);
    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);

    // Vérifier après rate limiting
    if (isAborted(signal)) {
        throw new Error('AbortError: Request aborted after rate limit');
    }

    const res = await safeFetch(url, { headers: { ...HEADERS, ...(customHeaders || {}) }, ...rest, signal });
    if (isAborted(signal)) {
        throw new Error('AbortError: Request aborted after fetch');
    }
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        if (HTTP_SKIP_CODES.includes(status)) throw new Error(`HTTP_SKIP ${status}`);
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
}

/**
 * Fetch JSON content from a URL
 */
export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`[Vostfree] Failed to parse JSON from ${url}`);
        throw e;
    }
}
