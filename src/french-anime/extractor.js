import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, isBudgetExhausted, sortStreamsByLanguage } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://french-anime.com";
const SPINOFF_KEYWORDS = ['fan letter', 'log:', 'memories', 'vigilante', 'illegals', 'film', 'movie', 'special', 'oav', 'ona'];
const BUDGET_MS = 45000;

/**
 * Normalize a string for matching: lowercase, remove accents, remove special chars, remove filler words
 */
function normalize(s) {
    if (!s) return '';
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[-':!.,?()[\]]/g, ' ')
        .replace(/\b(the|vostfr|vost?|vf|french|streaming|anime|animes|saison|season|episode|ep)\s+/g, '')
        .replace(/\[[^\]]*\]/g, '') // remove [tags]
        .replace(/\s+/g, ' ').trim();
}

/**
 * Extract significant words from a title (≥3 chars, non-filler)
 */
function getSignificantWords(s) {
    const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'his', 'its', 'les', 'des', 'pour', 'dans', 'avec', 'sur', 'pas', 'une', 'que', 'qui', 'est', 'sont', 'aux', 'leurs']);
    return (s || '').toLowerCase()
        .replace(/[-':!.,?()[\]]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Compute a match score between a search query and a result title.
 * Returns a score 0-100, higher = better match.
 */
function computeTitleMatch(query, resultTitle) {
    const nq = normalize(query);
    const nr = normalize(resultTitle);
    if (!nq || !nr) return 0;

    // Exact match
    if (nq === nr) return 100;
    // One contains the other
    if (nq.includes(nr) || nr.includes(nq)) return 80;
    // Word overlap scoring
    const qWords = new Set(getSignificantWords(query));
    const rWords = new Set(getSignificantWords(resultTitle));
    if (qWords.size === 0 || rWords.size === 0) return 0;

    let overlap = 0;
    for (const w of qWords) {
        if (rWords.has(w)) overlap++;
    }
    // Also check if any query words are contained in result word (handles "Alchemist" vs "AlchemistBrotherhood")
    for (const w of qWords) {
        for (const rw of rWords) {
            if (rw.includes(w) || w.includes(rw)) {
                overlap += 0.5;
                break;
            }
        }
    }
    const maxLen = Math.max(qWords.size, rWords.size);
    const score = (overlap / Math.max(maxLen, 1)) * 100;

    // Penalize short result titles that contain query as substring but aren't really related
    if (nr.length < 8 && nq.includes(nr)) return Math.min(score, 50);

    return Math.round(score);
}

function isSpinoff(title) {
    const t = title.toLowerCase();
    return SPINOFF_KEYWORDS.some(k => t.includes(k));
}

/**
 * Search the site for an anime by title using DLE search.
 */
async function searchAnime(title) {
    try {
        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl);

        const $ = cheerio.load(html);
        const results = [];

        // Primary selector: a.mov-t.nowrap (the actual search result links)
        $('a.mov-t').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && href.includes('.html') && text.length > 2) {
                results.push({ title: text, url: href });
            }
        });

        // Fallback: any link with .html pointing to french-anime.com
        if (results.length === 0) {
            $('a[href*="french-anime.com"][href*=".html"]').each((i, el) => {
                const h = $(el).attr('href');
                const t = $(el).text().trim();
                if (h && t.length > 2) {
                    results.push({ title: t, url: h });
                }
            });
        }

        // Deduplicate by URL
        const seen = new Set();
        const uniqueResults = results.filter(r => {
            if (seen.has(r.url)) return false;
            seen.add(r.url);
            return true;
        });

        // Score results by title match against the search query
        const scored = uniqueResults.map(r => ({
            ...r,
            score: computeTitleMatch(title, r.title)
        }));

        // Filter out spinoffs and sort by score
        const filtered = scored.filter(r => !isSpinoff(r.title) && r.score >= 25);
        filtered.sort((a, b) => b.score - a.score);

        console.log(`[French-Anime] Search "${title}": ${scored.length} total, ${filtered.length} filtered matches`);
        if (filtered.length > 0) {
            console.log(`[French-Anime]   Best: "${filtered[0].title}" (score:${filtered[0].score}) → ${filtered[0].url}`);
        }
        return filtered;
    } catch (e) {
        console.error(`[French-Anime] Search error: ${e.message}`);
        return [];
    }
}

