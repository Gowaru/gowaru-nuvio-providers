/**
 * Extractor Logic for Frenchstream
 */

import cheerio from 'cheerio-without-node-native';
import { fetchText, fetchJson, BASE_URL, BASE_URLS } from './http.js';
import { resolveStream } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const SEARCH_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'des', 'les', 'une', 'dans', 'sur', 'via', 'de', 'du', 'la', 'le'
]);
const MIN_MATCH_SCORE = 40;
const FSTREAM_API_BASE = 'https://api.movix.cash';

function normalize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getOrigin(url) {
    try {
        return new URL(url).origin;
    } catch (e) {
        return BASE_URL;
    }
}

function pickNewsId(onclick, href) {
    const modalId = (onclick || '').match(/openModal\('(\d+)'\)/i)?.[1];
    if (modalId) return modalId;
    return (href || '').match(/^\/(\d+)-/)?.[1] || null;
}

function isSeriesCard($card, href, title) {
    if ($card.find('.mli-eps').length > 0) return true;
    const text = `${href || ''} ${title || ''}`.toLowerCase();
    return text.includes('saison') || text.includes('series') || text.includes('/s-tv/');
}

function normalizeHref(href, baseUrl) {
    if (!href || typeof href !== 'string') return null;
    const trimmed = href.trim();
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('/')) return `${baseUrl}${trimmed}`;
    return `${baseUrl}/${trimmed.replace(/^\/+/, '')}`;
}

function parseSearchCards(html, baseUrl) {
    const $ = cheerio.load(html);
    const cards = [];

    $('.short .short-in').each((_, element) => {
        const $card = $(element);
        const hrefRaw =
            $card.find('a.short-poster').first().attr('href') ||
            $card.find('a.img-box').first().attr('href') ||
            $card.find('a[href]').first().attr('href') ||
            '';
        const href = normalizeHref(hrefRaw, baseUrl);
        if (!href) return;

        const title = ($card.find('.short-title').first().text() || '').trim();
        if (!title) return;

        const onclick = $card.find('.info-button').attr('onclick') || '';
        const newsId = pickNewsId(onclick, hrefRaw);
        if (!newsId) return;

        cards.push({
            newsId,
            href: `${baseUrl}${href}`,
            title,
            isSeries: isSeriesCard($card, href, title),
            baseUrl
        });
    });

    return cards;
}

