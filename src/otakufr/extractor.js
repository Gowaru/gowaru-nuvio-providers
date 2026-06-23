/**
 * Extractor for Otakufr (otakufr.beer)
 * Site WordPress avec chaque anime comme catégorie et chaque épisode comme article.
 * 
 * Architecture:
 *   Phase 1 - Recherche: WordPress /?s={query} + scoring
 *   Phase 2 - Épisodes: Parse page série /{slug}/ + pagination
 *   Phase 3 - Streams: iframe embeds → resolveStream
 */

import { fetchText, fetchJson, BASE_URL } from './http.js'
import { resolveStream, isBudgetExhausted, sanitizeSearchQuery, sortStreamsByLanguage } from '../utils/resolvers.js'
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js'
import { getTmdbTitles } from '../utils/metadata.js'
import cheerio from 'cheerio-without-node-native'

// ─── Constantes ───────────────────────────────────────────────

const BUDGET_MS = 40000
const CACHE_TTL = 120_000  // 2 min pour le cache de recherche

// Cache des séries déjà trouvées (slug → titre)
const searchCache = new Map()

// Slug probe cache (évite les doubles HEAD dans la même exécution)
const slugProbeCache = new Map()

// ─── Helpers ──────────────────────────────────────────────────

function toSlug(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeForSearch(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]]/g, ' ')
    .replace(/\b(the|vostfr|vost|vf|french|streaming|anime|saison|season)\s+/g, '')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Score de matching entre un titre du site et un titre TMDB + saison
 */
function scoreMatch(siteTitle, siteUrl, searchTitle, searchSeason) {
  const ns = normalizeForSearch(searchTitle)
  const nt = normalizeForSearch(siteTitle)
  if (!nt || !ns) return 0

  let score = 0
  if (nt === ns) score = 100
  else if (nt.includes(ns) || ns.includes(nt)) score = 80
  else {
    const rWords = new Set(nt.split(/\s+/).filter(w => w.length > 2))
    const sWords = new Set(ns.split(/\s+/).filter(w => w.length > 2))
    if (rWords.size > 0 && sWords.size > 0) {
      let overlap = 0
      for (const w of sWords) {
        if (rWords.has(w)) overlap++
      }
      score = Math.round((overlap / Math.max(rWords.size, sWords.size)) * 50)
    }
  }

  // Bonus/Malus saison (malus agressif : -80 pour exclure les mauvaises saisons)
  // Une base de 80 (match partiel) + malus -80 = 0 → sous le seuil → exclu
  // Une base de 100 (match exact) + malus -80 = 20 → sous le seuil → exclu
  const urlSeason = extractSeasonFromUrl(siteUrl)
  if (urlSeason !== null) {
    if (urlSeason === searchSeason) score += 30
    else score -= 80
  } else if (searchSeason === 1) {
    score += 10
  }

  return Math.max(score, 0)
}

/**
 * Extrait le numéro de saison depuis une URL de série
 * ex: /jujutsu-kaisen-saison-3/ → 3, /one-piece/ → null
 */
function extractSeasonFromUrl(url) {
  const saisonMatch = url.match(/saison[_-](\d+)/i)
  if (saisonMatch) return parseInt(saisonMatch[1], 10)
  const seasonMatch = url.match(/season[_-](\d+)/i)
  if (seasonMatch) return parseInt(seasonMatch[1], 10)
  return null
}

/**
 * Extrait le numéro de saison depuis le nom de catégorie
 * ex: "Jujutsu Kaisen Saison 3" → 3, "Oshi no Ko 3rd Season" → 3
 */
function extractSeasonFromName(name) {
  const match = (name || '').match(/(?:(\d+)(?:st|nd|rd|th)\s*(?:Saison|Season)|(?:Saison|Season)\s*(\d+))/i)
  if (match) return parseInt(match[1] || match[2], 10)
  return null
}

/**
 * Nettoie un slug en retirant les suffixes de saison
 * "jujutsu-kaisen-saison-3" → "jujutsu-kaisen"
 */
