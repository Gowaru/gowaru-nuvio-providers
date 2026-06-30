import { fetchText, fetchJson } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, sortStreamsByLanguage, sleep, fetchWithRetry } from '../utils/resolvers.js';
import { resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://animoflix.to";
const SEARCH_URL = `${BASE_URL}/search-autocomplete.php`;
const TIMEOUT = 25000;

const SPECIAL_SLUG_RE = /(?:ona|oav|film|movie|special|scan|chapitre|volume|dub|uncut)(?:-|$)/i;
const MAX_TITLE_SEARCHES = 10;

// Cache TTL pour AnimoFlix (5 minutes)
const ANF_CACHE_TTL = 5 * 60 * 1000;
const anfCache = new Map();

function anfCached(key, fn) {
  const now = Date.now();
  if (anfCache.has(key) && now - anfCache.get(key).ts < ANF_CACHE_TTL) return anfCache.get(key).data;
  return fn().then(data => { anfCache.set(key, { data, ts: now }); return data; });
}

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
        // Try multiple selectors to find search result links
        const selectors = [
            '.post-title a[href*="/anime/"]',
            '.TPost a[href*="/anime/"]',
            'a[href*="/anime/"]',
            '.result-item a',
            '.search-item a',
            '.card a[href*="/anime/"]',
            'article a[href*="/anime/"]',
        ];
        for (const sel of selectors) {
            $(sel).each((i, el) => {
                if (results.length >= 15) return false;
                const href = $(el).attr('href');
                const rawText = $(el).text().trim();
                const text = rawText.replace(/\s+/g, ' ').trim();
                if (href && href.includes('/anime/') && text.length > 2) {
                    const slugRaw = href.replace(/.*\/anime\//, '').replace(/\/$/, '');
                    if (slugRaw.includes('/') || results.some(r => r.slug === slugRaw)) return;
                    const imgAlt = $(el).closest('.TPost, .TPostMv, article, li, .card, .result-item, .search-item').find('img').first().attr('alt');
                    const cleanTitle = (imgAlt || text).replace(/\s+/g, ' ').trim();
                    results.push({
                        title: cleanTitle,
                        title2: cleanTitle,
                        slug: slugRaw,
                        url: href
                    });
                }
            });
            if (results.length > 0) break;
        }
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
    const sm = seasonSlug.match(/season[-\s]*(\d+)/i);
    if (sm) return parseInt(sm[1]);
    const cm = seasonSlug.match(/cour[-\s]*(\d+)/i);
    if (cm) return parseInt(cm[1]);
    if (/final-season|the-final-season/i.test(seasonSlug)) return 99;
    if (/partie-\d+/i.test(seasonSlug)) {
        const pm = seasonSlug.match(/partie-(\d+)/i);
        if (pm) return parseInt(pm[1]);
    }
    const ptm = seasonSlug.match(/part[-\s]*(\d+)/i);
    if (ptm) return parseInt(ptm[1]);
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
    const targetEpisodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode);

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

    // Verify candidates in parallel batches of 2 with 800ms gap between batches
    // (site is very aggressive with rate limiting — 429 on >3 rapid requests)
    const topCandidates = ranked.slice(0, 8);
    let foundMatch = false;
    
    for (let i = 0; i < topCandidates.length && !foundMatch; i += 2) {
      const batch = topCandidates.slice(i, i + 2);
      const batchResults = await Promise.allSettled(
        batch.map(async (candidate) => {
          try {
            const verifyHtml = await fetchWithRetry(() => fetchText(`${BASE_URL}/anime/${candidate.slug}/`, { timeout: 10000 }));
            const $v = cheerio.load(verifyHtml);
            const pageTitle = $v('h1.hero-title').first().text().trim();
            if (!pageTitle) {
              badSlugs.add(candidate.slug);
              return null;
            }
            const nPage = normalize(pageTitle);
            const nTmdbTitles = titles.slice(0, 5).map(t => normalize(t));
            const matchesTmdb = nTmdbTitles.some(nt => nPage.includes(nt) || nt.includes(nPage));
            if (!matchesTmdb) {
              badSlugs.add(candidate.slug);
              return null;
            }
            return candidate;
          } catch {
            badSlugs.add(candidate.slug);
            return null;
          }
        })
      );
      
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) {
          bestMatch = r.value;
          foundMatch = true;
          break;
        }
      }

      // Small delay between batches to respect rate limits
      if (!foundMatch && i + 2 < topCandidates.length) {
        await sleep(800);
      }
    }

    if (!bestMatch) {
        console.warn(`[AnimoFlix] No match found for "${titles[0]}"`);
        return [];
    }

    const slug = bestMatch.slug;
    console.log(`[AnimoFlix] Matched: "${bestMatch.title}" (slug: ${slug})`);

    const animeDetailHtml = await anfCached(`serie_${slug}`, () =>
      fetchWithRetry(() => fetchText(`${BASE_URL}/anime/${slug}/`, { timeout: TIMEOUT }))
    );
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
    
    // Primary: parse .season-card elements
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
    
    // Fallback: if no season cards found, try a[href*="saison-"] links
    if (seasons.length === 0 && filmSeasonHref === null) {
        $('a[href*="saison-"]').each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim();
            if (href && title && href.includes('/anime/' + slug + '/')) {
                const seasonNum = parseSeasonNumber(href);
                if (seasonNum) {
                    seasons.push({ href, title, seasonNum });
                }
            }
        });
        // Also try film/movie links
        if (filmSeasonHref === null) {
            $('a[href*="/film/"], a[href*="/movie/"]').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.includes('/anime/' + slug + '/')) {
                    filmSeasonHref = href;
                    return false;
                }
            });
        }
    }

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

        const seasonHtml = await anfCached(`season_${slug}_${targetSeason.seasonNum}`, () =>
          fetchWithRetry(() => fetchText(seasonPageUrl, { timeout: TIMEOUT }))
        );
        const $s = cheerio.load(seasonHtml);
        const episodeLinks = {};

        for (const lang of langs) {
            episodeLinks[lang] = [];
            // URLs réelles: /anime/{slug}/saison-{N}/{lang}/episode-{N}/
            // Les <a> n'ont PAS de classe 'episode-card' → on matche par pattern d'URL
            $s(`a[href*="/${lang}/episode-"]`).each((i, el) => {
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
        (lang) => `${BASE_URL}/anime/${slug}/film/${lang}/`,
        (lang) => `${BASE_URL}/anime/${slug}/${lang}/episode-1/`,
    );

    for (const lang of langs) {
        const langResults = await Promise.allSettled(
            tryUrlBuilders.map(buildUrl => {
                const url = buildUrl(lang);
                return fetchWithRetry(() => fetchText(url, { timeout: TIMEOUT })).then(html => {
                    // Check for player presence: either #epLecteurSelect, JSON-LD embedUrl, or iframe
                    if (html.includes('epLecteurSelect') || html.includes('"embedUrl"') || html.includes('<iframe')) {
                        return extractEpisodeStreams(url, lang === 'vf' ? 'VF' : 'VOSTFR', slug);
                    }
                    throw new Error('No player');
                });
            })
        );
        for (const r of langResults) {
            if (r.status === 'fulfilled' && r.value) {
                // ⚠ Filtrer UNIQUEMENT les streams réellement résolus (isDirect: true)
                // Les streams non-résolus (isDirect: false) ont des URLs d'embed
                // qui ne peuvent pas être lues par ExoPlayer
                const validStreams = (r.value || []).filter(s => s && s.isDirect)
                if (validStreams.length > 0) {
                    streams.push(...validStreams);
                    break;
                }
            }
        }
    }

    return streams;
}

async function extractEpisodeStreams(episodeUrl, langLabel, slug) {
    const html = await fetchWithRetry(() => fetchText(episodeUrl, { timeout: TIMEOUT }));
    const $ = cheerio.load(html);

    const embedUrls = [];
    
    // Method 1: Try #epLecteurSelect (site's actual player select ID)
    $('#epLecteurSelect option').each((i, el) => {
        const val = $(el).val();
        if (val && val.startsWith('http')) {
            embedUrls.push(val);
        }
    });
    
    // Method 2: Try fallback selectors (older site version)
    if (embedUrls.length === 0) {
        $('#lecteurSelect option, select.video-source option, select.player-select option').each((i, el) => {
            const val = $(el).val();
            if (val && val.startsWith('http')) {
                embedUrls.push(val);
            }
        });
    }

    // Method 3: JSON-LD embedUrl
    if (embedUrls.length === 0) {
        // Match both double-quoted and single-quoted embedUrl values
        const jsonLdMatch = html.match(/"embedUrl"\s*:\s*"(https?:\/\/[^"]+)"/) ||
                           html.match(/'embedUrl'\s*:\s*'(https?:\/\/[^']+)'/) ||
                           html.match(/embedUrl\s*:\s*["'](https?:\/\/[^"']+)["']/);
        if (jsonLdMatch) {
            embedUrls.push(jsonLdMatch[1]);
        }
        // Try to find all embedUrl variants in JSON-LD array
        const allEmbeds = html.match(/"embedUrl"\s*:\s*"(https?:\/\/[^"]+)"/g);
        if (allEmbeds && allEmbeds.length > 1) {
            for (const e of allEmbeds) {
                const url = e.match(/"embedUrl"\s*:\s*"([^"]+)"/);
                if (url && !embedUrls.includes(url[1])) {
                    embedUrls.push(url[1]);
                }
            }
        }
    }

    // Method 4: Iframe fallback
    if (embedUrls.length === 0) {
        const knownIframeSelectors = [
            '#videoPlayer',
            '.video-wrapper iframe',
            '.player-wrapper iframe',
            '.embed-wrapper iframe',
            'iframe[src*="sibnet"]',
            'iframe[src*="sendvid"]',
            'iframe[src*="dood"]',
            'iframe[src*="voe"]',
            'iframe[src*="uqload"]',
            'iframe[src*="vidmoly"]',
        ];
        for (const sel of knownIframeSelectors) {
            $(sel).each((i, el) => {
                const src = $(el).attr('src');
                if (src && src.startsWith('http')) {
                    embedUrls.push(src);
                }
            });
            if (embedUrls.length > 0) break;
        }
        // Last resort: any iframe with http src
        if (embedUrls.length === 0) {
            $('iframe[src^="http"]').each((i, el) => {
                const src = $(el).attr('src');
                if (src) embedUrls.push(src);
            });
        }
    }

    // Method 5: Extract from data-player or data-src attributes (site-specific)
    if (embedUrls.length === 0) {
        $('[data-player], [data-src]').each((i, el) => {
            const player = $(el).attr('data-player') || $(el).attr('data-src');
            if (player && player.startsWith('http') && !embedUrls.includes(player)) {
                embedUrls.push(player);
            }
        });
    }

    // Method 6: Parse embedded player URL from JSON configuration in inline scripts
    if (embedUrls.length === 0) {
        const playerMatch = html.match(/playerUrl\s*[=:]\s*['"]?(https?:\/\/[^'"\s]+)['"\s]/i) ||
                           html.match(/videoUrl\s*[=:]\s*['"]?(https?:\/\/[^'"\s]+)['"\s]/i) ||
                           html.match(/srcUrl\s*[=:]\s*['"]?(https?:\/\/[^'"\s]+)['"\s]/i);
        if (playerMatch && playerMatch[1].startsWith('http')) {
            embedUrls.push(playerMatch[1]);
        }
    }

    // Method 7: data-video or data-embed-url attributes
    if (embedUrls.length === 0) {
        $('[data-video], [data-embed-url], [data-player-url]').each((i, el) => {
            const val = $(el).attr('data-video') || $(el).attr('data-embed-url') || $(el).attr('data-player-url');
            if (val && val.startsWith('http') && !embedUrls.includes(val)) {
                embedUrls.push(val);
            }
        });
    }

    // Method 8: Look for <a> with class play-now or similar that has data-href
    if (embedUrls.length === 0) {
        $('a[data-href*="http"], a.play-now[href*="http"], a.btn-player[href*="http"]').each((i, el) => {
            const val = $(el).attr('data-href') || $(el).attr('href');
            if (val && val.startsWith('http') && !embedUrls.includes(val)) {
                embedUrls.push(val);
            }
        });
    }

    // Method 9: Parse embedded base64-encoded URLs in scripts
    if (embedUrls.length === 0) {
        const b64matches = html.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/g);
        if (b64matches) {
            for (const match of b64matches) {
                try {
                    const b64 = match.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/);
                    if (b64) {
                        const decoded = atob(b64[1]);
                        if (decoded.startsWith('http') && !embedUrls.includes(decoded)) {
                            embedUrls.push(decoded);
                        }
                    }
                } catch {}
            }
        }
    }

    // Method 10: Search for any URL pattern ending in .mp4/.m3u8 within script content
    if (embedUrls.length === 0) {
        $('script').each((i, el) => {
            const content = $(el).html() || '';
            // Skip scripts with only whitespace or JSON
            if (content.length < 20) return;
            const urls = content.match(/"(https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)"/i);
            if (urls && !embedUrls.includes(urls[1])) {
                embedUrls.push(urls[1]);
                return false; // stop after first found
            }
        });
    }

    const results = await Promise.allSettled(
        embedUrls.map(url =>
            resolveStream({
                name: `AnimoFlix (${langLabel})`,
                title: `[${langLabel}] AnimoFlix`,
                language: langLabel,
                url: url,
                quality: 'HD',
                headers: { Referer: `${BASE_URL}/anime/${slug}/` }
            }).then(stream => stream || null)
        )
    );

    return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
}
