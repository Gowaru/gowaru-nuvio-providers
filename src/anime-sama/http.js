/**
 * HTTP Utilities for Anime-Sama — front `animes-sama.fr` (diag live 2026-11).
 *
 * Pourquoi ce fichier a été réécrit : l'ancien site (`anime-sama.to`) n'expose
 * plus `/catalogue/{slug}/{saison}/{lang}/episodes.js` (404 sur tout le
 * catalogue, One Piece compris) → le provider rendait 0 stream partout.
 *
 * Chaîne du nouveau front (vérifiée en live) :
 *  1. GET  /catalogue/{slug}                     (fiche, pose PHPSESSID)
 *  2. GET  /catalogue/{slug}/{saison}/{lang}     (inline `window.__PROFILE`
 *     avec le jeton csrf, `window.__EPISODE_NUMBERS` et `var epsN = [...]`)
 *  3. POST /api/player/sign/{slug}/{saison}/{lang}
 *     corps JSON {ep, lecteur} + en-tête X-CSRF-Token + COOKIE de session
 *     → { ok: true, url: "/player/…?…&sig=…" }  (URL signée, valable 1 h)
 *  4. GET  {url signée} → 302 /player/embed?t=… → 302 {embed hébergeur}
 *  5. L'embed (sibnet, vidmoly, sendvid…) est ensuite passé à resolveStream.
 *
 * Le cookie EST obligatoire : sans lui le sign renvoie 419 {"error":"csrf"}.
 */

import { safeFetch, isAborted, createProviderRateLimiter } from '../utils/resolvers.js';

const DOMAIN = 'animes-sama.fr';
export const BASE_URL = `https://${DOMAIN}`;

const rateLimit = createProviderRateLimiter();
let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Cookie de session (PHPSESSID). Une instance QuickJS par run : ce jar ne
// vit que le temps d'une exécution, ce qui suffit (page + sign + player).
let cookieLine = '';

function absorbCookies(res) {
    try {
        const raw = res?.headers?.get?.('set-cookie') || res?.headers?.get?.('Set-Cookie') || '';
        if (!raw) return;
        for (const seg of String(raw).split(/,(?=[^;]+?=)/)) {
            const kv = seg.split(';')[0].trim();
            if (!kv || kv.indexOf('=') === -1) continue;
            const name = kv.split('=')[0];
            const rest = cookieLine.split('; ').filter((c) => c && c.split('=')[0] !== name);
            rest.push(kv);
            cookieLine = rest.join('; ');
        }
    } catch (e) { /* set-cookie masqué par le runtime : on continue sans */ }
}

function withSession(extra) {
    const headers = { ...HEADERS, ...(extra || {}) };
    if (cookieLine) headers.Cookie = cookieLine;
    return headers;
}

function timeoutFor(options, fallback) {
    const ms = options && options.timeout;
    return ms > 0 ? ms : fallback;
}

/**
 * GET d'une page HTML du site (cookie absorbé au passage).
 * @returns {Promise<string|null>} HTML, ou null si non-OK/erreur.
 */
export async function fetchPage(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');
    await rateLimit(DOMAIN);
    try {
        const res = await safeFetch(url, {
            headers: withSession(options.headers),
            timeout: timeoutFor(options, 12000),
            signal,
        });
        if (!res || !res.ok) {
            console.log(`[Anime-Sama] fetchPage ${res ? res.status : 'no-response'} ${url}`);
            return null;
        }
        absorbCookies(res);
        return await res.text();
    } catch (e) {
        if (isAborted(signal)) throw e;
        console.log(`[Anime-Sama] fetchPage error: ${e.message}`);
        return null;
    }
}

/** Ouvre une session (cookie PHPSESSID) avant les appels à l'API de signature. */
export async function ensureSession(signal) {
    if (cookieLine) return cookieLine;
    await fetchPage(`${BASE_URL}/`, { signal, timeout: 12000 });
    return cookieLine;
}

