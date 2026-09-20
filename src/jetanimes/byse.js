/**
 * Résolveur d'embeds Jetanimes (hdsplay* / secured.lol).
 *
 * Le player derrière le raccourcisseur secured.lol a MUTÉ (diag 2026-09) :
 *
 *   AVANT — Byse (hdsplay2.xyz/e/{code}) : SPA React, sources chiffrées
 *   AES-256-GCM, clé reconstituée depuis key_parts[30] + version (voir
 *   la branche legacy plus bas).
 *
 *   MAINTENANT — VidHide (hdsplay.xyz/v/{code}) : page avec un script
 *   obfusqué p.a.c.k.e.r (radix ~36, dictionnaire ~600 tokens) contenant
 *   directement `var links={"hls2":"https://…/master.m3u8?t=…&e=…",
 *   "hls3":"…"}`. Dépaquetage = remplacement de chaque mot par
 *   dictionnaire[parseInt(mot, radix)] — SANS crypto → compatible
 *   NuvioTV ET NuvioMobile.
 *
 * Stratégie : branch VidHide d'abord (cheap, universelle), branch Byse
 * AES-GCM ensuite si l'URL est au format /e/{code}.
 */

import { nativeCryptoAvailable } from '../utils/resolvers.js';

const PLAYER_HOSTS = ['hdsplay', 'secured.lol'];

/** Teste si une URL pointe vers un player hdsplay/Byse (direct ou via raccourcisseur). */
export function isByseUrl(url) {
    const u = String(url || '').toLowerCase();
    return PLAYER_HOSTS.some((h) => u.includes(h));
}

/** Décode base64url → Uint8Array (atob est polyfillé sur les 2 runtimes). */
function b64urlToBytes(s) {
    let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4 !== 0) t += '=';
    const bin = atob(t);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ─── Branche VidHide : dépaquetage p.a.c.k.e.r ──────────────────────────────

/** Unescape JS minimal (\' \" \\ \/ \n \t \r \xNN \uNNNN). */
function jsUnescape(s) {
    return String(s).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, g) => {
        if (g[0] === 'u' || g[0] === 'x') return String.fromCharCode(parseInt(g.slice(1), 16));
        if (g === 'n') return '\n';
        if (g === 't') return '\t';
        if (g === 'r') return '\r';
        return g;
    });
}

/**
 * Extrait et dépaquette le script p.a.c.k.e.r d'une page player.
 * Retourne le code déobfusqué, ou null.
 */
export function unpackPlayerScript(html) {
    if (!html || html.indexOf('eval(function(') === -1) return null;
    const m = /eval\(function\(p,a,c,k,e,[dr]?\)\{[\s\S]{0,1200}?\}\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(html);
    if (!m) return null;
    const p = jsUnescape(m[1]);
    const radix = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const dict = jsUnescape(m[4]).split('|');
    if (!p || !dict.length || count !== dict.length) return null;
    return p.replace(/\b\w+\b/g, (w) => {
        const idx = parseInt(w, radix);
        return (idx < count && dict[idx]) ? dict[idx] : w;
    });
}

/** Extrait les liens HLS du code dépaqueté (priorité master.m3u8). */
function extractHlsLinks(code) {
    const out = [];
    const seen = new Set();
    const re = /"(hls[0-9])"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        const u = m[2].replace(/\\\//g, '/');
        if (seen.has(u)) continue;
        seen.add(u);
        out.push({ url: u, label: m[1] });
    }
    if (!out.length) {
        const r2 = /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g;
        while ((m = r2.exec(code)) !== null) {
            if (!seen.has(m[0])) { seen.add(m[0]); out.push({ url: m[0], label: '' }); }
        }
    }
    return out;
}

function pickBest(list) {
    const score = (x) => {
        let s = /m3u8/i.test(x.url) ? 1000 : 0;
        if (x.label === 'hls2') s += 50; // master.m3u8 éprouvé (hls3 = mirror .txt)
        return s;
    };
    list.sort((a, b) => score(b) - score(a));
    return list[0] || null;
}

// ─── Branche legacy Byse : AES-256-GCM ──────────────────────────────────────

/**
 * Sélectionne les fragments de clé selon `version`.
 * Table du bundle Byse : n → [n, 31-n] (indices 1-based sur key_parts).
 */
function selectKeyParts(playback) {
    const parts = Array.isArray(playback.key_parts) ? playback.key_parts : [];
    const n = parseInt(playback.version, 10);
    if (!Number.isFinite(n)) return parts;
    const a = n;
    const b = 31 - n;
    if (a < 1 || b < 1 || a > parts.length || b > parts.length) return parts;
    return [parts[a - 1], parts[b - 1]];
}

function concatBytes(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const a of arrays) { out.set(a, o); o += a.length; }
    return out;
}

