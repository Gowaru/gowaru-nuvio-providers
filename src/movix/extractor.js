import { fetchJson } from './http.js';
import { getImdbId as fallbackImdbId } from '../utils/armsync.js';

const TMDB_API_KEY = 'f3d757824f08ea2cff45eb8f47ca3a1e';

async function getImdbId(tmdbId, type) {
    try {
        const typeStr = type === 'movie' ? 'movie' : 'tv';
        const url = `https://api.themoviedb.org/3/${typeStr}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
        const data = await fetchJson(url);
        if (data && data.imdb_id) {
            return data.imdb_id;
        }
    } catch(e) {
        console.error(`[Movix] TMDB API error:`, e.message);
    }
    
    // Fallback to armsync
    return await fallbackImdbId(tmdbId, type);
}

export async function extractStreams(options) {
    const { title, year, season, episode, tmdbId, isAnime, type } = options;
    const streams = [];

    let resolvedType = type === 'movie' ? 'movie' : 'tv';
    let imdbId = await getImdbId(tmdbId, resolvedType);
    if (!imdbId) {
        console.log(`[Movix] No IMDB ID resolved for TMDB ${tmdbId}`);
        return streams;
    }

    let headers = {
        "Origin": "https://movix.cash",
        "Referer": "https://movix.cash/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json"
    };

    try {
        if (resolvedType === 'movie') {
            const url = `https://api.movix.cash/api/imdb/movie/${imdbId}`;
            const data = await fetchJson(url, { headers });
            
            if (data && data.player_links) {
                for (const player of data.player_links) {
                    if (player.link) {
                        streams.push({
                            server: player.player || 'Inconnu',
                            title: `${title} - VF`, // Films on movix API don't specify language in the response easily, assume VF
                            url: player.link,
                            quality: '1080p'
                        });
                    }
                }
            }
        } else if (resolvedType === 'tv') {
            const url = `https://api.movix.cash/api/imdb/tv/${imdbId}`;
            const data = await fetchJson(url, { headers });
            
            if (data && data.series && data.series.length > 0) {
                for (const s of data.series) {
                    if (!s.seasons) continue;
                    const targetSeason = s.seasons.find(sz => String(sz.number) === String(season));
                    if (!targetSeason || !targetSeason.episodes) continue;
                    
                    const targetEpisode = targetSeason.episodes.find(e => String(e.number) === String(episode));
                    if (!targetEpisode || !targetEpisode.versions) continue;

                    for (const versionKey of Object.keys(targetEpisode.versions)) {
                        const versionInfo = targetEpisode.versions[versionKey];
                        const versionTag = versionKey.toUpperCase(); // 'VF' or 'VOSTFR'
                        
                        if (versionInfo.players) {
                            for (const player of versionInfo.players) {
                                if (player.link) {
                                    streams.push({
                                        server: player.name || 'Inconnu',
                                        title: `${title} - ${versionTag}`,
                                        url: player.link,
                                        quality: '1080p'
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(`[Movix] Extractor error:`, e.message);
    }

    return streams;
}
