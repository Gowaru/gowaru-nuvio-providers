/**
 * HTTP Utilities for Frenchstream
 */

export const BASE_URLS = ['https://french-stream.one', 'https://fs03.lol'];
export const BASE_URL = BASE_URLS[0];

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
    'Connection': 'keep-alive'
};

function originFromUrl(url) {
    try {
        return new URL(url).origin;
    } catch (e) {
        return BASE_URL;
    }
}

export async function fetchText(url, options = {}) {
    console.log(`[Frenchstream] Fetching: ${url}`);
    const base = options.baseUrl || originFromUrl(url);
    const mergedHeaders = {
        ...HEADERS,
        Referer: `${base}/`,
        Origin: base,
        ...(options.headers || {})
    };

    const { baseUrl, headers, ...restOptions } = options;
    const response = await fetch(url, {
        headers: mergedHeaders,
        ...restOptions
    });

    if (!response.ok) {
        throw new Error(`HTTP error ${response.status} for ${url}`);
    }

    return await response.text();
}

export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`[Frenchstream] Failed to parse JSON for ${url}`);
        throw e;
    }
}