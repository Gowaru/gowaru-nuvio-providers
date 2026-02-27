/**
 * Extractor Logic for Vostfree
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://vostfree.ws";

/**
 * Search for the anime on Vostfree
 */
async function searchAnime(title) {
    try {
        const results = [];
        const seen = new Set();

        const add = (h, t) => {
            if (h && h.length > 10 && t && t.length > 2 && !seen.has(h)) {
                seen.add(h);
                results.push({ title: t, url: h.startsWith('http') ? h : BASE_URL + h });
            }
        };

        // --- Method 1: POST search (returns targeted results) ---
        try {
            const postHtml = await fetchText(`${BASE_URL}/index.php?do=search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': BASE_URL,
                    'Origin': BASE_URL,
                },
                body: `do=search&subaction=search&story=${encodeURIComponent(title)}`
            });
            const $ = cheerio.load(postHtml);
            // POST results: links ending in .htm / .html / numeric slugs
            $('a[href]').each((i, el) => {
                const h = $(el).attr('href') || '';
                const t = $(el).text().trim() || $(el).attr('title') || '';
                if ((h.includes(BASE_URL) || h.startsWith('/')) && t.length > 2 &&
                    !h.includes('/category/') && !h.includes('/page/') && !h.includes('?do=') && !h.includes('#') &&
                    (/\.\w{2,4}$/.test(h) || /\/\d+/.test(h))) {
                    add(h, t);
                }
            });
        } catch (e) { /* POST failed, fall through to GET */ }

        // --- Method 2: GET /?s= (broader search) ---
        if (results.length === 0) {
            const getHtml = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`);
            const $ = cheerio.load(getHtml);
            const selectors = ['.post-title a', '.film-name a', 'h2.title a', 'h3.title a', '.title a'];
            for (const sel of selectors) {
                $(sel).each((i, el) => {
                    const h = $(el).attr('href') || '';
                    const t = $(el).text().trim() || $(el).attr('title') || '';
                    if (h.includes(BASE_URL) && t.length > 2 &&
                        !h.includes('/category/') && !h.includes('/page/')) {
                        add(h, t);
                    }
                });
                if (results.length > 0) break;
            }
        }

        const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '').replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
        const simplifiedTitle = normalize(title);

        console.log(`[Vostfree] Results found: ${results.length}`);

        const matches = results.filter(r => normalize(r.title).includes(simplifiedTitle));

        if (matches.length > 0) {
            console.log(`[Vostfree] Found ${matches.length} matches for "${title}"`);
        }
        return matches;
    } catch (e) {
        console.error(`[Vostfree] Search error: ${e.message}`);
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];

    // Vostfree is French — try romaji/Japanese-derived titles first (Shingeki, not Attack on Titan),
    // then French, then English. Sort: non-ASCII/romaji first, then FR, then EN.
    const titlesOrdered = [...titles].sort((a, b) => {
        const aJp = /[^\x00-\x7F]/.test(a) ? -1 : (/[àâéèêëîïôùûüç'L']/i.test(a) ? 0 : 1);
        const bJp = /[^\x00-\x7F]/.test(b) ? -1 : (/[àâéèêëîïôùûüç'L']/i.test(b) ? 0 : 1);
        return aJp - bJp;
    });

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
        console.warn(`[Vostfree] ArmSync failed: ${e.message}`);
    }
    // ------------------------------------

    let matches = [];
    for (const title of titlesOrdered) {
        matches = await searchAnime(title);
        if (matches && matches.length > 0) break;
    }
    
    if (!matches || matches.length === 0) return [];

    // Prioritize results that match the season if explicitly mentioned
    matches = matches.sort((a, b) => {
        const aT = a.title.toLowerCase();
        const bT = b.title.toLowerCase();
        const sMatch = `saison ${season}`;
        const hasA = aT.includes(sMatch);
        const hasB = bT.includes(sMatch);
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        return 0;
    });

    const streams = [];
    const checkedUrls = new Set();

    for (const match of matches) {
        if (checkedUrls.has(match.url)) continue;
        checkedUrls.add(match.url);

        const matchLower = match.title.toLowerCase();
        const animeUrl = match.url;
        const lang = (match.title.toUpperCase().includes(' VF') || match.url.includes('/vf/')) ? 'VF' : 'VOSTFR';

        // Optimization: if the result is explicitly for a different season, 
        // skip it unless targetEpisodes contains an absolute episode
        const seasonMatch = matchLower.match(/saison\s*(\d+)/);
        if (seasonMatch && parseInt(seasonMatch[1]) !== season && targetEpisodes.length === 1) {
            continue;
        }

        try {
            const html = await fetchText(animeUrl);
            const $ = cheerio.load(html);

            let buttonsId = null;

            $('select.new_player_selector option').each((i, el) => {
                const text = $(el).text().trim();
                for (const ep of targetEpisodes) {
                    const epNum = parseInt(ep, 10);
                    // Vostfree pads ALL numbers to 2+ digits: "Episode 01", "Episode 010"
                    // Extract the numeric part from the option text and compare directly
                    const numMatch = text.match(/[Ee]pisode\s*(0*)(\d+)/i);
                    if (numMatch) {
                        const parsedEp = parseInt(numMatch[1] + numMatch[2], 10);
                        if (parsedEp === epNum) {
                            buttonsId = $(el).val();
                            return false;
                        }
                    }
                }
            });

            if (!buttonsId) {
                console.warn(`[Vostfree] Episode ${episode} not found in selector on ${animeUrl}`);
                continue;
            }

            console.log(`[Vostfree] Using buttons ID: ${buttonsId} for ${lang}`);
            const playerElements = $(`#${buttonsId} div[id^="player_"]`).toArray();

            for (const el of playerElements) {
                const playerId = $(el).attr('id').replace('player_', '');
                const playerName = $(el).text().trim() || "Player";

                const contentDivId = `content_player_${playerId}`;
                const content = $(`#${contentDivId}`).text().trim();

                if (content) {
                    let url = content;
                    if (!url.startsWith('http')) {
                        if (playerName.toLowerCase().includes('sibnet')) {
                            url = `https://video.sibnet.ru/shell.php?videoid=${content}`;
                        } else if (playerName.toLowerCase().includes('vidmoly')) {
                            url = `https://vidmoly.to/embed-${content}.html`;
                        } else if (playerName.toLowerCase().includes('uqload') || playerName.toLowerCase().includes('oneupload')) {
                            url = `https://uqload.com/embed-${content}.html`;
                        } else if (playerName.toLowerCase().includes('sendvid')) {
                            url = `https://sendvid.com/embed/${content}`;
                        } else if (playerName.toLowerCase().includes('voe')) {
                            url = `https://voe.sx/e/${content}`;
                        } else if (playerName.toLowerCase().includes('dood')) {
                            url = `https://dood.to/e/${content}`;
                        } else if (playerName.toLowerCase().includes('stape') || playerName.toLowerCase().includes('streamtape')) {
                            url = `https://streamtape.com/e/${content}`;
                        }
                    }

                    if (url.startsWith('http')) {
                        const stream = await resolveStream({
                            name: `Vostfree (${lang})`,
                            title: `${playerName} - ${lang}`,
                            url: url,
                            quality: "HD",
                            headers: { "Referer": BASE_URL }
                        });
                        if (stream) streams.push(stream);
                    }
                }
            }
        } catch (e) {
            console.error(`[Vostfree] Match handle error: ${e.message}`);
        }
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[Vostfree] Total streams found: ${validStreams.length}`);
    
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
