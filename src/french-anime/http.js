/**
 * HTTP Utilities for French-Anime.
 *
 * Le contenu de french-anime (.com CF-challengé, .fr vitrine) est servi par
 * coflix.wiki → on réutilise exactement la chaîne HTTP coflix (API AJAX du
 * thème, sans challenge, headers X-Requested-With + Referer requis).
 * Voir src/coflix/http.js pour le détail de l'architecture du site.
 */

import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const SITE = 'https://coflix.wiki';

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
};

/** Headers AJAX (X-Requested-With requis par le thème). */
export function ajaxHeaders(extra = {}) {
    return {
        ...HEADERS,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': `${SITE}/`,
        'X-Requested-With': 'XMLHttpRequest',
        ...extra
    };
}

/** Détecte une page de blocage (BotBlocker/Cloudflare). */
export function isBlockPage(text) {
    if (!text) return false;
    return (
        text.includes('BotBlocker') ||
        text.includes('Just a moment') ||
        text.includes('cf-browser-verification') ||
        text.includes('Attention Required')
    );
}

async function rawFetch(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');
    await rateLimit('coflix.wiki');
    const { headers, method, body, timeout } = options;
    return safeFetch(url, {
        headers: headers || HEADERS,
        method: method || 'GET',
        ...(body ? { body } : {}),
        timeout: timeout || 12000,
        redirect: 'follow',
        signal,
    });
}

/** GET HTML. Throw en cas d'échec/blocage. */
export async function fetchText(url, options = {}) {
    for (let attempt = 0; attempt <= 1; attempt++) {
        try {
            const res = await rawFetch(url, options);
            if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : 'no-response'} for ${url}`);
            const text = await res.text();
            if (isBlockPage(text)) throw new Error(`Blocked (BotBlocker/CF) for ${url}`);
            return text;
        } catch (e) {
            if (isAborted(options.signal || _currentSignal)) throw e;
            if (attempt < 1) await sleep(800);
            else throw e;
        }
    }
    return null;
}

/** GET tolérant : null au lieu de throw (sondes de slugs). */
export async function fetchTextSafe(url, options = {}) {
    try { return await fetchText(url, options); }
    catch (e) {
        if (isAborted(options.signal || _currentSignal)) throw e;
        return null;
    }
}

/** GET JSON d'une route /ajax/. null si échec. */
export async function ajaxGet(path, options = {}) {
    try {
        const res = await rawFetch(`${SITE}${path}`, { ...options, headers: ajaxHeaders(options.headers) });
        if (!res || !res.ok) return null;
        const text = await res.text();
        if (!text || text.length > 1048576) return null;
        try { return JSON.parse(text); } catch { return null; }
    } catch (e) {
        if (isAborted(options.signal || _currentSignal)) throw e;
        return null;
    }
}

/** POST d'une route /ajax/ (ex: /ajax/episode/player). null si échec. */
export async function ajaxPost(path, body, options = {}) {
    try {
        const res = await rawFetch(`${SITE}${path}`, {
            ...options,
            method: 'POST',
            body: typeof body === 'string' ? body : new URLSearchParams(body).toString(),
            headers: { ...ajaxHeaders(options.headers), 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (!res || !res.ok) return null;
        const text = await res.text();
        if (!text || text.length > 1048576) return null;
        try { return JSON.parse(text); } catch { return null; }
    } catch (e) {
        if (isAborted(options.signal || _currentSignal)) throw e;
        return null;
    }
}
