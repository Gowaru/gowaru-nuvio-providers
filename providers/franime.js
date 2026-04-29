/**
 * franime - Built from src/franime/
 * Generated: 2026-04-29T19:40:24.657Z
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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

// src/franime/index.js
var index_exports = {};
__export(index_exports, {
  getStreams: () => getStreams
});
module.exports = __toCommonJS(index_exports);

// src/utils/resolvers.js
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
};
function isKnownFakeDirectUrl(url) {
  if (!url || typeof url !== "string") return true;
  const u = url.toLowerCase();
  return u.includes("test-videos.co.uk") || u.includes("big_buck_bunny") || u.includes("bigbuckbunny") || u.includes("sample-videos.com") || u.includes("example.com") || u.includes("localhost");
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

// src/franime/extractor.js
var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));
function extractStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.warn(`[FRAnime] Provider is currently disabled due to aggressive Cloudflare protection and API changes.`);
    return [];
  });
}

// src/franime/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.log(`[FRAnime] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
    try {
      const streams = yield extractStreams(tmdbId, mediaType, season, episode);
      return yield expandStreamQualities(streams);
    } catch (error) {
      console.error(`[FRAnime] Error:`, error);
      return [];
    }
  });
}
