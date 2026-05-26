/**
 * Extractor Logic for Vostfree
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://vostfree.ws";
const MAX_SEARCH_TITLES = 20;

function normalize(s) {
    if (!s) return '';
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '').replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
}

function getSeasonNumber(text) {
    const combined = text.toLowerCase().replace(/-/g, ' ');
    // Pattern 1: explicit "saison N"
    let m = combined.match(/\bsaison\s*(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    // Pattern 2: URL-style "s N" or title "N VOSTFR/VF/FRENCH"
    m = combined.match(/\bs\s*(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    // Pattern 3: bare number before language/type keywords (in title)
    m = combined.match(/\b(\d+)\s*(?:vostfr|vf|french|ddl|streaming)\b/);
    if (m) return parseInt(m[1], 10);
    return null;
}

function titleMatches(resultTitle, searchTitle) {
    const nResult = normalize(resultTitle);
    const nSearch = normalize(searchTitle);
    if (!nResult || !nSearch) return false;
    if (nResult.includes(nSearch)) return true;
    const searchWords = nSearch.split(/\s+/).filter(w => w.length > 2);
    if (searchWords.length === 0) return false;
    const matched = searchWords.filter(w => nResult.includes(w));
    return matched.length >= Math.min(searchWords.length, 2);
}

/**
 * Search for the anime on Vostfree
 * Returns array of { title, url, genre? }
 */
