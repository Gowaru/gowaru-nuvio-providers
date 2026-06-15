/**
 * Extractor for Coflix (coflix.cymru)
 * DLE-based site with film pages at /film/{slug}/ and episode pages at /episode/{slug}-{season}x{episode}/
 * Uses iframe embed from lecteurvideo.com for streaming
 */

import { stripSeasonSuffix } from '../utils/dle-extractor.js'
import { fetchText } from './http.js'
import { resolveStream } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'

const BASE_URL = 'https://coflix.cymru'
const PAGE_TIMEOUT = 6000
const CACHE_TTL = 120_000
const cache = new Map()

function cached(key, fn) {
  const now = Date.now()
  if (cache.has(key) && now - cache.get(key).ts < CACHE_TTL) return cache.get(key).data
  return fn().then(data => { cache.set(key, { data, ts: now }); return data })
}

function toSlug(title) {
  const clean = stripSeasonSuffix(title)
  return clean
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function extractIframeUrl(html) {
  if (!html) return null

  const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  if (iframeMatch) {
    let src = iframeMatch[1]
    if (src.startsWith('//')) src = 'https:' + src
    if (src.includes('lecteurvideo.com') || (src.startsWith('http') && !src.includes('youtube') && !src.includes('googlevideo'))) {
      return src
    }
  }

  const lvMatch = html.match(/https:\/\/lecteurvideo\.com\/\?get=[^"'\s]+/)
  if (lvMatch) return lvMatch[0]

  const dataSrcMatch = html.match(/data-src=["']([^"']*lecteurvideo[^"']*)["']/i)
  if (dataSrcMatch) return dataSrcMatch[1]

  return null
}

function extractLanguage(html, url) {
  if (!html) return 'VF'
  const lower = html.toLowerCase()
  const urlLower = url.toLowerCase()

  if (urlLower.includes('vostfr')) return 'VOSTFR'
  if (urlLower.includes('-vf') || urlLower.includes('/vf/')) return 'VF'

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  if (titleMatch) {
    const t = titleMatch[1].toLowerCase()
    if (t.includes('vostfr')) return 'VOSTFR'
    if (t.includes(' vf ') || / vf[^a-z]/.test(t)) return 'VF'
  }

  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/)
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1])
      const name = (ld.name || ld.title || '').toLowerCase()
      if (name.includes('vostfr')) return 'VOSTFR'
      if (name.includes(' vf ')) return 'VF'
    } catch {}
  }

  if (/vostfr/i.test(lower)) return 'VOSTFR'
  return 'VF'
}

function extractEpisodeNumber(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  if (titleMatch) {
    const t = titleMatch[1]
    const epMatch = t.match(/(\d+)x(\d+)/i) || t.match(/[Ss](\d+)[Ee](\d+)/)
    if (epMatch) return { season: parseInt(epMatch[1]), episode: parseInt(epMatch[2]) }
  }
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/)
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1])
      const name = ld.name || ''
      const epMatch = name.match(/(\d+)x(\d+)/i) || name.match(/[Ss](\d+)[Ee](\d+)/)
      if (epMatch) return { season: parseInt(epMatch[1]), episode: parseInt(epMatch[2]) }
    } catch {}
  }
  return null
}

function generateSlugCandidates(title, season) {
  const base = toSlug(title)
  const candidates = []

  candidates.push(base)
  if (base.startsWith('the-')) candidates.push(base.slice(4))

  if (season) {
    candidates.push(`${base}-s${season}`)
    candidates.push(`${base}-saison-${season}`)
  }

  return [...new Set(candidates.filter(Boolean))]
}

async function probeMovie(slug) {
  return cached(`movie_${slug}`, async () => {
    const patterns = [`/film/${slug}/`, `/movie/${slug}/`]
    for (const path of patterns) {
      const url = `${BASE_URL}${path}`
      try {
        const html = await fetchText(url, { timeout: PAGE_TIMEOUT })
        if (html && html.length > 200) {
          const iframeUrl = extractIframeUrl(html)
          if (iframeUrl) {
            console.log(`[Coflix] Found movie at: ${url}`)
            return { url: iframeUrl, lang: extractLanguage(html, url), headers: { Referer: `${BASE_URL}/`, Origin: BASE_URL } }
          }
        }
      } catch {}
    }
    return null
  })
}

async function probeEpisode(slug, season, episode) {
  const cacheKey = `ep_${slug}_${season}_${episode}`
  return cached(cacheKey, async () => {
    const patterns = [
      `${slug}-${season}x${episode}`,
      `${slug}-s${season}e${episode}`,
      `${slug}-saison-${season}-episode-${episode}`,
    ]

    for (const pattern of [...new Set(patterns)]) {
      const url = `${BASE_URL}/episode/${pattern}/`
      try {
        const html = await fetchText(url, { timeout: PAGE_TIMEOUT })
        if (html && html.length > 100) {
          const pageEp = extractEpisodeNumber(html)
          if (pageEp && pageEp.season === season && pageEp.episode === episode) {
            console.log(`[Coflix] Found episode (validated): ${url}`)
          } else if (pageEp && Math.abs((pageEp.episode || 0) - episode) > 1) {
            continue
          }

          const iframeUrl = extractIframeUrl(html)
          if (iframeUrl) {
            return { url: iframeUrl, lang: extractLanguage(html, url), headers: { Referer: `${BASE_URL}/`, Origin: BASE_URL } }
          }
        }
      } catch {}
    }
    return null
  })
}

function toStream(embedUrl, language) {
  return {
    name: 'Coflix',
    title: `[${language}] Coflix`,
    url: embedUrl,
    quality: 'HD',
    language,
    headers: {
      Referer: `${BASE_URL}/`,
      Origin: BASE_URL,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  }
}

export async function extractStreams(tmdbId, mediaType, season, episode) {
  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeason = parseInt(effectiveSeason) || 1
  const targetEpisode = parseInt(episode) || 1

  // Movies: probe /film/{slug}/
  if (mediaType === 'movie') {
    for (const title of titles.slice(0, 3)) {
      const slug = toSlug(title)
      const result = await probeMovie(slug)
      if (result) {
        const stream = toStream(result.url, result.lang)
        const resolved = await resolveStream(stream)
        if (resolved && resolved.url) return [{ ...resolved, provider: 'coflix' }]
        return [{ ...stream, provider: 'coflix', type: 'embed' }]
      }
    }
    console.log(`[Coflix] No movie match for ${tmdbId}`)
    return []
  }

  // TV series: probe /episode/{slug}-{season}x{episode}/
  for (const title of titles.slice(0, 4)) {
    const candidates = generateSlugCandidates(title, targetSeason)
    for (const slug of candidates) {
      const result = await probeEpisode(slug, targetSeason, targetEpisode)
      if (result) {
        const stream = toStream(result.url, result.lang)
        const resolved = await resolveStream(stream)
        if (resolved && resolved.url) return [{ ...resolved, provider: 'coflix' }]
        return [{ ...stream, provider: 'coflix', type: 'embed' }]
      }
    }
  }

  console.log(`[Coflix] No match found for ${tmdbId} (${mediaType})`)
  return []
}
