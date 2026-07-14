import { fetchText } from './http.js'
import { SITE, TIMEOUTS } from './config.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { resolveStream } from '../utils/resolvers.js'
import { toSlug } from '../utils/dle-extractor.js'

/**
 * Extrait l'URL embed depuis la page d'un film
 * La page contient: <iframe id="video-frame" src="/embed/sharecloudy.com/ID">
 */
function extractEmbedUrl(html) {
  if (!html) return null

  // Pattern 1: iframe#video-frame
  const iframeMatch = html.match(/<iframe[^>]*id=["']video-frame["'][^>]*src=["']([^"']+)["']/i)
  if (iframeMatch) return iframeMatch[1]

  // Pattern 2: any iframe with src containing /embed/
  const embedMatch = html.match(/<iframe[^>]*src=["']([^"']*\/embed\/[^"']+)["']/i)
  if (embedMatch) return embedMatch[1]

  // Pattern 3: #player container with iframe inside
  // Note: [\\s\\S]*? au lieu de .*? avec flag s pour compatibilité QuickJS (ES2020)
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
 */
async function findContent(titles, mediaType, season) {
  const year = titles._metadata?.year || ''

  // Generer les slugs depuis tous les titres TMDB
  // Priorite: slug exact → slug+annee → mots-cles → japonais compacte
  const seenSlugs = new Set()
  const slugCandidates = []

  for (const title of titles) {
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
    // Extraire 2-3 mots longs (>=4 lettres) du milieu/fin du titre
    const words = title.split(/\s+/).filter(w => w.length >= 4)
    if (words.length >= 2) {
      // Prendre les 2 derniers mots longs (souvent les plus distinctifs)
      const lastTwo = words.slice(-2).join('-')
      const lastTwoSlug = toSlug(lastTwo)
      if (lastTwoSlug && lastTwoSlug !== baseSlug && !seenSlugs.has(lastTwoSlug)) {
        seenSlugs.add(lastTwoSlug)
        slugCandidates.push(lastTwoSlug)
      }
      // Prendre les 3 premiers mots longs (titre principal)
      const firstThree = words.slice(0, 3).join('-')
      const firstThreeSlug = toSlug(firstThree)
      if (firstThreeSlug && firstThreeSlug !== baseSlug && !seenSlugs.has(firstThreeSlug)) {
        seenSlugs.add(firstThreeSlug)
        slugCandidates.push(firstThreeSlug)
      }
    }

    // Variante compactee pour les titres japonais
    // Ex: "San Shimai" → "sanshimai" (mots courts colles au suivant)
    // Note: gere les mots courts sequentiels et les mots courts en fin de chaine
    if (title.length >= 15) {
      const parts = toSlug(title).split('-')
      const compacted = parts.reduce((acc, word, i, arr) => {
        if (word === '') return acc // deja combine
        if (word.length <= 3 && i < arr.length - 1) {
          acc.push(word + arr[i + 1])
          arr[i + 1] = '' // marquer comme combine
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

    // Variante sans article (the/a/an) en prefixe
    // Ex: "the-worlds-strongest-rearguard" → "worlds-strongest-rearguard"
    const withoutArticle = baseSlug.replace(/^(the|a|an)-/i, '')
    if (withoutArticle !== baseSlug && !seenSlugs.has(withoutArticle)) {
      seenSlugs.add(withoutArticle)
      slugCandidates.push(withoutArticle)
    }

    // Variante tronquee pour les slugs longs (>4 mots)
    // Ex: "the-worlds-strongest-rearguard-labyrinth" → "the-worlds-strongest-rearguard"
    const slugParts = baseSlug.split('-')
    if (slugParts.length > 4) {
      const truncated = slugParts.slice(0, 4).join('-')
      if (!seenSlugs.has(truncated)) {
        seenSlugs.add(truncated)
        slugCandidates.push(truncated)
      }
      // Aussi sans article si applicable
      const strippedTrunc = truncated.replace(/^(the|a|an)-/i, '')
      if (strippedTrunc !== truncated && !seenSlugs.has(strippedTrunc)) {
        seenSlugs.add(strippedTrunc)
        slugCandidates.push(strippedTrunc)
      }
    }
  }

  console.log(`[Streamzo] Generated ${slugCandidates.length} slug candidate(s)`)

  // Ne tester que le pattern correspondant au mediaType
  if (mediaType === 'movie') {
    for (const slug of slugCandidates) {
      const movieUrl = `${SITE.BASE_URL}/${slug}`
      try {
        const html = await fetchText(movieUrl, { timeout: 6000 })
        if (html && html.length > 5000) {
          const embedUrl = extractEmbedUrl(html)
          if (embedUrl) {
            console.log(`[Streamzo] Found movie page: ${movieUrl}`)
            return {
              type: 'movie',
              url: movieUrl,
              html,
              embedUrl,
              quality: extractQuality(html),
            }
          }
        }
      } catch (e) { /* slug not found */ }
    }
  } else if (mediaType === 'tv') {
    for (const slug of slugCandidates) {
      const seriesUrl = `${SITE.BASE_URL}/series/${slug}`
      try {
        const html = await fetchText(seriesUrl, { timeout: 6000 })
        if (html && html.length > 5000) {
          // Les pages séries peuvent avoir:
          //  - Soit un iframe direct (cas rare)
          //  - Soit des <button class="sd-ep"> avec data-src
          const embedUrl = extractEmbedUrl(html)
          const hasEpisodes = hasSeriesEpisodes(html)
          if (embedUrl || hasEpisodes) {
            console.log(`[Streamzo] Found series page: ${seriesUrl}`)
            return {
              type: 'series',
              url: seriesUrl,
              html,
              embedUrl,
              quality: extractQuality(html),
            }
          }
        }
      } catch (e) { /* slug not found */ }
    }
  }

  return null
}

/**
 * Resout l'URL embed en stream video
 */
async function resolveEmbedToStream(embedUrl, quality, lang) {
  // Si l'embed est relatif, ajouter le base URL
  let fullEmbedUrl = embedUrl
  if (embedUrl.startsWith('/')) {
    fullEmbedUrl = `${SITE.BASE_URL}${embedUrl}`
  } else if (!embedUrl.startsWith('http')) {
    fullEmbedUrl = `${SITE.BASE_URL}/${embedUrl}`
  }

  // Fetch la page embed pour trouver l'URL video directe
  try {
    const embedHtml = await fetchText(fullEmbedUrl, { timeout: TIMEOUTS.EMBED })
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

export async function extractStreams(tmdbId, mediaType, season, episode) {
  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) {
    console.log(`[Streamzo] No titles found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Streamzo] Searching for ${mediaType} ${tmdbId}`)

  // Chercher le contenu sur streamzo.fr
  const content = await findContent(titles, mediaType, season)
  if (!content) {
    console.log(`[Streamzo] Content not found for TMDB ${tmdbId}`)
    return []
  }

  const lang = detectLanguage(content.url, content.html)
  console.log(`[Streamzo] Found ${content.type}: ${content.url}`)

  // Pour les films, utiliser l'embed directement
  if (content.type === 'movie' || mediaType === 'movie') {
    const stream = await resolveEmbedToStream(content.embedUrl, content.quality, lang)
    if (stream) {
      console.log(`[Streamzo] Movie stream resolved: ${stream.quality || 'HD'}`)
      return [stream]
    }
    console.log(`[Streamzo] Movie stream resolution failed`)
    return []
  }

  // Pour les series, chercher l'episode correspondant dans les data-attributs
  // Les pages séries contiennent: <button class="sd-ep" data-season="N" data-lang="..." data-ep="N" data-src="/embed/...">
  if (mediaType === 'tv') {
    const episodeData = findSeriesEpisode(content.html, season, episode)
    if (episodeData) {
      console.log(`[Streamzo] Found S${season}E${episode} embed (${episodeData.lang}): ${episodeData.embedUrl}`)
      const stream = await resolveEmbedToStream(episodeData.embedUrl, content.quality, episodeData.lang)
      if (stream) {
        console.log(`[Streamzo] Series stream resolved: ${stream.quality || 'HD'}`)
        return [stream]
      }
    }
    console.log(`[Streamzo] Episode S${season}E${episode} not found on series page`)
  }

  return []
}
