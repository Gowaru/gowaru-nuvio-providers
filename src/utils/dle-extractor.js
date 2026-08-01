/**
 * Shared helpers for DLE-template providers (voiranime-rip, animesama-co, etc.)
 * Centralizes duplicate code between site-specific extractors.
 */
import cheerio from 'cheerio-without-node-native'
import { resolveStream, safeFetch, isBudgetExhausted, PROVIDER_BUDGET_MS } from './resolvers.js'

const ARM_API = "https://arm.haglund.dev/api/v2";
const CINEMATA_API = "https://v3-cinemeta.strem.io";

async function syncFetch(url, options = {}) {
  try {
    const res = await safeFetch(url, options);
    return res;
  } catch (e) {
    console.error(`[ArmSync] Fetch failed: ${url}`, e.message);
    return null;
  }
}

async function getImdbId(tmdbId, mediaType) {
  if (!tmdbId) return null;
  const armRes = await syncFetch(`${ARM_API}/themoviedb?id=${tmdbId}`);
  if (armRes) {
    try {
      const armJson = await armRes.json();
      const data = armJson != null ? armJson : null;
      const entry = Array.isArray(data) ? data[0] : data;
      if (entry && entry.imdb) return entry.imdb;
    } catch (e) {
      console.warn(`[ArmSync] JSON parse failed for getImdbId: ${e?.message}`);
    }
  }
  return null;
}

async function getAbsoluteEpisode(imdbId, season, episode) {
  if (!imdbId || season === 0) return null;
  const res = await syncFetch(`${CINEMATA_API}/meta/series/${imdbId}.json`);
  if (!res) return null;
  const json = await res.json();
  const data = json != null ? json : {};
  if (!data?.meta?.videos) return null;
  const episodes = data.meta.videos
    .filter(v => v.season > 0 && v.episode > 0)
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  const uniqueEpisodes = [];
  const seen = new Set();
  for (const ep of episodes) {
    const key = `${ep.season}-${ep.episode}`;
    if (!seen.has(key)) { seen.add(key); uniqueEpisodes.push(ep); }
  }
  const index = uniqueEpisodes.findIndex(v => v.season == season && v.episode == episode);
  if (index !== -1) {
    const absoluteNumber = index + 1;
    console.log(`[ArmSync] Resolved: S${season}E${episode} -> Absolute ${absoluteNumber}`);
    return absoluteNumber;
  }
  return null;
}

/**
 * Strip season suffixes from TMDB titles for better search matching.
 * e.g. "Mushoku Tensei: Jobless Reincarnation Season 1" → "Mushoku Tensei: Jobless Reincarnation"
 *      "JUJUTSU KAISEN S2" → "JUJUTSU KAISEN"
 */
export function stripSeasonSuffix(title) {
  if (!title) return title
  let cleaned = title
    .replace(/\s+(?:Season|Saison|Stagione|Temporada)\s+\d+\s*$/i, '')
    .replace(/\s+S\d+\s*$/i, '')
  return cleaned.trim() || title
}

/**
 * Convert a title into a URL-friendly slug.
 * Lowercases, removes accents, removes punctuation, replaces spaces with hyphens.
 */
export function toSlug(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]\/–—"]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

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
 * Mots "structurels" d'un titre qui ne changent pas l'identité de la série
 * (saison, partie, intégrale, film, articles...). Ils sont ignorés dans le
 * calcul des mots supplémentaires d'un résultat (pénalité anti-fan-edit).
 * Ex: requête "Naruto" vs résultat "Naruto Shippuden Kai" → mots extra =
 * [shippuden, kai] → STRONG_MATCH fortement pénalisé.
 */
export const TITLE_NOISE_WORDS = new Set([
  'saison', 'saisons', 'season', 'seasons', 'partie', 'part', 'parties', 'integrale', 'integrales',
  'vol', 'film', 'films', 'movie', 'ova', 'ona', 'special', 'specials',
  'the', 'le', 'la', 'les', 'des', 'une', 'de', 'du', 'et', 'au', 'aux',
  'vostfr', 'vost', 'vf', 'vff', 'vfq', 'vo', 'french', 'streaming',
])

/**
 * Compte les mots significatifs du résultat absents de la requête.
 * Ignore les nombres, mots courts et mots structurels (TITLE_NOISE_WORDS).
 */
