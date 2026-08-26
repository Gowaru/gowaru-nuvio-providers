/**
 * Extractor Logic for French-Anime.com
 * DataLife Engine (DLE) CMS — même structure que VoirAnime/AnimesUltra
 *
 * Patterns DLE identifiés :
 *   - Categories: /animes-vf/, /animes-vostfr/, /exclue/
 *   - URLs: /{category}/{id}-{slug}.html
 *   - Episodes: navigation via boutons prev/next (new_player_selector_box)
 *   - Embeds: iframes VidMoly, Luluvid, SaveFiles, HGCloud, Up4Fun
 */

import { fetchText, setCurrentSignal } from "./http.js";
import cheerio from "cheerio-without-node-native";
import {
  resolveStream, isBudgetExhausted, sanitizeSearchQuery,
  sortStreamsByLanguage, sleep, fetchWithRetry, isAborted,
  safeFetch, USER_AGENT
} from "../utils/resolvers.js";
import { toSlug, resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { getTmdbTitles } from "../utils/metadata.js";
import { CONFIG } from "./config.js";

const PAGE_TIMEOUT = 10000;
const HOST_TIMEOUT = 8000;
const PROBE_TIMEOUT = 6000;
const BUDGET_MS = 45000;
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 300000;
const slugProbeCache = new Map();

// Embeds résolvables par le resolver universel du repo
const RESOLVABLE_HOSTS = [
  'vidmoly', 'voembed', 'luluvid', 'lulu.', 'lulustream', 'luluvdo',
  'savefiles', 'hgcloud', 'up4fun', 'streamtape', 'uqload', 'oneupload',
  'fsvid', 'vidzy', 'sendvid', 'sibnet', 'mail.ru', 'dood', 'moonplayer', 'filemoon',
  'younetu', 'netu', 'vidoza', 'veev', 'wishonly',
];

// Embeds morts / SPA impossible à résoudre sans navigateur
const DEAD_HOSTS = ['streamhide', 'parklogic', 'ds2play', 'bigwar5', 'voe.sx'];

// Placeholders anti-bot
const PLACEHOLDER_IFRAMES = [
  'youtube.com/embed', 'youtu.be/', 'facebook.com/plugins',
  'twitter.com/i/videos', 'ok.ru/videoembed',
];

// Mots spinoff à pénaliser
const SPINOFF_KEYWORDS = [
  'fan letter', 'log:', 'memories', 'vigilante', 'illegals',
  'film', 'movie', 'special', 'oav', 'ona',
];

// Patterns d'épisodes DLE (adaptés french-anime.com)
const EPISODE_SELECTORS = [
  '.episode-list a',
  '.episodes a',
  '.listing-chapters a',
  '.list-chapter a',
  '.chapter-list a',
  'a[href*="episode"]',
  'a[href*="ep-"]',
  'a[href*="-0"]',
];

function isSpinoff(title) {
  const t = (title || '').toLowerCase();
  return SPINOFF_KEYWORDS.some(k => t.includes(k));
}

function expandMacrons(s) {
  if (!s) return s;
  let out = '';
  for (const ch of s) {
    const d = ch.normalize('NFD');
    if (d.length > 1 && d.includes('\u0304') && 'aeiouAEIOU'.includes(d[0])) out += d[0] + d[0];
    else out += ch;
  }
  return out;
}

function normalizeForSearch(s) {
  return (s || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[':!.,?()\[\]]/g, ' ')
    .replace(/\b(the|vostfr|vost|vf|french|streaming|anime)\s+/g, '')
    .replace(/\s+/g, ' ').trim();
}

function scoreSearchResult(resultTitle, resultUrl, searchTitle, searchSeason) {
  const nr = normalizeForSearch(resultTitle);
  const ns = normalizeForSearch(searchTitle);
  if (!nr || !ns) return 0;

  let score = 0;
  if (nr === ns) score = 100;
  else if (nr.includes(ns) || ns.includes(nr)) score = 80;
  else {
    const rWords = new Set(nr.split(/\s+/).filter(w => w.length > 2));
    const sWords = new Set(ns.split(/\s+/).filter(w => w.length > 2));
    if (rWords.size > 0 && sWords.size > 0) {
      let overlap = 0;
      for (const w of sWords) { if (rWords.has(w)) overlap++; }
      score = Math.round((overlap / Math.max(rWords.size, sWords.size)) * 50);
    }
  }

  if (isSpinoff(resultTitle) || isSpinoff(resultUrl)) score -= 50;

  // Season matching from URL
  const seasonMatch = resultUrl.match(/[-](\d+)(?:-vf|-vostfr)?\.html/);
  const urlSeason = seasonMatch ? parseInt(seasonMatch[1]) : null;
  if (urlSeason !== null) {
    if (urlSeason === searchSeason) score += 20;
    else score -= 40;
  } else if (searchSeason === 1) {
    score += 10;
  }

  return Math.max(score, 0);
}

function extractSeasonFromEpisodeLink(text, url) {
  const combined = `${text || ''} ${url || ''}`;
  const match = combined.match(/S(?:aison|eason)\s*[:\(\s-]*\s*(\d+)/i) ||
                combined.match(/saison[_-](\d+)/i) ||
                combined.match(/S(\d+)\s*(?:E|V|VF|VOSTFR|\b)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

// ─── Probe / batch probe ─────────────────────────────────────────────────

async function probeUrl(url) {
  if (slugProbeCache.has(url)) return slugProbeCache.get(url);
  const res = await safeFetch(url, { method: "GET", timeout: PROBE_TIMEOUT });
  if (!res || !res.ok) {
    slugProbeCache.set(url, false);
    return false;
  }
  const finalUrl = res.url || url;
  if (finalUrl !== url) {
    const origPath = url.replace(/https?:\/\/[^/]+/, '');
    const finalPath = finalUrl.replace(/https?:\/\/[^/]+/, '');
    if (origPath !== finalPath) {
      slugProbeCache.set(url, false);
      return false;
    }
  }
  slugProbeCache.set(url, true);
  return true;
}

async function batchProbe(urls, batchSize = 5) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        const ok = await probeUrl(url);
        return ok ? url : null;
      })
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
    if (results.length > 0) return results; // Early exit
  }
  return results;
}

// ─── Search ───────────────────────────────────────────────────────────────

function generateFallbackSlugs(baseSlug, season, year) {
  const slugs = [
    `${baseSlug}-${season}`,
    `${baseSlug}-${season}-vf`,
    `${baseSlug}-saison-${season}`,
  ];
  if (year) {
    slugs.push(`${baseSlug}-${year}`);
    slugs.push(`${baseSlug}-${year}-vf`);
  }
  return slugs.filter(Boolean);
}

function cleanSlug(slug) {
  return slug
    .replace(/-(?:1st|2nd|3rd|4th|5th)-season$/, '')
    .replace(/-(?:season|saison)-?\d+$/, '')
    .replace(/-s\d+$/, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

async function dleSearch(query, season) {
  try {
    const searchUrl = `${CONFIG.BASE_URL}/?do=search&subaction=search&story=${encodeURIComponent(sanitizeSearchQuery(query))}`;
    const html = await fetchText(searchUrl, { timeout: 8000 });
    if (!html) return [];

    const $ = cheerio.load(html);
    const results = [];

    // DLE search: liens vers les pages .html dans les catégories animes
    $('a[href*=".html"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (text && href && (href.includes('/animes-') || href.includes('/exclue/'))) {
        const fullUrl = href.startsWith('http') ? href : `${CONFIG.BASE_URL}${href}`;
        const score = scoreSearchResult(text, fullUrl, query, season);
        if (score >= 30 && !results.some(r => r.url === fullUrl)) {
          results.push({ title: text, url: fullUrl, score });
        }
      }
    });

    results.sort((a, b) => b.score - a.score);
    const best = results.filter(r => r.score >= 30).slice(0, 4);
    console.log(`[FrenchAnime] DLE search for "${query}": ${best.length} results`);
    return best.map(r => ({ title: r.title, url: r.url }));
  } catch (e) {
    console.warn(`[FrenchAnime] DLE search failed: ${e?.message}`);
    return [];
  }
}

async function searchAnime(title, season = 1, year) {
  const baseSlug = toSlug(title);
  const results = [];
  const searchStartTime = Date.now();

  function isProbeBudgetExhausted() {
    return Date.now() - searchStartTime >= 15000;
  }

  // STEP 0: Season-specific slugs for S2+
  if (season > 1 && baseSlug.length > 3 && !isProbeBudgetExhausted()) {
    const seasonSlugs = generateFallbackSlugs(baseSlug, season, year);
    const seasonUrls = seasonSlugs.flatMap(s => [
      `${CONFIG.BASE_URL}/animes-vostfr/${s}.html`,
      `${CONFIG.BASE_URL}/animes-vf/${s}.html`,
    ]);
    const validUrls = await batchProbe(seasonUrls, 2);
    if (validUrls.length > 0) {
      console.log(`[FrenchAnime] Season slugs found (S${season}): ${validUrls}`);
      validUrls.forEach(url => {
        const lang = url.includes('/animes-vf/') ? 'VF' : 'VOSTFR';
        results.push({ title: `${title} S${season} ${lang}`, url });
      });
      return results;
    }
  }

  // STEP 1: Generic slug
  if (baseSlug.length > 3 && !isProbeBudgetExhausted()) {
    const urls = [
      `${CONFIG.BASE_URL}/animes-vostfr/${baseSlug}.html`,
      `${CONFIG.BASE_URL}/animes-vf/${baseSlug}.html`,
      `${CONFIG.BASE_URL}/exclue/${baseSlug}.html`,
    ];
    const validUrls = await batchProbe(urls, 2);
    if (validUrls.length > 0) {
      validUrls.forEach(url => {
        const lang = url.includes('/animes-vf/') ? 'VF' : 'VOSTFR';
        results.push({ title, url });
      });
      return results;
    }
  }

  // STEP 1.5: Macron-expanded slugs
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const expandedSlug = toSlug(expandMacrons(title));
    if (expandedSlug !== baseSlug && expandedSlug.length > 3) {
      const urls = [
        `${CONFIG.BASE_URL}/animes-vostfr/${expandedSlug}.html`,
        `${CONFIG.BASE_URL}/animes-vf/${expandedSlug}.html`,
      ];
      const validUrls = await batchProbe(urls, 2);
      if (validUrls.length > 0) {
        validUrls.forEach(url => {
          const lang = url.includes('/animes-vf/') ? 'VF' : 'VOSTFR';
          results.push({ title, url });
        });
        return results;
      }
    }
  }

  // STEP 1.6: Cleaned slug (sans caractères spéciaux)
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const cleanBase = cleanSlug(baseSlug);
    if (cleanBase !== baseSlug && cleanBase.length > 3) {
      const urls = [
        `${CONFIG.BASE_URL}/animes-vostfr/${cleanBase}.html`,
        `${CONFIG.BASE_URL}/animes-vf/${cleanBase}.html`,
      ];
      const validUrls = await batchProbe(urls, 2);
      if (validUrls.length > 0) {
        validUrls.forEach(url => {
          const lang = url.includes('/animes-vf/') ? 'VF' : 'VOSTFR';
          results.push({ title, url });
        });
        return results;
      }
    }
  }

  // STEP 2: DLE search
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const searchResults = await dleSearch(title, season);
    for (const r of searchResults) {
      if (!results.some(ex => ex.url === r.url)) {
        results.push({ ...r });
      }
    }
    if (results.length > 0) return results;
  }

  // STEP 3: DLE search with short keywords
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const longWords = title.split(/\s+/).filter(w => w.length > 2);
    const keywordQueries = [
      longWords.slice(-2).join(' '),
      longWords.slice(0, 2).join(' '),
    ];
    const seen = new Set();
    const unique = keywordQueries.filter(q => {
      if (!q || seen.has(q.toLowerCase())) return false;
      seen.add(q.toLowerCase());
      return true;
    });
    if (unique.length > 0) {
      const searchResults = await Promise.allSettled(
        unique.map(q => dleSearch(q, season))
      );
      for (const r of searchResults) {
        if (r.status === 'fulfilled') {
          for (const res of r.value) {
            if (!results.some(ex => ex.url === res.url)) results.push({ ...res });
          }
        }
      }
      if (results.length > 0) return results;
    }
  }

  return [];
}

