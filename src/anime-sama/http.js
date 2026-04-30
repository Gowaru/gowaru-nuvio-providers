/**
 * HTTP Utilities for Anime-Sama
 */

import { safeFetch } from '../utils/resolvers.js';

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
    console.log(`[Anime-Sama] Fetching: ${url}`);
    const timeoutMs = options.timeoutMs || 8000; // Default 8s for JS file fetches
    const res = await safeFetch(url, { headers: { ...HEADERS, ...(options.headers || {}) }, timeoutMs, ...options });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
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
