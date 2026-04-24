import { fetchJson } from './http.js';
import { resolveStream } from '../utils/resolvers.js';

const API_BASE = 'https://api.movix.cash';

function normalizeLangTag(lang) {
    const l = (lang || '').toLowerCase();
    if (l === 'vff' || l === 'vfq' || l === 'vf' || l.includes('french')) return 'VF';
    if (l === 'vostfr' || l === 'vost' || l.includes('vostfr')) return 'VOSTFR';
    if (l === 'default' || l === 'multi') return 'MULTI';
    return (lang || 'VF').toUpperCase();
}

function pushStream(streams, provider, server, lang, url, quality) {
    if (!url || typeof url !== 'string') return;
    streams.push({
        name: 'Movix',
        title: `[${normalizeLangTag(lang)}] ${provider} - ${server || 'Player'}`,
        server: `${provider} - ${server || 'Player'}`,
        url,
        quality: quality || 'HD',
        headers: {
            Origin: 'https://movix.cash',
            Referer: 'https://movix.cash/'
        }
    });
}

function isExoPlayableUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();

    if (
        u.includes('test-videos.co.uk') ||
        u.includes('sample-videos.com') ||
        u.includes('big_buck_bunny')
    ) {
        return false;
    }

    if (u.includes('/embed') || u.includes('/e/') || u.includes('iframe') || u.includes('index.php')) {
        return false;
    }

    if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mkv') || u.includes('.webm') || u.includes('.ts')) {
        return true;
    }

    if (u.includes('manifest') || u.includes('playlist') || u.includes('/hls/')) {
        return true;
    }

    return false;
}

async function resolveForExo(stream) {
    // Try resolution with retries (up to 2 attempts for timeouts)
    let resolved = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            resolved = await Promise.race([
                resolveStream(stream),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            break;
        } catch (e) {
            if (attempt === 2) {
                // Second attempt failed, try original URL if it looks direct
                if (isExoPlayableUrl(stream.url)) {
                    resolved = { ...stream, isDirect: true };
                } else {
                    return null;
                }
            }
        }
    }

    if (!resolved || !resolved.url) return null;
    if (!resolved.isDirect) return null; // Only accept truly direct links
    
    // Final validation: URL must look like a direct media link
    if (!isExoPlayableUrl(resolved.url)) return null;
    
    return resolved;
}

function collectFstreamMovie(streams, data) {
    const players = data?.players;
    if (!players || typeof players !== 'object') return;

    for (const lang of Object.keys(players)) {
        const list = players[lang];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            pushStream(streams, 'FStream', item?.player, lang, item?.url, item?.quality);
        }
    }
}

function collectFstreamTv(streams, data, episode) {
    const ep = data?.episodes?.[String(episode)] || data?.episodes?.[episode];
    const langs = ep?.languages;
    if (!langs || typeof langs !== 'object') return;

    for (const lang of Object.keys(langs)) {
        const list = langs[lang];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            pushStream(streams, 'FStream', item?.player, lang, item?.url, item?.quality);
        }
    }
}

function collectWiflixMovie(streams, data) {
    const links = data?.links;
    if (!links || typeof links !== 'object') return;

    for (const lang of Object.keys(links)) {
        const list = links[lang];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            pushStream(streams, 'Wiflix', item?.name || item?.player, lang, item?.url, item?.quality);
        }
    }
}

function collectWiflixTv(streams, data, episode) {
    const ep = data?.episodes?.[String(episode)] || data?.episodes?.[episode];
    if (!ep || typeof ep !== 'object') return;

    for (const lang of Object.keys(ep)) {
        const list = ep[lang];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            pushStream(streams, 'Wiflix', item?.name || item?.player, lang, item?.url, item?.quality);
        }
    }
}

function collectCpasmal(streams, data) {
    const links = data?.links;
    if (!links || typeof links !== 'object') return;

    for (const lang of Object.keys(links)) {
        const list = links[lang];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            pushStream(streams, 'Cpasmal', item?.server || item?.name, lang, item?.url, item?.quality || 'HD');
        }
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const streams = [];

    if (!tmdbId) {
        console.log('[Movix] Missing tmdbId');
        return streams;
    }

    const isMovie = mediaType === 'movie';
    const seasonNum = Number(season) || 1;
    const episodeNum = Number(episode) || 1;

    const jobs = isMovie
        ? [
            {
                label: 'fstream-movie',
                url: `${API_BASE}/api/fstream/movie/${tmdbId}`,
                collect: (data) => collectFstreamMovie(streams, data)
            },
            {
                label: 'wiflix-movie',
                url: `${API_BASE}/api/wiflix/movie/${tmdbId}`,
                collect: (data) => collectWiflixMovie(streams, data)
            },
            {
                label: 'cpasmal-movie',
                url: `${API_BASE}/api/cpasmal/movie/${tmdbId}`,
                collect: (data) => collectCpasmal(streams, data)
            }
        ]
        : [
            {
                label: 'fstream-tv',
                url: `${API_BASE}/api/fstream/tv/${tmdbId}/season/${seasonNum}`,
                collect: (data) => collectFstreamTv(streams, data, episodeNum)
            },
            {
                label: 'wiflix-tv',
                url: `${API_BASE}/api/wiflix/tv/${tmdbId}/${seasonNum}`,
                collect: (data) => collectWiflixTv(streams, data, episodeNum)
            },
            {
                label: 'cpasmal-tv',
                url: `${API_BASE}/api/cpasmal/tv/${tmdbId}/${seasonNum}/${episodeNum}`,
                collect: (data) => collectCpasmal(streams, data)
            }
        ];

    const results = await Promise.allSettled(
        jobs.map(async (job) => {
            const data = await fetchJson(job.url);
            if (!data) return;
            if (data.success === false) {
                console.log(`[Movix] ${job.label} unavailable: ${data.error || 'unknown error'}`);
                return;
            }
            job.collect(data);
        })
    );

    for (const r of results) {
        if (r.status === 'rejected') {
            console.log(`[Movix] source fetch failed: ${r.reason?.message || r.reason}`);
        }
    }

    const seen = new Set();
    const unique = [];
    for (const s of streams) {
        if (!seen.has(s.url)) {
            seen.add(s.url);
            unique.push(s);
        }
    }

    const resolvedResults = await Promise.allSettled(unique.map((s) => resolveForExo(s)));
    const playable = [];
    const seenPlayable = new Set();
    for (const r of resolvedResults) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        if (seenPlayable.has(r.value.url)) continue;
        seenPlayable.add(r.value.url);
        playable.push(r.value);
    }

    console.log(`[Movix] Total streams found: ${unique.length}, Exo-playable: ${playable.length}`);
    return playable;
}
