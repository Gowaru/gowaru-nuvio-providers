import { fetchText, postForm, fetchJson, setCurrentSignal, probeFinalUrl } from './http.js'
import cheerio from 'cheerio-without-node-native'
import { resolveStream, safeFetch, withTimeout, isAborted } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { toStream, toSlug, normalize, resolveTargetEpisodes, stripSeasonSuffix, countExtraWords, hasForeignLeadingTokens } from '../utils/dle-extractor.js'
import {
  SITE, SELECTORS, PATTERNS, TIMEOUTS, SCORES,
  LANGUAGE_MAP, ANIME_GENRE_ID, ANIME_KEYWORDS,
  LECTEURVIDEO_LANG_SECTIONS, LECTEURVIDEO_KNOWN_HOSTS,
  MAX_CANDIDATES, MAX_SEARCH_TITLES,
  CACHE_NAMESPACE, CACHE_TAG,
} from './config.js'
import { createCache } from '../utils/cache.js'

const withCache = createCache(CACHE_NAMESPACE, CACHE_TAG)

function isJapanese(text) {
  return /[\u3000-\u9FFF\uF900-\uFAFF]/.test(text || '')
}

function scoreMatch(resultTitle, searchTitle) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr) return 0

  // Retire les infos de saison pour le matching (ex: "Saison 2")
  const cleanNr = nr.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').trim()
  const cleanNt = nt.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').trim()

  if (cleanNr === cleanNt || nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) {
    // Garde anti-homonymes (bug "Gate" → Steins;Gate/Stargate) : un token
    // significatif AVANT la requête ("steins", "star", "new"…) rejette.
    if (hasForeignLeadingTokens(nr, nt)) return 0
    // Pénalité anti-fan-edit : chaque mot significatif en trop dans le résultat
    // (ex: requête "Naruto" → résultat "Naruto Shippuden Kai" = 2 mots extra)
    // retire -25. Empêche les recuts/dérivés de battre le titre exact.
    const extra = countExtraWords(nr, nt)
    if (extra > 0) {
      return Math.max(SCORES.STRONG_MATCH - Math.min(extra * 25, SCORES.STRONG_MATCH - SCORES.MIN_MATCH - 5), 0)
    }
    return SCORES.STRONG_MATCH
  }

  const words = cleanNt.split(/\s+/).filter(w => w.length > 2)
  const rWords = new Set(cleanNr.split(/\s+/))
  const matched = words.filter(w => rWords.has(w)).length
  if (words.length > 0) {
    // Anti-false-positive: si la recherche a ≥2 mots significatifs mais que
    // le résultat en partage < 2, c'est probablement une série différente
    if (words.length >= 2 && matched < 2) return 0
    return Math.round((matched / words.length) * 50)
  }
  return 0
}

