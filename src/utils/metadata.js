/**
 * Shared Metadata Utilities
 * Uses the TMDB JSON API (much more reliable than HTML scraping in apps)
 */

const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

/** Budget total des appels TMDB par titre (ms) — plafond dur, cf. fetchTmdb. */
const METADATA_BUDGET_MS = 20000;
/**
 * Budget restant minimum pour l'appel `translations` — celui qui fournit le
 * **titre FR** (priorité 1 après le main, indispensable aux sites FR).
 */
const METADATA_TRANS_MIN_MS = 4000;
/**
 * Budget restant minimum pour l'appel `alternative_titles` (bonus) ET pour
 * lancer les deux en parallèle. Sur NuvioTV ils s'exécutent de toute façon en
 * SÉRIE (fetch bloquant) : 2 RTT sur le chemin critique.
 */
const METADATA_ALT_MIN_MS = 8000;
/**
 * UA applicatif court utilisé UNIQUEMENT pour l'API AniList (voir aniListMedia) :
 * un UA Chrome complet y déclenche un challenge Cloudflare 403.
 */
const ANILIST_USER_AGENT = 'Nuvio-Providers/1.0';

import { safeFetch, sleep } from './resolvers.js';

/**
 * Fetch TMDB avec timeout court + 1 retry, plafonné par le budget restant.
 * Symptôme corrigé : un TMDB lent/timeout (sans timeout explicite, safeFetch
 * attend le read-timeout réseau ~30s sur l'app) vidait les titres → le provider
 * abandonnait silencieusement (0 titres → 0 streams → "Retrieving…" vide).
 *
 * ⚠️ Budget : sur NuvioTV, fetch est un bridge SYNCHRONE (OkHttp execute) →
 * Promise.all s'exécute séquentiellement. 3 endpoints × 2 tentatives × 30s
 * dépasserait le budget 45s tout seul — d'où le plafond deadline ici.
 *
 * @param {string} url
 * @param {number} attempts - nombre de tentatives (défaut 2)
 * @param {number} deadline - timestamp Date.now() au-delà duquel on abandonne
 */
async function fetchTmdb(url, attempts = 2, deadline = 0) {
    for (let i = 0; i < attempts; i++) {
        if (deadline && Date.now() >= deadline) return null;
        const remaining = deadline ? deadline - Date.now() : 0;
        const timeout = Math.min(8000, Math.max(2000, remaining));
        const res = await safeFetch(url, { timeout });
        if (res && res.ok) return res;
        if (i < attempts - 1) await sleep(400);
    }
    return null;
}

/**
 * Cache dédié aux métadonnées TMDB avec TTL long (5 minutes).
 * Les données TMDB changent rarement (titre, année, genres) →
 * un TTL long élimine les fetches répétés pendant une session de visionnage.
 * LRU simple : au-delà de 500 entrées, on vide les plus anciennes.
 */
const METADATA_CACHE = new Map();
const METADATA_TTL = 5 * 60 * 1000; // 5 minutes
const METADATA_MAX = 500;

function metadataCacheGet(key) {
    const entry = METADATA_CACHE.get(key);
    if (entry && Date.now() - entry.ts < METADATA_TTL) return entry.data;
    if (entry) METADATA_CACHE.delete(key); // expired
    return null;
}

function metadataCacheSet(key, data) {
    if (METADATA_CACHE.size >= METADATA_MAX) {
        // Supprimer les 100 plus anciennes entrées
        const oldest = [...METADATA_CACHE.entries()]
            .sort((a, b) => a[1].ts - b[1].ts)
            .slice(0, 100)
            .map(([k]) => k);
        for (const k of oldest) METADATA_CACHE.delete(k);
    }
    METADATA_CACHE.set(key, { data, ts: Date.now() });
}

const SEASON_SUFFIXES = [
    (s) => `Season ${s}`,
    (s) => `Saison ${s}`,
    (s) => `S${s}`,
];

function isLatinText(str) {
    return /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()0-9]+$/.test(str);
}

/**
 * Check if the given ID is in Kitsu format: kitsu:{id}:{season?}
 * @param {string|number} id
 * @returns {RegExpMatchArray|null} Match groups [fullMatch, kitsuId, seasonFromId] or null
 */
