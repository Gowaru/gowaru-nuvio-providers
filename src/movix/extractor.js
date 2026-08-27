import { fetchJson, setCurrentSignal } from './http.js';
import { resolveStream, withTimeout, safeFetch, USER_AGENT, isAborted } from '../utils/resolvers.js';
import { getUrlOrigin, normalizeLangTag } from '../utils/dle-extractor.js';
import { getTmdbTitle } from '../utils/search-fallback.js';

// ─── Configuration ──────────────────────────────────────────────────────────
// Domaines API actuels de Movix (découverts dans le bundle JS du site :
// l'instance axios `wl` utilise api.movix.fun avec baseURL /api/content,
// et l'API scraper publique /api/fstream est servie sur api.movix.fun).
// Les anciens domaines api.movix.cloud / api.movix.cash renvoient 404.
const API_DOMAINS = [
    'https://api.movix.fun'
];

const SITE_ORIGIN = 'https://movix.fun';

// Hosts connus pour être lents ou problématiques → on les ignore
const SLOW_HOSTS = ['up4fun', 'dood', 'doodstream', 'moonplayer', 'filemoon', 'streamtape', 'stape'];
// Hosts rapides prioritaires (résolution fiable en < 3s)
const FAST_HOSTS = ['voe', 'uqload', 'fsvid', 'vidzy', 'netu', 'younetu', 'sendvid', 'sibnet'];

// Sources scraper alternatives de l'API Movix (formats vérifiés en live sur
// api.movix.fun — le repo open-source movixcorp/MovixOpenSource référence les
// routes /api/{wiflix|j1f|cpasmal}). Utilisées en fallback après fstream :
//   - wiflix : {players:{vf,vostfr:[{name,url,...}]}}  → films uniquement (TV=404)
//   - j1f    : {players:{vf,vostfr:[{name,url,...}]}}  → films uniquement (TV="Aucune source unique")
//   - cpasmal: {links:{vf,vostfr:[...]}}               → films + séries (souvent vide)
// Tous sont déjà couverts par parseStreams (Format 1 players / Format 2 links).
const FALLBACK_SOURCES = [
    { name: 'wiflix', movie: true, tv: false },
    { name: 'j1f', movie: true, tv: false },
    { name: 'cpasmal', movie: true, tv: true },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Score de priorité d'un stream : plus bas = résolu en premier */
function streamPriority(url, language) {
    const u = (url || '').toLowerCase();
    let score = 0;

    // Priorité linguistique : VF < Default/MULTI < VOSTFR < autres
    const l = (language || '').toUpperCase();
    if (l === 'VF' || l === 'VFF' || l === 'VFQ') score += 0;
    else if (l === 'DEFAULT' || l === 'MULTI') score += 10;
    else if (l === 'VOSTFR') score += 20;
    else score += 30;

    // Priorité par host : slow hosts en dernier, fast hosts en premier
    const isSlow = SLOW_HOSTS.some(h => u.includes(h));
    const isFast = FAST_HOSTS.some(h => u.includes(h));
    if (isSlow) score += 100;
    else if (isFast) score += 0;
    else score += 50; // hosts inconnus au milieu

    return score;
}

function isExoPlayableUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    if (u.includes('test-videos.co.uk') || u.includes('sample-videos.com') || u.includes('big_buck_bunny')) return false;
    if (u.includes('/embed') || u.includes('/e/') || u.includes('iframe') || u.includes('index.php')) return false;
    if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mkv') || u.includes('.webm') || u.includes('.ts')) return true;
    if (u.includes('manifest') || u.includes('playlist') || u.includes('/hls/')) return true;
    return false;
}

async function resolveForExo(stream) {
    let resolved = null;
    if (isExoPlayableUrl(stream.url)) {
        resolved = { ...stream, isDirect: true };
    } else {
        try { resolved = await withTimeout(resolveStream(stream), 8000); }
        catch (e) { console.warn(`[Movix] resolveStream timeout: ${e?.message}`); }
    }
    if (!resolved || !resolved.url || !resolved.isDirect) return null;
    if (!isExoPlayableUrl(resolved.url)) return null;
    return {
        name: resolved.name || stream.name,
        title: resolved.title || stream.title,
        url: resolved.url,
        quality: resolved.quality || 'HD',
        isDirect: true,
        headers: { ...resolved.headers, 'User-Agent': USER_AGENT }
    };
}

