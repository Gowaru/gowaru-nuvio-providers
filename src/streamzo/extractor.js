import { fetchText, setCurrentSignal } from './http.js'
import { SITE, TIMEOUTS } from './config.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { resolveStream, isAborted, isBudgetExhausted, PROVIDER_BUDGET_MS } from '../utils/resolvers.js'
import { toSlug } from '../utils/dle-extractor.js'

/**
 * Extrait l'URL embed depuis la page d'un film
 * La page contient: <iframe id="video-frame" src="/embed/sharecloudy.com/ID">
 */
function extractEmbedUrl(html) {
  if (!html) return null

  // Pattern 1: #player-facade with data-embed (nouveau site)
  // <button id="player-facade" data-embed="/embed/sharecloudy.com/ID">
  const facadeMatch = html.match(/id=["']player-facade["'][^>]*data-embed=["']([^"']+)["']/i)
  if (facadeMatch) return facadeMatch[1]

  // Pattern 2: iframe#video-frame (ancien site)
  const iframeMatch = html.match(/<iframe[^>]*id=["']video-frame["'][^>]*src=["']([^"']+)["']/i)
  if (iframeMatch) return iframeMatch[1]

  // Pattern 3: any iframe with src containing /embed/
  const embedMatch = html.match(/<iframe[^>]*src=["']([^"']*\/embed\/[^"']+)["']/i)
  if (embedMatch) return embedMatch[1]

  // Pattern 4: #player container with iframe inside
  const playerMatch = html.match(/id=["']player["'][^>]*>[\s\S]*?<iframe[^>]*src=["']([^"']+)["']/i)
  if (playerMatch) return playerMatch[1]

  return null
}

/**
 * Vérifie si le HTML contient des boutons d'épisode de série
 * (pattern: <button class="sd-ep" ...>).
 */
function hasSeriesEpisodes(html) {
  if (!html) return false
  return /<button[^>]*class="sd-ep"[^>]*>/i.test(html)
}

/**
 * Extrait l'URL embed d'un épisode depuis la page série.
 * Les épisodes sont dans des <button class="sd-ep"> avec data-attributs :
 *   data-season="N" data-lang="vf|vostfr" data-ep="N" data-src="/embed/..."
 * On extrait chaque attribut individuellement pour être insensible à l'ordre.
 */
function findSeriesEpisode(html, season, episode) {
  if (!html) return null

  const buttonRegex = /<button[^>]*class="sd-ep"[^>]*>/gi
  let match
  const targetSeason = parseInt(season, 10)
  const targetEpisode = parseInt(episode, 10)

  // Collecter tous les candidats (vf et vostfr)
  const candidates = []

  while ((match = buttonRegex.exec(html)) !== null) {
    const el = match[0]
    const s = el.match(/data-season="(\d+)"/)
    const e = el.match(/data-ep="(\d+)"/)
    const l = el.match(/data-lang="([^"]+)"/)
    const src = el.match(/data-src="([^"]+)"/)
    if (!s || !e || !l || !src) continue

    candidates.push({
      season: parseInt(s[1], 10),
      episode: parseInt(e[1], 10),
      lang: l[1],
      embedUrl: src[1],
    })
  }

  // Chercher en priorité vf, puis vostfr
  for (const lang of ['vf', 'vostfr']) {
    const found = candidates.find(c => c.season === targetSeason && c.episode === targetEpisode && c.lang === lang)
    if (found) return { embedUrl: found.embedUrl, lang: lang === 'vf' ? 'VF' : 'VOSTFR' }
  }

  return null
}

/**
 * Extrait l'URL video directe depuis la page embed
 * La page embed utilise vidstack et contient une URL .m3u8 directe
 */
function extractDirectUrl(embedHtml) {
  if (!embedHtml) return null

  // Pattern 1: URL .m3u8 dans le HTML
  const hlsMatch = embedHtml.match(/https?:[^"'<>]+\.m3u8[^"'<>]*/)
  if (hlsMatch) return hlsMatch[0]

  // Pattern 2: URL .mp4 directe
  const mp4Match = embedHtml.match(/https?:[^"'<>]+\.mp4[^"'<>]*/)
  if (mp4Match) return mp4Match[0]

  // Pattern 3: src d'iframe dans l'embed
  const iframeMatch = embedHtml.match(/<iframe[^>]*src=["']([^"']+)["']/i)
  if (iframeMatch) return iframeMatch[1]

  return null
}

/**
 * Extrait la qualite depuis la page du film
 */
function extractQuality(html) {
  if (!html) return 'HD'
  const qMatch = html.match(/q\s*--(?:good|bad)\s*["']?\s*>\s*(\d+p)/i)
  if (qMatch) return qMatch[1]
  return 'HD'
}

/**
 * Cherche un film/serie sur streamzo.fr
 * Strategie: TMDB titles → slug → page fetch → iframe extraction
 *
 * @param {string[]} titles - Titres TMDB
 * @param {'movie'|'tv'} mediaType
 * @param {number|string} season
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal] - Signal d'annulation
 * @param {number} [opts.startTime] - Timestamp début pour budget check
 */
async function findContent(titles, mediaType, season, opts = {}) {
  const signal = opts.signal || null
  const startTime = opts.startTime || Date.now()
  const year = titles._metadata?.year || ''

  // Vérifier l'abort avant de commencer
  if (isAborted(signal)) return null

  // Generer les slugs depuis tous les titres TMDB
  // Priorite: slug exact → slug+annee → mots-cles → japonais compacte
  const seenSlugs = new Set()
  const slugCandidates = []

  // Limiter la génération à 10 slugs max pour éviter la surcharge
  const MAX_GENERATED_SLUGS = 10

  for (const title of titles) {
    if (slugCandidates.length >= MAX_GENERATED_SLUGS) break
    if (isAborted(signal)) return null
    if (!title) continue
    const baseSlug = toSlug(title)
    if (!baseSlug || seenSlugs.has(baseSlug)) continue
    seenSlugs.add(baseSlug)
    slugCandidates.push(baseSlug)

    // Variante avec annee (ex: 12-hommes-en-colere-1957)
    if (year && !seenSlugs.has(baseSlug + '-' + year)) {
      seenSlugs.add(baseSlug + '-' + year)
      slugCandidates.push(baseSlug + '-' + year)
    }

    // Variantes par mots-cles distinctifs
    const words = title.split(/\s+/).filter(w => w.length >= 4)
    if (words.length >= 2) {
      const lastTwo = words.slice(-2).join('-')
      const lastTwoSlug = toSlug(lastTwo)
      if (lastTwoSlug && lastTwoSlug !== baseSlug && !seenSlugs.has(lastTwoSlug)) {
        seenSlugs.add(lastTwoSlug)
        slugCandidates.push(lastTwoSlug)
      }
      const firstThree = words.slice(0, 3).join('-')
      const firstThreeSlug = toSlug(firstThree)
      if (firstThreeSlug && firstThreeSlug !== baseSlug && !seenSlugs.has(firstThreeSlug)) {
        seenSlugs.add(firstThreeSlug)
        slugCandidates.push(firstThreeSlug)
      }
    }

    // Variante compactee pour les titres japonais
    if (title.length >= 15) {
      const parts = toSlug(title).split('-')
      const compacted = parts.reduce((acc, word, i, arr) => {
        if (word === '') return acc
        if (word.length <= 3 && i < arr.length - 1) {
          acc.push(word + arr[i + 1])
          arr[i + 1] = ''
        } else {
          acc.push(word)
        }
        return acc
      }, []).filter(Boolean).join('-')

      if (compacted && compacted !== baseSlug && !seenSlugs.has(compacted)) {
        seenSlugs.add(compacted)
        slugCandidates.push(compacted)
      }
    }

    // Variante sans article
    const withoutArticle = baseSlug.replace(/^(the|a|an)-/i, '')
    if (withoutArticle !== baseSlug && !seenSlugs.has(withoutArticle)) {
      seenSlugs.add(withoutArticle)
      slugCandidates.push(withoutArticle)
    }

    // Variante tronquee pour les slugs longs
    const slugParts = baseSlug.split('-')
    if (slugParts.length > 4) {
      const truncated = slugParts.slice(0, 4).join('-')
      if (!seenSlugs.has(truncated)) {
        seenSlugs.add(truncated)
        slugCandidates.push(truncated)
      }
      const strippedTrunc = truncated.replace(/^(the|a|an)-/i, '')
      if (strippedTrunc !== truncated && !seenSlugs.has(strippedTrunc)) {
        seenSlugs.add(strippedTrunc)
        slugCandidates.push(strippedTrunc)
      }
    }
  }

  console.log(`[Streamzo] Generated ${slugCandidates.length} slug candidate(s)`)

  // Limiter le nombre de slugs à tester pour éviter le timeout budget
  const MAX_SLUGS = 6
  const slugsToTry = slugCandidates.slice(0, MAX_SLUGS)

  // Streamzo utilise le même pattern d'URL pour les films et les séries
  // (directement à la racine: /slug, pas /series/slug)
  for (const slug of slugsToTry) {
    if (isAborted(signal) || isBudgetExhausted(startTime, PROVIDER_BUDGET_MS)) return null

    const pageUrl = `${SITE.BASE_URL}/${slug}`
    try {
      const html = await fetchText(pageUrl, { timeout: 4000, signal })
      if (html && html.length > 5000) {
        const embedUrl = extractEmbedUrl(html)
        const hasEpisodes = hasSeriesEpisodes(html)
        
        if (embedUrl || hasEpisodes) {
          const detectedType = hasEpisodes ? 'series' : 'movie'
          console.log(`[Streamzo] Found ${detectedType} page: ${pageUrl}`)
          return {
            type: detectedType,
            url: pageUrl,
            html,
            embedUrl,
            quality: extractQuality(html),
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') return null
      /* slug not found */
    }
  }

  return null
}

/**
 * Resout l'URL embed en stream video
 */
async function resolveEmbedToStream(embedUrl, quality, lang, signal) {
  // Si l'embed est relatif, ajouter le base URL
  if (isAborted(signal)) return null

  let fullEmbedUrl = embedUrl
  if (embedUrl.startsWith('/')) {
    fullEmbedUrl = `${SITE.BASE_URL}${embedUrl}`
  } else if (!embedUrl.startsWith('http')) {
    fullEmbedUrl = `${SITE.BASE_URL}/${embedUrl}`
  }

  // Fetch la page embed pour trouver l'URL video directe
  try {
    const embedHtml = await fetchText(fullEmbedUrl, { timeout: TIMEOUTS.EMBED, signal })
    if (isAborted(signal)) return null

    const directUrl = extractDirectUrl(embedHtml)

    if (directUrl) {
      // Si c'est une URL relative, la completer
      let videoUrl = directUrl
      if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl
      else if (videoUrl.startsWith('/')) videoUrl = `${SITE.BASE_URL}${videoUrl}`

      const stream = {
        name: `Streamzo (${lang})`,
        title: `Streamzo - ${quality}`,
        url: videoUrl,
        quality,
        headers: { Referer: `${SITE.BASE_URL}/`, Origin: SITE.BASE_URL },
      }

      // Resoudre le stream pour verifier s'il est direct
      const resolved = await resolveStream(stream)
      if (resolved && resolved.url && resolved.isDirect) {
        return resolved
      }
      // Si la resolution echoue, retourner le stream brut
      return stream
    }
  } catch (e) {
    if (e.name === 'AbortError') return null
    console.warn(`[Streamzo] Embed resolution failed: ${e.message}`)
  }

  return null
}

/**
 * Gere la detection de la langue depuis l'URL ou le contenu de la page
 * Streamzo est un site FR, on default en VF
 */
function detectLanguage(url, html) {
  const u = (url || '').toLowerCase()
  const h = (html || '').toLowerCase()

  if (u.includes('vostfr') || h.includes('vostfr')) return 'VOSTFR'
  if (u.includes('-vf') || h.includes('version fran')) return 'VF'

  // Streamzo est site FR → VF par defaut
  return 'VF'
}

/**
 * Extrait les streams d'un film/série sur streamzo.fr
 *
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number|string} [season]
 * @param {number|string} [episode]
 * @param {object} [options] - Options optionnelles
 * @param {AbortSignal} [options.signal] - Signal d'annulation externe
 * @returns {Promise<Array>}
 */
export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const startTime = Date.now()
  const content = await findContent(titles, mediaType, season, { signal, startTime })
  if (!content) {
    console.log(`[Streamzo] Content not found for TMDB ${tmdbId}`)
    return []
  }

  const lang = detectLanguage(content.url, content.html)
  console.log(`[Streamzo] Found ${content.type}: ${content.url}`)

  // Pour les films, utiliser l'embed directement
  if (content.type === 'movie' || mediaType === 'movie') {
    const stream = await resolveEmbedToStream(content.embedUrl, content.quality, lang, signal)
    if (stream) {
      console.log(`[Streamzo] Movie stream resolved: ${stream.quality || 'HD'}`)
      return [stream]
    }
    console.log(`[Streamzo] Movie stream resolution failed`)
    return []
  }

  // Pour les series, chercher l'episode correspondant dans les data-attributs
  if (mediaType === 'tv') {
    const episodeData = findSeriesEpisode(content.html, season, episode)
    if (episodeData) {
      if (isAborted(signal)) return []
      console.log(`[Streamzo] Found S${season}E${episode} embed (${episodeData.lang}): ${episodeData.embedUrl}`)
      const stream = await resolveEmbedToStream(episodeData.embedUrl, content.quality, episodeData.lang, signal)
      if (stream) {
        console.log(`[Streamzo] Series stream resolved: ${stream.quality || 'HD'}`)
        return [stream]
      }
    }
    console.log(`[Streamzo] Episode S${season}E${episode} not found on series page`)
  }

  return []
}
