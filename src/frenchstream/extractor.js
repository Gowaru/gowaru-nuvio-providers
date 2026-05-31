import cheerio from 'cheerio-without-node-native';
import { safeFetch, resolveStream } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { fetchText, fetchJson, BASE_URL, BASE_URLS } from './http.js';

const MIN_MATCH_SCORE = 60;
const MOVIE_MATCH_SCORE = 55;
const MAX_SEARCH_QUERIES = 3;
const MAX_CANDIDATES = 3;
const RESOLVE_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 300000;
const CATEGORY_FETCH_TIMEOUT = 8000;
const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

const GENRE_TO_CATEGORY = {
    28: '/films/actions/', 12: '/films/aventures/', 16: '/films/animations/',
    35: '/films/comedies/', 80: '/films/policiers/', 99: '/films/documentaires/',
    18: '/films/drames/', 10751: '/films/familles/', 14: '/films/fantastiques/',
    36: '/films/historiques/', 27: '/films/epouvante-horreurs/', 10752: '/films/guerres/',
    9648: '/films/thrillers/', 10749: '/films/romances/', 878: '/films/science-fictions/',
    53: '/films/thrillers/', 37: '/films/westerns/', 10759: '/films/actions/',
    10402: '/films/biopics/', 10770: '/films/vf/'
};

const ALL_CATEGORIES = [
    '/films/actions/', '/films/aventures/', '/films/animations/', '/films/biopics/',
    '/films/comedies/', '/films/drames/', '/films/documentaires/', '/films/epouvante-horreurs/',
    '/films/historiques/', '/films/espionnages/', '/films/familles/', '/films/fantastiques/',
    '/films/guerres/', '/films/policiers/', '/films/romances/', '/films/science-fictions/',
    '/films/thrillers/', '/films/westerns/', '/films/vf/', '/films/cultes/'
];

const cache = new Map();

function cached(key, fn) {
    const now = Date.now();
    if (cache.has(key) && now - cache.get(key).ts < CACHE_TTL_MS) return cache.get(key).data;
    return fn().then(data => { cache.set(key, { data, ts: now }); return data; });
}

async function fetchTmdbJson(url) {
    const res = await safeFetch(url);
    if (!res || !res.ok) return null;
    return res.json();
}

const ANIME_KEYWORDS = /\b(?:anime|japon|shonen|shoujo|seinen|manga)\b/i;

function isJapaneseOrChinese(text) {
    return /[\u3000-\u9FFF\uF900-\uFAFF]/.test(text || '');
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
    try { return new URL(url).origin; }
    catch (e) { return BASE_URL; }
}

function pickNewsId(onclick, href) {
    const modalId = (onclick || '').match(/openModal\('(\d+)'\)/i)?.[1];
    if (modalId) return modalId;
    return (href || '').match(/^\/(\d+)-/)?.[1] || null;
}

function isSeriesCard($card, href, title) {
    if ($card.find('.mli-eps').length > 0) return true;
    const text = (href || '') + ' ' + (title || '');
    return /saison|series|\/s-tv\//i.test(text);
}

function normalizeHref(href, baseUrl) {
    if (!href || typeof href !== 'string') return null;
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return 'https:' + trimmed;
    if (trimmed.startsWith('/')) return baseUrl + trimmed;
    return baseUrl + '/' + trimmed.replace(/^\/+/, '');
}

function parseSearchCards(html, baseUrl) {
    const $ = cheerio.load(html);
    const cards = [];
    $('.short .short-in').each((_, element) => {
        const $card = $(element);
        const hrefRaw = $card.find('a.short-poster').first().attr('href') ||
            $card.find('a.img-box').first().attr('href') ||
            $card.find('a[href]').first().attr('href') || '';
        const href = normalizeHref(hrefRaw, baseUrl);
        if (!href) return;
        const title = ($card.find('.short-title').first().text() || '').trim();
        if (!title) return;
        const onclick = $card.find('.info-button').attr('onclick') || '';
        const newsId = pickNewsId(onclick, hrefRaw);
        if (!newsId) return;
        cards.push({ newsId, href, title, isSeries: isSeriesCard($card, href, title), baseUrl });
    });
    return cards;
}

