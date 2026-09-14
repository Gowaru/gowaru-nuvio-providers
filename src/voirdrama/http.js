/**
 * HTTP Utilities for Voirdrama (voirdrama.to)
 *
 * Points clés (diagnostic live 2026-09) :
 *  - Site WordPress + thème Madara (moteur voiranime) — AUCUN challenge
 *    Cloudflare sur voirdrama.to (homepage, recherche, épisodes : 200 direct).
 *  - Recherche AJAX : POST /wp-admin/admin-ajax.php
 *    (action=wp-manga-search-manga) → JSON {success, data:[{title,url}]}.
 *  - Chaque page épisode embarque `var thisChapterSources = {...}` : la carte
 *    label → iframe HTML de tous les lecteurs. Aucune requête supplémentaire
 *    n'est nécessaire pour obtenir les embeds.
 *  - Lecteur principal : voembed.net (famille VidMoly → m3u8 en clair,
 *    couvert par resolveVidmoly du resolvers central).
 */

import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const SITE = 'https://voirdrama.to';
export const AJAX = `${SITE}/wp-admin/admin-ajax.php`;

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Upgrade-Insecure-Requests": "1"
};

/** Headers pour l'AJAX WordPress (form-encoded). */
export function ajaxHeaders(extra = {}) {
    return {
        ...HEADERS,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": `${SITE}/`,
        "X-Requested-With": "XMLHttpRequest",
        "Origin": SITE,
        ...extra
    };
}

/**
 * Détecte une page de blocage Cloudflare (réutilisée par les sondes).
 * Les pages de challenge sont petites (< 8 KB) avec des mots-clés précis.
 */
export function isCloudflareChallenge(text) {
    if (!text || text.length > 8000) return false;
    return (
        text.includes('Just a moment...') ||
        text.includes('cf-browser-verification') ||
        text.includes('challenge-form') ||
        text.includes('Attention Required') ||
        text.includes('cdn-cgi/challenge-platform')
    );
}

/**
 * GET HTML standard. Throw en cas d'échec (le caller décide).
 * Respecte le rate limiter et le signal d'annulation du runtime.
 */
export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    await rateLimit('voirdrama.to');
    const { headers: customHeaders, retries = 1, ...rest } = options;
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await safeFetch(url, {
                headers: { ...HEADERS, ...(customHeaders || {}) },
                redirect: 'follow',
                ...rest,
                signal
            });
            if (!res || !res.ok) {
                const status = res && typeof res.status === 'number' ? res.status : 'no-response';
                throw new Error(`HTTP error ${status} for ${url}`);
            }
            return await res.text();
        } catch (e) {
            if (isAborted(signal)) throw e;
            lastErr = e;
            if (attempt < retries) await sleep(700 * (attempt + 1));
        }
    }
    throw lastErr;
}

/**
 * GET tolérant : renvoie null au lieu de throw (404, CF, réseau...).
 * Utilisé pour les sondes de slugs (séries absentes du site).
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
 * POST form-encoded vers l'AJAX Madara. Retourne l'objet JSON parsé ou null.
 * response.json() du runtime renvoie null silencieusement en cas d'échec de
 * parse → on passe par le texte et on parse explicitement.
 */
export async function postAjax(body, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) return null;

    await rateLimit('voirdrama.to');
    try {
        const res = await safeFetch(AJAX, {
            method: 'POST',
            headers: ajaxHeaders(options.headers || {}),
            body,
            redirect: 'follow',
            signal
        });
        if (!res || !res.ok) return null;
        const raw = await res.text();
        if (!raw || raw.length > 1048576) return null;
        try { return JSON.parse(raw); } catch { return null; }
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}
