import { fetchJson } from './http.js';
import { resolveStream, withTimeout } from '../utils/resolvers.js';

const API_BASE = 'https://api.movix.cloud';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Hosts connus pour être lents ou problématiques → on les ignore
const SLOW_HOSTS = ['up4fun', 'dood', 'doodstream', 'moonplayer', 'filemoon', 'streamtape', 'stape'];
// Hosts rapides prioritaires (résolution fiable en < 3s)
const FAST_HOSTS = ['voe', 'uqload', 'fsvid', 'vidzy', 'netu', 'younetu', 'sendvid', 'sibnet'];

function originFromUrl(url) {
    try { return new URL(url).origin; }
    catch (e) { return 'https://movix.cash'; }
}

function normalizeLangTag(lang) {
    const l = (lang || '').toLowerCase();
    if (l === 'vff' || l === 'vfq' || l === 'vf' || l.includes('french')) return 'VF';
    if (l === 'vostfr' || l === 'vost' || l.includes('vostfr')) return 'VOSTFR';
    if (l === 'default' || l === 'multi') return 'MULTI';
    return (lang || 'VF').toUpperCase();
}

/** Score de priorité d'un stream : plus bas = résolu en premier */
function streamPriority(url, language) {
    const u = (url || '').toLowerCase();
    let score = 0;

    // Priorité linguistique : VF < Default/MULTI < VOSTFR < autres
    const l = (language || '').toUpperCase();
    if (l === 'VF' || l === 'VFF' || l === 'VFQ') score += 0;
    else if (l === 'DEFAULT' || l === 'MULTI') score += 10;
    else if (l === 'VOSTFR') score += 20;
    else score += 30;

    // Priorité par host : slow hosts en dernier, fast hosts en premier
    const isSlow = SLOW_HOSTS.some(h => u.includes(h));
    const isFast = FAST_HOSTS.some(h => u.includes(h));
    if (isSlow) score += 100;
    else if (isFast) score += 0;
    else score += 50; // hosts inconnus au milieu

    return score;
}

function pushStream(streams, provider, server, lang, url, quality) {
    if (!url || typeof url !== 'string') return;
    const origin = originFromUrl(url);
    streams.push({
        name: 'Movix',
        title: `[${normalizeLangTag(lang)}] ${provider} - ${server || 'Player'}`,
        url,
        quality: quality || 'HD',
        language: normalizeLangTag(lang),  // stocké pour le tri
        headers: { Referer: origin + '/', Origin: origin, 'User-Agent': USER_AGENT }
    });
}

function isExoPlayableUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    if (u.includes('test-videos.co.uk') || u.includes('sample-videos.com') || u.includes('big_buck_bunny')) return false;
    if (u.includes('/embed') || u.includes('/e/') || u.includes('iframe') || u.includes('index.php')) return false;
    if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mkv') || u.includes('.webm') || u.includes('.ts')) return true;
    if (u.includes('manifest') || u.includes('playlist') || u.includes('/hls/')) return true;
    return false;
}

async function resolveForExo(stream) {
    let resolved = null;
    if (isExoPlayableUrl(stream.url)) {
        resolved = { ...stream, isDirect: true };
    } else {
        // Timeout réduit à 4s pour accélérer l'échec sur les hosts lents
        try { resolved = await withTimeout(resolveStream(stream), 4000); }
        catch (e) { console.warn(`[Movix] resolveStream timeout: ${e?.message}`); }
    }
    if (!resolved || !resolved.url || !resolved.isDirect) return null;
    if (!isExoPlayableUrl(resolved.url)) return null;
    return {
        name: resolved.name || stream.name,
        title: resolved.title || stream.title,
        url: resolved.url,
        quality: resolved.quality || 'HD',
        isDirect: true,
        headers: { ...resolved.headers, 'User-Agent': USER_AGENT }
    };
}

