/**
 * aniverse - Built from src/aniverse/
 * Generated: 2026-11-18T20:08:56.485536457Z
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

  // src/utils/turnstile.js
  function delay(ms) {
    const d = Number(ms) > 0 ? Number(ms) : 0;
    if (HAS_TIMERS) return new Promise((resolve) => setTimeout(resolve, d));
    const target = Date.now() + d;
    return new Promise((resolve) => {
      const check = () => Date.now() >= target ? resolve() : Promise.resolve().then(check);
      check();
    });
  }
  function readSettings() {
    try {
      if (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS && typeof globalThis.SCRAPER_SETTINGS === "object") {
        return globalThis.SCRAPER_SETTINGS;
      }
    } catch (e) {
    }
    return {};
  }
  function getTurnstileSolverConfig() {
    const s = readSettings();
    const apiKey = typeof s.turnstileApiKey === "string" ? s.turnstileApiKey.trim() : "";
    const service = (typeof s.turnstileService === "string" ? s.turnstileService : "capsolver").toLowerCase();
    const enabled = s.turnstileEnabled === true || s.turnstileEnabled === "true";
    return { enabled: enabled && apiKey.length > 0, service, apiKey };
  }
  function isTurnstileSolverEnabled() {
    return getTurnstileSolverConfig().enabled;
  }
  function extractTurnstileSitekey(html) {
    const text = String(html || "");
    const patterns = [
      /data-sitekey=["']([^"']+)["']/,
      /turnstile\.render\([^)]*?sitekey\s*:\s*["']([^"']+)["']/,
      /sitekey\s*:\s*["']([^"']+)["']/
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1]) return m[1];
    }
    return null;
  }
  function postJson(url, body, timeoutMs) {
    return __async(this, null, function* () {
      try {
        const res = yield fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
          signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : void 0
        });
        if (!res) return null;
        const json = yield res.json().catch(() => null);
        return json && typeof json === "object" ? json : null;
      } catch (e) {
        return null;
      }
    });
  }
  function getJson(url, timeoutMs) {
    return __async(this, null, function* () {
      try {
        const res = yield fetch(url, {
          headers: { Accept: "application/json" },
          signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : void 0
        });
        if (!res) return null;
        const json = yield res.json().catch(() => null);
        return json && typeof json === "object" ? json : null;
      } catch (e) {
        return null;
      }
    });
  }
  function solveWithCapSolver(apiKey, pageUrl, sitekey, deadline) {
    return __async(this, null, function* () {
      const created = yield postJson("https://api.capsolver.com/createTask", {
        clientKey: apiKey,
        task: { type: "AntiTurnstileTaskProxyLess", websiteURL: pageUrl, websiteKey: sitekey }
      }, 8e3);
      if (!created || created.errorId || !created.taskId) {
        if (created && created.errorCode) console.warn(`[Turnstile] CapSolver refus: ${created.errorCode}`);
        return null;
      }
      while (Date.now() < deadline) {
        yield delay(POLL_INTERVAL_MS);
        const res = yield postJson("https://api.capsolver.com/getTaskResult", {
          clientKey: apiKey,
          taskId: created.taskId
        }, 8e3);
        if (!res) continue;
        if (res.status === "ready" && res.solution && res.solution.token) return res.solution.token;
        if (res.errorId) {
          if (res.errorCode) console.warn(`[Turnstile] CapSolver erreur: ${res.errorCode}`);
          return null;
        }
      }
      return null;
    });
  }
  function solveWith2Captcha(apiKey, pageUrl, sitekey, deadline) {
    return __async(this, null, function* () {
      const form = `key=${encodeURIComponent(apiKey)}&method=turnstile&sitekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;
      const created = yield getJson(`https://2captcha.com/in.php?${form}`, 8e3);
      if (!created || created.status !== 1 || !created.request) {
        if (created && created.request) console.warn(`[Turnstile] 2Captcha refus: ${created.request}`);
        return null;
      }
      while (Date.now() < deadline) {
        yield delay(POLL_INTERVAL_MS);
        const res = yield getJson(
          `https://2captcha.com/res.php?key=${encodeURIComponent(apiKey)}&action=get&id=${encodeURIComponent(created.request)}&json=1`,
          8e3
        );
        if (!res) continue;
        if (res.status === 1 && typeof res.request === "string") return res.request;
        if (res.request && res.request !== "CAPCHA_NOT_READY") {
          console.warn(`[Turnstile] 2Captcha erreur: ${res.request}`);
          return null;
        }
      }
      return null;
    });
  }
  function solveTurnstile() {
    return __async(this, arguments, function* ({ pageUrl, sitekey, html, budgetMs } = {}) {
      const cfg = getTurnstileSolverConfig();
      if (!cfg.enabled) return null;
      if (!pageUrl || typeof pageUrl !== "string") return null;
      const key = sitekey || extractTurnstileSitekey(html);
      if (!key) {
        console.warn("[Turnstile] Sitekey introuvable dans la page embed");
        return null;
      }
      const budget = Number(budgetMs) > 0 ? Number(budgetMs) : SOLVE_BUDGET_MS;
      const deadline = Date.now() + budget;
      try {
        const token = cfg.service === "2captcha" ? yield solveWith2Captcha(cfg.apiKey, pageUrl, key, deadline) : yield solveWithCapSolver(cfg.apiKey, pageUrl, key, deadline);
        if (token) console.log("[Turnstile] Challenge r\xE9solu par le solveur configur\xE9");
        else console.warn("[Turnstile] Solveur: pas de token dans le budget imparti");
        return token || null;
      } catch (e) {
        return null;
      }
    });
  }
  var SOLVE_BUDGET_MS, POLL_INTERVAL_MS, HAS_TIMERS;
  var init_turnstile = __esm({
    "src/utils/turnstile.js"() {
      SOLVE_BUDGET_MS = 12e3;
      POLL_INTERVAL_MS = 2500;
      HAS_TIMERS = typeof setTimeout === "function";
    }
  });

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
  function looksSilentlyTruncatedHtml(response, bodyText) {
    if (typeof bodyText !== "string" || bodyText.length < SILENT_TRUNCATION_MIN_CHARS) return false;
    if (!responseLooksHtml(response, bodyText)) return false;
    if (!/<html[\s>]/i.test(bodyText)) return false;
    return !/<\/html\s*>/i.test(bodyText);
  }
  function sleep(ms) {
    const delay2 = Number(ms) > 0 ? Number(ms) : 0;
    if (HAS_NATIVE_TIMERS) {
      return new Promise((resolve) => {
        setTimeout(resolve, delay2);
      });
    }
    const target = Date.now() + delay2;
    return new Promise((resolve) => {
      const check = () => Date.now() >= target ? resolve() : Promise.resolve().then(check);
      check();
    });
  }
  function dedupeStreams(streams) {
    const rawList = Array.isArray(streams) ? streams : [];
    const seenUrls = /* @__PURE__ */ new Set();
    const out = [];
    for (const s of rawList) {
      if (!s) continue;
      const u = s.url;
      if (typeof u === "string") {
        if (!u || u.includes("[object")) continue;
        const dedupKey = `${u}|${String(s.language || "").toUpperCase()}`;
        if (seenUrls.has(dedupKey)) continue;
        seenUrls.add(dedupKey);
      }
      out.push(s);
    }
    return out;
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
          const budgetDeadline = startTime + Math.max(5e3, PROVIDER_TIMEOUT - 5e3);
          const dedupedRaw = dedupeStreams(rawStreams);
          const truncated = dedupedRaw.slice(0, maxStreams * 2);
          const expanded = yield expandStreamQualities(truncated, __spreadProps(__spreadValues({}, qualityOpts), { budgetDeadline }));
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
      if (!HAS_NATIVE_TIMERS) return null;
      try {
        const res = yield safeFetch(url, { method: "HEAD", headers, timeout: 5e3 });
        if (!res || !res.ok) return null;
        const cl = getResponseHeader(res.headers, "content-length");
        if (!cl) return null;
        const bytes = Number(cl);
        if (!Number.isFinite(bytes) || bytes <= 0) return null;
        return formatSizeBytes(bytes);
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
      if (!ms || ms <= 0 || !HAS_NATIVE_TIMERS) return promise;
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
  function isPlayableMediaUrl(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.toLowerCase();
    if (isKnownFakeDirectUrl(u)) return false;
    return /\.(mp4|m3u8|mkv|webm|mpd)(\?.*)?$/.test(u) || u.includes("/hls2/") || u.includes("/master.m3u8");
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
    if (/[?&]format=hls\b/.test(u) || /\/v1\/(anime|tv|movie)\?/.test(u)) return "hls";
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
      let manifest = null;
      try {
        manifest = yield withTimeout(res.text(), options.manifestTimeout || 12e3, "manifest-body");
      } catch (e) {
        manifest = null;
      }
      if (!manifest) {
        return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD"), type: "hls" })];
      }
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
  function isEnrichmentBudgetSpent(options) {
    const deadline = Number(options && options.budgetDeadline);
    return deadline > 0 && Date.now() > deadline;
  }
  function expandStreamQualities(_0) {
    return __async(this, arguments, function* (streams, options = {}) {
      const input = Array.isArray(streams) ? streams : [];
      const expanded = [];
      const manifestCap = Number(options.maxManifestFetches) > 0 ? Number(options.maxManifestFetches) : MAX_MANIFEST_EXPANSIONS;
      const skipManifests = options.skipManifestExpansion === true;
      let manifestFetches = 0;
      const results = yield Promise.allSettled(
        input.map((stream) => {
          const url = stream && typeof stream.url === "string" ? stream.url : "";
          const lower = url.toLowerCase();
          const needsManifest = lower.includes(".m3u8") || lower.includes("/hls/");
          if (!needsManifest) return expandSingleStreamQualities(stream, options);
          if (skipManifests || isEnrichmentBudgetSpent(options) || manifestFetches >= manifestCap) {
            return Promise.resolve([__spreadProps(__spreadValues({}, stream), {
              quality: normalizeQualityLabel(stream && stream.quality || "HD"),
              type: "hls"
            })]);
          }
          manifestFetches++;
          return expandSingleStreamQualities(stream, options);
        })
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
        const displayName = s.name || baseTitle || null;
        return __spreadProps(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, s), title !== s.title ? { title } : {}), displayName && displayName !== s.name ? { name: displayName } : {}), title || !displayName ? {} : { title: displayName }), enrichedQuality !== s.quality ? { quality: enrichedQuality } : {}), {
          type: s.type || inferType(s.url),
          language: lang
        });
      });
      const directVideoRe = /\.(mp4|mkv|webm)(\?.*)?$/i;
      const sizeProbeEnabled = options.sizeProbe !== false && !isEnrichmentBudgetSpent(options);
      const streamsNeedingSize = sizeProbeEnabled ? sorted.filter((s) => !s.size && s.url && directVideoRe.test(s.url)).slice(0, MAX_SIZE_PROBES) : [];
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
        if (status === 0) return null;
        let bodyText = "";
        let truncated = false;
        try {
          const rawText = yield response.text();
          if (rawText && rawText.endsWith(RUNTIME_TRUNCATION_SUFFIX)) {
            truncated = true;
            bodyText = rawText;
          } else if (rawText && looksSilentlyTruncatedHtml(response, rawText)) {
            truncated = true;
            bodyText = rawText;
            console.warn(`[safeFetch] HTML silently truncated by runtime (${rawText.length} chars, no </html>): ${(url || "").slice(0, 100)}`);
          } else if (rawText && rawText.length >= MAX_SAFE_FETCH_BODY_BYTES) {
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
        let videoUrl = null;
        const fileMatch = html.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i);
        if (fileMatch) {
          videoUrl = fileMatch[1];
        }
        if (!videoUrl) {
          const srcMatch = html.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i);
          if (srcMatch) videoUrl = srcMatch[1];
        }
        if (!videoUrl) {
          const playerSrcMatch = html.match(/player\.src\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+\.mp4[^"']*)['"]/i);
          if (playerSrcMatch) videoUrl = playerSrcMatch[1];
        }
        if (!videoUrl) {
          const genericMatch = html.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)["']/i);
          if (genericMatch) videoUrl = genericMatch[1];
        }
        if (!videoUrl) return { url };
        if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;
        else if (videoUrl.startsWith("/")) videoUrl = "https://video.sibnet.ru" + videoUrl;
        try {
          const headRes = yield safeFetch(videoUrl, {
            method: "HEAD",
            headers: { "Referer": "https://video.sibnet.ru/" },
            timeout: 5e3
          });
          if (headRes && headRes.url && headRes.url !== videoUrl && headRes.url.includes(".mp4")) {
            videoUrl = headRes.url;
          }
        } catch (_) {
        }
        return { url: videoUrl, headers: { "Referer": "https://video.sibnet.ru/" } };
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
        const originalReferer = originalDomain ? `https://${originalDomain}/` : "https://vidmoly.biz/";
        const tldVariants = ["biz", "net", "ru", "is", "to"];
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
            const serveRefOf = (r, fallbackRef) => {
              var _a2;
              const finalDomain = r && r.url && ((_a2 = r.url.match(/^https?:\/\/([^/]+)/)) == null ? void 0 : _a2[1]) || "";
              return finalDomain ? `https://${finalDomain}/` : fallbackRef;
            };
            let html = yield res.text();
            const hasJsRedirect = /window\.location\.replace/.test(html);
            if (html.length < 500 && !hasJsRedirect || html.includes("finisheddaysflamboyant")) continue;
            if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
            const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
            if (match) {
              const serveRef = serveRefOf(res, ref);
              return { url: match[1], headers: { "Referer": serveRef, "Origin": serveRef } };
            }
            const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) || html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
            if (jsRedirect && jsRedirect[1] !== fetchUrl) {
              res = yield safeFetch(jsRedirect[1], { headers: { "Referer": ref, "Origin": ref } });
              if (res) {
                html = yield res.text();
                if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
                const match2 = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                if (match2) {
                  const serveRef = serveRefOf(res, ref);
                  return { url: match2[1], headers: { "Referer": serveRef, "Origin": serveRef } };
                }
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
  function resolveMailRu(url) {
    return __async(this, null, function* () {
      var _a;
      try {
        const id = (_a = url.match(/\/video\/embed\/(\d+)/)) == null ? void 0 : _a[1];
        if (!id) return { url };
        const metaUrl = `https://my.mail.ru/+/video/meta/${id}`;
        const res = yield safeFetch(metaUrl, {
          headers: { "Referer": url, "Accept": "application/json" }
        });
        if (!res || !res.ok) return { url };
        let data = null;
        try {
          data = JSON.parse(yield res.text());
        } catch (e) {
          return { url };
        }
        const videos = Array.isArray(data == null ? void 0 : data.videos) ? data.videos : [];
        const sorted = [...videos].sort(
          (a, b) => (parseInt(b.key, 10) || 0) - (parseInt(a.key, 10) || 0)
        );
        const best = sorted.find((v) => v && v.url);
        if (!best) return { url };
        let videoUrl = best.url.startsWith("//") ? "https:" + best.url : best.url;
        return {
          url: videoUrl,
          headers: { "Referer": "https://my.mail.ru/" },
          quality: best.key || void 0
        };
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveVk(url) {
    return __async(this, null, function* () {
      try {
        let oid = null;
        let vid = null;
        const mOid = url.match(/[?&]oid=(-?\d+)/i);
        const mId = url.match(/[?&]id=(\d+)/i);
        if (mOid && mId) {
          oid = mOid[1];
          vid = mId[1];
        }
        if (oid == null) {
          const m = url.match(/video(-?\d+)_(\d+)/);
          if (m) {
            oid = m[1];
            vid = m[2];
          }
        }
        if (oid == null || vid == null) return { url };
        const res = yield safeFetch("https://vk.com/al_video.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://vk.com/",
            "Origin": "https://vk.com",
            "Accept": "*/*",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
          },
          body: `act=show&al=1&video=${oid}_${vid}&module=video`,
          timeout: 1e4
        });
        if (!res || !res.ok) return { url };
        const text = yield res.text();
        const unescape = (s) => s.split("\\/").join("/");
        if (!/"(hls|url\d+)"\s*:/.test(text) && /(retir[eé]e|removed|&#233;t&#233; retir|expired)/i.test(text)) {
          console.warn(`[Resolver] VK vid\xE9o indisponible (retir\xE9e/expir\xE9e): ${url.slice(0, 70)}`);
          return { url, isDead: true };
        }
        const hls = text.match(/"hls"\s*:\s*"([^"]+)"/);
        if (hls && hls[1]) {
          const hlsUrl = unescape(hls[1]);
          if (/^https?:/.test(hlsUrl)) {
            return {
              url: hlsUrl,
              headers: { "Referer": "https://vk.com/", "User-Agent": USER_AGENT }
            };
          }
        }
        for (const q of ["1080", "720", "480", "360", "240"]) {
          const m = text.match(new RegExp('"url' + q + '"\\s*:\\s*"([^"]+)"'));
          if (!m || !m[1]) continue;
          const mp4 = unescape(m[1]);
          if (!/^https?:/.test(mp4)) continue;
          return {
            url: mp4,
            headers: { "Referer": "https://vk.com/", "User-Agent": USER_AGENT },
            quality: `${q}p`
          };
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
      if (originalDomain.endsWith(".cx")) fallbackDomains.push("uqload.co", "uqload.vc");
      const uniqueDomains = [...new Set(fallbackDomains)];
      const EXPIRED_MARKERS = [
        "file is no longer available",
        "expired or has been deleted",
        "file no longer exists"
      ];
      const isExpiredPage = (html) => {
        const low = html.toLowerCase();
        return EXPIRED_MARKERS.some((m) => low.includes(m));
      };
      const isRestrictedStub = (html) => html.length < 200 && /restricted for this domain/i.test(html);
      let fetchedPages = 0;
      let restrictedPages = 0;
      const refererChain = [
        `https://${uniqueDomains[0]}/`,
        // self (comportement historique, autres providers)
        "https://lecteurvideo.com/",
        // parent lecteurvideo (chaîne wookafr)
        ""
        // sans Referer
      ];
      const extractFile = (content) => content.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) || content.match(/sources\s*:\s*\[[^\]]*?\{[^}]*?file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) || content.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8)[^"']*)["']\]/i) || content.match(/["'](https?:\/\/[^"']*\/hls\d?\/[^"']*\.m3u8[^"']*)["']/i) || content.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
      for (const domain of uniqueDomains) {
        const tryUrl = `https://${domain}${normalizedPath}`;
        for (const referer of refererChain) {
          try {
            const headers = __spreadValues({}, HEADERS);
            if (referer) headers["Referer"] = referer;
            const res = yield safeFetch(tryUrl, { headers });
            if (!res) continue;
            let html = yield res.text();
            if (isExpiredPage(html)) {
              console.warn(`[Resolver] uqload embed dead (expired/deleted): ${url.slice(0, 80)}`);
              return { url, isDead: true };
            }
            fetchedPages++;
            if (isRestrictedStub(html)) {
              restrictedPages++;
              continue;
            }
            if (!html.includes("p,a,c,k,e,d") && !html.includes("eval(function") && !extractFile(html)) continue;
            if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
            const match = extractFile(html);
            if (match) {
              const playHeaders = { "Referer": `https://${domain}/` };
              return { url: match[1], headers: playHeaders };
            }
          } catch (e) {
          }
        }
      }
      if (fetchedPages > 0 && restrictedPages === fetchedPages) {
        console.warn(`[Resolver] uqload embed dead (restricted on all referers): ${url.slice(0, 80)}`);
        return { url, isDead: true };
      }
      return { url };
    });
  }
  function decodeVoePlayerConfig(html) {
    if (!html || html.indexOf("application/json") < 0) return null;
    const m = html.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    let payload = null;
    try {
      const arr = JSON.parse(m[1]);
      if (Array.isArray(arr) && typeof arr[0] === "string") payload = arr[0];
      else if (typeof arr === "string") payload = arr;
    } catch (e) {
      return null;
    }
    if (!payload) return null;
    const lenientB64 = (s) => {
      const clean = String(s || "").replace(/[^A-Za-z0-9+/=]/g, "");
      const pad = clean.length % 4;
      const padded = pad ? clean + "=".repeat(4 - pad) : clean;
      return _atob(padded);
    };
    const rot13 = (s) => s.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
    try {
      let s = rot13(payload);
      s = lenientB64(s);
      let shifted = "";
      for (let i = 0; i < s.length; i++) shifted += String.fromCharCode(s.charCodeAt(i) - 3);
      const reversed = shifted.split("").reverse().join("");
      const decoded = lenientB64(reversed);
      const obj = JSON.parse(decoded);
      if (obj && typeof obj === "object" && typeof obj.source === "string" && /^https?:\/\//.test(obj.source)) {
        return obj;
      }
    } catch (e) {
    }
    return null;
  }
  function resolveVoe(url) {
    return __async(this, null, function* () {
      try {
        const res = yield safeFetch(url);
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes('<div id="root">') && html.includes("/assets/index-")) {
          return { url };
        }
        let fetchUrl = url;
        for (let hop = 0; hop < 3; hop++) {
          const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
          if (!redirect || redirect[1] === fetchUrl) break;
          fetchUrl = redirect[1];
          const res2 = yield safeFetch(fetchUrl);
          if (!res2) break;
          html = yield res2.text();
        }
        const cfg = decodeVoePlayerConfig(html);
        if (cfg) {
          const directUrl = String(cfg.direct_access_url || "");
          const masterUrl = String(cfg.source || "");
          const finalUrl = masterUrl || directUrl;
          if (finalUrl && !isKnownFakeDirectUrl(finalUrl)) {
            return { url: finalUrl, headers: { "Referer": fetchUrl + "/" } };
          }
          if (directUrl && !isKnownFakeDirectUrl(directUrl)) {
            return { url: directUrl, headers: { "Referer": fetchUrl + "/" } };
          }
        }
        if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
        const match = html.match(/'hls'\s*:\s*'([^']+)'/) || html.match(/"hls"\s*:\s*"([^"]+)"/) || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
        if (match) {
          let videoUrl = match[1] || match[0];
          if (videoUrl.includes("base64")) videoUrl = _atob(videoUrl.split(",")[1] || videoUrl);
          if (videoUrl.includes("test-videos.co.uk") || isKnownFakeDirectUrl(videoUrl)) return { url };
          return { url: videoUrl, headers: { "Referer": fetchUrl } };
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveFsvidVidzy(url) {
    return __async(this, null, function* () {
      try {
        const embedDomain = (url.match(/^https?:\/\/([^/]+)/) || [])[1] || "";
        const embedRef = embedDomain ? `https://${embedDomain}/` : "https://fsvid.lol/";
        const res = yield safeFetch(url, { headers: { Referer: embedRef } });
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
        let videoUrl = null;
        const hostname = embedDomain ? embedDomain.split("/")[0] : (embedRef.split("//")[1] || "").replace(/\//g, "");
        const newPattern = html.match(/\}\)\(["']([A-Za-z0-9+/=_-]{50,})["']\)/);
        if (newPattern && html.includes("reverse().join")) {
          const b64 = newPattern[1].replace(/-/g, "+").replace(/_/g, "/");
          let bin = "";
          try {
            bin = atob(b64);
          } catch (e) {
          }
          if (bin) {
            let H = 0;
            for (let j = 0; j < hostname.length; j++) {
              H = H + hostname.charCodeAt(j) & 255;
            }
            const a = bin.split("").reverse().join("");
            for (let BC = 0; BC < 256; BC++) {
              let decoded = "";
              for (let i = 0; i < a.length; i++) {
                const kk = 61 + i * 89 + H + BC & 255;
                decoded += String.fromCharCode(a.charCodeAt(i) ^ kk);
              }
              if (/^https?:\/\//.test(decoded) && decoded.includes(".m3u8") && !decoded.includes("/troll/")) {
                videoUrl = decoded;
                break;
              }
            }
          }
        }
        if (!videoUrl) {
          const legacyPattern = /(?:var|let|const)\s*k=\[([0-9,\s]+)\],b=atob\(s\)[\s\S]*?return\s+\w+\}\)\(["']([A-Za-z0-9+/=_-]+)["']\)/g;
          let match;
          while ((match = legacyPattern.exec(html)) !== null) {
            const key = match[1].split(",").map((n) => parseInt(n, 10));
            const b64 = match[2].replace(/-/g, "+").replace(/_/g, "/");
            let bin = "";
            try {
              bin = atob(b64);
            } catch (e) {
              continue;
            }
            let decoded = "";
            for (let i = 0; i < bin.length; i++) {
              decoded += String.fromCharCode(bin.charCodeAt(i) ^ key[i % key.length]);
            }
            if (decoded.startsWith("http") && decoded.includes(".m3u8") && !decoded.includes("/troll/")) {
              videoUrl = decoded;
              break;
            }
          }
        }
        if (!videoUrl) {
          const all = html.match(/https?:\/\/[^\s"'<>\\)]+?\.m3u8[^\s"'<>\\)]*/g) || [];
          const real = all.filter((u) => !u.includes("/troll/") && !u.includes("_fsvHls") && !u.includes("troll.m3u8"));
          videoUrl = real.find((u) => u.includes("master.m3u8")) || real[0] || null;
        }
        if (!videoUrl) return { url };
        const referer = url.includes("vidzy") ? "https://vidzy.live/" : "https://fsvid.lol/";
        return { url: videoUrl, headers: { Referer: referer } };
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveStreamtape(url) {
    return __async(this, null, function* () {
      try {
        const idMatch = url.match(/\/(?:e|v)\/([A-Za-z0-9]+)/) || url.match(/[?&]id=([A-Za-z0-9]+)/);
        const fileId = idMatch ? idMatch[1] : null;
        const pageUrl = fileId ? `https://streamtape.com/e/${fileId}/` : url;
        const res = yield safeFetch(pageUrl);
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("p,a,c,k,e,d")) html = unpack(html);
        const tokenMatches = html.match(/token=([A-Za-z0-9_-]+)/g);
        const expiresMatches = html.match(/expires=(\d+)/g);
        const ipMatches = html.match(/ip=([A-Za-z0-9]+)/g);
        let token = null;
        if (tokenMatches && tokenMatches.length > 0) {
          const counts = /* @__PURE__ */ new Map();
          for (const t of tokenMatches) {
            const v = t.split("=")[1];
            if (v) counts.set(v, (counts.get(v) || 0) + 1);
          }
          let best = 0;
          for (const [v, c] of counts) {
            if (c >= best) {
              token = v;
              best = c;
            }
          }
        }
        if (fileId && token) {
          const expires = expiresMatches && expiresMatches.length > 0 ? expiresMatches[expiresMatches.length - 1].split("=")[1] : null;
          const ip = ipMatches && ipMatches.length > 0 ? ipMatches[ipMatches.length - 1].split("=")[1] : null;
          if (expires && ip) {
            return {
              url: `https://streamtape.com/get_video?id=${fileId}&expires=${expires}&ip=${ip}&token=${token}`,
              headers: { "Referer": "https://streamtape.com/" }
            };
          }
        }
        if (/get_video\?/i.test(url) && /[?&]token=/i.test(url)) {
          return { url, headers: { "Referer": "https://streamtape.com/" }, isDirect: true };
        }
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
        if (res.status === 502 || res.status === 503) {
          console.warn(`[Sendvid] Service temporarily unavailable (${res.status}): ${embedUrl.slice(0, 60)}`);
          return { url: embedUrl, isDirect: false };
        }
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
  function fetchFresh(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      try {
        const sep = url.includes("?") ? "&" : "?";
        const res = yield fetch(`${url}${sep}_=${Date.now()}`, __spreadProps(__spreadValues({}, options), { redirect: "follow" }));
        if (!res || !res.ok) return null;
        const text = yield res.text();
        return { text: text || "", res, finalUrl: res.url || url };
      } catch (e) {
        return null;
      }
    });
  }
  function extractSitekey(html) {
    const text = String(html || "");
    const m = text.match(/data-sitekey=["']([^"']+)["']/) || text.match(/turnstile\.render\([^)]*?sitekey\s*:\s*["']([^"']+)["']/) || text.match(/sitekey\s*:\s*["']([^"']+)["']/);
    return m ? m[1] : null;
  }
  function freshPageText(url) {
    return __async(this, null, function* () {
      const page = yield fetchFresh(url, { headers: { Referer: "https://playmogo.com/" } });
      return page ? page.text : "";
    });
  }
  function trySolveDoodGate(pageUrl, finalDomain, gatedHtml, sitekey) {
    return __async(this, null, function* () {
      if (!isTurnstileSolverEnabled()) return null;
      const token = yield solveTurnstile({ pageUrl, html: gatedHtml, sitekey });
      if (!token) return null;
      const validate = yield fetchFresh(
        `https://${finalDomain}/dood?op=validate&gc_response=${encodeURIComponent(token)}`,
        { headers: { Referer: pageUrl } }
      );
      if (!validate) return null;
      let cookie = null;
      try {
        const raw = validate.res && validate.res.headers && typeof validate.res.headers.get === "function" ? validate.res.headers.get("set-cookie") : null;
        if (raw) cookie = String(raw).split(";")[0];
      } catch (e) {
      }
      const page = yield fetchFresh(pageUrl, {
        headers: __spreadValues({ Referer: `https://${finalDomain}/` }, cookie ? { Cookie: cookie } : {})
      });
      if (!page || !page.text) return null;
      if (/Just a moment|challenges\.cloudflare\.com\/turnstile|turnstile\.render|captcha-player/.test(page.text)) {
        console.warn("[Dood] Solveur: page toujours prot\xE9g\xE9e apr\xE8s validation");
        return null;
      }
      return page.text;
    });
  }
  function resolveDood(url) {
    return __async(this, null, function* () {
      var _a, _b;
      try {
        const domain = ((_a = url.match(/https?:\/\/([^\/]+)/)) == null ? void 0 : _a[1]) || "dood.to";
        let currentUrl = url;
        let res = yield safeFetch(currentUrl);
        if (!res) return { url };
        let finalUrl = res.url || currentUrl;
        const finalDomain = ((_b = finalUrl.match(/https?:\/\/([^\/]+)/)) == null ? void 0 : _b[1]) || domain;
        let html = yield res.text();
        if (finalDomain !== domain) {
          currentUrl = finalUrl;
        }
        res = null;
        if (/Just a moment|cf-browser-verification|challenges\.cloudflare\.com\/turnstile|turnstile\.render|captcha-player/.test(html)) {
          console.log("[Dood] Challenge Cloudflare/Turnstile d\xE9tect\xE9");
          const gateSitekey = extractSitekey(html) || extractSitekey(yield freshPageText(currentUrl));
          html = yield trySolveDoodGate(currentUrl, finalDomain, html, gateSitekey);
          if (!html) return null;
        }
        if (html.includes("eval(function(p,a,c,k,e,d)")) html = unpack(html);
        const passMatch = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/) || html.match(/pass_md5\/([^'"\s]+)['"]/);
        if (passMatch) {
          const token = passMatch[1];
          const passUrl = `https://${finalDomain}/pass_md5/${token}`;
          const passRes = yield safeFetch(passUrl, { headers: { "Referer": currentUrl } });
          if (passRes && passRes.ok) {
            const content = yield passRes.text();
            const randomStr = Math.random().toString(36).substring(2, 12);
            return {
              url: content + randomStr + "?token=" + token + "&expiry=" + Date.now(),
              headers: { "Referer": `https://${finalDomain}/` }
            };
          }
        }
      } catch (e) {
      }
      return { url };
    });
  }
  function resolveOkRu(url) {
    return __async(this, null, function* () {
      try {
        const idMatch = url.match(/(?:videoembed|video|live)\/(\d+)/) || url.match(/[?&]mid=(\d+)/);
        const id = idMatch ? idMatch[1] : null;
        const embedUrl = id ? `https://ok.ru/videoembed/${id}` : url;
        const res = yield safeFetch(embedUrl, {
          headers: { "User-Agent": USER_AGENT, "Referer": "https://ok.ru/" }
        });
        if (!res) return { url };
        const html = yield res.text();
        if (/data-movie-id="(?:null|)"/i.test(html)) return { url };
        const optMatch = html.match(/data-options="([\s\S]*?)"/);
        if (!optMatch) return { url };
        let opts;
        try {
          const raw = optMatch[1].replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
          opts = JSON.parse(raw);
        } catch (e) {
          return { url };
        }
        const meta = opts.flashvars && opts.flashvars.metadata || {};
        const movie = meta.movie || {};
        if (movie.status && movie.status !== "OK") return { url };
        const headers = { "Referer": "https://ok.ru/", "Origin": "https://ok.ru" };
        if (meta.hlsManifestUrl) return { url: meta.hlsManifestUrl, headers };
        const videos = Array.isArray(meta.videos) ? meta.videos : [];
        const RANK = ["full", "hd", "sd", "low", "mobile", "lowest"];
        const usable = videos.filter((v) => v && typeof v.url === "string" && v.url && v.disallowed !== true);
        usable.sort((a, b) => {
          const ra = RANK.indexOf(String(a.name).toLowerCase());
          const rb = RANK.indexOf(String(b.name).toLowerCase());
          return (ra < 0 ? RANK.length : ra) - (rb < 0 ? RANK.length : rb);
        });
        if (usable.length) return { url: usable[0].url, headers };
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
  function resolveXtremeStream(url) {
    return __async(this, null, function* () {
      var _a, _b, _c;
      try {
        const origin = ((_a = url.match(/^https?:\/\/[^/]+/)) == null ? void 0 : _a[0]) || "https://lecteur2.xtremestream.xyz";
        const res = yield safeFetch(url, {
          headers: { "Referer": "https://lecteurvideo.com/" },
          timeout: 12e3
        });
        if (!res) return { url };
        const html = yield res.text();
        if (!html || html.length < 100) return { url };
        const videoId = (_b = html.match(/var\s+video_id\s*=\s*[`"']([A-Za-z0-9_-]+)[`"']/)) == null ? void 0 : _b[1];
        const loaderUrl = (_c = html.match(/var\s+m3u8_loader_url\s*=\s*[`"']([^`"']+)[`"']/)) == null ? void 0 : _c[1];
        if (!videoId || !loaderUrl) return { url };
        const loaderFull = loaderUrl + videoId;
        const res2 = yield safeFetch(loaderFull, {
          headers: { "Referer": origin + "/" },
          timeout: 12e3
        });
        if (!res2) return { url };
        const manifest = yield res2.text();
        if (!manifest || !manifest.includes("#EXTM3U")) return { url };
        return { url: loaderFull, headers: { "Referer": origin + "/" } };
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
  function resolveLecteurVideo(url) {
    return __async(this, null, function* () {
      var _a, _b;
      try {
        const origin = ((_a = url.match(/^https?:\/\/[^/]+/)) == null ? void 0 : _a[0]) || "https://lecteurvideo.com";
        const refParam = ((_b = url.match(/[?&]url=([^&]+)/)) == null ? void 0 : _b[1]) || "";
        const referrerMap = {
          "wookafr.tel": "https://wookafr.center",
          "wookafr.to": "https://wookafr.center",
          "wookafr.app": "https://wookafr.center",
          "wookafr.fyi": "https://wookafr.center"
        };
        const referer = referrerMap[refParam] || `https://${refParam}` || origin + "/";
        const res = yield safeFetch(url, {
          headers: { "Referer": referer, "Origin": referer.replace(/\/$/, "") },
          timeout: 12e3
        });
        if (!res) return { url };
        let html = yield res.text();
        if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
        const directMatch = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/data-src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (directMatch) {
          let videoUrl = directMatch[1];
          if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;
          if (!isKnownFakeDirectUrl(videoUrl)) {
            return { url: videoUrl, headers: { "Referer": origin + "/" } };
          }
        }
        const allUrls = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]).concat([...html.matchAll(/["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1])).filter((u) => !u.includes("lecteurvideo.com") && !u.includes("youtube.com") && !u.includes("googlevideo.com") && !u.includes("fonts.googleapis.com") && !u.includes("jsdelivr.net") && !u.includes("cloudflareinsights.com") && !u.includes("themoviedb.org") && !u.includes("imagizer.imageshack.com") && !u.includes("cloudflare") && !u.includes("plyr."));
        const DIRECT_VIDEO_RE = /^https?:\/\/[^"']+\.(?:m3u8|mp4|mkv|webm)(?:\?[^"']*)?$/i;
        const directVideo = allUrls.find((u) => DIRECT_VIDEO_RE.test(u) && !isKnownFakeDirectUrl(u));
        if (directVideo) return { url: directVideo, headers: { "Referer": origin + "/" } };
        const directHosts = ["megaup.net", "1fichier.com"];
        for (const host of directHosts) {
          const found = allUrls.find((u) => u.includes(host));
          if (found) return { url: found, headers: { "Referer": origin + "/" } };
        }
        const spaHosts = ["sibnet.ru", "sendvid.com", "dood.to", "listeamed.net", "voe.sx", "veev.to", "filemoon.sx"];
        for (const host of spaHosts) {
          const found = allUrls.find((u) => u.includes(host));
          if (found) return { url: found, headers: { "Referer": origin + "/" } };
        }
        const iframeMatch = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
        if (iframeMatch) {
          const iframeSrc = iframeMatch[1];
          if (!iframeSrc.includes("lecteurvideo.com") && !iframeSrc.includes("youtube.com")) {
            return { url: iframeSrc, headers: { "Referer": origin + "/" } };
          }
        }
        const downloadLink = allUrls.find((u) => u.includes("1fichier.com") || u.includes("megaup.net") || u.includes("filemoon") || u.includes("voe.sx") || u.includes("veev.to") || u.includes("listeamed.net"));
        if (downloadLink) return { url: downloadLink, headers: { "Referer": origin + "/" } };
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
  function correctDeformedVideoUrl(url) {
    if (!url || typeof url !== "string") return url;
    const urlMatch = url.match(/^https?:\/\/([^\/]+)(.*)/);
    if (!urlMatch) return url;
    const fullDomainForWhitelist = urlMatch[1].toLowerCase();
    if (NEVER_CORRECT_DOMAINS.some(
      (d) => fullDomainForWhitelist === d || fullDomainForWhitelist.endsWith("." + d)
    )) {
      return url;
    }
    const fullDeformedDomain = urlMatch[1].toLowerCase();
    const domainParts = fullDeformedDomain.split(".");
    const deformedBase = domainParts.length >= 2 ? domainParts[domainParts.length - 2] : domainParts[0];
    const isKnownSubdomain = KNOWN_HOST_NAMES.some(
      (h) => fullDeformedDomain.endsWith("." + h.domain)
    );
    const isSubdomain = domainParts.length > 2;
    let correctedUrl = url;
    let domainCorrected = isKnownSubdomain;
    if (!domainCorrected) {
      for (const host of KNOWN_HOST_NAMES) {
        if (deformedBase.includes(host.name)) {
          const lenDiff = Math.abs(deformedBase.length - host.name.length);
          if (lenDiff <= 4) {
            if (isSubdomain) {
              if (deformedBase === host.name) {
                continue;
              }
              const prefix = domainParts[domainParts.length - 3];
              if (/^[a-z0-9]{1,6}$/i.test(prefix)) {
                console.log(`[Resolver] Subdomain skip (CDN prefix "${prefix}"): ${fullDeformedDomain} \u2192 NOT corrected`);
                continue;
              }
            }
            console.log(`[Resolver] Domain corrected (direct): ${fullDeformedDomain} \u2192 ${host.domain}`);
            correctedUrl = correctedUrl.replace(fullDeformedDomain, host.domain);
            domainCorrected = true;
            break;
          }
        }
      }
    }
    if (!domainCorrected && !isSubdomain) {
      for (const host of KNOWN_HOST_NAMES) {
        const knownBase = host.name;
        if (knownBase.length < 5) continue;
        let matches = 0;
        let j = 0;
        for (let i = 0; i < knownBase.length; i++) {
          const target = knownBase[i];
          while (j < deformedBase.length && deformedBase[j] !== target) {
            j++;
          }
          if (j < deformedBase.length) {
            matches++;
            j++;
          } else {
            break;
          }
        }
        const ratio = matches / knownBase.length;
        if (ratio >= 0.75) {
          const lenDiff = Math.abs(deformedBase.length - knownBase.length);
          if (lenDiff <= 4) {
            console.log(`[Resolver] Domain corrected (fuzzy ${Math.round(ratio * 100)}%): ${fullDeformedDomain} \u2192 ${host.domain}`);
            correctedUrl = correctedUrl.replace(fullDeformedDomain, host.domain);
            domainCorrected = true;
            break;
          }
        }
      }
    }
    const PATH_CORRECTIONS = [
      [/get_viddeo/gi, "get_video"],
      [/get_videeo/gi, "get_video"],
      [/getv_video/gi, "get_video"],
      [/gdet_video/gi, "get_video"],
      [/gett_video/gi, "get_video"],
      [/get_vvdo/gi, "get_video"],
      [/get_vide0/gi, "get_video"]
    ];
    const beforePath = correctedUrl;
    for (const [pattern, replacement] of PATH_CORRECTIONS) {
      correctedUrl = correctedUrl.replace(pattern, replacement);
    }
    if (domainCorrected) {
      console.log(`[Resolver] Result: ${url.slice(0, 80)} \u2192 ${correctedUrl.slice(0, 80)}`);
    } else if (correctedUrl !== url) {
      console.log(`[Resolver] Path corrected: ${url.slice(0, 60)}`);
    }
    return correctedUrl;
  }
  function getResponseHeader(headers, name) {
    try {
      if (!headers) return "";
      if (typeof headers.get === "function") {
        return headers.get(name) || headers.get(String(name).toLowerCase()) || "";
      }
      const lower = String(name).toLowerCase();
      const keys = Object.keys(headers);
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === lower) return String(headers[keys[i]] || "");
      }
    } catch (e) {
    }
    return "";
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
      stream.url = correctDeformedVideoUrl(stream.url);
      const originalUrl = stream.url;
      const urlLower = originalUrl.toLowerCase();
      if (!originalUrl || originalUrl.includes("google-analytics") || originalUrl.includes("doubleclick")) return null;
      if (isPlayableMediaUrl(originalUrl)) {
        return __spreadProps(__spreadValues({}, stream), { isDirect: true });
      }
      try {
        let result = null;
        if (urlLower.includes("sibnet.ru")) result = yield resolveSibnet(originalUrl);
        else if (urlLower.includes("vidmoly.") || urlLower.includes("voembed.") || urlLower.includes("ansembed.")) result = yield resolveVidmoly(originalUrl);
        else if (urlLower.includes(".mail.ru")) result = yield resolveMailRu(originalUrl);
        else if (urlLower.includes("vk.com/video_ext") || urlLower.includes("vk.com/video-") || urlLower.includes("vkvideo.ru/") || urlLower.includes("vk.com/video?") || urlLower.includes("vk.com/clip")) result = yield resolveVk(originalUrl);
        else if (urlLower.includes("uqload.") || urlLower.includes("oneupload.")) result = yield resolveUqload(originalUrl);
        else if (urlLower.includes("voe") || urlLower.includes("weneverbeenfree") || urlLower.includes("maryspecialwatch") || urlLower.includes("charlestoughrace") || urlLower.includes("sandratableother") || urlLower.includes("jeremyparticipantanything") || urlLower.includes("teresapoliticallearn")) result = yield resolveVoe(originalUrl);
        else if (urlLower.includes("streamtape.com") || urlLower.includes("stape")) result = yield resolveStreamtape(originalUrl);
        else if (urlLower.includes("ok.ru") || urlLower.includes("odnoklassniki.")) result = yield resolveOkRu(originalUrl);
        else if (urlLower.includes("dood") || urlLower.includes("ds2play") || urlLower.includes("bigwar5") || urlLower.includes("kokoflix.") || urlLower.includes("playmogo.")) result = yield resolveDood(originalUrl);
        else if (urlLower.includes("moonplayer") || urlLower.includes("filemoon")) result = yield resolveMoon(originalUrl);
        else if (urlLower.includes("younetu.") || urlLower.includes("netu.")) result = yield resolveYounetu(originalUrl);
        else if (urlLower.includes("vidoza.")) result = yield resolveVidoza(originalUrl);
        else if (urlLower.includes("xtremestream.")) result = yield resolveXtremeStream(originalUrl);
        else if (urlLower.includes("sendvid.") || urlLower.includes("daisukianime")) result = yield resolveSendvid(originalUrl);
        else if (urlLower.includes("myvi.") || urlLower.includes("mytv.")) result = yield resolveMyTV(originalUrl);
        else if (urlLower.includes("fsvid.") || urlLower.includes("vidzy.")) result = yield resolveFsvidVidzy(originalUrl);
        else if (urlLower.includes("vidstream.pro") || urlLower.includes("vidcdn.") || urlLower.includes("kakaflix.") || urlLower.includes("vidhsareup.")) result = yield resolvePackedPlayer(originalUrl);
        else if (urlLower.includes("luluvid.") || urlLower.includes("lulust.") || urlLower.includes("lulustream.") || urlLower.includes("luluvdo.") || // Miroirs/wrappers LuluStream (vérifié en live 2026-10 : le packer
        // expose un master.m3u8 tnmr.org, mais 403 constaté même avec Referer
        // (test 2026-10-10, 2 masters) — la résolution aboutit mais le CDN
        // refuse ; les providers filtrent ces URLs en aval)
        urlLower.includes("livavid.") || urlLower.includes("lulavid.") || urlLower.includes("livastream.") || urlLower.includes("wishonly.") || urlLower.includes("veev.")) result = yield resolvePackedPlayer(originalUrl);
        else if (urlLower.includes("lulu.")) result = yield resolveLuluvid(originalUrl);
        else if (urlLower.includes("lecteurvideo.")) result = yield resolveLecteurVideo(originalUrl);
        else if (urlLower.includes("hgcloud.") || urlLower.includes("savefiles.")) result = yield resolveHGCloud(originalUrl);
        else if (urlLower.includes("down-paradise.") || urlLower.includes("ww1.down-paradise.")) result = yield resolveDownParadise(originalUrl);
        else if (urlLower.includes("up4fun.")) result = yield resolveUp4fun(originalUrl);
        if (result && result.isDirect === true && result.url) {
          return __spreadProps(__spreadValues(__spreadValues({}, stream), result), { originalUrl, isDirect: true });
        }
        if (result && result.url !== originalUrl && !isKnownFakeDirectUrl(result.url)) {
          const finalUrl = correctDeformedVideoUrl(result.url);
          if (finalUrl !== result.url) {
            console.log(`[Resolver] Resolver output corrected: ${result.url.slice(0, 60)} \u2192 ${finalUrl.slice(0, 60)}`);
          }
          return __spreadProps(__spreadValues({}, stream), {
            url: finalUrl,
            headers: __spreadValues(__spreadValues({}, stream.headers), result.headers || {}),
            quality: result.quality || stream.quality,
            isDirect: true,
            originalUrl
          });
        }
        const knownSlowHost = urlLower.includes("up4fun.") || urlLower.includes("down-paradise.") || urlLower.includes("getvid.club") || urlLower.includes("vidhsareup.");
        const deadEmbed = result && result.isDead === true;
        if (!result || result.url === originalUrl) {
          if (knownSlowHost || deadEmbed) {
            return __spreadProps(__spreadValues({}, stream), { isDirect: false });
          }
          let skipDirectScan = result && result.url === originalUrl && depth === 0;
          const res = yield safeFetch(originalUrl, { headers: stream.headers });
          if (res) {
            let html = yield res.text();
            if (html.includes("p,a,c,k,e,d")) html = unpack(html);
            if (!skipDirectScan) {
              const jsRedirect = html.match(/window\.location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/) || html.match(/(?:window|document)\.location(?:\.[a-z]+)?\s*=\s*['"]([^'"]+)['"]/) || html.match(/location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/);
              if (jsRedirect && jsRedirect[1] !== originalUrl) {
                const res2 = yield safeFetch(jsRedirect[1], { headers: stream.headers });
                if (res2) {
                  html = yield res2.text();
                  if (html.includes("p,a,c,k,e,d")) html = unpack(html);
                }
              }
            }
            if (/<title>\s*watch/i.test(html) && html.includes("VOE")) {
              const voeRes = yield resolveVoe(originalUrl);
              if (voeRes && voeRes.url !== originalUrl && voeRes.url.startsWith("http") && !isKnownFakeDirectUrl(voeRes.url)) {
                const finalVoeUrl = correctDeformedVideoUrl(voeRes.url);
                return __spreadProps(__spreadValues({}, stream), {
                  url: finalVoeUrl,
                  headers: __spreadValues(__spreadValues({}, stream.headers), voeRes.headers || {}),
                  quality: voeRes.quality || stream.quality,
                  isDirect: true,
                  originalUrl
                });
              }
            }
            const iframeUrl = findBestVideoIframe(html, originalUrl);
            if (iframeUrl && !peeledUrls.has(iframeUrl)) {
              peeledUrls.add(iframeUrl);
              console.log(`[Resolver] Peeling: Found nested iframe -> ${iframeUrl}`);
              const peeledResult = yield resolveStream(__spreadProps(__spreadValues({}, stream), { url: iframeUrl }), depth + 1);
              if (peeledResult && peeledResult.isDirect) return peeledResult;
              if (depth > 0) {
                skipDirectScan = false;
              }
            }
            if (!skipDirectScan) {
              const strictUrl = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/'hls'\s*:\s*'([^']+)'/) || html.match(/"hls"\s*:\s*"([^"]+)"/) || html.match(/"hls2"\s*:\s*"(https?[^"]*?\.m3u8[^"]*)"/) || html.match(/'hls2'\s*:\s*'([^']*?\.m3u8[^']*)'/);
              if (strictUrl) {
                let extractedUrl = strictUrl[1] || strictUrl[0];
                if (extractedUrl.startsWith("//")) extractedUrl = "https:" + extractedUrl;
                if (extractedUrl.includes(String.fromCharCode(92))) {
                  extractedUrl = extractedUrl.split(String.fromCharCode(92) + "/").join("/").split(String.fromCharCode(92) + "u002F").join("/");
                }
                const isInvalidExtension = extractedUrl.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);
                if (extractedUrl.startsWith("http") && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN) && !isInvalidExtension && !isKnownFakeDirectUrl(extractedUrl)) {
                  result = { url: extractedUrl };
                }
              }
            }
            if (!result && !skipDirectScan) {
              const looseUrl = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) || html.match(/https?:\/\/[^"']+\.mp4[^"']*/);
              if (looseUrl) {
                let extractedUrl = looseUrl[0];
                if (extractedUrl.startsWith("//")) extractedUrl = "https:" + extractedUrl;
                if (extractedUrl.includes(String.fromCharCode(92))) {
                  extractedUrl = extractedUrl.split(String.fromCharCode(92) + "/").join("/").split(String.fromCharCode(92) + "u002F").join("/");
                }
                const isInvalidExtension = extractedUrl.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);
                if (extractedUrl.startsWith("http") && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN) && !isInvalidExtension && !isKnownFakeDirectUrl(extractedUrl)) {
                  console.log(`[Resolver] Loose URL match (last resort): ${extractedUrl.slice(0, 80)}`);
                  result = { url: extractedUrl };
                }
              }
            }
          }
        }
        if (result && result.url !== originalUrl && result.url.startsWith("http") && !isKnownFakeDirectUrl(result.url)) {
          const finalUrl = correctDeformedVideoUrl(result.url);
          if (finalUrl !== result.url) {
            console.log(`[Resolver] Generic fallback output corrected: ${result.url.slice(0, 60)} \u2192 ${finalUrl.slice(0, 60)}`);
          }
          return __spreadProps(__spreadValues({}, stream), {
            url: finalUrl,
            headers: __spreadValues(__spreadValues({}, stream.headers), result.headers || {}),
            quality: result.quality || stream.quality,
            isDirect: true,
            originalUrl
          });
        }
      } catch (err) {
      }
      return __spreadProps(__spreadValues({}, stream), { isDirect: false });
    });
  }
  var PROVIDER_BUDGET_MS, MAX_STREAMS_PER_PROVIDER, MAX_SAFE_FETCH_BODY_BYTES, RUNTIME_TRUNCATION_SUFFIX, SILENT_TRUNCATION_MIN_CHARS, BUILD_HASH, HAS_NATIVE_CRYPTO, _nodeCrypto, HAS_NATIVE_TIMERS, HEADERS, USER_AGENT, BASE_HEADERS, _atob, CODEC_PREFERENCE, TV_BUDGET_MS, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER, CODEC_PRIORITY, manifestCache, MANIFEST_CACHE_TTL, FETCH_CACHE_TTL, fetchCache, LANGUAGE_CODE_MAP, MAX_MANIFEST_EXPANSIONS, MAX_SIZE_PROBES, DEFAULT_FETCH_TIMEOUT, KNOWN_HOST_NAMES, NEVER_CORRECT_DOMAINS, peeledUrls, AD_IFRAME_PATTERNS, VIDEO_IFRAME_SCORE, BASE_URL_FORBIDDEN_PATTERN;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      init_turnstile();
      PROVIDER_BUDGET_MS = 45e3;
      MAX_STREAMS_PER_PROVIDER = 80;
      MAX_SAFE_FETCH_BODY_BYTES = 1024 * 1024;
      RUNTIME_TRUNCATION_SUFFIX = "\n...[truncated]";
      SILENT_TRUNCATION_MIN_CHARS = 700 * 1024;
      BUILD_HASH = true ? "05e3ef20" : "dev";
      HAS_NATIVE_CRYPTO = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined" && typeof TextDecoder !== "undefined";
      _nodeCrypto = null;
      try {
        _nodeCrypto = __require("crypto");
      } catch (_) {
      }
      HAS_NATIVE_TIMERS = typeof setTimeout === "function";
      HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
      };
      USER_AGENT = HEADERS["User-Agent"];
      BASE_HEADERS = __spreadValues({}, HEADERS);
      _atob = (str) => {
        try {
          return atob(str);
        } catch (e) {
          return str;
        }
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
      MAX_MANIFEST_EXPANSIONS = 6;
      MAX_SIZE_PROBES = 3;
      DEFAULT_FETCH_TIMEOUT = 15e3;
      KNOWN_HOST_NAMES = [
        { name: "streamtape", domain: "streamtape.com" },
        { name: "sibnet", domain: "sibnet.ru" },
        { name: "vidmoly", domain: "vidmoly.to" },
        { name: "uqload", domain: "uqload.co" },
        { name: "voe", domain: "voe.sx" },
        { name: "dood", domain: "dood.to" },
        { name: "younetu", domain: "younetu.org" },
        { name: "netu", domain: "netu.tv" },
        { name: "vidoza", domain: "vidoza.net" },
        { name: "sendvid", domain: "sendvid.com" },
        { name: "myvi", domain: "myvi.ru" },
        { name: "moon", domain: "filemoon.sx" },
        { name: "luluvid", domain: "luluvid.com" },
        { name: "fsvid", domain: "fsvid.lol" },
        { name: "vidzy", domain: "vidzy.live" },
        { name: "lecteurvideo", domain: "lecteurvideo.com" },
        { name: "vidhsareup", domain: "vidhsareup.fun" },
        { name: "hgcloud", domain: "hgcloud.xyz" },
        { name: "up4fun", domain: "up4fun.top" },
        { name: "lulu", domain: "luluvdo.com" }
      ];
      NEVER_CORRECT_DOMAINS = [
        "voembed.net",
        // famille VidMoly (m3u8 en clair) — PAS voe
        "vidmoly.biz",
        // domaine VidMoly vivant servi dans les iframes (live 2026-10)
        "vidmoly.net",
        // 301 → vidmoly.biz (live 2026-10) — ne pas réécrire en .to
        "gn1r5n.org",
        // embed "myTV" de VoirAnime
        "streamhide.to"
        // gate ParkLogic — PAS streamtape
      ];
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

  // src/aniverse/http.js
  function isChallenge(text) {
    if (!text) return false;
    return text.includes("Just a moment") || text.includes("cf-browser-verification") || text.includes("Attention Required") || text.includes("error code: 1010");
  }
  function fetchApi(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const { timeout = 12e3, signal } = options;
      const headers = __spreadValues(__spreadValues({}, BASE_HEADERS2), options.headers || {});
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        if (isAborted(signal)) return null;
        try {
          const res = yield safeFetch(url, { headers, timeout, signal, redirect: "follow" });
          if (!res) return null;
          const status = typeof res.status === "number" ? res.status : 0;
          if (status === 404 || status === 422) return null;
          if (status === 429 && attempt < RETRY_DELAYS.length) {
            yield sleep(RETRY_DELAYS[attempt] * 2);
            continue;
          }
          const text = yield res.text();
          if (isChallenge(text) && attempt < RETRY_DELAYS.length) {
            yield sleep(RETRY_DELAYS[attempt]);
            continue;
          }
          if (status < 200 || status >= 300) return null;
          if (!text || text.length === 0) return null;
          try {
            const json = JSON.parse(text);
            if (json == null) return null;
            return json;
          } catch (e) {
            return null;
          }
        } catch (e) {
          if (isAborted(signal)) return null;
          if (attempt < RETRY_DELAYS.length) yield sleep(RETRY_DELAYS[attempt]);
          else return null;
        }
      }
      return null;
    });
  }
  function cdnHeaders(authHeader) {
    const h = {
      Referer: `${BASE}/`,
      "User-Agent": USER_AGENT2
    };
    if (authHeader) h.Authorization = authHeader;
    return h;
  }
  var BASE, USER_AGENT2, BASE_HEADERS2, RETRY_DELAYS;
  var init_http = __esm({
    "src/aniverse/http.js"() {
      init_resolvers();
      BASE = "https://aniverse.fr";
      USER_AGENT2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
      BASE_HEADERS2 = {
        "User-Agent": USER_AGENT2,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: `${BASE}/`,
        Origin: BASE
      };
      RETRY_DELAYS = [800, 2e3];
    }
  });

  // src/utils/metadata.js
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
  function parseTrackerId(id) {
    const match = String(id || "").match(/^(mal|anilist|anidb|tvdb):(\d+)(?::(\d+))?$/i);
    if (!match) return null;
    return {
      tracker: match[1].toLowerCase(),
      externalId: match[2],
      absEpisode: match[3] ? parseInt(match[3], 10) : null
    };
  }
  function aniListMedia(tracker) {
    return __async(this, null, function* () {
      var _a;
      if (!tracker || tracker.tracker === "anidb" || tracker.tracker === "tvdb") return null;
      const isAniList = tracker.tracker === "anilist";
      const query = isAniList ? "query($id: Int){Media(id: $id, type: ANIME){idMal title{romaji english native}}}" : "query($idMal: Int){Media(idMal: $idMal, type: ANIME){idMal title{romaji english native}}}";
      const variables = isAniList ? { id: Number(tracker.externalId) } : { idMal: Number(tracker.externalId) };
      if (!Number.isFinite((_a = variables.id) != null ? _a : variables.idMal)) return null;
      try {
        const res = yield safeFetch("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "User-Agent": ANILIST_USER_AGENT,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ query, variables }),
          // Timeout court : AniList est derrière Cloudflare, un challenge 403
          // répond vite — inutile de brûler du budget TV pour un id annexe.
          timeout: 6e3
        });
        if (!res || !res.ok) return null;
        let data = null;
        try {
          data = yield res.json();
        } catch (e) {
          return null;
        }
        return data && data.data && data.data.Media ? data.data.Media : null;
      } catch (e) {
        return null;
      }
    });
  }
  function trackerTitles(tracker, mediaType, opts) {
    return __async(this, null, function* () {
      const media = yield aniListMedia(tracker);
      if (!media || !media.title) {
        console.warn(`[Metadata] Tracker ${tracker.tracker}:${tracker.externalId} non r\xE9solu (0 requ\xEAte TMDB d\xE9pens\xE9e)`);
        return [];
      }
      const candidates = [media.title.english, media.title.romaji, media.title.native].map((t) => (t || "").trim()).filter(Boolean);
      for (const candidate of candidates) {
        const tmdbId = yield searchTmdbByTitle(candidate, mediaType);
        if (!tmdbId) continue;
        const titles = yield getTMDBTitlesById(String(tmdbId), mediaType, opts);
        if (titles && titles.length > 0) {
          console.log(`[Metadata] ${tracker.tracker}:${tracker.externalId} \u2192 TMDB ${tmdbId} via "${candidate}"`);
          return titles;
        }
      }
      console.log(`[Metadata] AniList titles used directly for ${tracker.tracker}:${tracker.externalId}`);
      return candidates;
    });
  }
  function resolveImdbToTmdb(imdbId, mediaType) {
    return __async(this, null, function* () {
      if (!/^tt\d+$/i.test(imdbId)) return null;
      const url = `${TMDB_API_BASE}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
      const res = yield fetchTmdb(url, 1);
      if (!res) return null;
      let data = null;
      try {
        data = yield res.json();
      } catch (e) {
        return null;
      }
      const list = (mediaType === "movie" ? data && data.movie_results : data && data.tv_results) || [];
      const first = list[0];
      return first && first.id ? String(first.id) : null;
    });
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
        const deadline = Date.now() + METADATA_BUDGET_MS;
        const mainRes = yield fetchTmdb(mainUrl, 2, deadline);
        const remaining = () => deadline - Date.now();
        const enrichAllowed = opts.allowEnrichment !== false;
        let altRes = null;
        let transRes = null;
        if (enrichAllowed && remaining() > METADATA_ALT_MIN_MS) {
          [altRes, transRes] = yield Promise.all([
            fetchTmdb(altUrl, 1, deadline),
            fetchTmdb(transUrl, 1, deadline)
          ]);
        } else if (enrichAllowed && remaining() > METADATA_TRANS_MIN_MS) {
          transRes = yield fetchTmdb(transUrl, 1, deadline);
        }
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
          if (mediaType !== "movie" && opts.season) {
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
          if (mediaType !== "movie" && opts.season && titleFr) {
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
      const strId = (id == null ? "" : String(id).trim()).replace(/^tmdb[:/]/i, "").replace(/^(?:movie|series)[:/]/i, "");
      const kitsuMatch = parseKitsuId(strId);
      let effectiveSeason = opts.season != null ? opts.season : null;
      console.log(`[Metadata] getTmdbTitles: id="${strId}" type="${mediaType}" season=${opts.season}`);
      if (kitsuMatch) {
        const kitsuId = kitsuMatch[1];
        const seasonFromId = kitsuMatch[2] ? parseInt(kitsuMatch[2], 10) : null;
        effectiveSeason = opts.season != null ? opts.season : seasonFromId;
        console.log(`[Metadata] Kitsu ID detected: ${kitsuId}, season=${effectiveSeason}`);
        const titles2 = yield getKitsuTitles(kitsuId, mediaType, __spreadProps(__spreadValues({}, opts), { season: effectiveSeason }));
        titles2.effectiveSeason = effectiveSeason;
        return titles2;
      }
      if (!strId) {
        console.error(`[Metadata] Invalid/null TMDB ID received: "${id}"`);
        const emptyTitles = [];
        emptyTitles.effectiveSeason = effectiveSeason;
        return emptyTitles;
      }
      const tracker = parseTrackerId(strId);
      if (tracker) {
        if (opts.season == null && tracker.absEpisode != null) {
          effectiveSeason = tracker.absEpisode;
        }
        const titles2 = yield trackerTitles(tracker, mediaType, __spreadProps(__spreadValues({}, opts), { season: effectiveSeason }));
        titles2.effectiveSeason = effectiveSeason;
        return titles2;
      }
      let contentId = strId;
      if (!/^\d+$/.test(strId)) {
        const imdbId = /^tt\d+$/i.test(strId) ? strId : /^imdb:/i.test(strId) ? strId.slice(5) : null;
        const resolved = imdbId ? yield resolveImdbToTmdb(imdbId, mediaType) : null;
        if (!resolved) {
          console.warn(`[Metadata] ID non-TMDB non r\xE9solu: "${strId}" \u2192 aucun titre (\xE9chec rapide, 0 requ\xEAte TMDB)`);
          const emptyTitles = [];
          emptyTitles.effectiveSeason = effectiveSeason;
          return emptyTitles;
        }
        console.log(`[Metadata] ID ${strId} \u2192 TMDB ${resolved}`);
        contentId = resolved;
      }
      const titles = yield getTMDBTitlesById(contentId, mediaType, opts);
      if (mediaType !== "movie" && titles.length > 0 && titles._metadata) {
        const meta = titles._metadata;
        if (!meta.isAnime) {
          console.warn(`[Metadata] \u26A0 ID ${contentId} = "${meta.name}" (${meta.originalLanguage}) - not anime!`);
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
          console.log(`[Metadata] \u2713 ID ${contentId}: "${meta.name}" confirmed anime (${meta.originalLanguage})`);
        }
      }
      titles.effectiveSeason = effectiveSeason;
      return titles;
    });
  }
  var TMDB_API_KEY, TMDB_API_BASE, METADATA_BUDGET_MS, METADATA_TRANS_MIN_MS, METADATA_ALT_MIN_MS, ANILIST_USER_AGENT, METADATA_CACHE, METADATA_TTL, METADATA_MAX, SEASON_SUFFIXES;
  var init_metadata = __esm({
    "src/utils/metadata.js"() {
      init_resolvers();
      TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
      TMDB_API_BASE = "https://api.themoviedb.org/3";
      METADATA_BUDGET_MS = 2e4;
      METADATA_TRANS_MIN_MS = 4e3;
      METADATA_ALT_MIN_MS = 8e3;
      ANILIST_USER_AGENT = "Nuvio-Providers/1.0";
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

  // src/aniverse/extractor.js
  function normalizeText(str) {
    return String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[''`’]/g, "'").replace(/[–—]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function scoreCandidate(item, queryNorm) {
    const candidates = [
      normalizeText(item.title),
      normalizeText(item.titleEnglish),
      normalizeText(item.titleRomaji)
    ].filter(Boolean);
    let best = 0;
    for (const n of candidates) {
      if (!n) continue;
      if (n === queryNorm) return 120;
      if (n.startsWith(queryNorm + " ") || queryNorm.startsWith(n + " ")) best = Math.max(best, 95);
      else if (n.includes(queryNorm) || queryNorm.includes(n)) best = Math.max(best, 75);
      const qWords = queryNorm.split(/\s+/).filter((w) => w.length > 2);
      const nWords = new Set(n.split(/\s+/));
      const matched = qWords.filter((w) => nWords.has(w)).length;
      if (qWords.length >= 2 && matched >= 2) {
        best = Math.max(best, Math.round(matched / qWords.length * 60));
      }
    }
    return best;
  }
  function searchCacheKey(titles) {
    const seen = [];
    for (const t of (titles || []).filter(Boolean)) {
      const n = normalizeText(t);
      if (n && !seen.includes(n)) seen.push(n);
      if (seen.length >= 3) break;
    }
    return seen.join("|||");
  }
  function searchCandidates(titles, signal) {
    return __async(this, null, function* () {
      const queries = [];
      for (const t of (titles || []).filter(Boolean)) {
        const n = normalizeText(t);
        if (n && !queries.includes(n)) queries.push(n);
        if (queries.length >= 3) break;
      }
      const key = searchCacheKey(titles);
      const fetchRaw = () => __async(null, null, function* () {
        const seen = /* @__PURE__ */ new Map();
        for (const q of queries) {
          if (isAborted(signal)) break;
          const data = yield fetchApi(`${API_BASE}/anime/search?q=${encodeURIComponent(q)}`, { signal });
          const results = data && Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : null;
          if (!results) continue;
          for (const item of results) {
            if (!item || !item.id) continue;
            const s = scoreCandidate(item, q);
            const prev = seen.get(item.id);
            if (!prev || s > prev.score) seen.set(item.id, { item, score: s });
          }
          const bestSeen = [...seen.values()].sort((a, b) => b.score - a.score)[0];
          if (bestSeen && bestSeen.score >= 120) break;
        }
        return [...seen.values()].sort((a, b) => b.score - a.score);
      });
      if (withCache) {
        const cached = yield withCache(`search_${key}`, () => __async(null, null, function* () {
          const r2 = yield fetchRaw();
          return r2 && r2.length > 0 ? r2 : null;
        }), { bypass: false });
        if (cached && Array.isArray(cached)) return cached;
        return fetchRaw();
      }
      const memKey = `raw_${key}`;
      const mem = _cacheBypassFallback.get(memKey);
      if (mem && Date.now() - mem.ts < EPISODES_CACHE_TTL) return mem.list;
      const r = yield fetchRaw();
      if (r && r.length > 0) _cacheBypassFallback.set(memKey, { list: r, ts: Date.now() });
      return r;
    });
  }
  function getEpisodeWindow(animeId, fromEp, count, signal) {
    return __async(this, null, function* () {
      const from = Math.max(1, parseInt(fromEp, 10) || 1);
      const cnt = Math.max(1, parseInt(count, 10) || 1);
      const key = `${animeId}:${from}:${cnt}`;
      const cached = _episodesCache.get(key);
      if (cached && Date.now() - cached.ts < EPISODES_CACHE_TTL) return cached.list;
      const list = yield fetchApi(
        `${API_BASE}/anime/episode/episodes?animeId=${encodeURIComponent(animeId)}&episodeNumber=${from}&limit=${cnt}`,
        { signal }
      );
      const valid = Array.isArray(list) && list.length > 0 ? list : null;
      if (valid) _episodesCache.set(key, { list: valid, ts: Date.now() });
      return valid;
    });
  }
  function validateEpisode(entry, episodeList, episode) {
    const total = parseInt(entry.totalEpisodes, 10) || 0;
    if (episodeList && episodeList.length > 0) {
      const ep = episodeList.find((e) => parseInt(e.episodeNumber, 10) === episode);
      if (ep) return { ok: true, episodeTitle: ep.titleFr || ep.episodeTitle || null };
      return { ok: false };
    }
    if (total > 0 && episode > total + 2) return { ok: false };
    return { ok: true, episodeTitle: null };
  }
  function fetchTmdbSeasonEpisodes(tmdbId, season, signal) {
    return __async(this, null, function* () {
      const base = `${TMDB_BASE}/tv/${tmdbId}/season/${season}`;
      let eps = null;
      const fr = yield fetchApi(`${base}?api_key=${TMDB_API_KEY2}&language=fr-FR`, { signal, timeout: 1e4 });
      if (fr && Array.isArray(fr.episodes) && fr.episodes.length > 0) eps = fr.episodes;
      if (!eps) {
        const en = yield fetchApi(`${base}?api_key=${TMDB_API_KEY2}&language=en-US`, { signal, timeout: 1e4 });
        if (en && Array.isArray(en.episodes) && en.episodes.length > 0) eps = en.episodes;
      }
      if (!eps) return null;
      return eps.map((e) => ({ number: parseInt(e.episode_number, 10), name: String(e.name || "").trim() })).filter((e) => e.number > 0 && e.name);
    });
  }
  function levenshteinSimilarity(a, b) {
    if (a === b) return 1;
    const m = a.length, n = b.length;
    if (!m || !n) return 0;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return 1 - prev[n] / Math.max(m, n);
  }
  function extractPartNum(norm) {
    const m = norm.match(/parti[ei]?\s*(\d+)/) || norm.match(/\bpart\s*(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }
  function stripPartSuffix(norm) {
    return norm.replace(/parti[ei]?\s*\d+|\bpart\s*\d+/g, " ").replace(/\s+/g, " ").trim();
  }
  function episodeTitleScore(tmdbName, aniverseTitle) {
    const ntRaw = normalizeText(tmdbName);
    if (!ntRaw || !aniverseTitle) return 0;
    const ntPart = extractPartNum(ntRaw);
    const nt = stripPartSuffix(ntRaw);
    if (!nt) return 0;
    let best = 0;
    const segments = String(aniverseTitle).split(/\s*\/\s*/);
    for (const seg of segments) {
      const nsRaw = normalizeText(seg);
      if (!nsRaw) continue;
      const nsPart = extractPartNum(nsRaw);
      if (ntPart != null && nsPart != null && ntPart !== nsPart) continue;
      const ns = stripPartSuffix(nsRaw);
      if (!ns) continue;
      if (ns === nt || nsRaw === ntRaw) {
        best = Math.max(best, 120);
        continue;
      }
      if (ns.includes(nt) || nt.includes(ns)) {
        best = Math.max(best, 95);
        continue;
      }
      const a = new Set(nt.split(" ").filter((w) => w.length > 2));
      const b = new Set(ns.split(" ").filter((w) => w.length > 2));
      if (a.size && b.size) {
        const inter = [...a].filter((w) => b.has(w)).length;
        const uni = (/* @__PURE__ */ new Set([...a, ...b])).size;
        const jac = uni ? inter / uni : 0;
        if (jac >= 0.8) {
          best = Math.max(best, 90);
          continue;
        }
        if (jac >= 0.6) {
          best = Math.max(best, 80);
          continue;
        }
      }
      let lcp = 0;
      const maxLcp = Math.min(nt.length, ns.length);
      while (lcp < maxLcp && nt[lcp] === ns[lcp]) lcp++;
      if (lcp >= 12) {
        best = Math.max(best, 88);
        continue;
      }
      const lev = levenshteinSimilarity(nt, ns);
      if (lev >= 0.55) {
        best = Math.max(best, 85);
        continue;
      }
    }
    return best;
  }
  function typeAffinity(item, preferSpecial) {
    const t = String(item.type || "");
    if (preferSpecial) return /special|ova|ona/i.test(t) ? 1 : 0;
    return /tv/i.test(t) ? 1 : 0;
  }
  function findBestTitleMatch(_0, _1, _2, _3, _4, _5) {
    return __async(this, arguments, function* (candidates, tmdbName, preferSpecial, minScore, signal, startTime, opts = {}) {
      const windowCenter = opts.windowCenter != null ? opts.windowCenter : null;
      const windowSpan = opts.windowSpan || 0;
      let best = null;
      const scanList = candidates.filter((c) => !/movie/i.test(String(c.item.type || ""))).slice(0, 8);
      for (const cand of scanList) {
        if (isBudgetExhausted(startTime, BUDGET_MS) || isAborted(signal)) break;
        const fromEp = windowCenter != null ? Math.max(1, windowCenter - windowSpan) : 1;
        const count = windowCenter != null ? windowSpan * 2 + 2 : 150;
        let list = null;
        try {
          list = yield getEpisodeWindow(cand.item.id, fromEp, count, signal);
        } catch (e) {
          if (isAborted(signal)) throw e;
          continue;
        }
        if (!list) continue;
        for (const epItem of list) {
          const num = parseInt(epItem.episodeNumber, 10);
          if (windowCenter != null && Math.abs(num - windowCenter) > windowSpan) continue;
          const title = epItem.titleFr || epItem.episodeTitle || "";
          if (!title) continue;
          const sc = episodeTitleScore(tmdbName, title);
          if (sc < minScore) continue;
          const aff = typeAffinity(cand.item, preferSpecial);
          if (!best || sc > best.score || sc === best.score && aff > best.typeAff) {
            best = {
              item: cand.item,
              epNumber: parseInt(epItem.episodeNumber, 10),
              epTitle: title,
              score: sc,
              typeAff: aff
            };
          }
        }
      }
      return best;
    });
  }
  function resolveStreamByLang(animeId, episode, lang, signal) {
    return __async(this, null, function* () {
      const data = yield fetchApi(
        `${API_BASE}/anime/stream/${encodeURIComponent(animeId)}/${episode}/${lang}`,
        { signal, timeout: 15e3 }
      );
      if (!data || typeof data.source !== "string" || !data.source || !data.source.includes("/")) return null;
      const auth = data.headers && typeof data.headers.Authorization === "string" ? data.headers.Authorization : null;
      if (!auth) console.log(`[${PROVIDER}] CDN sans Authorization (public) \u2014 ok`);
      return {
        source: data.source,
        authHeader: auth,
        tracks: Array.isArray(data.tracks) ? data.tracks : []
      };
    });
  }
  function resolveEntryStreams(_0, _1, _2) {
    return __async(this, arguments, function* (item, epNumber, { epLabel, episodeTitle, signal }) {
      const [subRes, dubRes] = yield Promise.allSettled([
        resolveStreamByLang(item.id, epNumber, "sub", signal),
        resolveStreamByLang(item.id, epNumber, "dub", signal)
      ]);
      const sub = subRes.status === "fulfilled" ? subRes.value : null;
      const dub = dubRes.status === "fulfilled" ? dubRes.value : null;
      if (!sub && !dub) {
        console.log(`[${PROVIDER}] Ni VOSTFR ni VF dispo sur "${item.slug}" ep ${epNumber}`);
        return [];
      }
      const buildStream = (res, langLabel, langCode) => ({
        name: `${PROVIDER} (${langLabel})`,
        title: [
          `${PROVIDER} [${langLabel}]`,
          epLabel,
          item.title,
          episodeTitle ? `\u2014 ${episodeTitle}` : null
        ].filter(Boolean).join(" "),
        url: res.source,
        quality: "HLS",
        language: langCode,
        // Authorization Bearer OBLIGATOIRE : sans lui manifest/clé/segments = 401
        headers: cdnHeaders(res.authHeader),
        type: "hls"
      });
      const streams = [];
      if (sub) {
        const vtt = sub.tracks.find((t) => t && t.file && /captions|subtitles/i.test(t.kind || ""));
        const stream = buildStream(sub, "VOSTFR", "ja");
        if (vtt && vtt.file) {
          const subUrl = /^https?:\/\//i.test(vtt.file) ? vtt.file : `https://aniverse.fr${vtt.file.startsWith("/") ? "" : "/"}${vtt.file}`;
          stream.subtitles = [{
            url: subUrl,
            language: vtt.locale || "fr",
            name: vtt.label || "Fran\xE7ais",
            headers: cdnHeaders(sub.authHeader)
          }];
        }
        streams.push(stream);
        console.log(`[${PROVIDER}] VOSTFR OK: ${sub.source.slice(0, 70)}...`);
      }
      if (dub) {
        streams.push(buildStream(dub, "VF", "fr"));
        console.log(`[${PROVIDER}] VF OK: ${dub.source.slice(0, 70)}...`);
      }
      return streams;
    });
  }
  function extractStreams(_0, _1, _2, _3) {
    return __async(this, arguments, function* (tmdbId, mediaType, season, episode, options = {}) {
      const signal = (options == null ? void 0 : options.signal) || null;
      if (isAborted(signal)) return [];
      const startTime = Date.now();
      const isMovie = mediaType === "movie";
      const parsedSeason = parseInt(season, 10);
      const s = isNaN(parsedSeason) || parsedSeason < 0 ? 1 : parsedSeason;
      const ep = parseInt(episode, 10) || 1;
      const isSpecials = !isMovie && s === 0;
      const epLabel = isMovie ? "" : `S${s}E${ep}`;
      const titles = yield getTmdbTitles(tmdbId, isMovie ? "movie" : "tv", { season });
      if (!titles || titles.length === 0) {
        console.log(`[${PROVIDER}] No TMDB titles for ${tmdbId}`);
        return [];
      }
      console.log(`[${PROVIDER}] Titles: ${titles.slice(0, 3).join(" | ")}`);
      const candidates = yield searchCandidates(titles, signal);
      if (candidates.length === 0) {
        console.log(`[${PROVIDER}] No search results`);
        return [];
      }
      if (isBudgetExhausted(startTime, BUDGET_MS)) return [];
      let streams = [];
      let numericRef = null;
      if (!isSpecials) {
        const MAX_CANDIDATES = 3;
        for (const { item, score } of candidates.slice(0, MAX_CANDIDATES)) {
          if (isBudgetExhausted(startTime, BUDGET_MS) || isAborted(signal)) break;
          if (score < 60) break;
          const itemType = String(item.type || "");
          const isMovieEntry = /movie/i.test(itemType);
          if (isMovie !== isMovieEntry && score < 120) continue;
          let episodeList = null;
          try {
            episodeList = yield getEpisodeWindow(item.id, ep, 1, signal);
          } catch (e) {
            if (isAborted(signal)) throw e;
          }
          const validation = validateEpisode(item, episodeList, ep);
          if (!validation.ok) {
            console.log(`[${PROVIDER}] Ep ${ep} hors num\xE9rotation de "${item.slug}" (total=${item.totalEpisodes}) \u2014 candidat suivant`);
            continue;
          }
          const built = yield resolveEntryStreams(item, ep, {
            epLabel,
            episodeTitle: validation.episodeTitle,
            signal
          });
          if (built.length > 0) {
            streams = built;
            numericRef = { item, epNumber: ep, epTitle: validation.episodeTitle };
            break;
          }
        }
      }
      const needTitlePass = !isMovie && (isSpecials || streams.length === 0 || s >= 2);
      if (needTitlePass && !isBudgetExhausted(startTime, BUDGET_MS) && !isAborted(signal)) {
        const tmdbEps = yield fetchTmdbSeasonEpisodes(tmdbId, s, signal);
        if (tmdbEps && tmdbEps.length > 0) {
          let target = tmdbEps.find((e) => e.number === ep);
          if (!target && ep >= 1 && ep <= tmdbEps.length) target = tmdbEps[ep - 1];
          if (target && target.name) {
            let windowCenter = null;
            let windowSpan = 0;
            let numericSuspect = false;
            const tmdbAbs = target.number;
            let cumulativeAbs = null;
            if (!isSpecials && numericRef && titles._metadata && titles._metadata.seasonEpisodeCounts) {
              const counts = titles._metadata.seasonEpisodeCounts;
              const countsSeason = parseInt(counts[s], 10) || 0;
              const total = parseInt(numericRef.item.totalEpisodes, 10) || 0;
              if (countsSeason > 0 && total > countsSeason * 1.5 && total >= 50) {
                let abs = ep;
                for (let k = 1; k < s; k++) abs += parseInt(counts[k], 10) || 0;
                cumulativeAbs = abs;
                windowCenter = tmdbAbs != null && Math.abs(tmdbAbs - abs) <= 30 ? tmdbAbs : abs;
                windowSpan = 30;
                numericSuspect = windowCenter !== numericRef.epNumber;
                if (numericSuspect) {
                  console.log(
                    `[${PROVIDER}] Num\xE9rotation absolue d\xE9tect\xE9e ("${numericRef.item.slug}", total=${total}) : S${s}E${ep} \u2192 absolu attendu ${windowCenter}, num\xE9rique=${numericRef.epNumber} \u2014 correction`
                  );
                }
              }
            }
            const minScore = streams.length > 0 && !numericSuspect ? 95 : 85;
            const match = yield findBestTitleMatch(
              candidates,
              target.name,
              isSpecials,
              minScore,
              signal,
              startTime,
              windowCenter != null ? { windowCenter, windowSpan } : {}
            );
            if (match) {
              const isDifferent = !numericRef || match.item.id !== numericRef.item.id || match.epNumber !== numericRef.epNumber;
              if (streams.length === 0 || isDifferent) {
                const built = yield resolveEntryStreams(match.item, match.epNumber, {
                  epLabel,
                  episodeTitle: match.epTitle,
                  signal
                });
                if (built.length > 0) {
                  console.log(
                    `[${PROVIDER}] Mapping titre: TMDB S${s}E${ep} "${target.name}" \u2192 "${match.item.slug}" E${match.epNumber} (score ${match.score})`
                  );
                  streams = built;
                } else if (numericSuspect) {
                  streams = [];
                }
              }
            } else if (numericSuspect) {
              console.log(`[${PROVIDER}] \xC9pisode num\xE9rique suspect sans correction fiable \u2014 abandon (0 stream)`);
              streams = [];
            }
          }
        }
      }
      if (streams.length === 0) return [];
      const resolved = [];
      let index = 0;
      for (const st of streams) {
        try {
          const r = yield resolveStream(st, index);
          if (r && r.url) {
            const _a = r, { isDirect, originalUrl } = _a, clean = __objRest(_a, ["isDirect", "originalUrl"]);
            resolved.push(__spreadProps(__spreadValues(__spreadValues({}, st), clean), { provider: PROVIDER }));
          }
        } catch (e) {
          if (isAborted(signal)) throw e;
          console.log(`[${PROVIDER}] resolveStream failed: ${e && e.message} \u2014 serving raw URL`);
          resolved.push(__spreadProps(__spreadValues({}, st), { provider: PROVIDER }));
        }
        index++;
      }
      return resolved;
    });
  }
  var PROVIDER, BUDGET_MS, API_BASE, TMDB_API_KEY2, TMDB_BASE, withCache, _cacheBypassFallback, _episodesCache, EPISODES_CACHE_TTL;
  var init_extractor = __esm({
    "src/aniverse/extractor.js"() {
      init_http();
      init_resolvers();
      init_metadata();
      init_cache();
      PROVIDER = "Aniverse";
      BUDGET_MS = 4e4;
      API_BASE = "https://aniverse.fr/api";
      TMDB_API_KEY2 = "8265bd1679663a7ea12ac168da84d2e8";
      TMDB_BASE = "https://api.themoviedb.org/3";
      withCache = typeof createCache === "function" ? createCache("anv", "Aniverse", { successTtl: 10 * 60 * 1e3, maxSize: 80 }) : null;
      _cacheBypassFallback = /* @__PURE__ */ new Map();
      _episodesCache = /* @__PURE__ */ new Map();
      EPISODES_CACHE_TTL = 10 * 60 * 1e3;
    }
  });

  // src/aniverse/index.js
  var require_index = __commonJS({
    "src/aniverse/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      module.exports = { getStreams: createProvider("Aniverse", extractStreams) };
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
