/**
 * Extractor for Neko-Sama (animes-sama.su)
 * WordPress "animestream" theme:
 * - Direct URL construction: /anime/{slug}-saison-{N}/
 * - Search fallback: /?s={query}
 * - Episodes: ul.eplister → li with .epl-num, .epl-title, a[href]
 * - Player: server buttons with base64-encoded iframe → player page → embed iframe
 */

import { fetchText, setCurrentSignal } from './http.js';
import { safeFetch, isAborted, isBudgetExhausted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://animes-sama.su";
const BUDGET_MS = 40000;

function normalize(s) {
    if (!s) return '';
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, '')
        .replace(/[':!.,?]/g, '')
        .replace(/-/g, ' ')
        .replace(/\b(the|season|part|cour|saison)\b/ig, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function toSlug(title) {
    if (!title) return '';
    return title.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, '')
        .replace(/[':!.,?']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .replace(/-+/g, '-');
}

/**
 * Extract episode list from an anime season page.
 * Returns array of { num, title, url }
 */
function extractEpisodes(html) {
    const episodes = [];
    const epRegex = /<a[^>]*href="([^"]+)"[^>]*>\s*<div class="epl-num">(\d+)<\/div>\s*<div class="epl-title">([^<]+)<\/div>/gi;
    let match;
    while ((match = epRegex.exec(html)) !== null) {
        episodes.push({
            num: parseInt(match[2]),
            title: match[3].trim(),
            url: match[1],
        });
    }
    return episodes;
}

/**
 * Extract server button URLs from an episode page.
 * Server buttons have: onclick="loadMi({ value: 'BASE64' })"
 * The base64 decodes to an iframe with a player URL.
 * Returns array of { label, playerUrl }
 */
function extractServerButtons(html) {
    const buttons = [];
    // Match loadMi calls with base64 values (handles multiline HTML)
    const loadMiRegex = /loadMi\(\{\s*value:\s*'([A-Za-z0-9+/=]+)'\s*\}\)/g;
    let loadMatch;
    while ((loadMatch = loadMiRegex.exec(html)) !== null) {
        try {
            const b64 = loadMatch[1];
            const decoded = atob(b64);
            const srcMatch = decoded.match(/src="([^"]+)"/);
            if (!srcMatch) continue;
            // Find label: after the loadMi call, look for VO-N or VF-N before </button>
            const afterBtn = html.substring(loadMatch.index, loadMatch.index + 800);
            const labelMatch = afterBtn.match(/;">\s*([A-Z]+-\d+)\s*<\/button>/);
            const label = labelMatch ? labelMatch[1].trim() : 'VO';
            buttons.push({ label, playerUrl: srcMatch[1].replace(/&#038;/g, '&') });
        } catch (e) { /* skip invalid base64 */ }
    }
    return buttons;
}

/**
 * Resolve a player page URL to get the actual embed iframe URL.
 */
async function resolvePlayerUrl(playerUrl) {
    try {
        const res = await safeFetch(playerUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": BASE_URL + "/",
            },
            timeout: 10000,
        });
        if (!res || !res.ok) return null;
        const html = await res.text();
        const iframeMatch = html.match(/<iframe[^>]*class="player-iframe"[^>]*src="([^"]+)"/i) ||
                           html.match(/<iframe[^>]*src="([^"]+)"/i);
        if (iframeMatch) {
            let url = iframeMatch[1].replace(/&#038;/g, '&');
            return url;
        }
    } catch (e) { /* skip */ }
    return null;
}

/**
 * Determine language from server button label.
 */
function labelToLanguage(label) {
    const upper = (label || '').toUpperCase();
    if (upper.startsWith('VF')) return 'VF';
    if (upper.startsWith('VO')) return 'VOSTFR';
    return 'VOSTFR';
}

/**
 * Try to fetch an anime page and verify it has episodes.
 * Returns episodes array or empty array if not found.
 */
async function tryAnimePage(url) {
    try {
        const html = await fetchText(url);
        if (html && html.length > 1000) {
            const episodes = extractEpisodes(html);
            if (episodes.length > 0) return episodes;
        }
    } catch (e) { /* skip */ }
    return [];
}

/**
 * Search anime on animes-sama.su via WordPress search.
 * Returns array of { title, url, slug }
 */
async function searchAnime(query) {
    try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
        const html = await fetchText(searchUrl);
        if (!html || html.length < 1000) return [];

        const results = [];
        const linkRegex = /href="(https?:\/\/animes-sama\.su\/anime\/[^"]+)"/gi;
        let match;
        const seen = new Set();
        while ((match = linkRegex.exec(html)) !== null) {
            const url = match[1];
            if (seen.has(url)) continue;
            seen.add(url);
            const slug = url.replace(/\/$/, '').split('/').pop();
            results.push({ url, slug });
        }
        return results;
    } catch (e) {
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const startTime = Date.now();
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    console.log(`[NekoSama] Titles: ${titles.slice(0, 3).join(', ')}`);

    // 1. Try direct URL construction from each title
    let seasonUrl = null;
    let episodes = [];

    for (const title of titles) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;

        const slug = toSlug(title);
        if (!slug) continue;

        // Try with season suffix
        if (season) {
            const url1 = `${BASE_URL}/anime/${slug}-saison-${season}/`;
            episodes = await tryAnimePage(url1);
            if (episodes.length > 0) {
                seasonUrl = url1;
                console.log(`[NekoSama] ✓ Direct URL: ${url1} (${episodes.length} eps)`);
                break;
            }
        }

        // Try without season suffix (for single-season anime or season 1)
        const url2 = `${BASE_URL}/anime/${slug}/`;
        episodes = await tryAnimePage(url2);
        if (episodes.length > 0) {
            seasonUrl = url2;
            console.log(`[NekoSama] ✓ Direct URL: ${url2} (${episodes.length} eps)`);
            break;
        }

        // Try with "saison-1" explicitly
        const url3 = `${BASE_URL}/anime/${slug}-saison-1/`;
        episodes = await tryAnimePage(url3);
        if (episodes.length > 0) {
            seasonUrl = url3;
            console.log(`[NekoSama] ✓ Direct URL: ${url3} (${episodes.length} eps)`);
            break;
        }
    }

    // 2. Fallback: search
    if (episodes.length === 0) {
        console.log(`[NekoSama] Direct URL failed, trying search...`);
        for (const title of titles) {
            if (isBudgetExhausted(startTime, BUDGET_MS)) break;
            const results = await searchAnime(title);
            if (results.length === 0) continue;

            console.log(`[NekoSama] Search found ${results.length} results`);

            // Score and pick the best match
            const queryNorm = normalize(title);
            const seasonStr = season ? `saison-${season}` : '';
            const scored = results.map(r => {
                const slugNorm = normalize(r.slug);
                let score = 0;
                if (slugNorm === queryNorm) score += 100;
                else if (slugNorm.includes(queryNorm)) score += 80;
                else if (queryNorm.includes(slugNorm)) score += 60;
                if (seasonStr && r.slug.includes(seasonStr)) score += 50;
                if (seasonStr && !r.slug.includes(seasonStr) && r.slug.includes('saison-')) score -= 30;
                if (r.slug.includes('oav') || r.slug.includes('special')) score -= 20;
                return { ...r, score };
            }).sort((a, b) => b.score - a.score);

            // Try top 3 candidates
            for (const r of scored.slice(0, 3)) {
                if (isBudgetExhausted(startTime, BUDGET_MS)) break;
                episodes = await tryAnimePage(r.url);
                if (episodes.length > 0) {
                    seasonUrl = r.url;
                    console.log(`[NekoSama] ✓ Search match: ${r.url} (score: ${r.score}, ${episodes.length} eps)`);
                    break;
                }
            }
            if (episodes.length > 0) break;
        }
    }

    if (episodes.length === 0) {
        console.log(`[NekoSama] No episodes found for tmdbId ${tmdbId} season ${season}`);
        return [];
    }

    // 3. Find the target episode
    const targetEp = episodes.find(e => e.num === episodeNum);
    if (!targetEp) {
        console.log(`[NekoSama] Episode ${episodeNum} not found (available: ${episodes.map(e => e.num).join(', ')})`);
        return [];
    }

    console.log(`[NekoSama] Episode ${episodeNum}: ${targetEp.url}`);

    // 4. Fetch the episode page and extract server buttons
    let serverButtons = [];
    try {
        const html = await fetchText(targetEp.url);
        if (html && html.length > 1000) {
            serverButtons = extractServerButtons(html);
            console.log(`[NekoSama] Found ${serverButtons.length} server buttons`);
        }
    } catch (e) {
        console.log(`[NekoSama] Failed to fetch episode page: ${e.message}`);
        return [];
    }

    if (serverButtons.length === 0) {
        console.log(`[NekoSama] No server buttons found`);
        return [];
    }

    // 5. Resolve server buttons → player URL → embed iframe
    // Early-exit: stop after 1 VF + 1 VOSTFR resolved (sufficient for playback)
    const streams = [];
    const langCount = { VF: 0, VOSTFR: 0 };
    const TARGET_PER_LANG = 1;

    for (const btn of serverButtons) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;

        const lang = labelToLanguage(btn.label);
        // Skip if we already have enough streams for this language
        if (langCount[lang] >= TARGET_PER_LANG) continue;

        console.log(`[NekoSama] Resolving ${btn.label} (${lang})...`);

        const embedUrl = await resolvePlayerUrl(btn.playerUrl);
        if (embedUrl) {
            streams.push({
                url: embedUrl,
                title: `NekoSama [${lang}] ${btn.label}`,
                name: `NekoSama (${lang})`,
                language: lang,
                provider: 'NekoSama',
                headers: { "Referer": BASE_URL + "/" },
            });
            langCount[lang]++;
            console.log(`[NekoSama] ✓ ${btn.label}: ${embedUrl.slice(0, 80)}`);

            // Early-exit: we have at least 1 VF and 1 VOSTFR
            if (langCount.VF >= TARGET_PER_LANG && langCount.VOSTFR >= TARGET_PER_LANG) {
                console.log(`[NekoSama] Early-exit: VF=${langCount.VF}, VOSTFR=${langCount.VOSTFR}`);
                break;
            }
        } else {
            console.log(`[NekoSama] ✗ ${btn.label}: failed to resolve`);
        }
    }

    console.log(`[NekoSama] Total streams: ${streams.length}`);
    return streams;
}
