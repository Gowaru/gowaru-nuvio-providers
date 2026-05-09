import { fetchText } from './http.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';
import { getTmdbTitles } from '../utils/metadata.js';
// Import btoa/atob from global if needed, Hermes should have them or we can implement a fallback.
// In Nuvio, atob/btoa might not be present globally depending on env, but let's assume it is or use polyfill.

const BASE_URL = "https://sekai.one";


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

    // Step 1: Decode all atob constants and detect embed prefix
    const b64Regex = /var\s+([a-zA-Z0-9_]+)\s*=\s*atob\("([^"]+)"\)/g;
    const constants = {};
    let embedPrefix = null;
    let embedPrefixName = null;
    for (const match of html.matchAll(b64Regex)) {
        const varName = match[1];
        const decoded = atob(match[2]);
        constants[varName] = decoded;
        // Detect embed domain prefixes (vidmoly, mugiwara, etc.)
        // Prefer the explicitly-named "mugiwara" variable; otherwise use the first mugiwara domain
        if (/embed-?$/.test(decoded) || /mugiwara/.test(decoded)) {
            if (!embedPrefix || varName === 'mugiwara') {
                embedPrefix = decoded;
                embedPrefixName = varName;
            }
        }
    }

    // Step 2: Process ALL script blocks (episode data can be in any of them)
    const scriptBlocks = html.match(/<script>[\s\S]*?<\/script>/g);
    if (!scriptBlocks) return epMap;
    const jsCode = scriptBlocks.join('\n');

    // Step 3: Extract numeric constants (var lastXxx = N)
    const numConstants = {};
    const varLastRegex = /var\s+([a-zA-Z0-9_]+)\s*=\s*(\d+);/g;
    for (const match of jsCode.matchAll(varLastRegex)) {
        numConstants[match[1]] = parseInt(match[2]);
    }

    // Step 4: Hardcoded indices with .mp4: episodeHD[28] = mu5 + "path/" + 28 + "-2.mp4"
    const hardcodeRegex = /(episode(?:HD|Low)?)\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*\+?\s*(\d+)?\s*\+\s*['"](\.mp4)['"]/g;
    for (const match of jsCode.matchAll(hardcodeRegex)) {
        const type = match[1];
        const num = parseInt(match[2]);
        const domain = constants[match[3]] || "";
        const path = match[4];
        const numStr = match[5] ? match[5] : "";
        const ext = match[6];
        if (!epMap[num]) epMap[num] = {};
        epMap[num][type] = domain + path + numStr + ext;
    }

    // Step 5: Simple domain + path patterns (no .mp4 suffix in assignment)
    // episode[N] = domain + "path/name"  OR  episode[N] = "path/name.mp4"
    const simpleRegex = /(episode(?:HD|Low)?)\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*;/g;
    for (const match of jsCode.matchAll(simpleRegex)) {
        const type = match[1];
        const num = parseInt(match[2]);
        const domain = constants[match[3]] || "";
        const path = match[4];
        if (!epMap[num]) epMap[num] = {};
        if (!epMap[num][type] && path.endsWith('.mp4')) {
            epMap[num][type] = domain + path;
        }
    }

    // Step 6: Direct embed ID pattern: episode[N] = "id.html" (vidmoly style)
    // The prefix domain is from the detected embedPrefix (e.g., mugiwara = atob("https://vidmoly.biz/embed-"))
    const embedRegex = /(episode(?:HD|Low)?)\s*\[\s*(\d+)\s*\]\s*=\s*['"]([^'"]+\.html)['"]\s*;/g;
    for (const match of jsCode.matchAll(embedRegex)) {
        const type = match[1];
        const num = parseInt(match[2]);
        const embedId = match[3];
        if (!epMap[num]) epMap[num] = {};
        if (!epMap[num][type] && embedPrefix) {
            epMap[num][type] = embedPrefix + embedId;
        }
    }

    // Step 7: Loop-based construction: for(var num=start; num<=end; num++) { episode[num] = domain + "path/" + num + ".mp4"; }
    const loopRegex = /for\s*\(\s*var\s+num\s*=\s*(\d+);\s*num\s*<=\s*([0-9a-zA-Z_]+);\s*num\+\+\s*\)\s*\{([^}]+)\}/g;
    for (const match of jsCode.matchAll(loopRegex)) {
        const start = parseInt(match[1]);
        const endVar = match[2];
        const end = isNaN(parseInt(endVar)) ? numConstants[endVar] || 1000 : parseInt(endVar);
        const body = match[3];

        const bodyRegex = /(episode(?:HD|Low)?)\s*\[\s*num\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*\+\s*(?:num)\s*\+\s*['"](\.mp4)['"]\s*;/g;
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
    
    // Method 1: Find arc URLs from href attributes in JS string literals
    // Pattern: href="series-slug-streaming/arc-N" (often in JS template strings)
    const hrefRegex = /href="([^"]*arc[^"]*)"/gi;
    for(const match of html.matchAll(hrefRegex)) {
        let uri = match[1];
        if(uri.includes('arc-') && !uri.includes('?') && !uri.startsWith('http') && !uri.startsWith('#')) {
            const fullUrl = (baseUrl.replace(/\?.*$/, '') + '/' + uri).replace(/([^:]\/)\/+/g, "$1");
            arcs.push(fullUrl);
        }
    }
    
    // Method 2: Find arc URLs from redirectTo() calls
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
    
    let absEp = episodeNum;
    try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId) {
            const resolved = await getAbsoluteEpisode(imdbId, season, episodeNum);
            if (resolved) absEp = resolved;
        }
    } catch (e) {}

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
    const arcsHtmls = await Promise.all(arcsUrls.map(u => fetchText(u).catch(() => "")));
    
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
