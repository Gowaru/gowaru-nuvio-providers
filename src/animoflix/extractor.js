import { fetchText, fetchJson } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, sortStreamsByLanguage, sleep, fetchWithRetry } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://animoflix.to";
const SEARCH_URL = `${BASE_URL}/search-autocomplete.php`;
const TIMEOUT = 25000;

const SPECIAL_SLUG_RE = /(?:ona|oav|film|movie|special|scan|chapitre|volume|dub|uncut)(?:-|$)/i;
const MAX_TITLE_SEARCHES = 10;

async function searchAnime(title) {
    try {
        const results = await fetchJson(`${SEARCH_URL}?q=${encodeURIComponent(title)}`, { timeout: TIMEOUT });
        if (Array.isArray(results) && results.length > 0) return results;
    } catch (e) {
        console.warn(`[AnimoFlix] Search API failed for "${title}": ${e.message}`);
    }
    // Fallback: scrape HTML search page
    try {
        const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`, { timeout: TIMEOUT });
        const $ = cheerio.load(html);
        const results = [];
        $('.post-title a, .TPost a[href*="/anime/"], a[href*="/anime/"]').each((i, el) => {
            const href = $(el).attr('href');
            const rawText = $(el).text().trim();
            const text = rawText.replace(/\s+/g, ' ').trim();
            if (href && href.includes('/anime/') && text.length > 2) {
                const slugRaw = href.replace(/.*\/anime\//, '').replace(/\/$/, '');
                if (slugRaw.includes('/')) return;
                const imgAlt = $(el).closest('.TPost, .TPostMv, article, li').find('img').first().attr('alt');
                const cleanTitle = (imgAlt || text).replace(/\s+/g, ' ').trim();
                results.push({
                    title: cleanTitle,
                    title2: cleanTitle,
                    slug: slugRaw,
                    url: href
                });
            }
        });
        if (results.length > 0) return results;
    } catch (e) {
        console.warn(`[AnimoFlix] Search HTML fallback also failed: ${e.message}`);
    }
    return [];
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

    // Penalize score from slug-only match if slug is much shorter than search title (franchise page)
    const slugWords = nSlug.split(/\s+/).filter(Boolean);
    const titleWords = nt.split(/\s+/).filter(Boolean);
    if (fieldScore <= 60 && slugWords.length > 0 && titleWords.length > slugWords.length + 1) {
        const missing = titleWords.filter(w => !nSlug.includes(w)).length;
        if (missing > titleWords.length / 2) {
            fieldScore = Math.max(fieldScore - 40, 0);
        }
    }

    // Also penalize if result title is shorter than search title (franchise catch-all page)
    if (fieldScore > 0 && titleWords.length > 3 && nTitle.split(/\s+/).filter(Boolean).length < titleWords.length - 1) {
        fieldScore = Math.max(fieldScore - 30, 10);
    }

    score += fieldScore;

    const matchWords = new Set([...nTitle.split(/\s+/), ...nTitle2.split(/\s+/), ...nSlug.split(/\s+/)]);
    const matched = titleWords.filter(w => matchWords.has(w)).length;
    if (titleWords.length > 0) score += (matched / titleWords.length) * 50;

    const nTitleWords = nTitle.split(/\s+/).filter(Boolean);
    const extraWords = nTitleWords.length - titleWords.length;
    if (extraWords > 0) {
        score -= Math.min(extraWords * 40, 80);
    }

    // Penalize if search title has many more words than result title (generic franchise match)
    if (titleWords.length > nTitleWords.length + 2) {
        score -= Math.min((titleWords.length - nTitleWords.length) * 40, 80);
    }

    return score;
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
    return _extractStreams(tmdbId, mediaType, season, episode);
}

async function _extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

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
    const badSlugs = new Set();

    // Search all titles in parallel (up to MAX_TITLE_SEARCHES)
    const searchPromises = titles.slice(0, MAX_TITLE_SEARCHES).map(searchTitle =>
        searchAnime(searchTitle).then(results => {
            const nt = normalize(searchTitle);
            if (nt.length < 4) return [];
            return results.filter(r => !SPECIAL_SLUG_RE.test(r.slug) && !badSlugs.has(r.slug))
                .map(r => ({ ...r, _queryTitle: searchTitle }));
        }).catch(() => [])
    );

    const allResults = (await Promise.allSettled(searchPromises))
        .flatMap(r => r.status === 'fulfilled' ? r.value : []);

    // Score and deduplicate by slug
    const scored = new Map();
    for (const r of allResults) {
        if (badSlugs.has(r.slug)) continue;
        const score = scoreSearchMatch(r, r._queryTitle);
        const existing = scored.get(r.slug);
        if (!existing || score > existing.score) {
            scored.set(r.slug, { ...r, score });
        }
    }

    const ranked = [...scored.values()].sort((a, b) => b.score - a.score);

    // Verify candidates in order (best score first)
    for (const candidate of ranked) {
        const verifyHtml = await fetchWithRetry(() => fetchText(`${BASE_URL}/anime/${candidate.slug}/`, { timeout: TIMEOUT }));
        const $v = cheerio.load(verifyHtml);
        const pageTitle = $v('h1.hero-title').first().text().trim();
        let matchOk = true;
        if (!pageTitle) {
            console.warn(`[AnimoFlix] No page title found for slug ${candidate.slug} — rejecting`);
            badSlugs.add(candidate.slug);
            matchOk = false;
        } else {
            const nPage = normalize(pageTitle);
            const nTmdbTitles = titles.slice(0, 5).map(t => normalize(t));
            const matchesTmdb = nTmdbTitles.some(nt => nPage.includes(nt) || nt.includes(nPage));
            if (!matchesTmdb) {
                console.warn(`[AnimoFlix] Page title mismatch: "${pageTitle}" doesn't match any TMDB title — rejecting slug ${candidate.slug}`);
                badSlugs.add(candidate.slug);
                matchOk = false;
            }
        }
        if (matchOk) {
            bestMatch = candidate;
            break;
        }
    }

    if (!bestMatch) {
        console.warn(`[AnimoFlix] No match found for "${titles[0]}"`);
        return [];
    }

    const slug = bestMatch.slug;
    console.log(`[AnimoFlix] Matched: "${bestMatch.title}" (slug: ${slug})`);

    const animeDetailHtml = await fetchWithRetry(() => fetchText(`${BASE_URL}/anime/${slug}/`, { timeout: TIMEOUT }));
    const $ = cheerio.load(animeDetailHtml);

    const pageTitle = $('h1.hero-title').first().text().trim();
    if (pageTitle) {
        const nPage = normalize(pageTitle);
        const nSearch = normalize(bestMatch.title);
        if (!nPage.includes(nSearch) && !nSearch.includes(nPage)) {
            console.warn(`[AnimoFlix] Page title mismatch post-verify: "${pageTitle}" vs "${bestMatch.title}"`);
        }
    }

    const seasons = [];
    let filmSeasonHref = null;
    $('.season-card').each((i, el) => {
        const href = $(el).attr('href');
        const title = $(el).find('.season-card-title').text().trim();
        if (href && title) {
            if (/film|movie/i.test(title)) {
                filmSeasonHref = href;
                return;
            }
            if (/oav|ona/i.test(title)) return;
            const seasonNum = parseSeasonNumber(href);
            seasons.push({ href, title, seasonNum });
        }
    });

    if (isMovie) {
        // Try season-based URL first (movies listed under Saison 1), then fall back to film URL
        const movieSeasonHref = filmSeasonHref || seasons.find(s => s.seasonNum === 1)?.href;
        if (movieSeasonHref) {
            return extractMovieStreams(slug, movieSeasonHref);
        }
        return extractMovieStreams(slug, null);
    }

    if (seasons.length === 0) {
        if (filmSeasonHref) return extractMovieStreams(slug, filmSeasonHref);
        return [];
    }

    const streams = [];

    // Collect ALL season parts matching the target season number (e.g. saison-4-partie-1,2,3,4)
    const targetSeasons = seasons.filter(s => s.seasonNum === effectiveSeason);
    const fallbackSeasons = targetSeasons.length === 0
        ? seasons.sort((a, b) => {
            const diffA = a.seasonNum ? Math.abs(a.seasonNum - effectiveSeason) : Infinity;
            const diffB = b.seasonNum ? Math.abs(b.seasonNum - effectiveSeason) : Infinity;
            return diffA - diffB;
        }).slice(0, 1)
        : targetSeasons;

    const langs = ['vostfr', 'vf'];
    const checkedEpisodeUrls = new Set();
    let cumulOffset = 0;

    for (const targetSeason of fallbackSeasons) {
        const seasonPageUrl = targetSeason.href.startsWith('http')
            ? targetSeason.href
            : `${BASE_URL}${targetSeason.href.startsWith('/') ? '' : '/'}${targetSeason.href}`;

        const seasonHtml = await fetchWithRetry(() => fetchText(seasonPageUrl, { timeout: TIMEOUT }));
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
                        cumulative: parseInt(epMatch[1]) + cumulOffset,
                        href: href.startsWith('http') ? href : `${BASE_URL}${href}`
                    });
                }
            });
        }

        const epTasks = [];
        for (const lang of langs) {
            const episodes = episodeLinks[lang] || [];
            if (episodes.length === 0) continue;

            for (const targetEp of targetEpisodes) {
                const episode = episodes.find(e => e.num === targetEp || e.cumulative === targetEp);
                if (!episode) continue;
                if (checkedEpisodeUrls.has(episode.href)) continue;
                checkedEpisodeUrls.add(episode.href);

                const langLabel = lang === 'vf' ? 'VF' : 'VOSTFR';
                epTasks.push(
                    extractEpisodeStreams(episode.href, langLabel, slug)
                        .then(epStreams => streams.push(...epStreams))
                        .catch(e => console.warn(`[AnimoFlix] Failed to extract ${lang} ep ${targetEp}: ${e.message}`))
                );
            }
        }
        await Promise.allSettled(epTasks);

        // Update cumulative offset for next part
        const maxRelEp = Math.max(
            ...langs.flatMap(l => (episodeLinks[l] || []).map(e => e.num)),
            0
        );
        cumulOffset += maxRelEp;

        // If we found streams, stop searching more parts
        if (streams.filter(s => s && s.isDirect).length > 0) break;
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[AnimoFlix] Total streams found: ${validStreams.length}`);

    return sortStreamsByLanguage(validStreams);
}

async function extractMovieStreams(slug, seasonHref) {
    const streams = [];
    const langs = ['vf', 'vostfr'];

    // Build URL patterns: use season href if available, else fallback patterns
    const tryUrlBuilders = [];
    if (seasonHref) {
        for (const lang of langs) {
            const base = seasonHref.startsWith('http') ? seasonHref : `${BASE_URL}${seasonHref.startsWith('/') ? '' : '/'}${seasonHref}`;
            tryUrlBuilders.push((l) => `${base.replace(/\/+$/, '')}/${l}/episode-1/`);
            tryUrlBuilders.push((l) => `${base.replace(/\/+$/, '')}/${l}/`);
        }
    }
    tryUrlBuilders.push(
        (lang) => `${BASE_URL}/anime/${slug}/film/${lang}/episode-1/`,
        (lang) => `${BASE_URL}/anime/${slug}/film/${lang}/`,
        (lang) => `${BASE_URL}/anime/${slug}/movie/${lang}/episode-1/`,
    );

    for (const lang of langs) {
        const langResults = await Promise.allSettled(
            tryUrlBuilders.map(buildUrl => {
                const url = buildUrl(lang);
                return fetchWithRetry(() => fetchText(url, { timeout: TIMEOUT })).then(html => {
                    if (html.includes('lecteurSelect')) {
                        return extractEpisodeStreams(url, lang === 'vf' ? 'VF' : 'VOSTFR', slug);
                    }
                    throw new Error('No player');
                });
            })
        );
        for (const r of langResults) {
            if (r.status === 'fulfilled' && r.value) {
                streams.push(...r.value);
                break;
            }
        }
    }

    return streams;
}

async function extractEpisodeStreams(episodeUrl, langLabel, slug) {
    const html = await fetchWithRetry(() => fetchText(episodeUrl, { timeout: TIMEOUT }));
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

    const results = await Promise.allSettled(
        embedUrls.map(url =>
            resolveStream({
                name: `AnimoFlix (${langLabel})`,
                title: `${langLabel}`,
                url: url,
                quality: 'HD',
                headers: { Referer: `${BASE_URL}/anime/${slug}/` }
            }).then(stream => stream || null)
        )
    );

    return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
}
