import { fetchText, fetchJson, setCurrentSignal } from './http.js'
import cheerio from 'cheerio-without-node-native'
import { resolveStream, safeFetch, isAborted } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { toStream, normalize, resolveTargetEpisodes, stripSeasonSuffix, countExtraWords } from '../utils/dle-extractor.js'
import {
  SITE, ENDPOINTS, SELECTORS, PATTERNS, TIMEOUTS, SCORES,
  LANGUAGE_MAP, ANIME_GENRE_ID, ANIME_KEYWORDS,
  MAX_SEARCH_TITLES,
} from './config.js'
import { createCache } from '../utils/cache.js'

const withCache = createCache('fl', 'Flemmix')

function isJapanese(text) {
  return /[\u3000-\u9FFF\uF900-\uFAFF]/.test(text || '')
}

function scoreMatch(resultTitle, searchTitle) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr) return 0

  // Retire les infos de saison pour le matching (ex: "Saison 2")
  const cleanNr = nr.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').trim()
  const cleanNt = nt.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').trim()

  if (cleanNr === cleanNt || nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) {
    // Pénalité anti-fan-edit : chaque mot significatif en trop dans le résultat
    // (ex: requête "Naruto" → résultat "Naruto Shippuden Kai" = 2 mots extra)
    // retire -25. Empêche les recuts/dérivés de battre le titre exact.
    const extra = countExtraWords(nr, nt)
    if (extra > 0) {
      return Math.max(SCORES.STRONG_MATCH - Math.min(extra * 25, SCORES.STRONG_MATCH - SCORES.MIN_MATCH - 5), 0)
    }
    return SCORES.STRONG_MATCH
  }

  const words = cleanNt.split(/\s+/).filter(w => w.length > 2)
  const rWords = new Set(cleanNr.split(/\s+/))
  const matched = words.filter(w => rWords.has(w)).length
  if (words.length > 0) {
    // Anti-false-positive: si la recherche a ≥2 mots significatifs mais que
    // le résultat en partage < 2, c'est probablement une série différente
    // Ex: "Law & Order" → mots=["law","order"] cherche "Police in a Pod" → matched=0 → reject
    // Ex: "One Piece" → mots=["one","piece"] cherche "One Piece Saison 2" → matched=2 → OK
    if (words.length >= 2 && matched < 2) return 0
    return Math.round((matched / words.length) * 50)
  }
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

function parseServerTabs($, tabSelector, qualitySelector, langSelector) {
  const servers = []
  $(tabSelector).each((_, el) => {
    const $tab = $(el)
    const url = $tab.attr(SELECTORS.TAB_DATA_URL)
    if (!url) return

    // TV-safe : .hasClass() n'existe pas dans le runtime cheerio de NuvioTV
    const isActive = ($tab.attr('class') || '').split(/\s+/).includes(SELECTORS.TAB_ACTIVE)
    const quality = $tab.find(qualitySelector).first().text().trim() || 'HD'
    const langRaw = $tab.find(langSelector).first().text().trim().toLowerCase()
    const lang = LANGUAGE_MAP[langRaw] || 'VF'

    servers.push({ url, quality, language: lang, isActive })
  })
  return servers
}

function parseSearchResults(json) {
  if (!Array.isArray(json)) return []
  return json.map(item => ({
    url: `${SITE.BASE_URL}${item.url}`,
    title: item.title,
    isSeries: item.type === 'tvshow',
    year: item.year,
  }))
}

function parseSeasons(html) {
  const $ = cheerio.load(html)
  const seasons = []
  $(SELECTORS.SERIES_SEASON_CARD).each((_, el) => {
    const $card = $(el)
    const href = $card.attr('href') || ''
    const m = href.match(PATTERNS.SEASON_LINK)
    if (m) {
      seasons.push({
        num: parseInt(m[1]),
        link: `${SITE.BASE_URL}${href}`,
        title: $card.find(SELECTORS.SERIES_SEASON_TITLE).first().text().trim() || $card.text().trim(),
      })
    }
  })
  return seasons
}

