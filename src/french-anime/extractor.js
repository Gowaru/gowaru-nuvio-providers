/**
 * Extractor Logic for French-Anime.com
 * DLE (DataLife Engine) CMS - same structure as VoirAnime/AnimesUltra
 */

import { fetchText, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, isBudgetExhausted, sleep, safeFetch, isAborted, USER_AGENT } from '../utils/resolvers.js';
import { toSlug, resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { CONFIG } from './config.js';

const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 300000;
const slugProbeCache = new Map();

// Embeds that are unresolvable (SPA, dead, or gate JS)
const UNRESOLVABLE_EMBEDS = ['voe.', 'streamhide.', 'gn1r5n.', 'parklogic', 'ds2play', 'dood.', 'bigwar5'];

// Placeholder iframes (anti-bot responses)
const PLACEHOLDER_IFRAMES = ['youtube.com/embed', 'youtu.be/', 'facebook.com/plugins', 'twitter.com/i/videos'];

// Spinoff/special keywords to penalize in search scoring
const SPINOFF_KEYWORDS = ['fan letter', 'log:', 'memories', 'vigilante', 'illegals', 'film', 'movie', 'special', 'oav', 'ona'];

function isSpinoff(title) {
  const t = (title || '').toLowerCase();
  return SPINOFF_KEYWORDS.some(k => t.includes(k));
}

/**
 * Double macron vowels for Japanese transliteration
 * "Shippūden" → "Shippuuden"
 */
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

/**
 * Normalize a string for search matching
 */
function normalizeForSearch(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]]/g, ' ')
    .replace(/\b(the|vostfr|vost|vf|french|streaming|anime)\s+/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Score a search result against the query
 */
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
      for (const w of sWords) {
        if (rWords.has(w)) overlap++;
      }
      score = Math.round((overlap / Math.max(rWords.size, sWords.size)) * 50);
    }
  }

  if (isSpinoff(resultTitle) || isSpinoff(resultUrl)) score -= 50;

  // Season matching
  const seasonMatch = resultUrl.match(/[-](\d+)(?:-vf|-vostfr)?\/?$/);
  const saisonMatch = resultUrl.match(/saison[_-](\d+)/i);
  const urlSeason = seasonMatch ? parseInt(seasonMatch[1]) : (saisonMatch ? parseInt(saisonMatch[1]) : null);

  if (urlSeason !== null) {
    if (urlSeason === searchSeason) score += 20;
    else score -= 40;
  } else if (searchSeason === 1) {
    score += 10;
  }

  return Math.max(score, 0);
}

/**
 * Probe a URL to check if the page exists
 */
async function probeUrl(url) {
  if (slugProbeCache.has(url)) return slugProbeCache.get(url);
  const res = await safeFetch(url, { method: 'GET', timeout: CONFIG.PROBE_TIMEOUT });
  if (!res || !res.ok) {
    slugProbeCache.set(url, false);
    return false;
  }
  // Check for redirects to different pages
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

/**
 * Batch probe URLs with early exit
 */
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
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    if (results.length > 0) return results; // Early exit
  }
  return results;
}

/**
 * Search for anime on French-Anime.com
 */
async function searchAnime(title, season = 1, year) {
  const baseSlug = toSlug(title);
  const results = [];
  const searchStartTime = Date.now();

  function isProbeBudgetExhausted() {
    return Date.now() - searchStartTime >= 15000;
  }

  // Step 0: Season-specific slugs for S2+
  if (season > 1 && baseSlug.length > 3 && !isProbeBudgetExhausted()) {
    const seasonSlugs = [
      `${baseSlug}-${season}`,
      `${baseSlug}-${season}-vf`,
      `${baseSlug}-saison-${season}`,
    ];
    if (year) {
      seasonSlugs.push(`${baseSlug}-${year}`);
      seasonSlugs.push(`${baseSlug}-${year}-vf`);
    }
    const seasonUrls = seasonSlugs.flatMap(s => [
      `${CONFIG.BASE_URL}/animes-vostfr/${s}.html`,
      `${CONFIG.BASE_URL}/animes-vf/${s}.html`,
    ]);
    const validSeasonUrls = await batchProbe(seasonUrls, 2);
    if (validSeasonUrls.length > 0) {
      console.log(`[FrenchAnime] Season slugs found (S${season}): ${validSeasonUrls}`);
      validSeasonUrls.forEach(url => {
        const lang = url.includes('/animes-vf/') ? 'VF' : 'VOSTFR';
        results.push({ title: `${title} S${season} ${lang}`, url });
      });
      return results;
    }
  }

  // Step 1: Generic slug (VF + VOSTFR in parallel)
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

  // Step 1.5: Variant slugs with macrons expanded
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

  // Step 2: DLE search (DataLife Engine search endpoint)
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    try {
      const searchUrl = `${CONFIG.BASE_URL}/?do=search&subaction=search&story=${encodeURIComponent(title)}`;
      const html = await fetchText(searchUrl, { timeout: 8000 });
      if (html) {
        const $ = cheerio.load(html);
        const searchResults = [];

        // DLE search results are typically in .story-title or .short-title
        $('a[href*=".html"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const text = $(el).text().trim();
          if (text && href && (href.includes('/animes-') || href.includes('/exclue/'))) {
            const score = scoreSearchResult(text, href, title, season);
            if (score >= 30 && !searchResults.some(r => r.url === href)) {
              searchResults.push({ title: text, url: href, score });
            }
          }
        });

        searchResults.sort((a, b) => b.score - a.score);
        const best = searchResults.slice(0, 4);
        console.log(`[FrenchAnime] DLE search for "${title}": ${best.length} results`);
        best.forEach(r => results.push({ title: r.title, url: r.url }));
        if (results.length > 0) return results;
      }
    } catch (e) {
      console.warn(`[FrenchAnime] DLE search failed: ${e?.message}`);
    }
  }

  return results;
}