function cleanSeasonSuffix(slug) {
  return slug
    .replace(/-(?:saison|season)-?\d+$/i, '')
    .replace(/-s\d+$/i, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Extrait les iframes d'une page épisode
 */
function extractIframeUrl(html) {
  if (!html) return null

  // <iframe> standard
  const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  if (iframeMatch) {
    let src = iframeMatch[1]
    if (src.startsWith('//')) src = 'https:' + src
    if (src.startsWith('http') && !src.includes('youtube.com') && !src.includes('googlevideo.com')) {
      return src
    }
  }

  // data-src (utilisé par certains thèmes WP)
  const dataSrcMatch = html.match(/data-src=["']([^"']+)["']/i)
  if (dataSrcMatch) return dataSrcMatch[1]

  return null
}

/**
 * Extrait tous les serveurs / lecteurs disponibles depuis le HTML de la page épisode
 */
function extractServers(html) {
  const servers = new Set()

  // Options de selecteur de serveur (<option value="...">)
  const optionRegex = /<option[^>]+value="([^"]+)"[^>]*>/gi
  let m
  while ((m = optionRegex.exec(html)) !== null) {
    const val = m[1]
    if (val && val !== 'Choisir un lecteur') servers.add(val)
  }

  // Liens de serveur alternatifs
  const serverRegex = /href=["']([^"']*server[^"']*)["']/gi
  while ((m = serverRegex.exec(html)) !== null) {
    if (m[1].startsWith('http')) servers.add(m[1])
  }

  return [...servers]
}

// ─── Phase 1: Recherche ──────────────────────────────────────

/**
 * Recherche un anime sur Otakufr via l'API REST WordPress /wp-json/wp/v2/categories
 * Plus rapide et plus fiable que le parsing HTML. Retourne null si aucun résultat.
 */
async function searchByRestApi(query, season) {
  const cleanQuery = sanitizeSearchQuery(query)
  if (!cleanQuery || cleanQuery.length < 2) return null

  const apiUrl = `${BASE_URL}/wp-json/wp/v2/categories?search=${encodeURIComponent(cleanQuery)}&per_page=5`

  try {
    const json = await fetchJson(apiUrl, { timeout: 5000 })
    if (!json || !Array.isArray(json) || json.length === 0) return null

    const results = []
    for (const cat of json) {
      const name = cat.name || ''
      const slug = cat.slug || ''
      if (!name || !slug) continue

      const catUrl = `${BASE_URL}/${slug}/`
      const categorySeason = extractSeasonFromName(name) || extractSeasonFromUrl(catUrl)
      const score = scoreMatch(name, catUrl, query, season)

      if (score >= 30) {
        results.push({
          title: name,
          url: catUrl.replace(/\/$/, ''),
          slug,
          score,
          categorySeason,
          categoryId: cat.id,
        })
      }
    }

    if (results.length === 0) return null

    results.sort((a, b) => b.score - a.score)
    console.log(`[Otakufr] REST API "${query}": ${results.length} results (best: ${results[0].title} score=${results[0].score})`)
    return results.slice(0, 3)
  } catch (e) {
    console.warn(`[Otakufr] REST API search failed for "${query}": ${e?.message}`)
    return null
  }
}

/**
 * Recherche un anime sur Otakufr via la recherche WordPress HTML
 * Utilisé comme fallback quand l'API REST ne trouve rien.
 */