// ─── Embed classification ────────────────────────────────────────────────

function classifyEmbed(url) {
  const u = (url || '').toLowerCase();
  if (PLACEHOLDER_IFRAMES.some(p => u.includes(p))) return 'placeholder';
  if (DEAD_HOSTS.some(p => u.includes(p))) return 'dead';
  return 'resolvable';
}

function embedDomain(url) {
  return (url || '').replace(/^https?:\/\//, '').split('/')[0];
}

function isResolvableHost(url) {
  const u = (url || '').toLowerCase();
  return RESOLVABLE_HOSTS.some(h => u.includes(h));
}

// ─── Episode extraction ──────────────────────────────────────────────────

function extractEpisodeUrlFromPage(html, targetEp, effectiveSeason) {
  const $ = cheerio.load(html);

  // Method 1: LECTEUR-style options (same as VoirAnime)
  const optionHosts = [];
  const regex = /<option[^>]*value="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const val = m[1];
    if (val && val.startsWith('LECTEUR ')) optionHosts.push(val);
  }

  // Si on trouve des LECTEUR options, c'est une page d'épisode directe
  if (optionHosts.length > 0) {
    return { type: 'episode', hosts: [...new Set(optionHosts)] };
  }

  // Method 2: Chercher des liens d'épisodes dans la page
  let episodeUrl = null;

  for (const sel of EPISODE_SELECTORS) {
    $(sel).each((i, el) => {
      if (episodeUrl) return false;
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href.includes('/special') || href.includes('/oav') || href.includes('/film') || href.includes('/ova')) return;

      const linkSeason = extractSeasonFromEpisodeLink(text, href);
      if (linkSeason !== null && linkSeason !== effectiveSeason) return;

      const cleanText = text.replace(/S(?:aison|eason)\s*\d+/ig, '').trim();
      const epPatterns = [targetEp.toString(), `0${targetEp}`, targetEp.toString().padStart(3, '0')];
      for (const pattern of epPatterns) {
        const regex = new RegExp(`(?:^|[^0-9])${pattern}(?:$|[^0-9])`, "i");
        if (regex.test(cleanText) || regex.test(href)) {
          episodeUrl = href;
          return false;
        }
      }
    });
    if (episodeUrl) break;
  }

  // Method 3: Chercher des iframes directes (lecteur embarqué)
  if (!episodeUrl) {
    const iframes = [];
    $('iframe').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (src.startsWith('http') && !src.includes('french-anime.com') && classifyEmbed(src) !== 'placeholder') {
        iframes.push(src);
      }
    });
    if (iframes.length > 0) {
      return { type: 'direct_iframes', iframes };
    }
  }

  // Method 4: Chercher des URLs vidéo dans les scripts
  if (!episodeUrl) {
    const videoRegex = /(?:file|src|source|url)\s*[:=]\s*['"]?(https?:\/\/[^'";\s]+\.(?:m3u8|mp4)[^'";\s]*)/gi;
    let vm;
    const videoUrls = [];
    while ((vm = videoRegex.exec(html)) !== null) {
      videoUrls.push(vm[1]);
    }
    if (videoUrls.length > 0) {
      return { type: 'direct_video', urls: [...new Set(videoUrls)] };
    }
  }

  if (episodeUrl) {
    const fullUrl = episodeUrl.startsWith('http') ? episodeUrl : `${CONFIG.BASE_URL}${episodeUrl}`;
    return { type: 'link', url: fullUrl };
  }

  return null;
}

