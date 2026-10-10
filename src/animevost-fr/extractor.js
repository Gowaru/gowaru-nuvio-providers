/**
 * Extractor for AnimeVost-fr (animevost.fr — SPA Next.js, diag live 2026-09).
 *
 * Chaîne réelle :
 *   1. Search : /api/anime/search?q=X (index q partiellement cassé côté
 *      serveur) → fallback sonde de slug /anime/{slug} (la page répond 200
 *      avec le RSC flight contenant les épisodes même si l'API search rate).
 *   2. Détails : /api/animes/{slug} → seasons[].episodes[] avec zoplayer_id
 *      (id du fichier sur l'hébergeur gupload).
 *   3. Player : la page épisode embarque <iframe src="https://gupload.site/
 *      data/e/{zoplayer_id}?lang=fr">. La page gupload contient un blob
 *      chiffré 'salt~base64' (sel court, ~8 hex en live — XOR avec la clé
 *      statique G7#kP!2qZxV9mRwL) dont le décodage donne
 *      { videoUrl: ".../720p.m3u8", subtitleTracks… }.
 *      L'ancien provider servait l'URL de l'IFRAME (page HTML) — injouable.
 *      On ne reconstruit PAS l'URL en dur à l'aveugle : les ids candidats
 *      viennent du champ streams[] de l'API détails (video_url sur
 *      gupload.site + zoplayer_id), avec epData.zoplayer_id en repli.
 *      Seul le fichier 720p existe côté gupload (1080p/480p/360p → 404)
 *      alors que l'API annonce quality 1080p — 1080p n'est sondé qu'en
 *      tout dernier recours, et c'est la qualité réelle sondée qui est servie.
 *   4. Matching : les slugs à suffixe numérique (ex bleach-...-185874)
 *      sont acceptés avec pénalité au lieu d'être rejetés sous le seuil ;
 *      plus de variantes search (6 titres) avant abandon, et le meilleur
 *      candidat sous-seuil est revalidé par sonde de slug.
 *
 * Catalogue VOSTFR-only → language 'fr' + [VOSTFR] dans le titre.
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

const MAX_SEARCH_TITLES = 6;
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
    // Le blob chiffré : une chaîne 'salt~base64' passée au décodeur.
    // Sel court observé en live (~8 hex) — ne pas exiger 40+ chars.
    const m = html.match(/'([A-Za-z0-9+/=]{8,}~[A-Za-z0-9+/=]+)'/);
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

function stripNumericSuffix(slug) {
    // '-185874' (ids AniList-like, 4+ chiffres) — 'thunder-3' ne matche pas.
    return String(slug || '').replace(/-\d{4,}$/, '');
}

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
        // Slug à suffixe numérique (ex bleach-sennen-kessen-hen-...-185874) :
        // la base désigne la fiche voulue → pénalité (80) au lieu du rejet
        // sous le seuil (~50 via les tokens).
        if (candidateSlug) {
            const base = stripNumericSuffix(candidateSlug);
            if (base && base !== candidateSlug && base === toSlug(t)) return 80;
        }
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
    let best = null;
    for (const t of titles.slice(0, 6)) {
        if (isAborted(signal)) return { hit: null, best };
        const data = await fetchJson(`/api/anime/search?q=${encodeURIComponent(t)}`, { signal });
        const results = Array.isArray(data && data.results) ? data.results : [];
        for (const r of results) {
            const slug = r && r.slug;
            if (!slug) continue;
            const score = scoreMatch(r.title_romaji || r.title_english || slug, titles, slug);
            const scored = { slug, score };
            if (!best || score > best.score) best = scored;
            if (score >= 70) return { hit: scored, best: scored };
        }
    }
    return { hit: null, best };
}

/**
 * Sonde de slug directe : /anime/{slug} (200 + RSC même si search rate).
 * Les slugs des résultats search sous-seuil (extraSlugs) sont revalidés
 * ici avant usage — jamais servis à l'aveugle.
 */
