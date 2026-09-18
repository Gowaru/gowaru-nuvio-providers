/**
 * HTTP Utilities for VoirAnime.one (voiranime.one — SPA Next.js/RSC).
 *
 * Points clés (diagnostic live 2026-09) :
 *  - Aucun challenge Cloudflare en accès direct (IP datacenter OK) ;
 *  - GET /api/anime/search?q=&langue=&type=&page=  → { animes:[…], total, totalPages }
 *    avec title/titleFrench/titleEnglish/titleOriginal/titleJp/synonyms,
 *    malId, type ("TV"|"Film"|"OVA"|"Spécial"), seasons, langues ;
 *  - Fiches /{slug} : payload RSC (self.__next_f.push) contenant
 *    seasons:[{number,episodes:[{number,released,langues:[…]}]}] ;
 *  - Pages épisode /{slug}/{saison}/{VF|VOSTFR}/{ep} (films : /{slug}/film/{LANG}/1)
 *    avec une iframe /embed/{cuid} → iframe externe (vidmoly, sibnet…).
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const BASE = 'https://voiranime.one';
const DOMAIN = 'voiranime.one';

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    Referer: `${BASE}/`,
};

/**
 * GET générique. Retourne le texte, ou null si non-OK/erreur/timeout.
 * Le JSON est parsé nous-mêmes avec garde (response.json() du runtime
 * renvoie null silencieusement en cas de JSON invalide).
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
        if (e && String(e.message || e).includes('AbortError')) throw e;
        return null;
    }
}

export const fetchText = (path, opts = {}) => fetchAny(path, { ...opts, responseType: 'text' });
export const fetchJson = (path, opts = {}) => fetchAny(path, { ...opts, responseType: 'json' });
