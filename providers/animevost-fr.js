/**
 * animevost-fr - Built from src/animevost-fr/
 * Generated: 2026-08-28T14:42:06.810126714Z
 */
var __provider = (() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
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
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
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

  // src/animevost-fr/http.js
  var require_http = __commonJS({
    "src/animevost-fr/http.js"(exports, module) {
      var BASE = "https://animevost.fr";
      var HEADERS2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
      };
      function fetchJson(path) {
        return __async(this, null, function* () {
          const url = path.startsWith("http") ? path : `${BASE}${path}`;
          try {
            const res = yield fetch(url, { headers: HEADERS2 });
            if (!res.ok) return null;
            const text = yield res.text();
            try {
              return JSON.parse(text);
            } catch (e) {
              return null;
            }
          } catch (e) {
            return null;
          }
        });
      }
      function fetchText(path) {
        return __async(this, null, function* () {
          const url = path.startsWith("http") ? path : `${BASE}${path}`;
          try {
            const res = yield fetch(url, { headers: HEADERS2 });
            if (!res.ok) return null;
            return yield res.text();
          } catch (e) {
            return null;
          }
        });
      }
      module.exports = { BASE, HEADERS: HEADERS2, fetchJson, fetchText };
    }
  });

  // src/animevost-fr/extractor.js
  var require_extractor = __commonJS({
    "src/animevost-fr/extractor.js"(exports, module) {
      var { fetchJson } = require_http();
      var BASE = "https://animevost.fr";
      var animeCache = /* @__PURE__ */ new Map();
      var CACHE_TTL = 10 * 60 * 1e3;
      function getCached(key) {
        const entry = animeCache.get(key);
        if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
        animeCache.delete(key);
        return null;
      }
      function setCache(key, data) {
        animeCache.set(key, { data, ts: Date.now() });
      }
      function searchAnime(query) {
        return __async(this, null, function* () {
          const cacheKey = `search_${query.toLowerCase()}`;
          const cached = getCached(cacheKey);
          if (cached) return cached;
          const data = yield fetchJson(`/api/animes/search?q=${encodeURIComponent(query)}`);
          if (!data || !data.results || data.results.length === 0) return null;
          const result = data.results[0];
          setCache(cacheKey, result);
          return result;
        });
      }
      function getAnimeDetails(slug) {
        return __async(this, null, function* () {
          const cacheKey = `anime_${slug}`;
          const cached = getCached(cacheKey);
          if (cached) return cached;
          const data = yield fetchJson(`/api/animes/${slug}`);
          if (!data || !data.anime) return null;
          setCache(cacheKey, data);
          return data;
        });
      }
      function searchAndExtract(title, season, episode) {
        return __async(this, null, function* () {
          const cleanTitle = title.replace(/\s*(saison|season|s)\s*\d+/gi, "").replace(/\s*(episode|ep|e)\s*\d+/gi, "").trim();
          const searchResult = yield searchAnime(cleanTitle);
          if (!searchResult) return [];
          const details = yield getAnimeDetails(searchResult.slug);
          if (!details || !details.seasons) return [];
          const seasonData = details.seasons.find((s) => s.season_number === season) || details.seasons[0];
          if (!seasonData || !seasonData.episodes) return [];
          const episodeData = seasonData.episodes.find((e) => e.episode_number === episode) || seasonData.episodes[0];
          if (!episodeData) return [];
          const streams = [];
          if (episodeData.streams && episodeData.streams.length > 0) {
            for (const stream of episodeData.streams) {
              if (stream.video_url) {
                streams.push({
                  url: stream.video_url,
                  title: `AnimeVOST [${stream.quality || "1080p"}] [${stream.language || "VOSTFR"}]`,
                  name: `AnimeVOST (${stream.language || "VOSTFR"})`,
                  quality: stream.quality || "1080p",
                  language: "fr",
                  provider: "animevost-fr",
                  headers: {
                    "Referer": `${BASE}/`
                  }
                });
              }
            }
          }
          if (streams.length === 0 && episodeData.zoplayer_id) {
            streams.push({
              url: `${BASE}/api/animes/${searchResult.slug}`,
              title: `AnimeVOST [1080p] [VOSTFR]`,
              name: "AnimeVOST (VOSTFR)",
              quality: "1080p",
              language: "fr",
              provider: "animevost-fr",
              headers: {
                "Referer": `${BASE}/`
              }
            });
          }
          return streams;
        });
      }
      module.exports = { searchAnime, getAnimeDetails, searchAndExtract };
    }
  });

  // src/utils/resolvers.js
  function createAbortController() {
    try {
      if (typeof AbortController !== "undefined") {
        return new AbortController();
      }
    } catch (_) {
    }
    return null;
  }
  function isAborted(signal) {
    return signal && (typeof signal.aborted === "boolean" ? signal.aborted : false);
  }
  function getCachedFetch(key) {
    const entry = fetchCache.get(key);
    if (entry && Date.now() - entry.ts < FETCH_CACHE_TTL) return entry.data;
    return null;
  }
  function setCachedFetch(key, data) {
    if (fetchCache.size >= 300) {
      const toRemove = Math.ceil(300 * 0.2);
      const sorted = [...fetchCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, toRemove);
      for (const [k] of sorted) fetchCache.delete(k);
    }
    fetchCache.set(key, { data, ts: Date.now() });
  }
  function safeFetch(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const start = Date.now();
      const SLOW_THRESHOLD = 15e3;
      const method = (options.method || "GET").toUpperCase();
      const cacheKey = method + "|" + url;
      if (method === "GET") {
        const cached = getCachedFetch(cacheKey);
        if (cached) {
          return {
            text: () => Promise.resolve(cached.bodyText),
            json: () => __async(null, null, function* () {
              try {
                return JSON.parse(cached.bodyText);
              } catch (e) {
                throw e;
              }
            }),
            ok: cached.ok,
            status: cached.status,
            url: cached.finalUrl || url,
            headers: cached.headers || {}
          };
        }
      }
      try {
        const _a = options, { timeout, signal: externalSignal } = _a, rest = __objRest(_a, ["timeout", "signal"]);
        if (isAborted(externalSignal)) {
          return null;
        }
        const fetchOpts = __spreadProps(__spreadValues({}, rest), {
          headers: __spreadValues(__spreadValues({}, HEADERS), rest.headers),
          redirect: "follow"
        });
        if (timeout > 0 && typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "undefined") {
          const timeoutSignal = AbortSignal.timeout(timeout);
          if (externalSignal) {
            const controller = createAbortController();
            if (controller) {
              fetchOpts.signal = controller.signal;
              const onAbort = () => {
                controller.abort();
              };
              try {
                externalSignal.addEventListener("abort", onAbort);
              } catch (_) {
              }
              try {
                timeoutSignal.addEventListener("abort", onAbort);
              } catch (_) {
              }
            } else {
              fetchOpts.signal = externalSignal;
            }
          } else {
            fetchOpts.signal = timeoutSignal;
          }
        } else if (externalSignal) {
          fetchOpts.signal = externalSignal;
        }
        const response = yield fetch(url, fetchOpts);
        const elapsed = Date.now() - start;
        if (elapsed > SLOW_THRESHOLD) {
          console.warn(`[safeFetch] Slow request (${elapsed}ms): ${(url || "").slice(0, 120)}`);
        }
        if (!response) return null;
        const status = response.status;
        let bodyText = "";
        try {
          bodyText = yield response.text();
        } catch (e) {
          bodyText = "";
        }
        if (method === "GET" && status >= 200 && status < 300) {
          setCachedFetch(cacheKey, {
            bodyText,
            ok: true,
            status,
            finalUrl: response.url,
            headers: response.headers
          });
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
        const elapsed = Date.now() - start;
        if (elapsed > SLOW_THRESHOLD) {
          console.warn(`[safeFetch] Slow request failed (${elapsed}ms): ${(url || "").slice(0, 120)}`);
        }
        return null;
      }
    });
  }
  var HEADERS, USER_AGENT, BASE_HEADERS, FETCH_CACHE_TTL, fetchCache;
  var init_resolvers = __esm({
    "src/utils/resolvers.js"() {
      HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
      };
      USER_AGENT = HEADERS["User-Agent"];
      BASE_HEADERS = __spreadValues({}, HEADERS);
      FETCH_CACHE_TTL = 3e5;
      fetchCache = /* @__PURE__ */ new Map();
    }
  });

  // src/utils/metadata.js
  var metadata_exports = {};
  __export(metadata_exports, {
    getTmdbTitles: () => getTmdbTitles
  });
  function metadataCacheGet(key) {
    const entry = METADATA_CACHE.get(key);
    if (entry && Date.now() - entry.ts < METADATA_TTL) return entry.data;
    if (entry) METADATA_CACHE.delete(key);
    return null;
  }
  function metadataCacheSet(key, data) {
    if (METADATA_CACHE.size >= METADATA_MAX) {
      const oldest = [...METADATA_CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100).map(([k]) => k);
      for (const k of oldest) METADATA_CACHE.delete(k);
    }
    METADATA_CACHE.set(key, { data, ts: Date.now() });
  }
  function isLatinText(str) {
    return /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()0-9]+$/.test(str);
  }
  function parseKitsuId(id) {
    const strId = String(id);
    return strId.match(/^kitsu:(\d+)(?::(\d+))?$/);
  }
  function searchTmdbByTitle(title, mediaType) {
    return __async(this, null, function* () {
      const type = mediaType === "movie" ? "movie" : "tv";
      const encoded = encodeURIComponent(title);
      const url = `${TMDB_API_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encoded}`;
      const res = yield safeFetch(url);
      if (!res) return null;
      let data;
      try {
        data = yield res.json();
      } catch (e) {
        return null;
      }
      const results = data == null ? void 0 : data.results;
      if (!results || !results.length) return null;
      return results[0].id;
    });
  }
  function getKitsuTitles(_0, _1) {
    return __async(this, arguments, function* (kitsuId, mediaType, opts = {}) {
      var _a, _b, _c, _d, _e, _f;
      const url = `https://kitsu.io/api/edge/anime/${kitsuId}`;
      const res = yield safeFetch(url);
      if (!res) {
        console.log(`[Metadata] Kitsu API error: failed to fetch ${kitsuId}`);
        return [];
      }
      let data;
      try {
        data = yield res.json();
      } catch (e) {
        console.log(`[Metadata] Kitsu API error: invalid JSON for ${kitsuId}`);
        return [];
      }
      const anime = (_a = data == null ? void 0 : data.data) == null ? void 0 : _a.attributes;
      if (!anime) {
        console.log(`[Metadata] Kitsu API error: no anime data for ${kitsuId}`);
        return [];
      }
      const enTitle = (_c = (_b = anime.titles) == null ? void 0 : _b.en) == null ? void 0 : _c.trim();
      if (enTitle) {
        const foundTmdbId = yield searchTmdbByTitle(enTitle, mediaType);
        if (foundTmdbId) {
          console.log(`[Metadata] Kitsu ${kitsuId} -> TMDB ${foundTmdbId} via "${enTitle}"`);
          return yield getTMDBTitlesById(String(foundTmdbId), mediaType, opts);
        }
      }
      const titles = [];
      const canonicalTitle = (_d = anime.canonicalTitle) == null ? void 0 : _d.trim();
      if (enTitle) titles.push(enTitle);
      if (canonicalTitle && !titles.some((t) => t.toLowerCase() === canonicalTitle.toLowerCase())) {
        titles.push(canonicalTitle);
      }
      const jaTitle = (_f = (_e = anime.titles) == null ? void 0 : _e.ja_jp) == null ? void 0 : _f.trim();
      if (jaTitle && !titles.some((t) => t.toLowerCase() === jaTitle.toLowerCase()) && isLatinText(jaTitle)) {
        titles.push(jaTitle);
      }
      const abbrTitles = anime.abbreviatedTitles || [];
      for (const t of abbrTitles) {
        const trimmed = t == null ? void 0 : t.trim();
        if (trimmed && !titles.some((existing) => existing.toLowerCase() === trimmed.toLowerCase()) && isLatinText(trimmed)) {
          titles.push(trimmed);
        }
      }
      const season = opts.season ? parseInt(opts.season, 10) : null;
      if (season && season > 0) {
        const baseTitles = [enTitle, canonicalTitle].filter(Boolean);
        for (const baseTitle of baseTitles) {
          for (const suffix of SEASON_SUFFIXES) {
            const variant = `${baseTitle} ${suffix(season)}`;
            if (!titles.some((t) => t.toLowerCase() === variant.toLowerCase())) {
              titles.push(variant);
            }
          }
        }
      }
      const dateStr = anime.startDate;
      const year = dateStr && dateStr.length >= 4 && /^\d{4}/.test(dateStr) ? parseInt(dateStr.substring(0, 4), 10) : null;
      titles._metadata = {
        isAnime: (anime.originalLanguage || "") === "ja",
        name: anime.canonicalTitle || "",
        originalLanguage: anime.originalLanguage || "",
        year
      };
      console.log(`[Metadata] Kitsu fallback titles for ${kitsuId}: ${titles.join(" | ")}`);
      return titles;
    });
  }
  function getTMDBTitlesById(_0, _1) {
    return __async(this, arguments, function* (tmdbId, mediaType, opts = {}) {
      var _a, _b, _c, _d, _e, _f;
      const type = mediaType === "movie" ? "movie" : "tv";
      const season = opts.season ? parseInt(opts.season, 10) : null;
      const cacheKey = `tmdb:${tmdbId}:${type}:${season || ""}`;
      const cached = metadataCacheGet(cacheKey);
      if (cached) {
        console.log(`[Metadata] Cache HIT for ${cacheKey}`);
        return cached;
      }
      const titles = [];
      let metadata = null;
      try {
        const mainUrl = `${TMDB_API_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
        const altUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;
        const transUrl = `${TMDB_API_BASE}/${type}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
        const [mainRes, altRes, transRes] = yield Promise.all([
          safeFetch(mainUrl),
          safeFetch(altUrl),
          safeFetch(transUrl)
        ]);
        if (mainRes) {
          const mainJson = yield mainRes.json();
          const data = mainJson != null ? mainJson : {};
          const titleEn = (_a = type === "movie" ? data.title : data.name) == null ? void 0 : _a.trim();
          const titleOriginal = (_b = type === "movie" ? data.original_title : data.original_name) == null ? void 0 : _b.trim();
          if (data) {
            const dateStr = type === "movie" ? data.release_date : data.first_air_date;
            const year = dateStr && dateStr.length >= 4 && /^\d{4}/.test(dateStr) ? parseInt(dateStr.substring(0, 4), 10) : null;
            metadata = {
              isAnime: data.original_language === "ja" || (data.genres || []).some((g) => g.id === 16),
              name: data.name || data.title || "",
              originalLanguage: data.original_language || "",
              year
            };
            if (type === "tv" && Array.isArray(data.seasons)) {
              const counts = {};
              for (const s of data.seasons) {
                if (s && s.season_number > 0 && s.episode_count > 0) {
                  counts[s.season_number] = s.episode_count;
                }
              }
              if (Object.keys(counts).length > 0) {
                metadata.seasonEpisodeCounts = counts;
              }
            }
          }
          if (titleEn) titles.push(titleEn);
          if (titleOriginal && titleOriginal !== titleEn && isLatinText(titleOriginal)) {
            titles.push(titleOriginal);
          }
          if (mediaType === "tv" && opts.season) {
            const s = parseInt(opts.season, 10);
            if (s > 0 && titleEn) {
              for (const suffix of SEASON_SUFFIXES) {
                const variant = `${titleEn} ${suffix(s)}`;
                if (!titles.includes(variant)) titles.push(variant);
              }
            }
            if (s > 0 && titleOriginal && titleOriginal !== titleEn && isLatinText(titleOriginal)) {
              for (const suffix of SEASON_SUFFIXES) {
                const variant = `${titleOriginal} ${suffix(s)}`;
                if (!titles.includes(variant)) titles.push(variant);
              }
            }
          }
        }
        if (altRes) {
          const altJson = yield altRes.json();
          const altData = altJson != null ? altJson : {};
          const altList = type === "movie" ? altData.titles : altData.results;
          if (altList && Array.isArray(altList)) {
            altList.forEach((alt) => {
              var _a2;
              const t = (_a2 = alt.title) == null ? void 0 : _a2.trim();
              if (t && !titles.some((existing) => existing.toLowerCase() === t.toLowerCase()) && isLatinText(t)) {
                titles.push(t);
              }
            });
          }
        }
        if (transRes) {
          const transJson = yield transRes.json();
          const transData = transJson != null ? transJson : {};
          const frTrans = (transData.translations || []).find((t) => t.iso_639_1 === "fr");
          const titleFr = ((_d = (_c = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _c.name) == null ? void 0 : _d.trim()) || ((_f = (_e = frTrans == null ? void 0 : frTrans.data) == null ? void 0 : _e.title) == null ? void 0 : _f.trim());
          if (titleFr && !titles.some((existing) => existing.toLowerCase() === titleFr.toLowerCase())) {
            titles.splice(1, 0, titleFr);
          }
          if (mediaType === "tv" && opts.season && titleFr) {
            const s = parseInt(opts.season, 10);
            if (s > 0) {
              const frVar = `${titleFr} Saison ${s}`;
              if (!titles.some((existing) => existing.toLowerCase() === frVar.toLowerCase())) {
                const frIndex = titles.indexOf(titleFr);
                if (frIndex !== -1) {
                  titles.splice(frIndex + 1, 0, frVar);
                } else {
                  titles.splice(2, 0, frVar);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(`[Metadata] TMDB API error: ${e.message}`);
      }
      const seen = /* @__PURE__ */ new Set();
      const uniqueTitles = titles.filter((t) => {
        const key = t.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (metadata) {
        uniqueTitles._metadata = metadata;
      }
      metadataCacheSet(cacheKey, uniqueTitles);
      console.log(`[Metadata] Titles for ${tmdbId}: ${uniqueTitles.join(" | ")}`);
      return uniqueTitles;
    });
  }
  function kitsuSearchFallback(tmdbName, mediaType, opts) {
    return __async(this, null, function* () {
      var _a, _b, _c, _d, _e, _f;
      try {
        if (!tmdbName || tmdbName.length < 3) return [];
        const season = opts.season ? parseInt(opts.season, 10) : null;
        const cacheKey = `kitsu-fb:${tmdbName.toLowerCase()}:${mediaType}:${season || ""}`;
        const cached = metadataCacheGet(cacheKey);
        if (cached) {
          console.log(`[Metadata] Kitsu fallback cache HIT for "${tmdbName}"`);
          return cached;
        }
        const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(tmdbName)}&page[limit]=5`;
        const res = yield safeFetch(url);
        if (!res) return [];
        const data = yield res.json();
        if (!((_a = data == null ? void 0 : data.data) == null ? void 0 : _a.length)) return [];
        for (const anime of data.data) {
          const attrs = anime.attributes || {};
          const jaTitle = (_c = (_b = attrs.titles) == null ? void 0 : _b.ja_jp) == null ? void 0 : _c.trim();
          const canonicalTitle = (_d = attrs.canonicalTitle) == null ? void 0 : _d.trim();
          const enTitle = ((_f = (_e = attrs.titles) == null ? void 0 : _e.en) == null ? void 0 : _f.trim()) || canonicalTitle;
          if (!jaTitle && attrs.originalLanguage !== "ja") continue;
          if (!enTitle) continue;
          console.log(`[Metadata] Kitsu search: "${tmdbName}" \u2192 "${enTitle}" (ja=${!!jaTitle})`);
          const foundTmdbId = yield searchTmdbByTitle(enTitle, mediaType);
          if (foundTmdbId) {
            const altTitles = yield getTMDBTitlesById(String(foundTmdbId), mediaType, opts);
            const meta = altTitles._metadata;
            if (meta && meta.isAnime) {
              console.log(`[Metadata] Fallback success: TMDB ID ${foundTmdbId} for "${enTitle}"`);
              metadataCacheSet(cacheKey, altTitles);
              return altTitles;
            }
          }
          console.log(`[Metadata] Fallback: using Kitsu titles directly for ${anime.id}`);
          const kitsuTitles = yield getKitsuTitles(anime.id, mediaType, opts);
          metadataCacheSet(cacheKey, kitsuTitles);
          return kitsuTitles;
        }
        console.log(`[Metadata] Kitsu search: no valid results for "${tmdbName}"`);
        return [];
      } catch (e) {
        console.warn(`[Metadata] Kitsu fallback error: ${e.message}`);
        return [];
      }
    });
  }
  function getTmdbTitles(_0, _1) {
    return __async(this, arguments, function* (id, mediaType, opts = {}) {
      const kitsuMatch = parseKitsuId(id);
      let effectiveSeason = opts.season != null ? opts.season : null;
      console.log(`[Metadata] getTmdbTitles: id="${id}" type="${mediaType}" season=${opts.season}`);
      if (kitsuMatch) {
        const kitsuId = kitsuMatch[1];
        const seasonFromId = kitsuMatch[2] ? parseInt(kitsuMatch[2], 10) : null;
        effectiveSeason = opts.season != null ? opts.season : seasonFromId;
        console.log(`[Metadata] Kitsu ID detected: ${kitsuId}, season=${effectiveSeason}`);
        const titles2 = yield getKitsuTitles(kitsuId, mediaType, __spreadProps(__spreadValues({}, opts), { season: effectiveSeason }));
        titles2.effectiveSeason = effectiveSeason;
        return titles2;
      }
      if (!id) {
        console.error(`[Metadata] Invalid/null TMDB ID received: "${id}"`);
        const emptyTitles = [];
        emptyTitles.effectiveSeason = effectiveSeason;
        return emptyTitles;
      }
      const titles = yield getTMDBTitlesById(id, mediaType, opts);
      if (mediaType === "tv" && titles.length > 0 && titles._metadata) {
        const meta = titles._metadata;
        if (!meta.isAnime) {
          console.warn(`[Metadata] \u26A0 ID ${id} = "${meta.name}" (${meta.originalLanguage}) - not anime!`);
          const hasJapaneseName = /[\u3000-\u9FFF\uF900-\uFAFF]/.test(meta.name || "");
          const hasJapaneseLang = meta.originalLanguage === "ja";
          if (hasJapaneseLang || hasJapaneseName) {
            const altTitles = yield kitsuSearchFallback(titles[0], mediaType, opts);
            if (altTitles.length > 0) {
              console.log(`[Metadata] Fallback success: ${altTitles.length} alternative titles`);
              altTitles.effectiveSeason = effectiveSeason;
              return altTitles;
            }
            console.warn(`[Metadata] Kitsu fallback failed for "${meta.name}", using original titles`);
          } else {
            console.log(`[Metadata] No anime indicators, skipping Kitsu fallback for "${meta.name}"`);
          }
        } else {
          console.log(`[Metadata] \u2713 ID ${id}: "${meta.name}" confirmed anime (${meta.originalLanguage})`);
        }
      }
      titles.effectiveSeason = effectiveSeason;
      return titles;
    });
  }
  var TMDB_API_KEY, TMDB_API_BASE, METADATA_CACHE, METADATA_TTL, METADATA_MAX, SEASON_SUFFIXES;
  var init_metadata = __esm({
    "src/utils/metadata.js"() {
      init_resolvers();
      TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
      TMDB_API_BASE = "https://api.themoviedb.org/3";
      METADATA_CACHE = /* @__PURE__ */ new Map();
      METADATA_TTL = 5 * 60 * 1e3;
      METADATA_MAX = 500;
      SEASON_SUFFIXES = [
        (s) => `Season ${s}`,
        (s) => `Saison ${s}`,
        (s) => `S${s}`
      ];
    }
  });

  // src/animevost-fr/index.js
  var require_index = __commonJS({
    "src/animevost-fr/index.js"(exports, module) {
      var { searchAndExtract } = require_extractor();
      var { getTmdbTitles: getTmdbTitles2 } = (init_metadata(), __toCommonJS(metadata_exports));
      function getStreams(tmdbId, mediaType, season, episode) {
        return __async(this, null, function* () {
          if (mediaType === "movie") return [];
          return getStreamsForAnime(tmdbId, season || 1, episode || 1);
        });
      }
      function getStreamsForAnime(tmdbId, season, episode) {
        return __async(this, null, function* () {
          try {
            const titles = yield getTmdbTitles2(tmdbId, "tv", season);
            if (!titles || titles.length === 0) return [];
            for (const title of titles) {
              const result = yield searchAndExtract(title, season, episode);
              if (result && result.length > 0) return result;
            }
            return [];
          } catch (e) {
            console.error(`[AnimeVostFR] Error: ${e.message}`);
            return [];
          }
        });
      }
      module.exports = { getStreams };
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
