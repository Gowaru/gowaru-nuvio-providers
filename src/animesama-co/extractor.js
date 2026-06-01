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

  $('a.asn-search-result').each((_, el) => {
    const href = $(el).attr('href') || ''
    const title = $(el).find('.asn-search-result-title').first().text().trim()
    if (!href || !title) return

    const idMatch = href.match(PATTERNS.ANIME_ID)
    if (!idMatch) return

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      animeId: idMatch[1],
      slug: idMatch[2],
      title,
    })
  })

  return results
}

function parseEpisodeIframe(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  const urls = []
  const seen = new Set()

  // Extract iframe src from video player
  $('#videoPlayer').each((_, el) => {
    const src = $(el).attr('src')
    if (src && !seen.has(src)) { seen.add(src); urls.push(src) }
  })

  // Fallback: any iframe with sibnet
  if (urls.length === 0) {
    $('iframe[src*="sibnet"]').each((_, el) => {
      const src = $(el).attr('src')
      if (src && !seen.has(src)) { seen.add(src); urls.push(src) }
    })
  }

  return urls
}

function detectLanguage(html) {
  const langs = []
  if (!html) return langs
  const $ = cheerio.load(html)

  $('[data-lang]').each((_, el) => {
    const lang = $(el).attr('data-lang')
    if (lang === 'vf' && !langs.includes('VF')) langs.push('VF')
    if (lang === 'vostfr' && !langs.includes('VOSTFR')) langs.push('VOSTFR')
  })

  // Fallback: check page text for language indicators
  if (langs.length === 0) {
    const text = $('body').text().toLowerCase()
    if (/vostfr|version originale/i.test(text)) langs.push('VOSTFR')
    if (/vf\b|version fran[cç]aise/i.test(text)) langs.push('VF')
  }

  if (langs.length === 0) langs.push('VF')
  return langs
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
        console.log(`[AnimeSamaCo] Matched: "${best.title}" (id: ${best.animeId}) score: ${bestScore}`)
        return best
      }
    } catch (e) {
      console.warn(`[AnimeSamaCo] Search failed for "${title}": ${e.message}`)
    }
  }
  return null
}

