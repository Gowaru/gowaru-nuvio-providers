import { fetchText, postForm } from './http.js'
import cheerio from 'cheerio-without-node-native'
import { resolveStream, safeFetch, withTimeout } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js'
import {
  SITE, ENDPOINTS, SELECTORS, PATTERNS, TIMEOUTS, SCORES,
  LANGUAGE_MAP, ANIME_GENRE_ID, ANIME_KEYWORDS,
  CACHE_TTL, MAX_CANDIDATES, MAX_SEARCH_TITLES,
} from './config.js'

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()[\]]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function isJapanese(text) {
  return /[\u3000-\u9FFF\uF900-\uFAFF]/.test(text || '')
}

const CACHE = new Map()

function cached(key, fn) {
  const now = Date.now()
  if (CACHE.has(key) && now - CACHE.get(key).ts < CACHE_TTL) return CACHE.get(key).data
  return fn().then(data => { CACHE.set(key, { data, ts: now }); return data })
}

function scoreMatch(resultTitle, searchTitle) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr) return 0
  if (nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) return SCORES.STRONG_MATCH
  const words = nt.split(/\s+/).filter(w => w.length > 2)
  const rWords = new Set(nr.split(/\s+/))
  const matched = words.filter(w => rWords.has(w)).length
  if (words.length > 0) return (matched / words.length) * 50
  return 0
}

