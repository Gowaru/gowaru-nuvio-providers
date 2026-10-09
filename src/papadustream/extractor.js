/**
 * Extractor for Papadustream (papadustream.club — miroir papadustreami.living)
 * Séries ET films — HLS signé multi-qualité (360p→1080p) et multi-audio (fr/en).
 *
 * Architecture site (vérifiée en live 10/2026) :
 * - Page série  : /series/tt…  contient un tableau JSON `EPISODES=[{url,title,season,episode},…]`
 * - Page film   : /films/tt…   contient 1 URL /hls/p/…/movie/tt…/playlist.m3u8
 * - URLs HLS    : /hls/p/{timestamp}/{token}/{sN}/(serial|movie)/tt…/playlist.m3u8
 *   → token SIGNÉ : change à chaque génération de page, valide ≥ 8 min.
 *     Ne jamais réutiliser un token après échec : re-fetcher la page (bypass cache).
 * - Master playlist : qualités 1080/720/480/360 + pistes audio en/fr (multi-audio)
 *   → émettre un stream VF (piste fr) et un stream EN (piste en) sur la même URL.
 *
 * Piège historique corrigé : l'ancien fallback "épisode précédent" renvoyait un
 * épisode DIFFÉRENT de celui demandé (titres qui ne correspondent pas). Désormais
 * on ne renvoie que l'épisode cible réellement trouvé via le JSON structuré.
 *
 * Cache intelligent :
 * - TTL séparé succès (5 min) / échec (30 s), LRU, clés normalisées
 * - Les réponses vides/échecs ne sont jamais mises en cache comme succès
 */

import { fetchText, setCurrentSignal, BASE_URL_WWW } from './http.js';
import { safeFetch, isAborted } from '../utils/resolvers.js';
import { toStream, resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { createCache } from '../utils/cache.js';

const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

// ─── Cache intelligent (partagé) ─────────────────────────────────────────────
const withCache = createCache('pd', 'Papadustream');

// ─── Patterns HLS (couvrent l'ancien ET le nouveau format signé) ────────────
// Ancien : /hls/s5/serial/tt…/{S}/{E}/playlist.m3u8
// Nouveau : /hls/p/{ts}/{token}/s5/serial/tt…/{S}/{E}/playlist.m3u8
const HLS_SERIAL_RE = /\/hls\/(?:p\/\d+\/[A-Za-z0-9_-]+\/)?s\d+\/serial\/tt\d+\/(\d+)\/(\d+)\/playlist\.m3u8/g;
const HLS_MOVIE_RE = /\/hls\/(?:p\/\d+\/[A-Za-z0-9_-]+\/)?s\d+\/movie\/tt\d+\/playlist\.m3u8/g;

// ─── TMDB Helpers ───────────────────────────────────────────────────────────

/**
 * Récupère l'IMDb ID (tt...) depuis TMDB via external_ids.
 */
async function getImdbIdFromTmdb(tmdbId, isMovie) {
    const kind = isMovie ? 'movie' : 'tv';
    const url = `${TMDB_API_BASE}/${kind}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    return withCache(`imdb_${kind}_${tmdbId}`, async () => {
        try {
            const res = await safeFetch(url);
            if (!res) return null;
            const data = await res.json();
            if (!data || data.success === false) return null;
            const imdbId = data?.imdb_id;
            if (!imdbId || typeof imdbId !== 'string' || !imdbId.startsWith('tt')) return null;
            console.log(`[Papadustream] TMDB ${tmdbId} → IMDb ${imdbId}`);
            return imdbId;
        } catch (e) {
            console.warn(`[Papadustream] TMDB error: ${e?.message}`);
            return null;
        }
    });
}

/**
 * Récupère le titre d'un contenu TMDB (pour fallback recherche).
 */
async function getTmdbTitle(tmdbId, isMovie) {
    const kind = isMovie ? 'movie' : 'tv';
    const url = `${TMDB_API_BASE}/${kind}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`;
    return withCache(`title_${kind}_${tmdbId}`, async () => {
        try {
            const res = await safeFetch(url);
            if (!res) return null;
            const data = await res.json();
            if (!data || data.success === false) return null;
            return data.name || data.title || null;
        } catch (e) {
            console.warn(`[Papadustream] TMDB title error: ${e?.message}`);
            return null;
        }
    });
}

/**
 * Cherche une série OU un film sur Papadustream par titre, retourne l'IMDb ID.
 * Chemins vérifiés en live : /series/tt… et /films/tt…
 */
async function searchSiteByTitle(title, isMovie) {
    const searchUrl = `/search?q=${encodeURIComponent(title)}`;
    const kind = isMovie ? 'films' : 'series';
    return withCache(`search_${kind}_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, async () => {
        try {
            const html = await fetchText(searchUrl);
            if (!html) return null;
            const siteRegex = new RegExp(`\\/${kind}\\/(tt\\d+)`, 'g');
            let match;
            const found = [];
            while ((match = siteRegex.exec(html)) !== null) {
                found.push(match[1]);
            }
            if (found.length > 0) {
                const imdbId = found[0];
                console.log(`[Papadustream] Search "${title}" → ${imdbId} (${found.length} results)`);
                return imdbId;
            }
            console.warn(`[Papadustream] No results for "${title}"`);
            return null;
        } catch (e) {
            console.warn(`[Papadustream] Search error: ${e?.message}`);
            return null;
        }
    });
}

