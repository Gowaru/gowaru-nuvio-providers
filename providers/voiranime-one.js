/**
 * voiranime-one - Built from src/voiranime-one/
 * Generated: 2026-10-09T20:23:38.969418922Z
 */
var __provider = (() => {
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

  // src/voiranime-one/index.js
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default,
    getStreams: () => getStreams
  });

  // src/utils/resolvers.js
  var MAX_SAFE_FETCH_BODY_BYTES = 1024 * 1024;
  var RUNTIME_TRUNCATION_SUFFIX = "\n...[truncated]";
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
  var HAS_NATIVE_CRYPTO = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined" && typeof TextDecoder !== "undefined";
  var _nodeCrypto = null;
  try {
    _nodeCrypto = __require("crypto");
  } catch (_) {
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
  var HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
  };
  var USER_AGENT = HEADERS["User-Agent"];
  var BASE_HEADERS = __spreadValues({}, HEADERS);
  var _atob = (str) => {
    try {
      return atob(str);
    } catch (e) {
      return str;
    }
  };
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
  var FETCH_CACHE_TTL = 3e5;
  var fetchCache = /* @__PURE__ */ new Map();
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
  var DEFAULT_FETCH_TIMEOUT = 15e3;
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
        const originalReferer = originalDomain ? `https://${originalDomain}/` : "https://vidmoly.to/";
        const tldVariants = ["to", "net", "ru", "is"];
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
            const hasJsRedirect = /window\.location\.replace/.test(html);
            if (html.length < 500 && !hasJsRedirect || html.includes("finisheddaysflamboyant")) continue;
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
            let decoded = "";
            for (let i = 0; i < a.length; i++) {
              const kk = 61 + i * 89 + H & 255;
              decoded += String.fromCharCode(a.charCodeAt(i) ^ kk);
            }
            if (decoded.startsWith("http") && decoded.includes(".m3u8") && !decoded.includes("/troll/")) {
              videoUrl = decoded;
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
  var KNOWN_HOST_NAMES = [
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
  var NEVER_CORRECT_DOMAINS = [
    "voembed.net",
    // famille VidMoly (m3u8 en clair) — PAS voe
    "gn1r5n.org",
    // embed "myTV" de VoirAnime
    "streamhide.to"
    // gate ParkLogic — PAS streamtape
  ];
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
  var peeledUrls = /* @__PURE__ */ new Set();
  var AD_IFRAME_PATTERNS = [
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
  var VIDEO_IFRAME_SCORE = {
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
        else if (urlLower.includes("luluvid.") || urlLower.includes("lulustream.") || urlLower.includes("luluvdo.") || urlLower.includes("wishonly.") || urlLower.includes("veev.")) result = yield resolvePackedPlayer(originalUrl);
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
  var BASE_URL_FORBIDDEN_PATTERN = "googletagmanager";

  // src/voiranime-one/http.js
  var _currentSignal = null;
  var BASE = "https://voiranime.one";
  var DOMAIN = "voiranime.one";
  var rateLimit = createProviderRateLimiter();
  var HEADERS2 = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    Referer: `${BASE}/`
  };
  function fetchAny(_0) {
    return __async(this, arguments, function* (pathOrUrl, options = {}) {
      var _a;
      const signal = options.signal || _currentSignal;
      if (isAborted(signal)) throw new Error("AbortError: aborted");
      const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
      yield rateLimit(DOMAIN);
      try {
        const res = yield safeFetch(url, {
          headers: __spreadValues(__spreadValues({}, HEADERS2), options.headers || {}),
          timeout: (_a = options.timeout) != null ? _a : 12e3,
          signal
        });
        if (!res || !res.ok) return null;
        const text = yield res.text();
        if (!text) return null;
        if (options.responseType === "json") {
          try {
            return JSON.parse(text);
          } catch (e) {
            return null;
          }
        }
        return text;
      } catch (e) {
        if (e && String(e.message || e).includes("AbortError")) throw e;
        return null;
      }
    });
  }
  var fetchText = (path, opts = {}) => fetchAny(path, __spreadProps(__spreadValues({}, opts), { responseType: "text" }));
  var fetchJson = (path, opts = {}) => fetchAny(path, __spreadProps(__spreadValues({}, opts), { responseType: "json" }));

  // src/utils/metadata.js
  var TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
  var TMDB_API_BASE = "https://api.themoviedb.org/3";
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
  var METADATA_CACHE = /* @__PURE__ */ new Map();
  var METADATA_TTL = 5 * 60 * 1e3;
  var METADATA_MAX = 500;
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
  var SEASON_SUFFIXES = [
    (s) => `Season ${s}`,
    (s) => `Saison ${s}`,
    (s) => `S${s}`
  ];
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

  // src/voiranime-one/extractor.js
  var SITE = "voiranime.one";
  var TIMEOUTS = { search: 12e3, fiche: 14e3, episode: 14e3, resolve: 15e3 };
  var HOMONYM_EXCLUSIONS = [
    "steins-gate",
    "stein-s-gate",
    "the-new-gate",
    "rainbow-gate",
    "west-gate",
    "gates",
    "gate-7",
    "burikko-gate",
    "gate-of-revelation"
  ];
  var SEASON_SLOT = "film";
  var STOP_WORDS = /* @__PURE__ */ new Set([
    // EN
    "the",
    "a",
    "an",
    "of",
    "no",
    "wa",
    "ga",
    "wo",
    "o",
    "ni",
    "to",
    "da",
    // FR (articles/prépositions — bruits dans les titres FR)
    "de",
    "la",
    "le",
    "les",
    "des",
    "du",
    "et",
    "un",
    "une",
    "au",
    "aux",
    "en",
    "sur",
    "pour",
    "par",
    "d",
    "l",
    "i"
    // numérotation romaine/lettre seule
  ]);
  function normalizeText(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function tokens(s) {
    return normalizeText(s).split(" ").filter(Boolean);
  }
  function scoreMatch(queryTokens, title) {
    const titleTok = tokens(title);
    if (!queryTokens.length || !titleTok.length) return 0;
    const titleSet = new Set(titleTok);
    let matched = 0;
    for (const q of queryTokens) if (titleSet.has(q)) matched++;
    if (matched === 0) return 0;
    const extra = titleTok.filter((t) => !STOP_WORDS.has(t) && !queryTokens.includes(t)).length;
    let score = Math.round(matched / queryTokens.length * 70 + matched / titleTok.length * 30);
    const joined = normalizeText(title);
    const qJoined = queryTokens.join(" ");
    if (joined === qJoined) score += 30;
    else if (joined.startsWith(qJoined + " ")) score += 20;
    score -= extra * 15;
    return Math.max(0, score);
  }
  function isHomonym(slug, titles, queryTokens) {
    const s = String(slug || "").toLowerCase();
    for (const bad of HOMONYM_EXCLUSIONS) {
      if (!s.includes(bad)) continue;
      const badTok = bad.split("-");
      if (badTok.every((t) => queryTokens.includes(t))) continue;
      return true;
    }
    const joined = normalizeText(titles.join(" "));
    for (const bad of HOMONYM_EXCLUSIONS) {
      if (!joined.includes(bad.replace(/-/g, " "))) continue;
      const badTok = bad.split("-");
      if (badTok.every((t) => queryTokens.includes(t))) continue;
      return true;
    }
    return false;
  }
  function extractRscPayload(html) {
    const chunks = [];
    const re = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g;
    let m;
    while ((m = re.exec(html)) !== null) chunks.push(m[1]);
    if (!chunks.length) return "";
    let payload = chunks.join("");
    try {
      payload = JSON.parse(`"${payload.replace(/"/g, '\\"').replace(/\\"/g, '"')}"`);
    } catch (e) {
    }
    return payload.replace(/\\\\u002F/gi, "/").replace(/\\u002F/gi, "/").replace(/\\n/g, "\n");
  }
  function searchSite(queries, mediaType, signal) {
    return __async(this, null, function* () {
      const bySlug = /* @__PURE__ */ new Map();
      for (const q of queries) {
        if (!q || isAborted(signal)) break;
        const data = yield fetchJson(
          `/api/anime/search?q=${encodeURIComponent(q)}`,
          { timeout: TIMEOUTS.search, signal }
        );
        const list = data && Array.isArray(data.animes) ? data.animes : null;
        if (!list) continue;
        for (const a of list) {
          if (!a || !a.slug || bySlug.has(a.slug)) continue;
          bySlug.set(a.slug, {
            slug: a.slug,
            type: String(a.type || "").toLowerCase(),
            // tv | film | ova | spécial
            langues: Array.isArray(a.langues) ? a.langues : [],
            titles: [
              a.title,
              a.titleFrench,
              a.titleEnglish,
              a.titleOriginal,
              a.titleJp,
              ...Array.isArray(a.synonyms) ? a.synonyms : [],
              a.slug
            ].filter(Boolean)
          });
        }
        if (bySlug.size >= 12) break;
      }
      return [...bySlug.values()];
    });
  }
  function getFichePlan(slug, signal) {
    return __async(this, null, function* () {
      const html = yield fetchText(`/${slug}`, { timeout: TIMEOUTS.fiche, signal });
      if (!html) return null;
      const payload = extractRscPayload(html);
      const src = payload || html;
      const m = src.match(/"seasons":\[(.*?)\],"?(?:rating|isAdult|genres|published|featured|backdrop)/);
      if (!m) return null;
      let plan;
      try {
        plan = JSON.parse(`[${m[1]}]`);
      } catch (e) {
        return null;
      }
      if (!Array.isArray(plan)) return null;
      const seasons = /* @__PURE__ */ new Map();
      let hasEpisodeData = false;
      for (const s of plan) {
        if (!s || typeof s.number !== "number") continue;
        const eps = Array.isArray(s.episodes) ? s.episodes : [];
        const released = /* @__PURE__ */ new Set();
        let maxEp = 0;
        for (const e of eps) {
          if (!e || typeof e.number !== "number") continue;
          hasEpisodeData = true;
          if (e.released !== false) released.add(e.number);
          if (e.number > maxEp) maxEp = e.number;
        }
        seasons.set(s.number, { maxEp, released });
      }
      return { seasons, hasEpisodeData };
    });
  }
  function extractFromEpisodePage(slug, seasonSlot, lang, ep, signal, title) {
    return __async(this, null, function* () {
      var _a, _b;
      const path = `/${slug}/${seasonSlot}/${lang}/${ep}`;
      const html = yield fetchText(path, { timeout: TIMEOUTS.episode, signal });
      if (!html) return [];
      const cuid = (_a = html.match(/\/embed\/([a-z0-9]+(?:\d[a-z0-9]*))/)) == null ? void 0 : _a[1];
      if (!cuid) return [];
      const embedHtml = yield fetchText(`/embed/${cuid}`, {
        timeout: TIMEOUTS.episode,
        signal,
        headers: { Referer: `${BASE}/` }
      });
      if (!embedHtml) return [];
      const external = (((_b = embedHtml.match(/<iframe[^>]*src="(https?:\/\/[^"]+)"/)) == null ? void 0 : _b[1]) || "").split(String.fromCharCode(92) + "/").join("/");
      if (!external) return [];
      if (!/^https?:\/\//.test(external)) return [];
      const isFilm = seasonSlot === SEASON_SLOT;
      const langLower = lang.toLowerCase();
      const label = isFilm ? "Film" : `S${seasonSlot}E${ep}`;
      const out = yield resolveStream({
        url: external,
        name: `${SITE} ${label}`,
        title,
        language: langLower === "vf" ? "fr" : "fr",
        // VF et VOSTFR → fr (sous-titres pour VOSTFR)
        quality: "",
        provider: SITE
      }, 0);
      if (!out || !out.url) return [];
      if (out.isDirect === false) return [];
      return [{
        url: out.url,
        name: `${SITE} ${label} ${lang}`,
        title: title || null,
        quality: out.quality || "",
        language: "fr",
        headers: out.headers || void 0,
        provider: SITE
      }];
    });
  }
  function extractStreams(_0, _1, _2, _3) {
    return __async(this, arguments, function* (tmdbId, mediaType, season, episode, options = {}) {
      const signal = options.signal;
      const seasonNum = parseInt(season, 10) || 1;
      const epNum = parseInt(episode, 10) || 1;
      const isMovie = mediaType === "movie";
      let titles = [];
      try {
        titles = yield getTmdbTitles(tmdbId, isMovie ? "movie" : "tv", { season: seasonNum, episode: epNum });
      } catch (e) {
      }
      const queries = [...new Set([titles[0], ...titles].filter(Boolean))].slice(0, 4);
      if (!queries.length) return [];
      const candidates = yield searchSite(queries, mediaType, signal);
      if (!candidates.length) return [];
      const queryTokenSets = queries.map((q) => tokens(q));
      let best = null;
      let bestScore = 0;
      for (const c of candidates) {
        if (isHomonym(c.slug, c.titles, queryTokenSets[0])) continue;
        if (isMovie && c.type !== "film") continue;
        if (!isMovie && c.type === "film") continue;
        let s = 0;
        for (const qt of queryTokenSets) {
          for (const t of c.titles) s = Math.max(s, scoreMatch(qt, t));
        }
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      if (!best || bestScore < 45) return [];
      console.log(`[VoirAnimeOne] Match: ${best.slug} (score ${bestScore}, type ${best.type})`);
      let seasonSlot;
      if (isMovie) {
        seasonSlot = SEASON_SLOT;
      } else {
        const plan = yield getFichePlan(best.slug, signal);
        if (plan && plan.hasEpisodeData) {
          const s = plan.seasons.get(seasonNum);
          if (!s) {
            console.log(`[VoirAnimeOne] S${seasonNum} absente de ${best.slug} (${[...plan.seasons.keys()].join(",")}), abandon`);
            return [];
          }
          if (s.released.size && !s.released.has(epNum)) {
            console.log(`[VoirAnimeOne] S${seasonNum}E${epNum} non sorti sur le site, abandon`);
            return [];
          }
        }
        seasonSlot = seasonNum;
      }
      const langs = [];
      const known = (best.langues || []).map((l) => String(l).toUpperCase());
      if (known.includes("VF")) langs.push("VF");
      if (known.includes("VOSTFR")) langs.push("VOSTFR");
      if (!langs.length) langs.push("VOSTFR", "VF");
      const all = [];
      for (const lang of langs) {
        if (isAborted(signal)) break;
        try {
          const streams = yield extractFromEpisodePage(best.slug, String(seasonSlot), lang, epNum, signal, titles[0] || best.titles[0]);
          all.push(...streams);
        } catch (e) {
          if (String(e && e.message).includes("AbortError")) throw e;
        }
      }
      const seen = /* @__PURE__ */ new Set();
      const dedup = all.filter((st) => {
        try {
          const u = new URL(st.url);
          const key = `${u.host}${u.pathname.replace(/\?.*$/, "")}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        } catch (e) {
          return true;
        }
      });
      return dedup;
    });
  }

  // src/voiranime-one/index.js
  function getStreams(_0, _1, _2, _3) {
    return __async(this, arguments, function* (tmdbId, mediaType, season, episode, options = {}) {
      const type = mediaType === "movie" ? "movie" : "tv";
      try {
        return yield extractStreams(tmdbId, type, season, episode, options);
      } catch (e) {
        if (e && String(e.message || e).includes("AbortError")) throw e;
        console.warn(`[VoirAnimeOne] Error: ${e && e.message ? e.message : e}`);
        return [];
      }
    });
  }
  var index_default = { getStreams };
  return __toCommonJS(index_exports);
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
