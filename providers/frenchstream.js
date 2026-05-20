/**
 * frenchstream - Built from src/frenchstream/
 * Generated: 2026-05-20T18:33:10.647990606Z
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

  // src/frenchstream/http.js
  async function fetchText(url, options = {}) {
    console.log(`[Frenchstream] Fetching: ${url}`);
    const base = options.baseUrl || (() => {
      try {
        return new URL(url).origin;
      } catch (e) {
        return BASE_URL;
      }
    })();
    const timeout = options.timeout || GLOBAL_TIMEOUT_MS;
    const mergedHeaders = {
      ...HEADERS2,
      Referer: `${base}/`,
      Origin: base,
      ...options.headers || {}
    };
    const { baseUrl, headers, ...restOptions } = options;
    const res = await safeFetch(url, { headers: mergedHeaders, ...restOptions, timeout });
    if (!res || !res.ok) {
      const status = res && typeof res.status === "number" ? res.status : "no-response";
      throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
  }
  async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error(`[Frenchstream] Failed to parse JSON for ${url}`);
      throw e;
    }
  }
  var BASE_URLS, BASE_URL, GLOBAL_TIMEOUT_MS, HEADERS2;
  var init_http = __esm({
    "src/frenchstream/http.js"() {
      init_resolvers();
      BASE_URLS = ["https://french-stream.one", "https://fs09.lol"];
      BASE_URL = BASE_URLS[0];
      GLOBAL_TIMEOUT_MS = 2e4;
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": `${BASE_URL}/`,
        "Origin": BASE_URL,
        "Connection": "keep-alive"
      };
    }
  });

  // src/frenchstream/extractor.js
  function cached(key, fn) {
    const now = Date.now();
    if (cache.has(key) && now - cache.get(key).ts < CACHE_TTL_MS) return cache.get(key).data;
    return fn().then((data) => {
      cache.set(key, { data, ts: now });
      return data;
    });
  }
  async function fetchTmdbJson(url) {
    const res = await safeFetch(url);
    if (!res || !res.ok) return null;
    return res.json();
  }
  function isJapaneseOrChinese(text) {
    return /[\u3000-\u9FFF\uF900-\uFAFF]/.test(text || "");
  }
  function normalize(text) {
    return (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function getOrigin(url) {
    try {
      return new URL(url).origin;
    } catch (e) {
      return BASE_URL;
    }
  }
  function pickNewsId(onclick, href) {
    const modalId = (onclick || "").match(/openModal\('(\d+)'\)/i)?.[1];
    if (modalId) return modalId;
    return (href || "").match(/^\/(\d+)-/)?.[1] || null;
  }
  function isSeriesCard($card, href, title) {
    if ($card.find(".mli-eps").length > 0) return true;
    const text = (href || "") + " " + (title || "");
    return /saison|series|\/s-tv\//i.test(text);
  }
  function normalizeHref(href, baseUrl) {
    if (!href || typeof href !== "string") return null;
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return "https:" + trimmed;
    if (trimmed.startsWith("/")) return baseUrl + trimmed;
    return baseUrl + "/" + trimmed.replace(/^\/+/, "");
  }
  function parseSearchCards(html, baseUrl) {
    const $ = import_cheerio_without_node_native.default.load(html);
    const cards = [];
    $(".short .short-in").each((_, element) => {
      const $card = $(element);
      const hrefRaw = $card.find("a.short-poster").first().attr("href") || $card.find("a.img-box").first().attr("href") || $card.find("a[href]").first().attr("href") || "";
      const href = normalizeHref(hrefRaw, baseUrl);
      if (!href) return;
      const title = ($card.find(".short-title").first().text() || "").trim();
      if (!title) return;
      const onclick = $card.find(".info-button").attr("onclick") || "";
      const newsId = pickNewsId(onclick, hrefRaw);
      if (!newsId) return;
      cards.push({ newsId, href, title, isSeries: isSeriesCard($card, href, title), baseUrl });
    });
    return cards;
  }
  function buildTitleQueries(titles) {
    const queries = [];
    const push = (v) => {
      if (typeof v === "string" && v.trim() && !queries.some((q) => q.toLowerCase() === v.trim().toLowerCase())) queries.push(v.trim());
    };
    for (const title of (titles || []).slice(0, 2)) {
      push(title);
      const bc = title.split(":")[0];
      if (bc && bc.length >= 3) push(bc);
    }
    return queries.slice(0, MAX_SEARCH_QUERIES);
  }
  function scoreCard(card, queryTitle, mediaType, season) {
    const q = normalize(queryTitle);
    const t = normalize(card.title);
    const hrefN = normalize(card.href || "");
    const hay = (t + " " + hrefN).trim();
    if (!q || !t) return 0;
    let score = 0;
    if (t === q) score += 120;
    if (hay.includes(q)) score += 70;
    if (q.includes(t)) score += 40;
    const qWords = new Set(q.split(" ").filter((w) => w && w.length > 2 && !["the", "and", "for", "with", "from", "des", "les", "une", "dans", "sur", "via", "de", "du", "la", "le"].includes(w)));
    const tWords = new Set(hay.split(" ").filter(Boolean));
    let common = 0;
    for (const w of qWords) {
      if (tWords.has(w)) common += 1;
    }
    score += common * 8;
    if (mediaType === "movie" && card.isSeries) score -= 50;
    if (mediaType === "tv" && !card.isSeries) score -= 30;
    const sn = Number(season) || 1;
    const text = (card.title + " " + card.href).toLowerCase();
    const hasSeason = /saison\s*\d+|s-tv\//i.test(text);
    if (mediaType === "tv") {
      if (sn > 1) {
        const sr = new RegExp("saison\\s*" + sn + "|[-_/]" + sn + "(?:[^0-9]|$)", "i");
        if (sr.test(text)) score += 20;
        if (hasSeason && !sr.test(text)) score -= 25;
      } else if (sn === 1 && /saison\s*[2-9]/i.test(text)) score -= 25;
    }
    return score;
  }
  async function searchByTitle(title, mediaType, season) {
    const allCards = [];
    for (const baseUrl of BASE_URLS) {
      try {
        const url = baseUrl + "/index.php?do=search&subaction=search&story=" + encodeURIComponent(title);
        const html = await fetchText(url, { baseUrl });
        allCards.push(...parseSearchCards(html, baseUrl));
      } catch (e) {
        console.warn("[Frenchstream] Search failed on " + baseUrl + ": " + e.message);
      }
    }
    const filtered = allCards.filter((c) => mediaType === "tv" ? c.isSeries : !c.isSeries);
    if (filtered.length === 0) return [];
    return filtered.map((c) => ({ ...c, _score: scoreCard(c, title, mediaType, season), _matchedTitle: title })).sort((a, b) => b._score - a._score).slice(0, 8);
  }
  async function getTmdbDetails(tmdbId, mediaType) {
    const type = mediaType === "movie" ? "movie" : "tv";
    const url = TMDB_API_BASE2 + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY2 + "&language=en-US";
    return cached("tmdb_det_" + tmdbId + "_" + type, () => fetchTmdbJson(url));
  }
  async function detectSubType(tmdbId, mediaType, titles) {
    try {
      const d = await getTmdbDetails(tmdbId, mediaType);
      if (!d) return null;
      const genres = (d.genres || []).map((g) => g.id);
      const isAnim = genres.includes(16);
      const orig = mediaType === "movie" ? d.original_title : d.original_name;
      const jap = isJapaneseOrChinese(orig);
      const tm = titles.some((t) => ANIME_KEYWORDS.test(t));
      if (isAnim && (jap || tm)) return "anime";
      if (isAnim && mediaType === "tv") return "cartoon";
    } catch (e) {
    }
    return null;
  }
  function hostLabel(k) {
    const h = (k || "").toLowerCase();
    if (h === "premium") return "FSVID";
    if (h === "vidzy") return "VIDZY";
    if (h === "uqload") return "UQLOAD";
    if (h === "dood") return "DOOD";
    if (h === "voe") return "VOE";
    if (h === "filmoon") return "FILEMOON";
    if (h === "netu") return "NETU";
    return k ? k.toUpperCase() : "PLAYER";
  }
  function languageLabel(k) {
    const l = (k || "").toLowerCase();
    if (l === "vf" || l === "default" || l === "vfq") return "VF";
    if (l === "vostfr") return "VOSTFR";
    if (l === "vo") return "VO";
    return l ? l.toUpperCase() : "VF";
  }
  function toStream(name, host, language, url, quality, subType) {
    const origin = getOrigin(url);
    const s = {
      name,
      url,
      quality: quality || "HD",
      title: "[" + languageLabel(language) + "] " + hostLabel(host) + (quality && quality !== "HD" ? " [" + quality + "]" : ""),
      headers: { Referer: origin + "/", Origin: origin, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" }
    };
    if (subType) s.subType = subType;
    return s;
  }
  function dedupeByUrl(streams) {
    const seen = /* @__PURE__ */ new Set(), out = [];
    for (const s of streams) {
      if (s && s.url && !seen.has(s.url)) {
        seen.add(s.url);
        out.push(s);
      }
    }
    return out;
  }
  async function fetchSeasons(tmdbId) {
    const tag = "s-" + tmdbId;
    const url = BASE_URL + "/engine/ajax/get_seasons.php?serie_tag=" + tag + "&news_id=0";
    return cached("seasons_" + tmdbId, async () => {
      const data = await fetchJson(url, { baseUrl: BASE_URL });
      if (!Array.isArray(data)) return [];
      return data;
    });
  }
  async function fetchEpisodeData(seasonNewsId) {
    const url = BASE_URL + "/data/eps_" + seasonNewsId + ".txt?v=" + Math.floor(Date.now() / 3e4);
    return cached("eps_" + seasonNewsId, async () => {
      const data = await fetchJson(url, { baseUrl: BASE_URL });
      return data;
    });
  }
  function collectTvSiteCandidates(epData, episode, subType) {
    const epNum = Number(episode) || 1;
    const streams = [];
    for (const lang of ["vf", "vostfr", "vo"]) {
      const byEp = epData && epData[lang];
      if (!byEp || typeof byEp !== "object") continue;
      const players = byEp[String(epNum)] || byEp[epNum];
      if (!players || typeof players !== "object") continue;
      for (const host of Object.keys(players)) {
        const url = players[host];
        if (typeof url === "string" && url.startsWith("http")) {
          streams.push(toStream("Frenchstream", host, lang, url, null, subType));
        }
      }
    }
    return streams;
  }
  function collectFstreamApiMovieCandidates(apiData, subType) {
    const players = apiData && apiData.players;
    if (!players || typeof players !== "object") return [];
    const streams = [];
    for (const lang of Object.keys(players)) {
      const list = players[lang];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item.url !== "string" || !item.url.startsWith("http")) continue;
        streams.push(toStream("Frenchstream", item.player || "player", lang, item.url, item.quality, subType));
      }
    }
    return streams;
  }
  async function fetchMovixMovieFallback(tmdbId, subType) {
    const ck = "movix_m_" + tmdbId;
    const cv = cache.get(ck);
    if (cv && Date.now() - cv.ts < CACHE_TTL_MS) return cv.data;
    try {
      const url = FSTREAM_API_BASE + "/api/fstream/movie/" + tmdbId;
      const data = await fetchJson(url, {
        headers: { Accept: "application/json, text/plain, */*", Referer: "https://movix.cash/", Origin: "https://movix.cash" }
      });
      if (!data || data.success === false) return [];
      const streams = collectFstreamApiMovieCandidates(data, subType);
      cache.set(ck, { data: streams, ts: Date.now() });
      return streams;
    } catch (e) {
      console.warn("[Frenchstream] Movix fallback failed: " + e.message);
      return [];
    }
  }
  function resolveSingle(stream) {
    return resolveStream(stream, { timeout: RESOLVE_TIMEOUT_MS });
  }
  async function resolveCandidates(candidates) {
    const limited = candidates.slice(0, MAX_CANDIDATES);
    const resolved = await Promise.allSettled(limited.map(resolveSingle));
    const direct = [];
    for (const r of resolved) {
      if (r.status !== "fulfilled") continue;
      const s = r.value;
      if (s && s.url && s.isDirect) direct.push(s);
    }
    return dedupeByUrl(direct);
  }
  function parseCategoryMovies(html) {
    const $ = import_cheerio_without_node_native.default.load(html);
    const movies = [];
    $(".short").each((_, el) => {
      const $card = $(el);
      const newsId = $card.find("[data-id]").first().attr("data-id") || ($card.find(".info-button").attr("onclick") || "").match(/openModal\('(\d+)'\)/)?.[1];
      const title = ($card.find(".short-title").first().text() || "").trim();
      const poster = $card.find("img").first().attr("src") || "";
      if (newsId && title) movies.push({ newsId, title, poster });
    });
    return movies;
  }
  async function fetchCategoryMovies(catPath) {
    const url = BASE_URL + catPath;
    return cached("cat_" + catPath.replace(/[\/\s]/g, "_"), async () => {
      const html = await fetchText(url, { timeout: CATEGORY_FETCH_TIMEOUT, baseUrl: BASE_URL });
      return parseCategoryMovies(html);
    });
  }
  async function verifyAndExtractMovieStreams(newsId, tmdbId, subType) {
    const url = BASE_URL + "/engine/ajax/film_api.php?id=" + newsId;
    try {
      const data = await fetchJson(url, { baseUrl: BASE_URL });
      const tagz = data?.meta?.tagz || "";
      const expectedTag = "f-" + tmdbId;
      if (tagz !== expectedTag) {
        console.log("[Frenchstream] Tagz mismatch: got " + tagz + ", expected " + expectedTag);
        return null;
      }
      const players = data?.players;
      if (!players || typeof players !== "object") return [];
      const streams = [];
      for (const host of Object.keys(players)) {
        const versions = players[host];
        if (!versions || typeof versions !== "object") continue;
        for (const lang of Object.keys(versions)) {
          const url2 = versions[lang];
          if (typeof url2 === "string" && url2.startsWith("http")) {
            streams.push(toStream("Frenchstream", host, lang, url2, null, subType));
          }
        }
      }
      return streams;
    } catch (e) {
      console.warn("[Frenchstream] film_api verify failed for " + newsId + ": " + e.message);
      return null;
    }
  }
  function scoreMovieCategory(cardTitle, queryTitles) {
    const t = normalize(cardTitle);
    if (!t) return 0;
    let bestScore = 0;
    for (const qt of queryTitles) {
      const q = normalize(qt);
      if (!q) continue;
      let score = 0;
      if (t === q) score += 120;
      else if (t.includes(q) || q.includes(t)) score += 70;
      else {
        const qWords = q.split(" ").filter((w) => w.length > 2 && !["the", "and", "for", "with", "from", "des", "les", "une", "dans", "sur", "via", "de", "du", "la", "le", "das", "der", "die"].includes(w));
        const tWords = new Set(t.split(" "));
        let common = 0;
        for (const w of qWords) {
          if (tWords.has(w)) common++;
        }
        score += common * 10;
      }
      if (score > bestScore) bestScore = score;
    }
    return bestScore;
  }
  async function searchMovieOnSite(tmdbId, titles, subType) {
    const queries = buildTitleQueries(titles);
    for (const title of queries) {
      try {
        const ranked = await searchByTitle(title, "movie");
        if (ranked.length > 0 && ranked[0]._score >= MIN_MATCH_SCORE) {
          const streams = await verifyAndExtractMovieStreams(ranked[0].newsId, tmdbId, subType);
          if (streams && streams.length > 0) {
            const resolved = await resolveCandidates(streams);
            console.log("[Frenchstream] Movie found via DLE search: " + resolved.length + " streams");
            return resolved;
          }
        }
      } catch (e) {
      }
    }
    const details = await getTmdbDetails(tmdbId, "movie");
    const genreIds = (details?.genres || []).map((g) => g.id);
    const priorityCats = [...new Set(genreIds.map((id) => GENRE_TO_CATEGORY[id]).filter(Boolean))];
    const catsToCheck = [...priorityCats];
    for (const cat of ALL_CATEGORIES) {
      if (!catsToCheck.includes(cat)) catsToCheck.push(cat);
    }
    const seenNewsIds = /* @__PURE__ */ new Set();
    let bestMatch = null;
    let bestScore = 0;
    const catResults = await Promise.allSettled(catsToCheck.map((cat) => fetchCategoryMovies(cat)));
    for (const r of catResults) {
      if (r.status !== "fulfilled") continue;
      for (const movie of r.value) {
        if (seenNewsIds.has(movie.newsId)) continue;
        seenNewsIds.add(movie.newsId);
        const score = scoreMovieCategory(movie.title, titles);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = movie;
        }
      }
    }
    if (bestMatch && bestScore >= MOVIE_MATCH_SCORE) {
      const streams = await verifyAndExtractMovieStreams(bestMatch.newsId, tmdbId, subType);
      if (streams && streams.length > 0) {
        const resolved = await resolveCandidates(streams);
        console.log("[Frenchstream] Movie found via category browsing: " + bestMatch.title + " \u2192 " + resolved.length + " streams");
        return resolved;
      }
    }
    return [];
  }
  async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];
    const subType = await detectSubType(tmdbId, mediaType, titles);
    if (subType) console.log("[Frenchstream] subType: " + subType);
    if (mediaType === "tv") {
      const seasons = await fetchSeasons(tmdbId);
      if (seasons.length > 0) {
        const sn = Number(season) || 1;
        const sIdx = seasons.findIndex((s) => /saison\s*(\d+)/i.test(s.title) && parseInt(s.title.match(/saison\s*(\d+)/i)[1]) === sn);
        const target = sIdx !== -1 ? seasons[sIdx] : seasons[0];
        if (target) {
          const epData = await fetchEpisodeData(target.id);
          const candidates = collectTvSiteCandidates(epData, episode, subType);
          if (candidates.length > 0) {
            const streams = await resolveCandidates(candidates);
            console.log("[Frenchstream] Site eps " + target.id + ": " + candidates.length + " candidates, " + streams.length + " streams");
            return streams;
          }
        }
      }
      console.warn("[Frenchstream] No season data from site, trying Movix fallback");
      const movix2 = await fetchMovixMovieFallback(tmdbId, subType);
      if (movix2.length > 0) {
        const streams = await resolveCandidates(movix2);
        console.log("[Frenchstream] Movix TV fallback: " + movix2.length + " candidates, " + streams.length + " streams");
        return streams;
      }
      return [];
    }
    const movieStreams = await searchMovieOnSite(tmdbId, titles, subType);
    if (movieStreams.length > 0) return movieStreams;
    const movix = await fetchMovixMovieFallback(tmdbId, subType);
    if (movix.length > 0) {
      const streams = await resolveCandidates(movix);
      console.log("[Frenchstream] Movix movie fallback: " + movix.length + " candidates, " + streams.length + " streams");
      return streams;
    }
    return [];
  }
  var import_cheerio_without_node_native, MIN_MATCH_SCORE, MOVIE_MATCH_SCORE, MAX_SEARCH_QUERIES, MAX_CANDIDATES, RESOLVE_TIMEOUT_MS, CACHE_TTL_MS, CATEGORY_FETCH_TIMEOUT, TMDB_API_KEY2, TMDB_API_BASE2, GENRE_TO_CATEGORY, ALL_CATEGORIES, cache, ANIME_KEYWORDS, FSTREAM_API_BASE;
  var init_extractor = __esm({
    "src/frenchstream/extractor.js"() {
      import_cheerio_without_node_native = __toESM(__require("cheerio-without-node-native"));
      init_resolvers();
      init_metadata();
      init_http();
      MIN_MATCH_SCORE = 60;
      MOVIE_MATCH_SCORE = 55;
      MAX_SEARCH_QUERIES = 3;
      MAX_CANDIDATES = 4;
      RESOLVE_TIMEOUT_MS = 2e4;
      CACHE_TTL_MS = 3e5;
      CATEGORY_FETCH_TIMEOUT = 8e3;
      TMDB_API_KEY2 = "8265bd1679663a7ea12ac168da84d2e8";
      TMDB_API_BASE2 = "https://api.themoviedb.org/3";
      GENRE_TO_CATEGORY = {
        28: "/films/actions/",
        12: "/films/aventures/",
        16: "/films/animations/",
        35: "/films/comedies/",
        80: "/films/policiers/",
        99: "/films/documentaires/",
        18: "/films/drames/",
        10751: "/films/familles/",
        14: "/films/fantastiques/",
        36: "/films/historiques/",
        27: "/films/epouvante-horreurs/",
        10752: "/films/guerres/",
        9648: "/films/thrillers/",
        10749: "/films/romances/",
        878: "/films/science-fictions/",
        53: "/films/thrillers/",
        37: "/films/westerns/",
        10759: "/films/actions/",
        10402: "/films/biopics/",
        10770: "/films/vf/"
      };
      ALL_CATEGORIES = [
        "/films/actions/",
        "/films/aventures/",
        "/films/animations/",
        "/films/biopics/",
        "/films/comedies/",
        "/films/drames/",
        "/films/documentaires/",
        "/films/epouvante-horreurs/",
        "/films/historiques/",
        "/films/espionnages/",
        "/films/familles/",
        "/films/fantastiques/",
        "/films/guerres/",
        "/films/policiers/",
        "/films/romances/",
        "/films/science-fictions/",
        "/films/thrillers/",
        "/films/westerns/",
        "/films/vf/",
        "/films/cultes/"
      ];
      cache = /* @__PURE__ */ new Map();
      ANIME_KEYWORDS = /\b(?:anime|japon|shonen|shoujo|seinen|manga)\b/i;
      FSTREAM_API_BASE = "https://api.movix.cash";
    }
  });

  // src/frenchstream/index.js
  var require_index = __commonJS({
    "src/frenchstream/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      async function getStreams(tmdbId, mediaType, season, episode) {
        console.log(`[Frenchstream] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
        try {
          const streams = await extractStreams(tmdbId, mediaType, season, episode);
          const result = await expandStreamQualities(streams);
          console.log(`[Frenchstream] Found ${result.length} stream(s)`);
          return result;
        } catch (error) {
          console.error(`[Frenchstream] Error:`, error);
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
