import { fetchText } from './http.js';
import { getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';
// Import btoa/atob from global if needed, Hermes should have them or we can implement a fallback.
// In Nuvio, atob/btoa might not be present globally depending on env, but let's assume it is or use polyfill.

const BASE_URL = "https://sekai.one";

/**
 * Batch fetch URLs with a modest concurrency limit to keep TV runtime responsive.
 */
async function batchFetchTexts(urls, maxConcurrent = 6) {
    const results = [];
    for (let i = 0; i < urls.length; i += maxConcurrent) {
        const batch = urls.slice(i, i + maxConcurrent);
        const batchResults = await Promise.allSettled(batch.map((url) => fetchText(url)));
        batchResults.forEach((result) => {
            results.push(result.status === 'fulfilled' ? result.value : "");
        });
    }
    return results;
}

function decodeBase64Utf8(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let index = 0;
    const str = String(input || '').replace(/[^A-Za-z0-9+/=]/g, '');

    while (index < str.length) {
        const enc1 = alphabet.indexOf(str.charAt(index++));
        const enc2 = alphabet.indexOf(str.charAt(index++));
        const enc3 = alphabet.indexOf(str.charAt(index++));
        const enc4 = alphabet.indexOf(str.charAt(index++));

        const chr1 = (enc1 << 2) | (enc2 >> 4);
        const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        const chr3 = ((enc3 & 3) << 6) | enc4;

        output += String.fromCharCode(chr1);
        if (enc3 !== 64) output += String.fromCharCode(chr2);
        if (enc4 !== 64) output += String.fromCharCode(chr3);
    }

    return output;
}


function normalizeTitle(s) {
    if(!s) return "";
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?]/g, '')
        .replace(/\b(the|season|part|cour|cour)\b/ig, '')
        .replace(/\s+/g, ' ')
        .trim();
}



async function getSeriesData() {
    const html = await fetchText(`${BASE_URL}/`);
    
    const startStr = "var seriesData = [";
    const startIdx = html.indexOf(startStr);
    if (startIdx === -1) return [];

    let inside = 1;
    let endIdx = startIdx + startStr.length;
    while(endIdx < html.length && inside > 0) {
        if (html[endIdx] === '[') inside++;
        else if (html[endIdx] === ']') inside--;
        endIdx++;
    }

    const dataStr = html.substring(startIdx + startStr.length - 1, endIdx);
    const results = [];
    try {
        const matches = [...dataStr.matchAll(/\{\s*label:\s*"([^"]+)",\s*image:(?:[^,]+),\s*url:\s*"([^"]+)"(?:,\s*aliases:\s*\[([^\]]+)\])?/g)];
        for (const m of matches) {
            const label = m[1];
            const url = m[2];
            const aliasesRaw = m[3] || "";
            const aliases = [...aliasesRaw.matchAll(/"([^"]+)"/g)].map(x => x[1]);
            
            results.push({
                title: label,
                url: `${BASE_URL}/${url}`,
                aliases: aliases
            });
        }
    } catch(e) {
        console.error("[Sekai] Regex parsing error on seriesData", e);
    }
    return results;
}


function buildEpisodeMap(html) {
    const epMap = {}; // { num: { sd, hd, low } }

    const b64Regex = /var\s+([a-zA-Z0-9_]+)\s*=\s*atob\("([^"]+)"\)/g;
    const constants = {};
    for (const match of html.matchAll(b64Regex)) {
        if (typeof atob === 'function') {
            constants[match[1]] = atob(match[2]);
        } else {
            constants[match[1]] = decodeBase64Utf8(match[2]);
        }
    }

    const scriptMatch = html.match(/<script>\s*(?:var\s+[a-zA-Z0-9_]+\s*=\s*[0-9]+;|var\s+[a-zA-Z0-9_]+\s*=\s*atob)[\s\S]*?<\/script>/);
    if (!scriptMatch) return epMap;
    const jsCode = scriptMatch[0];
    
    const hardcodeRegex = /(episode(?:HD|Low)?)\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*\+?\s*(\d+)?\s*\+\s*['"](\.mp4)['"]/g;
    for (const match of jsCode.matchAll(hardcodeRegex)) {
        const type = match[1]; // episode, episodeHD, episodeLow
        const num = parseInt(match[2]);
        const domain = constants[match[3]] || "";
        const path = match[4];
        const numStr = match[5] ? match[5] : "";
        const ext = match[6];
        
        if (!epMap[num]) epMap[num] = {};
        epMap[num][type] = domain + path + numStr + ext;
    }
    
    // Fallback direct url pattern (sans concat avec padding array)
    const simpleRegex = /(episode(?:HD|Low)?)\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*;/g;
    for (const match of jsCode.matchAll(simpleRegex)) {
        const type = match[1];
        const num = parseInt(match[2]);
        const domain = constants[match[3]] || "";
        const path = match[4];
        if (!epMap[num]) epMap[num] = {};
        if(!epMap[num][type] && path.endsWith('.mp4')) {
             epMap[num][type] = domain + path;
        }
    }

    const loopRegex = /for\s*\(\s*var\s+num\s*=\s*(\d+);\s*num\s*<=\s*([0-9a-zA-Z_]+);\s*num\+\+\s*\)\s*\{([^}]+)\}/g;
    const varLastRegex = /var\s+([a-zA-Z0-9_]+)\s*=\s*(\d+);/g;
    const numConstants = {};
    for (const match of jsCode.matchAll(varLastRegex)) {
        numConstants[match[1]] = parseInt(match[2]);
    }

    for (const match of jsCode.matchAll(loopRegex)) {
        const start = parseInt(match[1]);
        const endVar = match[2];
        const end = isNaN(parseInt(endVar)) ? numConstants[endVar] || 1000 : parseInt(endVar);
        const body = match[3];

        const bodyRegex = /(episode(?:HD|Low)?)\s*\[\s*num\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*\+\s*(?:num)\s*\+\s*['"](\.mp4)['"](;)/g;
        for(let n=start; n<=end; n++) {
            if (!epMap[n]) epMap[n] = {};
            for (const bMatch of body.matchAll(bodyRegex)) {
                const type = bMatch[1];
                const domain = constants[bMatch[2]] || "";
                const path = bMatch[3];
                const ext = bMatch[4];
                if(!epMap[n][type]) {
                    epMap[n][type] = domain + path + n + ext;
                }
            }
        }
    }

    return epMap;
}


function extractArcsUrls(html, baseUrl) {
    const arcs = [];
    const attrRegex = /<a\s+href="([^"]+)">\s*<div\s+class="hover-arc">/g;
    for(const match of html.matchAll(attrRegex)) {
        let uri = match[1];
        if(!uri.includes('?') && !uri.startsWith('http')) {
            arcs.push((baseUrl.replace(/\?.*$/, '') + '/' + uri).replace(/([^:]\/)\/+/g, "$1")); // basic join
        }
    }
    
    if(arcs.length === 0) {
        const fallbackRegex = /redirectTo\(['"]([^'"]+)['"]\)/g;
        for(const match of html.matchAll(fallbackRegex)) {
            let uri = match[1];
            if(uri.includes('arc-') && !uri.includes('?')) {
                 arcs.push((BASE_URL + '/' + uri).replace(/([^:]\/)\/+/g, "$1"));
            }
        }
    }
    return [...new Set(arcs)];
}

