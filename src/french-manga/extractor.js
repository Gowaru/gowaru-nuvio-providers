import cheerio from 'cheerio-without-node-native'
import { fetchText, fetchJson, ajaxSearch, setCurrentSignal } from './http.js'
import { resolveStream, safeFetch, isAborted } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { stripSeasonSuffix, resolveTargetEpisodes, toStream, countExtraWords } from '../utils/dle-extractor.js'
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
  if (nr.includes(nt) || nt.includes(nr)) {
    // Pénalité anti-fan-edit : chaque mot significatif en trop dans le résultat
    // (ex: requête "Naruto" → résultat "Naruto Shippuden Kai" = 2 mots extra)
    // retire -25. Empêche les recuts/dérivés de battre le titre exact.
    const extra = countExtraWords(nr, nt)
    // Anti-faux-positif titre court : si la requête est ≤ 3 mots et le résultat
    // contient ≥ 5 mots de plus, c'est probablement un titre différent.
    // Ex: "Invincible" (1 mot) → "Became Invincible" (9+ mots extra) → reject
    const qWordCount = cleanNt.split(/\s+/).length
    if (qWordCount <= 3 && extra >= 3) return 0
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
      if (rs === ts) {
        // Bonus saison uniquement pour un match "propre" (≥ STRONG_MATCH) :
        // un résultat dérivé déjà pénalisé par scoreMatch (fan-edit, mots en
        // trop) ne doit pas être rehaussé au-dessus du titre exact.
        if (score >= SCORES.STRONG_MATCH) score += 40
      }
      else if (rs && Math.abs(rs - ts) === 1) {
        // Adjacent seasons: only slight bonus if within 1, but heavy penalty if wrong
        // e.g. searching S1 but matching S2 → should NOT match if S1 exists
        score -= 60
      }
      else if (rs && rs !== ts) {
        // Wrong season: disqualifier-level penalty
        score -= 80
      }
    }
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore >= SCORES.MIN_MATCH ? best : null
}

function parseSearchResults(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  const results = []

  // Home page: div.short elements
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

  // AJAX search results: .search-item elements (class is 'search-title' NOT 'search-item-title')
  $('div.search-item').each((_, el) => {
    const $item = $(el)
    const onclick = $item.attr('onclick') || ''
    const hrefMatch = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/)
    const href = hrefMatch ? hrefMatch[1] : ''
    const title = $item.find('.search-title').first().text().trim() || $item.find('.search-item-title').first().text().trim()
    const poster = $item.find('.search-poster img').attr('alt') || $item.find('.search-item-poster img').attr('alt') || ''
    
    if (!href || !title) return

    const newsidMatch = href.match(/(\d+)-/)
    const season = extractSeason(title) || extractSeason(poster)

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      newsid: newsidMatch ? newsidMatch[1] : null,
      title,
      altTitle: poster,
      version: 'VF',
      season,
    })
  })

  // Category pages: also use div.short (same format as home page)
  // Already handled above

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
      // Garde anti-fan-edit : un titre dérivé avec ≥2 mots significatifs en plus
      // (ex: "Naruto Shippuden Kai" pour la requête "Naruto") n'est pas accepté,
      // même s'il contient la requête en sous-chaîne.
      const extra = countExtraWords(nr, nt)
      if ((nr === nt || nr.includes(nt) || nt.includes(nr)) && extra < 2) {
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
  // Strip season suffixes from TMDB titles for better matching
  const cleanTitles = titles.map(t => stripSeasonSuffix(t));
  const allPostResults = []
  const dedupResults = new Map()
  
  for (const title of cleanTitles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      // Try POST search first (AJAX — real search)
      const postResults = await trySearchPostRaw(title, targetSeason)
      if (postResults) {
        for (const r of postResults) {
          const key = r.newsid || r.url
          if (key && !dedupResults.has(key)) {
            dedupResults.set(key, r)
            allPostResults.push(r)
          }
        }
        const postMatch = bestMatch(postResults, title, targetSeason)
        if (postMatch) return postMatch
        // Don't return early — continue trying other titles
        // (e.g. AJAX search for "Attack on Titan" returns French titles with 0 score,
        //  but "L'Attaque des Titans" will match)
      }

      // Fallback to GET (main page listing — works for recently updated)
      console.log(`[FrenchManga] Trying GET fallback for "${title}"...`)
      const getMatch = await trySearchGet(title, targetSeason)
      if (getMatch) return getMatch
    } catch (e) {
      console.warn(`[FrenchManga] Search failed for "${title}": ${e.message}`)
    }
  }

  // After trying all titles, attempt bestMatch on accumulated POST results
  if (allPostResults.length > 0) {
    const firstTitle = cleanTitles[0]
    const bestPostMatch = bestMatch(allPostResults, firstTitle, targetSeason)
    if (bestPostMatch) return bestPostMatch
  }
  
  // Deep fallback: check low-scoring POST results via page content (parallel, short timeout)
  if (allPostResults.length > 0) {
    console.log(`[FrenchManga] Trying deep fallback on ${allPostResults.length} POST results...`)
    const fallbackMatch = await trySearchFallback(allPostResults, titles)
    if (fallbackMatch) return fallbackMatch
  }

  return null
}