function buildKeyBytes(playback) {
    const selected = selectKeyParts(playback);
    if (!selected.length) throw new Error('Byse: no key parts');
    return concatBytes(selected.map(b64urlToBytes));
}

/** Compteur CTR équivalent-GCM : IV (12B) || 0x00000002 (big-endian). */
function gcmCtrBlock(ivBytes) {
    if (ivBytes.length !== 12) throw new Error(`Byse: IV ${ivBytes.length}B (12 attendu)`);
    const block = new Uint8Array(16);
    block.set(ivBytes, 0);
    block[12] = 0; block[13] = 0; block[14] = 0; block[15] = 2;
    return block;
}

async function decryptNative(keyBytes, ivBytes, ctBytes) {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: gcmCtrBlock(ivBytes), length: 64 },
        cryptoKey,
        ctBytes,
    );
    return new Uint8Array(plain);
}

function decryptCryptoJs(keyBytes, ivBytes, ctBytes) {
    if (typeof CryptoJS === 'undefined') throw new Error('Byse: CryptoJS indisponible sur ce runtime');
    const fromBytes = (b) => CryptoJS.lib.WordArray.create(new Uint8Array(b));
    const keyWA = fromBytes(keyBytes);
    const ivBlock = gcmCtrBlock(ivBytes);
    const counterWA = CryptoJS.lib.WordArray.create(new Uint8Array(ivBlock));
    const ctWA = fromBytes(ctBytes);
    const decrypted = CryptoJS.AES.decrypt(
        CryptoJS.lib.CipherParams.create({ ciphertext: ctWA }),
        keyWA,
        { mode: CryptoJS.mode.CTR, iv: counterWA, padding: CryptoJS.pad.NoPadding },
    );
    const hex = decrypted.toString(CryptoJS.enc.Hex);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

// NuvioTV n'a pas TextDecoder (polyfill Mobile uniquement) — décodage manuel UTF-8.
function bytesToUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    let out = '';
    const CH = 4096;
    for (let i = 0; i < bytes.length; i += CH) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return out;
}

