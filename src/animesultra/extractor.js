import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream } from '../utils/resolvers.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://animesultra.org";

/**
 * Search for the anime on AnimesUltra
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

        const searchUrl = `${BASE_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;
        const html = await fetchText(searchUrl, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const $ = cheerio.load(html);

        $('.film-poster').each((i, el) => {
            const h = $(el).find('a').attr('href');
            const t = $(el).find('a').attr('title') || $(el).attr('title');
            add(h, t);
        });

        // Fallback
        if (results.length === 0) {
            $('a').each((i, el) => {
                const h = $(el).attr('href');
                const t = $(el).attr('title') || $(el).text().trim();
                if (h && h.includes('.html') && h.includes('-') && t && t.toLowerCase().includes(title.toLowerCase())) {
                    add(h, t);
                }
            });
        }

        return results;
    } catch (e) {
        console.error(`[AnimesUltra] Search error: ${e.message}`);
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];

    // Order titles: non-ASCII/romaji first, then French, then English.
    const titlesOrdered = [...titles].sort((a, b) => {
        const aJp = /[^\x00-\x7F]/.test(a) ? -1 : (/[àâéèêëîïôùûüç'L']/i.test(a) ? 0 : 1);
        const bJp = /[^\x00-\x7F]/.test(b) ? -1 : (/[àâéèêëîïôùûüç'L']/i.test(b) ? 0 : 1);
        return aJp - bJp;
    });

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
        console.warn(`[AnimesUltra] ArmSync failed: ${e.message}`);
    }

    let matches = [];
    for (const title of titlesOrdered) {
        matches = await searchAnime(title);
        if (matches && matches.length > 0) break;
    }
    
    if (!matches || matches.length === 0) return [];

    const streams = [];

    for (const match of matches) {
        if (!match.url) continue;

        // Try to identify if match is a right fit for language tracking, optional
        let lang = "VOSTFR";
        if (match.title.toLowerCase().includes('vf')) lang = "VF";

        try {
            // Extract the newsId from the URL, which usually matches /(\d+)-/
            const newsIdMatch = match.url.match(/\/(\d+)-/);
            if (!newsIdMatch) {
                console.warn(`[AnimesUltra] Could not find newsId in URL: ${match.url}`);
                continue;
            }
            const newsId = newsIdMatch[1];
            
            // Fetch episodes and servers from AJAX full-story
            const res = await fetch(`${BASE_URL}/engine/ajax/full-story.php?newsId=${newsId}`, {
                headers: { 
                    "User-Agent": "Mozilla/5.0",
                    "X-Requested-With": "XMLHttpRequest"
                }
            });
            const d = await res.json();
            const html = d.html;
            
            if (!html) continue;
            
            const $ = cheerio.load(html);

            // Fetch the servers relevant for our matched episodes
            $('.player_box').each((i, el) => {
                const idAttr = $(el).attr('id'); // e.g. content_player_1vidc
                if (!idAttr) return;

                const matchId = idAttr.match(/content_player_(\d+)([a-zA-Z0-9]+)/);
                if (matchId) {
                    const boxEpNum = parseInt(matchId[1], 10);
                    
                    if (targetEpisodes.map(e => parseInt(e, 10)).includes(boxEpNum)) {
                        const serverCode = matchId[2];
                        let url = $(el).text().trim() || $(el).find('iframe').attr('src');
                        
                        if (url && url.startsWith('http')) {
                            // Convert vidcdn or other recognized players if needed
                            // For AnimesUltra, the code sends raw text as link
                            let serverName = serverCode.toLowerCase().includes('vidc') ? 'VidCDN' : serverCode;
                            
                            // We don't resolve directly here, we let resolveStream handle it, 
                            // it can handle most generic domains like dood, streamtape, vidmoly, sibnet, or myvi etc
                            // the resolvers.js from utils handles play.vidcdn.xyz 
                            // Wait, does resolvers.js have vidcdn support? Usually direct iframe wrap.
                            
                            streams.push({
                                name: `AnimesUltra (${lang})`,
                                title: `${serverName} - ${lang}`,
                                url: url,
                                quality: "HD",
                                headers: { "Referer": BASE_URL }
                            });
                        }
                    }
                }
            });
        } catch (e) {
            console.error(`[AnimesUltra] Extract error: ${e.message}`);
        }
    }

    // Filter out unresolved iframes to prevent ExoPlayer crashing (error 23003)
    const validStreams = [];
    for (const s of streams) {
        const resolved = await resolveStream(s);
        if (resolved && resolved.isDirect) {
            validStreams.push(resolved);
        }
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
