import { fetchText, fetchJson, setCurrentSignal } from './http.js'
import cheerio from 'cheerio-without-node-native'
import { resolveStream, safeFetch, withTimeout, isAborted } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { toStream, normalize, resolveTargetEpisodes, stripSeasonSuffix, countExtraWords, hasForeignLeadingTokens } from '../utils/dle-extractor.js'
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
    // Garde anti-homonymes (bug "Gate" → Steins;Gate) : un token significatif
    // AVANT la requête ("steins", "the gates"…) rejette le match.
    if (hasForeignLeadingTokens(nr, nt)) return 0
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

/**
 * Parse les onglets serveurs (film OU épisode). Priorité texte du bouton,
 * fallback pills. Langue dérivée de l'URL vidsrc (ds_lang=fr) quand les
 * deux sont absents.
 */
function parseServerTabs($, tabSelector) {
  const servers = []
  $(tabSelector).each((_, el) => {
    const $tab = $(el)
    const url = $tab.attr(SELECTORS.TAB_DATA_URL)
    if (!url) return
    const absUrl = url.startsWith('http') ? url.replace(/&amp;/g, '&') : `${SITE.BASE_URL}${url}`.replace(/&amp;/g, '&')

    // TV-safe : .hasClass() n'existe pas dans le runtime cheerio de NuvioTV
    const isActive = ($tab.attr('class') || '').split(/\s+/).includes(SELECTORS.TAB_ACTIVE)
    const tabText = $tab.text().toLowerCase()
    const langRaw = ($tab.find(SELECTORS.MOVIE_LANG_PILL).first().text() || '').trim().toLowerCase()

    let language
    if (LANGUAGE_MAP[langRaw]) {
      language = LANGUAGE_MAP[langRaw]
    } else if (/vostfr/.test(tabText) && !/vo\b/.test(tabText.replace('vostfr', ''))) {
      language = 'VOSTFR'
    } else if (/(?:^|\s)vf(?:\s|$)|version fran/.test(tabText)) {
      language = 'VF'
    } else if (/vostfr/.test(tabText)) {
      language = 'VOSTFR'
    } else if (absUrl.includes('ds_lang=fr')) {
      language = 'VF'
    } else if (/french/.test(absUrl.toLowerCase())) {
      language = 'VF'
    } else {
      language = 'VOSTFR'
    }

    const qualityText = ($tab.find(SELECTORS.MOVIE_QUALITY_PILL).first().text() || '').trim()
    servers.push({
      url: absUrl,
      quality: qualityText ? qualityText.toUpperCase() : 'HD',
      language,
      isActive,
    })
  })
  return servers
}

function parseSearchResults(json) {
  if (!Array.isArray(json)) return []
  return json.map(item => ({
    url: `${SITE.BASE_URL}${item.url}`.replace(/&amp;/g, '&'),
    title: item.title,
    isSeries: item.type === 'tvshow',
    year: item.year,
  }))
}

/**
 * Recherche par langue sur l'endpoint /search : le site renvoie des résultats
 * distincts selon q=FR ou q=EN (ex: "Spartacus" vide, "Spartacus VOSTFR" →
 * la série). On sonde chaque titre dans les deux langues.
 */
async function trySearchBilingual(titles, filterSeries) {
  for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
    const probes = [
      `${ENDPOINTS.SEARCH}${encodeURIComponent(title)}`,
      `${ENDPOINTS.SEARCH}${encodeURIComponent(`${title} VOSTFR`)}`,
    ]
    const settled = await Promise.allSettled(probes.map(p => fetchJson(p, { timeout: TIMEOUTS.SEARCH })))
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue
      const results = parseSearchResults(r.value)
      if (results.length === 0) continue

      const filtered = filterSeries
        ? results.filter(x => x.isSeries)
        : results.filter(x => !x.isSeries)

      const candidates = filtered.length > 0 ? filtered : results
      const match = bestMatch(candidates, title)
      if (match) return match
    }
  }
  return null
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
        link: `${SITE.BASE_URL}${href}`.replace(/&amp;/g, '&'),
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
        // Le slug de l'épisode est sans suffixe id : /{slug}/{s}x{e}
        season: parseInt(m[2]),
        episode: parseInt(m[3]),
        link: `${SITE.BASE_URL}${href}`.replace(/&amp;/g, '&'),
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
    const jap = isJapanese(orig || '')
    const keywordMatch = titles.some(t => ANIME_KEYWORDS.test(t))
    if (isAnim && (jap || keywordMatch)) return 'anime'
    return null
  } catch {
    return null
  }
}

