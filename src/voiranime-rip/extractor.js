import cheerio from 'cheerio-without-node-native'
import { fetchText, postSearch, setCurrentSignal, extractEmbedViaSite } from './http.js'
import { getTmdbTitles } from '../utils/metadata.js'
import {
  normalize, scoreMatch, resolveWithTimeout, detectSubType, toStream, parseAvailableSeasons, stripSeasonSuffix, resolveTargetEpisodes,
} from '../utils/dle-extractor.js'
import { createCache } from '../utils/cache.js'
import { isAborted } from '../utils/resolvers.js'
import {
  SITE, PATTERNS, TIMEOUTS, SCORES,
  MAX_SEARCH_TITLES,
} from './config.js'

/**
 * Validate a fallback match: the result title must share at least 2 significant
 * words (length > 3) with the original TMDB title to prevent false positives.
 * e.g. "Reincarnation" matches "Reincarnation no Kaben" (1 word) ❌
 *      "Reincarnation" matches "Mushoku Tensei: Jobless Reincarnation" (1 word) ❌
 *      "Slime" matches "Moi quand je me réincarne en Slime" (1 word) ✅ but unique enough
 */
function validateFallbackMatch(resultTitle, originalTitles) {
  const resultWords = new Set(normalize(resultTitle).split(/\s+/).filter(w => w.length > 3))
  // Union de tous les mots des titres TMDB : un mot du résultat absent de
  // cette union trahit un AUTRE contenu ("Godzilla : La planète des monstres"
  // vs "Godzilla Minus One").
  const titleWordUnion = new Set()
  for (const t of originalTitles || []) {
    for (const w of normalize(stripSeasonSuffix(t)).split(/\s+/)) {
      if (w.length > 3) titleWordUnion.add(w)
    }
  }
  // Forme « collée » : le site écrit parfois "LAttaque des Titans" là où TMDB
  // donne "L'Attaque des Titans" → aucun mot ne coïncide mot à mot.
  const compactResult = normalize(resultTitle).replace(/\s+/g, '')

  for (const title of originalTitles) {
    const cleanTitle = stripSeasonSuffix(title)
    const titleWords = normalize(cleanTitle).split(/\s+/).filter(w => w.length > 3)

    // Count overlapping significant words
    let overlap = 0
    for (const w of titleWords) {
      if (resultWords.has(w)) overlap++
    }

    // Titre composé : exiger TOUS les mots (sinon "Fight" validait
    // "Fight League" pour "Fight Club" → faux flux).
    if (titleWords.length >= 2) {
      if (overlap >= titleWords.length) return true
    } else if (overlap >= 1) {
      // Titre d'un seul mot ("Godzilla -1.0") : le résultat ne doit contenir
      // aucun mot étranger aux titres TMDB.
      const foreign = [...resultWords].filter(w => !titleWordUnion.has(w))
      if (foreign.length === 0) return true
    }

    const compactTitle = normalize(cleanTitle).replace(/\s+/g, '')
    if (compactTitle.length >= 6 && compactResult.includes(compactTitle)) return true
  }

  return false
}

function parseSearchResults(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  const results = []

  $('a.va-search-result').each((_, el) => {
    const href = $(el).attr('href') || ''
    const title = $(el).find('.va-search-result-title').first().text().trim()
    if (!href || !title) return

    const slugMatch = href.match(PATTERNS.SLUG)
    if (!slugMatch) return

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      slug: slugMatch[1],
      title,
    })
  })

  return results
}

/**
 * Detect language from a page URL or content
 */
function detectLanguage(html) {
  const $ = cheerio.load(html)

  // Check title
  const title = $('title').text().toLowerCase()
  if (/\bvostfr\b/.test(title)) return 'VOSTFR'
  if (/\bvf\b/.test(title) && !/\bvostfr\b/.test(title)) return 'VF'

  // Check page content (first 5000 chars)
  const body = $('body').text().toLowerCase().slice(0, 5000)
  const hasVostfr = /\bvostfr\b/.test(body)
  const hasVf = /\bvf\b/.test(body)
  
  if (hasVostfr && !hasVf) return 'VOSTFR'
  if (hasVf && !hasVostfr) return 'VF'

  return null
}

/**
 * Le site expose TOUS ses lecteurs dans un objet JS inline :
 *   const readers = {"vostfr":["https:\/\/…","https:\/\/…"],"vf":[…]};
 * Les deux langues sont présentes sur la page, même si le site redirige
 * /episode-N/ vers /episode-N/vf/ (ou /vostfr/). L'ancien regex ne capturait
 * que la PREMIÈRE URL de chaque langue (et ignorait les tableaux) → un seul
 * CDN et une seule langue servis.
 */
