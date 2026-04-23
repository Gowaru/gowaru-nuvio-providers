import { extractStreams } from './extractor.js';

export const MovixProvider = {
    name: 'Movix',
    version: '1.0.0',
    type: 'video', // Provide both anime and movies
    url: 'https://movix.cash',

    /**
     * @param {Object} options 
     */
    async getStreams(options) {
        try {
            console.log(`[Movix] Searching for ${options.title} (TMDB: ${options.tmdbId})`);
            const streams = await extractStreams(options);
            return streams;
        } catch (error) {
            console.error(`[Movix] Global Error:`, error.message);
            return [];
        }
    }
};

export default MovixProvider;
