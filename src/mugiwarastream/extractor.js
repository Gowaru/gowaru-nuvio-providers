import { fetchText, BASE } from './http.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { resolveStream, safeJson } from '../utils/resolvers.js';

function extractPushContent(html) {
    const chunks = [];
    let pos = 0;
    while (true) {
        const start = html.indexOf('self.__next_f.push([1,"', pos);
        if (start === -1) break;
        const strStart = start + 'self.__next_f.push([1,"'.length;

        let i = strStart;
        let chunk = '';
        let escaped = false;
        while (i < html.length) {
            const ch = html[i];
            if (escaped) {
                if (ch === 'n') chunk += '\n';
                else if (ch === 't') chunk += '\t';
                else if (ch === 'r') chunk += '\r';
                else if (ch === '\\') chunk += '\\';
                else if (ch === '"') chunk += '"';
                else if (ch === '/') chunk += '/';
                else if (ch === 'u') {
                    const hex = html.substring(i + 1, i + 5);
                    chunk += String.fromCharCode(parseInt(hex, 16));
                    i += 4;
                } else chunk += ch;
                escaped = false;
                i++;
                continue;
            }
            if (ch === '\\') { escaped = true; i++; continue; }
            if (ch === '"' && html.substring(i + 1, i + 3) === '])') break;
            chunk += ch;
            i++;
        }

        if (chunk) chunks.push(chunk);
        pos = i + 1;
    }
    return chunks.join('');
}

