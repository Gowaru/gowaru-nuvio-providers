/**
 * Extractor Logic for VoirAnime
 */

import { fetchText } from "./http.js";
import cheerio from "cheerio-without-node-native";
import { resolveStream } from "../utils/resolvers.js";
import { getImdbId, getAbsoluteEpisode } from "../utils/armsync.js";
import { getTmdbTitles } from "../utils/metadata.js";
const BASE_URL = "https://voir-anime.to";
const HEAD_TIMEOUT = 8000;
const PAGE_TIMEOUT = 15000;
const HOST_TIMEOUT = 12000;
const SEARCH_TIMEOUT = 20000;
const GLOBAL_TIMEOUT = 90000;

// Search result cache: avoids re-probing slugs for every episode
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 300000; // 5 minutes

// Known working host prefixes on VoirAnime; used to filter out slow/broken hosts
const KNOWN_HOSTS = ['myTV', 'Stape', 'Streamtape', 'Uqload', 'Vidzy', 'fsvid', 'Dood', 'Voe', 'Sendvid', 'Sibnet', 'Netu', 'Younetu', 'Vidoza', 'Vidmoly', 'Luluvid'];

/**
 * Simple sleep using micro-task yielding (works in QuickJS where setTimeout is unavailable)
 */
function sleep(ms) {
  const target = Date.now() + ms;
  return new Promise(resolve => {
    const check = () => Date.now() >= target ? resolve() : Promise.resolve().then(check);
    check();
  });
}

const RETRY_DELAYS = [500, 1000]; // delay (ms) before retry #1 and #2

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchText(url, options);
    } catch (err) {
      if (err.message && /HTTP error 4(?:0[0-9]|1[0-79]|29)/.test(err.message)) throw err;
      if (i === retries) throw err;
      if (RETRY_DELAYS[i] > 0) await sleep(RETRY_DELAYS[i]);
    }
  }
}

async function withGlobalTimeout(promise, ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    try {
      const signal = AbortSignal.timeout(ms);
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          if (signal.aborted) return reject(new Error('Page timeout'));
          signal.addEventListener('abort', () => reject(new Error('Page timeout')));
        })
      ]);
    } catch (e) {
      if (e.message === 'Page timeout') throw e;
    }
  }
  return promise;
}

/**
 * Clean title to create a slug
 */
