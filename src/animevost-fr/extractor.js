const { fetchJson } = require('./http');

const BASE = 'https://animevost.fr';

// Cache for anime details (slug -> data)
const animeCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

function getCached(key) {
    const entry = animeCache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    animeCache.delete(key);
    return null;
}

function setCache(key, data) {
    animeCache.set(key, { data, ts: Date.now() });
}

// Search for anime by title
async function searchAnime(query) {
    const cacheKey = `search_${query.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const data = await fetchJson(`/api/animes/search?q=${encodeURIComponent(query)}`);
    if (!data || !data.results || data.results.length === 0) return null;

    const result = data.results[0];
    setCache(cacheKey, result);
    return result;
}

// Get anime details with seasons and episodes
async function getAnimeDetails(slug) {
    const cacheKey = `anime_${slug}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const data = await fetchJson(`/api/animes/${slug}`);
    if (!data || !data.anime) return null;

    setCache(cacheKey, data);
    return data;
}

// Normalize title for search (remove accents, lowercase, replace special chars)
function normalizeTitle(title) {
    return title
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Extract season/episode from titles
function extractSeasonEpisode(titles) {
    let season = 1;
    let episode = 1;

    for (const t of titles) {
        const seasonMatch = t.match(/saison\s+(\d+)|season\s+(\d+)|s(\d+)/i);
        if (seasonMatch) season = parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3]);

        const episodeMatch = t.match(/episode\s+(\d+)|ep\s+(\d+)|e(\d+)/i);
        if (episodeMatch) episode = parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]);
    }

    return { season, episode };
}

// Main search and extract function
async function searchAndExtract(title, season, episode) {
    // Try searching with the main title (without season/episode info)
    const cleanTitle = title
        .replace(/\s*(saison|season|s)\s*\d+/gi, '')
        .replace(/\s*(episode|ep|e)\s*\d+/gi, '')
        .trim();

    const searchResult = await searchAnime(cleanTitle);
    if (!searchResult) return [];

    const details = await getAnimeDetails(searchResult.slug);
    if (!details || !details.seasons) return [];

    // Find the right season
    const seasonData = details.seasons.find(s => s.season_number === season) || details.seasons[0];
    if (!seasonData || !seasonData.episodes) return [];

    // Find the right episode
    const episodeData = seasonData.episodes.find(e => e.episode_number === episode) || seasonData.episodes[0];
    if (!episodeData) return [];

    // Extract streams
    const streams = [];

    // From streams array (direct video URLs)
    if (episodeData.streams && episodeData.streams.length > 0) {
        for (const stream of episodeData.streams) {
            if (stream.video_url) {
                streams.push({
                    url: stream.video_url,
                    title: `AnimeVOST [${stream.quality || '1080p'}] [${stream.language || 'VOSTFR'}]`,
                    name: `AnimeVOST (${stream.language || 'VOSTFR'})`,
                    quality: stream.quality || '1080p',
                    language: 'fr',
                    provider: 'animevost-fr',
                    headers: {
                        'Referer': `${BASE}/`,
                    },
                });
            }
        }
    }

    // Fallback: construct gupload URL from zoplayer_id
    if (streams.length === 0 && episodeData.zoplayer_id) {
        streams.push({
            url: `${BASE}/api/animes/${searchResult.slug}`,
            title: `AnimeVOST [1080p] [VOSTFR]`,
            name: 'AnimeVOST (VOSTFR)',
            quality: '1080p',
            language: 'fr',
            provider: 'animevost-fr',
            headers: {
                'Referer': `${BASE}/`,
            },
        });
    }

    return streams;
}

module.exports = { searchAnime, getAnimeDetails, searchAndExtract };
