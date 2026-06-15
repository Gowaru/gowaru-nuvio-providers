/**
 * HTTP Utilities for AnimeVOSTFR
 */

const rateLimit = createProviderRateLimiter();
const DOMAIN = 'v2.animevostfr.org';

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
};

import { safeFetch, createProviderRateLimiter } from '../utils/resolvers.js';

/**
 * Fetch text content from a URL
 */
const HTTP_SKIP_CODES = [403, 404, 429, 500, 502, 503, 504, 522, 523, 524];

export async function fetchText(url, options = {}) {
    await rateLimit(DOMAIN);
    console.log(`[AnimeVOSTFR] Fetching: ${url}`);
    const { headers: customHeaders, ...rest } = options;
    const res = await safeFetch(url, { headers: { ...HEADERS, ...(customHeaders || {}) }, ...rest });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        if (HTTP_SKIP_CODES.includes(status)) throw new Error(`HTTP_SKIP ${status}`);
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
}
