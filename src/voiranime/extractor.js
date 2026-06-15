/**
 * Extractor Logic for VoirAnime
 * Modernized: WordPress search first, spinoff filtering, season-aware scoring
 */

import { fetchText } from "./http.js";
import cheerio from "cheerio-without-node-native";
import { resolveStream, isBudgetExhausted, sanitizeSearchQuery, sortStreamsByLanguage, sleep, fetchWithRetry } from "../utils/resolvers.js";
import { getImdbId, getAbsoluteEpisode } from "../utils/armsync.js";
import { getTmdbTitles } from "../utils/metadata.js";

const BASE_URL = "https://voir-anime.to";
const HEAD_TIMEOUT = 3000;
const PAGE_TIMEOUT = 12000;
const HOST_TIMEOUT = 8000;
const SEARCH_TIMEOUT = 15000;
const BUDGET_MS = 45000;
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 300000;

const KNOWN_HOSTS = ['myTV', 'Stape', 'Streamtape', 'Uqload', 'Vidzy', 'fsvid', 'Dood', 'Voe', 'Sendvid', 'Sibnet', 'Netu', 'Younetu', 'Vidoza', 'Vidmoly', 'Luluvid', 'Moon', 'FHD', 'SB'];

const SPINOFF_KEYWORDS = ['fan letter', 'log:', 'memories', 'vigilante', 'illegals', 'film', 'movie', 'special', 'oav', 'ona', 'x ut', 'collab'];

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
  // Try most likely numeric variants (e.g., overlord-4, overlord-4-vf)
  return [
    `${baseSlug}-${season}`,
    `${baseSlug}-${season}-vf`,
    `${baseSlug}-saison-${season}`,
    `${baseSlug}-saison-${season}-vf`,
  ].filter(Boolean);
}

function cleanSlug(slug) {
  // Strip season-related suffixes like "-2nd-season", "-season-2", "-part-1", etc.
  // so that "jujutsu-kaisen-2nd-season" becomes "jujutsu-kaisen"
  return slug
    .replace(/-(?:1st|2nd|3rd|4th|5th)-season$/, '')
    .replace(/-(?:season|saison)-?\d+$/, '')
    .replace(/-s\d+$/, '')
    .replace(/-(?:part|cour|arc|volume)-?\d+$/, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
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
  const searchStartTime = Date.now();
  
  function isProbeBudgetExhausted() {
    return Date.now() - searchStartTime >= 15000;
  }

  // --- STEP 0: Try season-specific slugs FIRST ---
  // Each season has its own page: /anime/overlord-4-vf/, etc.
  if (season > 1 && baseSlug.length > 3 && !isProbeBudgetExhausted()) {
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

  // --- STEP 0b: Try season-specific slugs from CLEANED slug ---
  // When the TMDB title has season info (e.g. "Jujutsu Kaisen 2nd Season"),
  // the base slug is "jujutsu-kaisen-2nd-season" and STEP 0 generates
  // "jujutsu-kaisen-2nd-season-2" which is wrong. The clean slug
  // "jujutsu-kaisen" with "-2" gives the correct "jujutsu-kaisen-2".
  if (season > 1 && results.length === 0 && !isProbeBudgetExhausted()) {
    const cleanBaseSlug = cleanSlug(baseSlug);
    if (cleanBaseSlug !== baseSlug && cleanBaseSlug.length > 3) {
      const cleanSlugs = generateFallbackSlugs(cleanBaseSlug, season);
      const cleanUrls = cleanSlugs.map(s => `${BASE_URL}/anime/${s}/`);
      const validCleanUrls = await batchProbe(cleanUrls, 2, 500);
      
      if (validCleanUrls.length > 0) {
        console.log(`[VoirAnime] Clean season-specific slugs found (${season}): ${validCleanUrls.join(', ')}`);
        validCleanUrls.forEach(url => {
          const lang = url.includes('-vf') ? 'VF' : 'VOSTFR';
          results.push({ title: `${title} S${season} ${lang}`, url });
        });
        return results;
      }
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

  // Step 1 slug probing failed — skip WordPress search (takes 15s and rarely finds
  // anything when the slug already failed on VoirAnime)
  return [];
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
 * Try to generate an episode URL by pattern from an existing episode link.
 * VoirAnime's Madara theme only shows the first 25 chapters in static HTML.
 * For S2+ episodes (absolute > 25), we infer the URL pattern and probe it.
 */
async function generateEpisodeUrl(html, targetEp, startTime) {
  const $ = cheerio.load(html);
  const firstLink = $('.wp-manga-chapter a').first();
  if (!firstLink.length) return null;
  
  const href = firstLink.attr('href') || '';
  // Pattern: /anime/{slug}/{prefix}-{N}{suffix}/
  // e.g. /anime/shingeki-no-kyojin/shingeki-no-kyojin-attaque-des-titans-25-vostfr/
  const match = href.match(/\/anime\/([^/]+)\/(.+?-)(\d+)(-v(?:ostfr|f))?\//);
  if (!match) return null;
  
  const slugName = match[1];
  const prefix = match[2];
  const suffix = match[4] || '';
  
  const paddings = ['', '0', '00'];
  for (const pad of paddings) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) break;
    const url = `https://voir-anime.to/anime/${slugName}/${prefix}${pad}${targetEp}${suffix}/`;
    try {
      await fetchText(url, { method: 'HEAD', timeout: HEAD_TIMEOUT });
      console.log(`[VoirAnime] Generated episode URL found: ${url}`);
      return url;
    } catch (e) {}
  }
  return null;
}

/**
 * Resolve all streams from an episode page
 */
async function resolveEpisodeStreams(episodeUrl, lang, streamHeaders) {
  try {
    const epRawHtml = await fetchWithRetry(() => fetchText(episodeUrl, { timeout: PAGE_TIMEOUT }));
    const allHosts = extractHosts(epRawHtml);

    const filteredHosts = allHosts.filter(h => {
      const hl = h.toLowerCase();
      return KNOWN_HOSTS.some(prefix => hl.includes(prefix.toLowerCase())) &&
             !/YU|YourUpload/i.test(h);
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
          // VoirAnime uses absolute numbering (all episodes on one page).
          // When ArmSync resolves a different absolute number, use only that.
          targetEpisodes = [absoluteEpisode];
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
    // Prioritize base titles (without season suffix) — they're more likely
    // to match the site's slug, especially for Japanese romanji titles
    const searchTitles = titles.slice(0, 15);
    const baseTitles = searchTitles.filter(t => !/\bS(?:eason|aison)?\s*\d/i.test(t));
    const seasonTitles = searchTitles.filter(t => /\bS(?:eason|aison)?\s*\d/i.test(t));
    for (const title of [...baseTitles, ...seasonTitles]) {
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
      const html = await fetchWithRetry(() => fetchText(match.url, { timeout: PAGE_TIMEOUT }));
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

  // Method 3: Pattern-based URL generation for episodes not in static HTML
  // VoirAnime only shows 25 episodes (S1) in the initial page. S2+ episodes
  // are loaded via JS. We infer the URL pattern and probe for the target.
  if (!episodeUrl && targetEpisodes.length > 0) {
    for (const ep of targetEpisodes) {
      if (isBudgetExhausted(startTime, BUDGET_MS)) break;
      const genUrl = await generateEpisodeUrl(html, ep, startTime);
      if (genUrl) {
        episodeUrl = genUrl;
        break;
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

  return sortStreamsByLanguage(validStreams);
}