/**
 * Extract episode data from the page HTML.
 * Data is in a hidden div.eps with format: 1!URL1,URL2,URL3,
 */
function parseEpisodeData(html, targetEpisode) {
    const streams = [];

    // Try to extract from div.eps content first (cleaner)
    const epsMatch = html.match(/<div[^>]*class="eps"[^>]*>([\s\S]*?)<\/div>/i);
    const content = epsMatch ? epsMatch[1] : html;

    const regex = /(\d+)!((?:(?:https?:)?\/\/[^,<\s]+)(?:,(?:(?:https?:)?\/\/[^,<\s]+))*(?:,|(?=<|\s|$)))/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const epNum = parseInt(match[1]);
        if (targetEpisode === -1 || epNum === targetEpisode) {
            const urls = match[2].split(',').filter(u => u.trim().length > 0);
            for (let url of urls) {
                url = url.trim();
                if (url.startsWith('//')) url = 'https:' + url;
                if (url.length > 10 && !url.startsWith('//')) {
                    streams.push(url);
                }
            }
        }
    }

    return streams;
}

function getPlayerName(url) {
    if (url.includes('sibnet')) return 'Sibnet';
    if (url.includes('vidmoly')) return 'Vidmoly';
    if (url.includes('voe')) return 'Voe';
    if (url.includes('luluvid')) return 'Luluvid';
    if (url.includes('savefiles')) return 'Savefiles';
    if (url.includes('up4fun')) return 'Up4Fun';
    if (url.includes('uqload')) return 'Uqload';
    if (url.includes('hgcloud')) return 'HGCloud';
    if (url.includes('myvi')) return 'MyVi';
    if (url.includes('rutube')) return 'Rutube';
    if (url.includes('ok.ru')) return 'OK.ru';
    if (url.includes('doodstream') || url.includes('vvide0')) return 'Doodstream';
    if (url.includes('mail.ru')) return 'Mail.ru';
    if (url.includes('getvid')) return 'GetVid';
    if (url.includes('richardquestionbuilding')) return 'Player';
    if (url.includes('sendvid')) return 'SendVid';
    if (url.includes('streamtape')) return 'Streamtape';
    return 'Player';
}

/**
 * Detect language from a page URL (VF = animes-vf/, VOSTFR = animes-vostfr/)
 */
function detectLanguageFromUrl(url) {
    if (url.includes('/animes-vf/') || url.includes('films-vf')) return 'VF';
    if (url.includes('/animes-vostfr/') || url.includes('vostfr')) return 'VOSTFR';
    return null;
}

/**
 * Detect language from the page content (title, body text)
 */
function detectLanguageFromPage(html) {
    const $ = cheerio.load(html);
    const title = $('title').text().toLowerCase();
    const body = $('body').text().toLowerCase().slice(0, 5000);

    // Check title first
    if (/\bvf\b/.test(title) || title.includes('version française') || title.includes('francais')) return 'VF';
    if (/\bvostfr\b/.test(title) || title.includes('version originale')) return 'VOSTFR';

    // Check body
    if (body.includes('vf') && !body.includes('vostfr')) return 'VF';
    if (body.includes('vostfr')) return 'VOSTFR';

    return null;
}

function detectSeasonFromUrl(url) {
    const m = url.match(/saison[-_]?(\d+)/i);
    if (m) return parseInt(m[1]);
    return null;
}

