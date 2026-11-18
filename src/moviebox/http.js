/**
 * Couche HTTP Moviebox : signatures de l'API mobile + BFF web.
 *
 * Deux surfaces très différentes :
 *  - API mobile (`MOBILE_HOSTS`) : requêtes signées (HMAC-MD5), token Bearer
 *    obligatoire, seule à savoir chercher un titre ;
 *  - BFF web (`H5_BASE`) : pas de signature, mais un Referer du domaine
 *    player est nécessaire pour que `/subject/play` renvoie des flux.
 */

import { safeFetch, isAborted } from '../utils/resolvers.js';
import {
    MOBILE_HOSTS,
    H5_BASE,
    SITE_HOST,
    SITE_ORIGIN,
    MOBILE_SECRET_B64,
    MOBILE_UA,
    MOBILE_VERSION_NAME,
    MOBILE_VERSION_CODE,
    WEB_UA,
    REQUEST_LANG,
    JSON_ACCEPT,
    JSON_CT,
    JSON_CT_CHARSET,
} from './config.js';

// ─── Crypto ──────────────────────────────────────────────────────────────────
// Node (tests locaux) : `crypto`. QuickJS : `crypto-js` (global injecté).
let _nodeCrypto = null;
try { _nodeCrypto = require('crypto'); } catch (_) { _nodeCrypto = null; }

let _cjs = undefined;
function cryptoJs() {
    if (_cjs !== undefined) return _cjs;
    _cjs = null;
    try {
        if (typeof CryptoJS !== 'undefined' && CryptoJS) { _cjs = CryptoJS; return _cjs; }
    } catch (_) {}
    try { _cjs = require('crypto-js'); } catch (_) { _cjs = null; }
    return _cjs;
}

/** Longueur en OCTETS UTF-8 (sans TextEncoder, absent de NuvioTV). */
function utf8Length(str) {
    let n = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
        else n += 3;
    }
    return n;
}

function md5Hex(str) {
    if (_nodeCrypto) return _nodeCrypto.createHash('md5').update(str, 'utf8').digest('hex');
    const C = cryptoJs();
    if (!C) throw new Error('CryptoJS indisponible (MD5)');
    return C.MD5(str).toString();
}

function hmacMd5Base64(message) {
    const secretB64 = MOBILE_SECRET_B64;
    if (_nodeCrypto) {
        const key = Buffer.from(secretB64, 'base64');
        return _nodeCrypto.createHmac('md5', key).update(message, 'utf8').digest('base64');
    }
    const C = cryptoJs();
    if (!C) throw new Error('CryptoJS indisponible (HMAC-MD5)');
    const key = C.enc.Base64.parse(secretB64);
    return C.enc.Base64.stringify(C.HmacMD5(message, key));
}

/** `X-Client-Token` : epoch ms + md5 de son inverse. */
function clientToken(ts) {
    const raw = String(ts);
    const reversed = raw.split('').reverse().join('');
    return `${raw},${md5Hex(reversed)}`;
}

/**
 * Canonical string de la signature mobile :
 * METHOD\nAccept\nContent-Type\nbodyLength\ntimestamp\nbodyMd5\npath?sortedQuery
 * (valeurs NON url-encodées, comme le client Android).
 */
function canonicalString(method, accept, contentType, path, queryPairs, body, ts) {
    const sorted = queryPairs
        .slice()
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const qs = sorted.map(([k, v]) => `${k}=${v}`).join('&');
    const canonicalUrl = qs ? `${path}?${qs}` : path;
    const bodyMd5 = body !== null ? md5Hex(body) : '';
    const bodyLen = body !== null ? String(utf8Length(body)) : '';
    return [method.toUpperCase(), accept, contentType, bodyLen, String(ts), bodyMd5, canonicalUrl].join('\n');
}

/**
 * Lecture d'un header de réponse, quel que soit le runtime : objet `Headers`
 * (Node / mobile), dictionnaire simple (bridge TV) ou clés capitalisées.
 */
function readHeader(headers, name) {
    if (!headers) return null;
    const lower = name.toLowerCase();
    try {
        if (typeof headers.get === 'function') {
            const v = headers.get(name);
            if (v) return v;
        }
    } catch (_) {}
    if (headers[lower] !== undefined) return headers[lower];
    if (headers[name] !== undefined) return headers[name];
    const cap = lower.replace(/(^|-)([a-z])/g, (_, p, c) => p + c.toUpperCase());
    if (headers[cap] !== undefined) return headers[cap];
    try {
        for (const k of Object.keys(headers)) {
            if (String(k).toLowerCase() === lower) return headers[k];
        }
    } catch (_) {}
    return null;
}

