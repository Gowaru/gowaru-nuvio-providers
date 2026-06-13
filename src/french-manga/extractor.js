import cheerio from 'cheerio-without-node-native'
import { fetchText, fetchJson, postSearch } from './http.js'
import { resolveStream, safeFetch } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js'
import {
  SITE, ENDPOINTS, PATTERNS, TIMEOUTS, SCORES,
  LANGUAGE_MAP, CACHE_TTL, MAX_SEARCH_TITLES,
} from './config.js'

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]]/g, ' ')
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

  // Remove season info for matching
  const cleanNr = nr.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').trim()
  const cleanNt = nt.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').trim()

  if (cleanNr === cleanNt || nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) return SCORES.STRONG_MATCH

  const words = cleanNt.split(/\s+/).filter(w => w.length > 2)
  const rWords = new Set(cleanNr.split(/\s+/))
  const matched = words.filter(w => rWords.has(w)).length
  if (words.length > 0) return Math.round((matched / words.length) * 50)
  return 0
}

function extractSeason(title) {
  const m = (title || '').match(PATTERNS.SEASON_IN_TITLE)
  return m ? parseInt(m[1]) : null
}

function bestMatch(items, title, targetSeason) {
  let best = null, bestScore = 0
  for (const item of items) {
    let score = scoreMatch(item.title || item.name, title)
    // Only apply season bonus/penalty if there's already some title similarity
    // Prevents false positives where a completely unrelated anime matches
    // just because it happens to have the same season number in its title
    // (e.g. "Oshi no Ko - Saison 3" matching a search for One Punch Man S3)
    if (targetSeason && score > 0) {
      const ts = parseInt(targetSeason)
      const rs = item.season
      if (rs === ts) score += 40
      else if (rs && Math.abs(rs - ts) === 1) score += 10
      else if (rs && rs !== ts) score -= 20
    }
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore >= SCORES.MIN_MATCH ? best : null
}

function parseSearchResults(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  const results = []

  $('div.short').each((_, el) => {
    const $card = $(el)
    const $poster = $card.find('a.short-poster').first()
    const href = $poster.attr('href') || ''
    const title = $card.find('div.short-title').first().text().trim()
    const altTitle = $poster.attr('alt') || ''
    const version = $card.find('span.film-version a').first().text().trim() || 'VF'

    if (!href || !title) return

    const newsidMatch = href.match(PATTERNS.NEWSID)
    const season = extractSeason(title) || extractSeason(altTitle)

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      newsid: newsidMatch ? newsidMatch[1] : null,
      title,
      altTitle,
      version,
      season,
    })
  })

  return results
}

function parseSerieConfig(html) {
  if (!html) return null
  const $ = cheerio.load(html)
  const $config = $('#serie-config')
  if (!$config.length) return null

  return {
    title: $config.attr('data-title') || '',
    newsId: $config.attr('data-news-id') || '',
    pageUrl: $config.attr('data-page-url') || '',
  }
}

function parseEpisodeApiData(json) {
  if (!json) return null

  const versions = {}
  const languages = ['vf', 'vostfr']

  for (const lang of languages) {
    if (json[lang] && typeof json[lang] === 'object') {
      const episodes = []
      for (const [epNum, servers] of Object.entries(json[lang])) {
        const num = parseInt(epNum)
        if (isNaN(num)) continue

        const serverLinks = []
        for (const [serverName, serverUrl] of Object.entries(servers)) {
          if (serverUrl && typeof serverUrl === 'string' && serverUrl.startsWith('http')) {
            serverLinks.push({ name: serverName, url: serverUrl })
          }
        }

        if (serverLinks.length > 0) {
          episodes.push({ num, servers: serverLinks })
        }
      }

      episodes.sort((a, b) => a.num - b.num)
      const langLabel = LANGUAGE_MAP[lang] || lang.toUpperCase()
      versions[langLabel] = episodes
    }
  }

  const info = json.info || {}
  const altTitles = json.alt_titles || {}
  const altTitleUs = altTitles.us || ''
  const altTitleJp = altTitles.jp || ''

  return { versions, info, altTitleUs, altTitleJp }
}

