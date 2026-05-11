import { fetchText, BASE_URL, TIMEOUT, GLOBAL_TIMEOUT } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';

const tmdbTitleCache = new Map();

const MAX_TITLE_SEARCHES = 5;
const SEARCH_SCORE_THRESHOLD = 40;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function withGlobalTimeout(promise, ms) {
    try {
        return await Promise.race([
            promise,
            sleep(ms).then(() => { throw new Error('Page timeout'); })
        ]);
    } catch (e) {
        if (e.message === 'Page timeout') throw e;
        throw e;
    }
}

function slugifyTitle(title) {
    return title.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?()[\]]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function normalize(s) {
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?()[\]]/g, '').replace(/\b(the|vostfr|vost|vf|french|streaming|anime)\s+/g, '')
        .replace(/\s+/g, ' ').trim();
}

function scoreSearchMatch(resultTitle, searchTitle) {
    const nt = normalize(searchTitle);
    const nResult = normalize(resultTitle);

    let score = 0;
    if (nResult === nt) score += 150;
    else if (nResult.includes(nt) || nt.includes(nResult)) score += 100;

    const titleWords = nt.split(/\s+/).filter(Boolean);
    const resultWords = new Set(nResult.split(/\s+/));
    const matched = titleWords.filter(w => resultWords.has(w)).length;
    if (titleWords.length > 0) score += (matched / titleWords.length) * 50;

    const extraWords = resultWords.size - titleWords.length;
    if (extraWords > 0) score -= Math.min(extraWords * 40, 80);

    return score;
}

async function fetchWithRetry(url, options = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fetchText(url, { ...options, timeout: TIMEOUT });
        } catch (err) {
            if (err.message && /HTTP error 4(?:0[0-9]|1[0-79]|29)/.test(err.message)) throw err;
            if (i === retries) throw err;
            const jitter = Math.round(Math.random() * 500);
            await sleep(1000 * (i + 1) + jitter);
        }
    }
}

function isValidStreamUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return !url.includes('animesite.fr') && !url.includes('image.') && !url.includes('google') &&
        !url.includes('twitter') && !url.includes('trustpilot') && !url.includes('a-ads') &&
        !url.includes('cloudflare') && !url.includes('w3.org') && !url.includes('kitsu') &&
        !url.includes('media.') && !url.includes('nautiljon') && !url.includes('artworks') &&
        !url.includes('addtoany') && !url.includes('facebook') && !url.startsWith('data:');
}

function extractEmbedUrls(html) {
    const urls = [];

    const re1 = /\\"src\\":\\"((?:[^\\"]|\\.)+?)\\"/g;
    let m;
    while ((m = re1.exec(html)) !== null) {
        let raw = m[1];
        let url = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        url = url.replace(/\\(.)/g, (_, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c);
        if (isValidStreamUrl(url)) urls.push(url);
    }

    const re2 = /"src"\s*:\s*"((?:[^"\\]|\\.)*?)"/g;
    while ((m = re2.exec(html)) !== null) {
        let url = m[1].replace(/\\(.)/g, (_, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c);
        if (isValidStreamUrl(url)) urls.push(url);
    }

    const re3 = /<iframe\s+[^>]*src=["']([^"']+)["']/gi;
    while ((m = re3.exec(html)) !== null) {
        let url = m[1];
        if (url.startsWith('//')) url = 'https:' + url;
        if (isValidStreamUrl(url)) urls.push(url);
    }

    const re4 = /<video[^>]*src=["']([^"']+)["']/gi;
    while ((m = re4.exec(html)) !== null) {
        let url = m[1];
        if (url.startsWith('//')) url = 'https:' + url;
        if (isValidStreamUrl(url)) urls.push(url);
    }

    const re5 = /https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)(?:\?[^"'\s<>]*)?/gi;
    while ((m = re5.exec(html)) !== null) {
        const url = m[0];
        if (isValidStreamUrl(url)) urls.push(url);
    }

    return [...new Set(urls)];
}

function extractSlugFromPage($) {
    const jsonLdScript = $('script[type="application/ld+json"]').filter((i, el) => {
        const text = $(el).html() || '';
        return text.includes('TVSeries') || text.includes('Movie');
    }).first().html();
    if (!jsonLdScript) return null;

    try {
        const jsonLd = JSON.parse(jsonLdScript);
        const pageUrl = jsonLd.url || '';
        const match = pageUrl.match(/(\d+-[a-z0-9-]+)\/?$/);
        if (match) return { slug: match[1], title: jsonLd.name || '' };
    } catch (e) {}

    return null;
}

async function trySearchUrl(url, title) {
    try {
        const html = await fetchWithRetry(url);
        const $ = cheerio.load(html);

        const pageMatch = extractSlugFromPage($);
        if (pageMatch) {
            const score = scoreSearchMatch(pageMatch.title, title);
            if (score >= SEARCH_SCORE_THRESHOLD) {
                console.log(`[AnimeSite] Page self-match via ${url}: "${pageMatch.title}" (${pageMatch.slug})`);
                return pageMatch;
            }
        }

        let bestMatch = null;
        let bestScore = 0;

        $(`a[href^="/"]`).each((i, el) => {
            const href = $(el).attr('href');
            const linkText = $(el).attr('title') || $(el).text().trim();
            const match = href && (
                href.match(/^\/(\d+-[a-z0-9-]+)\/?$/) ||
                href.match(/^\/anime\/(\d+-[a-z0-9-]+)\/?$/)
            );
            if (match && linkText) {
                const score = scoreSearchMatch(linkText, title);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { slug: match[1], title: linkText };
                }
            }
        });

        if (bestMatch && bestScore >= SEARCH_SCORE_THRESHOLD) {
            console.log(`[AnimeSite] Matched via ${url}: "${bestMatch.title}" (${bestMatch.slug})`);
            return bestMatch;
        }
    } catch (e) {
        if (!e.message || !e.message.includes('HTTP error 404')) {
            console.warn(`[AnimeSite] ${url} not available: ${e.message}`);
        }
    }

    return null;
}

