/**
 * Extractor Logic for VoirAnime
 * Optimisé : batchProbe plus rapide, slugs ciblés, fallback WordPress réactivé
 */

import { fetchText } from "./http.js";
import cheerio from "cheerio-without-node-native";
import { resolveStream, isBudgetExhausted, sanitizeSearchQuery, sortStreamsByLanguage, sleep, fetchWithRetry } from "../utils/resolvers.js";
import { toSlug, resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { getTmdbTitles } from "../utils/metadata.js";

const BASE_URL = "https://voir-anime.to";
const HEAD_TIMEOUT = 1500;
const PAGE_TIMEOUT = 10000;
const HOST_TIMEOUT = 8000;
const SEARCH_TIMEOUT = 15000;
const BUDGET_MS = 45000;
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 300000;

// Cache des slugs déjà testés (évite les doubles HEAD requests dans la même exécution)
const slugProbeCache = new Map();

const KNOWN_HOSTS = ['myTV', 'Stape', 'Streamtape', 'Uqload', 'Vidzy', 'fsvid', 'Dood', 'Voe', 'Sendvid', 'Sibnet', 'Netu', 'Younetu', 'Vidoza', 'Vidmoly', 'Luluvid', 'Moon', 'FHD', 'SB'];

const SPINOFF_KEYWORDS = ['fan letter', 'log:', 'memories', 'vigilante', 'illegals', 'film', 'movie', 'special', 'oav', 'ona', 'x ut', 'collab'];



function isSpinoff(title) {
  const t = title.toLowerCase();
  return SPINOFF_KEYWORDS.some(k => t.includes(k));
}

function normalizeForSearch(s) {
  return (s || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[':!.,?()\[\]]/g, ' ')
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
      const maxLen = Math.max(rWords.size, sWords.size);
      score = Math.round((overlap / maxLen) * 50);
    }
  }

  if (isSpinoff(resultTitle) || isSpinoff(resultUrl)) score -= 50;
  if (resultTitle.toLowerCase().includes('x ut')) score -= 30;

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

function extractSeasonFromEpisodeLink(text, url) {
  const combined = `${text || ''} ${url || ''}`;
  const match = combined.match(/S(?:aison|eason)\s*[:\\(\\s-]*\s*(\d+)/i) ||
                combined.match(/saison[_-](\d+)/i) ||
                combined.match(/S(\d+)\s*(?:E|V|VF|VOSTFR|\b)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

/**
 * Generate season-aware slug variants for fallback probing.
 * Optimisé : essaie d'abord les plus probables, limite à 3.
 */
function generateFallbackSlugs(baseSlug, season) {
  return [
    `${baseSlug}-${season}`,
    `${baseSlug}-${season}-vf`,
    `${baseSlug}-saison-${season}`,
  ].filter(Boolean);
}

function cleanSlug(slug) {
  return slug
    .replace(/-(?:1st|2nd|3rd|4th|5th)-season$/, '')
    .replace(/-(?:season|saison)-?\d+$/, '')
    .replace(/-s\d+$/, '')
    .replace(/-(?:part|cour|arc|volume)-?\d+$/, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * HEAD probe avec cache et délai réduit (300ms au lieu de 800ms).
 */
async function probeUrl(url) {
  if (slugProbeCache.has(url)) return slugProbeCache.get(url);
  try {
    await fetchText(url, { method: "HEAD", timeout: HEAD_TIMEOUT });
    slugProbeCache.set(url, true);
    return true;
  } catch (e) {
    slugProbeCache.set(url, false);
    return false;
  }
}

async function batchProbe(urls, batchSize = 3, delayMs = 100) {
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
    if (results.length > 0) return results; // Early exit si trouvé
    if (i + batchSize < urls.length) await sleep(delayMs);
  }
  return results;
}

/**
 * WordPress search sur VoirAnime avec parsing du HTML de résultats.
 * Fallback quand le slug probing direct échoue.
 */
async function wordpressSearch(query, season) {    try {
      const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(sanitizeSearchQuery(query))}`;
      const html = await fetchText(searchUrl, { timeout: 8000 });
    if (!html) return [];

    const $ = cheerio.load(html);
    const results = [];

    // Pattern: les résultats de recherche sont dans des articles ou des listes
    $('article a[href*="/anime/"], .post-title a[href*="/anime/"], .entry-title a[href*="/anime/"], .result-item a[href*="/anime/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).text().trim();
      if (title && href) {
        // Éviter les doublons VF/VOSTFR ici (on gère ça plus tard)
        if (results.some(r => r.url === href)) return;
        const score = scoreSearchResult(title, href, query, season);
        results.push({ title, url: href, score });
      }
    });

    // Fallback: chercher les liens /anime/ dans tout le HTML
    if (results.length === 0) {
      const animeRegex = /<a[^>]+href="([^"]*\/anime\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let m;
      while ((m = animeRegex.exec(html)) !== null) {
        const href = m[1].startsWith('http') ? m[1] : `https://voir-anime.to${m[1]}`;
        const title = m[2].trim();
        if (title && href && !results.some(r => r.url === href)) {
          const score = scoreSearchResult(title, href, query, season);
          results.push({ title, url: href, score });
        }
      }
    }

    // Trier par score et prendre les meilleurs résultats
    results.sort((a, b) => b.score - a.score);
    const best = results.filter(r => r.score >= 30).slice(0, 4);

    console.log(`[VoirAnime] WordPress search for "${query}": ${best.length} results (from ${results.length} total)`);
    return best.map(r => ({ title: r.title, url: r.url }));
  } catch (e) {
    console.warn(`[VoirAnime] WordPress search failed: ${e?.message}`);
    return [];
  }
}

/**
 * Search for anime on VoirAnime
 * Priority: 1) Season-specific slug probing, 2) Generic slug, 3) WordPress search
 */
async function searchAnime(title, season = 1) {
  const baseSlug = toSlug(title);
  const results = [];
  const searchStartTime = Date.now();

  function isProbeBudgetExhausted() {
    return Date.now() - searchStartTime >= 15000;
  }

  // --- STEP 0: Season-specific slugs for S2+ ---
  if (season > 1 && baseSlug.length > 3 && !isProbeBudgetExhausted()) {
    const seasonSlugs = generateFallbackSlugs(baseSlug, season);
    const seasonUrls = seasonSlugs.map(s => `${BASE_URL}/anime/${s}/`);
    const validSeasonUrls = await batchProbe(seasonUrls, 2, 300);

    if (validSeasonUrls.length > 0) {
      console.log(`[VoirAnime] Season slugs found (S${season}): ${validSeasonUrls}`);
      validSeasonUrls.forEach(url => {
        const lang = url.includes('-vf') ? 'VF' : 'VOSTFR';
        results.push({ title: `${title} S${season} ${lang}`, url });
      });
      return results;
    }

    // Try with cleaned slug
    const cleanBaseSlug = cleanSlug(baseSlug);
    if (cleanBaseSlug !== baseSlug && cleanBaseSlug.length > 3 && !isProbeBudgetExhausted()) {
      const cleanSlugs = generateFallbackSlugs(cleanBaseSlug, season);
      const cleanUrls = cleanSlugs.map(s => `${BASE_URL}/anime/${s}/`);
      const validCleanUrls = await batchProbe(cleanUrls, 2, 300);

      if (validCleanUrls.length > 0) {
        console.log(`[VoirAnime] Clean season slugs found (S${season}): ${validCleanUrls}`);
        validCleanUrls.forEach(url => {
          const lang = url.includes('-vf') ? 'VF' : 'VOSTFR';
          results.push({ title: `${title} S${season} ${lang}`, url });
        });
        return results;
      }
    }
  }

  // --- STEP 1: Generic slug (VF + VOSTFR en parallèle) ---
  if (baseSlug.length > 3 && !isProbeBudgetExhausted()) {
    const exactUrl = `${BASE_URL}/anime/${baseSlug}/`;
    const exactVfUrl = `${BASE_URL}/anime/${baseSlug}-vf/`;

    // Prober les 2 variantes en parallèle
    const [hasVostfr, hasVf] = await Promise.all([
      probeUrl(exactUrl),
      probeUrl(exactVfUrl),
    ]);

    if (hasVostfr) results.push({ title, url: exactUrl });
    if (hasVf) results.push({ title: `${title} VF`, url: exactVfUrl });
    if (results.length > 0) return results;
  }

  // --- STEP 1.5: Alternative slugs (short keywords, compacted Japanese) ---
  // Certains sites utilisent des slugs radicalement différents du titre TMDB.
  // On essaie des variantes plus courtes basées sur les mots-clés distinctifs.
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const words = title.split(/\s+/).filter(w => w.length > 2)
    const altSlugs = []
    
    // Variante 1: Enlever les mots trop génériques du début
    const skipPrefixes = ['dealing', 'with', 'the', 'my', 'that', 'this', 'dans', 'and', 'of', 'a', 'an']
    const filtered = words.filter(w => !skipPrefixes.includes(w.toLowerCase()))
    if (filtered.length >= 2 && filtered.length < words.length) {
      altSlugs.push(filtered.join('-'))
    }
    
    // Variante 2: Dernier mot long + avant-dernier mot long
    const longWords = words.filter(w => w.length >= 4)
    if (longWords.length >= 2) {
      altSlugs.push(longWords.slice(0, 3).join('-'))
    }
    
    // Variante 3: Juste les mots distinctifs (2-3 mots longs)
    if (longWords.length >= 2) {
      altSlugs.push(longWords.slice(-2).join('-'))
    }
    
    // Variante 4: Version compactée pour les titres japonais
    // Ex: "Mikadono San Shimai wa Angai Choroi" → "mikadono-sanshimai-wa-angai-choroi"
    // Certains sites écrivent les composés japonais en un seul mot ("sanshimai")
    // alors que TMDB les sépare ("san shimai"). On génère plusieurs variantes :
    // - chaque mot court collé individuellement au mot suivant
    // - tous les mots courts collés en une fois
    const compactWords = title.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[':!.,?()\[\]]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    
    if (compactWords.length >= 3) {
      // Trouver les positions des mots courts (≤3 lettres, pas le dernier)
      const shortPos = []
      for (let i = 0; i < compactWords.length - 1; i++) {
        if (compactWords[i].length <= 3) shortPos.push(i)
      }
      
      if (shortPos.length > 0) {
        const compactVariants = []
        
        // Variante: coller chaque mot court individuellement
        for (const pos of shortPos) {
          const parts = [...compactWords]
          parts[pos] = parts[pos] + parts[pos + 1]
          parts.splice(pos + 1, 1)
          compactVariants.push(parts.join('-'))
        }
        
        // Variante: coller TOUS les mots courts
        if (shortPos.length > 1) {
          const parts = [...compactWords]
          let offset = 0
          for (const pos of shortPos) {
            const actualPos = pos - offset
            parts[actualPos] = parts[actualPos] + parts[actualPos + 1]
            parts.splice(actualPos + 1, 1)
            offset++
          }
          compactVariants.push(parts.join('-'))
        }
        
        // Ajouter les variantes uniques et différentes du slug normal
        for (const v of [...new Set(compactVariants)]) {
          if (v !== baseSlug && v.length > 5) {
            altSlugs.push(v)
            altSlugs.push(v + '-vf')
          }
        }
      }
    }
    
    // Prober les slugs alternatifs uniques
    const uniqueAltSlugs = [...new Set(altSlugs.filter(s => s && s.length > 3))]
    if (uniqueAltSlugs.length > 0) {
      console.log(`[VoirAnime] Trying ${uniqueAltSlugs.length} alt slug(s): ${uniqueAltSlugs.slice(0, 3).join(', ')}...`)
      const altUrls = uniqueAltSlugs.flatMap(s => [
        `${BASE_URL}/anime/${s}/`,
        `${BASE_URL}/anime/${s}-vf/`,
      ])
      const validAltUrls = await batchProbe(altUrls, 2, 200)
      
      if (validAltUrls.length > 0) {
        console.log(`[VoirAnime] Alt slugs found: ${validAltUrls}`)
        validAltUrls.forEach(url => {
          const lang = url.includes('-vf') ? 'VF' : 'VOSTFR'
          results.push({ title: `${title} [alt]`, url })
        })
        return results
      }
    }
  }

  // --- STEP 2: WordPress search (15s timeout) ---
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const searchResults = await wordpressSearch(title, season);
    for (const r of searchResults) {
      const lang = r.url.includes('-vf') ? 'VF' : 'VOSTFR';
      if (!results.some(ex => ex.url === r.url)) {
        results.push({ ...r, title: `${r.title}` });
      }
    }
    if (results.length > 0) return results;
  }

  // --- STEP 3: WordPress search with short keywords ---
  // Si la recherche avec le titre complet n'a rien donné, essayer avec
  // des mots-clés courts (le moteur de recherche WP est parfois meilleur
  // avec des termes précis qu'avec des titres longs).
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const longWords = title.split(/\s+/).filter(w => w.length > 2)
    const keywordQueries = [
      longWords.slice(-2).join(' '),  // 2 derniers mots longs
      longWords.slice(0, 2).join(' '), // 2 premiers mots longs
      longWords.filter(w => w.length >= 4).slice(0, 2).join(' '), // mots très distinctifs
    ]
    
    const seenQueries = new Set()
    for (const query of keywordQueries) {
      if (!query || seenQueries.has(query.toLowerCase()) || isProbeBudgetExhausted()) continue
      seenQueries.add(query.toLowerCase())
      
      console.log(`[VoirAnime] Keyword WP search: "${query}"`)
      const searchResults = await wordpressSearch(query, season)
      for (const r of searchResults) {
        const lang = r.url.includes('-vf') ? 'VF' : 'VOSTFR'
        if (!results.some(ex => ex.url === r.url)) {
          results.push({ ...r, title: `${r.title}` })
        }
      }
      if (results.length > 0) {
        console.log(`[VoirAnime] Keyword WP search "${query}" found ${results.length} result(s)`)
        return results
      }
    }
  }

  return [];
}

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
  } catch (err) { console.warn(`[VoirAnime] resolveHost failed: ${err?.message}`); }
  return null;
}