async function trySearchGet(title, targetSeason) {
  // GET search always returns the main page listing (latest 36 items, same for any query)
  // Cache it so we only fetch once
  const html = await cached('main_page_listing', () =>
    fetchText(ENDPOINTS.SEARCH, { timeout: TIMEOUTS.SEARCH })
  )
  const results = parseSearchResults(html)
  if (results.length === 0) return null
  return bestMatch(results, title, targetSeason)
}

async function trySearchFallback(allResults, tmdbTitles) {
  // Deep fallback: when bestMatch returns null, check low-scoring search results
  // by fetching their pages in parallel (with short timeout) and verifying
  // via #serie-config + episode API.
  const nt = normalize(tmdbTitles[0] || '')
  if (!nt || allResults.length === 0) return null

  const unique = []
  const seen = new Set()
  for (const r of allResults) {
    if (r.url && !seen.has(r.url)) {
      seen.add(r.url)
      unique.push(r)
    }
  }

  const results = await Promise.allSettled(
    unique.slice(0, 5).map(async (result) => {
      const html = await fetchText(result.url, { timeout: 8000 })
      const config = parseSerieConfig(html)
      if (!config || !config.title || !config.newsId) return null

      const nr = normalize(config.title)
      if (nr === nt || nr.includes(nt) || nt.includes(nr)) {
        const apiData = await fetchEpisodeApi(config.newsId)
        if (apiData && apiData.versions) {
          return {
            url: config.pageUrl || result.url,
            newsid: config.newsId,
            title: config.title,
          }
        }
      }
      return null
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      console.log(`[FrenchManga] Fallback matched: "${r.value.title}" (newsid: ${r.value.newsid})`)
      return r.value
    }
  }
  return null
}

async function trySearch(titles, targetSeason) {
  const allPostResults = []
  for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      // Try POST search first (actual DLE filtered search — more accurate)
      const postResults = await trySearchPostRaw(title, targetSeason)
      if (postResults) {
        allPostResults.push(...postResults)
        const postMatch = bestMatch(postResults, title, targetSeason)
        if (postMatch) return postMatch
      }

      // Fallback to GET (main page listing — works for recently updated)
      console.log(`[FrenchManga] POST search missed, trying GET for "${title}"...`)
      const getMatch = await trySearchGet(title, targetSeason)
      if (getMatch) return getMatch
    } catch (e) {
      console.warn(`[FrenchManga] Search failed for "${title}": ${e.message}`)
    }
  }    // Deep fallback: check low-scoring POST results via page content (parallel, short timeout)
  if (allPostResults.length > 0) {
    console.log(`[FrenchManga] Trying deep fallback on ${allPostResults.length} POST results...`)
    const fallbackMatch = await trySearchFallback(allPostResults, titles)
    if (fallbackMatch) return fallbackMatch
  }

  return null
}

async function trySearchPostRaw(title, targetSeason) {
  const html = await postSearch(title, { timeout: TIMEOUTS.SEARCH })
  if (!html) return null
  const results = parseSearchResults(html)
  return results.length > 0 ? results : null
}

async function fetchEpisodeApi(newsid) {
  const url = `${ENDPOINTS.EPISODES_API}${newsid}`
  return cached(`episodes_${newsid}`, async () => {
    const json = await fetchJson(url, { timeout: TIMEOUTS.API })
    return parseEpisodeApiData(json)
  })
}