// ─── Extraction des données source depuis l'API Movix ───────────────────────

/**
 * Tente de récupérer les sources depuis un domaine API.
 * Avec retry géré par fetchJson.
 */
async function fetchFromDomain(baseUrl, tmdbId, mediaType, season) {
    const isMovie = mediaType === 'movie';
    const path = isMovie
        ? `${baseUrl}/api/fstream/movie/${tmdbId}`
        : `${baseUrl}/api/fstream/tv/${tmdbId}/season/${Number(season) || 1}`;

    const data = await fetchJson(path, { retries: 1 });
    // Garde précoce : l'API renvoie {"success":false,...} quand le contenu n'existe
    // pas (ex: ID interne Movix au lieu d'un TMDB id) → inutile de parser
    if (!data || data.success === false) return null;

    return { data, provider: 'fstream' };
}

/**
 * Parse les streams depuis la réponse de l'API fstream
 */
function parseStreams(data, provider, isMovie, episodeNum) {
    const streams = [];

    if (!data || typeof data !== 'object') return streams;

    // Format 1: data.players { lang: [{name, player, url, quality}] }
    // (fstream utilise `player`, wiflix/j1f utilisent `name`)
    if (data.players) {
        for (const lang of Object.keys(data.players)) {
            const list = data.players[lang];
            if (!Array.isArray(list)) continue;
            for (const item of list) {
                pushStream(streams, provider, item?.player || item?.name, lang, item?.url, item?.quality);
            }
        }
    }

    // Format 2: data.links { lang: [{name, url, quality}] }
    if (data.links) {
        for (const lang of Object.keys(data.links)) {
            const list = data.links[lang];
            if (!Array.isArray(list)) continue;
            for (const item of list) {
                pushStream(streams, provider, item?.name || item?.player, lang, item?.url, item?.quality);
            }
        }
    }

    // Format 3 (TV): data.episodes[episode].languages { lang: [{player, url}] }
    // Format 4 (TV): data.episodes[episode] { vf: [...], vostfr: [...] }
    if (!isMovie && data.episodes) {
        const ep = data.episodes[String(episodeNum)] || data.episodes[episodeNum];
        if (ep && typeof ep === 'object') {
            // Format 3: ep.languages
            if (ep.languages) {
                for (const lang of Object.keys(ep.languages)) {
                    const list = ep.languages[lang];
                    if (!Array.isArray(list)) continue;
                    for (const item of list) {
                        pushStream(streams, provider, item?.player, lang, item?.url, item?.quality);
                    }
                }
            }
            // Format 4: ep.vf, ep.vostfr, etc.
            for (const lang of ['vf', 'vostfr', 'vo', 'VFF', 'VFQ', 'VOSTFR', 'Default']) {
                const list = ep[lang];
                if (!Array.isArray(list)) continue;
                for (const item of list) {
                    pushStream(streams, provider, item?.name || item?.player, lang, item?.url, item?.quality);
                }
            }
        }
    }

    // Format 5: data.vf, data.vostfr (format cpasmal-compatible, présent dans fstream)
    for (const lang of ['vf', 'vostfr', 'vo', 'VFF', 'VFQ']) {
        const list = data[lang];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            pushStream(streams, provider, item?.player || item?.name, lang, item?.url, item?.quality);
        }
    }

    return streams;
}

function pushStream(streams, provider, server, lang, url, quality) {
    if (!url || typeof url !== 'string') return;
    const origin = getUrlOrigin(url, SITE_ORIGIN);
    streams.push({
        name: 'Movix',
        title: `[${normalizeLangTag(lang)}] ${provider} - ${server || 'Player'}`,
        url,
        quality: quality || 'HD',
        language: normalizeLangTag(lang),
        headers: { Referer: origin + '/', Origin: origin, 'User-Agent': USER_AGENT }
    });
}

// ─── Fallback search ────────────────────────────────────────────────────────

/**
 * Fallback : cherche un contenu par titre via l'API Movix v1
 * (si l'ID direct n'a rien donné)
 * getTmdbTitle importé depuis search-fallback.js (cache global safeFetch 30s)
 */
