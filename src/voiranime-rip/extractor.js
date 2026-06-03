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

/**
 * Extract season number from episode link text or URL
 * Returns null if no season info found.
 */
function extractSeasonFromEpisodeLink(text, url) {
  const combined = `${text || ''} ${url || ''}`
  const match = combined.match(/S(?:aison|eason)\s*[:\(\s-]*\s*(\d+)/i) ||
                combined.match(/saison[_-](\d+)/i) ||
                combined.match(/S(\d+)\s*(?:E|V|VF|VOSTFR|\b)/i)
  if (match) return parseInt(match[1], 10)
  return null
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

/**
 * Search for anime on Voiranime.rip
 * Returns ALL high-scoring results (deduplicated by slug) so callers can
 * try multiple variants (VF/VOSTFR, different slug patterns).
 */
async function searchAnime(titles) {
  for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      const html = await postSearch(title, { timeout: TIMEOUTS.SEARCH })
      const results = parseSearchResults(html)
      if (results.length === 0) continue

      const scored = results
        .map(r => ({ ...r, score: scoreMatch(r.title, title) }))
        .filter(r => r.score >= SCORES.MIN_MATCH)
        .sort((a, b) => b.score - a.score)

      if (scored.length > 0 && scored[0].score >= SCORES.EXACT_MATCH) {
        // Deduplicate by slug and return all top-scoring variants
        const bestScore = scored[0].score
        const seenSlugs = new Set()
        const topResults = scored.filter(r => {
          if (seenSlugs.has(r.slug)) return false
          if (r.score < bestScore - 20) return false
          seenSlugs.add(r.slug)
          return true
        })
        console.log(`[VoiranimeRip] Matched: "${topResults[0].title}" (slug: ${topResults[0].slug}) score: ${topResults[0].score}, ${topResults.length} variant(s)`)
        return topResults
      }
    } catch (e) {
      console.warn(`[VoiranimeRip] Search failed for "${title}": ${e.message}`)
    }
  }
  return []
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
  const matches = await searchAnime(titles)
  if (!matches || matches.length === 0) {
    console.warn(`[VoiranimeRip] Movie not found for TMDB ${tmdbId}`)
    return []
  }
  // Try each match (different slug variants) until we find streams
  for (const match of matches) {
    const result = await extractMoviePageStreams(match, subType)
    if (result.length > 0) return result
  }
  return []
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
    name: `Voiranime-Rip (${language})`,
    title: `[${language}] Voiranime-Rip`,
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

  const matches = await searchAnime(titles)
  if (!matches || matches.length === 0) {
    console.warn(`[VoiranimeRip] Series not found for TMDB ${tmdbId}`)
    return []
  }

  // Try each search match (different slug variants) with the requested season
  for (const match of matches) {
    const result = await extractEpisodeStreams(match, targetSeasonNum, parseInt(episode) || 1, subType)
    if (result.length > 0) {
      console.log(`[VoiranimeRip] Found streams with slug: ${match.slug}`)
      return result
    }
  }
  
  console.log(`[VoiranimeRip] Direct season S${targetSeasonNum} failed on all matches, trying fallback...`)

  // Step 2: Fallback - for each match, scrape the series page for available seasons
  for (const match of matches) {
    try {
      const seriesHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
      const availableSeasons = parseAvailableSeasons(seriesHtml)

      if (availableSeasons.length === 0) {
        console.warn(`[VoiranimeRip] No seasons found on series page for slug: ${match.slug}`)
        continue
      }

      console.log(`[VoiranimeRip] Available seasons on site (${match.slug}): ${availableSeasons.join(', ')}`)

      const attempts = []

      // Try each available season with TMDB episode
      for (const siteSeason of availableSeasons) {
        attempts.push({ match, season: siteSeason, episode: parseInt(episode) || 1 })
      }

      // Also try absolute episode across seasons if available
      if (absoluteEp !== null && absoluteEp !== (parseInt(episode) || 1)) {
        for (const siteSeason of availableSeasons) {
          attempts.push({ match, season: siteSeason, episode: absoluteEp })
        }
      }

      if (attempts.length === 0) continue

      // Try all attempts in parallel
      const results = await Promise.allSettled(
        attempts.map(a => extractEpisodeStreams(a.match, a.season, a.episode, subType))
      )

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
          const { season: s, episode: e } = attempts[i]
          console.log(`[VoiranimeRip] Fallback succeeded with S${s}E${e}`)
          return results[i].value
        }
      }
    } catch (e) {
      console.warn(`[VoiranimeRip] Fallback error for slug ${match.slug}: ${e.message}`)
    }
  }

  console.warn(`[VoiranimeRip] Fallback failed: no streams found across any match/season`)
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
