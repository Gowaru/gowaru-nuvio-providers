import { fetchJson, setCurrentSignal } from './http.js';
import { resolveStream, withTimeout, safeFetch, USER_AGENT, isAborted, getScraperSettings } from '../utils/resolvers.js';
import { getUrlOrigin, resolveSeasonEpisodeInputs } from '../utils/dle-extractor.js';
import { getTmdbTitle } from '../utils/search-fallback.js';

// ─── Configuration ──────────────────────────────────────────────────────────
// Domaines API actuels de Movix (découverts dans le bundle JS du site :
// l'instance axios `wl` utilise api.movix.fun avec baseURL /api/content,
// et l'API scraper publique /api/fstream est servie sur api.movix.fun).
// Les anciens domaines api.movix.cloud / api.movix.cash renvoient 404.
// api.movix.fun = endpoint historique ; api.movix.miami = celui du SPA actuel
// (vérifié live 2026-11 : les deux servent /api/fstream et /api/cpasmal, et
// .miami rattrape les rafales 503 de .fun).
const API_DOMAINS = [
    'https://api.movix.fun',
    'https://api.movix.miami',
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
//   - j1f    : {players:{vf,vostfr:[{name,url,...}]}}  → films uniquement (TV=404)
//   - cpasmal: {links:{vf,vostfr:[...]}}               → films + séries (souvent vide,
//     renvoie {"error":"Movie/TV Show not found (Cached)"} quand absent)
// Tous sont déjà couverts par parseStreams (Format 1 players / Format 2 links).
const FALLBACK_SOURCES = [
    { name: 'wiflix', movie: true, tv: false },
    // j1f retiré : l'API répond systématiquement
    // {"success":false,"error":"Source 1jour1film désactivée"} (vérifié live
    // 2026-11) → une requête perdue à chaque run.
    { name: 'cpasmal', movie: true, tv: true },
];

// ─── Normalisation des tags de langue (Movix) ───────────────────────────────
// L'API Movix renvoie EXACTEMENT : 'VF', 'VFQ', 'VFF', 'VOSTFR', 'Default'
// (vérifié en live : players.{VFQ,VFF,VOSTFR,Default}, episodes[n].languages.{VF,VOSTFR}).
// Chaque tag doit survivre jusqu'au stream final, sinon NuvioTV/Mobile le classent
// "Unknown" dans les filtres/tri → "les VF n'apparaissent pas".
function normalizeLangTagMovix(lang) {
    const l = (lang || '').toLowerCase();
    if (l === 'vf') return 'VF';
    if (l === 'vff') return 'VFF'; // VFF = TrueFrench (audio 100% FR) — NE PAS fusionner avec VF
    if (l === 'vfq') return 'VFQ'; // VFQ = Québec — NE PAS fusionner avec VF
    if (l === 'vostfr' || l === 'vost') return 'VOSTFR';
    if (l === 'default' || l === 'multi') return 'MULTI';
    if (l === 'vo') return 'VO';
    return (lang || '').trim() ? String(lang).toUpperCase() : 'VF';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalisation légère pour comparer des titres (accents, ponctuation). */
function normalizeForMatch(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Settings (SCRAPER_SETTINGS injecté par l'app) ──────────────────────────

/**
 * Lit les préférences utilisateur injectées par l'app (NuvioMobile UI,
 * NuvioTV SCRAPER_SETTINGS). Fallback sûr si absents ou invalides.
 */
function getPrefs() {
    const s = getScraperSettings() || {};
    return {
        language: (s.language === 'vf' || s.language === 'vostfr') ? s.language : 'all',
        skipSlowHosts: s.skipSlowHosts === true,
    };
}

/**
 * Filtre les streams selon la langue préférée (setting 'language').
 * 'vf' : écarte les VOSTFR ; 'vostfr' : écarte les VF.
 * Ne filtre que si au moins un stream de la langue préférée existe
 * (sinon on garde tout plutôt que de ne rien retourner).
 */
function filterByLanguagePref(streams, pref) {
    if (!pref || pref === 'all' || !Array.isArray(streams) || streams.length === 0) return streams;
    const isVF = (s) => {
        const t = `${s.language || ''} ${s.title || ''} ${s.name || ''}`.toUpperCase();
        return t.includes('VF') || t.includes('FRENCH') || t.includes('TRUEFRENCH');
    };
    const isVOSTFR = (s) => `${s.language || ''} ${s.title || ''} ${s.name || ''}`.toUpperCase().includes('VOSTFR');
    const wanted = pref === 'vf' ? isVF : isVOSTFR;
    const filtered = streams.filter(wanted);
    return filtered.length > 0 ? filtered : streams;
}

/**
 * Score de priorité d'un stream : plus bas = résolu en premier */
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

// ─── Résolution ExoPlayer ───────────────────────────────────────────────────
// isDirectVideoUrl : l'URL est DÉJÀ un flux vidéo jouable par ExoPlayer
// (.m3u8/.mp4/... ou chemin /hls2/ tokenisé vérifié en live — ExoPlayer les
// joue sans passer par un extractor). Ces URLs ne doivent JAMAIS être
// ré-envoyées dans resolveStream : certains extracteurs traitent les chemins
// inconnus comme des pages d'embed et réintentent l'embed d'origine →
// 403/timeout → "stream ne se lance jamais".
function isDirectVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    if (u.includes('test-videos.co.uk') || u.includes('sample-videos.com') || u.includes('big_buck_bunny')) return false;
    if (u.includes('/embed') || u.includes('/e/') || u.includes('iframe') || u.includes('index.php')) return false;
    if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mkv') || u.includes('.webm') || u.includes('.ts')) return true;
    if (u.includes('manifest') || u.includes('playlist') || u.includes('/hls/') || u.includes('/hls2/')) return true;
    return false;
}

// Compat : conservé pour les vérifications de résultat final.
function isExoPlayableUrl(url) {
    return isDirectVideoUrl(url);
}

/**
 * Résout un stream candidat en flux jouable ExoPlayer.
 * - URL déjà directe → conservée telle quelle (zéro requête réseau)
 * - Sinon → resolveStream avec timeout court (8s) et garantie Referer/Origin
 */
async function resolveForExo(stream) {
    let resolved = null;
    if (isDirectVideoUrl(stream.url)) {
        // Vérifié en live : les chemins /hls2/ de fsvid/vidzy/uqload répondent
        // 200 avec Referer du site → pas besoin de resolveStream.
        const origin = getUrlOrigin(stream.url, SITE_ORIGIN);
        resolved = {
            ...stream,
            isDirect: true,
            type: stream.type || (stream.url.toLowerCase().includes('.m3u8') || stream.url.toLowerCase().includes('/hls') ? 'hls' : undefined),
            headers: { ...(stream.headers || {}), Referer: stream.headers?.Referer || origin + '/', Origin: stream.headers?.Origin || origin, 'User-Agent': USER_AGENT },
        };
    } else {
        // 10 s : uqload/fsvid peuvent dépasser 8 s sur un premier appel à froid
        // (le résolveur uqload fait 1 à 3 fetches) → un timeout trop court
        // supprimait la source alors qu'elle était résoluble.
        try { resolved = await withTimeout(resolveStream(stream), 10000); }
        catch (e) { console.warn(`[Movix] resolveStream timeout: ${e?.message}`); }
    }
    if (!resolved || !resolved.url || !resolved.isDirect) return null;
    if (!isExoPlayableUrl(resolved.url)) return null;
    const ro = getUrlOrigin(resolved.url, SITE_ORIGIN);
    return {
        name: resolved.name || stream.name,
        title: resolved.title || stream.title,
        url: resolved.url,
        quality: resolved.quality || 'HD',
        isDirect: true,
        ...(resolved.type ? { type: resolved.type } : {}),
        // Conserver la langue (sinon l'app la classe "Unknown" dans les filtres/tri)
        ...(resolved.language || stream.language ? { language: resolved.language || stream.language } : {}),
        headers: { ...(resolved.headers || {}), Referer: resolved.headers?.Referer || ro + '/', Origin: resolved.headers?.Origin || ro, 'User-Agent': USER_AGENT }
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
    if (url.includes('[object')) return;
    const origin = getUrlOrigin(url, SITE_ORIGIN);
    // Langue : normalisation Movix stricte (VFF/VFQ distincts, Default→MULTI).
    // Le tag DOIT survivre jusqu'au stream final pour les filtres/tri de l'app.
    const langTag = normalizeLangTagMovix(lang);
    // Nom d'hôte lisible : évite des titres du type "Premium - Player" sans info.
    let hostName = server || '';
    if (!hostName) {
        try {
            hostName = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
        } catch (e) { hostName = 'Player'; }
    }
    streams.push({
        name: 'Movix',
        title: `[${langTag}] ${provider} - ${hostName}`,
        url,
        quality: quality || 'HD',
        language: langTag,
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
        // Filtrer d'abord les candidats du bon type (évite de sonder des films
        // quand on cherche une série — l'API renvoie tout confondu).
        const wantedType = mediaType === 'movie' ? 'movie' : 'tv';
        // Filtrer par type ET par ressemblance de titre : l'API renvoie 40+
        // résultats (spinoffs, homonymes, autres langues) et sonder chacun
        // consommait le budget sur des TMDB id sans rapport.
        const wantedWords = normalizeForMatch(title).split(' ').filter(w => w.length >= 3);
        const looksAlike = (r) => {
            const cand = normalizeForMatch(r.title || r.name || r.original_title || '');
            if (!cand || wantedWords.length === 0) return true;
            const hit = wantedWords.filter(w => cand.includes(w)).length;
            return hit >= Math.max(1, Math.ceil(wantedWords.length * 0.6));
        };
        const candidates = results.filter(r => {
            let rt = r.media_type || r.type || '';
            if (rt === 'series' || rt === 'show') rt = 'tv';
            return (rt === wantedType || !rt) && looksAlike(r);
        });
        // ⚠ JAMAIS de repli sur `results` : quand aucun résultat n'a le bon
        // type, on servait un FILM pour une série (ex. Solo Leveling S1 →
        // TMDB 518880, le film récapitulatif) — contenu totalement étranger.
        if (candidates.length === 0) {
            console.log(`[Movix] No ${wantedType} match in search results for "${title}"`);
            return null;
        }
        const ordered = candidates.slice(0, 6);
        for (const result of ordered) {
            const altId = result.tmdb_id || result.id;
            if (!altId) continue;
            if (String(altId) === String(tmdbId)) continue; // déjà essayé

            let resultType = result.media_type || result.type || mediaType;
            // L'API search expose `type: "series"` (et parfois "show") pour les séries,
            // alors que /api/fstream attend `tv` → normalisation
            if (resultType === 'series' || resultType === 'show') resultType = 'tv';
            if (resultType !== 'movie' && resultType !== 'tv') continue;

            console.log(`[Movix] Trying TMDB ${altId} (${resultType})...`);

            // NB: le champ `id` des résultats est l'ID interne Movix (pas un TMDB id)
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
            // retries: 0 — les 404 "not found (Cached)" sont définitifs (la source
            // n'a pas le contenu) ; réessayer ne fait que doubler le délai.
            const data = await fetchJson(path, { retries: 0 });
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
async function resolveStreamsToPlayable(streams, prefs, signal) {
    if (streams.length === 0) return [];

    // Préférences utilisateur (settings) : langue + skip slow hosts
    prefs = prefs || getPrefs();
    const signalGuard = signal || null;
    let candidates = filterByLanguagePref(streams, prefs.language);
    if (prefs.skipSlowHosts) {
        const withoutSlow = candidates.filter(s => !SLOW_HOSTS.some(h => (s.url || '').toLowerCase().includes(h)));
        if (withoutSlow.length > 0) candidates = withoutSlow;
    }

    const seen = new Set();
    const unique = [];
    for (const s of candidates) {
        if (!seen.has(s.url)) { seen.add(s.url); unique.push(s); }
    }
    unique.sort((a, b) => streamPriority(a.url, a.language) - streamPriority(b.url, b.language));

    // ─── Passe 1 : URLs déjà directes (zéro réseau) ───────────────────────
    // Toujours traitées AVANT tout resolveStream. Élargit le plafond à 8 :
    // c'est la cause n°1 des "streams indisponibles" — des flux déjà jouables
    // restaient derrière les 2-3 premiers embeds en échec.
    const MAX_RESOLVE = 10;     // résolutions réseau max (embeds uniquement)
    // 6 : les sources fstream exposent souvent 4-5 lecteurs VF + 0-3 VOSTFR ;
    // avec 4 on perdait une langue entière (symptôme « les VF n'apparaissent
    // pas » / « que du VOSTFR »).
    const TARGET_PLAYABLE = 6;
    const playable = [];
    const seenPlayable = new Set();
    const startTime = Date.now();
    const BUDGET_MS = 25000;    // budget max de la résolution

    const addPlayable = (result) => {
        if (result && !seenPlayable.has(result.url)) {
            seenPlayable.add(result.url);
            playable.push(result);
            return true;
        }
        return false;
    };

    const directCandidates = unique.filter(s => isDirectVideoUrl(s.url));
    for (const stream of directCandidates) {
        if (playable.length >= TARGET_PLAYABLE) break;
        try { addPlayable(await resolveForExo(stream)); } catch (e) { /* ignore */ }
    }
    console.log(`[Movix] Pass 1 (direct URLs): ${playable.length} playable from ${directCandidates.length} candidate(s)`);

    // ─── Passe 2 : embeds → resolveStream (8s max par host) ──────────────
    // Round-robin par LANGUE : sans ça, l'ordre de priorité (VF d'abord)
    // épuisait le budget sur les lecteurs VF et ne laissait aucune source
    // VOSTFR (ou l'inverse). Chaque tour prend le meilleur candidat restant de
    // chaque langue, jusqu'au plafond global.
    if (playable.length < TARGET_PLAYABLE && !isAborted(signalGuard)) {
        const pending = unique.filter(s => !isDirectVideoUrl(s.url)).slice(0, MAX_RESOLVE);
        const buckets = new Map();
        for (const s of pending) {
            const key = String(s.language || 'OTHER').toUpperCase();
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(s);
        }
        const queues = [...buckets.values()];
        let round = 0;
        while (playable.length < TARGET_PLAYABLE && !isAborted(signalGuard)) {
            if (Date.now() - startTime > BUDGET_MS) break;
            let progressed = false;
            for (const q of queues) {
                if (playable.length >= TARGET_PLAYABLE) break;
                if (Date.now() - startTime > BUDGET_MS) break;
                const stream = q.shift();
                if (!stream) continue;
                progressed = true;
                addPlayable(await resolveForExo(stream));
            }
            if (!progressed) break;
            if (++round > MAX_RESOLVE) break;
        }
    }

    console.log(`[Movix] Total: ${unique.length} streams, ${playable.length} playable (${Date.now() - startTime}ms)`);
    return playable;
}

// ─── Fonction principale d'extraction ────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    if (!tmdbId) { console.log('[Movix] Missing tmdbId'); return []; }

    const isMovie = mediaType === 'movie';

    // NuvioTV (videoId anime kitsu:/mal:/anilist:) envoie season=null + épisode
    // ABSOLU. L'API Movix est indexée par saison : sans reverse-map, on
    // demandait /season/1 avec un numéro absolu → 0 stream.
    const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, { mediaType: isMovie ? 'movie' : 'tv' });
    season = se.season;
    episode = se.episode;
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
    let playable = await resolveStreamsToPlayable(allStreams, getPrefs(), signal);

    // ─── Étape 4 : si rien de playable malgré des streams trouvés (ex: l'unique
    // embed fstream est down), retenter les sources alternatives avant d'abandonner.
    // NB: on ne relance que si les fallback n'ont PAS déjà été tentés en Étape 2
    // (sinon on re-fetcherait les mêmes sources sans gain — doublon d'appels API)
    if (playable.length === 0 && !fallbackTried && !isAborted(signal)) {
        console.log('[Movix] No playable stream after resolution, trying fallback sources (wiflix/j1f/cpasmal)...');
        const fallbackStreams = await fetchFallbackStreams(tmdbId, isMovie, season, episodeNum, signal);
        if (fallbackStreams.length > 0) {
            playable = await resolveStreamsToPlayable(fallbackStreams, getPrefs(), signal);
        }
    }

    return playable;
}