function buildTitleQueries(titles) {
    const queries = [];
    const push = (v) => { if (typeof v === 'string' && v.trim() && !queries.some(q => q.toLowerCase() === v.trim().toLowerCase())) queries.push(v.trim()); };
    for (const title of (titles || []).slice(0, 2)) {
        push(title);
        const bc = title.split(':')[0];
        if (bc && bc.length >= 3) push(bc);
    }
    return queries.slice(0, MAX_SEARCH_QUERIES);
}

function scoreCard(card, queryTitle, mediaType, season) {
    const q = normalize(queryTitle);
    const t = normalize(card.title);
    const hrefN = normalize(card.href || '');
    const hay = (t + ' ' + hrefN).trim();
    if (!q || !t) return 0;
    let score = 0;
    if (t === q) score += 120;
    if (hay.includes(q)) score += 70;
    if (q.includes(t)) score += 40;
    const qWords = new Set(q.split(' ').filter(w => w && w.length > 2 && !['the','and','for','with','from','des','les','une','dans','sur','via','de','du','la','le'].includes(w)));
    const tWords = new Set(hay.split(' ').filter(Boolean));
    let common = 0;
    for (const w of qWords) { if (tWords.has(w)) common += 1; }
    score += common * 8;
    if (mediaType === 'movie' && card.isSeries) score -= 50;
    if (mediaType === 'tv' && !card.isSeries) score -= 30;
    const sn = Number(season) || 1;
    const text = (card.title + ' ' + card.href).toLowerCase();
    const hasSeason = /saison\s*\d+|s-tv\//i.test(text);
    if (mediaType === 'tv') {
        if (sn > 1) {
            const sr = new RegExp('saison\\s*' + sn + '|[-_/]' + sn + '(?:[^0-9]|$)', 'i');
            if (sr.test(text)) score += 20;
            if (hasSeason && !sr.test(text)) score -= 25;
        } else if (sn === 1 && /saison\s*[2-9]/i.test(text)) score -= 25;
    }
    return score;
}

async function searchByTitle(title, mediaType, season) {
    const allCards = [];
    const results = await Promise.allSettled(
        BASE_URLS.map(baseUrl => {
            const url = baseUrl + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(title);
            return fetchText(url, { baseUrl }).then(html => parseSearchCards(html, baseUrl));
        })
    );
    for (const r of results) {
        if (r.status === 'fulfilled') allCards.push(...r.value);
    }
    const filtered = allCards.filter(c => mediaType === 'tv' ? c.isSeries : !c.isSeries);
    if (filtered.length === 0) return [];
    return filtered.map(c => ({ ...c, _score: scoreCard(c, title, mediaType, season), _matchedTitle: title }))
        .sort((a, b) => b._score - a._score).slice(0, 8);
}

async function getTmdbDetails(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = TMDB_API_BASE + '/' + type + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=en-US';
    return cached('tmdb_det_' + tmdbId + '_' + type, () => fetchTmdbJson(url));
}

async function detectSubType(tmdbId, mediaType, titles) {
    try {
        const d = await getTmdbDetails(tmdbId, mediaType);
        if (!d) return null;
        const genres = (d.genres || []).map(g => g.id);
        const isAnim = genres.includes(16);
        const orig = mediaType === 'movie' ? d.original_title : d.original_name;
        const jap = isJapaneseOrChinese(orig);
        const tm = titles.some(t => ANIME_KEYWORDS.test(t));
        if (isAnim && (jap || tm)) return 'anime';
        if (isAnim && mediaType === 'tv') return 'cartoon';
    } catch (e) {}
    return null;
}

function hostLabel(k) {
    const h = (k || '').toLowerCase();
    if (h === 'premium') return 'FSVID';
    if (h === 'vidzy') return 'VIDZY';
    if (h === 'uqload') return 'UQLOAD';
    if (h === 'dood') return 'DOOD';
    if (h === 'voe') return 'VOE';
    if (h === 'filmoon') return 'FILEMOON';
    if (h === 'netu') return 'NETU';
    return k ? k.toUpperCase() : 'PLAYER';
}

function languageLabel(k) {
    const l = (k || '').toLowerCase();
    if (l === 'vf' || l === 'default' || l === 'vfq') return 'VF';
    if (l === 'vostfr') return 'VOSTFR';
    if (l === 'vo') return 'VO';
    return l ? l.toUpperCase() : 'VF';
}