/**
 * Résout un TMDB ID en IMDb ID utilisable sur Papadustream.
 */
async function resolveImdbId(tmdbId, isMovie) {
    let imdbId = await getImdbIdFromTmdb(tmdbId, isMovie);
    if (imdbId) return imdbId;

    console.log(`[Papadustream] Title search fallback for TMDB ${tmdbId}...`);
    const title = await getTmdbTitle(tmdbId, isMovie);
    if (title) {
        const mainTitle = title.split(':')[0].trim();
        imdbId = await searchSiteByTitle(mainTitle, isMovie);
        if (imdbId) return imdbId;
        imdbId = await searchSiteByTitle(title, isMovie);
        if (imdbId) return imdbId;
    }

    console.warn(`[Papadustream] IMDb ID not found for TMDB ${tmdbId}`);
    return null;
}

// ─── Parsing page (JSON structuré + regex de fallback) ─────────────────────

/**
 * Extrait le tableau JSON `EPISODES=[{url,title,season,episode},…]` embarqué
 * dans la page série. Source de vérité : titres réels + numéros (S,E) fiables.
 * @returns {Array<{url:string,title:string,season:number,episode:number}>}
 */
function parseEpisodesJson(html) {
    if (!html) return [];
    const marker = 'EPISODES=[';
    const start = html.indexOf(marker);
    if (start === -1) return [];
    const slice = html.slice(start + marker.length - 1); // commence par '['
    // Le tableau est suivi de '];' en fin de déclaration JS.
    const end = slice.indexOf('];');
    const raw = end !== -1 ? slice.slice(0, end + 1) : null;
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        const out = [];
        for (const e of arr) {
            if (e && typeof e.url === 'string' && e.url.includes('/hls/') &&
                Number.isFinite(Number(e.season)) && Number.isFinite(Number(e.episode))) {
                out.push({
                    url: e.url,
                    title: typeof e.title === 'string' ? e.title : '',
                    season: Number(e.season),
                    episode: Number(e.episode),
                });
            }
        }
        return out;
    } catch (e) {
        console.warn(`[Papadustream] EPISODES JSON parse failed: ${e?.message}`);
        return [];
    }
}

/**
 * Fallback regex sur le HTML brut (ancien format non signé + nouveau signé).
 * @returns {Array<{url:string,title:string,season:number,episode:number}>}
 */
function extractHlsUrls(html) {
    if (!html) return [];
    const results = [];
    const re = new RegExp(HLS_SERIAL_RE.source, 'g');
    let match;
    while ((match = re.exec(html)) !== null) {
        results.push({
            url: match[0],
            title: '',
            season: parseInt(match[1], 10),
            episode: parseInt(match[2], 10),
        });
    }
    return results;
}

/**
 * Extrait l'URL HLS d'un film (nouveau format signé + ancien).
 */
function extractMovieHlsUrl(html, imdbId) {
    if (!html) return null;
    const re = new RegExp(HLS_MOVIE_RE.source, 'g');
    let match;
    while ((match = re.exec(html)) !== null) {
        // Vérifie que le chemin cible bien cet IMDb (sécurité contre autres films de la page)
        if (match[0].includes(`/${imdbId}/`)) return match[0];
    }
    return null;
}

// ─── Validation master playlist + détection audio ──────────────────────────

/**
 * Vérifie qu'un master playlist est accessible (token encore valide) et
 * détecte les langues audio disponibles (LANGUAGE="fr"/"en" sur TYPE=AUDIO).
 * @returns {Promise<{ok:boolean, langs:Set<string>} >}
 */
