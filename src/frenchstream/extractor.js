/**
 * Extractor Logic for Frenchstream
 */

import cheerio from 'cheerio-without-node-native';
import { fetchText, fetchJson, BASE_URL, BASE_URLS } from './http.js';
import { resolveStream, safeFetch, USER_AGENT } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const SEARCH_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'des', 'les', 'une', 'dans', 'sur', 'via', 'de', 'du', 'la', 'le'
]);
const MIN_MATCH_SCORE = 40;
const STRONG_MATCH_SCORE = 90;
const MAX_TITLE_QUERIES = 3;
const FSTREAM_API_BASE = 'https://api.movix.cash';

function getRuntimeProfile(options = {}) {
    const g = (typeof globalThis !== 'undefined')
        ? globalThis
        : ((typeof global !== 'undefined') ? global : {});
    const explicitProfile = String(g?.__NUVIO_RUNTIME_PROFILE || g?.NUVIO_RUNTIME_PROFILE || '').toLowerCase();
    const explicitTv = Boolean(g?.__NUVIO_IS_TV || g?.__IS_ANDROID_TV);
    const nav = g?.navigator || {};
    const ua = String(nav.userAgent || '');
    const platform = String(nav.platform || '');
    const tvUaHint = /(android tv|aft[0-9a-z-]+|bravia|shield|mibox|smarttv|googletv)/i.test(`${ua} ${platform}`);
    const forcedTv = Boolean(options && (options.forceTvProfile || options.isTv));
    const isTv = forcedTv || explicitTv || explicitProfile === 'tv' || tvUaHint;
    return {
        isTv,
        label: isTv ? 'tv' : 'default'
    };
}

function createRequestId(tmdbId, mediaType) {
    const rnd = Math.random().toString(36).slice(2, 8);
    return `${mediaType || 'media'}-${tmdbId || 'unknown'}-${Date.now().toString(36)}-${rnd}`;
}

function getNetworkConfig(profile) {
    if (profile?.isTv) {
        return {
            fetchTimeoutMs: 12000,
            fstreamApiTimeoutMs: 18000,
            fallbackWaitMs: 12000,
            resolveAttemptTimeoutMs: 22000,
            maxCandidatesToResolve: 20,
            workerCount: 3
        };
    }

    return {
        fetchTimeoutMs: 8000,
        fstreamApiTimeoutMs: 15000,
        fallbackWaitMs: 9000,
        resolveAttemptTimeoutMs: 18000,
        maxCandidatesToResolve: 30,
        workerCount: 8
    };
}

async function withTimeout(promise, ms) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(null), ms);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

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
    if (!url || typeof url !== 'string') return BASE_URL;
    const match = url.match(/^(https?:\/\/[^\/]+)/);
    return match ? match[1] : BASE_URL;
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
        const normalized = normalize(v);
        if (normalized.length < 3) return;
        if (/^[0-9\s]+$/.test(normalized)) return;
        if (!queries.some((q) => q.toLowerCase() === v.toLowerCase())) queries.push(v);
    };

    for (const title of (titles || []).slice(0, 3)) {
        push(title);

        const beforeColon = title.split(':')[0];
        if (beforeColon && beforeColon.length >= 3) push(beforeColon);
    }

    return queries.slice(0, MAX_TITLE_QUERIES);
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
            const html = await fetchText(url, { baseUrl, timeoutMs: 6500 });
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

function playbackHeadersFor(url, sourceUrl, headers = {}) {
    const sourceOrigin = getOrigin(sourceUrl || BASE_URL);
    const referer = headers.Referer || headers.referer || `${sourceOrigin}/`;

    return {
        ...headers,
        Referer: referer,
        Origin: headers.Origin || headers.origin || getOrigin(referer || sourceOrigin),
        'User-Agent': headers['User-Agent'] || headers['user-agent'] || USER_AGENT,
        Accept: headers.Accept || headers.accept || '*/*'
    };
}