function bestMatch(items, title) {
  let best = null, bestScore = 0
  for (const item of items) {
    const score = scoreMatch(item.title || item.name, title)
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore >= SCORES.MIN_MATCH ? best : null
}

function parseSearchResults(html) {
  const $ = cheerio.load(html)
  const results = []
  $('article.moviecard').each((_, el) => {
    const $card = $(el)
    const link = $card.find('figure a[href]').first().attr('href')
    let title = ($card.find('figure img').first().attr('alt') || '').trim()
    if (link && title) {
      const isSeries = link.includes('/streaming/series/')
      results.push({ url: link, title, isSeries })
    }
  })
  return results
}

function extractNonce(html) {
  const m = html.match(PATTERNS.SM_PUBLIC)
  return m ? m[2] : null
}

// ─── TV-safe DOM helpers ────────────────────────────────────────────────────
// Le polyfill cheerio de NuvioTV n'a ni .hasClass() ni .closest() ni
// .parent() fonctionnel — feature-détecter ou parser en texte brut.

function safeHasClass($el, cls) {
  try {
    if (typeof $el.hasClass === 'function') return $el.hasClass(cls)
  } catch (_) {}
  // Fallback texte brut : attribut class de l'élément source
  try {
    const raw = $el && $el.length ? ($el[0] && $el[0].attribs && $el[0].attribs.class) || '' : ''
    return raw.split(/\s+/).includes(cls)
  } catch (_) {}
  return false
}

function parseSeasons(html) {
  const $ = cheerio.load(html)
  const seasons = []
  $(SELECTORS.SEASON_BUTTON).each((_, el) => {
    const id = $(el).attr('data-season')
    const title = $(el).text().trim()
    const isActive = safeHasClass($(el), 'active')
    if (id) seasons.push({ id, title, isActive })
  })
  return seasons
}

function parseEpisodes(html) {
  const $ = cheerio.load(html)
  const episodes = []

  $(SELECTORS.EPISODE_ITEM).each((_, el) => {
    const $item = $(el)
    const $link = $item.find(SELECTORS.EPISODE_LINK).first()
    const href = $link.attr('href') || ''
    const title = $link.find(SELECTORS.EPISODE_TITLE).first().text().trim() || $link.text().trim()
    const m = href.match(PATTERNS.EPISODE_URL)

    if (m) {
      const season = parseInt(m[1])
      const episode = parseInt(m[2])
      episodes.push({ season, episode, link: href, title })
    }
  })

  return episodes
}

function extractIframeUrl(html) {
  const $ = cheerio.load(html)
  let src = $(SELECTORS.MOVIE_IFRAME).first().attr('src')
  if (!src) src = $(SELECTORS.MOVIE_IFRAME_FALLBACK).first().attr('src')
  if (!src) src = $(SELECTORS.MOVIE_IFRAME_ANY).first().attr('src')
  if (!src) {
    const allIframes = $('iframe')
    for (let i = 0; i < allIframes.length; i++) {
      const s = $(allIframes[i]).attr('src')
      if (s && s.startsWith('http') && !s.includes('youtube.com') && !s.includes('youtu.be')) { src = s; break }
    }
  }
  if (src && src.startsWith('//')) src = 'https:' + src
  return src || null
}

// ─── lecteurvideo.com : parsing par sections de langue ─────────────────────
// L'embed classe ses serveurs dans des div class="OD OD_XX" (FR/VFF/VFQ/
// VOSTFR/EN…) avec les URLs en base64 dans onclick="showVideo('...')".
// L'onglet "Télécharger" (OD_down) contient des liens megaup/1fichier souvent
// morts (megaup 404 vérifié en live) — exclu de la sélection principale.

function decodeB64Url(token) {
  if (!token) return null
  try {
    let s = String(token).trim().replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4) s += '='
    let decoded = ''
    if (typeof atob === 'function') {
      decoded = atob(s)
    } else {
      return null
    }
    if (!/^https?:\/\//i.test(decoded)) return null
    return decoded
  } catch (_) { return null }
}

/**
 * Extrait TOUS les serveurs de toutes les sections de langue de l'embed
 * lecteurvideo.com. Retourne une liste de candidats :
 * { url, langTag, langLabel, host, priority }
 * - langue FR d'abord (VF > VFF > VFQ > VOSTFR > VO), serveur rapide ensuite
 * - onglet Télécharger ignoré (hosts morts/lents vérifiés)
 */
export function parseLecteurVideoServers(embedHtml) {
  const html = String(embedHtml || '')
  if (!html) return []

  const candidates = []
  // Découper par sections de langue : <div class="OD OD_FR ..."> ... </div>
  // (l'ordre du HTML place chaque section avant la suivante)
  const sectionRe = /class="OD\s+OD_([A-Za-z]+)[^"]*"/g
  const sections = []
  let m
  while ((m = sectionRe.exec(html)) !== null) {
    sections.push({ lang: m[1].toUpperCase(), start: m.index })
  }
  // Bornes de fin = début de la section suivante
  for (let i = 0; i < sections.length; i++) {
    sections[i].end = i + 1 < sections.length ? sections[i + 1].start : html.length
  }

  const LANG_ORDER = { VF: 0, VFF: 1, VFQ: 2, VOSTFR: 3, VO: 4, EN: 4 }
  const KNOWN = LECTEURVIDEO_KNOWN_HOSTS

  for (const sec of sections) {
    const langTag = LECTEURVIDEO_LANG_SECTIONS[sec.lang]
    // OD_down = onglet Télécharger → ignoré (megaup/1fichier morts ou lents)
    if (!langTag) continue
    const chunk = html.slice(sec.start, sec.end)
    let sm
    // showVideo('BASE64') — parfois avec un 2e argument (qualité/priorité)
    const svRe = /showVideo\(\s*['"]([A-Za-z0-9+/=_-]+)['"]\s*(?:,\s*['"]?(\d+)['"]?)?\s*\)/g
    while ((sm = svRe.exec(chunk)) !== null) {
      const url = decodeB64Url(sm[1])
      if (!url) continue
      const lower = url.toLowerCase()
      // Filtrer : hosts connus uniquement, pas d'images/pubs
      if (!KNOWN.some(k => lower.includes(k))) continue
      if (/\.(png|jpe?g|gif|webp|css|js)(\?|$)/i.test(lower)) continue
      // Priorité serveur : les embeds rapides d'abord (résolus en direct par
      // resolveStream via leurs résolveurs spécifiques uqload/vidmoly/veev…)
      let priority = 50
      if (lower.includes('uqload')) priority = 10
      else if (lower.includes('vidmoly')) priority = 12
      else if (lower.includes('veev.')) priority = 15
      else if (lower.includes('waaw.')) priority = 16
      else if (lower.includes('filemoon')) priority = 20
      else if (lower.includes('voe.')) priority = 22
      else if (lower.includes('emmmmbed')) priority = 25
      else if (lower.includes('coflix') || lower.includes('upn.one')) priority = 30
      else if (lower.includes('wishonly')) priority = 40
      candidates.push({
        url,
        langTag,
        host: (url.match(/^https?:\/\/([^/]+)/) || [])[1] || 'lecteurvideo',
        priority,
        secLang: sec.lang,
      })
    }
  }

  // Dédup par URL (un serveur peut apparaître 2x dans une section)
  const seen = new Set()
  const deduped = []
  for (const c of candidates.sort((a, b) => a.priority - b.priority)) {
    if (seen.has(c.url)) continue
    seen.add(c.url)
    deduped.push(c)
  }
  return deduped
}

/**
 * Ancien format : l'embed n'a pas de sections OD_* → retomber sur
 * l'extraction d'iframe classique depuis la page.
 */
function extractDirectLinksFromEmbed(embedHtml) {
  const links = []
  const html = String(embedHtml || '')
  // .mp4/.m3u8 directs
  const directRe = /["'](https?:\/\/[^"']+?\.(?:m3u8|mp4)[^"']*)["']/gi
  let m
  while ((m = directRe.exec(html)) !== null) {
    links.push({ url: m[1], langTag: 'VF', host: 'direct' })
  }
  return links
}

function detectLanguage(url, html) {
  const u = url.toLowerCase()
  if (u.includes('vostfr') || u.includes('vost')) return 'VOSTFR'
  if (u.includes('french') || /\/vf[-/.]/.test(u)) return 'VF'
  if (u.includes('vo') || u.includes('english')) return 'VO'
  const $ = html ? cheerio.load(html) : null
  if ($) {
    const pageText = $('body').text().toLowerCase()
    if (/vostfr|version originale sous-titr[eé]e/i.test(pageText)) return 'VOSTFR'
    if (/version fran[çc]aise/i.test(pageText)) return 'VF'
  }
  return 'VF'
}

function detectQuality(url, title) {
  const text = (url + ' ' + (title || '')).toLowerCase()
  if (/4k|2160/i.test(text)) return '4K'
  if (/1080|hd|fullhd/i.test(text)) return '1080p'
  if (/720|hd-ready/i.test(text)) return '720p'
  return 'HD'
}

async function fetchTmdbGenre(tmdbId, mediaType) {
  const apiKey = '8265bd1679663a7ea12ac168da84d2e8'
  const type = mediaType === 'movie' ? 'movie' : 'tv'
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}&language=en-US`
  try {
    const res = await safeFetch(url)
    if (!res || !res.ok) return null
    const text = await res.text()
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function detectSubType(tmdbId, mediaType, titles) {
  try {
    const details = await withCache(`tmdb_${tmdbId}_${mediaType}`, () => fetchTmdbGenre(tmdbId, mediaType), { successTtl: 300000, failureTtl: 60000 })
    if (!details) return null
    const genres = (details.genres || []).map(g => g.id)
    const isAnim = genres.includes(ANIME_GENRE_ID)
    const orig = mediaType === 'movie' ? details.original_title : details.original_name
    const jap = isJapanese(orig || '')
    const keywordMatch = titles.some(t => ANIME_KEYWORDS.test(t))
    if (isAnim && (jap || keywordMatch)) return 'anime'
    return null
  } catch {
    return null
  }
}

async function trySearch(titles) {
  const domains = [...new Set([SITE.BASE_URL, ...SITE.DOMAINS])]
  const probes = domains.flatMap(domain =>
    titles.slice(0, MAX_SEARCH_TITLES).map(async (title) => {
      try {
        const url = `${domain}/?s=${encodeURIComponent(title)}`
        const html = await fetchText(url, { timeout: TIMEOUTS.SEARCH })
        const results = parseSearchResults(html)
        if (results.length === 0) return null

        const movieResults = results.filter(r => !r.isSeries)
        const match = bestMatch(movieResults.length > 0 ? movieResults : results, title)
        if (match) {
          match._domain = domain
          return match
        }
      } catch (e) {
        console.warn(`[Wookafr] Search failed for "${title}": ${e.message}`)
      }
      return null
    })
  )
  const settled = await Promise.allSettled(probes)
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) return r.value
  }
  const slugMatch = await trySlugFallback(titles[0], 'movie', undefined, titles._metadata?.year)
  if (slugMatch) { console.log(`[Wookafr] Found via slug: ${slugMatch.url}`); return slugMatch }

  // Dernier recours : WP REST API (chemin correct vérifié : /wp-json/wp/v2/posts)
  console.log('[Wookafr] Trying WP API search...')
  return await searchViaWpApi(titles[0], 'movie')
}

async function trySearchSeries(titles) {
  const domains = [...new Set([SITE.BASE_URL, ...SITE.DOMAINS])]
  const probes = domains.flatMap(domain =>
    titles.slice(0, MAX_SEARCH_TITLES).map(async (title) => {
      try {
        const url = `${domain}/?s=${encodeURIComponent(title)}`
        const html = await fetchText(url, { timeout: TIMEOUTS.SEARCH })
        const results = parseSearchResults(html)
        const seriesHits = results.filter(r => r.isSeries)

        if (seriesHits.length > 0) {
          const seriesMatch = bestMatch(seriesHits, title)
          if (seriesMatch) {
            seriesMatch._domain = domain
            return seriesMatch
          }
        }

        if (results.length > 0) {
          const generalMatch = bestMatch(results, title)
          if (generalMatch) {
            generalMatch._domain = domain
            return generalMatch
          }
        }
      } catch (e) {
        console.warn(`[Wookafr] Series search failed for "${title}": ${e.message}`)
      }
      return null
    })
  )
  const settled = await Promise.allSettled(probes)
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) return r.value
  }
  // Try slug fallback before using general results (which may be wrong movies)
  const slugMatch = await trySlugFallback(titles[0], 'series', 0, titles._metadata?.year)
  if (slugMatch) { console.log(`[Wookafr] Found series via slug: ${slugMatch.url}`); return slugMatch }

  // Dernier recours : WP REST API
  console.log('[Wookafr] Trying WP API search...')
  return await searchViaWpApi(titles[0], 'tv')
}


/**
 * Fallback : cherche via l'API REST WordPress (/wp-json/wp/v2/posts?search=...)
 * pour trouver l'URL exacte quand la recherche par slug échoue.
 * NOTE : l'ancien chemin /wp-json/v2/posts renvoyait 404 (vérifié en live).
 */
async function searchViaWpApi(query, mediaType) {
  const searchQuery = encodeURIComponent(query);
  console.log(`[Wookafr] WP API search: "${query}"`);

  // Chemins relatifs — fetchText/fetchJson gèrent le fallback multi-domain
  const apiPath = `/wp-json/wp/v2/posts?search=${searchQuery}&per_page=10`;
  const posts = await fetchJson(apiPath, { timeout: TIMEOUTS.SEARCH });
  if (!posts || !Array.isArray(posts) || posts.length === 0) {
    console.log(`[Wookafr] No WP API results for "${query}"`);
    return null;
  }

  console.log(`[Wookafr] WP API: ${posts.length} post(s) found`);

  for (const post of posts) {
    const slug = post.slug || '';
    const rawTitle = post.title?.rendered || '';
    const stripAcc = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Match EXACT par tokens (garde anti-homonymes) : "gate" ne doit pas
    // matcher "gate24-the-border" / "stargate" via un substring. Chaque token
    // de la requête doit exister tel quel dans le slug ou le titre.
    const qTokens = toSlug(query).split('-').filter(w => w.length > 2);
    const slugTokens = new Set(slug.split('-'));
    const titleTokens = new Set(stripAcc(rawTitle).split(/[^a-z0-9]+/).filter(Boolean));
    const isRelevant = qTokens.length > 0 &&
      qTokens.every(t => slugTokens.has(t) || titleTokens.has(t));
    if (!isRelevant) continue;

    // Essayer série puis film (le lien WP est toujours le bon chemin)
    const candidates = [];
    if (post.link) {
      try {
        const u = new URL(post.link)
        candidates.push(u.pathname)
      } catch (_) {}
    }
    candidates.push(`/streaming/series/${slug}/`, `/streaming/${slug}/`);

    for (const p of candidates) {
      const html = await fetchText(p, { timeout: TIMEOUTS.SEARCH });
      if (html && html.length > 200) {
        const iframeUrl = extractIframeUrl(html);
        if (iframeUrl) {
          console.log(`[Wookafr] WP search found: ${p}`);
          const isSeries = p.includes('/series/');
          return { url: p, title: post.title?.rendered || slug, isSeries };
        }
      }
    }
  }
  return null;
}

async function probeSlug(slug, type, domain) {
  const path = type === 'series' ? `/streaming/series/${slug}/` : `/streaming/${slug}/`
  const url = `${domain}${path}`
  // Garde anti-homonymes par redirection (bug "Gate" → GATE24: The Border) :
  // le site 301 les slugs inconnus vers une page existante. On exige que
  // l'URL finale corresponde EXACTEMENT au slug demandé.
  const finalUrl = await probeFinalUrl(url, { timeout: 3000 })
  if (!finalUrl) return null
  const wanted = `${domain}${path}`
  if (finalUrl.replace(/\/$/, '') !== wanted.replace(/\/$/, '')) {
    console.log(`[Wookafr] Slug probe redirected: ${slug} → ${finalUrl} (homonyme, rejeté)`)
    return null
  }
  return { url, title: slug.replace(/-/g, ' '), isSeries: type === 'series' }
}

function cleanSlug(slug) {
  // Strip season-related suffixes (same pattern as other providers)
  return slug
    .replace(/-(?:1st|2nd|3rd|4th|5th)-season$/, '')
    .replace(/-(?:season|saison)-?\d+$/, '')
    .replace(/-s\d+$/, '')
    .replace(/-(?:part|cour|arc|volume)-?\d+$/, '')
    .replace(/-(?:tv|film|movie|special)$/, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

async function trySlugFallback(title, type, season, year) {
  const slug = toSlug(title)
  const candidates = [slug]
  
  // Add cleaned slug (strips season suffixes)
  const cleaned = cleanSlug(slug)
  if (cleaned !== slug && cleaned.length > 3) candidates.push(cleaned)
  
  // Add base slug without common season patterns
  candidates.push(slug.replace(/-(?:season|saison)-?\d+$/, ''))
  candidates.push(slug.replace(/-\d+(?:st|nd|rd|th)?-season$/, ''))
  
  // For season > 1, also try {clean}-{season} pattern
  if (season > 1) {
    candidates.push(`${cleaned}-${season}`)
    candidates.push(`${slug}-${season}`)
  }
  
  // Ajouter les variantes avec année (ex: le-voyage-de-chihiro-2001)
  if (year) {
    candidates.push(`${slug}-${year}`)
    if (cleaned !== slug) candidates.push(`${cleaned}-${year}`)
  }
  
  const uniqueCandidates = [...new Set(candidates.filter(c => c && c.length > 3))]
  const domains = [...new Set([SITE.BASE_URL, ...SITE.DOMAINS])]
  
  for (const domain of domains) {
    const results = await Promise.allSettled(
      uniqueCandidates.map(s => probeSlug(s, type, domain))
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) return r.value
    }
  }
  return null;
}


export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  const startTime = Date.now()
  const BUDGET_MS = 45000

  // Fix dispatch : Nuvio passe 'series' (jamais 'tv') pour les séries —
  // l'ancien code ne testait que 'movie' vs tout-le-reste, ce qui est OK,
  // mais resolveTargetEpisodes exige 'tv' explicitement → lui passer 'tv'.
  const isTv = mediaType === 'series' || mediaType === 'tv'

  const rawTitles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!rawTitles || rawTitles.length === 0) return []
  // Strip season suffixes (ex: "Naruto Season 1" → "Naruto") pour éviter les
  // variantes diluées dans la recherche — préserve les métadonnées attachées
  const titles = rawTitles.map(t => stripSeasonSuffix(t))
  titles._metadata = rawTitles._metadata
  titles.effectiveSeason = rawTitles.effectiveSeason

  const subType = await detectSubType(tmdbId, mediaType, titles)
  if (subType) console.log(`[Wookafr] Detected subtype: ${subType}`)

  if (isAborted(signal)) return []

  if (!isTv) {
    return extractMovie(tmdbId, titles, subType, startTime, BUDGET_MS, signal)
  }

  return extractSeries(tmdbId, mediaType, titles, season, episode, subType, startTime, BUDGET_MS, signal)
}

/**
 * Résout une liste de candidats (interleave par langue pour garantir VF ET
 * VOSTFR même si les premiers hosts échouent) avec budget temps.
 * Les embeds passent par resolveStream (résolveurs uqload/vidmoly/veev/…).
 */
async function resolveCandidates(candidates, siteUrl, subType, startTime, budgetMs, opts = {}) {
  const { maxResults = 4, perStreamTimeout = 9000, signal = null } = opts
  const remaining = () => budgetMs - (Date.now() - startTime)

  // Interleave par langue : [VF1, VOSTFR1, VF2, VOSTFR2, …] pour garantir
  // les deux langues même quand le budget est serré
  const byLang = {}
  for (const c of candidates) {
    const key = c.langTag || 'VF'
    if (!byLang[key]) byLang[key] = []
    byLang[key].push(c)
  }
  const langKeys = Object.keys(byLang).sort((a, b) => {
    const order = { VF: 0, VFF: 1, VFQ: 2, VOSTFR: 3, VO: 4, MULTI: 5 }
    return (order[a] ?? 9) - (order[b] ?? 9)
  })
  const ordered = []
  const maxLen = Math.max(...langKeys.map(k => byLang[k].length), 0)
  for (let i = 0; i < maxLen; i++) {
    for (const k of langKeys) {
      if (byLang[k][i]) ordered.push(byLang[k][i])
    }
  }

  const streams = []
  for (const cand of ordered) {
    if (streams.length >= maxResults) break
    if (remaining() < 5000) break
    if (isAborted(signal)) break

    const stream = toStream(cand.url, cand.langTag, 'Wookafr', siteUrl, {
      quality: detectQuality(cand.url, cand.host),
      subType,
    })
    try {
      const resolved = await withTimeout(resolveStream(stream), perStreamTimeout)
      if (resolved && resolved.url && resolved.isDirect !== false) {
        streams.push({ ...resolved, provider: 'wookafr' })
        console.log(`[Wookafr] Resolved [${cand.langTag}] ${cand.host} → ${String(resolved.url).slice(0, 70)}`)
      } else {
        console.log(`[Wookafr] No direct from [${cand.langTag}] ${cand.host}`)
      }
    } catch (e) {
      console.log(`[Wookafr] Resolve timeout [${cand.langTag}] ${cand.host}: ${e.message}`)
    }
  }
  return streams
}

/**
 * Charge l'embed lecteurvideo depuis une page (film ou épisode) et retourne
 * TOUS les serveurs de toutes les sections de langue.
 */
async function collectEmbedCandidates(pageHtml, pageUrl) {
  const iframeUrl = extractIframeUrl(pageHtml)
  if (!iframeUrl) {
    console.log(`[Wookafr] No iframe on ${pageUrl}`)
    return []
  }
  if (!/lecteurvideo/i.test(iframeUrl)) {
    // Autre hôte d'embed : un seul candidat classique
    const lang = detectLanguage(pageUrl, pageHtml)
    return [{ url: iframeUrl, langTag: lang, host: 'embed', priority: 50 }]
  }

  // Fetch l'embed avec Referer correct (le site référant, param url=)
  // ⚠️ Referer = TOUJOURS le domaine actuel du site (SITE.BASE_URL).
  // Dériver le Referer du param url= de l'embed pointe vers des domaines
  // périmés (ex: wookafr.tel) → 403 anti-hotlink vérifié en live
  // ("Ne volez pas notre travail sur Coflix.observer").
  // Le Referer correct (boston) donne 200 avec toutes les sections OD_*.
  const referer = `${SITE.BASE_URL}/`
  const res = await safeFetch(iframeUrl, {
    headers: { Referer: referer, Origin: referer.replace(/\/$/, '') },
    timeout: TIMEOUTS.PAGE,
  })
  if (!res) return []
  const embedHtml = await res.text()
  if (!embedHtml) return []

  let servers = parseLecteurVideoServers(embedHtml)
  if (servers.length === 0) {
    // Ancien format : liens directs .mp4/.m3u8 dans l'embed
    servers = extractDirectLinksFromEmbed(embedHtml).map(l => ({ ...l, priority: 45 }))
  }
  if (servers.length === 0) {
    // Dernier recours : traiter l'embed lui-même comme candidat unique
    // (resolveLecteurVideo dans resolvers.js sait extraire ses liens)
    const lang = detectLanguage(pageUrl, pageHtml)
    return [{ url: iframeUrl, langTag: lang, host: 'lecteurvideo', priority: 60 }]
  }
  return servers
}

async function extractMovie(tmdbId, titles, subType, startTime, budgetMs, signal = null) {
  const match = await trySearch(titles)
  if (!match) {
    console.warn(`[Wookafr] Movie not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Wookafr] Movie match: ${match.title} -> ${match.url}`)
  try {
    const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    const candidates = await collectEmbedCandidates(pageHtml, match.url)
    if (candidates.length === 0) {
      console.warn(`[Wookafr] No embed candidates for movie ${match.url}`)
      return []
    }
    console.log(`[Wookafr] Movie: ${candidates.length} serveur(s) trouvé(s)`)
    const streams = await resolveCandidates(candidates, SITE.BASE_URL, subType, startTime, budgetMs, { signal })
    if (streams.length > 0) return streams
  } catch (e) {
    console.warn(`[Wookafr] Movie extraction failed: ${e.message}`)
  }
  return []
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType, startTime, budgetMs, signal = null) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  // resolveTargetEpisodes exige mediaType === 'tv' → normaliser
  const targetEpisodeNums = await resolveTargetEpisodes(tmdbId, 'tv', season, episode, { startTime, budgetMs: budgetMs / 2 })

  const match = await trySearchSeries(titles)
  if (!match) {
    console.warn(`[Wookafr] Series not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Wookafr] Series match: ${match.title} -> ${match.url}`)
  try {
    const seriesHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    let seasons = parseSeasons(seriesHtml)
    let currentHtml = seriesHtml

    if (seasons.length === 0) {
      console.warn(`[Wookafr] No seasons on series page, trying direct iframe extraction`)
      const candidates = await collectEmbedCandidates(seriesHtml, match.url)
      if (candidates.length === 0) return []
      return await resolveCandidates(candidates, SITE.BASE_URL, subType, startTime, budgetMs, { signal })
    }

    const targetSeason = seasons.find(s => {
      const sn = s.title.match(PATTERNS.SEASON_TITLE)
      return sn && parseInt(sn[1]) === targetSeasonNum
    })

    // Anti-mismatch : si la saison demandée n'existe pas sur le site, ne
    // JAMAIS retomber sur une autre saison (l'utilisateur recevrait des
    // épisodes qui ne correspondent pas au titre). On abandonne proprement.
    if (!targetSeason) {
      console.warn(`[Wookafr] Season ${targetSeasonNum} not found on site (available: ${seasons.map(s => s.title).join(', ')})`)
      return []
    }

    let parsedEpisodes = null

    if (targetSeason.isActive) {
      parsedEpisodes = parseEpisodes(currentHtml)
    }

    if (!parsedEpisodes || parsedEpisodes.length === 0) {
      // Saison inactive → AJAX avec nonce.
      // IMPORTANT : poster sur le domaine actuel (SITE.BASE_URL) — l'ancien
      // code POSTait sur wookafr.center qui 301 → POST converti GET → mort.
      const nonce = extractNonce(currentHtml)
      const seasonId = targetSeason.id
      if (!nonce || !seasonId) {
        console.warn(`[Wookafr] No AJAX nonce or season id found`)
        return []
      }

      const ajaxData = await postForm(
        `${SITE.BASE_URL}/wp-admin/admin-ajax.php`,
        { action: 'getepisodes', season_id: seasonId, nonce },
        { timeout: TIMEOUTS.AJAX }
      )

      const ajaxHtml = ajaxData?.data?.html
      if (!ajaxHtml) {
        console.warn(`[Wookafr] AJAX returned no episode data for season ${targetSeasonNum}`)
        return []
      }
      parsedEpisodes = parseEpisodes(ajaxHtml)
      currentHtml = ajaxHtml
    }

    if (parsedEpisodes.length === 0) {
      console.warn(`[Wookafr] No episodes for season ${targetSeasonNum}`)
      return []
    }

    const seasonEpisodes = parsedEpisodes.filter(e => e.season === targetSeasonNum)
    if (seasonEpisodes.length === 0) {
      console.warn(`[Wookafr] No episodes tagged season ${targetSeasonNum} (AJAX returned other season?)`)
      return []
    }
    let ep = null
    for (const epNum of targetEpisodeNums) {
      ep = seasonEpisodes.find(e => e.episode === epNum)
      if (ep) break
    }
    if (!ep) {
      console.warn(`[Wookafr] Episode ${targetEpisodeNums[0]} not found in season ${targetSeasonNum} (${seasonEpisodes.length} episodes available)`)
      return []
    }

    console.log(`[Wookafr] Episode: S${ep.season}E${ep.episode} -> ${ep.link}`)
    const epHtml = await fetchText(ep.link, { timeout: TIMEOUTS.PAGE })
    const candidates = await collectEmbedCandidates(epHtml, ep.link)
    if (candidates.length === 0) {
      console.warn(`[Wookafr] No embed candidates on episode page`)
      return []
    }
    console.log(`[Wookafr] Episode: ${candidates.length} serveur(s) trouvé(s)`)
    const streams = await resolveCandidates(candidates, SITE.BASE_URL, subType, startTime, budgetMs, { signal })
    if (streams.length > 0) return streams
  } catch (e) {
    console.warn(`[Wookafr] Series extraction failed: ${e.message}`)
  }
  return []
}
