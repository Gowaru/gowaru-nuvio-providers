import cheerio from 'cheerio-without-node-native'
import { fetchText, postSearch } from './http.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js'
import {
  normalize, cached, scoreMatch, resolveWithTimeout, detectSubType, toStream, parseAvailableSeasons, stripSeasonSuffix,
} from '../utils/dle-extractor.js'
import {
  SITE, PATTERNS, TIMEOUTS, SCORES,
  CACHE_TTL, MAX_SEARCH_TITLES,
} from './config.js'

/**
 * Validate a fallback match: the result title must share at least 2 significant
 * words (length > 3) with the original TMDB title to prevent false positives.
 * e.g. "Reincarnation" matches "Reincarnation no Kaben" (1 word) ❌
 *      "Reincarnation" matches "Mushoku Tensei: Jobless Reincarnation" (1 word) ❌
 *      "Slime" matches "Moi quand je me réincarne en Slime" (1 word) ✅ but unique enough
 */
function validateFallbackMatch(resultTitle, originalTitles) {
  const resultWords = new Set(normalize(resultTitle).split(/\s+/).filter(w => w.length > 3))
  
  for (const title of originalTitles) {
    const cleanTitle = stripSeasonSuffix(title)
    const titleWords = normalize(cleanTitle).split(/\s+/).filter(w => w.length > 3)
    
    // Count overlapping significant words
    let overlap = 0
    for (const w of titleWords) {
      if (resultWords.has(w)) overlap++
    }
    
    // At least 2 overlapping words OR the query contains a highly distinctive word
    if (overlap >= 2) return true
    
    // Edge case: distinctive short titles like "Overlord" (single word)
    if (titleWords.length <= 2 && overlap >= 1) return true
  }
  
  return false
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

/**
 * Detect language from a page URL or content
 */
function detectLanguage(html) {
  const $ = cheerio.load(html)

  // Check title
  const title = $('title').text().toLowerCase()
  if (/\bvostfr\b/.test(title)) return 'VOSTFR'
  if (/\bvf\b/.test(title) && !/\bvostfr\b/.test(title)) return 'VF'

  // Check page content (first 5000 chars)
  const body = $('body').text().toLowerCase().slice(0, 5000)
  const hasVostfr = /\bvostfr\b/.test(body)
  const hasVf = /\bvf\b/.test(body)
  
  if (hasVostfr && !hasVf) return 'VOSTFR'
  if (hasVf && !hasVostfr) return 'VF'

  return null
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
    const pageLang = detectLanguage(html)
    urls.push({ url: iframeSrc, lang: pageLang })
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

  // 3. Fallback: detect page language and apply to any stream still without lang
  if (urls.some(u => !u.lang)) {
    const pageLang = detectLanguage(html)
    if (pageLang) {
      for (const u of urls) {
        if (!u.lang) u.lang = pageLang
      }
    }
  }

  return urls
}

/**
 * Generate short fallback queries from a title for sites whose search engine
 * doesn't return results for long/verbose queries.
 * e.g. "Moi, quand je me réincarne en Slime" → ["Slime", "en Slime", "Moi"]
 */
function generateFallbackQueries(titles) {
  const seen = new Set()
  const fallbacks = []

  for (const title of titles) {
    const words = title.split(/\s+/).filter(w => w.length > 2)
    
    // Last word (usually the most distinctive: "Slime", "Titan", "Man", etc.)
    if (words.length >= 2) {
      const lastWord = words[words.length - 1]
      if (!seen.has(lastWord) && lastWord.length >= 3) {
        seen.add(lastWord)
        fallbacks.push(lastWord)
      }
      
      // Last 2 words for slightly more context
      const lastTwo = words.slice(-2).join(' ')
      if (!seen.has(lastTwo) && lastTwo.split(' ').every(w => w.length >= 3)) {
        seen.add(lastTwo)
        fallbacks.push(lastTwo)
      }
    }
    
    // First word (title-specific: "Moi", "That", "One", "Attack")
    if (words.length >= 1) {
      const firstWord = words[0]
      if (!seen.has(firstWord) && firstWord.length >= 3 && firstWord.length <= 8) {
        seen.add(firstWord)
        fallbacks.push(firstWord)
      }
    }

    // Stop once we have enough fallback queries
    if (fallbacks.length >= 4) break
  }

  return fallbacks
}

/**
 * Search for anime on Voiranime.rip
 * Returns ALL high-scoring results (deduplicated by slug) so callers can
 * try multiple variants (VF/VOSTFR, different slug patterns).
 */
async function searchAnime(titles) {
  // Step 1: Try normal title queries
  for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      const result = await trySearchQuery(title, false, titles)
      if (result) return result
    } catch (e) {
      console.warn(`[VoiranimeRip] Search failed for "${title}": ${e.message}`)
    }
  }

  // Step 2: Fallback — try short keyword queries (the site's search engine
  // often fails on long/exact titles but works with short distinctive words)
  console.log(`[VoiranimeRip] No results with full titles, trying short fallback queries...`)
  const fallbackQueries = generateFallbackQueries(titles)
  for (const query of fallbackQueries) {
    try {
      const result = await trySearchQuery(query, true, titles)
      if (result) {
        console.log(`[VoiranimeRip] Fallback query "${query}" succeeded!`)
        return result
      }
    } catch (e) {
      console.warn(`[VoiranimeRip] Fallback search failed for "${query}": ${e.message}`)
    }
  }

  return []
}

