/**
 * Extractor for VoirAnime.homes (miroir DLE de French-Manga).
 *
 * Diagnostic live 2026-11 :
 *  - `/?s=` (recherche GET DLE) est neutralisé : le site renvoie TOUJOURS la
 *    home (36 dernières sorties), donc l'ancien fallback « GET listing »
 *    matchait n'importe quel titre récent → mauvais anime servi ;
 *  - `engine/ajax/search.php` fonctionne et PAGINE (`page=1..N`) mais throttle
 *    par fenêtre : ~6 requêtes passent, la 7e renvoie 429 et toutes les
 *    suivantes aussi pendant ~30 s (un run qui insiste perd tout son budget) ;
 *  - `engine/ajax/manga_episodes_api.php?id={newsid}` donne {vf, vostfr} avec
 *    2 lecteurs par épisode : `vidzy` (OK) et `luluvid`/`vidhsareup` ;
 *  - `vidhsareup.*` n'a plus de DNS et `luluvid./luluvdo.` aboutissent sur
 *    `*.tnmr.org` en **403** → ces lecteurs ne se lancent jamais et doivent
 *    être écartés au lieu d'être servis ;
 *  - les fiches film (`Jujutsu Kaisen 0`, `One Piece Film - Red`) n'ont pas
 *    toutes « film » dans le titre : on les reconnaît à leur API à 1 épisode.
 */

import cheerio from 'cheerio-without-node-native'
import { fetchText, fetchJson, ajaxSearch, setCurrentSignal } from './http.js'
import { resolveStream, safeFetch, isAborted, withTimeout } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { stripSeasonSuffix, resolveTargetEpisodes, toStream, countExtraWords, hasForeignLeadingTokens } from '../utils/dle-extractor.js'
import {
  SITE, ENDPOINTS, PATTERNS, TIMEOUTS, SCORES,
  LANGUAGE_MAP, CACHE_TTL, MAX_SEARCH_TITLES, MAX_SEARCH_PAGES, MAX_SERVERS_PER_LANG,
  SKIP_HOSTS, BLOCKED_CDN_TOKENS, ALLOWED_CDN_TOKENS,
} from './config.js'

const PROVIDER = 'VoirAnimeHomes'
const PROVIDER_ID = 'voiranime-homes'

// Signal de l'exécution courante (une instance QuickJS par run).
let SIGNAL = null

const TMDB_API_KEY =
  (typeof globalThis !== 'undefined' && globalThis.TMDB_API_KEY) || '8265bd1679663a7ea12ac168da84d2e8'

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

function isDeadHost(url) {
  const u = String(url || '').toLowerCase()
  return SKIP_HOSTS.some(h => u.includes(h))
}

/**
 * `resolveStream` réinfère la langue depuis le name (« (VOSTFR) ») et la
 * renormalise en 'fr' : on réapplique donc le code app APRÈS résolution
 * (VOSTFR = audio ja → 'ja'), sinon la dédup URL+langue efface un des deux
 * flux quand le site partage la même URL entre VF et VOSTFR.
 */
function applyLanguageLabel(streams) {
  for (const s of streams || []) {
    const label = `${s.name || ''} ${s.title || ''}`.toUpperCase()
    if (label.includes('VOSTFR')) s.language = 'ja'
    else if (label.includes('(VF') || label.includes('[VF')) s.language = 'fr'
  }
  return streams || []
}

/**
 * `toStream` normalise VOSTFR en 'fr' (map repo) : la même URL servie sous
 * VF ET VOSTFR produisait alors deux entrées identiques côté dédup
 * (`url|language`) → le label VOSTFR disparaissait. Pour un anime, VOSTFR =
 * audio japonais + sous-titres FR → code app 'ja' (le label reste dans le
 * title/name), comme french-anime.
 */
function buildStream(url, langLabel, subType) {
  const stream = toStream(url, langLabel, PROVIDER, SITE.BASE_URL, { quality: 'HD' })
  stream.language = langLabel === 'VOSTFR' ? 'ja' : 'fr'
  if (subType) stream.subType = subType
  return stream
}

function isBlockedCdn(url) {
  const u = String(url || '').toLowerCase()
  if (ALLOWED_CDN_TOKENS.some(t => u.includes(t))) return false
  return BLOCKED_CDN_TOKENS.some(t => u.includes(t))
}

