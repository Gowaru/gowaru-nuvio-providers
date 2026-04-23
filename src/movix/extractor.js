import { fetchJson } from './http.js';

const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://movix.cash',
    'Referer': 'https://movix.cash/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'DNT': '1'
};

export async function extractStreams(options) {
    const { title, year, season, episode, tmdbId, isAnime, type } = options;
    const streams = [];

    if (!tmdbId) {
        console.log(`[Movix] No TMDB ID provided for ${title}`);
        return streams;
    }

    const isMovie = type === 'movie';
    const endpoints = isMovie 
        ? [
            `https://api.movix.cash/api/fstream/movie/${tmdbId}`,
            `https://api.movix.cash/api/wiflix/movie/${tmdbId}`,
            `https://api.movix.cash/api/cpasmal/movie/${tmdbId}`
          ]
        : [
            `https://api.movix.cash/api/fstream/tv/${tmdbId}/season/${season}`,
            `https://api.movix.cash/api/wiflix/tv/${tmdbId}/${season}`,
            `https://api.movix.cash/api/cpasmal/tv/${tmdbId}/${season}/${episode}`
          ];

    // Helper to format provider title
    const formatTitle = (server, lang) => {
        let l = (lang || '').toLowerCase();
        let tag = (l === 'vff' || l === 'vfq' || l === 'vf') ? 'VF' : 
                  (l === 'vostfr' || l === 'vost') ? 'VOSTFR' : 
                  (l === 'default' || l === 'multi') ? 'MULTI' : (lang || 'VF').toUpperCase();
        return `Movix - ${server} - ${tag}`;
    };

    await Promise.allSettled(endpoints.map(async (url) => {
        try {
            const data = await fetchJson(url, { headers: COMMON_HEADERS });
            if (!data || data.success === false) {
                console.log(`[Movix] API returned no success for ${url}`);
                return;
            }

            let provider = "Unknown";
            if (url.includes('fstream')) provider = "FStream";
            else if (url.includes('wiflix')) provider = "Wiflix";
            else if (url.includes('cpasmal')) provider = "Cpasmal";

            if (isMovie) {
                // FStream movies
                if (provider === "FStream" && data.players) {
                    for (const lang of Object.keys(data.players)) {
                        for (const item of data.players[lang]) {
                            if (item.url) streams.push({ server: formatTitle(item.player || provider, lang), title: formatTitle(item.player || provider, lang), url: item.url, quality: item.quality || "720p" });
                        }
                    }
                } 
                // Wiflix movies (can be in 'players' or 'links')
                else if (provider === "Wiflix") {
                    const links = data.players || data.links;
                    if (links) {
                        for (const lang of Object.keys(links)) {
                            for (const item of links[lang]) {
                                if (item.url) streams.push({ server: formatTitle(item.name || provider, lang), title: formatTitle(item.name || provider, lang), url: item.url, quality: item.quality || "720p" });
                            }
                        }
                    }
                } 
                // Cpasmal movies
                else if (provider === "Cpasmal" && data.links) {
                    for (const lang of Object.keys(data.links)) {
                        for (const item of data.links[lang]) {
                            if (item.url) streams.push({ server: formatTitle(item.server || provider, lang), title: formatTitle(item.server || provider, lang), url: item.url, quality: "720p" });
                        }
                    }
                }
            } else {
                // FStream TV
                if (provider === "FStream" && data.episodes && data.episodes[episode]) {
                    const epData = data.episodes[episode];
                    if (epData.languages) {
                        for (const lang of Object.keys(epData.languages)) {
                            for (const item of epData.languages[lang]) {
                                if (item.url) streams.push({ server: formatTitle(item.player || provider, lang), title: formatTitle(item.player || provider, lang), url: item.url, quality: item.quality || "720p" });
                            }
                        }
                    }
                } 
                // Wiflix TV
                else if (provider === "Wiflix" && data.episodes && data.episodes[episode]) {
                    const epLangs = data.episodes[episode];
                    for (const lang of Object.keys(epLangs)) {
                        for (const item of epLangs[lang]) {
                            if (item.url) streams.push({ server: formatTitle(item.name || provider, lang), title: formatTitle(item.name || provider, lang), url: item.url, quality: item.quality || "720p" });
                        }
                    }
                } 
                // Cpasmal TV
                else if (provider === "Cpasmal" && data.links) {
                    for (const lang of Object.keys(data.links)) {
                        for (const item of data.links[lang]) {
                            if (item.url) streams.push({ server: formatTitle(item.server || provider, lang), title: formatTitle(item.server || provider, lang), url: item.url, quality: "720p" });
                        }
                    }
                }
            }
        } catch(e) {
            console.log(`[Movix] Error fetching ${url}: ${e.message}`);
        }
    }));

    return streams;
}

