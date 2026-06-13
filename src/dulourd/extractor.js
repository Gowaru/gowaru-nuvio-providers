import cheerio from 'cheerio-without-node-native';
import { fetchText, fetchApi } from './http.js';
import { resolveStream, safeFetch, sortStreamsByLanguage } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { CONFIG } from './config.js';

function toSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function detectSubType(html, genre) {
  const catMatch = html.match(/class="[^"]*category_(anime|cartoon|series|movies)[^"]*"/);
  if (catMatch) {
    const map = { anime: 'anime', cartoon: 'cartoon', series: null, movies: null };
    return map[catMatch[1]] || null;
  }
  if (genre && genre === 'animation_s') return 'cartoon';
  return null;
}

function extractEpisodeId(html) {
  const m = html.match(/playEpisode\([^,]+,\s*'(\d+)'/);
  return m ? m[1] : null;
}

function extractXfields(html) {
  const xfields = new Set();
  const re = /playEpisode\([^,]+,\s*'\d+',\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(html)) !== null) xfields.add(m[1]);
  return [...xfields];
}

async function resolveStreamsFromEpisode(episodeId, xfields, subType) {
  const results = await Promise.allSettled(
    xfields.map(async (xfield) => {
      const iframeHtml = await fetchApi(episodeId, xfield);
      if (!iframeHtml) return null;

      const srcMatch = iframeHtml.match(/src="([^"]+)"/);
      if (!srcMatch) return null;

      const embedUrl = srcMatch[1];
      const parts = xfield.split('_');
      const lang = CONFIG.LANGUAGE_MAP[parts[1]] || (parts[1] ? parts[1].toUpperCase() : 'VF');

      const stream = await resolveStream({
        name: `DuLourd (${lang})`,
        title: `${CONFIG.SERVER_LABELS[parts[0]] || parts[0]} - ${lang}`,
        quality: 'HD',
        url: embedUrl,
        headers: { Referer: CONFIG.BASE_URL + '/' },
      });

      if (stream && stream.isDirect) {
        if (subType) stream.subType = subType;
        return stream;
      }
      return null;
    })
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMatch(resultTitle, tmdbTitles) {
  const norm = normalize(resultTitle);
  let bestScore = 0;

  for (const tmdbTitle of tmdbTitles) {
    const tmdbNorm = normalize(tmdbTitle);
    if (norm === tmdbNorm) return 100;
    if (norm.includes(tmdbNorm) && norm.length - tmdbNorm.length < 5) return 90;
    if (norm.startsWith(tmdbNorm)) return 80;
    if (norm.includes(tmdbNorm)) return 60;
    if (tmdbNorm.includes(norm)) return 40;
  }

  return bestScore;
}

async function searchDle(query) {
  const url = `${CONFIG.BASE_URL}/?do=search&subaction=search&story=${encodeURIComponent(query)}`;
  try {
    const html = await fetchText(url, { timeout: CONFIG.TIMEOUTS.PAGE });
    const $ = cheerio.load(html);
    const results = [];

    $('a[href*="/voir-series/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('/voir-series/') && href.endsWith('.html') && !href.endsWith('-saison.html') && !href.endsWith('-episode.html')) {
        const m = href.match(/\/voir-series\/([^/]+)\/([^/]+)\.html/);
        if (m) {
          results.push({
            url: href.startsWith('http') ? href : CONFIG.BASE_URL + href,
            genre: m[1],
            slug: m[2],
            title: $(el).text().trim(),
          });
        }
      }
    });

    return results;
  } catch (e) {
    console.warn(`[DuLourd] Search failed for "${query}": ${e.message}`);
    return [];
  }
}

function bestMatch(results, titles) {
  let bestScore = -1;
  let bestResult = null;

  for (const result of results) {
    for (const title of titles) {
      const score = scoreMatch(result.title, [title]);
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
      }
    }
  }

  if (bestScore >= 60) return bestResult;
  return null;
}

function extractSearchQueries(titles) {
  const queries = new Set();
  const frenchKeywords = ['fr', 'french', 'francais'];
  const priority = [];

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    if (i < 3) priority.push(title);
    else if (frenchKeywords.some(k => title.toLowerCase().includes(k))) priority.push(title);
  }

  if (priority.length === 0) priority.push(titles[0]);

  for (const title of priority) {
    queries.add(title);
    const slug = toSlug(title);
    queries.add(slug);
    const words = slug.split('-').filter(w => w.length > 3 || w === 'dr' || w === 'st');
    if (words.length > 1) {
      queries.add(words.slice(0, 3).join(' '));
    }
    if (queries.size >= CONFIG.MAX_SEARCH_QUERIES) break;
  }

  return [...queries].slice(0, CONFIG.MAX_SEARCH_QUERIES);
}

