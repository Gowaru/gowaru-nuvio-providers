/**
 * ArmSync - Advanced Anime Metadata Synchronization
 * Resolves TMDB/IMDb to MyAnimeList/Anilist for pinpoint episode matching.
 */

const ARM_API = "https://arm.haglund.dev/api/v2";
const JIKAN_API = "https://api.jikan.moe/v4";
const CINEMATA_API = "https://v3-cinemeta.strem.io";

/**
 * Fetch with timeout helper
 */
async function syncFetch(url, options = {}) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return res;
    } catch (e) {
        console.error(`[ArmSync] Fetch failed: ${url}`, e.message);
        return null;
    }
}

/**
 * Step 0: Get IMDb ID from TMDB ID
 * Upgraded with multi-source fallback
 */
export async function getImdbId(tmdbId, mediaType) {
    if (!tmdbId) return null;
    
    // 1. Try ARM API
    const armRes = await syncFetch(`${ARM_API}/themoviedb?id=${tmdbId}`);
    if (armRes) {
        try {
            const data = await armRes.json();
            const entry = Array.isArray(data) ? data[0] : data;
            if (entry && entry.imdb) return entry.imdb;
        } catch (e) {}
    }

    // 2. Fallback: TMDB Scraping (already often in memory in extractors, but we fetch safe here)
    const tmdbUrl = `https://www.themoviedb.org/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}`;
    const tmdbRes = await syncFetch(tmdbUrl);
    if (tmdbRes) {
        const html = await tmdbRes.text();
        const imdbMatch = html.match(/imdb\.com\/title\/(tt\d+)/);
        if (imdbMatch) return imdbMatch[1];
    }

    return null;
}

/**
 * Step 1: Optimized Absolute Episode Mapping
 * Improved to handle missing episodes or different sorting
 */
export async function getAbsoluteEpisode(imdbId, season, episode) {
    if (!imdbId || season === 0) return null;

    const res = await syncFetch(`${CINEMATA_API}/meta/series/${imdbId}.json`);
    if (!res) return null;
    
    const data = await res.json();
    if (!data?.meta?.videos) return null;

    // Filter and normalize
    const episodes = data.meta.videos
        .filter(v => v.season > 0 && v.episode > 0)
        .sort((a, b) => a.season - b.season || a.episode - b.episode);

    // Special case: deduplicate by season/episode (Cinemata sometimes has duplicates)
    const uniqueEpisodes = [];
    const seen = new Set();
    for (const ep of episodes) {
        const key = `${ep.season}-${ep.episode}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueEpisodes.push(ep);
        }
    }

    // Find the index (+1) of our current S/E
    const index = uniqueEpisodes.findIndex(v => v.season == season && v.episode == episode);
    if (index !== -1) {
        const absoluteNumber = index + 1;
        console.log(`[ArmSync] Resolved: S${season}E${episode} -> Absolute ${absoluteNumber}`);
        return absoluteNumber;
    }

    // Fallback: If seasonal match fails but we have total count, 
    // maybe it is a single season show on Cinemata but multi-season on TMDB?
    // Not likely with IMDb ID, but safety first.
    return null;
}

/**
 * Legacy support for date-based air date (used by some providers for search)
 */
export async function getEpisodeAirDate(imdbId, season, episode) {
    if (!imdbId) return null;
    const type = season === 0 || season === undefined ? 'movie' : 'series';
    const res = await syncFetch(`${CINEMATA_API}/meta/${type}/${imdbId}.json`);
    if (!res) return null;
    
    const data = await res.json();
    if (type === 'movie') return data?.meta?.released?.split('T')[0] || null;
    if (!data?.meta?.videos) return null;

    const video = data.meta.videos.find(v => v.season == season && v.episode == episode);
    return video?.released?.split('T')[0] || null;
}

/**
 * Step 2: Resolve MAL ID and Absolute Episode Number (Updated)
 * This is now mostly used if the provider needs specific MAL metadata.
 */
export async function resolveMalMetadata(imdbId, releaseDate) {
    if (!imdbId || !releaseDate) return null;

    const armRes = await syncFetch(`${ARM_API}/imdb?id=${imdbId}`);
    if (!armRes) return null;
    
    const candidates = await armRes.json();
    if (!Array.isArray(candidates)) return null;

    const targetDate = new Date(releaseDate);

    for (const entry of candidates) {
        const malId = entry.myanimelist;
        if (!malId) continue;

        const jikanRes = await syncFetch(`${JIKAN_API}/anime/${malId}`);
        if (!jikanRes) continue;
        
        const anime = (await jikanRes.json())?.data;
        if (!anime) continue;

        const airedFrom = anime.aired?.from ? new Date(anime.aired.from) : null;
        if (airedFrom) {
            const start = new Date(airedFrom);
            start.setDate(start.getDate() - 2);
            const end = anime.aired?.to ? new Date(anime.aired.to) : new Date();
            end.setDate(end.getDate() + 2);

            if (targetDate >= start && targetDate <= end) {
                if (anime.type === "Movie" || anime.episodes === 1) {
                    return { malId, absoluteEpisode: 1, type: anime.type };
                }
                const epsRes = await syncFetch(`${JIKAN_API}/anime/${malId}/episodes`);
                if (epsRes) {
                    const episodes = (await epsRes.json())?.data;
                    if (Array.isArray(episodes)) {
                        const match = episodes.find(ep => ep.aired && Math.abs(targetDate - new Date(ep.aired)) / 864e5 <= 2);
                        if (match) return { malId, absoluteEpisode: match.mal_id, title: anime.title };
                    }
                }
                return { malId, absoluteEpisode: null, potentialMatch: true };
            }
        }
    }
    return null;
}