function parseKitsuId(id) {
    const strId = String(id);
    return strId.match(/^kitsu:(\d+)(?::(\d+))?$/);
}

/**
 * Ids traceurs non-TMDB que les apps peuvent passer à getStreams() :
 * `mal:63375`, `anilist:12345`, `anidb:6789` (+ suffixe d'épisode absolu
 * éventuel conservé par l'app sur NuvioTV).
 * TMDB ne les connaît pas : sans résolution, les 3 endpoints TMDB renvoient
 * 404 et le provider finissait avec 0 titre → 0 stream.
 * @param {string} id
 * @returns {{tracker: string, externalId: string, absEpisode: number|null}|null}
 */
function parseTrackerId(id) {
    const match = String(id || '').match(/^(mal|anilist|anidb|tvdb):(\d+)(?::(\d+))?$/i);
    if (!match) return null;
    return {
        tracker: match[1].toLowerCase(),
        externalId: match[2],
        absEpisode: match[3] ? parseInt(match[3], 10) : null,
    };
}

/**
 * Résout un id traceur via l'API publique AniList (GraphQL, sans clé API).
 * anidb/tvdb ne sont pas couverts (pas d'API simple) → null (échec rapide).
 * @returns {Promise<{idMal: number, title: {romaji?: string, english?: string, native?: string}}|null>}
 */
async function aniListMedia(tracker) {
    if (!tracker || tracker.tracker === 'anidb' || tracker.tracker === 'tvdb') return null;
    const isAniList = tracker.tracker === 'anilist';
    const query = isAniList
        ? 'query($id: Int){Media(id: $id, type: ANIME){idMal title{romaji english native}}}'
        : 'query($idMal: Int){Media(idMal: $idMal, type: ANIME){idMal title{romaji english native}}}';
    const variables = isAniList
        ? { id: Number(tracker.externalId) }
        : { idMal: Number(tracker.externalId) };
    if (!Number.isFinite(variables.id ?? variables.idMal)) return null;
    try {
        // ⚠️ UA volontairement NON-navigateur : Cloudflare (devant AniList)
        // renvoie un challenge 403 « Just a moment… » au UA Chrome complet,
        // mais 200 avec un UA applicatif court (vérifié). safeFetch fusionne
        // BASE_HEADERS avant rest.headers → cet override gagne.
        const res = await safeFetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'User-Agent': ANILIST_USER_AGENT,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ query, variables }),
            // Timeout court : AniList est derrière Cloudflare, un challenge 403
            // répond vite — inutile de brûler du budget TV pour un id annexe.
            timeout: 6000,
        });
        if (!res || !res.ok) return null;
        let data = null;
        try { data = await res.json(); } catch (e) { return null; }
        return data && data.data && data.data.Media ? data.data.Media : null;
    } catch (e) {
        return null;
    }
}

/**
 * Titres exploitables pour un id traceur : AniList → titre → TMDB (pour
 * récupérer le jeu de titres standard + les métadonnées anime), sinon repli
 * sur les titres AniList bruts.
 */
async function trackerTitles(tracker, mediaType, opts) {
    const media = await aniListMedia(tracker);
    if (!media || !media.title) {
        console.warn(`[Metadata] Tracker ${tracker.tracker}:${tracker.externalId} non résolu (0 requête TMDB dépensée)`);
        return [];
    }
    const candidates = [media.title.english, media.title.romaji, media.title.native]
        .map(t => (t || '').trim())
        .filter(Boolean);
    for (const candidate of candidates) {
        const tmdbId = await searchTmdbByTitle(candidate, mediaType);
        if (!tmdbId) continue;
        const titles = await getTMDBTitlesById(String(tmdbId), mediaType, opts);
        if (titles && titles.length > 0) {
            console.log(`[Metadata] ${tracker.tracker}:${tracker.externalId} → TMDB ${tmdbId} via "${candidate}"`);
            return titles;
        }
    }
    console.log(`[Metadata] AniList titles used directly for ${tracker.tracker}:${tracker.externalId}`);
    return candidates;
}

