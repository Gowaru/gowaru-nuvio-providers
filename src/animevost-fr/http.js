/**
 * HTTP Utilities for AnimeVost-fr (animevost.fr — SPA Next.js).
 *
 * Endpoints utiles :
 *  - GET /api/anime/search?q=X&sort=recent  → { results: [{slug,title_romaji,…}] }
 *    (l'index q= est partiellement cassé côté serveur — ne compter que sur le
 *    fallback slug, le search est un plus)
 *  - GET /api/animes/{slug}                 → { anime, seasons:[{episodes:[…]}] }
 *  - GET /anime/{slug}/saison-{N}/episode-{M} (page HTML → iframe gupload)
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const BASE = 'https://animevost.fr';
const DOMAIN = 'animevost.fr';

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    Referer: `${BASE}/`,
};

/**
 * GET générique. Retourne le texte, ou null si non-OK/erreur.
 * Le JSON est parsé nous-mêmes avec garde (response.json() du runtime renvoie
 * null silencieusement en cas de JSON invalide).
 */
export async function fetchAny(pathOrUrl, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: aborted');

    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}`;
    await rateLimit(DOMAIN);
    try {
        const res = await safeFetch(url, {
            headers: { ...HEADERS, ...(options.headers || {}) },
            timeout: options.timeout ?? 12000,
            signal,
        });
        if (!res || !res.ok) return null;
        const text = await res.text();
        if (!text) return null;
        if (options.responseType === 'json') {
            try { return JSON.parse(text); } catch { return null; }
        }
        return text;
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}

export async function fetchJson(path, options = {}) {
    return fetchAny(path, { ...options, responseType: 'json' });
}

export async function fetchText(path, options = {}) {
    return fetchAny(path, { ...options, responseType: 'text' });
}