function toStream(name, host, language, url, sourceUrl) {
    const h = (host || '').toLowerCase();
    let priority = 10;
    if (h === 'premium' || h === 'vidzy') priority = 100;
    else if (h === 'voe' || h === 'uqload') priority = 80;
    else if (h === 'dood' || h === 'filmoon') priority = 60;

    return {
        name,
        title: `[${languageLabel(language)}] ${hostLabel(host)}`,
        url,
        quality: 'HD',
        headers: playbackHeadersFor(url, sourceUrl),
        _sourceUrl: sourceUrl || BASE_URL,
        _priority: priority,
        _language: language
    };
}

function readHeader(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';
    const wanted = String(name || '').toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (String(key).toLowerCase() === wanted) return value || '';
    }
    return '';
}

async function validatePlaybackUrl(url, headers = {}) {
    try {
        const res = await safeFetch(url, {
            method: 'GET',
            headers: {
                ...headers,
                Range: 'bytes=0-0'
            },
            redirect: 'follow'
        });
        if (!res) return false;

        if (res.status === 206) return true;
        if (typeof res.status === 'number' && res.status >= 200 && res.status < 300) {
            const contentType = String(readHeader(res.headers, 'content-type') || '');
            if (/video\//i.test(contentType)) return true;
            if (/mpegurl|application\/vnd\.apple\.mpegurl|application\/x-mpegurl/i.test(contentType)) return true;
        }

        return false;
    } catch (e) {
        return false;
    }
}

function collectMovieCandidates(apiData, sourceUrl) {
    const players = apiData?.players;
    if (!players || typeof players !== 'object') return [];

    const streams = [];
    for (const [host, versions] of Object.entries(players)) {
        if (!versions || typeof versions !== 'object') continue;
        for (const [language, value] of Object.entries(versions)) {
            if (typeof value !== 'string' || !value.startsWith('http')) continue;
            streams.push(toStream('Frenchstream', host, language, value, sourceUrl));
        }
    }

    return streams;
}

function collectEpisodeCandidates(apiData, episode, sourceUrl) {
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
            streams.push(toStream('Frenchstream', host, language, value, sourceUrl));
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

function collectFstreamApiMovieCandidates(apiData, sourceUrl) {
    const players = apiData?.players;
    if (!players || typeof players !== 'object') return [];

    const streams = [];
    for (const [lang, list] of Object.entries(players)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            if (typeof item?.url !== 'string' || !item.url.startsWith('http')) continue;
            streams.push(toStream('Frenchstream', item?.player || 'player', lang, item.url, sourceUrl));
        }
    }
    return streams;
}

function collectFstreamApiTvCandidates(apiData, episode, sourceUrl) {
    const episodeNum = Number(episode) || 1;
    const ep = apiData?.episodes?.[String(episodeNum)] || apiData?.episodes?.[episodeNum];
    const langs = ep?.languages;
    if (!langs || typeof langs !== 'object') return [];

    const streams = [];
    for (const [lang, list] of Object.entries(langs)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            if (typeof item?.url !== 'string' || !item.url.startsWith('http')) continue;
            streams.push(toStream('Frenchstream', item?.player || 'player', lang, item.url, sourceUrl));
        }
    }
    return streams;
}

async function fetchFstreamApiFallback(tmdbId, mediaType, season, episode, ctx = {}) {
    try {
        const timeoutMs = Number(ctx?.network?.fstreamApiTimeoutMs) || 15000;
        const url = mediaType === 'movie'
            ? `${FSTREAM_API_BASE}/api/fstream/movie/${tmdbId}`
            : `${FSTREAM_API_BASE}/api/fstream/tv/${tmdbId}/season/${Number(season) || 1}`;

        const data = await fetchJson(url, {
            timeoutMs,
            headers: {
                Accept: 'application/json, text/plain, */*',
                Referer: 'https://movix.cash/',
                Origin: 'https://movix.cash'
            }
        });

        if (!data || data.success === false) return [];
        return mediaType === 'movie'
            ? collectFstreamApiMovieCandidates(data, 'https://movix.cash/')
            : collectFstreamApiTvCandidates(data, episode, 'https://movix.cash/');
    } catch (e) {
        console.warn(`[Frenchstream] FStream API fallback failed: ${e.message}`);
        return [];
    }
}

