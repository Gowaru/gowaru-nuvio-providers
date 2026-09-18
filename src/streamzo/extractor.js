/**
 * Extractor Streamzo (streamzo.fr)
 *
 * Refonte :
 * - Recherche via l'API de suggestion du site (/api/web/suggest) qui renvoie
 *   l'href EXACT (film ou série), le kind, le titre, l'année et la qualité.
 *   L'ancienne génération de slugs (6 candidats × 2 chemins) ratait la majorité
 *   du catalogue et provoquait des mismatches.
 * - Décodage des échappements unicode (\u0026) : les master.m3u8 des embeds sont
 *   sérialisés en JSON, donc l'URL brute contenait des « \u0026 » littéraux et
 *   ne se lançait jamais dans le lecteur.
 * - Langues : data-lang des boutons d'épisode (vf / vostfr), plus de détection
 *   hasardeuse sur le HTML de la page.
 * - Aucun embed non résolu n'est retourné (convention : uniquement du jouable).
 */
import { fetchText, fetchJson, setCurrentSignal } from './http.js'
import { SITE, TIMEOUTS, LIMITS } from './config.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { resolveStream, isAborted, isBudgetExhausted, PROVIDER_BUDGET_MS } from '../utils/resolvers.js'
import { toSlug } from '../utils/dle-extractor.js'
import { createCache } from '../utils/cache.js'

const withCache = createCache('szs', 'Streamzo', { successTtl: 10 * 60_000, failureTtl: 30_000, maxSize: 120 })

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

// ─── Helpers texte / scoring ────────────────────────────────────────────────

