/**
 * HTTP Utilities for Anime-Sama
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'anime-sama.to';
const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
};

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    console.log(`[Anime-Sama] Fetching: ${url}`);
    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, { headers: { ...HEADERS, ...(customHeaders || {}) }, ...rest, signal });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        // Page de blocage Cloudflare (« Sorry, you have been blocked ») : on le
        // dit clairement dans les logs au lieu d'un « 0 flux » muet.
        if (res && (status === 403 || status === 503)) {
            let body = '';
            try { body = await res.text(); } catch (_) {}
            if (/you have been blocked|attention required|cf-error-details|just a moment/i.test(body || '')) {
                console.warn(`[Anime-Sama] Bloqué par Cloudflare (${status}) : ${url}`);
                throw new Error(`Cloudflare block ${status} for ${url}`);
            }
        }
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
}

export async function fetchJson(url, options = {}) {
    const raw = await fetchText(url, options);
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[Anime-Sama] JSON Parse Error: ${e.message}`);
        return null;
    }
}
