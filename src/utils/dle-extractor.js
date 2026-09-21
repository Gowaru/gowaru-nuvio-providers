/**
 * Shared helpers for DLE-template providers (voiranime-rip, animesama-co, etc.)
 * Centralizes duplicate code between site-specific extractors.
 */
import cheerio from 'cheerio-without-node-native'
import { resolveStream, safeFetch, isBudgetExhausted, PROVIDER_BUDGET_MS, normalizeLanguageCode } from './resolvers.js'

const ARM_API = "https://arm.haglund.dev/api/v2";
const CINEMATA_API = "https://v3-cinemeta.strem.io";
// Dupliquées de metadata.js (non exportées) — utilisées par
// getAbsoluteEpisodeFromTmdb pour le fallback d'épisode absolu.
const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

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

/**
 * Referme un JSON tronqué à l'index donné, en équilibrant les crochets/acco-
 * lades encore ouverts (les chaînes sont ignorées).
 */
function closeTruncatedJson(text, endIndex) {
  const slice = text.slice(0, endIndex + 1);
  const stack = [];
  let inStr = false;
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '[') stack.push(']');
    else if (c === '{') stack.push('}');
    else if (c === ']' || c === '}') stack.pop();
  }
  let out = slice;
  while (stack.length) out += stack.pop();
  return out;
}

/**
 * Parse un JSON potentiellement tronqué par la limite runtime (1 Mo).
 * Indispensable pour les très longues séries : le meta cinemeta de One Piece
 * fait ~1,36 Mo, donc JSON.parse échoue et l'ArmSync était totalement inopé-
 * rant (épisodes absolus indisponibles → mauvais épisode servi).
 */
function parseMaybeTruncatedJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { /* réponse tronquée */ }
  for (let end = text.lastIndexOf('}'); end > 0; end = text.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(closeTruncatedJson(text, end)); } catch (e) { continue; }
  }
  return null;
}

/**
 * Épisode absolu via la structure saisonnière TMDB (autorité sur la
 * numérotation envoyée par l'app, qui vient de TMDB).
 *
 * cinemeta regroupe les anime par arcs à la TVDB : pour One Piece, son « S2E1 »
 * vaut l'épisode 9 alors que TMDB (et les sites FR) le numérotent 62. Utiliser
 * cinemeta produisait donc systématiquement le mauvais épisode sur les longues
 * séries.
 */
async function getAbsoluteEpisodeFromTmdb(tmdbId, season, episode) {
  const targetSeason = parseInt(season, 10);
  const targetEpisode = parseInt(episode, 10);
  if (!tmdbId || !targetSeason || targetSeason <= 0) return null;

  const res = await syncFetch(`${TMDB_API_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`);
  if (!res) return null;
  const data = parseMaybeTruncatedJson(await res.text());
  const seasons = data && Array.isArray(data.seasons) ? data.seasons : null;
  if (!seasons) return null;

  let total = 0;
  for (const s of seasons) {
    const n = parseInt(s && s.season_number, 10);
    if (!isFinite(n) || n <= 0) continue; // saison 0 = spéciaux
    if (n === targetSeason) {
      const absolute = total + targetEpisode;
      console.log(`[ArmSync] TMDB: S${targetSeason}E${targetEpisode} -> Absolute ${absolute}`);
      return absolute;
    }
    if (n < targetSeason) total += parseInt(s.episode_count, 10) || 0;
  }
  return null;
}

/**
 * Reverse-map d'un numéro d'épisode absolu vers (saison, épisode) TMDB.
 * Utilisé quand l'app TV envoie season=null + numéro absolu (IDs anime
 * kitsu:/mal:/anilist:) : les providers à pages par saison ont besoin du
 * couple (S,E) pour chercher la bonne page.
 *
 * @returns {Promise<{season:number, episode:number}|null>}
 */
export async function getSeasonEpisodeFromAbsolute(tmdbId, absoluteEpisode) {
  if (!tmdbId || !absoluteEpisode || absoluteEpisode <= 0) return null;
  try {
    const res = await syncFetch(`${TMDB_API_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`);
    if (!res) return null;
    const data = parseMaybeTruncatedJson(await res.text());
    const seasons = data && Array.isArray(data.seasons) ? data.seasons : null;
    if (!seasons) return null;
    let total = 0;
    for (const s of seasons) {
      const n = parseInt(s && s.season_number, 10);
      if (!isFinite(n) || n <= 0) continue; // saison 0 = spéciaux
      const count = parseInt(s.episode_count, 10) || 0;
      if (absoluteEpisode <= total + count) {
        return { season: n, episode: absoluteEpisode - total };
      }
      total += count;
    }
  } catch (e) {
    console.warn(`[ArmSync] Reverse-map failed: ${e.message}`);
  }
  return null;
}

