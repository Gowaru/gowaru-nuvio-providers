/**
 * Movix Provider
 * Main entry point for Nuvio.
 */

function configureStreamConfig() {}

async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[Movix] Test: ${mediaType} ${tmdbId} S${season}E${episode}`);
    return [{
        name: 'Test',
        title: `[TEST] ${mediaType === 'movie' ? 'Movie' : 'TV'} - ${tmdbId} S${season}E${episode}`,
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        quality: '1080p',
        headers: { 'User-Agent': 'Mozilla/5.0' }
    }];
}

module.exports = { getStreams, configureStreamConfig };
