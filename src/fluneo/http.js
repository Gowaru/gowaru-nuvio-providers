/**
 * HTTP Utilities for Fluneo (myfluneo.eu)
 *
 * Points clés (diagnostic live 2026-09) :
 *  - Site Next.js (App Router) derrière Cloudflare. Selon l'IP/période, TOUT
 *    le domaine peut être derrière un challenge managé ("Just a moment...",
 *    cf-mitigated: challenge) — vérifié live : 403 sur /, /anime/*, /api/*.
 *    Les snapshots d'archives montrent des 200 la plupart du temps → le
 *    challenge varie (probablement par IP) : le trafic app (résidentiel)
 *    passe généralement.
 *  - Les données d'épisodes sont INLINE dans le payload RSC de la page
 *    /anime/{slug} (embeds par lecteur dans `embeds_json`) → pas d'API à
 *    appeler pour l'extraction.
 *  - Lecteurs constatés : "LECTEUR myTV" (vidmoly), "LECTEUR VOE" (voe.sx),
 *    "LECTEUR Stape" (streamtape) — tous routés par resolveStream.
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const SITE = 'https://myfluneo.eu';

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1"
};

/**
 * Détecte une page challenge Cloudflare (403 "Just a moment...").
 * Renvoie true si le HTML (ou le statut) correspond au challenge.
 */
export function isCloudflareChallenge(status, html) {
    if (status === 403 || status === 503) {
        if (!html) return true; // 403 sans corps lisible → probablement CF
        if (/Just a moment/i.test(html)) return true;
        if (/cf-mitigated|challenge-platform/i.test(html)) return true;
    }
    return false;
}

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    await rateLimit('myfluneo.eu');
    const res = await safeFetch(url, {
        headers: { ...HEADERS, ...(options.headers || {}) },
        redirect: 'follow',
        signal
    });
    if (!res) throw new Error(`HTTP error no-response for ${url}`);
    const html = await res.text();
    if (isCloudflareChallenge(res.status, html)) {
        const err = new Error(`Cloudflare challenge active (${res.status}) pour ${url}`);
        err.isChallenge = true;
        throw err;
    }
    if (!res.ok) throw new Error(`HTTP error ${res.status} for ${url}`);
    return html;
}

/**
 * Fetch tolérant : renvoie null au lieu de throw (404, challenge, réseau).
 * isChallenge est renseigné via le 3ᵉ élément [html, status, isChallenge].
 */
export async function fetchPage(url, options = {}) {
    try {
        const html = await fetchText(url, options);
        return [html, 200, false];
    } catch (e) {
        if (isAborted(options.signal || _currentSignal)) throw e;
        return [null, e.isChallenge ? 403 : 0, !!e.isChallenge];
    }
}