async function getAbsoluteEpisode(imdbId, season, episode) {
  if (!imdbId || season === 0) return null;
  const res = await syncFetch(`${CINEMATA_API}/meta/series/${imdbId}.json`);
  if (!res) return null;
  const data = parseMaybeTruncatedJson(await res.text()) || {};
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

// Tokens génériques non discriminants (années, suffixes qualité/serveur,
// numéros) — utilisés par la garde anti-homonymes pour ignorer un token
// étranger sans valeur sémantique (ex: "the-new-gate-2024" pour "Gate").
export const GENERIC_TOKENS = new Set([
  ...TITLE_NOISE_WORDS,
  'hd', 'hd1', 'hd2', 'hd3', 'hd4', 'sd', 'fhd', '4k',
  'saison', 'season', 'episode', 'partie', 'part',
  '2020', '2021', '2022', '2023', '2024', '2025', '2026',
])

/**
 * Tokens du résultat absents de la requête (brut, sans filtrage).
 * Utilisé par la garde anti-homonymes sur les positions AVANT la requête.
 */
export function extraTokens(resultTitle, searchTitle) {
  const qWords = new Set((searchTitle || '').split(/\s+/).filter(Boolean))
  return (resultTitle || '').split(/\s+/).filter(w => w && !qWords.has(w))
}

/**
 * Compte les mots significatifs du résultat absents de la requête.
 * Ignore les nombres, mots courts et mots structurels (TITLE_NOISE_WORDS).
 * NB : les positions ne sont PAS distinguées — un homonyme
 * ("the-new-gate" pour "gate") compte autant qu'un sous-titre légitime
 * ("gate - au-delà de la porte") ; la garde positionnelle est faite par
 * hasForeignLeadingTokens() dans scoreMatch.
 */
export function countExtraWords(resultTitle, searchTitle) {
  const qWords = new Set((searchTitle || '').split(/\s+/).filter(w => w.length > 2))
  return (resultTitle || '').split(/\s+/).filter(w =>
    w.length > 2 && !/^\d+$/.test(w) && !TITLE_NOISE_WORDS.has(w) && !qWords.has(w)
  ).length
}

/**
 * Garde anti-homonymes (bug "Gate" → Steins;Gate) — les deux directions :
 *
 * 1. Requête ⊂ résultat : l'occurrence doit être à la frontière de mots
 *    ("gate" collé dans "stargate"/"gates" = homonyme) et tout token
 *    significatif AVANT elle rejette ("steins" ⊂ "steins gate",
 *    "new" ⊂ "the new gate"). Les tokens APRÈS sont des sous-titres
 *    légitimes ("gate - au-delà de la porte") et ne comptent pas.
 * 2. Résultat ⊂ requête : légitime seulement si le résultat EST le début
 *    de la requête ("frieren" ⊂ "frieren beyond…"); au milieu ("gate" ⊂
 *    "steins gate") = homonyme.
 *
 * Les tokens génériques (stop-words, années, hdN) sont ignorés.
 * Retourne true si le résultat est un homonyme à rejeter.
 */
export function hasForeignLeadingTokens(resultTitle, searchTitle) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr || nr === nt) return false
  const isTokStart = (s, i) => i === 0 || s.charCodeAt(i - 1) === 32
  const isTokEnd = (s, i) => i >= s.length || s.charCodeAt(i) === 32
  const isGeneric = w => w.length > 2 && !/^\d+$/.test(w) && !GENERIC_TOKENS.has(w)

  let pos = nr.indexOf(nt)
  if (pos !== -1) {
    if (!(isTokStart(nr, pos) && isTokEnd(nr, pos + nt.length))) return true
    const leading = nr.slice(0, pos).trim().split(/\s+/).filter(Boolean)
    // Construction génitive romaji « <modificateur> no <titre> » : la tête
    // nominale EST le titre recherché (« Sousou no Frieren » ≡ « Frieren »,
    // « Shingeki no Kyojin » ≡ « Kyojin ») — même œuvre, pas un homonyme.
    if (leading.length > 0 && leading[leading.length - 1] === 'no') return false
    return leading.some(isGeneric)
  }
  pos = nt.indexOf(nr)
  if (pos !== -1) {
    if (pos === 0 && isTokEnd(nt, pos + nr.length)) return false
    // Requête génitive « <mod> no <titre> » vs résultat nu : même œuvre.
    const leadQ = nt.slice(0, pos).trim().split(/\s+/).filter(Boolean)
    if (leadQ.length > 0 && leadQ[leadQ.length - 1] === 'no') return false
    return true
  }
  return false
}

