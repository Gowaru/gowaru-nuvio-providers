/**
 * Extractor for FullAnime (fullanime.fr)
 * Clean PHP site with SSR content:
 * - Search: /search?s={query} → /voir-anime/{slug}
 * - Episodes: /voir-anime/{slug}/episode/{N}
 * - Player: var links = [...] in HTML with 3 embed URLs (sendvid, vidmoly, oneupload)
 */

import { fetchText, setCurrentSignal } from './http.js';
import { safeFetch, isAborted, isBudgetExhausted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://www.fullanime.fr";
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
 * Quick health check on an embed URL (HEAD request, 3s timeout).
 * Returns true if the embed is accessible.
 */
async function checkEmbed(url) {
    try {
        const res = await safeFetch(url, {
            method: 'HEAD',
            timeout: 3000,
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        return res && (res.ok || res.status === 302 || res.status === 301);
    } catch (e) {
        return false;
    }
}

/**
 * Search anime on fullanime.fr.
 * Returns array of { slug, url, title }
 */
async function searchAnime(query) {
    try {
        const searchUrl = `${BASE_URL}/search?s=${encodeURIComponent(query)}&_t=${Date.now()}`;
        const html = await fetchText(searchUrl);
        if (!html || html.length < 500) return [];

        const results = [];
        const linkRegex = /href="(\/voir-anime\/[^"]+)"/gi;
        let match;
        const seen = new Set();
        while ((match = linkRegex.exec(html)) !== null) {
            const path = match[1];
            if (seen.has(path)) continue;
            seen.add(path);
            const slug = path.replace('/voir-anime/', '');
            const title = slug.replace(/-vostfr$/, '').replace(/-saison-\d+$/, '').replace(/-/g, ' ');
            results.push({ slug, url: `${BASE_URL}${path}`, title });
        }
        return results;
    } catch (e) {
        return [];
    }
}

/**
 * Extract episode list from an anime page.
 * Returns array of { num, url, title }
 */
function extractEpisodes(html) {
    const episodes = [];
    const epRegex = /href="(\/voir-anime\/[^"]*\/episode\/(\d+))"[^>]*title="([^"]*)"/gi;
    let match;
    const seen = new Set();
    while ((match = epRegex.exec(html)) !== null) {
        const num = parseInt(match[2]);
        if (seen.has(num)) continue;
        seen.add(num);
        episodes.push({
            num,
            url: `${BASE_URL}${match[1]}`,
            title: match[3],
        });
    }
    return episodes;
}

/**
 * Extract embed URLs from an episode page.
 * Looks for: var links = ["url1", "url2", "url3"]
 * Also extracts default iframe src.
 * Returns array of embed URLs
 */
function extractEmbedUrls(html) {
    const urls = [];

    // Method 1: Extract from var links = [...] JavaScript array
    // URLs are escaped: "https:\/\/sendvid.com\/embed\/xxx"
    const linksMatch = html.match(/var\s+links\s*=\s*\[(.*?)\]/s);
    if (linksMatch) {
        const raw = linksMatch[1];
        // Match quoted URLs with escaped slashes
        const urlRegex = /"(https?:[^"]+)"/g;
        let m;
        while ((m = urlRegex.exec(raw)) !== null) {
            let url = m[1].replace(/\\\//g, '/').replace(/\\/g, '');
            if (!urls.includes(url)) urls.push(url);
        }
    }

    // Method 2: Extract from iframe src (fallback)
    if (urls.length === 0) {
        const iframeMatch = html.match(/<iframe[^>]*src="(https?:\/\/[^"]+)"/i);
        if (iframeMatch && !urls.includes(iframeMatch[1])) {
            urls.push(iframeMatch[1]);
        }
    }

    return urls;
}

/**
 * Determine language from the slug/title.
 * fullanime.fr is VOSTFR only, but we check for VF in the slug.
 */
