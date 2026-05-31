import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://french-anime.com";
const SPINOFF_KEYWORDS = ['fan letter', 'log:', 'memories', 'vigilante', 'illegals', 'film', 'movie', 'special', 'oav', 'ona'];
function normalize(s) {
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[-':!.,?()[\]]/g, ' ').replace(/\b(the|vostfr|vost?|vf|french|streaming|anime)\s+/g, '')
        .replace(/\s+/g, ' ').trim();
}

function isSpinoff(title) {
    const t = title.toLowerCase();
    return SPINOFF_KEYWORDS.some(k => t.includes(k));
}

async function searchAnime(title) {
    try {
        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl);

        const $ = cheerio.load(html);
        const results = [];

        const selectors = ['a.mov-t', '.mov-t a', '.title a', 'h2 a', 'h3 a', '.short-story a'];
        const seen = new Set();
        for (const sel of selectors) {
            $(sel).each((i, el) => {
                const h = $(el).attr('href');
                const t = $(el).text().trim();
                if (h && h.includes('french-anime.com') && h.includes('.html') && t.length > 2 && !seen.has(h)) {
                    seen.add(h);
                    results.push({ title: t, url: h });
                }
            });
            if (results.length > 0) break;
        }
        if (results.length === 0) {
            $('a[href*="french-anime.com"][href*=".html"]').each((i, el) => {
                const h = $(el).attr('href');
                const t = $(el).text().trim();
                if (h && t.length > 2 && !seen.has(h)) {
                    seen.add(h);
                    results.push({ title: t, url: h });
                }
            });
        }

        const nt = normalize(title);
        const matches = results.filter(r => {
            const nr = normalize(r.title);
            return nr.includes(nt) || nt.includes(nr);
        });

        console.log(`[French-Anime] Search for "${title}": ${results.length} results, ${matches.length} matches`);
        for (const r of results) {
            console.log(`[French-Anime]   Result: "${r.title}" -> ${r.url}`);
        }
        for (const r of matches) {
            console.log(`[French-Anime]   Matched: "${r.title}" -> ${r.url}`);
        }
        return matches;
    } catch (e) {
        console.error(`[French-Anime] Search error: ${e.message}`);
        return [];
    }
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
    return 'Player';
}

function detectPageLang(url) {
    return (url.includes('animes-vf/') || url.toLowerCase().includes('french'))
        ? 'VF'
        : 'VOSTFR';
}

function detectSeasonFromUrl(url) {
    const m = url.match(/saison[-_]?(\d+)/i);
    if (m) return parseInt(m[1]);
    return null;
}