function parseSeasonEpisodes(html) {
  const $ = cheerio.load(html)
  const episodes = []
  $(SELECTORS.SERIES_EPISODE_CARD).each((_, el) => {
    const $card = $(el)
    const href = $card.attr('href') || ''
    const m = href.match(PATTERNS.EPISODE_LINK)
    if (m) {
      episodes.push({
        season: parseInt(m[1]),
        episode: parseInt(m[2]),
        link: `${SITE.BASE_URL}${href}`,
        title: $card.find(SELECTORS.SERIES_EPISODE_TITLE).first().text().trim(),
      })
    }
  })
  return episodes
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
    const details = await withCache(`tmdb_${tmdbId}_${mediaType}`, () => fetchTmdbGenre(tmdbId, mediaType), { successTtl: 300000, failureTtl: 60000 })
    if (!details) return null
    const genres = (details.genres || []).map(g => g.id)
    const isAnim = genres.includes(ANIME_GENRE_ID)
    const orig = mediaType === 'movie' ? details.original_title : details.original_name
    const jap = /[\u3000-\u9FFF\uF900-\uFAFF]/.test(orig || '')
    const keywordMatch = titles.some(t => ANIME_KEYWORDS.test(t))
    if (isAnim && (jap || keywordMatch)) return 'anime'
    return null
  } catch {
    return null
  }
}

async function trySearch(titles, filterSeries) {
  for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      const url = `${ENDPOINTS.SEARCH}${encodeURIComponent(title)}`
      const json = await fetchJson(url, { timeout: TIMEOUTS.SEARCH })
      const results = parseSearchResults(json)
      if (results.length === 0) continue

      const filtered = filterSeries
        ? results.filter(r => r.isSeries)
        : results.filter(r => !r.isSeries)

      const candidates = filtered.length > 0 ? filtered : results
      const match = bestMatch(candidates, title)
      if (match) return match
    } catch (e) {
      console.warn(`[Flemmix] Search failed for "${title}": ${e.message}`)
    }
  }
  return null
}

async function resolveWithTimeout(stream) {
  try {
    const resolved = await resolveStream(stream)
    if (resolved && resolved.url && resolved.isDirect) return resolved
    return null
  } catch {
    return null
  }
}

async function createStreamsFromServers(servers, name, subType) {
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const stream = toStream(server.url, server.language || 'VF', name, SITE.BASE_URL, { quality: server.quality || 'HD', subType })
      const resolved = await resolveWithTimeout(stream)
      if (resolved && resolved.url) {
        return { ...resolved, provider: 'flemmix' }
      }
      return { ...stream, provider: 'flemmix' }
    })
  )
  return results.filter(r => r.status === 'fulfilled').map(r => r.value).filter(s => s && s.isDirect)
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  const rawTitles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!rawTitles || rawTitles.length === 0) return []
  // Strip season suffixes (ex: "Naruto Season 1" → "Naruto") pour éviter les
  // variantes diluées dans la recherche — préserve les métadonnées attachées
  const titles = rawTitles.map(t => stripSeasonSuffix(t))
  titles._metadata = rawTitles._metadata
  titles.effectiveSeason = rawTitles.effectiveSeason

  const subType = await detectSubType(tmdbId, mediaType, titles)
  if (subType) console.log(`[Flemmix] Detected subtype: ${subType}`)

  if (isAborted(signal)) return []

  if (mediaType === 'movie') {
    return extractMovie(tmdbId, titles, subType)
  }

  return extractSeries(tmdbId, mediaType, titles, season, episode, subType)
}

