/**
 * anime-sama - Built from src/anime-sama/
 * Generated: 2026-04-29T20:04:10.130Z
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

// src/anime-sama/http.js
var HEADERS2 = {
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
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    console.log(`[Anime-Sama] Fetching: ${url}`);
    const res = yield safeFetch(url, __spreadValues({ headers: __spreadValues(__spreadValues({}, HEADERS2), options.headers || {}) }, options));
    if (!res || !res.ok) {
      const status = res && typeof res.status === "number" ? res.status : "no-response";
      throw new Error(`HTTP error ${status} for ${url}`);
    }
    return yield res.text();
  });
}

// src/anime-sama/extractor.js
var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));

// src/utils/armsync.js
var ARM_API = "https://arm.haglund.dev/api/v2";
var CINEMATA_API = "https://v3-cinemeta.strem.io";
function syncFetch(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const res = yield safeFetch(url, options);
      return res;
    } catch (e) {
      console.error(`[ArmSync] Fetch failed: ${url}`, e.message);
      return null;
    }
  });
}
function getImdbId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    if (!tmdbId) return null;
    const armRes = yield syncFetch(`${ARM_API}/themoviedb?id=${tmdbId}`);
    if (armRes) {
      try {
        const data = yield armRes.json();
        const entry = Array.isArray(data) ? data[0] : data;
        if (entry && entry.imdb) return entry.imdb;
      } catch (e) {
      }
    }
    const tmdbUrl = `https://www.themoviedb.org/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`;
    const tmdbRes = yield syncFetch(tmdbUrl);
    if (tmdbRes) {
      const html = yield tmdbRes.text();
      const imdbMatch = html.match(/imdb\.com\/title\/(tt\d+)/);
      if (imdbMatch) return imdbMatch[1];
    }
    return null;
  });
}
function getAbsoluteEpisode(imdbId, season, episode) {
  return __async(this, null, function* () {
    var _a;
    if (!imdbId || season === 0) return null;
    const res = yield syncFetch(`${CINEMATA_API}/meta/series/${imdbId}.json`);
    if (!res) return null;
    const data = yield res.json();
    if (!((_a = data == null ? void 0 : data.meta) == null ? void 0 : _a.videos)) return null;
    const episodes = data.meta.videos.filter((v) => v.season > 0 && v.episode > 0).sort((a, b) => a.season - b.season || a.episode - b.episode);
    const uniqueEpisodes = [];
    const seen = /* @__PURE__ */ new Set();
    for (const ep of episodes) {
      const key = `${ep.season}-${ep.episode}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEpisodes.push(ep);
      }
    }
    const index = uniqueEpisodes.findIndex((v) => v.season == season && v.episode == episode);
    if (index !== -1) {
      const absoluteNumber = index + 1;
      console.log(`[ArmSync] Resolved: S${season}E${episode} -> Absolute ${absoluteNumber}`);
      return absoluteNumber;
    }
    return null;
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

// src/anime-sama/extractor.js
var BASE_URL = "https://anime-sama.to";
function searchSlugs(title) {
  return __async(this, null, function* () {
    try {
      const html = yield fetchText(`${BASE_URL}/template-php/defaut/fetch.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": BASE_URL
        },
        body: `query=${encodeURIComponent(title)}`
      });
      const $ = import_cheerio_without_node_native.default.load(html);
      const slugs = [];
      $('a[href*="/catalogue/"]').each((i, el) => {
        const h = $(el).attr("href");
        const match = h.match(/\/catalogue\/([^/]+)\/?/);
        if (match && !slugs.includes(match[1])) {
          slugs.push(match[1]);
        }
      });
      return slugs;
    } catch (e) {
      return [];
    }
  });
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
function extractStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var _a, _b;
    const titles = yield getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];
    const title = titles[0];
    let absoluteEpisode = episode;
    try {
      const imdbId = yield getImdbId(tmdbId, mediaType);
      if (imdbId) {
        const resolved = yield getAbsoluteEpisode(imdbId, season, episode);
        if (resolved) absoluteEpisode = resolved;
      }
    } catch (e) {
    }
    const slug = toSlug(title);
    const languages = ["vostfr", "vf"];
    const streams = [];
    const promises = [];
    for (const lang of languages) {
      const paths = [
        `${BASE_URL}/catalogue/${slug}/saison${season}/${lang}/episodes.js`,
        `${BASE_URL}/catalogue/${slug}/${lang}/episodes.js`
      ];
      if (season > 1 && absoluteEpisode) paths.push(`${BASE_URL}/catalogue/${slug}/saison1/${lang}/episodes.js`);
      for (const jsUrl of paths) {
        try {
          const jsContent = yield fetchText(jsUrl);
          const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm;
          let match;
          while ((match = varRegex.exec(jsContent)) !== null) {
            const varName = match[1];
            const urls = ((_a = match[2].match(/['"]([^'"]+)['"]/g)) == null ? void 0 : _a.map((u) => u.slice(1, -1))) || [];
            let playerUrl = null;
            if (jsUrl.includes(`saison${season}`)) {
              playerUrl = urls[episode - 1];
            } else if (jsUrl.includes("saison1") || !jsUrl.includes("saison")) {
              if (season > 1 && absoluteEpisode !== episode) {
                playerUrl = urls[absoluteEpisode - 1];
              } else {
                playerUrl = urls[episode - 1];
              }
            }
            if (playerUrl && playerUrl.startsWith("http")) {
              const promise = resolveStream({
                name: `Anime-Sama (${lang.toUpperCase()})`,
                title: `${getPlayerName(varName, playerUrl)} - Ep ${episode} - ${lang.toUpperCase()}`,
                url: playerUrl,
                quality: "HD",
                headers: { "Referer": BASE_URL }
              });
              promises.push(promise);
            }
          }
        } catch (e) {
        }
      }
    }
    const resolvedFirstBatch = yield Promise.all(promises);
    streams.push(...resolvedFirstBatch.filter((s) => s != null));
    if (streams.length === 0) {
      const foundSlugs = [];
      for (const t of titles) {
        const slugs = yield searchSlugs(t);
        slugs.forEach((s) => {
          if (!foundSlugs.includes(s)) foundSlugs.push(s);
        });
      }
      const checkedSlugs = /* @__PURE__ */ new Set([slug]);
      const fallbackPromises = [];
      for (const fSlug of foundSlugs) {
        if (checkedSlugs.has(fSlug)) continue;
        checkedSlugs.add(fSlug);
        for (const lang of languages) {
          const retryPaths = [
            `${BASE_URL}/catalogue/${fSlug}/saison${season}/${lang}/episodes.js`,
            `${BASE_URL}/catalogue/${fSlug}/${lang}/episodes.js`
          ];
          if (season > 1 && absoluteEpisode) retryPaths.push(`${BASE_URL}/catalogue/${fSlug}/saison1/${lang}/episodes.js`);
          for (const jsUrl of retryPaths) {
            try {
              const jsContent = yield fetchText(jsUrl);
              const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm;
              let match;
              while ((match = varRegex.exec(jsContent)) !== null) {
                const varName = match[1];
                const urls = ((_b = match[2].match(/['"]([^'"]+)['"]/g)) == null ? void 0 : _b.map((u) => u.slice(1, -1))) || [];
                let playerUrl = null;
                if (jsUrl.includes(`saison${season}`)) {
                  playerUrl = urls[episode - 1];
                } else if (jsUrl.includes("saison1") || !jsUrl.includes("saison")) {
                  if (season > 1 && absoluteEpisode !== episode) {
                    playerUrl = urls[absoluteEpisode - 1];
                  } else {
                    playerUrl = urls[episode - 1];
                  }
                }
                if (playerUrl && playerUrl.startsWith("http")) {
                  const promise = resolveStream({
                    name: `Anime-Sama (${lang.toUpperCase()})`,
                    title: `${getPlayerName(varName, playerUrl)} - Ep ${episode} - ${lang.toUpperCase()}`,
                    url: playerUrl,
                    quality: "HD",
                    headers: { "Referer": BASE_URL }
                  });
                  fallbackPromises.push(promise);
                }
              }
            } catch (e) {
            }
          }
        }
      }
      const resolvedFallbacks = yield Promise.all(fallbackPromises);
      streams.push(...resolvedFallbacks.filter((s) => s != null));
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
  });
}

// src/anime-sama/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log(`[Anime-Sama] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
      const streams = yield extractStreams(tmdbId, mediaType, season, episode);
      return yield expandStreamQualities(streams);
    } catch (error) {
      console.error(`[Anime-Sama] Error: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
