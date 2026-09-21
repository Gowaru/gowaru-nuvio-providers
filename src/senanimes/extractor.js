/**
 * Extractor for SenAnimes (senanimes.com — SPA Next.js 15, diag live 2026-09).
 *
 * Chaîne réelle (toutes les étapes prouvées en live) :
 *   1. Catalogue : GET /api/catalogue → 150 items fixes {slug,title,type,
 *      language(VF|VOSTFR),year,...} + trending[]. Le paramètre q est IGNORÉ
 *      côté serveur (filtre client) — la recherche se fait par scoring local.
 *   2. Fiche : GET /anime/{slug} (SSR). Le flight data + JSON-LD contiennent
 *      containsSeason : chaque entrée porte name="Saison X" (numérotation
 *      TMDB) et seasonNumber=N (numérotation INTERNE du site, potentiellement
 *      INVERSÉE — AOT : interne-1 = vraie S4, interne-4 = vraie S1).
 *   3. Résolution : GET /api/episode/source?slug={slug}&season={interne}
 *      &episode={N}&fields=url (Referer senanimes.com obligatoire, sans auth)
 *      → {"url":"https://cdn.senanimes.com/api/v/{token}/episode.m3u8",
 *         "type":"hls"|"progressive"}.
 *      Fallback si 404 : page /watch/{slug}/s{interne}e{N} → la props de
 *      l'épisode COURANT porte hlsUrl+embedUrl="ref:slug/{s}/{e}" → on
 *      ré-interroge l'API avec ce couple.
 *   4. Les clés r2:animes/{Titre}/Saison NN/{Titre} - S{SS}E{NNN}/index.m3u8
 *      passent par /api/video/signed-url (réservé premium → hors provider).
 *
 * Pièges gérés :
 *  - rate-limit agressif : 1 seule résolution API par épisode + retries espacés ;
 *  - Referer obligatoire sur /api/* ({"error":"origine-refusee"} sinon) ;
 *  - le manifest m3u8 du CDN est rate-limité (error 1027) → on NE le
 *    télécharge PAS : type=hls|progressive est fourni par l'API, l'app
 *    résout le manifest (expandStreamQualities, cap 12 s) ;
 *  - langue : 1 seule par titre (VF|VOSTFR) — le label va dans le titre,
 *    le code normalisé dans language ;
 *  - garde anti-homonymes stricte (hasForeignLeadingTokens).
 */
import { fetchPage, fetchApi, cdnHeaders, sleep } from './http.js'
import {
  resolveStream,
  isAborted,
  isBudgetExhausted,
  normalizeLanguageCode,
} from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { normalize, scoreMatch, hasForeignLeadingTokens } from '../utils/dle-extractor.js'

const PROVIDER = 'SenAnimes'
const BUDGET_MS = 42000
const MIN_MATCH = 40

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────────

let _catalogueCache = null
let _catalogueTs = 0
const CATALOGUE_TTL = 10 * 60 * 1000

async function getCatalogue(signal) {
  if (_catalogueCache && Date.now() - _catalogueTs < CATALOGUE_TTL) return _catalogueCache
  const data = await fetchApi('/api/catalogue', { signal })
  if (!data || !Array.isArray(data.items)) return null
  _catalogueCache = data
  _catalogueTs = Date.now()
  return data
}

/**
 * Score un item du catalogue contre un titre TMDB (normalisé).
 * Exact = 120 ; préfixe ordonné = 90 ; sous-chaîne = 70 (avec garde) ;
 * tokens communs pondérés. La garde rejette les homonymes avant la requête.
 */
function scoreCatalogueItem(item, queryNorm) {
  const nTitle = normalize(item.title || '')
  const nSlug = normalize((item.slug || '').replace(/-/g, ' '))
  if (!nTitle && !nSlug) return 0
  if (nTitle === queryNorm || nSlug === queryNorm) return 120
  let score = 0
  for (const n of [nTitle, nSlug]) {
    if (!n) continue
    if (hasForeignLeadingTokens(n, queryNorm)) continue
    if (n === queryNorm) return Math.max(score, 120)
    if (n.startsWith(queryNorm + ' ')) score = Math.max(score, 95)
    else if (queryNorm.startsWith(n + ' ')) score = Math.max(score, 85)
    else if (n.includes(queryNorm) || queryNorm.includes(n)) score = Math.max(score, 70)
    const qWords = queryNorm.split(/\s+/).filter(w => w.length > 2)
    const nWords = new Set(n.split(/\s+/))
    const matched = qWords.filter(w => nWords.has(w)).length
    if (qWords.length >= 2 && matched < 2) continue
    score = Math.max(score, Math.round((matched / Math.max(qWords.length, 1)) * 60))
  }
  return score
}