async function searchFallback(baseUrl, tmdbId, mediaType, season, episode) {
    console.log(`[Movix] Search fallback for TMDB ${tmdbId} (${mediaType})`);

    // 1. Récupérer le titre depuis TMDB
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) {
        console.log(`[Movix] No TMDB title found for ${tmdbId}`);
        return null;
    }

    console.log(`[Movix] Searching for: "${title}"`);

    // 2. Chercher sur l'API Movix (search endpoint — le paramètre requis est `title`, pas `q`)
    const searchQuery = encodeURIComponent(title);
    const searchUrl = `${baseUrl}/api/search?title=${searchQuery}`;

    try {
        const searchData = await fetchJson(searchUrl, { retries: 0 });
        const results = searchData?.results || (Array.isArray(searchData) ? searchData : null);
        if (!Array.isArray(results) || results.length === 0) {
            console.log(`[Movix] No search results from ${baseUrl}`);
            return null;
        }

        console.log(`[Movix] ${results.length} search result(s), trying alternates...`);

        // 3. Essayer chaque résultat jusqu'à trouver des sources
        // NB: le champ `id` des résultats est l'ID interne Movix (pas un TMDB id) ;
        // c'est `tmdb_id` qu'il faut utiliser pour /api/fstream. Vérifié en live :
        //   /api/fstream/movie/72462 → error "Aucun contenu trouvé"
        //   /api/fstream/movie/27205 → OK (Inception)
        for (const result of results.slice(0, 5)) {
            const altId = result.tmdb_id || result.id;
            if (!altId) continue;
            if (String(altId) === String(tmdbId)) continue; // déjà essayé

            let resultType = result.media_type || result.type || mediaType;
            // L'API search expose `type: "series"` (et parfois "show") pour les séries,
            // alors que /api/fstream attend `tv` → normalisation
            if (resultType === 'series' || resultType === 'show') resultType = 'tv';
            if (resultType !== 'movie' && resultType !== 'tv') continue;

            console.log(`[Movix] Trying TMDB ${altId} (${resultType})...`);

            const path = resultType === 'movie'
                ? `${baseUrl}/api/fstream/movie/${altId}`
                : `${baseUrl}/api/fstream/tv/${altId}/season/${Number(season) || 1}`;

            const altData = await fetchJson(path, { retries: 0 });
            if (altData) {
                const altStreams = parseStreams(altData, 'fstream', resultType === 'movie', Number(episode) || 1);
                if (altStreams.length > 0) {
                    console.log(`[Movix] Found ${altStreams.length} stream(s) via TMDB ${altId}`);
                    return altStreams;
                }
            }
        }
    } catch (e) {
        console.log(`[Movix] Search fallback error: ${e.message}`);
    }

    return null;
}

/**
 * Récupère les streams des sources alternatives (wiflix/j1f/cpasmal) sur tous
 * les domaines API. Retourne les streams bruts (non résolus) — le tri et la
 * résolution sont faits par resolveStreamsToPlayable.
 */
async function fetchFallbackStreams(tmdbId, isMovie, season, episodeNum, signal) {
    const found = [];
    for (const baseUrl of API_DOMAINS) {
        for (const src of FALLBACK_SOURCES) {
            if (isAborted(signal)) return found;
            const supported = isMovie ? src.movie : src.tv;
            if (!supported) continue; // wiflix/j1f : films uniquement (TV=404/erreur)

            const path = isMovie
                ? `${baseUrl}/api/${src.name}/movie/${tmdbId}`
                : `${baseUrl}/api/${src.name}/tv/${tmdbId}/season/${Number(season) || 1}`;

            console.log(`[Movix] Trying ${src.name}...`);
            const data = await fetchJson(path, { retries: 1 });
            if (!data || data.success === false) continue;

            const streams = parseStreams(data, src.name, isMovie, episodeNum);
            if (streams.length > 0) {
                console.log(`[Movix] ${streams.length} stream(s) from ${src.name}`);
                found.push(...streams);
            }
        }
        if (found.length > 0) break; // assez de sources sur ce domaine
    }
    return found;
}

/**
 * Déduplique, trie (priorité langue/host) puis résout les streams en playable.
 * Réutilisé pour la passe primaire et pour la passe fallback multi-sources.
 * 
 * OPTIMISATION: fetch synchrone en QuickJS = pas de parallélisme.
 * On résout séquentiellement avec early-exit dès qu'on a assez de streams.
 */
