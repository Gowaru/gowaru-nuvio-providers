import cheerio from 'cheerio-without-node-native'
import { fetchText, postSearch } from './http.js'
import { resolveStream, safeFetch } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js'
import {
  SITE, PATTERNS, TIMEOUTS, SCORES,
  CACHE_TTL, MAX_SEARCH_TITLES,
} from './config.js'

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]\/-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
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
  if (words.length > 0) return Math.round((matched / words.length) * 50)
  return 0
}

function parseSearchResults(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  const results = []

  $('a.va-search-result').each((_, el) => {
    const href = $(el).attr('href') || ''
    const title = $(el).find('.va-search-result-title').first().text().trim()
    if (!href || !title) return

    const slugMatch = href.match(PATTERNS.SLUG)
    if (!slugMatch) return

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      slug: slugMatch[1],
      title,
    })
  })

  return results
}

function parseVideoUrls(html) {
  const urls = []
  if (!html) return urls
  const $ = cheerio.load(html)

  // 1. Extract default iframe src (episode pages use #videoPlayer, movie pages use .video-wrapper iframe)
  let iframeSrc = $('#videoPlayer').attr('src')
  if (!iframeSrc) {
    iframeSrc = $('.video-wrapper iframe').first().attr('src')
  }
  if (iframeSrc) {
    urls.push({ url: iframeSrc, lang: null })
  }

  // 2. Extract language-specific URLs from JS inline object
  // Pattern: vostfr: 'https://...' or vf: 'https://...' (works for both videoUrls and filmUrls)
  const text = $('script').text()
  const regex = /(vostfr|vf)\s*:\s*['"]([^'"]+)['"]/gi
  let m
  while ((m = regex.exec(text)) !== null) {
    const lang = m[1].toLowerCase() === 'vf' ? 'VF' : 'VOSTFR'
    if (!urls.some(u => u.url === m[2])) {
      urls.push({ url: m[2], lang })
    }
  }

  return urls
}

async function searchAnime(titles) {
  for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      const html = await postSearch(title, { timeout: TIMEOUTS.SEARCH })
      const results = parseSearchResults(html)
      if (results.length === 0) continue

      let best = null, bestScore = 0
      for (const r of results) {
        const score = scoreMatch(r.title, title)
        if (score > bestScore) { bestScore = score; best = r }
      }

      if (best && bestScore >= SCORES.MIN_MATCH) {
        console.log(`[VoiranimeRip] Matched: "${best.title}" (slug: ${best.slug}) score: ${bestScore}`)
        return best
      }
    } catch (e) {
      console.warn(`[VoiranimeRip] Search failed for "${title}": ${e.message}`)
    }
  }
  return null
}

function parseAvailableSeasons(html) {
  if (!html) return []
  const seasons = new Set()
  const regex = /\/saison-(\d+)\//g
  let m
  while ((m = regex.exec(html)) !== null) {
    seasons.add(parseInt(m[1]))
  }
  return [...seasons].sort((a, b) => a - b)
}

