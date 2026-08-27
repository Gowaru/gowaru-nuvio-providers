/**
 * Extractor for Papadustream (papadustream.club)
 * Séries TV uniquement — les films sont protégés par authentification.
 *
 * Cache intelligent :
 * - TTL séparé pour succès (5min) et échec (30s)
 * - Limite de taille avec éviction LRU
 * - Nettoyage périodique des entrées expirées
 * - Cache clé sécurisé (normalisation)
 *
 * Fonctionnement :
 * 1. Convertit TMDB ID → IMDb ID (TMDB external_ids, fallback recherche)
 * 2. Résout les épisodes cibles via ArmSync (resolveTargetEpisodes)
 * 3. Fetch la page série sur papadustream (avec cache)
 * 4. Extrait les URLs HLS (playlist.m3u8) du HTML de la page
 * 5. Filtre par saison et épisode cibles
 * 6. Crée des objets stream standardisés via toStream
 * 7. Les playlists HLS contiennent multi-qualité (360p→1080p) et multi-audio
 */

import { fetchText, BASE_URL, setCurrentSignal } from './http.js';
import { safeFetch, isAborted } from '../utils/resolvers.js';
import { toStream, resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { createCache } from '../utils/cache.js';

const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

// ─── Cache intelligent (partagé) ─────────────────────────────────────────────
const withCache = createCache('pd', 'Papadustream');

// ─── TMDB Helpers ───────────────────────────────────────────────────────────

/**
 * Récupère l'IMDb ID (tt...) depuis TMDB via external_ids.
 */
async function getImdbIdFromTmdb(tmdbId) {
    const url = `${TMDB_API_BASE}/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    return withCache(`imdb_${tmdbId}`, async () => {
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
 * Récupère le titre d'une série TMDB (pour fallback recherche).
 */
async function getTmdbSeriesTitle(tmdbId) {
    const url = `${TMDB_API_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`;
    return withCache(`title_${tmdbId}`, async () => {
        try {
            const res = await safeFetch(url);
            if (!res) return null;
            const data = await res.json();
            if (!data || data.success === false) return null;
            return data.name || null;
        } catch (e) {
            console.warn(`[Papadustream] TMDB title error: ${e?.message}`);
            return null;
        }
    });
}

/**
 * Cherche une série sur Papadustream par titre, retourne l'IMDb ID.
 */
async function searchSeriesByTitle(title) {
    const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(title)}`;
    return withCache(`search_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, async () => {
        try {
            const html = await fetchText(searchUrl);
            if (!html) return null;
            const seriesRegex = /\/series\/(tt\d+)/g;
            let match;
            const found = [];
            while ((match = seriesRegex.exec(html)) !== null) {
                found.push(match[1]);
            }
            if (found.length > 0) {
                const imdbId = found[0];
                console.log(`[Papadustream] Search "${title}" → ${imdbId} (${found.length} results)`);
                return imdbId;
            }
            console.warn(`[Papadustream] No series found for "${title}"`);
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
async function resolveImdbId(tmdbId) {
    let imdbId = await getImdbIdFromTmdb(tmdbId);
    if (imdbId) return imdbId;

    console.log(`[Papadustream] Title search fallback for TMDB ${tmdbId}...`);
    const title = await getTmdbSeriesTitle(tmdbId);
    if (title) {
        const mainTitle = title.split(':')[0].trim();
        imdbId = await searchSeriesByTitle(mainTitle);
        if (imdbId) return imdbId;
        imdbId = await searchSeriesByTitle(title);
        if (imdbId) return imdbId;
    }

    console.warn(`[Papadustream] IMDb ID not found for TMDB ${tmdbId}`);
    return null;
}

// ─── Extraction HLS ──────────────────────────────────────────────────────────

/**
 * Parse le HTML d'une page série pour extraire les URLs HLS
 * correspondant à la saison et l'épisode demandés.
 *
 * Pattern HLS : /hls/s{N}/serial/{IMDB_ID}/{SEASON}/{EPISODE}/playlist.m3u8
 */
function extractHlsUrls(html, season, episode) {
    if (!html) return [];

    const results = [];
    const hlsRegex = /\/hls\/s\d+\/serial\/tt\d+\/(\d+)\/(\d+)\/playlist\.m3u8/g;
    let match;

    while ((match = hlsRegex.exec(html)) !== null) {
        const epSeason = parseInt(match[1], 10);
        const epNumber = parseInt(match[2], 10);

        if (epSeason === season && epNumber === episode) {
            const fullUrl = `${BASE_URL}${match[0]}`;
            console.log(`[Papadustream] Found HLS: S${epSeason}E${epNumber}`);
            results.push(fullUrl);
        }
    }

    return results;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Point d'entrée principal — séries TV uniquement.
 */
export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    if (mediaType !== 'tv') {
        console.log(`[Papadustream] Unsupported: ${mediaType} (TV series only)`);
        return [];
    }

    const startTime = Date.now();

    console.log(`[Papadustream] Looking for S${season || 1}E${episode || 1} (TMDB: ${tmdbId})`);

    // Étape 1: Résoudre TMDB ID → IMDb ID
    const imdbId = await resolveImdbId(tmdbId);
    if (!imdbId) {
        console.warn(`[Papadustream] Could not resolve IMDb ID for TMDB ${tmdbId}`);
        return [];
    }

    // Étape 2: Résoudre les épisodes cibles via ArmSync (resolveTargetEpisodes)
    const targetEpisodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, {
        startTime,
        budgetMs: 45000,
    });
    console.log(`[Papadustream] Target episodes: ${targetEpisodes}`);

    // Étape 3: Fetch la page série sur Papadustream (avec cache intelligent)
    const seriesUrl = `${BASE_URL}/series/${imdbId}`;
    let html = await withCache(`page_${imdbId}`, async () => {
        return await fetchText(seriesUrl);
    });
    if (!html) {
        console.warn(`[Papadustream] Series page not accessible: ${seriesUrl}`);
        return [];
    }
    // Vérification: la page doit contenir des URLs HLS
    if (!html.includes('/hls/') || !html.includes('playlist.m3u8')) {
        console.warn(`[Papadustream] Page has no HLS content (${html.length} bytes), retrying...`);
        const retryHtml = await fetchText(seriesUrl);
        if (retryHtml && retryHtml.includes('playlist.m3u8')) {
            html = retryHtml;
        } else {
            return [];
        }
    }

    // Étape 4: Extraire les URLs HLS pour chaque épisode cible
    const targetSeason = Number(season) || 1;
    const streams = [];
    const seenUrls = new Set();

    for (const ep of targetEpisodes) {
        const urls = extractHlsUrls(html, targetSeason, ep);
        for (const url of urls) {
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);

            // Utiliser toStream pour standardiser l'objet stream
            const stream = toStream(url, 'VF', 'Papadustream', BASE_URL, {
                quality: 'HD',
                title: `S${targetSeason}E${ep} HLS`,
            });
            // Ajouter le type manuellement (toStream ne gère pas type/subType)
            stream.type = 'hls';
            streams.push(stream);
        }
        if (streams.length > 0) break;
    }

    // Étape 5: Fallback épisode-1 si pas trouvé
    if (streams.length === 0 && targetEpisodes[0] > 1) {
        const prevEp = targetEpisodes[0] - 1;
        const urls = extractHlsUrls(html, targetSeason, prevEp);
        for (const url of urls) {
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            const stream = toStream(url, 'VF', 'Papadustream', BASE_URL, {
                quality: 'HD',
                title: `S${targetSeason}E${prevEp} HLS (fallback)`,
            });
            stream.type = 'hls';
            streams.push(stream);
        }
        if (streams.length > 0) {
            console.log(`[Papadustream] Fallback: E${prevEp} (target was E${targetEpisodes[0]})`);
        }
    }

    if (streams.length === 0) {
        console.log(`[Papadustream] No HLS for ${imdbId} S${targetSeason}E${targetEpisodes[0]}`);
    } else {
        console.log(`[Papadustream] ${streams.length} stream(s) found`);
    }

    return streams;
}
