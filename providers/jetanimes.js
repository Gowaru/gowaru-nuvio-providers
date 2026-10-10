/**
 * jetanimes - Built from src/jetanimes/
 * Generated: 2026-10-10T13:33:11.726191593Z
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
  var resolvers_exports = {};
  __export(resolvers_exports, {
    BASE_HEADERS: () => BASE_HEADERS,
    BUILD_ID: () => BUILD_ID,
    DEFAULT_FETCH_TIMEOUT: () => DEFAULT_FETCH_TIMEOUT,
    MAX_STREAMS_PER_PROVIDER: () => MAX_STREAMS_PER_PROVIDER,
    PROVIDER_BUDGET_MS: () => PROVIDER_BUDGET_MS,
    RUNTIME_TRUNCATION_SUFFIX: () => RUNTIME_TRUNCATION_SUFFIX,
    TV_BUDGET_MS: () => TV_BUDGET_MS,
    USER_AGENT: () => USER_AGENT,
    aesCbcDecrypt: () => aesCbcDecrypt,
    aesEcbDecrypt: () => aesEcbDecrypt,
    createAbortController: () => createAbortController,
    createProvider: () => createProvider,
    createProviderRateLimiter: () => createProviderRateLimiter,
    createRateLimiter: () => createRateLimiter,
    createSettingsLayout: () => createSettingsLayout,
    expandStreamQualities: () => expandStreamQualities,
    fetchBatch: () => fetchBatch,
    fetchVideoSize: () => fetchVideoSize,
    fetchWithRetry: () => fetchWithRetry,
    formatSizeBytes: () => formatSizeBytes,
    getScraperSettings: () => getScraperSettings,
    hmacSha256Hex: () => hmacSha256Hex,
    isAborted: () => isAborted,
    isBudgetExhausted: () => isBudgetExhausted,
    isTruncatedBody: () => isTruncatedBody,
    md5Hex: () => md5Hex,
    nativeCryptoAvailable: () => nativeCryptoAvailable,
    normalizeLanguageCode: () => normalizeLanguageCode,
    resolveDood: () => resolveDood,
    resolveDownParadise: () => resolveDownParadise,
    resolveFsvidVidzy: () => resolveFsvidVidzy,
    resolveHGCloud: () => resolveHGCloud,
    resolveLecteurVideo: () => resolveLecteurVideo,
    resolveLuluvid: () => resolveLuluvid,
    resolveMailRu: () => resolveMailRu,
    resolveMoon: () => resolveMoon,
    resolveMyTV: () => resolveMyTV,
    resolvePackedPlayer: () => resolvePackedPlayer,
    resolveSendvid: () => resolveSendvid,
    resolveSibnet: () => resolveSibnet,
    resolveStream: () => resolveStream,
    resolveStreamtape: () => resolveStreamtape,
    resolveUp4fun: () => resolveUp4fun,
    resolveUqload: () => resolveUqload,
    resolveVidmoly: () => resolveVidmoly,
    resolveVidoza: () => resolveVidoza,
    resolveVoe: () => resolveVoe,
    resolveYounetu: () => resolveYounetu,
    safeConfig: () => safeConfig,
    safeFetch: () => safeFetch,
    safeJson: () => safeJson,
    sanitizeSearchQuery: () => sanitizeSearchQuery,
    setFetchCacheTtl: () => setFetchCacheTtl,
    setupAbortSignal: () => setupAbortSignal,
    sha1Hex: () => sha1Hex,
    sha256Hex: () => sha256Hex,
    sleep: () => sleep,
    sortStreamsByLanguage: () => sortStreamsByLanguage,
    unpack: () => unpack,
    verifyPlayableUrl: () => verifyPlayableUrl,
    withTimeout: () => withTimeout
  });
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
  function sha256Hex(data) {
    return __async(this, null, function* () {
      if (HAS_NATIVE_CRYPTO) {
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        const hashBuffer = yield crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      if (HAS_NODE_CRYPTO) {
        const input = typeof data === "string" ? data : Buffer.from(data);
        return _nodeCrypto.createHash("sha256").update(input).digest("hex");
      }
      return CryptoJS.SHA256(typeof data === "string" ? data : CryptoJS.lib.WordArray.create(data)).toString();
    });
  }
  function sha1Hex(data) {
    return __async(this, null, function* () {
      if (HAS_NATIVE_CRYPTO) {
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        const hashBuffer = yield crypto.subtle.digest("SHA-1", bytes);
        return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      if (HAS_NODE_CRYPTO) {
        const input = typeof data === "string" ? data : Buffer.from(data);
        return _nodeCrypto.createHash("sha1").update(input).digest("hex");
      }
      return CryptoJS.SHA1(typeof data === "string" ? data : CryptoJS.lib.WordArray.create(data)).toString();
    });
  }
  function md5Hex(data) {
    if (HAS_NODE_CRYPTO) {
      const input = typeof data === "string" ? data : Buffer.from(data);
      return _nodeCrypto.createHash("md5").update(input).digest("hex");
    }
    return CryptoJS.MD5(typeof data === "string" ? data : CryptoJS.lib.WordArray.create(data)).toString();
  }
  function hmacSha256Hex(message, secret) {
    return __async(this, null, function* () {
      if (HAS_NATIVE_CRYPTO) {
        const keyData = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
        const msgData = typeof message === "string" ? new TextEncoder().encode(message) : message;
        const key = yield crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = yield crypto.subtle.sign("HMAC", key, msgData);
        return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      if (HAS_NODE_CRYPTO) {
        return _nodeCrypto.createHmac("sha256", secret).update(message).digest("hex");
      }
      return CryptoJS.HmacSHA256(message, secret).toString();
    });
  }
  function aesCbcDecrypt(_0, _1, _2) {
    return __async(this, arguments, function* (ciphertext, key, iv, opts = {}) {
      opts = opts || {};
      if (HAS_NATIVE_CRYPTO) {
        let ctBytes;
        if (opts.base64Input) {
          const b64 = typeof ciphertext === "string" ? ciphertext : new TextDecoder().decode(ciphertext);
          ctBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        } else {
          ctBytes = typeof ciphertext === "string" ? new TextEncoder().encode(ciphertext) : ciphertext;
        }
        const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
        const ivBytes = typeof iv === "string" ? new TextEncoder().encode(iv) : iv;
        const cryptoKey = yield crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]);
        const decrypted2 = yield crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, cryptoKey, ctBytes);
        return new Uint8Array(decrypted2);
      }
      const k = CryptoJS.enc.Utf8.parse(typeof key === "string" ? key : new TextDecoder().decode(key));
      const ivParsed = CryptoJS.enc.Utf8.parse(typeof iv === "string" ? iv : new TextDecoder().decode(iv));
      let ct;
      if (opts.base64Input) {
        ct = CryptoJS.enc.Base64.parse(typeof ciphertext === "string" ? ciphertext : new TextDecoder().decode(ciphertext));
      } else {
        ct = CryptoJS.enc.Utf8.parse(typeof ciphertext === "string" ? ciphertext : new TextDecoder().decode(ciphertext));
      }
      const decrypted = CryptoJS.AES.decrypt({ ciphertext: ct }, k, { iv: ivParsed, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
      return Uint8Array.from(decrypted.toString(CryptoJS.enc.Latin1).split("").map((c) => c.charCodeAt(0)));
    });
  }
  function aesEcbDecrypt(_0, _1) {
    return __async(this, arguments, function* (ciphertext, key, opts = {}) {
      opts = opts || {};
      if (HAS_NODE_CRYPTO) {
        try {
          let ctBuf;
          if (opts.base64Input) {
            const b64 = typeof ciphertext === "string" ? ciphertext : new TextDecoder().decode(ciphertext);
            ctBuf = Buffer.from(b64, "base64");
          } else {
            ctBuf = typeof ciphertext === "string" ? Buffer.from(ciphertext) : Buffer.from(ciphertext);
          }
          const keyBuf = typeof key === "string" ? Buffer.from(key) : Buffer.from(key);
          const decipher = _nodeCrypto.createDecipheriv("aes-128-ecb", keyBuf, null);
          const decrypted2 = Buffer.concat([decipher.update(ctBuf), decipher.final()]);
          return new Uint8Array(decrypted2);
        } catch (_) {
        }
      }
      if (HAS_NATIVE_CRYPTO) {
        try {
          let ctBytes;
          if (opts.base64Input) {
            const b64 = typeof ciphertext === "string" ? ciphertext : new TextDecoder().decode(ciphertext);
            ctBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          } else {
            ctBytes = typeof ciphertext === "string" ? new TextEncoder().encode(ciphertext) : ciphertext;
          }
          const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
          const cryptoKey = yield crypto.subtle.importKey("raw", keyBytes, "AES-ECB", false, ["decrypt"]);
          const decrypted2 = yield crypto.subtle.decrypt({ name: "AES-ECB" }, cryptoKey, ctBytes);
          return new Uint8Array(decrypted2);
        } catch (_) {
        }
      }
      const k = CryptoJS.enc.Utf8.parse(typeof key === "string" ? key : new TextDecoder().decode(key));
      let ct;
      if (opts.base64Input) {
        ct = CryptoJS.enc.Base64.parse(typeof ciphertext === "string" ? ciphertext : new TextDecoder().decode(ciphertext));
      } else {
        ct = CryptoJS.enc.Utf8.parse(typeof ciphertext === "string" ? ciphertext : new TextDecoder().decode(ciphertext));
      }
      const decrypted = CryptoJS.AES.decrypt({ ciphertext: ct }, k, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
      return Uint8Array.from(decrypted.toString(CryptoJS.enc.Latin1).split("").map((c) => c.charCodeAt(0)));
    });
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
  function fetchWithRetry(_0) {
    return __async(this, arguments, function* (fetchFn, opts = {}) {
      var _a, _b;
      const retries = (_a = opts.retries) != null ? _a : 2;
      const delays = (_b = opts.delays) != null ? _b : RETRY_DELAYS;
      let lastError;
      for (let i = 0; i <= retries; i++) {
        try {
          return yield fetchFn();
        } catch (err) {
          lastError = err;
          if (err.message && /HTTP error 4(?:0[0-9]|1[0-79]|29)/.test(err.message)) throw err;
          if (i === retries) throw err;
          if (delays[i]) yield sleep(delays[i]);
        }
      }
      throw lastError;
    });
  }
  function fetchBatch(_0, _1) {
    return __async(this, arguments, function* (requests, fetchFn, opts = {}) {
      var _a, _b, _c;
      const concurrency = (_a = opts.concurrency) != null ? _a : 5;
      const stopOnFirst = (_b = opts.stopOnFirst) != null ? _b : false;
      const staggerMs = (_c = opts.staggerMs) != null ? _c : 0;
      const results = new Array(requests.length).fill(null);
      let completedCount = 0;
      let firstSuccess = null;
      let idx = 0;
      let lastStart = 0;
      function runNext() {
        return __async(this, null, function* () {
          while (idx < requests.length) {
            if (stopOnFirst && firstSuccess) break;
            while (staggerMs > 0) {
              const wait = lastStart + staggerMs - Date.now();
              if (wait <= 0) break;
              yield sleep(wait);
            }
            const i = idx++;
            lastStart = Date.now();
            const { url, opts: reqOpts } = requests[i];
            try {
              const result = yield fetchFn(url, reqOpts);
              results[i] = { url, result, error: null };
              completedCount++;
              if (stopOnFirst && result && !firstSuccess) {
                firstSuccess = result;
              }
            } catch (err) {
              results[i] = { url, result: null, error: err };
              completedCount++;
            }
          }
        });
      }
      const workers = [];
      for (let w = 0; w < Math.min(concurrency, requests.length); w++) {
        workers.push(runNext());
      }
      yield Promise.allSettled(workers);
      return results;
    });
  }
  function sortStreamsByLanguage(streams) {
    if (!Array.isArray(streams)) return [];
    return [...streams].sort((a, b) => {
      const getPref = (s) => {
        const text = ((s.name || "") + " " + (s.title || "") + " " + (s.language || "")).toUpperCase();
        if (text.includes("VF") || text.includes("FRENCH") || text.includes("VFF") || text.includes("VFQ")) return 0;
        if (text.includes("VOSTFR") || text.includes("VOST") || text.includes("MULTI")) return 1;
        if (text.includes("VO")) return 2;
        return 3;
      };
      return getPref(a) - getPref(b);
    });
  }
  function safeJson(data) {
    return data != null ? data : [];
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
  function getScraperSettings() {
    try {
      if (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS && typeof globalThis.SCRAPER_SETTINGS === "object") {
        return globalThis.SCRAPER_SETTINGS;
      }
    } catch (e) {
    }
    return {};
  }
  function createSettingsLayout(items) {
    const layout = Array.isArray(items) ? items : [];
    return function onSettings() {
      return __async(this, null, function* () {
        return layout;
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
  function sanitizeSearchQuery(query) {
    return (query || "").replace(/[–—]/g, " ").replace(/[''`]/g, "'").replace(/[()\[\]{}:;,!?]/g, " ").replace(/\s+/g, " ").trim();
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
  function setFetchCacheTtl(ms) {
    FETCH_CACHE_TTL = ms > 0 ? ms : 3e4;
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
  function isProbeHlsUrl(url) {
    const u = String(url || "").toLowerCase();
    return u.includes(".m3u8") || u.includes("/hls2/") || u.includes("/hls/");
  }
  function verifyPlayableUrl(_0) {
    return __async(this, arguments, function* (url, headers = {}, opts = {}) {
      try {
        if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return "unknown";
        const timeoutMs = opts && opts.timeoutMs > 0 ? opts.timeoutMs : 6e3;
        const reqHeaders = __spreadValues({}, headers || {});
        if (isProbeHlsUrl(url)) {
          let res2 = null;
          try {
            res2 = yield safeFetch(url, { headers: reqHeaders, timeout: timeoutMs });
          } catch (e) {
            return "unknown";
          }
          if (!res2) return "unknown";
          const status2 = res2.status;
          if (status2 === 403 || status2 === 404 || status2 === 410) return "dead";
          if (!res2.ok || status2 < 200 || status2 >= 300) return "unknown";
          let body = "";
          try {
            body = yield res2.text();
          } catch (e) {
            return "unknown";
          }
          if (typeof body === "string" && body.includes("#EXTM3U")) return "ok";
          const ctype2 = getResponseHeader(res2.headers, "content-type");
          if (/m3u8|mpegurl/i.test(ctype2)) return "ok";
          if (typeof body === "string" && /^\s*<(!doctype|html|head|body)/i.test(body)) return "dead";
          return "unknown";
        }
        let res = null;
        try {
          res = yield safeFetch(url, { method: "HEAD", headers: reqHeaders, timeout: timeoutMs });
        } catch (e) {
          return "unknown";
        }
        if (!res) return "unknown";
        const status = res.status;
        if (status === 403 || status === 404 || status === 410) return "dead";
        if (!res.ok || status < 200 || status >= 300) return "unknown";
        const ctype = getResponseHeader(res.headers, "content-type");
        if (/^video\//i.test(ctype)) return "ok";
        return "unknown";
      } catch (e) {
        return "unknown";
      }
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
        else if (urlLower.includes("uqload.") || urlLower.includes("oneupload.")) result = yield resolveUqload(originalUrl);
        else if (urlLower.includes("voe") || urlLower.includes("weneverbeenfree") || urlLower.includes("maryspecialwatch") || urlLower.includes("charlestoughrace") || urlLower.includes("sandratableother") || urlLower.includes("jeremyparticipantanything") || urlLower.includes("teresapoliticallearn")) result = yield resolveVoe(originalUrl);
        else if (urlLower.includes("streamtape.com") || urlLower.includes("stape")) result = yield resolveStreamtape(originalUrl);
        else if (urlLower.includes("dood") || urlLower.includes("ds2play") || urlLower.includes("bigwar5")) result = yield resolveDood(originalUrl);
        else if (urlLower.includes("moonplayer") || urlLower.includes("filemoon")) result = yield resolveMoon(originalUrl);
        else if (urlLower.includes("younetu.") || urlLower.includes("netu.")) result = yield resolveYounetu(originalUrl);
        else if (urlLower.includes("vidoza.")) result = yield resolveVidoza(originalUrl);
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
              const jsRedirect = html.match(/window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/);
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
  var PROVIDER_BUDGET_MS, MAX_STREAMS_PER_PROVIDER, MAX_SAFE_FETCH_BODY_BYTES, RUNTIME_TRUNCATION_SUFFIX, BUILD_HASH, BUILD_ID, HAS_NATIVE_CRYPTO, _nodeCrypto, HAS_NODE_CRYPTO, nativeCryptoAvailable, RETRY_DELAYS, HEADERS, USER_AGENT, BASE_HEADERS, _atob, CODEC_PREFERENCE, TV_BUDGET_MS, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER, CODEC_PRIORITY, manifestCache, MANIFEST_CACHE_TTL, FETCH_CACHE_TTL, fetchCache, LANGUAGE_CODE_MAP, DEFAULT_FETCH_TIMEOUT, KNOWN_HOST_NAMES, NEVER_CORRECT_DOMAINS, peeledUrls, AD_IFRAME_PATTERNS, VIDEO_IFRAME_SCORE, BASE_URL_FORBIDDEN_PATTERN;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      PROVIDER_BUDGET_MS = 45e3;
      MAX_STREAMS_PER_PROVIDER = 80;
      MAX_SAFE_FETCH_BODY_BYTES = 1024 * 1024;
      RUNTIME_TRUNCATION_SUFFIX = "\n...[truncated]";
      BUILD_HASH = true ? "498f16a7" : "dev";
      BUILD_ID = BUILD_HASH;
      HAS_NATIVE_CRYPTO = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined" && typeof TextDecoder !== "undefined";
      _nodeCrypto = null;
      try {
        _nodeCrypto = __require("crypto");
      } catch (_) {
      }
      HAS_NODE_CRYPTO = !!_nodeCrypto;
      nativeCryptoAvailable = HAS_NATIVE_CRYPTO;
      RETRY_DELAYS = [1e3, 3e3, 5e3];
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

  // src/jetanimes/http.js
  function setCurrentSignal(signal) {
    _currentSignal = signal;
  }
  function fetchText(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const r = yield fetchMeta(url, options);
      if (!r || !r.text) return r ? "" : null;
      return r.text;
    });
  }
  function fetchMeta(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const signal = options.signal || _currentSignal;
      if (isAborted(signal)) throw new Error("AbortError: Request aborted");
      const _a = options, { headers: customHeaders } = _a, rest = __objRest(_a, ["headers"]);
      yield rateLimit(DOMAIN);
      const res = yield safeFetch(url, __spreadProps(__spreadValues({}, rest), {
        headers: __spreadValues(__spreadValues({}, HEADERS2), customHeaders || {}),
        signal
      }));
      if (!res || !res.ok) return null;
      const text = yield res.text().catch(() => "");
      return { text, finalUrl: res.url || url, status: res.status };
    });
  }
  function postForm(_0, _1) {
    return __async(this, arguments, function* (url, body, options = {}) {
      const signal = options.signal || _currentSignal;
      if (isAborted(signal)) throw new Error("AbortError: Request aborted");
      const _a = options, { headers: customHeaders } = _a, rest = __objRest(_a, ["headers"]);
      yield rateLimit(DOMAIN);
      const res = yield safeFetch(url, __spreadProps(__spreadValues({}, rest), {
        method: "POST",
        headers: __spreadValues(__spreadProps(__spreadValues({}, HEADERS2), {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest"
        }), customHeaders || {}),
        body: typeof body === "string" ? body : new URLSearchParams(body).toString(),
        signal
      }));
      if (!res || !res.ok) {
        const status = res && typeof res.status === "number" ? res.status : "no-response";
        throw new Error(`HTTP error ${status} for ${url}`);
      }
      const text = yield res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        return null;
      }
    });
  }
  var _currentSignal, rateLimit, DOMAIN, HEADERS2;
  var init_http = __esm({
    "src/jetanimes/http.js"() {
      init_resolvers();
      _currentSignal = null;
      rateLimit = createProviderRateLimiter(350, 0.3);
      DOMAIN = "on.jetanimes.com";
      HEADERS2 = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
        "Referer": "https://on.jetanimes.com/"
      };
    }
  });

  // src/jetanimes/byse.js
  function isByseUrl(url) {
    const u = String(url || "").toLowerCase();
    return PLAYER_HOSTS.some((h) => u.includes(h));
  }
  function b64urlToBytes(s) {
    let t = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (t.length % 4 !== 0) t += "=";
    const bin = atob(t);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function jsUnescape(s) {
    return String(s).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, g) => {
      if (g[0] === "u" || g[0] === "x") return String.fromCharCode(parseInt(g.slice(1), 16));
      if (g === "n") return "\n";
      if (g === "t") return "	";
      if (g === "r") return "\r";
      return g;
    });
  }
  function unpackPlayerScript(html) {
    if (!html || html.indexOf("eval(function(") === -1) return null;
    const m = /eval\(function\(p,a,c,k,e,[dr]?\)\{[\s\S]{0,1200}?\}\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(html);
    if (!m) return null;
    const p = jsUnescape(m[1]);
    const radix = parseInt(m[2], 10);
    const count = parseInt(m[3], 10);
    const dict = jsUnescape(m[4]).split("|");
    if (!p || !dict.length || count !== dict.length) return null;
    return p.replace(/\b\w+\b/g, (w) => {
      const idx = parseInt(w, radix);
      return idx < count && dict[idx] ? dict[idx] : w;
    });
  }
  function extractHlsLinks(code) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const re = /"(hls[0-9])"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const u = m[2].replace(/\\\//g, "/");
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({ url: u, label: m[1] });
    }
    if (!out.length) {
      const r2 = /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g;
      while ((m = r2.exec(code)) !== null) {
        if (!seen.has(m[0])) {
          seen.add(m[0]);
          out.push({ url: m[0], label: "" });
        }
      }
    }
    return out;
  }
  function pickBest(list) {
    const score = (x) => {
      let s = /m3u8/i.test(x.url) ? 1e3 : 0;
      if (x.label === "hls2") s += 50;
      return s;
    };
    list.sort((a, b) => score(b) - score(a));
    return list[0] || null;
  }
  function selectKeyParts(playback) {
    const parts = Array.isArray(playback.key_parts) ? playback.key_parts : [];
    const n = parseInt(playback.version, 10);
    if (!Number.isFinite(n)) return parts;
    const a = n;
    const b = 31 - n;
    if (a < 1 || b < 1 || a > parts.length || b > parts.length) return parts;
    return [parts[a - 1], parts[b - 1]];
  }
  function concatBytes(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const a of arrays) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  }
  function buildKeyBytes(playback) {
    const selected = selectKeyParts(playback);
    if (!selected.length) throw new Error("Byse: no key parts");
    return concatBytes(selected.map(b64urlToBytes));
  }
  function gcmCtrBlock(ivBytes) {
    if (ivBytes.length !== 12) throw new Error(`Byse: IV ${ivBytes.length}B (12 attendu)`);
    const block = new Uint8Array(16);
    block.set(ivBytes, 0);
    block[12] = 0;
    block[13] = 0;
    block[14] = 0;
    block[15] = 2;
    return block;
  }
  function decryptNative(keyBytes, ivBytes, ctBytes) {
    return __async(this, null, function* () {
      const cryptoKey = yield crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-CTR" },
        false,
        ["decrypt"]
      );
      const plain = yield crypto.subtle.decrypt(
        { name: "AES-CTR", counter: gcmCtrBlock(ivBytes), length: 64 },
        cryptoKey,
        ctBytes
      );
      return new Uint8Array(plain);
    });
  }
  function decryptCryptoJs(keyBytes, ivBytes, ctBytes) {
    if (typeof CryptoJS === "undefined") throw new Error("Byse: CryptoJS indisponible sur ce runtime");
    const fromBytes = (b) => CryptoJS.lib.WordArray.create(new Uint8Array(b));
    const keyWA = fromBytes(keyBytes);
    const ivBlock = gcmCtrBlock(ivBytes);
    const counterWA = CryptoJS.lib.WordArray.create(new Uint8Array(ivBlock));
    const ctWA = fromBytes(ctBytes);
    const decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext: ctWA }),
      keyWA,
      { mode: CryptoJS.mode.CTR, iv: counterWA, padding: CryptoJS.pad.NoPadding }
    );
    const hex = decrypted.toString(CryptoJS.enc.Hex);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function bytesToUtf8(bytes) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
    let out = "";
    const CH = 4096;
    for (let i = 0; i < bytes.length; i += CH) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return out;
  }
  function resolveByseApi(pageUrl, code, fetchMetaFn, signal) {
    return __async(this, null, function* () {
      const apiOrigin = new URL(pageUrl).origin;
      const apiUrl = `${apiOrigin}/api/videos/${code}`;
      const meta = yield fetchMetaFn(apiUrl, {
        signal,
        timeout: 12e3,
        headers: { Referer: pageUrl, Accept: "application/json" }
      }).catch(() => null);
      if (!meta || !meta.text) return null;
      let data;
      try {
        data = JSON.parse(meta.text);
      } catch (e) {
        return null;
      }
      const pb = data && data.playback;
      if (!pb || !pb.iv || !pb.payload) return null;
      if (String(pb.algorithm || "").toUpperCase().indexOf("GCM") === -1) return null;
      let plainBytes;
      try {
        const keyBytes = buildKeyBytes(pb);
        const ivBytes = b64urlToBytes(pb.iv);
        const payloadBytes = b64urlToBytes(pb.payload);
        if (payloadBytes.length <= 16) return null;
        const ctBytes = payloadBytes.subarray(0, payloadBytes.length - 16);
        if (nativeCryptoAvailable) {
          plainBytes = yield decryptNative(keyBytes, ivBytes, ctBytes);
        } else {
          plainBytes = decryptCryptoJs(keyBytes, ivBytes, ctBytes);
        }
      } catch (e) {
        if (signal && signal.aborted) throw e;
        return null;
      }
      let plain;
      try {
        plain = bytesToUtf8(plainBytes);
      } catch (e) {
        return null;
      }
      let sources;
      try {
        sources = JSON.parse(plain).sources;
      } catch (e) {
        return null;
      }
      if (!Array.isArray(sources) || !sources.length) return null;
      const valid = sources.filter((s) => s && typeof s.url === "string" && s.url.startsWith("http"));
      if (!valid.length) return null;
      const score = (s) => {
        const lbl = String(s.label || s.quality || "").toLowerCase();
        const mm = /(\d{3,4})/.exec(lbl);
        let sc = mm ? parseInt(mm[1], 10) : 0;
        if (String(s.mime_type || "").includes("mpegurl") || lbl.includes("hls")) sc += 1e3;
        return sc;
      };
      valid.sort((a, b) => score(b) - score(a));
      return { url: valid[0].url, label: String(valid[0].label || valid[0].quality || "") };
    });
  }
  function resolveByse(embedUrl, fetchMetaFn, signal) {
    return __async(this, null, function* () {
      if (!embedUrl) return null;
      if (signal && signal.aborted) return null;
      let url = String(embedUrl);
      if (/secured\.lol/i.test(url)) {
        const meta2 = yield fetchMetaFn(url, { signal, timeout: 12e3 }).catch(() => null);
        if (!meta2) return null;
        let m = /https?:\/\/[a-z0-9.-]*hdsplay[a-z0-9.-]*\/(?:e|v)\/([a-z0-9]+)/i.exec(meta2.finalUrl || "");
        if (!m && meta2.text) {
          m = /https?:\/\/[a-z0-9.-]*hdsplay[a-z0-9.-]*\/(?:e|v)\/([a-z0-9]+)/i.exec(meta2.text);
        }
        if (!m) return null;
        url = m[0];
      }
      const meta = yield fetchMetaFn(url, {
        signal,
        timeout: 15e3,
        headers: { Referer: "https://secured.lol/" }
      }).catch(() => null);
      const html = meta && meta.text;
      if (!html) return null;
      const unpacked = unpackPlayerScript(html);
      if (unpacked) {
        const links = extractHlsLinks(unpacked);
        const best = pickBest(links);
        if (best) return best;
      }
      const raw = /https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/.exec(html);
      if (raw) return pickBest([{ url: raw[0], label: "" }]);
      const em = /\/e\/([a-z0-9]+)/i.exec(url);
      if (em) {
        return resolveByseApi(url, em[1], fetchMetaFn, signal).catch(() => null);
      }
      return null;
    });
  }
  var PLAYER_HOSTS;
  var init_byse = __esm({
    "src/jetanimes/byse.js"() {
      init_resolvers();
      PLAYER_HOSTS = ["hdsplay", "secured.lol"];
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

  // src/jetanimes/extractor.js
  function normSlug(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "and").replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function slugTokens(s) {
    return String(s || "").split("-").filter((w) => w.length >= 3);
  }
  function tokenMatch(w, q) {
    return w === q || q.length >= 4 && w.length >= 4 && (w.startsWith(q) || q.startsWith(w));
  }
  function isOrderedPrefix(a, b) {
    const at = slugTokens(a);
    if (!at.length) return false;
    const bt = slugTokens(b);
    let i = 0;
    for (const w of bt) {
      if (tokenMatch(w, at[i])) i++;
      if (i >= at.length) return true;
    }
    return i >= at.length;
  }
  function matchScore(seriesSlug, querySlug) {
    if (!querySlug) return 0;
    const exact = seriesSlug === querySlug;
    const qPrefix = isOrderedPrefix(querySlug, seriesSlug);
    const sPrefix = isOrderedPrefix(seriesSlug, querySlug);
    if (!exact && !qPrefix && !sPrefix) return 0;
    const qt = slugTokens(querySlug);
    const st = slugTokens(seriesSlug);
    const stArr = st;
    let covered = 0;
    for (const w of qt) {
      if (stArr.some((s) => tokenMatch(s, w))) covered++;
    }
    let score = (exact ? 100 : 60) + Math.round(covered / Math.max(1, qt.length) * 40);
    if (!exact && !sPrefix) {
      const generic = (w) => /^(?:19|20)\d{2}$/.test(w) || /^hd\d*$/.test(w) || /^\d+$/.test(w);
      const unexplained = st.filter((w) => !qt.some((q) => tokenMatch(q, w)) && !generic(w));
      if (unexplained.length) return 0;
    }
    const qm = querySlug.match(/-(?:saison|season)-(\d+)$/);
    if (qm) {
      const sm = seriesSlug.match(/-(?:saison|season)-(\d+)$/);
      if (sm) score += sm[1] === qm[1] ? 30 : -25;
    }
    return score;
  }
  function searchSeries(query, signal) {
    return __async(this, null, function* () {
      return withCache(`search_${query}`, () => __async(null, null, function* () {
        const out = [];
        const seen = /* @__PURE__ */ new Set();
        for (const q of [...new Set([query, query.split(/[\s:'’]/)[0]].filter((x) => x && x.length >= 3))]) {
          if (out.length >= 5) break;
          try {
            const html = yield fetchText(`${GATEWAY}/?s=${encodeURIComponent(q)}`, { signal, timeout: 15e3 });
            if (!html) continue;
            const re = /href="(https?:\/\/on\.jetanimes\.com\/serie\/([^/"]+)\/)"[^>]*>([^<]{1,80})</g;
            let m;
            while ((m = re.exec(html)) !== null) {
              if (seen.has(m[1])) continue;
              seen.add(m[1]);
              out.push({ slug: m[2], title: (m[3] || "").trim(), href: m[1] });
            }
          } catch (e) {
            if (isAborted(signal)) throw e;
          }
        }
        return out;
      }), { successTtl: 12e4, failureTtl: 3e4 });
    });
  }
  function episodeSlugCandidates(ficheSlug, season, episode) {
    const out = [];
    const push = (s) => {
      if (s && !out.includes(s)) out.push(s);
    };
    const n = String(episode);
    const nn = episode < 10 ? `0${episode}` : String(episode);
    const stem = ficheSlug.replace(/-(?:saison|season)-\d{1,2}$/, "");
    const stemNoYear = stem.replace(/-(?:19|20)\d{2}$/, "").replace(/-(?:19|20)\d{2}(?=-)/, "");
    const stems = [.../* @__PURE__ */ new Set([stem, stemNoYear, ficheSlug])];
    for (const s of stems) {
      push(`${s}-saison-${season}-episode-${n}`);
      push(`${s}-saison-${season}-episode-${nn}`);
      if (season === 1) {
        push(`${s}-episode-${n}`);
        push(`${s}-episode-${nn}`);
      }
    }
    return out;
  }
  function extractEmbedUrl(html) {
    if (!html) return null;
    let m = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
    if (m && m[1]) return m[1];
    m = /<iframe[^>]*data-litespeed-src="(https?:\/\/[^"]+)"/i.exec(html);
    if (m && m[1]) return m[1];
    m = /["'](https?:\/\/[^"']*(?:embed|secured\.lol|hdsplay)[^"']*)["']/i.exec(html);
    return m ? m[1] : null;
  }
  function extractNonce(html) {
    const m = /"linksnonce":"([a-f0-9]+)"/.exec(html || "");
    return m ? m[1] : null;
  }
  function extractEpisodePostId(html) {
    const m = /rel="shortlink"\s+href="[^"]*\?p=(\d+)"/.exec(html) || /postid-(\d+)/.exec(html) || /"post_id":\s*(\d+)/.exec(html);
    return m ? m[1] : null;
  }
  function extractPlayerType(html) {
    const m = /dooplay_player_option[^>]*data-type=['"]([a-z]+)['"]/i.exec(html || "");
    return m ? m[1] : "tv";
  }
  function resolveEpisodePage(epUrl, baseStream, signal) {
    return __async(this, null, function* () {
      const html = yield fetchText(epUrl, { signal, timeout: 15e3 }).catch(() => null);
      if (!html) return null;
      let embeds = [];
      const postId = extractEpisodePostId(html);
      const nonce = extractNonce(html);
      if (postId && nonce) {
        const ptype = extractPlayerType(html);
        const attempts = [1, 2, 3].map((nume) => postForm(
          `${SITE}/wp-admin/admin-ajax.php`,
          `action=doo_player_ajax&post=${postId}&nume=${nume}&nonce=${nonce}&type=${ptype}`,
          { signal, timeout: 12e3, headers: { Referer: epUrl } }
        ).catch(() => null));
        const settled = yield Promise.allSettled(attempts);
        for (let i = 0; i < settled.length; i++) {
          const r = settled[i].status === "fulfilled" ? settled[i].value : null;
          const u = r && r.embed_url;
          if (u && typeof u === "string" && u.startsWith("http")) {
            if (!embeds.includes(u)) embeds.push(u);
          }
        }
      }
      if (!embeds.length) {
        const embed = extractEmbedUrl(html);
        if (embed) embeds.push(embed);
      }
      if (!embeds.length) return null;
      const results = [];
      const settleList = yield Promise.allSettled(embeds.map((emb) => (() => __async(null, null, function* () {
        if (isByseUrl(emb) || /secured\.lol/.test(emb)) {
          return resolveByse(emb, fetchMeta, signal).catch(() => null);
        }
        const { resolveStream: resolveStream2 } = yield Promise.resolve().then(() => (init_resolvers(), resolvers_exports));
        const r = yield resolveStream2(__spreadProps(__spreadValues({}, baseStream), { url: emb }), 0).catch(() => null);
        if (r && r.url && r.isDirect !== false && !r.url.includes("[object")) {
          delete r.isDirect;
          delete r.originalUrl;
          return r;
        }
        return null;
      }))()));
      const seen = /* @__PURE__ */ new Set();
      for (let i = 0; i < settleList.length && results.length < 2; i++) {
        const r = settleList[i].status === "fulfilled" ? settleList[i].value : null;
        if (!r || !r.url || seen.has(r.url)) continue;
        seen.add(r.url);
        results.push(__spreadProps(__spreadValues({}, baseStream), {
          url: r.url,
          quality: r.label || r.quality || "HD",
          type: r.type || "hls"
        }));
      }
      return results.length ? results : null;
    });
  }
  function extractStreams(_0, _1, _2, _3) {
    return __async(this, arguments, function* (tmdbId, mediaType, season, episode, options = {}) {
      const signal = options.signal || null;
      if (isAborted(signal)) return [];
      setCurrentSignal(signal);
      const startTime = Date.now();
      if (mediaType === "movie") return [];
      const epNum = Math.max(1, parseInt(episode, 10) || 1);
      const seasonNum = Math.max(1, parseInt(season, 10) || 1);
      const titles = yield getTmdbTitles(tmdbId, "tv", { season: seasonNum });
      if (!titles || titles.length === 0) return [];
      const primary = String(titles._metadata && titles._metadata.name || titles[0] || "");
      if (!primary) return [];
      const titleVariants = [...new Set(
        [primary, ...titles.filter((t) => typeof t === "string" && t.length >= 3)].map((t) => normSlug(String(t).split(" (")[0])).filter(Boolean)
      )].slice(0, 5);
      let fiches = [];
      if (!isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const rawVariants = [primary, ...titles.filter((t) => typeof t === "string" && t.length >= 3)].map((t) => String(t).split(" (")[0].trim()).filter(Boolean);
        const seenQ = /* @__PURE__ */ new Set();
        for (const q of rawVariants) {
          if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
          const key = q.toLowerCase();
          if (seenQ.has(key)) continue;
          seenQ.add(key);
          fiches = yield searchSeries(q, signal);
          if (fiches.length) break;
        }
      }
      if (!fiches.length) return [];
      let best = null;
      let bestScore = 0;
      for (const f of fiches) {
        let sc = 0;
        for (const v of titleVariants) {
          sc = Math.max(sc, matchScore(f.slug, v), matchScore(normSlug(f.title), v));
        }
        if (sc > bestScore) {
          bestScore = sc;
          best = f;
        }
      }
      if (!best || bestScore <= 0) return [];
      const probes = episodeSlugCandidates(best.slug, seasonNum, epNum);
      const baseStream = {
        name: "Jetanimes",
        language: normalizeLanguageCode("VOSTFR") || "ja",
        quality: "HD"
      };
      for (const slug of probes) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        const epUrl = `${SITE}/episodes/${slug}/`;
        const streams = yield resolveEpisodePage(epUrl, baseStream, signal).catch(() => null);
        if (streams && streams.length) {
          for (const s of streams) {
            s.title = `${primary} S${seasonNum}E${epNum} [VOSTFR]`;
          }
          return streams;
        }
      }
      return [];
    });
  }
  var withCache, GATEWAY, SITE, BUDGET_MS;
  var init_extractor = __esm({
    "src/jetanimes/extractor.js"() {
      init_http();
      init_byse();
      init_resolvers();
      init_metadata();
      init_cache();
      withCache = createCache("jta", "Jetanimes");
      GATEWAY = "https://jetanimes.com";
      SITE = "https://on.jetanimes.com";
      BUDGET_MS = 45e3;
    }
  });

  // src/jetanimes/index.js
  var require_index = __commonJS({
    "src/jetanimes/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      module.exports = { getStreams: createProvider("Jetanimes", extractStreams) };
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
