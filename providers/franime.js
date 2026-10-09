/**
 * franime - Built from src/franime/
 * Generated: 2026-10-09T18:27:37.039456992Z
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
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
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
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
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
  function isTruncatedBody(text) {
    return typeof text === "string" && text.endsWith(RUNTIME_TRUNCATION_SUFFIX);
  }
  function responseLooksHtml(response, bodyText) {
    let ctype = "";
    try {
      ctype = response && response.headers && typeof response.headers.get === "function" ? response.headers.get("content-type") || "" : "";
    } catch (e) {
      ctype = "";
    }
    if (/html/i.test(ctype)) return true;
    const sniffable = !ctype || /text\/plain/i.test(ctype);
    if (!sniffable) return false;
    return /^\s*<(!doctype|html|\?xml|head|body)/i.test(bodyText || "");
  }
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
    const maxStreams = opts.maxStreams || MAX_STREAMS_PER_PROVIDER;
    return function getStreams(_0, _1, _2, _3) {
      return __async(this, arguments, function* (tmdbId, mediaType, season, episode, options = {}) {
        const se = mediaType === "movie" ? "" : ` S${season}E${episode}`;
        const label = `${name} ${mediaType} ${tmdbId}${se}`;
        const externalSignal = options && options.signal ? options.signal : null;
        const { signal } = setupAbortSignal(externalSignal);
        if (isAborted(signal)) return [];
        const startTime = Date.now();
        console.log(`[${name}] Request: ${label} (build ${BUILD_HASH})`);
        try {
          const rawStreams = yield withTimeout(
            extractFn(tmdbId, mediaType, season, episode, { signal }),
            PROVIDER_TIMEOUT,
            label
          );
          const rawList = Array.isArray(rawStreams) ? rawStreams : [];
          const seenUrls = /* @__PURE__ */ new Set();
          const dedupedRaw = [];
          for (const s of rawList) {
            if (!s) continue;
            const u = s.url;
            if (typeof u === "string") {
              if (!u || u.includes("[object")) continue;
              const dedupKey = `${u}|${String(s.language || "").toUpperCase()}`;
              if (seenUrls.has(dedupKey)) continue;
              seenUrls.add(dedupKey);
            }
            dedupedRaw.push(s);
          }
          const truncated = dedupedRaw.slice(0, maxStreams * 2);
          const expanded = yield expandStreamQualities(truncated, qualityOpts);
          const elapsed = Date.now() - startTime;
          console.log(`[${name}] Done: ${expanded.length} streams in ${elapsed}ms`);
          return expanded.slice(0, maxStreams);
        } catch (error) {
          if (error && error.message && error.message.includes("[Timeout]")) {
            console.warn(`[${name}] ${error.message}`);
          } else if (error && error.name === "AbortError") {
            console.warn(`[${name}] Request aborted: ${label}`);
          } else {
            console.error(`[${name}] Error:`, error && error.message || error);
          }
          return [];
        }
      });
    };
  }
  function setupAbortSignal(externalSignal) {
    const controller = createAbortController();
    const signal = controller ? controller.signal : externalSignal;
    if (controller && externalSignal && !externalSignal.aborted) {
      try {
        if (typeof externalSignal.addEventListener === "function") {
          externalSignal.addEventListener("abort", function() {
            try {
              controller.abort();
            } catch (e) {
            }
          });
        }
      } catch (e) {
      }
    }
    return { signal, controller };
  }
  function formatSizeBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${Math.round(mb * 10) / 10} MB`;
    const kb = bytes / 1024;
    return `${Math.round(kb)} KB`;
  }
  function fetchVideoSize(_0) {
    return __async(this, arguments, function* (url, headers = {}) {
      if (!url) return null;
      try {
        const res = yield safeFetch(url, { method: "HEAD", headers, timeout: 5e3 });
        if (!res || !res.ok) return null;
        const cl = res.headers["content-length"];
        if (!cl) return null;
        return formatSizeBytes(Number(cl));
      } catch (e) {
        return null;
      }
    });
  }
  function createAbortController() {
    try {
      if (typeof AbortController !== "undefined") {
        return new AbortController();
      }
    } catch (_) {
    }
    return null;
  }
  function isAborted(signal) {
    return signal && (typeof signal.aborted === "boolean" ? signal.aborted : false);
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
    return u.includes("test-videos.co.uk") || u.includes("big_buck_bunny") || u.includes("bigbuckbunny") || u.includes("sample-videos.com") || u.includes("example.com") || u.includes("localhost") || // Leurre anti-scraper fsvid/vidzy : "troll/master.m3u8" est identique
    // pour tous les embeds (vidéo de test). Empêche le fallback générique
    // de le renvoyer comme URL directe si resolveFsvidVidzy échoue.
    u.includes("/troll/master.m3u8");
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
    if (fetchCache.size >= 300) {
      const toRemove = Math.ceil(300 * 0.2);
      const sorted = [...fetchCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, toRemove);
      for (const [k] of sorted) fetchCache.delete(k);
    }
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
    if (u.includes(".m3u8") || u.includes("/hls/") || u.includes("/hls2/") || u.includes("master.m3u8") || u.includes("playlist.m3u8")) return "hls";
    if (u.includes(".mpd")) return "dash";
    if (u.includes(".mp4")) return "mp4";
    if (u.includes(".mkv")) return "mkv";
    if (u.includes(".webm")) return "webm";
    if (u.includes(".ts") && !u.includes("test") && !u.includes("textures")) return "hls";
    return null;
  }
  function buildEnrichedQuality(stream) {
    const base = normalizeQualityLabel(stream.quality || "HD");
    const parts = [base];
    if (stream.codec) {
      const c = String(stream.codec).toUpperCase();
      if (c && !base.toUpperCase().includes(c)) parts.push(c);
    }
    if (stream.audioCodec) {
      const a = String(stream.audioCodec).toUpperCase();
      if (a && !parts.some((p) => p.toUpperCase() === a)) parts.push(a);
    }
    return parts.join(" ");
  }
  function formatSizeWithMetadata(size, stream) {
    if (!size) return size;
    const extras = [];
    if (stream.codec) extras.push(String(stream.codec).toUpperCase());
    if (stream.audioCodec) extras.push(String(stream.audioCodec).toUpperCase());
    if (extras.length === 0) return size;
    return `${size} ${extras.join(" ")}`;
  }
  function normalizeLanguageCode(raw) {
    if (!raw) return null;
    const key = String(raw).trim().toUpperCase();
    if (!key) return null;
    if (LANGUAGE_CODE_MAP[key]) return LANGUAGE_CODE_MAP[key];
    const lower = key.toLowerCase();
    return lower;
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
      let res = null;
      try {
        res = yield withTimeout(
          safeFetch(url, { headers: stream.headers || {}, timeout: options.manifestTimeout || 12e3 }),
          options.manifestTimeout || 12e3,
          "manifest-parse"
        );
      } catch (e) {
        res = null;
      }
      if (!res) {
        return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD"), type: "hls" })];
      }
      const manifest = yield res.text();
      if (res.truncated || isTruncatedBody(manifest)) {
        return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD"), type: "hls" })];
      }
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
        const rawLang = stream.language || inferLanguage(stream) || "";
        const dedupKey = `${stream.url}|${String(rawLang).toUpperCase()}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        deduped.push(stream);
      }
      let sorted = sortStreams(deduped);
      sorted = sorted.map((s) => {
        const rawLang = inferLanguage(s) || s.language || null;
        const lang = normalizeLanguageCode(rawLang);
        const baseTitle = s.title || s.name;
        let title = s.title;
        if (rawLang && lang && baseTitle && String(rawLang).toUpperCase() !== lang.toUpperCase() && !baseTitle.toUpperCase().includes(String(rawLang).toUpperCase())) {
          title = `${baseTitle} [${String(rawLang).toUpperCase()}]`;
        }
        const enrichedQuality = buildEnrichedQuality(s);
        return __spreadProps(__spreadValues(__spreadValues(__spreadValues({}, s), title !== s.title ? { title } : {}), enrichedQuality !== s.quality ? { quality: enrichedQuality } : {}), {
          type: s.type || inferType(s.url),
          language: lang
        });
      });
      const DIRECT_VIDEO_RE = /\.(mp4|mkv|webm)(\?.*)?$/i;
      const streamsNeedingSize = sorted.filter((s) => !s.size && s.url && DIRECT_VIDEO_RE.test(s.url)).slice(0, 5);
      if (streamsNeedingSize.length > 0) {
        const sizeResults = yield Promise.allSettled(
          streamsNeedingSize.map((s) => fetchVideoSize(s.url, s.headers))
        );
        for (let i = 0; i < streamsNeedingSize.length; i++) {
          const size = sizeResults[i].status === "fulfilled" ? sizeResults[i].value : null;
          if (size) streamsNeedingSize[i].size = formatSizeWithMetadata(size, streamsNeedingSize[i]);
        }
      }
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
      let headerTag = "";
      if (options.headers && typeof options.headers === "object") {
        const keys = Object.keys(options.headers).sort();
        if (keys.length) {
          headerTag = "|" + keys.map((k) => `${k.toLowerCase()}=${String(options.headers[k]).slice(0, 80)}`).join("&");
        }
      }
      const cacheKey = method + "|" + url + headerTag;
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
            headers: cached.headers || {},
            truncated: false
          };
        }
      }
      try {
        const _a = options, { timeout, signal: externalSignal } = _a, rest = __objRest(_a, ["timeout", "signal"]);
        const effectiveTimeout = timeout > 0 ? timeout : DEFAULT_FETCH_TIMEOUT;
        if (isAborted(externalSignal)) {
          return null;
        }
        const fetchOpts = __spreadProps(__spreadValues({}, rest), {
          headers: __spreadValues(__spreadValues({}, HEADERS), rest.headers),
          redirect: "follow"
        });
        const hasNativeTimeout = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "undefined";
        if (effectiveTimeout > 0 && hasNativeTimeout) {
          const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
          if (externalSignal) {
            const controller = createAbortController();
            if (controller) {
              fetchOpts.signal = controller.signal;
              const onAbort = () => {
                controller.abort();
              };
              try {
                externalSignal.addEventListener("abort", onAbort);
              } catch (_) {
              }
              try {
                timeoutSignal.addEventListener("abort", onAbort);
              } catch (_) {
              }
            } else {
              fetchOpts.signal = externalSignal;
            }
          } else {
            fetchOpts.signal = timeoutSignal;
          }
        } else if (externalSignal) {
          fetchOpts.signal = externalSignal;
        }
        const response = yield fetch(url, fetchOpts);
        const elapsed = Date.now() - start;
        if (elapsed > SLOW_THRESHOLD) {
          console.warn(`[safeFetch] Slow request (${elapsed}ms): ${(url || "").slice(0, 120)}`);
        }
        if (!response) return null;
        const status = response.status;
        let bodyText = "";
        let truncated = false;
        try {
          const rawText = yield response.text();
          if (rawText && rawText.endsWith(RUNTIME_TRUNCATION_SUFFIX)) {
            truncated = true;
            bodyText = rawText;
          } else if (rawText && rawText.length > MAX_SAFE_FETCH_BODY_BYTES) {
            truncated = true;
            console.warn(`[safeFetch] Response truncated (${rawText.length} bytes > ${MAX_SAFE_FETCH_BODY_BYTES}): ${(url || "").slice(0, 100)}`);
            bodyText = rawText.slice(0, MAX_SAFE_FETCH_BODY_BYTES);
          } else {
            bodyText = rawText || "";
          }
        } catch (e) {
          bodyText = "";
        }
        if (truncated && responseLooksHtml(response, bodyText)) {
          console.warn(`[safeFetch] HTML body truncated \u2192 refusing partial parse: ${(url || "").slice(0, 100)}`);
          return null;
        }
        if (method === "GET" && status >= 200 && status < 300 && !truncated) {
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
          headers: response.headers,
          truncated
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
  var PROVIDER_BUDGET_MS, MAX_STREAMS_PER_PROVIDER, MAX_SAFE_FETCH_BODY_BYTES, RUNTIME_TRUNCATION_SUFFIX, BUILD_HASH, HAS_NATIVE_CRYPTO, _nodeCrypto, HEADERS, USER_AGENT, BASE_HEADERS, CODEC_PREFERENCE, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER, CODEC_PRIORITY, manifestCache, MANIFEST_CACHE_TTL, FETCH_CACHE_TTL, fetchCache, LANGUAGE_CODE_MAP, DEFAULT_FETCH_TIMEOUT;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      PROVIDER_BUDGET_MS = 45e3;
      MAX_STREAMS_PER_PROVIDER = 80;
      MAX_SAFE_FETCH_BODY_BYTES = 1024 * 1024;
      RUNTIME_TRUNCATION_SUFFIX = "\n...[truncated]";
      BUILD_HASH = true ? "7a410412" : "dev";
      HAS_NATIVE_CRYPTO = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined" && typeof TextDecoder !== "undefined";
      _nodeCrypto = null;
      try {
        _nodeCrypto = __require("crypto");
      } catch (_) {
      }
      HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
      };
      USER_AGENT = HEADERS["User-Agent"];
      BASE_HEADERS = __spreadValues({}, HEADERS);
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
      FETCH_CACHE_TTL = 3e5;
      fetchCache = /* @__PURE__ */ new Map();
      LANGUAGE_CODE_MAP = {
        VF: "fr",
        VFQ: "fr",
        VFF: "fr",
        VFI: "fr",
        VFK: "fr",
        FRA: "fr",
        FR: "fr",
        FRENCH: "fr",
        "FRAN\xC7AIS": "fr",
        VOSTFR: "fr",
        VOSTF: "fr",
        VOST: "fr",
        SUBF: "fr",
        MULTI: "multi",
        FAN: "multi",
        EN: "en",
        ENG: "en",
        ENGLISH: "en",
        VOA: "en",
        VO: "ja",
        JA: "ja",
        JP: "ja",
        JAP: "ja",
        JAPANESE: "ja",
        VOSTA: "ja"
      };
      DEFAULT_FETCH_TIMEOUT = 15e3;
    }
  });

  // src/franime/http.js
  function apiHeaders(extra = {}) {
    return __spreadValues(__spreadProps(__spreadValues({}, HEADERS2), {
      "Accept": "application/json, text/plain, */*",
      "Referer": SITE_REFERER,
      "Origin": SITE
    }), extra);
  }
  function fetchText(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const signal = options.signal || _currentSignal;
      if (isAborted(signal)) throw new Error("AbortError: Request aborted");
      console.log(`[Franime] Fetching: ${url}`);
      const _a = options, { headers: customHeaders } = _a, rest = __objRest(_a, ["headers"]);
      yield rateLimit("api.franime.fr");
      const res = yield safeFetch(url, __spreadProps(__spreadValues({ headers: __spreadValues(__spreadValues({}, HEADERS2), customHeaders || {}) }, rest), { signal }));
      if (!res || !res.ok) {
        const status = res && typeof res.status === "number" ? res.status : "no-response";
        throw new Error(`HTTP error ${status} for ${url}`);
      }
      return yield res.text();
    });
  }
  function fetchJson(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const raw = yield fetchText(url, options);
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error(`[Franime] JSON Parse Error: ${e.message}`);
        return null;
      }
    });
  }
  function fetchTextSafe(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      try {
        return yield fetchText(url, options);
      } catch (e) {
        if (isAborted(options.signal || _currentSignal)) throw e;
        return null;
      }
    });
  }
  function fetchFinalUrl(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const signal = options.signal || _currentSignal;
      if (isAborted(signal)) return null;
      console.log(`[Franime] Lecteur: ${url}`);
      yield rateLimit("api.franime.fr");
      try {
        const res = yield safeFetch(url, {
          headers: __spreadValues(__spreadProps(__spreadValues({}, HEADERS2), { "Referer": SITE_REFERER }), options.headers),
          redirect: "follow",
          signal
        });
        if (!res) return null;
        const finalUrl = res.url || null;
        if (!finalUrl || finalUrl === url) return null;
        return finalUrl;
      } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
      }
    });
  }
  var _currentSignal, SITE, API, SITE_REFERER, rateLimit, HEADERS2;
  var init_http = __esm({
    "src/franime/http.js"() {
      init_resolvers();
      _currentSignal = null;
      SITE = "https://franime.fr";
      API = "https://api.franime.fr/api/";
      SITE_REFERER = `${SITE}/anime/watch`;
      rateLimit = createProviderRateLimiter();
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1"
      };
    }
  });

  // src/utils/metadata.js
  var metadata_exports = {};
  __export(metadata_exports, {
    getTmdbTitles: () => getTmdbTitles
  });
  function fetchTmdb(url, attempts = 2, deadline = 0) {
    return __async(this, null, function* () {
      for (let i = 0; i < attempts; i++) {
        if (deadline && Date.now() >= deadline) return null;
        const remaining = deadline ? deadline - Date.now() : 0;
        const timeout = Math.min(8e3, Math.max(2e3, remaining));
        const res = yield safeFetch(url, { timeout });
        if (res && res.ok) return res;
        if (i < attempts - 1) yield sleep(400);
      }
      return null;
    });
  }
  function metadataCacheGet(key) {
    const entry = METADATA_CACHE.get(key);
    if (entry && Date.now() - entry.ts < METADATA_TTL) return entry.data;
    if (entry) METADATA_CACHE.delete(key);
    return null;
  }
  function metadataCacheSet(key, data) {
    if (METADATA_CACHE.size >= METADATA_MAX) {
      const oldest = [...METADATA_CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100).map(([k]) => k);
      for (const k of oldest) METADATA_CACHE.delete(k);
    }
    METADATA_CACHE.set(key, { data, ts: Date.now() });
  }
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
      const dateStr = anime.startDate;
      const year = dateStr && dateStr.length >= 4 && /^\d{4}/.test(dateStr) ? parseInt(dateStr.substring(0, 4), 10) : null;
      titles._metadata = {
        isAnime: (anime.originalLanguage || "") === "ja",
        name: anime.canonicalTitle || "",
        originalLanguage: anime.originalLanguage || "",
        year
      };
      console.log(`[Metadata] Kitsu fallback titles for ${kitsuId}: ${titles.join(" | ")}`);
      return titles;
    });
  }
  function getTMDBTitlesById(_0, _1) {
    return __async(this, arguments, function* (tmdbId, mediaType, opts = {}) {
      var _a, _b, _c, _d, _e, _f;
      const type = mediaType === "movie" ? "movie" : "tv";
      const season = opts.season ? parseInt(opts.season, 10) : null;
      const cacheKey = `tmdb:${tmdbId}:${type}:${season || ""}`;
      const cached = metadataCacheGet(cacheKey);
      if (cached) {
        console.log(`[Metadata] Cache HIT for ${cacheKey}`);
        return cached;
      }
      const titles = [];
      let metadata = null;
      try {
        const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
        const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
        const deadline = Date.now() + 2e4;
        const mainRes = yield fetchTmdb(mainUrl, 2, deadline);
        const [altRes, transRes] = yield Promise.all([
          fetchTmdb(altUrl, 1, deadline),
          fetchTmdb(transUrl, 1, deadline)
        ]);
        if (mainRes) {
          const mainJson = yield mainRes.json();
          const data = mainJson != null ? mainJson : {};
          const titleEn = (_a = type === "movie" ? data.title : data.name) == null ? void 0 : _a.trim();
          const titleOriginal = (_b = type === "movie" ? data.original_title : data.original_name) == null ? void 0 : _b.trim();
          if (data) {
            const dateStr = type === "movie" ? data.release_date : data.first_air_date;
            const year = dateStr && dateStr.length >= 4 && /^\d{4}/.test(dateStr) ? parseInt(dateStr.substring(0, 4), 10) : null;
            metadata = {
              isAnime: data.original_language === "ja" || (data.genres || []).some((g) => g.id === 16),
              name: data.name || data.title || "",
              originalLanguage: data.original_language || "",
              year
            };
            if (type === "tv" && Array.isArray(data.seasons)) {
              const counts = {};
              for (const s of data.seasons) {
                if (s && s.season_number > 0 && s.episode_count > 0) {
                  counts[s.season_number] = s.episode_count;
                }
              }
              if (Object.keys(counts).length > 0) {
                metadata.seasonEpisodeCounts = counts;
              }
            }
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
      if (uniqueTitles.length > 0 || metadata) {
        metadataCacheSet(cacheKey, uniqueTitles);
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
        const season = opts.season ? parseInt(opts.season, 10) : null;
        const cacheKey = `kitsu-fb:${tmdbName.toLowerCase()}:${mediaType}:${season || ""}`;
        const cached = metadataCacheGet(cacheKey);
        if (cached) {
          console.log(`[Metadata] Kitsu fallback cache HIT for "${tmdbName}"`);
          return cached;
        }
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
              metadataCacheSet(cacheKey, altTitles);
              return altTitles;
            }
          }
          console.log(`[Metadata] Fallback: using Kitsu titles directly for ${anime.id}`);
          const kitsuTitles = yield getKitsuTitles(anime.id, mediaType, opts);
          metadataCacheSet(cacheKey, kitsuTitles);
          return kitsuTitles;
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
  var TMDB_API_KEY, TMDB_API_BASE, METADATA_CACHE, METADATA_TTL, METADATA_MAX, SEASON_SUFFIXES;
  var init_metadata = __esm({
    "src/utils/metadata.js"() {
      init_resolvers();
      TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
      TMDB_API_BASE = "https://api.themoviedb.org/3";
      METADATA_CACHE = /* @__PURE__ */ new Map();
      METADATA_TTL = 5 * 60 * 1e3;
      METADATA_MAX = 500;
      SEASON_SUFFIXES = [
        (s) => `Season ${s}`,
        (s) => `Saison ${s}`,
        (s) => `S${s}`
      ];
    }
  });

  // src/franime/extractor.js
  function decodeWatchToken(value) {
    try {
      const step1 = atob(value);
      if (!step1 || !/^[0-9a-fA-F]+$/.test(step1) || step1.length % 2 !== 0) return null;
      let out = "";
      for (let i = 0; i < step1.length; i += 2) {
        out += String.fromCharCode(parseInt(step1.substr(i, 2), 16) ^ 1);
      }
      if (!/^https?:\/\//.test(out)) return null;
      return out;
    } catch (e) {
      return null;
    }
  }
  function extractEmbedFromWatchUrl(finalUrl) {
    if (!finalUrl) return null;
    try {
      const qIndex = finalUrl.indexOf("?");
      if (qIndex === -1) return null;
      const query = finalUrl.slice(qIndex + 1);
      const params = [];
      for (const pair of query.split("&")) {
        const eq = pair.indexOf("=");
        if (eq === -1) continue;
        const key = pair.slice(0, eq);
        let val = pair.slice(eq + 1);
        try {
          val = decodeURIComponent(val);
        } catch (e) {
        }
        params.push([key, val]);
      }
      const order = ["b"];
      for (const want of order) {
        const hit = params.find((p) => p[0] === want);
        if (hit) {
          const dec = decodeWatchToken(hit[1]);
          if (dec) return dec;
        }
      }
      for (const [key, val] of params) {
        if (key === "b") continue;
        const dec = decodeWatchToken(val);
        if (dec) {
          console.log(`[Franime] Embed trouv\xE9 via param\xE8tre "${key}" (repli)`);
          return dec;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  function episodeNumber(ep) {
    const n = ep && ep.number != null ? parseFloat(ep.number) : NaN;
    if (!Number.isNaN(n)) return n;
    const m = String(ep && ep.title || "").match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function titleWords(title) {
    return norm(title).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  }
  function kitsuSearch(query, signal) {
    return __async(this, null, function* () {
      const url = `${KITSU_SEARCH}${encodeURIComponent(query)}&page%5Blimit%5D=6`;
      try {
        const res = yield safeFetch(url, { headers: __spreadProps(__spreadValues({}, HEADERS2), { "Accept": "application/vnd.api+json" }), signal });
        if (!res || !res.ok) return [];
        const data = yield res.json();
        if (!data || !Array.isArray(data.data)) return [];
        return data.data.map((x) => {
          const a = x.attributes || {};
          const t = a.titles && (a.titles.en || a.titles.en_jp) || a.canonicalTitle || a.slug || "";
          return { id: String(x.id), title: t, subtype: a.subtype || "" };
        }).filter((x) => x.id && x.title);
      } catch (e) {
        if (isAborted(signal)) throw e;
        return [];
      }
    });
  }
  function scoreCandidate(anime, words, wantedSeason, fullQuery) {
    const titles = [anime.title, anime.titleO];
    const t2 = anime.titles;
    if (t2) {
      for (const k in t2) {
        if (t2[k]) titles.push(t2[k]);
      }
    }
    const hay = titles.filter(Boolean).map(norm);
    if (!hay.length) return 0;
    let score = 0;
    for (const w of words) {
      for (const h of hay) {
        if (!h.includes(w)) continue;
        score += h === w ? 3 : 1.5;
        break;
      }
    }
    const minScore = Math.max(words.length * 1.5, 3);
    if (score < minScore) return 0;
    if (fullQuery) {
      const q = norm(fullQuery);
      if (hay.some((h) => h === q)) score += 4;
      else if (hay.some((h) => h.startsWith(q + " "))) score += 2;
    }
    if (wantedSeason != null && wantedSeason > 1) {
      const sPat = new RegExp(`(?:saison|season)\\s*0*${wantedSeason}\\b|(?:0*${wantedSeason})(?:st|nd|rd|th)\\s*(?:saison|season)`);
      if (hay.some((h) => sPat.test(h))) score += 10;
      const other = hay.some((h) => {
        const m = h.match(/(?:saison|season)\s*(\d+)|(?:\d+)(?:st|nd|rd|th)\s*(?:saison|season)/);
        const n = m ? parseInt(m[1] || m[2], 10) : null;
        return n != null && n !== wantedSeason;
      });
      if (other) score -= 6;
    }
    return score;
  }
  function fetchAnimeSeasons(animeId, signal) {
    return __async(this, null, function* () {
      let data = null;
      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        try {
          data = yield fetchJson(`${API}anime-seasons/${animeId}`, { headers: apiHeaders(), signal });
        } catch (e) {
          if (isAborted(signal)) throw e;
          console.warn(`[Franime] anime-seasons/${animeId} \xE9chou\xE9 (${e.message})`);
          if (attempt === 0) yield sleep(800);
        }
      }
      const det = data && Array.isArray(data.episodeDetails) ? data.episodeDetails : null;
      if (!det || !det.length) return null;
      const out = [];
      det.forEach((s, index) => {
        const sn = parseFloat(s.seasonNumber);
        if (Number.isNaN(sn) || !Array.isArray(s.episodes) || s.episodes.length === 0) return;
        out.push({ index, seasonNumber: sn, episodes: s.episodes });
      });
      return out.length ? out : null;
    });
  }
  function resolveLecteurEmbed(animeId, saisonIndex, episodeIndex, lang, lecteurIndex, signal) {
    return __async(this, null, function* () {
      const url = `${API}anime/${animeId}/${saisonIndex}/${episodeIndex}/${lang}/${lecteurIndex}`;
      const watch2Url = yield fetchTextSafe(url, { headers: apiHeaders(), signal });
      if (!watch2Url) return null;
      const target = watch2Url.trim();
      if (!target.startsWith("http")) return null;
      if (!target.includes("/watch2")) return target;
      let embed = /[?&]b=/.test(target) ? extractEmbedFromWatchUrl(target) : null;
      if (!embed) {
        const finalUrl = yield fetchFinalUrl(target, { signal });
        embed = extractEmbedFromWatchUrl(finalUrl);
      }
      return embed;
    });
  }
  function playerLabelFromUrl(url) {
    const u = String(url || "").toLowerCase();
    if (u.includes("sibnet")) return "Sibnet";
    if (u.includes("sendvid")) return "SendVid";
    if (u.includes("vidmoly")) return "VidMoly";
    if (u.includes("filemoon") || u.includes("moonplayer")) return "FileMoon";
    if (u.includes("uqload")) return "Uqload";
    if (u.includes("oneupload")) return "OneUpload";
    if (u.includes("vidoza")) return "Vidoza";
    if (u.includes("streamtape")) return "Streamtape";
    if (u.includes("smoothpre")) return "SmoothPre";
    const m = u.match(/^https?:\/\/([^/]+)/);
    return m ? m[1].replace(/^www\./, "") : "Lecteur";
  }
  function isKnownDecoy(embed) {
    if (!embed) return false;
    return DECOY_EMBEDS.has(String(embed).trim().toLowerCase());
  }
  function passesCanary(baseEmbed, animeId, saisonIndex, episodeIndex, lang, signal) {
    return __async(this, null, function* () {
      const alts = [episodeIndex + 1, episodeIndex - 1].filter((i) => i >= 0);
      for (const alt of alts) {
        if (isAborted(signal)) return true;
        const other = yield resolveLecteurEmbed(animeId, saisonIndex, alt, lang, 0, signal);
        if (!other) continue;
        const same = other.trim().toLowerCase() === String(baseEmbed).trim().toLowerCase();
        console.log(`[Franime] Canary: epIndex ${episodeIndex} vs ${alt} \u2192 ${same ? "IDENTIQUES (leurre)" : "diff\xE9rents (r\xE9el)"}`);
        return !same;
      }
      return true;
    });
  }
  function extractStreams(_0, _1, _2, _3) {
    return __async(this, arguments, function* (tmdbId, mediaType, season, episode, { signal } = {}) {
      const isTv = mediaType === "tv" || mediaType === "series";
      const wantedSeason = isTv ? parseInt(season, 10) || 1 : null;
      const wantedEpisode = isTv ? parseFloat(episode) : null;
      console.log(`[Franime] Extraction ${mediaType} ${tmdbId}` + (wantedSeason != null ? ` S${wantedSeason}E${wantedEpisode}` : ""));
      let titles;
      try {
        const mod = yield Promise.resolve().then(() => (init_metadata(), metadata_exports));
        titles = yield mod.getTmdbTitles(tmdbId, mediaType, { season: wantedSeason });
      } catch (e) {
        if (isAborted(signal)) throw e;
        titles = [];
      }
      if (!titles || !titles.length) {
        console.warn("[Franime] Aucun titre TMDB");
        return [];
      }
      const searchQueries = [];
      const primary = String(titles[0] || "").trim();
      if (primary) searchQueries.push(primary);
      let words = titleWords(primary);
      if (!words.length) {
        for (const t of titles) {
          words = titleWords(t);
          if (words.length) break;
        }
      }
      if (!words.length) return [];
      if (primary.includes(":") && primary.split(":")[0].trim().length >= 4) searchQueries.push(primary.split(":")[0].trim());
      const kitsuCandidates = [];
      for (const q of searchQueries) {
        const res = yield kitsuSearch(q, signal);
        for (const c of res) {
          if (!kitsuCandidates.some((k) => k.id === c.id)) kitsuCandidates.push(c);
        }
        if (kitsuCandidates.length >= 6) break;
      }
      if (!kitsuCandidates.length) {
        console.warn("[Franime] Recherche Kitsu vide");
        return [];
      }
      const scored = kitsuCandidates.map((c) => __spreadProps(__spreadValues({}, c), { score: scoreCandidate({ title: c.title, titleO: c.title, titles: null }, words, wantedSeason, primary) })).filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
      if (!scored.length) {
        console.warn("[Franime] Aucun candidat Kitsu pertinent");
        return [];
      }
      const validated = [];
      for (const cand of scored.slice(0, 5)) {
        if (validated.length >= MAX_CATALOG_PROBES) break;
        const seasons = yield fetchAnimeSeasons(cand.id, signal);
        if (seasons) validated.push(__spreadProps(__spreadValues({}, cand), { seasons }));
      }
      if (!validated.length) {
        console.warn("[Franime] Aucun candidat pr\xE9sent dans le catalogue franime");
        return [];
      }
      let chosen = null;
      let chosenSeason = null;
      for (const cand of validated) {
        for (const sp of cand.seasons) {
          const hasEp = sp.episodes.some((e) => episodeNumber(e) === wantedEpisode);
          if (wantedSeason != null && sp.seasonNumber === wantedSeason && hasEp) {
            chosen = cand;
            chosenSeason = sp;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) {
        for (const cand of validated) {
          for (const sp of cand.seasons) {
            const hasEp = wantedEpisode != null && sp.episodes.some((e) => episodeNumber(e) === wantedEpisode);
            if (hasEp) {
              chosen = cand;
              chosenSeason = sp;
              break;
            }
          }
          if (chosen) break;
        }
        if (!chosen) {
          chosen = validated[0];
          chosenSeason = chosen.seasons[0];
        }
      }
      const animeId = chosen.id;
      console.log(`[Franime] Cible: id=${animeId} "${chosen.title}" saison ${chosenSeason.seasonNumber} (index ${chosenSeason.index}, ${chosenSeason.episodes.length} \xE9pisodes)`);
      const episodeIndex = chosenSeason.episodes.findIndex((e) => episodeNumber(e) === wantedEpisode);
      if (episodeIndex === -1) {
        console.warn(`[Franime] \xC9pisode ${wantedEpisode} introuvable dans la saison ${chosenSeason.seasonNumber}`);
        return [];
      }
      const rawStreams = [];
      const langDefs = [
        { key: "vf", display: "VF", code: "fr" },
        { key: "vo", display: "VOSTFR", code: "ja" }
      ];
      const MAX_INDEX_PROBES = 5;
      for (const ld of langDefs) {
        let resolved = 0;
        let failures = 0;
        for (let i = 0; i < MAX_INDEX_PROBES && resolved < MAX_LECTEURS_PER_LANG; i++) {
          if (isAborted(signal)) break;
          const embed = yield resolveLecteurEmbed(animeId, chosenSeason.index, episodeIndex, ld.key, i, signal);
          if (!embed) {
            failures++;
            if (failures >= 2) break;
            continue;
          }
          if (isKnownDecoy(embed)) {
            console.warn(`[Franime] Embed-leurre statique d\xE9tect\xE9 (${ld.display}) \u2014 langue ignor\xE9e`);
            break;
          }
          if (i === 0 && !(yield passesCanary(embed, animeId, chosenSeason.index, episodeIndex, ld.key, signal))) {
            break;
          }
          const label = playerLabelFromUrl(embed);
          if (rawStreams.some((s) => playerLabelFromUrl(s.url) === label)) continue;
          resolved++;
          rawStreams.push({
            url: embed,
            name: `Franime ${label} - ${ld.display}`,
            title: `${chosen.title} E${wantedEpisode} ${ld.display} (${label})`,
            language: ld.code,
            provider: "franime"
          });
        }
        if (isAborted(signal)) break;
      }
      if (!rawStreams.length) {
        console.warn("[Franime] Aucun lecteur fiable r\xE9solu (leurre anti-scraping ou catalogue vide)");
        return [];
      }
      console.log(`[Franime] ${rawStreams.length} lecteurs bruts \u2192 resolveStream`);
      return rawStreams;
    });
  }
  var KITSU_SEARCH, MAX_CATALOG_PROBES, MAX_LECTEURS_PER_LANG, STOP_WORDS, DECOY_EMBEDS;
  var init_extractor = __esm({
    "src/franime/extractor.js"() {
      init_http();
      init_resolvers();
      init_http();
      KITSU_SEARCH = "https://kitsu.io/api/edge/anime?filter[text]=";
      MAX_CATALOG_PROBES = 3;
      MAX_LECTEURS_PER_LANG = 3;
      STOP_WORDS = /* @__PURE__ */ new Set(["the", "a", "an", "of", "no", "wa", "to", "de", "la", "le", "les", "des", "du", "et", "da", "oav"]);
      DECOY_EMBEDS = /* @__PURE__ */ new Set([
        "https://vidmoly.biz/embed-mzyza0y0iaai.html"
      ]);
    }
  });

  // src/franime/index.js
  var require_index = __commonJS({
    "src/franime/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      module.exports = { getStreams: createProvider("Franime", extractStreams) };
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
