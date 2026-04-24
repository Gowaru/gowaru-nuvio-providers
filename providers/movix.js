/**
 * movix - Built from src/movix/
 * Generated: 2026-04-24T09:04:09.853Z
 */
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
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

// src/movix/http.js
var HEADERS = {
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
      const response = yield fetch(url, {
        headers: __spreadValues(__spreadValues({}, HEADERS), options.headers)
      });
      if (!response.ok) {
        console.log(`[Movix] HTTP ${response.status} for ${url}`);
        return null;
      }
      const text = yield response.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.log(`[Movix] JSON parse error for ${url}. Content length: ${text.length}`);
        return null;
      }
    } catch (e) {
      console.log(`[Movix] Fetch error for ${url}: ${e.message}`);
      return null;
    }
  });
}

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
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4e3);
          const res = yield fetch(tryUrl, {
            headers: __spreadProps(__spreadValues({}, HEADERS2), { "Referer": baseRef }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (res && res.ok) {
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
            const isInvalidExtension = extractedUrl.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);
            if (extractedUrl.startsWith("http") && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN) && !isInvalidExtension) {
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

// src/movix/extractor.js
var API_BASE = "https://api.movix.cash";
var PLAYBACK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "*/*",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Origin": "https://movix.cash",
  "Referer": "https://movix.cash/",
  "Sec-Fetch-Dest": "video",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
  "DNT": "1"
};
function langTag(lang) {
  const l = (lang || "").toLowerCase();
  if (l.includes("french") || l === "vf" || l === "vff" || l === "vfq") return "VF";
  if (l.includes("vostfr") || l === "vost") return "VOSTFR";
  if (l.includes("multi")) return "MULTI";
  if (l.includes("english") || l === "vo") return "VO";
  return (lang || "VF").toUpperCase();
}
function playerName(url, label) {
  const u = (url || "").toLowerCase();
  const l = (label || "").toLowerCase();
  if (l.includes("lulustream") || u.includes("lulustream")) return "LuluStream";
  if (l.includes("vidmoly") || u.includes("vidmoly")) return "VidMoly";
  if (l.includes("vidzy") || u.includes("vidzy")) return "Vidzy";
  if (l.includes("voesx") || u.includes("voe.sx") || u.includes("voe.")) return "VoeSX";
  if (l.includes("uqload") || u.includes("uqload")) return "Uqload";
  if (l.includes("filemoon") || u.includes("filemoon")) return "Filemoon";
  if (l.includes("dropload") || u.includes("dropload")) return "Dropload";
  if (l.includes("supervideo") || u.includes("supervideo")) return "SuperVideo";
  if (l.includes("wish") || u.includes("wish")) return "Wish";
  if (l.includes("fsvid") || u.includes("fsvid") || l.includes("premium")) return "FSVid";
  if (l.includes("sibnet") || u.includes("sibnet")) return "Sibnet";
  if (l.includes("netu") || u.includes("netu") || u.includes("waaw")) return "Netu";
  return "Player";
}
function tryExtract(embedUrl) {
  return __async(this, null, function* () {
    var _a;
    if (!embedUrl) return null;
    const u = embedUrl.toLowerCase();
    const EXTRACTION_BASE = "https://proxiesembed.movix.cash";
    let extractEndpoint = null;
    if (u.includes("sibnet")) {
      extractEndpoint = `${EXTRACTION_BASE}/api/extract-sibnet?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes("vidmoly")) {
      extractEndpoint = `${EXTRACTION_BASE}/api/extract-vidmoly?url=${embedUrl}`;
    } else if (u.includes("vidzy")) {
      extractEndpoint = `${EXTRACTION_BASE}/api/extract-vidzy?url=${embedUrl}`;
    } else if (u.includes("voe.sx") || u.includes("voe.")) {
      extractEndpoint = `${API_BASE}/api/voe/m3u8?url=${embedUrl}`;
    } else if (u.includes("doodstream") || u.includes("dood.")) {
      extractEndpoint = `${EXTRACTION_BASE}/api/extract-doodstream?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes("uqload")) {
      extractEndpoint = `${EXTRACTION_BASE}/api/extract-uqload?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes("supervideo")) {
      extractEndpoint = `${EXTRACTION_BASE}/api/extract-supervideo?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes("dropload")) {
      extractEndpoint = `${EXTRACTION_BASE}/api/extract-dropload?url=${encodeURIComponent(embedUrl)}`;
    } else if (u.includes("fsvid") || u.includes("premium")) {
      extractEndpoint = `${EXTRACTION_BASE}/api/extract-fsvid?url=${encodeURIComponent(embedUrl)}`;
    }
    if (!extractEndpoint) return null;
    try {
      const data = yield fetchJson(extractEndpoint);
      if (!data || data.error) return null;
      return data.url || data.source || data.m3u8 || data.mp4 || data.link || data.sources && ((_a = data.sources[0]) == null ? void 0 : _a.url);
    } catch (e) {
      return null;
    }
  });
}
function isDirectUrl(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes(".m3u8") || u.includes(".mp4") || u.includes(".mkv") || u.includes("/playlist/") || u.includes("/master.");
}
function processSource(url, label, provider, lang) {
  return __async(this, null, function* () {
    if (!url) return null;
    let finalUrl = url;
    if (!isDirectUrl(url)) {
      const extracted = yield tryExtract(url).catch(() => null);
      if (extracted) finalUrl = extracted;
    }
    const streamObj = {
      name: `Movix`,
      title: `[${langTag(lang)}] ${provider} - ${playerName(url, label)}`,
      url: finalUrl,
      quality: "HD",
      headers: PLAYBACK_HEADERS
    };
    return yield resolveStream(streamObj);
  });
}
function fetchTmdbApi(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var _a;
    const streams = [];
    const url = mediaType === "movie" ? `${API_BASE}/api/tmdb/movie/${tmdbId}` : `${API_BASE}/api/tmdb/tv/${tmdbId}?season=${season}&episode=${episode}`;
    const data = yield fetchJson(url);
    if (!data) return streams;
    const links = mediaType === "movie" ? data.player_links : (_a = data.current_episode) == null ? void 0 : _a.player_links;
    if (!Array.isArray(links)) return streams;
    const tasks = links.map((link) => {
      return processSource(link.decoded_url || link.url, link.quality, "Direct", link.language);
    });
    const results = yield Promise.all(tasks.map((t) => t.catch((e) => {
      console.error(`[Movix] Task failed: ${e.message}`);
      return null;
    })));
    for (const r of results) {
      if (r) streams.push(r);
    }
    return streams;
  });
}
function fetchFStream(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const streams = [];
    const url = mediaType === "movie" ? `${API_BASE}/api/fstream/movie/${tmdbId}` : `${API_BASE}/api/fstream/tv/${tmdbId}/season/${season}`;
    const data = yield fetchJson(url);
    if (!data) return streams;
    let playersByLang = {};
    if (mediaType === "movie") {
      playersByLang = data.players || {};
    } else if (data.episodes) {
      const epData = data.episodes[String(episode)] || data.episodes[episode];
      if (epData) playersByLang = epData.languages || epData.players || epData;
    }
    const tasks = [];
    for (const lang of Object.keys(playersByLang)) {
      const items = playersByLang[lang];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item.url) continue;
        tasks.push(processSource(item.url, item.player, "FStream", lang));
      }
    }
    const results = yield Promise.all(tasks.map((t) => t.catch((e) => {
      console.error(`[Movix] FStream task failed: ${e.message}`);
      return null;
    })));
    for (const r of results) {
      if (r) streams.push(r);
    }
    return streams;
  });
}
function extractStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.log(`[Movix] Starting extraction for ${mediaType} ${tmdbId}`);
    const results = yield Promise.all([
      fetchTmdbApi(tmdbId, mediaType, season, episode).catch((e) => {
        console.error(`[Movix] fetchTmdbApi failed: ${e.message}`);
        return [];
      }),
      fetchFStream(tmdbId, mediaType, season, episode).catch((e) => {
        console.error(`[Movix] fetchFStream failed: ${e.message}`);
        return [];
      })
    ]);
    const streams = [];
    for (const r of results) {
      if (Array.isArray(r)) streams.push(...r);
    }
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const s of streams) {
      if (!seen.has(s.url)) {
        seen.add(s.url);
        unique.push(s);
      }
    }
    const validStreams = unique.filter((s) => s && s.isDirect);
    console.log(`[Movix] Total valid streams found: ${validStreams.length}`);
    return validStreams;
  });
}

// src/movix/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log(`[Movix] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
      const streams = yield extractStreams(tmdbId, mediaType, season, episode);
      console.log(`[Movix] Found ${streams.length} streams`);
      return streams;
    } catch (error) {
      console.error(`[Movix] Error: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