/**
 * Classify an embed URL
 */
function classifyEmbed(url) {
  const u = (url || '').toLowerCase();
  if (PLACEHOLDER_IFRAMES.some(p => u.includes(p))) return 'placeholder';
  if (UNRESOLVABLE_EMBEDS.some(p => u.includes(p))) return 'unresolvable';
  return 'resolvable';
}

/**
 * Extract embed URLs from an episode page
 * French-Anime uses comma-separated embed URLs in the HTML
 */
function extractEmbedsFromHtml(html) {
  const $ = cheerio.load(html);
  const embeds = [];

  // Look for iframes
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src.startsWith('http') && !src.includes('french-anime.com')) {
      embeds.push(src);
    }
  });

  // Look for video sources in scripts
  const scriptRegex = /(?:file|src|source|url)\s*[:=]\s*['"]?(https?:\/\/[^'";\s]+\.m3u8[^'";\s]*)/gi;
  let m;
  while ((m = scriptRegex.exec(html)) !== null) {
    embeds.push(m[1]);
  }

  // Look for player URLs in data attributes
  $('[data-src], [data-url], [data-file]').each((_, el) => {
    const url = $(el).attr('data-src') || $(el).attr('data-url') || $(el).attr('data-file') || '';
    if (url.startsWith('http')) embeds.push(url);
  });

  return [...new Set(embeds)];
}

/**
 * Resolve streams for an episode
 */
async function resolveEpisodeStreams(episodeUrl, lang, streamHeaders, startTime) {
  try {
    const html = await fetchText(episodeUrl, { timeout: CONFIG.PAGE_TIMEOUT });
    if (!html) return [];

    const embedUrls = extractEmbedsFromHtml(html);
    if (embedUrls.length === 0) {
      console.log(`[FrenchAnime] No embeds found on episode page: ${episodeUrl.slice(0, 70)}`);
      return [];
    }

    // Filter and classify
    const candidates = embedUrls
      .map(u => ({ url: u, cls: classifyEmbed(u) }))
      .filter(e => e.cls !== 'placeholder');

    const order = { resolvable: 0, unresolvable: 1 };
    candidates.sort((a, b) => order[a.cls] - order[b.cls]);

    console.log(`[FrenchAnime] ${candidates.length} embed(s): ${candidates.map(c => `${new URL(c.url).hostname}[${c.cls}]`).join(', ')}`);

    // Resolve in priority order
    const direct = [];
    const unresolved = [];
    const MAX_STREAMS = 4;

    for (const cand of candidates) {
      if (direct.length >= MAX_STREAMS) break;
      if (isBudgetExhausted(startTime, CONFIG.BUDGET_MS)) break;

      if (cand.cls === 'unresolvable') {
        unresolved.push(cand);
        continue;
      }

      try {
        const stream = await resolveStream({
          name: `FrenchAnime (${lang})`,
          title: `${new URL(cand.url).hostname} - ${lang}`,
          quality: 'HD',
          url: cand.url,
          headers: { ...streamHeaders },
        });
        if (stream && stream.isDirect) {
          console.log(`[FrenchAnime] Resolved: ${new URL(cand.url).hostname} -> ${String(stream.url).slice(0, 70)}`);
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
        name: `FrenchAnime (${lang})`,
        title: `${new URL(c.url).hostname} - ${lang}`,
        url: c.url,
        quality: 'HD',
        headers: { ...streamHeaders },
        isDirect: false,
      }));
    }
    return [];
  } catch (e) {
    console.warn(`[FrenchAnime] resolveEpisodeStreams failed: ${e?.message}`);
    return [];
  }
}