function scoreMatch(resultTitle, searchTitle) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr) return 0

  const cleanNr = nr.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').replace(/\s+/g, ' ').trim()
  const cleanNt = nt.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').replace(/\s+/g, ' ').trim()

  if (cleanNr === cleanNt || nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) {
    const extra = countExtraWords(cleanNr, cleanNt)
    let score = 0
    if (extra > 0) {
      score = Math.max(SCORES.STRONG_MATCH - Math.min(extra * 25, SCORES.STRONG_MATCH - SCORES.MIN_MATCH - 5), 0)
    } else {
      score = SCORES.STRONG_MATCH
    }
    const nrTokens = cleanNr.split(/\s+/)
    const ntTokens = cleanNt.split(/\s+/)
    if (nrTokens[0] === ntTokens[0]) score += 30
    return score
  }

  const words = cleanNt.split(/\s+/).filter(w => w.length > 2)
  const rWords = new Set(cleanNr.split(/\s+/))
  const matched = words.filter(w => rWords.has(w)).length
  if (words.length > 0) {
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
    if (targetSeason && score > 0) {
      const ts = parseInt(targetSeason)
      const rs = item.season
      if (rs === ts) {
        if (score >= SCORES.STRONG_MATCH) score += 40
      }
      else if (rs && Math.abs(rs - ts) === 1) {
        score -= 60
      }
      else if (rs && rs !== ts) {
        score -= 80
      }
    }
    if (score > bestScore) { bestScore = score; best = item }
  }
  if (bestScore >= SCORES.MIN_MATCH) {
    best.score = bestScore
    return best
  }
  return null
}

function parseSearchResults(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  const results = []

  // Home / catégories : div.short
  $('div.short').each((_, el) => {
    const $card = $(el)
    const $poster = $card.find('a.short-poster').first()
    const href = $poster.attr('href') || ''
    const title = $card.find('div.short-title').first().text().trim()
    const altTitle = $poster.attr('alt') || ''
    const version = $card.find('span.film-version a').first().text().trim() || 'VF'

    if (!href || !title) return

    const newsidMatch = href.match(PATTERNS.NEWSID)
    const slugMatch = href.match(PATTERNS.SLUG_ID)
    const season = extractSeason(title) || extractSeason(altTitle)

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      newsid: newsidMatch ? newsidMatch[1] : (slugMatch ? slugMatch[1] : null),
      title,
      altTitle,
      version,
      season,
    })
  })

  // AJAX search : div.search-item (lien dans onclick="location.href='...'")
  $('div.search-item').each((_, el) => {
    const $item = $(el)
    const onclick = $item.attr('onclick') || ''
    const hrefMatch = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/)
    const href = hrefMatch ? hrefMatch[1] : ''
    const title = $item.find('.search-title').first().text().trim() || $item.find('.search-item-title').first().text().trim()
    const poster = $item.find('.search-poster img').attr('alt') || $item.find('.search-item-poster img').attr('alt') || ''

    if (!href || !title) return

    // L'ID DLE est le préfixe du slug (`/1498086-frieren-saison-1-2023.html`)
    // — c'est exactement le `data-news-id` attendu par l'API d'épisodes.
    const slugMatch = href.match(PATTERNS.SLUG_ID) || href.match(/(\d+)-/)
    const season = extractSeason(title) || extractSeason(poster)

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      newsid: slugMatch ? slugMatch[1] : null,
      title,
      altTitle: poster,
      version: 'VF',
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
        for (const [serverName, serverUrl] of Object.entries(servers || {})) {
          if (serverUrl && typeof serverUrl === 'string' && serverUrl.startsWith('http') && !isDeadHost(serverUrl)) {
            serverLinks.push({ name: serverName, url: serverUrl })
          }
        }

        if (serverLinks.length > 0) {
          episodes.push({ num, servers: serverLinks })
        }
      }

      if (episodes.length > 0) {
        episodes.sort((a, b) => a.num - b.num)
        const langLabel = LANGUAGE_MAP[lang] || lang.toUpperCase()
        versions[langLabel] = episodes
      }
    }
  }

  if (!Object.keys(versions).length) return null

  const info = json.info || {}
  const altTitles = json.alt_titles || {}
  const altTitleUs = altTitles.us || ''
  const altTitleJp = altTitles.jp || ''

  return { versions, info, altTitleUs, altTitleJp }
}

