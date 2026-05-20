/**
 * sekai - Built from src/sekai/
 * Generated: 2026-05-20T18:33:10.69099068Z
 */
var __provider = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/utils/streamConfig.js
  function configure(options = {}) {
    for (const key of Object.keys(DEFAULTS)) {
      if (options[key] !== void 0) config[key] = options[key];
    }
  }
  function getConfig() {
    return { ...config };
  }
  var DEFAULTS, config;
  var init_streamConfig = __esm({
    "src/utils/streamConfig.js"() {
      DEFAULTS = {
        preferredQuality: null,
        preferredLanguage: null,
        preferredFormats: ["m3u8", "mp4", "mkv"],
        maxStreams: 10,
        strictMode: false
      };
      config = { ...DEFAULTS };
    }
  });

  // src/utils/resolvers.js
  function isKnownFakeDirectUrl(url) {
    if (!url || typeof url !== "string") return true;
    const u = url.toLowerCase();
    return u.includes("test-videos.co.uk") || u.includes("big_buck_bunny") || u.includes("bigbuckbunny") || u.includes("sample-videos.com") || u.includes("example.com") || u.includes("localhost");
  }
  function deriveFormat(url) {
    const u = (url || "").toLowerCase();
    if (u.includes(".m3u8") || u.includes("/hls2/") || u.includes("/master.m3u8")) return "m3u8";
    if (u.includes(".mp4")) return "mp4";
    if (u.includes(".mkv")) return "mkv";
    if (u.includes(".webm")) return "webm";
    if (u.includes(".ts")) return "ts";
    return "unknown";
  }
  function deriveLanguage(name, title) {
    const text = ((name || "") + " " + (title || "")).toUpperCase();
    if (/\b(?:VOSTFR|VOST)\b/.test(text)) return "VOSTFR";
    if (/\b(?:VF(?!O)|FRENCH|FRANÇAIS|FRANCAIS)\b/.test(text)) return "VF";
    if (/\b(?:MULTI|MULTILANGUE)\b/.test(text)) return "MULTI";
    if (/\bVO\b/.test(text)) return "VO";
    return "unknown";
  }
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
  async function expandSingleStreamQualities(stream) {
    if (!stream || !stream.url || typeof stream.url !== "string") return [];
    const url = stream.url;
    const lower = url.toLowerCase();
    if (!lower.includes(".m3u8") && !lower.includes("/hls/")) {
      return [{ ...stream, quality: normalizeQualityLabel(stream.quality || "HD") }];
    }
    const res = await safeFetch(url, { headers: stream.headers || {} });
    if (!res) {
      return [{ ...stream, quality: normalizeQualityLabel(stream.quality || "HD") }];
    }
    const manifest = await res.text();
    if (!/#EXT-X-STREAM-INF/i.test(manifest)) {
      return [{ ...stream, quality: normalizeQualityLabel(stream.quality || "HD") }];
    }
    const lines = manifest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const variants = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
      const nextLine = lines[index + 1];
      if (!nextLine || nextLine.startsWith("#")) continue;
      const resolution = line.match(/RESOLUTION=\d+x(\d+)/i)?.[1];
      const frameRate = line.match(/FRAME-RATE=([0-9.]+)/i)?.[1];
      const bandwidth = line.match(/BANDWIDTH=(\d+)/i)?.[1];
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
      variants.push({
        ...stream,
        url: variantUrl,
        quality: normalizeQualityLabel(quality || stream.quality || "HD"),
        title: appendQualityToTitle(stream.title || stream.name || "Stream", quality || stream.quality || "HD")
      });
    }
    if (variants.length === 0) {
      return [{ ...stream, quality: normalizeQualityLabel(stream.quality || "HD") }];
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
  }
  async function expandStreamQualities(streams) {
    const input = Array.isArray(streams) ? streams : [];
    const expanded = [];
    for (const stream of input) {
      try {
        const variants = await expandSingleStreamQualities(stream);
        for (const variant of variants) {
          expanded.push(variant);
        }
      } catch (e) {
        if (stream) expanded.push({ ...stream, quality: normalizeQualityLabel(stream.quality || "HD") });
      }
    }
    const enriched = [];
    const seen = /* @__PURE__ */ new Set();
    for (const stream of expanded) {
      if (!stream?.url) continue;
      if (isKnownFakeDirectUrl(stream.url)) continue;
      if (seen.has(stream.url)) continue;
      seen.add(stream.url);
      enriched.push({
        ...stream,
        format: stream.format || deriveFormat(stream.url),
        language: stream.language || deriveLanguage(stream.name, stream.title)
      });
    }
    const cfg = getConfig();
    let filtered = enriched;
    if (cfg.preferredLanguage) {
      const lang = cfg.preferredLanguage.toUpperCase();
      filtered = filtered.filter((s) => {
        if (s.language === "unknown") return true;
        if (s.language === lang) return true;
        return false;
      });
    }
    if (cfg.strictMode && cfg.preferredFormats) {
      const formats = cfg.preferredFormats.map((f) => f.toLowerCase());
      filtered = filtered.filter((s) => formats.includes(s.format));
    }
    const formatOrder = (cfg.preferredFormats || ["m3u8", "mp4", "mkv"]).map((f) => f.toLowerCase());
    const qualityMatch = cfg.preferredQuality ? cfg.preferredQuality.toLowerCase() : null;
    filtered.sort((a, b) => {
      const aQual = a.quality?.toLowerCase() || "";
      const bQual = b.quality?.toLowerCase() || "";
      if (qualityMatch) {
        const aMatch = aQual.includes(qualityMatch) || qualityMatch.includes(aQual);
        const bMatch = bQual.includes(qualityMatch) || qualityMatch.includes(bQual);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
      }
      const aRank = qualityRank(b.quality) - qualityRank(a.quality);
      if (aRank !== 0) return aRank;
      const aFmt = formatOrder.indexOf(a.format);
      const bFmt = formatOrder.indexOf(b.format);
      const aFmtRank = aFmt >= 0 ? aFmt : 999;
      const bFmtRank = bFmt >= 0 ? bFmt : 999;
      return aFmtRank - bFmtRank;
    });
    if (cfg.maxStreams > 0 && filtered.length > cfg.maxStreams) {
      filtered = filtered.slice(0, cfg.maxStreams);
    }
    return filtered;
  }
  async function safeFetch(url, options = {}) {
    try {
      const { timeout, ...rest } = options;
      const fetchOpts = {
        ...rest,
        headers: { ...HEADERS, ...rest.headers },
        redirect: "follow"
      };
      if (timeout > 0 && typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
        fetchOpts.signal = AbortSignal.timeout(timeout);
      }
      const response = await fetch(url, fetchOpts);
      if (!response) return null;
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch (e) {
        return null;
      }
      if (bodyText.length === 0 && response.ok) {
        return null;
      }
      return {
        text: () => Promise.resolve(bodyText),
        json: async () => {
          try {
            return JSON.parse(bodyText);
          } catch (e) {
            throw e;
          }
        },
        ok: response.ok,
        status: response.status,
        url: response.url,
        headers: response.headers
      };
    } catch (e) {
      return null;
    }
  }
  var HEADERS, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      init_streamConfig();
      HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Accept-Encoding": "identity"
      };
      STRICT_QUALITY_TIERS = [2160, 1080, 720, 480, 360, 240];
      DEFAULT_QUALITY_TIER = 360;
    }
  });

  // src/sekai/http.js
  async function fetchText(url, options = {}) {
    console.log(`[Sekai] Fetching: ${url}`);
    const res = await safeFetch(url, { headers: { ...HEADERS2, ...options.headers || {} }, ...options });
    if (!res || !res.ok) {
      const status = res && typeof res.status === "number" ? res.status : "no-response";
      throw new Error(`HTTP ${status} for ${url}`);
    }
    return await res.text();
  }
  var HEADERS2;
  var init_http = __esm({
    "src/sekai/http.js"() {
      init_resolvers();
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
      };
    }
  });

  // src/utils/armsync.js
  async function syncFetch(url, options = {}) {
    try {
      const res = await safeFetch(url, options);
      return res;
    } catch (e) {
      console.error(`[ArmSync] Fetch failed: ${url}`, e.message);
      return null;
    }
  }
  async function getImdbId(tmdbId, mediaType) {
    if (!tmdbId) return null;
    const armRes = await syncFetch(`${ARM_API}/themoviedb?id=${tmdbId}`);
    if (armRes) {
      try {
        const data = await armRes.json();
        const entry = Array.isArray(data) ? data[0] : data;
        if (entry && entry.imdb) return entry.imdb;
      } catch (e) {
      }
    }
    const tmdbUrl = `https://www.themoviedb.org/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`;
    const tmdbRes = await syncFetch(tmdbUrl);
    if (tmdbRes) {
      const html = await tmdbRes.text();
      const imdbMatch = html.match(/imdb\.com\/title\/(tt\d+)/);
      if (imdbMatch) return imdbMatch[1];
    }
    return null;
  }
  async function getAbsoluteEpisode(imdbId, season, episode) {
    if (!imdbId || season === 0) return null;
    const res = await syncFetch(`${CINEMATA_API}/meta/series/${imdbId}.json`);
    if (!res) return null;
    const data = await res.json();
    if (!data?.meta?.videos) return null;
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
  }
  var ARM_API, CINEMATA_API;
  var init_armsync = __esm({
    "src/utils/armsync.js"() {
      init_resolvers();
      ARM_API = "https://arm.haglund.dev/api/v2";
      CINEMATA_API = "https://v3-cinemeta.strem.io";
    }
  });

  // src/utils/metadata.js
  async function tryFetchTitle(url, processor) {
    try {
      const res = await safeFetch(url);
      if (res) {
        const data = await res.json();
        return processor(data);
      }
    } catch (e) {
      console.log(`[Metadata] Skipping endpoint: ${e.message}`);
    }
    return null;
  }
  async function getTmdbTitles(tmdbId, mediaType) {
    const type = mediaType === "movie" ? "movie" : "tv";
    const titles = [];
    const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
    await tryFetchTitle(mainUrl, (data) => {
      const titleEn = (type === "movie" ? data.title : data.name)?.trim();
      const titleOriginal = (type === "movie" ? data.original_title : data.original_name)?.trim();
      if (titleEn) titles.push(titleEn);
      if (titleOriginal && titleOriginal !== titleEn && /^[\x00-\x7F\u00C0-\u024F\s]+$/.test(titleOriginal)) {
        titles.push(titleOriginal);
      }
    });
    const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
    await tryFetchTitle(transUrl, (transData) => {
      const frTrans = (transData.translations || []).find((t) => t.iso_639_1 === "fr");
      const titleFr = frTrans?.data?.name?.trim() || frTrans?.data?.title?.trim();
      if (titleFr && !titles.includes(titleFr)) {
        titles.push(titleFr);
      }
    });
    const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
    await tryFetchTitle(altUrl, (altData) => {
      const altList = type === "movie" ? altData.titles : altData.results;
      if (altList && Array.isArray(altList)) {
        const isLatin = (str) => /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()]+$/.test(str);
        altList.forEach((alt) => {
          const t = alt.title?.trim();
          if (t && !titles.some((existing) => existing.toLowerCase() === t.toLowerCase()) && isLatin(t)) {
            if (alt.type === "Romaji" || alt.iso_3166_1 === "US" || alt.iso_3166_1 === "FR") {
              titles.splice(1, 0, t);
            } else {
              titles.push(t);
            }
          }
        });
      }
    });
    const uniqueTitles = [...new Set(titles)];
    console.log(`[Metadata] Titles for ${tmdbId}: ${uniqueTitles.join(" | ")}`);
    return uniqueTitles;
  }
  var TMDB_API_KEY, TMDB_API_BASE;
  var init_metadata = __esm({
    "src/utils/metadata.js"() {
      init_resolvers();
      TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
      TMDB_API_BASE = "https://api.themoviedb.org/3";
    }
  });

  // src/sekai/extractor.js
  function normalizeTitle(s) {
    if (!s) return "";
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[':!.,?]/g, "").replace(/\b(the|season|part|cour)\b/ig, "").replace(/\s+/g, " ").trim();
  }
  function scoreMatch(searchTerm, candidate) {
    if (!searchTerm || !candidate) return 0;
    if (searchTerm === candidate) return 100;
    if (candidate.includes(searchTerm) && searchTerm.length >= 4) return 80;
    if (searchTerm.includes(candidate) && candidate.length >= 4) return 70;
    return 0;
  }
  async function getSeriesData() {
    const html = await fetchText(`${BASE_URL}/`);
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
  }
  function buildEpisodeMap(html) {
    const epMap = {};
    const b64Regex = /var\s+([a-zA-Z0-9_]+)\s*=\s*atob\("([^"]+)"\)/g;
    const constants = {};
    let embedPrefix = null;
    let embedPrefixName = null;
    for (const match of html.matchAll(b64Regex)) {
      const varName = match[1];
      const decoded = atob(match[2]);
      constants[varName] = decoded;
      if (/embed-?$/.test(decoded) || /mugiwara/.test(decoded)) {
        if (!embedPrefix || varName === "mugiwara") {
          embedPrefix = decoded;
          embedPrefixName = varName;
        }
      }
    }
    const scriptBlocks = html.match(/<script>[\s\S]*?<\/script>/g);
    if (!scriptBlocks) return epMap;
    const jsCode = scriptBlocks.join("\n");
    const numConstants = {};
    const varLastRegex = /var\s+([a-zA-Z0-9_]+)\s*=\s*(\d+);/g;
    for (const match of jsCode.matchAll(varLastRegex)) {
      numConstants[match[1]] = parseInt(match[2]);
    }
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
    const loopRegex = /for\s*\(\s*var\s+num\s*=\s*(\d+);\s*num\s*<=\s*([0-9a-zA-Z_]+);\s*num\+\+\s*\)\s*\{([^}]+)\}/g;
    for (const match of jsCode.matchAll(loopRegex)) {
      const start = parseInt(match[1]);
      const endVar = match[2];
      const end = isNaN(parseInt(endVar)) ? numConstants[endVar] || 1e3 : parseInt(endVar);
      const body = match[3];
      const bodyRegex = /(episode(?:HD|Low)?)\s*\[\s*num\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*\+\s*(?:num)\s*\+\s*['"](\.mp4)['"]\s*;/g;
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
    const hrefRegex = /href="([^"]*arc[^"]*)"/gi;
    for (const match of html.matchAll(hrefRegex)) {
      let uri = match[1];
      if (uri.includes("arc-") && !uri.includes("?") && !uri.startsWith("http") && !uri.startsWith("#")) {
        const fullUrl = (baseUrl.replace(/\?.*$/, "") + "/" + uri).replace(/([^:]\/)\/+/g, "$1");
        arcs.push(fullUrl);
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
  async function extractStreams(tmdbId, mediaType, season, episodeNum) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];
    let absEp = mediaType === "movie" ? 1 : episodeNum;
    if (mediaType === "tv") {
      try {
        const imdbId = await getImdbId(tmdbId, mediaType);
        if (imdbId) {
          const resolved = await getAbsoluteEpisode(imdbId, season, episodeNum);
          if (resolved) absEp = resolved;
        }
      } catch (e) {
      }
    }
    console.log(`[Sekai] Checking ${mediaType} S${season} E${episodeNum} -> Absolute: ${absEp}`);
    const allSeries = await getSeriesData();
    if (allSeries.length === 0) return [];
    let targetSeries = null;
    let targetScore = 0;
    for (const t of titles) {
      if (!t) continue;
      const nt = normalizeTitle(t);
      if (!nt || nt.length < 2) continue;
      for (const s of allSeries) {
        let score = scoreMatch(nt, normalizeTitle(s.title));
        if (score > targetScore) {
          targetScore = score;
          targetSeries = s;
        }
        for (const a of s.aliases) {
          const na = normalizeTitle(a);
          score = scoreMatch(nt, na);
          if (score > 0 && score - 5 > targetScore) {
            targetScore = score - 5;
            targetSeries = s;
          }
        }
      }
    }
    if (!targetSeries) {
      console.log(`[Sekai] No series match found for tmdbId ${tmdbId}`);
      return [];
    }
    console.log(`[Sekai] Matched Series: ${targetSeries.title} (${targetSeries.url})`);
    const mainHtml = await fetchText(targetSeries.url);
    let mainEpMap = buildEpisodeMap(mainHtml);
    if (mainEpMap[absEp] && Object.keys(mainEpMap[absEp]).length > 0) {
      return formatStreams(mainEpMap[absEp]);
    }
    let arcsUrls = extractArcsUrls(mainHtml, targetSeries.url);
    console.log(`[Sekai] Found ${arcsUrls.length} arcs. Fetching...`);
    const arcsHtmls = await Promise.all(arcsUrls.map((u) => fetchText(u).catch(() => "")));
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
  var BASE_URL;
  var init_extractor = __esm({
    "src/sekai/extractor.js"() {
      init_http();
      init_armsync();
      init_metadata();
      BASE_URL = "https://sekai.one";
    }
  });

  // src/sekai/index.js
  var require_index = __commonJS({
    "src/sekai/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      async function getStreams(tmdbId, mediaType, season, episode) {
        console.log(`[Sekai] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
        try {
          const streams = await extractStreams(tmdbId, mediaType, season, episode);
          const result = await expandStreamQualities(streams);
          return result;
        } catch (error) {
          console.error(`[Sekai] Extraction error for ${tmdbId}:`, error);
          return [];
        }
      }
      module.exports = { getStreams, configureStreamConfig: configure };
    }
  });
  return require_index();
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = __provider;
}
if (__provider && __provider.getStreams) {
    if (typeof globalThis !== 'undefined') {
        globalThis.getStreams = __provider.getStreams;
    }
    if (typeof global !== 'undefined') {
        global.getStreams = __provider.getStreams;
    }
    if (typeof self !== 'undefined') {
        self.getStreams = __provider.getStreams;
    }
}