/**
 * Main extraction function
 */
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
  const resolvedEps = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: CONFIG.BUDGET_MS });
  let targetEpisodes = resolvedEps;
  if (resolvedEps.length > 1) {
    targetEpisodes = [resolvedEps[1]]; // Use absolute episode
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
    const year = titles._metadata?.year;
    if (allTitles.length > 0 && !isBudgetExhausted(startTime, CONFIG.BUDGET_MS)) {
      const uniqueSlugs = [...new Set(
        allTitles.map(t => toSlug(t)).filter(s => s && s.length > 3)
      )];

      // Add year variants
      if (year) {
        const yearVariants = uniqueSlugs.map(s => `${s}-${year}`);
        for (const v of yearVariants) {
          if (!uniqueSlugs.includes(v)) uniqueSlugs.push(v);
        }
      }

      // Add macron-expanded variants
      for (const t of allTitles) {
        const expanded = toSlug(expandMacrons(t));
        if (expanded && expanded.length > 3 && !uniqueSlugs.includes(expanded)) {
          uniqueSlugs.push(expanded);
        }
      }

      // Build probe URLs for all categories
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
          const matchingTitle = allTitles.find(t => toSlug(t) === urlSlug);
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
      for (const title of allTitles) {
        if (isBudgetExhausted(startTime, CONFIG.BUDGET_MS)) break;
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
  const streamHeaders = { Referer: CONFIG.BASE_URL, Origin: CONFIG.BASE_URL, 'User-Agent': USER_AGENT };

  for (const match of matches) {
    if (isBudgetExhausted(startTime, CONFIG.BUDGET_MS)) break;
    if (checkedUrls.has(match.url)) continue;
    checkedUrls.add(match.url);

    const lang = match.title.toUpperCase().includes('VF') || match.url.includes('/animes-vf/') ? 'VF' : 'VOSTFR';

    try {
      const html = await fetchText(match.url, { timeout: 6000 });
      if (!html) continue;
      const $ = cheerio.load(html);

      // Find episode link
      let episodeUrl = null;

      // Method 1: Direct episode link pattern
      const epSelectors = [
        'a[href*=".html"]',
        '.episode-list a',
        '.episodes a',
      ];

      for (const sel of epSelectors) {
        $(sel).each((i, el) => {
          if (episodeUrl) return false;
          const href = $(el).attr('href') || '';
          const text = $(el).text().trim();

          // Check if this link matches our target episode
          for (const ep of targetEpisodes) {
            const epStr = ep.toString();
            const patterns = [
              new RegExp(`[-_]0*${epStr}[-_.]`, 'i'),
              new RegExp(`[-_]0*${epStr}$`, 'i'),
              new RegExp(`episode[-_]*0*${epStr}`, 'i'),
            ];
            if (patterns.some(p => p.test(text) || p.test(href))) {
              episodeUrl = href.startsWith('http') ? href : `${CONFIG.BASE_URL}${href}`;
              return false;
            }
          }
        });
        if (episodeUrl) break;
      }

      // Method 2: Navigate via prev/next buttons
      if (!episodeUrl) {
        const playerBox = $('.new_player_selector_box, .player-selector, .episode-nav');
        if (playerBox.length) {
          const nextBtn = playerBox.find('a[rel="next"], .next-episode, a:contains("Suivant")');
          if (nextBtn.length) {
            const nextHref = nextBtn.attr('href');
            if (nextHref) {
              episodeUrl = nextHref.startsWith('http') ? nextHref : `${CONFIG.BASE_URL}${nextHref}`;
            }
          }
        }
      }

      // Method 3: First available episode link
      if (!episodeUrl) {
        const firstEp = $('a[href*=".html"]').first();
        if (firstEp.length) {
          const href = firstEp.attr('href');
          if (href) {
            episodeUrl = href.startsWith('http') ? href : `${CONFIG.BASE_URL}${href}`;
          }
        }
      }

      // For movies, use the match URL directly
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

  const directStreams = streams.filter(s => s && s.isDirect);
  const embedStreams = streams.filter(s => s && !s.isDirect && s.url);
  const validStreams = directStreams.length > 0 ? directStreams : embedStreams;

  console.log(`[FrenchAnime] Total streams: ${validStreams.length} (${directStreams.length} direct, ${embedStreams.length} embed)`);
  return validStreams;
}
