/**
 * HTTP Utilities for WaveAnime (waveanime.fr)
 * API REST publique (JSON), DASH playback (/playback/:ep/manifest.mpd).
 */

import { safeFetch, createProviderRateLimiter, isAborted, USER_AGENT } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const rateLimit = createProviderRateLimiter(300, 0.3);
const DOMAIN = 'waveanime.fr';

export const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://waveanime.fr/",
};

/**
 * Fetch text content from a URL (rate-limited, signal-aware).
 */
export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, {
        ...rest,
        headers: { ...HEADERS, ...(customHeaders || {}) },
        signal
    });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
}

/**
 * Fetch JSON content from a URL (returns null on parse failure, QuickJS-safe).
 */
export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}
