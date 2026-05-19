import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, safeFetch } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://on.jetanimes.com";

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
        const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`, { timeout: 10000 });
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
        return j && j.embed_url ? j.embed_url : null;
    } catch (e) {
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
    console.log(`[JetAnimes] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);

    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];

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
        if (candidates.length >= 5) break;
    }

    let matches = [];
    for (const t of candidates) {
        matches = await searchAnime(t);
        if (matches.length > 0 && matches[0].score >= 30) break;
    }

    if (matches.length === 0) return [];

    const isMovie = mediaType === 'movie';

    for (const match of matches) {
        if (isMovie && !match.isMovie) continue;
        if (!isMovie && match.isMovie) continue;

        try {
            const html = await fetchText(match.url);
            const $ = cheerio.load(html);
            const langName = detectLang(html);
            const postId = getPostId($);

            if (isMovie) {
                if (!postId) continue;
                for (let n = 1; n <= 3; n++) {
                    const embedUrl = await fetchEmbed(postId, n, 'movie', match.url);
                    if (!embedUrl) continue;
                    const resolved = await resolveStream({
                        name: 'JetAnimes', title: langName, url: embedUrl,
                        quality: 'HD', headers: { Referer: BASE_URL }
                    });
                    if (resolved && resolved.isDirect) return [resolved];
                }
            } else {
                const targetSeason = Number(season) || 1;
                const targetEpisode = Number(episode) || 1;
                let epLink = null;

                $('.episodios li').each((_, el) => {
                    const $el = $(el);
                    const parsed = parseNumerando($('.numerando', $el).text().trim());
                    if (parsed && parsed.season === targetSeason && parsed.episode === targetEpisode) {
                        const href = $('.episodiotitle a', $el).attr('href');
                        if (href) epLink = href.startsWith('http') ? href : BASE_URL + href;
                    }
                });

                if (!epLink) continue;

                const epHtml = await fetchText(epLink);
                const $ep = cheerio.load(epHtml);
                const epPostId = getPostId($ep);

                if (!epPostId) continue;

                for (let n = 1; n <= 5; n++) {
                    const embedUrl = await fetchEmbed(epPostId, n, 'tv', epLink);
                    if (!embedUrl) continue;
                    const resolved = await resolveStream({
                        name: 'JetAnimes',
                        title: `${langName} - Player ${n}`,
                        url: embedUrl,
                        quality: 'HD',
                        headers: { Referer: BASE_URL }
                    });
                    if (resolved && resolved.isDirect) return [resolved];
                }
            }
        } catch (e) {
            console.error(`[JetAnimes] Error: ${e.message}`);
        }
    }

    return [];
}
