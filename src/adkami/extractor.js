/**
 * Extractor for ADKami (www.adkami.com — PHP custom, diag live 2026-09).
 *
 * Chaîne réelle :
 *   1. Search : GET /video?search={q} — cartes réelles = blocs
 *      .video-item-list > a[href=/anime/{id}] + span.title (les posts
 *      communautaires n'ont PAS cette structure et sont écartés).
 *   2. Fiche : GET /anime/{id} — liste TOUS les épisodes : liens
 *      /anime/{id}/{ep}/{lang}/{qual}/{serveur}/ avec label
 *      "Episode {NNN} (vf|vostfr)( sai{n})?".
 *      ⚠ {ep} = épisode ABSOLU (saisons cumulées) ; le marqueur `sai{n}`
 *      n'apparaît que sur certaines pages (ex: "vf sai2") — l'épisode de
 *      saison se calcule via les plages absolues des saisons TMDB.
 *   3. Page épisode : blocs .video-iframe avec data-url chiffré
 *      (youtube.com/embed + base64 → cf. decryptAdkUrl) + data-name serveur
 *      (dood stream, lulustream, vidmoly, voe, streamtape, byse, sibnet).
 *   4. Résolution : nos résolveurs résolvent dood/vidmoly/voe/streamtape/
 *      lulustream nativement ; byse (bysewihe.com) passe par resolveByse
 *      (jetanimes) ; sibnet ignoré (proxy shell.php illisible côté ExoPlayer).
 *
 * Langue : on demande la variante VOSTFR (lang=2) puis VF (lang=1) et on
 * retient les épisodes EXISTANTS — le label réel du site est lu dans le
 * TITLE de la page et normalisé (fr) avec le label conservé dans le titre.
 */
import { fetchPage, fetchMeta, decryptAdkUrl, sleep } from './http.js'
import { resolveByse } from '../jetanimes/byse.js'
import {
  resolveStream,
  safeFetch,
  isAborted,
  isBudgetExhausted,
  normalizeLanguageCode,
} from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { normalize, hasForeignLeadingTokens } from '../utils/dle-extractor.js'

const PROVIDER = 'ADKami'
const BASE = 'https://www.adkami.com'
const BUDGET_MS = 42000
const RESERVE_MS = 12000

// Priorité serveurs : par fiabilité de résolution + absence de pub agressive.
// sibnet = volontairement ignoré (shell.php = HTML, pas un flux direct).
const PRIORITY = ['byse', 'vidmoly', 'voe', 'dood', 'lulustream', 'streamtape']
const IGNORED = ['sibnet']

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse les CARTES réelles de /video?search= (blocs .video-item-list).
 * Chaque bloc : <div class="video-item-list">…<a href="…/anime/{id}">
 * …<span class="title">{titre}</span>…
 * Les posts communautaires (liens nus sans span.title) sont ignorés.
 */
export function parseSearchCards(html) {
  if (!html) return []
  const cards = []
  const re = /<div class="video-item-list">([\s\S]*?)<\/div>\s*(?=<span|<\/div>|<div class="video-item-list")/g
  let m
  while ((m = re.exec(html)) !== null) {
    const block = m[1]
    const idM = block.match(/href="https:\/\/www\.adkami\.com\/anime\/(\d+)"/)
    const titleM = block.match(/<span class="title">([^<]+)<\/span>/)
    if (!idM || !titleM) continue
    cards.push({ id: idM[1], title: titleM[1].trim() })
  }
  // Fallback si le markup change : liens /anime/{id} suivis d'un span.title
  if (cards.length === 0) {
    const loose = html.match(/<a href="https:\/\/www\.adkami\.com\/anime\/(\d+)">[\s\S]{0,200}?<span class="title">([^<]+)<\/span>/g) || []
    for (const seg of loose) {
      const id = seg.match(/anime\/(\d+)/)
      const title = seg.match(/<span class="title">([^<]+)<\/span>/)
      if (id && title) cards.push({ id: id[1], title: title[1].trim() })
    }
  }
  // Dédup par id
  const seen = new Set()
  return cards.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)))
}