// ─── Stream resolution ───────────────────────────────────────────────────

const MAX_DIRECT_STREAMS = 4;

async function resolveEpisodeStreams(episodeUrl, lang, streamHeaders, startTime) {
  try {
    const epRawHtml = await fetchWithRetry(() => fetchText(episodeUrl, { timeout: PAGE_TIMEOUT }), { retries: 1 });

    const extraction = extractEpisodeUrlFromPage(epRawHtml, null, null);
    if (!extraction) {
      console.log(`[FrenchAnime] No playable content found: ${episodeUrl.slice(0, 70)}`);
      return [];
    }

    let embedUrls = [];

    if (extraction.type === 'episode') {
      // Fetch each host's embed in parallel
      const collected = await Promise.allSettled(
        extraction.hosts.map(host => fetchHostEmbed(host, episodeUrl))
      );
      embedUrls = [...new Set(
        collected.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
      )];
    } else if (extraction.type === 'direct_iframes') {
      embedUrls = extraction.iframes;
    } else if (extraction.type === 'direct_video') {
      // Direct video URLs — try to resolve each
      const direct = [];
      for (const url of extraction.urls) {
        if (direct.length >= MAX_DIRECT_STREAMS) break;
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        try {
          const stream = await resolveStream({
            name: `FrenchAnime (${lang})`, title: `direct - ${lang}`,
            quality: "HD", url, headers: { ...streamHeaders },
          });
          if (stream && stream.isDirect) direct.push(stream);
        } catch (e) { /* skip */ }
      }
      if (direct.length > 0) return direct;
    } else if (extraction.type === 'link') {
      return resolveEpisodeStreams(extraction.url, lang, streamHeaders, startTime);
    }

    // If no embeds from LECTEUR options, try default iframes
    if (embedUrls.length === 0) {
      const $ = cheerio.load(epRawHtml);
      $('iframe').each((_, el) => {
        const src = $(el).attr('src') || '';
        if (src.startsWith('http') && !src.includes('french-anime.com') && classifyEmbed(src) === 'resolvable') {
          embedUrls.push(src);
        }
      });
    }

    // Filter + classify
    const candidates = embedUrls
      .map(u => ({ url: u, cls: classifyEmbed(u) }))
      .filter(e => e.cls !== 'dead' && e.cls !== 'placeholder');

    // Prefer resolvable hosts
    candidates.sort((a, b) => {
      const aRes = isResolvableHost(a.url) ? 0 : 1;
      const bRes = isResolvableHost(b.url) ? 0 : 1;
      return aRes - bRes;
    });

    if (candidates.length === 0) {
      console.log('[FrenchAnime] Only placeholder/dead iframes found');
      return [];
    }

    console.log(`[FrenchAnime] ${candidates.length} embed(s): ${candidates.map(c => `${embedDomain(c.url)}[${c.cls}]`).join(', ')}`);

    // Resolve in priority order
    const direct = [];
    const unresolved = [];

    for (const cand of candidates) {
      if (direct.length >= MAX_STREAMS) break;
      if (isBudgetExhausted(startTime, BUDGET_MS)) break;

      try {
        const stream = await resolveStream({
          name: `FrenchAnime (${lang})`,
          title: `${embedDomain(cand.url)} - ${lang}`,
          quality: "HD",
          url: cand.url,
          headers: { ...streamHeaders },
        });
        if (stream && stream.isDirect) {
          console.log(`[FrenchAnime] Resolved: ${embedDomain(cand.url)} -> ${String(stream.url).slice(0, 70)}`);
          direct.push(stream);
        } else {
          unresolved.push(cand);
        }
      } catch (e) {
        console.warn(`[FrenchAnime] Resolve failed: ${e?.message}`);
        unresolved.push(cand);
      }
    }

    if (direct.length > 0) return direct;

    // Last resort: return unresolved embeds
    if (unresolved.length > 0) {
      return unresolved.map(c => ({
        name: `FrenchAnime (${lang})`, title: `${embedDomain(c.url)} - ${lang}`,
        url: c.url, quality: "HD", headers: { ...streamHeaders }, isDirect: false,
      }));
    }
    return [];
  } catch (e) {
    console.warn(`[FrenchAnime] resolveEpisodeStreams failed: ${e?.message}`);
    return [];
  }
}