async function browseCategory(mediaType, titles) {
  const baseType = mediaType === 'movie' ? 'films' : 'series'
  const linkPattern = mediaType === 'movie' ? '/film/' : '/serie/'
  const url = `${SITE.BASE_URL}/${baseType}`

  try {
    const html = await fetchText(url, { timeout: TIMEOUTS.PAGE })
    const $ = cheerio.load(html)
    const items = []

    $(`a[href*="${linkPattern}"]`).each((i, el) => {
      const href = $(el).attr('href') || ''
      const title = $(el).text().trim() || $(el).find('img').first().attr('alt') || ''
      if (href && title) {
        items.push({
          url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
          title,
        })
      }
    })

    if (items.length === 0) return null
    console.log(`[Flemmix] Browsing ${baseType}: ${items.length} items`)

    for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
      const match = bestMatch(items, title)
      if (match) return match
    }
    return null
  } catch (e) {
    console.warn(`[Flemmix] Category browse failed: ${e.message}`)
    return null
  }
}

async function extractMovie(tmdbId, titles, subType) {
  const match = await trySearch(titles, false) || await browseCategory('movie', titles)
  if (!match) {
    console.warn(`[Flemmix] Movie not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Flemmix] Movie match: ${match.title} -> ${match.url}`)
  try {
    const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    const $ = cheerio.load(pageHtml)
    const servers = parseServerTabs(
      $,
      SELECTORS.MOVIE_PLAYER_TABS,
      SELECTORS.MOVIE_QUALITY_PILL,
      SELECTORS.MOVIE_LANG_PILL
    )

    if (servers.length === 0) {
      console.warn(`[Flemmix] No servers on ${match.url}`)
      return []
    }

    return await createStreamsFromServers(servers, 'Flemmix', subType)
  } catch (e) {
    console.warn(`[Flemmix] Movie extraction failed: ${e.message}`)
  }
  return []
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  const targetEpisodeNums = await resolveTargetEpisodes(tmdbId, mediaType, season, episode)

  const match = await trySearch(titles, true) || await browseCategory('tv', titles)
  if (!match) {
    console.warn(`[Flemmix] Series not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Flemmix] Series match: ${match.title} -> ${match.url}`)
  try {
    const seriesHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    const seasons = parseSeasons(seriesHtml)
    if (seasons.length === 0) {
      console.warn(`[Flemmix] No seasons on series page`)
      return []
    }

    const targetSeason = seasons.find(s => s.num === targetSeasonNum) || seasons[0]
    console.log(`[Flemmix] Selected season: ${targetSeason.num} -> ${targetSeason.link}`)

    const seasonHtml = await fetchText(targetSeason.link, { timeout: TIMEOUTS.PAGE })
    const episodes = parseSeasonEpisodes(seasonHtml)
    if (episodes.length === 0) {
      console.warn(`[Flemmix] No episodes on season ${targetSeason.num}`)
      return []
    }

    let ep = null
    for (const epNum of targetEpisodeNums) {
      ep = episodes.find(e => e.episode === epNum)
      if (ep) break
    }
    if (!ep) ep = episodes[targetEpisodeNums[0] - 1]

    if (!ep) {
      console.warn(`[Flemmix] Episode ${targetEpisodeNums[0]} not found in season ${targetSeasonNum}`)
      return []
    }

    console.log(`[Flemmix] Episode: S${ep.season}E${ep.episode} -> ${ep.link}`)
    const epHtml = await fetchText(ep.link, { timeout: TIMEOUTS.PAGE })
    const $ = cheerio.load(epHtml)
    const servers = parseServerTabs(
      $,
      SELECTORS.EPISODE_PLAYER_TABS,
      SELECTORS.EPISODE_QUALITY_PILL,
      SELECTORS.EPISODE_LANG_PILL
    )

    if (servers.length === 0) {
      console.warn(`[Flemmix] No servers on episode page`)
      return []
    }

    return await createStreamsFromServers(servers, 'Flemmix', subType)
  } catch (e) {
    console.warn(`[Flemmix] Series extraction failed: ${e.message}`)
  }
  return []
}