function scoreCard(card, queryNorm) {
  const nTitle = normalize(card.title)
  const nSlug = normalize(String(card.id))
  if (!nTitle) return 0
  if (nTitle === queryNorm) return 120
  if (hasForeignLeadingTokens(nTitle, queryNorm)) return 0
  if (nTitle.startsWith(queryNorm + ' ') || queryNorm.startsWith(nTitle + ' ')) return 90
  if (nTitle.includes(queryNorm) || queryNorm.includes(nTitle)) return 70
  const qWords = queryNorm.split(/\s+/).filter(w => w.length > 2)
  const tWords = new Set(nTitle.split(/\s+/))
  const matched = qWords.filter(w => tWords.has(w)).length
  if (qWords.length >= 2 && matched < 2) return 0
  return Math.round((matched / Math.max(qWords.length, 1)) * 60)
}

async function findSeries(titles, signal) {
  const candidates = (titles || []).filter(Boolean).slice(0, 8)
  let best = null
  let bestScore = 0
  for (const title of candidates) {
    if (isBudgetExhausted(Date.now(), BUDGET_MS)) break
    const q = normalize(title)
    if (!q || q.length < 3) continue
    const html = await fetchPage(`${BASE}/video?search=${encodeURIComponent(title)}`, { signal })
    if (!html) continue
    const cards = parseSearchCards(html)
    for (const card of cards) {
      const s = scoreCard(card, q)
      if (s > bestScore) {
        bestScore = s
        best = card
      }
    }
    if (bestScore >= 120) break // match exact
  }
  return best && bestScore >= 60 ? best : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Fiche → épisodes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse la fiche : liens épisodes + labels.
 * Retourne [{ url, absEp, lang: 'vf'|'vostfr', qual, server, sai }]
 */
export function parseEpisodeLinks(html, animeId) {
  if (!html || !animeId) return []
  const out = []
  const re = new RegExp(
    `href="https://www\\.adkami\\.com/anime/${animeId}/(\\d+)/(\\d+)/(\\d+)/(\\d+)/"[^>]*>([^<]+)<`,
    'g'
  )
  let m
  while ((m = re.exec(html)) !== null) {
    const [, ep, lang, qual, server, label] = m
    const lab = label.trim().toLowerCase()
    const isVf = /\bvf\b/.test(lab)
    const saiM = lab.match(/sai\s*(\d+)/)
    out.push({
      url: `${BASE}/anime/${animeId}/${ep}/${lang}/${qual}/${server}/`,
      absEp: parseInt(ep, 10),
      langSeg: parseInt(lang, 10),
      lang: isVf ? 'VF' : 'VOSTFR',
      qual: parseInt(qual, 10),
      server: parseInt(server, 10),
      sai: saiM ? parseInt(saiM[1], 10) : null,
    })
  }
  return out
}

/**
 * Résout l'épisode absolu ADKami depuis (saison, épisode) TMDB.
 * Stratégie :
 *  - si un marqueur sai{n} existe dans les épisodes SANS index saisonniers
 *    (1 page = 1 saison) → épisode direct ;
 *  - sinon : la numérotation est absolue → offset = cumul des durées des
 *    saisons TMDB précédentes (fallback heuristique 12/24/36/48).
 */
function computeOffsets(titles) {
  const counts = titles?._metadata?.seasonEpisodeCounts // { saison: nbEps }
  if (counts && typeof counts === 'object') {
    const offs = [0]
    for (let sn = 1; sn <= 30; sn++) {
      const c = parseInt(counts[sn], 10) || 0
      if (!c) break
      offs.push(offs[offs.length - 1] + c)
    }
    if (offs.length > 1) return offs
  }
  return [0, 12, 24, 36, 48]
}

function pickEpisodeLinks(links, season, episode, offsets) {
  if (!links.length) return []
  let abs = null
  // 1. Marqueur sai explicite
  const marked = links.filter(l => l.sai === season)
  if (marked.length > 0) {
    // épisode de saison = ep − (min abs de cette saison) + 1
    const minAbs = Math.min(...marked.map(l => l.absEp))
    const target = episode + minAbs - 1
    if (marked.some(l => l.absEp === target)) abs = target
  }
  // 2. Numérotation absolue : si tous les eps ≤ maxAbs, pas d'offset possible
  if (abs === null) {
    const maxAbs = Math.max(...links.map(l => l.absEp))
    if (season === 1 || maxAbs < episode) {
      if (links.some(l => l.absEp === episode)) abs = episode
    } else {
      // 3. Offsets : cumul réel des durées des saisons TMDB (fallback heuristique).
      // L'offset ATTENDU pour la saison demandée est testé en premier — sinon
      // l'offset 0 résoudrait S2E1 sur l'épisode absolu 1 de la S1.
      const offs = (Array.isArray(offsets) && offsets.length ? offsets : [0, 12, 24, 36, 48]).slice()
      const primary = offs[season - 1]
      const ordered = primary != null ? [primary, ...offs.filter(o => o !== primary)] : offs
      for (const off of ordered) {
        const target = episode + off
        if (target <= maxAbs && links.some(l => l.absEp === target)) {
          abs = target
          break
        }
      }
    }
  }
  if (abs === null) return []
  // TOUTES les variantes de cet épisode absolu : les lecteurs tiers ne sont
  // présents que sur certaines combinaisons lang/qual/serveur (les autres
  // pages ne servent que des redirections officielles Crunchyroll/Netflix).
  // VF d'abord (demande majoritaire), puis qualité/serveur croissants.
  return links
    .filter(l => l.absEp === abs)
    .sort(
      (a, b) =>
        (a.lang === 'VF' ? 0 : 1) - (b.lang === 'VF' ? 0 : 1) ||
        a.qual - b.qual ||
        a.server - b.server
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page épisode → embeds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait les embeds d'une page épisode : blocs .video-iframe
 * (data-url chiffré + data-name serveur).
 */
export function extractEmbeds(html) {
  if (!html) return []
  const out = []
  const re = /class="video-iframe[^"]*"\s+data-url="([^"]+)"\s+data-name="([^"]+)"/g
  let m
  while ((m = re.exec(html)) !== null) {
    const name = m[2].trim().toLowerCase()
    if (IGNORED.some(h => name.includes(h))) continue
    const url = decryptAdkUrl(m[1])
    if (url) out.push({ host: name, url })
  }
  // Fallback markup : data-url suivi de data-name dans un ordre inverse
  if (out.length === 0) {
    const re2 = /data-name="([^"]+)"[^>]*data-url="([^"]+)"/g
    while ((m = re2.exec(html)) !== null) {
      const name = m[1].trim().toLowerCase()
      if (IGNORED.some(h => name.includes(h))) continue
      const url = decryptAdkUrl(m[2])
      if (url) out.push({ host: name, url })
    }
  }
  // Ordre de priorité
  return out.sort(
    (a, b) =>
      PRIORITY.findIndex(p => a.host.includes(p)) - PRIORITY.findIndex(p => b.host.includes(p))
  )
}

/** Lit le label épisode/langue depuis le TITLE de la page épisode. */
function parseEpisodeTitle(html) {
  const t = /<title>([^<]+)<\/title>/.exec(html || '')
  if (!t) return null
  const lab = t[1].toLowerCase()
  const ep = lab.match(/episode\s*(\d+)/)
  const lang = /\bvf\b/.test(lab) ? 'VF' : 'VOSTFR'
  return { ep: ep ? parseInt(ep[1], 10) : null, lang }
}

// ─────────────────────────────────────────────────────────────────────────────
// Résolution
// ─────────────────────────────────────────────────────────────────────────────

function baseHeadersFor(url) {
  return { Referer: `${BASE}/`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' }
}

async function resolveEmbed(embed, startTime, signal) {
  const { host, url } = embed
  try {
    if (host.includes('byse') || /bysewihe\.com|hdsplay/.test(url)) {
      const meta = await fetchMeta(url, { signal, timeout: 14000 })
      if (!meta) return null
      const finalUrl = /hdsplay/.test(meta.finalUrl || '') ? meta.finalUrl : url
      const m3u8 = await resolveByse(finalUrl.includes('hdsplay') ? finalUrl : url, async (u, o) => {
        const r = await fetchMeta(u, { ...o, headers: { ...(o && o.headers), Referer: `${BASE}/` } })
        return r ? { text: r.text, finalUrl: r.finalUrl } : null
      }, signal)
      if (m3u8) return { url: m3u8, type: 'hls' }
      return null
    }
    // dood / vidmoly / voe / streamtape / lulustream → résolveur générique
    const stream = await resolveStream(
      {
        url,
        headers: baseHeadersFor(url),
        title: `${PROVIDER} ${host}`,
        quality: 'HD',
      },
      0
    )
    if (stream && stream.url) {
      const type = /\.m3u8/i.test(stream.url) ? 'hls' : 'mp4'
      return { url: stream.url, type, resolved: stream }
    }
    return null
  } catch (e) {
    if (isAborted(signal)) throw e
    console.log(`[${PROVIDER}] resolve ${host} failed: ${e.message}`)
    return null
  }
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

  const series = await findSeries(titles, signal)
  if (!series) {
    console.log(`[${PROVIDER}] Not found on ADKami: ${tmdbId}`)
    return []
  }
  console.log(`[${PROVIDER}] Match: "${series.title}" (id ${series.id})`)

  const ficheHtml = await fetchPage(`${BASE}/anime/${series.id}`, { signal })
  if (!ficheHtml) return []
  const links = parseEpisodeLinks(ficheHtml, series.id)
  console.log(`[${PROVIDER}] ${links.length} variantes d'épisodes sur la fiche`)
  if (links.length === 0) return []

  const s = parseInt(season, 10) || 1
  const e = parseInt(episode, 10) || 1
  const variants = pickEpisodeLinks(links, s, e, computeOffsets(titles))
  if (variants.length === 0) {
    console.log(`[${PROVIDER}] Episode S${s}E${e} introuvable`)
    return []
  }
  console.log(`[${PROVIDER}] ${variants.length} variante(s) pour abs ${variants[0].absEp} : ${variants.map(v => v.lang + '/q' + v.qual + '/s' + v.server).join(', ')}`)

  // Sondage des variantes : les lecteurs tiers ne sont présents que sur une
  // fraction des pages (les autres = redirections officielles uniquement).
  let embeds = []
  let pageTitle = null
  let probed = 0
  for (const variant of variants.slice(0, 6)) {
    if (isBudgetExhausted(startTime, BUDGET_MS - RESERVE_MS)) break
    if (isAborted(signal)) break
    const epHtml = await fetchPage(variant.url, { signal })
    probed++
    if (!epHtml) continue
    const found = extractEmbeds(epHtml)
    if (found.length > 0) {
      embeds = found
      pageTitle = parseEpisodeTitle(epHtml)
      if (!pageTitle) pageTitle = { ep: variant.absEp, lang: variant.lang }
      console.log(`[${PROVIDER}] Embeds trouvés sur ${variant.url.replace(BASE, '')} (${variant.lang})`)
      break
    }
  }
  if (embeds.length === 0) {
    console.log(`[${PROVIDER}] 0 embed sur ${probed} variante(s) sondée(s) — uniquement redirections officielles`)
    return []
  }
  console.log(`[${PROVIDER}] ${embeds.length} embed(s): ${embeds.map(x => x.host).join(', ')}`)

  // Résolution séquentielle par priorité (budget serré)
  const streams = []
  for (const embed of embeds.slice(0, 4)) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) break
    if (isAborted(signal)) break
    const result = await resolveEmbed(embed, startTime, signal)
    if (!result || !result.url) continue
    const langLabel = (pageTitle && pageTitle.lang) || variants[0].lang
    const langCode = normalizeLanguageCode(langLabel) || 'fr'
    const base = {
      name: `${PROVIDER} (${langLabel})`,
      title: `${PROVIDER} [${langLabel}] S${s}E${e} - ${series.title} (${embed.host})`,
      url: result.url,
      quality: 'HD',
      language: langCode,
      headers: { Referer: `${BASE}/`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' },
      type: result.type === 'hls' ? 'hls' : 'mp4',
    }
    if (result.resolved) {
      const { isDirect, originalUrl, ...clean } = result.resolved
      streams.push({ ...base, ...clean, provider: PROVIDER })
    } else {
      streams.push({ ...base, provider: PROVIDER })
    }
    if (streams.length >= 2) break // 2 streams max (priorité absolue)
  }

  console.log(`[${PROVIDER}] Done: ${streams.length} stream(s)`)
  return streams
}
