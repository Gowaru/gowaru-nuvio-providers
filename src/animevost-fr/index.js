const { searchAndExtract } = require('./extractor');
const { getTmdbTitles } = require('../utils/metadata');

async function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType === 'movie') return [];
    return getStreamsForAnime(tmdbId, season || 1, episode || 1);
}

async function getStreamsForAnime(tmdbId, season, episode) {
    try {
        const titles = await getTmdbTitles(tmdbId, 'tv', season);
        if (!titles || titles.length === 0) return [];

        // Try each title until we find a match
        for (const title of titles) {
            const result = await searchAndExtract(title, season, episode);
            if (result && result.length > 0) return result;
        }
        return [];
    } catch (e) {
        console.error(`[AnimeVostFR] Error: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
