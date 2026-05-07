/**
 * HTTP Utilities for Movix
 * Dynamic domain support - récupère le domaine actuel depuis GitHub
 */

import { safeFetch, USER_AGENT } from '../utils/resolvers.js';

const DOMAINS_URLS = [
    'https://raw.githubusercontent.com/yoruix/nuvio-providers/main/domains.json',
    'https://raw.githubusercontent.com/phisher98/phisher-nuvio-providers/main/domains.json'
];

const FALLBACK_DOMAINS = ['cash', 'rip', 'site', 'io', 'co'];

let _cachedDomain = null;
let _cachedApiBase = null;

export async function detectDomain() {
    if (_cachedApiBase) {
        console.log('[Movix] Using cached domain: ' + _cachedApiBase);
        return _cachedApiBase;
    }

    console.log('[Movix] Detecting current domain...');

    for (const domainsUrl of DOMAINS_URLS) {
        try {
            const res = await safeFetch(domainsUrl, {
                timeoutMs: 8000,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/json'
                }
            });

            if (res && res.ok) {
                const data = await res.json();
                const domain = data?.movix;
                
                if (domain) {
                    console.log('[Movix] Domain from GitHub: movix.' + domain);
                    _cachedDomain = domain;
                    _cachedApiBase = 'https://api.movix.' + domain;
                    return _cachedApiBase;
                }
            }
        } catch (e) {
            console.log('[Movix] Failed to fetch domains from: ' + domainsUrl);
        }
    }

    console.log('[Movix] Falling back to default domain');
    _cachedDomain = 'cash';
    _cachedApiBase = 'https://api.movix.cash';
    return _cachedApiBase;
}

export function getBaseUrl() {
    return _cachedDomain ? 'https://movix.' + _cachedDomain : 'https://movix.cash';
}

export function getApiBase() {
    return _cachedApiBase || 'https://api.movix.cash';
}

export async function getHeaders() {
    const baseUrl = getBaseUrl();
    return {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'DNT': '1',
        'Referer': baseUrl + '/',
        'Origin': baseUrl
    };
}

export async function fetchJson(url, options = {}) {
    console.log(`[Movix] Fetching: ${url}`);

    const headers = await getHeaders();

    try {
        const { headers: optHeaders, ...restOptions } = options || {};
        const res = await safeFetch(url, {
            ...restOptions,
            headers: { ...headers, ...(optHeaders || {}) }
        });
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

export async function fetchWithDomainFallback(url, pathTemplate, tmdbId, mediaType, season, episode) {
    const apiBase = await detectDomain();
    const urlToTry = url || pathTemplate
        .replace('{apiBase}', apiBase)
        .replace('{tmdbId}', String(tmdbId))
        .replace('{mediaType}', mediaType)
        .replace('{season}', String(season || 1))
        .replace('{episode}', String(episode || 1));

    return fetchJson(urlToTry);
}

export async function tryAllapis(pathTemplates, tmdbId, mediaType, season, episode) {
    const apiBase = await detectDomain();

    for (const path of pathTemplates) {
        const url = path
            .replace('{apiBase}', apiBase)
            .replace('{tmdbId}', String(tmdbId))
            .replace('{mediaType}', mediaType)
            .replace('{season}', String(season || 1))
            .replace('{episode}', String(episode || 1));

        console.log('[Movix] Trying: ' + url);
        const data = await fetchJson(url);

        if (data && (data.success || data.sources || data.players || data.links)) {
            console.log('[Movix] Got data from: ' + url);
            return data;
        }
    }

    return null;
}