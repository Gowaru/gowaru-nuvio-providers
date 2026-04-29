/**
 * movix - Built from src/movix/
 * Generated: 2026-04-29T19:40:24.692Z
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
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
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
};
var _atob = (str) => {
  try {
    if (typeof atob === "function") return atob(str);
    return Buffer.from(str, "base64").toString("binary");
  } catch (e) {
    return str;
  }
};
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
var STRICT_QUALITY_TIERS = [2160, 1080, 720, 480, 360, 240];
var DEFAULT_QUALITY_TIER = 360;
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
function expandSingleStreamQualities(stream) {
  return __async(this, null, function* () {
    var _a, _b, _c;
    if (!stream || !stream.url || typeof stream.url !== "string") return [];
    const url = stream.url;
    const lower = url.toLowerCase();
    if (!lower.includes(".m3u8") && !lower.includes("/hls/")) {
      return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") })];
    }
    const res = yield safeFetch(url, { headers: stream.headers || {} });
    if (!res) {
      return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") })];
    }
    const manifest = yield res.text();
    if (!/#EXT-X-STREAM-INF/i.test(manifest)) {
      return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") })];
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
      variants.push(__spreadProps(__spreadValues({}, stream), {
        url: variantUrl,
        quality: normalizeQualityLabel(quality || stream.quality || "HD"),
        title: appendQualityToTitle(stream.title || stream.name || "Stream", quality || stream.quality || "HD")
      }));
    }
    if (variants.length === 0) {
      return [__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") })];
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
  });
}
function expandStreamQualities(streams) {
  return __async(this, null, function* () {
    const input = Array.isArray(streams) ? streams : [];
    const expanded = [];
    for (const stream of input) {
      try {
        const variants = yield expandSingleStreamQualities(stream);
        for (const variant of variants) {
          expanded.push(variant);
        }
      } catch (e) {
        if (stream) expanded.push(__spreadProps(__spreadValues({}, stream), { quality: normalizeQualityLabel(stream.quality || "HD") }));
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
    deduped.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
    return deduped;
  });
}
function safeFetch(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    let controller, timeout;
    try {
      const canAbort = typeof AbortController !== "undefined";
      controller = canAbort ? new AbortController() : null;
      if (controller) timeout = setTimeout(() => controller.abort(), 1e4);
      const response = yield fetch(url, __spreadProps(__spreadValues({}, options), {
        headers: __spreadValues(__spreadValues({}, HEADERS), options.headers),
        redirect: "follow",
        signal: controller ? controller.signal : void 0
      }));
      if (timeout) clearTimeout(timeout);
      if (!response) return null;
      const status = response.status;
      let bodyText = "";
      try {
        bodyText = yield response.text();
      } catch (e) {
        bodyText = "";
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
      if (timeout) clearTimeout(timeout);
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
    try {
      const fetchUrl = url.replace(/vidmoly\.(net|to|ru|is)/, "vidmoly.me");
      const headers = { "Referer": "https://vidmoly.me/", "Origin": "https://vidmoly.me" };
      let res = yield safeFetch(fetchUrl, { headers });
      if (!res) return { url };
      let html = yield res.text();
      const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) || html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (jsRedirect && jsRedirect[1] !== fetchUrl) {
        res = yield safeFetch(jsRedirect[1], { headers });
        if (res) html = yield res.text();
      }
      if (html.includes("eval(function(p,a,c,k,e,d)")) html = unpack(html);
      const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
      if (match) return { url: match[1], headers: { "Referer": "https://vidmoly.me/" } };
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
    const uniqueDomains = [.../* @__PURE__ */ new Set([originalDomain, "uqload.co", "oneupload.to"])];
    const baseRef = "https://uqload.co/";
    return new Promise((resolve) => {
      let failures = 0;
      let resolved = false;
      const checkDomain = (domain) => __async(null, null, function* () {
        try {
          const tryUrl = `https://${domain}${normalizedPath}`;
          const canAbort = typeof AbortController !== "undefined";
          const controller = canAbort ? new AbortController() : null;
          const timeoutId = controller ? setTimeout(() => controller.abort(), 4e3) : null;
          const res = yield safeFetch(tryUrl, { headers: __spreadProps(__spreadValues({}, HEADERS), { "Referer": baseRef }) });
          if (res) {
            const html = yield res.text();
            const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) || html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/);
            if (match && !resolved) {
              resolved = true;
              resolve({ url: match[1], headers: { "Referer": baseRef } });
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
      const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (redirect) {
        const res2 = yield safeFetch(redirect[1]);
        if (res2) html = yield res2.text();
      }
      const match = html.match(/'hls'\s*:\s*'([^']+)'/) || html.match(/"hls"\s*:\s*"([^"]+)"/) || html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
      if (match) {
        let videoUrl = match[1] || match[0];
        if (videoUrl.includes("base64")) videoUrl = _atob(videoUrl.split(",")[1] || videoUrl);
        if (isKnownFakeDirectUrl(videoUrl)) return { url };
        return { url: videoUrl, headers: { "Referer": url } };
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
function resolveStream(stream, depth = 0) {
  return __async(this, null, function* () {
    var _a;
    if (depth > 3) return __spreadProps(__spreadValues({}, stream), { isDirect: false });
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
      else if (urlLower.includes("voe") || urlLower.includes("charlestoughrace") || urlLower.includes("sandratableother")) result = yield resolveVoe(originalUrl);
      else if (urlLower.includes("streamtape.com") || urlLower.includes("stape")) result = yield resolveStreamtape(originalUrl);
      else if (urlLower.includes("dood") || urlLower.includes("ds2play") || urlLower.includes("bigwar5")) result = yield resolveDood(originalUrl);
      else if (urlLower.includes("moonplayer") || urlLower.includes("filemoon")) result = yield resolveMoon(originalUrl);
      else if (urlLower.includes("sendvid.")) result = yield resolveSendvid(originalUrl);
      else if (urlLower.includes("myvi.") || urlLower.includes("mytv.")) result = yield resolveMyTV(originalUrl);
      else if (urlLower.includes("fsvid.lol") || urlLower.includes("vidzy.live")) result = yield resolvePackedPlayer(originalUrl);
      else if (urlLower.includes("luluvid.") || urlLower.includes("lulustream.") || urlLower.includes("luluvdo.") || urlLower.includes("wishonly.") || urlLower.includes("veev.")) result = yield resolvePackedPlayer(originalUrl);
      else if (urlLower.includes("lulu.")) result = yield resolveLuluvid(originalUrl);
      else if (urlLower.includes("hgcloud.") || urlLower.includes("savefiles.")) result = yield resolveHGCloud(originalUrl);
      if (result && result.url !== originalUrl && !isKnownFakeDirectUrl(result.url)) {
        return __spreadProps(__spreadValues({}, stream), {
          url: result.url,
          headers: __spreadValues(__spreadValues({}, stream.headers), result.headers || {}),
          isDirect: true,
          originalUrl
        });
      }
      if (!result || result.url === originalUrl) {
        const res = yield safeFetch(originalUrl, { headers: stream.headers });
        if (res) {
          let html = yield res.text();
          if (html.includes("p,a,c,k,e,d")) html = unpack(html);
          const m3u8 = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) || html.match(/https?:\/\/[^"']+\.mp4[^"']*/) || html.match(/file\s*:\s*["']([^"']+)["']/);
          if (m3u8) {
            let extractedUrl = m3u8[1] || m3u8[0];
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
                const origin = (_a = originalUrl.match(/^https?:\/\/[^\/]+/)) == null ? void 0 : _a[0];
                if (origin) iframeUrl = origin + iframeUrl;
              }
              if (iframeUrl.startsWith("http") && iframeUrl !== originalUrl) {
                console.log(`[Resolver] Peeling: Found nested iframe -> ${iframeUrl}`);
                return yield resolveStream(__spreadProps(__spreadValues({}, stream), { url: iframeUrl }), depth + 1);
              }
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
var BASE_URL_FORBIDDEN_PATTERN = "googletagmanager";

// src/movix/http.js
var HEADERS2 = {
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
function fetchJson(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    console.log(`[Movix] Fetching: ${url}`);
    try {
      const res = yield safeFetch(url, __spreadValues({ headers: __spreadValues(__spreadValues({}, HEADERS2), options.headers || {}) }, options));
      if (!res || !res.ok) {
        const status = res && typeof res.status === "number" ? res.status : "no-response";
        console.log(`[Movix] HTTP ${status} for ${url}`);
        return null;
      }
      try {
        return yield res.json();
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

// src/utils/metadata.js
var TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var TMDB_API_BASE = "https://api.themoviedb.org/3";
function getTmdbTitles(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d, _e, _f;
    const type = mediaType === "movie" ? "movie" : "tv";
    const titles = [];
    try {
      const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
      const mainRes = yield safeFetch(mainUrl);
      if (mainRes) {
        const data = yield mainRes.json();
        const titleEn = (_a = type === "movie" ? data.title : data.name) == null ? void 0 : _a.trim();
        const titleOriginal = (_b = type === "movie" ? data.original_title : data.original_name) == null ? void 0 : _b.trim();
        if (titleEn) titles.push(titleEn);
        if (titleOriginal && titleOriginal !== titleEn && /^[\x00-\x7F\u00C0-\u024F\s]+$/.test(titleOriginal)) {
          titles.push(titleOriginal);
        }
      }
      const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
      const transRes = yield safeFetch(transUrl);
      if (transRes) {
        const transData = yield transRes.json();
        const frTrans = (transData.translations || []).find((t) => t.iso_639_1 === "fr");
        const titleFr = ((_d = (_c = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _c.name) == null ? void 0 : _d.trim()) || ((_f = (_e = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _e.title) == null ? void 0 : _f.trim());
        if (titleFr && !titles.includes(titleFr)) {
          titles.push(titleFr);
        }
      }
      const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
      const altRes = yield safeFetch(altUrl);
      if (altRes) {
        const altData = yield altRes.json();
        const altList = type === "movie" ? altData.titles : altData.results;
        if (altList && Array.isArray(altList)) {
          const isLatin = (str) => /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()]+$/.test(str);
          altList.forEach((alt) => {
            var _a2;
            const t = (_a2 = alt.title) == null ? void 0 : _a2.trim();
            if (t && !titles.some((existing) => existing.toLowerCase() === t.toLowerCase()) && isLatin(t)) {
              if (alt.type === "Romaji" || alt.iso_3166_1 === "US" || alt.iso_3166_1 === "FR") {
                titles.splice(1, 0, t);
              } else {
                titles.push(t);
              }
            }
          });
        }
      }
    } catch (e) {
      console.error(`[Metadata] TMDB API error: ${e.message}`);
    }
    const uniqueTitles = [...new Set(titles)];
    console.log(`[Metadata] Titles for ${tmdbId}: ${uniqueTitles.join(" | ")}`);
    return uniqueTitles;
  });
}

// src/frenchstream/extractor.js
var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));

// src/frenchstream/http.js
var BASE_URLS = ["https://french-stream.one", "https://fs03.lol"];
var BASE_URL = BASE_URLS[0];
var HEADERS3 = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": `${BASE_URL}/`,
  "Origin": BASE_URL,
  "Connection": "keep-alive"
};
function originFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch (e) {
    return BASE_URL;
  }
}
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    console.log(`[Frenchstream] Fetching: ${url}`);
    const base = options.baseUrl || originFromUrl(url);
    const mergedHeaders = __spreadValues(__spreadProps(__spreadValues({}, HEADERS3), {
      Referer: `${base}/`,
      Origin: base
    }), options.headers || {});
    const _a = options, { baseUrl, headers } = _a, restOptions = __objRest(_a, ["baseUrl", "headers"]);
    const res = yield safeFetch(url, __spreadValues({ headers: mergedHeaders }, restOptions));
    if (!res || !res.ok) {
      const status = res && typeof res.status === "number" ? res.status : "no-response";
      throw new Error(`HTTP error ${status} for ${url}`);
    }
    return yield res.text();
  });
}
function fetchJson2(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const text = yield fetchText(url, options);
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error(`[Frenchstream] Failed to parse JSON for ${url}`);
      throw e;
    }
  });
}

// src/frenchstream/extractor.js
var SEARCH_STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "des",
  "les",
  "une",
  "dans",
  "sur",
  "via",
  "de",
  "du",
  "la",
  "le"
]);
var MIN_MATCH_SCORE = 40;
var FSTREAM_API_BASE = "https://api.movix.cash";
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
  var _a, _b;
  const modalId = (_a = (onclick || "").match(/openModal\('(\d+)'\)/i)) == null ? void 0 : _a[1];
  if (modalId) return modalId;
  return ((_b = (href || "").match(/^\/(\d+)-/)) == null ? void 0 : _b[1]) || null;
}
function isSeriesCard($card, href, title) {
  if ($card.find(".mli-eps").length > 0) return true;
  const text = `${href || ""} ${title || ""}`.toLowerCase();
  return text.includes("saison") || text.includes("series") || text.includes("/s-tv/");
}
function normalizeHref(href, baseUrl) {
  if (!href || typeof href !== "string") return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${baseUrl}${trimmed}`;
  return `${baseUrl}/${trimmed.replace(/^\/+/, "")}`;
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
    cards.push({
      newsId,
      href: `${baseUrl}${href}`,
      title,
      isSeries: isSeriesCard($card, href, title),
      baseUrl
    });
  });
  return cards;
}
function buildTitleQueries(titles) {
  const queries = [];
  const push = (value) => {
    if (typeof value !== "string") return;
    const v = value.trim();
    if (!v) return;
    if (!queries.some((q) => q.toLowerCase() === v.toLowerCase())) queries.push(v);
  };
  for (const title of (titles || []).slice(0, 8)) {
    push(title);
    push(title.replace(/['’]/g, " "));
    push(title.replace(/\s*\([^)]*\)\s*/g, " "));
    const beforeColon = title.split(":")[0];
    if (beforeColon && beforeColon.length >= 3) push(beforeColon);
  }
  return queries.slice(0, 10);
}
function scoreCard(card, queryTitle, mediaType, season) {
  const q = normalize(queryTitle);
  const t = normalize(card.title);
  const hrefN = normalize(card.href || "");
  const hay = `${t} ${hrefN}`.trim();
  if (!q || !t) return 0;
  let score = 0;
  if (t === q) score += 120;
  if (hay.includes(q)) score += 70;
  if (q.includes(t)) score += 40;
  const qWords = new Set(q.split(" ").filter((w) => w && w.length > 2 && !SEARCH_STOPWORDS.has(w)));
  const tWords = new Set(hay.split(" ").filter(Boolean));
  let common = 0;
  for (const w of qWords) {
    if (tWords.has(w)) common += 1;
  }
  score += common * 8;
  if (mediaType === "movie" && card.isSeries) score -= 50;
  if (mediaType === "tv" && !card.isSeries) score -= 30;
  const seasonNum = Number(season) || 1;
  const text = `${card.title} ${card.href}`.toLowerCase();
  const hasSeasonMention = /saison\s*\d+|s-tv\//i.test(text);
  if (mediaType === "tv") {
    if (seasonNum > 1) {
      const seasonRegex = new RegExp(`saison\\s*${seasonNum}|[-_/]${seasonNum}(?:[^0-9]|$)`, "i");
      if (seasonRegex.test(text)) score += 20;
      if (hasSeasonMention && !seasonRegex.test(text)) score -= 25;
    } else if (seasonNum === 1 && /saison\s*[2-9]/i.test(text)) {
      score -= 25;
    }
  }
  return score;
}
function searchByTitle(title, mediaType, season) {
  return __async(this, null, function* () {
    const allCards = [];
    for (const baseUrl of BASE_URLS) {
      try {
        const url = `${baseUrl}/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;
        const html = yield fetchText(url, { baseUrl });
        const cards = parseSearchCards(html, baseUrl);
        allCards.push(...cards);
      } catch (e) {
        console.warn(`[Frenchstream] Search failed on ${baseUrl} for "${title}": ${e.message}`);
      }
    }
    const filtered = allCards.filter((card) => mediaType === "tv" ? card.isSeries : !card.isSeries);
    if (filtered.length === 0) return [];
    return filtered.map((card) => __spreadProps(__spreadValues({}, card), {
      _score: scoreCard(card, title, mediaType, season),
      _matchedTitle: title
    })).sort((a, b) => b._score - a._score).slice(0, 8);
  });
}
function hostLabel(hostKey) {
  const k = (hostKey || "").toLowerCase();
  if (k === "premium") return "FSVID";
  if (k === "vidzy") return "VIDZY";
  if (k === "uqload") return "UQLOAD";
  if (k === "dood") return "DOOD";
  if (k === "voe") return "VOE";
  if (k === "filmoon") return "FILEMOON";
  if (k === "netu") return "NETU";
  return hostKey ? hostKey.toUpperCase() : "PLAYER";
}
function languageLabel(languageKey) {
  const k = (languageKey || "").toLowerCase();
  if (k === "vf" || k === "default" || k === "vfq") return "VF";
  if (k === "vostfr") return "VOSTFR";
  if (k === "vo") return "VO";
  return languageKey ? languageKey.toUpperCase() : "VF";
}
function toStream(name, host, language, url) {
  const origin = getOrigin(url);
  return {
    name,
    title: `[${languageLabel(language)}] ${hostLabel(host)}`,
    url,
    quality: "HD",
    headers: {
      Referer: `${origin}/`,
      Origin: origin,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
    }
  };
}
function collectMovieCandidates(apiData) {
  const players = apiData == null ? void 0 : apiData.players;
  if (!players || typeof players !== "object") return [];
  const streams = [];
  for (const [host, versions] of Object.entries(players)) {
    if (!versions || typeof versions !== "object") continue;
    for (const [language, value] of Object.entries(versions)) {
      if (typeof value !== "string" || !value.startsWith("http")) continue;
      streams.push(toStream("Frenchstream", host, language, value));
    }
  }
  return streams;
}
function collectEpisodeCandidates(apiData, episode) {
  const episodeNum = Number(episode) || 1;
  const streams = [];
  for (const language of ["vf", "vostfr", "vo"]) {
    const byEpisode = apiData == null ? void 0 : apiData[language];
    if (!byEpisode || typeof byEpisode !== "object") continue;
    const episodeKey = Object.keys(byEpisode).find((k) => Number(k) === episodeNum) || String(episodeNum);
    const hosts = byEpisode == null ? void 0 : byEpisode[episodeKey];
    if (!hosts || typeof hosts !== "object") continue;
    for (const [host, value] of Object.entries(hosts)) {
      if (typeof value !== "string" || !value.startsWith("http")) continue;
      streams.push(toStream("Frenchstream", host, language, value));
    }
  }
  return streams;
}
function dedupeByUrl(streams) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const stream of streams) {
    if (!(stream == null ? void 0 : stream.url) || seen.has(stream.url)) continue;
    seen.add(stream.url);
    out.push(stream);
  }
  return out;
}
function collectFstreamApiMovieCandidates(apiData) {
  const players = apiData == null ? void 0 : apiData.players;
  if (!players || typeof players !== "object") return [];
  const streams = [];
  for (const [lang, list] of Object.entries(players)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof (item == null ? void 0 : item.url) !== "string" || !item.url.startsWith("http")) continue;
      streams.push(toStream("Frenchstream", (item == null ? void 0 : item.player) || "player", lang, item.url));
    }
  }
  return streams;
}
function collectFstreamApiTvCandidates(apiData, episode) {
  var _a, _b;
  const episodeNum = Number(episode) || 1;
  const ep = ((_a = apiData == null ? void 0 : apiData.episodes) == null ? void 0 : _a[String(episodeNum)]) || ((_b = apiData == null ? void 0 : apiData.episodes) == null ? void 0 : _b[episodeNum]);
  const langs = ep == null ? void 0 : ep.languages;
  if (!langs || typeof langs !== "object") return [];
  const streams = [];
  for (const [lang, list] of Object.entries(langs)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof (item == null ? void 0 : item.url) !== "string" || !item.url.startsWith("http")) continue;
      streams.push(toStream("Frenchstream", (item == null ? void 0 : item.player) || "player", lang, item.url));
    }
  }
  return streams;
}
function fetchFstreamApiFallback(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const url = mediaType === "movie" ? `${FSTREAM_API_BASE}/api/fstream/movie/${tmdbId}` : `${FSTREAM_API_BASE}/api/fstream/tv/${tmdbId}/season/${Number(season) || 1}`;
      const data = yield fetchJson2(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://movix.cash/",
          Origin: "https://movix.cash"
        }
      });
      if (!data || data.success === false) return [];
      return mediaType === "movie" ? collectFstreamApiMovieCandidates(data) : collectFstreamApiTvCandidates(data, episode);
    } catch (e) {
      console.warn(`[Frenchstream] FStream API fallback failed: ${e.message}`);
      return [];
    }
  });
}
function resolveCandidates(candidates) {
  return __async(this, null, function* () {
    const resolved = yield Promise.allSettled(candidates.map((stream) => resolveStream(stream)));
    const direct = [];
    for (const result of resolved) {
      if (result.status !== "fulfilled") continue;
      const stream = result.value;
      if (!(stream == null ? void 0 : stream.url)) continue;
      if (stream.isDirect) direct.push(stream);
    }
    const uniqueDirect = dedupeByUrl(direct);
    return uniqueDirect;
  });
}
function extractStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const titles = yield getTmdbTitles(tmdbId, mediaType);
    if (!titles || titles.length === 0) return [];
    const searchTitles = buildTitleQueries(titles);
    let match = null;
    let bestScore = -Infinity;
    for (const title of searchTitles) {
      try {
        const ranked = yield searchByTitle(title, mediaType, season);
        if (ranked.length > 0 && ranked[0]._score > bestScore) {
          bestScore = ranked[0]._score;
          match = ranked[0];
        }
      } catch (e) {
        console.warn(`[Frenchstream] Search failed for "${title}": ${e.message}`);
      }
    }
    if (!match || bestScore < MIN_MATCH_SCORE) {
      console.warn(`[Frenchstream] No confident web match for tmdb=${tmdbId} (bestScore=${bestScore}), trying API fallback`);
      const fallbackCandidates = yield fetchFstreamApiFallback(tmdbId, mediaType, season, episode);
      if (fallbackCandidates.length === 0) return [];
      const fallbackStreams = yield resolveCandidates(fallbackCandidates);
      console.log(`[Frenchstream] API fallback candidates: ${fallbackCandidates.length}, returned: ${fallbackStreams.length}`);
      return fallbackStreams;
    }
    console.log(`[Frenchstream] Match: ${match.title} (${match.newsId}) score=${bestScore} via="${match._matchedTitle}"`);
    const sourceBase = match.baseUrl || BASE_URL;
    const candidates = mediaType === "movie" ? collectMovieCandidates(yield fetchJson2(`${sourceBase}/engine/ajax/film_api.php?id=${match.newsId}`, { baseUrl: sourceBase })) : collectEpisodeCandidates(yield fetchJson2(`${sourceBase}/ep-data.php?id=${match.newsId}`, { baseUrl: sourceBase }), episode);
    if (candidates.length === 0) return [];
    const streams = yield resolveCandidates(candidates);
    console.log(`[Frenchstream] Candidates: ${candidates.length}, Returned: ${streams.length}`);
    return streams;
  });
}