async function searchAnime(title, isMovie, doDeepSearch) {
    const slug = slugifyTitle(title);
    if (!slug) return null;

    const parallelHits = await Promise.allSettled([
        trySearchUrl(`${BASE_URL}/anime/${slug}/`, title),
        trySearchUrl(`${BASE_URL}/${slug}/`, title),
        trySearchUrl(`${BASE_URL}/?s=${encodeURIComponent(title)}`, title),
    ]);
    for (const h of parallelHits) {
        if (h.status === 'fulfilled' && h.value) return h.value;
    }

    if (!isMovie && doDeepSearch) {
        for (let s = 1; s <= 3; s++) {
            const deepHits = await Promise.allSettled([
                trySearchUrl(`${BASE_URL}/anime/${slug}-saison-${s}/`, title),
                trySearchUrl(`${BASE_URL}/anime/${slug}-s${s}/`, title),
                trySearchUrl(`${BASE_URL}/anime/${slug}-${s}/`, title),
            ]);
            for (const h of deepHits) {
                if (h.status === 'fulfilled' && h.value) return h.value;
            }
        }
    }

    return null;
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    return withGlobalTimeout(_extractStreams(tmdbId, mediaType, season, episode), GLOBAL_TIMEOUT);
}

async function getTitlesCached(tmdbId, mediaType) {
    const key = `${tmdbId}_${mediaType}`;
    if (tmdbTitleCache.has(key)) return tmdbTitleCache.get(key);

    const titles = await getTmdbTitles(tmdbId, mediaType);

    const filtered = titles.filter(t => {
        if (!t) return false;
        return /^[\x00-\x7F\u00C0-\u024F\s\-',:!.\?&()]+$/.test(t);
    });
    tmdbTitleCache.set(key, filtered);
    return filtered;
}

async function _extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTitlesCached(tmdbId, mediaType);
    if (titles.length === 0) return [];

    const isMovie = mediaType === 'movie';
    let bestMatch = null;

    for (let i = 0; i < Math.min(titles.length, MAX_TITLE_SEARCHES); i++) {
        const match = await searchAnime(titles[i], isMovie, i === 0);
        if (match) {
            bestMatch = match;
            break;
        }
    }

    if (!bestMatch) {
        console.warn(`[AnimeSite] No match found for "${titles[0]}"`);
        return [];
    }

    const slug = bestMatch.slug;
    console.log(`[AnimeSite] Matched: "${bestMatch.title}" (slug: ${slug})`);

    const animeHtml = await fetchWithRetry(`${BASE_URL}/${slug}/`);
    const $ = cheerio.load(animeHtml);

    const jsonLdScript = $('script[type="application/ld+json"]').filter((i, el) => {
        const text = $(el).html() || '';
        return text.includes('TVSeries') || text.includes('Movie');
    }).first().html();

    if (!jsonLdScript) {
        console.warn(`[AnimeSite] No JSON-LD found for ${slug}`);
        return [];
    }

    let jsonLd;
    try {
        jsonLd = JSON.parse(jsonLdScript);
    } catch (e) {
        console.warn(`[AnimeSite] Failed to parse JSON-LD: ${e.message}`);
        return [];
    }

    const streams = [];
    const languages = isMovie ? ['VF', 'VOSTFR'] : ['VOSTFR', 'VF'];

    if (isMovie) {
        for (const lang of languages) {
            const epStreams = await extractEpisodeStreams(slug, 1, 1, lang);
            streams.push(...epStreams);
        }
        const validStreams = streams.filter(s => s && s.url);
        console.log(`[AnimeSite] Total streams found: ${validStreams.length}`);
        return validStreams;
    }

    const seasons = jsonLd.containsSeason || [];
    let targetSeason = null;
    for (const s of seasons) {
        if (String(s.seasonNumber) === String(season)) {
            targetSeason = s;
            break;
        }
    }

    if (!targetSeason && seasons.length > 0) {
        const sorted = [...seasons].sort((a, b) =>
            Math.abs(parseInt(a.seasonNumber) - season) - Math.abs(parseInt(b.seasonNumber) - season)
        );
        targetSeason = sorted[0];
    }

    if (!targetSeason) {
        console.warn(`[AnimeSite] Season ${season} not found`);
        return [];
    }

    const totalEpisodes = parseInt(targetSeason.numberOfEpisodes) || 0;
    const targetEpisodes = [episode || 1];

    const imdbId = await getImdbId(tmdbId, mediaType);
    if (imdbId) {
        const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
        if (absoluteEpisode && !targetEpisodes.includes(absoluteEpisode)) {
            targetEpisodes.push(absoluteEpisode);
        }
    }

    const episodeCount = totalEpisodes > 0 ? totalEpisodes : 12;

    for (const ep of targetEpisodes) {
        if (ep > episodeCount && episodeCount > 0) continue;

        for (const lang of languages) {
            const langStreams = await extractEpisodeStreams(slug, season, ep, lang);
            streams.push(...langStreams);
        }
    }

    const validStreams = streams.filter(s => s && s.url);
    console.log(`[AnimeSite] Total streams found: ${validStreams.length}`);

    return validStreams;
}

