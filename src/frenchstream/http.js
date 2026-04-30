/**
 * HTTP Utilities for Frenchstream
 */

import { safeFetch, USER_AGENT } from '../utils/resolvers.js';

export const BASE_URLS = ['https://french-stream.one', 'https://fs03.lol'];
export const BASE_URL = BASE_URLS[0];

export const HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
    'Connection': 'keep-alive'
};

function originFromUrl(url) {
    if (!url || typeof url !== 'string') return BASE_URL;
    const match = url.match(/^(https?:\/\/[^\/]+)/);
    return match ? match[1] : BASE_URL;
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
    const res = await safeFetch(url, { headers: mergedHeaders, ...restOptions });
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
        console.error(`[Frenchstream] Failed to parse JSON for ${url}`);
        throw e;
    }
}