// ─── Recherche ──────────────────────────────────────────────────────────────
/** Résultats AJAX d'une requête (pages 1..N), mis en cache pour le run. */
async function searchAllPages(query) {
  return cached(`search_${normalize(query)}`, async () => {
    const out = []
    const seen = new Set()
    for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
      let html = ''
      try {
        html = await ajaxSearch(query, { timeout: TIMEOUTS.SEARCH, page })
      } catch (e) {
        console.warn(`[${PROVIDER}] search "${query}" page ${page}: ${e.message}`)
        // Throttle : inutile d'insister, on garde ce qui a déjà été collecté.
        if (/429/.test(e.message)) break
        continue
      }
      const results = parseSearchResults(html)
      if (!results.length) break
      for (const r of results) {
        const key = r.newsid || r.url
        if (key && !seen.has(key)) { seen.add(key); out.push(r) }
      }
      // Une page incomplète signifie qu'on a atteint la fin.
      if (results.length < 20) break
    }
    if (out.length) console.log(`[${PROVIDER}] AJAX search "${query}": ${out.length} résultats`)
    return out
  })
}

/** Titres FR localisés TMDB (le catalogue du site est en français). */
async function fetchLocalizedTitles(tmdbId, mediaType) {
  const out = []
  if (!/^\d+$/.test(String(tmdbId))) return out
  const kind = mediaType === 'movie' ? 'movie' : 'tv'
  try {
    const res = await safeFetch(
      `https://api.themoviedb.org/3/${kind}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`,
      { headers: { Accept: 'application/json' }, timeout: 10000 }
    )
    const text = res ? await res.text().catch(() => '') : ''
    if (!text) return out
    const json = JSON.parse(text)
    for (const t of [json.title, json.name, json.original_name]) {
      if (typeof t === 'string' && t.trim().length >= 2 && !out.includes(t.trim())) out.push(t.trim())
    }
  } catch (e) { /* repli optionnel */ }
  return out
}

/**
 * Vérifie une fiche via #serie-config + API d'épisodes (deep fallback).
 * Retourne { url, newsid, title, season, apiData } ou null.
 */
async function verifyPage(result, normalizedTarget) {
  let html = ''
  try {
    html = await fetchText(result.url, { timeout: TIMEOUTS.PAGE, retries: 0 })
  } catch (e) {
    return null
  }
  const config = parseSerieConfig(html)
  if (!config || !config.title || !config.newsId) return null

  const nr = normalize(config.title)
  const extra = countExtraWords(nr, normalizedTarget)
  if (!(nr === normalizedTarget || nr.includes(normalizedTarget) || normalizedTarget.includes(nr))) return null
  if (extra >= 2 || hasForeignLeadingTokens(nr, normalizedTarget)) return null

  const apiData = await fetchEpisodeApi(config.newsId)
  if (!apiData || !apiData.versions) return null

  return {
    url: config.pageUrl || result.url,
    newsid: config.newsId,
    title: config.title,
    season: extractSeason(config.title) ?? extractSeason(result.title),
    apiData,
  }
}

/**
 * Premier titre exploitable pour le scoring. Un titre CJK (鬼滅の刃) se
 * normalise en chaîne vide : l'utiliser comme cible rendrait toute
 * vérification impossible, alors que le site indexe aussi ces titres.
 */
function firstScorableTitle(titles) {
  for (const t of titles || []) {
    const n = normalize(t)
    if (n.length >= 2) return n
  }
  return ''
}

async function trySearchFallback(allResults, tmdbTitles) {
  const nt = firstScorableTitle(tmdbTitles)
  if (!nt || allResults.length === 0) return null

  const unique = []
  const seen = new Set()
  for (const r of allResults) {
    if (r.url && !seen.has(r.url)) { seen.add(r.url); unique.push(r) }
  }

  // Séquentiel volontairement : chaque fiche coûte 2 requêtes au site throttlé.
  for (const result of unique.slice(0, 4)) {
    const verified = await verifyPage(result, nt)
    if (verified) {
      console.log(`[${PROVIDER}] Fallback matched: "${verified.title}" (newsid: ${verified.newsid}, season: ${verified.season})`)
      return verified
    }
  }
  return null
}