function parseEpisodeData(html, targetEpisode) {
    const streams = [];
    const regex = /(\d+)!((?:(?:https?:)?\/\/[^,<\s]+)(?:,(?:(?:https?:)?\/\/[^,<\s]+))*(?:,|(?=<|\s|$)))/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
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

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const titlesOrdered = [...titles].sort((a, b) => {
        const aFr = /[àâéèêëîïôùûüç']/i.test(a) ? -1 : 1;
        const bFr = /[àâéèêëîïôùûüç']/i.test(b) ? -1 : 1;
        return aFr - bFr;
    });

    let targetEpisodes = mediaType === 'movie' ? [-1] : [episode];
    if (mediaType !== 'movie') {
        try {
            const imdbId = await getImdbId(tmdbId, mediaType);
            if (imdbId) {
                const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
                if (absoluteEpisode && absoluteEpisode !== episode) {
                    targetEpisodes.push(absoluteEpisode);
                }
            }
        } catch (e) {
            console.warn(`[French-Anime] ArmSync failed: ${e.message}`);
        }
    }

    // Build search queries from titles: use the title itself and try sub-terms
    const searchQueries = [];
    for (const t of titlesOrdered.slice(0, 2)) {
        searchQueries.push(t);
        // Strip hyphens and try again (french-anime titles rarely have them)
        const noHyphen = t.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
        if (noHyphen !== t && noHyphen.length > 3) searchQueries.push(noHyphen);
        // Try with just the most significant last 1-2 words
        const words = t.split(/[\s-]+/).filter(w => w.length >= 3);
        if (words.length > 1) {
            const subQuery = words.slice(-2).join(' ');
            if (subQuery.length >= 5) searchQueries.push(subQuery);
            // Also try just the last word if it's distinctive enough
            if (words.length >= 2 && words[words.length-1].length >= 4) {
                searchQueries.push(words[words.length-1]);
            }
        }
        // Try without leading article-like words
        const cleaned = t.replace(/^(the|one|le|la|les|un|une)\s+/i, '');
        if (cleaned !== t && cleaned.length > 5) searchQueries.push(cleaned);
    }

    let matches = [];
    const searchResults = await Promise.allSettled(
        [...new Set(searchQueries)].map(q => searchAnime(q))
    );
    for (const r of searchResults) {
        if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
            matches = r.value;
            // Break only if we have actual matches against the search title, not just raw results
            // (Some queries like \"One-Punch Man\" return irrelevant results)
            const nt = normalize(titlesOrdered[0]);
            const hasMatch = matches.some(m => {
                const nr = normalize(m.title);
                return nr.includes(nt) || nt.includes(nr);
            });
            if (hasMatch) break;
        }
    }

    if (!matches || matches.length === 0) {
        console.log(`[French-Anime] No search matches found for any query`);
        return [];
    }

    const mainMatches = matches.filter(m => !isSpinoff(m.title));
    const usedMatches = mainMatches.length > 0 ? mainMatches : matches;

    const scored = usedMatches.map(m => {
        let score = 0;
        const detectedSeason = detectSeasonFromUrl(m.url) || detectSeasonFromUrl(m.title);

        if (mediaType !== 'movie') {
            if (detectedSeason === effectiveSeason) score += 100;
            else if (detectedSeason !== null) score -= 50;
        }

        if (m.url.includes('/animes-vf/')) score += 20;
        if (m.url.includes('/animes-vostfr/')) score += 15;

        const lang = detectPageLang(m.url);

        return { ...m, score, detectedSeason, lang };
    });

    scored.sort((a, b) => b.score - a.score);

    const streams = [];
    const seenUrls = new Set();
    // Try more pages to find resolvable hosts (some pages use getvid.club which is not resolvable in QuickJS)
    const MAX_PAGES = 4;

    const uniqueMatches = [];
    const matchUrls = new Set();
    for (const m of scored) {
        if (matchUrls.has(m.url)) continue;
        matchUrls.add(m.url);
        if (m.detectedSeason !== null && m.detectedSeason !== effectiveSeason) continue;
        uniqueMatches.push(m);
        if (uniqueMatches.length >= MAX_PAGES) break;
    }

    // Known slow hosts to skip entirely (up4fun takes 30-60s and always times out on TV)
    const SLOW_HOSTS = ['up4fun.', 'vvide0.'];
    function isSlowHost(url) {
        const u = url.toLowerCase();
        return SLOW_HOSTS.some(h => u.includes(h));
    }

    // Score URLs by expected speed: direct mp4/m3u8 first, then known fast hosts
    function urlSpeedPriority(url) {
        const u = url.toLowerCase();
        if (u.includes('.mp4')) return 0;
        if (u.includes('.m3u8') || u.includes('/hls/')) return 1;
        if (u.includes('sendvid') || u.includes('sibnet')) return 2;
        if (u.includes('uqload') || u.includes('voe') || u.includes('streamtape')) return 3;
        if (u.includes('vidmoly') || u.includes('myvi') || u.includes('lulu')) return 4;
        if (u.includes('dood') || u.includes('netu')) return 5;
        return 6;
    }

    const matchPromises = uniqueMatches.map(async (match) => {
        try {
            const html = await fetchText(match.url);

            const allPlayerUrls = [];
            for (const ep of targetEpisodes) {
                const playerUrls = parseEpisodeData(html, ep);
                allPlayerUrls.push(...playerUrls);
            }

            if (allPlayerUrls.length === 0) {
                console.log(`[French-Anime] ${match.url}: no episode data for target ${targetEpisodes}`);
                // Debug: check if the page has any NUMBER!URL patterns
                const hasPattern = /\d+!https?:/.test(html);
                const episodeCount = (html.match(/\d+!https?:/g) || []).length;
                console.log(`[French-Anime]   Page has episode pattern: ${hasPattern}, count: ${episodeCount}`);
                // Show first episode match
                const firstEp = html.match(/(\d+)!(https?:[^,\s<]+)/);
                if (firstEp) console.log(`[French-Anime]   First ep found: ${firstEp[1]}: ${firstEp[2].slice(0,60)}`);
                return [];
            }

            const langLabel = match.lang || detectPageLang(match.url);

            // Filter slow hosts (up4fun) and prioritize remaining URLs by speed
            const filteredUrls = allPlayerUrls.filter(u => !isSlowHost(u));
            const skippedCount = allPlayerUrls.length - filteredUrls.length;
            if (skippedCount > 0) {
                console.log(`[French-Anime] Skipped ${skippedCount} slow host URLs`);
            }

            // Sort by speed and take max 2 per page to spread across more pages
            filteredUrls.sort((a, b) => urlSpeedPriority(a) - urlSpeedPriority(b));
            const limitedUrls = filteredUrls.slice(0, 2);

            const hostPromises = limitedUrls.map(async (url) => {
                if (seenUrls.has(url)) return null;
                seenUrls.add(url);

                const playerName = getPlayerName(url);
                try {
                    return await resolveStream({
                        name: `French-Anime (${langLabel})`,
                        title: `${playerName} - ${langLabel}`,
                        url: url,
                        quality: "HD",
                        headers: { "Referer": BASE_URL }
                    });
                } catch (e) {
                    return null;
                }
            });

            const results = await Promise.all(hostPromises);
            const matchStreams = [];
            for (let i = 0; i < results.length; i++) {
                const stream = results[i];
                const originalUrl = limitedUrls[i];
                if (stream) {
                    console.log(`[French-Anime]   Resolved: ${(originalUrl||'').slice(0,60)} -> isDirect:${stream.isDirect} url:${(stream.url||'').slice(0,60)}`);
                    if (stream.isDirect) {
                        matchStreams.push(stream);
                    }
                } else {
                    console.log(`[French-Anime]   Resolved: ${(originalUrl||'').slice(0,60)} -> null`);
                }
            }

            console.log(`[French-Anime] ${match.url}: ${allPlayerUrls.length} sources, ${limitedUrls.length} tried, ${matchStreams.length} direct`);
            return matchStreams;
        } catch (err) {
            console.error(`[French-Anime] Failed to fetch ${match.url}: ${err.message}`);
            return [];
        }
    });

    const results = await Promise.allSettled(matchPromises);
    for (const r of results) {
        if (r.status === 'fulfilled') {
            streams.push(...r.value);
        }
    }

    streams.sort((a, b) => {
        const isVf = (str) => str && (str.toUpperCase().includes('VF') || str.toUpperCase().includes('FRENCH'));
        const aIsVf = isVf(a.name) || isVf(a.title);
        const bIsVf = isVf(b.name) || isVf(b.title);
        if (aIsVf && !bIsVf) return -1;
        if (!aIsVf && bIsVf) return 1;
        return 0;
    });

    console.log(`[French-Anime] Scored matches (top 3): ${scored.slice(0,3).map(m => `{title:"${m.title}",score:${m.score},season:${m.detectedSeason}}`).join(', ')}`);
    console.log(`[French-Anime] Unique matches selected: ${uniqueMatches.map(m => `"${m.title}"`).join(', ')}`);
    console.log(`[French-Anime] Total streams found: ${streams.length}`);
    return streams;
}
