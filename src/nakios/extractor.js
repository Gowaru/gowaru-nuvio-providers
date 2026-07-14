/**
 * Extractor for Nakios (nakios.store)
 * Films ET séries en streaming via API REST.
 *
 * Cache intelligent :
 * - TTL séparé pour succès (5min) et échec (30s)
 * - Limite de taille avec éviction LRU
 * - Nettoyage périodique des entrées expirées
 *
 * Fallback search :
 * - Si les sources directes par TMDB ID échouent, recherche par titre
 * - Utilise /api/search/multi pour découvrir des TMDB IDs alternatifs
 * - Logging complet pour le debugging
 *
 * Métadonnées enrichies :
 * - Utilise les champs id, name, quality, lang, isPremium, isM3U8, provider
 * - Titre descriptif incluant le provider et la qualité
 */

import { fetchApi, BASE_URL } from './http.js';
import { createCache } from '../utils/cache.js';
import { getTmdbTitle } from '../utils/search-fallback.js';
import { safeConfig } from '../utils/resolvers.js';

const withCache = createCache('nk', 'Nakios');

// ─── Configuration ───────────────────────────────────────────────────────────
// NUVIO_NAKIOS_EXCLUDE_PREMIUM=1 → exclut toutes les sources premium
// Par defaut (0), les sources premium sont utilisees en fallback si aucune
// source libre n'est disponible.
const EXCLUDE_PREMIUM = safeConfig('NUVIO_NAKIOS_EXCLUDE_PREMIUM', 0) === 1;

// ─── URL Filter ───────────────────────────────────────────────────────────────
// Nakios utilise un CDN (sv.citron-edge.lol) qui necessite un header Referer.
// Sans Referer, le CDN redirige vers cheksum.lol → Telegram (t.me/zenhsvr).
// Ce filtre detecte et exclut les URLs invalides ou publicitaires des sources.

/** Domaines bloques (pubs, redirections, anti-leech echoue) */
const BLOCKED_URL_PATTERNS = [
    't.me',
    'telegram.me',
    'telegram.org',
    'cheksum.lol',
    'doubleclick.net',
    'googleadservices.com',
    'googlesyndication.com',
];

/**
 * Verifie si une URL de streaming est valide et jouable.
 * - Rejette les domaines de pub/redirect (Telegram, cheksum, etc.)
 * - Verifie que l'URL a un format valide
 * - Verifie que le protocole est HTTPS
 *
 * @param {string} url - URL a valider
 * @returns {boolean} true si l'URL est valide
 */
function isValidStreamUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase().trim();
    if (!u.startsWith('https://')) return false;

    // Rejeter les patterns bloques
    for (const pattern of BLOCKED_URL_PATTERNS) {
        if (u.includes(pattern)) {
            console.log(`[Nakios] Filtered out blocked URL (${pattern}): ${u.slice(0, 80)}`);
            return false;
        }
    }

    return true;
}

// ─── TMDB Helpers ────────────────────────────────────────────────────────────
// getTmdbTitle est maintenant importé depuis ../utils/search-fallback.js
// (module partagé avec cache global safeFetch 30s)

// ─── API Methods ─────────────────────────────────────────────────────────────

/**
 * Récupère une source de streaming depuis l'API Nakios.
 */
async function fetchSource(path) {
    return withCache(`source_${path}`, async () => {
        const result = await fetchApi(path);
        if (!result) return null;

        if (result.sources && Array.isArray(result.sources) && result.sources.length > 0) {
            // 1. Chercher une source non-premium (libre) en priorite
            for (const source of result.sources) {
                if (source.url && isValidStreamUrl(source.url) && source.isPremium !== true) {
                    return source;
                }
            }

            // 2. Si le flag EXCLUDE_PREMIUM est actif, ne PAS retourner de sources premium
            if (EXCLUDE_PREMIUM) {
                console.log(`[Nakios] Premium sources excluded (NUVIO_NAKIOS_EXCLUDE_PREMIUM=1)`);
                return null;
            }

            // 3. Fallback: source premium si aucune libre trouvee
            for (const source of result.sources) {
                if (source.url && isValidStreamUrl(source.url)) {
                    console.log(`[Nakios] Using premium source (${source.name || '?'}) - no free source available`);
                    return source;
                }
            }
            // Si aucune source valide trouvee, logger et retourner null
            console.warn(`[Nakios] All ${result.sources.length} source(s) filtered out (invalid URLs)`);
            return null;
        }
        if (result.url) {
            if (isValidStreamUrl(result.url)) {
                return result;
            }
            console.warn(`[Nakios] Source filtered out (invalid URL): ${(result.url || '').slice(0, 80)}`);
            return null;
        }
        return null;
    });
}

/**
 * Recherche du contenu sur Nakios par titre.
 * @param {string} query - Titre à rechercher
 * @returns {Promise<Array<{id: number, media_type: string, title: string, name: string}>>}
 */
