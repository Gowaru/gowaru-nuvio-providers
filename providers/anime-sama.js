/**
 * anime-sama - Built from src/anime-sama/
 * Generated: 2026-05-20T18:33:10.357990255Z
 */
var __provider = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

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
  function isPlayableMediaUrl(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.toLowerCase();
    if (isKnownFakeDirectUrl(u)) return false;
    return /\.(mp4|m3u8|mkv|webm)(\?.*)?$/.test(u) || u.includes("/hls2/") || u.includes("/master.m3u8");
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
  async function resolveSibnet(url) {
    try {
      const res = await safeFetch(url, { headers: { "Referer": "https://video.sibnet.ru/" } });
      if (!res) return { url };
      const html = await res.text();
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
  }
  async function resolveVidmoly(url) {
    try {
      const domains = [
        url.replace(/vidmoly\.(net|to|ru|is)/, "vidmoly.me"),
        url.replace(/vidmoly\.(net|to|ru|is)/, "vidmoly.biz"),
        url.replace(/vidmoly\.(net|to|ru|is)/, "vidmoly.bz")
      ];
      const uniqueDomains = [...new Set(domains)];
      const headers = { "Referer": "https://vidmoly.me/", "Origin": "https://vidmoly.me" };
      for (const fetchUrl of uniqueDomains) {
        try {
          let res = await safeFetch(fetchUrl, { headers });
          if (!res) continue;
          let html = await res.text();
          if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
          const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
          if (match) return { url: match[1], headers: { "Referer": "https://vidmoly.me/" } };
          const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) || html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
          if (jsRedirect && jsRedirect[1] !== fetchUrl) {
            res = await safeFetch(jsRedirect[1], { headers });
            if (res) {
              html = await res.text();
              if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
              const match2 = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
              if (match2) return { url: match2[1], headers: { "Referer": "https://vidmoly.me/" } };
            }
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
    return { url };
  }
  async function resolveUqload(url) {
    const normalizedPath = url.replace(/^https?:\/\/[^/]+/, "");
    const originalDomain = url.match(/^https?:\/\/([^/]+)/)?.[1] || "uqload.co";
    const uniqueDomains = [.../* @__PURE__ */ new Set([originalDomain, "uqload.co", "oneupload.to"])];
    const baseRef = `https://${originalDomain}/`;
    return new Promise((resolve) => {
      let failures = 0;
      let resolved = false;
      const checkDomain = async (domain) => {
        try {
          const tryUrl = `https://${domain}${normalizedPath}`;
          const ref = `https://${domain}/`;
          const res = await safeFetch(tryUrl, { headers: { ...HEADERS, "Referer": ref } });
          if (res) {
            const html = await res.text();
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
      };
      uniqueDomains.forEach(checkDomain);
    });
  }
  async function resolveVoe(url) {
    try {
      const res = await safeFetch(url);
      if (!res) return { url };
      let html = await res.text();
      let fetchUrl = url;
      const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (redirect) {
        fetchUrl = redirect[1];
        const res2 = await safeFetch(fetchUrl);
        if (res2) html = await res2.text();
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
  }
  async function resolveStreamtape(url) {
    try {
      const res = await safeFetch(url);
      if (!res) return { url };
      let html = await res.text();
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
  }
  async function resolveSendvid(url) {
    try {
      if (url.includes("daisukianime")) {
        const idMatch = url.match(/[?&]id=([a-z0-9]+)/i);
        if (idMatch) url = `https://sendvid.com/embed/${idMatch[1]}`;
      }
      const embedUrl = url.includes("/embed/") ? url : url.replace(/sendvid\.com\/([a-z0-9]+)/i, "sendvid.com/embed/$1");
      const res = await safeFetch(embedUrl, { headers: { "Referer": "https://sendvid.com/" } });
      if (!res) return { url };
      const html = await res.text();
      const match = html.match(/video_source\s*:\s*["']([^"']+\.mp4[^"']*)["|']/) || html.match(/source\s+src=["']([^"']+\.mp4[^"']*)["|']/) || html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/) || html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/) || html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
      if (match) return { url: match[1], headers: { "Referer": "https://sendvid.com/" } };
    } catch (e) {
    }
    return { url };
  }
  async function resolveLuluvid(url) {
    try {
      const res = await safeFetch(url);
      if (!res) return { url };
      let html = await res.text();
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
  }
  async function resolveHGCloud(url) {
    try {
      const res = await safeFetch(url);
      if (!res) return { url };
      const html = await res.text();
      const match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
      if (match) return { url: match[1], headers: { "Referer": url } };
    } catch (e) {
    }
    return { url };
  }
  async function resolveDood(url) {
    try {
      const domain = url.match(/https?:\/\/([^\/]+)/)?.[1] || "dood.to";
      const res = await safeFetch(url);
      if (!res) return { url };
      let html = await res.text();
      if (html.includes("eval(function(p,a,c,k,e,d)")) html = unpack(html);
      const passMatch = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
      if (passMatch) {
        const token = passMatch[1];
        const passUrl = `https://${domain}/pass_md5/${token}`;
        const passRes = await safeFetch(passUrl, { headers: { "Referer": url } });
        if (passRes && passRes.ok) {
          const content = await passRes.text();
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
  }
  async function resolveMyTV(url) {
    try {
      const res = await safeFetch(url, { headers: { "Referer": "https://www.myvi.ru/" } });
      if (!res) return { url };
      let html = await res.text();
      if (html.includes("eval(function(p,a,c,k,e,d)")) html = unpack(html);
      const match = html.match(/["'](?:file|src|url|stream_url)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/) || html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/) || html.match(/source\s+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)/);
      if (match) return { url: match[1], headers: { "Referer": "https://www.myvi.ru/" } };
      const idMatch = url.match(/\/(?:embed\/|watch\/|video\/)([a-zA-Z0-9_-]+)/);
      if (idMatch) {
        const apiUrl = `https://www.myvi.ru/api/video/${idMatch[1]}`;
        const apiRes = await safeFetch(apiUrl, { headers: { "Referer": url } });
        if (apiRes) {
          const data = await apiRes.text();
          const apiMatch = data.match(/["'](?:url|src|file)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
          if (apiMatch) return { url: apiMatch[1], headers: { "Referer": "https://www.myvi.ru/" } };
        }
      }
    } catch (e) {
    }
    return { url };
  }
  async function resolveYounetu(url) {
    try {
      const origin = url.match(/^https?:\/\/[^/]+/)?.[0] || "https://younetu.org";
      const res = await safeFetch(url, { headers: { "Referer": origin + "/" } });
      if (!res) return { url };
      let html = await res.text();
      if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
      const match = html.match(/src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
      if (match) {
        return { url: match[1], headers: { "Referer": origin + "/" } };
      }
    } catch (e) {
    }
    return { url };
  }
  async function resolveVidoza(url) {
    try {
      const res = await safeFetch(url, { headers: { "Referer": "https://vidoza.net/" } });
      if (!res) return { url };
      const html = await res.text();
      const match = html.match(/src\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) || html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
      if (match) {
        return { url: match[1], headers: { "Referer": "https://vidoza.net/" } };
      }
    } catch (e) {
    }
    return { url };
  }
  async function resolveMoon(url) {
    try {
      const res = await safeFetch(url);
      if (!res) return { url };
      let html = await res.text();
      if (html.includes("p,a,c,k,e,d")) html = unpack(html);
      const match = html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
      if (match) return { url: match[1], headers: { "Referer": url } };
    } catch (e) {
    }
    return { url };
  }
  async function resolvePackedPlayer(url) {
    try {
      const origin = url.match(/^https?:\/\/[^/]+/)?.[0] || url;
      const res = await safeFetch(url, { headers: { "Referer": origin + "/" } });
      if (!res) return { url };
      let html = await res.text();
      if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
      const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[[^\]]*?["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
      if (match) {
        return { url: match[1], headers: { "Referer": origin + "/" } };
      }
    } catch (e) {
    }
    return { url };
  }
  async function resolveStream(stream, depth = 0) {
    if (depth > 3) return { ...stream, isDirect: false };
    const originalUrl = stream.url;
    const urlLower = originalUrl.toLowerCase();
    if (!originalUrl || originalUrl.includes("google-analytics") || originalUrl.includes("doubleclick")) return null;
    if (isPlayableMediaUrl(originalUrl)) {
      return { ...stream, isDirect: true };
    }
    try {
      let result = null;
      if (urlLower.includes("sibnet.ru")) result = await resolveSibnet(originalUrl);
      else if (urlLower.includes("vidmoly.")) result = await resolveVidmoly(originalUrl);
      else if (urlLower.includes("uqload.") || urlLower.includes("oneupload.")) result = await resolveUqload(originalUrl);
      else if (urlLower.includes("voe") || urlLower.includes("weneverbeenfree") || urlLower.includes("maryspecialwatch") || urlLower.includes("charlestoughrace") || urlLower.includes("sandratableother")) result = await resolveVoe(originalUrl);
      else if (urlLower.includes("streamtape.com") || urlLower.includes("stape")) result = await resolveStreamtape(originalUrl);
      else if (urlLower.includes("dood") || urlLower.includes("ds2play") || urlLower.includes("bigwar5")) result = await resolveDood(originalUrl);
      else if (urlLower.includes("moonplayer") || urlLower.includes("filemoon")) result = await resolveMoon(originalUrl);
      else if (urlLower.includes("younetu.") || urlLower.includes("netu.")) result = await resolveYounetu(originalUrl);
      else if (urlLower.includes("vidoza.")) result = await resolveVidoza(originalUrl);
      else if (urlLower.includes("sendvid.") || urlLower.includes("daisukianime")) result = await resolveSendvid(originalUrl);
      else if (urlLower.includes("myvi.") || urlLower.includes("mytv.")) result = await resolveMyTV(originalUrl);
      else if (urlLower.includes("fsvid.lol") || urlLower.includes("vidzy.live") || urlLower.includes("vidstream.pro") || urlLower.includes("vidcdn.")) result = await resolvePackedPlayer(originalUrl);
      else if (urlLower.includes("luluvid.") || urlLower.includes("lulustream.") || urlLower.includes("luluvdo.") || urlLower.includes("wishonly.") || urlLower.includes("veev.")) result = await resolvePackedPlayer(originalUrl);
      else if (urlLower.includes("lulu.")) result = await resolveLuluvid(originalUrl);
      else if (urlLower.includes("hgcloud.") || urlLower.includes("savefiles.")) result = await resolveHGCloud(originalUrl);
      if (result && result.url !== originalUrl && !isKnownFakeDirectUrl(result.url)) {
        return {
          ...stream,
          url: result.url,
          headers: { ...stream.headers, ...result.headers || {} },
          isDirect: true,
          originalUrl
        };
      }
      if (!result || result.url === originalUrl) {
        const res = await safeFetch(originalUrl, { headers: stream.headers });
        if (res) {
          let html = await res.text();
          if (html.includes("p,a,c,k,e,d")) html = unpack(html);
          const jsRedirect = html.match(/window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/);
          if (jsRedirect && jsRedirect[1] !== originalUrl) {
            const res2 = await safeFetch(jsRedirect[1], { headers: stream.headers });
            if (res2) {
              html = await res2.text();
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
          if (!result) {
            const iframeMatch = html.match(/<iframe\s+[^>]*src=["']([^"']+)["']/i);
            if (iframeMatch) {
              let iframeUrl = iframeMatch[1];
              if (iframeUrl.startsWith("//")) iframeUrl = "https:" + iframeUrl;
              if (iframeUrl.startsWith("/")) {
                const origin = originalUrl.match(/^https?:\/\/[^\/]+/)?.[0];
                if (origin) iframeUrl = origin + iframeUrl;
              }
              if (iframeUrl.startsWith("http") && iframeUrl !== originalUrl) {
                console.log(`[Resolver] Peeling: Found nested iframe -> ${iframeUrl}`);
                return await resolveStream({ ...stream, url: iframeUrl }, depth + 1);
              }
            }
          }
        }
      }
      if (result && result.url !== originalUrl && result.url.startsWith("http") && !isKnownFakeDirectUrl(result.url)) {
        return {
          ...stream,
          url: result.url,
          headers: { ...stream.headers, ...result.headers || {} },
          isDirect: true,
          originalUrl
        };
      }
    } catch (err) {
    }
    return { ...stream, isDirect: false };
  }
  var HEADERS, _atob, STRICT_QUALITY_TIERS, DEFAULT_QUALITY_TIER, BASE_URL_FORBIDDEN_PATTERN;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      init_streamConfig();
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
      STRICT_QUALITY_TIERS = [2160, 1080, 720, 480, 360, 240];
      DEFAULT_QUALITY_TIER = 360;
      BASE_URL_FORBIDDEN_PATTERN = "googletagmanager";
    }
  });

  // src/anime-sama/http.js
  async function fetchText(url, options = {}) {
    console.log(`[Anime-Sama] Fetching: ${url}`);
    const res = await safeFetch(url, { headers: { ...HEADERS2, ...options.headers || {} }, ...options });
    if (!res || !res.ok) {
      const status = res && typeof res.status === "number" ? res.status : "no-response";
      throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
  }
  var HEADERS2;
  var init_http = __esm({
    "src/anime-sama/http.js"() {
      init_resolvers();
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
      };
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

  // src/anime-sama/extractor.js
  async function searchSlugsScored(query) {
    try {
      const html = await fetchText(`${BASE_URL}/template-php/defaut/fetch.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": BASE_URL
        },
        body: `query=${encodeURIComponent(query)}`
      });
      const $ = import_cheerio_without_node_native.default.load(html);
      const results = [];
      $('a[href*="/catalogue/"]').each((i, el) => {
        const h = $(el).attr("href");
        const match = h.match(/\/catalogue\/([^/]+)\/?/);
        if (!match) return;
        const slug = match[1];
        if (results.some((r) => r.slug === slug)) return;
        const title = $(el).find(".asn-search-result-title").text().trim();
        const subtitle = $(el).find(".asn-search-result-subtitle").text().trim();
        const score = scoreSearchResult(title, subtitle, query);
        results.push({ slug, title, subtitle, score });
      });
      results.sort((a, b) => b.score - a.score);
      return results.map((r) => r.slug);
    } catch (e) {
      return [];
    }
  }
  function scoreSearchResult(resultTitle, resultSubtitle, query) {
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = resultTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const s = resultSubtitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let score = 0;
    if (t === q) return 100;
    if (t.includes(q)) score += 60;
    else if (q.includes(t)) score += 50;
    const qWords = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const tWords = t.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    for (const w of qWords) {
      if (tWords.includes(w)) score += 15;
    }
    for (const w of qWords) {
      if (s.includes(w) && !t.includes(w)) score += 3;
    }
    return score;
  }
  function toSlug(title) {
    return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  function getPlayerName(varName, url) {
    if (url.includes("sibnet")) return "Sibnet";
    if (url.includes("vidmoly")) return "Vidmoly";
    if (url.includes("sendvid")) return "Sendvid";
    if (url.includes("voe")) return "Voe";
    if (url.includes("stape") || url.includes("streamtape")) return "Streamtape";
    if (url.includes("dood")) return "Doodstream";
    if (url.includes("uqload") || url.includes("oneupload")) return "Uqload";
    return "Player";
  }
  function parseUrls(jsContent) {
    const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm;
    const results = [];
    let match;
    while ((match = varRegex.exec(jsContent)) !== null) {
      const urls = match[2].match(/['"]([^'"]+)['"]/g)?.map((u) => u.slice(1, -1)) || [];
      results.push({ varName: match[1], urls });
    }
    return results;
  }
  async function fetchJs(slug, seasonPath, lang) {
    const url = `${BASE_URL}/catalogue/${slug}${seasonPath ? "/" + seasonPath : ""}/${lang}/episodes.js`;
    try {
      const content = await fetchText(url);
      return content || null;
    } catch (e) {
      return null;
    }
  }
  function buildStreams(parsed, lang, episode, idx) {
    const promises = [];
    for (const { varName, urls } of parsed) {
      const playerUrl = urls[idx];
      if (playerUrl && playerUrl.startsWith("http")) {
        const epLabel = episode ? `Ep ${episode} - ` : "";
        const promise = resolveStream({
          name: `Anime-Sama (${lang.toUpperCase()})`,
          title: `${getPlayerName(varName, playerUrl)} - ${epLabel}${lang.toUpperCase()}`,
          url: playerUrl,
          quality: "HD",
          headers: { "Referer": BASE_URL }
        });
        promises.push(promise);
      }
    }
    return Promise.all(promises).then((r) => r.filter((s) => s != null));
  }
  async function fetchAndGetUrl(slug, lang, season, episode, mediaType) {
    if (mediaType === "movie") {
      const jsContent = await fetchJs(slug, "film", lang);
      if (!jsContent) return [];
      const parsed = parseUrls(jsContent);
      if (parsed.length === 0) return [];
      return buildStreams(parsed, lang, null, 0);
    }
    const mainJs = await fetchJs(slug, `saison${season}`, lang);
    if (mainJs) {
      const parsed = parseUrls(mainJs);
      if (parsed.length > 0) {
        const totalEps = parsed[0].urls.length;
        if (episode >= 1 && episode <= totalEps) {
          return buildStreams(parsed, lang, episode, episode - 1);
        }
        let cumulativeEps = totalEps;
        for (let i = 2; i <= 5; i++) {
          const subJs = await fetchJs(slug, `saison${season}-${i}`, lang);
          if (!subJs) break;
          const subParsed = parseUrls(subJs);
          if (subParsed.length === 0) break;
          const subTotal = subParsed[0].urls.length;
          const localEp = episode - cumulativeEps;
          if (localEp >= 1 && localEp <= subTotal) {
            return buildStreams(subParsed, lang, episode, localEp - 1);
          }
          cumulativeEps += subTotal;
        }
      }
    }
    const rootJs = await fetchJs(slug, "", lang);
    if (rootJs) {
      const parsed = parseUrls(rootJs);
      if (parsed.length > 0) {
        const idx = episode - 1;
        if (idx >= 0 && idx < parsed[0].urls.length) {
          return buildStreams(parsed, lang, episode, idx);
        }
      }
    }
    return [];
  }
  async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];
    const title = titles[0];
    const slug = toSlug(title);
    const languages = ["vostfr", "vf"];
    const streams = [];
    const primaryPromises = [];
    for (const lang of languages) {
      primaryPromises.push(fetchAndGetUrl(slug, lang, season, episode, mediaType));
    }
    const primaryResults = await Promise.all(primaryPromises);
    for (const result of primaryResults) {
      streams.push(...result);
    }
    if (streams.length === 0) {
      const foundSlugs = [];
      for (const t of titles.slice(0, MAX_FALLBACK_TITLES)) {
        const slugs = await searchSlugsScored(t);
        for (const s of slugs) {
          if (!foundSlugs.includes(s)) foundSlugs.push(s);
          if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
        }
        if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
      }
      const checkedSlugs = /* @__PURE__ */ new Set([slug]);
      const fallbackPromises = [];
      for (const fSlug of foundSlugs) {
        if (checkedSlugs.has(fSlug)) continue;
        checkedSlugs.add(fSlug);
        for (const lang of languages) {
          fallbackPromises.push(fetchAndGetUrl(fSlug, lang, season, episode, mediaType));
        }
      }
      const fallbackResults = await Promise.all(fallbackPromises);
      for (const result of fallbackResults) {
        streams.push(...result);
      }
    }
    const validStreams = streams.filter((s) => s && s.isDirect);
    console.log(`[Anime-Sama] Total streams found: ${validStreams.length}`);
    validStreams.sort((a, b) => {
      const isVf = (str) => str && (str.toUpperCase().includes("VF") || str.toUpperCase().includes("FRENCH"));
      const aIsVf = isVf(a.name) || isVf(a.title);
      const bIsVf = isVf(b.name) || isVf(b.title);
      if (aIsVf && !bIsVf) return -1;
      if (!aIsVf && bIsVf) return 1;
      return 0;
    });
    return validStreams;
  }
  var import_cheerio_without_node_native, BASE_URL, MAX_FALLBACK_TITLES, MAX_FALLBACK_SLUGS;
  var init_extractor = __esm({
    "src/anime-sama/extractor.js"() {
      init_http();
      import_cheerio_without_node_native = __toESM(__require("cheerio-without-node-native"));
      init_resolvers();
      init_metadata();
      BASE_URL = "https://anime-sama.to";
      MAX_FALLBACK_TITLES = 3;
      MAX_FALLBACK_SLUGS = 3;
    }
  });

  // src/anime-sama/index.js
  var require_index = __commonJS({
    "src/anime-sama/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      async function getStreams(tmdbId, mediaType, season, episode) {
        try {
          console.log(`[Anime-Sama] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
          const streams = await extractStreams(tmdbId, mediaType, season, episode);
          const result = await expandStreamQualities(streams);
          return result;
        } catch (error) {
          console.error(`[Anime-Sama] Error: ${error.message}`);
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