// src/movix/extractor.js
var API_BASE = "https://api.movix.cash";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
var RETRY_DELAYS_MS = [0, 1400, 2600];
function normalize2(text) {
  return (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function originFromUrl2(url) {
  try {
    return new URL(url).origin;
  } catch (e) {
    return "https://movix.cash";
  }
}
function directHeadersFor(url, headers = {}) {
  const origin = originFromUrl2(url);
  const referer = headers.Referer || headers.referer;
  const out = __spreadValues({}, headers);
  if (!referer || referer.includes("movix.cash")) {
    out.Referer = `${origin}/`;
  }
  if (!out.Origin || String(out.Origin).includes("movix.cash")) {
    out.Origin = origin;
  }
  if (!out["User-Agent"] && !out["user-agent"]) {
    out["User-Agent"] = USER_AGENT;
  }
  return out;
}
function validateDirectUrl(_0) {
  return __async(this, arguments, function* (url, headers = {}) {
    try {
      const res = yield safeFetch(url, {
        method: "GET",
        headers: __spreadProps(__spreadValues({}, directHeadersFor(url, headers)), {
          Range: "bytes=0-0"
        }),
        redirect: "follow"
      });
      if (!res) return false;
      return res.status === 206 || typeof res.status === "number" && res.status >= 200 && res.status < 300;
    } catch (e) {
      return false;
    }
  });
}
function titleMatchesAny(candidateTitles, tmdbTitles) {
  if (!Array.isArray(candidateTitles) || candidateTitles.length === 0) return true;
  if (!Array.isArray(tmdbTitles) || tmdbTitles.length === 0) return true;
  const cand = candidateTitles.map(normalize2).filter(Boolean);
  const ref = tmdbTitles.map(normalize2).filter(Boolean);
  return cand.some((c) => ref.some((t) => c === t || c.includes(t) || t.includes(c)));
}
function extractSourceTitles(data) {
  var _a, _b, _c, _d, _e, _f, _g;
  const titles = [];
  const push = (value) => {
    if (typeof value !== "string") return;
    const v = value.trim();
    if (v) titles.push(v);
  };
  push(data == null ? void 0 : data.title);
  push(data == null ? void 0 : data.original_title);
  push(data == null ? void 0 : data.name_no_lang);
  push((_a = data == null ? void 0 : data.tmdb) == null ? void 0 : _a.title);
  push((_b = data == null ? void 0 : data.tmdb) == null ? void 0 : _b.original_title);
  push((_c = data == null ? void 0 : data.tmdb) == null ? void 0 : _c.name_no_lang);
  push((_e = (_d = data == null ? void 0 : data.search) == null ? void 0 : _d.bestMatch) == null ? void 0 : _e.title);
  push((_g = (_f = data == null ? void 0 : data.search) == null ? void 0 : _f.bestMatch) == null ? void 0 : _g.originalTitle);
  return [...new Set(titles)];
}
function normalizeLangTag(lang) {
  const l = (lang || "").toLowerCase();
  if (l === "vff" || l === "vfq" || l === "vf" || l.includes("french")) return "VF";
  if (l === "vostfr" || l === "vost" || l.includes("vostfr")) return "VOSTFR";
  if (l === "default" || l === "multi") return "MULTI";
  return (lang || "VF").toUpperCase();
}
function pushStream(streams, provider, server, lang, url, quality) {
  if (!url || typeof url !== "string") return;
  streams.push({
    name: "Movix",
    title: `[${normalizeLangTag(lang)}] ${provider} - ${server || "Player"}`,
    server: `${provider} - ${server || "Player"}`,
    url,
    quality: quality || "HD",
    headers: {
      Origin: originFromUrl2(url),
      Referer: `${originFromUrl2(url)}/`,
      "User-Agent": USER_AGENT
    }
  });
}
function isExoPlayableUrl(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();
  if (u.includes("test-videos.co.uk") || u.includes("sample-videos.com") || u.includes("big_buck_bunny")) {
    return false;
  }
  if (u.includes("/embed") || u.includes("/e/") || u.includes("iframe") || u.includes("index.php")) {
    return false;
  }
  if (u.includes(".m3u8") || u.includes(".mp4") || u.includes(".mkv") || u.includes(".webm") || u.includes(".ts")) {
    return true;
  }
  if (u.includes("manifest") || u.includes("playlist") || u.includes("/hls/")) {
    return true;
  }
  return false;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function fetchWithRetry(job) {
  return __async(this, null, function* () {
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay > 0) yield sleep(delay);
      const data = yield fetchJson(job.url);
      if (!data) continue;
      const pending = data.pending === true || /reessayez|reessay/i.test(String(data.message || ""));
      if (pending && attempt < RETRY_DELAYS_MS.length - 1) {
        console.log(`[Movix] ${job.label} pending (attempt ${attempt + 1}), retrying...`);
        continue;
      }
      return data;
    }
    return null;
  });
}
function resolveForExo(stream) {
  return __async(this, null, function* () {
    let resolved = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        resolved = yield Promise.race([
          resolveStream(stream),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5e3))
        ]);
        break;
      } catch (e) {
        if (attempt === 2) {
          if (isExoPlayableUrl(stream.url)) {
            resolved = __spreadProps(__spreadValues({}, stream), { isDirect: true });
          } else {
            return null;
          }
        }
      }
    }
    if (!resolved || !resolved.url) return null;
    if (!resolved.isDirect) return null;
    const normalizedHeaders = directHeadersFor(resolved.url, resolved.headers || stream.headers);
    if (!(yield validateDirectUrl(resolved.url, normalizedHeaders))) return null;
    if (!isExoPlayableUrl(resolved.url)) return null;
    return __spreadProps(__spreadValues({}, resolved), {
      headers: normalizedHeaders
    });
  });
}
function collectFstreamMovie(streams, data) {
  const players = data == null ? void 0 : data.players;
  if (!players || typeof players !== "object") return;
  for (const lang of Object.keys(players)) {
    const list = players[lang];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      pushStream(streams, "FStream", item == null ? void 0 : item.player, lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
    }
  }
}
function collectFstreamTv(streams, data, episode) {
  var _a, _b;
  const ep = ((_a = data == null ? void 0 : data.episodes) == null ? void 0 : _a[String(episode)]) || ((_b = data == null ? void 0 : data.episodes) == null ? void 0 : _b[episode]);
  const langs = ep == null ? void 0 : ep.languages;
  if (!langs || typeof langs !== "object") return;
  for (const lang of Object.keys(langs)) {
    const list = langs[lang];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      pushStream(streams, "FStream", item == null ? void 0 : item.player, lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
    }
  }
}
function collectWiflixMovie(streams, data) {
  const links = data == null ? void 0 : data.links;
  if (!links || typeof links !== "object") return;
  for (const lang of Object.keys(links)) {
    const list = links[lang];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      pushStream(streams, "Wiflix", (item == null ? void 0 : item.name) || (item == null ? void 0 : item.player), lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
    }
  }
}
function collectWiflixTv(streams, data, episode) {
  var _a, _b;
  const ep = ((_a = data == null ? void 0 : data.episodes) == null ? void 0 : _a[String(episode)]) || ((_b = data == null ? void 0 : data.episodes) == null ? void 0 : _b[episode]);
  if (!ep || typeof ep !== "object") return;
  for (const lang of Object.keys(ep)) {
    const list = ep[lang];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      pushStream(streams, "Wiflix", (item == null ? void 0 : item.name) || (item == null ? void 0 : item.player), lang, item == null ? void 0 : item.url, item == null ? void 0 : item.quality);
    }
  }
}
function collectCpasmal(streams, data) {
  const links = data == null ? void 0 : data.links;
  if (!links || typeof links !== "object") return;
  for (const lang of Object.keys(links)) {
    const list = links[lang];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      pushStream(streams, "Cpasmal", (item == null ? void 0 : item.server) || (item == null ? void 0 : item.name), lang, item == null ? void 0 : item.url, (item == null ? void 0 : item.quality) || "HD");
    }
  }
}
function extractStreams2(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var _a;
    const streams = [];
    if (!tmdbId) {
      console.log("[Movix] Missing tmdbId");
      return streams;
    }
    const isMovie = mediaType === "movie";
    const seasonNum = Number(season) || 1;
    const episodeNum = Number(episode) || 1;
    let tmdbTitles = [];
    try {
      tmdbTitles = yield getTmdbTitles(tmdbId, mediaType);
    } catch (e) {
      console.log(`[Movix] Failed to load TMDB titles for ${tmdbId}: ${e.message}`);
    }
    const jobs = isMovie ? [
      {
        label: "fstream-movie",
        url: `${API_BASE}/api/fstream/movie/${tmdbId}`,
        collect: (data) => collectFstreamMovie(streams, data)
      },
      {
        label: "wiflix-movie",
        url: `${API_BASE}/api/wiflix/movie/${tmdbId}`,
        collect: (data) => collectWiflixMovie(streams, data)
      },
      {
        label: "cpasmal-movie",
        url: `${API_BASE}/api/cpasmal/movie/${tmdbId}`,
        collect: (data) => collectCpasmal(streams, data)
      }
    ] : [
      {
        label: "fstream-tv",
        url: `${API_BASE}/api/fstream/tv/${tmdbId}/season/${seasonNum}`,
        collect: (data) => collectFstreamTv(streams, data, episodeNum)
      },
      {
        label: "wiflix-tv",
        url: `${API_BASE}/api/wiflix/tv/${tmdbId}/${seasonNum}`,
        collect: (data) => collectWiflixTv(streams, data, episodeNum)
      },
      {
        label: "cpasmal-tv",
        url: `${API_BASE}/api/cpasmal/tv/${tmdbId}/${seasonNum}/${episodeNum}`,
        collect: (data) => collectCpasmal(streams, data)
      }
    ];
    const results = yield Promise.allSettled(
      jobs.map((job) => __async(null, null, function* () {
        const data = yield fetchWithRetry(job);
        if (!data) return;
        if (data.success === false) {
          console.log(`[Movix] ${job.label} unavailable: ${data.error || "unknown error"}`);
          return;
        }
        const sourceTitles = extractSourceTitles(data);
        if (!titleMatchesAny(sourceTitles, tmdbTitles)) {
          console.log(`[Movix] ${job.label} skipped: source title mismatch (${sourceTitles.join(" | ") || "no title"})`);
          return;
        }
        job.collect(data);
      }))
    );
    for (const r of results) {
      if (r.status === "rejected") {
        console.log(`[Movix] source fetch failed: ${((_a = r.reason) == null ? void 0 : _a.message) || r.reason}`);
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const s of streams) {
      if (!seen.has(s.url)) {
        seen.add(s.url);
        unique.push(s);
      }
    }
    const resolvedResults = yield Promise.allSettled(unique.map((s) => resolveForExo(s)));
    const playable = [];
    const seenPlayable = /* @__PURE__ */ new Set();
    for (const r of resolvedResults) {
      if (r.status !== "fulfilled" || !r.value) continue;
      if (seenPlayable.has(r.value.url)) continue;
      seenPlayable.add(r.value.url);
      playable.push(r.value);
    }
    if (playable.length === 0) {
      try {
        console.log("[Movix] No playable stream from Movix API, trying Frenchstream fallback...");
        const fallback = yield extractStreams(tmdbId, mediaType, seasonNum, episodeNum);
        if (Array.isArray(fallback) && fallback.length > 0) {
          for (const stream of fallback) {
            if (!(stream == null ? void 0 : stream.url)) continue;
            if (seenPlayable.has(stream.url)) continue;
            if (!isExoPlayableUrl(stream.url)) continue;
            seenPlayable.add(stream.url);
            playable.push(stream);
          }
        }
      } catch (e) {
        console.log(`[Movix] Frenchstream fallback failed: ${e.message}`);
      }
    }
    console.log(`[Movix] Total streams found: ${unique.length}, Exo-playable: ${playable.length}`);
    return playable;
  });
}

// src/movix/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log(`[Movix] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
      const streams = yield extractStreams2(tmdbId, mediaType, season, episode);
      const expanded = yield expandStreamQualities(streams);
      console.log(`[Movix] Found ${expanded.length} streams`);
      return expanded;
    } catch (error) {
      console.error(`[Movix] Error: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
