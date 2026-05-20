/**
 * animevostfr - Built from src/animevostfr/
 * Generated: 2026-05-20T17:12:11.821131798Z
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
  var HEADERS, _atob, BASE_URL_FORBIDDEN_PATTERN;
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
      BASE_URL_FORBIDDEN_PATTERN = "googletagmanager";
    }
  });

  // src/animevostfr/http.js
  async function fetchText(url, options = {}) {
    console.log(`[AnimeVOSTFR] Fetching: ${url}`);
    const res = await safeFetch(url, { headers: { ...HEADERS2, ...options.headers || {} }, ...options });
    if (!res || !res.ok) {
      const status = res && typeof res.status === "number" ? res.status : "no-response";
      if (HTTP_SKIP_CODES.includes(status)) throw new Error(`HTTP_SKIP ${status}`);
      throw new Error(`HTTP error ${status} for ${url}`);
    }
    return await res.text();
  }
  var HEADERS2, HTTP_SKIP_CODES;
  var init_http = __esm({
    "src/animevostfr/http.js"() {
      init_resolvers();
      HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "max-age=0",
        "Connection": "keep-alive"
      };
      HTTP_SKIP_CODES = [403, 404, 429, 500, 502, 503, 504, 522, 523, 524];
    }
  });

  // src/utils/armsync.js
  async function syncFetch(url, options = {}) {
    try {
      const res = await safeFetch(url, options);
      return res;
    } catch (e) {
      console.error(`[ArmSync] Fetch failed: ${url}`, e.message);
      return null;
    }
  }
  async function getImdbId(tmdbId, mediaType) {
    if (!tmdbId) return null;
    const armRes = await syncFetch(`${ARM_API}/themoviedb?id=${tmdbId}`);
    if (armRes) {
      try {
        const data = await armRes.json();
        const entry = Array.isArray(data) ? data[0] : data;
        if (entry && entry.imdb) return entry.imdb;
      } catch (e) {
      }
    }
    const tmdbUrl = `https://www.themoviedb.org/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`;
    const tmdbRes = await syncFetch(tmdbUrl);
    if (tmdbRes) {
      const html = await tmdbRes.text();
      const imdbMatch = html.match(/imdb\.com\/title\/(tt\d+)/);
      if (imdbMatch) return imdbMatch[1];
    }
    return null;
  }
  async function getAbsoluteEpisode(imdbId, season, episode) {
    if (!imdbId || season === 0) return null;
    const res = await syncFetch(`${CINEMATA_API}/meta/series/${imdbId}.json`);
    if (!res) return null;
    const data = await res.json();
    if (!data?.meta?.videos) return null;
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
  }
  var ARM_API, CINEMATA_API;
  var init_armsync = __esm({
    "src/utils/armsync.js"() {
      init_resolvers();
      ARM_API = "https://arm.haglund.dev/api/v2";
      CINEMATA_API = "https://v3-cinemeta.strem.io";
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

  // src/animevostfr/extractor.js
  async function searchAnime(title) {
    try {
      const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`, { timeout: SEARCH_TIMEOUT });
      const $ = import_cheerio_without_node_native.default.load(html);
      const results = [];
      $('.post-title a, .TPost a, .TPostMv a, article a[href*="/animes/"]').each((i, el) => {
        const h = $(el).attr("href") || "";
        const t = $(el).text().trim();
        if (h.includes("/animes/")) {
          const imgAlt = $(el).closest(".TPost, .TPostMv, article").find("img").first().attr("alt");
          results.push({ title: imgAlt || t || h.split("/").pop().replace(/-/g, " "), url: h, rawText: t });
        }
      });
      if (results.length === 0) {
        $('.content, #main, main, .result-item, li > a[href*="/animes/"]').each((i, el) => {
          const h = $(el).attr("href") || "";
          const t = $(el).text().trim();
          if (h.includes("/animes/") && t.length > 2) {
            const imgAlt = $(el).closest("li, div").find("img").first().attr("alt");
            results.push({ title: imgAlt || t, url: h, rawText: t });
          }
        });
      }
      if (results.length === 0) {
        $('a[href*="/animes/"]').each((i, el) => {
          const h = $(el).attr("href") || "";
          const t = $(el).text().trim();
          if (h.includes("/animes/") && t.length > 2) {
            results.push({ title: t, url: h, rawText: t });
          }
        });
      }
      const seen = /* @__PURE__ */ new Set();
      const unique = results.filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
      console.log(`[AnimeVOSTFR] Search results for "${title}": ${unique.length}`);
      const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2018\u2019:!.,?"]/g, "").replace(/\b(?:the|an?)\s+/g, "").replace(/\s+/g, " ").trim();
      const simplifiedTitle = normalize(title);
      const titleWords = simplifiedTitle.split(/\s+/).filter((w) => w.length > 2);
      const scored = unique.map((r) => {
        const n = normalize(r.title);
        let score = 0;
        if (simplifiedTitle.length >= 5 && n.includes(simplifiedTitle)) {
          score = 100;
        } else if (n === simplifiedTitle) {
          score = 200;
        } else {
          for (const w of titleWords) {
            if (n.includes(w)) score += 20;
          }
          const lenRatio = Math.min(n.length, simplifiedTitle.length) / Math.max(n.length, simplifiedTitle.length);
          score = Math.round(score * lenRatio);
        }
        return { ...r, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      const bestScore = best ? best.score : 0;
      let matches;
      if (best && bestScore >= 25) {
        const threshold = Math.max(20, bestScore * 0.5);
        matches = scored.filter((r) => r.score >= threshold);
      } else {
        matches = [];
      }
      console.log(`[AnimeVOSTFR] Best match: "${best?.title}" (score ${bestScore}) -> ${matches.length} results kept`);
      return matches.map((r) => ({ title: r.title, url: r.url }));
    } catch (e) {
      console.error(`[AnimeVOSTFR] Search error: ${e.message}`);
      return [];
    }
  }
  async function findEpisodeUrl(seriesUrl, season, episode, isAbsolute = false) {
    try {
      const html = await fetchText(seriesUrl, { timeout: SEARCH_TIMEOUT });
      const $ = import_cheerio_without_node_native.default.load(html);
      const episodeLinks = [];
      $('a[href*="/episode/"]').each((i, el) => {
        const h = $(el).attr("href") || "";
        const t = $(el).text().trim();
        episodeLinks.push({ url: h, text: t });
      });
      console.log(`[AnimeVOSTFR] Found ${episodeLinks.length} episode links`);
      if (season == null || episode == null) {
        if (episodeLinks.length > 0) {
          console.log(`[AnimeVOSTFR] Movie mode: using episode URL ${episodeLinks[0].url}`);
          return episodeLinks[0].url;
        }
        return seriesUrl;
      }
      const epStr = String(episode);
      const epPadded = epStr.padStart(2, "0");
      const seasonPattern = season ? String(season) : "";
      const sortedUrlPatterns = [
        // Primary: no "saison" word (real URL format: -1-episode-1)
        new RegExp(`-${seasonPattern}-episode-${epStr}(?:-vostfr|-vf|/|$)`, "i"),
        new RegExp(`-${seasonPattern}-episode-${epPadded}(?:-vostfr|-vf|/|$)`, "i"),
        // Legacy: with "saison" word
        new RegExp(`-saison-${seasonPattern}-episode-${epStr}(?:-vostfr|-vf|/|$)`, "i"),
        new RegExp(`-saison-${seasonPattern}-episode-${epPadded}(?:-vostfr|-vf|/|$)`, "i"),
        // No season number in URL (single-season animes)
        new RegExp(`-episode-${epStr}(?:-vostfr|-vf|/|$)`, "i"),
        new RegExp(`-episode-${epPadded}(?:-vostfr|-vf|/|$)`, "i"),
        new RegExp(`-ep-${epStr}(?:-vostfr|-vf|/|$)`, "i"),
        new RegExp(`-ep-${epPadded}(?:-vostfr|-vf|/|$)`, "i")
      ];
      const matchEpisode = (links, pattern) => {
        return links.find((l) => {
          if (!pattern.test(l.url)) return false;
          if (!isAbsolute && season != null) {
            const seasonMatch = l.url.match(/-(?:saison-)?(\d+)-episode-/i);
            if (seasonMatch && parseInt(seasonMatch[1]) !== Number(season)) {
              return false;
            }
          }
          return true;
        });
      };
      for (const pattern of sortedUrlPatterns) {
        const match = matchEpisode(episodeLinks, pattern);
        if (match) {
          console.log(`[AnimeVOSTFR] Found episode in URL: ${match.url}`);
          return match.url;
        }
      }
      const reversedLinks = [...episodeLinks].reverse();
      for (const pattern of sortedUrlPatterns) {
        const match = matchEpisode(reversedLinks, pattern);
        if (match) {
          console.log(`[AnimeVOSTFR] Found episode in URL (reversed fallback): ${match.url}`);
          return match.url;
        }
      }
      const textPatterns = [
        new RegExp(`^\\s*Episode\\s+${epStr}\\s*$`, "i"),
        new RegExp(`^\\s*Ep\\s*${epStr}\\s*$`, "i"),
        new RegExp(`(?:^|[^0-9])${epStr}(?:$|[^0-9])`)
      ];
      const matchByText = (links, pattern) => {
        return links.find((l) => {
          if (!pattern.test(l.text)) return false;
          if (!isAbsolute && season != null) {
            const seasonMatch = l.url.match(/-(?:saison-)?(\d+)-episode-/i);
            if (seasonMatch && parseInt(seasonMatch[1]) !== Number(season)) {
              return false;
            }
          }
          return true;
        });
      };
      for (const pattern of textPatterns) {
        const match = matchByText(episodeLinks, pattern);
        if (match) {
          console.log(`[AnimeVOSTFR] Found episode in text: ${match.url}`);
          return match.url;
        }
      }
      for (const pattern of textPatterns) {
        const match = matchByText(reversedLinks, pattern);
        if (match) {
          console.log(`[AnimeVOSTFR] Found episode in text (reversed fallback): ${match.url}`);
          return match.url;
        }
      }
      return null;
    } catch (e) {
      console.error(`[AnimeVOSTFR] Error finding episode: ${e.message}`);
      return null;
    }
  }
  async function extractPlayersFromEpisode(episodeUrl) {
    const streams = [];
    try {
      const html = await fetchText(episodeUrl, { timeout: SEARCH_TIMEOUT });
      const $ = import_cheerio_without_node_native.default.load(html);
      const serverNames = {};
      $(".TPlayerNv li").each((i, el) => {
        const tabId = $(el).attr("data-tplayernv") || $(el).attr("id") || `Opt${i + 1}`;
        serverNames[tabId] = $(el).text().trim() || `Lecteur ${i + 1}`;
      });
      const trembedEntries = [];
      $(".TPlayerTb, .TPlayer .TPlayerTb").each((i, el) => {
        const tabId = $(el).attr("id") || `Opt${i + 1}`;
        const serverName = serverNames[tabId] || `Lecteur ${i + 1}`;
        const iframe = $(el).find("iframe");
        const lazyDiv = $(el).find(".lazy-player, [data-src]");
        let src = null;
        if (iframe.length && iframe.attr("src")) {
          src = iframe.attr("src");
        } else if (lazyDiv.length && lazyDiv.attr("data-src")) {
          src = lazyDiv.attr("data-src");
        }
        if (src) trembedEntries.push({ src, serverName });
      });
      if (trembedEntries.length === 0) {
        $('iframe[src*="trembed"]').each((i, el) => {
          const src = $(el).attr("src");
          if (src) trembedEntries.push({ src, serverName: `Lecteur ${i + 1}` });
        });
      }
      console.log(`[AnimeVOSTFR] Found ${trembedEntries.length} player tabs`);
      const trembedPromises = trembedEntries.map(async (entry) => {
        try {
          let trembedUrl = entry.src;
          if (trembedUrl.startsWith("/")) trembedUrl = BASE_URL + trembedUrl;
          else if (trembedUrl.startsWith("?")) trembedUrl = BASE_URL + trembedUrl;
          if (!trembedUrl.startsWith("http")) return null;
          const embedHtml = await fetchText(trembedUrl, { timeout: SEARCH_TIMEOUT, headers: { "Referer": episodeUrl } });
          const $embed = import_cheerio_without_node_native.default.load(embedHtml);
          let playerSrc = $embed("iframe").first().attr("src") || $embed("[data-src]").first().attr("data-src");
          if (!playerSrc) {
            const extMatch = embedHtml.match(/(?:src|href)=["'](https?:\/\/(?!animevostfr)[^"']+)["']/i);
            if (extMatch) playerSrc = extMatch[1];
          }
          if (playerSrc && playerSrc.startsWith("http")) {
            const playerName = getPlayerName(playerSrc);
            const stream = await resolveStream({
              name: `AnimeVOSTFR`,
              title: `${playerName} (${entry.serverName})`,
              url: playerSrc,
              quality: "HD",
              headers: { "Referer": BASE_URL }
            });
            return stream;
          }
        } catch (err) {
          console.error(`[AnimeVOSTFR] Failed to resolve player "${entry.serverName}": ${err.message}`);
        }
        return null;
      });
      const playerStreams = await Promise.all(trembedPromises);
      for (const stream of playerStreams) {
        if (stream) streams.push(stream);
      }
    } catch (e) {
      console.error(`[AnimeVOSTFR] Error extracting players: ${e.message}`);
    }
    return streams;
  }
  function getPlayerName(url) {
    if (url.includes("sibnet")) return "Sibnet";
    if (url.includes("vidmoly")) return "Vidmoly";
    if (url.includes("christopheruntilpoint") || url.includes("voe")) return "Voe";
    if (url.includes("luluvid")) return "Luluvid";
    if (url.includes("savefiles")) return "Savefiles";
    if (url.includes("uqload") || url.includes("oneupload")) return "Uqload";
    if (url.includes("hgcloud")) return "HGCloud";
    if (url.includes("dood") || url.includes("ds2play")) return "Doodstream";
    if (url.includes("myvi") || url.includes("mytv")) return "MyVi";
    if (url.includes("sendvid")) return "Sendvid";
    if (url.includes("stape") || url.includes("streamtape")) return "Streamtape";
    if (url.includes("moon")) return "Moon";
    return "Player";
  }
  async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType);
    if (titles.length === 0) return [];
    const isFrenchTitle = (t) => /[àâéèêëîïôùûüçœæ']/i.test(t);
    const titlesOrdered = [
      ...titles.filter(isFrenchTitle),
      ...titles.filter((t) => !isFrenchTitle(t))
    ];
    let targetEpisodes = [episode];
    try {
      const imdbId = await getImdbId(tmdbId, mediaType);
      if (imdbId) {
        const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
        if (absoluteEpisode && absoluteEpisode !== episode) {
          targetEpisodes.push(absoluteEpisode);
        }
      }
    } catch (e) {
      console.warn(`[AnimeVOSTFR] ArmSync failed: ${e.message}`);
    }
    const searchSeason = mediaType === "movie" && season == null ? 1 : season;
    const searchEpisode = mediaType === "movie" && episode == null ? 1 : episode;
    const baseTitles = titlesOrdered.slice(0, MAX_SEARCH_TITLES);
    const shortTitles = [];
    for (const t of baseTitles) {
      shortTitles.push(t);
      const parts = t.split(/[:\–\-]+/).map((s) => s.trim()).filter((s) => s.length > 5);
      for (const p of parts) {
        if (p !== t) shortTitles.push(p);
      }
      const words = t.split(/\s+/).filter((w) => w.length > 2);
      if (words.length > 3) {
        shortTitles.push(words.slice(0, 3).join(" "));
        shortTitles.push(words.slice(0, 4).join(" "));
      }
    }
    let matches = [];
    const triedTitles = /* @__PURE__ */ new Set();
    for (const t of shortTitles) {
      const key = t.toLowerCase().trim();
      if (triedTitles.has(key)) continue;
      triedTitles.add(key);
      matches = await searchAnime(t);
      if (matches && matches.length > 0) break;
    }
    if (!matches || matches.length === 0) return [];
    const seasonStr = searchSeason ? String(searchSeason) : "";
    matches = matches.sort((a, b) => {
      const aT = a.title.toLowerCase();
      const bT = b.title.toLowerCase();
      const sMatch = `saison ${seasonStr}`;
      const hasA = aT.includes(sMatch);
      const hasB = bT.includes(sMatch);
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      return 0;
    });
    const streams = [];
    const checkedEpisodeUrls = /* @__PURE__ */ new Set();
    const checkedSeriesUrls = /* @__PURE__ */ new Set();
    const mainTitle = titlesOrdered[0]?.toLowerCase() || "";
    const mainWords = mainTitle.split(/\s+/).filter((w) => w.length > 3);
    for (const match of matches) {
      if (checkedSeriesUrls.has(match.url)) continue;
      checkedSeriesUrls.add(match.url);
      const matchLower = match.title.toLowerCase();
      const isVf = matchLower.includes(" vf") || match.url.includes("vf");
      const langSuffix = isVf ? "VF" : "VOSTFR";
      const spinoffKeywords = ["vigilantes", "prelude", "special", "ova", "ona"];
      const isSpinoff = spinoffKeywords.some((k) => matchLower.includes(k)) && !mainWords.some((w) => matchLower.includes(w));
      if (isSpinoff && matches.length > 1) {
        console.log(`[AnimeVOSTFR] Skipping spinoff match: ${match.title}`);
        continue;
      }
      const seasonMatchText = matchLower.match(/saison\s*(\d+)/);
      if (seasonMatchText && parseInt(seasonMatchText[1]) !== Number(searchSeason) && targetEpisodes.length === 1) {
        continue;
      }
      for (const ep of targetEpisodes) {
        const isAbsolute = ep !== searchEpisode;
        const episodeUrl = await findEpisodeUrl(match.url, searchSeason, ep, isAbsolute);
        if (episodeUrl && !checkedEpisodeUrls.has(episodeUrl)) {
          checkedEpisodeUrls.add(episodeUrl);
          const playerStreams = await extractPlayersFromEpisode(episodeUrl);
          const epType = ep === searchEpisode ? "" : ` (Abs ${ep})`;
          playerStreams.forEach((s) => {
            if (!s.name.includes("(")) {
              s.name = `AnimeVOSTFR (${langSuffix})`;
            }
            if (!s.title.includes(langSuffix)) {
              s.title = `${s.title}${epType} - ${langSuffix}`;
            } else {
              s.title = `${s.title}${epType}`;
            }
          });
          streams.push(...playerStreams);
        }
      }
    }
    if (streams.length === 0) {
      console.warn(`[AnimeVOSTFR] Episode S${searchSeason}E${searchEpisode} not found (targets: ${targetEpisodes.join(", ")})`);
    }
    const validStreams = streams.filter((s) => s && s.isDirect);
    console.log(`[AnimeVOSTFR] Total streams found: ${validStreams.length}`);
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
  var import_cheerio_without_node_native, BASE_URL, MAX_SEARCH_TITLES, SEARCH_TIMEOUT;
  var init_extractor = __esm({
    "src/animevostfr/extractor.js"() {
      init_http();
      import_cheerio_without_node_native = __toESM(__require("cheerio-without-node-native"));
      init_resolvers();
      init_armsync();
      init_metadata();
      BASE_URL = "https://v2.animevostfr.org";
      MAX_SEARCH_TITLES = 8;
      SEARCH_TIMEOUT = 1e4;
    }
  });

  // src/animevostfr/index.js
  var require_index = __commonJS({
    "src/animevostfr/index.js"(exports, module) {
      init_extractor();
      init_resolvers();
      async function getStreams(tmdbId, mediaType, season, episode) {
        console.log(`[AnimeVostfr] Request: ${mediaType} ${tmdbId} S${season}E${episode}`);
        try {
          const streams = await extractStreams(tmdbId, mediaType, season, episode);
          return streams;
        } catch (error) {
          console.error(`[AnimeVostfr] Error:`, error);
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
