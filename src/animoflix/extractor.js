import { fetchText, fetchJson } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://animoflix.to";
const SEARCH_URL = `${BASE_URL}/search-autocomplete.php`;
const TIMEOUT = 25000;
const GLOBAL_TIMEOUT = 90000;

const SPECIAL_SLUG_RE = /(?:ona|oav|film|movie|special|scan|chapitre|volume|dub|uncut)(?:-|$)/i;
const MAX_TITLE_SEARCHES = 10;

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

async function searchAnime(title) {
    const results = await fetchJson(`${SEARCH_URL}?q=${encodeURIComponent(title)}`, { timeout: TIMEOUT });
    return Array.isArray(results) ? results : [];
}

function normalize(s) {
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?()[\]]/g, '').replace(/\b(the|vostfr|vost|vf|french|streaming|anime)\s+/g, '')
        .replace(/\s+/g, ' ').trim();
}

function scoreSearchMatch(result, searchTitle) {
    const nt = normalize(searchTitle);
    const nTitle = normalize(result.title);
    const nTitle2 = normalize(result.title2 || "");
    const nSlug = normalize(result.slug.replace(/-/g, " "));

    let score = 0;
    let fieldScore = 0;
    if (nTitle.includes(nt) || nt.includes(nTitle)) fieldScore = Math.max(fieldScore, 100);
    if (nTitle2.includes(nt) || nt.includes(nTitle2)) fieldScore = Math.max(fieldScore, 80);
    if (nSlug.includes(nt) || nt.includes(nSlug)) fieldScore = Math.max(fieldScore, 60);
    score += fieldScore;

    const titleWords = nt.split(/\s+/).filter(Boolean);
    const matchWords = new Set([...nTitle.split(/\s+/), ...nTitle2.split(/\s+/), ...nSlug.split(/\s+/)]);
    const matched = titleWords.filter(w => matchWords.has(w)).length;
    if (titleWords.length > 0) score += (matched / titleWords.length) * 50;

    const nTitleWords = nTitle.split(/\s+/).filter(Boolean);
    const extraWords = nTitleWords.length - titleWords.length;
    if (extraWords > 0) {
        score -= Math.min(extraWords * 40, 80);
    }

    return score;
}

async function fetchWithRetry(url, options = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fetchText(url, options);
        } catch (err) {
            if (err.message && /HTTP error 4(?:0[0-9]|1[0-79]|29)/.test(err.message)) throw err;
            if (i === retries) throw err;
            const jitter = Math.round(Math.random() * 500);
            await sleep(1000 * (i + 1) + jitter);
        }
    }
}

function parseSeasonNumber(seasonSlug) {
    const m = seasonSlug.match(/saison[-\s]*(\d+)/i);
    if (m) return parseInt(m[1]);
    if (/the-final-season|final-season/i.test(seasonSlug)) return 4;
    if (/partie-\d+/i.test(seasonSlug)) {
        const pm = seasonSlug.match(/partie-(\d+)/i);
        if (pm) return parseInt(pm[1]);
    }
    return null;
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    return withGlobalTimeout(_extractStreams(tmdbId, mediaType, season, episode), GLOBAL_TIMEOUT);
}

