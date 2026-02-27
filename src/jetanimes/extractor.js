import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://on.jetanimes.com";

/**
 * Search for the anime on JetAnimes
 */
async function searchAnime(title) {
    try {
        const results = [];
        const seen = new Set();

        const add = (h, t) => {
            if (h && h.length > 5 && t && !seen.has(h)) {
                seen.add(h);
                results.push({ title: t, url: h.startsWith('http') ? h : BASE_URL + h });
            }
        };

        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const $ = cheerio.load(html);

        $('.result-item, .post-item, .anime-item').each((i, el) => {
            const h = $(el).find('a').attr('href');
            const t = $(el).find('a').attr('title') || $(el).find('.title').text().trim();
            add(h, t);
        });

        if (results.length === 0) {
            // Fallback for standard links
            $('a').each((i, el) => {
                const h = $(el).attr('href');
                const t = $(el).attr('title') || $(el).text().trim();
                // Filter what looks like series
                if (h && h.includes('serie') && t && t.toLowerCase().includes(title.toLowerCase())) {
                    add(h, t);
                }
            });
        }

        return results;
    } catch (e) {
        console.error(`[JetAnimes] Search error: ${e.message}`);
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];

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
        console.warn(`[JetAnimes] ArmSync failed: ${e.message}`);
    }

    let matches = [];
    for (const title of titles) {
        matches = await searchAnime(title);
        if (matches && matches.length > 0) break;
    }
    
    if (!matches || matches.length === 0) return [];
    const streams = [];

    // Parse JetAnimes series page
    for (const match of matches) {
        if (!match.url) continue;

        try {
            const html = await fetchText(match.url, { headers: { "User-Agent": "Mozilla/5.0" } });
            const $ = cheerio.load(html);
            
            // JetAnimes represents eps like '1 - 1' meaning Season 1, Ep 1
            let epLinks = [];
            $('.episodios li').each((i, el) => {
                const numText = $(el).find('.numerando').text().trim(); // "1 - 1"
                const link = $(el).find('a').attr('href');
                if (numText && link) {
                    const parts = numText.split('-');
                    if(parts.length >= 2) {
                        const s = parseInt(parts[0].trim(), 10);
                        const e = parseInt(parts[1].trim(), 10);
                        // If it matches exactly our requested season and episode or absolute episode
                        if (s === season && targetEpisodes.includes(e)) {
                            epLinks.push(link);
                        }
                    }
                }
            });

            // Iterate over found matching episode pages to extract servers
            for (const epLink of epLinks) {
                const epHtml = await fetchText(epLink, { headers: { "User-Agent": "Mozilla/5.0" } });
                const $ep = cheerio.load(epHtml);
                
                // Dooplay relies on post ID for WP ajax
                const postIdAttr = $ep('body').attr('class') || '';
                const postMatch = postIdAttr.match(/postid-(\d+)/);
                const postId = postMatch ? postMatch[1] : null;

                const servers = [];
                $ep('ul#playeroptionsul li').each((idx, el) => {
                    servers.push({
                        nume: $ep(el).attr('data-nume'),
                        type: $ep(el).attr('data-type') || 'tv',
                        name: $ep(el).find('.title').text().trim() || 'Server'
                    });
                });

                if (servers.length > 0 && postId) {
                    for (const server of servers) {
                        if (!server.nume) continue;
                        
                        try {
                            const params = new URLSearchParams();
                            params.append('action', 'doo_player_ajax');
                            params.append('post', postId);
                            params.append('nume', server.nume);
                            params.append('type', server.type);

                            const r = await fetch(`${BASE_URL}/wp-admin/admin-ajax.php`, {
                                method: 'POST',
                                body: params.toString(),
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'User-Agent': 'Mozilla/5.0'
                                }
                            });
                            
                            const j = await r.json();
                            if (j && j.embed_url) {
                                // sometimes embedded in an iframe tag
                                let url = j.embed_url;
                                const iframeMatch = url.match(/src="([^"]+)"/);
                                if (iframeMatch) url = iframeMatch[1];
                                
                                streams.push({
                                    name: `JetAnimes`,
                                    title: server.name,
                                    url: url,
                                    quality: "HD",
                                    headers: { "Referer": BASE_URL }
                                });
                            }
                        } catch(e) {
                            // ignore individual server errors
                        }
                    }
                }
            }

        } catch (e) {
            console.error(`[JetAnimes] Extract error: ${e.message}`);
        }
    }

    const validStreams = [];
    for (const s of streams) {
        const resolved = await resolveStream(s);
        if (resolved && resolved.isDirect) {
            validStreams.push(resolved);
        } else if (resolved) {
            validStreams.push(resolved);
        }
    }

    console.log(`[JetAnimes] Total valid streams found: ${validStreams.length}`);
    return validStreams;
}
