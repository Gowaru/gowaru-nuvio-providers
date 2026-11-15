/**
 * HTTP Utilities for VoirAnime.one (moteur Next.js/RSC "Anisama").
 *
 * ⚠ Diagnostic live 2026-11 : `voiranime.one` et son clone `anisama.org` ont
 * une délégation DNS cassée ("No Reachable Authority at delegation") → plus
 * aucune requête n'aboutit, quel que soit le titre demandé. Le moteur change
 * de domaine en permanence (nomadisme Arcom) : on ne code donc plus l'hôte en
 * dur. `resolveBase()` sonde les domaines connus en parallèle (1 GET chacun,
 * réponse JSON `{ animes: [...] }` exigée) et mémorise le premier vivant.
 * Si aucun ne répond, le provider rend 0 stream en ~6 s au lieu de brûler le
 * budget de 60 s de l'app en 404/ENOTFOUND.
 *
 * Chaîne validée quand un domaine est vivant :
 *  - GET /api/anime/search?q=&langue=&type=&page=  → { animes:[…], total, totalPages }
 *  - Fiches /{slug} : payload RSC (self.__next_f.push) contenant
 *    seasons:[{number,episodes:[{number,released,langues:[…]}]}]
 *  - Pages épisode /{slug}/{saison}/{VF|VOSTFR}/{ep} (films : /{slug}/film/{LANG}/1)
 *    avec une iframe /embed/{cuid} → iframe externe (vidmoly, sibnet…).
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

/**
 * Domaines connus du moteur (du plus récent au plus ancien). L'ordre sert de
 * priorité quand plusieurs répondent. Ajouter ici un nouveau miroir suffit.
 */
export const CANDIDATE_HOSTS = [
    'voiranime.one',
    'anisama.org',
    'anisama.net',
    'voiranime.lol',
];

export const BASE = `https://${CANDIDATE_HOSTS[0]}`;
const DOMAIN = CANDIDATE_HOSTS[0];

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    Referer: `${BASE}/`,
};

let _basePromise = null;
let _resolvedBase = null;

/** Hôte réellement utilisable (ou le domaine historique par défaut). */
export function getBase() {
    return _resolvedBase || BASE;
}

/** Vrai si un domaine du moteur a répondu à la sonde. */
export function isBaseAlive() {
    return !!_resolvedBase;
}

async function probeHost(host, signal) {
    try {
        const res = await safeFetch(`https://${host}/api/anime/search?q=a&page=1`, {
            headers: { ...HEADERS, Referer: `https://${host}/` },
            timeout: 6000,
            signal,
        });
        if (!res || !res.ok) return null;
        const text = await res.text();
        if (!text || text.charAt(0) !== '{') return null;
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.animes)) return null;
        return `https://${host}`;
    } catch (e) {
        if (e && String(e.message || e).includes('AbortError')) throw e;
        return null;
    }
}

/**
 * Résout le domaine vivant du moteur (mémoïsé pour le run).
 * Les sondes partent en parallèle ; le premier succès dans l'ordre de
 * CANDIDATE_HOSTS gagne. Retourne null si aucun domaine ne répond.
 */
export function resolveBase(signal = _currentSignal) {
    if (_resolvedBase) return Promise.resolve(_resolvedBase);
    if (_basePromise) return _basePromise;
    _basePromise = (async () => {
        if (isAborted(signal)) return null;
        const results = await Promise.allSettled(
            CANDIDATE_HOSTS.map(host => probeHost(host, signal)),
        );
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
                _resolvedBase = r.value;
                console.log(`[VoirAnimeOne] domaine actif : ${r.value}`);
                return _resolvedBase;
            }
        }
        console.warn(`[VoirAnimeOne] aucun domaine du moteur ne répond (${CANDIDATE_HOSTS.join(', ')})`);
        return null;
    })();
    return _basePromise;
}

/**
 * GET générique. Retourne le texte, ou null si non-OK/erreur/timeout.
 * Le JSON est parsé nous-mêmes avec garde (response.json() du runtime
 * renvoie null silencieusement en cas de JSON invalide).
 */
export async function fetchAny(pathOrUrl, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: aborted');

    const base = getBase();
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${base}${pathOrUrl}`;
    await rateLimit(DOMAIN);
    try {
        const res = await safeFetch(url, {
            headers: { ...HEADERS, Referer: `${base}/`, ...(options.headers || {}) },
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