/**
 * Score a search result against the query title
 * Pénalise les mots significatifs en trop (ex: "Naruto Shippuden Kai" pour
 * une requête "Naruto" → -25/mot extra) pour éviter les fan-edits dérivées.
 * Garde anti-homonymes : un token significatif AVANT la requête ("steins" ⊂
 * "steins-gate", "new" ⊂ "the-new-gate", "star" ⊂ "stargate") rejette le match.
 */
export function scoreMatch(resultTitle, searchTitle, SCORES) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr) return 0
  if (nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) {
    if (hasForeignLeadingTokens(nr, nt)) return 0
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
      // Only mark as direct if URL is a playable media file (.mp4, .m3u8, etc.)
      const urlLower = (resolved.url || '').toLowerCase()
      const isPlayable = urlLower.includes('.mp4') || urlLower.includes('.m3u8') || 
                         urlLower.includes('/hls/') || urlLower.includes('master.m3u8')
      if (isPlayable) return { ...resolved, isDirect: true }
      // Otherwise return as embed (native player may handle it)
      return { ...resolved, isDirect: false }
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
  const { quality, subType, title, size } = opts;
  const origin = (() => { try { return new URL(url).origin } catch { return siteUrl } })()
  // Normaliser la langue vers les codes app (fr/en/multi/ja) : les valeurs
  // brutes "VF"/"VOSTFR" sont classées "Unknown" dans les filtres/tri NuvioTV.
  // Le label d'origine reste visible dans name/title pour l'affichage.
  const langCode = normalizeLanguageCode(language) || language
  const result = {
    name: `${providerName} (${language})`,
    title: title || `[${language}] ${providerName}${quality && quality !== 'HD' ? ` [${quality}]` : ''}`,
    url,
    quality: quality || 'HD',
    language: langCode,
    headers: {
      Referer: `${origin}/`,
      Origin: origin,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    },
  }
  if (subType) result.subType = subType
  if (size) result.size = size
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
  if (mediaType !== 'tv' || !tmdbId) return [epNum]

  // Convention app TV (IDs anime kitsu:/mal:/anilist:) : season=null + numéro
  // ABSOLU. Dans ce cas, on ne peut pas calculer l'absolu via (S,E) ; on
  // reverse-map au contraire l'absolu vers (S,E) TMDB pour que les providers
  // à pages par saison puissent chercher la bonne page.
  if (season == null || season === '') {
    // Les consommateurs matchent des numéros d'épisodes dans les pages :
    // renvoyer la saison dans le tableau induirait des faux matches. Les
    // providers à pages par saison utilisent getSeasonEpisodeFromAbsolute()
    // pour récupérer les coordonnées (S,E) et affiner leur sélection.
    return [epNum]
  }

  const episodes = [epNum]

  if (startTime != null && isBudgetExhausted(startTime, budgetMs)) return episodes

  try {
    let absoluteEpisode = null
    const imdbId = await getImdbId(tmdbId, mediaType)
    if (imdbId && (startTime == null || !isBudgetExhausted(startTime, budgetMs))) {
      absoluteEpisode = await getAbsoluteEpisode(imdbId, season, epNum)
    }
    // Fallback TMDB (structure saisonnière autoritaire pour les anime) :
    // cinemeta regroupe les anime par arcs TVDB,ARM n'a pas toujours la
    // correspondance → sans ce fallback, l'épisode absolu est indisponible
    // pour beaucoup d'anime (ex: JJK) et les garde-fous anti cross-saison
    // des providers n'ont plus le disambiguisateur.
    if (!absoluteEpisode && (startTime == null || !isBudgetExhausted(startTime, budgetMs))) {
      absoluteEpisode = await getAbsoluteEpisodeFromTmdb(tmdbId, season, epNum)
    }
    if (absoluteEpisode && absoluteEpisode !== epNum) {
      episodes.push(absoluteEpisode)
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