async function trySearchPostRaw(title, targetSeason) {
  // Try AJAX search first (real search endpoint) — works for all titles
  try {
    const html = await ajaxSearch(title, { timeout: TIMEOUTS.SEARCH })
      if (html && html.length > 50) {
      const results = parseSearchResults(html)
      if (results.length > 0) {
        console.log(`[FrenchManga] AJAX search found ${results.length} results for "${title}"`)
        return results
      }
    }
  } catch (e) {
    console.warn(`[FrenchManga] AJAX search failed for "${title}": ${e.message}`)
  }
  
  // Note: trySearchGet (called from trySearch) already handles the
  // main page listing fallback. No need to duplicate here.
  return null
}

async function fetchEpisodeApi(newsid) {
  const url = `${ENDPOINTS.EPISODES_API}${newsid}`
  return cached(`episodes_${newsid}`, async () => {
    const json = await fetchJson(url, { timeout: TIMEOUTS.API })
    return parseEpisodeApiData(json)
  })
}async function resolveWithTimeout(stream) {
    try {
        const start = Date.now();
        const resolved = await resolveStream(stream)
        const elapsed = Date.now() - start;

        if (resolved && resolved.url && resolved.isDirect) {
            // Skip known-blocked CDN domains (tnmr.org returns 403 on HLS)
            const urlLower = (resolved.url || '').toLowerCase();
            if (urlLower.includes('tnmr.org') && !urlLower.includes('cdn-tnmr.org')) {
                console.log(`[FrenchManga] ✗ Blocked CDN tnmr.org (${elapsed}ms): ${resolved.url.slice(0, 60)}... - skipping`);
                return null;
            }

            if (resolved.url !== stream.url) {
                console.log(`[FrenchManga] Resolved OK (${elapsed}ms): ${stream.url.slice(0, 60)}... → ${resolved.url.slice(0, 60)}...`);
            } else {
                console.log(`[FrenchManga] Direct OK (${elapsed}ms): ${stream.url.slice(0, 70)}...`);
            }
            return resolved
        }

        if (resolved && resolved.url && !resolved.isDirect) {
            console.log(`[FrenchManga] ⚠ Resolve embed (${elapsed}ms): ${stream.url.slice(0, 80)} - isDirect=false, keeping as fallback`)
            return resolved
        }

        if (resolved && resolved.url) {
            console.log(`[FrenchManga] ⚠ Resolve uncertain (${elapsed}ms): ${stream.url.slice(0, 80)} - keeping as fallback`)
            return resolved
        }

    console.log(`[FrenchManga] ✗ Resolve null: ${(stream.url || '').slice(0, 80)} - returning embed fallback`)
    return stream
  } catch (e) {
    console.log(`[FrenchManga] ✗ Resolve ERROR: ${(stream.url || '').slice(0, 60)}... - ${e.message} - returning embed fallback`)
    return stream
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

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const subType = await detectSubType(tmdbId, mediaType, titles)
  if (subType) console.log(`[FrenchManga] Detected subtype: ${subType}`)

  if (isAborted(signal)) return []

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
  const targetEpisodeNums = await resolveTargetEpisodes(tmdbId, mediaType, season, episode)

  let match = await trySearch(titles, targetSeasonNum)
  if (!match) {
    console.warn(`[FrenchManga] Series not found for TMDB ${tmdbId}`)
    return []
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Season verification & retry
  // Si le match trouvé a une saison inconnue ou différente de celle demandée,
  // on relance une recherche spécifique avec le titre de base + "Saison N"
  // pour essayer de trouver la bonne page.
  // Ex: "One Piece" S1 → match trouve "One Piece Film - Red" (season=null)
  //   → retry avec "One Piece Saison 1"
  // Ex: "One Piece" S1 → match trouve "One Piece Saison 2" (season=2 ≠ 1)
  //   → retry avec "One Piece Saison 1"
  // ═══════════════════════════════════════════════════════════════════════════
  const needsSeasonRetry = targetSeasonNum >= 1 && (
    match.season == null ||          // season inconnue (ex: "Film - Red")
    match.season !== targetSeasonNum // saison différente (ex: S2 au lieu de S1)
  )

  if (needsSeasonRetry) {
    console.log(`[FrenchManga] Season check: match.season=${match.season}, target=${targetSeasonNum}, searching specific...`)

    // Une seule tentative suffit : tous les stripSeasonSuffix(title) donnent le même base
    const baseTitle = stripSeasonSuffix(titles[0])
    const seasonQuery = `${baseTitle} Saison ${targetSeasonNum}`
    console.log(`[FrenchManga] Season search: "${seasonQuery}"`)

    try {
      const html = await ajaxSearch(seasonQuery, { timeout: TIMEOUTS.SEARCH })
      if (html && html.length > 50) {
        const results = parseSearchResults(html)
        if (results.length > 0) {
          const seasonMatch = bestMatch(results, titles[0], targetSeasonNum)
          if (seasonMatch && seasonMatch.season === targetSeasonNum) {
            console.log(`[FrenchManga] ✅ Season search matched: "${seasonMatch.title}" (S${seasonMatch.season})`)
            match = seasonMatch
          }
        }
      }
    } catch (e) {
      console.warn(`[FrenchManga] Season search failed for "${seasonQuery}": ${e.message}`)
    }

    if (match.season !== targetSeasonNum) {
      console.log(`[FrenchManga] ⚠ Season search didn't find S${targetSeasonNum}, using original match`)
    }
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
    const seenUrls = new Set()
    const targetEp = targetEpisodeNums[0]
    const MAX_SERVERS_PER_LANG = 2  // Early-exit: resolve max 2 servers per language

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
      let resolvedCount = 0
      for (const server of ep.servers) {
        // Early-exit: stop resolving servers for this language once we have enough
        if (resolvedCount >= MAX_SERVERS_PER_LANG) break

        // Deduplicate: skip if same URL already added (VF/VOSTFR often share embeds)
        if (seenUrls.has(server.url)) {
          console.log(`[FrenchManga] Dedup: skipping ${lang} server ${server.name} (same URL as other lang)`)
          continue
        }
        seenUrls.add(server.url)

        const stream = toStream(server.url, lang, 'FrenchManga', SITE.BASE_URL, { quality: 'HD' })
        if (subType) stream.subType = subType

        const resolved = await resolveWithTimeout(stream)
        if (resolved && resolved.url && resolved.isDirect) {
          streams.push({ ...resolved, provider: 'french-manga' })
          resolvedCount++
        } else if (resolved && resolved.url && !resolved.isDirect) {
          // Embed fallback: include unresolved embeds when no direct stream available
          stream.provider = 'french-manga'
          stream.isDirect = false
          streams.push(stream)
          resolvedCount++
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
  const seenUrls = new Set()
  const MAX_SERVERS_PER_LANG = 2

  for (const [lang, episodes] of Object.entries(apiData.versions)) {
    // For movies, take the first episode
    const firstEp = episodes[0]
    if (!firstEp) continue

    console.log(`[FrenchManga] Found movie (${lang}) with ${firstEp.servers.length} server(s)`)

    let resolvedCount = 0
    for (const server of firstEp.servers) {
      if (resolvedCount >= MAX_SERVERS_PER_LANG) break

      // Deduplicate: skip if same URL already added (VF/VOSTFR often share embeds)
      if (seenUrls.has(server.url)) {
        console.log(`[FrenchManga] Dedup: skipping ${lang} server ${server.name} (same URL as other lang)`)
        continue
      }
      seenUrls.add(server.url)

      const stream = toStream(server.url, lang, name, SITE.BASE_URL, { quality: 'HD' })
      if (subType) stream.subType = subType

      const resolved = await resolveWithTimeout(stream)
      if (resolved && resolved.url && resolved.isDirect) {
        streams.push({ ...resolved, provider: 'french-manga' })
        resolvedCount++
      } else if (resolved && resolved.url && !resolved.isDirect) {
        // Embed fallback: include unresolved embeds when no direct stream available
        stream.provider = 'french-manga'
        stream.isDirect = false
        streams.push(stream)
        resolvedCount++
      }
    }
  }

  console.log(`[FrenchManga] Movie: ${streams.length} streams`)
  return streams
}
