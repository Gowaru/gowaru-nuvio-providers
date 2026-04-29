/**
 * Extractor Logic for Frenchstream
 */

import cheerio from 'cheerio-without-node-native';
import { fetchText, fetchJson, BASE_URL } from './http.js';
import { resolveStream } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const SEARCH_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'des', 'les', 'une', 'dans', 'sur', 'via', 'de', 'du', 'la', 'le'
]);
const MIN_MATCH_SCORE = 40;

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

function parseSearchCards(html) {
    const $ = cheerio.load(html);
    const cards = [];

    $('.short .short-in').each((_, element) => {
        const $card = $(element);
        const $poster = $card.find('a.short-poster').first();
        const href = $poster.attr('href') || '';
        if (!href.startsWith('/')) return;

        const title = ($card.find('.short-title').first().text() || '').trim();
        if (!title) return;

        const onclick = $card.find('.info-button').attr('onclick') || '';
        const newsId = pickNewsId(onclick, href);
        if (!newsId) return;

        cards.push({
            newsId,
            href: `${BASE_URL}${href}`,
            title,
            isSeries: isSeriesCard($card, href, title)
        });
    });

    return cards;
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
    const url = `${BASE_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;
    const html = await fetchText(url);
    let cards = parseSearchCards(html);

    cards = cards.filter((card) => (mediaType === 'tv' ? card.isSeries : !card.isSeries));
    if (cards.length === 0) return [];

    return cards
        .map((card) => ({
            ...card,
            _score: scoreCard(card, title, mediaType, season),
            _matchedTitle: title
        }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 5);
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

    const searchTitles = titles.slice(0, 6);

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
        console.warn(`[Frenchstream] No confident match for tmdb=${tmdbId} (bestScore=${bestScore})`);
        return [];
    }
    console.log(`[Frenchstream] Match: ${match.title} (${match.newsId}) score=${bestScore} via="${match._matchedTitle}"`);

    const candidates = mediaType === 'movie'
        ? collectMovieCandidates(await fetchJson(`${BASE_URL}/engine/ajax/film_api.php?id=${match.newsId}`))
        : collectEpisodeCandidates(await fetchJson(`${BASE_URL}/ep-data.php?id=${match.newsId}`), episode);

    if (candidates.length === 0) return [];

    const streams = await resolveCandidates(candidates);
    console.log(`[Frenchstream] Candidates: ${candidates.length}, Returned: ${streams.length}`);
    return streams;
}