/**
 * HTTP Utilities for Movix
 */

const PROXY_URL = 'https://proxy.gowaru.app/';

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
    const proxiedUrl = PROXY_URL + url;
    console.log(`[Movix] Fetching (proxied): ${url}`);

    try {
        const response = await fetch(proxiedUrl, {
            headers: {
                ...HEADERS,
                ...options.headers
            }
        });

        if (!response.ok) {
            console.log(`[Movix] HTTP ${response.status} for ${url} (via proxy)`);
            return null;
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.log(`[Movix] JSON parse error for ${url}. Content length: ${text.length}`);
            return null;
        }
    } catch (e) {
        console.log(`[Movix] Fetch error for ${url}: ${e.message}`);
        return null;
    }
}
