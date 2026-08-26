/**
 * HTTP Utilities for AnimesUltra
 * Avec retry Cloudflare et rate limiting
 */

import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const rateLimit = createProviderRateLimiter();
const DOMAIN = 'ww.animesultra.org';

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
};

const RETRY_DELAYS = [1000, 2000];

/**
 * Detect Cloudflare challenge page
 */
function isCloudflareBlock(text) {
    if (!text || text.length > 8000) return false;
    return (
        text.includes('Cloudflare') ||
        text.includes('challenge-form') ||
        text.includes('Just a moment...') ||
        text.includes('cdn-cgi/bm/cv/') ||
        /Ray ID: [a-f0-9-]{20,}/.test(text)
    );
}

/**
 * Fetch text content with Cloudflare retry
 */
export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    await rateLimit(DOMAIN);

    const { headers: customHeaders, timeout, retries: maxRetriesOpt, ...rest } = options;
    const maxRetries = maxRetriesOpt ?? 2;
    const mergedHeaders = { ...HEADERS, ...(customHeaders || {}) };

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (isAborted(signal)) {
            lastError = new Error('AbortError: Request aborted');
            break;
        }

        if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1] || 2000;
            await sleep(delay);
            if (isAborted(signal)) {
                lastError = new Error('AbortError: Request aborted');
                break;
            }
        }

        try {
            const res = await safeFetch(url, {
                headers: mergedHeaders,
                timeout,
                signal,
                ...rest,
            });

            if (!res) {
                lastError = new Error(`No response: ${url.slice(0, 80)}`);
                continue;
            }

            const status = typeof res.status === 'number' ? res.status : 0;

            // Cloudflare challenge (503/403) → retry
            if (status === 503 || status === 403) {
                const text = await res.text();
                if (isCloudflareBlock(text)) {
                    lastError = new Error(`Cloudflare block (${status})`);
                    continue;
                }
                if (status === 403) throw new Error(`HTTP 403 for ${url.slice(0, 80)}`);
            }

            // Rate limiting (429) → wait and retry
            if (status === 429) {
                await sleep(2000 * (attempt + 1));
                continue;
            }

            if (!res.ok) {
                if (status === 404) return '';
                throw new Error(`HTTP ${status} for ${url.slice(0, 80)}`);
            }

            return await res.text();
        } catch (e) {
            lastError = e;
            if (e.name === 'AbortError' || isAborted(signal)) throw e;
            if (attempt < maxRetries && (
                e.message?.includes('fetch failed') ||
                e.message?.includes('timeout') ||
                e.message?.includes('Cloudflare')
            )) {
                continue;
            }
            throw e;
        }
    }

    throw lastError || new Error(`Failed after ${maxRetries + 1} attempts`);
}

/**
 * Fetch JSON content from a URL
 */
export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`[AnimesUltra] Failed to parse JSON from ${url}`);
        throw e;
    }
}
