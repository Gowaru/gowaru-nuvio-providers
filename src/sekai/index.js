import { extractStreams } from './extractor.js';
import { expandStreamQualities } from '../utils/resolvers.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[Sekai] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

    try {
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        return await expandStreamQualities(streams);
    } catch (error) {
        console.error(`[Sekai] Extraction error for ${tmdbId}:`, error);
        return [];
    }
}

export const provider = {
    id: "sekai",
    name: "Sekai",
    description: "Provider for Sekai (Animes VOSTFR/VF)",
    language: "fr",
    types: ["tv", "movie"],
    getStreams
};