async function resolveStreamsToPlayable(streams) {
    if (streams.length === 0) return [];

    const seen = new Set();
    const unique = [];
    for (const s of streams) {
        if (!seen.has(s.url)) { seen.add(s.url); unique.push(s); }
    }
    unique.sort((a, b) => streamPriority(a.url, a.language) - streamPriority(b.url, b.language));

    const MAX_RESOLVE = 5;
    const TARGET_PLAYABLE = 2; // Assez pour un VF + VOSTFR
    const playable = [];
    const seenPlayable = new Set();
    const startTime = Date.now();
    const BUDGET_MS = 15000; // Budget max pour la résolution

    // Résolution séquentielle avec early-exit
    // (fetch synchrone en QuickJS = Promise.allSettled ne parallélise pas)
    const toResolve = unique.slice(0, MAX_RESOLVE);
    for (const stream of toResolve) {
        if (playable.length >= TARGET_PLAYABLE) break;
        if (Date.now() - startTime > BUDGET_MS) break;

        try {
            const result = await resolveForExo(stream);
            if (result && !seenPlayable.has(result.url)) {
                seenPlayable.add(result.url);
                playable.push(result);
            }
        } catch (e) {
            console.warn(`[Movix] resolveStream failed: ${e?.message}`);
        }
    }

    console.log(`[Movix] Total: ${unique.length} streams, ${playable.length} playable (resolved ${Math.min(toResolve.length, MAX_RESOLVE)} in ${Date.now() - startTime}ms)`);
    return playable;
}

// ─── Fonction principale d'extraction ────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    if (!tmdbId) { console.log('[Movix] Missing tmdbId'); return []; }

    const isMovie = mediaType === 'movie';
    const episodeNum = Number(episode) || 1;

    let allStreams = [];

    // Étape 1 : Essayer chaque domaine API avec l'endpoint fstream
    for (const baseUrl of API_DOMAINS) {
        console.log(`[Movix] Trying ${baseUrl}...`);
        const result = await fetchFromDomain(baseUrl, tmdbId, mediaType, season);

        if (result) {
            const provider = result.provider;
            const streams = parseStreams(result.data, provider, isMovie, episodeNum);
            if (streams.length > 0) {
                console.log(`[Movix] ${streams.length} stream(s) from ${baseUrl}`);
                allStreams = streams;
                break; // Trouvé sur ce domaine, pas besoin d'essayer le suivant
            }
        }
    }

    // Étape 2 : sources alternatives (wiflix/j1f/cpasmal) en fallback si fstream vide
    let fallbackTried = false;
    if (allStreams.length === 0) {
        console.log('[Movix] No streams from fstream, trying fallback sources (wiflix/j1f/cpasmal)...');
        allStreams = await fetchFallbackStreams(tmdbId, isMovie, season, episodeNum, signal);
        // 'déjà tenté' (même si 0 stream trouvé) : évite que l'Étape 4 re-fetche
        // les mêmes sources après un searchFallback qui aurait rempli allStreams
        fallbackTried = true;
    }

    // Étape 3 : Si aucun stream trouvé, essayer le fallback search
    if (allStreams.length === 0) {
        console.log('[Movix] No streams from direct API, trying search fallback...');
        for (const baseUrl of API_DOMAINS) {
            const fallbackStreams = await searchFallback(baseUrl, tmdbId, mediaType, season, episode);
            if (fallbackStreams && fallbackStreams.length > 0) {
                allStreams = fallbackStreams;
                break;
            }
        }
    }

    if (allStreams.length === 0) {
        console.log('[Movix] No streams found from any source');
        return [];
    }

    // ─── Résolution (dédup + tri + resolve) ───────────────────────────────
    let playable = await resolveStreamsToPlayable(allStreams);

    // ─── Étape 4 : si rien de playable malgré des streams trouvés (ex: l'unique
    // embed fstream est down), retenter les sources alternatives avant d'abandonner.
    // NB: on ne relance que si les fallback n'ont PAS déjà été tentés en Étape 2
    // (sinon on re-fetcherait les mêmes sources sans gain — doublon d'appels API)
    if (playable.length === 0 && !fallbackTried && !isAborted(signal)) {
        console.log('[Movix] No playable stream after resolution, trying fallback sources (wiflix/j1f/cpasmal)...');
        const fallbackStreams = await fetchFallbackStreams(tmdbId, isMovie, season, episodeNum, signal);
        if (fallbackStreams.length > 0) {
            playable = await resolveStreamsToPlayable(fallbackStreams);
        }
    }

    return playable;
}