async function detectSubType(tmdbId, mediaType) {
  const apiKey = '8265bd1679663a7ea12ac168da84d2e8'
  const type = mediaType === 'movie' ? 'movie' : 'tv'
  try {
    const details = await cached(`tmdb_${tmdbId}_${mediaType}`, async () => {
      const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}&language=en-US`
      const res = await safeFetch(url)
      if (!res || !res.ok) return null
      const text = await res.text()
      return JSON.parse(text)
    })
    if (!details) return null
    const genres = (details.genres || []).map(g => g.id)
    if (genres.includes(16)) return 'anime'
    return null
  } catch {
    return null
  }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const subType = await detectSubType(tmdbId, mediaType)
  if (subType) console.log(`[VoiranimeRip] Detected subtype: ${subType}`)

  if (mediaType === 'movie') {
    return extractMovie(tmdbId, titles, subType)
  }
  return extractSeries(tmdbId, mediaType, titles, season, episode, subType)
}

async function extractMovie(tmdbId, titles, subType) {
  const match = await searchAnime(titles)
  if (!match) {
    console.warn(`[VoiranimeRip] Movie not found for TMDB ${tmdbId}`)
    return []
  }
  return extractMoviePageStreams(match, subType)
}

async function extractMoviePageStreams(match, subType) {
  console.log(`[VoiranimeRip] Fetching movie page: ${match.url}`)

  try {
    const html = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    if (!html) {
      console.warn(`[VoiranimeRip] Empty response for movie page`)
      return []
    }

    const videoUrls = parseVideoUrls(html)
    if (videoUrls.length === 0) {
      console.warn(`[VoiranimeRip] No video URLs found on movie page`)
      return []
    }

    console.log(`[VoiranimeRip] Found ${videoUrls.length} video URL(s)`)

    const streams = []
    const seen = new Set()

    for (const v of videoUrls) {
      const lang = v.lang || 'VF'
      const key = `${v.url}|${lang}`
      if (seen.has(key)) continue
      seen.add(key)

      const stream = toStream(v.url, lang)
      if (subType) stream.subType = subType

      const resolved = await resolveWithTimeout(stream)
      if (resolved && resolved.url) {
        resolved.language = lang
        streams.push({ ...resolved, provider: 'voiranime-rip' })
      }
    }

    if (streams.length === 0) {
      for (const v of videoUrls) {
        const lang = v.lang || 'VF'
        const key = `raw:${v.url}|${lang}`
        if (seen.has(key)) continue
        seen.add(key)

        const stream = toStream(v.url, lang)
        if (subType) stream.subType = subType
        streams.push({ ...stream, provider: 'voiranime-rip', isDirect: false })
      }
    }

    console.log(`[VoiranimeRip] Movie: ${streams.length} streams`)
    return streams
  } catch (e) {
    console.warn(`[VoiranimeRip] Movie extraction failed: ${e.message}`)
  }
  return []
}

function toStream(url, language) {
  return {
    name: `Voiranime (${language})`,
    title: `[${language}] Voiranime`,
    url,
    quality: 'HD',
    language,
    headers: {
      Referer: `${SITE.BASE_URL}/`,
      Origin: SITE.BASE_URL,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  }
}

async function resolveWithTimeout(stream) {
  try {
    const resolved = await resolveStream(stream)
    if (resolved && resolved.url) {
      if (resolved.isDirect) return resolved
      return { ...resolved, isDirect: true }
    }
    return null
  } catch {
    return null
  }
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  let absoluteEp = null

  try {
    const imdbId = await getImdbId(tmdbId, mediaType)
    if (imdbId) {
      absoluteEp = await getAbsoluteEpisode(imdbId, season, episode)
    }
  } catch (e) {
    console.warn(`[VoiranimeRip] ArmSync failed: ${e.message}`)
  }

  const match = await searchAnime(titles)
  if (!match) {
    console.warn(`[VoiranimeRip] Series not found for TMDB ${tmdbId}`)
    return []
  }

  // Step 1: Try the requested TMDB season directly
  const directResult = await extractEpisodeStreams(match, targetSeasonNum, parseInt(episode) || 1, subType)
  if (directResult.length > 0) {
    return directResult
  }
  console.log(`[VoiranimeRip] Direct season S${targetSeasonNum} failed, trying fallback...`)

  // Step 2: Fallback - scrape series page for available seasons
  try {
    const seriesHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    const availableSeasons = parseAvailableSeasons(seriesHtml)

    if (availableSeasons.length === 0) {
      console.warn(`[VoiranimeRip] No seasons found on series page`)
      return []
    }

    console.log(`[VoiranimeRip] Available seasons on site: ${availableSeasons.join(', ')}`)

    const attempts = []

    // Try absolute episode across all seasons
    if (absoluteEp !== null && absoluteEp !== (parseInt(episode) || 1)) {
      for (const siteSeason of availableSeasons) {
        attempts.push({ season: siteSeason, episode: absoluteEp })
      }
    }

    // Final resort: try last season with TMDB episode
    const lastSeason = availableSeasons[availableSeasons.length - 1]
    if (lastSeason !== targetSeasonNum) {
      attempts.push({ season: lastSeason, episode: parseInt(episode) || 1 })
    }

    if (attempts.length === 0) {
      console.warn(`[VoiranimeRip] No fallback attempts to make`)
      return []
    }

    const results = await Promise.allSettled(
      attempts.map(a => extractEpisodeStreams(match, a.season, a.episode, subType))
    )

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
        const { season: s, episode: e } = attempts[i]
        console.log(`[VoiranimeRip] Fallback succeeded with S${s}E${e}`)
        return results[i].value
      }
    }

    console.warn(`[VoiranimeRip] Fallback failed: no streams found across any season`)
  } catch (e) {
    console.warn(`[VoiranimeRip] Fallback error: ${e.message}`)
  }

  return []
}

async function extractEpisodeStreams(match, season, episode, subType) {
  const episodeUrl = `${SITE.BASE_URL}/${match.slug}/saison-${season}/episode-${episode}/`
  console.log(`[VoiranimeRip] Fetching episode: ${episodeUrl}`)

  try {
    const html = await fetchText(episodeUrl, { timeout: TIMEOUTS.PAGE })
    if (!html) {
      console.warn(`[VoiranimeRip] Empty response for episode page`)
      return []
    }

    const videoUrls = parseVideoUrls(html)
    if (videoUrls.length === 0) {
      console.warn(`[VoiranimeRip] No video URLs found on episode page`)
      return []
    }

    console.log(`[VoiranimeRip] Found ${videoUrls.length} video URL(s)`)

    const streams = []
    const seen = new Set()

    for (const v of videoUrls) {
      const lang = v.lang || 'VF' // default to VF if no lang detected
      const key = `${v.url}|${lang}`
      if (seen.has(key)) continue
      seen.add(key)

      const stream = toStream(v.url, lang)
      if (subType) stream.subType = subType

      const resolved = await resolveWithTimeout(stream)
      if (resolved && resolved.url) {
        resolved.language = lang
        streams.push({ ...resolved, provider: 'voiranime-rip' })
      }
    }

    // If no streams resolved, return raw iframes
    if (streams.length === 0) {
      for (const v of videoUrls) {
        const lang = v.lang || 'VF'
        const key = `raw:${v.url}|${lang}`
        if (seen.has(key)) continue
        seen.add(key)

        const stream = toStream(v.url, lang)
        if (subType) stream.subType = subType
        streams.push({ ...stream, provider: 'voiranime-rip', isDirect: false })
      }
    }

    console.log(`[VoiranimeRip] Episode S${season}E${episode}: ${streams.length} streams`)
    return streams
  } catch (e) {
    console.warn(`[VoiranimeRip] Episode extraction failed: ${e.message}`)
  }
  return []
}
