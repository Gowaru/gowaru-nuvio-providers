import { safeFetch } from '../utils/resolvers.js';

export const BASE_URL = "https://animesite.fr";
export const TIMEOUT = 25000;
export const GLOBAL_TIMEOUT = 90000;

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://animesite.fr/",
};

export async function fetchText(url, options = {}) {
    console.log(`[AnimeSite] Fetching: ${url}`);
    const res = await safeFetch(url, { headers: { ...HEADERS, ...(options.headers || {}) }, ...options });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
}

export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`[AnimeSite] Failed to parse JSON from ${url}`);
        throw e;
    }
}
