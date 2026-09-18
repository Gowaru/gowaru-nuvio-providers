/**
 * HTTP Utilities for VoiranimeBE (voiranime.be)
 * Site WordPress (thème dramastream) : pages épisodes publiques + sitemaps.
 */

import { safeFetch, createProviderRateLimiter, isAborted, USER_AGENT } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const rateLimit = createProviderRateLimiter(350, 0.3);
const DOMAIN = 'voiranime.be';

export const HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    "Referer": "https://voiranime.be/",
};

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    const { headers: customHeaders, ...rest } = options;
    await rateLimit(DOMAIN);
    const res = await safeFetch(url, {
        ...rest,
        headers: { ...HEADERS, ...(customHeaders || {}) },
        signal,
    });
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
        return null; // QuickJS : response.json() peut renvoyer null — garde symétrique
    }
}