async function scrapePageIframes(pageUrl, language = 'vf', ctx = {}) {
    try {
        const timeoutMs = Number(ctx?.network?.fetchTimeoutMs) || 8000;
        const html = await fetchText(pageUrl, { timeoutMs });
        if (!html) return [];
        
        const $ = cheerio.load(html);
        const candidates = [];
        
        // Look for iframes in the content or player area
        $('iframe[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (!src || !src.startsWith('http') || src.includes('facebook') || src.includes('google')) return;
            
            const host = src.match(/https?:\/\/([^\/]+)/)?.[1] || 'player';
            candidates.push(toStream('Frenchstream', host, language, src, pageUrl));
        });

        // Look for links that might be players
        $('a[href*="vidmoly"], a[href*="voe"], a[href*="uqload"], a[href*="dood"]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            const host = href.match(/https?:\/\/([^\/]+)/)?.[1] || 'player';
            candidates.push(toStream('Frenchstream', host, language, href, pageUrl));
        });

        return candidates;
    } catch (e) {
        return [];
    }
}

async function resolveCandidates(candidates, ctx = {}) {
    const direct = [];
    const network = ctx?.network || {};
    const resolveAttemptTimeoutMs = Number(network.resolveAttemptTimeoutMs) || 18000;
    const maxCandidatesToResolve = Number(network.maxCandidatesToResolve) || 30;
    const workerLimit = Number(network.workerCount) || 8;

    // Helper: try resolving a stream with header variants and validate playback
    async function tryResolveWithVariants(origStream) {
        const sourceUrl = origStream._sourceUrl || origStream.headers?.Referer || origStream.headers?.referer || BASE_URL;
        const sourceOrigin = getOrigin(sourceUrl);
        const headerVariants = [
            origStream.headers || {},
            playbackHeadersFor(origStream.url, sourceUrl, origStream.headers || {}),
            { ...(origStream.headers || {}), 'User-Agent': 'Mozilla/5.0', Referer: `${sourceOrigin}/`, Origin: sourceOrigin, Accept: '*/*' },
        ];

        for (const hv of headerVariants) {
            try {
                const attemptStream = { ...origStream, headers: hv };
                let resolved = null;
                try {
                    resolved = await resolveStream(attemptStream);
                } catch (e) {
                    resolved = null;
                }
                if (!resolved || !resolved.url) continue;

                const resolvedOrigin = getOrigin(resolved.url);
                const resolvedHeaderVariants = [
                    playbackHeadersFor(resolved.url, sourceUrl, { ...(resolved.headers || {}), ...hv }),
                    playbackHeadersFor(resolved.url, `${resolvedOrigin}/`, { ...(resolved.headers || {}), ...hv }),
                    { ...(resolved.headers || {}), ...hv, 'User-Agent': 'Mozilla/5.0', Referer: `${resolvedOrigin}/`, Origin: resolvedOrigin, Accept: '*/*' },
                ];

                for (const headersToUse of resolvedHeaderVariants) {
                    if (await validatePlaybackUrl(resolved.url, headersToUse)) {
                        return {
                            ...resolved,
                            headers: headersToUse
                        };
                    }
                }
            } catch (e) {
                continue;
            }
        }

        return null;
    }

    // Resolve in small parallel batches: much faster on TV while staying network-safe.
    const sorted = [...(candidates || [])].sort((a, b) => (b._priority || 0) - (a._priority || 0));
    const queue = sorted.slice(0, maxCandidatesToResolve);
    const workerCount = Math.min(workerLimit, queue.length);
    let cursor = 0;

    async function worker() {
        while (cursor < queue.length) {
            const index = cursor++;
            const candidate = queue[index];
            if (!candidate) continue;

            const settled = await Promise.race([
                tryResolveWithVariants(candidate),
                new Promise((resolve) => setTimeout(() => resolve(null), resolveAttemptTimeoutMs))
            ]);

            if (settled && settled.url) {
                direct.push(settled);
            }
        }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return dedupeByUrl(direct);
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const profile = getRuntimeProfile(options);
    const network = getNetworkConfig(profile);
    const requestId = createRequestId(tmdbId, mediaType);
    const ctx = { profile, network, requestId };
    console.log(`[Frenchstream][${requestId}] profile=${profile.label} mediaType=${mediaType} tmdb=${tmdbId}`);

    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];

    const searchTitles = buildTitleQueries(titles);
    const fallbackPromise = fetchFstreamApiFallback(tmdbId, mediaType, season, episode, ctx);

    // Movie path: prioritize API fallback first to avoid slow web search fanout.
    if (mediaType === 'movie') {
        const fallbackCandidates = await withTimeout(fallbackPromise, network.fallbackWaitMs);
        if (Array.isArray(fallbackCandidates) && fallbackCandidates.length > 0) {
            const fallbackStreams = await resolveCandidates(fallbackCandidates, ctx);
            if (fallbackStreams.length > 0) {
                console.log(`[Frenchstream][${requestId}] API-first movie path returned ${fallbackStreams.length}`);
                return fallbackStreams;
            }
        }
    }

    let match = null;
    let bestScore = -Infinity;
    for (const title of searchTitles) {
        try {
            const ranked = await searchByTitle(title, mediaType, season);
            if (ranked.length > 0 && ranked[0]._score > bestScore) {
                bestScore = ranked[0]._score;
                match = ranked[0];
                if (bestScore >= STRONG_MATCH_SCORE) break;
            }
        } catch (e) {
            console.warn(`[Frenchstream] Search failed for "${title}": ${e.message}`);
        }
    }

    if (!match || bestScore < MIN_MATCH_SCORE) {
        console.warn(`[Frenchstream][${requestId}] No confident web match for tmdb=${tmdbId} (bestScore=${bestScore}), trying API fallback`);
        const fallbackCandidates = await withTimeout(fallbackPromise, network.fallbackWaitMs);
        if (!Array.isArray(fallbackCandidates)) return [];
        if (fallbackCandidates.length === 0) return [];

        const fallbackStreams = await resolveCandidates(fallbackCandidates, ctx);
        console.log(`[Frenchstream][${requestId}] API fallback candidates: ${fallbackCandidates.length}, returned: ${fallbackStreams.length}`);
        return fallbackStreams;
    }
    console.log(`[Frenchstream][${requestId}] Match: ${match.title} (${match.newsId}) score=${bestScore} via="${match._matchedTitle}"`);

    const sourceBase = match.baseUrl || BASE_URL;
    const apiCandidates = mediaType === 'movie'
        ? collectMovieCandidates(await fetchJson(`${sourceBase}/engine/ajax/film_api.php?id=${match.newsId}`, { baseUrl: sourceBase }), sourceBase)
        : collectEpisodeCandidates(await fetchJson(`${sourceBase}/ep-data.php?id=${match.newsId}`, { baseUrl: sourceBase }), episode, sourceBase);

    // Complement with page scraping for more sources
    const scrapedCandidates = await scrapePageIframes(match.href, 'vf', ctx);
    const candidates = dedupeByUrl([...apiCandidates, ...scrapedCandidates]);
    console.log(`[Frenchstream][${requestId}] candidates api=${apiCandidates.length} scraped=${scrapedCandidates.length} unique=${candidates.length}`);

    if (candidates.length === 0) {
        const fallbackCandidates = await withTimeout(fallbackPromise, network.fallbackWaitMs);
        if (!Array.isArray(fallbackCandidates)) return [];
        if (fallbackCandidates.length === 0) return [];
        const fallbackStreams = await resolveCandidates(fallbackCandidates, ctx);
        return fallbackStreams;
    }

    const streams = await resolveCandidates(candidates, ctx);
    if (streams.length === 0) {
        const fallbackCandidates = await withTimeout(fallbackPromise, network.fallbackWaitMs);
        if (Array.isArray(fallbackCandidates) && fallbackCandidates.length > 0) {
            const fallbackStreams = await resolveCandidates(fallbackCandidates, ctx);
            if (fallbackStreams.length > 0) {
                console.log(`[Frenchstream][${requestId}] Web match empty, API fallback returned ${fallbackStreams.length}`);
                return fallbackStreams;
            }
        }
    }

    console.log(`[Frenchstream][${requestId}] Candidates: ${candidates.length}, Returned: ${streams.length}`);
    return streams;
}