/**
 * Try a single search query and return top-scoring results if any match.
 * @param {string} query - The search query
 * @param {boolean} [isFallback=false] - If true, relaxes the scoring threshold
 *   since short queries can't reach EXACT_MATCH but still return valid results.
 */
async function trySearchQuery(query, isFallback = false, originalTitles = null) {
  const cleanQuery = stripSeasonSuffix(query)
  const html = await postSearch(cleanQuery, { timeout: TIMEOUTS.SEARCH })
  const results = parseSearchResults(html)
  if (results.length === 0) return null

  let scored = results
    .map(r => ({ ...r, score: scoreMatch(r.title, query, SCORES) }))
    .filter(r => r.score >= SCORES.MIN_MATCH)
    .sort((a, b) => b.score - a.score)

  // For normal queries: EXACT_MATCH threshold ensures high confidence
  // For fallback queries: use MIN_MATCH since short keywords can't reach
  //   EXACT_MATCH but the site's own search already filtered for relevance.
  //   The queries are ordered by distinctiveness (last word first), so
  //   the most specific query tries first and finds the correct result.
  const threshold = isFallback ? SCORES.MIN_MATCH : SCORES.EXACT_MATCH

  if (scored.length > 0 && scored[0].score >= threshold) {
    // For fallback queries, validate that the match shares enough words
    // with the ORIGINAL TMDB titles (not just the short fallback query)
    if (isFallback) {
      const validated = scored.filter(r => validateFallbackMatch(r.title, originalTitles || [query]))
      if (validated.length === 0) {
        console.log(`[VoiranimeRip] Fallback "${query}" scored ${scored[0].score} but failed word validation (false positive)`)
        return null
      }
      scored = validated
    }

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

  return null
}

const SEASON_PATTERN = /\/saison-(\d+)\//g

async function detectSubTypeCached(tmdbId, mediaType) {
  return cached(`tmdb_subtype_${tmdbId}_${mediaType}`, () => detectSubType(tmdbId, mediaType), CACHE_TTL)
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const subType = await detectSubTypeCached(tmdbId, mediaType)
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

      const stream = toStream(v.url, lang, 'Voiranime-Rip', SITE.BASE_URL)
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

        const stream = toStream(v.url, lang, 'Voiranime-Rip', SITE.BASE_URL)
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
      const availableSeasons = parseAvailableSeasons(seriesHtml, SEASON_PATTERN)

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

      const stream = toStream(v.url, lang, 'Voiranime-Rip', SITE.BASE_URL)
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

        const stream = toStream(v.url, lang, 'Voiranime-Rip', SITE.BASE_URL)
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
