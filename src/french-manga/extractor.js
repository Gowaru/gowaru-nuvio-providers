import cheerio from 'cheerio-without-node-native'
import { fetchText, fetchJson, ajaxSearch, setCurrentSignal } from './http.js'
import { resolveStream, resolvePackedPlayer, safeFetch, isAborted, sleep } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { stripSeasonSuffix, resolveTargetEpisodes, toStream, countExtraWords, hasForeignLeadingTokens } from '../utils/dle-extractor.js'
import {
  SITE, ENDPOINTS, PATTERNS, TIMEOUTS, SCORES,
  LANGUAGE_MAP, CACHE_TTL, MAX_SEARCH_TITLES, ensureMirror,
} from './config.js'

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}


const CACHE = new Map()

function cached(key, fn) {
  const now = Date.now()
  if (CACHE.has(key) && now - CACHE.get(key).ts < CACHE_TTL) return CACHE.get(key).data
  return fn().then(data => { CACHE.set(key, { data, ts: now }); return data })
}

function scoreMatch(resultTitle, searchTitle) {
  const nt = normalize(searchTitle)
  const nr = normalize(resultTitle)
  if (!nt || !nr) return 0

  // Remove season info for matching
  const cleanNr = nr.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').trim()
  const cleanNt = nt.replace(/saison\s*\d+/g, '').replace(/:\s*$/, '').trim()

  if (cleanNr === cleanNt || nr === nt) return SCORES.EXACT_MATCH
  if (nr.includes(nt) || nt.includes(nr)) {
    // Garde anti-homonymes (bug "Gate" → THE NEW GATE) : un token
    // significatif AVANT la requête ("new", "steins"…) rejette le match.
    if (hasForeignLeadingTokens(nr, nt)) return 0
    // Pénalité anti-fan-edit : chaque mot significatif en trop dans le résultat
    // (ex: requête "Naruto" → résultat "Naruto Shippuden Kai" = 2 mots extra)
    // retire -25. Empêche les recuts/dérivés de battre le titre exact.
    const extra = countExtraWords(nr, nt)
    // Anti-faux-positif titre court : si la requête est ≤ 3 mots et le résultat
    // contient ≥ 5 mots de plus, c'est probablement un titre différent.
    // Ex: "Invincible" (1 mot) → "Became Invincible" (9+ mots extra) → reject
    const qWordCount = cleanNt.split(/\s+/).length
    if (qWordCount <= 3 && extra >= 3) return 0
    let score = 0
    if (extra > 0) {
      score = Math.max(SCORES.STRONG_MATCH - Math.min(extra * 25, SCORES.STRONG_MATCH - SCORES.MIN_MATCH - 5), 0)
    } else {
      score = SCORES.STRONG_MATCH
    }
    // Bonus position : la page commence par la requête ("gate au-dela…") bat
    // un homonyme où la requête est noyée (même convention voiranime-homes).
    const nrToks = cleanNr.split(/\s+/)
    const ntToks = cleanNt.split(/\s+/)
    if (nrToks[0] === ntToks[0]) score += 30
    return score
  }

  const words = cleanNt.split(/\s+/).filter(w => w.length > 2)
  const rWords = new Set(cleanNr.split(/\s+/))
  const matched = words.filter(w => rWords.has(w)).length
  if (words.length > 0) {
    // Anti-false-positive: si la recherche a ≥2 mots significatifs mais que
    // le résultat en partage < 2, c'est probablement une série différente
    // Ex: "Law & Order" → mots=["law","order"] cherche "Police in a Pod" → matched=0 → reject
    // Ex: "One Piece" → mots=["one","piece"] cherche "One Piece Saison 2" → matched=2 → OK
    if (words.length >= 2 && matched < 2) return 0
    return Math.round((matched / words.length) * 50)
  }
  return 0
}

function extractSeason(title) {
  const m = (title || '').match(PATTERNS.SEASON_IN_TITLE)
  return m ? parseInt(m[1]) : null
}

function scoreCandidate(item, title, targetSeason) {
  let score = scoreMatch(item.title || item.name, title)
  // Only apply season bonus/penalty if there's already some title similarity
  // Prevents false positives where a completely unrelated anime matches
  // just because it happens to have the same season number in its title
  // (e.g. "Oshi no Ko - Saison 3" matching a search for One Punch Man S3)
  if (targetSeason && score > 0) {
    const ts = parseInt(targetSeason)
    const rs = item.season
    if (rs === ts) {
      // Bonus saison uniquement pour un match "propre" (≥ STRONG_MATCH) :
      // un résultat dérivé déjà pénalisé par scoreMatch (fan-edit, mots en
      // trop) ne doit pas être rehaussé au-dessus du titre exact.
      if (score >= SCORES.STRONG_MATCH) score += 40
    }
    else if (rs && Math.abs(rs - ts) === 1) {
      // Adjacent seasons: only slight bonus if within 1, but heavy penalty if wrong
      // e.g. searching S1 but matching S2 → should NOT match if S1 exists
      score -= 60
    }
    else if (rs && rs !== ts) {
      // Wrong season: disqualifier-level penalty
      score -= 80
    }
  }
  return score
}