/** Recherche principale : AJAX paginé, puis repli fiche-par-fiche, puis titres FR. */
async function trySearch(titles, targetSeason, tmdbId, mediaType) {
  const cleanTitles = [...new Set(titles.map(t => stripSeasonSuffix(String(t || '').trim())).filter(Boolean))]
  const allResults = []
  const dedup = new Set()

  const collect = (results) => {
    for (const r of results) {
      const key = r.newsid || r.url
      if (key && !dedup.has(key)) { dedup.add(key); allResults.push(r) }
    }
  }

  for (const title of cleanTitles.slice(0, MAX_SEARCH_TITLES)) {
    if (isAborted(SIGNAL)) break
    let results = []
    try {
      results = await searchAllPages(title)
    } catch (e) {
      console.warn(`[${PROVIDER}] Search failed for "${title}": ${e.message}`)
    }
    if (!results.length) continue
    collect(results)
    const match = bestMatch(results, title, targetSeason)
    if (match) return match
  }

  // Deep fallback : vérifier les fiches faibles/bruitées via page + API.
  if (allResults.length > 0) {
    console.log(`[${PROVIDER}] Deep fallback sur ${allResults.length} résultat(s) AJAX...`)
    const fallback = await trySearchFallback(allResults, cleanTitles)
    if (fallback) return fallback
  }

  // Dernier repli : titres français TMDB (le catalogue est en FR).
  if (tmdbId) {
    const frTitles = await fetchLocalizedTitles(tmdbId, mediaType)
    const extra = frTitles.filter(t => !cleanTitles.some(c => normalize(c) === normalize(t)))
    if (extra.length) {
      console.log(`[${PROVIDER}] Repli titres FR: ${extra.join(' | ')}`)
      for (const title of extra.slice(0, 2)) {
        let results = []
        try {
          results = await searchAllPages(title)
        } catch (e) { /* ignore */ }
        if (!results.length) continue
        collect(results)
        // Un titre CJK ne score pas : on le laisse chercher les fiches, mais le
        // match est évalué avec tous les titres connus (EN/FR/romaji).
        for (const candidateTitle of [title, ...cleanTitles]) {
          const match = bestMatch(results, candidateTitle, targetSeason)
          if (match) return match
        }
      }
      const fallback = await trySearchFallback(allResults, [...cleanTitles, ...extra])
      if (fallback) return fallback
    }
  }

  return null
}

async function fetchEpisodeApi(newsid) {
  return cached(`episodes_${newsid}`, async () => {
    try {
      const json = await fetchJson(`${SITE.BASE_URL}${ENDPOINTS.EPISODES_API}${newsid}`, { timeout: TIMEOUTS.API })
      return parseEpisodeApiData(json)
    } catch (e) {
      console.warn(`[${PROVIDER}] Episode API failed for ${newsid}: ${e.message}`)
      return null
    }
  })
}

// ─── Résolution ─────────────────────────────────────────────────────────────
const RESOLVE_CACHE = new Map()

async function resolveCached(stream) {
  // La même URL sert souvent VF ET VOSTFR : la clé doit inclure le label,
  // sinon le second appel récupère l'objet du premier (label erroné).
  const key = `${stream.url}|${stream.language || ''}`
  if (RESOLVE_CACHE.has(key)) return RESOLVE_CACHE.get(key)
  const started = Date.now()
  let resolved = null
  try {
    resolved = await withTimeout(resolveStream(stream), 12000, 'voiranime-homes resolve')
  } catch (e) {
    resolved = null
  }
  const ok = resolved && resolved.url && resolved.isDirect && !isBlockedCdn(resolved.url) ? resolved : null
  if (ok) {
    console.log(`[${PROVIDER}] Resolved OK (${Date.now() - started}ms): ${stream.url.slice(0, 55)}… → ${ok.url.slice(0, 55)}…`)
  } else if (resolved && resolved.url && isBlockedCdn(resolved.url)) {
    console.log(`[${PROVIDER}] CDN bloqué (403 tnmr) : ${stream.url.slice(0, 55)}…`)
  } else {
    console.log(`[${PROVIDER}] ✗ Resolve failed (${Date.now() - started}ms): ${stream.url.slice(0, 70)}`)
  }
  RESOLVE_CACHE.set(key, ok)
  return ok
}

