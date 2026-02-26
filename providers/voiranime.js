/**
 * voiranime - Built from src/voiranime/
 * Generated: 2026-02-26T20:35:27.280Z
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

// src/voiranime/http.js
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "max-age=0",
  "Connection": "keep-alive"
};
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    console.log(`[VoirAnime] Fetching: ${url}`);
    const response = yield fetch(url, __spreadValues({
      headers: __spreadValues(__spreadValues({}, HEADERS), options.headers)
    }, options));
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} for ${url}`);
    }
    return yield response.text();
  });
}

// src/voiranime/extractor.js
var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));

// src/utils/resolvers.js
var HEADERS2 = {
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
function safeFetch(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    let controller, timeout;
    try {
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 1e4);
      const response = yield fetch(url, __spreadProps(__spreadValues({}, options), {
        headers: __spreadValues(__spreadValues({}, HEADERS2), options.headers),
        redirect: "follow",
        signal: controller.signal
      }));
      clearTimeout(timeout);
      if (!response.ok) return null;
      const html = yield response.text();
      return {
        text: () => Promise.resolve(html),
        ok: true,
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
    const packedRegex = new RegExp("eval\\s*\\(\\s*function\\s*\\(\\s*p\\s*,\\s*a\\s*,\\s*c\\s*,\\s*k\\s*,\\s*e\\s*,\\s*d\\s*\\).*?\\}\\s*\\((.*?)\\)\\s*\\)", "gs");
    let result = code;
    let match;
    while ((match = packedRegex.exec(code)) !== null) {
      try {
        const argsStr = match[1];
        const pMatch = argsStr.match(new RegExp("^'(.*?)',\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*'(.*?)'\\.split\\('\\|'\\)", "s"));
        if (!pMatch) continue;
        let p = pMatch[1].replace(/\\'/g, "'");
        let a = parseInt(pMatch[2]);
        let c = parseInt(pMatch[3]);
        let k = pMatch[4].split("|");
        const e = (c2) => (c2 < a ? "" : e(parseInt(c2 / a))) + ((c2 = c2 % a) > 35 ? String.fromCharCode(c2 + 29) : c2.toString(36));
        const dict = {};
        while (c--) dict[e(c)] = k[c] || e(c);
        const unpacked = p.replace(/\b\w+\b/g, (w) => dict[w] || w);
        result = result.replace(match[0], unpacked);
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
      const headers = { "Referer": "https://vidmoly.to/", "Origin": "https://vidmoly.to" };
      let res = yield safeFetch(url, { headers });
      if (!res) return { url };
      let html = yield res.text();
      const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) || html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (jsRedirect && jsRedirect[1] !== url) {
        res = yield safeFetch(jsRedirect[1], { headers });
        if (res) html = yield res.text();
      }
      if (html.includes("eval(function(p,a,c,k,e,d)")) html = unpack(html);
      const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
      if (match) return { url: match[1], headers: { "Referer": "https://vidmoly.to/" } };
    } catch (e) {
    }
    return { url };
  });
}
function resolveUqload(url) {
  return __async(this, null, function* () {
    const normalizedPath = url.replace(/^https?:\/\/[^/]+/, "");
    const domains = ["uqload.co", "uqload.com", "uqload.io", "uqloads.xyz", "uqload.to"];
    const baseRef = "https://uqload.co/";
    for (const domain of domains) {
      try {
        const tryUrl = `https://${domain}${normalizedPath}`;
        const res = yield safeFetch(tryUrl, { headers: { "Referer": baseRef } });
        if (!res) continue;
        const html = yield res.text();
        const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) || html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/) || html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
        if (match) return { url: match[1], headers: { "Referer": baseRef } };
      } catch (e) {
      }
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
      const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (redirect) {
        const res2 = yield safeFetch(redirect[1]);
        if (res2) html = yield res2.text();
      }
      const match = html.match(/'hls'\s*:\s*'([^']+)'/) || html.match(/"hls"\s*:\s*"([^"]+)"/) || html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
      if (match) {
        let videoUrl = match[1] || match[0];
        if (videoUrl.includes("base64")) videoUrl = _atob(videoUrl.split(",")[1] || videoUrl);
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
        const passRes = yield fetch(passUrl, { headers: { "Referer": url } });
        if (passRes.ok) {
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
      const html = yield res.text();
      const match = html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
      if (match) return { url: match[1], headers: { "Referer": url } };
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
    if (urlLower.match(/\.(mp4|m3u8|mkv|webm)(\?.*)?$/) && !urlLower.includes("html")) {
      return __spreadProps(__spreadValues({}, stream), { isDirect: true });
    }
    try {
      let result = null;
      if (urlLower.includes("sibnet.ru")) result = yield resolveSibnet(originalUrl);
      else if (urlLower.includes("vidmoly.")) result = yield resolveVidmoly(originalUrl);
      else if (urlLower.includes("uqload.") || urlLower.includes("oneupload.")) result = yield resolveUqload(originalUrl);
      else if (urlLower.includes("voe.")) result = yield resolveVoe(originalUrl);
      else if (urlLower.includes("streamtape.com") || urlLower.includes("stape")) result = yield resolveStreamtape(originalUrl);
      else if (urlLower.includes("dood") || urlLower.includes("ds2play")) result = yield resolveDood(originalUrl);
      else if (urlLower.includes("moonplayer") || urlLower.includes("moon.")) result = yield resolveMoon(originalUrl);
      else if (urlLower.includes("sendvid.")) result = yield resolveSendvid(originalUrl);
      else if (urlLower.includes("myvi.") || urlLower.includes("mytv.")) result = yield resolveMyTV(originalUrl);
      else if (urlLower.includes("luluvid.") || urlLower.includes("lulu.")) result = yield resolveLuluvid(originalUrl);
      else if (urlLower.includes("hgcloud.") || urlLower.includes("savefiles.")) result = yield resolveHGCloud(originalUrl);
      if (result && result.url !== originalUrl) {
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
            if (extractedUrl.startsWith("http") && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN)) {
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
      if (result && result.url !== originalUrl && result.url.startsWith("http")) {
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

// src/utils/armsync.js
var ARM_API = "https://arm.haglund.dev/api/v2";
var CINEMATA_API = "https://v3-cinemeta.strem.io";
function syncFetch(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8e3);
      const res = yield fetch(url, __spreadProps(__spreadValues({}, options), { signal: controller.signal }));
      clearTimeout(timeout);
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
function safeFetch2(url) {
  return __async(this, null, function* () {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8e3);
      const res = yield fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      return res;
    } catch (e) {
      return null;
    }
  });
}
function getTmdbTitles(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d, _e, _f;
    const type = mediaType === "movie" ? "movie" : "tv";
    const titles = [];
    try {
      const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
      const mainRes = yield safeFetch2(mainUrl);
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
      const transRes = yield safeFetch2(transUrl);
      if (transRes) {
        const transData = yield transRes.json();
        const frTrans = (transData.translations || []).find((t) => t.iso_639_1 === "fr");
        const titleFr = ((_d = (_c = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _c.name) == null ? void 0 : _d.trim()) || ((_f = (_e = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _e.title) == null ? void 0 : _f.trim());
        if (titleFr && !titles.includes(titleFr)) {
          titles.push(titleFr);
        }
      }
    } catch (e) {
      console.error(`[Metadata] TMDB API error: ${e.message}`);
    }
    console.log(`[Metadata] Titles for ${tmdbId}: ${titles.join(" | ")}`);
    return titles;
  });
}

// src/voiranime/extractor.js
var BASE_URL = "https://v6.voiranime.com";
function toSlug(title) {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[':!.,?]/g, "").replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
var SPECIAL_SLUG_RE = /(?:chronicle|ova|oav|gaiden|film|movie|lost-girls|kakusei|zenpen|kouhen|specials?|hors-serie|memories|recap|recaps|compilation)(?:-|$)/i;
function extractBaseSlug(url) {
  const m = url.match(/\/anime\/([^/]+)\//);
  if (!m) return null;
  const slug = m[1];
  if (SPECIAL_SLUG_RE.test(slug)) return null;
  return slug.replace(/-(?:the-final-season|saison-\d+|\d+|vf|vostfr|part-\d+|cour-\d+)(?:-(?:vf|vostfr))?$/i, "").replace(/-+$/, "");
}
function searchAnime(title, season = 1) {
  return __async(this, null, function* () {
    const baseSlug = toSlug(title);
    const baseSlugNoThe = baseSlug.startsWith("the-") ? baseSlug.substring(4) : baseSlug;
    const slugCandidates = [];
    if (season === 1) {
      slugCandidates.push(baseSlug, baseSlugNoThe);
      slugCandidates.push(`${baseSlug}-1`, `${baseSlug}-1-vostfr`, `${baseSlug}-saison-1`);
    } else {
      slugCandidates.push(
        `${baseSlug}-${season}`,
        `${baseSlug}-${season}-vostfr`,
        `${baseSlug}-${season}-vf`,
        `${baseSlug}-saison-${season}`,
        `${baseSlug}-the-final-season`,
        // common S4 alias
        baseSlug,
        baseSlugNoThe
      );
    }
    const slugNoApost = toSlug(title.replace(/'s/gi, ""));
    if (slugNoApost !== baseSlug) slugCandidates.push(slugNoApost);
    const allSlugs = [...new Set(slugCandidates.filter(Boolean))];
    console.log(`[VoirAnime] Probing slugs (S${season}): ${allSlugs.join(", ")}`);
    for (const slug of allSlugs) {
      const url = `${BASE_URL}/anime/${slug}/`;
      try {
        yield fetchText(url, { method: "HEAD" });
        console.log(`[VoirAnime] Predicted slug found: ${slug}`);
        return [{ title, url }];
      } catch (e) {
      }
    }
    try {
      const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
      const html = yield fetchText(searchUrl);
      const $ = import_cheerio_without_node_native.default.load(html);
      const results = [];
      $(".post-title a, .c-image-hover a, h3.h5 a").each((i, el) => {
        const href = $(el).attr("href") || "";
        if (href.includes("/anime/") && !href.includes("/feed/")) {
          results.push({ title: $(el).text().trim(), url: href });
        }
      });
      console.log(`[VoirAnime] Search results: ${results.length}`);
      if (results.length === 0) return [];
      const baseSlugsFromSearch = [...new Set(results.map((r) => extractBaseSlug(r.url)).filter(Boolean))];
      for (const bs of baseSlugsFromSearch) {
        const seasonSlugs = season === 1 ? [bs, `${bs}-1`, `${bs}-1-vostfr`] : [`${bs}-${season}`, `${bs}-${season}-vostfr`, `${bs}-${season}-vf`, `${bs}-saison-${season}`];
        for (const sl of seasonSlugs) {
          const url = `${BASE_URL}/anime/${sl}/`;
          try {
            yield fetchText(url, { method: "HEAD" });
            console.log(`[VoirAnime] Derived slug found: ${sl}`);
            return [{ title, url }];
          } catch (e) {
          }
        }
      }
      const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[':!.,?]/g, "").replace(/\bthe\s+/g, "").replace(/\s+/g, " ").trim();
      const simplifiedTitle = normalize(title);
      const scored = results.map((r) => {
        const u = r.url.toLowerCase();
        let score = 0;
        if (season === 1) {
          const m = u.match(/\/anime\/[^/]+-(?:saison-)?(\d+)(?:-vf|-vostfr)?\//);
          const urlSeason = m ? parseInt(m[1]) : null;
          if (urlSeason && urlSeason > 1) score -= 10;
          else if (!urlSeason) score += 5;
        } else {
          if (u.includes(`-${season}-`) || u.includes(`-${season}/`) || u.includes(`-saison-${season}`)) score += 10;
          else if (u.includes(`-${season}`)) score += 5;
        }
        if (normalize(r.title).includes(simplifiedTitle)) score += 3;
        return __spreadProps(__spreadValues({}, r), { score });
      }).filter((r) => r.score >= 0).sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        console.log(`[VoirAnime] Best search match (score=${scored[0].score}): ${scored[0].url}`);
        return scored;
      }
      return results;
    } catch (e) {
      console.error(`[VoirAnime] Search error: ${e.message}`);
      return [];
    }
  });
}
function extractStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const titles = yield getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];
    let targetEpisodes = [episode];
    try {
      const imdbId = yield getImdbId(tmdbId, mediaType);
      if (imdbId) {
        const absoluteEpisode = yield getAbsoluteEpisode(imdbId, season, episode);
        if (absoluteEpisode && absoluteEpisode !== episode) {
          targetEpisodes.push(absoluteEpisode);
        }
      }
    } catch (e) {
      console.warn(`[VoirAnime] ArmSync failed: ${e.message}`);
    }
    let matches = [];
    for (const title of titles) {
      matches = yield searchAnime(title, season);
      if (matches && matches.length > 0) break;
    }
    if (!matches || matches.length === 0) return [];
    matches = matches.sort((a, b) => {
      const aT = a.title.toLowerCase();
      const bT = b.title.toLowerCase();
      const sMatch = `saison ${season}`;
      const hasA = aT.includes(sMatch);
      const hasB = bT.includes(sMatch);
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      return 0;
    });
    const streams = [];
    const checkedUrls = /* @__PURE__ */ new Set();
    for (const match of matches) {
      if (checkedUrls.has(match.url)) continue;
      checkedUrls.add(match.url);
      const matchLower = match.title.toLowerCase();
      const animeUrl = match.url;
      const lang = match.title.toUpperCase().includes("VF") || animeUrl.includes("-vf") ? "VF" : "VOSTFR";
      const seasonMatch = matchLower.match(/saison\s*(\d+)/);
      if (seasonMatch && parseInt(seasonMatch[1]) !== season && targetEpisodes.length === 1) {
        continue;
      }
      try {
        const html = yield fetchText(animeUrl);
        const $ = import_cheerio_without_node_native.default.load(html);
        const paddings = ["", "0", "00"];
        const epPatterns = [];
        for (const ep of targetEpisodes) {
          const epS = ep.toString();
          paddings.forEach((p) => epPatterns.push(p + epS));
        }
        let episodeUrl = null;
        $(".listing-chapters a, .list-chapter a, .wp-manga-chapter a").each((i, el) => {
          const text = $(el).text().trim();
          const href = $(el).attr("href");
          for (const pattern of epPatterns) {
            const regex = new RegExp(`(?:^|[^0-9])${pattern}(?:$|[^0-9])`, "i");
            if (regex.test(text) || regex.test(href)) {
              episodeUrl = href;
              return false;
            }
          }
        });
        if (!episodeUrl) continue;
        const epRawHtml = yield fetchText(episodeUrl);
        const ep$ = import_cheerio_without_node_native.default.load(epRawHtml);
        const hosts = [];
        ep$('[name="host"] option, .host-select option').each((i, el) => {
          const val = ep$(el).val();
          if (val && val !== "Choisir un lecteur") hosts.push(val);
        });
        if (hosts.length === 0) {
          let iframe = null;
          ep$("iframe").each((_, el) => {
            const src = ep$(el).attr("src") || "";
            if (src.startsWith("http") && !src.includes("voiranime.com")) {
              iframe = src;
              return false;
            }
          });
          if (iframe) {
            const stream = yield resolveStream({
              name: `VoirAnime (${lang})`,
              title: `Default Player - ${lang}`,
              quality: "HD",
              url: iframe,
              headers: { "Referer": BASE_URL }
            });
            if (stream) streams.push(stream);
          }
        } else {
          for (const host of hosts) {
            try {
              const hostUrl = `${episodeUrl}${episodeUrl.includes("?") ? "&" : "?"}host=${encodeURIComponent(host)}`;
              const hostHtml = yield fetchText(hostUrl);
              const iframeMatch = hostHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
              let embedUrl = iframeMatch ? iframeMatch[1] : null;
              if (!embedUrl) {
                const scriptMatch = hostHtml.match(/https?:\/\/[^"'\s<>]+\/(?:embed|e|v|player)\/[^"'\s<>]+/);
                if (scriptMatch && !scriptMatch[0].includes("voiranime.com")) embedUrl = scriptMatch[0];
              }
              if (embedUrl) {
                const stream = yield resolveStream({
                  name: `VoirAnime (${lang})`,
                  title: `${host} - ${lang}`,
                  url: embedUrl,
                  quality: "HD",
                  headers: { "Referer": BASE_URL }
                });
                if (stream) streams.push(stream);
              }
            } catch (err) {
            }
          }
        }
      } catch (e) {
      }
    }
    const validStreams = streams.filter((s) => s && s.isDirect);
    console.log(`[VoirAnime] Total streams found: ${validStreams.length}`);
    return validStreams;
  });
}

// src/voiranime/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.log(`[VoirAnime] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
    try {
      const streams = yield extractStreams(tmdbId, mediaType, season, episode);
      return streams;
    } catch (error) {
      console.error(`[VoirAnime] Error:`, error);
      return [];
    }
  });
}
module.exports = { getStreams };
