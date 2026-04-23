import { fetchJson } from './http.js';

const API_BASE = 'https://api.movix.cash';

/**
 * Video playback headers for Nuvio/ExoPlayer
 */
const PLAYBACK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://movix.cash',
    'Referer': 'https://movix.cash/',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
    'DNT': '1'
};

/**
 * Format a language tag for display
 */
function langTag(lang) {
    const l = (lang || '').toLowerCase();
    if (l === 'vff' || l === 'vfq' || l === 'vf') return 'VF';
    if (l === 'vostfr' || l === 'vost') return 'VOSTFR';
    if (l === 'default' || l === 'multi') return 'MULTI';
    return (lang || 'VF').toUpperCase();
}

/**
 * Detect player name from URL
 */
function playerName(url) {
    if (!url) return 'Unknown';
    const u = url.toLowerCase();
    if (u.includes('sibnet')) return 'Sibnet';
    if (u.includes('vidmoly')) return 'Vidmoly';
    if (u.includes('vidzy')) return 'Vidzy';
    if (u.includes('voe.sx') || u.includes('voe.')) return 'VoeSX';
    if (u.includes('doodstream') || u.includes('dood.')) return 'Doodstream';
    if (u.includes('uqload')) return 'Uqload';
    if (u.includes('supervideo')) return 'SuperVideo';
    if (u.includes('filemoon')) return 'Filemoon';
    if (u.includes('dropload')) return 'Dropload';
    if (u.includes('fsvid') || u.includes('premium')) return 'FSVid';
    if (u.includes('lulustream')) return 'LuluStream';
    if (u.includes('seekstreaming')) return 'SeekStreaming';
    if (u.includes('sendvid')) return 'Sendvid';
    return 'Player';
}

/**
 * Try to extract a direct m3u8/mp4 URL from an embed URL using Movix's extraction API
 */
async function tryExtract(embedUrl) {
    if (!embedUrl) return null;
    const u = embedUrl.toLowerCase();
    let extractEndpoint = null;

    if (u.includes('sibnet')) {
        extractEndpoint = `${API_BASE}/api/extract-sibnet?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('vidmoly')) {
        extractEndpoint = `${API_BASE}/api/extract-vidmoly?url=${embedUrl}`;
    } else if (u.includes('vidzy')) {
        extractEndpoint = `${API_BASE}/api/extract-vidzy?url=${embedUrl}`;
    } else if (u.includes('voe.sx') || u.includes('voe.')) {
        extractEndpoint = `${API_BASE}/api/voe/m3u8?url=${embedUrl}`;
    } else if (u.includes('doodstream') || u.includes('dood.')) {
        extractEndpoint = `${API_BASE}/api/extract-doodstream?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('uqload')) {
        extractEndpoint = `${API_BASE}/api/extract-uqload?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('supervideo')) {
        extractEndpoint = `${API_BASE}/api/extract-supervideo?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('dropload')) {
        extractEndpoint = `${API_BASE}/api/extract-dropload?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('fsvid') || u.includes('premium')) {
        extractEndpoint = `${API_BASE}/api/extract-fsvid?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('seekstreaming')) {
        extractEndpoint = `${API_BASE}/api/extract-seekstreaming?url=${encodeURIComponent(embedUrl)}`;
    }

    if (!extractEndpoint) return null;

    try {
        const data = await fetchJson(extractEndpoint);
        if (!data) return null;

        // The extraction API can return different structures
        if (data.url) return data.url;
        if (data.source) return data.source;
        if (data.sources && data.sources.length > 0) return data.sources[0].url || data.sources[0];
        if (data.m3u8) return data.m3u8;
        if (data.mp4) return data.mp4;
        if (data.link) return data.link;
        if (data.file) return data.file;
        if (typeof data === 'string' && data.startsWith('http')) return data;

        return null;
    } catch (e) {
        console.log(`[Movix] Extract failed for ${embedUrl}: ${e.message}`);
        return null;
    }
}

/**
 * Check if a URL is a direct playable video URL (not an embed page)
 */
function isDirectUrl(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    return u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mkv') || 
           u.includes('/playlist/') || u.includes('/master.') ||
           u.includes('type=video');
}

/**
 * Process a single source item and return a stream object, or null
 */
async function processSource(url, label, provider) {
    if (!url) return null;

    let finalUrl = url;
    
    // If the URL is an embed page (not a direct video), try extraction
    if (!isDirectUrl(url)) {
        const extracted = await tryExtract(url);
        if (extracted && isDirectUrl(extracted)) {
            finalUrl = extracted;
        } else if (extracted) {
            finalUrl = extracted; // Use whatever we got
        } else {
            // Return embed URL as fallback — some might still work
            finalUrl = url;
        }
    }

    return {
        name: `Movix`,
        title: label,
        url: finalUrl,
        quality: 'HD',
        headers: PLAYBACK_HEADERS
    };
}