function buildTitleQueries(titles) {
    const queries = [];
    const push = (value) => {
        if (typeof value !== 'string') return;
        const v = value.trim();
        if (!v) return;
        if (!queries.some((q) => q.toLowerCase() === v.toLowerCase())) queries.push(v);
    };

    for (const title of (titles || []).slice(0, 8)) {
        push(title);
        push(title.replace(/['’]/g, ' '));
        push(title.replace(/\s*\([^)]*\)\s*/g, ' '));

        const beforeColon = title.split(':')[0];
        if (beforeColon && beforeColon.length >= 3) push(beforeColon);
    }

    return queries.slice(0, 10);
}

function scoreCard(card, queryTitle, mediaType, season) {
    const q = normalize(queryTitle);
    const t = normalize(card.title);
    const hrefN = normalize(card.href || '');
    const hay = `${t} ${hrefN}`.trim();
    if (!q || !t) return 0;

    let score = 0;
    if (t === q) score += 120;
    if (hay.includes(q)) score += 70;
    if (q.includes(t)) score += 40;

    const qWords = new Set(q.split(' ').filter((w) => w && w.length > 2 && !SEARCH_STOPWORDS.has(w)));
    const tWords = new Set(hay.split(' ').filter(Boolean));
    let common = 0;
    for (const w of qWords) {
        if (tWords.has(w)) common += 1;
    }
    score += common * 8;

    if (mediaType === 'movie' && card.isSeries) score -= 50;
    if (mediaType === 'tv' && !card.isSeries) score -= 30;

    const seasonNum = Number(season) || 1;
    const text = `${card.title} ${card.href}`.toLowerCase();
    const hasSeasonMention = /saison\s*\d+|s-tv\//i.test(text);

    if (mediaType === 'tv') {
        if (seasonNum > 1) {
            const seasonRegex = new RegExp(`saison\\s*${seasonNum}|[-_/]${seasonNum}(?:[^0-9]|$)`, 'i');
            if (seasonRegex.test(text)) score += 20;
            if (hasSeasonMention && !seasonRegex.test(text)) score -= 25;
        } else if (seasonNum === 1 && /saison\s*[2-9]/i.test(text)) {
            score -= 25;
        }
    }

    return score;
}

async function searchByTitle(title, mediaType, season) {
    const allCards = [];

    for (const baseUrl of BASE_URLS) {
        try {
            const url = `${baseUrl}/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;
            const html = await fetchText(url, { baseUrl });
            const cards = parseSearchCards(html, baseUrl);
            allCards.push(...cards);
        } catch (e) {
            console.warn(`[Frenchstream] Search failed on ${baseUrl} for "${title}": ${e.message}`);
        }
    }

    const filtered = allCards.filter((card) => (mediaType === 'tv' ? card.isSeries : !card.isSeries));
    if (filtered.length === 0) return [];

    return filtered
        .map((card) => ({
            ...card,
            _score: scoreCard(card, title, mediaType, season),
            _matchedTitle: title
        }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 8);
}

function hostLabel(hostKey) {
    const k = (hostKey || '').toLowerCase();
    if (k === 'premium') return 'FSVID';
    if (k === 'vidzy') return 'VIDZY';
    if (k === 'uqload') return 'UQLOAD';
    if (k === 'dood') return 'DOOD';
    if (k === 'voe') return 'VOE';
    if (k === 'filmoon') return 'FILEMOON';
    if (k === 'netu') return 'NETU';
    return hostKey ? hostKey.toUpperCase() : 'PLAYER';
}

function languageLabel(languageKey) {
    const k = (languageKey || '').toLowerCase();
    if (k === 'vf' || k === 'default' || k === 'vfq') return 'VF';
    if (k === 'vostfr') return 'VOSTFR';
    if (k === 'vo') return 'VO';
    return languageKey ? languageKey.toUpperCase() : 'VF';
}

function toStream(name, host, language, url) {
    const origin = getOrigin(url);
    return {
        name,
        title: `[${languageLabel(language)}] ${hostLabel(host)}`,
        url,
        quality: 'HD',
        headers: {
            Referer: `${origin}/`,
            Origin: origin,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
        }
    };
}

function collectMovieCandidates(apiData) {
    const players = apiData?.players;
    if (!players || typeof players !== 'object') return [];

    const streams = [];
    for (const [host, versions] of Object.entries(players)) {
        if (!versions || typeof versions !== 'object') continue;
        for (const [language, value] of Object.entries(versions)) {
            if (typeof value !== 'string' || !value.startsWith('http')) continue;
            streams.push(toStream('Frenchstream', host, language, value));
        }
    }

    return streams;
}

function collectEpisodeCandidates(apiData, episode) {
    const episodeNum = Number(episode) || 1;
    const streams = [];

    for (const language of ['vf', 'vostfr', 'vo']) {
        const byEpisode = apiData?.[language];
        if (!byEpisode || typeof byEpisode !== 'object') continue;

        const episodeKey = Object.keys(byEpisode).find((k) => Number(k) === episodeNum) || String(episodeNum);
        const hosts = byEpisode?.[episodeKey];
        if (!hosts || typeof hosts !== 'object') continue;

        for (const [host, value] of Object.entries(hosts)) {
            if (typeof value !== 'string' || !value.startsWith('http')) continue;
            streams.push(toStream('Frenchstream', host, language, value));
        }
    }

    return streams;
}

function dedupeByUrl(streams) {
    const seen = new Set();
    const out = [];
    for (const stream of streams) {
        if (!stream?.url || seen.has(stream.url)) continue;
        seen.add(stream.url);
        out.push(stream);
    }
    return out;
}

function collectFstreamApiMovieCandidates(apiData) {
    const players = apiData?.players;
    if (!players || typeof players !== 'object') return [];

    const streams = [];
    for (const [lang, list] of Object.entries(players)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            if (typeof item?.url !== 'string' || !item.url.startsWith('http')) continue;
            streams.push(toStream('Frenchstream', item?.player || 'player', lang, item.url));
        }
    }
    return streams;
}

function collectFstreamApiTvCandidates(apiData, episode) {
    const episodeNum = Number(episode) || 1;
    const ep = apiData?.episodes?.[String(episodeNum)] || apiData?.episodes?.[episodeNum];
    const langs = ep?.languages;
    if (!langs || typeof langs !== 'object') return [];

    const streams = [];
    for (const [lang, list] of Object.entries(langs)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            if (typeof item?.url !== 'string' || !item.url.startsWith('http')) continue;
            streams.push(toStream('Frenchstream', item?.player || 'player', lang, item.url));
        }
    }
    return streams;
}

async function fetchFstreamApiFallback(tmdbId, mediaType, season, episode) {
    try {
        const url = mediaType === 'movie'
            ? `${FSTREAM_API_BASE}/api/fstream/movie/${tmdbId}`
            : `${FSTREAM_API_BASE}/api/fstream/tv/${tmdbId}/season/${Number(season) || 1}`;

        const data = await fetchJson(url, {
            headers: {
                Accept: 'application/json, text/plain, */*',
                Referer: 'https://movix.cash/',
                Origin: 'https://movix.cash'
            }
        });

        if (!data || data.success === false) return [];
        return mediaType === 'movie'
            ? collectFstreamApiMovieCandidates(data)
            : collectFstreamApiTvCandidates(data, episode);
    } catch (e) {
        console.warn(`[Frenchstream] FStream API fallback failed: ${e.message}`);
        return [];
    }
}

async function resolveCandidates(candidates) {
    const resolved = await Promise.allSettled(candidates.map((stream) => resolveStream(stream)));
    const direct = [];
    for (const result of resolved) {
        if (result.status !== 'fulfilled') continue;
        const stream = result.value;
        if (!stream?.url) continue;
        if (stream.isDirect) direct.push(stream);
    }

    const uniqueDirect = dedupeByUrl(direct);
    // ExoPlayer crashes on unresolved embed URLs; keep only direct links.
    return uniqueDirect;
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];

    const searchTitles = buildTitleQueries(titles);

    let match = null;
    let bestScore = -Infinity;
    for (const title of searchTitles) {
        try {
            const ranked = await searchByTitle(title, mediaType, season);
            if (ranked.length > 0 && ranked[0]._score > bestScore) {
                bestScore = ranked[0]._score;
                match = ranked[0];
            }
        } catch (e) {
            console.warn(`[Frenchstream] Search failed for "${title}": ${e.message}`);
        }
    }

    if (!match || bestScore < MIN_MATCH_SCORE) {
        console.warn(`[Frenchstream] No confident web match for tmdb=${tmdbId} (bestScore=${bestScore}), trying API fallback`);
        const fallbackCandidates = await fetchFstreamApiFallback(tmdbId, mediaType, season, episode);
        if (fallbackCandidates.length === 0) return [];

        const fallbackStreams = await resolveCandidates(fallbackCandidates);
        console.log(`[Frenchstream] API fallback candidates: ${fallbackCandidates.length}, returned: ${fallbackStreams.length}`);
        return fallbackStreams;
    }
    console.log(`[Frenchstream] Match: ${match.title} (${match.newsId}) score=${bestScore} via="${match._matchedTitle}"`);

    const sourceBase = match.baseUrl || BASE_URL;
    const candidates = mediaType === 'movie'
        ? collectMovieCandidates(await fetchJson(`${sourceBase}/engine/ajax/film_api.php?id=${match.newsId}`, { baseUrl: sourceBase }))
        : collectEpisodeCandidates(await fetchJson(`${sourceBase}/ep-data.php?id=${match.newsId}`, { baseUrl: sourceBase }), episode);

    if (candidates.length === 0) return [];

    const streams = await resolveCandidates(candidates);
    console.log(`[Frenchstream] Candidates: ${candidates.length}, Returned: ${streams.length}`);
    return streams;
}