async function searchHtml(query, season) {
  const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(sanitizeSearchQuery(query))}`
  const results = []

  try {
    const html = await fetchText(searchUrl, { timeout: 8000 })
    if (!html || html.length < 100) return results

    const $ = cheerio.load(html)
    const seenUrls = new Set()

    // Méthode 1: Selecteurs cheerio
    const contentSelectors = '.post-title a, .entry-title a, article a, .result-item a, h2 a, h3 a, .post a, li a[href*="/"]:not([href*="#"]):not([href*="mailto"]):not([href*="wp-"])'
    $(contentSelectors).each((_, el) => {
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim()
      if (!href || !text) return
      if (href === BASE_URL || href === '/' || href.startsWith('#') || href.startsWith('mailto:')) return
      if (href.includes('-episode-') || href.includes('/episode/') || href.includes('/page/')) return
      if (href.includes('/wp-') || href.includes('/feed') || href.includes('/category/')) return
      if (!href.startsWith(BASE_URL) && !href.startsWith('/')) return

      const cleanHref = href.startsWith('/') ? `${BASE_URL}${href}` : href
      if (seenUrls.has(cleanHref)) return
      seenUrls.add(cleanHref)

      let pathname
      try { pathname = href.startsWith('http') ? new URL(cleanHref).pathname : href } catch { return }
      const slugMatch = pathname.match(/^\/([^/]+)\/?$/)
      if (!slugMatch) return

      const categorySeason = extractSeasonFromName(text)
      const score = scoreMatch(text, cleanHref, query, season)
      if (score >= 30) {
        results.push({ title: text, url: cleanHref.replace(/\/$/, ''), slug: slugMatch[1].replace(/\/$/, ''), score, categorySeason })
      }
    })

    // Méthode 2: Regex fallback
    if (results.length === 0) {
      const animeRegex = /<a[^>]+href="([^"']+)"[^>]*>([^<]{3,})<\/a>/gi
      let m
      while ((m = animeRegex.exec(html)) !== null) {
        let rawUrl = m[1]
        if (rawUrl.startsWith('#') || rawUrl.includes('/wp-') || rawUrl.startsWith('mailto:') || rawUrl.startsWith('//cdn')) continue
        if (!rawUrl.startsWith('http') && !rawUrl.startsWith('/')) continue

        let href
        if (rawUrl.startsWith('//')) href = 'https:' + rawUrl
        else if (rawUrl.startsWith('/')) href = `${BASE_URL}${rawUrl}`
        else href = rawUrl

        const title = m[2].trim()
        if (!title || seenUrls.has(href) || href.includes('-episode-') || href.includes('/page/')) continue
        seenUrls.add(href)

        let pathname
        try { pathname = new URL(href).pathname } catch { continue }
        const slugMatch = pathname.match(/^\/([^/]+)\/?$/)
        if (!slugMatch) continue

        const categorySeason = extractSeasonFromName(title) || extractSeasonFromUrl(pathname)
        const score = scoreMatch(title, href, query, season)
        if (score >= 20) {
          results.push({ title, url: href.replace(/\/$/, ''), slug: slugMatch[1].replace(/\/$/, ''), score, categorySeason })
        }
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, 3)
  } catch (e) {
    console.warn(`[Otakufr] HTML search failed for "${query}": ${e?.message}`)
    return []
  }
}

/**
 * Tentative de match direct par slug.
 * Vérifie si le slug existe sur le site et valide la saison.
 * Exécuté en parallèle de searchOtakufr pour gagner du temps.
 *
 * @param {string} slug - Slug nettoyé du titre TMDB
 * @param {string} title - Titre original TMDB
 * @param {number} season - Saison cible
 * @param {number} startTime - Timestamp de début pour budget check
 * @returns {Promise<{title, url, slug, score, categorySeason}|null>}
 */
async function tryDirectSlug(slug, title, season, startTime) {
  if (slug.length < 3 || isBudgetExhausted(startTime, BUDGET_MS)) return null
  console.log(`[Otakufr] Trying direct slug: /${slug}/`)
  const directUrl = `${BASE_URL}/${slug}/`
  try {
    const testHtml = await fetchText(directUrl, { timeout: 5000 })
    if (testHtml && testHtml.length > 200) {
      // Vérifier la saison du slug direct via REST API
      let skipDirectSlug = false
      try {
        const cleanSearch = slug.replace(/-/g, ' ')
        const apiUrl = `${BASE_URL}/wp-json/wp/v2/categories?search=${encodeURIComponent(cleanSearch)}&per_page=3&_fields=name,slug`
        const catJson = await fetchJson(apiUrl, { timeout: 4000 })
        if (catJson && Array.isArray(catJson) && catJson.length > 0) {
          const catsWithSeason = catJson.filter(c => {
            const s = extractSeasonFromName(c.name) || extractSeasonFromUrl('/' + (c.slug || '') + '/')
            return s !== null && s !== season
          })
          if (catsWithSeason.length === catJson.length && catJson.length > 0) {
            const foundSeason = extractSeasonFromName(catJson[0].name) || extractSeasonFromUrl('/' + (catJson[0].slug || '') + '/')
            console.log(`[Otakufr] ⚠ Direct slug /${slug}/ → only season ${foundSeason} available (target: S${season}), skipping`)
            skipDirectSlug = true
          }
        }
      } catch {}

      if (!skipDirectSlug) {
        console.log(`[Otakufr] ✓ Direct slug match: /${slug}/`)
        return {
          title,
          url: directUrl,
          slug,
          score: 100,
          categorySeason: null,
        }
      } else {
        console.log(`[Otakufr] Direct slug /${slug}/ → season mismatch, continuing search`)
      }
    } else {
      console.log(`[Otakufr] Direct slug /${slug}/ → empty or 404`)
    }
  } catch (e) {
    console.log(`[Otakufr] Direct slug /${slug}/ → error: ${e?.message?.slice(0, 50) || 'unknown'}`)
  }
  return null
}

/**
 * Recherche un anime sur Otakufr : API REST en priorité, fallback HTML.
 * 
 * @param {string} query - Titre à rechercher
 * @param {number} season - Numéro de saison TMDB
 * @returns {Promise<Array<{title, url, season}>>}
 */
async function searchOtakufr(query, season) {
  const cacheKey = `${toSlug(query)}-${season}`
  if (searchCache.has(cacheKey) && Date.now() - searchCache.get(cacheKey).ts < CACHE_TTL) {
    return searchCache.get(cacheKey).data
  }

  // Méthode 1: API REST WordPress (rapide, 2-5x plus rapide que HTML)
  let results = await searchByRestApi(query, season)
  let source = 'REST'

  // Méthode 2: Fallback HTML si l'API REST n'a rien trouvé
  if (!results || results.length === 0) {
    results = await searchHtml(query, season)
    source = 'HTML'
  }

  const data = results || []
  console.log(`[Otakufr] Search "${query}": ${data.length} results (source: ${source}, best: ${data[0]?.title || 'none'} score=${data[0]?.score || 0})`)

  searchCache.set(cacheKey, { ts: Date.now(), data })
  return data
}

// ─── Phase 2: Découverte des épisodes ────────────────────────

/**
 * Récupère l'ID d'une catégorie WordPress à partir de son slug.
 * Utilisé quand le match vient du HTML ou du direct slug (pas de categoryId).
 */
async function getCategoryIdBySlug(slug) {
  try {
    const apiUrl = `${BASE_URL}/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}&_fields=id`
    const json = await fetchJson(apiUrl, { timeout: 4000 })
    if (!json || !Array.isArray(json) || json.length === 0) return null
    return json[0].id || null
  } catch {
    return null
  }
}

/**
 * Recherche les épisodes d'une catégorie via l'API REST WordPress /wp/v2/posts.
 * Beaucoup plus rapide que le parsing HTML — retourne directement l'URL si trouvée.
 */
async function searchEpisodesByRestApi(categoryId, slug, targetEpisode, startTime) {
  try {
    if (isBudgetExhausted(startTime, BUDGET_MS)) return null

    const apiUrl = `${BASE_URL}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=100&_fields=link,title`
    const json = await fetchJson(apiUrl, { timeout: 6000 })
    if (!json || !Array.isArray(json) || json.length === 0) return null

    const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const epRegex = new RegExp(`${escapedSlug}-episode-(\\d+)(-v(?:ostfr|f))?/?$`, 'i')

    const episodes = []
    for (const post of json) {
      const link = (post.link || '').replace(/\/$/, '')
      const epMatch = link.match(epRegex)
      if (!epMatch) continue

      const epNum = parseInt(epMatch[1], 10)
      if (isNaN(epNum)) continue

      episodes.push({ episode: epNum, url: link })
    }

    if (episodes.length === 0) return null

    // Chercher l'épisode cible
    const target = episodes.find(ep => ep.episode === targetEpisode)
    if (target) {
      console.log(`[Otakufr] REST API posts: found episode ${targetEpisode} → ${target.url}`)
      return target.url
    }

    return null
  } catch (e) {
    console.warn(`[Otakufr] REST API posts search failed: ${e?.message}`)
    return null
  }
}

/**
 * Parse la page d'une série pour lister les épisodes
 * 
 * @param {string} seriesUrl - URL de la page série
 * @param {number} targetSeason - Saison cible TMDB
 * @param {number} targetEpisode - Épisode cible TMDB
 * @param {number} startTime - Timestamp de début pour budget check
 * @param {string} [seriesSlug] - Slug de la série courante (pour filtrer les URLs d'autres séries)
 * @returns {Promise<string|null>} URL de la page épisode
 */
async function findEpisodeUrl(seriesUrl, targetSeason, targetEpisode, startTime, seriesSlug) {
  const episodes = []
  let currentPage = 1
  let maxPages = 3 // Limiter à 3 pages pour le budget

  // Slug de base (sans suffixe saison) pour matcher les URLs génériques
  const baseSlug = seriesSlug ? cleanSeasonSuffix(seriesSlug) : null

  while (currentPage <= maxPages && !isBudgetExhausted(startTime, BUDGET_MS)) {
    const pageUrl = currentPage === 1 ? seriesUrl : `${seriesUrl}/page/${currentPage}/`
    try {
      const html = await fetchText(pageUrl, { timeout: 8000 })
      if (!html || html.length < 100) break

      const $ = cheerio.load(html)

      // Chercher les liens d'épisodes
      $('a').each((_, el) => {
        if (isBudgetExhausted(startTime, BUDGET_MS)) return false
        const href = $(el).attr('href') || ''
        const text = $(el).text().trim()

        // Pattern: /{slug}-episode-{num}-{sub}/
        const epMatch = href.match(/(.+?)-episode-(\d+)(-v(?:ostfr|f))?\/?$/)
        if (!epMatch) return

        // 👇 FILTRE CRITIQUE : ne garder que les URLs qui contiennent le slug de l'anime courant
        // Sans ce filtre, $('a') attrape des épisodes d'autres séries listées sur la même page
        if (seriesSlug) {
          const urlContainsSlug = href.includes(seriesSlug)
          const urlContainsBase = baseSlug && baseSlug !== seriesSlug && href.includes(baseSlug)
          if (!urlContainsSlug && !urlContainsBase) return
        }

        const epNum = parseInt(epMatch[2], 10)
        if (isNaN(epNum)) return

        // Vérifier la saison si spécifiée dans le nom de l'épisode
        const epText = text || ''
        if (targetSeason > 1) {
          // Si l'épisode contient une mention de saison, vérifier
          const epSeason = extractSeasonFromName(epText) || extractSeasonFromUrl(href)
          if (epSeason !== null && epSeason !== targetSeason) return
        }

        const lang = epMatch[3] ? (epMatch[3].includes('vf') ? 'VF' : 'VOSTFR') : 'VOSTFR'
        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`

        episodes.push({
          episode: epNum,
          season: targetSeason,
          url: fullUrl,
          lang,
          text: epText || `Episode ${epNum}`,
        })
      })

      // Vérifier s'il y a une page suivante
      const hasNext = $('a:contains("Next"), a:contains("Suiv"), a:contains("»")').length > 0 ||
                      html.includes('>Next</a>') ||
                      html.includes('>Suivant</a>') ||
                      html.includes('>&raquo;</a>')

      if (!hasNext) break
      currentPage++
    } catch (e) {
      console.warn(`[Otakufr] Page ${currentPage} failed: ${e?.message}`)
      break
    }
  }

  // Filtrer par épisode cible
  const targetUrls = episodes
    .filter(ep => ep.episode === targetEpisode)
    .map(ep => ep.url)

  // Si pas trouvé, essayer par index positionnel
  if (targetUrls.length === 0 && episodes.length > 0) {
    episodes.sort((a, b) => a.episode - b.episode)
    const idx = targetEpisode - 1
    if (idx >= 0 && idx < episodes.length) {
      console.log(`[Otakufr] Fallback: episode ${targetEpisode} at index ${idx}`)
      targetUrls.push(episodes[idx].url)
    }
  }

  return targetUrls.length > 0 ? targetUrls[0] : null
}

