/**
 * Extractor for Aniverse (aniverse.fr — Next.js/Turbopack + CDN api.onefy.me, diag live 2026-10).
 *
 * Chaîne réelle (toutes les étapes prouvées en live) :
 *   1. Recherche : GET /api/anime/search?q={titre}
 *      → { data: [{ id (uuid), slug, title, titleEnglish, titleRomaji,
 *                   titleNative, alId, malId, totalEpisodes, type }] }
 *      Champs de garde : type ("TV"|"Movie"|"Special"|"OVA"), totalEpisodes,
 *      status ("Finished"|"Ongoing"|"Upcoming").
 *   2. Stream : GET /api/anime/stream/<uuid>/<episode>/<sub|dub>
 *      → 200 { source (master.m3u8), tracks[] (VTT fr), headers.Authorization,
 *              proxy:false, tracksHeader:true }
 *      → 404 "Episode not available in French yet" ; 422 validation ;
 *        400 "Failed to get stream!" (id inexistant).
 *      Réponse en cache CDN (s-maxage=60) — rapide, ~0.6 s.
 *   3. CDN api.onefy.me : master.m3u8 (variants 1080p…) + index.m3u8 avec
 *      EXT-X-KEY AES-128 (URI relative /v1/stream/<id>/key). TOUT (manifest,
 *      clé, segments, VTT) exige Authorization: Bearer <JWT> (~2 h, sub
 *      "internal") renvoyé dans headers.Authorization.
 *   4. Épisodes : GET /api/anime/episode/episodes?animeId=<uuid>&episodeNumber=1&limit=-1
 *      → titres FR exacts par numéro (episodeTitle/titleFr) + numéros réels.
 *
 * ══ Numérotations spéciales TMDB (saisons découpées, specials, OVA) ════════
 * Aniverse découpe les franchises en entrées séparées (ex AOT : "Attack on
 * Titan" 25 eps, "… Final Season" 16 eps, "… THE FINAL CHAPTERS Special 1"
 * 2 eps, OVA dédiées). TMDB, lui, regroupe parfois autrement :
 *   - AOT Final Chapters  = TMDB S0E36/E37 → aniverse special-1 E1/E2
 *     (titres FR composés IDENTIQUES des deux côtés : "Le Grand terrassement
 *     / Les pécheurs", "Entre ciel et terre / Un long rêve / …") ;
 *   - OVAs                = TMDB S0E7/E15-16/E17-19 → entrées OVA aniverse
 *     ("Une décision sans regrets (Partie 1)" ↔ no-regrets E1…) ;
 *   - certaines parties   = absentes du site → 0 stream honnête (jamais un
 *     épisode faux).
 * → Deux passes :
 *   Passe 1 (numérique) : saison TMDB ≥ 1 → entrée au meilleur score dont la
 *     numérotation contient l'épisode (rapide, ~1 s).
 *   Passe 2 (titres) : fetch TMDB /tv/{id}/season/{n} (noms FR) puis scan des
 *     titres FR de TOUS les épisodes des entrées de la franchise (split des
 *     titres composés "A / B"). Déclenchée pour season 0, si la passe 1 a
 *     échoué, ou en S≥2 pour VÉRIFIER le résultat numérique (anti-décalage
 *     Bleach-type : entrée à numérotation absolue).
 *
 * ══ Diagnostics des symptômes rapportés ═══════════════════════════════════
 *  - "Flux indisponible / ne se lance jamais" : le JWT Authorization est
 *    OBLIGATOIRE sur le manifest, la clé AES-128 ET chaque segment (401 sans).
 *    → header attaché systématiquement au stream et aux sous-titres.
 *  - "Épisodes ne correspondent pas aux titres" : validation par numérotation
 *    réelle (passe 1) + correction par matching de titres TMDB (passe 2).
 *  - "Les VF n'apparaissent pas" : le VF = lang "dub" (endpoint séparé du
 *    "sub"), disponibilités différentes par épisode. → sub ET dub interrogés
 *    en parallèle, on renvoie chacun s'il répond 200.
 *
 * Pièges gérés :
 *  - 401 CDN sans Authorization → header systématique (stream + subs).
 *  - language : sub → "ja" (audio VO), dub → "fr" ; labels VF/VOSTFR dans
 *    le title pour l'affichage (convention repo).
 *  - Le manifest est téléchargeable (pas de rate-limit agressif) →
 *    expandStreamQualities l'explose en variantes de qualité (1080p…).
 *  - Clé EXT-X-KEY relative ("/v1/stream/…") : résolue par le lecteur app.
 */
