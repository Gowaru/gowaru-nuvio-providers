/**
 * Extractor Logic for Frenchstream
 */

import cheerio from 'cheerio-without-node-native';
import { fetchText, fetchJson, BASE_URL } from './http.js';
import { resolveStream } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

function normalize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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

function scoreCard(card, queryTitle) {
    const q = normalize(queryTitle);
    const t = normalize(card.title);
    if (!q || !t) return 0;
    if (t === q) return 100;
    if (t.includes(q)) return 70;
    if (q.includes(t)) return 50;

    const qWords = new Set(q.split(' ').filter(Boolean));
    const tWords = new Set(t.split(' ').filter(Boolean));
    let common = 0;
    for (const w of qWords) {
        if (tWords.has(w)) common += 1;
    }
    return common * 8;
}

async function searchByTitle(title, mediaType) {
    const url = `${BASE_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;
    const html = await fetchText(url);
    let cards = parseSearchCards(html);

    cards = cards.filter((card) => (mediaType === 'tv' ? card.isSeries : !card.isSeries));
    if (cards.length === 0) return null;

    cards.sort((a, b) => scoreCard(b, title) - scoreCard(a, title));
    return cards[0];
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
    return {
        name,
        title: `[${languageLabel(language)}] ${hostLabel(host)}`,
        url,
        quality: 'HD',
        headers: {
            Referer: `${BASE_URL}/`,
            Origin: BASE_URL
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
    const episodeKey = String(Number(episode) || 1);
    const streams = [];

    for (const language of ['vf', 'vostfr', 'vo']) {
        const byEpisode = apiData?.[language];
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
    if (uniqueDirect.length > 0) return uniqueDirect;

    // Fallback: keep embed URLs for external player mode.
    return dedupeByUrl(candidates);
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];

    let match = null;
    for (const title of titles) {
        try {
            match = await searchByTitle(title, mediaType);
            if (match) {
                console.log(`[Frenchstream] Match: ${match.title} (${match.newsId})`);
                break;
            }
        } catch (e) {
            console.warn(`[Frenchstream] Search failed for "${title}": ${e.message}`);
        }
    }

    if (!match) return [];

    const candidates = mediaType === 'movie'
        ? collectMovieCandidates(await fetchJson(`${BASE_URL}/engine/ajax/film_api.php?id=${match.newsId}`))
        : collectEpisodeCandidates(await fetchJson(`${BASE_URL}/ep-data.php?id=${match.newsId}`), episode);

    if (candidates.length === 0) return [];

    const streams = await resolveCandidates(candidates);
    console.log(`[Frenchstream] Candidates: ${candidates.length}, Returned: ${streams.length}`);
    return streams;
}