/** Token JWT renvoyé par l'API dans le header `x-user`. */
function tokenFromResponse(res) {
    try {
        const raw = readHeader(res && res.headers, 'x-user');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && parsed.token ? parsed.token : null;
    } catch (_) {
        return null;
    }
}

// ─── Requête signée (API mobile) ─────────────────────────────────────────────

async function mobileRequest(host, path, { method = 'GET', params = null, body = null, token = null, signal = null } = {}) {
    if (isAborted(signal)) throw new Error('AbortError');

    const pairs = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null);
    const encodedQs = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    const url = `${host}${path}${encodedQs ? `?${encodedQs}` : ''}`;

    const bodyStr = body !== null ? JSON.stringify(body) : null;
    const accept = JSON_ACCEPT;
    const contentType = bodyStr !== null ? JSON_CT_CHARSET : JSON_CT;
    const ts = Date.now();
    const signature = `${ts}|2|${hmacMd5Base64(canonicalString(method, accept, contentType, path, pairs, bodyStr, ts))}`;

    const headers = {
        'User-Agent': MOBILE_UA,
        Accept: accept,
        'Content-Type': contentType,
        'X-Client-Token': clientToken(ts),
        'x-tr-signature': signature,
        'X-Client-Info': JSON.stringify({
            package_name: 'com.community.oneroom',
            version_name: MOBILE_VERSION_NAME,
            version_code: MOBILE_VERSION_CODE,
            os: 'android',
            os_version: '13',
            install_ch: 'ps',
            device_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
            install_store: 'ps',
            gaid: '1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d',
            brand: 'Redmi',
            model: '23078RKD5C',
            system_language: 'en',
            net: 'NETWORK_WIFI',
            region: 'US',
            timezone: 'America/New_York',
            sp_code: '40401',
            'X-Play-Mode': '2',
        }),
        'X-Client-Status': '0',
        'X-Play-Mode': '2',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await safeFetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
        signal: signal || undefined,
        timeout: 12000,
    });
    if (!res) return { status: 0, token: null, json: null };
    let json = null;
    try { json = await res.json(); } catch (_) { json = null; }
    return { status: res.status, token: tokenFromResponse(res), json };
}

// ─── Token invité (une fois par exécution) ───────────────────────────────────

let _token = null;
let _tokenAt = 0;
let _hostIdx = 0;
const TOKEN_TTL_MS = 10 * 60 * 1000;

/** Token Bearer invité ; rafraîchi automatiquement à l'expiration. */
export async function getToken(signal = null, force = false) {
    if (!force && _token && Date.now() - _tokenAt < TOKEN_TTL_MS) return _token;
    for (let i = 0; i < MOBILE_HOSTS.length; i++) {
        if (isAborted(signal)) return _token;
        const host = MOBILE_HOSTS[(_hostIdx + i) % MOBILE_HOSTS.length];
        try {
            const r = await mobileRequest(host, '/wefeed-mobile-bff/tab-operating', {
                params: { page: 1, tabId: 0, version: '' },
                signal,
            });
            if (r.token) {
                _hostIdx = (_hostIdx + i) % MOBILE_HOSTS.length;
                _token = r.token;
                _tokenAt = Date.now();
                console.log('[MovieBox] token invité obtenu');
                return _token;
            }
            console.log(`[MovieBox] token absent (${host} → ${r.status})`);
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
            console.log(`[MovieBox] token échec ${host}: ${e?.message}`);
        }
    }
    return _token;
}

/** Recherche signée (la seule voie de recherche qui fonctionne). */
export async function searchSubjects(keyword, { page = 1, perPage = 12, subjectType = 0, signal = null } = {}) {
    const token = await getToken(signal);
    if (!token) return [];
    const body = { keyword, page, perPage, subjectType };
    for (let i = 0; i < MOBILE_HOSTS.length; i++) {
        const host = MOBILE_HOSTS[(_hostIdx + i) % MOBILE_HOSTS.length];
        try {
            const r = await mobileRequest(host, '/wefeed-mobile-bff/subject-api/search', {
                method: 'POST', body, token, signal,
            });
            if (r.status === 200 && r.json && r.json.data) {
                return r.json.data.items || [];
            }
            if (r.status === 407 || r.status === 441) {
                // Signature / token refusés : on rafraîchit une fois puis on
                // laisse le pool suivant tenter sa chance.
                const fresh = await getToken(signal, true);
                if (fresh && fresh !== token) {
                    const retry = await mobileRequest(host, '/wefeed-mobile-bff/subject-api/search', {
                        method: 'POST', body, token: fresh, signal,
                    });
                    if (retry.status === 200 && retry.json && retry.json.data) {
                        return retry.json.data.items || [];
                    }
                }
            }
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
            console.log(`[MovieBox] recherche ${host}: ${e?.message}`);
        }
    }
    return [];
}