function bestMatch(items, title, targetSeason) {
  let best = null, bestScore = 0
  for (const item of items) {
    const score = scoreCandidate(item, title, targetSeason)
    if (score > bestScore) { bestScore = score; best = item }
  }
  return bestScore >= SCORES.MIN_MATCH ? best : null
}

// ─── Garde anti-faux-match (titre fiche vs titres TMDB) ─────────────────────
// Le score de recherche laisse passer des œuvres différentes via la branche
// "mots communs" (constaté live : requête "Kamen Rider W" →
// "Tojima Wants to Be a Kamen Rider - Saison 1 (2025)" score 50/30, épisode
// d'une AUTRE œuvre servi pour TMDB 2661 "Kamen Rider" 1971). On re-valide
// donc le TITRE de chaque candidat contre TOUS les titres TMDB avec une
// règle stricte (même famille que anime-sama/mugiwarastream, même seuil 80) :
// égalité normalisée (100) ou inclusion à frontières de mots sans tokens
// étrangers avant la requête (80, via hasForeignLeadingTokens) — tout le
// reste (mots communs partiels, homonymes) vaut 0 → rejet.
//   "Tojima Wants to Be a Kamen Rider" vs titres 2661 → 0 (rejet) ;
//   "Zero no Tsukaima - Saison 2" vs titres 35753 → 80 ;
//   "Frieren - Saison 1" vs titres 209867 → 80 ;
//   "Jujutsu Kaisen - Saison 1" vs titres 95479 → 80.
// 0 fetch supplémentaire : ne consomme que des titres déjà en main (titre du
// résultat de recherche en pré-filtre, data-title de #serie-config quand la
// page est de toute façon fetchée pour le newsid). Un candidat rejeté est
// sauté (continue), jamais fatal — [] propre si rien ne passe.
const TITLE_GUARD_THRESHOLD = 80
// Bornes d'essais avec fetch (page fiche + API épisodes) par appel.
const MAX_MATCH_TRIES = 3

function scorePageTitle(pageTitle, title) {
  const nt = normalize(title)
  const nr = normalize(pageTitle)
  if (!nt || !nr) return 0
  if (nr === nt) return 100
  if ((nr.includes(nt) || nt.includes(nr)) && !hasForeignLeadingTokens(nr, nt)) return 80
  return 0
}

function maxPageTitleScore(pageTitle, titles) {
  let best = 0
  for (const t of titles || []) {
    if (typeof t !== 'string' || !t) continue
    const s = scorePageTitle(pageTitle, stripSeasonSuffix(t))
    if (s > best) {
      best = s
      if (best >= 100) break
    }
  }
  return best
}

function passesTitleGuard(pageTitle, titles) {
  const score = maxPageTitleScore(pageTitle, titles)
  if (score < TITLE_GUARD_THRESHOLD) {
    console.log(`[FrenchManga] ✗ Titre rejeté: "${pageTitle}" sans rapport avec la cible (score ${score})`)
    return false
  }
  console.log(`[FrenchManga] Titre validé: "${pageTitle}" (score ${score})`)
  return true
}

function parseSearchResults(html) {
  if (!html) return []
  const $ = cheerio.load(html)
  const results = []

  // Home page: div.short elements
  $('div.short').each((_, el) => {
    const $card = $(el)
    const $poster = $card.find('a.short-poster').first()
    const href = $poster.attr('href') || ''
    const title = $card.find('div.short-title').first().text().trim()
    const altTitle = $poster.attr('alt') || ''
    const version = $card.find('span.film-version a').first().text().trim() || 'VF'

    if (!href || !title) return

    const newsidMatch = href.match(PATTERNS.NEWSID)
    const season = extractSeason(title) || extractSeason(altTitle)

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      newsid: newsidMatch ? newsidMatch[1] : null,
      title,
      altTitle,
      version,
      season,
    })
  })

  // AJAX search results: .search-item elements (class is 'search-title' NOT 'search-item-title')
  $('div.search-item').each((_, el) => {
    const $item = $(el)
    const onclick = $item.attr('onclick') || ''
    const hrefMatch = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/)
    const href = hrefMatch ? hrefMatch[1] : ''
    const title = $item.find('.search-title').first().text().trim() || $item.find('.search-item-title').first().text().trim()
    const poster = $item.find('.search-poster img').attr('alt') || $item.find('.search-item-poster img').attr('alt') || ''
    
    if (!href || !title) return

    const newsidMatch = href.match(/(\d+)-/)
    const season = extractSeason(title) || extractSeason(poster)

    results.push({
      url: href.startsWith('http') ? href : `${SITE.BASE_URL}${href}`,
      newsid: newsidMatch ? newsidMatch[1] : null,
      title,
      altTitle: poster,
      version: 'VF',
      season,
    })
  })

  // Category pages: also use div.short (same format as home page)
  // Already handled above

  return results
}

