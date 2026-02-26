/**
 * anime-sama - Built from src/anime-sama/
 * Generated: 2026-02-26T19:53:05.231Z
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

// src/anime-sama/http.js
var HEADERS = {
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
    const response = yield fetch(url, __spreadValues({
      headers: __spreadValues(__spreadValues({}, HEADERS), options.headers)
    }, options));
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} for ${url}`);
    }
    return yield response.text();
  });
}

// src/anime-sama/extractor.js
var cheerio = __toESM(require("cheerio-without-node-native"));

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

// src/anime-sama/extractor.js
var BASE_URL = "https://anime-sama.tv";
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
      const $ = cheerio.load(html);
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
              const stream = yield resolveStream({
                name: `Anime-Sama (${lang.toUpperCase()})`,
                title: `${getPlayerName(varName, playerUrl)} - Ep ${episode}`,
                url: playerUrl,
                quality: "HD",
                headers: { "Referer": BASE_URL }
              });
              streams.push(stream);
            }
          }
        } catch (e) {
        }
      }
    }
    if (streams.length === 0) {
      const foundSlugs = [];
      for (const t of titles) {
        const slugs = yield searchSlugs(t);
        slugs.forEach((s) => {
          if (!foundSlugs.includes(s)) foundSlugs.push(s);
        });
      }
      const checkedSlugs = /* @__PURE__ */ new Set([slug]);
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
                  const stream = yield resolveStream({
                    name: `Anime-Sama (${lang.toUpperCase()})`,
                    title: `${getPlayerName(varName, playerUrl)} - Ep ${episode}`,
                    url: playerUrl,
                    quality: "HD",
                    headers: { "Referer": BASE_URL }
                  });
                  if (stream) streams.push(stream);
                }
              }
            } catch (e) {
            }
          }
        }
      }
    }
    const validStreams = streams.filter((s) => s && s.isDirect);
    console.log(`[Anime-Sama] Total streams found: ${validStreams.length}`);
    return validStreams;
  });
}

// src/anime-sama/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log(`[Anime-Sama] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
      const streams = yield extractStreams(tmdbId, mediaType, season, episode);
      return streams;
    } catch (error) {
      console.error(`[Anime-Sama] Error: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