import {
  fetchApi,
  cdnHeaders,
} from './http.js'
import {
  resolveStream,
  isAborted,
  isBudgetExhausted,
} from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { createCache } from '../utils/cache.js'

const PROVIDER = 'Aniverse'
const BUDGET_MS = 40000
const API_BASE = 'https://aniverse.fr/api'
// Clé API TMDB v3 publique (identique à src/utils/metadata.js)
const TMDB_API_KEY = '8265bd1679663a7ea12ac168da84d2e8'
const TMDB_BASE = 'https://api.themoviedb.org/3'

// ─────────────────────────────────────────────────────────────────────────────
// Recherche / matching
// ─────────────────────────────────────────────────────────────────────────────

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`’]/g, "'")
    .replace(/[–—]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Score un résultat de recherche contre un titre TMDB (normalisés).
 * Exact = 120 ; préfixe ordonné = 95 ; sous-chaîne = 75 ; tokens ≥ 60.
 */
function scoreCandidate(item, queryNorm) {
  const candidates = [
    normalizeText(item.title),
    normalizeText(item.titleEnglish),
    normalizeText(item.titleRomaji),
  ].filter(Boolean)
  let best = 0
  for (const n of candidates) {
    if (!n) continue
    if (n === queryNorm) return 120
    if (n.startsWith(queryNorm + ' ') || queryNorm.startsWith(n + ' ')) best = Math.max(best, 95)
    else if (n.includes(queryNorm) || queryNorm.includes(n)) best = Math.max(best, 75)
    const qWords = queryNorm.split(/\s+/).filter(w => w.length > 2)
    const nWords = new Set(n.split(/\s+/))
    const matched = qWords.filter(w => nWords.has(w)).length
    if (qWords.length >= 2 && matched >= 2) {
      best = Math.max(best, Math.round((matched / qWords.length) * 60))
    }
  }
  return best
}

/**
 * Recherche les candidats aniverse pour une liste de titres TMDB.
 * Retourne [{item, score}] triés par meilleur score décroissant.
 */
const withCache = typeof createCache === 'function'
  ? createCache('anv', 'Aniverse', { successTtl: 10 * 60 * 1000, maxSize: 80 })
  : null

const _cacheBypassFallback = new Map() // fallback local si createCache absent côté runtime

/**
 * Clé déterministe de recherche : les queries effectivement utilisées (déjà
 * normalisées, ordre stable = ordre d'ajout). Deux appels avec les mêmes
 * titres TMDB tomberont sur la même clé.
 */
function searchCacheKey(titles) {
  const seen = []
  for (const t of (titles || []).filter(Boolean)) {
    const n = normalizeText(t)
    if (n && !seen.includes(n)) seen.push(n)
    if (seen.length >= 3) break
  }
  return seen.join('|||')
}

/**
 * Cherche les candidats aniverse pour une liste de titres TMDB.
 * Retourne [{item, score}] triés par meilleur score décroissant.
 */
async function searchCandidates(titles, signal) {
  const queries = []
  for (const t of (titles || []).filter(Boolean)) {
    const n = normalizeText(t)
    if (n && !queries.includes(n)) queries.push(n)
    if (queries.length >= 3) break
  }

  // Cache en deux couches : withCache (persistant, dernier mot) puis fallback
  // mémoire court (si le cache n'a pas été exporté côté runtime).
  const key = searchCacheKey(titles)
  const fetchRaw = async () => {
    const seen = new Map() // id → {item, score}
    for (const q of queries) {
      if (isAborted(signal)) break
      const data = await fetchApi(`${API_BASE}/anime/search?q=${encodeURIComponent(q)}`, { signal })
      const results = data && Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : null)
      if (!results) continue
      for (const item of results) {
        if (!item || !item.id) continue
        const s = scoreCandidate(item, q)
        const prev = seen.get(item.id)
        if (!prev || s > prev.score) seen.set(item.id, { item, score: s })
      }
      // Un match exact sur la 1re requête suffit
      const bestSeen = [...seen.values()].sort((a, b) => b.score - a.score)[0]
      if (bestSeen && bestSeen.score >= 120) break
    }
    return [...seen.values()].sort((a, b) => b.score - a.score)
  }

  if (withCache) {
    const cached = await withCache(`search_${key}`, async () => {
      const r = await fetchRaw()
      // Ne jamais cacher les résultats vides : un catalogue vide est plus
      // souvent un vrai « pas de résultat » qu'un transient — le figer avec
      // 30s de TTL (negative cache de withCache) ne sert à rien ici.
      return r && r.length > 0 ? r : null
    }, { bypass: false })
    if (cached && Array.isArray(cached)) return cached
    // Cache miss (null ou absent) → appel réel
    return fetchRaw()
  }

  // Fallback mémoire court sans createCache (runtime non-bundlé / eslint-only)
  const memKey = `raw_${key}`
  const mem = _cacheBypassFallback.get(memKey)
  if (mem && Date.now() - mem.ts < EPISODES_CACHE_TTL) return mem.list
  const r = await fetchRaw()
  if (r && r.length > 0) _cacheBypassFallback.set(memKey, { list: r, ts: Date.now() })
  return r
}

// ─────────────────────────────────────────────────────────────────────────────
// Épisodes : liste + validation numérique (anti-décalage)
// ─────────────────────────────────────────────────────────────────────────────

const _episodesCache = new Map()
const EPISODES_CACHE_TTL = 10 * 60 * 1000

/**
 * Fenêtre d'épisodes autour de fromEp (l'API retourne ~[fromEp-1, fromEp+count]).
 * ⚠ NE JAMAIS demander limit=-1 : pour les longues séries (One Piece : 1184
 * eps = 1.27 MB de JSON) la réponse dépasse la limite runtime de 1 MB →
 * tronquée → JSON invalide → null. Les fenêtres restent < 100 KB.
 */
async function getEpisodeWindow(animeId, fromEp, count, signal) {
  const from = Math.max(1, parseInt(fromEp, 10) || 1)
  const cnt = Math.max(1, parseInt(count, 10) || 1)
  const key = `${animeId}:${from}:${cnt}`
  const cached = _episodesCache.get(key)
  if (cached && Date.now() - cached.ts < EPISODES_CACHE_TTL) return cached.list
  const list = await fetchApi(
    `${API_BASE}/anime/episode/episodes?animeId=${encodeURIComponent(animeId)}&episodeNumber=${from}&limit=${cnt}`,
    { signal }
  )
  const valid = Array.isArray(list) && list.length > 0 ? list : null
  if (valid) _episodesCache.set(key, { list: valid, ts: Date.now() })
  return valid
}

/**
 * Vérifie que l'épisode demandé existe dans la numérotation aniverse de
 * l'entrée candidate. L'API episodes fait foi (titres FR + numéros réels) ;
 * fallback totalEpisodes (±2). Retourne { ok, episodeTitle } / { ok:false }.
 */
function validateEpisode(entry, episodeList, episode) {
  const total = parseInt(entry.totalEpisodes, 10) || 0
  if (episodeList && episodeList.length > 0) {
    const ep = episodeList.find(e => parseInt(e.episodeNumber, 10) === episode)
    if (ep) return { ok: true, episodeTitle: ep.titleFr || ep.episodeTitle || null }
    return { ok: false }
  }
  if (total > 0 && episode > total + 2) return { ok: false }
  return { ok: true, episodeTitle: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Passe 2 : mapping des numérotations spéciales par TITRES TMDB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liste les épisodes d'une saison TMDB avec leur nom FR (fallback EN).
 * Retourne [{ number, name }] ou null.
 */
async function fetchTmdbSeasonEpisodes(tmdbId, season, signal) {
  const base = `${TMDB_BASE}/tv/${tmdbId}/season/${season}`
  let eps = null
  const fr = await fetchApi(`${base}?api_key=${TMDB_API_KEY}&language=fr-FR`, { signal, timeout: 10000 })
  if (fr && Array.isArray(fr.episodes) && fr.episodes.length > 0) eps = fr.episodes
  if (!eps) {
    const en = await fetchApi(`${base}?api_key=${TMDB_API_KEY}&language=en-US`, { signal, timeout: 10000 })
    if (en && Array.isArray(en.episodes) && en.episodes.length > 0) eps = en.episodes
  }
  if (!eps) return null
  return eps
    .map(e => ({ number: parseInt(e.episode_number, 10), name: String(e.name || '').trim() }))
    .filter(e => e.number > 0 && e.name)
}

/**
 * Score de correspondance entre un nom d'épisode TMDB et un titre aniverse.
 * Les titres aniverse composés ("A / B / C") sont découpés : un segment qui
 * matche suffit (les specials Final Chapters combinent plusieurs épisodes TV).
 * Les suffixes "(Partie N)" / "Part N" sont retirés avant scoring mais leurs
 * numéros doivent être COHÉRENTS des deux côtés (sinon rejet — évite que
 * "… (Partie 2)" TMDB matche le "… (Partie 1)" aniverse).
 * Métriques (tolérantes aux différences de traduction TMDB ↔ site) :
 *   exact = 120 ; sous-chaîne = 95 ; Jaccard mots ≥ 0.8 = 90 ;
 *   préfixe commun ≥ 12 chars = 88 ; Levenshtein ≥ 0.55 = 85 ;
 *   Jaccard mots ≥ 0.6 = 80.
 * ⚠ Pas de découpage sur " : "/" - " (sous-titres) : le segment générique
 * commun à plusieurs épisodes (ex "Lost Girls") créerait des faux matchs.
 * Un épisode absent vaut mieux qu'un mauvais épisode.
 */
function bigrams(s) {
  const set = new Set()
  const t = s.replace(/\s+/g, ' ')
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2))
  return set
}

function levenshteinSimilarity(a, b) {
  if (a === b) return 1
  const m = a.length, n = b.length
  if (!m || !n) return 0
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev; prev = curr; curr = tmp
  }
  return 1 - prev[n] / Math.max(m, n)
}

function extractPartNum(norm) {
  const m = norm.match(/parti[ei]?\s*(\d+)/) || norm.match(/\bpart\s*(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function stripPartSuffix(norm) {
  return norm.replace(/parti[ei]?\s*\d+|\bpart\s*\d+/g, ' ').replace(/\s+/g, ' ').trim()
}

function episodeTitleScore(tmdbName, aniverseTitle) {
  const ntRaw = normalizeText(tmdbName)
  if (!ntRaw || !aniverseTitle) return 0
  const ntPart = extractPartNum(ntRaw)
  const nt = stripPartSuffix(ntRaw)
  if (!nt) return 0
  let best = 0
  const segments = String(aniverseTitle).split(/\s*\/\s*/)
  for (const seg of segments) {
    const nsRaw = normalizeText(seg)
    if (!nsRaw) continue
    // Cohérence du numéro de partie : les deux présents mais différents → rejet
    const nsPart = extractPartNum(nsRaw)
    if (ntPart != null && nsPart != null && ntPart !== nsPart) continue
    const ns = stripPartSuffix(nsRaw)
    if (!ns) continue
    if (ns === nt || nsRaw === ntRaw) { best = Math.max(best, 120); continue }
    if (ns.includes(nt) || nt.includes(ns)) { best = Math.max(best, 95); continue }
    // Jaccard sur les mots
    const a = new Set(nt.split(' ').filter(w => w.length > 2))
    const b = new Set(ns.split(' ').filter(w => w.length > 2))
    if (a.size && b.size) {
      const inter = [...a].filter(w => b.has(w)).length
      const uni = new Set([...a, ...b]).size
      const jac = uni ? inter / uni : 0
      if (jac >= 0.8) { best = Math.max(best, 90); continue }
      if (jac >= 0.6) { best = Math.max(best, 80); continue }
    }
    // Préfixe commun long — titres au même sous-titre mais traduits à part
    // (ex TMDB "Le carnet d'Ilse - Notes d'une patrouilleuse…" vs site
    //  "Le carnet d'Ilse : Mémoires d'un membre du Bataillon…")
    let lcp = 0
    const maxLcp = Math.min(nt.length, ns.length)
    while (lcp < maxLcp && nt[lcp] === ns[lcp]) lcp++
    if (lcp >= 12) { best = Math.max(best, 88); continue }
    // Levenshtein normalisé — tolère les traductions divergentes
    // (ex TMDB "Une décision sans regrets" vs site "Un choix sans regrets")
    const lev = levenshteinSimilarity(nt, ns)
    if (lev >= 0.55) { best = Math.max(best, 85); continue }
  }
  return best
}

/** Affinité de type : TV pour les saisons TMDB, Special/OVA pour les specials (S0). */
function typeAffinity(item, preferSpecial) {
  const t = String(item.type || '')
  if (preferSpecial) return /special|ova|ona/i.test(t) ? 1 : 0
  return /tv/i.test(t) ? 1 : 0
}

/**
 * Cherche l'épisode TMDB (par son nom FR) dans toutes les entrées de la
 * franchise. minScore : 95 (override strict du résultat numérique S≥2) ou
 * 85 (spéciaux S0 / échec de la passe numérique / correction d'offset).
 * opts.windowCenter/Span : restreint le scan à une fenêtre de numéros
 * absolus attendus (correction One Piece-type : entrée à numérotation
 * absolue, épisode attendu = cumul des saisons TMDB précédentes + épisode).
 * Retourne le meilleur match : { item, epNumber, epTitle, score } ou null.
 */
async function findBestTitleMatch(candidates, tmdbName, preferSpecial, minScore, signal, startTime, opts = {}) {
  const windowCenter = opts.windowCenter != null ? opts.windowCenter : null
  const windowSpan = opts.windowSpan || 0
  let best = null
  // Exclure les films du scan (slots précieux) et élargir à 8 entrées :
  // les OVA/specials ont souvent un score de recherche plus bas que les
  // saisons TV (75 < 95) mais sont la CIBLE des numérotations spéciales.
  const scanList = candidates
    .filter(c => !/movie/i.test(String(c.item.type || '')))
    .slice(0, 8)
  for (const cand of scanList) {
    if (isBudgetExhausted(startTime, BUDGET_MS) || isAborted(signal)) break
    // Fenêtre d'épisodes : centrée sur l'absolu attendu si connu, sinon les
    // 150 premiers (largement suffisant pour les entrées Special/OVA visées)
    const fromEp = windowCenter != null ? Math.max(1, windowCenter - windowSpan) : 1
    const count = windowCenter != null ? windowSpan * 2 + 2 : 150
    let list = null
    try {
      list = await getEpisodeWindow(cand.item.id, fromEp, count, signal)
    } catch (e) {
      if (isAborted(signal)) throw e
      continue
    }
    if (!list) continue
    for (const epItem of list) {
      const num = parseInt(epItem.episodeNumber, 10)
      // Fenêtre d'offset attendu (correction de numérotation absolue)
      if (windowCenter != null && Math.abs(num - windowCenter) > windowSpan) continue
      const title = epItem.titleFr || epItem.episodeTitle || ''
      if (!title) continue
      const sc = episodeTitleScore(tmdbName, title)
      if (sc < minScore) continue
      const aff = typeAffinity(cand.item, preferSpecial)
      if (!best || sc > best.score || (sc === best.score && aff > best.typeAff)) {
        best = {
          item: cand.item,
          epNumber: parseInt(epItem.episodeNumber, 10),
          epTitle: title,
          score: sc,
          typeAff: aff,
        }
      }
    }
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// Résolution du stream
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appelle /api/anime/stream/<id>/<ep>/<lang>. lang: 'sub' (VOSTFR) | 'dub' (VF).
 * Retourne { source, authHeader, tracks } ou null (404/422/erreur/sans JWT).
 */
async function resolveStreamByLang(animeId, episode, lang, signal) {
  const data = await fetchApi(
    `${API_BASE}/anime/stream/${encodeURIComponent(animeId)}/${episode}/${lang}`,
    { signal, timeout: 15000 }
  )
  if (!data || typeof data.source !== 'string' || !data.source || !data.source.includes('/')) return null
  const auth = data.headers && typeof data.headers.Authorization === 'string' ? data.headers.Authorization : null
  // Sans Authorization le CDN renvoie 401 sur manifest + clé + segments → inutilisable
  if (!auth) {
    console.log(`[${PROVIDER}] Stream sans Authorization (CDN 401 garanti) — rejeté`)
    return null
  }
  return {
    source: data.source,
    authHeader: auth,
    tracks: Array.isArray(data.tracks) ? data.tracks : [],
  }
}

/**
 * Résout sub + dub en parallèle pour (entrée, numéro) et construit les
 * streams bruts. Retourne [] si aucun des deux n'est disponible.
 */
async function resolveEntryStreams(item, epNumber, { epLabel, episodeTitle, signal }) {
  const [subRes, dubRes] = await Promise.allSettled([
    resolveStreamByLang(item.id, epNumber, 'sub', signal),
    resolveStreamByLang(item.id, epNumber, 'dub', signal),
  ])
  const sub = subRes.status === 'fulfilled' ? subRes.value : null
  const dub = dubRes.status === 'fulfilled' ? dubRes.value : null
  if (!sub && !dub) {
    console.log(`[${PROVIDER}] Ni VOSTFR ni VF dispo sur "${item.slug}" ep ${epNumber}`)
    return []
  }

  const buildStream = (res, langLabel, langCode) => ({
    name: `${PROVIDER} (${langLabel})`,
    title: [
      `${PROVIDER} [${langLabel}]`,
      epLabel,
      item.title,
      episodeTitle ? `— ${episodeTitle}` : null,
    ].filter(Boolean).join(' '),
    url: res.source,
    quality: 'HLS',
    language: langCode,
    // Authorization Bearer OBLIGATOIRE : sans lui manifest/clé/segments = 401
    headers: cdnHeaders(res.authHeader),
    type: 'hls',
  })

  const streams = []
  if (sub) {
    // VOSTFR : sous-titres fr fournis par l'API (NuvioMobile uniquement)
    const vtt = sub.tracks.find(t => t && t.file && /captions|subtitles/i.test(t.kind || ''))
    const stream = buildStream(sub, 'VOSTFR', 'ja')
    if (vtt && vtt.file) {
      stream.subtitles = [{
        url: vtt.file,
        language: 'fr',
        name: 'Français',
        headers: cdnHeaders(sub.authHeader),
      }]
    }
    streams.push(stream)
    console.log(`[${PROVIDER}] VOSTFR OK: ${sub.source.slice(0, 70)}...`)
  }
  if (dub) {
    streams.push(buildStream(dub, 'VF', 'fr'))
    console.log(`[${PROVIDER}] VF OK: ${dub.source.slice(0, 70)}...`)
  }
  return streams
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  const startTime = Date.now()

  const isMovie = mediaType === 'movie'
  // ⚠ saison 0 = specials TMDB (OVA, Final Chapters) → ne PAS écraser par 1
  const parsedSeason = parseInt(season, 10)
  const s = isNaN(parsedSeason) || parsedSeason < 0 ? 1 : parsedSeason
  const ep = parseInt(episode, 10) || 1
  // Season 0 TMDB = specials/OVA → numérotation par titres uniquement
  const isSpecials = !isMovie && s === 0
  const epLabel = isMovie ? '' : `S${s}E${ep}`

  // 1. Titres TMDB (EN + romaji + FR + variantes saison)
  const titles = await getTmdbTitles(tmdbId, isMovie ? 'movie' : 'tv', { season })
  if (!titles || titles.length === 0) {
    console.log(`[${PROVIDER}] No TMDB titles for ${tmdbId}`)
    return []
  }
  console.log(`[${PROVIDER}] Titles: ${titles.slice(0, 3).join(' | ')}`)

  // 2. Recherche aniverse (candidats de la franchise entière, triés par score)
  const candidates = await searchCandidates(titles, signal)
  if (candidates.length === 0) {
    console.log(`[${PROVIDER}] No search results`)
    return []
  }
  if (isBudgetExhausted(startTime, BUDGET_MS)) return []

  let streams = []
  let numericRef = null // { item, epNumber, epTitle } — résultat de la passe 1

  // ── Passe 1 : numérique directe (saisons TMDB ≥ 1) ──────────────────────
  if (!isSpecials) {
    const MAX_CANDIDATES = 3
    for (const { item, score } of candidates.slice(0, MAX_CANDIDATES)) {
      if (isBudgetExhausted(startTime, BUDGET_MS) || isAborted(signal)) break
      if (score < 60) break

      // Garde type : un film ne matche jamais une série (et inversement)
      const itemType = String(item.type || '')
      const isMovieEntry = /movie/i.test(itemType)
      if (isMovie !== isMovieEntry && score < 120) continue

      // Validation anti-décalage : l'épisode demandé doit exister dans la
      // numérotation réelle de l'entrée aniverse (fenêtre ciblée autour de
      // l'épisode — jamais limit=-1, cf. getEpisodeWindow).
      let episodeList = null
      try {
        episodeList = await getEpisodeWindow(item.id, ep, 1, signal)
      } catch (e) {
        if (isAborted(signal)) throw e
      }
      const validation = validateEpisode(item, episodeList, ep)
      if (!validation.ok) {
        console.log(`[${PROVIDER}] Ep ${ep} hors numérotation de "${item.slug}" (total=${item.totalEpisodes}) — candidat suivant`)
        continue
      }

      const built = await resolveEntryStreams(item, ep, {
        epLabel,
        episodeTitle: validation.episodeTitle,
        signal,
      })
      if (built.length > 0) {
        streams = built
        numericRef = { item, epNumber: ep, epTitle: validation.episodeTitle }
        // Candidat validé avec au moins un stream → inutile de tester les autres
        break
      }
    }
  }

  // ── Passe 2 : mapping par titres TMDB (spéciaux + garde anti-décalage) ──
  // Déclenchée pour : season 0 (OVA/specials), échec de la passe 1, ou en
  // saison ≥ 2 pour vérifier/corriger le résultat numérique.
  //   - override d'un résultat numérique : score strict ≥ 95 (exact/sous-chaîne)
  //   - specials / échec numérique / correction d'offset : score ≥ 85
  //
  // Détection des entrées à NUMÉROTATION ABSOLUE (ex One Piece : 1 entrée de
  // 1184 eps pour toutes les saisons TMDB) : si totalEpisodes ≫ nb d'éps de
  // la saison TMDB, l'épisode attendu = cumul des saisons TMDB précédentes +
  // épisode (seasonEpisodeCounts fourni par getTmdbTitles). Si le résultat
  // numérique ≠ attendu, il est FAUX (S2E1 → E1 absolu) → on le retire et on
  // recherche le vrai épisode par titre dans une fenêtre autour de l'attendu.
  // Sans correction fiable → 0 stream honnête (jamais d'épisode faux).
  const needTitlePass = !isMovie && (isSpecials || streams.length === 0 || s >= 2)
  if (needTitlePass && !isBudgetExhausted(startTime, BUDGET_MS) && !isAborted(signal)) {
    const tmdbEps = await fetchTmdbSeasonEpisodes(tmdbId, s, signal)
    if (tmdbEps && tmdbEps.length > 0) {
      // Cible : par numéro TMDB (cas standard) OU par POSITION dans la saison
      // — certaines saisons TMDB (One Piece, arcs) sont numérotées en ABSOLU
      // (S2 "E1" porte episode_number 62) : l'épisode demandé s'identifie
      // alors par sa position, et son numéro TMDB = l'absolu attendu.
      let target = tmdbEps.find(e => e.number === ep)
      if (!target && ep >= 1 && ep <= tmdbEps.length) target = tmdbEps[ep - 1]
      if (target && target.name) {
      // Détection d'entrée à numérotation absolue + offset attendu
      let windowCenter = null
      let windowSpan = 0
      let numericSuspect = false
      // Numéro TMDB réel de la cible (= absolu si la saison est numérotée ainsi)
      const tmdbAbs = target.number
      let cumulativeAbs = null
      if (!isSpecials && numericRef && titles._metadata && titles._metadata.seasonEpisodeCounts) {
        const counts = titles._metadata.seasonEpisodeCounts
        const countsSeason = parseInt(counts[s], 10) || 0
        const total = parseInt(numericRef.item.totalEpisodes, 10) || 0
        if (countsSeason > 0 && total > countsSeason * 1.5 && total >= 50) {
          let abs = ep
          for (let k = 1; k < s; k++) abs += parseInt(counts[k], 10) || 0
          // Priorité au numéro TMDB réel (saisons-arc absolues) ; le cumul
          // calculé sert de garde-fou s'il diverge peu.
          cumulativeAbs = abs
          windowCenter = tmdbAbs != null && Math.abs(tmdbAbs - abs) <= 30 ? tmdbAbs : abs
          windowSpan = 30
          numericSuspect = windowCenter !== numericRef.epNumber
          if (numericSuspect) {
            console.log(
              `[${PROVIDER}] Numérotation absolue détectée ("${numericRef.item.slug}", total=${total}) : S${s}E${ep} → absolu attendu ${windowCenter}, numérique=${numericRef.epNumber} — correction`
            )
          }
        }
      }
      const minScore = streams.length > 0 && !numericSuspect ? 95 : 85
      const match = await findBestTitleMatch(
        candidates, target.name, isSpecials, minScore, signal, startTime,
        windowCenter != null ? { windowCenter, windowSpan } : {}
      )
      if (match) {
        const isDifferent = !numericRef ||
          match.item.id !== numericRef.item.id ||
          match.epNumber !== numericRef.epNumber
        if (streams.length === 0 || isDifferent) {
          const built = await resolveEntryStreams(match.item, match.epNumber, {
            epLabel,
            episodeTitle: match.epTitle,
            signal,
          })
          if (built.length > 0) {
            console.log(
              `[${PROVIDER}] Mapping titre: TMDB S${s}E${ep} "${target.name}" → "${match.item.slug}" E${match.epNumber} (score ${match.score})`
            )
            streams = built
          } else if (numericSuspect) {
            // La correction a échoué à résoudre un stream → épisode faux interdit
            streams = []
          }
        }
      } else if (numericSuspect) {
        // Aucune correction fiable trouvée → on ne sert pas l'épisode numérique suspect
        console.log(`[${PROVIDER}] Épisode numérique suspect sans correction fiable — abandon (0 stream)`)
        streams = []
      }
      }
    }
  }

  if (streams.length === 0) return []

  // 3. resolveStream : normalisation (type, quality via manifest, dédoublonnage)
  const resolved = []
  let index = 0
  for (const st of streams) {
    try {
      const r = await resolveStream(st, index)
      if (r && r.url) {
        const { isDirect, originalUrl, ...clean } = r
        resolved.push({ ...st, ...clean, provider: PROVIDER })
      }
    } catch (e) {
      if (isAborted(signal)) throw e
      console.log(`[${PROVIDER}] resolveStream failed: ${e && e.message} — serving raw URL`)
      resolved.push({ ...st, provider: PROVIDER })
    }
    index++
  }
  return resolved
}
