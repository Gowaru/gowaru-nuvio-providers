/**
 * Extractor Logic for VoirAnime
 * Modernized: WordPress search first, spinoff filtering, season-aware scoring
 */

import { fetchText } from "./http.js";
import cheerio from "cheerio-without-node-native";
import { resolveStream, isBudgetExhausted, sanitizeSearchQuery } from "../utils/resolvers.js";
import { getImdbId, getAbsoluteEpisode } from "../utils/armsync.js";
import { getTmdbTitles } from "../utils/metadata.js";

const BASE_URL = "https://voir-anime.to";
const HEAD_TIMEOUT = 8000;
const PAGE_TIMEOUT = 12000;
const HOST_TIMEOUT = 8000;
const SEARCH_TIMEOUT = 15000;
const BUDGET_MS = 45000;
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 300000;

const KNOWN_HOSTS = ['myTV', 'Stape', 'Streamtape', 'Uqload', 'Vidzy', 'fsvid', 'Dood', 'Voe', 'Sendvid', 'Sibnet', 'Netu', 'Younetu', 'Vidoza', 'Vidmoly', 'Luluvid'];

const SPINOFF_KEYWORDS = ['fan letter', 'log:', 'memories', 'vigilante', 'illegals', 'film', 'movie', 'special', 'oav', 'ona', 'x ut', 'collab'];

function sleep(ms) {
  const target = Date.now() + ms;
  return new Promise(resolve => {
    const check = () => Date.now() >= target ? resolve() : Promise.resolve().then(check);
    check();
  });
}

const RETRY_DELAYS = [1000, 3000];

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

function isSpinoff(title) {
  const t = title.toLowerCase();
  return SPINOFF_KEYWORDS.some(k => t.includes(k));
}

