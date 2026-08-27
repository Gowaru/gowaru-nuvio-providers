/**
 * neko-sama - Built from src/neko-sama/
 * Generated: 2026-08-27T16:17:11.816431787Z
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
  function isBudgetExhausted(startTime, budgetMs) {
    const elapsed = Date.now() - (startTime || 0);
    return elapsed > (budgetMs || TV_BUDGET_MS);
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
  var PROVIDER_BUDGET_MS, HEADERS, USER_AGENT, BASE_HEADERS, CODEC_PREFERENCE, TV_BUDGET_MS, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER, CODEC_PRIORITY, manifestCache, MANIFEST_CACHE_TTL, FETCH_CACHE_TTL, fetchCache, LANGUAGE_CODE_MAP;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      PROVIDER_BUDGET_MS = 45e3;
      HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
      };
      USER_AGENT = HEADERS["User-Agent"];
      BASE_HEADERS = __spreadValues({}, HEADERS);
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

  // src/neko-sama/http.js
  function setCurrentSignal(signal) {
    _currentSignal = signal;
  }
  function fetchText(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const signal = options.signal || _currentSignal;
      if (isAborted(signal)) throw new Error("AbortError");
      yield rateLimit(DOMAIN);
      const _a = options, { headers: customHeaders, retries = 1 } = _a, rest = __objRest(_a, ["headers", "retries"]);
      const mergedOpts = __spreadValues({
        headers: __spreadValues(__spreadValues({}, HEADERS2), customHeaders || {}),
        timeout: 15e3
      }, rest);
      let lastError = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (isAborted(signal)) {
          lastError = new Error("AbortError");
          break;
        }
        if (attempt > 0) {
          const delay = RETRY_DELAYS[attempt - 1] || 3e3;
          yield sleep(delay);
          if (isAborted(signal)) {
            lastError = new Error("AbortError");
            break;
          }
        }
        try {
          const res = yield safeFetch(url, __spreadProps(__spreadValues({}, mergedOpts), { signal }));
          if (!res) {
            lastError = new Error("No response");
            continue;
          }
          if (!res.ok) {
            lastError = new Error(`HTTP ${res.status}`);
            continue;
          }
          return yield res.text();
        } catch (e) {
          if (e.name === "AbortError" || isAborted(signal)) throw e;
          lastError = e;
          if (attempt < retries) continue;
        }
      }
      throw lastError || new Error(`Failed: ${url}`);
    });
  }
  var rateLimit, _currentSignal, DOMAIN, RETRY_DELAYS, HEADERS2;
  var init_http = __esm({
    "src/neko-sama/http.js"() {
      init_resolvers();
      rateLimit = createProviderRateLimiter();
      _currentSignal = null;
      DOMAIN = "animes-sama.su";
      RETRY_DELAYS = [1e3, 3e3];
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
      };
    }
  });

  // src/utils/metadata.js
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
      metadataCacheSet(cacheKey, uniqueTitles);
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

  // src/neko-sama/extractor.js
  function normalize(s) {
    if (!s) return "";
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[':!.,?]/g, "").replace(/-/g, " ").replace(/\b(the|season|part|cour|saison)\b/ig, "").replace(/\s+/g, " ").trim();
  }
  function toSlug(title) {
    if (!title) return "";
    return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[':!.,?']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-");
  }
  function extractEpisodes(html) {
    const episodes = [];
    const epRegex = /<a[^>]*href="([^"]+)"[^>]*>\s*<div class="epl-num">(\d+)<\/div>\s*<div class="epl-title">([^<]+)<\/div>/gi;
    let match;
    while ((match = epRegex.exec(html)) !== null) {
      episodes.push({
        num: parseInt(match[2]),
        title: match[3].trim(),
        url: match[1]
      });
    }
    return episodes;
  }
  function extractServerButtons(html) {
    const buttons = [];
    const loadMiRegex = /loadMi\(\{\s*value:\s*'([A-Za-z0-9+/=]+)'\s*\}\)/g;
    let loadMatch;
    while ((loadMatch = loadMiRegex.exec(html)) !== null) {
      try {
        const b64 = loadMatch[1];
        const decoded = atob(b64);
        const srcMatch = decoded.match(/src="([^"]+)"/);
        if (!srcMatch) continue;
        const afterBtn = html.substring(loadMatch.index, loadMatch.index + 800);
        const labelMatch = afterBtn.match(/;">\s*([A-Z]+-\d+)\s*<\/button>/);
        const label = labelMatch ? labelMatch[1].trim() : "VO";
        buttons.push({ label, playerUrl: srcMatch[1].replace(/&#038;/g, "&") });
      } catch (e) {
      }
    }
    return buttons;
  }
  function resolvePlayerUrl(playerUrl) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(playerUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": BASE_URL + "/"
          },
          timeout: 1e4
        });
        if (!res || !res.ok) return null;
        const html = yield res.text();
        const iframeMatch = html.match(/<iframe[^>]*class="player-iframe"[^>]*src="([^"]+)"/i) || html.match(/<iframe[^>]*src="([^"]+)"/i);
        if (iframeMatch) {
          let url = iframeMatch[1].replace(/&#038;/g, "&");
          return url;
        }
      } catch (e) {
      }
      return null;
    });
  }
  function labelToLanguage(label) {
    const upper = (label || "").toUpperCase();
    if (upper.startsWith("VF")) return "VF";
    if (upper.startsWith("VO")) return "VOSTFR";
    return "VOSTFR";
  }
  function tryAnimePage(url) {
    return __async(this, null, function* () {
      try {
        const html = yield fetchText(url);
        if (html && html.length > 1e3) {
          const episodes = extractEpisodes(html);
          if (episodes.length > 0) return episodes;
        }
      } catch (e) {
      }
      return [];
    });
  }
  function searchAnime(query) {
    return __async(this, null, function* () {
      try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
        const html = yield fetchText(searchUrl);
        if (!html || html.length < 1e3) return [];
        const results = [];
        const linkRegex = /href="(https?:\/\/animes-sama\.su\/anime\/[^"]+)"/gi;
        let match;
        const seen = /* @__PURE__ */ new Set();
        while ((match = linkRegex.exec(html)) !== null) {
          const url = match[1];
          if (seen.has(url)) continue;
          seen.add(url);
          const slug = url.replace(/\/$/, "").split("/").pop();
          results.push({ url, slug });
        }
        return results;
      } catch (e) {
        return [];
      }
    });
  }
  function extractStreams(_0, _1, _2, _3) {
    return __async(this, arguments, function* (tmdbId, mediaType, season, episodeNum, options = {}) {
      const signal = (options == null ? void 0 : options.signal) || null;
      if (isAborted(signal)) return [];
      setCurrentSignal(signal);
      const startTime = Date.now();
      const titles = yield getTmdbTitles(tmdbId, mediaType, { season });
      if (!titles || titles.length === 0) return [];
      console.log(`[NekoSama] Titles: ${titles.slice(0, 3).join(", ")}`);
      let seasonUrl = null;
      let episodes = [];
      for (const title of titles) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        const slug = toSlug(title);
        if (!slug) continue;
        if (season) {
          const url1 = `${BASE_URL}/anime/${slug}-saison-${season}/`;
          episodes = yield tryAnimePage(url1);
          if (episodes.length > 0) {
            seasonUrl = url1;
            console.log(`[NekoSama] \u2713 Direct URL: ${url1} (${episodes.length} eps)`);
            break;
          }
        }
        const url2 = `${BASE_URL}/anime/${slug}/`;
        episodes = yield tryAnimePage(url2);
        if (episodes.length > 0) {
          seasonUrl = url2;
          console.log(`[NekoSama] \u2713 Direct URL: ${url2} (${episodes.length} eps)`);
          break;
        }
        const url3 = `${BASE_URL}/anime/${slug}-saison-1/`;
        episodes = yield tryAnimePage(url3);
        if (episodes.length > 0) {
          seasonUrl = url3;
          console.log(`[NekoSama] \u2713 Direct URL: ${url3} (${episodes.length} eps)`);
          break;
        }
      }
      if (episodes.length === 0) {
        console.log(`[NekoSama] Direct URL failed, trying search...`);
        for (const title of titles) {
          if (isBudgetExhausted(startTime, BUDGET_MS)) break;
          const results = yield searchAnime(title);
          if (results.length === 0) continue;
          console.log(`[NekoSama] Search found ${results.length} results`);
          const queryNorm = normalize(title);
          const seasonStr = season ? `saison-${season}` : "";
          const scored = results.map((r) => {
            const slugNorm = normalize(r.slug);
            let score = 0;
            if (slugNorm === queryNorm) score += 100;
            else if (slugNorm.includes(queryNorm)) score += 80;
            else if (queryNorm.includes(slugNorm)) score += 60;
            if (seasonStr && r.slug.includes(seasonStr)) score += 50;
            if (seasonStr && !r.slug.includes(seasonStr) && r.slug.includes("saison-")) score -= 30;
            if (r.slug.includes("oav") || r.slug.includes("special")) score -= 20;
            return __spreadProps(__spreadValues({}, r), { score });
          }).sort((a, b) => b.score - a.score);
          for (const r of scored.slice(0, 3)) {
            if (isBudgetExhausted(startTime, BUDGET_MS)) break;
            episodes = yield tryAnimePage(r.url);
            if (episodes.length > 0) {
              seasonUrl = r.url;
              console.log(`[NekoSama] \u2713 Search match: ${r.url} (score: ${r.score}, ${episodes.length} eps)`);
              break;
            }
          }
          if (episodes.length > 0) break;
        }
      }
      if (episodes.length === 0) {
        console.log(`[NekoSama] No episodes found for tmdbId ${tmdbId} season ${season}`);
        return [];
      }
      const targetEp = episodes.find((e) => e.num === episodeNum);
      if (!targetEp) {
        console.log(`[NekoSama] Episode ${episodeNum} not found (available: ${episodes.map((e) => e.num).join(", ")})`);
        return [];
      }
      console.log(`[NekoSama] Episode ${episodeNum}: ${targetEp.url}`);
      let serverButtons = [];
      try {
        const html = yield fetchText(targetEp.url);
        if (html && html.length > 1e3) {
          serverButtons = extractServerButtons(html);
          console.log(`[NekoSama] Found ${serverButtons.length} server buttons`);
        }
      } catch (e) {
        console.log(`[NekoSama] Failed to fetch episode page: ${e.message}`);
        return [];
      }
      if (serverButtons.length === 0) {
        console.log(`[NekoSama] No server buttons found`);
        return [];
      }
      const streams = [];
      const langCount = { VF: 0, VOSTFR: 0 };
      const TARGET_PER_LANG = 1;
      for (const btn of serverButtons) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        const lang = labelToLanguage(btn.label);
        if (langCount[lang] >= TARGET_PER_LANG) continue;
        console.log(`[NekoSama] Resolving ${btn.label} (${lang})...`);
        const embedUrl = yield resolvePlayerUrl(btn.playerUrl);
        if (embedUrl) {
          streams.push({
            url: embedUrl,
            title: `NekoSama [${lang}] ${btn.label}`,
            name: `NekoSama (${lang})`,
            language: lang,
            provider: "NekoSama",
            headers: { "Referer": BASE_URL + "/" }
          });
          langCount[lang]++;
          console.log(`[NekoSama] \u2713 ${btn.label}: ${embedUrl.slice(0, 80)}`);
          if (langCount.VF >= TARGET_PER_LANG && langCount.VOSTFR >= TARGET_PER_LANG) {
            console.log(`[NekoSama] Early-exit: VF=${langCount.VF}, VOSTFR=${langCount.VOSTFR}`);
            break;
          }
        } else {
          console.log(`[NekoSama] \u2717 ${btn.label}: failed to resolve`);
        }
      }
      console.log(`[NekoSama] Total streams: ${streams.length}`);
      return streams;
    });
  }
  var BASE_URL, BUDGET_MS;
  var init_extractor = __esm({
    "src/neko-sama/extractor.js"() {
      init_http();
      init_resolvers();
      init_metadata();
      BASE_URL = "https://animes-sama.su";
      BUDGET_MS = 4e4;
    }
  });

  // src/neko-sama/index.js
  var require_index = __commonJS({
    "src/neko-sama/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      module.exports = { getStreams: createProvider("NekoSama", extractStreams) };
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