function parseSerieConfig(html) {
  if (!html) return null
  const $ = cheerio.load(html)
  const $config = $('#serie-config')
  if (!$config.length) return null

  return {
    title: $config.attr('data-title') || '',
    newsId: $config.attr('data-news-id') || '',
    pageUrl: $config.attr('data-page-url') || '',
  }
}

function parseEpisodeApiData(json) {
  if (!json) return null

  const versions = {}
  const languages = ['vf', 'vostfr']

  for (const lang of languages) {
    if (json[lang] && typeof json[lang] === 'object') {
      const episodes = []
      for (const [epNum, servers] of Object.entries(json[lang])) {
        const num = parseInt(epNum)
        if (isNaN(num)) continue

        const serverLinks = []
        for (const [serverName, serverUrl] of Object.entries(servers)) {
          if (serverUrl && typeof serverUrl === 'string' && serverUrl.startsWith('http')) {
            serverLinks.push({ name: serverName, url: serverUrl })
          }
        }

        if (serverLinks.length > 0) {
          episodes.push({ num, servers: serverLinks })
        }
      }

      episodes.sort((a, b) => a.num - b.num)
      const langLabel = LANGUAGE_MAP[lang] || lang.toUpperCase()
      versions[langLabel] = episodes
    }
  }

  const info = json.info || {}
  const altTitles = json.alt_titles || {}
  const altTitleUs = altTitles.us || ''
  const altTitleJp = altTitles.jp || ''

  return { versions, info, altTitleUs, altTitleJp }
}

async function trySearchGet(title, targetSeason) {
  // GET search always returns the main page listing (latest 36 items, same for any query)
  // Cache it so we only fetch once
  const html = await cached('main_page_listing', () =>
    fetchText(ENDPOINTS.SEARCH, { timeout: TIMEOUTS.SEARCH })
  )
  const results = parseSearchResults(html)
  if (results.length === 0) return null
  return bestMatch(results, title, targetSeason)
}

async function trySearchFallback(allResults, tmdbTitles) {
  // Deep fallback: when bestMatch returns null, check low-scoring search results
  // by fetching their pages in parallel (with short timeout) and verifying
  // via #serie-config + episode API. Match contre TOUS les titres TMDB
  // (pas seulement [0]) : ex ZnT où [0]="The Familiar of Zero" (EN) ne
  // matche jamais "Zero no Tsukaima" mais le titre #7 si.
  const nts = (tmdbTitles || []).map(t => normalize(t)).filter(Boolean)
  if (nts.length === 0 || allResults.length === 0) return null

  const unique = []
  const seen = new Set()
  for (const r of allResults) {
    if (r.url && !seen.has(r.url)) {
      seen.add(r.url)
      unique.push(r)
    }
  }

  const results = await Promise.allSettled(
    unique.slice(0, 5).map(async (result) => {
      const html = await fetchText(result.url, { timeout: 8000 })
      const config = parseSerieConfig(html)
      if (!config || !config.title || !config.newsId) return null

      const nr = normalize(config.title)
      // Garde anti-fan-edit : un titre dérivé avec ≥2 mots significatifs en plus
      // (ex: "Naruto Shippuden Kai" pour la requête "Naruto") n'est pas accepté,
      // même s'il contient la requête en sous-chaîne.
      const hit = nts.some(nt =>
        (nr === nt || nr.includes(nt) || nt.includes(nr)) &&
        countExtraWords(nr, nt) < 2 && !hasForeignLeadingTokens(nr, nt)
      )
      if (hit) {
        const apiData = await fetchEpisodeApi(config.newsId)
        if (apiData && apiData.versions) {
          return {
            url: config.pageUrl || result.url,
            newsid: config.newsId,
            title: config.title,
          }
        }
      }
      return null
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      console.log(`[FrenchManga] Fallback matched: "${r.value.title}" (newsid: ${r.value.newsid})`)
      return r.value
    }
  }
  return null
}

// Collecte unique des candidats de recherche (SANS early-return) : mêmes
// requêtes POST que trySearch (titres nettoyés/dédupés) + listing principal
// GET (caché, 0 fetch supplémentaire), puis tri par meilleur score
// bestMatch sur tous les titres (saison comprise), seuil MIN_MATCH.
// L'appelant applique passesTitleGuard sur chaque candidat et continue au
// suivant en cas de rejet — un faux-match n'est plus fatal.
async function collectCandidates(titles, targetSeason) {
  // Même normalisation des requêtes que trySearch (dédup des variantes
  // "X" / "X Season 2" / "X Saison 2" / "X S2" → 1 slot).
  const seenTitles = new Set()
  const cleanTitles = []
  for (const t of (titles || []).map(t => stripSeasonSuffix(t))) {
    const key = normalize(t)
    if (key && !seenTitles.has(key)) { seenTitles.add(key); cleanTitles.push(t) }
  }
  const dedup = new Map()

  for (const title of cleanTitles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      const postResults = await trySearchPostRaw(title, targetSeason)
      if (postResults) {
        for (const r of postResults) {
          const key = r.newsid || r.url
          if (key && !dedup.has(key)) dedup.set(key, r)
        }
      }
    } catch (e) {
      console.warn(`[FrenchManga] Search failed for "${title}": ${e.message}`)
    }
  }

  // Listing principal (GET) : les mêmes 36 items quelle que soit la requête
  // (œuvres récemment mises à jour) — via le même cache que trySearchGet.
  try {
    const html = await cached('main_page_listing', () =>
      fetchText(ENDPOINTS.SEARCH, { timeout: TIMEOUTS.SEARCH })
    )
    for (const r of parseSearchResults(html || '')) {
      const key = r.newsid || r.url
      if (key && !dedup.has(key)) dedup.set(key, r)
    }
  } catch (_) {}

  const all = [...dedup.values()]
  const scored = []
  for (const item of all) {
    let best = 0
    for (const t of cleanTitles) {
      const s = scoreCandidate(item, t, targetSeason)
      if (s > best) best = s
    }
    if (best >= SCORES.MIN_MATCH) scored.push({ item, score: best })
  }
  scored.sort((a, b) => b.score - a.score)

  if (scored.length > 0) return scored.map(s => s.item)

  // Dernier recours inchangé : vérification profonde via le contenu des
  // pages (parallèle) — déjà gardée en interne (mots extra + tokens).
  if (all.length > 0) {
    console.log(`[FrenchManga] Trying deep fallback on ${all.length} results...`)
    const fb = await trySearchFallback(all, titles)
    if (fb) return [fb]
  }
  return []
}

