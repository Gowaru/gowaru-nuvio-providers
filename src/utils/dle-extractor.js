/**
 * Shared helpers for DLE-template providers (voiranime-rip, animesama-co, etc.)
 * Centralizes duplicate code between site-specific extractors.
 */
import cheerio from 'cheerio-without-node-native'
import { resolveStream, safeFetch } from './resolvers.js'

/**
 * Normalize a string for matching (lowercase, no accents, no punctuation)
 */
export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]\/-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Simple time-based cache
 */
const CACHE = new Map()

export function cached(key, fn, ttl) {
  const now = Date.now()
  if (CACHE.has(key) && now - CACHE.get(key).ts < ttl) return CACHE.get(key).data
  return fn().then(data => { CACHE.set(key, { data, ts: now }); return data })
}

/**
 * Score a search result against the query title
 */
export function scoreMatch(resultTitle, searchTitle, SCORES) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr) return 0
  if (nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) return SCORES.STRONG_MATCH
  const words = nt.split(/\s+/).filter(w => w.length > 2)
  const rWords = new Set(nr.split(/\s+/))
  const matched = words.filter(w => rWords.has(w)).length
  if (words.length > 0) return Math.round((matched / words.length) * 50)
  return 0
}

/**
 * Resolve a stream with a short timeout wrapper
 */
export async function resolveWithTimeout(stream) {
  try {
    const resolved = await resolveStream(stream)
    if (resolved && resolved.url) {
      if (resolved.isDirect) return resolved
      return { ...resolved, isDirect: true }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Detect if content is anime by TMDB genre 16
 */
export async function detectSubType(tmdbId, mediaType) {
  const apiKey = '8265bd1679663a7ea12ac168da84d2e8'
  const type = mediaType === 'movie' ? 'movie' : 'tv'
  try {
    const details = await cached(`tmdb_subtype_${tmdbId}_${mediaType}`, async () => {
      const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}&language=en-US`
      const res = await safeFetch(url)
      if (!res || !res.ok) return null
      const text = await res.text()
      return JSON.parse(text)
    }, 300000)
    if (!details) return null
    const genres = (details.genres || []).map(g => g.id)
    if (genres.includes(16)) return 'anime'
    return null
  } catch {
    return null
  }
}

/**
 * Create a standard stream object
 */
export function toStream(url, language, providerName, siteUrl) {
  return {
    name: `${providerName} (${language})`,
    title: `[${language}] ${providerName}`,
    url,
    quality: 'HD',
    language,
    headers: {
      Referer: `${siteUrl}/`,
      Origin: siteUrl,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  }
}

/**
 * Parse available seasons from a series page HTML
 * @param {string} html - Series page HTML
 * @param {RegExp} pattern - Regex to extract season numbers (e.g. /\/saison-(\d+)\//g)
 */
export function parseAvailableSeasons(html, pattern) {
  if (!html) return []
  const seasons = new Set()
  const regex = new RegExp(pattern.source, 'g')
  let m
  while ((m = regex.exec(html)) !== null) {
    seasons.add(parseInt(m[1]))
  }
  return [...seasons].sort((a, b) => a - b)
}