function toStream(name, host, language, url, quality, subType) {
    const origin = getOrigin(url);
    const s = {
        name, url, quality: quality || 'HD',
        title: '[' + languageLabel(language) + '] ' + hostLabel(host) + (quality && quality !== 'HD' ? ' [' + quality + ']' : ''),
        headers: { Referer: origin + '/', Origin: origin, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' }
    };
    if (subType) s.subType = subType;
    return s;
}

function dedupeByUrl(streams) {
    const seen = new Set(), out = [];
    for (const s of streams) { if (s && s.url && !seen.has(s.url)) { seen.add(s.url); out.push(s); } }
    return out;
}

/* ---------- SITE API METHODS ---------- */

async function fetchSeasons(tmdbId) {
    const tag = 's-' + tmdbId;
    const url = BASE_URL + '/engine/ajax/get_seasons.php?serie_tag=' + tag + '&news_id=0';
    return cached('seasons_' + tmdbId, async () => {
        const data = await fetchJson(url, { baseUrl: BASE_URL });
        if (!Array.isArray(data)) return [];
        return data;
    });
}

async function fetchEpisodeData(seasonNewsId) {
    const url = BASE_URL + '/data/eps_' + seasonNewsId + '.txt?v=' + Math.floor(Date.now() / 30000);
    return cached('eps_' + seasonNewsId, async () => {
        const data = await fetchJson(url, { baseUrl: BASE_URL });
        return data;
    });
}

function collectTvSiteCandidates(epData, episode, subType) {
    const epNum = Number(episode) || 1;
    const streams = [];
    for (const lang of ['vf', 'vostfr', 'vo']) {
        const byEp = epData && epData[lang];
        if (!byEp || typeof byEp !== 'object') continue;
        const players = byEp[String(epNum)] || byEp[epNum];
        if (!players || typeof players !== 'object') continue;
        for (const host of Object.keys(players)) {
            const url = players[host];
            if (typeof url === 'string' && url.startsWith('http')) {
                streams.push(toStream('Frenchstream', host, lang, url, null, subType));
            }
        }
    }
    return streams;
}

async function fetchMovieSite(newsId, subType) {
    const url = BASE_URL + '/engine/ajax/film_api.php?id=' + newsId;
    const data = await fetchJson(url, { baseUrl: BASE_URL });
    const players = data && data.players;
    if (!players || typeof players !== 'object') return [];
    const streams = [];
    for (const host of Object.keys(players)) {
        const versions = players[host];
        if (!versions || typeof versions !== 'object') continue;
        for (const lang of Object.keys(versions)) {
            const url = versions[lang];
            if (typeof url === 'string' && url.startsWith('http')) {
                streams.push(toStream('Frenchstream', host, lang, url, null, subType));
            }
        }
    }
    return streams;
}

/* ---------- STREAM RESOLUTION ---------- */

function resolveSingle(stream) {
    // Wrap with timeout to avoid slow hosts blocking resolution
    const promise = resolveStream(stream);
    if (typeof setTimeout === 'undefined') return promise;
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve({ ...stream, isDirect: false }), RESOLVE_TIMEOUT_MS))
    ]);
}

async function resolveCandidates(candidates) {
    const limited = candidates.slice(0, MAX_CANDIDATES);
    const resolved = await Promise.allSettled(limited.map(resolveSingle));
    const direct = [];
    for (const r of resolved) {
        if (r.status !== 'fulfilled') continue;
        const s = r.value;
        if (s && s.url && s.isDirect) direct.push(s);
    }
    return dedupeByUrl(direct);
}

/* ---------- MOVIE CATEGORY BROWSING ---------- */

function parseCategoryMovies(html) {
    const $ = cheerio.load(html);
    const movies = [];
    $('.short').each((_, el) => {
        const $card = $(el);
        const newsId = $card.find('[data-id]').first().attr('data-id') ||
            ($card.find('.info-button').attr('onclick') || '').match(/openModal\('(\d+)'\)/)?.[1];
        const title = ($card.find('.short-title').first().text() || '').trim();
        const poster = $card.find('img').first().attr('src') || '';
        if (newsId && title) movies.push({ newsId, title, poster });
    });
    return movies;
}