function toStream(name, url, quality, language) {
  let origin = SITE.BASE_URL
  try { origin = new URL(url).origin } catch {}

  return {
    name,
    title: `[${language}] French-Manga${quality !== 'HD' ? ` [${quality}]` : ''}`,
    url,
    quality: quality || 'HD',
    language: language || 'VF',
    headers: {
      Referer: `${SITE.BASE_URL}/`,
      Origin: SITE.BASE_URL,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  }
}

async function resolveWithTimeout(stream) {
  try {
    const resolved = await resolveStream(stream)
    if (resolved && resolved.url && resolved.isDirect) return resolved
    if (resolved && resolved.url && !resolved.isDirect) return { ...resolved, isDirect: true }
    return null
  } catch {
    return null
  }
}

async function detectSubType(tmdbId, mediaType, titles) {
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

  const subType = await detectSubType(tmdbId, mediaType, titles)
  if (subType) console.log(`[FrenchManga] Detected subtype: ${subType}`)

  if (mediaType === 'movie') {
    return extractMovie(tmdbId, titles, subType)
  }

  return extractSeries(tmdbId, mediaType, titles, season, episode, subType)
}

async function extractMovie(tmdbId, titles, subType) {
  const match = await trySearch(titles, null)
  if (!match) {
    console.warn(`[FrenchManga] Movie not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[FrenchManga] Movie match: ${match.title} -> ${match.url}`)
  try {
    // Use newsid from search result if available, otherwise fetch page
    let newsid = match.newsid
    if (!newsid) {
      const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
      const config = parseSerieConfig(pageHtml)
      if (!config || !config.newsId) {
        console.warn(`[FrenchManga] No config found on page ${match.url}`)
        return []
      }
      newsid = config.newsId
    }

    const apiData = await fetchEpisodeApi(newsid)
    if (!apiData || !apiData.versions) {
      console.warn(`[FrenchManga] No episode data for newsid ${newsid}`)
      return []
    }

    return extractStreamsFromApi(apiData, 'FrenchManga', subType)
  } catch (e) {
    console.warn(`[FrenchManga] Movie extraction failed: ${e.message}`)
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
    console.warn(`[FrenchManga] ArmSync failed: ${e.message}`)
  }

  const match = await trySearch(titles, targetSeasonNum)
  if (!match) {
    console.warn(`[FrenchManga] Series not found for TMDB ${tmdbId}`)
    return []
  }
  console.log(`[FrenchManga] Series match: ${match.title} -> ${match.url} (newsid: ${match.newsid})`)

  try {
    // Use newsid from search result if available, otherwise fetch page
    let newsid = match.newsid
    if (!newsid) {
      const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
      const config = parseSerieConfig(pageHtml)
      if (!config || !config.newsId) {
        console.warn(`[FrenchManga] No config found on page ${match.url}`)
        return []
      }
      newsid = config.newsId
    }

    const apiData = await fetchEpisodeApi(newsid)
    if (!apiData || !apiData.versions) {
      console.warn(`[FrenchManga] No episode data for newsid ${newsid}`)
      return []
    }

    // For series, find the right episode across all languages
    const streams = []
    const targetEp = targetEpisodeNums[0]

    for (const [lang, episodes] of Object.entries(apiData.versions)) {
      let ep = episodes.find(e => e.num === targetEp)
      if (!ep) {
        ep = episodes[targetEp - 1]
        if (ep) console.log(`[FrenchManga] Fallback: using episode ${ep.num} for target ${targetEp} (${lang})`)
      }
      if (!ep) continue

      // Log episode title if available from API info
      const epInfo = apiData.info && apiData.info[String(ep.num)]
      if (epInfo && epInfo.title) {
        console.log(`[FrenchManga] Episode ${ep.num}: "${epInfo.title}" (${lang})`)
      }
      console.log(`[FrenchManga] Found episode ${ep.num} (${lang}) with ${ep.servers.length} server(s)`)

      for (const server of ep.servers) {
        const stream = toStream('FrenchManga', server.url, 'HD', lang)
        if (subType) stream.subType = subType

        const resolved = await resolveWithTimeout(stream)
        if (resolved && resolved.url) {
          streams.push({ ...resolved, provider: 'french-manga' })
        }
      }
    }

    console.log(`[FrenchManga] Series: ${streams.length} streams for episode ${targetEp}`)
    return streams
  } catch (e) {
    console.warn(`[FrenchManga] Series extraction failed: ${e.message}`)
  }
  return []
}

async function extractStreamsFromApi(apiData, name, subType) {
  const streams = []

  for (const [lang, episodes] of Object.entries(apiData.versions)) {
    // For movies, take the first episode
    const firstEp = episodes[0]
    if (!firstEp) continue

    console.log(`[FrenchManga] Found movie (${lang}) with ${firstEp.servers.length} server(s)`)

    for (const server of firstEp.servers) {
      const stream = toStream(name, server.url, 'HD', lang)
      if (subType) stream.subType = subType

      const resolved = await resolveWithTimeout(stream)
      if (resolved && resolved.url) {
        streams.push({ ...resolved, provider: 'french-manga' })
      }
    }
  }

  console.log(`[FrenchManga] Movie: ${streams.length} streams`)
  return streams
}