async function tryFetchForSlug(url) {
  try {
    console.log(`[DuLourd] Slug probe: ${url}`);
    const res = await safeFetch(url, { timeout: 5000 });
    if (res && res.ok) {
      await res.text();
      return { url };
    }
  } catch (e) {}
  return null;
}

async function findSlugFallback(titles, mediaType) {
  const slug = toSlug(titles[0] || '');
  if (!slug) return null;
  const baseType = mediaType === 'movie' ? 'films' : 'voir-series';
  const urls = CONFIG.GENRES.map(g => `${CONFIG.BASE_URL}/${baseType}/${g}/${slug}.html`);
  const results = await Promise.allSettled(urls.map(tryFetchForSlug));
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      console.log(`[DuLourd] Slug fallback hit: ${r.value.url}`);
      const m = r.value.url.match(/\/(\w+)\/[^/]+\.html$/);
      return { url: r.value.url, genre: m ? m[1] : '', slug, title: titles[0] };
    }
  }
  return null;
}

async function findContent(titles, mediaType) {
  const queries = extractSearchQueries(titles);

  const searchResults = await Promise.allSettled(
    queries.map(query => searchDle(query))
  );

  const allResults = [];
  for (const r of searchResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      allResults.push(...r.value);
    }
  }

  if (allResults.length > 0) {
    const match = bestMatch(allResults, titles);
    if (match && match.url) {
      try {
        const r = await safeFetch(match.url, { timeout: 5000 });
        if (r && r.ok) { await r.text(); return match; }
      } catch (e) { /* unreachable link */ }
    }
  }

  const slugMatch = await findSlugFallback(titles, mediaType);
  if (slugMatch) {
    return slugMatch;
  }

  return null;
}

async function getEpisodePageUrl(seriesUrl, season, episode) {
  const base = seriesUrl.replace('.html', '');
  return `${base}/${season}-saison/${episode}-episode.html`;
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const info = await findContent(titles, mediaType);
  if (!info) {
    console.warn(`[DuLourd] Content not found for ${tmdbId} (${mediaType})`);
    return [];
  }

  if (mediaType === 'movie') {
    console.warn(`[DuLourd] Movie support is limited (pages blocked 403). Trying to fetch: ${info.url}`);
    try {
      const html = await fetchText(info.url, { timeout: CONFIG.TIMEOUTS.PAGE });
      const episodeId = extractEpisodeId(html);
      if (!episodeId) return [];
      const xfields = extractXfields(html);
      if (xfields.length === 0) return [];
      return await resolveStreamsFromEpisode(episodeId, xfields, null);
    } catch (e) {
      console.warn(`[DuLourd] Movie fetch failed (likely premium/403): ${e.message}`);
      return [];
    }
  }

  if (!season || !episode) {
    console.warn(`[DuLourd] TV request missing season/episode: S${season}E${episode}`);
    return [];
  }

  // Fetch series page to detect subtype
  let seriesHtml;
  try {
    seriesHtml = await fetchText(info.url, { timeout: CONFIG.TIMEOUTS.PAGE });
  } catch (e) {
    console.warn(`[DuLourd] Series page not found: ${info.url}`);
    return [];
  }
  const subType = detectSubType(seriesHtml, info.genre);

    const episodeUrl = await getEpisodePageUrl(info.url, effectiveSeason, episode);
  let epHtml;
  try {
    epHtml = await fetchText(episodeUrl, { timeout: CONFIG.TIMEOUTS.PAGE });
  } catch (e) {
    console.warn(`[DuLourd] Episode page not found: ${episodeUrl}`);
    return [];
  }

  const episodeId = extractEpisodeId(epHtml);
  if (!episodeId) return [];

  const xfields = extractXfields(epHtml);
  if (xfields.length === 0) return [];

  const streams = await resolveStreamsFromEpisode(episodeId, xfields, subType);

    console.log(`[DuLourd] Found ${streams.length} stream(s) for ${info.slug} S${effectiveSeason}E${episode}`);
  return sortStreamsByLanguage(streams);
}