async function fetchCategoryMovies(catPath) {
    const url = BASE_URL + catPath;
    return cached('cat_' + catPath.replace(/[\/\s]/g, '_'), async () => {
        const html = await fetchText(url, { timeout: CATEGORY_FETCH_TIMEOUT, baseUrl: BASE_URL });
        return parseCategoryMovies(html);
    });
}

async function verifyAndExtractMovieStreams(newsId, tmdbId, subType) {
    const url = BASE_URL + '/engine/ajax/film_api.php?id=' + newsId;
    try {
        const data = await fetchJson(url, { baseUrl: BASE_URL });
        const tagz = data?.meta?.tagz || '';
        const expectedTag = 'f-' + tmdbId;
        if (tagz !== expectedTag) {
            console.log('[Frenchstream] Tagz mismatch: got ' + tagz + ', expected ' + expectedTag);
            return null;
        }
        const players = data?.players;
        if (!players || typeof players !== 'object') return [];
        const streams = [];
        for (const host of Object.keys(players)) {
            const versions = players[host];
            if (!versions || typeof versions !== 'object') continue;
            for (const lang of Object.keys(versions)) {
                const url = versions[lang];
                if (typeof url === 'string' && url.startsWith('http')) {
                    streams.push(toStream('Frenchstream', host, lang, url, null, subType));
                }
            }
        }
        return streams;
    } catch (e) {
        console.warn('[Frenchstream] film_api verify failed for ' + newsId + ': ' + e.message);
        return null;
    }
}

function scoreMovieCategory(cardTitle, queryTitles) {
    const t = normalize(cardTitle);
    if (!t) return 0;
    let bestScore = 0;
    for (const qt of queryTitles) {
        const q = normalize(qt);
        if (!q) continue;
        let score = 0;
        if (t === q) score += 120;
        else if (t.includes(q) || q.includes(t)) score += 70;
        else {
            const qWords = q.split(' ').filter(w => w.length > 2 && !['the','and','for','with','from','des','les','une','dans','sur','via','de','du','la','le','das','der','die'].includes(w));
            const tWords = new Set(t.split(' '));
            let common = 0;
            for (const w of qWords) { if (tWords.has(w)) common++; }
            score += common * 10;
        }
        if (score > bestScore) bestScore = score;
    }
    return bestScore;
}

async function searchMovieOnSite(tmdbId, titles, subType) {
    // Step 1: check DLE search results (fast, sometimes works)
    const queries = buildTitleQueries(titles);
    let dleFoundCards = false;
    for (const title of queries) {
        try {
            const ranked = await searchByTitle(title, 'movie');
            if (ranked.length > 0) {
                dleFoundCards = true;
                if (ranked[0]._score >= MIN_MATCH_SCORE) {
                    const streams = await verifyAndExtractMovieStreams(ranked[0].newsId, tmdbId, subType);
                    if (streams && streams.length > 0) {
                        const resolved = await resolveCandidates(streams);
                        console.log('[Frenchstream] Movie found via DLE search: ' + resolved.length + ' streams');
                        return resolved;
                    }
                }
            } else if (!dleFoundCards) {
                // First query returned 0 cards — DLE search is broken for this film, skip remaining
                break;
            }
        } catch (e) {}
    }

    // Step 2: fetch category pages, starting with TMDB genre relevance
    const details = await getTmdbDetails(tmdbId, 'movie');
    const genreIds = (details?.genres || []).map(g => g.id);
    const priorityCats = [...new Set(genreIds.map(id => GENRE_TO_CATEGORY[id]).filter(Boolean))];

    // Build ordered list: priority cats first, then remaining
    const catsToCheck = [...priorityCats];
    for (const cat of ALL_CATEGORIES) {
        if (!catsToCheck.includes(cat)) catsToCheck.push(cat);
    }

    const seenNewsIds = new Set();
    let bestMatch = null;
    let bestScore = 0;

    // Process category batch results and look for matches
    function processCatResults(results) {
        let found = false;
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            for (const movie of r.value) {
                if (seenNewsIds.has(movie.newsId)) continue;
                seenNewsIds.add(movie.newsId);
                const score = scoreMovieCategory(movie.title, titles);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = movie;
                    if (score >= MOVIE_MATCH_SCORE) found = true;
                }
            }
        }
        return found;
    }

    // Fetch categories in batches: priority first, then remaining
    const BATCH_SIZE = 5;
    const priorityBatch = priorityCats.length > 0 ? priorityCats : catsToCheck.slice(0, BATCH_SIZE);
    let catResults = await Promise.allSettled(priorityBatch.map(cat => fetchCategoryMovies(cat)));

    if (processCatResults(catResults) && bestMatch) {
        const streams = await verifyAndExtractMovieStreams(bestMatch.newsId, tmdbId, subType);
        if (streams && streams.length > 0) {
            const resolved = await resolveCandidates(streams);
            console.log('[Frenchstream] Movie found via category: ' + bestMatch.title + ' → ' + resolved.length + ' streams');
            return resolved;
        }
        bestMatch = null;
        bestScore = 0;
    }

    // If best score from priority cats is too low (< 40), bail early — film likely not on site
    if (bestScore < 40) {
        return [];
    }

    // Try remaining categories in batches
    const remainingCats = catsToCheck.filter(c => !priorityBatch.includes(c));
    for (let i = 0; i < remainingCats.length; i += BATCH_SIZE) {
        const batch = remainingCats.slice(i, i + BATCH_SIZE);
        catResults = await Promise.allSettled(batch.map(cat => fetchCategoryMovies(cat)));
        if (processCatResults(catResults) && bestMatch) {
            const streams = await verifyAndExtractMovieStreams(bestMatch.newsId, tmdbId, subType);
            if (streams && streams.length > 0) {
                const resolved = await resolveCandidates(streams);
                console.log('[Frenchstream] Movie found via category: ' + bestMatch.title + ' → ' + resolved.length + ' streams');
                return resolved;
            }
            bestMatch = null;
            bestScore = 0;
        }
    }

    if (bestMatch && bestScore >= MOVIE_MATCH_SCORE) {
        const streams = await verifyAndExtractMovieStreams(bestMatch.newsId, tmdbId, subType);
        if (streams && streams.length > 0) {
            const resolved = await resolveCandidates(streams);
            console.log('[Frenchstream] Movie found via category: ' + bestMatch.title + ' → ' + resolved.length + ' streams');
            return resolved;
        }
    }

    return [];
}