async function generateEpisodeUrl(html, targetEp, startTime) {
  const $ = cheerio.load(html);
  const firstLink = $('.wp-manga-chapter a').first();
  if (!firstLink.length) return null;

  const href = firstLink.attr('href') || '';
  const match = href.match(/\/anime\/([^/]+)\/(.+?-)(\d+)(-v(?:ostfr|f))?\//);
  if (!match) return null;

  const slugName = match[1];
  const prefix = match[2];
  const suffix = match[4] || '';

  // Paddings testés en parallèle
  const paddings = ['0', ''];
  const results = await Promise.allSettled(
    paddings.map(async (pad) => {
      if (isBudgetExhausted(startTime, BUDGET_MS)) return null;
      const url = `https://voir-anime.to/anime/${slugName}/${prefix}${pad}${targetEp}${suffix}/`;
      const ok = await probeUrl(url);
      return ok ? url : null;
    })
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) return r.value;
  }
  return null;
}

async function resolveEpisodeStreams(episodeUrl, lang, streamHeaders) {
  try {
    const epRawHtml = await fetchWithRetry(() => fetchText(episodeUrl, { timeout: PAGE_TIMEOUT }), { retries: 1 });
    const allHosts = extractHosts(epRawHtml);

    const filteredHosts = allHosts.filter(h => {
      const hl = h.toLowerCase();
      return KNOWN_HOSTS.some(prefix => hl.includes(prefix.toLowerCase())) &&
             !/YU|YourUpload/i.test(h);
    });

    if (filteredHosts.length === 0) {
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
    console.warn(`[VoirAnime] resolveEpisodeStreams failed: ${e?.message}`);
    return [];
  }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
  const titles = await getTmdbTitles(tmdbId, mediaType, { season });
  if (titles.length === 0) return [];

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
  const startTime = Date.now();

  // Vider le cache de slug probing pour une nouvelle exécution
  slugProbeCache.clear();

  // ArmSync: resolve absolute episode (VoirAnime replaces, not pushes)
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
    console.log(`[VoirAnime] Search cache hit for ${cacheKey}`);
  } else {
    const searchTitles = titles.slice(0, 15);
    const baseTitles = searchTitles.filter(t => !/\bS(?:eason|aison)?\s*\d/i.test(t));
    const seasonTitles = searchTitles.filter(t => /\bS(?:eason|aison)?\s*\d/i.test(t));

    // Essayer d'abord les titres sans suffixe de saison, puis avec
    for (const title of [...baseTitles, ...seasonTitles]) {
      if (isBudgetExhausted(startTime, BUDGET_MS)) break;
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
      const html = await fetchText(match.url, { timeout: 6000 });
      if (!html) continue;
      const $ = cheerio.load(html);

      const paddings = ["0", ""];
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

      for (const sel of epSelectors) {
        $(sel).each((i, el) => {
          if (episodeUrl) return false;
          const text = $(el).text().trim();
          const href = $(el).attr("href") || '';
          if (href.includes('/special') || href.includes('/oav') || href.includes('/film') || href.includes('/ova')) return;

          const linkSeason = extractSeasonFromEpisodeLink(text, href);
          if (linkSeason !== null && linkSeason !== effectiveSeason) return;

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

      const epStreams = await resolveEpisodeStreams(episodeUrl, lang, streamHeaders);
      streams.push(...epStreams);

    } catch (e) { console.warn(`[VoirAnime] Match processing failed: ${e?.message}`); }
  }

  const validStreams = streams.filter(s => s && s.isDirect);
  console.log(`[VoirAnime] Total streams: ${validStreams.length}`);

  return sortStreamsByLanguage(validStreams);
}