function normalizeForSearch(s) {
  return (s || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[':!.,?()[\]]/g, ' ')
    .replace(/\b(the|vostfr|vost|vf|french|streaming|anime)\s+/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Score search result: title match + season match + spinoff penalty
 */
function scoreSearchResult(resultTitle, resultUrl, searchTitle, searchSeason) {
  const nr = normalizeForSearch(resultTitle);
  const ns = normalizeForSearch(searchTitle);
  if (!nr || !ns) return 0;

  let score = 0;

  // Exact match
  if (nr === ns) score = 100;
  // One contains the other
  else if (nr.includes(ns) || ns.includes(nr)) score = 80;
  else {
    // Word overlap scoring
    const rWords = new Set(nr.split(/\s+/).filter(w => w.length > 2));
    const sWords = new Set(ns.split(/\s+/).filter(w => w.length > 2));
    if (rWords.size > 0 && sWords.size > 0) {
      let overlap = 0;
      for (const w of sWords) {
        if (rWords.has(w)) overlap++;
      }
      const maxLen = Math.max(rWords.size, sWords.size);
      score = Math.round((overlap / maxLen) * 50);
    }
  }

  // Spinoff penalty
  if (isSpinoff(resultTitle) || isSpinoff(resultUrl)) score -= 50;
  if (resultTitle.toLowerCase().includes('x ut')) score -= 30;

  // Season match bonus/penalty
  const seasonMatch = resultUrl.match(/[-](\d+)(?:-vf|-vostfr)?\/?$/);
  const saisonMatch = resultUrl.match(/saison[_-](\d+)/i);
  const urlSeason = seasonMatch ? parseInt(seasonMatch[1]) : (saisonMatch ? parseInt(saisonMatch[1]) : null);

  if (urlSeason !== null) {
    if (urlSeason === searchSeason) score += 20;
    else score -= 40; // Wrong season = strong penalty
  } else if (searchSeason === 1) {
    // No explicit season in URL + searching S1 = good
    score += 10;
  }

  return Math.max(score, 0);
}

/**
 * Extract season number from episode link text or URL
 * Returns null if no season info found.
 */
function extractSeasonFromEpisodeLink(text, url) {
  const combined = `${text || ''} ${url || ''}`;
  // Pattern: "Saison 2", "Season 2", "saison-2", "S2"
  const match = combined.match(/S(?:aison|eason)\s*[:\(\s-]*\s*(\d+)/i) ||
                combined.match(/saison[_-](\d+)/i) ||
                combined.match(/S(\d+)\s*(?:E|V|VF|VOSTFR|\b)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

/**
 * Generate season-aware slug variants for fallback probing
 * Ordered by priority (most likely first)
 */
function generateFallbackSlugs(baseSlug, season) {
  const slugs = [];
  
  if (season === 1) {
    // Season 1: try generic slug, VF, and with -1 suffix
    slugs.push(baseSlug, `${baseSlug}-vf`);
    slugs.push(`${baseSlug}-1`, `${baseSlug}-1-vf`, `${baseSlug}-vostfr`);
    slugs.push(`${baseSlug}-saison-1`, `${baseSlug}-saison-1-vf`);
  } else {
    const romanSuffix = toRoman(season);
    
    // Try numeric first (Overlord 4), then roman (Overlord II, III)
    slugs.push(
      `${baseSlug}-${season}`,
      `${baseSlug}-${season}-vf`,
      `${baseSlug}-${season}-vostfr`,
      `${baseSlug}-saison-${season}`,
      `${baseSlug}-saison-${season}-vf`,
    );
    
    // Roman numeral variants for S2, S3
    if (romanSuffix) {
      slugs.push(
        `${baseSlug}-${romanSuffix}`,
        `${baseSlug}-${romanSuffix}-vf`,
        `${baseSlug}-${romanSuffix}-vostfr`,
      );
    }
  }
  
  return [...new Set(slugs)].filter(Boolean);
}

/**
 * Batch HEAD probe with delay (Cloudflare-safe)
 */
async function batchProbe(urls, batchSize = 2, delayMs = 800) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        await fetchText(url, { method: "HEAD", timeout: HEAD_TIMEOUT });
        return url;
      })
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
    if (i + batchSize < urls.length) await sleep(delayMs);
  }
  return results;
}

/**
 * Search for anime on VoirAnime
 * Priority: 1) Season-specific slug probing, 2) WordPress search (scored + filtered), 3) Generic slug fallback
 * Returns ALL matching variants (VF + VOSTFR) when both exist.
 */
async function searchAnime(title, season = 1) {
  const baseSlug = toSlug(title);
  const results = [];

  // --- STEP 0: Try season-specific slugs FIRST ---
  // Each season has its own page: /anime/overlord-ii/, /anime/overlord-4-vf/, etc.
  if (season > 1 && baseSlug.length > 3) {
    const seasonSlugs = generateFallbackSlugs(baseSlug, season);
    const seasonUrls = seasonSlugs.map(s => `${BASE_URL}/anime/${s}/`);
    const validSeasonUrls = await batchProbe(seasonUrls, 2, 500);
    
    if (validSeasonUrls.length > 0) {
      console.log(`[VoirAnime] Season-specific slugs found (${season}): ${validSeasonUrls.join(', ')}`);
      validSeasonUrls.forEach(url => {
        const lang = url.includes('-vf') ? 'VF' : 'VOSTFR';
        results.push({ title: `${title} S${season} ${lang}`, url });
      });
      return results;
    }
  }

  // --- STEP 1: Try generic slug AND its VF variant ---
  if (baseSlug.length > 3) {
    // 1a: Try base slug (VOSTFR)
    const exactUrl = `${BASE_URL}/anime/${baseSlug}/`;
    try { 
      await fetchText(exactUrl, { method: "HEAD", timeout: HEAD_TIMEOUT });
      console.log(`[VoirAnime] Generic slug found: ${exactUrl}`);
      results.push({ title, url: exactUrl });
      
      // 1b: Try VF variant of the generic slug
      const exactVfUrl = `${BASE_URL}/anime/${baseSlug}-vf/`;
      try { 
        await sleep(300); 
        await fetchText(exactVfUrl, { method: "HEAD", timeout: HEAD_TIMEOUT });
        console.log(`[VoirAnime] Generic VF slug found: ${exactVfUrl}`);
        results.push({ title: `${title} VF`, url: exactVfUrl });
      } catch (e) {}
      
      return results;
    } catch (e) {}
    
    // 1c: Only VF variant exists
    const exactVfUrl2 = `${BASE_URL}/anime/${baseSlug}-vf/`;
    try { 
      await sleep(300); 
      await fetchText(exactVfUrl2, { method: "HEAD", timeout: HEAD_TIMEOUT });
      console.log(`[VoirAnime] VF-only slug found: ${exactVfUrl2}`);
      results.push({ title: `${title} VF`, url: exactVfUrl2 });
      return results;
    } catch (e) {}
  }

  // --- STEP 2: WordPress search with scoring ---
  try {
    const searchUrl = `${BASE_URL}/?post_type=wp-manga&s=${encodeURIComponent(sanitizeSearchQuery(title))}`;
    const html = await fetchText(searchUrl, { timeout: SEARCH_TIMEOUT });
    const $ = cheerio.load(html);

    const rawResults = [];
    $('h3.h4 a, .post-title a, h3 a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href.includes('/anime/') && text.length > 2) {
        rawResults.push({ title: text, url: href.startsWith('http') ? href : `${BASE_URL}${href}` });
      }
    });

    if (rawResults.length > 0) {
      const scored = rawResults
        .map(r => ({ ...r, score: scoreSearchResult(r.title, r.url, title, season) }))
        .filter(r => r.score >= 30)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0 && scored[0].score >= 50) {
        // Collect ALL high-scoring results (both VF and VOSTFR variants)
        const bestResults = scored.filter(r => r.score >= 50);
        console.log(`[VoirAnime] Search results (${bestResults.length}): ${bestResults.map(r => `"${r.title}"(${r.score})`).join(', ')}`);
        return bestResults.map(r => ({ title: r.title, url: r.url }));
      } else if (scored.length > 0) {
        console.log(`[VoirAnime] Search best score too low (${scored[0].score}), falling through to slug probing`);
      }
    }
  } catch (e) {
    console.warn(`[VoirAnime] Search failed: ${e.message}`);
  }

  // --- STEP 3: Raw title search (for hyphens etc.) ---
  if (title !== sanitizeSearchQuery(title)) {
    try {
      const rawUrl = `${BASE_URL}/?post_type=wp-manga&s=${encodeURIComponent(title)}`;
      const html = await fetchText(rawUrl, { timeout: SEARCH_TIMEOUT });
      const $ = cheerio.load(html);
      const rawResults = [];
      $('h3.h4 a, .post-title a, h3 a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (href.includes('/anime/') && text.length > 2) {
          rawResults.push({ title: text, url: href.startsWith('http') ? href : `${BASE_URL}${href}` });
        }
      });
      if (rawResults.length > 0) {
        const scored = rawResults
          .map(r => ({ ...r, score: scoreSearchResult(r.title, r.url, title, season) }))
          .filter(r => r.score >= 30)
          .sort((a, b) => b.score - a.score);
      if (scored.length > 0 && scored[0].score >= 50) {
        const bestResults = scored.filter(r => r.score >= 50);
        console.log(`[VoirAnime] Raw search results (${bestResults.length}): ${bestResults.map(r => `"${r.title}"(${r.score})`).join(', ')}`);
        return bestResults.map(r => ({ title: r.title, url: r.url }));
      }
      }
    } catch (e) {}
  }

  // --- STEP 4: Slug probing fallback (all variants) ---
  console.log(`[VoirAnime] All searches failed, fallback to slug probing`);
  const fallbackUrls = generateFallbackSlugs(baseSlug, season).map(s => `${BASE_URL}/anime/${s}/`);
  const validUrls = await batchProbe(fallbackUrls);
  return validUrls.map(url => {
    const lang = url.includes('-vf') ? 'VF' : 'VOSTFR';
    return { title: `${title} ${lang}`, url };
  });
}