function parseReadersObject(html) {
  const out = []
  const m = /readers\s*=\s*(\{[\s\S]*?\})\s*;/.exec(html)
  if (!m) return out

  let parsed = null
  try {
    parsed = JSON.parse(m[1].replace(/\\\//g, '/'))
  } catch (e) {
    parsed = null
  }

  if (parsed && typeof parsed === 'object') {
    for (const key of Object.keys(parsed)) {
      const k = key.toLowerCase()
      const lang = k.includes('vostfr') ? 'VOSTFR' : (k === 'vf' ? 'VF' : null)
      if (!lang || !Array.isArray(parsed[key])) continue
      for (const u of parsed[key]) {
        if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) {
          out.push({ url: u.trim(), lang })
        }
      }
    }
    return out
  }

  // Objet illisible (JSON invalide) : extraction par langue, toutes les URLs
  const langRe = /["']?(vostfr|vf)["']?\s*:\s*\[([\s\S]*?)\]/gi
  let lm
  while ((lm = langRe.exec(m[1])) !== null) {
    const lang = lm[1].toLowerCase() === 'vf' ? 'VF' : 'VOSTFR'
    const urlRe = /["'](https?:\\?\/\\?\/[^"']+)["']/g
    let um
    while ((um = urlRe.exec(lm[2])) !== null) {
      out.push({ url: um[1].replace(/\\\//g, '/'), lang })
    }
  }
  return out
}

/**
 * Langue annoncée par la page : libellé des lecteurs ("4 lecteurs · VOSTFR"),
 * `<title>` ("… Episode 2 en streaming VF"), sinon indice d'URL.
 */
function pageLanguageHint(html, fallback) {
  const $ = cheerio.load(html)
  const label = $('#vrReadersLabel').first().text().toLowerCase()
  if (/vostfr/.test(label)) return 'VOSTFR'
  if (/\bvf\b/.test(label)) return 'VF'
  const title = $('title').first().text().toLowerCase()
  if (/vostfr/.test(title)) return 'VOSTFR'
  if (/\bvf\b/.test(title)) return 'VF'
  return fallback || null
}

function parseVideoUrls(html, langHint = null) {
  const urls = []
  if (!html) return urls
  const $ = cheerio.load(html)
  const hint = pageLanguageHint(html, langHint)

  // 1. Objet `readers` (ancien template : les DEUX langues sur la même page)
  urls.push(...parseReadersObject(html))

  // 2. Nouveau template : <select id="epLecteurSelect"><option value="https://…">
  //    Une seule langue par page (celle de l'URL) → `langHint` est essentiel.
  //    `data-player-type="af-hls"` = lecteur HLS maison (ansembed) : prioritaire.
  $('select#epLecteurSelect option, select#epLecteurSelect2 option, select[id*="ecteur"] option').each((_, el) => {
    const value = ($(el).attr('value') || '').trim()
    if (!/^https?:\/\//i.test(value) || /about:blank/i.test(value)) return
    const type = ($(el).attr('data-player-type') || '').toLowerCase()
    urls.push({
      url: value,
      lang: hint,
      _playerType: type,
      _sitePlayer: type === 'af-hls' || /voiranime player/i.test($(el).text()),
      _restricted: ($(el).attr('data-restricted') || '') === 'true',
    })
  })

  // 3. Extract default iframe src (episode pages use #videoPlayer, movie pages use .video-wrapper iframe)
  let iframeSrc = $('#videoPlayer').attr('src')
  if (!iframeSrc || /about:blank/i.test(iframeSrc)) {
    iframeSrc = $('.video-wrapper iframe').first().attr('src')
  }
  if (iframeSrc && !/about:blank/i.test(iframeSrc)) {
    urls.push({ url: iframeSrc, lang: hint, _fromIframe: true })
  }

  // 3. Extract language-specific URLs from JS inline object (ancien format)
  // Patterns: vostfr: 'https://...' OR "vostfr":"https://..." (JSON format)
  const text = $('script').text()
  const regex = /['"]?(vostfr|vf)['"]?\s*[:=]\s*['"]?(https?:\/\/[^'\"\s;,}]+)/gi
  let m
  while ((m = regex.exec(text)) !== null) {
    const lang = m[1].toLowerCase() === 'vf' ? 'VF' : 'VOSTFR'
    // Don't skip duplicates here — dedup by URL + lang happens in step 4
    urls.push({ url: m[2], lang })
  }

  // 5. Marque l'URL du lecteur maison (ansembed) si elle apparaît aussi en
  //    doublon dans le <select> (option af-hls + option iframe).
  const sitePlayerUrls = new Set(urls.filter(u => u._sitePlayer).map(u => u.url))

  // 4. Deduplicate by URL, keeping the entry with the more specific language label.
  // Iframe gets labeled by detectLanguage (often wrong), JS regex labels are authoritative.
  const urlMap = new Map()
  for (const u of urls) {
    const existing = urlMap.get(u.url)
    if (!existing) {
      urlMap.set(u.url, u)
    } else {
      // Prefer the entry with an explicit lang from JS regex over detectLanguage fallback
      const existingExplicit = ['VF', 'VOSTFR'].includes(existing.lang) && !existing._fromIframe
      const newExplicit = ['VF', 'VOSTFR'].includes(u.lang) && !u._fromIframe
      if (newExplicit && !existingExplicit) {
        urlMap.set(u.url, u)
      }
    }
  }
  urls.length = 0
  urls.push(...urlMap.values())

  // If we still have URLs without explicit lang, apply page detection
  if (urls.some(u => !u.lang)) {
    const pageLang = hint || detectLanguage(html)
    if (pageLang) {
      for (const u of urls) {
        if (!u.lang) u.lang = pageLang
      }
    }
  }

  // Le lecteur maison d'abord (résolution la plus fiable/rapide)
  urls.sort((a, b) => Number(!!sitePlayerUrls.has(b.url)) - Number(!!sitePlayerUrls.has(a.url)))

  return urls
}

/**
 * Generate short fallback queries from a title for sites whose search engine
 * doesn't return results for long/verbose queries.
 * e.g. "Moi, quand je me réincarne en Slime" → ["Slime", "en Slime", "Moi"]
 */
function generateFallbackQueries(titles) {
  const seen = new Set()
  const fallbacks = []

  for (const title of titles) {
    const words = title.split(/\s+/).filter(w => w.length > 2)
    
    // Last word (usually the most distinctive: "Slime", "Titan", "Man", etc.)
    if (words.length >= 2) {
      const lastWord = words[words.length - 1]
      if (!seen.has(lastWord) && lastWord.length >= 3) {
        seen.add(lastWord)
        fallbacks.push(lastWord)
      }
      
      // Last 2 words for slightly more context
      const lastTwo = words.slice(-2).join(' ')
      if (!seen.has(lastTwo) && lastTwo.split(' ').every(w => w.length >= 3)) {
        seen.add(lastTwo)
        fallbacks.push(lastTwo)
      }
    }
    
    // First word (title-specific: "Moi", "That", "One", "Attack")
    if (words.length >= 1) {
      const firstWord = words[0]
      if (!seen.has(firstWord) && firstWord.length >= 3 && firstWord.length <= 8) {
        seen.add(firstWord)
        fallbacks.push(firstWord)
      }
    }

    // Stop once we have enough fallback queries
    if (fallbacks.length >= 4) break
  }

  return fallbacks
}

/**
 * Search for anime on Voiranime.rip
 * Returns ALL high-scoring results (deduplicated by slug) so callers can
 * try multiple variants (VF/VOSTFR, different slug patterns).
 */
async function searchAnime(titles) {
  // Step 1: Try normal title queries
  for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      const result = await trySearchQuery(title, false, titles)
      if (result) return result
    } catch (e) {
      console.warn(`[VoiranimeRip] Search failed for "${title}": ${e.message}`)
    }
  }

  // Step 2: Fallback — try short keyword queries (the site's search engine
  // often fails on long/exact titles but works with short distinctive words)
  console.log(`[VoiranimeRip] No results with full titles, trying short fallback queries...`)
  const fallbackQueries = generateFallbackQueries(titles)
  for (const query of fallbackQueries) {
    try {
      const result = await trySearchQuery(query, true, titles)
      if (result) {
        console.log(`[VoiranimeRip] Fallback query "${query}" succeeded!`)
        return result
      }
    } catch (e) {
      console.warn(`[VoiranimeRip] Fallback search failed for "${query}": ${e.message}`)
    }
  }

  // Step 3: Direct slug probing with compacted Japanese variants
  // Les titres japonais de TMDB séparent souvent les mots ("San Shimai")
  // alors que les sites les écrivent en un seul bloc ("Sanshimai").
  // On essaie des slugs générés avec des mots compacts.
  const firstTitle = titles[0]
  if (firstTitle) {
    // Slugs « normaux » (titre TMDB → slug du site) : indispensable quand la
    // recherche échoue à cause de l'apostrophe ("L'Attaque des Titans" →
    // `/lattaque-des-titans/`), cas fréquent des titres FR.
    const normalSlugs = []
    // Générer des slugs compactés (coller les mots de ≤3 lettres au mot suivant)
    const compactedSlugs = []
    const normalizeForSlug = (t) => t
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[':!.,?()\[\]]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
    
    for (const t of titles.slice(0, 3)) {
      const normalized = normalizeForSlug(t)
      if (!normalized) continue
      
      // Slug normal: avec tirets standards
      const normalSlug = normalized.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      if (normalSlug.length > 3) normalSlugs.push(normalSlug)
      
      // Slug compacté: générer plusieurs variantes de fusion
      // Ex: "Mikadono San Shimai wa Angai Choroi" → plusieurs slugs candidats
      // dont "mikadono-sanshimai-wa-angai-choroi" (un mot court collé au suivant)
      const words = normalized.split(/\s+/).filter(Boolean)
      if (words.length >= 3) {
        // Trouver les positions des mots courts (≤3 lettres, pas le dernier)
        const shortPos = []
        for (let i = 0; i < words.length - 1; i++) {
          if (words[i].length <= 3) shortPos.push(i)
        }
        
        if (shortPos.length > 0) {
          const variants = []
          
          // Variante: coller chaque mot court individuellement au suivant
          for (const pos of shortPos) {
            const parts = [...words]
            parts[pos] = parts[pos] + parts[pos + 1]
            parts.splice(pos + 1, 1)
            variants.push(parts.join('-'))
          }
          
          // Variante: coller TOUS les mots courts
          if (shortPos.length > 1) {
            const parts = [...words]
            let offset = 0
            for (const pos of shortPos) {
              const actualPos = pos - offset
              parts[actualPos] = parts[actualPos] + parts[actualPos + 1]
              parts.splice(actualPos + 1, 1)
              offset++
            }
            variants.push(parts.join('-'))
          }
          
          // Ajouter les variantes uniques et différentes du slug normal
          for (const v of [...new Set(variants)]) {
            if (v && v !== normalSlug && v.length > 3) {
              compactedSlugs.push(v)
            }
          }
        }
      }
    }
    
    const uniqueSlugs = [...new Set([...normalSlugs, ...compactedSlugs])]
    if (uniqueSlugs.length > 0) {
      console.log(`[VoiranimeRip] Trying ${uniqueSlugs.length} slug(s): ${uniqueSlugs.slice(0, 3).join(', ')}...`)
      
      for (const slug of uniqueSlugs) {
        try {
          const url = `${SITE.BASE_URL}/${slug}/`
          const html = await fetchText(url, { timeout: 3000 })
          // Une fiche liste des saisons/sagas : évite de prendre la page
          // « introuvable » (soft 404 WordPress, ~550 octets) pour un match.
          if (html && html.length > 200 && /(?:saison-|saga-)/.test(html)) {
            console.log(`[VoiranimeRip] Compacted slug match: /${slug}/`)
            return [{
              url,
              slug,
              title: slug.replace(/-/g, ' '),
              score: 100,
            }]
          }
        } catch (e) {
          console.log(`[VoiranimeRip] Compacted slug /${slug}/ → not found`)
        }
      }
    }
  }

  return []
}

/**
 * Try a single search query and return top-scoring results if any match.
 * @param {string} query - The search query
 * @param {boolean} [isFallback=false] - If true, relaxes the scoring threshold
 *   since short queries can't reach EXACT_MATCH but still return valid results.
 */
async function trySearchQuery(query, isFallback = false, originalTitles = null) {
  const cleanQuery = stripSeasonSuffix(query)

  // La recherche du site est un LIKE sur la chaîne ENTIÈRE : « Demon Slayer:
  // Kimetsu no Yaiba » → 0 résultat, « Demon Slayer : Kimetsu no Yaiba » → OK,
  // et sanitizeSearchQuery (partagé) transforme « : » en espace. On essaie
  // donc la requête BRUTE, sa variante « : » espacée, puis la version sanitisée.
  const variants = []
  const addVariant = (q, raw) => {
    const v = String(q || '').trim()
    if (v.length < 3) return
    if (variants.some(x => x.q === v && x.raw === raw)) return
    variants.push({ q: v, raw })
  }
  addVariant(cleanQuery, true)
  if (cleanQuery.includes(':')) addVariant(cleanQuery.replace(/\s*:\s*/g, ' : '), true)
  addVariant(cleanQuery, false)

  let results = []
  for (const variant of variants) {
    const html = await postSearch(variant.q, { timeout: TIMEOUTS.SEARCH, raw: variant.raw })
    const parsed = parseSearchResults(html)
    if (parsed.length > 0) {
      results = parsed
      break
    }
  }
  if (results.length === 0) return null

  const nq = normalize(query)
  let scored = results
    .map(r => {
      let score = scoreMatch(r.title, query, SCORES) + getSpinoffPenalty(r.title)
      // Requête courte en suffixe d'un titre plus long : "Titans" ne doit pas
      // être bloqué par le garde-fou de tokens initiaux ("LAttaque des Titans").
      if (isFallback && nq && normalize(r.title).endsWith(` ${nq}`)) {
        score = Math.max(score, SCORES.STRONG_MATCH)
      }
      return { ...r, score }
    })
    .filter(r => r.score >= SCORES.MIN_MATCH)
    .sort((a, b) => b.score - a.score)

  // For normal queries: EXACT_MATCH threshold ensures high confidence
  // For fallback queries: use MIN_MATCH since short keywords can't reach
  //   EXACT_MATCH but the site's own search already filtered for relevance.
  //   The queries are ordered by distinctiveness (last word first), so
  //   the most specific query tries first and finds the correct result.
  const threshold = isFallback ? SCORES.MIN_MATCH : SCORES.EXACT_MATCH

  if (scored.length > 0 && scored[0].score >= threshold) {
    // For fallback queries, validate that the match shares enough words
    // with the ORIGINAL TMDB titles (not just the short fallback query)
    if (isFallback) {
      const validated = scored.filter(r => validateFallbackMatch(r.title, originalTitles || [query]))
      if (validated.length === 0) {
        console.log(`[VoiranimeRip] Fallback "${query}" scored ${scored[0].score} but failed word validation (false positive)`)
        return null
      }
      scored = validated
    }

    // Deduplicate by slug and return all top-scoring variants
    const bestScore = scored[0].score
    const seenSlugs = new Set()
    const topResults = scored.filter(r => {
      if (seenSlugs.has(r.slug)) return false
      if (r.score < bestScore - 20) return false
      seenSlugs.add(r.slug)
      return true
    })
    console.log(`[VoiranimeRip] Matched: "${topResults[0].title}" (slug: ${topResults[0].slug}) score: ${topResults[0].score}, ${topResults.length} variant(s)`)
    return topResults
  }

  return null
}

const SEASON_PATTERN = /\/saison-(\d+)\//g

/** Langues servies par le site : une page par langue. */
const LANG_PATHS = [
  { path: 'vf', label: 'VF' },
  { path: 'vostfr', label: 'VOSTFR' },
]

// Cache partagé LRU avec TTL auto (5min succès, 30s échecs)
const withCache = createCache('vr', 'VoiranimeRip')

/** Mots-clés de spin-off : ces titres sont pénalisés car ils ne contiennent
 *  pas les épisodes de la série principale (ex: "Junior High School", "Chibi") */
const SPINOFF_KEYWORDS = ['fan letter', 'log:', 'memories', 'vigilante', 'illegals', 'film', 'movie', 'special', 'oav', 'ona', 'x ut', 'collab', 'junior high', 'chibi', 'super deformed']

/**
 * Calcule une pénalité si le titre est un spin-off.
 * Retourne 0 si ce n'est pas un spin-off, -50 si c'en est un.
 */
function getSpinoffPenalty(title) {
  const t = (title || '').toLowerCase()
  return SPINOFF_KEYWORDS.some(k => t.includes(k)) ? -50 : 0
}

async function detectSubTypeCached(tmdbId, mediaType) {
  return withCache(`tmdb_subtype_${tmdbId}_${mediaType}`, () => detectSubType(tmdbId, mediaType))
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const subType = await detectSubTypeCached(tmdbId, mediaType)
  if (subType) console.log(`[VoiranimeRip] Detected subtype: ${subType}`)

  if (mediaType === 'movie') {
    return extractMovie(tmdbId, titles, subType)
  }
  return extractSeries(tmdbId, mediaType, titles, season, episode, subType)
}

async function extractMovie(tmdbId, titles, subType) {
  const matches = await searchAnime(titles)
  if (!matches || matches.length === 0) {
    console.warn(`[VoiranimeRip] Movie not found for TMDB ${tmdbId}`)
    return []
  }
  // Try each match (different slug variants) until we find streams
  for (const match of matches) {
    const result = await extractMoviePageStreams(match, subType)
    if (result.length > 0) return result
  }
  return []
}

async function extractMoviePageStreams(match, subType) {
  console.log(`[VoiranimeRip] Fetching movie page: ${match.url}`)

  try {
    const html = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    if (!html) {
      console.warn(`[VoiranimeRip] Empty response for movie page`)
      return []
    }

    // Les fiches films n'affichent presque jamais de lecteur : les sources
    // vivent sur `<fiche>film/episode-1/{vf,vostfr}/`. On y va SYSTÉMATIQUEMENT
    // dans les deux langues (avant : `break` au premier succès → VF perdue).
    const base = `${match.url.replace(/\/?$/, '/')}film/episode-1/`
    const pages = await fetchLangPages(base)
    if (html && parseVideoUrls(html).length > 0) pages.unshift({ url: match.url, html, lang: null })

    const videoUrls = []
    for (const p of pages) {
      for (const v of parseVideoUrls(p.html, p.lang)) videoUrls.push({ ...v, pageUrl: p.url })
    }

    if (videoUrls.length === 0) {
      console.warn(`[VoiranimeRip] No video URLs found on movie page`)
      return []
    }

    console.log(`[VoiranimeRip] Found ${videoUrls.length} video URL(s)`)

    const streams = await resolveVideoUrls(videoUrls, subType)

    // FIX "ne se lance jamais" : plus AUCUN fallback embed — un lecteur non
    // résolu est une page HTML que l'app ne peut pas lire (convention repo
    // wookafr/fluneo/coflix/frenchstream). 0 stream propre > faux stream.
    console.log(`[VoiranimeRip] Movie: ${streams.length} direct stream(s)`)
    return streams
  } catch (e) {
    console.warn(`[VoiranimeRip] Movie extraction failed: ${e.message}`)
  }
  return []
}

/**
 * Résout en parallèle les lecteurs d'une page (max 8) — sur Mobile/NuvioTV
 * récent, un hébergeur lent ne bloque plus toute la liste (avant : ~45 s pour
 * une page à 5 lecteurs).
 */
async function resolveVideoUrls(videoUrls, subType) {
  const queue = []
  const seen = new Set()
  // Hôtes murés côté serveur (ad-gate JS / restriction de domaine) : inutiles
  // à résoudre quand un autre lecteur est disponible (ils coûtent ~10-20 s).
  const DEAD_HOSTS = /smoothpre\.|oneupload\.|embed4me\./i
  const hasUsableHost = videoUrls.some(v => !DEAD_HOSTS.test(v.url))
  const candidates = hasUsableHost ? videoUrls.filter(v => !DEAD_HOSTS.test(v.url)) : videoUrls
  for (const v of candidates) {
    const lang = v.lang || 'VF'
    const key = `${v.url}|${lang}`
    if (seen.has(key)) continue
    seen.add(key)
    queue.push({ url: v.url, lang, pageUrl: v.pageUrl || null })
    if (queue.length >= 8) break
  }

  const settled = await Promise.allSettled(queue.map(async (v) => {
    const stream = toStream(v.url, v.lang, 'Voiranime-Rip', SITE.BASE_URL)
    if (subType) stream.subType = subType

    // Famille vidmoly/ansembed : on lance la résolution directe ET l'extracteur
    // PHP du site (`?vr_extract_embed=1`) EN PARALLÈLE. Le second sauve les
    // épisodes où ansembed throttle l'IP de l'appareil (constaté : direct qui
    // échoue alors que le serveur du site, lui, obtient le m3u8).
    const isSitePlayerHost = /ansembed\.|asnembed\.|vidmoly\.|voembed\./i.test(v.url)
    const directPromise = resolveWithTimeout(stream).catch(() => null)
    const phpPromise = (isSitePlayerHost && v.pageUrl)
      ? extractEmbedViaSite(v.pageUrl, v.url).catch(() => null)
      : Promise.resolve(null)

    const [directSettled, phpSettled] = await Promise.allSettled([directPromise, phpPromise])
    let resolved = directSettled.status === 'fulfilled' ? directSettled.value : null
    if (!(resolved && resolved.isDirect !== false && resolved.url)) {
      const m3u8 = phpSettled.status === 'fulfilled' ? phpSettled.value : null
      if (m3u8) {
        console.log(`[VoiranimeRip] ${v.url.replace(/^https?:\/\//, '').split('/')[0]} → m3u8 via extracteur du site`)
        resolved = { ...stream, url: m3u8, isDirect: true }
      }
    }

    if (!(resolved && resolved.isDirect !== false && resolved.url)) return null
    const { isDirect, originalUrl, ...clean } = resolved
    // Code langue normalisé (fr/ja) pour les filtres/tri NuvioTV
    clean.language = v.lang === 'VF' ? 'fr' : 'ja'
    return { ...clean, provider: 'voiranime-rip' }
  }))

  return settled
    .filter(s => s.status === 'fulfilled' && s.value)
    .map(s => s.value)
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  const targetEpisodeNums = await resolveTargetEpisodes(tmdbId, mediaType, season, episode)
  const absoluteEp = targetEpisodeNums.length > 1 ? targetEpisodeNums[1] : null

  const matches = await searchAnime(titles)
  if (!matches || matches.length === 0) {
    console.warn(`[VoiranimeRip] Series not found for TMDB ${tmdbId}`)
    return []
  }

  // Try each search match (different slug variants) with the requested season
  for (const match of matches) {
    const result = await extractEpisodeStreams(match, targetSeasonNum, parseInt(episode) || 1, subType)
    if (result.length > 0) {
      console.log(`[VoiranimeRip] Found streams with slug: ${match.slug}`)
      return result
    }
  }
  
  console.log(`[VoiranimeRip] Direct season S${targetSeasonNum} failed on all matches, trying fallback...`)

  // Step 1bis : navigation par la fiche. Certaines séries ne sont pas
  // découpées en `saison-N` mais en sagas à numérotation ABSOLUE
  // (ex. One Piece : /one-piece/saga-10-pays-des-wa-episode-878-a-1088/).
  // Sans ça, S3E1 d'un anime long = 404 → 0 stream (symptôme « épisodes
  // qui ne correspondent pas »).
  for (const match of matches) {
    const result = await extractFromFicheSections(match, targetSeasonNum, parseInt(episode) || 1, absoluteEp, subType)
    if (result.length > 0) {
      console.log(`[VoiranimeRip] Fiche navigation succeeded with slug: ${match.slug}`)
      return result
    }
  }

  // Step 2: Fallback - for each match, scrape the series page for available seasons
  for (const match of matches) {
    try {
      const seriesHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
      const availableSeasons = parseAvailableSeasons(seriesHtml, SEASON_PATTERN)

      if (availableSeasons.length === 0) {
        console.warn(`[VoiranimeRip] No seasons found on series page for slug: ${match.slug}`)
        continue
      }

      console.log(`[VoiranimeRip] Available seasons on site (${match.slug}): ${availableSeasons.join(', ')}`)

      const attempts = []

      // Try each available season with TMDB episode
      for (const siteSeason of availableSeasons) {
        attempts.push({ match, season: siteSeason, episode: parseInt(episode) || 1 })
      }

      // Also try absolute episode across seasons if available
      if (absoluteEp !== null && absoluteEp !== (targetEpisodeNums[0])) {
        for (const siteSeason of availableSeasons) {
          attempts.push({ match, season: siteSeason, episode: absoluteEp })
        }
      }

      if (attempts.length === 0) continue

      // Sequential resolution — prioritize matching season first, then others
      // FIX : cap du nombre de tentatives (un catalogue type Conan = 25+ saisons
      // → jusqu'à 50+ fetches séquentiels = timeout plugin garanti)
      let tried = 0
      const MAX_EPISODE_ATTEMPTS = 6
      for (const a of attempts) {
        if (tried >= MAX_EPISODE_ATTEMPTS) {
          console.log(`[VoiranimeRip] Attempt cap reached (${MAX_EPISODE_ATTEMPTS})`)
          break
        }
        tried++
        try {
          const result = await extractEpisodeStreams(a.match, a.season, a.episode, subType)
          if (result.length > 0) {
            console.log(`[VoiranimeRip] Fallback succeeded with S${a.season}E${a.episode}`)
            return result
          }
        } catch (e) {
          // skip failed attempt
        }
      }
    } catch (e) {
      console.warn(`[VoiranimeRip] Fallback error for slug ${match.slug}: ${e.message}`)
    }
  }

  console.warn(`[VoiranimeRip] Fallback failed: no streams found across any match/season`)
  return []
}

/**
 * Parse les « saisons » de la fiche : soit `saison-N`, soit des sagas
 * (`saga-10-…-episode-878-a-1088`) dont le slug porte la plage ABSOLUE
 * d'épisodes. Les variantes `kai-*` (version Kai, numérotation distincte)
 * sont écartées des candidats par défaut.
 */
function parseFicheSections(html, slug) {
  const out = []
  if (!html) return out
  const $ = cheerio.load(html)
  const prefix = `/${slug}/`
  const seen = new Set()

  $('a[href]').each((_, el) => {
    let href = ($(el).attr('href') || '').split('#')[0].split('?')[0]
    if (!href) return
    if (!href.startsWith('http')) href = `${SITE.BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`
    if (!href.startsWith(`${SITE.BASE_URL}${prefix}`)) return

    const segment = href.slice(`${SITE.BASE_URL}${prefix}`.length).replace(/\/+$/, '')
    if (!segment || segment.includes('/') || seen.has(segment)) return
    seen.add(segment)
    if (/^episode-\d/i.test(segment)) return

    const entry = { url: `${SITE.BASE_URL}${prefix}${segment}/`, segment, season: null, range: null }
    const sm = /^saison-(\d+)$/i.exec(segment)
    if (sm) entry.season = parseInt(sm[1], 10)
    const rm = /episode-(\d+)-a-(\d+)/i.exec(segment)
    if (rm) entry.range = [parseInt(rm[1], 10), parseInt(rm[2], 10)]
    out.push(entry)
  })

  return out
}

/**
 * Candidats d'URL d'épisode construits depuis la fiche, du plus probable au
 * moins probable (plage absolue > saison classique > sagas non datées).
 */
function ficheCandidateUrls(sections, targetSeason, episode, absoluteEp) {
  const cands = []
  const push = (url) => { if (url && !cands.includes(url)) cands.push(url) }

  // 1. Saison classique = numérotation TMDB
  const seasonEntry = sections.find(s => s.season === targetSeason)
  if (seasonEntry) push(`${seasonEntry.url}episode-${episode}/`)

  // 2. Fiche en SAGAS (pas de `saison-N`) : les numéros du site sont ABSOLUS.
  //    ⚠️ Bug historique : on cherchait d'abord la saga contenant l'épisode
  //    LOCAL → One Piece S20E1 (absolu 878) tombait sur la saga 1-61 et servait
  //    l'épisode 1 (symptôme « épisodes qui ne correspondent pas »).
  if (!seasonEntry) {
    if (absoluteEp) {
      for (const s of sections) {
        if (s.range && absoluteEp >= s.range[0] && absoluteEp <= s.range[1]) {
          push(`${s.url}episode-${absoluteEp}/`)
        }
      }
    }
    // Saga contenant le numéro local (fiches à numérotation locale, ou repli)
    for (const s of sections) {
      if (s.range && episode >= s.range[0] && episode <= s.range[1]) push(`${s.url}episode-${episode}/`)
    }
  } else {
    // Saga contenant le numéro local (fiche mixte : saison classique + sagas)
    for (const s of sections) {
      if (s.range && episode >= s.range[0] && episode <= s.range[1]) push(`${s.url}episode-${episode}/`)
    }
  }

  // 3. Saison classique avec le numéro absolu ArmSync
  if (seasonEntry && absoluteEp && absoluteEp !== episode) push(`${seasonEntry.url}episode-${absoluteEp}/`)

  // 4. Saga dont la plage contient le numéro absolu ArmSync (dernier recours)
  if (absoluteEp) {
    for (const s of sections) {
      if (s.range && absoluteEp >= s.range[0] && absoluteEp <= s.range[1]) {
        push(`${s.url}episode-${absoluteEp}/`)
      }
    }
  }

  // 5. Sagas sans plage dans le slug (hors Kai) : numéro absolu sinon local
  for (const s of sections) {
    if (s.range || s.season) continue
    if (/^kai-/i.test(s.segment)) continue
    push(`${s.url}episode-${absoluteEp || episode}/`)
  }

  return cands.slice(0, 5)
}

async function extractFromFicheSections(match, season, episode, absoluteEp, subType) {
  try {
    const html = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    if (!html) return []
    const sections = parseFicheSections(html, match.slug)
    if (sections.length === 0) return []
    console.log(`[VoiranimeRip] Fiche sections (${match.slug}): ${sections.map(s => s.segment).slice(0, 8).join(', ')}`)

    for (const url of ficheCandidateUrls(sections, season, episode, absoluteEp)) {
      // Le numéro attendu est systématiquement revérifié dans le titre de la
      // page : une URL valide mais correspondant à un AUTRE épisode est
      // rejetée (contenu qui ne correspond pas au titre demandé).
      const expected = /episode-(\d+)/.exec(url)
      const streams = await streamsFromEpisodeUrl(url, subType, expected ? parseInt(expected[1], 10) : null)
      if (streams.length > 0) {
        console.log(`[VoiranimeRip] Fiche candidate hit: ${url}`)
        return streams
      }
    }
  } catch (e) {
    console.warn(`[VoiranimeRip] Fiche navigation failed: ${e.message}`)
  }
  return []
}

/**
 * Vérifie que la page correspond bien à l'épisode demandé. Retourne true quand
 * aucun numéro n'est trouvé dans le titre (pas de faux négatif).
 */
function episodePageMatches(html, expectedEpisode) {
  if (!expectedEpisode) return true
  const src = html || ''

  // 1. JSON-LD TVEpisode/Episode : `"episodeNumber": N` (le plus fiable)
  const ld = /"@type"\s*:\s*"(?:TV)?Episode"[\s\S]{0,400}?"episodeNumber"\s*:\s*(\d+)/i.exec(src)
  if (ld) return parseInt(ld[1], 10) === expectedEpisode

  // 2. Titre de page (« … Episode 2 … »)
  const m = /<title>([\s\S]*?)<\/title>/i.exec(src)
  const title = (m ? m[1].replace(/&#\d+;|&[a-z]+;/gi, ' ') : '').toLowerCase()
  const nums = []
  const re = /(?:é|e)pisode\s*0*(\d+)/g
  let x
  while ((x = re.exec(title)) !== null) nums.push(parseInt(x[1], 10))
  if (nums.length === 0) return true
  return nums.includes(expectedEpisode)
}

/**
 * Une page d'épisode/film n'expose QUE la langue de son URL (`/vf/` ou
 * `/vostfr/`) sur le template récent. Les deux langues doivent donc être
 * récupérées explicitement, sinon la VF (ou la VOSTFR) manque.
 */
async function fetchLangPages(baseUrl) {
  const pages = []
  const settled = await Promise.allSettled(LANG_PATHS.map(async ({ path, label }) => {
    const url = `${baseUrl}${path}/`
    const html = await fetchText(url, { timeout: TIMEOUTS.PAGE })
    if (!html) return null
    return { url, html, lang: label }
  }))
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) pages.push(r.value)
  }
  return pages
}

async function streamsFromEpisodeUrl(episodeUrl, subType, expectedEpisode = null) {
  console.log(`[VoiranimeRip] Fetching episode: ${episodeUrl}`)

  try {
    const pages = await fetchLangPages(episodeUrl)
    if (pages.length === 0) {
      // Repli : URL sans langue → le site redirige vers la langue dispo.
      const html = await fetchText(episodeUrl, { timeout: TIMEOUTS.PAGE })
      if (!html) {
        console.warn(`[VoiranimeRip] Empty response for episode page`)
        return []
      }
      pages.push({ url: episodeUrl, html, lang: null })
    }

    const videoUrls = []
    for (const p of pages) {
      if (!episodePageMatches(p.html, expectedEpisode)) {
        console.warn(`[VoiranimeRip] Ep ${expectedEpisode} attendu, page différente → ignorée (${p.url})`)
        continue
      }
      for (const v of parseVideoUrls(p.html, p.lang)) videoUrls.push({ ...v, pageUrl: p.url })
    }
    if (videoUrls.length === 0) {
      console.warn(`[VoiranimeRip] No video URLs found on episode page`)
      return []
    }

    const langs = [...new Set(videoUrls.map(v => v.lang).filter(Boolean))]
    console.log(`[VoiranimeRip] Found ${videoUrls.length} video URL(s) [${langs.join('+') || '?'}]`)

    const streams = await resolveVideoUrls(videoUrls, subType)

    // FIX "ne se lance jamais" : plus AUCUN fallback embed (voir convention repo)
    console.log(`[VoiranimeRip] ${streams.length} direct stream(s)`)
    return streams
  } catch (e) {
    console.warn(`[VoiranimeRip] Episode extraction failed: ${e.message}`)
  }
  return []
}

async function extractEpisodeStreams(match, season, episode, subType) {
  const episodeUrl = `${SITE.BASE_URL}/${match.slug}/saison-${season}/episode-${episode}/`
  return streamsFromEpisodeUrl(episodeUrl, subType)
}
