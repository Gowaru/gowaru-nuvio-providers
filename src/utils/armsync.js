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
 */
export async function getImdbId(tmdbId, mediaType) {
    if (!tmdbId) return null;
    
    // Try TMDB external_ids first (using a generic way since we don't have a TMDB key here, 
    // but Nuvio sometimes provides it or we can use public proxies/ARM)
    const armRes = await syncFetch(`${ARM_API}/themoviedb?id=${tmdbId}`);
    if (armRes) {
        const data = await armRes.json();
        const entry = Array.isArray(data) ? data[0] : data;
        if (entry && entry.imdb) return entry.imdb;
    }
    return null;
}

/**
 * Step 1: Get absolute release date from Cinemata
 */
export async function getEpisodeAirDate(imdbId, season, episode) {
    if (!imdbId) return null;
    const type = season === 0 || season === undefined ? 'movie' : 'series';
    const res = await syncFetch(`${CINEMATA_API}/meta/${type}/${imdbId}.json`);
    if (!res) return null;
    
    const data = await res.json();
    if (type === 'movie') {
        return data?.meta?.released?.split('T')[0] || null;
    }
    
    if (!data?.meta?.videos) return null;

    const video = data.meta.videos.find(v => v.season == season && v.episode == episode);
    if (video && video.released) {
        return video.released.split('T')[0];
    }
    return null;
}

/**
 * Step 2: Resolve MAL ID and Absolute Episode Number
 */
export async function resolveMalMetadata(imdbId, releaseDate) {
    if (!imdbId || !releaseDate) return null;

    // Get candidates from ARM
    const armRes = await syncFetch(`${ARM_API}/imdb?id=${imdbId}`);
    if (!armRes) return null;
    
    const candidates = await armRes.json();
    if (!Array.isArray(candidates)) return null;

    const targetDate = new Date(releaseDate);

    for (const entry of candidates) {
        const malId = entry.myanimelist;
        if (!malId) continue;

        // Verify with Jikan
        const jikanRes = await syncFetch(`${JIKAN_API}/anime/${malId}`);
        if (!jikanRes) continue;
        
        const anime = (await jikanRes.json())?.data;
        if (!anime) continue;

        const airedFrom = anime.aired?.from ? new Date(anime.aired.from) : null;
        const airedTo = anime.aired?.to ? new Date(anime.aired.to) : null;

        // Check if our episode release date falls within this MAL entry's range
        // We add a 2-day tolerance for timezone differences
        if (airedFrom) {
            const start = new Date(airedFrom);
            start.setDate(start.getDate() - 2);
            
            const end = airedTo ? new Date(airedTo) : new Date();
            end.setDate(end.getDate() + 2);

            if (targetDate >= start && targetDate <= end) {
                // If it's a Movie or Single Episode, we are done
                if (anime.type === "Movie" || anime.episodes === 1) {
                    return { malId, absoluteEpisode: 1, type: anime.type };
                }

                // If not, we need to find the absolute episode matching the date
                const epsRes = await syncFetch(`${JIKAN_API}/anime/${malId}/episodes`);
                if (epsRes) {
                    const episodes = (await epsRes.json())?.data;
                    if (Array.isArray(episodes)) {
                        const match = episodes.find(ep => {
                            if (!ep.aired) return false;
                            const epDate = new Date(ep.aired);
                            const diff = Math.abs(targetDate - epDate) / (1000 * 60 * 60 * 24);
                            return diff <= 2;
                        });
                        
                        if (match) {
                            return { 
                                malId, 
                                absoluteEpisode: match.mal_id, 
                                title: anime.title,
                                animeType: anime.type 
                            };
                        }
                    }
                }
                
                // Fallback for series without episode dates: check if simple math works
                // (Only if our season starts exactly when the anime aired)
                return { malId, absoluteEpisode: null, potentialMatch: true };
            }
        }
    }

    return null;
}