/* ---------- MAIN EXPORT ---------- */

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const subType = await detectSubType(tmdbId, mediaType, titles);
    if (subType) console.log('[Frenchstream] subType: ' + subType);

    if (mediaType === 'tv') {
        // --- ARMSYNC Metadata Resolution ---
        let targetEpisodes = [episode];
        try {
            const imdbId = await getImdbId(tmdbId, mediaType);
            if (imdbId) {
                const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
                if (absoluteEpisode && absoluteEpisode !== episode) {
                    targetEpisodes.push(absoluteEpisode);
                }
            }
        } catch (e) {
            console.warn(`[Frenchstream] ArmSync failed: ${e.message}`);
        }
        // ------------------------------------

        let seasons = [];
        try {
            seasons = await fetchSeasons(tmdbId);
        } catch (e) {
            console.warn(`[Frenchstream] fetchSeasons failed: ${e.message}`);
        }
        if (seasons.length > 0) {
            const sn = Number(effectiveSeason) || 1;
            const sIdx = seasons.findIndex(s => /saison\s*(\d+)/i.test(s.title) && parseInt(s.title.match(/saison\s*(\d+)/i)[1]) === sn);
            const target = sIdx !== -1 ? seasons[sIdx] : seasons[0];
            if (target) {
                let epData = null;
                try {
                    epData = await fetchEpisodeData(target.id);
                } catch (e) {
                    console.warn(`[Frenchstream] fetchEpisodeData failed: ${e.message}`);
                }
                if (epData) {
                    for (const ep of targetEpisodes) {
                        const candidates = collectTvSiteCandidates(epData, ep, subType);
                        if (candidates.length > 0) {
                            const streams = await resolveCandidates(candidates);
                            console.log('[Frenchstream] Site eps ' + target.id + ': ' + candidates.length + ' candidates, ' + streams.length + ' streams (ep=' + ep + ')');
                            return streams;
                        }
                    }
                }
            }
        }
        console.warn('[Frenchstream] No streams found via site API');
        return [];
    }

    // Movies: site-native category browsing → film_api verification
    const movieStreams = await searchMovieOnSite(tmdbId, titles, subType);
    if (movieStreams.length > 0) return movieStreams;

    return [];
}