async function fetchHostEmbed(host, episodeUrl) {
  try {
    const hostUrl = `${episodeUrl}${episodeUrl.includes("?") ? "&" : "?"}host=${encodeURIComponent(host)}`;
    const hostHtml = await fetchText(hostUrl, { timeout: HOST_TIMEOUT });

    const iframeMatch = hostHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    let embedUrl = iframeMatch ? iframeMatch[1] : null;

    if (!embedUrl) {
      const scriptMatch = hostHtml.match(/https?:\/\/[^"'\s<>]+\/(?:embed|e|v|player)\/[^"'\s<>]+/);
      if (scriptMatch && !scriptMatch[0].includes('french-anime.com')) embedUrl = scriptMatch[0];
    }
    return embedUrl;
  } catch (err) {
    console.warn(`[FrenchAnime] fetchHostEmbed(${host}) failed: ${err?.message}`);
    return null;
  }
}

const MAX_STREAMS = 4;

// ─── Main extraction ─────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null;
  if (isAborted(signal)) return [];
  setCurrentSignal(signal);

  const titles = await getTmdbTitles(tmdbId, mediaType, { season });
  if (titles.length === 0) return [];

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
  const startTime = Date.now();

  slugProbeCache.clear();

  // ArmSync: resolve absolute episode
  const resolvedEps = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: BUDGET_MS });
  let targetEpisodes = resolvedEps;
  if (resolvedEps.length > 1) {
    targetEpisodes = [resolvedEps[1]]; // Replace with absolute only
  }

  // Search cache
  const cacheKey = `${tmdbId}-${effectiveSeason}`;
  let matches = [];
  if (SEARCH_CACHE.has(cacheKey) && Date.now() - SEARCH_CACHE.get(cacheKey).ts < SEARCH_CACHE_TTL) {
    matches = SEARCH_CACHE.get(cacheKey).matches || [];
    console.log(`[FrenchAnime] Search cache hit for ${cacheKey}`);
  } else {
    // Parallel probe all slugs
    const allTitles = titles.slice(0, 15);
    const baseTitles = allTitles.filter(t => !/\bS(?:eason|aison)?\s*\d/i.test(t));
    const seasonTitles = allTitles.filter(t => /\bS(?:eason|aison)?\s*\d/i.test(t));
    const allSearchTitles = [...baseTitles, ...seasonTitles];
    const year = titles._metadata?.year;

    if (allSearchTitles.length > 0 && !isBudgetExhausted(startTime, BUDGET_MS)) {
      const uniqueSlugs = [...new Set(
        allSearchTitles.map(t => toSlug(t)).filter(s => s && s.length > 3)
      )];

      // Year variants
      if (year) {
        for (const s of [...uniqueSlugs]) {
          uniqueSlugs.push(`${s}-${year}`);
        }
      }

      // Macron-expanded variants
      for (const t of allSearchTitles) {
        const expanded = toSlug(expandMacrons(t));
        if (expanded && expanded.length > 3 && !uniqueSlugs.includes(expanded)) {
          uniqueSlugs.push(expanded);
        }
      }

      // Build probe URLs for all DLE categories
      const allUrls = uniqueSlugs.flatMap(slug => [
        `${CONFIG.BASE_URL}/animes-vostfr/${slug}.html`,
        `${CONFIG.BASE_URL}/animes-vf/${slug}.html`,
        `${CONFIG.BASE_URL}/exclue/${slug}.html`,
      ]);

      console.log(`[FrenchAnime] Parallel probe: ${uniqueSlugs.length} unique slugs`);
      const validUrls = await batchProbe(allUrls, 5);

      if (validUrls.length > 0) {
        for (const url of validUrls) {
          const urlSlug = url.match(/\/([^/]+)\.html$/)?.[1]?.replace(/-vf$/, '');
          const matchingTitle = allSearchTitles.find(t => toSlug(t) === urlSlug);
          const detectedLang = url.includes('/animes-vf/') ? 'VF' : 'VOSTFR';
          const baseName = matchingTitle || `[slug:${urlSlug}]`;
          matches.push({
            title: detectedLang === 'VF' ? `${baseName} VF` : baseName,
            url,
          });
        }
        console.log(`[FrenchAnime] Parallel probe found ${matches.length} match(es): ${validUrls.join(', ')}`);
      }
    }

    // Fallback: DLE search
    if (matches.length === 0) {
      for (const title of allSearchTitles) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        const result = await searchAnime(title, effectiveSeason, year);
        if (result && result.length > 0) {
          matches = result;
          break;
        }
      }
    }

    if (matches.length > 0) {
      SEARCH_CACHE.set(cacheKey, { ts: Date.now(), matches });
    }
  }

  if (matches.length === 0) return [];

  const streams = [];
  const checkedUrls = new Set();
  const streamHeaders = { Referer: CONFIG.BASE_URL, Origin: CONFIG.BASE_URL, "User-Agent": USER_AGENT };

  for (const match of matches) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) break;
    if (checkedUrls.has(match.url)) continue;
    checkedUrls.add(match.url);

    const lang = match.title.toUpperCase().includes("VF") || match.url.includes('/animes-vf/') ? "VF" : "VOSTFR";

    try {
      const html = await fetchText(match.url, { timeout: 6000 });
      if (!html) continue;

      const extraction = extractEpisodeUrlFromPage(html, targetEpisodes[0], effectiveSeason);

      let episodeUrl = null;

      if (extraction?.type === 'episode' || extraction?.type === 'link') {
        // Page has LECTEUR options or episode links → this IS the episode page
        episodeUrl = match.url;
      } else if (extraction?.type === 'direct_iframes' || extraction?.type === 'direct_video') {
        // Page has direct embeds → use match URL
        episodeUrl = match.url;
      } else {
        // Try to find episode link in the page
        const $ = cheerio.load(html);

        for (const sel of EPISODE_SELECTORS) {
          $(sel).each((i, el) => {
            if (episodeUrl) return false;
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            if (href.includes('/special') || href.includes('/oav') || href.includes('/film')) return;

            const linkSeason = extractSeasonFromEpisodeLink(text, href);
            if (linkSeason !== null && linkSeason !== effectiveSeason) return;

            for (const ep of targetEpisodes) {
              const epStr = ep.toString();
              const patterns = [epStr, `0${epStr}`, epStr.padStart(3, '0')];
              for (const pattern of patterns) {
                const re = new RegExp(`(?:^|[^0-9])${pattern}(?:$|[^0-9])`, "i");
                if (re.test(text) || re.test(href)) {
                  episodeUrl = href;
                  return false;
                }
              }
            }
          });
          if (episodeUrl) break;
        }
      }

      // For movies, the player is on the main page
      if (!episodeUrl && mediaType === 'movie') {
        episodeUrl = match.url;
      }

      if (!episodeUrl) continue;

      const epStreams = await resolveEpisodeStreams(episodeUrl, lang, streamHeaders, startTime);
      streams.push(...epStreams);

    } catch (e) {
      console.warn(`[FrenchAnime] Match processing failed: ${e?.message}`);
    }
  }

  // Deduplicate streams by URL
  const seenUrls = new Set();
  const deduped = [];
  for (const s of streams) {
    if (!s || !s.url) continue;
    const baseUrl = s.url.split('?')[0];
    if (seenUrls.has(baseUrl)) continue;
    seenUrls.add(baseUrl);
    deduped.push(s);
  }

  const directStreams = deduped.filter(s => s && s.isDirect);
  const embedStreams = deduped.filter(s => s && !s.isDirect && s.url);

  const validStreams = directStreams.length > 0 ? directStreams : embedStreams;
  if (directStreams.length === 0 && embedStreams.length > 0) {
    console.log(`[FrenchAnime] No direct streams, using ${embedStreams.length} embed URL(s) as fallback`);
  }
  console.log(`[FrenchAnime] Total streams: ${validStreams.length} (${directStreams.length} direct, ${embedStreams.length} embed)`);

  return sortStreamsByLanguage(validStreams);
}
