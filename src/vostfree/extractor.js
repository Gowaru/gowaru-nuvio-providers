/**
 * Extractor Logic for Vostfree
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';

const BASE_URL = "https://vostfree.ws";

/**
 * Get the title of a media from TMDB ID
 */
async function getTmdbTitle(tmdbId, mediaType) {
    try {
        // Use language=en-US to always get English titles
        const url = `https://www.themoviedb.org/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}?language=en-US`;
        const html = await fetchText(url);
        const $ = cheerio.load(html);

        let title = $('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('h2').first().text();

        if (title && title.includes(' (')) title = title.split(' (')[0];
        if (title && title.includes(' - ')) title = title.split(' - ')[0];

        title = title ? title.trim() : null;
        console.log(`[Vostfree] TMDB Title found: ${title}`);
        return title;
    } catch (e) {
        console.error(`[Vostfree] Failed to get title from TMDB: ${e.message}`);
        return null;
    }
}

/**
 * Search for the anime on Vostfree
 */
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

        $('.title a, .search-result-item a, .movie-title a').each((i, el) => {
            const h = $(el).attr('href');
            if (h && (h.includes('.html') || h.includes('/anime/'))) {
                results.push({
                    title: $(el).text().trim() || $(el).attr('title'),
                    url: h
                });
            }
        });

        const normalize = (s) => s.toLowerCase().replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
        const simplifiedTitle = normalize(title);

        console.log(`[Vostfree] Results found: ${results.length}`);

        // Find all matches that contain the title
        const matches = results.filter(r => normalize(r.title).includes(simplifiedTitle));

        if (matches.length > 0) {
            console.log(`[Vostfree] Found ${matches.length} matches for ${title}`);
        }
        return matches;
    } catch (e) {
        console.error(`[Vostfree] Search error: ${e.message}`);
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) return [];

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

    let matches = await searchAnime(title);
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
                const text = $(el).text();
                for (const ep of targetEpisodes) {
                    const epS = ep.toString();
                    const epPadded = epS.padStart(2, '0');
                    // Strict regex to avoid "Episode 1" matching "Episode 10"
                    const regex = new RegExp(`(?:^|[^0-9])(?:Episode\\s*)?(?:${epS}|${epPadded})(?:$|[^0-9])`, 'i');
                    if (regex.test(text)) {
                        buttonsId = $(el).val();
                        return false;
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

    return streams;
}