/**
 * Extract host options from episode page HTML
 */
function extractHosts(html) {
  const urls = [];
  const regex = /<option[^>]*value="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const val = m[1];
    if (val && val !== "Choisir un lecteur") urls.push(val);
  }
  return urls;
}

/**
 * Resolve a single host URL to a stream
 */
async function resolveHost(host, episodeUrl, lang, streamHeaders) {
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
}

/**
 * Resolve all streams from an episode page
 */
async function resolveEpisodeStreams(episodeUrl, lang, streamHeaders) {
  try {
    const epRawHtml = await fetchWithRetry(episodeUrl, { timeout: PAGE_TIMEOUT });
    const allHosts = extractHosts(epRawHtml);

    const filteredHosts = allHosts.filter(h => {
      const hl = h.toLowerCase();
      return KNOWN_HOSTS.some(prefix => hl.includes(prefix.toLowerCase())) &&
             !/YU|YourUpload|MOON\b|Lecteur\s+SB/i.test(h);
    });

    if (filteredHosts.length === 0) {
      // Try direct iframe
      const $ = cheerio.load(epRawHtml);
      let iframe = null;
      $("iframe").each((_, el) => {
        const src = $(el).attr("src") || "";
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
        if (stream) return [stream];
      }
      return [];
    }

    const hostPromises = filteredHosts.map(host => resolveHost(host, episodeUrl, lang, streamHeaders));
    const resolved = await Promise.all(hostPromises);
    return resolved.filter(Boolean);
  } catch (e) {
    return [];
  }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
  const titles = await getTmdbTitles(tmdbId, mediaType, { season });
  if (titles.length === 0) return [];

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
  const startTime = Date.now();

  // ArmSync: try to get absolute episode
  let targetEpisodes = [episode || 1];
  if (!isBudgetExhausted(startTime, BUDGET_MS)) {
    try {
      const imdbId = await getImdbId(tmdbId, mediaType);
      if (imdbId && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
        if (absoluteEpisode && absoluteEpisode !== episode) {
          targetEpisodes.push(absoluteEpisode);
        }
      }
    } catch (e) {
      console.warn(`[VoirAnime] ArmSync failed: ${e.message}`);
    }
  }

  // Search cache
  const cacheKey = `${tmdbId}-${effectiveSeason}`;
  let matches = [];
  if (SEARCH_CACHE.has(cacheKey) && Date.now() - SEARCH_CACHE.get(cacheKey).ts < SEARCH_CACHE_TTL) {
    matches = SEARCH_CACHE.get(cacheKey).matches || [];
    console.log(`[VoirAnime] Search cache hit for ${cacheKey}`);
  } else {
    for (const title of titles.slice(0, 3)) {
      // Search with the effective season to find the season-specific page
      // (the site uses separate pages per season: /anime/title-ii/, /anime/title-4-vf/, etc.)
      const result = await searchAnime(title, effectiveSeason);
      if (result && result.length > 0) {
        matches = result;
        break;
      }
    }
    if (matches.length > 0) {
      SEARCH_CACHE.set(cacheKey, { ts: Date.now(), matches });
    }
  }

  if (matches.length === 0) return [];

  const streams = [];
  const checkedUrls = new Set();
  const streamHeaders = { Referer: BASE_URL, Origin: BASE_URL, "User-Agent": "Mozilla/5.0" };

  for (const match of matches) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) break;
    if (checkedUrls.has(match.url)) continue;
    checkedUrls.add(match.url);

    const lang = match.title.toUpperCase().includes("VF") || match.url.includes("-vf") ? "VF" : "VOSTFR";

    try {
      const html = await fetchWithRetry(match.url, { timeout: PAGE_TIMEOUT });
      const $ = cheerio.load(html);

      // Find episode links
      const paddings = ["", "0", "00"];
      const epPatterns = [];
      for (const ep of targetEpisodes) {
        const epS = ep.toString();
        paddings.forEach(p => epPatterns.push(p + epS));
      }

      let episodeUrl = null;

      // Method 1: Pattern match on link text with season validation
      const epSelectors = [
        ".listing-chapters a",
        ".list-chapter a",
        ".wp-manga-chapter a",
        ".episodes a",
        "ul.episodes li a",
        ".episode-list a",
        "ul.main.version-chap.no-volumn li.wp-manga-chapter a",
        'a[href*="/episode/"]',
        'a[href*="/ep/"]',
      ];

      // Determine the expected season from the page URL and the requested season
      // Each season page may have episodes for only that season
      for (const sel of epSelectors) {
        $(sel).each((i, el) => {
          if (episodeUrl) return false;
          const text = $(el).text().trim();
          const href = $(el).attr("href") || '';
          
          // Verify the linked episode doesn't belong to a different season/type
          if (href.includes('/special') || href.includes('/oav') || href.includes('/film') || href.includes('/ova')) return;
          
          // Extract season from link text/URL to validate it matches the target season
          const linkSeason = extractSeasonFromEpisodeLink(text, href);
          if (linkSeason !== null && linkSeason !== effectiveSeason) return; // Wrong season, skip
          
          // Strip season indicators to avoid matching "Saison 1" as episode 1
          const cleanText = text.replace(/S(?:aison|eason)\s*\d+/ig, '').trim();
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

  // Method 2: Fallback by extracting episode number from URL
  if (!episodeUrl) {
    const chapterLinks = [];
    $(".wp-manga-chapter a, ul.main.version-chap.no-volumn li.wp-manga-chapter a").each((i, el) => {
      const href = $(el).attr("href") || '';
      const text = $(el).text().trim();
      if (href && !href.includes('/special') && !href.includes('/oav') && !href.includes('/film') && !href.includes('/ova')) {
        const linkSeason = extractSeasonFromEpisodeLink(text, href);
        if (linkSeason === null || linkSeason === effectiveSeason) {
          chapterLinks.push({ href, text });
        }
      }
    });
    for (const ep of targetEpisodes) {
      for (const link of chapterLinks) {
        const epFromHref = link.href.match(/[-/]0*(\d+)(?:-v(?:ostfr|f))?(?:\/|$)/i);
        if (epFromHref && parseInt(epFromHref[1], 10) === ep) {
          episodeUrl = link.href;
          break;
        }
      }
      if (episodeUrl) break;
    }
    // Final fallback: index-based access (try both orders)
    if (!episodeUrl && chapterLinks.length > 0) {
      const hrefs = chapterLinks.map(l => l.href);
      for (const ep of targetEpisodes) {
        const idx = ep - 1;
        if (idx >= 0 && idx < hrefs.length) {
          episodeUrl = hrefs[idx];
          break;
        }
      }
    }
  }

      if (!episodeUrl) continue;

      // Resolve streams
      const epStreams = await resolveEpisodeStreams(episodeUrl, lang, streamHeaders);
      streams.push(...epStreams);

    } catch (e) {}
  }

  const validStreams = streams.filter(s => s && s.isDirect);
  console.log(`[VoirAnime] Total streams: ${validStreams.length}`);

  // Sort VF first
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
