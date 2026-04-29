/**
 * sekai - Built from src/sekai/
 * Generated: 2026-04-29T20:04:10.209Z
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
  getStreams: () => getStreams
});
module.exports = __toCommonJS(index_exports);

// src/utils/resolvers.js
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
};
function isKnownFakeDirectUrl(url) {
  if (!url || typeof url !== "string") return true;
  const u = url.toLowerCase();
  return u.includes("test-videos.co.uk") || u.includes("big_buck_bunny") || u.includes("bigbuckbunny") || u.includes("sample-videos.com") || u.includes("example.com") || u.includes("localhost");
}
var STRICT_QUALITY_TIERS = [2160, 1080, 720, 480, 360, 240];
var DEFAULT_QUALITY_TIER = 360;
function nearestQualityTier(height) {
  if (!Number.isFinite(height) || height <= 0) return DEFAULT_QUALITY_TIER;
  let nearest = STRICT_QUALITY_TIERS[0];
  let minDiff = Math.abs(height - nearest);
  for (const tier of STRICT_QUALITY_TIERS) {
    const diff = Math.abs(height - tier);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = tier;
    }
  }
  return nearest;
}
function normalizeQualityLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return `${DEFAULT_QUALITY_TIER}p`;
  if (raw === "4k" || raw === "uhd" || raw.includes("2160")) return "2160p";
  if (raw.includes("fhd") || raw.includes("fullhd") || raw.includes("1080")) return "1080p";
  if (raw.includes("hd") || raw.includes("720")) return "720p";
  const numericMatch = raw.match(/(\d{3,4})\s*p?/i);
  if (numericMatch) {
    const tier = nearestQualityTier(Number(numericMatch[1]));
    return `${tier}p`;
  }
  return `${DEFAULT_QUALITY_TIER}p`;
}
function qualityRank(value) {
  const q = normalizeQualityLabel(value).toLowerCase();
  const match = q.match(/(\d{3,4})p/);
  const height = match ? Number(match[1]) : DEFAULT_QUALITY_TIER;
  const tier = nearestQualityTier(height);
  return STRICT_QUALITY_TIERS.length - 1 - STRICT_QUALITY_TIERS.indexOf(tier);
}
function appendQualityToTitle(title, quality) {
  const q = normalizeQualityLabel(quality);
  if (!q) return title;
  if ((title || "").includes(q)) return title;
  return `${title} [${q}]`;
}
function expandSingleStreamQualities(stream) {
  return __async(this, null, function* () {
    var _a, _b, _c;
    if (!stream || !stream.url || typeof stream.url !== "string") return [];
    const url = stream.url;
    const lower = url.toLowerCase();
    if (!lower.includes(".m3u8") && !lower.includes("/hls/")) {
      return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") })];
    }
    const res = yield safeFetch(url, { headers: stream.headers || {} });
    if (!res) {
      return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") })];
    }
    const manifest = yield res.text();
    if (!/#EXT-X-STREAM-INF/i.test(manifest)) {
      return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") })];
    }
    const lines = manifest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const variants = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
      const nextLine = lines[index + 1];
      if (!nextLine || nextLine.startsWith("#")) continue;
      const resolution = (_a = line.match(/RESOLUTION=\d+x(\d+)/i)) == null ? void 0 : _a[1];
      const frameRate = (_b = line.match(/FRAME-RATE=([0-9.]+)/i)) == null ? void 0 : _b[1];
      const bandwidth = (_c = line.match(/BANDWIDTH=(\d+)/i)) == null ? void 0 : _c[1];
      let quality = resolution ? `${resolution}p` : null;
      if (!quality && bandwidth) {
        const bw = Number(bandwidth);
        if (bw >= 8e6) quality = "2160p";
        else if (bw >= 4e6) quality = "1080p";
        else if (bw >= 2e6) quality = "720p";
        else if (bw >= 1e6) quality = "480p";
        else quality = "360p";
      }
      if (!quality && frameRate) quality = `${normalizeQualityLabel(stream.quality || "HD")}`;
      let variantUrl = nextLine;
      try {
        variantUrl = new URL(nextLine, url).toString();
      } catch (e) {
      }
      variants.push(__spreadProps(__spreadValues({}, stream), {
        url: variantUrl,
        quality: normalizeQualityLabel(quality || stream.quality || "HD"),
        title: appendQualityToTitle(stream.title || stream.name || "Stream", quality || stream.quality || "HD")
      }));
    }
    if (variants.length === 0) {
      return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") })];
    }
    const unique = [];
    const seen = /* @__PURE__ */ new Set();
    for (const variant of variants) {
      if (seen.has(variant.url)) continue;
      seen.add(variant.url);
      unique.push(variant);
    }
    unique.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
    return unique;
  });
}
function expandStreamQualities(streams) {
  return __async(this, null, function* () {
    const input = Array.isArray(streams) ? streams : [];
    const expanded = [];
    for (const stream of input) {
      try {
        const variants = yield expandSingleStreamQualities(stream);
        for (const variant of variants) {
          expanded.push(variant);
        }
      } catch (e) {
        if (stream) expanded.push(__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") }));
      }
    }
    const deduped = [];
    const seen = /* @__PURE__ */ new Set();
    for (const stream of expanded) {
      if (!(stream == null ? void 0 : stream.url)) continue;
      if (isKnownFakeDirectUrl(stream.url)) continue;
      if (seen.has(stream.url)) continue;
      seen.add(stream.url);
      deduped.push(stream);
    }
    deduped.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
    return deduped;
  });
}
function safeFetch(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    let controller, timeout;
    try {
      const canAbort = typeof AbortController !== "undefined";
      controller = canAbort ? new AbortController() : null;
      if (controller) timeout = setTimeout(() => controller.abort(), 1e4);
      const response = yield fetch(url, __spreadProps(__spreadValues({}, options), {
        headers: __spreadValues(__spreadValues({}, HEADERS), options.headers),
        redirect: "follow",
        signal: controller ? controller.signal : void 0
      }));
      if (timeout) clearTimeout(timeout);
      if (!response) return null;
      const status = response.status;
      let bodyText = "";
      try {
        bodyText = yield response.text();
      } catch (e) {
        bodyText = "";
      }
      return {
        text: () => Promise.resolve(bodyText),
        json: () => __async(null, null, function* () {
          try {
            return JSON.parse(bodyText);
          } catch (e) {
            throw e;
          }
        }),
        ok: response.ok,
        status,
        url: response.url,
        headers: response.headers
      };
    } catch (e) {
      if (timeout) clearTimeout(timeout);
      return null;
    }
  });
}

// src/sekai/http.js
var HEADERS2 = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
};
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    console.log(`[Sekai] Fetching: ${url}`);
    const res = yield safeFetch(url, __spreadValues({ headers: __spreadValues(__spreadValues({}, HEADERS2), options.headers || {}) }, options));
    if (!res || !res.ok) {
      const status = res && typeof res.status === "number" ? res.status : "no-response";
      throw new Error(`HTTP ${status} for ${url}`);
    }
    return yield res.text();
  });
}

// src/utils/armsync.js
var CINEMATA_API = "https://v3-cinemeta.strem.io";
function syncFetch(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const res = yield safeFetch(url, options);
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
      return yield expandStreamQualities(streams);
    } catch (error) {
      console.error(`[Sekai] Extraction error for ${tmdbId}:`, error);
      return [];
    }
  });
}