/**
 * Version allégée : génération directe de l'URL épisode quand on connaît le slug
 * sans avoir à parser toute la page série (gain de temps)
 */
function generateEpisodeUrls(slug, episode, lang = 'vostfr') {
  const paddings = ['0', '']
  const urls = []

  // Ne générer que les URLs pour la langue demandée (pas de mélange VOSTFR/VF)
  for (const pad of paddings) {
    urls.push(`${BASE_URL}/${slug}-episode-${pad}${episode}-${lang}/`)
  }

  return urls
}

// ─── Phase 3: Extraction des streams ──────────────────────────

/**
 * Extrait les streams d'une page épisode
 */
async function extractStreamsFromEpisode(episodeUrl, lang, startTime) {
  try {
    const html = await fetchText(episodeUrl, { timeout: 10000 })
    if (!html || html.length < 100) return []

    // Essayer d'abord les serveurs alternatifs (sélecteur <option>)
    const servers = extractServers(html)
    const streamPromises = []

    if (servers.length > 0) {
      for (const server of servers) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break

        let serverUrl
        if (server.startsWith('http')) {
          serverUrl = server
        } else {
          serverUrl = `${episodeUrl}${episodeUrl.includes('?') ? '&' : '?'}host=${encodeURIComponent(server)}`
        }

        streamPromises.push(
          resolveStream({
            name: `Otakufr (${lang})`,
            title: `${server} - ${lang}`,
            url: serverUrl,
            quality: 'HD',
            language: lang,
            headers: {
              Referer: `${BASE_URL}/`,
              Origin: BASE_URL,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          }).catch(() => null)
        )
      }
    }

    // Fallback: iframe direct
    const iframeUrl = extractIframeUrl(html)
    if (iframeUrl && streamPromises.length === 0) {
      streamPromises.push(
        resolveStream({
          name: `Otakufr (${lang})`,
          title: `Default Player - ${lang}`,
          url: iframeUrl,
          quality: 'HD',
          language: lang,
          headers: {
            Referer: `${BASE_URL}/`,
            Origin: BASE_URL,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        }).catch(() => null)
      )
    }

    if (streamPromises.length === 0) return []

    // Résoudre les streams en parallèle (limité à 4 pour le budget)
    const batch = streamPromises.slice(0, 4)
    const resolved = await Promise.allSettled(batch)
    const streams = resolved
      .filter(r => r.status === 'fulfilled' && r.value && r.value.url)
      .map(r => r.value)

    return streams
  } catch (e) {
    console.warn(`[Otakufr] Episode stream extraction failed: ${e?.message}`)
    return []
  }
}

// ─── Point d'entrée principal ─────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode) {
  const startTime = Date.now()
  slugProbeCache.clear()

  // Obtenir les titres TMDB
  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : (season || 1)
  const targetEpisode = parseInt(episode) || 1

  console.log(`[Otakufr] Searching TMDB ${tmdbId} S${effectiveSeason}E${targetEpisode}`)

  // ArmSync: tentative d'épisode absolu pour multi-saisons
  // On garde les DEUX numéros (absolu + relatif) car certains sites
  // utilisent la numérotation relative par saison (ex: épisodes 1-12)
  // tandis que d'autres utilisent la numérotation absolue (ex: épisodes 1-1167)
  let targetEpisodes = [targetEpisode]
  if (mediaType === 'tv' && !isBudgetExhausted(startTime, BUDGET_MS)) {
    try {
      const imdbId = await getImdbId(tmdbId, mediaType)
      if (imdbId && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, targetEpisode)
        if (absoluteEpisode && absoluteEpisode !== targetEpisode) {
          targetEpisodes = [absoluteEpisode, targetEpisode]
          console.log(`[Otakufr] ArmSync: absolute ${absoluteEpisode}, fallback ${targetEpisode}`)
        }
      }
    } catch (e) {
      console.warn(`[Otakufr] ArmSync failed: ${e?.message}`)
    }
  }

  // Phase 1: Rechercher l'anime sur le site
  // Essayer d'abord les titres sans suffixe de saison, puis avec
  const searchTitles = titles.slice(0, 8)
  const baseTitles = searchTitles.filter(t => !/\bS(?:eason|aison)?\s*\d/i.test(t))
  const seasonTitles = searchTitles.filter(t => /\bS(?:eason|aison)?\s*\d/i.test(t))

  let matchedSeries = null

  for (const title of [...baseTitles, ...seasonTitles]) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) break
    const slug = toSlug(title)
    if (slug.length < 3) continue

    console.log(`[Otakufr] Trying title: "${title}" (slug: ${slug}, season: ${effectiveSeason})`)

    // Lancer la recherche REST+HTML ET le probe slug direct EN PARALLÈLE
    // Gain : économise 5-9s par titre quand le REST API échoue mais que le slug direct fonctionne
    const [results, directMatch] = await Promise.all([
      searchOtakufr(title, effectiveSeason).catch(() => []),
      tryDirectSlug(slug, title, effectiveSeason, startTime).catch(() => null),
    ])

    if (results.length > 0) {
      matchedSeries = results[0]
      console.log(`[Otakufr] ✓ Matched: "${matchedSeries.title}" (slug: ${matchedSeries.slug}, score: ${matchedSeries.score})`)
      break
    }

    if (directMatch) {
      matchedSeries = directMatch
      break
    }
  }

  if (!matchedSeries) {
    console.log(`[Otakufr] No match found for ${tmdbId}`)
    return []
  }

  // Phase 2: Trouver l'URL de l'épisode
  // Essayer chaque numéro d'épisode dans targetEpisodes (absolu d'abord, puis relatif)
  // Cela permet de gérer à la fois les sites avec numérotation absolue (One Piece)
  // et ceux avec numérotation relative par saison (Dorohedoro S2: 1-12)
  let episodeUrl = null
  const langs = ['vostfr', 'vf']

  for (const ep of targetEpisodes) {
    if (episodeUrl || isBudgetExhausted(startTime, BUDGET_MS)) break
    console.log(`[Otakufr] Trying episode number: ${ep}`)

    // Méthode rapide: génération directe d'URLs + probe
    for (const lang of langs) {
      if (episodeUrl || isBudgetExhausted(startTime, BUDGET_MS)) break
      const candidateUrls = generateEpisodeUrls(matchedSeries.slug, ep, lang)
      for (const url of candidateUrls.slice(0, 2)) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break
        try {
          const res = await fetchText(url, { timeout: 5000 })
          if (res && res.length > 200) {
            episodeUrl = url
            console.log(`[Otakufr] Fast episode URL: ${url}`)
            break
          }
        } catch {}
      }
    }

    if (episodeUrl) break

    // Méthode intermédiaire: API REST /wp/v2/posts
    if (!isBudgetExhausted(startTime, BUDGET_MS)) {
      if (!matchedSeries.categoryId) {
        matchedSeries.categoryId = await getCategoryIdBySlug(matchedSeries.slug)
      }
      if (matchedSeries.categoryId) {
        episodeUrl = await searchEpisodesByRestApi(matchedSeries.categoryId, matchedSeries.slug, ep, startTime)
        if (episodeUrl) {
          console.log(`[Otakufr] REST API episode URL: ${episodeUrl}`)
        }
      }
    }

    if (episodeUrl) break

    // Fallback: parser la page série
    if (!isBudgetExhausted(startTime, BUDGET_MS)) {
      episodeUrl = await findEpisodeUrl(matchedSeries.url, effectiveSeason, ep, startTime, matchedSeries.slug)
      if (episodeUrl) {
        console.log(`[Otakufr] Series page found episode ${ep}: ${episodeUrl}`)
      }
    }
  }

  if (!episodeUrl) {
    const lastEp = targetEpisodes[targetEpisodes.length - 1]
    console.log(`[Otakufr] Episode ${lastEp} not found for ${matchedSeries.slug}`)
    return []
  }

  // Phase 3: Extraire les streams de la page épisode
  const detectedLang = episodeUrl.includes('-vf') ? 'VF' : 'VOSTFR'
  const streams = await extractStreamsFromEpisode(episodeUrl, detectedLang, startTime)

  const validStreams = streams.filter(s => s && s.url)
  console.log(`[Otakufr] Total streams: ${validStreams.length}`)

  return sortStreamsByLanguage(validStreams)
}


