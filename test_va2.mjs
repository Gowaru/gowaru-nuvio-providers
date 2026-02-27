import { extractStreams } from './src/voiranime/extractor.js';
(async () => {
    try {
        // One Piece (TMDB: 37854), Season 1, Ep 100
        const streams = await extractStreams('37854', 'tv', 1, 100);
        console.log("Found streams:", streams.length);
        console.log(JSON.stringify(streams, null, 2));
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
})();