async function trySearch(titles, targetSeason) {
  // Strip season suffixes from TMDB titles for better matching, puis dédup :
  // les variantes ("X", "X Season 2", "X Saison 2", "X S2") collapsent vers
  // une seule requête. Sans ça les slots MAX_SEARCH_TITLES sont gaspillés
  // (bug ZnT S2 : "Zero no Tsukaima", titre #7, jamais cherché car 4
  // variantes "The Familiar of Zero" identiques une fois nettoyées devant).
  const seenTitles = new Set()
  const cleanTitles = []
  for (const t of titles.map(t => stripSeasonSuffix(t))) {
    const key = normalize(t)
    if (key && !seenTitles.has(key)) { seenTitles.add(key); cleanTitles.push(t) }
  }
  const allPostResults = []
  const dedupResults = new Map()
  
  for (const title of cleanTitles.slice(0, MAX_SEARCH_TITLES)) {
    try {
      // Try POST search first (AJAX — real search)
      const postResults = await trySearchPostRaw(title, targetSeason)
      if (postResults) {
        for (const r of postResults) {
          const key = r.newsid || r.url
          if (key && !dedupResults.has(key)) {
            dedupResults.set(key, r)
            allPostResults.push(r)
          }
        }
        const postMatch = bestMatch(postResults, title, targetSeason)
        if (postMatch) return postMatch
        // Don't return early — continue trying other titles
        // (e.g. AJAX search for "Attack on Titan" returns French titles with 0 score,
        //  but "L'Attaque des Titans" will match)
      }

      // Fallback to GET (main page listing — works for recently updated)
      console.log(`[FrenchManga] Trying GET fallback for "${title}"...`)
      const getMatch = await trySearchGet(title, targetSeason)
      if (getMatch) return getMatch
    } catch (e) {
      console.warn(`[FrenchManga] Search failed for "${title}": ${e.message}`)
    }
  }

  // After trying all titles, attempt bestMatch on accumulated POST results
  if (allPostResults.length > 0) {
    const firstTitle = cleanTitles[0]
    const bestPostMatch = bestMatch(allPostResults, firstTitle, targetSeason)
    if (bestPostMatch) return bestPostMatch
  }
  
  // Deep fallback: check low-scoring POST results via page content (parallel, short timeout)
  if (allPostResults.length > 0) {
    console.log(`[FrenchManga] Trying deep fallback on ${allPostResults.length} POST results...`)
    const fallbackMatch = await trySearchFallback(allPostResults, titles)
    if (fallbackMatch) return fallbackMatch
  }

  return null
}

async function trySearchPostRaw(title, targetSeason) {
  // Try AJAX search first (real search endpoint) — works for all titles
  try {
    const html = await ajaxSearch(title, { timeout: TIMEOUTS.SEARCH })
      if (html && html.length > 50) {
      const results = parseSearchResults(html)
      if (results.length > 0) {
        console.log(`[FrenchManga] AJAX search found ${results.length} results for "${title}"`)
        return results
      }
    }
  } catch (e) {
    console.warn(`[FrenchManga] AJAX search failed for "${title}": ${e.message}`)
  }
  
  // Note: trySearchGet (called from trySearch) already handles the
  // main page listing fallback. No need to duplicate here.
  return null
}