export async function extractStreams(tmdbId, mediaType, season, episodeNum) {
    // 0. Movies are supported but we need absolute episode
    // Only fetch for TVs for now, or consider movies.
    if (mediaType === 'movie') {
         // TODO: We could add movie support eventually.
         console.log(`[Sekai] movie is not yet perfectly mapped`);
         // We might return [] for now, or map it using getAbsoluteEpisode
    }

    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];
    
    const absEp = await getAbsoluteEpisode(tmdbId, mediaType, season, episodeNum);
    console.log(`[Sekai] Checking S${season} E${episodeNum} -> Absolute: ${absEp}`);
    
    // 1. Get Series Data
    const allSeries = await getSeriesData();
    if(allSeries.length === 0) return [];

    let targetSeries = null;
    let targetScore = -1;

    for(const t of titles) {
         if(!t) continue;
         const nt = normalizeTitle(t);
         for(const s of allSeries) {
              const ns = normalizeTitle(s.title);
              // Direct match
              if(nt === ns || ns.includes(nt) || nt.includes(ns)) {
                   targetSeries = s;
                   targetScore = 100;
                   break;
              }
              // Alias match
              for(const a of s.aliases) {
                   const na = normalizeTitle(a);
                   if(nt === na || na.includes(nt) || nt.includes(na)) {
                         targetSeries = s;
                         targetScore = 90;
                         break;
                   }
              }
         }
         if(targetSeries) break;
    }

    if(!targetSeries) {
        console.log(`[Sekai] No series match found for tmdbId ${tmdbId}`);
        return [];
    }

    console.log(`[Sekai] Matched Series: ${targetSeries.title} (${targetSeries.url})`);

    // 2. Fetch main page
    const mainHtml = await fetchText(targetSeries.url);
    
    // Parse episodes
    let mainEpMap = buildEpisodeMap(mainHtml);
    
    // If our absolute episode is already here, great!
    if(mainEpMap[absEp] && Object.keys(mainEpMap[absEp]).length > 0) {
         return formatStreams(mainEpMap[absEp]);
    }

    // 3. Otherwise, fetch all related Arcs!
    let arcsUrls = extractArcsUrls(mainHtml, targetSeries.url);
    console.log(`[Sekai] Found ${arcsUrls.length} arcs. Fetching...`);
    
    // fetch all arcs in parallel to find the episode map
    const arcsHtmls = await batchFetchTexts(arcsUrls);
    
    for(const html of arcsHtmls) {
         if(!html) continue;
         const arcMap = buildEpisodeMap(html);
         if(arcMap[absEp] && Object.keys(arcMap[absEp]).length > 0) {
              mainEpMap = arcMap;
              break;
         }
    }

    if(mainEpMap[absEp] && Object.keys(mainEpMap[absEp]).length > 0) {
         return formatStreams(mainEpMap[absEp]);
    }

    console.log(`[Sekai] Episode ${absEp} not found in parsed maps.`);
    return [];
}

function formatStreams(epSources) {
    const streams = [];
    if(epSources.episodeHD) {
        streams.push({
             name: "Sekai (VOSTFR)",
             title: "Sekai-HD - VOSTFR",
             url: epSources.episodeHD,
             quality: "1080p",
             isDirect: true,
             headers: { "Referer": BASE_URL }
        });
    }
    if(epSources.episode) {
        streams.push({
             name: "Sekai (VOSTFR)",
             title: "Sekai-SD - VOSTFR",
             url: epSources.episode,
             quality: "720p",
             isDirect: true,
             headers: { "Referer": BASE_URL }
        });
    }
    if(epSources.episodeLow) {
        streams.push({
             name: "Sekai (VOSTFR)",
             title: "Sekai-LOW - VOSTFR",
             url: epSources.episodeLow,
             quality: "360p",
             isDirect: true,
             headers: { "Referer": BASE_URL }
        });
    }
    return streams;
}