function inferLanguage(slug, title) {
    const combined = `${slug} ${title}`.toLowerCase();
    if (combined.includes('-vf') || combined.includes(' vf') || combined.includes('french')) return 'VF';
    return 'VOSTFR';
}

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const startTime = Date.now();
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    console.log(`[FullAnime] Titles: ${titles.slice(0, 3).join(', ')}`);

    // 1. Try direct URL construction from each title
    let animeUrl = null;
    let episodes = [];

    for (const title of titles) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;

        const slug = toSlug(title);
        if (!slug) continue;

        // Try with season suffix and -vostfr
        if (season && season > 1) {
            const seasonSlug = `${slug}-saison-${season}-vostfr`;
            const url1 = `${BASE_URL}/voir-anime/${seasonSlug}`;
            try {
                const html = await fetchText(url1);
                if (html && html.length > 1000) {
                    episodes = extractEpisodes(html);
                    if (episodes.length > 0) {
                        animeUrl = url1;
                        console.log(`[FullAnime] ✓ Direct: ${url1} (${episodes.length} eps)`);
                        break;
                    }
                }
            } catch (e) { /* skip */ }
        }

        // Try without season (default = season 1) with -vostfr
        const url2 = `${BASE_URL}/voir-anime/${slug}-vostfr`;
        try {
            const html = await fetchText(url2);
            if (html && html.length > 1000) {
                episodes = extractEpisodes(html);
                if (episodes.length > 0) {
                    animeUrl = url2;
                    console.log(`[FullAnime] ✓ Direct: ${url2} (${episodes.length} eps)`);
                    break;
                }
            }
        } catch (e) { /* skip */ }
    }

    // 2. Fallback: search
    if (episodes.length === 0) {
        console.log(`[FullAnime] Direct URL failed, trying search...`);
        for (const title of titles) {
            if (isBudgetExhausted(startTime, BUDGET_MS)) break;
            const results = await searchAnime(title);
            if (results.length === 0) continue;

            console.log(`[FullAnime] Search found ${results.length} results`);

            // Score and pick the best match
            const queryNorm = normalize(title);
            const seasonStr = season ? `saison ${season}` : '';
            const scored = results.map(r => {
                const slugNorm = normalize(r.slug);
                let score = 0;
                if (slugNorm === queryNorm) score += 100;
                else if (slugNorm.includes(queryNorm)) score += 80;
                else if (queryNorm.includes(slugNorm)) score += 60;
                if (seasonStr && r.slug.includes(seasonStr.replace(' ', '-'))) score += 50;
                if (season && season > 1 && !r.slug.includes('saison')) score -= 30;
                return { ...r, score };
            }).sort((a, b) => b.score - a.score);

            // Try top 3 candidates
            for (const r of scored.slice(0, 3)) {
                if (isBudgetExhausted(startTime, BUDGET_MS)) break;
                try {
                    const html = await fetchText(r.url);
                    if (html && html.length > 1000) {
                        episodes = extractEpisodes(html);
                        if (episodes.length > 0) {
                            animeUrl = r.url;
                            console.log(`[FullAnime] ✓ Search: ${r.url} (score: ${r.score}, ${episodes.length} eps)`);
                            break;
                        }
                    }
                } catch (e) { /* skip */ }
            }
            if (episodes.length > 0) break;
        }
    }

    if (episodes.length === 0) {
        console.log(`[FullAnime] No episodes found for tmdbId ${tmdbId} season ${season}`);
        return [];
    }

    // 3. Find the target episode
    const targetEp = episodes.find(e => e.num === episodeNum);
    if (!targetEp) {
        console.log(`[FullAnime] Episode ${episodeNum} not found (available: ${episodes.map(e => e.num).join(', ')})`);
        return [];
    }

    console.log(`[FullAnime] Episode ${episodeNum}: ${targetEp.url}`);

    // 4. Fetch the episode page and extract embed URLs
    let embedUrls = [];
    try {
        const html = await fetchText(targetEp.url);
        if (html && html.length > 500) {
            embedUrls = extractEmbedUrls(html);
            console.log(`[FullAnime] Found ${embedUrls.length} embed URLs`);
        }
    } catch (e) {
        console.log(`[FullAnime] Failed to fetch episode page: ${e.message}`);
        return [];
    }

    if (embedUrls.length === 0) {
        console.log(`[FullAnime] No embed URLs found`);
        return [];
    }

    // 5. Hybrid strategy: reorder by reliability + HEAD check
    const lang = inferLanguage(animeUrl || '', targetEp.title);
    const PRIORITY = ['vidmoly', 'oneupload', 'sendvid'];
    
    // Reorder by reliability (vidmoly first, sendvid last)
    const sorted = [...embedUrls].sort((a, b) => {
        const pa = PRIORITY.findIndex(p => a.toLowerCase().includes(p));
        const pb = PRIORITY.findIndex(p => b.toLowerCase().includes(p));
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    });
    console.log(`[FullAnime] Priority order: ${sorted.map(u => u.replace('https://', '').split('/')[0]).join(' > ')}`);

    // Try top 2 embeds with HEAD check
    const streams = [];
    for (const embedUrl of sorted.slice(0, 2)) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;

        const hostname = embedUrl.replace('https://', '').split('/')[0];
        console.log(`[FullAnime] Checking ${hostname}...`);

        const ok = await checkEmbed(embedUrl);
        if (ok) {
            streams.push({
                url: embedUrl,
                title: `FullAnime [${lang}]`,
                name: `FullAnime (${lang})`,
                language: lang,
                provider: 'FullAnime',
                headers: { "Referer": BASE_URL + "/" },
            });
            console.log(`[FullAnime] ✓ ${hostname} is alive`);
            break;
        } else {
            console.log(`[FullAnime] ✗ ${hostname} is down`);
        }
    }

    // Fallback: return first embed even if HEAD check failed
    if (streams.length === 0 && sorted.length > 0) {
        streams.push({
            url: sorted[0],
            title: `FullAnime [${lang}]`,
            name: `FullAnime (${lang})`,
            language: lang,
            provider: 'FullAnime',
            headers: { "Referer": BASE_URL + "/" },
        });
        console.log(`[FullAnime] Fallback: ${sorted[0].replace('https://', '').split('/')[0]} (HEAD check failed)`);
    }

    console.log(`[FullAnime] Total streams: ${streams.length}`);
    return streams;
}