function bestMatch(items, title) {
  let best = null, bestScore = 0
  for (const item of items) {
    const score = scoreMatch(item.title || item.name, title)
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore >= SCORES.MIN_MATCH ? best : null
}

function parseSearchResults(html) {
  const $ = cheerio.load(html)
  const results = []
  $('article.moviecard').each((_, el) => {
    const $card = $(el)
    const link = $card.find('figure a[href]').first().attr('href')
    let title = ($card.find('figure img').first().attr('alt') || '').trim()
    if (link && title) {
      const isSeries = link.includes('/streaming/series/')
      results.push({ url: link, title, isSeries })
    }
  })
  return results
}

function extractNonce(html) {
  const m = html.match(PATTERNS.SM_PUBLIC)
  return m ? m[2] : null
}

function parseSeasons(html) {
  const $ = cheerio.load(html)
  const seasons = []
  $(SELECTORS.SEASON_BUTTON).each((_, el) => {
    const id = $(el).attr('data-season')
    const title = $(el).text().trim()
    const isActive = $(el).hasClass('active')
    if (id) seasons.push({ id, title, isActive })
  })
  return seasons
}

function parseEpisodes(html) {
  const $ = cheerio.load(html)
  const episodes = []

  $(SELECTORS.EPISODE_ITEM).each((_, el) => {
    const $item = $(el)
    const $link = $item.find(SELECTORS.EPISODE_LINK).first()
    const href = $link.attr('href') || ''
    const title = $link.find(SELECTORS.EPISODE_TITLE).first().text().trim() || $link.text().trim()
    const m = href.match(PATTERNS.EPISODE_URL)

    if (m) {
      const season = parseInt(m[1])
      const episode = parseInt(m[2])
      episodes.push({ season, episode, link: href, title })
    }
  })

  return episodes
}

function extractIframeUrl(html) {
  const $ = cheerio.load(html)
  let src = $(SELECTORS.MOVIE_IFRAME).first().attr('src')
  if (!src) src = $(SELECTORS.MOVIE_IFRAME_FALLBACK).first().attr('src')
  if (!src) src = $(SELECTORS.MOVIE_IFRAME_ANY).first().attr('src')
  if (!src) {
    const allIframes = $('iframe')
    for (let i = 0; i < allIframes.length; i++) {
      const s = $(allIframes[i]).attr('src')
      if (s && s.startsWith('http') && !s.includes('youtube.com') && !s.includes('youtu.be')) { src = s; break }
    }
  }
  if (src && src.startsWith('//')) src = 'https:' + src
  return src || null
}

function detectLanguage(url, html) {
  const u = url.toLowerCase()
  if (u.includes('vostfr') || u.includes('vost')) return 'VOSTFR'
  if (u.includes('vf') || u.includes('french')) return 'VF'
  if (u.includes('vo') || u.includes('english')) return 'VO'
  const $ = html ? cheerio.load(html) : null
  if ($) {
    const pageText = $('body').text().toLowerCase()
    if (/vostfr|version originale sous-titr[eé]e/i.test(pageText)) return 'VOSTFR'
    if (/version fran[çc]aise/i.test(pageText)) return 'VF'
  }
  return 'VF'
}

function detectQuality(url, title) {
  const text = (url + ' ' + (title || '')).toLowerCase()
  if (/4k|2160/i.test(text)) return '4K'
  if (/1080|hd|fullhd/i.test(text)) return '1080p'
  if (/720|hd-ready/i.test(text)) return '720p'
  return 'HD'
}

async function fetchTmdbGenre(tmdbId, mediaType) {
  const apiKey = '8265bd1679663a7ea12ac168da84d2e8'
  const type = mediaType === 'movie' ? 'movie' : 'tv'
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}&language=en-US`
  try {
    const res = await safeFetch(url)
    if (!res || !res.ok) return null
    const text = await res.text()
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function detectSubType(tmdbId, mediaType, titles) {
  try {
    const details = await cached(`tmdb_${tmdbId}_${mediaType}`, () => fetchTmdbGenre(tmdbId, mediaType))
    if (!details) return null
    const genres = (details.genres || []).map(g => g.id)
    const isAnim = genres.includes(ANIME_GENRE_ID)
    const orig = mediaType === 'movie' ? details.original_title : details.original_name
    const jap = isJapanese(orig || '')
    const keywordMatch = titles.some(t => ANIME_KEYWORDS.test(t))
    if (isAnim && (jap || keywordMatch)) return 'anime'
    return null
  } catch {
    return null
  }
}

async function trySearch(titles) {
  const domains = [...new Set([SITE.BASE_URL, ...SITE.DOMAINS])]
  const probes = domains.flatMap(domain =>
    titles.slice(0, MAX_SEARCH_TITLES).map(async (title) => {
      try {
        const url = `${domain}/?s=${encodeURIComponent(title)}`
        const html = await fetchText(url, { timeout: TIMEOUTS.SEARCH })
        const results = parseSearchResults(html)
        if (results.length === 0) return null

        const movieResults = results.filter(r => !r.isSeries)
        const match = bestMatch(movieResults.length > 0 ? movieResults : results, title)
        if (match) {
          match._domain = domain
          return match
        }
      } catch (e) {
        console.warn(`[Wookafr] Search failed for "${title}": ${e.message}`)
      }
      return null
    })
  )
  const settled = await Promise.allSettled(probes)
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) return r.value
  }
  const slugMatch = await trySlugFallback(titles[0], 'movie')
  if (slugMatch) { console.log(`[Wookafr] Found via slug: ${slugMatch.url}`); return slugMatch }
  return null
}

async function trySearchSeries(titles) {
  const domains = [...new Set([SITE.BASE_URL, ...SITE.DOMAINS])]
  const probes = domains.flatMap(domain =>
    titles.slice(0, MAX_SEARCH_TITLES).map(async (title) => {
      try {
        const url = `${domain}/?s=${encodeURIComponent(title)}`
        const html = await fetchText(url, { timeout: TIMEOUTS.SEARCH })
        const results = parseSearchResults(html)
        const seriesHits = results.filter(r => r.isSeries)

        if (seriesHits.length > 0) {
          const seriesMatch = bestMatch(seriesHits, title)
          if (seriesMatch) {
            seriesMatch._domain = domain
            return seriesMatch
          }
        }

        if (results.length > 0) {
          const generalMatch = bestMatch(results, title)
          if (generalMatch) {
            generalMatch._domain = domain
            return generalMatch
          }
        }
      } catch (e) {
        console.warn(`[Wookafr] Series search failed for "${title}": ${e.message}`)
      }
      return null
    })
  )
  const settled = await Promise.allSettled(probes)
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) return r.value
  }
  const slugMatch = await trySlugFallback(titles[0], 'series')
  if (slugMatch) { console.log(`[Wookafr] Found series via slug: ${slugMatch.url}`); return slugMatch }
  return null
}

function toSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()[\]]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function probeSlug(slug, type, domain) {
  const path = type === 'series' ? `/streaming/series/${slug}/` : `/streaming/${slug}/`
  const url = `${domain}${path}`
  try {
    await fetchText(url, { method: 'HEAD', timeout: 3000 })
    return { url, title: slug.replace(/-/g, ' '), isSeries: type === 'series' }
  } catch {
    return null
  }
}

async function trySlugFallback(title, type) {
  const slug = toSlug(title)
  const candidates = [...new Set([slug, slug.replace(/-season-\d+$/, ''), slug.replace(/-saison-\d+$/, '')])]
  const domains = [...new Set([SITE.BASE_URL, ...SITE.DOMAINS])]
  
  for (const domain of domains) {
    const results = await Promise.allSettled(
      candidates.map(s => probeSlug(s, type, domain))
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) return r.value
    }
  }
  return null;
}


function toStream(name, url, quality, language, subType) {
  let origin = SITE.BASE_URL
  try {
    origin = new URL(url).origin
  } catch {}
  const s = {
    name,
    title: `[${language}] Wookafr${quality !== 'HD' ? ` [${quality}]` : ''}`,
    url,
    quality,
    language,
    headers: {
      Referer: `${origin}/`,
      Origin: origin,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  }
  if (subType) s.subType = subType
  return s
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const subType = await detectSubType(tmdbId, mediaType, titles)
  if (subType) console.log(`[Wookafr] Detected subtype: ${subType}`)

  if (mediaType === 'movie') {
    return extractMovie(tmdbId, titles, subType)
  }

  return extractSeries(tmdbId, mediaType, titles, season, episode, subType)
}

async function extractMovie(tmdbId, titles, subType) {
  const match = await trySearch(titles)
  if (!match) {
    console.warn(`[Wookafr] Movie not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Wookafr] Movie match: ${match.title} -> ${match.url}`)
  try {
    const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    const iframeUrl = extractIframeUrl(pageHtml)
    if (!iframeUrl) {
      console.warn(`[Wookafr] No iframe on ${match.url}`)
      return []
    }

      const lang = detectLanguage(match.url, pageHtml)
      const quality = detectQuality(iframeUrl, match.title)

      console.log(`[Wookafr] Iframe: ${iframeUrl} [${lang}]`)
      const stream = toStream('Wookafr', iframeUrl, quality, lang, subType)
      const resolved = await withTimeout(resolveStream(stream), 8000)
      if (resolved && resolved.url) return [{ ...resolved, provider: 'wookafr' }]
  } catch (e) {
    console.warn(`[Wookafr] Movie extraction failed: ${e.message}`)
  }
  return []
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  let targetEpisodeNums = [parseInt(episode) || 1]

  try {
    const imdbId = await getImdbId(tmdbId, mediaType)
    if (imdbId) {
      const absoluteEp = await getAbsoluteEpisode(imdbId, season, episode)
      if (absoluteEp && absoluteEp !== parseInt(episode)) {
        targetEpisodeNums.push(absoluteEp)
      }
    }
  } catch (e) {
    console.warn(`[Wookafr] ArmSync failed: ${e.message}`)
  }

  const match = await trySearchSeries(titles)
  if (!match) {
    console.warn(`[Wookafr] Series not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Wookafr] Series match: ${match.title} -> ${match.url}`)
  try {
    const seriesHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    const seasons = parseSeasons(seriesHtml)
    if (seasons.length === 0) {
      console.warn(`[Wookafr] No seasons on series page, trying direct iframe extraction`)
      const iframeUrl = extractIframeUrl(seriesHtml)
      if (iframeUrl) {
        const lang = detectLanguage(match.url, seriesHtml)
        const quality = detectQuality(iframeUrl, match.title)
        const stream = toStream('Wookafr', iframeUrl, quality, lang, subType)
        const resolved = await withTimeout(resolveStream(stream), 8000)
        if (resolved && resolved.url) return [{ ...resolved, provider: 'wookafr' }]
      }
      return []
    }

    const targetSeason = seasons.find(s => {
      const sn = s.title.match(PATTERNS.SEASON_TITLE)
      return sn && parseInt(sn[1]) === targetSeasonNum
    }) || seasons[0]

    let parsedEpisodes

    if (targetSeason.isActive) {
      parsedEpisodes = parseEpisodes(seriesHtml)
    } else {
      const nonce = extractNonce(seriesHtml)
      if (!nonce) {
        console.warn(`[Wookafr] No AJAX nonce found`)
        return []
      }

      const ajaxData = await postForm(
        `${SITE.BASE_URL}/wp-admin/admin-ajax.php`,
        { action: 'getepisodes', season_id: targetSeason.id, nonce },
        { timeout: TIMEOUTS.AJAX }
      )

      const ajaxHtml = ajaxData?.data?.html
      if (!ajaxHtml) {
        console.warn(`[Wookafr] AJAX returned no episode data for season ${targetSeasonNum}`)
        return []
      }
      parsedEpisodes = parseEpisodes(ajaxHtml)
    }

    if (parsedEpisodes.length === 0) {
      console.warn(`[Wookafr] No episodes for season ${targetSeasonNum}`)
      return []
    }

    const seasonEpisodes = parsedEpisodes.filter(e => e.season === targetSeasonNum)
    let ep = null
    for (const epNum of targetEpisodeNums) {
      ep = seasonEpisodes.find(e => e.episode === epNum)
      if (ep) break
    }
    if (!ep) ep = seasonEpisodes[targetEpisodeNums[0] - 1]

    if (!ep) {
      console.warn(`[Wookafr] Episode ${targetEpisodeNums[0]} not found in season ${targetSeasonNum}`)
      return []
    }

    console.log(`[Wookafr] Episode: S${ep.season}E${ep.episode} -> ${ep.link}`)
    const epHtml = await fetchText(ep.link, { timeout: TIMEOUTS.PAGE })
    const iframeUrl = extractIframeUrl(epHtml)
    if (!iframeUrl) {
      console.warn(`[Wookafr] No iframe on episode page`)
      return []
    }

    const lang = detectLanguage(ep.link, epHtml)
    const quality = detectQuality(iframeUrl, ep.title)

    console.log(`[Wookafr] Iframe: ${iframeUrl} [${lang}]`)
    const stream = toStream('Wookafr', iframeUrl, quality, lang, subType)
    const resolved = await withTimeout(resolveStream(stream), 8000)
    if (resolved && resolved.url) return [{ ...resolved, provider: 'wookafr' }]
  } catch (e) {
    console.warn(`[Wookafr] Series extraction failed: ${e.message}`)
  }
  return []
}
