/**
 * HTTP Utilities for Nakios
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

const rateLimit = createProviderRateLimiter();

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'api.nakios.store';

export const BASE_URL = 'https://nakios.store';
export const API_BASE = 'https://api.nakios.store';
export const GLOBAL_TIMEOUT_MS = 15000;

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
};

/**
 * Fetch JSON from the Nakios API.
 * @param {string} path - Chemin API (ex: /api/sources/movie/550)
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function fetchApi(path, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) return null;

    const url = `${API_BASE}${path}`;
    await rateLimit(DOMAIN);
    console.log(`[Nakios] API: ${url}`);

    const mergedHeaders = {
        ...HEADERS,
        ...(options.headers || {}),
    };

    const res = await safeFetch(url, {
        headers: mergedHeaders,
        timeout: options.timeout || GLOBAL_TIMEOUT_MS,
        signal,
    });

    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        console.warn(`[Nakios] HTTP ${status} for ${url}`);
        return null;
    }

    try {
        const data = await res.json();
        return data;
    } catch (e) {
        console.warn(`[Nakios] JSON parse error for ${url}: ${e?.message}`);
        return null;
    }
}
