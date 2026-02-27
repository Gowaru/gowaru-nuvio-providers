import { extractStreams } from './src/voiranime/extractor.js';
(async () => {
    try {
        // Attack on Titan (TMDB: 1429), Season 1, Ep 1
        const streams = await extractStreams('1429', 'tv', 1, 1);
        console.log("Found streams:", streams.length);
        console.log(JSON.stringify(streams, null, 2));
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
})();