async function extractEpisodeStreams(slug, season, episode, lang) {
    const streams = [];
    const lecteursToTry = lang === 'VF' ? [5] : [1, 2, 3, 4];
    const CONCURRENCY = 2;

    for (let i = 0; i < lecteursToTry.length; i += CONCURRENCY) {
        const batch = lecteursToTry.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(async (lecteurNum) => {
            try {
                const playUrl = `${BASE_URL}/play/${slug}/${season}/${episode}/${lecteurNum}`;
                const html = await fetchWithRetry(playUrl, { timeout: TIMEOUT * 2 });

                const embedUrls = extractEmbedUrls(html);
                if (embedUrls.length === 0) return [];

                const resultStreams = [];
                for (const url of embedUrls) {
                    try {
                        const name = `AnimeSite (${lang}) Lecteur ${lecteurNum}`;
                        let stream;

                        if (url.includes('.mp4') || url.includes('.m3u8')) {
                            stream = {
                                name,
                                title: `${lang} - Lecteur ${lecteurNum}`,
                                url: url,
                                quality: 'HD',
                                isDirect: true,
                                headers: { Referer: `${BASE_URL}/` }
                            };
                        } else {
                            stream = await resolveStream({
                                name,
                                title: `${lang} - Lecteur ${lecteurNum}`,
                                url: url,
                                quality: 'HD',
                                headers: { Referer: `${BASE_URL}/` }
                            });
                        }

                        if (stream) resultStreams.push(stream);
                    } catch (e) {
                        console.warn(`[AnimeSite] resolveStream failed for lecteur ${lecteurNum}: ${e.message}`);
                    }
                }
                return resultStreams;
            } catch (e) {
                if (!e.message || !e.message.includes('HTTP error 404')) {
                    console.warn(`[AnimeSite] Lecteur ${lecteurNum} failed: ${e.message}`);
                }
                return [];
            }
        }));

        for (const result of results) {
            streams.push(...result);
        }
    }

    return streams;
}
