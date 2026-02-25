/**
 * Extractor Logic for Vostfree
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio';
import { resolveStream } from '../utils/resolvers.js';

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

        // 1. Exact match
        let bestMatch = results.find(r => normalize(r.title) === simplifiedTitle);
        // 2. VOSTFR match
        if (!bestMatch) {
            bestMatch = results.find(r => normalize(r.title).includes(simplifiedTitle) && r.title.includes('VOSTFR'));
        }
        // 3. Any match
        if (!bestMatch) {
            bestMatch = results.find(r => normalize(r.title).includes(simplifiedTitle));
        }

        if (!bestMatch) bestMatch = results[0];

        if (bestMatch) {
            console.log(`[Vostfree] Selected: ${bestMatch.title} -> ${bestMatch.url}`);
            return bestMatch.url;
        }

        return null;
    } catch (e) {
        console.error(`[Vostfree] Search error: ${e.message}`);
        return null;
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const title = await getTmdbTitle(tmdbId, mediaType);
    if (!title) return [];

    const animeUrl = await searchAnime(title);
    if (!animeUrl) return [];

    try {
        const html = await fetchText(animeUrl);
        const $ = cheerio.load(html);

        const epNum = episode.toString();
        const epNumPadded = epNum.padStart(2, '0');
        let buttonsId = null;

        $('select.new_player_selector option').each((i, el) => {
            const text = $(el).text();
            if (text.includes(`Episode ${epNum}`) || text.includes(`Episode ${epNumPadded}`)) {
                buttonsId = $(el).val();
                return false;
            }
        });

        if (!buttonsId) {
            console.warn(`[Vostfree] Episode ${episode} not found in selector on ${animeUrl}`);
            const firstButtons = $('div[id^="buttons_"]').first().attr('id');
            if (firstButtons) {
                console.log(`[Vostfree] Falling back to first available buttons: ${firstButtons}`);
                buttonsId = firstButtons;
            } else {
                return [];
            }
        }

        console.log(`[Vostfree] Using buttons ID: ${buttonsId}`);
        const streams = [];
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
                    } else if (playerName.toLowerCase().includes('uqload')) {
                        url = `https://uqload.com/embed-${content}.html`;
                    }
                }

                if (url.startsWith('http')) {
                    const stream = await resolveStream({
                        name: `Vostfree (${playerName})`,
                        title: `${playerName} Player`,
                        url: url,
                        quality: "HD",
                        headers: { "Referer": BASE_URL }
                    });
                    streams.push(stream);
                }
            }
        }

        return streams;
    } catch (e) {
        console.error(`[Vostfree] Extraction error: ${e.message}`);
        return [];
    }
}