async function _extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];

    const isMovie = mediaType === 'movie';
    let targetEpisodes = isMovie ? [1] : [episode || 1];
    if (!isMovie) {
        try {
            const imdbId = await getImdbId(tmdbId, mediaType);
            if (imdbId) {
                const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
                if (absoluteEpisode && absoluteEpisode !== episode) {
                    targetEpisodes.push(absoluteEpisode);
                }
            }
        } catch (e) {
            console.warn(`[AnimoFlix] ArmSync failed: ${e.message}`);
        }
    }

    let bestMatch = null;
    let bestScore = 0;
    let searches = 0;

    for (const title of titles) {
        if (searches >= MAX_TITLE_SEARCHES) break;
        searches++;

        const results = await searchAnime(title);
        if (results.length === 0) continue;

        for (const r of results) {
            if (SPECIAL_SLUG_RE.test(r.slug)) continue;
            const score = scoreSearchMatch(r, title);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = r;
            } else if (score === bestScore && score > 0) {
                const rLen = normalize(r.title).length;
                const bLen = normalize(bestMatch.title).length;
                if (rLen < bLen) {
                    bestScore = score;
                    bestMatch = r;
                }
            }
        }

        if (bestMatch && bestScore >= 60) break;
    }

    if (!bestMatch) {
        console.warn(`[AnimoFlix] No match found for "${titles[0]}"`);
        return [];
    }

    const slug = bestMatch.slug;
    console.log(`[AnimoFlix] Matched: "${bestMatch.title}" (slug: ${slug})`);

    const animeDetailHtml = await fetchWithRetry(`${BASE_URL}/anime/${slug}/`, { timeout: TIMEOUT });
    const $ = cheerio.load(animeDetailHtml);

    const pageTitle = $('h1.anime-title-pro').first().text().trim();
    if (pageTitle) {
        const nPage = normalize(pageTitle);
        const nSearch = normalize(bestMatch.title);
        if (!nPage.includes(nSearch) && !nSearch.includes(nPage)) {
            console.warn(`[AnimoFlix] Page title mismatch: "${pageTitle}" vs "${bestMatch.title}" — slug may be wrong`);
        }
    }

    const seasons = [];
    let hasFilmSeason = false;
    $('.season-card').each((i, el) => {
        const href = $(el).attr('href');
        const title = $(el).find('.season-title').text().trim();
        if (href && title) {
            if (/film|movie|oav|ona/i.test(title)) {
                if (/film|movie/i.test(title)) hasFilmSeason = true;
                return;
            }
            const seasonNum = parseSeasonNumber(href);
            seasons.push({ href, title, seasonNum });
        }
    });

    if ((!isMovie && seasons.length === 0 && !hasFilmSeason) || (!isMovie && seasons.length === 0)) {
        if (hasFilmSeason) {
            return extractMovieStreams(slug);
        }
        return [];
    }

    const streams = [];

    if (isMovie) {
        return extractMovieStreams(slug);
    }

    let targetSeason = null;
    for (const s of seasons) {
        if (s.seasonNum === season) {
            targetSeason = s;
            break;
        }
    }

    if (!targetSeason && seasons.length > 0) {
        const bestMatchSeason = seasons.reduce((best, s) => {
            const diff = s.seasonNum ? Math.abs(s.seasonNum - season) : Infinity;
            return diff < (best.diff || Infinity) ? { ...s, diff } : best;
        }, { diff: Infinity });
        if (bestMatchSeason.href && bestMatchSeason.diff !== Infinity) {
            targetSeason = bestMatchSeason;
        }
    }

    if (!targetSeason) return [];

    const seasonPageUrl = targetSeason.href.startsWith('http')
        ? targetSeason.href
        : `${BASE_URL}${targetSeason.href.startsWith('/') ? '' : '/'}${targetSeason.href}`;

    const seasonHtml = await fetchWithRetry(seasonPageUrl, { timeout: TIMEOUT });

    const langs = ['vostfr', 'vf'];
    const $s = cheerio.load(seasonHtml);
    const episodeLinks = {};

    for (const lang of langs) {
        episodeLinks[lang] = [];
        $s(`a.episode-card[href*="/${lang}/episode-"]`).each((i, el) => {
            const href = $(el).attr('href');
            const epMatch = href.match(/episode-(\d+)\/?$/);
            if (href && epMatch) {
                episodeLinks[lang].push({
                    num: parseInt(epMatch[1]),
                    href: href.startsWith('http') ? href : `${BASE_URL}${href}`
                });
            }
        });
    }

    for (const lang of langs) {
        const episodes = episodeLinks[lang] || [];
        if (episodes.length === 0) continue;

        for (const targetEp of targetEpisodes) {
            const episode = episodes.find(e => e.num === targetEp);
            if (!episode) continue;

            const langLabel = lang === 'vf' ? 'VF' : 'VOSTFR';
            try {
                const epStreams = await extractEpisodeStreams(episode.href, langLabel, slug);
                streams.push(...epStreams);
            } catch (e) {
                console.warn(`[AnimoFlix] Failed to extract ${lang} ep ${targetEp}: ${e.message}`);
            }
        }
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[AnimoFlix] Total streams found: ${validStreams.length}`);

    validStreams.sort((a, b) => {
        const isVf = (str) => str && (str.toUpperCase().includes('VF') || str.toUpperCase().includes('FRENCH'));
        const aIsVf = isVf(a.name) || isVf(a.title);
        const bIsVf = isVf(b.name) || isVf(b.title);
        if (aIsVf && !bIsVf) return -1;
        if (!aIsVf && bIsVf) return 1;
        return 0;
    });

    return validStreams;
}

async function extractMovieStreams(slug) {
    const streams = [];
    const langs = ['vf', 'vostfr'];

    const tryUrls = [
        (lang) => `${BASE_URL}/anime/${slug}/film/${lang}/episode-1/`,
        (lang) => `${BASE_URL}/anime/${slug}/film/${lang}/`,
        (lang) => `${BASE_URL}/anime/${slug}/movie/${lang}/episode-1/`,
    ];

    for (const lang of langs) {
        for (const buildUrl of tryUrls) {
            const url = buildUrl(lang);
            try {
                const html = await fetchWithRetry(url, { timeout: TIMEOUT });
                const $ = cheerio.load(html);

                if ($('#lecteurSelect option').length > 0 || html.includes('lecteurSelect')) {
                    const epStreams = await extractEpisodeStreams(url, lang === 'vf' ? 'VF' : 'VOSTFR', slug);
                    streams.push(...epStreams);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
    }

    return streams;
}

async function extractEpisodeStreams(episodeUrl, langLabel, slug) {
    const html = await fetchWithRetry(episodeUrl, { timeout: TIMEOUT });
    const $ = cheerio.load(html);

    const embedUrls = [];
    $('#lecteurSelect option').each((i, el) => {
        const val = $(el).val();
        if (val && val.startsWith('http')) {
            embedUrls.push(val);
        }
    });

    if (embedUrls.length === 0) {
        const jsonLdEmbed = html.match(/"embedUrl"\s*:\s*"(https?:\/\/[^"]+)"/);
        if (jsonLdEmbed) {
            embedUrls.push(jsonLdEmbed[1]);
        }
    }

    const streams = [];
    for (const url of embedUrls) {
        try {
            const stream = await resolveStream({
                name: `AnimoFlix (${langLabel})`,
                title: `${langLabel}`,
                url: url,
                quality: 'HD',
                headers: { Referer: `${BASE_URL}/anime/${slug}/` }
            });
            if (stream) streams.push(stream);
        } catch (e) {
            console.warn(`[AnimoFlix] resolveStream failed for ${url}: ${e.message}`);
        }
    }

    return streams;
}
