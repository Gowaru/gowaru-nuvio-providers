/**
 * Extractor for AnimeVost-fr (animevost.fr — SPA Next.js, diag live 2026-09).
 *
 * Chaîne réelle :
 *   1. Search : /api/anime/search?q=X (index q partiellement cassé côté
 *      serveur) → fallback sonde de slug /anime/{slug} (la page répond 200
 *      avec le RSC flight contenant les épisodes même si l'API search rate).
 *   2. Détails : /api/animes/{slug} → seasons[].episodes[] avec zoplayer_id
 *      (id du fichier sur l'hébergeur gupload).
 *   3. Player : la page épisode embarque <iframe src="https://gupload.xyz/
 *      data/e/{zoplayer_id}?lang=fr">. La page gupload contient un blob
 *      chiffré 'salt~base64' (XOR avec la clé statique G7#kP!2qZxV9mRwL)
 *      dont le décodage donne { videoUrl: ".../720p.m3u8", subtitleTracks… }.
 *      L'ancien provider servait l'URL de l'IFRAME (page HTML) — injouable.
 *
 * Garde-fous : jamais d'URL iframe servie comme stream, jamais de repli
 * "épisode le plus proche" (0 propre > faux contenu).
 */

import { fetchJson, fetchText, setCurrentSignal, BASE } from './http.js';
import { resolveStream, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { toSlug } from '../utils/dle-extractor.js';

/** Clé XOR statique du player gupload (stable, vérifiée sur plusieurs pages). */
const GUPLOAD_XOR_KEY = 'G7#kP!2qZxV9mRwL';

const MAX_SEARCH_TITLES = 4;
const TIMEOUT_MS = 12000;

// ─── Décodage du player gupload ─────────────────────────────────────────────

/**
 * Décode atob() en binaire fiable (charCodes 0-255) — atob des runtimes Nuvio
 * retourne une chaîne Latin-1, ok pour le XOR octet par octet.
 */
function xorDecrypt(blob, key) {
    const tilde = blob.indexOf('~');
    if (tilde < 0) return null;
    const b64 = blob.slice(tilde + 1);
    if (!b64) return null;
    try {
        const raw = atob(b64);
        let out = '';
        for (let i = 0; i < raw.length; i++) {
            out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return out;
    } catch {
        return null;
    }
}

/**
 * Extrait l'URL vidéo HLS depuis une page embed gupload.
 * @returns {{ videoUrl: string, subtitles: Array<{url,label,lang}> } | null}
 */
export function parseGuploadEmbed(html) {
    if (!html) return null;
    // Le blob chiffré : une grande chaîne 'hex~base64' passée au décodeur.
    const m = html.match(/'([A-Za-z0-9+/=]{40,}~[A-Za-z0-9+/=]+)'/);
    if (!m) return null;
    const decoded = xorDecrypt(m[1], GUPLOAD_XOR_KEY);
    if (!decoded) return null;
    let data;
    try { data = JSON.parse(decoded); } catch { return null; }
    if (!data || typeof data.videoUrl !== 'string' || !data.videoUrl.startsWith('http')) return null;

    const subtitles = [];
    if (Array.isArray(data.subtitleTracks)) {
        for (const s of data.subtitleTracks) {
            if (s && typeof s.src === 'string' && s.src.startsWith('http')) {
                subtitles.push({ url: s.src, label: s.label || '', lang: s.srclang || '' });
            }
        }
    }
    return { videoUrl: data.videoUrl, subtitles };
}

// ─── Recherche ──────────────────────────────────────────────────────────────

function scoreMatch(candidateTitle, wantedTitles, candidateSlug) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cn = norm(candidateTitle);
    let best = 0;
    for (const t of wantedTitles) {
        const wn = norm(t);
        if (!wn || !cn) continue;
        if (cn === wn) return 100;
        const cnTokens = cn.split(/[^a-z0-9]+/).filter(Boolean);
        const wnTokens = wn.split(/[^a-z0-9]+/).filter(Boolean);
        // Le slug EXACT (fiche principale du titre) bat toujours un dérivé
        // (spécial/OAV/film) : toSlug('Air Gear') = 'air-gear' ≠ 'air-gear-special'.
        if (candidateSlug && candidateSlug === toSlug(t)) return 95;
        if (cnTokens[0] === wnTokens[0]) {
            // Le résultat commence par la requête (fidélité maximale)
            const extras = cnTokens.filter((w) => !wnTokens.includes(w)).length;
            best = Math.max(best, 80 - Math.min(extras * 10, 30));
        } else if (cnTokens.includes(wnTokens[wnTokens.length - 1]) && wnTokens.length > 1) {
            best = Math.max(best, 50);
        }
    }
    return best;
}

/** Recherche API (q= partiellement cassé → simple accélérateur, pas critique). */
async function searchApi(titles, signal) {
    for (const t of titles.slice(0, 2)) {
        if (isAborted(signal)) return null;
        const data = await fetchJson(`/api/anime/search?q=${encodeURIComponent(t)}`, { signal });
        const results = Array.isArray(data && data.results) ? data.results : [];
        let bestResult = null;
        let bestScore = 0;
        for (const r of results) {
            const slug = r && r.slug;
            if (!slug) continue;
            const score = scoreMatch(r.title_romaji || r.title_english || slug, titles, slug);
            if (score > bestScore) {
                bestScore = score;
                bestResult = { slug, score };
            }
        }
        if (bestResult && bestScore >= 70) return bestResult;
    }
    return null;
}

/** Sonde de slug directe : /anime/{slug} (200 + RSC même si search rate). */
async function probeSlug(titles, signal) {
    for (const t of titles.slice(0, MAX_SEARCH_TITLES)) {
        if (isAborted(signal)) return null;
        const slug = toSlug(t);
        if (!slug) continue;
        const html = await fetchText(`/anime/${slug}`, { signal });
        // La page fiche valide contient les données d'épisodes dans le flight RSC
        if (html && html.includes('zoplayer_id')) {
            return { slug, score: 80 };
        }
    }
    return null;
}

// ─── Détails + extraction ───────────────────────────────────────────────────

async function getAnimeDetails(slug, signal) {
    return fetchJson(`/api/animes/${slug}`, { signal });
}

function findEpisodeData(details, seasonNum, episodeNum) {
    if (!details || !Array.isArray(details.seasons)) return null;
    const seasonData =
        details.seasons.find((s) => parseInt(s.season_number, 10) === seasonNum) ||
        // Pas de repli cross-saison : la saison demandée doit exister.
        null;
    if (!seasonData || !Array.isArray(seasonData.episodes)) return null;
    return seasonData.episodes.find((e) => parseInt(e.episode_number, 10) === episodeNum) || null;
}

/**
 * Résout un épisode : zoplayer_id → m3u8 HLS direct.
 *
 * Le player gupload chiffre son blob (XOR) — mais les manifestes HLS sont
 * servis à un chemin FIXE /data/e/hls/{zoplayer_id}/{q}.m3u8 (diagnostic
 * live : 720p = 200 accessible SANS passer par l'embed, dont le HTML bloque
 * le fingerprint TLS d'undici — OkHttp côté app passe). On sonde les
 * qualités dans l'ordre et on garde la première qui répond avec un
 * manifeste #EXTM3U valide.
 */
const QUALITY_ORDER = ['720p', '1080p', '480p', '360p'];

async function resolveEpisodeStreams(slug, seasonNum, episodeNum, epData, signal) {
    const zoplayerId = epData && epData.zoplayer_id;
    if (!zoplayerId) return [];

    for (const q of QUALITY_ORDER) {
        if (isAborted(signal)) return [];
        const m3u8Url = `https://gupload.xyz/data/e/hls/${zoplayerId}/${q}.m3u8`;
        let manifest = null;
        try {
            manifest = await fetchText(m3u8Url, {
                signal,
                headers: { Referer: 'https://gupload.xyz/' },
            });
        } catch (e) {
            if (isAborted(signal)) throw e;
            continue;
        }
        if (!manifest || !manifest.includes('#EXTM3U')) continue;

        const baseStream = {
            name: 'AnimeVOST (VOSTFR)',
            title: `AnimeVOST [VOSTFR]`,
            url: m3u8Url,
            quality: q,
            language: 'ja',
            type: 'hls',
            headers: { Referer: 'https://gupload.xyz/' },
        };
        try {
            const resolved = await resolveStream(baseStream, 0);
            if (!resolved || !resolved.url || resolved.isDirect === false) continue;
            delete resolved.isDirect;
            delete resolved.originalUrl;
            return [resolved];
        } catch (e) {
            if (isAborted(signal)) throw e;
        }
    }
    console.log(`[AnimeVostFR] Aucun manifeste HLS pour ${slug} S${seasonNum}E${episodeNum} (${zoplayerId})`);
    return [];
}

// ─── Entrée ─────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    if (mediaType === 'movie') return []; // catalogue 100% séries

    const seasonNum = Math.max(1, parseInt(season, 10) || 1);
    const episodeNum = Math.max(1, parseInt(episode, 10) || 1);

    const titles = await getTmdbTitles(tmdbId, 'tv', { season: seasonNum });
    if (!titles || titles.length === 0) return [];

    // 1. Search API puis sonde de slug
    let match = await searchApi(titles, signal);
    if (!match) match = await probeSlug(titles, signal);
    if (!match) {
        console.log(`[AnimeVostFR] Titre introuvable pour TMDB ${tmdbId}`);
        return [];
    }

    // 2. Détails + épisode exact (jamais de repli)
    const details = await getAnimeDetails(match.slug, signal);
    const epData = findEpisodeData(details, seasonNum, episodeNum);
    if (!epData) {
        console.log(`[AnimeVostFR] S${seasonNum}E${episodeNum} absent de ${match.slug}`);
        return [];
    }

    // 3. Résolution gupload → m3u8
    return resolveEpisodeStreams(match.slug, seasonNum, episodeNum, epData, signal);
}
