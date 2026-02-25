/**
 * Extractor Logic for FRAnime
 */

import { fetchText, fetchJson } from './http.js';
import cheerio from 'cheerio';
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
 * Find the best matching anime from the local list
 */
function findBestMatch(list, title) {
    const normalize = (s) => s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?]/g, '')
        .replace(/\bthe\s+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const targetTitle = normalize(title);

    // 1. Precise match on title or titleO
    let match = list.find(a => normalize(a.title) === targetTitle || normalize(a.titleO || "") === targetTitle);

    // 2. Includes match
    if (!match) {
        match = list.find(a => normalize(a.title).includes(targetTitle) || normalize(a.titleO || "").includes(targetTitle));
    }

    return match;
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) return [];

    const animeList = await getAnimeList();
    const anime = findBestMatch(animeList, title);

    if (!anime) {
        console.warn(`[FRAnime] No match found for "${title}" in anime list.`);
        return [];
    }

    // --- ARMSYNC Metadata Resolution ---
    let absoluteEpisode = null;
    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId) {
            absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
        }
    } catch (e) {
        console.warn(`[FRAnime] ArmSync failed: ${e.message}`);
    }
    // ------------------------------------

    const streams = [];
    let targetS = null;
    let targetEp = null;

    // 1. Prioritize Absolute Episode Match (Most reliable on FRAnime)
    if (absoluteEpisode && anime.saisons) {
        let currentAbs = 0;
        for (let sIdx = 0; sIdx < anime.saisons.length; sIdx++) {
            const s = anime.saisons[sIdx];
            if (s.episodes) {
                for (let eIdx = 0; eIdx < s.episodes.length; eIdx++) {
                    currentAbs++;
                    if (currentAbs === absoluteEpisode) {
                        targetS = s;
                        targetEp = s.episodes[eIdx];
                        console.log(`[FRAnime] ArmSync: Matched Absolute ${absoluteEpisode} at S${sIdx + 1}E${eIdx + 1}`);
                        break;
                    }
                }
            }
            if (targetEp) break;
        }
    }

    // 2. Fallback to Seasonal Match if Absolute fails or is missing
    if (!targetEp) {
        const seasonIdx = season - 1;
        const epIdx = episode - 1;
        targetS = anime.saisons[seasonIdx];
        targetEp = targetS ? targetS.episodes[epIdx] : null;
    }

    if (!targetEp) {
        console.warn(`[FRAnime] Episode S${season}E${episode} not found for ${anime.title}`);
        return [];
    }

    // Languages: vo (vostfr), vf
    const languages = ['vo', 'vf'];

    for (const lang of languages) {
        const langData = targetEp.lang[lang];
        if (!langData || !langData.lecteurs) continue;

        const langName = lang === 'vo' ? 'VOSTFR' : 'VF';

        for (let i = 0; i < langData.lecteurs.length; i++) {
            const playerName = langData.lecteurs[i];
            const playerUrl = `${API_BASE}/anime/${anime.id}/${anime.saisons.indexOf(targetS)}/${targetS.episodes.indexOf(targetEp)}/${lang}/${i}`;

            try {
                // Fetch the player URL with required Referer
                const embedUrl = await fetchText(playerUrl, {
                    headers: {
                        "Referer": "https://franime.fr/"
                    }
                });

                if (embedUrl && embedUrl.startsWith('http')) {
                    const stream = await resolveStream({
                        name: `FRAnime (${langName})`,
                        title: `${playerName} Player`,
                        url: embedUrl,
                        quality: "HD",
                        headers: {
                            "Referer": "https://franime.fr/"
                        }
                    });
                    streams.push(stream);
                }
            } catch (err) {
                console.error(`[FRAnime] Failed to fetch player ${i} for ${lang}: ${err.message}`);
            }
        }
    }

    return streams;
}