function extractAnimeServerData(html) {
    const allData = extractPushContent(html);

    const marker = '"animeServer":';
    const idx = allData.indexOf(marker);
    if (idx === -1) return null;

    const valueStart = allData.indexOf('{', idx + marker.length);
    if (valueStart === -1) return null;

    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = valueStart;
    for (let i = valueStart; i < allData.length; i++) {
        const ch = allData[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inStr) { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
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
    try {
        const results = safeJson(JSON.parse(html || '{}'));
        if (results && Array.isArray(results.results)) return results.results;
    } catch (e) {
        console.warn('[Mugiwara] Search JSON parse failed:', e.message);
    }
    return null;
}

function getEpisodeCount(saison) {
    if (!saison || !saison.lang) return 0;
    let maxCount = 0;
    for (const langData of Object.values(saison.lang)) {
        if (Array.isArray(langData) && langData.length > 0) {
            const first = langData[0];
            if (Array.isArray(first) && first.length > maxCount) {
                maxCount = first.length;
            }
        }
    }
    return maxCount;
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
        const s = ordered[idx];
        const count = getEpisodeCount(s);
        if (episodeNum <= count) {
            return { saison: s, episodeIndex: episodeNum - 1 };
        }
    }

    const mainSeasons = saisons.filter(s => {
        if (s.notASeason) return false;
        if (!s.lang || Object.keys(s.lang).length === 0) return false;
        if (/[a-zA-Z]/.test(s.id.replace(/-/g, ''))) return false;
        return true;
    });

    let cumulativeStart = 0;
    for (const s of mainSeasons) {
        const count = getEpisodeCount(s);
        if (count > 0 && episodeNum > cumulativeStart && episodeNum <= cumulativeStart + count) {
            return { saison: s, episodeIndex: episodeNum - cumulativeStart - 1 };
        }
        cumulativeStart += count;
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

const SOURCE_LABELS = ['Sibnet', 'Vidmoly', 'Sendvid', 'VK', 'Youtube', 'Other'];

function buildStreamEntry(url, label, langLabel, title, quality) {
    let resolvedUrl = url;
    if (typeof resolvedUrl === 'string' && resolvedUrl.startsWith('//')) resolvedUrl = 'https:' + resolvedUrl;
    return {
        name: `Mugiwara (${langLabel})`,
        title: `${title} - ${label}`,
        url: resolvedUrl,
        quality: quality || 'HD',
        headers: { 'Referer': BASE + '/' }
    };
}

async function resolveStreams(streams) {
    const results = await Promise.allSettled(
        streams.map(stream =>
            resolveStream(stream)
                .then(r => (r && r.url && r.isDirect) ? r : stream)
                .catch(() => stream)
        )
    );
    const resolved = results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
    return resolved.length > 0 ? resolved : streams;
}

function collectSourceUrls(episodeSourceUrls) {
    if (!episodeSourceUrls || episodeSourceUrls.length === 0) return [];
    const streams = [];
    for (let i = 0; i < episodeSourceUrls.length; i++) {
        let url = episodeSourceUrls[i];
        if (!url || typeof url !== 'string') continue;
        if (url.startsWith('//')) url = 'https:' + url;
        streams.push({ url, sourceIndex: i });
    }
    return streams;
}

function extractFilmStreams(filmOptions) {
    if (!filmOptions || !filmOptions.lang) return [];

    const labels = SOURCE_LABELS;
    const filmNames = (filmOptions.names || []).map(n => n && n.name ? n.name : 'Film');
    const filmCount = filmNames.length > 0 ? filmNames.length : 1;

    const allFilmStreams = [];
    for (let filmIdx = 0; filmIdx < filmCount; filmIdx++) {
        const filmName = filmNames[filmIdx] || `Film ${filmIdx + 1}`;
        for (const [lang, langData] of Object.entries(filmOptions.lang)) {
            if (!Array.isArray(langData)) continue;
            const langLabel = lang === 'vf' ? 'VF' : lang.toUpperCase();
            for (let sourceIdx = 0; sourceIdx < langData.length; sourceIdx++) {
                const arr = langData[sourceIdx];
                if (!Array.isArray(arr) || filmIdx >= arr.length) continue;
                const url = arr[filmIdx];
                if (!url || typeof url !== 'string') continue;
                const sourceLabel = sourceIdx < labels.length ? labels[sourceIdx] : `Source ${sourceIdx + 1}`;
                allFilmStreams.push(buildStreamEntry(url, sourceLabel, langLabel, filmName));
            }
        }
    }
    return allFilmStreams;
}

async function findSlug(titles) {
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
        const nt = normalizeSearchTitle(t);
        if (nt.length < 4) continue;

        const query = encodeURIComponent(t);
        let searchHtml;
        try {
            searchHtml = await fetchText(`${BASE}/api/search?q=${query}`);
        } catch (e) {
            continue;
        }

        const results = searchAnime(searchHtml);
        if (!results || results.length === 0) continue;

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
            return best.slug;
        }
    }
    return null;
}

function collectStreamsForLang(saison, lang, episodeIndex, seasonName) {
    const episodeUrls = extractEpisodeUrls(saison, lang);
    if (episodeIndex < 0 || episodeIndex >= episodeUrls.length) return [];

    const sourceUrls = episodeUrls[episodeIndex];
    const langLabel = lang === 'vf' ? 'VF' : 'VOSTFR';
    return collectSourceUrls(sourceUrls).map(s => {
        const label = s.sourceIndex < SOURCE_LABELS.length ? SOURCE_LABELS[s.sourceIndex] : `Source ${s.sourceIndex + 1}`;
        return buildStreamEntry(s.url, label, langLabel, seasonName);
    });
}

const slugCache = {};
const animeDataCache = {};

async function findCachedSlug(titles) {
    for (const t of titles) {
        if (slugCache[t]) return slugCache[t];
    }
    const slug = await findSlug(titles);
    if (slug) {
        for (const t of titles) {
            if (!slugCache[t]) slugCache[t] = slug;
        }
    }
    return slug;
}

async function getAnimeData(slug, mediaType) {
    const cacheKey = slug + ':' + mediaType;
    if (animeDataCache[cacheKey]) {
        console.log(`[Mugiwara] Cache hit for ${cacheKey}`);
        return animeDataCache[cacheKey];
    }

    const pageUrl = mediaType === 'movie'
        ? `${BASE}/catalogue/${slug}/films`
        : `${BASE}/catalogue/${slug}/episodes/saison1`;

    let pageHtml;
    try {
        pageHtml = await fetchText(pageUrl);
    } catch (e) {
        if (mediaType !== 'movie') {
            const probes = [];
            for (let s = 2; s <= 20; s++) {
                probes.push(
                    fetchText(`${BASE}/catalogue/${slug}/episodes/saison${s}`)
                        .then(html => ({ html }))
                        .catch(() => null)
                );
            }
            const settled = await Promise.allSettled(probes);
            for (const r of settled) {
                if (r.status === 'fulfilled' && r.value) {
                    pageHtml = r.value.html;
                    break;
                }
            }
        }
    }

    if (!pageHtml) {
        console.log(`[Mugiwara] No page found for ${cacheKey}`);
        return null;
    }

    const animeData = extractAnimeServerData(pageHtml);
    if (animeData) {
        animeDataCache[cacheKey] = animeData;
    }
    return animeData;
}

export async function extractStreams(tmdbId, mediaType, season, episodeNum) {
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const slug = await findCachedSlug(titles);
    if (!slug) {
        console.log(`[Mugiwara] No anime found for tmdbId ${tmdbId}`);
        return [];
    }

    const animeData = await getAnimeData(slug, mediaType);
    if (!animeData) {
        console.log(`[Mugiwara] Could not extract anime data for ${slug}`);
        return [];
    }

    if (mediaType === 'movie') {
        const filmOptions = animeData.options && animeData.options.FILM_OPTIONS;
        if (!filmOptions) {
            console.log(`[Mugiwara] No FILM_OPTIONS in extracted data`);
            return [];
        }
        const streams = extractFilmStreams(filmOptions);
        console.log(`[Mugiwara] Found ${streams.length} film sources for ${slug}`);
        return await resolveStreams(streams);
    }

    if (!animeData.options || !animeData.options.saisons) {
        console.log(`[Mugiwara] No saisons in extracted data`);
        return [];
    }

    const saisons = animeData.options.saisons;
    const langs = ['vostfr', 'vf'];

    const matched = matchSaison(saisons, effectiveSeason, episodeNum);
    if (!matched) {
        console.log(`[Mugiwara] No matching saison for S${season}E${episodeNum} (available: ${saisons.filter(s => !s.notASeason).map(s => s.id + '(' + getEpisodeCount(s) + 'eps)').join(', ')})`);
        return [];
    }

    const { saison: matchedSaison, episodeIndex: epIndex } = matched;
    const seasonName = matchedSaison.name || 'Saison ' + matchedSaison.id;

    const seenUrls = new Set();
    const allStreams = [];

    for (const lang of langs) {
        if (!matchedSaison.lang || !matchedSaison.lang[lang]) {
            console.log(`[Mugiwara] No ${lang} data for ${seasonName}`);
            continue;
        }

        const langEpCount = Math.max(...matchedSaison.lang[lang].map(arr => Array.isArray(arr) ? arr.length : 0));
        if (epIndex >= langEpCount) {
            console.log(`[Mugiwara] ${lang} only has ${langEpCount} episodes, S${season}E${episodeNum} out of range`);
            continue;
        }

        const streams = collectStreamsForLang(matchedSaison, lang, epIndex, seasonName);
        for (const s of streams) {
            const key = s.url + '|' + s.name;
            if (!seenUrls.has(key)) {
                seenUrls.add(key);
                allStreams.push(s);
            }
        }
    }

    console.log(`[Mugiwara] Found ${allStreams.length} sources for S${season}E${episodeNum} (${langs.filter(l => matchedSaison.lang && matchedSaison.lang[l]).map(l => l.toUpperCase()).join('/')})`);
    return await resolveStreams(allStreams);
}