/** Recherche AJAX : POST /ajax/search.php {query} → fragment HTML. */
export async function searchHtml(query, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');
    await rateLimit(DOMAIN);
    try {
        const res = await safeFetch(`${BASE_URL}/ajax/search.php`, {
            method: 'POST',
            headers: withSession({
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': BASE_URL,
                'Referer': `${BASE_URL}/`,
                'Accept': 'text/html, */*; q=0.01',
            }),
            body: `query=${encodeURIComponent(query)}`,
            timeout: timeoutFor(options, 10000),
            signal,
        });
        if (!res || !res.ok) return null;
        absorbCookies(res);
        return await res.text();
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}

/**
 * Demande une URL de lecteur signée pour (épisode, lecteur).
 * @param {string} seasonPath  ex. "one-piece/saison1/vostfr"
 * @param {number} ep          numéro d'épisode affiché par le site
 * @param {number} lecteur     1-based (eps1, eps2…)
 * @param {string} csrf        jeton `window.__PROFILE.csrf` de la page saison
 * @returns {Promise<string|null>} URL absolue signée, ou null.
 */
export async function signPlayer(seasonPath, ep, lecteur, csrf, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal) || !csrf) return null;
    await rateLimit(DOMAIN);
    try {
        const res = await safeFetch(`${BASE_URL}/api/player/sign/${seasonPath}`, {
            method: 'POST',
            headers: withSession({
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf,
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': BASE_URL,
                'Referer': `${BASE_URL}/catalogue/${seasonPath}/`,
                'Accept': 'application/json, text/plain, */*',
            }),
            body: JSON.stringify({ ep, lecteur }),
            timeout: timeoutFor(options, 10000),
            signal,
        });
        if (!res || !res.ok) {
            console.log(`[Anime-Sama] sign ${res ? res.status : 'no-response'} (ep ${ep}, lecteur ${lecteur})`);
            return null;
        }
        absorbCookies(res);
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { return null; }
        if (!json || !json.ok || !json.url) return null;
        return json.url.startsWith('http') ? json.url : BASE_URL + json.url;
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}

/**
 * Suit une chaîne de redirections 302 jusqu'à l'embed hébergeur final
 * (URL signée → /player/embed?t=… → https://{hébergeur}/embed-…).
 * @returns {Promise<string|null>} URL externe, ou null si aucune redirection.
 */
/**
 * Titre annoncé par la page d'embed hébergeur (« DBZ Bardock VOSTFR »,
 * « One Piece S01E01 VOSTFR »…). Sert de garde pour les FILMS, dont la page
 * `/film` du site n'indique jamais le nom : sans ce contrôle on servirait
 * l'épisode 1 de la série à la place du film.
 * @returns {Promise<string>} titre (chaîne vide si absent/illisible)
 */
export async function fetchEmbedTitle(embedUrl, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal) || !embedUrl) return '';
    await rateLimit(DOMAIN);
    try {
        const res = await fetch(embedUrl, {
            headers: { ...HEADERS, Referer: `${BASE_URL}/`, Accept: 'text/html,*/*' },
            signal,
        });
        if (!res || !res.ok) return '';
        const html = await res.text();
        const og = (html.match(/property=["']og:title["']\s+content=["']([^"']+)/i) || [])[1];
        if (og) return og.trim();
        const t = (html.match(/<title[^>]*>([^<]{2,200})<\/title>/i) || [])[1];
        return (t || '').replace(/\s+/g, ' ').trim();
    } catch (e) {
        if (isAborted(signal)) throw e;
        return '';
    }
}

/**
 * Part d'une URL de lecteur signée et rend l'embed HÉBERGEUR final.
 *
 * Deux formes observées en live pour l'URL signée :
 *  - 302 direct vers `/player/embed?t=…` puis vers l'hébergeur (sibnet…) ;
 *  - 200 : page « Lecteur Anime-Sama » (player maison) qui expose le vrai
 *    embed dans `data-fallback-url` → 302 vers l'hébergeur (ansembed,
 *    oneupload, sendvid…). On ne sert PAS le player maison : son HLS proxifié
 *    (`/player/media?t=…`) exige le cookie de session à chaque segment, donc
 *    illisible hors de ce contexte.
 *
 * ⚠ safeFetch force `redirect: 'follow'` : impossible d'observer les 302. On
 * utilise donc fetch brut, comme le provider animesite pour ses jetons.
 *
 * @returns {Promise<string|null>} URL de l'embed hébergeur, ou null.
 */
export async function resolveEmbed(signedUrl, options = {}) {
    const signal = options.signal || _currentSignal;
    let current = signedUrl;
    for (let hop = 0; hop < 4; hop++) {
        if (isAborted(signal)) return null;
        await rateLimit(DOMAIN);
        let res = null;
        try {
            res = await fetch(current, {
                headers: withSession({ Referer: `${BASE_URL}/`, Accept: 'text/html,*/*' }),
                redirect: 'manual',
                signal,
            });
        } catch (e) {
            if (isAborted(signal)) throw e;
            return null;
        }
        if (!res) return null;
        absorbCookies(res);
        const location = res.headers?.get?.('location') || res.headers?.get?.('Location') || '';
        if (location) {
            const next = location.startsWith('http') ? location : BASE_URL + location;
            if (!next.includes(`${DOMAIN}/`)) return next;
            current = next;
            continue;
        }
        // Page interne du player : le vrai embed est dans data-fallback-url.
        let html = '';
        try { html = await res.text(); } catch (e) { return null; }
        const fallback = (html.match(/data-fallback-url="([^"]+)"/) || [])[1];
        if (!fallback) return null;
        current = fallback.startsWith('http') ? fallback : BASE_URL + fallback;
    }
    return null;
}
