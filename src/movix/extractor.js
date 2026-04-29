import { fetchJson } from './http.js';
import { resolveStream, safeFetch } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { extractStreams as extractFrenchstreamStreams } from '../frenchstream/extractor.js';

const API_BASE = 'https://api.movix.cash';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const RETRY_DELAYS_MS = [0, 1400, 2600];

function normalize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function originFromUrl(url) {
    try {
        return new URL(url).origin;
    } catch (e) {
        return 'https://movix.cash';
    }
}

function directHeadersFor(url, headers = {}) {
    const origin = originFromUrl(url);
    const referer = headers.Referer || headers.referer;
    const out = { ...headers };

    if (!referer || referer.includes('movix.cash')) {
        out.Referer = `${origin}/`;
    }

    if (!out.Origin || String(out.Origin).includes('movix.cash')) {
        out.Origin = origin;
    }

    if (!out['User-Agent'] && !out['user-agent']) {
        out['User-Agent'] = USER_AGENT;
    }

    return out;
}

async function validateDirectUrl(url, headers = {}) {
    try {
        const res = await safeFetch(url, {
            method: 'GET',
            headers: {
                ...directHeadersFor(url, headers),
                Range: 'bytes=0-0'
            },
            redirect: 'follow'
        });
        if (!res) return false;
        return res.status === 206 || (typeof res.status === 'number' && res.status >= 200 && res.status < 300);
    } catch (e) {
        return false;
    }
}

function titleMatchesAny(candidateTitles, tmdbTitles) {
    if (!Array.isArray(candidateTitles) || candidateTitles.length === 0) return true;
    if (!Array.isArray(tmdbTitles) || tmdbTitles.length === 0) return true;

    const cand = candidateTitles.map(normalize).filter(Boolean);
    const ref = tmdbTitles.map(normalize).filter(Boolean);

    return cand.some((c) => ref.some((t) => c === t || c.includes(t) || t.includes(c)));
}

function extractSourceTitles(data) {
    const titles = [];
    const push = (value) => {
        if (typeof value !== 'string') return;
        const v = value.trim();
        if (v) titles.push(v);
    };

    push(data?.title);
    push(data?.original_title);
    push(data?.name_no_lang);
    push(data?.tmdb?.title);
    push(data?.tmdb?.original_title);
    push(data?.tmdb?.name_no_lang);
    push(data?.search?.bestMatch?.title);
    push(data?.search?.bestMatch?.originalTitle);

    return [...new Set(titles)];
}

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
            Origin: originFromUrl(url),
            Referer: `${originFromUrl(url)}/`,
            'User-Agent': USER_AGENT
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(job) {
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay > 0) await sleep(delay);

        const data = await fetchJson(job.url);
        if (!data) continue;

        const pending = data.pending === true || /reessayez|reessay/i.test(String(data.message || ''));
        if (pending && attempt < RETRY_DELAYS_MS.length - 1) {
            console.log(`[Movix] ${job.label} pending (attempt ${attempt + 1}), retrying...`);
            continue;
        }

        return data;
    }

    return null;
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

    const normalizedHeaders = directHeadersFor(resolved.url, resolved.headers || stream.headers);
    if (!(await validateDirectUrl(resolved.url, normalizedHeaders))) return null;
    
    // Final validation: URL must look like a direct media link
    if (!isExoPlayableUrl(resolved.url)) return null;

    return {
        ...resolved,
        headers: normalizedHeaders
    };
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
    let tmdbTitles = [];

    try {
        tmdbTitles = await getTmdbTitles(tmdbId, mediaType);
    } catch (e) {
        console.log(`[Movix] Failed to load TMDB titles for ${tmdbId}: ${e.message}`);
    }

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
            const data = await fetchWithRetry(job);
            if (!data) return;
            if (data.success === false) {
                console.log(`[Movix] ${job.label} unavailable: ${data.error || 'unknown error'}`);
                return;
            }

            const sourceTitles = extractSourceTitles(data);
            if (!titleMatchesAny(sourceTitles, tmdbTitles)) {
                console.log(`[Movix] ${job.label} skipped: source title mismatch (${sourceTitles.join(' | ') || 'no title'})`);
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

    if (playable.length === 0) {
        try {
            console.log('[Movix] No playable stream from Movix API, trying Frenchstream fallback...');
            const fallback = await extractFrenchstreamStreams(tmdbId, mediaType, seasonNum, episodeNum);
            if (Array.isArray(fallback) && fallback.length > 0) {
                for (const stream of fallback) {
                    if (!stream?.url) continue;
                    if (seenPlayable.has(stream.url)) continue;
                    if (!isExoPlayableUrl(stream.url)) continue;
                    seenPlayable.add(stream.url);
                    playable.push(stream);
                }
            }
        } catch (e) {
            console.log(`[Movix] Frenchstream fallback failed: ${e.message}`);
        }
    }

    console.log(`[Movix] Total streams found: ${unique.length}, Exo-playable: ${playable.length}`);
    return playable;
}