async function fetchOnce(url) {
    try {
        const data = await fetchJson(url);
        if (!data || data.error) return null;
        return data;
    } catch (e) { console.warn(`[Movix] fetchOnce failed: ${e?.message}`); return null; }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const streams = [];
    if (!tmdbId) { console.log('[Movix] Missing tmdbId'); return streams; }

    const isMovie = mediaType === 'movie';
    const episodeNum = Number(episode) || 1;

    // API base: api.movix.cloud (migrée depuis api.movix.cash). Même format de données.
    const legacyUrls = isMovie
        ? [`${API_BASE}/api/fstream/movie/${tmdbId}`, `${API_BASE}/api/wiflix/movie/${tmdbId}`, `${API_BASE}/api/cpasmal/movie/${tmdbId}`]
        : [`${API_BASE}/api/fstream/tv/${tmdbId}/season/${Number(season) || 1}`, `${API_BASE}/api/wiflix/tv/${tmdbId}/${Number(season) || 1}`, `${API_BASE}/api/cpasmal/tv/${tmdbId}/${Number(season) || 1}/${episodeNum}`];

    const results = await Promise.allSettled(legacyUrls.map(url => fetchOnce(url)));
    let anyLegacyFound = false;

    for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        anyLegacyFound = true;
        const data = r.value;
        if (data.players) {
            for (const lang of Object.keys(data.players)) {
                const list = data.players[lang];
                if (!Array.isArray(list)) continue;
                for (const item of list) pushStream(streams, 'FStream', item?.player, lang, item?.url, item?.quality);
            }
        }
        if (data.links) {
            for (const lang of Object.keys(data.links)) {
                const list = data.links[lang];
                if (!Array.isArray(list)) continue;
                for (const item of list) pushStream(streams, 'Wiflix', item?.name || item?.player, lang, item?.url, item?.quality);
            }
        }
        if (!isMovie) {
            const ep = data?.episodes?.[String(episodeNum)] || data?.episodes?.[episodeNum];
            if (ep && typeof ep === 'object') {
                // Format 1: fstream → ep.languages { lang: [{player, url, quality}] }
                if (ep.languages) {
                    for (const lang of Object.keys(ep.languages)) {
                        const list = ep.languages[lang];
                        if (!Array.isArray(list)) continue;
                        for (const item of list) pushStream(streams, 'FStream', item?.player, lang, item?.url, item?.quality);
                    }
                }

                // Format 2: wiflix → ep { lang: [{name, url, episode}] }
                for (const lang of ['vf', 'vostfr', 'vo', 'VFF', 'VFQ', 'VOSTFR', 'Default']) {
                    const list = ep[lang];
                    if (!Array.isArray(list)) continue;
                    for (const item of list) pushStream(streams, 'Wiflix', item?.name || item?.player, lang, item?.url, item?.quality);
                }
            }
        }

        // Format 3: cpasmal direct format { vf: [{player, url}], vostfr: [...] }
        // (data at top level, not nested under episodes)
        for (const lang of ['vf', 'vostfr', 'vo', 'VFF', 'VFQ']) {
            const list = data[lang];
            if (!Array.isArray(list)) continue;
            for (const item of list) pushStream(streams, 'Cpasmal', item?.player || item?.name, lang, item?.url, item?.quality);
        }
    }

    if (!anyLegacyFound) {
        console.log('[Movix] No streams found from any source');
    }

    if (streams.length === 0) return [];

    // Déduplication + tri par priorité (VF d'abord, hosts rapides d'abord)
    const seen = new Set();
    const unique = [];
    for (const s of streams) {
        if (!seen.has(s.url)) { seen.add(s.url); unique.push(s); }
    }
    unique.sort((a, b) => streamPriority(a.url, a.language) - streamPriority(b.url, b.language));

    // Résolution par lots : 3 streams max, stop dès qu'on a des streams jouables
    const MAX_RESOLVE = 3;
    const BATCH_SIZE = 2;
    const playable = [];
    const seenPlayable = new Set();

    const toResolve = unique.slice(0, MAX_RESOLVE);

    // Batch 1 : hosts les plus rapides
    const batch1 = toResolve.slice(0, BATCH_SIZE);
    const batch1Results = await Promise.allSettled(batch1.map(s => resolveForExo(s)));
    for (const r of batch1Results) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        if (seenPlayable.has(r.value.url)) continue;
        seenPlayable.add(r.value.url);
        playable.push(r.value);
    }

    // Batch 2 : si pas assez de streams, tenter le reste
    if (playable.length < 2 && toResolve.length > BATCH_SIZE) {
        const batch2 = toResolve.slice(BATCH_SIZE, MAX_RESOLVE);
        const batch2Results = await Promise.allSettled(batch2.map(s => resolveForExo(s)));
        for (const r of batch2Results) {
            if (r.status !== 'fulfilled' || !r.value) continue;
            if (seenPlayable.has(r.value.url)) continue;
            seenPlayable.add(r.value.url);
            playable.push(r.value);
        }
    }

    console.log(`[Movix] Total: ${unique.length} streams, ${playable.length} playable (resolved ${toResolve.length})`);
    return playable;
}
