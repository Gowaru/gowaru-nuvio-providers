/**
 * movix - Built from src/movix/
 * Generated: 2026-04-24T15:30:57.333Z
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
    try {
      const res = yield safeFetch(url, { headers: { "Referer": url } });
      if (!res) return { url };
      let html = yield res.text();
      if (html.includes("p,a,c,k,e,d") || html.includes("eval(function")) html = unpack(html);
      const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/sources\s*:\s*\[[^\]]*?["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
      if (match) {
        return { url: match[1], headers: { "Referer": url } };
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
    if (urlLower.match(/\.(mp4|m3u8|mkv|webm)(\?.*)?$/) && !urlLower.includes("html")) {
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
      else if (urlLower.includes("luluvid.") || urlLower.includes("lulustream.") || urlLower.includes("luluvdo.") || urlLower.includes("wishonly.") || urlLower.includes("veev.")) result = yield resolvePackedPlayer(originalUrl);
      else if (urlLower.includes("lulu.")) result = yield resolveLuluvid(originalUrl);
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
      Origin: "https://movix.cash",
      Referer: "https://movix.cash/"
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
    if (!isExoPlayableUrl(resolved.url)) return null;
    return resolved;
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
function extractStreams(tmdbId, mediaType, season, episode) {
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
        const data = yield fetchJson(job.url);
        if (!data) return;
        if (data.success === false) {
          console.log(`[Movix] ${job.label} unavailable: ${data.error || "unknown error"}`);
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
    console.log(`[Movix] Total streams found: ${unique.length}, Exo-playable: ${playable.length}`);
    return playable;
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
