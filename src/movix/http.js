/**
 * HTTP Utilities for Movix
 */

import { safeFetch } from '../utils/resolvers.js';

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Origin": "https://movix.cash",
    "Referer": "https://movix.cash/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "DNT": "1"
};

export async function fetchJson(url, options = {}) {
    console.log(`[Movix] Fetching: ${url}`);

    try {
        const res = await safeFetch(url, { headers: { ...HEADERS, ...(options.headers || {}) }, ...options });
        if (!res || !res.ok) {
            const status = res && typeof res.status === 'number' ? res.status : 'no-response';
            console.log(`[Movix] HTTP ${status} for ${url}`);
            return null;
        }

        try {
            return await res.json();
        } catch (e) {
            const txt = await res.text();
            console.log(`[Movix] JSON parse error for ${url}. Content length: ${String(txt && txt.length)}`);
            return null;
        }
    } catch (e) {
        console.log(`[Movix] Fetch error for ${url}: ${e.message}`);
        return null;
    }
}