export function countExtraWords(resultTitle, searchTitle) {
  const qWords = new Set((searchTitle || '').split(/\s+/).filter(w => w.length > 2))
  return (resultTitle || '').split(/\s+/).filter(w =>
    w.length > 2 && !/^\d+$/.test(w) && !TITLE_NOISE_WORDS.has(w) && !qWords.has(w)
  ).length
}

/**
 * Score a search result against the query title
 * Pénalise les mots significatifs en trop (ex: "Naruto Shippuden Kai" pour
 * une requête "Naruto" → -25/mot extra) pour éviter les fan-edits dérivées.
 */
export function scoreMatch(resultTitle, searchTitle, SCORES) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr) return 0
  if (nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) {
    const extra = countExtraWords(nr, nt)
    if (extra > 0) {
      return Math.max(SCORES.STRONG_MATCH - Math.min(extra * 25, SCORES.STRONG_MATCH - SCORES.MIN_MATCH - 5), 0)
    }
    return SCORES.STRONG_MATCH
  }
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
 *
 * @param {string} url - URL de la vidéo/iframe
 * @param {string} language - 'VF' ou 'VOSTFR'
 * @param {string} providerName - Nom du provider (ex: 'Coflix', 'Wookafr')
 * @param {string} siteUrl - URL de base du site (fallback pour Referer)
 * @param {object} [opts] - Options supplémentaires
 * @param {string} [opts.quality] - Qualité (ex: 'HD', '720p', '1080p'). Défaut 'HD'
 * @param {string} [opts.subType] - Sous-type (ex: 'anime')
 * @param {string} [opts.title] - Titre personnalisé (remplace le format par défaut)
 */
export function toStream(url, language, providerName, siteUrl, opts = {}) {
  const { quality, subType, title } = opts;
  const origin = (() => { try { return new URL(url).origin } catch { return siteUrl } })()
  const result = {
    name: `${providerName} (${language})`,
    title: title || `[${language}] ${providerName}${quality && quality !== 'HD' ? ` [${quality}]` : ''}`,
    url,
    quality: quality || 'HD',
    language,
    headers: {
      Referer: `${origin}/`,
      Origin: origin,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  }
  if (subType) result.subType = subType
  return result
}

/**
 * Résolution standardisée des épisodes cibles avec ArmSync.
 * Élimine la duplication du bloc ArmSync présent dans ~10 providers.
 *
 * @param {string|number} tmdbId
 * @param {'tv'|'movie'} mediaType
 * @param {string|number} season
 * @param {string|number} episode
 * @param {object} [opts]
 * @param {number} [opts.startTime] - Timestamp début pour budget check
 * @param {number} [opts.budgetMs=PROVIDER_BUDGET_MS] - Budget maximal
 * @returns {Promise<number[]>} [episode, absoluteEpisode?]
 */
export async function resolveTargetEpisodes(tmdbId, mediaType, season, episode, opts = {}) {
  const { startTime, budgetMs = PROVIDER_BUDGET_MS } = opts
  const epNum = parseInt(episode) || 1
  if (mediaType !== 'tv' || !tmdbId || !season) return [epNum]

  const episodes = [epNum]

  if (startTime != null && isBudgetExhausted(startTime, budgetMs)) return episodes

  try {
    const imdbId = await getImdbId(tmdbId, mediaType)
    if (imdbId && (startTime == null || !isBudgetExhausted(startTime, budgetMs))) {
      const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, epNum)
      if (absoluteEpisode && absoluteEpisode !== epNum) {
        episodes.push(absoluteEpisode)
      }
    }
  } catch (e) {
    console.warn(`[ArmSync] Failed: ${e.message}`)
  }

  return episodes
}

/**
 * Extract origin from a URL with a fallback.
 */
export function getUrlOrigin(url, fallback) {
  try { return new URL(url).origin } catch { return fallback || '' }
}

/**
 * Normalize a language tag to canonical form.
 * Handles: vf, vff, vfq, vostfr, vost, vo, default, multi
 */
export function normalizeLangTag(lang) {
  const l = (lang || '').toLowerCase();
  if (l === 'vff' || l === 'vfq' || l === 'vf' || l.includes('french')) return 'VF';
  if (l === 'vostfr' || l === 'vost' || l.includes('vostfr')) return 'VOSTFR';
  if (l === 'default' || l === 'multi') return 'MULTI';
  if (l === 'vo') return 'VO';
  return (lang || 'VF').toUpperCase();
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
