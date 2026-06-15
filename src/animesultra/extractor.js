import { stripSeasonSuffix } from '../utils/dle-extractor.js';
import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, safeFetch, isBudgetExhausted, sortStreamsByLanguage } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://ww.animesultra.org";

const searchCache = {};
const CACHE_TTL = 60000;

function normalize(s) {
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?()\/–—]/g, '')
        .replace(/\s+/g, ' ').trim();
}

function scoreSearchMatch(resultTitle, searchTitle) {
    const nResult = normalize(resultTitle.replace(/ (VF|VOSTFR)$/i, ''));
    const nSearch = normalize(searchTitle);
    if (!nResult || !nSearch) return 0;
    let score = 0;
    if (nResult === nSearch) score += 150;
    else if (nResult.includes(nSearch) || nSearch.includes(nResult)) score += 100;
    const resultWords = new Set(nResult.split(/\s+/).filter(Boolean));
    const searchWords = nSearch.split(/\s+/).filter(Boolean);
    const matched = searchWords.filter(w => resultWords.has(w)).length;
    if (searchWords.length > 0) score += (matched / searchWords.length) * 50;
    const extra = resultWords.size - searchWords.length;
    if (extra > 0) score -= Math.min(extra * 15, 60);
    return score;
}

function detectLang(title) {
    const t = title.trim();
    if (t.endsWith(' VF')) return 'vf';
    if (t.endsWith(' VOSTFR')) return 'vostfr';
    return null;
}

const SEASON_PATTERNS = [
    /saison\s*(\d+)/i,
    /\bfin[ae]l\s+season\b/i,
    /\bS(\d+)\b/i,
    /\b(\d+)\s*(?:vf|vostfr)\s*$/i,
    /\bCour\s*(\d+)\b/i,
    /\bPart\s*(\d+)\b/i,
];

function detectSeason(title, url) {
    for (const pat of SEASON_PATTERNS) {
        const m = title.match(pat);
        if (m) {
            if (pat === SEASON_PATTERNS[1]) return 'final';
            return parseInt(m[1], 10);
        }
    }
    const urlSeason = url.match(/saison[-\s]*(\d+)/i)?.[1] || url.match(/cour[-\s]*(\d+)/i)?.[1];
    if (urlSeason) return parseInt(urlSeason, 10);
    const numEnd = title.match(/(?:^|\s)(\d{1,2})\s*(?:vf|vostfr)?\s*$/i);
    if (numEnd) {
        const v = parseInt(numEnd[1], 10);
        if (v >= 1 && v <= 30) return v;
    }
    return null;
}

