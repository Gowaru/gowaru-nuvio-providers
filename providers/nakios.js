/**
 * nakios - Built from src/nakios/
 * Generated: 2026-08-26T01:19:12.853152804Z
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
    return function getStreams(_0, _1, _2, _3) {
      return __async(this, arguments, function* (tmdbId, mediaType, season, episode, options = {}) {
        const se = mediaType === "movie" ? "" : ` S${season}E${episode}`;
        const label = `${name} ${mediaType} ${tmdbId}${se}`;
        const externalSignal = options && options.signal ? options.signal : null;
        const { signal } = setupAbortSignal(externalSignal);
        if (isAborted(signal)) return [];
        console.log(`[${name}] Request: ${label}`);
        try {
          const streams = yield withTimeout(
            extractFn(tmdbId, mediaType, season, episode, { signal }),
            PROVIDER_TIMEOUT,
            label
          );
          return yield expandStreamQualities(streams, qualityOpts);
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
    if (fetchCache.size >= 200) {
      const toRemove = Math.ceil(200 * 0.2);
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
        const dedupLang = normalizeLanguageCode(stream.language || inferLanguage(stream)) || stream.language || "";
        const dedupKey = `${stream.url}|${dedupLang}`;
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
        const _a = options, { timeout, signal: externalSignal } = _a, rest = __objRest(_a, ["timeout", "signal"]);
        if (isAborted(externalSignal)) {
          return null;
        }
        const fetchOpts = __spreadProps(__spreadValues({}, rest), {
          headers: __spreadValues(__spreadValues({}, HEADERS), rest.headers),
          redirect: "follow"
        });
        if (timeout > 0 && typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "undefined") {
          const timeoutSignal = AbortSignal.timeout(timeout);
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
  var PROVIDER_BUDGET_MS, HEADERS, USER_AGENT, BASE_HEADERS, CODEC_PREFERENCE, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER, CODEC_PRIORITY, manifestCache, MANIFEST_CACHE_TTL, FETCH_CACHE_TTL, fetchCache, LANGUAGE_CODE_MAP;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      PROVIDER_BUDGET_MS = 45e3;
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
    }
  });

  // src/nakios/http.js
  function setCurrentSignal(signal) {
    _currentSignal = signal;
  }
  function fetchApi(_0) {
    return __async(this, arguments, function* (path, options = {}) {
      const signal = options.signal || _currentSignal;
      if (isAborted(signal)) return null;
      const url = `${API_BASE}${path}`;
      yield rateLimit(DOMAIN);
      console.log(`[Nakios] API: ${url}`);
      const mergedHeaders = __spreadValues(__spreadValues({}, HEADERS2), options.headers || {});
      const res = yield safeFetch(url, {
        headers: mergedHeaders,
        timeout: options.timeout || GLOBAL_TIMEOUT_MS,
        signal
      });
      if (!res || !res.ok) {
        const status = res && typeof res.status === "number" ? res.status : "no-response";
        console.warn(`[Nakios] HTTP ${status} for ${url}`);
        return null;
      }
      try {
        const data = yield res.json();
        return data;
      } catch (e) {
        console.warn(`[Nakios] JSON parse error for ${url}: ${e == null ? void 0 : e.message}`);
        return null;
      }
    });
  }
  var rateLimit, _currentSignal, DOMAIN, BASE_URL, API_BASE, GLOBAL_TIMEOUT_MS, HEADERS2;
  var init_http = __esm({
    "src/nakios/http.js"() {
      init_resolvers();
      rateLimit = createProviderRateLimiter();
      _currentSignal = null;
      DOMAIN = "api.nakios.store";
      BASE_URL = "https://nakios.store";
      API_BASE = "https://api.nakios.store";
      GLOBAL_TIMEOUT_MS = 15e3;
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": `${BASE_URL}/`,
        "Origin": BASE_URL
      };
    }
  });

  // src/utils/cache.js
  function cleanCache(tag) {
    const now = Date.now();
    const expired = [];
    for (const [key, entry] of cache) {
      if (now - entry.ts >= entry.ttl) {
        expired.push(key);
      }
    }
    for (const key of expired) {
      cache.delete(key);
    }
    if (cache.size > DEFAULT_MAX_SIZE) {
      const sorted = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      const toRemove = sorted.slice(0, cache.size - DEFAULT_MAX_SIZE);
      for (const [key] of toRemove) {
        cache.delete(key);
      }
    }
    if (expired.length > 0) {
      console.log(`[${tag}] Cache: ${expired.length} expir\xE9es supprim\xE9es, ${cache.size} entr\xE9es restantes`);
    }
    lastCleanup = now;
  }
  function createCache(namespace, tag, opts = {}) {
    const logTag = tag || namespace.toUpperCase();
    const prefix = `${namespace}_`;
    const successTtl = opts.successTtl || DEFAULT_SUCCESS_TTL;
    const failureTtl = opts.failureTtl || DEFAULT_FAILURE_TTL;
    const maxSize = opts.maxSize || DEFAULT_MAX_SIZE;
    function cacheKey(raw) {
      return `${prefix}${String(raw).replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}`;
    }
    function cacheGet(key) {
      const entry = cache.get(key);
      if (!entry) return void 0;
      const now = Date.now();
      if (now - entry.ts >= entry.ttl) {
        cache.delete(key);
        return void 0;
      }
      return entry.data;
    }
    function cacheSet(key, data, success = true) {
      if (Date.now() - lastCleanup > CLEANUP_INTERVAL) {
        cleanCache(logTag);
      }
      if (cache.size >= maxSize) {
        const toRemove = Math.ceil(maxSize * 0.2);
        const sorted = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, toRemove);
        for (const [k] of sorted) cache.delete(k);
      }
      cache.set(key, {
        data,
        ts: Date.now(),
        ttl: success ? successTtl : failureTtl,
        success
      });
    }
    return function withCache2(_0, _1) {
      return __async(this, arguments, function* (rawKey, fn, opts2 = {}) {
        const key = cacheKey(rawKey);
        if (!opts2.bypass) {
          const cached = cacheGet(key);
          if (cached !== void 0) {
            console.log(`[${logTag}] Cache HIT: ${rawKey.slice(0, 60)}`);
            return cached;
          }
        }
        console.log(`[${logTag}] Cache MISS: ${rawKey.slice(0, 60)}`);
        try {
          const result = yield fn();
          const isSuccess = result != null;
          cacheSet(key, result, isSuccess);
          if (!isSuccess) {
            console.log(`[${logTag}] Cache: negative result cached (30s TTL)`);
          }
          return result;
        } catch (error) {
          console.warn(`[${logTag}] Cache: error, not caching: ${error == null ? void 0 : error.message}`);
          throw error;
        }
      });
    };
  }
  var DEFAULT_SUCCESS_TTL, DEFAULT_FAILURE_TTL, DEFAULT_MAX_SIZE, CLEANUP_INTERVAL, cache, lastCleanup;
  var init_cache = __esm({
    "src/utils/cache.js"() {
      DEFAULT_SUCCESS_TTL = 3e5;
      DEFAULT_FAILURE_TTL = 3e4;
      DEFAULT_MAX_SIZE = 150;
      CLEANUP_INTERVAL = 6e4;
      cache = /* @__PURE__ */ new Map();
      lastCleanup = Date.now();
    }
  });

  // src/utils/search-fallback.js
  function getTmdbTitle(tmdbId, mediaType) {
    return __async(this, null, function* () {
      const type = mediaType === "tv" ? "tv" : "movie";
      const url = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`;
      try {
        const res = yield safeFetch(url);
        if (!res || !res.ok) return null;
        const data = yield res.json();
        if (!data || data.success === false) return null;
        const title = data.title || data.name || null;
        if (title) {
          console.log(`[SearchFallback] TMDB title: ${title} (${tmdbId})`);
        }
        return title;
      } catch (e) {
        console.warn(`[SearchFallback] TMDB title error for ${tmdbId}: ${e == null ? void 0 : e.message}`);
        return null;
      }
    });
  }
  var TMDB_API_KEY, TMDB_API_BASE;
  var init_search_fallback = __esm({
    "src/utils/search-fallback.js"() {
      init_resolvers();
      TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
      TMDB_API_BASE = "https://api.themoviedb.org/3";
    }
  });

  // src/nakios/extractor.js
  function isValidStreamUrl(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.toLowerCase().trim();
    if (!u.startsWith("https://")) return false;
    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (u.includes(pattern)) {
        console.log(`[Nakios] Filtered out blocked URL (${pattern}): ${u.slice(0, 80)}`);
        return false;
      }
    }
    return true;
  }
  function fetchSource(path) {
    return __async(this, null, function* () {
      return withCache(`source_${path}`, () => __async(null, null, function* () {
        const result = yield fetchApi(path);
        if (!result) return null;
        if (result.sources && Array.isArray(result.sources) && result.sources.length > 0) {
          for (const source of result.sources) {
            if (source.url && isValidStreamUrl(source.url) && source.isPremium !== true) {
              return source;
            }
          }
          if (EXCLUDE_PREMIUM) {
            console.log(`[Nakios] Premium sources excluded (NUVIO_NAKIOS_EXCLUDE_PREMIUM=1)`);
            return null;
          }
          for (const source of result.sources) {
            if (source.url && isValidStreamUrl(source.url)) {
              console.log(`[Nakios] Using premium source (${source.name || "?"}) - no free source available`);
              return source;
            }
          }
          console.warn(`[Nakios] All ${result.sources.length} source(s) filtered out (invalid URLs)`);
          return null;
        }
        if (result.url) {
          if (isValidStreamUrl(result.url)) {
            return result;
          }
          console.warn(`[Nakios] Source filtered out (invalid URL): ${(result.url || "").slice(0, 80)}`);
          return null;
        }
        return null;
      }));
    });
  }
  function searchContent(query) {
    return __async(this, null, function* () {
      const path = `/api/search/multi?query=${encodeURIComponent(query)}`;
      return withCache(`search_${query.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, () => __async(null, null, function* () {
        try {
          const result = yield fetchApi(path);
          if (!result || !result.results || !Array.isArray(result.results)) {
            return [];
          }
          return result.results.filter((r) => r.media_type === "movie" || r.media_type === "tv").map((r) => ({
            id: r.id,
            media_type: r.media_type,
            title: r.title || r.name || "",
            year: (r.release_date || r.first_air_date || "").slice(0, 4)
          }));
        } catch (e) {
          console.warn(`[Nakios] Search error: ${e == null ? void 0 : e.message}`);
          return [];
        }
      }));
    });
  }
  function fallbackSearch(tmdbId, mediaType, season, episode) {
    return __async(this, null, function* () {
      console.log(`[Nakios] Fallback search for ${mediaType} ${tmdbId}...`);
      const title = yield getTmdbTitle(tmdbId, mediaType);
      if (!title) {
        console.warn(`[Nakios] Fallback: cannot get TMDB title for ${tmdbId}`);
        return null;
      }
      const results = yield searchContent(title);
      if (results.length === 0) {
        const shortTitle = title.split(":")[0].trim();
        if (shortTitle !== title) {
          const results2 = yield searchContent(shortTitle);
          if (results2.length > 0) {
            return trySearchResults(results2, tmdbId, mediaType, season, episode);
          }
        }
        console.warn(`[Nakios] Fallback: no results for "${title}"`);
        return null;
      }
      return trySearchResults(results, tmdbId, mediaType, season, episode);
    });
  }
  function trySearchResults(results, originalTmdbId, mediaType, season, episode) {
    return __async(this, null, function* () {
      console.log(`[Nakios] Fallback: ${results.length} result(s) from search`);
      for (const r of results) {
        console.log(`[Nakios]   \u2192 ${r.media_type} ${r.id}: "${r.title}" (${r.year})`);
      }
      const sorted = [...results].sort((a, b) => {
        if (a.id === Number(originalTmdbId)) return -1;
        if (b.id === Number(originalTmdbId)) return 1;
        return 0;
      });
      const attempts = sorted.slice(0, 3);
      for (const r of attempts) {
        if (r.id === Number(originalTmdbId)) {
          console.log(`[Nakios] Fallback: TMDB ${r.id} matches original, already tried`);
          continue;
        }
        console.log(`[Nakios] Fallback: trying TMDB ${r.id} (${r.title})`);
        let altPath;
        if (r.media_type === "movie") {
          altPath = `/api/sources/movie/${r.id}`;
        } else if (r.media_type === "tv") {
          altPath = `/api/sources/tv/${r.id}/${Number(season) || 1}/${Number(episode) || 1}`;
        } else {
          console.log(`[Nakios] Fallback: skipping ${r.id} (unknown type: ${r.media_type})`);
          continue;
        }
        const source = yield fetchSource(altPath);
        if (source && source.url) {
          console.log(`[Nakios] Fallback SUCCESS: TMDB ${r.id} \u2192 source found!`);
          return source;
        }
      }
      console.warn(`[Nakios] Fallback: no alternate ID yielded a source`);
      return null;
    });
  }
  function createStream(source) {
    const quality = source.quality || "HD";
    const language = source.lang || source.language || "VF";
    const providerName = source.name || source.provider || "Nakios";
    const isHls = source.isM3U8 === true;
    const format = isHls ? "hls" : "mp4";
    const stream = {
      name: providerName,
      title: `[${language}] ${providerName} - ${quality}`,
      url: source.url,
      quality,
      language,
      type: format,
      headers: {
        "Referer": `${BASE_URL}/`,
        "Origin": BASE_URL
      }
    };
    if (source.id) {
      stream.id = source.id;
    }
    if (source.isPremium === true) {
      stream.isPremium = true;
    }
    if (source.isEmbed === true) {
      stream.isEmbed = true;
    }
    if (source.size) {
      stream.size = source.size;
    }
    return stream;
  }
  function extractStreams(_0, _1, _2, _3) {
    return __async(this, arguments, function* (tmdbId, mediaType, season, episode, options = {}) {
      const signal = (options == null ? void 0 : options.signal) || null;
      if (isAborted(signal)) return [];
      setCurrentSignal(signal);
      console.log(`[Nakios] Looking up ${mediaType} ${tmdbId}`);
      let apiPath;
      if (mediaType === "movie") {
        apiPath = `/api/sources/movie/${tmdbId}`;
      } else {
        const targetSeason = Number(season) || 1;
        const targetEpisode = Number(episode) || 1;
        apiPath = `/api/sources/tv/${tmdbId}/${targetSeason}/${targetEpisode}`;
        console.log(`[Nakios] Looking for S${targetSeason}E${targetEpisode} (TMDB: ${tmdbId})`);
      }
      let source = yield fetchSource(apiPath);
      if (!source || !source.url) {
        console.warn(`[Nakios] No source for ${apiPath}, trying search fallback...`);
        source = yield fallbackSearch(tmdbId, mediaType, season, episode);
      }
      if (!source || !source.url) {
        console.warn(`[Nakios] No source found for ${mediaType} ${tmdbId}`);
        return [];
      }
      const stream = createStream(source);
      console.log(`[Nakios] Stream: ${stream.quality} ${stream.type} | ${stream.name} | ${stream.language}`);
      return [stream];
    });
  }
  var withCache, EXCLUDE_PREMIUM, BLOCKED_URL_PATTERNS;
  var init_extractor = __esm({
    "src/nakios/extractor.js"() {
      init_http();
      init_cache();
      init_search_fallback();
      init_resolvers();
      withCache = createCache("nk", "Nakios", { failureTtl: 12e4 });
      EXCLUDE_PREMIUM = safeConfig("NUVIO_NAKIOS_EXCLUDE_PREMIUM", 0) === 1;
      BLOCKED_URL_PATTERNS = [
        "t.me",
        "telegram.me",
        "telegram.org",
        "cheksum.lol",
        "doubleclick.net",
        "googleadservices.com",
        "googlesyndication.com"
      ];
    }
  });

  // src/nakios/index.js
  var require_index = __commonJS({
    "src/nakios/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      module.exports = { getStreams: createProvider("Nakios", extractStreams) };
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