/**
 * Trouve le meilleur item du catalogue pour une liste de titres TMDB.
 * Retourne { item, score } ou null.
 */
async function findInCatalogue(titles, signal) {
  const catalogue = await getCatalogue(signal)
  if (!catalogue) return null
  const items = catalogue.items || []
  const candidates = (titles || []).filter(Boolean).slice(0, 5)
  let best = null
  let bestScore = 0
  for (const item of items) {
    for (const title of candidates) {
      const s = scoreCatalogueItem(item, normalize(title))
      if (s > bestScore) {
        bestScore = s
        best = item
      }
    }
  }
  if (best && bestScore >= MIN_MATCH) return { item: best, score: bestScore }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping des saisons (JSON-LD containsSeason de la fiche)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse le mapping {saison affichée → saison interne} depuis le HTML de la
 * fiche. Les données apparaissent deux fois : JSON-LD réel et flight data
 * échappé (\\"). Le regex tolère les deux.
 * Retourne { map: {1: n1, 2: n2, ...}, counts: {1: eps, ...} } ou null.
 */
export function parseSeasonMap(html) {
  if (!html) return null
  const map = {}
  const counts = {}
  const re = /seasonNumber\\?"\s*:\s*(\d+)\s*,\\?"name\\?"\s*:\s*"Saison\s*(\d+)[^}]*?numberOfEpisodes\\?"\s*:\s*(\d+)/g
  let m
  while ((m = re.exec(html)) !== null) {
    const internal = parseInt(m[1], 10)
    const display = parseInt(m[2], 10)
    map[display] = internal
    counts[display] = parseInt(m[3], 10)
  }
  if (Object.keys(map).length === 0) return null
  return { map, counts }
}

async function getSeasonMap(slug, signal) {
  const html = await fetchPage(`${BASE_URL}/anime/${slug}`, { signal })
  if (!html) return null
  return parseSeasonMap(html) || { map: {}, counts: {} }
}

const BASE_URL = 'https://senanimes.com'

// ─────────────────────────────────────────────────────────────────────────────
// Résolution de source
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appelle /api/episode/source pour un couple (slug, saison interne, épisode).
 * Retourne { url, type } ou null.
 */
async function resolveSource(slug, season, episode, signal) {
  const data = await fetchApi(
    `/api/episode/source?slug=${encodeURIComponent(slug)}&season=${season}&episode=${episode}&fields=url`,
    { signal }
  )
  if (!data || data.error || !data.url) return null
  return { url: data.url, type: data.type || 'hls' }
}

/**
 * Fallback : page watch → ref de l'épisode courant (hlsUrl + embedUrl
 * identiques dans la props de l'épisode demandé) → re-résolution API.
 */
function extractCurrentRef(html, slug, season, episode) {
  if (!html) return null
  // L'épisode courant porte embedUrl="ref:slug/s/e" (les autres non).
  const re = new RegExp(
    `embedUrl\\\\?"\\s*:\\s*"ref:${slug}/${season}/${episode}`,
    'i'
  )
  if (re.test(html)) return { season, episode }
  // Variante : le premier ref:slug/{s}/{e} de la page qui matche la saison
  const m = html.match(new RegExp(`ref:${slug}/(\\d+)/(\\d+)`, 'i'))
  if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) }
  return null
}