function toStream(url, language) {
  let origin = SITE.BASE_URL
  try { origin = new URL(url).origin } catch {}

  return {
    name: `AnimeSama (${language})`,
    title: `[${language}] AnimeSama`,
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
  if (subType) console.log(`[AnimeSamaCo] Detected subtype: ${subType}`)

  if (mediaType === 'movie') {
    return extractMovie(tmdbId, titles, subType)
  }
  return extractSeries(tmdbId, mediaType, titles, season, episode, subType)
}

async function extractMovie(tmdbId, titles, subType) {
  const match = await searchAnime(titles)
  if (!match) {
    console.warn(`[AnimeSamaCo] Movie not found for TMDB ${tmdbId}`)
    return []
  }
  return extractEpisodeStreams(match, 1, 1, subType)
}

function parseAvailableSeasons(html) {
  if (!html) return []
  const seasons = new Set()
  const regex = /\/saison-(\d+)\.html/g
  let m
  while ((m = regex.exec(html)) !== null) {
    seasons.add(parseInt(m[1]))
  }
  return [...seasons].sort((a, b) => a - b)
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  let targetEpisodeNums = [parseInt(episode) || 1]
  let absoluteEp = null

  try {
    const imdbId = await getImdbId(tmdbId, mediaType)
    if (imdbId) {
      absoluteEp = await getAbsoluteEpisode(imdbId, season, episode)
      if (absoluteEp && absoluteEp !== parseInt(episode)) {
        targetEpisodeNums.push(absoluteEp)
      }
    }
  } catch (e) {
    console.warn(`[AnimeSamaCo] ArmSync failed: ${e.message}`)
  }

  const match = await searchAnime(titles)
  if (!match) {
    console.warn(`[AnimeSamaCo] Series not found for TMDB ${tmdbId}`)
    return []
  }

  // Step 1: Try the requested TMDB season directly
  const directResult = await extractEpisodeStreams(match, targetSeasonNum, targetEpisodeNums[0], subType)
  if (directResult.length > 0) {
    return directResult
  }
  console.log(`[AnimeSamaCo] Direct season S${targetSeasonNum}E${targetEpisodeNums[0]} failed, trying fallback...`)

  // Step 2: Fallback - scrape series page for available seasons
  try {
    const seriesUrl = `${SITE.BASE_URL}/anime/${match.animeId}-${match.slug}.html`
    const seriesHtml = await fetchText(seriesUrl, { timeout: TIMEOUTS.PAGE })
    const availableSeasons = parseAvailableSeasons(seriesHtml)

    if (availableSeasons.length === 0) {
      console.warn(`[AnimeSamaCo] No seasons found on series page`)
      return []
    }

    console.log(`[AnimeSamaCo] Available seasons on site: ${availableSeasons.join(', ')}`)

    // Fallback: try absolute episode across all seasons first (avoids false positives
    // where TMDB episode 1 would match site S1E1 for every anime)
    const attempts = []

    // 1. Try absolute episode number across all available seasons
    if (absoluteEp !== null && absoluteEp !== parseInt(episode)) {
      for (const siteSeason of availableSeasons) {
        attempts.push({ season: siteSeason, episode: absoluteEp })
      }
    }

    // 2. Final resort: try last available season with the TMDB season/episode
    // New episodes are most likely in the latest site season
    const lastSeason = availableSeasons[availableSeasons.length - 1]
    if (lastSeason !== targetSeasonNum) {
      attempts.push({ season: lastSeason, episode: parseInt(episode) || 1 })
    }

    if (attempts.length === 0) {
      console.warn(`[AnimeSamaCo] No fallback attempts to make`)
      return []
    }

    const results = await Promise.allSettled(
      attempts.map(a => extractEpisodeStreams(match, a.season, a.episode, subType))
    )

    const validResults = []
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
        validResults.push({ result: results[i].value, attempt: attempts[i] })
      }
    }

    if (validResults.length > 0) {
      const best = validResults[0]
      console.log(`[AnimeSamaCo] Fallback succeeded with S${best.attempt.season}E${best.attempt.episode}`)
      return best.result
    }

    console.warn(`[AnimeSamaCo] Fallback failed: no streams found across any season`)
  } catch (e) {
    console.warn(`[AnimeSamaCo] Fallback error: ${e.message}`)
  }

  return []
}

async function extractEpisodeStreams(match, season, episode, subType) {
  const episodeUrl = `${SITE.BASE_URL}/anime/${match.animeId}-${match.slug}/saison-${season}/episode-${episode}.html`
  console.log(`[AnimeSamaCo] Fetching episode: ${episodeUrl}`)

  try {
    const html = await fetchText(episodeUrl, { timeout: TIMEOUTS.PAGE })
    if (!html) {
      console.warn(`[AnimeSamaCo] Empty response for episode page`)
      return []
    }

    const iframeUrls = parseEpisodeIframe(html)
    const languages = detectLanguage(html)

    if (iframeUrls.length === 0) {
      console.warn(`[AnimeSamaCo] No iframe found on episode page`)
      return []
    }

    console.log(`[AnimeSamaCo] Found ${iframeUrls.length} player URL(s), languages: ${languages.join(', ')}`)

    const streams = []

    // Deduplicate: same URL with different languages = same stream
    const seen = new Set()
    for (const lang of languages) {
      for (const url of iframeUrls) {
        const key = `${url}|${lang}`
        if (seen.has(key)) continue
        seen.add(key)

        const stream = toStream(url, lang)
        if (subType) stream.subType = subType

        const resolved = await resolveWithTimeout(stream)
        if (resolved && resolved.url) {
          resolved.language = lang
          streams.push({ ...resolved, provider: 'animesama-co' })
        }
      }
    }

    // If no streams resolved but we have iframe URLs, return them as-is
    if (streams.length === 0) {
      for (const lang of languages) {
        for (const url of iframeUrls) {
          const key = `raw:${url}|${lang}`
          if (seen.has(key)) continue
          seen.add(key)

          const stream = toStream(url, lang)
          if (subType) stream.subType = subType
          streams.push({ ...stream, provider: 'animesama-co', isDirect: false })
        }
      }
    }

    console.log(`[AnimeSamaCo] Episode S${season}E${episode}: ${streams.length} streams`)
    return streams
  } catch (e) {
    console.warn(`[AnimeSamaCo] Episode extraction failed: ${e.message}`)
  }
  return []
}
