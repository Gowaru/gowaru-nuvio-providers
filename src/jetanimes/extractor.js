import { stripSeasonSuffix } from '../utils/dle-extractor.js';
import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, safeFetch, isBudgetExhausted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://on.jetanimes.com";
const BUDGET_MS = 40000;

function normalize(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleScore(cardTitle, queryTitle) {
    const q = normalize(queryTitle);
    const t = normalize(cardTitle);
    if (!q || !t) return 0;
    if (t === q || q.includes(t) || t.includes(q)) return 80;
    const qWords = q.split(' ').filter(w => w.length > 1);
    const tWords = new Set(t.split(' '));
    const common = qWords.filter(w => tWords.has(w)).length;
    if (qWords.length === 0) return 0;
    const ratio = common / qWords.length;
    if (ratio >= 0.8) return 60;
    if (ratio >= 0.5) return ratio * 50;
    return 0;
}

async function searchAnime(title) {
    try {
        const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`, { timeout: 6000 });
        const $ = cheerio.load(html);
        const results = [];
        const seen = new Set();

        $('.result-item').each((_, el) => {
            const $a = $('.title a', el).first();
            const href = $a.attr('href');
            const text = $a.text().trim();
            if (href && text && !seen.has(href)) {
                seen.add(href);
                results.push({
                    title: text,
                    url: href.startsWith('http') ? href : BASE_URL + href,
                    isMovie: href.includes('/films/'),
                    score: titleScore(text, title)
                });
            }
        });

        results.sort((a, b) => b.score - a.score);
        return results;
    } catch (e) {
        console.warn(`[JetAnimes] Search failed: ${e?.message}`);
        return [];
    }
}

function parseNumerando(text) {
    const cleaned = text.replace(/[-\u2013\u2014]/g, '-').trim();
    const parts = cleaned.split('-').map(s => parseInt(s.trim(), 10));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { season: parts[0], episode: parts[1] };
    }
    const single = parseInt(cleaned, 10);
    if (!isNaN(single)) return { season: 1, episode: single };
    return null;
}

async function fetchEmbed(postId, nume, type, referer) {
    try {
        const params = new URLSearchParams();
        params.append('action', 'doo_player_ajax');
        params.append('post', postId);
        params.append('nume', String(nume));
        params.append('type', type);

        const sf = await safeFetch(`${BASE_URL}/wp-admin/admin-ajax.php`, {
            method: 'POST',
            body: params.toString(),
            timeout: 8000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Referer': referer,
                'Origin': BASE_URL
            }
        });
        if (!sf) return null;
        const j = await sf.json();
        if (!j || !j.embed_url) return null;
        return j.embed_url;
    } catch (e) {
        console.warn(`[JetAnimes] fetchEmbed failed: ${e?.message}`);
        return null;
    }
}

function detectLang(html) {
    const lower = html.toLowerCase();
    const hasVf = lower.includes('vf') || lower.includes('français') || lower.includes('francais');
    const hasVostfr = lower.includes('vostfr') || lower.includes('vost');
    return hasVf && !hasVostfr ? 'VF' : 'VOSTFR';
}

function getPostId($) {
    const bodyClass = $('body').attr('class') || '';
    const m = bodyClass.match(/postid[-_](\d+)/);
    return m ? m[1] : null;
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const startTime = Date.now();
    console.log(`[JetAnimes] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const seen = new Set();
    const candidates = [];
    // Prioritize French titles
    for (const t of titles) {
        if (/[àâçéèêëîïôûùüÿ]/i.test(t) || /[Ll]['\u2019]/.test(t) || t.toLowerCase().includes(' fr') || t.toLowerCase().includes('vf')) {
            const key = normalize(t);
            if (key && key.length >= 2 && !seen.has(key)) {
                seen.add(key); candidates.push(t);
            }
        }
    }
    // Then try primary English + other unique titles
    for (const t of titles) {
        const key = normalize(t);
        if (!key || key.length < 2 || seen.has(key)) continue;
        seen.add(key);
        candidates.push(t);
            if (candidates.length >= 10) break;
    }

    // Only try the best candidate title — searching is very slow on this site
    const bestCandidate = stripSeasonSuffix(candidates[0]);
    if (!bestCandidate) return [];
    const matches = await searchAnime(bestCandidate);

    if (matches.length === 0 || matches[0].score < 30) return [];

    const isMovie = mediaType === 'movie';

    for (const match of matches) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        if (isMovie && !match.isMovie) continue;
        if (!isMovie && match.isMovie) continue;

        try {
            const html = await fetchText(match.url);
            const $ = cheerio.load(html);
            const langName = detectLang(html);
            const postId = getPostId($);

            if (isMovie) {
                if (!postId) continue;
                const movieResults = await Promise.allSettled(
                    [1, 2, 3].map(n =>
                        fetchEmbed(postId, n, 'movie', match.url).then(embedUrl => {
                            if (!embedUrl) return null;
                            return resolveStream({
                                name: 'JetAnimes', title: langName, url: embedUrl,
                                quality: 'HD', headers: { Referer: BASE_URL }
                            });
                        })
                    )
                );
                for (const r of movieResults) {
                    if (r.status === 'fulfilled' && r.value && r.value.isDirect) return [r.value];
                }
            } else {
                const targetSeason = Number(effectiveSeason) || 1;
                const targetEpisode = Number(episode) || 1;
                let epLink = null;

                $('.episodios li').each((_, el) => {
                    const $el = $(el);
                    const numerandoText = $('.numerando', $el).text().trim();
                    const parsed = parseNumerando(numerandoText);
                    if (!parsed) return;
                    const href = $('.episodiotitle a', $el).attr('href');
                    if (!href) return;
                    if (parsed.season === targetSeason && parsed.episode === targetEpisode) {
                        epLink = href.startsWith('http') ? href : BASE_URL + href;
                        return false;
                    }
                    if (!epLink && parsed.season === targetSeason) {
                        const rm = numerandoText.match(/^(\d+)\s*[-–]\s*(\d+)$/);
                        if (rm) {
                            const rangeStart = parseInt(rm[1], 10);
                            const rangeEnd = parseInt(rm[2], 10);
                            if (targetEpisode >= rangeStart && targetEpisode <= rangeEnd) {
                                epLink = href.startsWith('http') ? href : BASE_URL + href;
                            }
                        }
                    }
                });

                if (!epLink) continue;

                const epHtml = await fetchText(epLink);
                const $ep = cheerio.load(epHtml);
                const epPostId = getPostId($ep);

                if (!epPostId) continue;

                const tvResults = await Promise.allSettled(
                    [1, 2].map(n =>
                        fetchEmbed(epPostId, n, 'tv', epLink).then(embedUrl => {
                            if (!embedUrl) return null;
                            return resolveStream({
                                name: 'JetAnimes',
                                title: `${langName} - Player ${n}`,
                                url: embedUrl,
                                quality: 'HD',
                                headers: { Referer: BASE_URL }
                            });
                        })
                    )
                );
                for (const r of tvResults) {
                    if (r.status === 'fulfilled' && r.value && r.value.isDirect) return [r.value];
                }
            }
        } catch (e) {
            console.error(`[JetAnimes] Error: ${e.message}`);
        }
    }

    return [];
}