/**
 * Fallback sitemap : les sitemaps publics listent TOUTES les fiches du site
 * (652 films / 293 séries vérifiés) même quand la recherche JSON échoue.
 * Requête une seule fois par session (cache 30 min).
 */
async function trySitemap(titles, filterSeries) {
  try {
    const sitemapUrl = filterSeries ? ENDPOINTS.SITEMAP_TVSHOWS : ENDPOINTS.SITEMAP_MOVIES
    const xml = await withCache(`sm_${filterSeries ? 'tv' : 'mv'}`, () => fetchText(sitemapUrl, { timeout: TIMEOUTS.SEARCH }), { successTtl: 1800000, failureTtl: 60000 })
    if (!xml) return null
    const items = []
    const re = /<loc>\s*([^<]+?)\s*<\/loc>/g
    let m
    while ((m = re.exec(xml)) !== null) {
      const loc = m[1]
      const parts = loc.replace(/\/$/, '').split('/')
      const slug = parts[parts.length - 1] || ''
      if (!slug) continue
      items.push({
        url: loc,
        title: slug.replace(/-\d{2,}$/, '').replace(/-vf$|-vostfr$/i, '').replace(/-/g, ' '),
        isSeries: filterSeries,
      })
    }
    if (items.length === 0) return null
    for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
      const match = bestMatch(items, title)
      if (match) return match
    }
  } catch (e) {
    console.warn(`[Flemmix] Sitemap fallback failed: ${e.message}`)
  }
  return null
}

async function resolveWithTimeout(stream, timeoutMs = 14000) {
  try {
    const resolved = await withTimeout(resolveStream(stream), timeoutMs)
    if (resolved && resolved.url && resolved.isDirect) return resolved
    return null
  } catch {
    return null
  }
}

/**
 * Résout les serveurs. Sources réelles du site :
 *  - embeds signés flemmix (peel → minochinos → player packé → master.m3u8)
 *  - vidsrc-embed.ru (VO/VOSTFR) : chaîne /vs_src.php → cloud gate fermée
 *    (403 "Session expired", token host-bound non reproductible hors
 *    navigateur — vérifié en live) → embed NON retourné (non jouable par
 *    ExoPlayer, convention repo : ne jamais retourner d'embed irrésolu).
 */
async function createStreamsFromServers(servers, name, subType) {
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const stream = toStream(server.url, server.language || 'VF', name, SITE.BASE_URL, { quality: server.quality || 'HD', subType })
      // Referer flemmix sur l'embed signé (hotlink check)
      if (/flemmix\.me\/embed\//.test(server.url)) {
        stream.headers = { ...stream.headers, Referer: `${SITE.BASE_URL}/`, Origin: SITE.BASE_URL }
      }
      const resolved = await resolveWithTimeout(stream)
      if (resolved && resolved.url && resolved.isDirect) {
        return { ...resolved, provider: 'flemmix' }
      }
      return null
    })
  )
  return results.filter(r => r.status === 'fulfilled').map(r => r.value).filter(Boolean)
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  // ⚠️ Nuvio passe 'series' (jamais 'tv') — resolveTargetEpisodes exige 'tv'.
  const isTv = mediaType === 'series' || mediaType === 'tv'

  const rawTitles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!rawTitles || rawTitles.length === 0) return []
  // Strip season suffixes (ex: "Naruto Season 1" → "Naruto")
  const titles = rawTitles.map(t => stripSeasonSuffix(t))
  titles._metadata = rawTitles._metadata
  titles.effectiveSeason = rawTitles.effectiveSeason

  const subType = await detectSubType(tmdbId, mediaType, titles)
  if (subType) console.log(`[Flemmix] Detected subtype: ${subType}`)

  if (isAborted(signal)) return []

  if (!isTv) {
    return extractMovie(tmdbId, titles, subType)
  }

  return extractSeries(tmdbId, mediaType, titles, season, episode, subType)
}