async function detectSubType(tmdbId, mediaType) {
  const type = mediaType === 'movie' ? 'movie' : 'tv'
  try {
    const details = await cached(`tmdb_${tmdbId}_${mediaType}`, async () => {
      const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
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

// ─── Pipeline ───────────────────────────────────────────────────────────────
export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)
  SIGNAL = signal
  const startTime = Date.now()
  const overBudget = () => Date.now() - startTime > 40000

  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const subType = await detectSubType(tmdbId, mediaType)
  if (subType) console.log(`[${PROVIDER}] Detected subtype: ${subType}`)

  if (isAborted(signal)) return []

  const streams = mediaType === 'movie'
    ? await extractMovie(tmdbId, titles, subType, overBudget)
    : await extractSeries(tmdbId, mediaType, titles, season, episode, subType, overBudget)
  return applyLanguageLabel(streams)
}

/** Nombre d'épisodes distincts de la fiche (1 = film). */
function countEpisodes(apiData) {
  let max = 0
  for (const episodes of Object.values(apiData.versions || {})) {
    if (episodes.length > max) max = episodes.length
  }
  return max
}

async function extractMovie(tmdbId, titles, subType, overBudget) {
  const match = await trySearch(titles, null, tmdbId, 'movie')
  if (!match) {
    console.warn(`[${PROVIDER}] Movie not found for TMDB ${tmdbId}`)
    return []
  }

  let apiData = match.apiData
  let newsid = match.newsid
  if (!apiData) {
    if (!newsid) {
      const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE, retries: 0 })
      const config = parseSerieConfig(pageHtml)
      if (!config || !config.newsId) {
        console.warn(`[${PROVIDER}] No config found on page ${match.url}`)
        return []
      }
      newsid = config.newsId
    }
    apiData = await fetchEpisodeApi(newsid)
  }
  if (!apiData || !apiData.versions) {
    console.warn(`[${PROVIDER}] No episode data for newsid ${newsid}`)
    return []
  }

  // Une fiche FILM n'a qu'un seul épisode (par langue). Sans ce garde, une
  // fiche série servie pour une demande movie donnerait son épisode 1.
  if (countEpisodes(apiData) > 1) {
    console.log(`[${PROVIDER}] Movie demandé → fiche série "${match.title}" ignorée (${countEpisodes(apiData)} épisodes)`)
    return []
  }

  console.log(`[${PROVIDER}] Movie match: ${match.title} -> ${match.url}`)
  return extractStreamsFromApi(apiData, subType, overBudget)
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType, overBudget) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  const targetEpisodeNums = await resolveTargetEpisodes(tmdbId, mediaType, season, episode)
  const targetEp = targetEpisodeNums[0]

  let match = await trySearch(titles, targetSeasonNum, tmdbId, mediaType)
  if (!match) {
    console.warn(`[${PROVIDER}] Series not found for TMDB ${tmdbId}`)
    return []
  }

  const needsSeasonRetry = targetSeasonNum >= 1 && (
    match.season == null ||
    match.season !== targetSeasonNum
  )

  if (needsSeasonRetry) {
    console.log(`[${PROVIDER}] Season check: match.season=${match.season}, target=${targetSeasonNum}, searching specific...`)

    const baseTitle = stripSeasonSuffix(titles[0])
    const seasonQuery = `${baseTitle} Saison ${targetSeasonNum}`
    try {
      const results = await searchAllPages(seasonQuery)
      if (results.length) {
        const seasonMatch = bestMatch(results, titles[0], targetSeasonNum)
        if (seasonMatch && seasonMatch.season === targetSeasonNum) {
          console.log(`[${PROVIDER}] ✅ Season search matched: "${seasonMatch.title}" (S${seasonMatch.season})`)
          match = seasonMatch
        }
      }
    } catch (e) {
      console.warn(`[${PROVIDER}] Season search failed for "${seasonQuery}": ${e.message}`)
    }

    if (match.season !== targetSeasonNum) {
      // Une page à saison EXPLICITE différente = faux contenu.
      if (match.season != null) {
        console.log(`[${PROVIDER}] ✗ Refus cross-saison : "${match.title}" = S${match.season} ≠ S${targetSeasonNum}`)
        return []
      }
      // Page sans marqueur de saison : uniquement si le titre matche très fort.
      if ((match.score || 0) < SCORES.STRONG_MATCH) {
        console.log(`[${PROVIDER}] ✗ Refus match ambigu S${targetSeasonNum} : "${match.title}" (score ${match.score} < ${SCORES.STRONG_MATCH})`)
        return []
      }
      console.log(`[${PROVIDER}] ⚠ Season search didn't find S${targetSeasonNum}, page sans marqueur conservée`)
    }
  }

  console.log(`[${PROVIDER}] Series match: ${match.title} -> ${match.url} (newsid: ${match.newsid})`)

  let apiData = match.apiData
  let newsid = match.newsid
  if (!apiData) {
    if (!newsid) {
      const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE, retries: 0 })
      const config = parseSerieConfig(pageHtml)
      if (!config || !config.newsId) {
        console.warn(`[${PROVIDER}] No config found on page ${match.url}`)
        return []
      }
      newsid = config.newsId
    }
    apiData = await fetchEpisodeApi(newsid)
  }
  if (!apiData || !apiData.versions) {
    console.warn(`[${PROVIDER}] No episode data for newsid ${newsid}`)
    return []
  }

  const streams = []
  // Dédup PAR (URL, langue) : le site sert souvent la même URL sous VF ET
  // VOSTFR (bug de données, ex. One Piece S1/S2) — les deux labels doivent
  // rester visibles plutôt qu'un seul flux arbitraire.
  const seenLangUrls = new Set()
  const seenOutput = new Set()

  for (const [lang, episodes] of Object.entries(apiData.versions)) {
    if (isAborted(SIGNAL) || overBudget()) break

    // Essaie chaque numéro candidat (ArmSync peut renvoyer [ep, absolu]).
    let ep = null
    for (const num of targetEpisodeNums) {
      ep = episodes.find(e => e.num === num)
      if (ep) {
        if (num !== targetEp) console.log(`[${PROVIDER}] Episode ${num} retenu (candidat ArmSync) pour S${targetSeasonNum}E${targetEp} (${lang})`)
        break
      }
    }
    if (!ep) {
      ep = episodes[targetEp - 1]
      if (ep) console.log(`[${PROVIDER}] Fallback positionnel: épisode ${ep.num} pour ${targetEp} (${lang})`)
    }
    if (!ep) {
      console.log(`[${PROVIDER}] Aucun épisode ${targetEp} en ${lang} (${episodes.length} dispo)`)
      continue
    }

    const epInfo = apiData.info && apiData.info[String(ep.num)]
    if (epInfo && epInfo.title) {
      console.log(`[${PROVIDER}] Episode ${ep.num}: "${epInfo.title}" (${lang})`)
    }
    console.log(`[${PROVIDER}] Found episode ${ep.num} (${lang}) with ${ep.servers.length} server(s)`)

    const resolvedList = await Promise.all(ep.servers.slice(0, MAX_SERVERS_PER_LANG).map(async (server) => {
      if (seenLangUrls.has(`${server.url}|${lang}`)) return null
      seenLangUrls.add(`${server.url}|${lang}`)
      return await resolveCached(buildStream(server.url, lang, subType))
    }))

    for (const resolved of resolvedList) {
      if (!resolved) continue
      // Dédup sur l'URL + le LABEL (VF/VOSTFR) : `resolved.language` est
      // normalisé ('fr' pour VF *et* VOSTFR), donc l'utiliser ici effacerait
      // le label VOSTFR quand le site partage la même URL entre les deux.
      const dedupeKey = `${resolved.url}|${lang}`
      if (seenOutput.has(dedupeKey)) continue
      seenOutput.add(dedupeKey)
      streams.push({ ...resolved, provider: PROVIDER_ID })
    }
  }

  console.log(`[${PROVIDER}] Series: ${streams.length} streams for episode ${targetEp}`)
  return streams
}

async function extractStreamsFromApi(apiData, subType, overBudget) {
  const streams = []
  const seenOutput = new Set()

  for (const [lang, episodes] of Object.entries(apiData.versions)) {
    if (overBudget()) break
    const firstEp = episodes[0]
    if (!firstEp) continue

    console.log(`[${PROVIDER}] Found movie (${lang}) with ${firstEp.servers.length} server(s)`)

    const resolvedList = await Promise.all(firstEp.servers.slice(0, MAX_SERVERS_PER_LANG).map(async (server) => {
      return await resolveCached(buildStream(server.url, lang, subType))
    }))

    for (const resolved of resolvedList) {
      if (!resolved) continue
      const dedupeKey = `${resolved.url}|${lang}`
      if (seenOutput.has(dedupeKey)) continue
      seenOutput.add(dedupeKey)
      streams.push({ ...resolved, provider: PROVIDER_ID })
    }
  }

  console.log(`[${PROVIDER}] Movie: ${streams.length} streams`)
  return streams
}
