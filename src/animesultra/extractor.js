import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, safeFetch } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://ww.animesultra.org";

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
    if (extra > 0) score -= Math.min(extra * 40, 80);
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
];

function detectSeason(title, url) {
    for (const pat of SEASON_PATTERNS) {
        const m = title.match(pat);
        if (m) {
            if (pat === SEASON_PATTERNS[1]) return 'final';
            return parseInt(m[1], 10);
        }
    }
    const urlSeason = url.match(/saison[-\s]*(\d+)/i)?.[1];
    if (urlSeason) return parseInt(urlSeason, 10);
    const numEnd = title.match(/(?:^|\s)(\d{1,2})\s*(?:vf|vostfr)?\s*$/i);
    if (numEnd) {
        const v = parseInt(numEnd[1], 10);
        if (v >= 1 && v <= 30) return v;
    }
    return null;
}

async function searchAnime(title) {
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

        return results.sort((a, b) => b.score - a.score);
    } catch (e) {
        console.error(`[AnimesUltra] Search error: ${e.message}`);
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];

    const titlesOrdered = [...titles].sort((a, b) => {
        const score = t => /[àâéèêëîïôùûüç]/i.test(t) ? 0 : (/[\x20-\x7F]/.test(t) ? 1 : 2);
        return score(a) - score(b);
    });

    const epNum = episode || 1;
    let targetEpisodes = [epNum];
    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId && season) {
            const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, epNum);
            if (absoluteEpisode && absoluteEpisode !== epNum) {
                targetEpisodes.push(absoluteEpisode);
            }
        }
    } catch (e) {
        console.warn(`[AnimesUltra] ArmSync failed: ${e.message}`);
    }

    let matches = [];
    const seenIds = new Set();

    const trySearch = async (title) => {
        if (title.length > 60) return;
        const results = await searchAnime(title);
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

    const firstTitle = titlesOrdered[0];

    if (firstTitle) await trySearch(firstTitle);

    // Find French titles (contain French accented characters or start with L')
    const frenchTitles = titlesOrdered.filter(t => 
        t !== firstTitle && t.length < 60 && 
        (/^L['\u2019]/i.test(t.trim()) || /[àâéèêëîïôùûüç]/i.test(t))
    );

    for (const ft of frenchTitles) {
        if (matches.length > 8) break;
        await trySearch(ft);
    }

    for (const title of titlesOrdered) {
        if (matches.length > 8) break;
        if (title === firstTitle || frenchTitles.includes(title)) continue;
        if (title.length > 50) continue;
        await trySearch(title);
    }
    
    if (!matches || matches.length === 0) return [];

    matches.sort((a, b) => {
        const aIsVostfr = detectLang(a.title) === 'vostfr' || a.title.toLowerCase().includes('vostfr');
        const bIsVostfr = detectLang(b.title) === 'vostfr' || b.title.toLowerCase().includes('vostfr');
        if (aIsVostfr && !bIsVostfr) return -1;
        if (!aIsVostfr && bIsVostfr) return 1;
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
        if (!url || seenStreamUrls.has(url)) return;
        seenStreamUrls.add(url);
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
        const epRes = await safeFetch(epHref, { headers: { "User-Agent": "Mozilla/5.0" }});
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

    for (const match of matches) {
        if (!match.url) continue;
        if (processedCount >= 6) break;

        let lang = "VOSTFR";
        if (detectLang(match.title) === 'vf') lang = "VF";

        const matchSeasonNum = detectSeason(match.title, match.url);
        if (season && matchSeasonNum != null) {
            if (matchSeasonNum === 'final' && season < 6) continue;
            if (typeof matchSeasonNum === 'number' && matchSeasonNum !== season) continue;
        }

        try {
            const newsIdMatch = match.url.match(/\/(\d+)-/);
            if (!newsIdMatch) continue;
            const newsId = newsIdMatch[1];
            
            const html = await getFullStory(newsId);
            
            if (!html) {
                console.log(`[AnimesUltra DEBUG] getFullStory(${newsId}) returned null`);
                continue;
            }
            
            const $ = cheerio.load(html);

            const epHrefs = [];
            $('.ep-item').each((i, el) => {
                const epNum = $(el).attr('data-number');
                if (epNum && targetEpisodes.map(e => parseInt(e, 10)).includes(parseInt(epNum, 10))) {
                    const href = $(el).attr('href');
                    if (href) epHrefs.push(href);
                }
            });

            console.log(`[AnimesUltra DEBUG] match=${newsId} title="${match.title}" epHrefs=${epHrefs.length} targetEps=[${targetEpisodes}]`);
            if (epHrefs.length === 0) {
                const avail = [];
                $('.ep-item').each((i, el) => {
                    const epNum = $(el).attr('data-number');
                    if (epNum) avail.push(epNum);
                });
                console.log(`[AnimesUltra DEBUG] available data-numbers: [${avail.slice(0,5).join(',')}${avail.length > 5 ? '...' : ''}] (${avail.length} total)`);
                continue;
            }

            processedCount++;

            for (const epHref of epHrefs) {
                const servers = await fetchEpisodeServers(epHref, $, lang);
                for (const { url, sname } of servers) {
                    pushStream(url, lang, sname);
                }
            }
        } catch (e) {
            console.error(`[AnimesUltra] Extract error: ${e.message}`);
        }
    }

    if (streams.length === 0 && season && matches.length > 1) {
        const seasonParts = [];
        for (const m of matches) {
            const sNum = detectSeason(m.title, m.url);
            const pNum = parseInt(m.title.match(/(?:partie|part)\s*(\d+)/i)?.[1], 10);
            if (sNum === season) {
                const nId = m.url.match(/\/(\d+)-/)?.[1];
                if (nId) {
                    const html = await getFullStory(nId);
                    if (html) {
                        const $c = cheerio.load(html);
                        const count = $c('.ep-item').length;
                        seasonParts.push({ match: m, newsId: nId, partNum: pNum || 1, episodeCount: count, html });
                    }
                }
            }
        }
        seasonParts.sort((a, b) => a.partNum - b.partNum);
        let cumOffset = 0;
        for (const sp of seasonParts) {
            const $c = cheerio.load(sp.html);
            const epHrefs = [];
            $c('.ep-item').each((i, el) => {
                const epDataNum = parseInt($c(el).attr('data-number'), 10);
                if (epDataNum) {
                    for (const tgt of targetEpisodes) {
                        const adjusted = tgt - cumOffset;
                        if (adjusted === epDataNum) {
                            const href = $c(el).attr('href');
                            if (href) epHrefs.push(href);
                        }
                    }
                }
            });
            if (epHrefs.length > 0) {
                let lang = "VOSTFR";
                if (detectLang(sp.match.title) === 'vf') lang = "VF";
                for (const epHref of epHrefs) {
                    const servers = await fetchEpisodeServers(epHref, $c, lang);
                    for (const { url, sname } of servers) {
                        pushStream(url, lang, sname);
                    }
                }
                break;
            }
            cumOffset += sp.episodeCount;
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

    // Fallback: if resolveStream filtered everything, return original streams
    if (validStreams.length === 0 && streams.length > 0) {
        console.log(`[AnimesUltra] resolveStream filtered all ${streams.length} streams, returning originals`);
        return streams;
    }

    console.log(`[AnimesUltra] Total valid streams found: ${validStreams.length}`);
    
    // Sort streams to prioritize VF (French) over VOSTFR
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