/** Generate smarter search queries from a title */
function generateSearchQueries(title) {
    const queries = [];
    const t = title.trim();
    if (!t || t.length < 2) return queries;

    // 1. The title itself
    queries.push(t);

    // 2. Without hyphens
    const noHyphen = t.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    if (noHyphen !== t && noHyphen.length > 3) queries.push(noHyphen);

    // 3. All bigrams of significant words
    const words = getSignificantWords(t);
    if (words.length > 1) {
        for (let i = 0; i < words.length - 1; i++) {
            const bigram = words.slice(i, i + 2).join(' ');
            if (bigram.length >= 4) queries.push(bigram);
        }
    }

    // 4. Last 2 words (often the most distinctive part)
    if (words.length > 1) {
        const lastTwo = words.slice(-2).join(' ');
        if (!queries.includes(lastTwo)) queries.push(lastTwo);
    }

    // 5. First 2-3 words (often the main title part)
    if (words.length > 2) {
        const firstFew = words.slice(0, 3).join(' ');
        if (!queries.includes(firstFew)) queries.push(firstFew);
    }

    // 6. Without leading articles/prefixes
    const cleaned = t.replace(/^(the |one |le |la |les |un |une |l'|d')\s*/i, '');
    if (cleaned !== t && cleaned.length > 5) queries.push(cleaned);
    const cleaned2 = cleaned.replace(/^(the |one |le |la |les |un |une )\s*/i, '');
    if (cleaned2 !== cleaned && cleaned2.length > 5) queries.push(cleaned2);

    // 7. Just the longest word (fallback)
    if (words.length > 0) {
        const longest = words.reduce((a, b) => a.length >= b.length ? a : b);
        if (longest.length >= 5) queries.push(longest);
    }

    return [...new Set(queries)].filter(q => q.length >= 3);
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const startTime = Date.now();
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    // Build target episodes: for movies episode=-1, for series try both episode and absolute episode
    let targetEpisodes = mediaType === 'movie' ? [-1] : [episode];
    if (mediaType !== 'movie' && !isBudgetExhausted(startTime, BUDGET_MS)) {
        try {
            const imdbId = await getImdbId(tmdbId, mediaType);
            if (imdbId && !isBudgetExhausted(startTime, BUDGET_MS)) {
                const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
                if (absoluteEpisode && absoluteEpisode !== episode) {
                    targetEpisodes.push(absoluteEpisode);
                }
            }
        } catch (e) {
            console.warn(`[French-Anime] ArmSync failed: ${e.message}`);
        }
    }

    // Generate search queries from the first few titles
    const searchQueries = [];
    // Title 0: English title (best for general search)
    if (titles[0]) searchQueries.push(...generateSearchQueries(titles[0]));
    // Title 1: French title if available (better for French sites)
    if (titles[1] && normalize(titles[1]) !== normalize(titles[0])) {
        searchQueries.push(...generateSearchQueries(titles[1]));
    }

    const uniqueQueries = [...new Set(searchQueries)].filter(q => q.length >= 3).slice(0, 15);
    console.log(`[French-Anime] Search queries: ${uniqueQueries.join(' | ')}`);

    // Execute all search queries in parallel, collect best results
    const allResults = [];
    const searchResults = await Promise.allSettled(
        uniqueQueries.map(q => searchAnime(q))
    );
    for (const r of searchResults) {
        if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
            allResults.push(...r.value);
        }
    }

    if (allResults.length === 0) {
        console.log(`[French-Anime] No search matches found for any query`);
        return [];
    }

    // Deduplicate by URL, keep the best score for each URL
    const urlMap = new Map();
    for (const r of allResults) {
        if (!urlMap.has(r.url) || urlMap.get(r.url).score < r.score) {
            urlMap.set(r.url, r);
        }
    }

    // Score each result against the FIRST title (primary)
    const primaryTitle = titles[0];
    const scoredResults = [...urlMap.values()].map(r => {
        let score = computeTitleMatch(primaryTitle, r.title);

        // Boost VF results slightly (penalize VOSTFR when searching French)
        if (r.url.includes('/animes-vf/')) score += 5;
        // Boost for season match
        if (mediaType !== 'movie') {
            const detectedSeason = detectSeasonFromUrl(r.url) || detectSeasonFromUrl(r.title);
            if (detectedSeason === effectiveSeason) score += 10;
            else if (detectedSeason !== null) score -= 20; // wrong season
        }
        return { ...r, score, detectedSeason: detectSeasonFromUrl(r.url) || detectSeasonFromUrl(r.title) };
    });

    // Sort by score descending, filter minimum relevance
    scoredResults.sort((a, b) => b.score - a.score);
    const relevantMatches = scoredResults.filter(r => r.score >= 35);

    if (relevantMatches.length === 0) {
        console.log(`[French-Anime] No sufficiently relevant matches (best score: ${scoredResults[0]?.score || 0})`);
        // Fallback: use the top scored result anyway if it's above a very low threshold
        if (scoredResults.length > 0 && scoredResults[0].score >= 20) {
            console.log(`[French-Anime] Using lowest-confidence fallback: "${scoredResults[0].title}"`);
            relevantMatches.push(scoredResults[0]);
        } else {
            return [];
        }
    }

    // Take top matches (max 3 pages to try)
    const topMatches = relevantMatches.slice(0, 3);

    console.log(`[French-Anime] Top matches: ${topMatches.map(m => `"${m.title}"(score:${m.score},lang:${detectLanguageFromUrl(m.url) || '?'})`).join(', ')}`);

    // Known slow hosts to deprioritize
    const SLOW_HOSTS = ['up4fun.', 'vvide0.'];
    function isSlowHost(url) {
        const u = url.toLowerCase();
        return SLOW_HOSTS.some(h => u.includes(h));
    }

    function urlSpeedPriority(url) {
        const u = url.toLowerCase();
        if (u.includes('.mp4')) return 0;
        if (u.includes('.m3u8') || u.includes('/hls/')) return 1;
        if (u.includes('sendvid') || u.includes('sibnet')) return 2;
        if (u.includes('uqload') || u.includes('voe') || u.includes('streamtape')) return 3;
        if (u.includes('vidmoly') || u.includes('myvi') || u.includes('lulu')) return 4;
        if (u.includes('dood') || u.includes('netu') || u.includes('getvid')) return 5;
        return 6;
    }

    const streams = [];
    const seenUrls = new Set();

    // Try each match page to extract episodes
    const pagePromises = topMatches.map(async (match) => {
        try {
            const html = await fetchText(match.url);

            // Validate page has episode data
            const allPlayerUrls = [];
            for (const ep of targetEpisodes) {
                const playerUrls = parseEpisodeData(html, ep);
                allPlayerUrls.push(...playerUrls);
            }

            if (allPlayerUrls.length === 0) {
                console.log(`[French-Anime] ${match.url}: no episode data for target ${targetEpisodes}`);
                return [];
            }

            // Detect language from URL path first, then page content
            const langLabel = detectLanguageFromUrl(match.url) || detectLanguageFromPage(html) || 'VOSTFR';

            // Filter slow hosts, then sort by speed, take max 3 per page
            const fastUrls = allPlayerUrls.filter(u => !isSlowHost(u));
            fastUrls.sort((a, b) => urlSpeedPriority(a) - urlSpeedPriority(b));
            const urlsToTry = fastUrls.slice(0, 3);

            // Resolve each URL
            const resolvedStreams = [];
            for (const url of urlsToTry) {
                if (seenUrls.has(url)) continue;
                seenUrls.add(url);

                const playerName = getPlayerName(url);
                try {
                    const stream = await resolveStream({
                        name: `French-Anime (${langLabel})`,
                        title: `${playerName} - ${langLabel}`,
                        url: url,
                        quality: "HD",
                        language: langLabel,
                        headers: { "Referer": BASE_URL }
                    });
                    if (stream && stream.isDirect) {
                        resolvedStreams.push(stream);
                    }
                } catch (e) {
                    // resolveStream failed, skip
                }
            }

            console.log(`[French-Anime] ${match.title}: ${allPlayerUrls.length} sources, ${resolvedStreams.length} direct`);
            return resolvedStreams;
        } catch (err) {
            console.error(`[French-Anime] Failed to fetch ${match.url}: ${err.message}`);
            return [];
        }
    });

    const results = await Promise.allSettled(pagePromises);
    for (const r of results) {
        if (r.status === 'fulfilled') {
            streams.push(...r.value);
        }
    }

    console.log(`[French-Anime] Total streams found: ${streams.length}`);
    return sortStreamsByLanguage(streams);
}
