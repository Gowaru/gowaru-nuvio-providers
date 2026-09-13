/**
 * HTTP Utilities for Franime (franime.fr / api.franime.fr)
 *
 * Points clés (diagnostic live 2026-09) :
 *  - L'API https://api.franime.fr/api/ est ouverte (pas d'auth) mais Cloudflare
 *    exige un Referer franime.fr sur les endpoints de lecteurs.
 *  - Le catalogue /api/animes fait ~11 MB → dépasse la limite QuickJS de 1 MB,
 *    il ne doit JAMAIS être téléchargé (la recherche passe par Kitsu, même
 *    base d'IDs que franime).
 *  - Endpoints sûrs : /api/anime-seasons/{id}/{saison} (~10 KB) et
 *    /api/anime/{id}/{saison}/{ep}/{lang}/{index} (redirection watch2).
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const SITE = 'https://franime.fr';
export const API = 'https://api.franime.fr/api/';

// ⚠️ Cloudflare rejette le Referer racine (`https://franime.fr/` → 403)
// mais accepte tout autre chemin interne (vérifié live 2026-09) → on
// utilise toujours une page anime comme Referer.
export const SITE_REFERER = `${SITE}/anime/watch`;

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1"
};

// Headers pour l'API : le Referer franime.fr est requis par Cloudflare sur
// les endpoints de lecteurs (vérifié en live 2026-09 sans lui → 403 challenge).
export function apiHeaders(extra = {}) {
    return {
        ...HEADERS,
        "Accept": "application/json, text/plain, */*",
        "Referer": SITE_REFERER,
        "Origin": SITE,
        ...extra
    };
}

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    console.log(`[Franime] Fetching: ${url}`);
    const { headers: customHeaders, ...rest } = options;
    await rateLimit('api.franime.fr');
    const res = await safeFetch(url, { headers: { ...HEADERS, ...(customHeaders || {}) }, ...rest, signal });
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
}

export async function fetchJson(url, options = {}) {
    const raw = await fetchText(url, options);
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[Franime] JSON Parse Error: ${e.message}`);
        return null;
    }
}

/**
 * Fetch tolérant : renvoie null au lieu de throw en cas d'échec (404, CF...).
 * Utilisé pour les sondes (endpoint absent, anime absent du site).
 */
export async function fetchTextSafe(url, options = {}) {
    try {
        return await fetchText(url, options);
    } catch (e) {
        if (isAborted(options.signal || _currentSignal)) throw e;
        return null;
    }
}

/**
 * GET sur un endpoint de lecteur qui redirige (302) vers franime.fr/watch2/.
 * Retourne l'URL FINALE après redirection (response.url) — c'est là que le
 * serveur expose l'embed réel dans le paramètre &b= (décodé par l'extractor).
 * Renvoie null en cas d'échec.
 */
export async function fetchFinalUrl(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) return null;

    console.log(`[Franime] Lecteur: ${url}`);
    await rateLimit('api.franime.fr');
    try {
        const res = await safeFetch(url, {
            headers: { ...HEADERS, "Referer": SITE_REFERER, ...options.headers },
            redirect: 'follow',
            signal
        });
        if (!res) return null;
        const finalUrl = res.url || null;
        if (!finalUrl || finalUrl === url) return null;
        // ⚠️ On n'exige PAS res.ok : la page finale watch2 est souvent un
        // challenge Cloudflare (403) — seule l'URL FINALE nous intéresse,
        // car c'est elle qui contient l'embed réel dans le paramètre &b=.
        return finalUrl;
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}