async function probeSlug(titles, signal, extraSlugs = []) {
    const seen = new Set();
    const candidates = [];
    for (const s of extraSlugs) {
        if (s && !seen.has(s)) {
            seen.add(s);
            candidates.push({ slug: s, score: 65 });
        }
    }
    for (const t of titles.slice(0, MAX_SEARCH_TITLES)) {
        if (isAborted(signal)) return null;
        const slug = toSlug(t);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        candidates.push({ slug, score: 80 });
    }
    for (const c of candidates) {
        if (isAborted(signal)) return null;
        const html = await fetchText(`/anime/${c.slug}`, { signal });
        // La page fiche valide contient les données d'épisodes dans le flight RSC
        if (html && html.includes('zoplayer_id')) {
            return c;
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
 * Garde anti-mismatch : la fiche détails doit évoquer un titre plausible.
 * Score 0 (aucun token commun) → abandon, sauf absence d'infos titre
 * (on laisse passer plutôt que de rejeter à l'aveugle).
 */
function detailsTitleScore(details, titles, slug) {
    const anime = details && details.anime ? details.anime : null;
    if (!anime) return 100;
    return scoreMatch(
        anime.title_romaji || anime.title_english || anime.title_french || slug,
        titles,
        slug
    );
}

/**
 * Résout un épisode : zoplayer_id(s) → m3u8 HLS direct.
 *
 * Source des ids : le champ streams[] de l'API détails (video_url sur
 * gupload.site + zoplayer_id éventuel), avec epData.zoplayer_id en repli.
 * Les manifestes HLS sont servis à un chemin FIXE
 * /data/e/hls/{zoplayer_id}/{q}.m3u8 (diagnostic live : seul 720p existe,
 * 200 + manifeste valide + segments TS ; 1080p/480p/360p → 404 — alors que
 * l'API annonce quality 1080p). L'embed gupload bloque le fingerprint TLS
 * d'undici en Node mais OkHttp côté app passe ; la sonde directe du
 * manifeste suffit et évite un fetch d'embed.
 */
const GUPLOAD_HOST = 'https://gupload.site';
const QUALITY_ORDER = ['720p', '1080p'];

function collectZoplayerIds(epData) {
    const ids = [];
    const push = (id) => {
        if (typeof id === 'string' && /^[A-Za-z0-9]+$/.test(id) && !ids.includes(id)) ids.push(id);
    };
    const streams = epData && Array.isArray(epData.streams) ? epData.streams : [];
    for (const s of streams) {
        if (!s) continue;
        push(s.zoplayer_id);
        const vu = s.video_url || s.videoUrl || s.url;
        if (typeof vu === 'string') {
            const m = vu.match(/\/data\/e\/([A-Za-z0-9]+)/);
            if (m) push(m[1]);
        }
    }
    push(epData && epData.zoplayer_id);
    return ids;
}

async function resolveEpisodeStreams(slug, seasonNum, episodeNum, epData, signal) {
    const ids = collectZoplayerIds(epData);
    if (ids.length === 0) return [];

    for (const zoplayerId of ids) {
        for (const q of QUALITY_ORDER) {
            if (isAborted(signal)) return [];
            const m3u8Url = `${GUPLOAD_HOST}/data/e/hls/${zoplayerId}/${q}.m3u8`;
            let manifest = null;
            try {
                manifest = await fetchText(m3u8Url, {
                    signal,
                    headers: { Referer: `${GUPLOAD_HOST}/` },
                });
            } catch (e) {
                if (isAborted(signal)) throw e;
                continue;
            }
            if (!manifest || !manifest.includes('#EXTM3U')) continue;

            const baseStream = {
                name: 'AnimeVOST (VOSTFR)',
                title: `AnimeVOST S${seasonNum}E${episodeNum} [VOSTFR]`,
                url: m3u8Url,
                quality: q,
                language: 'fr',
                type: 'hls',
                headers: { Referer: `${GUPLOAD_HOST}/` },
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
    }
    console.log(`[AnimeVostFR] Aucun manifeste HLS pour ${slug} S${seasonNum}E${episodeNum} (${ids.join(',')})`);
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

    // 1. Search API puis sonde de slug (le meilleur candidat sous-seuil
    //    est revalidé par sonde plutôt qu'abandonné)
    let match = null;
    const search = await searchApi(titles, signal);
    if (search && search.hit) match = search.hit;
    if (!match) {
        const extra = search && search.best && search.best.score >= 50 ? [search.best.slug] : [];
        match = await probeSlug(titles, signal, extra);
    }
    if (!match) {
        console.log(`[AnimeVostFR] Titre introuvable pour TMDB ${tmdbId}`);
        return [];
    }

    // 2. Détails + garde anti-mismatch + épisode exact (jamais de repli)
    const details = await getAnimeDetails(match.slug, signal);
    if (detailsTitleScore(details, titles, match.slug) < 40) {
        console.log(`[AnimeVostFR] Fiche ${match.slug} sans rapport avec TMDB ${tmdbId} — abandon`);
        return [];
    }
    const epData = findEpisodeData(details, seasonNum, episodeNum);
    if (!epData) {
        console.log(`[AnimeVostFR] S${seasonNum}E${episodeNum} absent de ${match.slug}`);
        return [];
    }

    // 3. Résolution gupload → m3u8
    return resolveEpisodeStreams(match.slug, seasonNum, episodeNum, epData, signal);
}
