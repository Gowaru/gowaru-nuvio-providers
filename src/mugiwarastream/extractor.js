import { fetchText, BASE } from './http.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { resolveStream } from '../utils/resolvers.js';

function unescapeJsString(str) {
    return str
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\//g, '/')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractAnimeServerData(html) {
    const pushRegex = /__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
    let allData = "";
    for (const match of html.matchAll(pushRegex)) {
        allData += unescapeJsString(match[1]);
    }

    const marker = '"animeServer":';
    const idx = allData.indexOf(marker);
    if (idx === -1) return null;

    const valueStart = allData.indexOf('{', idx + marker.length);
    if (valueStart === -1) return null;

    let depth = 0;
    let end = valueStart;
    for (let i = valueStart; i < allData.length; i++) {
        if (allData[i] === '{') depth++;
        else if (allData[i] === '}') {
            depth--;
            if (depth === 0) { end = i + 1; break; }
        }
    }

    const jsonStr = allData.substring(valueStart, end);
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("[Mugiwara] JSON parse error:", e.message);
        return null;
    }
}

function normalizeSearchTitle(s) {
    if (!s) return "";
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?()\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function searchAnime(html) {
    const results = JSON.parse(html);
    if (!results || !Array.isArray(results.results)) return null;
    return results.results;
}

function getEpisodeCount(saison) {
    if (!saison || !saison.lang) return 0;
    const langs = Object.values(saison.lang);
    for (const langData of langs) {
        if (Array.isArray(langData) && langData.length > 0) {
            const first = langData[0];
            if (Array.isArray(first)) return first.length;
        }
    }
    return 0;
}

function matchSaison(saisons, tmdbSeason, episodeNum) {
    if (!saisons || !Array.isArray(saisons)) return null;

    const seasonStr = String(tmdbSeason);

    for (const s of saisons) {
        if (s.notASeason) continue;
        if (s.id === seasonStr) {
            const count = getEpisodeCount(s);
            if (episodeNum <= count) return { saison: s, episodeIndex: episodeNum - 1 };
            break;
        }
    }

    const subSeasons = saisons.filter(s => {
        if (s.notASeason) return false;
        const numPart = s.id.split('-')[0];
        return numPart === seasonStr;
    }).sort((a, b) => {
        const pa = a.id.split('-');
        const pb = b.id.split('-');
        const na = parseInt(pa[0]) || 0;
        const nb = parseInt(pb[0]) || 0;
        if (na !== nb) return na - nb;
        const sa = pa.length > 1 ? parseInt(pa[1]) || 0 : 0;
        const sb = pb.length > 1 ? parseInt(pb[1]) || 0 : 0;
        return sa - sb;
    });

    if (subSeasons.length > 0) {
        let cumStart = 0;
        for (const s of subSeasons) {
            const count = getEpisodeCount(s);
            if (episodeNum > cumStart && episodeNum <= cumStart + count) {
                return { saison: s, episodeIndex: episodeNum - cumStart - 1 };
            }
            cumStart += count;
        }
    }

    const ordered = saisons.filter(s => !s.notASeason);
    const idx = tmdbSeason - 1;
    if (idx >= 0 && idx < ordered.length) {
        return { saison: ordered[idx], episodeIndex: episodeNum - 1 };
    }

    return null;
}

function extractEpisodeUrls(saison, lang) {
    if (!saison || !saison.lang) return [];
    const langData = saison.lang[lang];
    if (!langData || !Array.isArray(langData) || langData.length === 0) return [];

    const urls = [];
    const maxLen = Math.max(...langData.map(arr => Array.isArray(arr) ? arr.length : 0));
    for (let ep = 0; ep < maxLen; ep++) {
        const sources = [];
        for (let sourceIdx = 0; sourceIdx < langData.length; sourceIdx++) {
            const arr = langData[sourceIdx];
            if (Array.isArray(arr) && ep < arr.length) {
                sources.push(arr[ep]);
            }
        }
        if (sources.length > 0) urls.push(sources);
    }
    return urls;
}

export async function extractStreams(tmdbId, mediaType, season, episodeNum) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];

    let slug = null;
    let animeData = null;

    const seenQueries = new Set();
    const tryQueries = [];
    for (const t of titles) {
        if (!t || seenQueries.has(t.toLowerCase())) continue;
        seenQueries.add(t.toLowerCase());
        const isFrench = /[\u00C0-\u00FF]/.test(t) || t.toLowerCase().startsWith("l'");
        tryQueries.push({ title: t, priority: isFrench ? 0 : t === titles[0] ? 1 : 2 });
    }
    tryQueries.sort((a, b) => a.priority - b.priority);

    for (const { title: t } of tryQueries) {
        const query = encodeURIComponent(t);
        let searchHtml;
        try {
            searchHtml = await fetchText(`${BASE}/api/search?q=${query}`);
        } catch (e) {
            continue;
        }

        const results = searchAnime(searchHtml);
        if (!results || results.length === 0) continue;

        const nt = normalizeSearchTitle(t);
        let best = null;
        let bestScore = -1;

        for (const r of results) {
            const nr = normalizeSearchTitle(r.anime);
            let score = 0;
            if (nr === nt) score = 100;
            else if (nr.includes(nt) || nt.includes(nr)) score = 80;
            else if (r.matched && normalizeSearchTitle(r.matched) === nt) score = 90;

            if (score > bestScore) {
                bestScore = score;
                best = r;
            }
        }

        if (best && bestScore >= 80) {
            slug = best.slug;
            break;
        }
    }

    if (!slug) {
        console.log(`[Mugiwara] No anime found for tmdbId ${tmdbId}`);
        return [];
    }

    console.log(`[Mugiwara] Found slug: ${slug}`);

    let pageHtml = null;
    for (let s = 1; s <= 20; s++) {
        try {
            pageHtml = await fetchText(`${BASE}/catalogue/${slug}/episodes/saison${s}`);
            break;
        } catch (e) {
            continue;
        }
    }

    if (!pageHtml) {
        console.log(`[Mugiwara] No valid season page found for ${slug}`);
        return [];
    }

    animeData = extractAnimeServerData(pageHtml);
    if (!animeData) {
        console.log(`[Mugiwara] Could not extract anime data from page`);
        return [];
    }

    if (!animeData.options || !animeData.options.saisons) {
        console.log(`[Mugiwara] No saisons in extracted data`);
        return [];
    }

    const saisons = animeData.options.saisons;
    const lang = mediaType === 'movie' ? 'vf' : 'vostfr';

    const matched = matchSaison(saisons, season, episodeNum);
    if (!matched) {
        console.log(`[Mugiwara] No matching saison for S${season}E${episodeNum} (available: ${saisons.filter(s => !s.notASeason).map(s => s.id + '(' + getEpisodeCount(s) + 'eps)').join(', ')})`);
        return [];
    }

    const { saison: matchedSaison, episodeIndex: epIndex } = matched;
    const episodeUrls = extractEpisodeUrls(matchedSaison, lang);
    if (epIndex < 0 || epIndex >= episodeUrls.length) {
        console.log(`[Mugiwara] Episode ${episodeNum} out of range (${episodeUrls.length} eps)`);
        return [];
    }

    const sourceUrls = episodeUrls[epIndex];
    const streams = [];
    const labels = ['Sibnet', 'Vidmoly', 'Sendvid', 'VK', 'Youtube', 'Other'];

    for (let i = 0; i < sourceUrls.length; i++) {
        let url = sourceUrls[i];
        if (!url || typeof url !== 'string') continue;
        if (url.startsWith('//')) url = 'https:' + url;

        const sourceLabel = i < labels.length ? labels[i] : `Source ${i + 1}`;
        const langLabel = lang === 'vf' ? 'VF' : 'VOSTFR';

        streams.push({
            name: `Mugiwara (${langLabel})`,
            title: `${matchedSaison.name || 'Saison ' + matchedSaison.id} - ${sourceLabel}`,
            url: url,
            quality: 'HD',
            headers: { 'Referer': BASE + '/' }
        });
    }

    console.log(`[Mugiwara] Found ${streams.length} sources for S${season}E${episodeNum}`);

    const resolved = [];
    for (const stream of streams) {
        try {
            const r = await resolveStream(stream);
            if (r && r.url && r.isDirect) resolved.push(r);
        } catch (e) {
            resolved.push(stream);
        }
    }

    return resolved.length > 0 ? resolved : streams;
}
