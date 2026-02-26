/**
 * Extractor Logic for FRAnime
 */

import { fetchText, fetchJson } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';

const BASE_URL = "https://franime.fr";
const API_BASE = "https://api.franime.fr/api";

let animeListCache = null;

/**
 * Get the title of a media from TMDB ID
 */
async function getTmdbTitle(tmdbId, mediaType) {
    try {
        // Use language=en-US to always get English titles
        const url = `https://www.themoviedb.org/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}?language=en-US`;
        const html = await fetchText(url);
        const $ = cheerio.load(html);

        let title = $('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('h2').first().text();

        if (title && title.includes(' (')) title = title.split(' (')[0];
        if (title && title.includes(' - ')) title = title.split(' - ')[0];

        title = title ? title.trim() : null;
        console.log(`[FRAnime] TMDB Title found: ${title}`);
        return title;
    } catch (e) {
        console.error(`[FRAnime] Failed to get title from TMDB: ${e.message}`);
        return null;
    }
}

/**
 * Load and cache the full anime list from FRAnime
 */
async function getAnimeList() {
    if (animeListCache) return animeListCache;
    try {
        console.log(`[FRAnime] Loading full anime list...`);
        animeListCache = await fetchJson(`${API_BASE}/animes/`);
        console.log(`[FRAnime] Loaded ${animeListCache.length} animes.`);
        return animeListCache;
    } catch (e) {
        console.error(`[FRAnime] Failed to load anime list: ${e.message}`);
        return [];
    }
}

/**
 * Find all matching animes from the local list
 */
function findAllMatches(list, title) {
    const normalize = (s) => s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?]/g, '')
        .replace(/\bthe\s+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const targetTitle = normalize(title);

    // Filter list for matches
    return list.filter(a => 
        normalize(a.title).includes(targetTitle) || 
        normalize(a.titleO || "").includes(targetTitle) ||
        targetTitle.includes(normalize(a.title))
    );
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    console.warn(`[FRAnime] Provider is currently disabled due to aggressive Cloudflare protection and API changes.`);
    return [];
}
