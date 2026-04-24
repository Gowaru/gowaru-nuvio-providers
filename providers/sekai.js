/**
 * sekai - Built from src/sekai/
 * Generated: 2026-04-24T09:04:09.860Z
 */
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/sekai/index.js
var index_exports = {};
__export(index_exports, {
  provider: () => provider
});
module.exports = __toCommonJS(index_exports);

// src/sekai/http.js
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
};
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    console.log(`[Sekai] Fetching: ${url}`);
    const response = yield fetch(url, __spreadValues({
      headers: __spreadValues(__spreadValues({}, HEADERS), options.headers)
    }, options));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return yield response.text();
  });
}

// src/utils/armsync.js
var CINEMATA_API = "https://v3-cinemeta.strem.io";
function syncFetch(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8e3);
      const res = yield fetch(url, __spreadProps(__spreadValues({}, options), { signal: controller.signal }));
      clearTimeout(timeout);
      return res;
    } catch (e) {
      console.error(`[ArmSync] Fetch failed: ${url}`, e.message);
      return null;
    }
  });
}
function getAbsoluteEpisode(imdbId, season, episode) {
  return __async(this, null, function* () {
    var _a;
    if (!imdbId || season === 0) return null;
    const res = yield syncFetch(`${CINEMATA_API}/meta/series/${imdbId}.json`);
    if (!res) return null;
    const data = yield res.json();
    if (!((_a = data == null ? void 0 : data.meta) == null ? void 0 : _a.videos)) return null;
    const episodes = data.meta.videos.filter((v) => v.season > 0 && v.episode > 0).sort((a, b) => a.season - b.season || a.episode - b.episode);
    const uniqueEpisodes = [];
    const seen = /* @__PURE__ */ new Set();
    for (const ep of episodes) {
      const key = `${ep.season}-${ep.episode}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEpisodes.push(ep);
      }
    }
    const index = uniqueEpisodes.findIndex((v) => v.season == season && v.episode == episode);
    if (index !== -1) {
      const absoluteNumber = index + 1;
      console.log(`[ArmSync] Resolved: S${season}E${episode} -> Absolute ${absoluteNumber}`);
      return absoluteNumber;
    }
    return null;
  });
}

// src/utils/metadata.js
var TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var TMDB_API_BASE = "https://api.themoviedb.org/3";
function safeFetch(url) {
  return __async(this, null, function* () {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8e3);
      const res = yield fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      return res;
    } catch (e) {
      return null;
    }
  });
}
function getTmdbTitles(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d, _e, _f;
    const type = mediaType === "movie" ? "movie" : "tv";
    const titles = [];
    try {
      const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
      const mainRes = yield safeFetch(mainUrl);
      if (mainRes) {
        const data = yield mainRes.json();
        const titleEn = (_a = type === "movie" ? data.title : data.name) == null ? void 0 : _a.trim();
        const titleOriginal = (_b = type === "movie" ? data.original_title : data.original_name) == null ? void 0 : _b.trim();
        if (titleEn) titles.push(titleEn);
        if (titleOriginal && titleOriginal !== titleEn && /^[\x00-\x7F\u00C0-\u024F\s]+$/.test(titleOriginal)) {
          titles.push(titleOriginal);
        }
      }
      const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
      const transRes = yield safeFetch(transUrl);
      if (transRes) {
        const transData = yield transRes.json();
        const frTrans = (transData.translations || []).find((t) => t.iso_639_1 === "fr");
        const titleFr = ((_d = (_c = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _c.name) == null ? void 0 : _d.trim()) || ((_f = (_e = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _e.title) == null ? void 0 : _f.trim());
        if (titleFr && !titles.includes(titleFr)) {
          titles.push(titleFr);
        }
      }
      const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
      const altRes = yield safeFetch(altUrl);
      if (altRes) {
        const altData = yield altRes.json();
        const altList = type === "movie" ? altData.titles : altData.results;
        if (altList && Array.isArray(altList)) {
          const isLatin = (str) => /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()]+$/.test(str);
          altList.forEach((alt) => {
            var _a2;
            const t = (_a2 = alt.title) == null ? void 0 : _a2.trim();
            if (t && !titles.some((existing) => existing.toLowerCase() === t.toLowerCase()) && isLatin(t)) {
              if (alt.type === "Romaji" || alt.iso_3166_1 === "US" || alt.iso_3166_1 === "FR") {
                titles.splice(1, 0, t);
              } else {
                titles.push(t);
              }
            }
          });
        }
      }
    } catch (e) {
      console.error(`[Metadata] TMDB API error: ${e.message}`);
    }
    const uniqueTitles = [...new Set(titles)];
    console.log(`[Metadata] Titles for ${tmdbId}: ${uniqueTitles.join(" | ")}`);
    return uniqueTitles;
  });
}

// src/sekai/extractor.js
var BASE_URL = "https://sekai.one";
function normalizeTitle(s) {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[':!.,?]/g, "").replace(/\b(the|season|part|cour|cour)\b/ig, "").replace(/\s+/g, " ").trim();
}
function getSeriesData() {
  return __async(this, null, function* () {
    const html = yield fetchText(`${BASE_URL}/`);
    const startStr = "var seriesData = [";
    const startIdx = html.indexOf(startStr);
    if (startIdx === -1) return [];
    let inside = 1;
    let endIdx = startIdx + startStr.length;
    while (endIdx < html.length && inside > 0) {
      if (html[endIdx] === "[") inside++;
      else if (html[endIdx] === "]") inside--;
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
        const aliases = [...aliasesRaw.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        results.push({
          title: label,
          url: `${BASE_URL}/${url}`,
          aliases
        });
      }
    } catch (e) {
      console.error("[Sekai] Regex parsing error on seriesData", e);
    }
    return results;
  });
}
function buildEpisodeMap(html) {
  const epMap = {};
  const b64Regex = /var\s+([a-zA-Z0-9_]+)\s*=\s*atob\("([^"]+)"\)/g;
  const constants = {};
  for (const match of html.matchAll(b64Regex)) {
    if (typeof atob === "function") {
      constants[match[1]] = atob(match[2]);
    } else {
      constants[match[1]] = Buffer.from(match[2], "base64").toString("utf8");
    }
  }
  const scriptMatch = html.match(/<script>\s*(?:var\s+[a-zA-Z0-9_]+\s*=\s*[0-9]+;|var\s+[a-zA-Z0-9_]+\s*=\s*atob)[\s\S]*?<\/script>/);
  if (!scriptMatch) return epMap;
  const jsCode = scriptMatch[0];
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
  const simpleRegex = /(episode(?:HD|Low)?)\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*;/g;
  for (const match of jsCode.matchAll(simpleRegex)) {
    const type = match[1];
    const num = parseInt(match[2]);
    const domain = constants[match[3]] || "";
    const path = match[4];
    if (!epMap[num]) epMap[num] = {};
    if (!epMap[num][type] && path.endsWith(".mp4")) {
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
    const end = isNaN(parseInt(endVar)) ? numConstants[endVar] || 1e3 : parseInt(endVar);
    const body = match[3];
    const bodyRegex = /(episode(?:HD|Low)?)\s*\[\s*num\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*\+\s*(?:num)\s*\+\s*['"](\.mp4)['"](;)/g;
    for (let n = start; n <= end; n++) {
      if (!epMap[n]) epMap[n] = {};
      for (const bMatch of body.matchAll(bodyRegex)) {
        const type = bMatch[1];
        const domain = constants[bMatch[2]] || "";
        const path = bMatch[3];
        const ext = bMatch[4];
        if (!epMap[n][type]) {
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
  for (const match of html.matchAll(attrRegex)) {
    let uri = match[1];
    if (!uri.includes("?") && !uri.startsWith("http")) {
      arcs.push((baseUrl.replace(/\?.*$/, "") + "/" + uri).replace(/([^:]\/)\/+/g, "$1"));
    }
  }
  if (arcs.length === 0) {
    const fallbackRegex = /redirectTo\(['"]([^'"]+)['"]\)/g;
    for (const match of html.matchAll(fallbackRegex)) {
      let uri = match[1];
      if (uri.includes("arc-") && !uri.includes("?")) {
        arcs.push((BASE_URL + "/" + uri).replace(/([^:]\/)\/+/g, "$1"));
      }
    }
  }
  return [...new Set(arcs)];
}
function extractStreams(tmdbId, mediaType, season, episodeNum) {
  return __async(this, null, function* () {
    if (mediaType === "movie") {
      console.log(`[Sekai] movie is not yet perfectly mapped`);
    }
    const titles = yield getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];
    const absEp = yield getAbsoluteEpisode(tmdbId, mediaType, season, episodeNum);
    console.log(`[Sekai] Checking S${season} E${episodeNum} -> Absolute: ${absEp}`);
    const allSeries = yield getSeriesData();
    if (allSeries.length === 0) return [];
    let targetSeries = null;
    let targetScore = -1;
    for (const t of titles) {
      if (!t) continue;
      const nt = normalizeTitle(t);
      for (const s of allSeries) {
        const ns = normalizeTitle(s.title);
        if (nt === ns || ns.includes(nt) || nt.includes(ns)) {
          targetSeries = s;
          targetScore = 100;
          break;
        }
        for (const a of s.aliases) {
          const na = normalizeTitle(a);
          if (nt === na || na.includes(nt) || nt.includes(na)) {
            targetSeries = s;
            targetScore = 90;
            break;
          }
        }
      }
      if (targetSeries) break;
    }
    if (!targetSeries) {
      console.log(`[Sekai] No series match found for tmdbId ${tmdbId}`);
      return [];
    }
    console.log(`[Sekai] Matched Series: ${targetSeries.title} (${targetSeries.url})`);
    const mainHtml = yield fetchText(targetSeries.url);
    let mainEpMap = buildEpisodeMap(mainHtml);
    if (mainEpMap[absEp] && Object.keys(mainEpMap[absEp]).length > 0) {
      return formatStreams(mainEpMap[absEp]);
    }
    let arcsUrls = extractArcsUrls(mainHtml, targetSeries.url);
    console.log(`[Sekai] Found ${arcsUrls.length} arcs. Fetching...`);
    const arcsHtmls = yield Promise.all(arcsUrls.map((u) => fetchText(u).catch(() => "")));
    for (const html of arcsHtmls) {
      if (!html) continue;
      const arcMap = buildEpisodeMap(html);
      if (arcMap[absEp] && Object.keys(arcMap[absEp]).length > 0) {
        mainEpMap = arcMap;
        break;
      }
    }
    if (mainEpMap[absEp] && Object.keys(mainEpMap[absEp]).length > 0) {
      return formatStreams(mainEpMap[absEp]);
    }
    console.log(`[Sekai] Episode ${absEp} not found in parsed maps.`);
    return [];
  });
}
function formatStreams(epSources) {
  const streams = [];
  if (epSources.episodeHD) {
    streams.push({
      name: "Sekai (VOSTFR)",
      title: "Sekai-HD - VOSTFR",
      url: epSources.episodeHD,
      quality: "1080p",
      isDirect: true,
      headers: { "Referer": BASE_URL }
    });
  }
  if (epSources.episode) {
    streams.push({
      name: "Sekai (VOSTFR)",
      title: "Sekai-SD - VOSTFR",
      url: epSources.episode,
      quality: "720p",
      isDirect: true,
      headers: { "Referer": BASE_URL }
    });
  }
  if (epSources.episodeLow) {
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

// src/sekai/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.log(`[Sekai] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
    try {
      const streams = yield extractStreams(tmdbId, mediaType, season, episode);
      return streams;
    } catch (error) {
      console.error(`[Sekai] Extraction error for ${tmdbId}:`, error);
      return [];
    }
  });
}
var provider = {
  id: "sekai",
  name: "Sekai",
  description: "Provider for Sekai (Animes VOSTFR/VF)",
  language: "fr",
  types: ["tv", "movie"],
  getStreams
};
