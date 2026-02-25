/**
 * french-anime - Built from src/french-anime/
 * Generated: 2026-02-25T20:33:48.811Z
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

// src/french-anime/index.js
var index_exports = {};
__export(index_exports, {
  getStreams: () => getStreams
});
module.exports = __toCommonJS(index_exports);

// src/french-anime/http.js
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "max-age=0",
  "Connection": "keep-alive"
};
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    console.log(`[French-Anime] Fetching: ${url}`);
    const response = yield fetch(url, __spreadValues({
      headers: __spreadValues(__spreadValues({}, HEADERS), options.headers)
    }, options));
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} for ${url}`);
    }
    return yield response.text();
  });
}

// src/french-anime/extractor.js
var import_cheerio = __toESM(require("cheerio"));

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
    try {
      const response = yield fetch(url, __spreadProps(__spreadValues({}, options), {
        headers: __spreadValues(__spreadValues({}, HEADERS2), options.headers),
        redirect: "follow"
      }));
      if (!response.ok) return null;
      const html = yield response.text();
      return {
        text: () => Promise.resolve(html),
        ok: true,
        url: response.url,
        headers: response.headers
      };
    } catch (e) {
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
      const match = html.match(/src\s*:\s*["']([^"']+\.mp4)["']/) || html.match(/"url"\s*:\s*"([^"]+\.mp4)"/);
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
      const res = yield safeFetch(url, { headers: { "Referer": "https://vidmoly.to/" } });
      if (!res) return { url };
      let html = yield res.text();
      if (html.includes("eval(function(p,a,c,k,e,d)")) html = unpack(html);
      const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/);
      if (match) return { url: match[1], headers: { "Referer": "https://vidmoly.to/" } };
    } catch (e) {
    }
    return { url };
  });
}
function resolveUqload(url) {
  return __async(this, null, function* () {
    try {
      const res = yield safeFetch(url, { headers: { "Referer": "https://uqload.com/" } });
      if (!res) return { url };
      const html = yield res.text();
      const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) || html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/);
      if (match) return { url: match[1], headers: { "Referer": "https://uqload.com/" } };
    } catch (e) {
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
      const res = yield safeFetch(url);
      if (!res) return { url };
      const html = yield res.text();
      const match = html.match(/video_source\s*:\s*["']([^"']+\.mp4[^"']*)["']/) || html.match(/source\s+src=["']([^"']+\.mp4[^"']*)["']/);
      if (match) return { url: match[1] };
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

// src/french-anime/extractor.js
var BASE_URL = "https://french-anime.com";
function getTmdbTitle(tmdbId, mediaType) {
  return __async(this, null, function* () {
    try {
      const url = `https://www.themoviedb.org/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}?language=en-US`;
      const html = yield fetchText(url);
      const $ = import_cheerio.default.load(html);
      let title = $('meta[property="og:title"]').attr("content") || $("h1").first().text() || $("h2").first().text();
      if (title && title.includes(" (")) title = title.split(" (")[0];
      if (title && title.includes(" - ")) title = title.split(" - ")[0];
      title = title ? title.trim() : null;
      console.log(`[French-Anime] TMDB Title found: ${title}`);
      return title;
    } catch (e) {
      console.error(`[French-Anime] Failed to get title from TMDB: ${e.message}`);
      return null;
    }
  });
}
function searchAnime(title) {
  return __async(this, null, function* () {
    try {
      const formData = `do=search&subaction=search&story=${encodeURIComponent(title)}`;
      const html = yield fetchText(`${BASE_URL}/index.php?do=search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": BASE_URL
        },
        body: formData
      });
      const $ = import_cheerio.default.load(html);
      const results = [];
      $("a.mov-t").each((i, el) => {
        const h = $(el).attr("href");
        const t = $(el).text().trim();
        if (h && h.includes(".html")) {
          results.push({ title: t, url: h });
        }
      });
      const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[':!.,?]/g, "").replace(/\bthe\s+/g, "").replace(/\s+/g, " ").trim();
      const simplifiedTitle = normalize(title);
      console.log(`[French-Anime] Search results: ${results.length}`);
      const matches = results.filter((r) => normalize(r.title).includes(simplifiedTitle));
      if (matches.length > 0) {
        console.log(`[French-Anime] Found ${matches.length} matches for ${title}`);
      }
      return matches;
    } catch (e) {
      console.error(`[French-Anime] Search error: ${e.message}`);
      return [];
    }
  });
}
function getPlayerName(url) {
  if (url.includes("sibnet")) return "Sibnet";
  if (url.includes("vidmoly")) return "Vidmoly";
  if (url.includes("christopheruntilpoint") || url.includes("voe")) return "Voe";
  if (url.includes("luluvid")) return "Luluvid";
  if (url.includes("savefiles")) return "Savefiles";
  if (url.includes("up4fun")) return "Up4Fun";
  if (url.includes("uqload")) return "Uqload";
  if (url.includes("hgcloud")) return "HGCloud";
  if (url.includes("myvi")) return "MyVi";
  if (url.includes("rutube")) return "Rutube";
  if (url.includes("ok.ru")) return "OK.ru";
  if (url.includes("doodstream") || url.includes("vvide0")) return "Doodstream";
  if (url.includes("mail.ru")) return "Mail.ru";
  return "Player";
}
function parseEpisodeData(html, targetEpisode) {
  const streams = [];
  const regex = /(\d+)!((?:https?:\/\/[^,<\s]+)(?:,(?:https?:\/\/[^,<\s]+))*)/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const epNum = parseInt(match[1]);
    if (epNum === targetEpisode) {
      const urls = match[2].split(",").filter((u) => u.startsWith("http"));
      for (const url of urls) {
        const cleanUrl = url.trim();
        if (cleanUrl.length > 10) {
          streams.push(cleanUrl);
        }
      }
    }
  }
  return streams;
}
function extractStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const title = yield getTmdbTitle(tmdbId, mediaType);
    if (!title) return [];
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
      console.warn(`[French-Anime] ArmSync failed: ${e.message}`);
    }
    let matches = yield searchAnime(title);
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
    const pagesChecked = /* @__PURE__ */ new Set();
    const pagesToCheck = matches.map((m) => m.url);
    for (const pageUrl of pagesToCheck) {
      if (pagesChecked.has(pageUrl)) continue;
      pagesChecked.add(pageUrl);
      const matchLower = pageUrl.toLowerCase();
      const seasonMatch = matchLower.match(/saison[-_]?(\d+)/);
      if (seasonMatch && parseInt(seasonMatch[1]) !== season && targetEpisodes.length === 1) {
        continue;
      }
      try {
        const html = yield fetchText(pageUrl);
        let langName = "VOSTFR";
        if (pageUrl.includes("animes-vf/") || pageUrl.toLowerCase().includes("french")) {
          langName = "VF";
        }
        const allPlayerUrls = [];
        for (const ep of targetEpisodes) {
          const playerUrls = parseEpisodeData(html, ep);
          allPlayerUrls.push(...playerUrls);
        }
        for (const url of allPlayerUrls) {
          const playerName = getPlayerName(url);
          const stream = yield resolveStream({
            name: `French-Anime (${langName})`,
            title: `${playerName} Player`,
            url,
            quality: "HD",
            headers: { "Referer": BASE_URL }
          });
          streams.push(stream);
        }
        if (allPlayerUrls.length > 0) {
          console.log(`[French-Anime] Found ${allPlayerUrls.length} players on ${pageUrl}`);
        }
      } catch (err) {
        console.error(`[French-Anime] Failed to fetch ${pageUrl}: ${err.message}`);
      }
    }
    return streams;
  });
}

// src/french-anime/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.log(`[French-Anime] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
    try {
      const streams = yield extractStreams(tmdbId, mediaType, season, episode);
      return streams;
    } catch (error) {
      console.error(`[French-Anime] Error:`, error);
      return [];
    }
  });
}