async function fetchEpisodeApi(newsid) {
  const url = `${ENDPOINTS.EPISODES_API}${newsid}`
  return cached(`episodes_${newsid}`, async () => {
    const json = await fetchJson(url, { timeout: TIMEOUTS.API })
    return parseEpisodeApiData(json)
  })
}
// Hôtes morts (DNS NXDOMAIN vérifié live 2026-10-10 : vidhsareup.io ET
// vidhsareup.fun → ENOTFOUND, curl exit 6) : skip précoce, économise ~5s
// de timeout DNS + le resolvePackedPlayer central derrière la correction
// de domaine .io→.fun (qui mène au même mort).
const DEAD_HOSTS = ['vidhsareup.']
// Hébergeurs au format packé lulu NON routés par resolveStream central
// (vérifié 2026-10-10 en lecture seule : 'lulust.com'.includes('lulu.')
// === false, aucune branche 'lulust.') → résolution LOCALE via
// resolvePackedPlayer (même structure packée que luluvdo, preuve live :
// lulust.com/e/xnf2gcpkgplv → master.m3u8 *.tnmr.org en 650ms).
// Patch central 1-ligne rapporté à part (resolvers.js interdit ici).
const LOCAL_PACKED_HOSTS = ['lulust.']

function isDeadHost(url) {
  const u = (url || '').toLowerCase()
  return DEAD_HOSTS.some(h => u.includes(h))
}

function isLocalPackedHost(url) {
  const u = (url || '').toLowerCase()
  return LOCAL_PACKED_HOSTS.some(h => u.includes(h))
}

// Cache de résolution par exécution : la même URL d'embed partagée entre
// VF et VOSTFR n'est résolue qu'une fois, puis clonée sous chaque label.
async function resolveCached(cache, stream) {
  if (cache.has(stream.url)) {
    const c = cache.get(stream.url)
    if (!c) return null
    return { ...stream, url: c.url, headers: { ...stream.headers, ...c.headers }, quality: c.quality || stream.quality, isDirect: true }
  }
  const r = await resolveWithTimeout(stream)
  cache.set(stream.url, (r && r.url && r.isDirect) ? { url: r.url, headers: r.headers, quality: r.quality } : null)
  return r
}

async function resolveWithTimeout(stream) {
    try {
        const start = Date.now();

        if (isDeadHost(stream.url)) {
            console.log(`[FrenchManga] ✗ Dead host, skipped: ${(stream.url || '').slice(0, 70)}`)
            return null
        }

        let resolved
        if (isLocalPackedHost(stream.url)) {
            // Contournement local (routage central interdit d'édition) :
            // resolvePackedPlayer applique lui-même Referer/Origin du
            // domaine embed (origin + '/').
            const local = await resolvePackedPlayer(stream.url)
            if (local && local.url && local.url !== stream.url) {
                console.log(`[FrenchManga] Local-packed OK (${Date.now() - start}ms): ${stream.url.slice(0, 60)}... → ${local.url.slice(0, 60)}...`)
                resolved = { ...stream, url: local.url, headers: { ...stream.headers, ...(local.headers || {}) }, isDirect: true }
            } else {
                console.log(`[FrenchManga] ✗ Local-packed non résolu (${Date.now() - start}ms): ${(stream.url || '').slice(0, 70)} - rejeté`)
                return null
            }
        } else {
            resolved = await resolveStream(stream)
        }
        const elapsed = Date.now() - start;

        if (resolved && resolved.url && resolved.isDirect) {
            // CDN tnmr.org : 403 vérifié live 2026-10-10 sur URL complète
            // tokenisée (luluvdo e/8rmimt1fi8a6 → htvpd1vylmox.tnmr.org/
            // .../master.m3u8?t=...&s=1791634206&e=28800 ; idem lulust
            // Keroro e/xnf2gcpkgplv → dsq11fdokomd.tnmr.org/...). 403 avec
            // Referer https://luluvdo.com/, page embed, w16.french-manga.net,
            // sans Referer, et Origin+Referer combinés. GARDÉ : servir ces
            // URL produit un flux qui ne lance jamais.
            const urlLower = (resolved.url || '').toLowerCase();
            if (urlLower.includes('tnmr.org') && !urlLower.includes('cdn-tnmr.org')) {
                console.log(`[FrenchManga] ✗ Blocked CDN tnmr.org (${elapsed}ms): ${resolved.url.slice(0, 60)}... - skipping`);
                return null;
            }

            if (resolved.url !== stream.url) {
                console.log(`[FrenchManga] Resolved OK (${elapsed}ms): ${stream.url.slice(0, 60)}... → ${resolved.url.slice(0, 60)}...`);
            } else {
                console.log(`[FrenchManga] Direct OK (${elapsed}ms): ${stream.url.slice(0, 70)}...`);
            }
            return resolved
        }

        // ⚠️ Anti flux-qui-ne-lance-jamais : un embed non résolu (isDirect=false,
        // page HTML d'hébergeur) n'est JAMAIS jouable dans les apps — le servir
        // comme stream produit « la vidéo ne se lance jamais ». Les embeds morts
        // (page supprimée) et les hébergeurs non supportés rentrent tous dans ce
        // cas. Convention repo (pattern wookafr/fluneo) : on rejette.
        console.log(`[FrenchManga] ✗ Resolve non direct (${elapsed}ms): ${(stream.url || '').slice(0, 70)} - rejeté`)
        return null
    } catch (e) {
        console.log(`[FrenchManga] ✗ Resolve ERROR: ${(stream.url || '').slice(0, 60)}... - ${e.message} - rejeté`)
        return null
    }
}