/**
 * Résout un IMDb ID (tt1234567) en TMDB ID via /find (pas de 404 systématique).
 */
async function resolveImdbToTmdb(imdbId, mediaType) {
    if (!/^tt\d+$/i.test(imdbId)) return null;
    const url = `${TMDB_API_BASE}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const res = await fetchTmdb(url, 1);
    if (!res) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { return null; }
    const list = (mediaType === 'movie' ? data && data.movie_results : data && data.tv_results) || [];
    const first = list[0];
    return first && first.id ? String(first.id) : null;
}

/**
 * Search TMDB by English title to find the TMDB ID.
 * @param {string} title - The English title to search for
 * @param {'tv'|'movie'} mediaType
 * @returns {Promise<number|null>} The TMDB ID, or null if not found
 */
async function searchTmdbByTitle(title, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const encoded = encodeURIComponent(title);
    const url = `${TMDB_API_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encoded}`;
    const res = await safeFetch(url);
    if (!res) return null;
    let data;
    try {
        data = await res.json();
    } catch {
        return null;
    }
    const results = data?.results;
    if (!results || !results.length) return null;
    return results[0].id;
}

/**
 * Get multiple titles for an anime from Kitsu ID.
 * First tries to resolve to TMDB ID via English title search for better title compatibility.
 * Falls back to Kitsu API titles if TMDB search fails.
 * 
 * @param {string|number} kitsuId
 * @param {'tv'|'movie'} mediaType
 * @param {object} [opts]
 * @param {number} [opts.season] - If provided, generates "Title Season N" variants
 * @returns {Promise<string[]>}
 */
async function getKitsuTitles(kitsuId, mediaType, opts = {}) {
    const url = `https://kitsu.io/api/edge/anime/${kitsuId}`;
    const res = await safeFetch(url);
    if (!res) {
        console.log(`[Metadata] Kitsu API error: failed to fetch ${kitsuId}`);
        return [];
    }
    
    let data;
    try {
        data = await res.json();
    } catch (e) {
        console.log(`[Metadata] Kitsu API error: invalid JSON for ${kitsuId}`);
        return [];
    }
    
    const anime = data?.data?.attributes;
    if (!anime) {
        console.log(`[Metadata] Kitsu API error: no anime data for ${kitsuId}`);
        return [];
    }
    
    // Try to find TMDB ID via English title search for better provider compatibility
    const enTitle = anime.titles?.en?.trim();
    if (enTitle) {
        const foundTmdbId = await searchTmdbByTitle(enTitle, mediaType);
        if (foundTmdbId) {
            console.log(`[Metadata] Kitsu ${kitsuId} -> TMDB ${foundTmdbId} via "${enTitle}"`);
            return await getTMDBTitlesById(String(foundTmdbId), mediaType, opts);
        }
    }
    
    // Fallback: build titles from Kitsu API directly if TMDB search fails
    const titles = [];
    
    const canonicalTitle = anime.canonicalTitle?.trim();
    
    // English title first (better for slug generation)
    if (enTitle) titles.push(enTitle);
    if (canonicalTitle && !titles.some(t => t.toLowerCase() === canonicalTitle.toLowerCase())) {
        titles.push(canonicalTitle);
    }
    
    const jaTitle = anime.titles?.ja_jp?.trim();
    if (jaTitle && !titles.some(t => t.toLowerCase() === jaTitle.toLowerCase()) && isLatinText(jaTitle)) {
        titles.push(jaTitle);
    }
    
    const abbrTitles = anime.abbreviatedTitles || [];
    for (const t of abbrTitles) {
        const trimmed = t?.trim();
        if (trimmed && !titles.some(existing => existing.toLowerCase() === trimmed.toLowerCase()) && isLatinText(trimmed)) {
            titles.push(trimmed);
        }
    }
    
    const season = opts.season ? parseInt(opts.season, 10) : null;
    if (season && season > 0) {
        const baseTitles = [enTitle, canonicalTitle].filter(Boolean);
        for (const baseTitle of baseTitles) {
            for (const suffix of SEASON_SUFFIXES) {
                const variant = `${baseTitle} ${suffix(season)}`;
                if (!titles.some(t => t.toLowerCase() === variant.toLowerCase())) {
                    titles.push(variant);
                }
            }
        }
    }
    
    // Attacher les métadonnées (année extraite de startDate)
    const dateStr = anime.startDate;
    const year = dateStr && dateStr.length >= 4 && /^\d{4}/.test(dateStr) ? parseInt(dateStr.substring(0, 4), 10) : null;

    titles._metadata = {
        isAnime: (anime.originalLanguage || '') === 'ja',
        name: anime.canonicalTitle || '',
        originalLanguage: anime.originalLanguage || '',
        year: year
    };

    console.log(`[Metadata] Kitsu fallback titles for ${kitsuId}: ${titles.join(' | ')}`);
    return titles;
}