/** Normalise pour comparaison : minuscules, sans accents ni ponctuation. */
function normalizeForMatch(value) {
  if (!value) return ''
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensOf(value) {
  return normalizeForMatch(value).split(' ').filter(Boolean)
}

/**
 * Score de similarité entre un titre TMDB et une suggestion du site.
 * 0 = aucun rapport. Utilise inclusion + recouvrement de tokens.
 */
function titleScore(wanted, candidate) {
  const a = normalizeForMatch(wanted)
  const b = normalizeForMatch(candidate)
  if (!a || !b) return 0
  if (a === b) return 100
  if (b === `${a} vostfr`) return 95
  if (a.length >= 5 && (b.includes(a) || a.includes(b))) return 70
  const ta = tokensOf(a)
  const tb = tokensOf(b)
  if (!ta.length || !tb.length) return 0
  let common = 0
  for (const t of ta) if (tb.includes(t)) common++
  const ratio = common / Math.max(ta.length, tb.length)
  if (ratio >= 0.6) return Math.round(40 + ratio * 30)
  if (ratio >= 0.4) return 25
  return 0
}

/**
 * Score global d'une suggestion : titre (meilleur des titres TMDB) + année + type.
 * Un mauvais `kind` est fortement pénalisé pour éviter film ↔ série.
 */
function scoreSuggestion(titles, suggestedYear, suggestion, wantSeries) {
  let best = 0
  const suggestionTitles = [suggestion.titre, suggestion.slug?.replace(/-/g, ' ')]
  for (const wanted of titles) {
    if (!wanted) continue
    for (const cand of suggestionTitles) {
      const s = titleScore(wanted, cand)
      if (s > best) best = s
    }
  }
  if (best === 0) return 0

  const isSeries = suggestion.content_type === 'series' || suggestion.kind === 'series'
  if (isSeries === wantSeries) best += 25
  else best -= 60

  const year = parseInt(suggestion.year, 10)
  const wantedYear = parseInt(suggestedYear, 10)
  if (year && wantedYear) {
    const diff = Math.abs(year - wantedYear)
    if (diff === 0) best += 30
    else if (diff === 1) best += 15
    else if (diff > 2) best -= 25
  }
  return best
}

// ─── Recherche ──────────────────────────────────────────────────────────────

function buildQueries(titles) {
  const queries = []
  const seen = new Set()
  for (const t of titles) {
    if (!t || typeof t !== 'string') continue
    // Les variantes TMDB ajoutent « Season 1 » : inutile pour une recherche texte
    const cleaned = t.replace(/\s+(saison|season)\s*\d+$/i, '').trim()
    if (cleaned.length < 2) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    queries.push(cleaned)
    if (queries.length >= LIMITS.MAX_QUERIES) break
  }
  return queries
}

async function suggestFor(query, signal) {
  const url = `${SITE.SUGGEST_URL}?q=${encodeURIComponent(query)}`
  return withCache(`suggest_${query.toLowerCase()}`, async () => {
    const data = await fetchJson(url, { timeout: TIMEOUTS.SUGGEST, retries: 1, signal })
    const list = Array.isArray(data?.suggestions) ? data.suggestions : []
    return list.filter(s => s && typeof s.href === 'string' && s.href.startsWith('/'))
  })
}

/**
 * Trouve l'href exact d'un film/série via /api/web/suggest.
 * @returns {Promise<{href:string, kind:string, lang:string|null, quality:string|null}|null>}
 */
async function searchViaSuggest(titles, mediaType, suggestedYear, signal, startTime) {
  const wantSeries = mediaType === 'tv' || mediaType === 'series'
  const queries = buildQueries(titles)
  if (!queries.length) return null

  let best = null
  let bestScore = 0

  for (const q of queries) {
    if (isAborted(signal) || isBudgetExhausted(startTime, PROVIDER_BUDGET_MS)) break
    let list = []
    try {
      list = await suggestFor(q, signal)
    } catch (e) {
      if (e.name === 'AbortError') return null
      continue
    }
    for (const s of list) {
      const score = scoreSuggestion(titles, suggestedYear, s, wantSeries)
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }
    // Un score très élevé est déjà une certitude : inutile d'interroger les autres titres
    if (bestScore >= 110) break
  }

  if (!best || bestScore < LIMITS.MIN_SUGGEST_SCORE) {
    console.log(`[Streamzo] Suggest: aucun résultat suffisant (meilleur score ${bestScore})`)
    return null
  }

  const isSeries = best.content_type === 'series' || best.kind === 'series'
  console.log(`[Streamzo] Suggest: "${best.titre}" → ${best.href} (score ${bestScore})`)
  return {
    href: best.href,
    kind: isSeries ? 'series' : 'movie',
    title: best.titre || '',
    quality: best.resolution || best.quality || null,
  }
}

/** Dernier recours : ancienne génération de slugs (limitée, l'API est la référence). */
async function searchViaSlugs(titles, mediaType, signal, startTime) {
  const wantSeries = mediaType === 'tv' || mediaType === 'series'
  const slugs = []
  for (const t of titles) {
    if (!t) continue
    const slug = toSlug(t)
    if (slug && !slugs.includes(slug)) slugs.push(slug)
    if (slugs.length >= LIMITS.MAX_SLUG_FALLBACK) break
  }

  for (const slug of slugs) {
    if (isAborted(signal) || isBudgetExhausted(startTime, PROVIDER_BUDGET_MS)) return null
    const paths = wantSeries ? [`/series/${slug}`, `/${slug}`] : [`/${slug}`]
    for (const path of paths) {
      if (isAborted(signal)) return null
      const html = await fetchText(`${SITE.BASE_URL}${path}`, { timeout: TIMEOUTS.PAGE, retries: 0, signal })
      if (!html || html.length < 5000) continue
      const hasEpisodes = hasSeriesEpisodes(html)
      if (wantSeries && !hasEpisodes) continue
      const embedUrl = extractEmbedUrl(html)
      if (!hasEpisodes && !embedUrl) continue
      console.log(`[Streamzo] Fallback slug: ${path}`)
      return { href: path, kind: hasEpisodes ? 'series' : 'movie' }
    }
  }
  return null
}

// ─── Analyse des pages ──────────────────────────────────────────────────────

/**
 * Extrait l'URL embed depuis la page d'un film.
 * Le site utilise <button id="player-facade" data-embed="/embed/host/id">.
 */
function extractEmbedUrl(html) {
  if (!html) return null

  const facadeMatch = html.match(/id=["']player-facade["'][^>]*data-embed=["']([^"']+)["']/i)
  if (facadeMatch) return facadeMatch[1]

  // data-embed peut précéder l'id selon la version du template
  const facadeReverse = html.match(/data-embed=["']([^"']+)["'][^>]*id=["']player-facade["']/i)
  if (facadeReverse) return facadeReverse[1]

  const iframeMatch = html.match(/<iframe[^>]*id=["']video-frame["'][^>]*src=["']([^"']+)["']/i)
  if (iframeMatch) return iframeMatch[1]

  const embedMatch = html.match(/<iframe[^>]*src=["']([^"']*\/embed\/[^"']+)["']/i)
  if (embedMatch) return embedMatch[1]

  const playerMatch = html.match(/id=["']player["'][^>]*>[\s\S]*?<iframe[^>]*src=["']([^"']+)["']/i)
  if (playerMatch) return playerMatch[1]

  return null
}

/** Détecte la présence de boutons d'épisode (page série). */
function hasSeriesEpisodes(html) {
  if (!html) return false
  return /class=["'][^"']*\bsd-ep\b/.test(html)
}

/**
 * Recense les variantes (langue) d'un épisode donné.
 * Les boutons <button class="sd-ep" data-season data-lang data-ep data-src> sont
 * multi-lignes : on lit chaque attribut indépendamment de l'ordre.
 * @returns {Array<{embedUrl:string, lang:string}>} triées VF d'abord
 */
function findSeriesEpisodes(html, season, episode) {
  if (!html) return []

  // Convention app TV : season=null + numéro d'épisode (IDs anime absolus,
  // ex. kitsu:12345:5). On tolère alors n'importe quelle saison portant ce
  // numéro d'épisode (les listes du site sont courtes, risque de faux
  // cross-saison négligeable face à un 0 systématique).
  const seasonFilter = parseInt(season, 10)
  const targetEpisode = parseInt(episode, 10)
  const buttons = html.match(/<button\b[^>]*class=["'][^"']*\bsd-ep\b[^"']*["'][^>]*>/gi) || []

  const found = new Map()
  for (const el of buttons) {
    const s = el.match(/data-season=["']?(\d+)/i)
    const e = el.match(/data-ep=["']?(\d+)/i)
    const src = el.match(/data-src=["']([^"']+)["']/i)
    if (!s || !e || !src) continue
    if (Number.isFinite(seasonFilter) && parseInt(s[1], 10) !== seasonFilter) continue
    if (parseInt(e[1], 10) !== targetEpisode) continue

    const langRaw = (el.match(/data-lang=["']([^"']+)["']/i)?.[1] || '').toLowerCase()
    const lang = langRaw === 'vostfr' ? 'VOSTFR' : langRaw === 'vf' ? 'VF' : (langRaw ? langRaw.toUpperCase() : 'VF')
    if (!found.has(lang)) found.set(lang, { embedUrl: src[1], lang })
  }

  const order = ['VF', 'VOSTFR']
  const variants = [...found.values()].sort((a, b) => {
    const ia = order.indexOf(a.lang)
    const ib = order.indexOf(b.lang)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  return variants.slice(0, LIMITS.MAX_LANGS)
}

/**
 * Décode les échappements unicode d'un HTML/JS (\u0026, \u003d, …).
 * Indispensable : les master.m3u8 des embeds sont sérialisés en JSON, donc
 * l'URL brute contient « \u0026 » et n'est pas lisible par le lecteur.
 */
function decodeUnicodeEscapes(text) {
  if (!text) return ''
  return text
    .replace(/\\u0026/gi, '&')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/\\\//g, '/')
}

/**
 * Extrait les URLs de flux candidates de la page embed (master.m3u8 en premier).
 */
function extractDirectUrls(embedHtml) {
  if (!embedHtml) return []
  const decoded = decodeUnicodeEscapes(embedHtml)
  const urls = []
  const seen = new Set()

  const matches = [
    ...decoded.matchAll(/https?:\/\/[^"'<>\s\\]+\.m3u8[^"'<>\s\\]*/gi),
    ...decoded.matchAll(/https?:\/\/[^"'<>\s\\]+\.mp4[^"'<>\s\\]*/gi),
  ]
  for (const m of matches) {
    let url = m[0].replace(/[,;]+$/, '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }

  // Les manifests « master » d'abord (multi-qualités), puis les médias directs
  urls.sort((a, b) => {
    const ma = /master\.m3u8/i.test(a) ? 0 : /\.m3u8/i.test(a) ? 1 : 2
    const mb = /master\.m3u8/i.test(b) ? 0 : /\.m3u8/i.test(b) ? 1 : 2
    return ma - mb
  })
  return urls
}

/** Absolutise une URL relative retournée par la page. */
function absolutize(url) {
  if (!url) return null
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `${SITE.BASE_URL}${url}`
  if (!/^https?:/i.test(url)) return `${SITE.BASE_URL}/${url}`
  return url
}

/**
 * Construit l'objet stream final.
 * `language` porte le label BRUT (VF/VOSTFR) : la dédup de createProvider et
 * expandStreamQualities s'appuient dessus avant normalisation en code app.
 */
function buildStream(url, quality, lang) {
  const label = lang || 'VF'
  const resolvedQuality = quality && /\d{3,4}p/.test(quality) ? quality : (quality || 'HD')
  return {
    name: `Streamzo (${label})`,
    title: `Streamzo [${label}]${resolvedQuality !== 'HD' ? ` - ${resolvedQuality}` : ''}`,
    url,
    quality: resolvedQuality,
    language: label,
    type: /\.m3u8/i.test(url) ? 'hls' : /\.mp4/i.test(url) ? 'mp4' : undefined,
    headers: {
      Referer: `${SITE.BASE_URL}/`,
      'User-Agent': USER_AGENT,
    },
  }
}

/**
 * Résout un embed du site en flux jouable.
 * Retourne null si aucun flux exploitable (jamais d'embed brut : ExoPlayer ne
 * sait pas lire une page HTML, les apps afficheraient une source morte).
 */
async function resolveEmbedToStream(embedUrl, quality, lang, signal, startTime) {
  if (isAborted(signal)) return null
  const fullEmbedUrl = absolutize(embedUrl)
  if (!fullEmbedUrl) return null

  try {
    const embedHtml = await fetchText(fullEmbedUrl, { timeout: TIMEOUTS.EMBED, retries: 0, signal })
    if (isAborted(signal) || isBudgetExhausted(startTime, PROVIDER_BUDGET_MS)) return null

    const candidates = extractDirectUrls(embedHtml)
    if (!candidates.length) {
      console.log(`[Streamzo] Aucun flux dans l'embed ${fullEmbedUrl.slice(0, 80)}`)
      return null
    }

    for (const url of candidates) {
      try {
        const resolved = await resolveStream(buildStream(url, quality, lang))
        if (resolved && resolved.url && resolved.isDirect) {
          return { ...buildStream(url, quality, lang), ...resolved }
        }
      } catch (e) {
        if (e.name === 'AbortError') return null
      }
    }

    // Les manifests HLS tokenisés sont déjà directs : on renvoie le premier
    // candidat même si le peeler a échoué sur un host inconnu.
    return buildStream(candidates[0], quality, lang)
  } catch (e) {
    if (e.name === 'AbortError') return null
    console.warn(`[Streamzo] Résolution embed échouée: ${e.message}`)
    return null
  }
}

/** Complète/écrase le label de langue depuis le slug (-vostfr) ou le data-lang. */
function refineLangFromSlug(lang, href) {
  if (href && /-vostfr(\/|$|\?)/i.test(href)) return 'VOSTFR'
  return lang
}

// ─── Entrée ─────────────────────────────────────────────────────────────────

/**
 * Extrait les streams d'un film/série sur streamzo.fr
 *
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number|string} [season]
 * @param {number|string} [episode]
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array>}
 */
export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  const startTime = Date.now()
  const wantSeries = mediaType === 'tv' || mediaType === 'series'

  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const year = titles._metadata?.year || ''

  let match = await searchViaSuggest(titles, mediaType, year, signal, startTime)
  if (!match) match = await searchViaSlugs(titles, mediaType, signal, startTime)
  if (!match) {
    console.log(`[Streamzo] Contenu introuvable pour TMDB ${tmdbId}`)
    return []
  }

  if (isAborted(signal) || isBudgetExhausted(startTime, PROVIDER_BUDGET_MS)) return []

  const pageUrl = `${SITE.BASE_URL}${match.href}`
  const html = await fetchText(pageUrl, { timeout: TIMEOUTS.PAGE, retries: 1, signal })
  if (!html || html.length < 1000) {
    console.log(`[Streamzo] Page vide: ${pageUrl}`)
    return []
  }

  console.log(`[Streamzo] Page ${match.kind}: ${pageUrl}`)

  // ── Film : l'embed de la page suffit ──
  if (match.kind === 'movie') {
    const embedUrl = extractEmbedUrl(html)
    if (!embedUrl) {
      console.log(`[Streamzo] Aucun embed sur ${pageUrl}`)
      return []
    }
    const lang = refineLangFromSlug('VF', match.href)
    const stream = await resolveEmbedToStream(embedUrl, match.quality, lang, signal, startTime)
    return stream ? [stream] : []
  }

  // ── Série : chercher l'épisode (saison + numéro exacts, jamais d'approximation) ──
  if (!wantSeries) return []

  const variants = findSeriesEpisodes(html, season, episode)
  if (!variants.length) {
    console.log(`[Streamzo] Épisode ${season != null ? `S${season}` : 'abs'}E${episode} absent de ${pageUrl}`)
    return []
  }

  const results = await Promise.allSettled(
    variants.map(v => resolveEmbedToStream(v.embedUrl, match.quality, refineLangFromSlug(v.lang, match.href), signal, startTime))
  )

  // Dédup par chemin CDN : les embeds VF/VOSTFR du site résolvent parfois
  // vers le MÊME fichier (seul le token ?t= diffère). Garder la 1re variante
  // de chaque chemin évite de servir 2× le même flux sous 2 labels.
  const streams = []
  const seenPaths = new Set()
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    let pathKey = r.value.url || ''
    try {
      const u = new URL(pathKey)
      pathKey = `${u.host}${u.pathname}`
    } catch { /* URL invalide : on garde l'URL brute comme clé */ }
    if (seenPaths.has(pathKey)) continue
    seenPaths.add(pathKey)
    streams.push(r.value)
  }
  console.log(`[Streamzo] S${season}E${episode}: ${streams.length} flux (${variants.map(v => v.lang).join(', ')})`)
  return streams
}