async function searchContent(query) {
    const path = `/api/search/multi?query=${encodeURIComponent(query)}`;
    return withCache(`search_${query.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, async () => {
        try {
            const result = await fetchApi(path);
            if (!result || !result.results || !Array.isArray(result.results)) {
                return [];
            }
            // Filtrer uniquement movie et tv, retourner les champs utiles
            return result.results
                .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
                .map(r => ({
                    id: r.id,
                    media_type: r.media_type,
                    title: r.title || r.name || '',
                    year: (r.release_date || r.first_air_date || '').slice(0, 4),
                }));
        } catch (e) {
            console.warn(`[Nakios] Search error: ${e?.message}`);
            return [];
        }
    });
}

/**
 * Tente de trouver une source via le fallback search.
 * Stratégie : récupère le titre TMDB, cherche sur Nakios, puis réessaie les sources
 * avec les IDs TMDB trouvés (utile si l'ID original n'est pas indexé).
 *
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number} season
 * @param {number} episode
 * @returns {Promise<object|null>}
 */
async function fallbackSearch(tmdbId, mediaType, season, episode) {
    console.log(`[Nakios] Fallback search for ${mediaType} ${tmdbId}...`);

    // 1. Récupérer le titre depuis TMDB
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) {
        console.warn(`[Nakios] Fallback: cannot get TMDB title for ${tmdbId}`);
        return null;
    }

    // 2. Chercher sur Nakios par titre
    const results = await searchContent(title);
    if (results.length === 0) {
        // Essayer avec le titre simplifié (avant le premier ':')
        const shortTitle = title.split(':')[0].trim();
        if (shortTitle !== title) {
            const results2 = await searchContent(shortTitle);
            if (results2.length > 0) {
                return trySearchResults(results2, tmdbId, mediaType, season, episode);
            }
        }
        console.warn(`[Nakios] Fallback: no results for \"${title}\"`);
        return null;
    }

    return trySearchResults(results, tmdbId, mediaType, season, episode);
}

/**
 * Parcourt les résultats de recherche et tente de récupérer une source
 * avec les TMDB IDs alternatifs trouvés.
 */
async function trySearchResults(results, originalTmdbId, mediaType, season, episode) {
    console.log(`[Nakios] Fallback: ${results.length} result(s) from search`);

    // Logger tous les résultats pour debugging
    for (const r of results) {
        console.log(`[Nakios]   → ${r.media_type} ${r.id}: \"${r.title}\" (${r.year})`);
    }

    // Trier : mettre l'ID original en premier (si trouvé), puis les autres
    const sorted = [...results].sort((a, b) => {
        if (a.id === Number(originalTmdbId)) return -1;
        if (b.id === Number(originalTmdbId)) return 1;
        return 0;
    });

    // Essayer chaque ID (limité à 3 tentatives pour éviter le spam)
    const attempts = sorted.slice(0, 3);
    for (const r of attempts) {
        if (r.id === Number(originalTmdbId)) {
            console.log(`[Nakios] Fallback: TMDB ${r.id} matches original, already tried`);
            continue;
        }

        console.log(`[Nakios] Fallback: trying TMDB ${r.id} (${r.title})`);

        // Utiliser le media_type du résultat de recherche (pas l'original)
        let altPath;
        if (r.media_type === 'movie') {
            altPath = `/api/sources/movie/${r.id}`;
        } else if (r.media_type === 'tv') {
            altPath = `/api/sources/tv/${r.id}/${Number(season) || 1}/${Number(episode) || 1}`;
        } else {
            console.log(`[Nakios] Fallback: skipping ${r.id} (unknown type: ${r.media_type})`);
            continue;
        }

        const source = await fetchSource(altPath);
        if (source && source.url) {
            console.log(`[Nakios] Fallback SUCCESS: TMDB ${r.id} → source found!`);
            return source;
        }
    }

    console.warn(`[Nakios] Fallback: no alternate ID yielded a source`);
    return null;
}

/**
 * Crée un objet stream enrichi à partir de la réponse API.
 * @param {object} source - Objet source de l'API Nakios
 * @returns {object} Objet stream standardisé
 */
function createStream(source) {
    const quality = source.quality || 'HD';
    const language = source.lang || source.language || 'VF';
    const providerName = source.name || source.provider || 'Nakios';
    const isHls = source.isM3U8 === true;
    const format = isHls ? 'hls' : 'mp4';

    const stream = {
        name: providerName,
        title: `[${language}] ${providerName} - ${quality}`,
        url: source.url,
        quality: quality,
        language: language,
        type: format,
        headers: {
            'Referer': `${BASE_URL}/`,
            'Origin': BASE_URL,
        },
    };

    // Enrichissement : champs supplémentaires de l'API
    if (source.id) {
        stream.id = source.id;
    }
    if (source.isPremium === true) {
        stream.isPremium = true;
    }
    if (source.isEmbed === true) {
        stream.isEmbed = true;
    }
    if (source.size) {
        stream.size = source.size;
    }

    return stream;
}

// ─── Main Export ────────────────────────────────────────────────────────────

/**
 * Point d'entrée principal.
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number} season
 * @param {number} episode
 * @returns {Promise<Array>}
 */
export async function extractStreams(tmdbId, mediaType, season, episode) {
    console.log(`[Nakios] Looking up ${mediaType} ${tmdbId}`);

    // Étape 1: Construire le chemin API direct
    let apiPath;
    if (mediaType === 'movie') {
        apiPath = `/api/sources/movie/${tmdbId}`;
    } else {
        const targetSeason = Number(season) || 1;
        const targetEpisode = Number(episode) || 1;
        apiPath = `/api/sources/tv/${tmdbId}/${targetSeason}/${targetEpisode}`;
        console.log(`[Nakios] Looking for S${targetSeason}E${targetEpisode} (TMDB: ${tmdbId})`);
    }

    // Étape 2: Tentative directe
    let source = await fetchSource(apiPath);

    // Étape 3: Fallback search si la tentative directe échoue
    if (!source || !source.url) {
        console.warn(`[Nakios] No source for ${apiPath}, trying search fallback...`);
        source = await fallbackSearch(tmdbId, mediaType, season, episode);
    }

    // Étape 4: Si toujours rien trouvé, abandon
    if (!source || !source.url) {
        console.warn(`[Nakios] No source found for ${mediaType} ${tmdbId}`);
        return [];
    }

    // Étape 5: Créer le stream enrichi
    const stream = createStream(source);
    console.log(`[Nakios] Stream: ${stream.quality} ${stream.type} | ${stream.name} | ${stream.language}`);

    return [stream];
}