/**
 * Fetch TMDB titles by TMDB ID directly (no Kitsu detection).
 * Returns an array with [English title, French title, Original title (romaji)]
 * All unique values, ordered by priority for searching.
 * Generates season-aware variants (e.g. "Overlord Season 1") for TV.
 * Le tableau retourné a une propriété _metadata attachée contenant
 * { isAnime, name, originalLanguage } pour éviter un fetch supplémentaire.
 *
 * @param {string|number} tmdbId
 * @param {'tv'|'movie'} mediaType
 * @param {object} [opts]
 * @param {number} [opts.season] - If provided, generates "Title Season N" variants
 * @returns {Promise<string[]>}
 */
async function getTMDBTitlesById(tmdbId, mediaType, opts = {}) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const season = opts.season ? parseInt(opts.season, 10) : null;
    const cacheKey = `tmdb:${tmdbId}:${type}:${season || ''}`;

    // Cache dédié : les données TMDB changent rarement
    const cached = metadataCacheGet(cacheKey);
    if (cached) {
        console.log(`[Metadata] Cache HIT for ${cacheKey}`);
        return cached;
    }

    const titles = [];
    let metadata = null;

    try {
        const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
        const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;

        // Budget metadata serré : les 3 endpoints sont appelés SÉQUENTIELLEMENT
        // sur NuvioTV (fetch synchrone) — au-delà de ~20s ici, le provider
        // n'a plus le temps de scraper → on livre ce qu'on a.
        const deadline = Date.now() + METADATA_BUDGET_MS;
        // mainRes d'abord (priorité) : titres EN/original + métadonnées + saisons
        const mainRes = await fetchTmdb(mainUrl, 2, deadline);
        // alt/trans = enrichissements : 1 seule tentative chacun, best-effort.
        // ⚠️ Sur NuvioTV ils s'exécutent SÉQUENTIELLEMENT (fetch bloquant) :
        // 2 RTT de plus sur le chemin critique pour des titres secondaires.
        // On les saute si le budget restant est trop court (ou opts.allowEnrichment=false).
        const remaining = () => deadline - Date.now();
        const enrichAllowed = opts.allowEnrichment !== false;
        let altRes = null;
        let transRes = null;
        if (enrichAllowed && remaining() > METADATA_ALT_MIN_MS) {
            // Budget confortable : les deux (réellement parallèle sur Mobile).
            [altRes, transRes] = await Promise.all([
                fetchTmdb(altUrl, 1, deadline),
                fetchTmdb(transUrl, 1, deadline)
            ]);
        } else if (enrichAllowed && remaining() > METADATA_TRANS_MIN_MS) {
            // Budget juste : on garde LA priorité, le titre FR.
            transRes = await fetchTmdb(transUrl, 1, deadline);
        }

        if (mainRes) {
            const mainJson = await mainRes.json();
            const data = mainJson != null ? mainJson : {};
            const titleEn = (type === 'movie' ? data.title : data.name)?.trim();
            const titleOriginal = (type === 'movie' ? data.original_title : data.original_name)?.trim();

            // Extraire les métadonnées depuis la même réponse (aucun fetch supplémentaire)
            if (data) {
                const dateStr = type === 'movie' ? data.release_date : data.first_air_date;
                const year = dateStr && dateStr.length >= 4 && /^\d{4}/.test(dateStr) ? parseInt(dateStr.substring(0, 4), 10) : null;

                metadata = {
                    isAnime: data.original_language === 'ja' || (data.genres || []).some(g => g.id === 16),
                    name: data.name || data.title || '',
                    originalLanguage: data.original_language || '',
                    year: year
                };

                // Comptage d'épisodes par saison (utile pour les providers dont les
                // séries ont des saisons regroupées, ex: waveanime format 'kai')
                // → permet de calculer un numéro d'épisode "continu" multi-saisons
                if (type === 'tv' && Array.isArray(data.seasons)) {
                    const counts = {};
                    for (const s of data.seasons) {
                        if (s && s.season_number > 0 && s.episode_count > 0) {
                            counts[s.season_number] = s.episode_count;
                        }
                    }
                    if (Object.keys(counts).length > 0) {
                        metadata.seasonEpisodeCounts = counts;
                    }
                }
            }

            if (titleEn) titles.push(titleEn);
            if (titleOriginal && titleOriginal !== titleEn && isLatinText(titleOriginal)) {
                titles.push(titleOriginal);
            }

            if (mediaType !== 'movie' && opts.season) {
                const s = parseInt(opts.season, 10);
                if (s > 0 && titleEn) {
                    for (const suffix of SEASON_SUFFIXES) {
                        const variant = `${titleEn} ${suffix(s)}`;
                        if (!titles.includes(variant)) titles.push(variant);
                    }
                }
                if (s > 0 && titleOriginal && titleOriginal !== titleEn && isLatinText(titleOriginal)) {
                    for (const suffix of SEASON_SUFFIXES) {
                        const variant = `${titleOriginal} ${suffix(s)}`;
                        if (!titles.includes(variant)) titles.push(variant);
                    }
                }
            }
        }

        if (altRes) {
            const altJson = await altRes.json();
            const altData = altJson != null ? altJson : {};
            const altList = type === 'movie' ? altData.titles : altData.results;
            if (altList && Array.isArray(altList)) {
                altList.forEach(alt => {
                    const t = alt.title?.trim();
                    if (t && !titles.some(existing => existing.toLowerCase() === t.toLowerCase()) && isLatinText(t)) {
                        titles.push(t);
                    }
                });
            }
        }

        if (transRes) {
            const transJson = await transRes.json();
            const transData = transJson != null ? transJson : {};
            const frTrans = (transData.translations || []).find(t => t.iso_639_1 === 'fr');
            const titleFr = frTrans?.data?.name?.trim() || frTrans?.data?.title?.trim();
            if (titleFr && !titles.some(existing => existing.toLowerCase() === titleFr.toLowerCase())) {
                titles.splice(1, 0, titleFr);
            }
            if (mediaType !== 'movie' && opts.season && titleFr) {
                const s = parseInt(opts.season, 10);
                if (s > 0) {
                    const frVar = `${titleFr} Saison ${s}`;
                    if (!titles.some(existing => existing.toLowerCase() === frVar.toLowerCase())) {
                        const frIndex = titles.indexOf(titleFr);
                        if (frIndex !== -1) {
                            titles.splice(frIndex + 1, 0, frVar);
                        } else {
                            titles.splice(2, 0, frVar);
                        }
                    }
                }
            }
        }

    } catch (e) {
        console.error(`[Metadata] TMDB API error: ${e.message}`);
    }

    const seen = new Set();
    const uniqueTitles = titles.filter(t => {
        const key = t.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Attacher les métadonnées au tableau pour éviter un fetch supplémentaire
    if (metadata) {
        uniqueTitles._metadata = metadata;
    }

    // Mettre en cache pour les prochaines requêtes (TTL 5 min).
    // ⚠️ Ne JAMAIS cacher un résultat vide dû à une erreur réseau : un simple
    // blip TMDB empoisonnerait le cache 5 min → 0 streams même quand le
    // réseau revient (symptôme "Retrieving… vide" persistant).
    if (uniqueTitles.length > 0 || metadata) {
        metadataCacheSet(cacheKey, uniqueTitles);
    }

    console.log(`[Metadata] Titles for ${tmdbId}: ${uniqueTitles.join(' | ')}`);
    return uniqueTitles;
}

/**
 * Cherche un anime sur Kitsu par nom, valide le résultat,
 * puis tente de trouver le bon TMDB ID.
 * Ne retourne des titres que si la correspondance est solide (titre japonais présent).
 */
async function kitsuSearchFallback(tmdbName, mediaType, opts) {
    try {
        if (!tmdbName || tmdbName.length < 3) return [];

        // Cache dédié Kitsu fallback
        const season = opts.season ? parseInt(opts.season, 10) : null;
        const cacheKey = `kitsu-fb:${tmdbName.toLowerCase()}:${mediaType}:${season || ''}`;
        const cached = metadataCacheGet(cacheKey);
        if (cached) {
            console.log(`[Metadata] Kitsu fallback cache HIT for "${tmdbName}"`);
            return cached;
        }

        const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(tmdbName)}&page[limit]=5`;
        const res = await safeFetch(url);
        if (!res) return [];
        const data = await res.json();
        if (!data?.data?.length) return [];

        for (const anime of data.data) {
            const attrs = anime.attributes || {};
            const jaTitle = attrs.titles?.ja_jp?.trim();
            const canonicalTitle = attrs.canonicalTitle?.trim();
            const enTitle = attrs.titles?.en?.trim() || canonicalTitle;

            // Valider : doit avoir un titre japonais (confirme que c'est un anime)
            if (!jaTitle && attrs.originalLanguage !== 'ja') continue;
            if (!enTitle) continue;

            console.log(`[Metadata] Kitsu search: "${tmdbName}" → "${enTitle}" (ja=${!!jaTitle})`);

            // Rechercher ce titre sur TMDB
            const foundTmdbId = await searchTmdbByTitle(enTitle, mediaType);
            if (foundTmdbId) {
                // Utiliser getTMDBTitlesById qui contient maintenant les métadonnées intégrées
                const altTitles = await getTMDBTitlesById(String(foundTmdbId), mediaType, opts);
                const meta = altTitles._metadata;
                if (meta && meta.isAnime) {
                    console.log(`[Metadata] Fallback success: TMDB ID ${foundTmdbId} for "${enTitle}"`);
                    metadataCacheSet(cacheKey, altTitles);
                    return altTitles;
                }
            }

            // Dernier recours : utiliser les titres Kitsu directement
            console.log(`[Metadata] Fallback: using Kitsu titles directly for ${anime.id}`);
            const kitsuTitles = await getKitsuTitles(anime.id, mediaType, opts);
            metadataCacheSet(cacheKey, kitsuTitles);
            return kitsuTitles;
        }

        console.log(`[Metadata] Kitsu search: no valid results for "${tmdbName}"`);
        return [];
    } catch (e) {
        console.warn(`[Metadata] Kitsu fallback error: ${e.message}`);
        return [];
    }
}

/**
 * Get multiple titles for a given ID (supports TMDB IDs and Kitsu IDs).
 * Detects ID format and dispatches to the appropriate handler.
 * Validation intégrée : si un TMDB ID pointe vers du contenu non-anime,
 * tente un fallback automatique via Kitsu.
 * Pas de map hardcodée, solution scalable.
 *
 * @param {string|number} id
 * @param {'tv'|'movie'} mediaType
 * @param {object} [opts]
 * @param {number} [opts.season] - If provided, generates "Title Season N" variants
 * @returns {Promise<string[]>}
 */
export async function getTmdbTitles(id, mediaType, opts = {}) {
    // Certaines apps passent l'id préfixé (`tmdb:129`, `tmdb/129`, `movie:129`).
    const strId = (id == null ? '' : String(id).trim())
        .replace(/^tmdb[:/]/i, '')
        .replace(/^(?:movie|series)[:/]/i, '');
    const kitsuMatch = parseKitsuId(strId);
    let effectiveSeason = opts.season != null ? opts.season : null;

    console.log(`[Metadata] getTmdbTitles: id="${strId}" type="${mediaType}" season=${opts.season}`);

    // Si l'ID est un Kitsu ID, le traiter directement
    if (kitsuMatch) {
        const kitsuId = kitsuMatch[1];
        const seasonFromId = kitsuMatch[2] ? parseInt(kitsuMatch[2], 10) : null;
        effectiveSeason = opts.season != null ? opts.season : seasonFromId;
        console.log(`[Metadata] Kitsu ID detected: ${kitsuId}, season=${effectiveSeason}`);
        const titles = await getKitsuTitles(kitsuId, mediaType, { ...opts, season: effectiveSeason });
        titles.effectiveSeason = effectiveSeason;
        return titles;
    }

    // Gérer les IDs null/undefined/empty
    if (!strId) {
        console.error(`[Metadata] Invalid/null TMDB ID received: "${id}"`);
        const emptyTitles = [];
        emptyTitles.effectiveSeason = effectiveSeason;
        return emptyTitles;
    }

    // IDs traceurs (mal/anilist/anidb/tvdb) : TMDB ne les connaît pas, on passe
    // par AniList. Sans cette branche, 3 requêtes TMDB en 404 et 0 titre.
    const tracker = parseTrackerId(strId);
    if (tracker) {
        if (opts.season == null && tracker.absEpisode != null) {
            effectiveSeason = tracker.absEpisode;
        }
        const titles = await trackerTitles(tracker, mediaType, { ...opts, season: effectiveSeason });
        titles.effectiveSeason = effectiveSeason;
        return titles;
    }

    // ID ni numérique ni traceur : seul `tt…` est résoluble (TMDB /find).
    // Sinon échec RAPIDE, sans dépenser une seule requête TMDB.
    let contentId = strId;
    if (!/^\d+$/.test(strId)) {
        const imdbId = /^tt\d+$/i.test(strId) ? strId : (/^imdb:/i.test(strId) ? strId.slice(5) : null);
        const resolved = imdbId ? await resolveImdbToTmdb(imdbId, mediaType) : null;
        if (!resolved) {
            console.warn(`[Metadata] ID non-TMDB non résolu: "${strId}" → aucun titre (échec rapide, 0 requête TMDB)`);
            const emptyTitles = [];
            emptyTitles.effectiveSeason = effectiveSeason;
            return emptyTitles;
        }
        console.log(`[Metadata] ID ${strId} → TMDB ${resolved}`);
        contentId = resolved;
    }

    // Obtenir les titres TMDB par ID (les métadonnées sont intégrées, pas de fetch supplémentaire)
    const titles = await getTMDBTitlesById(contentId, mediaType, opts);

    // Validation intégrée via les métadonnées attachées par getTMDBTitlesById
    if (mediaType !== 'movie' && titles.length > 0 && titles._metadata) {
        const meta = titles._metadata;
        
        if (!meta.isAnime) {
            console.warn(`[Metadata] ⚠ ID ${contentId} = "${meta.name}" (${meta.originalLanguage}) - not anime!`);
            
            // Fallback Kitsu uniquement si le contenu a des caractéristiques anime
            // (langue originale japonaise ou présence de caractères japonais dans le nom)
            // Évite les faux positifs comme Game of Thrones transformé en Disgaea
            const hasJapaneseName = /[\u3000-\u9FFF\uF900-\uFAFF]/.test(meta.name || '')
            const hasJapaneseLang = meta.originalLanguage === 'ja'
            
            if (hasJapaneseLang || hasJapaneseName) {
                const altTitles = await kitsuSearchFallback(titles[0], mediaType, opts);
                if (altTitles.length > 0) {
                    console.log(`[Metadata] Fallback success: ${altTitles.length} alternative titles`);
                    altTitles.effectiveSeason = effectiveSeason;
                    return altTitles;
                }
                console.warn(`[Metadata] Kitsu fallback failed for "${meta.name}", using original titles`);
            } else {
                console.log(`[Metadata] No anime indicators, skipping Kitsu fallback for "${meta.name}"`);
            }
        } else {
            console.log(`[Metadata] ✓ ID ${contentId}: "${meta.name}" confirmed anime (${meta.originalLanguage})`);
        }
    }

    titles.effectiveSeason = effectiveSeason;
    return titles;
}