// ─── API mobile : fiche, saisons, lecture ───────────────────────────────────
// Repli indispensable : beaucoup de fiches « Version française » visibles
// dans la recherche n'existent PAS côté BFF web (404 `subject not found`) et
// ne sont lisibles que par l'API mobile.

async function mobileGet(host, path, params, token, signal) {
    const r = await mobileRequest(host, path, { params, token, signal });
    if (r.status === 200 && r.json && r.json.data) return r.json.data;
    return null;
}

async function withFirstHost(fn, signal) {
    for (let i = 0; i < MOBILE_HOSTS.length; i++) {
        if (isAborted(signal)) return null;
        const host = MOBILE_HOSTS[(_hostIdx + i) % MOBILE_HOSTS.length];
        try {
            const data = await fn(host);
            if (data) { _hostIdx = (_hostIdx + i) % MOBILE_HOSTS.length; return data; }
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
        }
    }
    return null;
}

/** Fiche mobile (pistes `dubs` incluses). */
export async function getMobileSubject(subjectId, { signal = null } = {}) {
    const token = await getToken(signal);
    if (!token) return null;
    return withFirstHost((host) => mobileGet(host, '/wefeed-mobile-bff/subject-api/get', { subjectId }, token, signal), signal);
}

/** Saisons/épisodes réels d'une fiche mobile. */
export async function getMobileSeasons(subjectId, { signal = null } = {}) {
    const token = await getToken(signal);
    if (!token) return null;
    return withFirstHost((host) => mobileGet(host, '/wefeed-mobile-bff/subject-api/season-info', { subjectId }, token, signal), signal);
}

/** Flux d'un épisode via l'API mobile (aucun Referer requis). */
export async function getMobilePlay({ subjectId, se, ep }, { signal = null } = {}) {
    const token = await getToken(signal);
    if (!token) return null;
    return withFirstHost((host) => mobileGet(host, '/wefeed-mobile-bff/subject-api/play-info', { subjectId, se, ep }, token, signal), signal);
}

// ─── BFF web ────────────────────────────────────────────────────────────────

let _playerDomain = null;

function webHeaders(referer, token) {
    const h = {
        'User-Agent': WEB_UA,
        Accept: JSON_ACCEPT,
        'X-Client-Info': JSON.stringify({ timezone: 'Europe/Paris' }),
        'X-Request-Lang': REQUEST_LANG,
        Referer: referer || `${SITE_ORIGIN}/`,
        Origin: SITE_ORIGIN,
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
}

async function webGet(path, { token = null, referer = null, signal = null } = {}) {
    if (isAborted(signal)) throw new Error('AbortError');
    const res = await safeFetch(`${H5_BASE}${path}`, {
        headers: webHeaders(referer, token),
        signal: signal || undefined,
        timeout: 12000,
    });
    if (!res) return { status: 0, json: null, token: null };
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, json, token: tokenFromResponse(res) };
}

/** Domaine du player : sert de Referer à `/subject/play` (sinon 0 flux). */
export async function getPlayerDomain(token, signal = null) {
    if (_playerDomain) return _playerDomain;
    try {
        const r = await webGet('/media-player/get-domain', { token, signal });
        const d = r.json && r.json.data;
        if (typeof d === 'string' && /^https?:\/\//.test(d)) {
            _playerDomain = d.replace(/\/+$/, '');
            return _playerDomain;
        }
    } catch (e) {
        if (String(e && e.message).includes('AbortError')) throw e;
    }
    return SITE_ORIGIN;
}

/** Fiche complète (pistes audio, saisons, sous-titres). */
export async function getDetail(detailPath, { token = null, signal = null } = {}) {
    const r = await webGet(`/detail?detailPath=${encodeURIComponent(detailPath)}`, { token, signal });
    const data = r.json && r.json.data;
    return data ? { data, token: r.token || token } : null;
}

/**
 * Flux d'un épisode. `se=0&ep=0` = film (avec `ep=1` le serveur renvoie
 * `hasResource:false` — cause n°1 des flux vides).
 */
export async function getPlay({ detailPath, subjectId, se, ep }, { token = null, signal = null } = {}) {
    const domain = await getPlayerDomain(token, signal);
    const referer = `${domain}/spa/videoPlayPage/movies/${detailPath}` +
        `?id=${subjectId}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=${REQUEST_LANG}`;
    const qs = `subjectId=${encodeURIComponent(subjectId)}&se=${se}&ep=${ep}` +
        `&detailPath=${encodeURIComponent(detailPath)}&host=${SITE_HOST}`;
    const r = await webGet(`/subject/play?${qs}`, { token, referer, signal });
    return (r.json && r.json.data) || null;
}