async function extractMovie(tmdbId, titles, subType) {
  const match = await trySearchBilingual(titles, false) || await trySitemap(titles, false)
  if (!match) {
    console.warn(`[Flemmix] Movie not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Flemmix] Movie match: ${match.title} -> ${match.url}`)
  try {
    const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    const $ = cheerio.load(pageHtml)
    const servers = parseServerTabs($, SELECTORS.MOVIE_PLAYER_TABS)

    if (servers.length === 0) {
      console.warn(`[Flemmix] No servers on ${match.url}`)
      return []
    }
    console.log(`[Flemmix] Movie: ${servers.length} serveur(s) [${servers.map(s => s.language).join(', ')}]`)

    return await createStreamsFromServers(servers, 'Flemmix', subType)
  } catch (e) {
    console.warn(`[Flemmix] Movie extraction failed: ${e.message}`)
  }
  return []
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  // resolveTargetEpisodes exige mediaType === 'tv' → normaliser
  const targetEpisodeNums = await resolveTargetEpisodes(tmdbId, 'tv', season, episode)

  const match = await trySearchBilingual(titles, true) || await trySitemap(titles, true)
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

    // ⚠️ Anti-mismatch : si la saison demandée n'existe pas sur le site, ne
    // JAMAIS retomber sur une autre saison (l'utilisateur recevrait des
    // épisodes qui ne correspondent pas au titre). On abandonne proprement.
    const targetSeason = seasons.find(s => s.num === targetSeasonNum)
    if (!targetSeason) {
      console.warn(`[Flemmix] Season ${targetSeasonNum} not found on site (available: ${seasons.map(s => s.num).join(', ')})`)
      return []
    }
    console.log(`[Flemmix] Selected season: ${targetSeason.num} -> ${targetSeason.link}`)

    const seasonHtml = await fetchText(targetSeason.link, { timeout: TIMEOUTS.PAGE })
    const episodes = parseSeasonEpisodes(seasonHtml)
    if (episodes.length === 0) {
      console.warn(`[Flemmix] No episodes on season ${targetSeason.num}`)
      return []
    }

    let ep = null
    for (const epNum of targetEpisodeNums) {
      ep = episodes.find(e => e.season === targetSeasonNum && e.episode === epNum)
      if (ep) break
    }
    // ⚠️ PAS de fallback par index (l'ancien `episodes[epNum-1]` donnait
    // l'épisode suivant/précédent quand un numéro manquait = mismatch).
    if (!ep) {
      console.warn(`[Flemmix] Episode ${targetEpisodeNums[0]} not found in season ${targetSeasonNum} (${episodes.length} episodes available)`)
      return []
    }

    console.log(`[Flemmix] Episode: S${ep.season}E${ep.episode} -> ${ep.link}`)
    const epHtml = await fetchText(ep.link, { timeout: TIMEOUTS.PAGE })
    const $ = cheerio.load(epHtml)
    const servers = parseServerTabs($, SELECTORS.EPISODE_PLAYER_TABS)

    if (servers.length === 0) {
      console.warn(`[Flemmix] No servers on episode page`)
      return []
    }
    console.log(`[Flemmix] Episode: ${servers.length} serveur(s) [${servers.map(s => s.language).join(', ')}]`)

    return await createStreamsFromServers(servers, 'Flemmix', subType)
  } catch (e) {
    console.warn(`[Flemmix] Series extraction failed: ${e.message}`)
  }
  return []
}