async function searchAnime(title) {
    try {
        const results = [];
        const seen = new Set();

        const add = (h, t, genre) => {
            if (h && h.length > 10 && t && t.length > 2 && !seen.has(h)) {
                seen.add(h);
                const r = { title: t, url: h.startsWith('http') ? h : BASE_URL + h };
                if (genre) r.genre = genre;
                results.push(r);
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
            $('.search-result').each((i, block) => {
                const link = $(block).find('.title a');
                const h = link.attr('href') || '';
                const t = link.text().trim() || link.attr('title') || '';
                const genre = $(block).find('.genre').text().trim().toUpperCase();
                if (h && t && (h.includes(BASE_URL) || h.startsWith('/')) && t.length > 2) {
                    add(h, t, genre || undefined);
                }
            });
        } catch (e) { /* POST failed, fall through to GET */ }

        // --- Method 2: GET /?s= (broader search, disabled for performance) ---
        // if (results.length === 0) { ... }

        console.log(`[Vostfree] Results found: ${results.length}`);

        const matches = results.filter(r => titleMatches(r.title, title));

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
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    // Vostfree is French — try romaji/Japanese-derived titles first (Shingeki, not Attack on Titan),
    // then French, then English. Sort: non-ASCII/romaji first, then FR, then EN.
    const titlesOrdered = [...titles].sort((a, b) => {
        const aJp = /[^\x00-\x7F]/.test(a) ? -1 : (/[àâéèêëîïôùûüç'L']/i.test(a) ? 0 : 1);
        const bJp = /[^\x00-\x7F]/.test(b) ? -1 : (/[àâéèêëîïôùûüç'L']/i.test(b) ? 0 : 1);
        return aJp - bJp;
    });

    // --- ARMSYNC Metadata Resolution ---
    let targetEpisodes = episode !== undefined && episode !== null ? [episode] : [];
    if (mediaType === 'tv' && targetEpisodes.length > 0) {
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
    }
    // ------------------------------------

    let allMatches = [];
    const seenUrls = new Set();
    const searchedNormalized = new Set();
    for (const title of titlesOrdered.slice(0, MAX_SEARCH_TITLES)) {
        // Skip very long or non-descriptive titles (> 60 chars unlikely to match on VostFree)
        if (title.length > 60) continue;
        // Deduplicate by normalized form (avoids searching similar variants)
        const n = normalize(title);
        if (!n || searchedNormalized.has(n)) continue;
        searchedNormalized.add(n);
        const batch = await searchAnime(title);
        if (batch && batch.length > 0) {
            for (const m of batch) {
                if (!seenUrls.has(m.url)) {
                    seenUrls.add(m.url);
                    allMatches.push(m);
                }
            }
        }
    }
    
    // Fallback: if no match for the target season was found, try appending "Saison N"
    if (mediaType === 'tv' && season !== undefined && season !== null) {
        const hasSeasonMatch = allMatches.some(m => getSeasonNumber(m.title + ' ' + m.url) === season);
        if (!hasSeasonMatch) {
            for (const title of titlesOrdered.slice(0, MAX_SEARCH_TITLES)) {
                if (title.length > 60) continue;
                const seasonQuery = `${title} Saison ${season}`;
                const n = normalize(seasonQuery);
                if (!n || searchedNormalized.has(n)) continue;
                searchedNormalized.add(n);
                const batch = await searchAnime(seasonQuery);
                if (batch && batch.length > 0) {
                    for (const m of batch) {
                        if (!seenUrls.has(m.url)) {
                            seenUrls.add(m.url);
                            const mSn = getSeasonNumber(m.title + ' ' + m.url);
                            if (mSn === null || mSn === season) {
                                allMatches.push(m);
                            }
                        }
                    }
                    break;
                }
            }
        }
    }
    
    if (allMatches.length === 0) return [];

    // Prioritize results that match the season if explicitly mentioned
    if (mediaType === 'tv' && season !== undefined && season !== null) {
        allMatches = allMatches.sort((a, b) => {
            const aSn = getSeasonNumber(a.title + ' ' + a.url);
            const bSn = getSeasonNumber(b.title + ' ' + b.url);
            const hasA = aSn === season;
            const hasB = bSn === season;
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            return 0;
        });
    }

    const streams = [];
    const checkedUrls = new Set();
    const MAX_MATCHES_TO_PROCESS = 5;
    let processedCount = 0;

    for (const match of allMatches) {
        if (checkedUrls.has(match.url)) continue;
        checkedUrls.add(match.url);
        if (processedCount >= MAX_MATCHES_TO_PROCESS) break;

        const matchLower = match.title.toLowerCase();
        const matchUrlLower = match.url.toLowerCase();
        const animeUrl = match.url;
        const lang = (match.title.toUpperCase().includes(' VF') || match.url.includes('/vf/')) ? 'VF' : 'VOSTFR';

        // Skip OAV/OVA/FILM/Movie/Special results for TV series (non-film entries)
        if (mediaType === 'tv') {
            const skipKeywords = /\b(oav|ova|film|movie)\b/;
            if (match.genre === 'FILM' || match.genre === 'OAV' ||
                skipKeywords.test(matchLower) || skipKeywords.test(matchUrlLower)) {
                continue;
            }
        }

        // Skip results explicitly for a different season, unless no match has the target season
        if (mediaType === 'tv' && season !== undefined && season !== null) {
            const matchSn = getSeasonNumber(match.title + ' ' + match.url);
            if (matchSn !== null && matchSn !== season) {
                const hasCorrectSeason = allMatches.some(m => {
                    const sn = getSeasonNumber(m.title + ' ' + m.url);
                    return sn !== null && sn === season;
                });
                if (hasCorrectSeason) continue;
            }
        }

        processedCount++;
        try {
            const html = await fetchText(animeUrl);
            const $ = cheerio.load(html);

            let buttonsId = null;

            // Movies: no episode selector, use default buttons_1
            if (mediaType === 'movie') {
                buttonsId = 'buttons_1';
            } else {
                // TV: find episode in selector
                $('select.new_player_selector option').each((i, el) => {
                    const text = $(el).text().trim();
                    for (const ep of targetEpisodes) {
                        const epNum = parseInt(ep, 10);
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

                // Fallback: if selector exists but empty (single-episode page), use buttons_1
                if (!buttonsId) {
                    const hasSelector = $('select.new_player_selector').length > 0;
                    if (hasSelector) {
                        console.warn(`[Vostfree] Episode ${episode} not found in selector on ${animeUrl}`);
                        continue;
                    }
                }
            }

            if (!buttonsId) {
                buttonsId = 'buttons_1';
            }

            console.log(`[Vostfree] Using buttons ID: ${buttonsId} for ${lang}`);
            const playerElements = $(`#${buttonsId} div[id^="player_"]`).toArray();

            const playerPromises = playerElements.map(async (el) => {
                const playerId = $(el).attr('id').replace('player_', '');
                const playerName = $(el).text().trim() || "Player";
                const elClass = ($(el).attr('class') || '').toLowerCase();

                const contentDivId = `content_player_${playerId}`;
                const content = $(`#${contentDivId}`).text().trim();

                if (content) {
                    let url = content;
                    if (!url.startsWith('http')) {
                        if (elClass.includes('sibnet') || playerName.toLowerCase().includes('sibnet')) {
                            url = `https://video.sibnet.ru/shell.php?videoid=${content}`;
                        } else if (elClass.includes('vidmoly') || playerName.toLowerCase().includes('vidmoly')) {
                            url = `https://vidmoly.to/embed-${content}.html`;
                        } else if (elClass.includes('uqload') || elClass.includes('oneupload') || playerName.toLowerCase().includes('uqload') || playerName.toLowerCase().includes('oneupload')) {
                            url = `https://uqload.com/embed-${content}.html`;
                        } else if (elClass.includes('sendvid') || playerName.toLowerCase().includes('sendvid')) {
                            url = `https://sendvid.com/embed/${content}`;
                        } else if (elClass.includes('voe') || playerName.toLowerCase().includes('voe')) {
                            url = `https://voe.sx/e/${content}`;
                        } else if (elClass.includes('dood') || playerName.toLowerCase().includes('dood')) {
                            url = `https://dood.to/e/${content}`;
                        } else if (elClass.includes('stape') || elClass.includes('streamtape') || playerName.toLowerCase().includes('stape') || playerName.toLowerCase().includes('streamtape')) {
                            url = `https://streamtape.com/e/${content}`;
                        } else if (elClass.includes('myvi') || elClass.includes('mytv') || playerName.toLowerCase().includes('myvi') || playerName.toLowerCase().includes('mytv')) {
                            url = `https://www.myvi.ru/embed/${content}`;
                        } else if (elClass.includes('vip')) {
                            // VIP class can be VOE or Vudeo — content already has full URL or needs passing through
                            if (content.includes('voe.sx') || content.includes('vudeo')) {
                                url = content;
                            }
                        } else if (elClass.includes('mail') || elClass.includes('ok')) {
                            // Mail.ru or OK.ru — pass as-is to resolver
                        }
                    }

                    if (url.startsWith('http')) {
                        try {
                            const stream = await resolveStream({
                                name: `Vostfree (${lang})`,
                                title: `${playerName} - ${lang}`,
                                url: url,
                                quality: "HD",
                                headers: { "Referer": BASE_URL }
                            });
                            return stream;
                        } catch(e) { return null; }
                    }
                }
                return null;
            });

            const results = await Promise.all(playerPromises);
            for (const stream of results) {
                if (stream) streams.push(stream);
            }
            const directStreams = streams.filter(s => s && s.isDirect);
            if (directStreams.length > 0) {
                const matchSn = getSeasonNumber(match.title + ' ' + match.url);
                const isExplicitlyWrong = matchSn !== null && matchSn !== season;
                if (!isExplicitlyWrong) {
                    console.log(`[Vostfree] Found ${directStreams.length} direct streams from ${animeUrl}, stopping early`);
                    break;
                } else {
                    console.log(`[Vostfree] Found ${directStreams.length} direct streams but match season ${matchSn} != target ${season}, continuing search`);
                }
            }
        } catch (e) {
            console.error(`[Vostfree] Match handle error: ${e.message}`);
        }
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[Vostfree] Total streams found: ${validStreams.length}`);

    const cleaned = validStreams.map(s => ({
        name: s.name || 'Vostfree',
        title: s.title || 'Stream',
        url: s.url || '',
        quality: s.quality || 'HD',
        isDirect: true,
        headers: s.headers || {}
    }));
    
    // Sort streams to prioritize VF (French) over VOSTFR
    cleaned.sort((a, b) => {
        const isVf = (str) => str && (str.toUpperCase().includes('VF') || str.toUpperCase().includes('FRENCH'));
        const aIsVf = isVf(a.name) || isVf(a.title);
        const bIsVf = isVf(b.name) || isVf(b.title);
        
        if (aIsVf && !bIsVf) return -1;
        if (!aIsVf && bIsVf) return 1;
        return 0;
    });

    return cleaned;
}