function toSlug(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[':!.,?]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const ROMAN_MAP = { 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi", 7: "vii", 8: "viii" };
function toRoman(n) {
  return ROMAN_MAP[n] || "";
}

/**
 * Extract the base slug from a VoirAnime URL (strips season/vf suffixes)
 * e.g. ".../shingeki-no-kyojin-3-vf/" -> "shingeki-no-kyojin"
 * Returns null for OVA/special/film slugs so they are skipped.
 */
const SPECIAL_SLUG_RE =
  /(?:chronicle|ova|oav|gaiden|film|movie|lost-girls|kakusei|zenpen|kouhen|specials?|hors-serie|memories|recap|recaps|compilation)(?:-|$)/i;
function extractBaseSlug(url) {
  const m = url.match(/\/anime\/([^/]+)\//);
  if (!m) return null;
  let slug = m[1];
  // Skip slugs belonging to OVAs, films, specials, etc.
  if (SPECIAL_SLUG_RE.test(slug)) return null;
  let prev;
  do {
    prev = slug;
    slug = slug.replace(
      /(?:-\d+|-\d+-(?:vf|vostfr)|-(?:vf|vostfr)|-the-final-season|-saison-\d+|-(?:part|cour)-\d+)+$/i,
      "",
    );
  } while (slug !== prev);
  return slug.replace(/-+$/, "");
}

/**
 * Search for the anime slug on VoirAnime
 * @param {string} title
 * @param {number} season
 */
async function searchAnime(title, season = 1) {
  const baseSlug = toSlug(title);
  const baseSlugNoThe = baseSlug.startsWith("the-")
    ? baseSlug.substring(4)
    : baseSlug;

  // Season-aware slug candidates
  const slugCandidates = [];
  if (season === 1) {
    // For S1, try the bare slug without season suffix
    slugCandidates.push(baseSlug, baseSlugNoThe);
    // Also try with season 1 explicit and VF explicit (since some S1 are split logic or VF forced)
    slugCandidates.push(
      `${baseSlug}-1`,
      `${baseSlug}-1-vostfr`,
      `${baseSlug}-saison-1`,
      `${baseSlug}-vf`,
      `${baseSlug}-1-vf`,
    );
  } else {
    const romanSuffix = toRoman(season);
    slugCandidates.push(
      `${baseSlug}-${season}`,
      `${baseSlug}-${season}-vostfr`,
      `${baseSlug}-${season}-vf`,
      `${baseSlug}-saison-${season}`,
      `${baseSlug}-the-final-season`, // common S4 alias
    );
    if (romanSuffix) {
      slugCandidates.push(
        `${baseSlug}-${romanSuffix}`,
        `${baseSlug}-${romanSuffix}-vostfr`,
        `${baseSlug}-${romanSuffix}-vf`,
      );
    }
    slugCandidates.push(baseSlug, baseSlugNoThe);
  }
  // Also try without 's
  const slugNoApost = toSlug(title.replace(/'s/gi, ""));
  if (slugNoApost !== baseSlug) slugCandidates.push(slugNoApost);

  const allSlugs = [...new Set(slugCandidates.filter(Boolean))];
  console.log(`[VoirAnime] Probing slugs (S${season}): ${allSlugs.join(", ")}`);

  const probeResults = await Promise.allSettled(
    allSlugs.map(async (slug) => {
      const url = `${BASE_URL}/anime/${slug}/`;
      await fetchText(url, { method: "HEAD", timeout: HEAD_TIMEOUT });
      return {
        title:
          title +
          (slug.includes("vostfr")
            ? " VOSTFR"
            : slug.includes("vf")
              ? " VF"
              : ""),
        url: url,
      };
    })
  );

  const validPredictions = probeResults
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  if (validPredictions.length > 0) {
    console.log(`[VoirAnime] Predicted slugs found: ${validPredictions.map(v => v.url).join(", ")}`);
    return validPredictions;
  }

  // Fallback: keyword search
  try {
    const searchUrl = `${BASE_URL}/?post_type=wp-manga&s=${encodeURIComponent(title)}`;
    const html = await fetchText(searchUrl, { timeout: SEARCH_TIMEOUT });
    const $ = cheerio.load(html);

    const results = [];
    $(".post-title a, .c-image-hover a, h3.h5 a").each((i, el) => {
      const href = $(el).attr("href") || "";
      if (href.includes("/anime/") && !href.includes("/feed/")) {
        results.push({ title: $(el).text().trim(), url: href });
      }
    });

    console.log(`[VoirAnime] Search results: ${results.length}`);
    if (results.length === 0) return [];

    // Try to derive the base slug from search results and probe season-specific URLs
    const baseSlugsFromSearch = [
      ...new Set(results.map((r) => extractBaseSlug(r.url)).filter(Boolean)),
    ];
    const derivedProbes = [];
    for (const bs of baseSlugsFromSearch) {
      const romanSuffix = toRoman(season);
      const seasonSlugs =
        season === 1
          ? [bs, `${bs}-vf`, `${bs}-1`, `${bs}-1-vostfr`, `${bs}-1-vf`]
          : [
              `${bs}-${season}`,
              `${bs}-${season}-vostfr`,
              `${bs}-${season}-vf`,
              `${bs}-saison-${season}`,
              ...(romanSuffix ? [`${bs}-${romanSuffix}`, `${bs}-${romanSuffix}-vostfr`, `${bs}-${romanSuffix}-vf`] : []),
            ];
      for (const sl of seasonSlugs) {
        const url = `${BASE_URL}/anime/${sl}/`;
        derivedProbes.push(
          fetchText(url, { method: "HEAD", timeout: HEAD_TIMEOUT })
            .then(() => ({ title: title, url: url }))
            .catch(() => null)
        );
      }
    }
    const derivedResults = await Promise.allSettled(derivedProbes);
    const firstFound = derivedResults.find(r => r.status === "fulfilled" && r.value);
    if (firstFound) {
      console.log(`[VoirAnime] Derived slug found: ${firstFound.value.url}`);
      return [firstFound.value];
    }

    // Filter search results by season relevance
    const normalize = (s) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[':!.,?]/g, "")
        .replace(/\bthe\s+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const simplifiedTitle = normalize(title);

    // Season-score: higher = better match for requested season
    const scored = results
      .map((r) => {
        const u = r.url.toLowerCase();
        let score = 0;
        if (season === 1) {
          // Penalise URLs that explicitly have a season > 1
          const m = u.match(
            /\/anime\/[^/]+-(?:saison-)?(\d+)(?:-vf|-vostfr)?\//,
          );
          const urlSeason = m ? parseInt(m[1]) : null;
          if (urlSeason && urlSeason > 1) score -= 10;
          else if (!urlSeason) score += 5; // No season number = likely base/S1
        } else {
          if (
            u.includes(`-${season}-`) ||
            u.includes(`-${season}/`) ||
            u.includes(`-saison-${season}`)
          )
            score += 10;
          else if (u.includes(`-${season}`)) score += 5;
        }
        if (normalize(r.title).includes(simplifiedTitle)) score += 3;
        return { ...r, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      console.log(
        `[VoirAnime] Best search match (score=${scored[0].score}): ${scored[0].url}`,
      );
      return scored;
    }

    return results;
  } catch (e) {
    console.error(`[VoirAnime] Search error: ${e.message}`);
    return [];
  }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
  return withGlobalTimeout(_extractStreams(tmdbId, mediaType, season, episode), GLOBAL_TIMEOUT);
}

async function _extractStreams(tmdbId, mediaType, season, episode) {
  const titles = await getTmdbTitles(tmdbId, mediaType, { season });
  if (titles.length === 0) return [];

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

  // --- ARMSYNC Metadata Resolution ---
  let targetEpisodes = [episode || 1];
  try {
    const imdbId = await getImdbId(tmdbId, mediaType);
    if (imdbId) {
      const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
      if (absoluteEpisode && absoluteEpisode !== episode) {
        targetEpisodes.push(absoluteEpisode);
      }
    }
  } catch (e) {
    console.warn(`[VoirAnime] ArmSync failed: ${e.message}`);
  }
  // ------------------------------------

  // Check search cache for this tmdbId + season
  const cacheKey = `${tmdbId}-${effectiveSeason}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
    matches = cached.matches;
    fallbackMatches = cached.fallback;
    console.log(`[VoirAnime] Search cache hit for ${cacheKey} — ${matches.length} matches`);
  } else {
    // Try all titles in parallel, then check in order (EN first, then FR)
    const titleResults = await Promise.allSettled(
      titles.map(title => searchAnime(title, effectiveSeason))
    );
    for (const r of titleResults) {
      if (r.status !== 'fulfilled' || !r.value || r.value.length === 0) continue;
      const result = r.value;
      const hasExplicitSeason = result.some(m => {
        const s = m.url.match(/saison[_-](\d+)/i);
        return s && parseInt(s[1]) === effectiveSeason;
      });
      const hasNoSeason = result.some(m => !m.url.match(/saison[_-]\d+/i));
      if (hasExplicitSeason || hasNoSeason) {
        matches = result;
        break;
      }
      if (!fallbackMatches.length) fallbackMatches = result;
    }
    if (!matches.length) matches = fallbackMatches;

    if (matches && matches.length > 0) {
      SEARCH_CACHE.set(cacheKey, { ts: Date.now(), matches, fallback: fallbackMatches });
    }
  }

  if (!matches || matches.length === 0) return [];

  // Prioritize results that match the season if explicitly mentioned
  matches = matches.sort((a, b) => {
    const aT = a.title.toLowerCase();
    const bT = b.title.toLowerCase();
    const sMatch = `saison ${effectiveSeason}`;
    const hasA = aT.includes(sMatch);
    const hasB = bT.includes(sMatch);
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    return 0;
  });

  const streams = [];
  const checkedUrls = new Set();

  for (const match of matches) {
    if (checkedUrls.has(match.url)) continue;
    checkedUrls.add(match.url);

    const matchLower = match.title.toLowerCase();
    const animeUrl = match.url;
    const lang =
      match.title.toUpperCase().includes("VF") || animeUrl.includes("-vf")
        ? "VF"
        : "VOSTFR";

  // Optimization: if the result is explicitly for a different season,
  // skip it unless targetEpisodes contains an absolute episode,
  // OR if this is the last match to try (fallback mismatch allowed)
  const seasonMatch = matchLower.match(/saison\s*(\d+)/);
  if (
    seasonMatch &&
    parseInt(seasonMatch[1]) !== effectiveSeason &&
    targetEpisodes.length === 1
  ) {
    continue;
  }

  try {
      const html = await fetchWithRetry(animeUrl, { timeout: PAGE_TIMEOUT });
      const $ = cheerio.load(html);

      const paddings = ["", "0", "00"];
      const epPatterns = [];
      for (const ep of targetEpisodes) {
        const epS = ep.toString();
        paddings.forEach((p) => epPatterns.push(p + epS));
      }

      let episodeUrl = null;
      const epSelectors = [
        ".listing-chapters a",
        ".list-chapter a",
        ".wp-manga-chapter a",
        ".episodes a",
        "ul.episodes li a",
        ".episode-list a",
        "ul.main.version-chap.no-volumn li.wp-manga-chapter a",
        'a[href*="/episode/"]',
        'a[href*="/ep/"]'
      ];
      // First pass: try pattern matching on link text only (href may contain false positives like season numbers)
      for (const sel of epSelectors) {
        $(sel).each((i, el) => {
          if (episodeUrl) return false;
          const text = $(el).text().trim();
          // Strip "Saison X" / "Season X" labels to avoid false matches
          // e.g. "Overlord (Saison 1) - 01 VOSTFR - 01" should not match "1" on "Saison 1"
          const cleanText = text.replace(/\b[Ss](?:aison|eason)\s+\d+\b/g, '');
          const href = $(el).attr("href");
          for (const pattern of epPatterns) {
            const regex = new RegExp(`(?:^|[^0-9])${pattern}(?:$|[^0-9])`, "i");
            if (regex.test(cleanText)) {
              episodeUrl = href;
              return false;
            }
          }
        });
        if (episodeUrl) break;
      }

      // Second pass: fallback to auto-increment counter if pattern matching failed
      if (!episodeUrl) {
        const chapterLinks = [];
        $(".wp-manga-chapter a, ul.main.version-chap.no-volumn li.wp-manga-chapter a").each((i, el) => {
          chapterLinks.push($(el).attr("href"));
        });
        // Site lists episodes descending; reverse for ascending index mapping
        chapterLinks.reverse();
        for (const ep of targetEpisodes) {
          const idx = ep - 1;
          if (idx >= 0 && idx < chapterLinks.length) {
            episodeUrl = chapterLinks[idx];
            break;
          }
        }
      }

      if (!episodeUrl) continue;

      // Verify the found episode actually belongs to the requested season.
      // Skip check when absolute episode is available (site may number seasons differently than TMDB,
      // e.g., Overlord II is "saison-2" on site but season=1 on TMDB).
      const epSaisonMatch = episodeUrl.match(/saison[_-](\d+)/i);
      if (epSaisonMatch && parseInt(epSaisonMatch[1]) !== effectiveSeason && targetEpisodes.length === 1) {
        continue;
      }

      const epRawHtml = await fetchWithRetry(episodeUrl, { timeout: PAGE_TIMEOUT });
      const ep$ = cheerio.load(epRawHtml);

      const hosts = [];
      ep$('[name="host"] option, .host-select option').each((i, el) => {
        const val = ep$(el).val();
        if (val && val !== "Choisir un lecteur") hosts.push(val);
      });
      // Only keep known working hosts; this avoids wasting time on 60+ hosts that timeout
      const filteredHosts = hosts.filter(h => {
        const hl = h.toLowerCase();
        return KNOWN_HOSTS.some(prefix => hl.includes(prefix.toLowerCase())) &&
               !/YU|YourUpload|MOON\b|Lecteur\s+SB/i.test(h);
      });

      if (filteredHosts.length === 0) {
        // Catch any external iframe (not voiranime's own domain)
        let iframe = null;
        ep$("iframe").each((_, el) => {
          const src = ep$(el).attr("src") || "";
          if (src.startsWith("http") && !src.includes("voiranime.com")) {
            iframe = src;
            return false;
          }
        });
        if (iframe) {
          const stream = await resolveStream({
            name: `VoirAnime (${lang})`,
            title: `Default Player - ${lang}`,
            quality: "HD",
            url: iframe,
            headers: { Referer: BASE_URL, Origin: BASE_URL, "User-Agent": "Mozilla/5.0" },
          });
          if (stream) streams.push(stream);
        }
      } else {
        const streamHeaders = { Referer: BASE_URL, Origin: BASE_URL, "User-Agent": "Mozilla/5.0" };
        const hostPromises = filteredHosts.map(async (host) => {
          try {
            const hostUrl = `${episodeUrl}${episodeUrl.includes("?") ? "&" : "?"}host=${encodeURIComponent(host)}`;
            const hostHtml = await fetchText(hostUrl, { timeout: HOST_TIMEOUT });
            // Parse iframe src more flexibly (any attribute order)
            const iframeMatch = hostHtml.match(
              /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i,
            );
            let embedUrl = iframeMatch ? iframeMatch[1] : null;
            if (!embedUrl) {
              // Fallback: scan for any external embed URL in the page source
              const scriptMatch = hostHtml.match(
                /https?:\/\/[^"'\s<>]+\/(?:embed|e|v|player)\/[^"'\s<>]+/,
              );
              if (scriptMatch && !scriptMatch[0].includes("voiranime.com"))
                embedUrl = scriptMatch[0];
            }
            if (embedUrl) {
              return resolveStream({
                name: `VoirAnime (${lang})`,
                title: `${host} - ${lang}`,
                url: embedUrl,
                quality: "HD",
                headers: { ...streamHeaders },
              });
            }
          } catch (err) {}
          return null;
        });

        const resolvedHosts = await Promise.all(hostPromises);
        for (const stream of resolvedHosts) {
          if (stream) streams.push(stream);
        }
      }
    } catch (e) {}
  }

  // --- FALLBACK: if no direct streams found, retry with season-specific search ---
  const checkedEpisodeUrls = new Set();
  if (streams.filter(s => s && s.isDirect).length === 0 && matches.length > 0) {
    console.log(`[VoirAnime] No direct streams from initial matches, retrying with season-aware fallback`);
    const seasonStr = effectiveSeason ? String(effectiveSeason) : '';
    for (const match of matches) {
      if (checkedUrls.has(match.url)) continue;
      checkedUrls.add(match.url);

      const matchLower = match.title.toLowerCase();
      const matchHasSeason = matchLower.includes(`saison ${seasonStr}`);
      const urlHasSeason = match.url.includes(`-${seasonStr}-`) || match.url.includes(`-saison-${seasonStr}`);
      if (!matchHasSeason && !urlHasSeason) continue;

      const lang = match.title.toUpperCase().includes("VF") || match.url.includes("-vf") ? "VF" : "VOSTFR";

      try {
        const html = await fetchWithRetry(match.url, { timeout: PAGE_TIMEOUT });
        const $ = cheerio.load(html);
        const allLinks = [];
        $('.listing-chapters a, .list-chapter a, .wp-manga-chapter a, .episodes a, ul.episodes li a').each((i, el) => {
          const h = $(el).attr('href');
          if (h) allLinks.push(h);
        });
        if (allLinks.length === 0) continue;

        allLinks.reverse();
        for (const ep of targetEpisodes) {
          const idx = ep - 1;
          if (idx >= 0 && idx < allLinks.length) {
            const episodeUrl = allLinks[idx];
            if (checkedEpisodeUrls.has(episodeUrl)) continue;
            checkedEpisodeUrls.add(episodeUrl);

            const epRawHtml = await fetchWithRetry(episodeUrl, { timeout: PAGE_TIMEOUT });
            const ep$ = cheerio.load(epRawHtml);
            const hosts = [];
            ep$('[name="host"] option, .host-select option').each((i, el) => {
              const val = ep$(el).val();
              if (val && val !== "Choisir un lecteur") hosts.push(val);
            });
            const filteredHosts = hosts.filter(h => {
              const hl = h.toLowerCase();
              return KNOWN_HOSTS.some(prefix => hl.includes(prefix.toLowerCase())) &&
                     !/YU|YourUpload|MOON\b|Lecteur\s+SB/i.test(h);
            });

            if (filteredHosts.length === 0) {
              let iframe = null;
              ep$("iframe").each((_, el) => {
                const src = ep$(el).attr("src") || "";
                if (src.startsWith("http") && !src.includes("voiranime.com")) {
                  iframe = src;
                  return false;
                }
              });
              if (iframe) {
                const stream = await resolveStream({
                  name: `VoirAnime (${lang})`,
                  title: `Default Player - ${lang}`,
                  quality: "HD",
                  url: iframe,
                  headers: { Referer: BASE_URL, Origin: BASE_URL, "User-Agent": "Mozilla/5.0" },
                });
                if (stream) streams.push(stream);
              }
            } else {
              const streamHeaders = { Referer: BASE_URL, Origin: BASE_URL, "User-Agent": "Mozilla/5.0" };
              const hostPromises = filteredHosts.map(async (host) => {
                try {
                  const hostUrl = `${episodeUrl}${episodeUrl.includes("?") ? "&" : "?"}host=${encodeURIComponent(host)}`;
                  const hostHtml = await fetchText(hostUrl, { timeout: HOST_TIMEOUT });
                  const iframeMatch = hostHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
                  let embedUrl = iframeMatch ? iframeMatch[1] : null;
                  if (!embedUrl) {
                    const scriptMatch = hostHtml.match(/https?:\/\/[^"'\s<>]+\/(?:embed|e|v|player)\/[^"'\s<>]+/);
                    if (scriptMatch && !scriptMatch[0].includes("voiranime.com")) embedUrl = scriptMatch[0];
                  }
                  if (embedUrl) {
                    return resolveStream({
                      name: `VoirAnime (${lang})`,
                      title: `${host} - ${lang}`,
                      url: embedUrl,
                      quality: "HD",
                      headers: { ...streamHeaders },
                    });
                  }
                } catch (err) {}
                return null;
              });
              const resolvedHosts = await Promise.all(hostPromises);
              for (const s of resolvedHosts) {
                if (s) streams.push(s);
              }
            }
          }
        }
      } catch (e) {}
      if (streams.filter(s => s && s.isDirect).length > 0) break;
    }
  }

  const validStreams = streams.filter((s) => s && s.isDirect);
  console.log(`[VoirAnime] Total streams found: ${validStreams.length}`);

  // Sort streams to prioritize VF (French) over VOSTFR
  validStreams.sort((a, b) => {
    const isVf = (str) =>
      str &&
      (str.toUpperCase().includes("VF") ||
        str.toUpperCase().includes("FRENCH"));
    const aIsVf = isVf(a.name) || isVf(a.title);
    const bIsVf = isVf(b.name) || isVf(b.title);

    if (aIsVf && !bIsVf) return -1;
    if (!aIsVf && bIsVf) return 1;
    return 0;
  });

  return validStreams;
}
