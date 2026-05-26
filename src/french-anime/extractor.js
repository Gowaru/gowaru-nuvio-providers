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
        .replace(/[':!.,?()[\]]/g, '').replace(/\b(the|vostfr|vost?|vf|french|streaming|anime)\s+/g, '')
        .replace(/\s+/g, ' ').trim();
}

function isSpinoff(title) {
    const t = title.toLowerCase();
    return SPINOFF_KEYWORDS.some(k => t.includes(k));
}

async function searchAnime(title) {
    try {
        const formData = `do=search&subaction=search&story=${encodeURIComponent(title)}`;
        const html = await fetchText(`${BASE_URL}/index.php?do=search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': BASE_URL
            },
            body: formData
        });

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

    let matches = [];
    for (const title of titlesOrdered) {
        matches = await searchAnime(title);
        if (matches && matches.length > 0) break;
    }

    if (!matches || matches.length === 0) return [];

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
        if (m.url.includes('/exclue/')) score -= 20;
        if (m.url.includes('/films-') && mediaType !== 'movie') score -= 15;

        const lang = detectPageLang(m.url);

        return { ...m, score, detectedSeason, lang };
    });

    scored.sort((a, b) => b.score - a.score);

    const streams = [];
    const seenUrls = new Set();
    const pagesChecked = new Set();
    let pagesCheckedCount = 0;
    const MAX_PAGES = 4;

    for (const match of scored) {
        if (pagesChecked.has(match.url)) continue;
        pagesChecked.add(match.url);

            if (match.detectedSeason !== null && match.detectedSeason !== effectiveSeason) {
            continue;
        }

        if (pagesCheckedCount >= MAX_PAGES) break;
        pagesCheckedCount++;

        try {
            const html = await fetchText(match.url);

            const allPlayerUrls = [];
            for (const ep of targetEpisodes) {
                const playerUrls = parseEpisodeData(html, ep);
                allPlayerUrls.push(...playerUrls);
            }

            if (allPlayerUrls.length === 0) {
                console.log(`[French-Anime] ${match.url}: no episode data for target ${targetEpisodes}`);
                continue;
            }

            const langLabel = match.lang || detectPageLang(match.url);

            const hostPromises = allPlayerUrls.map(async (url) => {
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
            let found = 0;
            for (const stream of results) {
                if (stream && stream.isDirect) {
                    streams.push(stream);
                    found++;
                }
            }

            console.log(`[French-Anime] ${match.url}: ${allPlayerUrls.length} sources, ${found} direct`);
        } catch (err) {
            console.error(`[French-Anime] Failed to fetch ${match.url}: ${err.message}`);
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

    console.log(`[French-Anime] Total streams found: ${streams.length}`);
    return streams;
}