async function searchAnime(title) {
    const now = Date.now();
    const cached = searchCache[title];
    if (cached && now - cached.time < CACHE_TTL) return cached.results;

    try {
        const results = [];
        const seen = new Set();

        const add = (url, t) => {
            const key = url || t;
            if (url && url.length > 5 && t && !seen.has(key)) {
                const score = scoreSearchMatch(t, title);
                if (score >= 30) {
                    seen.add(key);
                    results.push({ title: t, url: url.startsWith('http') ? url : BASE_URL + url, score });
                }
            }
        };

        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl, {
            timeout: 8000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const $ = cheerio.load(html);

        $('a.film-poster-ahref.item-qtip').each((i, el) => {
            const t = $(el).attr('title');
            const id = $(el).attr('data-id');
            const href = $(el).attr('href');
            if (t && id && id.length > 0 && !t.includes("' + item.name + '")) {
                add(href || t, t);
            }
        });

        if (results.length === 0) {
            $('a[href*="-au.html"]').each((i, el) => {
                const h = $(el).attr('href');
                const t = $(el).attr('title') || $(el).text().trim();
                if (h && t && !t.includes('Surprenez-moi')) add(h, t);
            });
        }

        const sorted = results.sort((a, b) => b.score - a.score);
        searchCache[title] = { results: sorted, time: now };
        return sorted;
    } catch (e) {
        console.error(`[AnimesUltra] Search error: ${e.message}`);
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const startTime = Date.now();
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const titlesOrdered = [...titles].sort((a, b) => {
        const score = t => /[àâéèêëîïôùûüç]/i.test(t) ? 0 : (/[\x20-\x7F]/.test(t) ? 1 : 2);
        return score(a) - score(b);
    });

    const BUDGET_MS = 45000;
    const epNum = episode || 1;
    let targetEpisodes = [epNum];
    if (!isBudgetExhausted(startTime, BUDGET_MS)) {
        try {
            const imdbId = await getImdbId(tmdbId, mediaType);
            if (imdbId && season && !isBudgetExhausted(startTime, BUDGET_MS)) {
                const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, epNum);
                if (absoluteEpisode && absoluteEpisode !== epNum) {
                    targetEpisodes.push(absoluteEpisode);
                }
            }
        } catch (e) {
            console.warn(`[AnimesUltra] ArmSync failed: ${e.message}`);
        }
    }

    let matches = [];
    const seenIds = new Set();

    const trySearch = async (title) => {
        if (!title || title.length > 50) return;
        const cleanTitle = stripSeasonSuffix(title)
        if (!cleanTitle || cleanTitle.length < 3) return;
        if (!/^[a-zA-Z0-9\sàâéèêëîïôùûüç'\-:!.,?()ÀÂÉÈÊËÎÏÔÙÛÜÇ]+$/.test(cleanTitle)) return;
        const results = await searchAnime(cleanTitle);
        if (results && results.length > 0) {
            for (const r of results) {
                const id = r.url.match(/\/(\d+)-/)?.[1];
                if (id && !seenIds.has(id)) {
                    seenIds.add(id);
                    matches.push(r);
                }
            }
        }
    };

    const queryKey = (t) => t.toLowerCase().replace(/[^a-z0-9àâéèêëîïôùûüç]/g, '').replace(/[.]+$/, '');
    const dedupQueries = new Set();
    const searchQueries = titlesOrdered.filter(t => {
        if (!t || t.length > 50 || t.length < 5) return false;
        if (!/^[a-zA-Z0-9\sàâéèêëîïôùûüç'\-:!.,?()ÀÂÉÈÊËÎÏÔÙÛÜÇ]+$/.test(t)) return false;
        const key = queryKey(t);
        if (dedupQueries.has(key)) return false;
        dedupQueries.add(key);
        return true;
    }).sort((a, b) => {
        const isName = t => t === titlesOrdered[0];
        const isFr = t => /[àâéèêëîïôùûüçÀÂÉÈÊËÎÏÔÙÛÜÇ]/.test(t) || t.toLowerCase().startsWith("l'");
        const sa = isName(a) ? 0 : isFr(a) ? 1 : 2;
        const sb = isName(b) ? 0 : isFr(b) ? 1 : 2;
        return sa - sb || a.length - b.length;
    });

    const searchedQueries = new Set();
    // Try all unique search queries in parallel. The site is slow, but queries
    // run in parallel so max wait is the same for 2 or 10 queries (~8s timeout).
    // We need enough query diversity to find spin-offs with non-English titles
    // like "Shingeki! Kyojin Chuugakkou" which are low in the sort order.
    const searchPromises = searchQueries.map(q =>
        trySearch(q).then(() => searchedQueries.add(queryKey(q)))
    );
    await Promise.allSettled(searchPromises);

    // If no matches after initial search, try with season number appended
    if (matches.length === 0 && effectiveSeason && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const seasonQuery = titlesOrdered.find(t => t.length > 3);
        if (seasonQuery) {
            await trySearch(`${seasonQuery} Saison ${effectiveSeason}`);
            await trySearch(`${seasonQuery} Season ${effectiveSeason}`);
        }
    }
    
    if (!matches || matches.length === 0) return [];

    const spinoffPattern = /(?:\s*:\s*|\s+-\s+)(?!\d|saison|partie|part)/i;
    if (matches.every(m => spinoffPattern.test(m.title.replace(/ (VF|VOSTFR)$/i, ''))) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        for (const t of titlesOrdered) {
            const k = t.toLowerCase().replace(/[^a-z0-9àâéèêëîïôùûüç]/g, '');
            const key = queryKey(t);
            if (k.length < 4 || searchedQueries.has(key)) continue;
            if (!/^[a-zA-Z0-9\sàâéèêëîïôùûüç'\-:!.,?()ÀÂÉÈÊËÎÏÔÙÛÜÇ]+$/.test(t)) continue;
            if (spinoffPattern.test(t.replace(/ (VF|VOSTFR)$/i, ''))) continue;
            searchedQueries.add(key);
            await trySearch(t);
            break;
        }
    }

    matches.sort((a, b) => {
        // Priorité 1: match de saison exacte (avant tout, même langue)
        const aSeason = detectSeason(a.title, a.url);
        const bSeason = detectSeason(b.title, b.url);
        const aMatchesSeason = typeof aSeason === 'number' && aSeason === effectiveSeason;
        const bMatchesSeason = typeof bSeason === 'number' && bSeason === effectiveSeason;
        if (aMatchesSeason && !bMatchesSeason) return -1;
        if (!aMatchesSeason && bMatchesSeason) return 1;
        // Priorité 2: entrées génériques (saison non détectée) avant les spin-offs
        if (aSeason === null && bSeason !== null) return -1;
        if (aSeason !== null && bSeason === null) return 1;
        // Priorité 3: titre le plus court (généralement le meilleur match)
        const aName = a.title.replace(/ (VF|VOSTFR)$/i, '').length;
        const bName = b.title.replace(/ (VF|VOSTFR)$/i, '').length;
        return aName - bName;
    });

    const streams = [];
    let processedCount = 0;
    const fullStoryCache = {};

    const getFullStory = async (newsId) => {
        if (fullStoryCache[newsId]) return fullStoryCache[newsId];
        try {
            const sf = await safeFetch(`${BASE_URL}/engine/ajax/full-story.php?newsId=${newsId}`, {
                timeout: 10000,
                headers: { "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest" }
            });
            if (sf) {
                const d = await sf.json();
                if (d && d.html) {
                    fullStoryCache[newsId] = d.html;
                    return d.html;
                }
            }
        } catch (e) {}
        return null;
    };

    const seenStreamUrls = new Set();

    const pushStream = (url, lang, serverName) => {
        const dedupKey = `${url}|${lang}`;
        if (!url || seenStreamUrls.has(dedupKey)) return;
        seenStreamUrls.add(dedupKey);
        if (/^[0-9]+$/.test(url)) url = `https://video.sibnet.ru/shell.php?videoid=${url}`;
        streams.push({
            name: `AnimesUltra (${lang})`,
            title: `${serverName} - ${lang}`,
            url,
            quality: "HD",
            headers: {
                "Referer": BASE_URL + '/',
                "Origin": BASE_URL,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
    };

    const fetchEpisodeServers = async (epHref, $context, lang) => {
        const epRes = await safeFetch(epHref, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" }});
        if (!epRes || !epRes.ok) {
            console.log(`[AnimesUltra] Episode page not OK (${epRes?.status}) for ${epHref}`);
            return [];
        }
        const epHtml = await epRes.text();
        const $ep = cheerio.load(epHtml);
        if ($ep('.server-item').length === 0) {
            console.log(`[AnimesUltra] No server items on ${epHref}`);
            return [];
        }
        const servers = [];
        $ep('.server-item').each((i, el) => {
            const sId = $ep(el).attr('data-server-id');
            const embed = $ep(el).attr('data-embed');
            const sname = $ep(el).text().trim() || `Srv_${sId}`;
            let url = null;
            if (embed && (embed.startsWith('http') || /^[0-9]+$/.test(embed))) url = embed;
            if (sId) {
                const box = $context(`#content_player_${sId}`);
                if (box.length > 0) {
                    const textUrl = box.text().trim();
                    const iframeUrl = box.find('iframe').attr('src');
                    const altUrl = textUrl || iframeUrl;
                    if (altUrl && (altUrl.startsWith('http') || /^[0-9]+$/.test(altUrl))) url = altUrl;
                }
            }
            if (url) servers.push({ url, lang, sname });
        });
        return servers;
    };



    const isSpinoffMatch = (m) => /(?:\s*:\s*|\s+-\s+)(?!\d|saison|partie|part)/i.test(m.title.replace(/ (VF|VOSTFR)$/i, ''));
    const spinoffCandidates = [];

    for (const match of matches) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        if (!match.url) continue;
        if (processedCount >= 8) break;

        if (isSpinoffMatch(match)) {
            spinoffCandidates.push(match);
            continue;
        }

        let lang = "VOSTFR";
        if (detectLang(match.title) === 'vf') lang = "VF";

        const matchSeasonNum = detectSeason(match.title, match.url);
        if (effectiveSeason && matchSeasonNum != null) {
            if (matchSeasonNum === 'final' && effectiveSeason < 6) continue;
            if (typeof matchSeasonNum === 'number' && matchSeasonNum !== effectiveSeason) continue;
        }

        try {
            const newsIdMatch = match.url.match(/\/(\d+)-/);
            if (!newsIdMatch) continue;
            const newsId = newsIdMatch[1];
            const html = await getFullStory(newsId);
            if (!html) continue;
            
            const $ = cheerio.load(html);

            const epHrefs = [];
            $('.ep-item').each((i, el) => {
                const epNum = $(el).attr('data-number');
                if (epNum && targetEpisodes.map(e => parseInt(e, 10)).includes(parseInt(epNum, 10))) {
                    const href = $(el).attr('href');
                    if (href) epHrefs.push(href);
                }
            });

            if (epHrefs.length === 0) continue;

            processedCount++;

            const epResults = await Promise.allSettled(
                epHrefs.map(epHref => fetchEpisodeServers(epHref, $, lang))
            );
            for (const r of epResults) {
                if (r.status === 'fulfilled') {
                    for (const { url, sname } of r.value) {
                        pushStream(url, lang, sname);
                    }
                }
            }
        } catch (e) {
            console.error(`[AnimesUltra] Extract error: ${e.message}`);
        }
    }

    // Fallback: if no non-spinoff match produced streams, try spinoffs
    if (streams.length === 0 && spinoffCandidates.length > 0 && !isBudgetExhausted(startTime, BUDGET_MS)) {
        for (const match of spinoffCandidates) {
            if (processedCount >= 6) break;

            let lang = "VOSTFR";
            if (detectLang(match.title) === 'vf') lang = "VF";

            const matchSeasonNum = detectSeason(match.title, match.url);
            if (effectiveSeason && matchSeasonNum != null) {
                if (matchSeasonNum === 'final' && effectiveSeason < 6) continue;
                if (typeof matchSeasonNum === 'number' && matchSeasonNum !== effectiveSeason) continue;
            }

            try {
                const newsIdMatch = match.url.match(/\/(\d+)-/);
                if (!newsIdMatch) continue;
                const newsId = newsIdMatch[1];
                const html = await getFullStory(newsId);
                if (!html) continue;

                const $ = cheerio.load(html);
                const epHrefs = [];
                $('.ep-item').each((i, el) => {
                    const epNum = $(el).attr('data-number');
                    if (epNum && targetEpisodes.map(e => parseInt(e, 10)).includes(parseInt(epNum, 10))) {
                        const href = $(el).attr('href');
                        if (href) epHrefs.push(href);
                    }
                });
                if (epHrefs.length === 0) continue;

                processedCount++;

                const epResults = await Promise.allSettled(
                    epHrefs.map(epHref => fetchEpisodeServers(epHref, $, lang))
                );
                for (const r of epResults) {
                    if (r.status === 'fulfilled') {
                        for (const { url, sname } of r.value) {
                            pushStream(url, lang, sname);
                        }
                    }
                }
            } catch (e) {
                console.error(`[AnimesUltra] Extract error: ${e.message}`);
            }
        }
    }

    if (streams.length === 0 && effectiveSeason && matches.length > 1 && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const byPart = {};
        for (const m of matches) {
            const sNum = detectSeason(m.title, m.url);
            const pNum = parseInt(m.title.match(/(?:partie|part)\s*(\d+)/i)?.[1], 10) || 1;
            if (sNum !== effectiveSeason) continue;
            const nId = m.url.match(/\/(\d+)-/)?.[1];
            if (!nId) continue;
            const mLang = detectLang(m.title) || 'vostfr';
            const key = `${pNum}-${mLang}`;
            if (!byPart[key]) {
                const html = await getFullStory(nId);
                if (html) {
                    byPart[key] = { match: m, newsId: nId, partNum: pNum, lang: mLang, html };
                }
            }
        }

        const uniqueParts = [];
        const seenPartNums = new Set();
        const langGroups = {};
        for (const [key, val] of Object.entries(byPart)) {
            if (!langGroups[val.partNum]) langGroups[val.partNum] = [];
            langGroups[val.partNum].push(val);
            if (!seenPartNums.has(val.partNum)) {
                seenPartNums.add(val.partNum);
                uniqueParts.push({ partNum: val.partNum, ref: val });
            }
        }
        uniqueParts.sort((a, b) => a.partNum - b.partNum);

        let cumOffset = 0;
        for (const up of uniqueParts) {
            const allLang = langGroups[up.partNum];
            const $ref = cheerio.load(allLang[0].html);
            const epCount = $ref('.ep-item').length;
            const targetLocal = targetEpisodes.map(t => t - cumOffset).filter(t => t >= 1 && t <= epCount);
            if (targetLocal.length > 0) {
                for (const lv of allLang) {
                    const $c = cheerio.load(lv.html);
                    const epHrefs = [];
                    $c('.ep-item').each((i, el) => {
                        const epDataNum = parseInt($c(el).attr('data-number'), 10);
                        if (epDataNum && targetLocal.includes(epDataNum)) {
                            const href = $c(el).attr('href');
                            if (href) epHrefs.push(href);
                        }
                    });
                    const epResults = await Promise.allSettled(
                        epHrefs.map(epHref => fetchEpisodeServers(epHref, $c, lv.lang === 'vf' ? 'VF' : 'VOSTFR'))
                    );
                    for (const r of epResults) {
                        if (r.status === 'fulfilled') {
                            for (const { url, sname } of r.value) {
                                pushStream(url, lv.lang === 'vf' ? 'VF' : 'VOSTFR', sname);
                            }
                        }
                    }
                }
                break;
            }
            cumOffset += epCount;
        }
    }

    // Filter out unresolved iframes to prevent ExoPlayer crashing (error 23003)
    const validStreams = [];
    const streamPromises = streams.map(s => resolveStream(s).catch(() => null));
    const resolvedArray = await Promise.all(streamPromises);
    for (let i = 0; i < resolvedArray.length; i++) {
        const resolved = resolvedArray[i];
        if (resolved && resolved.isDirect) {
            validStreams.push(resolved);
        }
    }

    // Fallback: if resolveStream filtered everything, keep only streams from resolvable hosts
    if (validStreams.length === 0 && streams.length > 0) {
        const resolvable = streams.filter(s => {
            const u = (s.url || '').toLowerCase();
            return u.includes('sibnet') || u.includes('sendvid') || u.includes('voe') || u.includes('m3u8') || u.includes('.mp4');
        });
        if (resolvable.length > 0) {
            console.log(`[AnimesUltra] resolveStream filtered all, returning ${resolvable.length} streams from known hosts`);
            return resolvable;
        }
        console.log(`[AnimesUltra] No resolvable streams (all ${streams.length} from unresolvable hosts)`);
        return [];
    }

    console.log(`[AnimesUltra] Total valid streams found: ${validStreams.length}`);
    
    return sortStreamsByLanguage(validStreams);
}