async function probeMasterPlaylist(url) {
    const langs = new Set();
    try {
        const text = await fetchText(url, { timeout: 8000 });
        if (!text || !text.includes('#EXTM3U')) {
            return { ok: false, langs };
        }
        // Détection ligne par ligne (une EXT-X-MEDIA = une ligne) : un regex
        // multi-lignes attribuerait le LANGUAGE d'une piste subs à une piste audio.
        const langRe = /LANGUAGE="([A-Za-z-]+)"/;
        const lines = text.split('\n');
        for (const line of lines) {
            if (line.indexOf('TYPE=AUDIO') === -1) continue;
            const m = langRe.exec(line);
            if (m) langs.add(m[1].toLowerCase().split('-')[0]);
        }
        return { ok: true, langs };
    } catch (e) {
        console.warn(`[Papadustream] Master probe error: ${e?.message}`);
        return { ok: false, langs };
    }
}

/**
 * Construit les streams standardisés pour une URL HLS validée.
 * Multi-audio : émet VF si piste fr détectée, EN si piste en détectée.
 * Sans détection (manifest atypique) → VF par défaut (site FR).
 */
function buildStreams(hlsUrl, epInfo, suffix = '') {
    // Les URLs du JSON EPISODES sont relatives (/hls/p/…) : les absolutiser
    // AVANT émission (l'app ne peut pas résoudre un chemin relatif) sur www
    // (redirection 301 sinon à chaque requête player).
    let absUrl = hlsUrl.startsWith('http') ? hlsUrl : `${BASE_URL_WWW}${hlsUrl}`;
    absUrl = absUrl.replace('https://papadustream.club', BASE_URL_WWW);
    const { langs } = epInfo;
    const hasFr = langs.size === 0 || langs.has('fr');
    const hasEn = langs.size > 0 && langs.has('en');
    const epLabel = epInfo.season != null && epInfo.episode != null
        ? `S${epInfo.season}E${epInfo.episode}`
        : 'HLS';
    const epTitle = epInfo.title ? ` - ${epInfo.title}` : '';
    const streams = [];

    if (hasFr) {
        const s = toStream(absUrl, 'VF', 'Papadustream', BASE_URL_WWW, {
            quality: 'HD',
            title: `[VF] ${epLabel}${epTitle}${suffix}`,
        });
        s.type = 'hls';
        streams.push(s);
    }
    if (hasEn) {
        const s = toStream(absUrl, 'EN', 'Papadustream', BASE_URL_WWW, {
            quality: 'HD',
            title: `[VO/${hasFr ? 'VOSTFR' : 'EN'}] ${epLabel}${epTitle}${suffix}`,
        });
        s.type = 'hls';
        streams.push(s);
    }
    return streams;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Point d'entrée principal — séries ET films.
 */
export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const isTv = mediaType === 'series' || mediaType === 'tv';
    const isMovie = mediaType === 'movie';
    if (!isTv && !isMovie) {
        console.log(`[Papadustream] Unsupported: ${mediaType} (TV/movies only)`);
        return [];
    }

    const startTime = Date.now();
    console.log(`[Papadustream] Looking for S${season || 1}E${episode || 1} (TMDB: ${tmdbId})`);

    // Étape 1: Résoudre TMDB ID → IMDb ID
    const imdbId = await resolveImdbId(tmdbId, isMovie);
    if (!imdbId) {
        console.warn(`[Papadustream] Could not resolve IMDb ID for TMDB ${tmdbId}`);
        return [];
    }

    // Étape 2 (séries) : Résoudre les épisodes cibles via ArmSync
    // (gère la numérotation absolue anime : [num TMDB, num absolu ArmSync])
    let targetEpisodes = [parseInt(episode, 10) || 1];
    if (isTv) {
        targetEpisodes = await resolveTargetEpisodes(tmdbId, 'tv', season, episode, {
            startTime,
            budgetMs: 40000,
        });
        console.log(`[Papadustream] Target episodes: ${targetEpisodes}`);
    }

    // Étape 3: Fetch la page (cache 5 min / échec 30 s)
    const pagePath = isMovie ? `/films/${imdbId}` : `/series/${imdbId}`;
    const cacheKey = `page_${imdbId}_${isMovie ? 'mv' : 'tv'}`;
    let html = await withCache(cacheKey, () => fetchText(pagePath));
    if (!html) {
        console.warn(`[Papadustream] Page not accessible: ${pagePath}`);
        return [];
    }

    // Étape 4a (séries) : extraire la liste EPISODES (JSON structuré),
    // fallback regex sur le HTML si le marqueur disparaît un jour.
    let candidates = [];
    if (isTv) {
        candidates = parseEpisodesJson(html);
        if (candidates.length === 0) {
            console.log(`[Papadustream] EPISODES JSON absent, falling back to regex`);
            candidates = extractHlsUrls(html);
        }
        console.log(`[Papadustream] ${candidates.length} episode(s) listed on page`);
    }

    // Étape 4b: sélection stricte de l'épisode cible (aucun fallback d'épisode :
    // renvoyer un épisode différent de celui demandé causait des titres erronés).
    const targetSeason = Number(season) || 1;
    const streams = [];
    const seenUrls = new Set();

    if (isMovie) {
        const movieUrl = extractMovieHlsUrl(html, imdbId);
        if (!movieUrl) {
            console.log(`[Papadustream] No movie HLS for ${imdbId}`);
            return [];
        }
        const probe = await probeMasterPlaylist(movieUrl);
        if (!probe.ok) {
            console.warn(`[Papadustream] Movie master unreachable (expired token?), refreshing page`);
            html = await withCache(cacheKey, () => fetchText(pagePath), { bypass: true });
            const freshUrl = html ? extractMovieHlsUrl(html, imdbId) : null;
            if (!freshUrl) return [];
            const probe2 = await probeMasterPlaylist(freshUrl);
            if (!probe2.ok) return [];
            streams.push(...buildStreams(freshUrl, { langs: probe2.langs, season: null, episode: null }));
        } else {
            streams.push(...buildStreams(movieUrl, { langs: probe.langs, season: null, episode: null }));
        }
    } else {
        // Le site indexe en (saison, épisode) TMDB pur. Le 2e candidat ArmSync
        // (numéro absolu) ne doit PAS être matché ici : pour Breaking Bad,
        // l'absolu 10 re-tombait sur S2E10 → émissions d'un faux épisode
        // (symptôme "épisodes qui ne correspondent pas aux titres").
        // On ne sélectionne que l'épisode TMDB primaire de la saison cible.
        const primaryEp = targetEpisodes[0];
        const selected = candidates.filter(c =>
            c.season === targetSeason && c.episode === primaryEp
        );

        if (selected.length === 0) {
            const available = candidates.filter(c => c.season === targetSeason).map(c => `E${c.episode}`).slice(0, 20).join(' ');
            console.log(`[Papadustream] No episode match for S${targetSeason}E${primaryEp} — available on site: ${available || 'none'}`);
            return [];
        }

        for (const ep of selected) {
            if (isAborted(signal)) return streams;
            let hlsUrl = ep.url;
            const probe = await probeMasterPlaylist(hlsUrl);

            if (!probe.ok) {
                // Token signé expiré : re-fetch de la page (bypass cache) pour
                // obtenir des URLs fraîches, puis re-sélection de l'épisode.
                console.warn(`[Papadustream] Master unreachable for S${ep.season}E${ep.episode} (expired token?), refreshing page`);
                const freshHtml = await withCache(cacheKey, () => fetchText(pagePath), { bypass: true });
                let freshList = freshHtml ? parseEpisodesJson(freshHtml) : [];
                if (freshList.length === 0 && freshHtml) freshList = extractHlsUrls(freshHtml);
                const freshEp = freshList.find(c => c.season === ep.season && c.episode === ep.episode);
                if (!freshEp) {
                    console.warn(`[Papadustream] Episode S${ep.season}E${ep.episode} still missing after refresh`);
                    continue;
                }
                const probe2 = await probeMasterPlaylist(freshEp.url);
                if (!probe2.ok) {
                    console.warn(`[Papadustream] Master still unreachable after refresh`);
                    continue;
                }
                if (seenUrls.has(freshEp.url)) continue;
                seenUrls.add(freshEp.url);
                streams.push(...buildStreams(freshEp.url, { langs: probe2.langs, season: ep.season, episode: ep.episode, title: freshEp.title || ep.title }));
                continue;
            }

            if (seenUrls.has(hlsUrl)) continue;
            seenUrls.add(hlsUrl);
            streams.push(...buildStreams(hlsUrl, { langs: probe.langs, season: ep.season, episode: ep.episode, title: ep.title }));
        }
    }

    if (streams.length === 0) {
        console.log(`[Papadustream] No stream for ${imdbId}${isTv ? ` S${targetSeason}E${episode}` : ''}`);
    } else {
        console.log(`[Papadustream] ${streams.length} stream(s) found`);
    }

    return streams;
}