async function resolveEpisode(slug, seasonMap, displaySeason, episode, mediaType, signal) {
  // 1. Saison interne via mapping (séries multi-saisons à numérotation inversée)
  let internalSeason = displaySeason
  let expectedCount = null
  if (mediaType !== 'movie' && seasonMap && seasonMap.map && seasonMap.map[displaySeason]) {
    internalSeason = seasonMap.map[displaySeason]
    expectedCount = seasonMap.counts[displaySeason] || null
    // Épisode hors plage → évite les faux positifs (404 silencieux)
    if (expectedCount && episode > expectedCount + 2) return null
  }
  // 2. Résolution directe API
  let source = await resolveSource(slug, internalSeason, episode, signal)
  if (source) return source
  // 3. Fallback : page watch (307 redirect suivi) → ref courant → re-API
  const watchPath =
    mediaType === 'movie'
      ? `/watch/${slug}/1`
      : `/watch/${slug}/s${internalSeason}e${episode}`
  const html = await fetchPage(`${BASE_URL}${watchPath}`, { signal })
  const ref = extractCurrentRef(html, slug, internalSeason, episode)
  if (!ref) return null
  if (ref.season !== internalSeason || ref.episode !== episode) {
    await sleep(1500)
    source = await resolveSource(slug, ref.season, ref.episode, signal)
    if (source) return source
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  const startTime = Date.now()

  const titles = await getTmdbTitles(tmdbId, mediaType === 'movie' ? 'movie' : 'tv', { season })
  if (!titles || titles.length === 0) {
    console.log(`[${PROVIDER}] No TMDB titles for ${tmdbId}`)
    return []
  }
  console.log(`[${PROVIDER}] Titles: ${titles.slice(0, 3).join(' | ')}`)

  const found = await findInCatalogue(titles, signal)
  if (!found) {
    console.log(`[${PROVIDER}] Not in catalogue: ${tmdbId}`)
    return []
  }
  const { item } = found
  const slug = item.slug
  console.log(`[${PROVIDER}] Match: "${item.title}" (${slug}, ${item.language}, type=${item.type}) → ${BASE_URL}/anime/${slug}`)

  const isMovie = mediaType === 'movie' || item.type === 'movie'
  const displaySeason = isMovie ? 1 : parseInt(season, 10) || 1
  const displayEpisode = isMovie ? 1 : parseInt(episode, 10) || 1

  // Mapping des saisons (obligatoire pour les séries : la numérotation
  // interne peut être inversée — cf. AOT)
  let seasonMap = null
  if (!isMovie) {
    seasonMap = await getSeasonMap(slug, signal)
    if (seasonMap && Object.keys(seasonMap.map).length > 1) {
      console.log(`[${PROVIDER}] Season map (display→internal): ${JSON.stringify(seasonMap.map)}`)
    }
    if (isBudgetExhausted(startTime, BUDGET_MS)) return []
  }

  const source = await resolveEpisode(slug, seasonMap, displaySeason, displayEpisode, isMovie ? 'movie' : 'series', signal)
  if (!source || !source.url) {
    console.log(`[${PROVIDER}] No source for S${displaySeason}E${displayEpisode}`)
    return []
  }
  console.log(`[${PROVIDER}] Source OK (${source.type}): ${source.url.slice(0, 70)}...`)

  // Stream final — PAS de fetch du manifest CDN (rate-limit 1027) :
  // type hls/progressive est déjà connu, l'app résout la qualité.
  const langLabel = (item.language || 'VF').toUpperCase()
  const langCode = normalizeLanguageCode(langLabel) || 'fr'
  const baseStream = {
    name: `${PROVIDER} (${langLabel})`,
    title: `${PROVIDER} [${langLabel}] ${isMovie ? '' : `S${displaySeason}E${displayEpisode} `}- ${item.title}`.trim(),
    url: source.url,
    quality: source.type === 'progressive' ? 'HD' : 'HLS',
    language: langCode,
    headers: cdnHeaders(),
    type: source.type === 'progressive' ? 'mp4' : 'hls',
  }

  // resolveStream : normalisation + comportement standard du repo
  try {
    const resolved = await resolveStream(baseStream, 0)
    if (resolved && resolved.url) {
      const { isDirect, originalUrl, ...clean } = resolved
      return [{ ...baseStream, ...clean, provider: PROVIDER }]
    }
  } catch (e) {
    if (isAborted(signal)) throw e
    console.log(`[${PROVIDER}] resolveStream failed: ${e.message} — serving raw URL`)
  }
  return [{ ...baseStream, provider: PROVIDER }]
}
