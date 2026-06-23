/**
 * movix - Built from src/movix/
 * Generated: 2026-06-23T17:53:11.027190978Z
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
  function isPlayableMediaUrl(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.toLowerCase();
    if (isKnownFakeDirectUrl(u)) return false;
    return /\.(mp4|m3u8|mkv|webm)(\?.*)?$/.test(u) || u.includes("/hls2/") || u.includes("/master.m3u8");
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
  function unpack(code) {
    try {
      if (!code.includes("p,a,c,k,e,d")) return code;
      const extractEvalBlocks = (input) => {
        const blocks2 = [];
        let pos = 0;
        while (true) {
          const start = input.indexOf("eval(function(p,a,c,k,e,d)", pos);
          if (start === -1) break;
          let i = start;
          let depth = 0;
          let inSingle = false;
          let inDouble = false;
          let escaped = false;
          for (; i < input.length; i++) {
            const ch = input[i];
            if (escaped) {
              escaped = false;
              continue;
            }
            if (ch === "\\") {
              escaped = true;
              continue;
            }
            if (!inDouble && ch === "'") inSingle = !inSingle;
            else if (!inSingle && ch === '"') inDouble = !inDouble;
            if (inSingle || inDouble) continue;
            if (ch === "(") depth++;
            else if (ch === ")") {
              depth--;
              if (depth === 0) {
                i++;
                break;
              }
            }
          }
          if (i > start) blocks2.push(input.slice(start, i));
          pos = i;
        }
        return blocks2;
      };
      const decodeBlock = (block) => {
        const parseString = (src, start) => {
          const quote = src[start];
          if (quote !== "'" && quote !== '"') return null;
          let i2 = start + 1;
          let out = "";
          let escaped = false;
          for (; i2 < src.length; i2++) {
            const ch = src[i2];
            if (escaped) {
              out += ch;
              escaped = false;
              continue;
            }
            if (ch === "\\") {
              escaped = true;
              continue;
            }
            if (ch === quote) return { value: out, end: i2 + 1 };
            out += ch;
          }
          return null;
        };
        const skipWs = (src, i2) => {
          while (i2 < src.length && /\s/.test(src[i2])) i2++;
          return i2;
        };
        const parseIntAt = (src, i2) => {
          i2 = skipWs(src, i2);
          const m = src.slice(i2).match(/^\d+/);
          if (!m) return null;
          return { value: parseInt(m[0], 10), end: i2 + m[0].length };
        };
        const callStart = block.indexOf("}(");
        if (callStart === -1) return null;
        let i = callStart + 2;
        i = skipWs(block, i);
        const pStr = parseString(block, i);
        if (!pStr) return null;
        let p = pStr.value;
        i = skipWs(block, pStr.end);
        if (block[i] !== ",") return null;
        const aNum = parseIntAt(block, i + 1);
        if (!aNum) return null;
        const a = aNum.value;
        i = skipWs(block, aNum.end);
        if (block[i] !== ",") return null;
        const cNum = parseIntAt(block, i + 1);
        if (!cNum) return null;
        let c = cNum.value;
        i = skipWs(block, cNum.end);
        if (block[i] !== ",") return null;
        const kStr = parseString(block, skipWs(block, i + 1));
        if (!kStr) return null;
        const splitPart = block.slice(kStr.end, kStr.end + 20);
        if (!/\.split\(\s*['"]\|['"]\s*\)/.test(splitPart)) return null;
        const k = kStr.value.split("|");
        const e = (x) => (x < a ? "" : e(parseInt(x / a, 10))) + ((x = x % a) > 35 ? String.fromCharCode(x + 29) : x.toString(36));
        const dict = {};
        while (c--) dict[e(c)] = k[c] || e(c);
        return p.replace(/\b\w+\b/g, (w) => dict[w] || w);
      };
      let result = code;
      const blocks = extractEvalBlocks(code);
      for (const block of blocks) {
        try {
          const decoded = decodeBlock(block);
          if (decoded) result = result.replace(block, decoded);
        } catch (e) {
        }
      }
      return result;
    } catch (err) {
      return code;
    }
  }
  function resolveSibnet(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url, { headers: { "Referer": "https://video.sibnet.ru/" } });
        if (!res) return { url };
        const html = yield res.text();
        const match = html.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i) || html.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i) || html.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)["']/i);
        if (match) {
          let videoUrl = match[1];
          if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;
          else if (videoUrl.startsWith("/")) videoUrl = "https://video.sibnet.ru" + videoUrl;
          return { url: videoUrl, headers: { "Referer": "https://video.sibnet.ru/" } };
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveVidmoly(url) {
    return __async(this, null, function* () {
      var _a, _b;
      try {
        const originalDomain = ((_a = url.match(/^https?:\/\/([^/]+)/)) == null ? void 0 : _a[1]) || "";
        const originalReferer = originalDomain ? `https://${originalDomain}/` : "https://vidmoly.me/";
        const tldVariants = ["biz", "me", "net", "to", "ru", "is"];
        const domains = [url];
        for (const tld of tldVariants) {
          const altUrl = url.replace(/vidmoly\.(net|to|ru|is|biz|me)/, `vidmoly.${tld}`);
          if (altUrl !== url) domains.push(altUrl);
        }
        const uniqueDomains = [...new Set(domains)].slice(0, 4);
        for (const fetchUrl of uniqueDomains) {
          try {
            const fetchDomain = ((_b = fetchUrl.match(/^https?:\/\/([^/]+)/)) == null ? void 0 : _b[1]) || "";
            const ref = fetchDomain ? `https://${fetchDomain}/` : originalReferer;
            let res = yield safeFetch(fetchUrl, { headers: { "Referer": ref, "Origin": ref } });
            if (!res || !res.ok) continue;
            let html = yield res.text();
            if (html.length < 500 || html.includes("finisheddaysflamboyant")) continue;
            if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
            const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
            if (match) return { url: match[1], headers: { "Referer": ref, "Origin": ref } };
            const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) || html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
            if (jsRedirect && jsRedirect[1] !== fetchUrl) {
              res = yield safeFetch(jsRedirect[1], { headers: { "Referer": ref, "Origin": ref } });
              if (res) {
                html = yield res.text();
                if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
                const match2 = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                if (match2) return { url: match2[1], headers: { "Referer": ref, "Origin": ref } };
              }
            }
          } catch (e) {
          }
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveUqload(url) {
    return __async(this, null, function* () {
      var _a;
      const normalizedPath = url.replace(/^https?:\/\/[^/]+/, "");
      const originalDomain = ((_a = url.match(/^https?:\/\/([^/]+)/)) == null ? void 0 : _a[1]) || "uqload.co";
      const fallbackDomains = [originalDomain];
      if (originalDomain.endsWith(".bz")) fallbackDomains.push("uqload.co", "uqload.to");
      if (originalDomain.endsWith(".to")) fallbackDomains.push("uqload.co");
      const uniqueDomains = [...new Set(fallbackDomains)];
      return new Promise((resolve) => {
        let failures = 0;
        let resolved = false;
        const checkDomain = (domain) => __async(null, null, function* () {
          try {
            const tryUrl = `https://${domain}${normalizedPath}`;
            const ref = `https://${domain}/`;
            const res = yield safeFetch(tryUrl, { headers: __spreadProps(__spreadValues({}, HEADERS), { "Referer": ref }) });
            if (res) {
              const html = yield res.text();
              const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) || html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/);
              if (match && !resolved) {
                resolved = true;
                resolve({ url: match[1], headers: { "Referer": ref } });
                return;
              }
            }
          } catch (e) {
          }
          failures++;
          if (failures === uniqueDomains.length && !resolved) {
            resolve({ url });
          }
        });
        uniqueDomains.forEach(checkDomain);
      });
    });
  }
  function resolveVoe(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url);
        if (!res) return { url };
        let html = yield res.text();
        let fetchUrl = url;
        const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (redirect) {
          fetchUrl = redirect[1];
          const res2 = yield safeFetch(fetchUrl);
          if (res2) html = yield res2.text();
        }
        if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
        const match = html.match(/'hls'\s*:\s*'([^']+)'/) || html.match(/"hls"\s*:\s*"([^"]+)"/) || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
        if (match) {
          let videoUrl = match[1] || match[0];
          if (videoUrl.includes("base64")) videoUrl = _atob(videoUrl.split(",")[1] || videoUrl);
          if (isKnownFakeDirectUrl(videoUrl)) return { url };
          return { url: videoUrl, headers: { "Referer": fetchUrl } };
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveStreamtape(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url);
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("p,a,c,k,e,d")) html = unpack(html);
        const match = html.match(/robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*([^;]+)/);
        if (match) {
          let videoUrl = "https:" + match[1];
          const parts = match[2].split("+");
          for (const p of parts) {
            const innerMatch = p.match(/['"]([^'"]+)['"]/);
            if (innerMatch) {
              let val = innerMatch[1];
              const sub = p.match(/substring\((\d+)\)/);
              if (sub) val = val.substring(parseInt(sub[1]));
              videoUrl += val;
            }
          }
          return { url: videoUrl, headers: { "Referer": "https://streamtape.com/" } };
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveSendvid(url) {
    return __async(this, null, function* () {
      try {
        if (url.includes("daisukianime")) {
          const idMatch = url.match(/[?&]id=([a-z0-9]+)/i);
          if (idMatch) url = `https://sendvid.com/embed/${idMatch[1]}`;
        }
        const embedUrl = url.includes("/embed/") ? url : url.replace(/sendvid\.com\/([a-z0-9]+)/i, "sendvid.com/embed/$1");
        const res = yield safeFetch(embedUrl, { headers: { "Referer": "https://sendvid.com/" } });
        if (!res) return { url };
        const html = yield res.text();
        const match = html.match(/video_source\s*:\s*["']([^"']+\.mp4[^"']*)["|']/) || html.match(/source\s+src=["']([^"']+\.mp4[^"']*)["|']/) || html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/) || html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/) || html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
        if (match) return { url: match[1], headers: { "Referer": "https://sendvid.com/" } };
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveLuluvid(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url);
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("p,a,c,k,e,d")) html = unpack(html);
        const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/) || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/);
        if (match) {
          let videoUrl = match[1];
          if (videoUrl.includes("base64")) videoUrl = _atob(videoUrl.split(",")[1] || videoUrl);
          return { url: videoUrl, headers: { "Referer": url } };
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveHGCloud(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url);
        if (!res) return { url };
        const html = yield res.text();
        const match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
        if (match) return { url: match[1], headers: { "Referer": url } };
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveDood(url) {
    return __async(this, null, function* () {
      var _a;
      try {
        const domain = ((_a = url.match(/https?:\/\/([^\/]+)/)) == null ? void 0 : _a[1]) || "dood.to";
        const res = yield safeFetch(url);
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("eval(function(p,a,c,k,e,d)")) html = unpack(html);
        const passMatch = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
        if (passMatch) {
          const token = passMatch[1];
          const passUrl = `https://${domain}/pass_md5/${token}`;
          const passRes = yield safeFetch(passUrl, { headers: { "Referer": url } });
          if (passRes && passRes.ok) {
            const content = yield passRes.text();
            const randomStr = Math.random().toString(36).substring(2, 12);
            return {
              url: content + randomStr + "?token=" + token + "&expiry=" + Date.now(),
              headers: { "Referer": `https://${domain}/` }
            };
          }
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveMyTV(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url, { headers: { "Referer": "https://www.myvi.ru/" } });
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("eval(function(p,a,c,k,e,d)")) html = unpack(html);
        const match = html.match(/["'](?:file|src|url|stream_url)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/) || html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/) || html.match(/source\s+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)/);
        if (match) return { url: match[1], headers: { "Referer": "https://www.myvi.ru/" } };
        const idMatch = url.match(/\/(?:embed\/|watch\/|video\/)([a-zA-Z0-9_-]+)/);
        if (idMatch) {
          const apiUrl = `https://www.myvi.ru/api/video/${idMatch[1]}`;
          const apiRes = yield safeFetch(apiUrl, { headers: { "Referer": url } });
          if (apiRes) {
            const data = yield apiRes.text();
            const apiMatch = data.match(/["'](?:url|src|file)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
            if (apiMatch) return { url: apiMatch[1], headers: { "Referer": "https://www.myvi.ru/" } };
          }
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveYounetu(url) {
    return __async(this, null, function* () {
      var _a;
      try {
        const origin = ((_a = url.match(/^https?:\/\/[^/]+/)) == null ? void 0 : _a[0]) || "https://younetu.org";
        const res = yield safeFetch(url, { headers: { "Referer": origin + "/" } });
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
        const match = html.match(/src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (match) {
          return { url: match[1], headers: { "Referer": origin + "/" } };
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveVidoza(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url, { headers: { "Referer": "https://vidoza.net/" } });
        if (!res) return { url };
        const html = yield res.text();
        const match = html.match(/src\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) || html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
        if (match) {
          return { url: match[1], headers: { "Referer": "https://vidoza.net/" } };
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveMoon(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url);
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("p,a,c,k,e,d")) html = unpack(html);
        const match = html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
        if (match) return { url: match[1], headers: { "Referer": url } };
      } catch (e) {
      }
      return { url };
    });
  }
  function resolvePackedPlayer(url) {
    return __async(this, null, function* () {
      var _a;
      try {
        const origin = ((_a = url.match(/^https?:\/\/[^/]+/)) == null ? void 0 : _a[0]) || url;
        const res = yield safeFetch(url, { headers: { "Referer": origin + "/" } });
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
        const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[[^\]]*?["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (match) {
          return { url: match[1], headers: { "Referer": origin + "/" } };
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveDownParadise(url) {
    return __async(this, null, function* () {
      return { url };
    });
  }
  function resolveUp4fun(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url, { headers: { "Referer": "https://up4fun.top/" } });
        if (!res) return null;
        const html = yield res.text();
        const videoMatch = html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (videoMatch) return { url: videoMatch[1], headers: { "Referer": "https://up4fun.top/" } };
      } catch (e) {
      }
      return null;
    });
  }
  function findBestVideoIframe(html, pageUrl) {
    var _a;
    const iframeRegex = /<iframe\s+[^>]*src=["']([^"']+)["']/gi;
    const candidates = [];
    let match;
    while ((match = iframeRegex.exec(html)) !== null) {
      let iframeUrl = match[1];
      if (iframeUrl.startsWith("//")) iframeUrl = "https:" + iframeUrl;
      if (iframeUrl.startsWith("/")) {
        const origin = (_a = pageUrl.match(/^https?:\/\/[^\/]+/)) == null ? void 0 : _a[0];
        if (origin) iframeUrl = origin + iframeUrl;
      }
      if (!iframeUrl.startsWith("http")) continue;
      if (iframeUrl === pageUrl) continue;
      const lower = iframeUrl.toLowerCase();
      const isAd = AD_IFRAME_PATTERNS.some((p) => lower.includes(p));
      if (isAd) continue;
      let score = 0;
      for (const [keyword, pts] of Object.entries(VIDEO_IFRAME_SCORE)) {
        if (lower.includes(keyword)) score += pts;
      }
      candidates.push({ url: iframeUrl, score });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].url;
  }
  function resolveStream(stream, depth = 0) {
    return __async(this, null, function* () {
      if (depth > 1) return __spreadProps(__spreadValues({}, stream), { isDirect: false });
      if (depth === 0) peeledUrls.clear();
      const originalUrl = stream.url;
      const urlLower = originalUrl.toLowerCase();
      if (!originalUrl || originalUrl.includes("google-analytics") || originalUrl.includes("doubleclick")) return null;
      if (isPlayableMediaUrl(originalUrl)) {
        return __spreadProps(__spreadValues({}, stream), { isDirect: true });
      }
      try {
        let result = null;
        if (urlLower.includes("sibnet.ru")) result = yield resolveSibnet(originalUrl);
        else if (urlLower.includes("vidmoly.")) result = yield resolveVidmoly(originalUrl);
        else if (urlLower.includes("uqload.") || urlLower.includes("oneupload.")) result = yield resolveUqload(originalUrl);
        else if (urlLower.includes("voe") || urlLower.includes("weneverbeenfree") || urlLower.includes("maryspecialwatch") || urlLower.includes("charlestoughrace") || urlLower.includes("sandratableother")) result = yield resolveVoe(originalUrl);
        else if (urlLower.includes("streamtape.com") || urlLower.includes("stape")) result = yield resolveStreamtape(originalUrl);
        else if (urlLower.includes("dood") || urlLower.includes("ds2play") || urlLower.includes("bigwar5")) result = yield resolveDood(originalUrl);
        else if (urlLower.includes("moonplayer") || urlLower.includes("filemoon")) result = yield resolveMoon(originalUrl);
        else if (urlLower.includes("younetu.") || urlLower.includes("netu.")) result = yield resolveYounetu(originalUrl);
        else if (urlLower.includes("vidoza.")) result = yield resolveVidoza(originalUrl);
        else if (urlLower.includes("sendvid.") || urlLower.includes("daisukianime")) result = yield resolveSendvid(originalUrl);
        else if (urlLower.includes("myvi.") || urlLower.includes("mytv.")) result = yield resolveMyTV(originalUrl);
        else if (urlLower.includes("fsvid.lol") || urlLower.includes("vidzy.live") || urlLower.includes("vidstream.pro") || urlLower.includes("vidcdn.") || urlLower.includes("kakaflix.") || urlLower.includes("vidhsareup.")) result = yield resolvePackedPlayer(originalUrl);
        else if (urlLower.includes("luluvid.") || urlLower.includes("lulustream.") || urlLower.includes("luluvdo.") || urlLower.includes("wishonly.") || urlLower.includes("veev.")) result = yield resolvePackedPlayer(originalUrl);
        else if (urlLower.includes("lulu.")) result = yield resolveLuluvid(originalUrl);
        else if (urlLower.includes("hgcloud.") || urlLower.includes("savefiles.")) result = yield resolveHGCloud(originalUrl);
        else if (urlLower.includes("down-paradise.") || urlLower.includes("ww1.down-paradise.")) result = yield resolveDownParadise(originalUrl);
        else if (urlLower.includes("up4fun.")) result = yield resolveUp4fun(originalUrl);
        if (result && result.url !== originalUrl && !isKnownFakeDirectUrl(result.url)) {
          return __spreadProps(__spreadValues({}, stream), {
            url: result.url,
            headers: __spreadValues(__spreadValues({}, stream.headers), result.headers || {}),
            isDirect: true,
            originalUrl
          });
        }
        const knownSlowHost = urlLower.includes("up4fun.") || urlLower.includes("down-paradise.") || urlLower.includes("getvid.club") || urlLower.includes("vidhsareup.");
        if (!result || result.url === originalUrl) {
          if (knownSlowHost) {
            return __spreadProps(__spreadValues({}, stream), { isDirect: false });
          }
          const skipDirectScan = result && result.url === originalUrl && depth === 0;
          const res = yield safeFetch(originalUrl, { headers: stream.headers });
          if (res) {
            let html = yield res.text();
            if (html.includes("p,a,c,k,e,d")) html = unpack(html);
            if (!skipDirectScan) {
              const jsRedirect = html.match(/window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/);
              if (jsRedirect && jsRedirect[1] !== originalUrl) {
                const res2 = yield safeFetch(jsRedirect[1], { headers: stream.headers });
                if (res2) {
                  html = yield res2.text();
                  if (html.includes("p,a,c,k,e,d")) html = unpack(html);
                }
              }
              const directUrl = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) || html.match(/https?:\/\/[^"']+\.mp4[^"']*/) || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/'hls'\s*:\s*'([^']+)'/) || html.match(/"hls"\s*:\s*"([^"]+)"/);
              if (directUrl) {
                let extractedUrl = directUrl[1] || directUrl[0];
                if (extractedUrl.startsWith("//")) extractedUrl = "https:" + extractedUrl;
                const isInvalidExtension = extractedUrl.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);
                if (extractedUrl.startsWith("http") && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN) && !isInvalidExtension && !isKnownFakeDirectUrl(extractedUrl)) {
                  result = { url: extractedUrl };
                }
              }
            }
            if (!result) {
              const iframeUrl = findBestVideoIframe(html, originalUrl);
              if (iframeUrl && !peeledUrls.has(iframeUrl)) {
                peeledUrls.add(iframeUrl);
                console.log(`[Resolver] Peeling: Found nested iframe -> ${iframeUrl}`);
                return yield resolveStream(__spreadProps(__spreadValues({}, stream), { url: iframeUrl }), depth + 1);
              }
            }
          }
        }
        if (result && result.url !== originalUrl && result.url.startsWith("http") && !isKnownFakeDirectUrl(result.url)) {
          return __spreadProps(__spreadValues({}, stream), {
            url: result.url,
            headers: __spreadValues(__spreadValues({}, stream.headers), result.headers || {}),
            isDirect: true,
            originalUrl
          });
        }
      } catch (err) {
      }
      return __spreadProps(__spreadValues({}, stream), { isDirect: false });
    });
  }
  var PROVIDER_BUDGET_MS, HEADERS, _atob, CODEC_PREFERENCE, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER, CODEC_PRIORITY, manifestCache, MANIFEST_CACHE_TTL, FETCH_CACHE_TTL, fetchCache, peeledUrls, AD_IFRAME_PATTERNS, VIDEO_IFRAME_SCORE, BASE_URL_FORBIDDEN_PATTERN;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      PROVIDER_BUDGET_MS = 45e3;
      HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Accept-Encoding": "identity"
      };
      _atob = (str) => {
        try {
          return atob(str);
        } catch (e) {
          return str;
        }
      };
      CODEC_PREFERENCE = ["AV1", "H.265", "H.264", "VP9"];
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
      peeledUrls = /* @__PURE__ */ new Set();
      AD_IFRAME_PATTERNS = [
        "googleads",
        "doubleclick",
        "googlesyndication",
        "googletagmanager",
        "facebook.com/plugins",
        "twitter.com/share",
        "disqus.com",
        "hotjar.com",
        "analytics",
        "tracking",
        "pixel",
        "gtag",
        "adservice",
        "adserver",
        "ad.doubleclick",
        "amazon-adsystem",
        "criteo",
        "taboola",
        "outbrain"
      ];
      VIDEO_IFRAME_SCORE = {
        "sibnet": 3,
        "vidmoly": 3,
        "uqload": 3,
        "voe": 3,
        "dood": 3,
        "streamtape": 3,
        "sendvid": 2,
        "younetu": 2,
        "netu": 2,
        "moonplayer": 2,
        "filemoon": 2,
        "vidoza": 2,
        "myvi": 2,
        "luluvid": 2,
        "lulu": 2,
        "embed": 2,
        "player": 2,
        "video": 2,
        "cdn": 1,
        "hls": 3,
        "mp4": 3,
        "m3u8": 3
      };
      BASE_URL_FORBIDDEN_PATTERN = "googletagmanager";
    }
  });

  // src/movix/http.js
  function fetchJson(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      console.log(`[Movix] Fetching: ${url}`);
      try {
        const _a = options, { headers: customHeaders } = _a, rest = __objRest(_a, ["headers"]);
        const res = yield safeFetch(url, __spreadValues({ timeout: 15e3, headers: __spreadValues(__spreadValues({}, HEADERS2), customHeaders || {}) }, rest));
        if (!res || !res.ok) {
          const status = res && typeof res.status === "number" ? res.status : "no-response";
          console.log(`[Movix] HTTP ${status} for ${url}`);
          return null;
        }
        try {
          const data = yield res.json();
          return data != null ? data : null;
        } catch (e) {
          const txt = yield res.text();
          console.log(`[Movix] JSON parse error for ${url}. Content length: ${String(txt && txt.length)}`);
          return null;
        }
      } catch (e) {
        console.log(`[Movix] Fetch error for ${url}: ${e.message}`);
        return null;
      }
    });
  }
  var HEADERS2;
  var init_http = __esm({
    "src/movix/http.js"() {
      init_resolvers();
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://movix.cash",
        "Referer": "https://movix.cash/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "DNT": "1"
      };
    }
  });

  // src/movix/extractor.js
  function originFromUrl(url) {
    try {
      return new URL(url).origin;
    } catch (e) {
      return "https://movix.cash";
    }
  }
  function normalizeLangTag(lang) {
    const l = (lang || "").toLowerCase();
    if (l === "vff" || l === "vfq" || l === "vf" || l.includes("french")) return "VF";
    if (l === "vostfr" || l === "vost" || l.includes("vostfr")) return "VOSTFR";
    if (l === "default" || l === "multi") return "MULTI";
    return (lang || "VF").toUpperCase();
  }
  function streamPriority(url, language) {
    const u = (url || "").toLowerCase();
    let score = 0;
    const l = (language || "").toUpperCase();
    if (l === "VF" || l === "VFF" || l === "VFQ") score += 0;
    else if (l === "DEFAULT" || l === "MULTI") score += 10;
    else if (l === "VOSTFR") score += 20;
    else score += 30;
    const isSlow = SLOW_HOSTS.some((h) => u.includes(h));
    const isFast = FAST_HOSTS.some((h) => u.includes(h));
    if (isSlow) score += 100;
    else if (isFast) score += 0;
    else score += 50;
    return score;
  }
  function pushStream(streams, provider, server, lang, url, quality) {
    if (!url || typeof url !== "string") return;
    const origin = originFromUrl(url);
    streams.push({
      name: "Movix",
      title: `[${normalizeLangTag(lang)}] ${provider} - ${server || "Player"}`,
      url,
      quality: quality || "HD",
      language: normalizeLangTag(lang),
      // stocké pour le tri
      headers: { Referer: origin + "/", Origin: origin, "User-Agent": USER_AGENT }
    });
  }
  function isExoPlayableUrl(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.toLowerCase();
    if (u.includes("test-videos.co.uk") || u.includes("sample-videos.com") || u.includes("big_buck_bunny")) return false;
    if (u.includes("/embed") || u.includes("/e/") || u.includes("iframe") || u.includes("index.php")) return false;
    if (u.includes(".m3u8") || u.includes(".mp4") || u.includes(".mkv") || u.includes(".webm") || u.includes(".ts")) return true;
    if (u.includes("manifest") || u.includes("playlist") || u.includes("/hls/")) return true;
    return false;
  }
  function resolveForExo(stream) {
    return __async(this, null, function* () {
      let resolved = null;
      if (isExoPlayableUrl(stream.url)) {
        resolved = __spreadProps(__spreadValues({}, stream), { isDirect: true });
      } else {
        try {
          resolved = yield withTimeout(resolveStream(stream), 4e3);
        } catch (e) {
          console.warn(`[Movix] resolveStream timeout: ${e == null ? void 0 : e.message}`);
        }
      }
      if (!resolved || !resolved.url || !resolved.isDirect) return null;
      if (!isExoPlayableUrl(resolved.url)) return null;
      return {
        name: resolved.name || stream.name,
        title: resolved.title || stream.title,
        url: resolved.url,
        quality: resolved.quality || "HD",
        isDirect: true,
        headers: __spreadProps(__spreadValues({}, resolved.headers), { "User-Agent": USER_AGENT })
      };
    });
  }
  function fetchOnce(url) {
    return __async(this, null, function* () {
      try {
        const data = yield fetchJson(url);
        if (!data || data.error) return null;
        return data;
      } catch (e) {
        console.warn(`[Movix] fetchOnce failed: ${e == null ? void 0 : e.message}`);
        return null;
      }
    });
  }
  function extractStreams(tmdbId, mediaType, season, episode) {
    return __async(this, null, function* () {
      var _a, _b;
      const streams = [];
      if (!tmdbId) {
        console.log("[Movix] Missing tmdbId");
        return streams;
      }
      const isMovie = mediaType === "movie";
      const episodeNum = Number(episode) || 1;
      const legacyUrls = isMovie ? [`${API_BASE}/api/fstream/movie/${tmdbId}`, `${API_BASE}/api/wiflix/movie/${tmdbId}`, `${API_BASE}/api/cpasmal/movie/${tmdbId}`] : [`${API_BASE}/api/fstream/tv/${tmdbId}/season/${Number(season) || 1}`, `${API_BASE}/api/wiflix/tv/${tmdbId}/${Number(season) || 1}`, `${API_BASE}/api/cpasmal/tv/${tmdbId}/${Number(season) || 1}/${episodeNum}`];
      const results = yield Promise.allSettled(legacyUrls.map((url) => fetchOnce(url)));
      let anyLegacyFound = false;
      for (const r of results) {
        if (r.status !== "fulfilled" || !r.value) continue;
        anyLegacyFound = true;
        const data = r.value;
        if (data.players) {
          for (const lang of Object.keys(data.players)) {
            const list = data.players[lang];
            if (!Array.isArray(list)) continue;
            for (const item of list) pushStream(streams, "FStream", item == null ? void 0 : item.player, lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
          }
        }
        if (data.links) {
          for (const lang of Object.keys(data.links)) {
            const list = data.links[lang];
            if (!Array.isArray(list)) continue;
            for (const item of list) pushStream(streams, "Wiflix", (item == null ? void 0 : item.name) || (item == null ? void 0 : item.player), lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
          }
        }
        if (!isMovie) {
          const ep = ((_a = data == null ? void 0 : data.episodes) == null ? void 0 : _a[String(episodeNum)]) || ((_b = data == null ? void 0 : data.episodes) == null ? void 0 : _b[episodeNum]);
          if (ep && typeof ep === "object") {
            if (ep.languages) {
              for (const lang of Object.keys(ep.languages)) {
                const list = ep.languages[lang];
                if (!Array.isArray(list)) continue;
                for (const item of list) pushStream(streams, "FStream", item == null ? void 0 : item.player, lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
              }
            }
            for (const lang of ["vf", "vostfr", "vo", "VFF", "VFQ", "VOSTFR", "Default"]) {
              const list = ep[lang];
              if (!Array.isArray(list)) continue;
              for (const item of list) pushStream(streams, "Wiflix", (item == null ? void 0 : item.name) || (item == null ? void 0 : item.player), lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
            }
          }
        }
        for (const lang of ["vf", "vostfr", "vo", "VFF", "VFQ"]) {
          const list = data[lang];
          if (!Array.isArray(list)) continue;
          for (const item of list) pushStream(streams, "Cpasmal", (item == null ? void 0 : item.player) || (item == null ? void 0 : item.name), lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
        }
      }
      if (!anyLegacyFound) {
        console.log("[Movix] No streams found from any source");
      }
      if (streams.length === 0) return [];
      const seen = /* @__PURE__ */ new Set();
      const unique = [];
      for (const s of streams) {
        if (!seen.has(s.url)) {
          seen.add(s.url);
          unique.push(s);
        }
      }
      unique.sort((a, b) => streamPriority(a.url, a.language) - streamPriority(b.url, b.language));
      const MAX_RESOLVE = 3;
      const BATCH_SIZE = 2;
      const playable = [];
      const seenPlayable = /* @__PURE__ */ new Set();
      const toResolve = unique.slice(0, MAX_RESOLVE);
      const batch1 = toResolve.slice(0, BATCH_SIZE);
      const batch1Results = yield Promise.allSettled(batch1.map((s) => resolveForExo(s)));
      for (const r of batch1Results) {
        if (r.status !== "fulfilled" || !r.value) continue;
        if (seenPlayable.has(r.value.url)) continue;
        seenPlayable.add(r.value.url);
        playable.push(r.value);
      }
      if (playable.length < 2 && toResolve.length > BATCH_SIZE) {
        const batch2 = toResolve.slice(BATCH_SIZE, MAX_RESOLVE);
        const batch2Results = yield Promise.allSettled(batch2.map((s) => resolveForExo(s)));
        for (const r of batch2Results) {
          if (r.status !== "fulfilled" || !r.value) continue;
          if (seenPlayable.has(r.value.url)) continue;
          seenPlayable.add(r.value.url);
          playable.push(r.value);
        }
      }
      console.log(`[Movix] Total: ${unique.length} streams, ${playable.length} playable (resolved ${toResolve.length})`);
      return playable;
    });
  }
  var API_BASE, USER_AGENT, SLOW_HOSTS, FAST_HOSTS;
  var init_extractor = __esm({
    "src/movix/extractor.js"() {
      init_http();
      init_resolvers();
      API_BASE = "https://api.movix.cloud";
      USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
      SLOW_HOSTS = ["up4fun", "dood", "doodstream", "moonplayer", "filemoon", "streamtape", "stape"];
      FAST_HOSTS = ["voe", "uqload", "fsvid", "vidzy", "netu", "younetu", "sendvid", "sibnet"];
    }
  });

  // src/movix/index.js
  var require_index = __commonJS({
    "src/movix/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      module.exports = { getStreams: createProvider("Movix", extractStreams) };
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