/** Branche legacy : API /api/videos/{code} + AES-GCM (hdsplay2.xyz). */
async function resolveByseApi(pageUrl, code, fetchMetaFn, signal) {
    const apiOrigin = new URL(pageUrl).origin;
    const apiUrl = `${apiOrigin}/api/videos/${code}`;
    const meta = await fetchMetaFn(apiUrl, {
        signal,
        timeout: 12000,
        headers: { Referer: pageUrl, Accept: 'application/json' },
    }).catch(() => null);
    if (!meta || !meta.text) return null;
    let data;
    try { data = JSON.parse(meta.text); } catch (e) { return null; }
    const pb = data && data.playback;
    if (!pb || !pb.iv || !pb.payload) return null;
    if (String(pb.algorithm || '').toUpperCase().indexOf('GCM') === -1) return null;

    let plainBytes;
    try {
        const keyBytes = buildKeyBytes(pb);
        const ivBytes = b64urlToBytes(pb.iv);
        const payloadBytes = b64urlToBytes(pb.payload);
        if (payloadBytes.length <= 16) return null;
        const ctBytes = payloadBytes.subarray(0, payloadBytes.length - 16);
        if (nativeCryptoAvailable) {
            plainBytes = await decryptNative(keyBytes, ivBytes, ctBytes);
        } else {
            plainBytes = decryptCryptoJs(keyBytes, ivBytes, ctBytes);
        }
    } catch (e) {
        if (signal && signal.aborted) throw e;
        return null;
    }

    let plain;
    try { plain = bytesToUtf8(plainBytes); } catch (e) { return null; }
    let sources;
    try { sources = JSON.parse(plain).sources; } catch (e) { return null; }
    if (!Array.isArray(sources) || !sources.length) return null;

    const valid = sources.filter((s) => s && typeof s.url === 'string' && s.url.startsWith('http'));
    if (!valid.length) return null;
    const score = (s) => {
        const lbl = String(s.label || s.quality || '').toLowerCase();
        const mm = /(\d{3,4})/.exec(lbl);
        let sc = mm ? parseInt(mm[1], 10) : 0;
        if (String(s.mime_type || '').includes('mpegurl') || lbl.includes('hls')) sc += 1000;
        return sc;
    };
    valid.sort((a, b) => score(b) - score(a));
    return { url: valid[0].url, label: String(valid[0].label || valid[0].quality || '') };
}

/**
 * Résout un embed jetanimes vers un manifest direct.
 * @param {string} embedUrl URL secured.lol/xxx OU hdsplayX.tld/(e|v)/xxx
 * @param {import('./http.js').fetchMeta} fetchMetaFn fetch renvoyant { text, finalUrl }
 * @param {AbortSignal|null} signal
 * @returns {Promise<{url: string, label?: string}|null>} manifest direct ou null
 */
export async function resolveByse(embedUrl, fetchMetaFn, signal) {
    if (!embedUrl) return null;
    if (signal && signal.aborted) return null;

    // 1. Raccourcisseur secured.lol : safeFetch suit les 30x → l'URL FINALE
    //    (hdsplayX.tld/v/|/e/{code}) est fournie par fetchMeta.finalUrl.
    //    Fallback : chercher l'URL hdsplay dans le HTML (redirection JS).
    let url = String(embedUrl);
    if (/secured\.lol/i.test(url)) {
        const meta = await fetchMetaFn(url, { signal, timeout: 12000 }).catch(() => null);
        if (!meta) return null;
        let m = /https?:\/\/[a-z0-9.-]*hdsplay[a-z0-9.-]*\/(?:e|v)\/([a-z0-9]+)/i.exec(meta.finalUrl || '');
        if (!m && meta.text) {
            m = /https?:\/\/[a-z0-9.-]*hdsplay[a-z0-9.-]*\/(?:e|v)\/([a-z0-9]+)/i.exec(meta.text);
        }
        if (!m) return null;
        url = m[0];
    }

    // 2. Page player (Referer raccourcisseur pour l'anti-hotlink)
    const meta = await fetchMetaFn(url, {
        signal,
        timeout: 15000,
        headers: { Referer: 'https://secured.lol/' },
    }).catch(() => null);
    const html = meta && meta.text;
    if (!html) return null;

    // 3a. VidHide : script p.a.c.k.e.r → links{hls2|hls3|hls4} → m3u8 direct
    const unpacked = unpackPlayerScript(html);
    if (unpacked) {
        const links = extractHlsLinks(unpacked);
        const best = pickBest(links);
        if (best) return best;
    }
    // m3u8 nu dans la page (players non obfusqués)
    const raw = /https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/.exec(html);
    if (raw) return pickBest([{ url: raw[0], label: '' }]);

    // 3b. Legacy Byse : /e/{code} → API + AES-GCM
    const em = /\/e\/([a-z0-9]+)/i.exec(url);
    if (em) {
        return resolveByseApi(url, em[1], fetchMetaFn, signal).catch(() => null);
    }
    return null;
}