// ─── FStream ────────────────────────────────────────────────────────
async function fetchFStream(tmdbId, mediaType, season, episode) {
    const streams = [];
    const url = mediaType === 'movie'
        ? `${API_BASE}/api/fstream/movie/${tmdbId}`
        : `${API_BASE}/api/fstream/tv/${tmdbId}/season/${season}`;

    const data = await fetchJson(url);
    if (!data) return streams;

    // Movie: data.players = { VFQ: [{url, player, quality}], VFF: [...], ... }
    // TV: data.episodes[ep].languages = { VFQ: [...], ... }  OR same as movie
    let playersByLang = {};

    if (mediaType === 'movie' && data.players) {
        playersByLang = data.players;
    } else if (mediaType !== 'movie' && data.episodes) {
        const epKey = String(episode);
        const epData = data.episodes[epKey] || data.episodes[episode];
        if (epData) {
            playersByLang = epData.languages || epData.players || epData;
        }
    } else if (data.players) {
        // Fallback: treat same as movie format
        playersByLang = data.players;
    }

    const langOrder = ['VFQ', 'VFF', 'VOSTFR', 'Default'];
    const tasks = [];

    for (const lang of langOrder) {
        const items = playersByLang[lang];
        if (!Array.isArray(items)) continue;

        for (const item of items) {
            if (!item.url) continue;
            const label = `FStream ${langTag(lang)} - ${item.player || playerName(item.url)} ${item.quality || ''}`.trim();
            tasks.push(processSource(item.url, label, 'FStream'));
        }
    }

    // Also check any language keys not in langOrder
    for (const lang of Object.keys(playersByLang)) {
        if (langOrder.includes(lang)) continue;
        const items = playersByLang[lang];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
            if (!item.url) continue;
            const label = `FStream ${langTag(lang)} - ${item.player || playerName(item.url)} ${item.quality || ''}`.trim();
            tasks.push(processSource(item.url, label, 'FStream'));
        }
    }

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) streams.push(r.value);
    }

    return streams;
}

// ─── Wiflix / Lynx ──────────────────────────────────────────────────
async function fetchWiflix(tmdbId, mediaType, season, episode) {
    const streams = [];
    const url = mediaType === 'movie'
        ? `${API_BASE}/api/wiflix/movie/${tmdbId}`
        : `${API_BASE}/api/wiflix/tv/${tmdbId}/${season}`;

    const data = await fetchJson(url);
    if (!data) return streams;

    let items = [];

    if (mediaType === 'movie') {
        // data.players.vf or data.players[lang] = [{url, name, quality}]
        const players = data.players || data.links;
        if (players) {
            for (const lang of Object.keys(players)) {
                const langItems = players[lang];
                if (!Array.isArray(langItems)) continue;
                for (const item of langItems) {
                    if (item.url) items.push({ ...item, lang });
                }
            }
        }
    } else {
        // TV: data.episodes[ep] = {lang: [{url, name, quality}]}
        if (data.episodes) {
            const epKey = String(episode);
            const epData = data.episodes[epKey] || data.episodes[episode];
            if (epData && typeof epData === 'object') {
                for (const lang of Object.keys(epData)) {
                    const langItems = epData[lang];
                    if (!Array.isArray(langItems)) continue;
                    for (const item of langItems) {
                        if (item.url) items.push({ ...item, lang });
                    }
                }
            }
        }
    }

    const tasks = items.map(item => {
        const label = `Lynx ${langTag(item.lang)} - ${item.name || playerName(item.url)} ${item.quality || ''}`.trim();
        return processSource(item.url, label, 'Wiflix');
    });

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) streams.push(r.value);
    }

    return streams;
}

// ─── Cpasmal / Viper ────────────────────────────────────────────────
async function fetchCpasmal(tmdbId, mediaType, season, episode) {
    const streams = [];
    const url = mediaType === 'movie'
        ? `${API_BASE}/api/cpasmal/movie/${tmdbId}`
        : `${API_BASE}/api/cpasmal/tv/${tmdbId}/${season}/${episode}`;

    const data = await fetchJson(url);
    if (!data) return streams;

    // data.links = { vf: [{url, server}], vostfr: [...] }
    const links = data.links;
    if (!links || typeof links !== 'object') return streams;

    const tasks = [];
    for (const lang of Object.keys(links)) {
        const langItems = links[lang];
        if (!Array.isArray(langItems)) continue;
        for (const item of langItems) {
            if (!item.url) continue;
            const label = `Viper ${langTag(lang)} - ${item.server || playerName(item.url)}`.trim();
            tasks.push(processSource(item.url, label, 'Cpasmal'));
        }
    }

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) streams.push(r.value);
    }

    return streams;
}

// ─── Main Extraction ────────────────────────────────────────────────
export async function extractStreams(tmdbId, mediaType, season, episode) {
    console.log(`[Movix] Extracting: ${mediaType} TMDB:${tmdbId} S${season}E${episode}`);

    // Call all 3 APIs in parallel
    const [fstreamResults, wiflixResults, cpasmalResults] = await Promise.allSettled([
        fetchFStream(tmdbId, mediaType, season, episode),
        fetchWiflix(tmdbId, mediaType, season, episode),
        fetchCpasmal(tmdbId, mediaType, season, episode)
    ]);

    const streams = [];

    if (fstreamResults.status === 'fulfilled') {
        streams.push(...fstreamResults.value);
        console.log(`[Movix] FStream: ${fstreamResults.value.length} streams`);
    } else {
        console.log(`[Movix] FStream failed: ${fstreamResults.reason}`);
    }

    if (wiflixResults.status === 'fulfilled') {
        streams.push(...wiflixResults.value);
        console.log(`[Movix] Wiflix/Lynx: ${wiflixResults.value.length} streams`);
    } else {
        console.log(`[Movix] Wiflix failed: ${wiflixResults.reason}`);
    }

    if (cpasmalResults.status === 'fulfilled') {
        streams.push(...cpasmalResults.value);
        console.log(`[Movix] Cpasmal/Viper: ${cpasmalResults.value.length} streams`);
    } else {
        console.log(`[Movix] Cpasmal failed: ${cpasmalResults.reason}`);
    }

    // Deduplicate by URL
    const seen = new Set();
    const unique = [];
    for (const s of streams) {
        if (!seen.has(s.url)) {
            seen.add(s.url);
            unique.push(s);
        }
    }

    console.log(`[Movix] Total unique streams: ${unique.length}`);
    return unique;
}