async function detectSubType(tmdbId, mediaType) {
  const apiKey = '8265bd1679663a7ea12ac168da84d2e8'
  const type = mediaType === 'movie' ? 'movie' : 'tv'
  try {
    const details = await cached(`tmdb_${tmdbId}_${type}`, async () => {
      const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}&language=en-US`
      const res = await safeFetch(url)
      if (!res || !res.ok) return null
      const text = await res.text()
      return JSON.parse(text)
    })
    if (!details) return null
    const genres = (details.genres || []).map(g => g.id)
    if (genres.includes(16)) return 'anime'
    return null
  } catch {
    return null
  }
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  // ⚠️ Nuvio passe 'series' (pas 'tv') — 9ᵉ occurrence du bug de dispatch dans
  // ce repo : normaliser AVANT tout test mediaType ('movie'/'tv' exacts).
  const type = mediaType === 'series' ? 'tv' : mediaType

  // 0. Miroir dynamique : le site 301-redirect la racine vers le miroir
  //    courant (wNN). Le w16 codé en dur meurt à chaque rotation de miroir.
  await ensureMirror()
  if (isAborted(signal)) return []

  // 1. Titres TMDB + subType (genre anime) en parallèle — les deux ne
  //    dépendent que de tmdbId/type, séquentiel ils coûtaient ~1s.
  const [titles, subType] = await Promise.all([
    getTmdbTitles(tmdbId, type, { season }).catch(() => []),
    detectSubType(tmdbId, type).catch(() => null),
  ])
  if (!titles || titles.length === 0) return []
  if (subType) console.log(`[FrenchManga] Detected subtype: ${subType}`)

  if (isAborted(signal)) return []

  if (type === 'movie') {
    return extractMovie(tmdbId, titles, subType)
  }

  return extractSeries(tmdbId, type, titles, season, episode, subType)
}

async function extractMovie(tmdbId, titles, subType) {
  const candidates = await collectCandidates(titles, null)
  if (candidates.length === 0) {
    console.warn(`[FrenchManga] Movie not found for TMDB ${tmdbId}`)
    return []
  }

  // Garde anti-faux-match (série ET film) : pré-filtre SANS fetch sur le
  // titre du résultat, puis re-vérification sur le data-title réel de la
  // fiche quand la page est fetchée. Rejet = candidat suivant, [] si épuisé.
  const attempts = []
  for (const cand of candidates) {
    if (attempts.length >= MAX_MATCH_TRIES) break
    if (!passesTitleGuard(cand.title, titles)) continue
    attempts.push(cand)
  }
  if (attempts.length === 0) {
    console.warn(`[FrenchManga] Movie candidates all rejected by title guard for TMDB ${tmdbId}`)
    return []
  }

  for (const att of attempts) {
    console.log(`[FrenchManga] Movie match: ${att.title} -> ${att.url}`)
    try {
      // Use newsid from search result if available, otherwise fetch page
      let newsid = att.newsid
      let pageTitle = att.title
      if (!newsid) {
        const pageHtml = await fetchText(att.url, { timeout: TIMEOUTS.PAGE })
        const config = parseSerieConfig(pageHtml)
        if (!config || !config.newsId) {
          console.warn(`[FrenchManga] No config found on page ${att.url}`)
          continue
        }
        newsid = config.newsId
        if (config.title) pageTitle = config.title
      }
      // Titre réel de la fiche déjà en main (page fetchée ci-dessus pour le
      // newsid) : re-vérifié à 0 fetch supplémentaire.
      if (pageTitle !== att.title && !passesTitleGuard(pageTitle, titles)) continue

      const apiData = await fetchEpisodeApi(newsid)
      if (!apiData || !apiData.versions) {
        console.warn(`[FrenchManga] No episode data for newsid ${newsid}`)
        continue
      }

      return extractStreamsFromApi(apiData, 'FrenchManga', subType)
    } catch (e) {
      console.warn(`[FrenchManga] Movie extraction failed: ${e.message}`)
    }
  }
  return []
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeasonNum = parseInt(effectiveSeason) || 1
  const targetEpisodeNums = await resolveTargetEpisodes(tmdbId, mediaType, season, episode)

  const candidates = await collectCandidates(titles, targetSeasonNum)
  if (candidates.length === 0) {
    console.warn(`[FrenchManga] Series not found for TMDB ${tmdbId}`)
    return []
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Garde anti-faux-match + saison : pré-filtre SANS fetch (titre de chaque
  // résultat déjà en main). Un candidat rejeté par la garde, ou de mauvaise
  // saison connue, est sauté (continue) — jamais fatal.
  // ═══════════════════════════════════════════════════════════════════════════
  const exactSeason = []
  const unknownSeason = []
  let sawWrongSeason = false
  for (const cand of candidates) {
    if (!passesTitleGuard(cand.title, titles)) continue
    if (targetSeasonNum >= 1 && cand.season != null && cand.season !== targetSeasonNum) {
      sawWrongSeason = true
      console.log(`[FrenchManga] Skipping "${cand.title}" (S${cand.season} ≠ S${targetSeasonNum})`)
      continue
    }
    if (cand.season === targetSeasonNum) exactSeason.push(cand)
    else unknownSeason.push(cand)
  }

  let match = exactSeason.length > 0 ? exactSeason[0] : (unknownSeason.length > 0 ? unknownSeason[0] : null)

  // ═══════════════════════════════════════════════════════════════════════════
  // Season verification & retry (historique, 1 seule tentative) : si aucun
  // candidat de la bonne saison, on relance une recherche spécifique avec le
  // titre de base + "Saison N". Adopté uniquement si saison exacte ET garde
  // anti-faux-match OK (la recherche ciblée peut elle aussi remonter un
  // homonyme, ex Tojima S1 pour "Kamen Rider Saison 1").
  // Ex: "One Piece" S1 → match trouve "One Piece Film - Red" (season=null)
  //   → retry avec "One Piece Saison 1"
  // Ex: "One Piece" S1 → match trouve "One Piece Saison 2" (season=2 ≠ 1)
  //   → retry avec "One Piece Saison 1"
  // ═══════════════════════════════════════════════════════════════════════════
  if (!match || (targetSeasonNum >= 1 && match.season == null)) {
    // Une seule tentative suffit : tous les stripSeasonSuffix(title) donnent le même base
    const baseTitle = stripSeasonSuffix(titles[0])
    const seasonQuery = `${baseTitle} Saison ${targetSeasonNum}`
    console.log(`[FrenchManga] Season search: "${seasonQuery}"`)

    try {
      const html = await ajaxSearch(seasonQuery, { timeout: TIMEOUTS.SEARCH })
      if (html && html.length > 50) {
        const results = parseSearchResults(html)
        if (results.length > 0) {
          const seasonMatch = bestMatch(results, titles[0], targetSeasonNum)
          if (seasonMatch && seasonMatch.season === targetSeasonNum && passesTitleGuard(seasonMatch.title, titles)) {
            console.log(`[FrenchManga] ✅ Season search matched: "${seasonMatch.title}" (S${seasonMatch.season})`)
            match = seasonMatch
          }
        }
      }
    } catch (e) {
      console.warn(`[FrenchManga] Season search failed for "${seasonQuery}": ${e.message}`)
    }
  }

  if (!match) {
    // Historique : mauvaise saison CONNUE après retry → on ABANDONNE ([])
    // plutôt que de servir la mauvaise saison. Garde ayant tout rejeté → []
    // propre aussi (ex Tojima pour Kamen Rider 2661).
    if (sawWrongSeason) {
      console.warn(`[FrenchManga] ✗ Season mismatch after retry (target S${targetSeasonNum}) — abandoning`)
    } else {
      console.warn(`[FrenchManga] ✗ All candidates rejected by title guard (target S${targetSeasonNum}) — abandoning`)
    }
    return []
  }
  if (match.season == null) {
    console.log(`[FrenchManga] ⚠ Season unknown, using match "${match.title}" for S${targetSeasonNum}`)
  }

  // Ordre d'essai : match retenu d'abord, puis autres candidats valides
  // (saison exacte puis inconnue), borné — chaque essai peut coûter 1 page +
  // 1 API. Rejet de garde = essai suivant.
  const attempts = [match]
  for (const cand of [...exactSeason, ...unknownSeason]) {
    if (attempts.length >= MAX_MATCH_TRIES) break
    if (cand === match) continue
    attempts.push(cand)
  }

  for (const att of attempts) {
    console.log(`[FrenchManga] Series match: ${att.title} -> ${att.url} (newsid: ${att.newsid})`)

    try {
      // Use newsid from search result if available, otherwise fetch page
      let newsid = att.newsid
      let pageTitle = att.title
      if (!newsid) {
        const pageHtml = await fetchText(att.url, { timeout: TIMEOUTS.PAGE })
        const config = parseSerieConfig(pageHtml)
        if (!config || !config.newsId) {
          console.warn(`[FrenchManga] No config found on page ${att.url}`)
          continue
        }
        newsid = config.newsId
        if (config.title) pageTitle = config.title
      }
      // Titre réel de la fiche déjà en main (page fetchée ci-dessus pour le
      // newsid) : re-vérifié à 0 fetch supplémentaire.
      if (pageTitle !== att.title && !passesTitleGuard(pageTitle, titles)) continue

      const apiData = await fetchEpisodeApi(newsid)
      if (!apiData || !apiData.versions) {
        console.warn(`[FrenchManga] No episode data for newsid ${newsid}`)
        continue
      }

    // For series, find the right episode across all languages
    const streams = []
    const seenLangUrls = new Set()
    const resolveCache = new Map()
    const targetEp = targetEpisodeNums[0]
    // 2e critère : numéro absolu (pages à numérotation absolue). resolveTargetEpisodes
    // renvoie [ep] ou [ep, absolu].
    const targetAbs = targetEpisodeNums.length > 1 ? targetEpisodeNums[1] : null
    const MAX_SERVERS_PER_LANG = 3  // Early-exit: resolve max 3 servers per language

    for (const [lang, episodes] of Object.entries(apiData.versions)) {
      // PAS de fallback par index episodes[N-1] : quand la numérotation
      // n'est pas contigüe, ça sert le MAUVAIS épisode. Absolu en 2e critère.
      let ep = episodes.find(e => e.num === targetEp)
      if (!ep && targetAbs != null && targetAbs !== targetEp) {
        ep = episodes.find(e => e.num === targetAbs)
        if (ep) console.log(`[FrenchManga] Absolute match: episode ${ep.num} for S${targetSeasonNum}E${targetEp} (${lang})`)
      }
      if (!ep) {
        console.log(`[FrenchManga] No episode ${targetEp}${targetAbs != null && targetAbs !== targetEp ? ` (abs ${targetAbs})` : ''} in ${lang} (${episodes.length} ep(s)) — skipping lang`)
        continue
      }

      // Log episode title if available from API info
      const epInfo = apiData.info && apiData.info[String(ep.num)]
      if (epInfo && epInfo.title) {
        console.log(`[FrenchManga] Episode ${ep.num}: "${epInfo.title}" (${lang})`)
      }
      console.log(`[FrenchManga] Found episode ${ep.num} (${lang}) with ${ep.servers.length} server(s)`)      
      let resolvedCount = 0
      for (const server of ep.servers) {
        // Early-exit: stop resolving servers for this language once we have enough
        if (resolvedCount >= MAX_SERVERS_PER_LANG) break

        // Dédup PAR LANGUE : la même URL sous VF et VOSTFR est servie sous
        // les deux labels (contenu partagé côté site, ex OP) au lieu d'être
        // droppée — toStream() garde [VF]/[VOSTFR] en tête de title et le
        // code langue normalisé. resolveCached() ne re-résout pas deux fois.
        const langKey = `${server.url}|${lang}`
        if (seenLangUrls.has(langKey)) continue
        seenLangUrls.add(langKey)

        const stream = toStream(server.url, lang, 'FrenchManga', SITE.BASE_URL, { quality: 'HD' })
        if (subType) stream.subType = subType

        const resolved = await resolveCached(resolveCache, stream)
        if (resolved && resolved.url && resolved.isDirect) {
          streams.push({ ...resolved, provider: 'french-manga' })
          resolvedCount++
        }
      }
    }


    console.log(`[FrenchManga] Series: ${streams.length} streams for episode ${targetEp}`)
    return streams
    } catch (e) {
      console.warn(`[FrenchManga] Series extraction failed: ${e.message}`)
    }
  }
  return []
}

async function extractStreamsFromApi(apiData, name, subType) {
  // Films : DIRECTS UNIQUEMENT, aligné sur les séries — un embed non résolu
  // (page HTML d'hébergeur) n'est jamais jouable dans les apps.
  const streams = []
  const seenLangUrls = new Set()
  const resolveCache = new Map()
  const MAX_SERVERS_PER_LANG = 3

  for (const [lang, episodes] of Object.entries(apiData.versions)) {
    // For movies, take the first episode
    const firstEp = episodes[0]
    if (!firstEp) continue

    console.log(`[FrenchManga] Found movie (${lang}) with ${firstEp.servers.length} server(s)`)

    let resolvedCount = 0
    for (const server of firstEp.servers) {
      if (resolvedCount >= MAX_SERVERS_PER_LANG) break

      // Dédup par langue (cf. séries) : même URL servie sous chaque label.
      const langKey = `${server.url}|${lang}`
      if (seenLangUrls.has(langKey)) continue
      seenLangUrls.add(langKey)

      const stream = toStream(server.url, lang, name, SITE.BASE_URL, { quality: 'HD' })
      if (subType) stream.subType = subType

      const resolved = await resolveCached(resolveCache, stream)
      if (resolved && resolved.url && resolved.isDirect) {
        streams.push({ ...resolved, provider: 'french-manga' })
        resolvedCount++
      }
    }
  }

  console.log(`[FrenchManga] Movie: ${streams.length} streams`)
  return streams
}
