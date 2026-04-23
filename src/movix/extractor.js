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
    if (l.includes('french') || l === 'vf' || l === 'vff' || l === 'vfq') return 'VF';
    if (l.includes('vostfr') || l === 'vost') return 'VOSTFR';
    if (l.includes('multi')) return 'MULTI';
    if (l.includes('english') || l === 'vo') return 'VO';
    return (lang || 'VF').toUpperCase();
}

/**
 * Detect player name from URL or label
 */
function playerName(url, label) {
    const u = (url || '').toLowerCase();
    const l = (label || '').toLowerCase();
    
    if (l.includes('lulustream') || u.includes('lulustream')) return 'LuluStream';
    if (l.includes('vidmoly') || u.includes('vidmoly')) return 'VidMoly';
    if (l.includes('vidzy') || u.includes('vidzy')) return 'Vidzy';
    if (l.includes('voesx') || u.includes('voe.sx') || u.includes('voe.')) return 'VoeSX';
    if (l.includes('uqload') || u.includes('uqload')) return 'Uqload';
    if (l.includes('filemoon') || u.includes('filemoon')) return 'Filemoon';
    if (l.includes('dropload') || u.includes('dropload')) return 'Dropload';
    if (l.includes('supervideo') || u.includes('supervideo')) return 'SuperVideo';
    if (l.includes('wish') || u.includes('wish')) return 'Wish';
    if (l.includes('fsvid') || u.includes('fsvid') || l.includes('premium')) return 'FSVid';
    if (l.includes('sibnet') || u.includes('sibnet')) return 'Sibnet';
    if (l.includes('netu') || u.includes('netu') || u.includes('waaw')) return 'Netu';
    
    return 'Player';
}

/**
 * Try to extract a direct m3u8/mp4 URL from an embed URL using Movix's extraction API
 */
async function tryExtract(embedUrl) {
    if (!embedUrl) return null;
    const u = embedUrl.toLowerCase();
    
    // We use proxiesembed.movix.cash for extraction as found in JS bundle
    const EXTRACTION_BASE = 'https://proxiesembed.movix.cash';
    let extractEndpoint = null;

    if (u.includes('sibnet')) {
        extractEndpoint = `${EXTRACTION_BASE}/api/extract-sibnet?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('vidmoly')) {
        extractEndpoint = `${EXTRACTION_BASE}/api/extract-vidmoly?url=${embedUrl}`;
    } else if (u.includes('vidzy')) {
        extractEndpoint = `${EXTRACTION_BASE}/api/extract-vidzy?url=${embedUrl}`;
    } else if (u.includes('voe.sx') || u.includes('voe.')) {
        extractEndpoint = `${API_BASE}/api/voe/m3u8?url=${embedUrl}`;
    } else if (u.includes('doodstream') || u.includes('dood.')) {
        extractEndpoint = `${EXTRACTION_BASE}/api/extract-doodstream?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('uqload')) {
        extractEndpoint = `${EXTRACTION_BASE}/api/extract-uqload?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('supervideo')) {
        extractEndpoint = `${EXTRACTION_BASE}/api/extract-supervideo?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('dropload')) {
        extractEndpoint = `${EXTRACTION_BASE}/api/extract-dropload?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes('fsvid') || u.includes('premium')) {
        extractEndpoint = `${EXTRACTION_BASE}/api/extract-fsvid?url=${encodeURIComponent(embedUrl)}`;
    }

    if (!extractEndpoint) return null;

    try {
        const data = await fetchJson(extractEndpoint);
        if (!data || data.error) return null;

        return data.url || data.source || data.m3u8 || data.mp4 || data.link || (data.sources && data.sources[0]?.url);
    } catch (e) {
        return null;
    }
}

/**
 * Check if a URL is direct video
 */
function isDirectUrl(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    return u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mkv') || u.includes('/playlist/') || u.includes('/master.');
}

/**
 * Process a source link
 */
async function processSource(url, label, provider, lang) {
    if (!url) return null;

    let finalUrl = url;
    // Try to get direct link if it's an embed
    if (!isDirectUrl(url)) {
        const extracted = await tryExtract(url);
        if (extracted) finalUrl = extracted;
    }

    return {
        name: `Movix`,
        title: `[${langTag(lang)}] ${provider} - ${playerName(url, label)}`,
        url: finalUrl,
        quality: 'HD',
        headers: PLAYBACK_HEADERS
    };
}

// ─── Direct TMDB API (Reliable) ──────────────────────────────────────
async function fetchTmdbApi(tmdbId, mediaType, season, episode) {
    const streams = [];
    const url = mediaType === 'movie'
        ? `${API_BASE}/api/tmdb/movie/${tmdbId}`
        : `${API_BASE}/api/tmdb/tv/${tmdbId}?season=${season}&episode=${episode}`;

    const data = await fetchJson(url);
    if (!data) return streams;

    const links = mediaType === 'movie' ? data.player_links : data.current_episode?.player_links;
    if (!Array.isArray(links)) return streams;

    const tasks = links.map(link => {
        return processSource(link.decoded_url || link.url, link.quality, 'Direct', link.language);
    });

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) streams.push(r.value);
    }

    return streams;
}

// ─── FStream API (Fallback) ─────────────────────────────────────────
async function fetchFStream(tmdbId, mediaType, season, episode) {
    const streams = [];
    const url = mediaType === 'movie'
        ? `${API_BASE}/api/fstream/movie/${tmdbId}`
        : `${API_BASE}/api/fstream/tv/${tmdbId}/season/${season}`;

    const data = await fetchJson(url);
    if (!data) return streams;

    let playersByLang = {};
    if (mediaType === 'movie') {
        playersByLang = data.players || {};
    } else if (data.episodes) {
        const epData = data.episodes[String(episode)] || data.episodes[episode];
        if (epData) playersByLang = epData.languages || epData.players || epData;
    }

    const tasks = [];
    for (const lang of Object.keys(playersByLang)) {
        const items = playersByLang[lang];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
            if (!item.url) continue;
            tasks.push(processSource(item.url, item.player, 'FStream', lang));
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
    console.log(`[Movix] Starting extraction for ${mediaType} ${tmdbId}`);

    // We fetch Direct API first as it's the best, others in parallel as fallbacks
    const results = await Promise.allSettled([
        fetchTmdbApi(tmdbId, mediaType, season, episode),
        fetchFStream(tmdbId, mediaType, season, episode)
    ]);

    const streams = [];
    for (const r of results) {
        if (r.status === 'fulfilled') streams.push(...r.value);
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const s of streams) {
        if (!seen.has(s.url)) {
            seen.add(s.url);
            unique.push(s);
        }
    }

    return unique;
}
