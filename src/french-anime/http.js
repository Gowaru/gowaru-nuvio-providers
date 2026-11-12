/**
 * HTTP Utilities for French-Anime.
 *
 * Deux canaux :
 *  1. DIRECT — french-anime.com (site DLE réel, /animes-vf/{id}-{slug}.html).
 *     Derrière Cloudflare managed challenge : bloqué depuis les IP datacenter,
 *     mais les IP résidentielles (réseau de l'app) passent généralement.
 *  2. FALLBACK — coflix.wiki (API AJAX du thème, sans challenge), qui porte
 *     une grande partie du même catalogue. Utilisé quand le canal direct
 *     renvoie un challenge CF.
 *
 * Architecture coflix (voir aussi src/coflix/http.js) :
 *   recherche  → GET /ajax/search/suggest?keyword={q}
 *   épisodes   → GET /ajax/episode/list-episode?movieId={id}
 *   embeds     → POST /ajax/episode/player?episode_id={id}
 *   (headers X-Requested-With + Referer requis)
 */

import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

/** Canal DIRECT : site DLE réel. */
export const FA_SITE = 'https://french-anime.com';

/**
 * Canal FALLBACK : backend réel du catalogue (cf. diagnostic 2026-09).
 *
 * DIAG 2026-11 : coflix.wiki renvoie **301 → https://coflix.gold/** ; comme le
 * 301 renvoie vers la RACINE (pas vers le chemin demandé), tous les appels
 * `/ajax/...` recevaient le HTML de la home → JSON.parse échouait → 0 stream
 * sur tout le catalogue. Le domaine tourne régulièrement : on résout le
 * domaine vivant une fois par exécution (sonde JSON sur /ajax/search/suggest).
 */
const SITE_CANDIDATES = ['https://coflix.gold', 'https://coflix.wiki'];
export let SITE = SITE_CANDIDATES[0];

let _siteReady = null;
export async function ensureSite() {
    if (_siteReady) return _siteReady;
    _siteReady = (async () => {
        for (const base of SITE_CANDIDATES) {
            try {
                const res = await safeFetch(`${base}/ajax/search/suggest?keyword=test`, {
                    headers: { ...HEADERS, ...ajaxHeaders() },
                    timeout: 8000,
                    redirect: 'follow',
                });
                if (!res || !res.ok) continue;
                const text = await res.text().catch(() => '');
                // Un domaine mort/parqué renvoie du HTML : seule une réponse
                // JSON prouve que les routes /ajax/ sont servies.
                if (!text || text.trim()[0] !== '{') continue;
                SITE = base;
                console.log(`[FrenchAnime] Domaine coflix actif : ${base}`);
                return;
            } catch (e) { /* candidat suivant */ }
        }
        console.warn('[FrenchAnime] Aucun domaine coflix ne répond en JSON');
    })();
    return _siteReady;
}

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
};

/** Headers AJAX coflix (X-Requested-With requis par le thème). */
export function ajaxHeaders(extra = {}) {
    return {
        ...HEADERS,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': `${SITE}/`,
        'X-Requested-With': 'XMLHttpRequest',
        ...extra
    };
}

/** Détecte une page de blocage (Cloudflare managed challenge / BotBlocker). */
export function isBlockPage(text) {
    if (!text) return false;
    return (
        text.includes('Just a moment') ||
        text.includes('cf-browser-verification') ||
        text.includes('Attention Required') ||
        text.includes('BotBlocker')
    );
}

// ─── Canal DIRECT (french-anime.com) ────────────────────────────────────────

async function rawFetch(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');
    await rateLimit('french-anime.com');
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

/**
 * GET HTML sur french-anime.com. Throw en cas d'échec/blocage.
 * L'appelant distingue le challenge CF via l'erreur `blocked: true`.
 */
export async function fetchFaText(url, options = {}) {
    for (let attempt = 0; attempt <= 1; attempt++) {
        let res = null;
        try {
            res = await rawFetch(url, options);
            if (!res) throw new Error(`no-response for ${url}`);
            if (res.status === 403 || res.status === 503) {
                const err = new Error(`Blocked (CF) for ${url}`);
                err.blocked = true;
                throw err;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
            const text = await res.text();
            if (isBlockPage(text)) {
                const err = new Error(`Blocked (CF page) for ${url}`);
                err.blocked = true;
                throw err;
            }
            return text;
        } catch (e) {
            if (isAborted(options.signal || _currentSignal)) throw e;
            if (e.blocked) throw e; // pas de retry sur un challenge
            if (attempt < 1) await sleep(800);
            else throw e;
        }
    }
    return null;
}

// ─── Canal FALLBACK (coflix.wiki AJAX) ──────────────────────────────────────

/** GET HTML tolérant : null au lieu de throw (sondes de slugs). */
export async function fetchTextSafe(url, options = {}) {
    try { return await fetchFaText(url, options); }
    catch (e) {
        if (isAborted(options.signal || _currentSignal)) throw e;
        return null;
    }
}

/** GET JSON d'une route /ajax/ coflix. null si échec. */
export async function ajaxGet(path, options = {}) {
    try {
        await ensureSite();
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

/** POST d'une route /ajax/ coflix (ex: /ajax/episode/player). null si échec. */
export async function ajaxPost(path, body, options = {}) {
    try {
        await ensureSite();
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
