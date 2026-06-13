/**
 * Shared Metadata Utilities
 * Uses the TMDB JSON API (much more reliable than HTML scraping in apps)
 */

const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

import { safeFetch } from './resolvers.js';

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
    const titles = [];
    let metadata = null;

    try {
        const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
        const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;

        const [mainRes, altRes, transRes] = await Promise.all([
            safeFetch(mainUrl),
            safeFetch(altUrl),
            safeFetch(transUrl)
        ]);

        if (mainRes) {
            const mainJson = await mainRes.json();
            const data = mainJson != null ? mainJson : {};
            const titleEn = (type === 'movie' ? data.title : data.name)?.trim();
            const titleOriginal = (type === 'movie' ? data.original_title : data.original_name)?.trim();

            // Extraire les métadonnées depuis la même réponse (aucun fetch supplémentaire)
            if (data) {
                metadata = {
                    isAnime: data.original_language === 'ja' || (data.genres || []).some(g => g.id === 16),
                    name: data.name || data.title || '',
                    originalLanguage: data.original_language || ''
                };
            }

            if (titleEn) titles.push(titleEn);
            if (titleOriginal && titleOriginal !== titleEn && isLatinText(titleOriginal)) {
                titles.push(titleOriginal);
            }

            if (mediaType === 'tv' && opts.season) {
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
            if (mediaType === 'tv' && opts.season && titleFr) {
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
                    return altTitles;
                }
            }

            // Dernier recours : utiliser les titres Kitsu directement
            console.log(`[Metadata] Fallback: using Kitsu titles directly for ${anime.id}`);
            return await getKitsuTitles(anime.id, mediaType, opts);
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
    const kitsuMatch = parseKitsuId(id);
    let effectiveSeason = opts.season != null ? opts.season : null;

    console.log(`[Metadata] getTmdbTitles: id="${id}" type="${mediaType}" season=${opts.season}`);

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
    if (!id) {
        console.error(`[Metadata] Invalid/null TMDB ID received: "${id}"`);
        const emptyTitles = [];
        emptyTitles.effectiveSeason = effectiveSeason;
        return emptyTitles;
    }

    // Obtenir les titres TMDB par ID (les métadonnées sont intégrées, pas de fetch supplémentaire)
    const titles = await getTMDBTitlesById(id, mediaType, opts);

    // Validation intégrée via les métadonnées attachées par getTMDBTitlesById
    if (mediaType === 'tv' && titles.length > 0 && titles._metadata) {
        const meta = titles._metadata;
        
        if (!meta.isAnime) {
            console.warn(`[Metadata] ⚠ ID ${id} = "${meta.name}" (${meta.originalLanguage}) - not anime!`);
            
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
            console.log(`[Metadata] ✓ ID ${id}: "${meta.name}" confirmed anime (${meta.originalLanguage})`);
        }
    }

    titles.effectiveSeason = effectiveSeason;
    return titles;
}
