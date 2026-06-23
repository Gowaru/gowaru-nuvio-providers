/**
 * sekai - Built from src/sekai/
 * Generated: 2026-06-23T17:53:11.107191048Z
 */
var __provider = (() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
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
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
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

  // src/utils/resolvers.js
  function sleep(ms) {
    const target = Date.now() + ms;
    return new Promise((resolve) => {
      const check = () => Date.now() >= target ? resolve() : Promise.resolve().then(check);
      check();
    });
  }
  function createRateLimiter(baseDelay = 1e3, jitterPercent = 0.3) {
    const lastRequest = /* @__PURE__ */ new Map();
    return function rateLimit2(domain) {
      return __async(this, null, function* () {
        const now = Date.now();
        const last = lastRequest.get(domain) || 0;
        const elapsed = now - last;
        const jitter = baseDelay * jitterPercent * (Math.random() * 2 - 1);
        const delay = Math.max(0, baseDelay + jitter - elapsed);
        if (delay > 0) {
          yield sleep(delay);
        }
        lastRequest.set(domain, Date.now());
      });
    };
  }
  function createProviderRateLimiter(baseDelay = 200, jitterPercent = 0.4) {
    return createRateLimiter(baseDelay, jitterPercent);
  }
  function createProvider(name, extractFn, opts = {}) {
    const PROVIDER_TIMEOUT = safeConfig(`NUVIO_TIMEOUT_${name.toUpperCase().replace(/[^a-z0-9]/g, "_")}`, opts.timeout || PROVIDER_BUDGET_MS);
    const qualityOpts = opts.quality || { includeCodec: true, includeFps: false };
    return function getStreams(tmdbId, mediaType, season, episode) {
      return __async(this, null, function* () {
        const se = mediaType === "movie" ? "" : ` S${season}E${episode}`;
        const label = `${name} ${mediaType} ${tmdbId}${se}`;
        console.log(`[${name}] Request: ${label}`);
        try {
          const streams = yield withTimeout(
            extractFn(tmdbId, mediaType, season, episode),
            PROVIDER_TIMEOUT,
            label
          );
          return yield expandStreamQualities(streams, qualityOpts);
        } catch (error) {
          if (error.message && error.message.includes("[Timeout]")) {
            console.warn(`[${name}] ${error.message}`);
          } else {
            console.error(`[${name}] Error:`, error && error.message || error);
          }
          return [];
        }
      });
    };
  }
  function isBudgetExhausted(startTime, budgetMs) {
    const elapsed = Date.now() - (startTime || 0);
    return elapsed > (budgetMs || TV_BUDGET_MS);
  }
  function safeConfig(key, defaultVal) {
    try {
      if (typeof process !== "undefined" && process.env && process.env[key]) {
        const val = parseInt(process.env[key], 10);
        return isNaN(val) ? defaultVal : val;
      }
    } catch (_) {
    }
    return defaultVal;
  }
  function withTimeout(promise, ms, label = "Operation") {
    return __async(this, null, function* () {
      if (!ms || ms <= 0 || typeof setTimeout === "undefined") return promise;
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)), ms);
      });
      try {
        return yield Promise.race([promise, timeout]);
      } finally {
        clearTimeout(timer);
      }
    });
  }
  function isKnownFakeDirectUrl(url) {
    if (!url || typeof url !== "string") return true;
    const u = url.toLowerCase();
    return u.includes("test-videos.co.uk") || u.includes("big_buck_bunny") || u.includes("bigbuckbunny") || u.includes("sample-videos.com") || u.includes("example.com") || u.includes("localhost");
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
  function parseCodecs(codecsStr) {
    if (!codecsStr || typeof codecsStr !== "string") return { video: null, audio: null };
    const parts = codecsStr.split(",").map((s) => s.trim());
    let video = null, audio = null;
    for (const codec of parts) {
      const base = codec.split(".")[0].toLowerCase();
      const known = CODEC_PRIORITY[base];
      if (!known) continue;
      if (["H.264", "H.265", "AV1", "VP9"].includes(known)) {
        if (!video) video = { codec: known, raw: codec };
      } else if (["AAC", "AC3", "EAC3", "Opus"].includes(known)) {
        if (!audio) audio = { codec: known, raw: codec };
      }
    }
    return { video, audio };
  }
  function getCachedManifest(key) {
    const entry = manifestCache.get(key);
    if (entry && Date.now() - entry.ts < MANIFEST_CACHE_TTL) return entry.data;
    return null;
  }
  function setCachedManifest(key, data) {
    manifestCache.set(key, { data, ts: Date.now() });
  }
  function getCachedFetch(key) {
    const entry = fetchCache.get(key);
    if (entry && Date.now() - entry.ts < FETCH_CACHE_TTL) return entry.data;
    return null;
  }
  function setCachedFetch(key, data) {
    if (fetchCache.size >= 200) fetchCache.clear();
    fetchCache.set(key, { data, ts: Date.now() });
  }
  function qualityRank(value) {
    const q = normalizeQualityLabel(value).toLowerCase();
    const match = q.match(/(\d{3,4})p/);
    const height = match ? Number(match[1]) : DEFAULT_QUALITY_TIER;
    const tier = nearestQualityTier(height);
    return STRICT_QUALITY_TIERS.length - 1 - STRICT_QUALITY_TIERS.indexOf(tier);
  }
  function appendQualityToTitle(title, quality, codec, fps) {
    const parts = [];
    const q = normalizeQualityLabel(quality);
    if (q && !(title || "").includes(q)) parts.push(q);
    if (codec && codec !== "H.264") parts.push(codec);
    if (fps && fps > 30) parts.push(`${fps}fps`);
    if (parts.length === 0) return title;
    return `${title} [${parts.join(" ")}]`;
  }
  function inferType(url) {
    if (!url || typeof url !== "string") return null;
    const u = url.toLowerCase();
    if (u.includes(".m3u8") || u.includes("/hls/") || u.includes("/hls2/") || u.includes("master.m3u8")) return "hls";
    if (u.includes(".mp4")) return "mp4";
    if (u.includes(".mkv")) return "mkv";
    if (u.includes(".webm")) return "webm";
    return null;
  }
  function inferLanguage(stream) {
    if (stream.language) return stream.language;
    const name = stream.name || "";
    const match = name.match(/\((\w+)\)/);
    if (match) {
      const lang = match[1].toUpperCase();
      if (["VF", "VOSTFR", "VO", "VOSTF", "VOA", "VOST"].includes(lang)) return lang;
    }
    return null;
  }
  function expandSingleStreamQualities(_0) {
    return __async(this, arguments, function* (stream, options = {}) {
      var _a, _b, _c, _d, _e, _f, _g;
      if (!stream || !stream.url || typeof stream.url !== "string") return [];
      const url = stream.url;
      const lower = url.toLowerCase();
      if (!lower.includes(".m3u8") && !lower.includes("/hls/")) {
        return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD"), type: inferType(url) })];
      }
      const cacheKey = url;
      if (!options.forceRefresh) {
        const cached = getCachedManifest(cacheKey);
        if (cached) return cached;
      }
      const res = yield safeFetch(url, { headers: stream.headers || {} });
      if (!res) {
        return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD"), type: "hls" })];
      }
      const manifest = yield res.text();
      if (!/#EXT-X-STREAM-INF/i.test(manifest)) {
        return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD"), type: "hls" })];
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
        const codecs = (_d = line.match(/CODECS="([^"]+)"/i)) == null ? void 0 : _d[1];
        let quality = resolution ? `${resolution}p` : null;
        if (!quality && bandwidth) {
          const bw = Number(bandwidth);
          if (bw >= 8e6) quality = "2160p";
          else if (bw >= 5e6) quality = "1080p";
          else if (bw >= 25e5) quality = "720p";
          else if (bw >= 12e5) quality = "480p";
          else quality = "360p";
        }
        if (!quality && frameRate) quality = `${normalizeQualityLabel(stream.quality || "HD")}`;
        const parsedCodec = parseCodecs(codecs);
        const fps = frameRate ? Math.round(parseFloat(frameRate)) : null;
        let variantUrl = nextLine;
        try {
          variantUrl = new URL(nextLine, url).toString();
        } catch (e) {
        }
        variants.push(__spreadProps(__spreadValues({}, stream), {
          url: variantUrl,
          quality: normalizeQualityLabel(quality || stream.quality || "HD"),
          type: "hls",
          codec: ((_e = parsedCodec.video) == null ? void 0 : _e.codec) || null,
          audioCodec: ((_f = parsedCodec.audio) == null ? void 0 : _f.codec) || null,
          fps,
          bandwidth: bandwidth ? parseInt(bandwidth) : null,
          title: appendQualityToTitle(
            stream.title || stream.name || "Stream",
            quality || stream.quality || "HD",
            options.includeCodec !== false ? (_g = parsedCodec.video) == null ? void 0 : _g.codec : null,
            options.includeFps !== false ? fps : null
          )
        }));
      }
      if (variants.length === 0) {
        return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD"), type: "hls" })];
      }
      const unique = [];
      const seen = /* @__PURE__ */ new Set();
      for (const variant of variants) {
        if (seen.has(variant.url)) continue;
        seen.add(variant.url);
        unique.push(variant);
      }
      unique.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
      const maxV = options.maxVariants || unique.length;
      const trimmed = unique.slice(0, maxV);
      setCachedManifest(cacheKey, trimmed);
      return trimmed;
    });
  }
  function filterByPreferredCodec(streams, preferred) {
    if (!preferred || !streams.length) return streams;
    const pref = preferred.toUpperCase();
    const hasPreferred = streams.some((s) => {
      var _a;
      return ((_a = s.codec) == null ? void 0 : _a.toUpperCase()) === pref;
    });
    if (!hasPreferred) return streams;
    return streams.filter((s) => {
      var _a;
      return ((_a = s.codec) == null ? void 0 : _a.toUpperCase()) === pref;
    });
  }
  function sortStreams(streams) {
    return [...streams].sort((a, b) => {
      const qDiff = qualityRank(b.quality) - qualityRank(a.quality);
      if (qDiff !== 0) return qDiff;
      if (a.codec && b.codec) {
        const getOrder = (c) => CODEC_PREFERENCE.indexOf(c) >= 0 ? CODEC_PREFERENCE.indexOf(c) : 99;
        return getOrder(a.codec) - getOrder(b.codec);
      }
      return 0;
    });
  }
  function expandStreamQualities(_0) {
    return __async(this, arguments, function* (streams, options = {}) {
      const input = Array.isArray(streams) ? streams : [];
      const expanded = [];
      const results = yield Promise.allSettled(
        input.map((stream) => expandSingleStreamQualities(stream, options))
      );
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const stream = input[i];
        if (r.status === "fulfilled") {
          for (const variant of r.value) {
            expanded.push(variant);
          }
        } else if (stream) {
          expanded.push(__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD"), type: inferType(stream.url) }));
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
      let sorted = sortStreams(deduped);
      sorted = sorted.map((s) => __spreadProps(__spreadValues({}, s), {
        type: s.type || inferType(s.url),
        language: inferLanguage(s) || s.language || null
      }));
      if (options.preferredCodec) {
        return filterByPreferredCodec(sorted, options.preferredCodec);
      }
      return sorted;
    });
  }
  function safeFetch(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const start = Date.now();
      const SLOW_THRESHOLD = 15e3;
      const method = (options.method || "GET").toUpperCase();
      const cacheKey = method + "|" + url;
      if (method === "GET") {
        const cached = getCachedFetch(cacheKey);
        if (cached) {
          return {
            text: () => Promise.resolve(cached.bodyText),
            json: () => __async(null, null, function* () {
              try {
                return JSON.parse(cached.bodyText);
              } catch (e) {
                throw e;
              }
            }),
            ok: cached.ok,
            status: cached.status,
            url: cached.finalUrl || url,
            headers: cached.headers || {}
          };
        }
      }
      try {
        const _a = options, { timeout } = _a, rest = __objRest(_a, ["timeout"]);
        const fetchOpts = __spreadProps(__spreadValues({}, rest), {
          headers: __spreadValues(__spreadValues({}, HEADERS), rest.headers),
          redirect: "follow"
        });
        if (timeout > 0 && typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "undefined") {
          fetchOpts.signal = AbortSignal.timeout(timeout);
        }
        const response = yield fetch(url, fetchOpts);
        const elapsed = Date.now() - start;
        if (elapsed > SLOW_THRESHOLD) {
          console.warn(`[safeFetch] Slow request (${elapsed}ms): ${(url || "").slice(0, 120)}`);
        }
        if (!response) return null;
        const status = response.status;
        let bodyText = "";
        try {
          bodyText = yield response.text();
        } catch (e) {
          bodyText = "";
        }
        if (method === "GET" && status >= 200 && status < 300) {
          setCachedFetch(cacheKey, {
            bodyText,
            ok: true,
            status,
            finalUrl: response.url,
            headers: response.headers
          });
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
        const elapsed = Date.now() - start;
        if (elapsed > SLOW_THRESHOLD) {
          console.warn(`[safeFetch] Slow request failed (${elapsed}ms): ${(url || "").slice(0, 120)}`);
        }
        return null;
      }
    });
  }
  var PROVIDER_BUDGET_MS, HEADERS, CODEC_PREFERENCE, TV_BUDGET_MS, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER, CODEC_PRIORITY, manifestCache, MANIFEST_CACHE_TTL, FETCH_CACHE_TTL, fetchCache;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      PROVIDER_BUDGET_MS = 45e3;
      HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Accept-Encoding": "identity"
      };
      CODEC_PREFERENCE = ["AV1", "H.265", "H.264", "VP9"];
      TV_BUDGET_MS = 5e4;
      STRICT_QUALITY_TIERS = [2160, 1080, 720, 480, 360, 240];
      DEFAULT_QUALITY_TIER = 720;
      CODEC_PRIORITY = {
        "avc1": "H.264",
        "h264": "H.264",
        "hev1": "H.265",
        "hvc1": "H.265",
        "h265": "H.265",
        "av01": "AV1",
        "av1": "AV1",
        "vp9": "VP9",
        "vp09": "VP9",
        "mp4a": "AAC",
        "ac-3": "AC3",
        "ec-3": "EAC3",
        "opus": "Opus"
      };
      manifestCache = /* @__PURE__ */ new Map();
      MANIFEST_CACHE_TTL = 12e4;
      FETCH_CACHE_TTL = 3e4;
      fetchCache = /* @__PURE__ */ new Map();
    }
  });

  // src/sekai/http.js
  function fetchText(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      yield rateLimit(DOMAIN);
      console.log(`[Sekai] Fetching: ${url}`);
      const _a = options, { headers: customHeaders } = _a, rest = __objRest(_a, ["headers"]);
      const mergedOpts = __spreadValues({
        headers: __spreadValues(__spreadValues({}, HEADERS2), customHeaders || {}),
        timeout: 1e4
      }, rest);
      const res = yield safeFetch(url, mergedOpts);
      if (!res || !res.ok) {
        const status = res && typeof res.status === "number" ? res.status : "no-response";
        throw new Error(`HTTP ${status} for ${url}`);
      }
      return yield res.text();
    });
  }
  var rateLimit, DOMAIN, HEADERS2;
  var init_http = __esm({
    "src/sekai/http.js"() {
      init_resolvers();
      rateLimit = createProviderRateLimiter();
      DOMAIN = "sekai.one";
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
      };
    }
  });

  // src/utils/armsync.js
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
  function getImdbId(tmdbId, mediaType) {
    return __async(this, null, function* () {
      if (!tmdbId) return null;
      const armRes = yield syncFetch(`${ARM_API}/themoviedb?id=${tmdbId}`);
      if (armRes) {
        try {
          const armJson = yield armRes.json();
          const data = armJson != null ? armJson : null;
          const entry = Array.isArray(data) ? data[0] : data;
          if (entry && entry.imdb) return entry.imdb;
        } catch (e) {
          console.warn(`[ArmSync] JSON parse failed for getImdbId: ${e == null ? void 0 : e.message}`);
        }
      }
      return null;
    });
  }
  function getAbsoluteEpisode(imdbId, season, episode) {
    return __async(this, null, function* () {
      var _a;
      if (!imdbId || season === 0) return null;
      const res = yield syncFetch(`${CINEMATA_API}/meta/series/${imdbId}.json`);
      if (!res) return null;
      const json = yield res.json();
      const data = json != null ? json : {};
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
  var ARM_API, CINEMATA_API;
  var init_armsync = __esm({
    "src/utils/armsync.js"() {
      init_resolvers();
      ARM_API = "https://arm.haglund.dev/api/v2";
      CINEMATA_API = "https://v3-cinemeta.strem.io";
    }
  });

  // src/utils/metadata.js
  function isLatinText(str) {
    return /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()0-9]+$/.test(str);
  }
  function parseKitsuId(id) {
    const strId = String(id);
    return strId.match(/^kitsu:(\d+)(?::(\d+))?$/);
  }
  function searchTmdbByTitle(title, mediaType) {
    return __async(this, null, function* () {
      const type = mediaType === "movie" ? "movie" : "tv";
      const encoded = encodeURIComponent(title);
      const url = `${TMDB_API_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encoded}`;
      const res = yield safeFetch(url);
      if (!res) return null;
      let data;
      try {
        data = yield res.json();
      } catch (e) {
        return null;
      }
      const results = data == null ? void 0 : data.results;
      if (!results || !results.length) return null;
      return results[0].id;
    });
  }
  function getKitsuTitles(_0, _1) {
    return __async(this, arguments, function* (kitsuId, mediaType, opts = {}) {
      var _a, _b, _c, _d, _e, _f;
      const url = `https://kitsu.io/api/edge/anime/${kitsuId}`;
      const res = yield safeFetch(url);
      if (!res) {
        console.log(`[Metadata] Kitsu API error: failed to fetch ${kitsuId}`);
        return [];
      }
      let data;
      try {
        data = yield res.json();
      } catch (e) {
        console.log(`[Metadata] Kitsu API error: invalid JSON for ${kitsuId}`);
        return [];
      }
      const anime = (_a = data == null ? void 0 : data.data) == null ? void 0 : _a.attributes;
      if (!anime) {
        console.log(`[Metadata] Kitsu API error: no anime data for ${kitsuId}`);
        return [];
      }
      const enTitle = (_c = (_b = anime.titles) == null ? void 0 : _b.en) == null ? void 0 : _c.trim();
      if (enTitle) {
        const foundTmdbId = yield searchTmdbByTitle(enTitle, mediaType);
        if (foundTmdbId) {
          console.log(`[Metadata] Kitsu ${kitsuId} -> TMDB ${foundTmdbId} via "${enTitle}"`);
          return yield getTMDBTitlesById(String(foundTmdbId), mediaType, opts);
        }
      }
      const titles = [];
      const canonicalTitle = (_d = anime.canonicalTitle) == null ? void 0 : _d.trim();
      if (enTitle) titles.push(enTitle);
      if (canonicalTitle && !titles.some((t) => t.toLowerCase() === canonicalTitle.toLowerCase())) {
        titles.push(canonicalTitle);
      }
      const jaTitle = (_f = (_e = anime.titles) == null ? void 0 : _e.ja_jp) == null ? void 0 : _f.trim();
      if (jaTitle && !titles.some((t) => t.toLowerCase() === jaTitle.toLowerCase()) && isLatinText(jaTitle)) {
        titles.push(jaTitle);
      }
      const abbrTitles = anime.abbreviatedTitles || [];
      for (const t of abbrTitles) {
        const trimmed = t == null ? void 0 : t.trim();
        if (trimmed && !titles.some((existing) => existing.toLowerCase() === trimmed.toLowerCase()) && isLatinText(trimmed)) {
          titles.push(trimmed);
        }
      }
      const season = opts.season ? parseInt(opts.season, 10) : null;
      if (season && season > 0) {
        const baseTitles = [enTitle, canonicalTitle].filter(Boolean);
        for (const baseTitle of baseTitles) {
          for (const suffix of SEASON_SUFFIXES) {
            const variant = `${baseTitle} ${suffix(season)}`;
            if (!titles.some((t) => t.toLowerCase() === variant.toLowerCase())) {
              titles.push(variant);
            }
          }
        }
      }
      console.log(`[Metadata] Kitsu fallback titles for ${kitsuId}: ${titles.join(" | ")}`);
      return titles;
    });
  }
  function getTMDBTitlesById(_0, _1) {
    return __async(this, arguments, function* (tmdbId, mediaType, opts = {}) {
      var _a, _b, _c, _d, _e, _f;
      const type = mediaType === "movie" ? "movie" : "tv";
      const titles = [];
      let metadata = null;
      try {
        const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
        const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
        const [mainRes, altRes, transRes] = yield Promise.all([
          safeFetch(mainUrl),
          safeFetch(altUrl),
          safeFetch(transUrl)
        ]);
        if (mainRes) {
          const mainJson = yield mainRes.json();
          const data = mainJson != null ? mainJson : {};
          const titleEn = (_a = type === "movie" ? data.title : data.name) == null ? void 0 : _a.trim();
          const titleOriginal = (_b = type === "movie" ? data.original_title : data.original_name) == null ? void 0 : _b.trim();
          if (data) {
            metadata = {
              isAnime: data.original_language === "ja" || (data.genres || []).some((g) => g.id === 16),
              name: data.name || data.title || "",
              originalLanguage: data.original_language || ""
            };
          }
          if (titleEn) titles.push(titleEn);
          if (titleOriginal && titleOriginal !== titleEn && isLatinText(titleOriginal)) {
            titles.push(titleOriginal);
          }
          if (mediaType === "tv" && opts.season) {
            const s = parseInt(opts.season, 10);
            if (s > 0 && titleEn) {
              for (const suffix of SEASON_SUFFIXES) {
                const variant = `${titleEn} ${suffix(s)}`;
                if (!titles.includes(variant)) titles.push(variant);
              }
            }
            if (s > 0 && titleOriginal && titleOriginal !== titleEn && isLatinText(titleOriginal)) {
              for (const suffix of SEASON_SUFFIXES) {
                const variant = `${titleOriginal} ${suffix(s)}`;
                if (!titles.includes(variant)) titles.push(variant);
              }
            }
          }
        }
        if (altRes) {
          const altJson = yield altRes.json();
          const altData = altJson != null ? altJson : {};
          const altList = type === "movie" ? altData.titles : altData.results;
          if (altList && Array.isArray(altList)) {
            altList.forEach((alt) => {
              var _a2;
              const t = (_a2 = alt.title) == null ? void 0 : _a2.trim();
              if (t && !titles.some((existing) => existing.toLowerCase() === t.toLowerCase()) && isLatinText(t)) {
                titles.push(t);
              }
            });
          }
        }
        if (transRes) {
          const transJson = yield transRes.json();
          const transData = transJson != null ? transJson : {};
          const frTrans = (transData.translations || []).find((t) => t.iso_639_1 === "fr");
          const titleFr = ((_d = (_c = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _c.name) == null ? void 0 : _d.trim()) || ((_f = (_e = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _e.title) == null ? void 0 : _f.trim());
          if (titleFr && !titles.some((existing) => existing.toLowerCase() === titleFr.toLowerCase())) {
            titles.splice(1, 0, titleFr);
          }
          if (mediaType === "tv" && opts.season && titleFr) {
            const s = parseInt(opts.season, 10);
            if (s > 0) {
              const frVar = `${titleFr} Saison ${s}`;
              if (!titles.some((existing) => existing.toLowerCase() === frVar.toLowerCase())) {
                const frIndex = titles.indexOf(titleFr);
                if (frIndex !== -1) {
                  titles.splice(frIndex + 1, 0, frVar);
                } else {
                  titles.splice(2, 0, frVar);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(`[Metadata] TMDB API error: ${e.message}`);
      }
      const seen = /* @__PURE__ */ new Set();
      const uniqueTitles = titles.filter((t) => {
        const key = t.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (metadata) {
        uniqueTitles._metadata = metadata;
      }
      console.log(`[Metadata] Titles for ${tmdbId}: ${uniqueTitles.join(" | ")}`);
      return uniqueTitles;
    });
  }
  function kitsuSearchFallback(tmdbName, mediaType, opts) {
    return __async(this, null, function* () {
      var _a, _b, _c, _d, _e, _f;
      try {
        if (!tmdbName || tmdbName.length < 3) return [];
        const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(tmdbName)}&page[limit]=5`;
        const res = yield safeFetch(url);
        if (!res) return [];
        const data = yield res.json();
        if (!((_a = data == null ? void 0 : data.data) == null ? void 0 : _a.length)) return [];
        for (const anime of data.data) {
          const attrs = anime.attributes || {};
          const jaTitle = (_c = (_b = attrs.titles) == null ? void 0 : _b.ja_jp) == null ? void 0 : _c.trim();
          const canonicalTitle = (_d = attrs.canonicalTitle) == null ? void 0 : _d.trim();
          const enTitle = ((_f = (_e = attrs.titles) == null ? void 0 : _e.en) == null ? void 0 : _f.trim()) || canonicalTitle;
          if (!jaTitle && attrs.originalLanguage !== "ja") continue;
          if (!enTitle) continue;
          console.log(`[Metadata] Kitsu search: "${tmdbName}" \u2192 "${enTitle}" (ja=${!!jaTitle})`);
          const foundTmdbId = yield searchTmdbByTitle(enTitle, mediaType);
          if (foundTmdbId) {
            const altTitles = yield getTMDBTitlesById(String(foundTmdbId), mediaType, opts);
            const meta = altTitles._metadata;
            if (meta && meta.isAnime) {
              console.log(`[Metadata] Fallback success: TMDB ID ${foundTmdbId} for "${enTitle}"`);
              return altTitles;
            }
          }
          console.log(`[Metadata] Fallback: using Kitsu titles directly for ${anime.id}`);
          return yield getKitsuTitles(anime.id, mediaType, opts);
        }
        console.log(`[Metadata] Kitsu search: no valid results for "${tmdbName}"`);
        return [];
      } catch (e) {
        console.warn(`[Metadata] Kitsu fallback error: ${e.message}`);
        return [];
      }
    });
  }
  function getTmdbTitles(_0, _1) {
    return __async(this, arguments, function* (id, mediaType, opts = {}) {
      const kitsuMatch = parseKitsuId(id);
      let effectiveSeason = opts.season != null ? opts.season : null;
      console.log(`[Metadata] getTmdbTitles: id="${id}" type="${mediaType}" season=${opts.season}`);
      if (kitsuMatch) {
        const kitsuId = kitsuMatch[1];
        const seasonFromId = kitsuMatch[2] ? parseInt(kitsuMatch[2], 10) : null;
        effectiveSeason = opts.season != null ? opts.season : seasonFromId;
        console.log(`[Metadata] Kitsu ID detected: ${kitsuId}, season=${effectiveSeason}`);
        const titles2 = yield getKitsuTitles(kitsuId, mediaType, __spreadProps(__spreadValues({}, opts), { season: effectiveSeason }));
        titles2.effectiveSeason = effectiveSeason;
        return titles2;
      }
      if (!id) {
        console.error(`[Metadata] Invalid/null TMDB ID received: "${id}"`);
        const emptyTitles = [];
        emptyTitles.effectiveSeason = effectiveSeason;
        return emptyTitles;
      }
      const titles = yield getTMDBTitlesById(id, mediaType, opts);
      if (mediaType === "tv" && titles.length > 0 && titles._metadata) {
        const meta = titles._metadata;
        if (!meta.isAnime) {
          console.warn(`[Metadata] \u26A0 ID ${id} = "${meta.name}" (${meta.originalLanguage}) - not anime!`);
          const hasJapaneseName = /[\u3000-\u9FFF\uF900-\uFAFF]/.test(meta.name || "");
          const hasJapaneseLang = meta.originalLanguage === "ja";
          if (hasJapaneseLang || hasJapaneseName) {
            const altTitles = yield kitsuSearchFallback(titles[0], mediaType, opts);
            if (altTitles.length > 0) {
              console.log(`[Metadata] Fallback success: ${altTitles.length} alternative titles`);
              altTitles.effectiveSeason = effectiveSeason;
              return altTitles;
            }
            console.warn(`[Metadata] Kitsu fallback failed for "${meta.name}", using original titles`);
          } else {
            console.log(`[Metadata] No anime indicators, skipping Kitsu fallback for "${meta.name}"`);
          }
        } else {
          console.log(`[Metadata] \u2713 ID ${id}: "${meta.name}" confirmed anime (${meta.originalLanguage})`);
        }
      }
      titles.effectiveSeason = effectiveSeason;
      return titles;
    });
  }
  var TMDB_API_KEY, TMDB_API_BASE, SEASON_SUFFIXES;
  var init_metadata = __esm({
    "src/utils/metadata.js"() {
      init_resolvers();
      TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
      TMDB_API_BASE = "https://api.themoviedb.org/3";
      SEASON_SUFFIXES = [
        (s) => `Season ${s}`,
        (s) => `Saison ${s}`,
        (s) => `S${s}`
      ];
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
  function getSeriesData() {
    return __async(this, null, function* () {
      const now = Date.now();
      if (seriesCache && now - seriesCacheTs < CACHE_TTL) {
        console.log(`[Sekai] Using cached seriesData (${Math.round((now - seriesCacheTs) / 1e3)}s old)`);
        return seriesCache;
      }
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
      seriesCache = results;
      seriesCacheTs = Date.now();
      return results;
    });
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
  function extractStreams(tmdbId, mediaType, season, episodeNum) {
    return __async(this, null, function* () {
      const startTime = Date.now();
      const titles = yield getTmdbTitles(tmdbId, mediaType, { season });
      if (!titles || titles.length === 0) return [];
      const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
      let absEp = mediaType === "movie" ? 1 : episodeNum;
      if (mediaType === "tv" && !isBudgetExhausted(startTime, BUDGET_MS)) {
        try {
          const imdbId = yield getImdbId(tmdbId, mediaType);
          if (imdbId && !isBudgetExhausted(startTime, BUDGET_MS)) {
            const resolved = yield getAbsoluteEpisode(imdbId, season, episodeNum);
            if (resolved) absEp = resolved;
          }
        } catch (e) {
          console.warn(`[Sekai] ArmSync failed: ${e == null ? void 0 : e.message}`);
        }
      }
      console.log(`[Sekai] Checking ${mediaType} S${season} E${episodeNum} -> Absolute: ${absEp}`);
      const allSeries = yield getSeriesData();
      if (allSeries.length === 0) return [];
      let targetSeries = null;
      let targetScore = 0;
      for (const t of titles) {
        if (!t || targetScore >= 100) continue;
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        const nt = normalizeTitle(t);
        if (!nt || nt.length < 2) continue;
        for (const s of allSeries) {
          if (targetScore >= 100) break;
          let score = scoreMatch(nt, normalizeTitle(s.title));
          if (score > targetScore) {
            targetScore = score;
            targetSeries = s;
          }
          for (const a of s.aliases) {
            if (targetScore >= 100) break;
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
      const mainHtml = yield fetchText(targetSeries.url);
      let mainEpMap = buildEpisodeMap(mainHtml);
      if (mainEpMap[absEp] && Object.keys(mainEpMap[absEp]).length > 0) {
        return formatStreams(mainEpMap[absEp]);
      }
      const arcsUrls = extractArcsUrls(mainHtml, targetSeries.url).slice(0, 3);
      console.log(`[Sekai] Found ${arcsUrls.length} arcs. Fetching...`);
      if (!isBudgetExhausted(startTime, BUDGET_MS) && arcsUrls.length > 0) {
        const arcsHtmls = yield Promise.all(arcsUrls.map((u) => fetchText(u).catch(() => "")));
        for (const html of arcsHtmls) {
          if (!html || isBudgetExhausted(startTime, BUDGET_MS)) continue;
          const arcMap = buildEpisodeMap(html);
          if (arcMap[absEp] && Object.keys(arcMap[absEp]).length > 0) {
            mainEpMap = arcMap;
            break;
          }
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
  var BASE_URL, BUDGET_MS, CACHE_TTL, seriesCache, seriesCacheTs;
  var init_extractor = __esm({
    "src/sekai/extractor.js"() {
      init_http();
      init_resolvers();
      init_armsync();
      init_metadata();
      BASE_URL = "https://sekai.one";
      BUDGET_MS = 4e4;
      CACHE_TTL = 3e5;
      seriesCache = null;
      seriesCacheTs = 0;
    }
  });

  // src/sekai/index.js
  var require_index = __commonJS({
    "src/sekai/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      module.exports = { getStreams: createProvider("Sekai", extractStreams) };
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
