import { fetchText, fetchJson, setCurrentSignal } from './http.js'
import cheerio from 'cheerio-without-node-native'
import { resolveStream, safeFetch, withTimeout, isAborted, verifyPlayableUrl } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { toStream, normalize, resolveTargetEpisodes, stripSeasonSuffix, countExtraWords, hasForeignLeadingTokens, getSeasonEpisodeFromAbsolute } from '../utils/dle-extractor.js'
import {
  SITE, ENDPOINTS, SELECTORS, PATTERNS, TIMEOUTS, SCORES,
  LANGUAGE_MAP, ANIME_GENRE_ID, ANIME_KEYWORDS,
  MAX_SEARCH_TITLES,
} from './config.js'
import { createCache } from '../utils/cache.js'

const withCache = createCache('fl', 'Flemmix')

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
    // Garde anti-homonymes (bug "Gate" → Steins;Gate) : un token significatif
    // AVANT la requête ("steins", "the gates"…) rejette le match.
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

/**
 * Parse les onglets serveurs (film OU épisode). Priorité texte du bouton,
 * fallback pills. Langue dérivée de l'URL vidsrc (ds_lang=fr) quand les
 * deux sont absents.
 */
function parseServerTabs($, tabSelector) {
  const servers = []
  $(tabSelector).each((_, el) => {
    const $tab = $(el)
    const url = $tab.attr(SELECTORS.TAB_DATA_URL)
    if (!url) return
    const absUrl = url.startsWith('http') ? url.replace(/&amp;/g, '&') : `${SITE.BASE_URL}${url}`.replace(/&amp;/g, '&')

    // TV-safe : .hasClass() n'existe pas dans le runtime cheerio de NuvioTV
    const isActive = ($tab.attr('class') || '').split(/\s+/).includes(SELECTORS.TAB_ACTIVE)
    const tabText = $tab.text().toLowerCase()
    const langRaw = ($tab.find(SELECTORS.MOVIE_LANG_PILL).first().text() || '').trim().toLowerCase()

    let language
    if (LANGUAGE_MAP[langRaw]) {
      language = LANGUAGE_MAP[langRaw]
    } else if (/vostfr/.test(tabText) && !/vo\b/.test(tabText.replace('vostfr', ''))) {
      language = 'VOSTFR'
    } else if (/(?:^|\s)vf(?:\s|$)|version fran/.test(tabText)) {
      language = 'VF'
    } else if (/vostfr/.test(tabText)) {
      language = 'VOSTFR'
    } else if (absUrl.includes('ds_lang=fr')) {
      language = 'VF'
    } else if (/french/.test(absUrl.toLowerCase())) {
      language = 'VF'
    } else {
      language = 'VOSTFR'
    }

    const qualityText = ($tab.find(SELECTORS.MOVIE_QUALITY_PILL).first().text() || '').trim()
    servers.push({
      url: absUrl,
      quality: qualityText ? qualityText.toUpperCase() : 'HD',
      language,
      isActive,
    })
  })
  return servers
}

// Le site (Laravel) throttle `/search` par IP : au-delà de quelques requêtes
// rapprochées il renvoie `{"message":"Too Many Attempts."}` (JSON valide, donc
// `fetchJson` ne le voit pas comme une erreur). Sans ce garde-fou, le provider
// concluait « titre introuvable » et renvoyait 0 flux de façon intermittente.
let searchBlockedUntil = 0

function isRateLimitedPayload(json) {
  return !!(json && typeof json === 'object' && !Array.isArray(json) &&
    /too many attempts|rate limit/i.test(String(json.message || json.error || '')))
}

function parseSearchResults(json) {
  if (!Array.isArray(json)) {
    if (isRateLimitedPayload(json)) {
      searchBlockedUntil = Date.now() + 60000
      console.warn('[Flemmix] Recherche throttled par le site (Too Many Attempts) — sitemap uniquement')
    }
    return []
  }
  return json.map(item => ({
    url: `${SITE.BASE_URL}${item.url}`.replace(/&amp;/g, '&'),
    title: item.title,
    isSeries: item.type === 'tvshow',
    year: item.year,
  }))
}

/**
 * Recherche par langue sur l'endpoint /search : le site renvoie des résultats
 * distincts selon q=FR ou q=EN (ex: "Spartacus" vide, "Spartacus VOSTFR" →
 * la série). On sonde chaque titre dans les deux langues.
 */
async function trySearchBilingual(titles, filterSeries) {
  if (Date.now() < searchBlockedUntil) return null
  for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
    const probes = [
      `${ENDPOINTS.SEARCH}${encodeURIComponent(title)}`,
      `${ENDPOINTS.SEARCH}${encodeURIComponent(`${title} VOSTFR`)}`,
    ]
    const settled = await Promise.allSettled(probes.map(p => fetchJson(p, { timeout: TIMEOUTS.SEARCH })))
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue
      const results = parseSearchResults(r.value)
      if (results.length === 0) continue

      const filtered = filterSeries
        ? results.filter(x => x.isSeries)
        : results.filter(x => !x.isSeries)

      const candidates = filtered.length > 0 ? filtered : results
      const match = bestMatch(candidates, title)
      if (match) return match
    }
  }
  return null
}

function parseSeasons(html) {
  const $ = cheerio.load(html)
  const seasons = []
  $(SELECTORS.SERIES_SEASON_CARD).each((_, el) => {
    const $card = $(el)
    const href = $card.attr('href') || ''
    const m = href.match(PATTERNS.SEASON_LINK)
    if (m) {
      seasons.push({
        num: parseInt(m[1]),
        link: `${SITE.BASE_URL}${href}`.replace(/&amp;/g, '&'),
        title: $card.find(SELECTORS.SERIES_SEASON_TITLE).first().text().trim() || $card.text().trim(),
        // Une page saison peut exister en `-vf` / `-vostfr` : la version sans
        // suffixe de langue liste les deux, on la préfère pour ne pas imposer
        // une langue à l'utilisateur.
        langTagged: /-(?:vf|vostfr)$/i.test(href),
      })
    }
  })
  // Dédoublonne par numéro en préférant la page non suffixée par une langue.
  const byNum = new Map()
  for (const s of seasons) {
    const prev = byNum.get(s.num)
    if (!prev || (prev.langTagged && !s.langTagged)) byNum.set(s.num, s)
  }
  return [...byNum.values()].sort((a, b) => a.num - b.num)
}

function parseSeasonEpisodes(html, expectedSlug) {
  const $ = cheerio.load(html)
  const episodes = []
  const want = (expectedSlug || '').toLowerCase()
  $(SELECTORS.SERIES_EPISODE_CARD).each((_, el) => {
    const $card = $(el)
    const href = $card.attr('href') || ''
    const m = href.match(PATTERNS.EPISODE_LINK)
    if (m) {
      // La page saison contient aussi des liens vers d'AUTRES séries
      // (recommandations, sidebar) : sans ce filtre, un `/autre-serie/1x1`
      // pouvait être servi à la place de l'épisode demandé — cause directe des
      // « épisodes qui ne correspondent pas au titre ».
      // Tolérance de préfixe : le slug des épisodes diffère souvent du slug de
      // la fiche (`/serie/euphoria-05` → épisodes `/euphoria/2x1`).
      if (want) {
        const epSlug = String(m[1]).toLowerCase()
        const compatible = epSlug === want ||
          (epSlug.length >= 4 && want.startsWith(epSlug)) ||
          (want.length >= 4 && epSlug.startsWith(want))
        if (!compatible) return
      }
      episodes.push({
        // Le slug de l'épisode est sans suffixe id : /{slug}/{s}x{e}
        season: parseInt(m[2]),
        episode: parseInt(m[3]),
        link: `${SITE.BASE_URL}${href}`.replace(/&amp;/g, '&'),
        title: $card.find(SELECTORS.SERIES_EPISODE_TITLE).first().text().trim(),
      })
    }
  })
  return episodes
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

/**
 * Fallback sitemap : les sitemaps publics listent TOUTES les fiches du site
 * (652 films / 293 séries vérifiés) même quand la recherche JSON échoue.
 * Requête une seule fois par session (cache 30 min).
 *
 * Garde-fou anti-homonymes : le matching inclusion-based seul fait matcher
 * "The Walking Dead" contre "The Walking Dead Dead City" (spin-off) —
 * ex. réel constaté. Tout mot significatif du slug (≥ 4 lettres, non
 * générique, hors saison) qui n'appartient PAS à la requête rejette la fiche,
 * comme dans le scoring Coflix/Movix.
 */
const SITEMAP_NOISE_WORDS = new Set([
  'film', 'movie', ' serie', 'series', 'season', 'show', 'oav', 'special',
  'complete', 'integral', 'integrale', 'vf', 'vostfr', 'truefrench', 'french',
  'part', 'partie', 'episode', 'the', 'le', 'la', 'les', 'of', 'a', 'and', 'et',
])

function sitemapHasForeignWords(slugTitle, queryTitle) {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const qWords = new Set(norm(queryTitle).split(/[^a-z0-9]+/).filter(Boolean))
  const sWords = norm(slugTitle).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && /^\d+$/.test(w) === false)
  let foreign = 0
  for (const w of sWords) {
    if (SITEMAP_NOISE_WORDS.has(w)) continue
    if (qWords.has(w)) continue
    // préfixe/extension : "walking" ~ "walkings"
    if ([...qWords].some((q) => q.length >= 4 && (w.startsWith(q) || q.startsWith(w)))) continue
    foreign++
  }
  return foreign >= 2 // ex: "dead city" vs "the walking dead" → 2 mots étrangers
}

async function trySitemap(titles, filterSeries) {
  try {
    const sitemapUrl = filterSeries ? ENDPOINTS.SITEMAP_TVSHOWS : ENDPOINTS.SITEMAP_MOVIES
    const xml = await withCache(`sm_${filterSeries ? 'tv' : 'mv'}`, async () => {
      const body = await fetchText(sitemapUrl, { timeout: TIMEOUTS.SEARCH })
      if (!body || !body.includes('<urlset')) throw new Error('sitemap invalide (throttle ?)')
      return body
    }, { successTtl: 1800000, failureTtl: 60000 })
    if (!xml || !xml.includes('<urlset')) return null
    const items = []
    const re = /<loc>\s*([^<]+?)\s*<\/loc>/g
    let m
    while ((m = re.exec(xml)) !== null) {
      const loc = m[1]
      const parts = loc.replace(/\/$/, '').split('/')
      const slug = parts[parts.length - 1] || ''
      if (!slug) continue
      items.push({
        url: loc,
        title: slug.replace(/-\d{2,}$/, '').replace(/-vf$|-vostfr$/i, '').replace(/-/g, ' '),
        isSeries: filterSeries,
      })
    }
    if (items.length === 0) return null
    // Score global sur TOUTES les variantes de titres, puis anti-homonymes.
    const ranked = []
    for (const it of items) {
      let best = 0
      // TOUS les titres TMDB (pas seulement les 3 premiers) : le titre français
      // est souvent loin dans la liste des alternative_titles (`Zootopie 2` est
      // le 4e de Zootopia 2) et le matching est purement local, donc gratuit.
      for (const title of titles) {
        const s = scoreMatch(it.title, title)
        if (s > best) best = s
        if (best >= SCORES.EXACT_MATCH && sitemapHasForeignWords(it.title, title)) best = 0
      }
      if (best >= SCORES.MIN_MATCH) ranked.push({ ...it, score: best })
    }
    ranked.sort((a, b) => b.score - a.score)
    return ranked[0] || null
  } catch (e) {
    console.warn(`[Flemmix] Sitemap fallback failed: ${e.message}`)
  }
  return null
}

/**
 * Index de structure du site, chargé depuis les sitemaps `seasons` + `episodes`
 * (cache 30 min). Sert de repli quand la page série ne liste pas la saison
 * demandée, ou quand la page saison ne contient pas l'épisode voulu — cas
 * fréquents sur les séries longues dont le HTML est tronqué.
 *
 * @returns {{seasons:Map<string,string>, episodes:Map<string,string>}}
 *          seasons  : clé `{slugSerie}/saison-{n}` → URL réelle du sitemap
 *                     (le lien peut porter un sous-titre : `saison-1-murder-house`)
 *          episodes : clé `{slugSerie}/{s}x{e}` → URL absolue
 */
async function loadStructureIndex() {
  return withCache('structure_index', async () => {
    const seasons = new Map();
    const episodes = new Map();

    const [seasonsXml, episodesXml] = await Promise.allSettled([
      fetchText(ENDPOINTS.SITEMAP_SEASONS, { timeout: TIMEOUTS.SEARCH }),
      fetchText(ENDPOINTS.SITEMAP_EPISODES, { timeout: TIMEOUTS.SEARCH }),
    ]).then((r) => r.map((x) => (x.status === 'fulfilled' ? x.value : '')));

    const looksLikeXml = (x) => typeof x === 'string' && (x.includes('<urlset') || x.includes('<sitemapindex'))
    if (!looksLikeXml(seasonsXml) && !looksLikeXml(episodesXml)) {
      // Réponse d'erreur (throttle, HTML) : ne pas figer un index vide 30 min.
      throw new Error('sitemaps structure indisponibles')
    }

    if (looksLikeXml(seasonsXml)) {
      const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
      let m;
      while ((m = re.exec(seasonsXml)) !== null) {
        const loc = m[1].replace(/&amp;/g, '&').replace(/\/$/, '');
        const path = loc.replace(SITE.BASE_URL + '/', '');
        // `saison-2` mais aussi `saison-1-murder-house`, `saison-3-vf`…
        const sm = path.match(/^([a-z0-9-]+)\/saison-(\d+)(?:-[^/]+)?$/i);
        if (sm) seasons.set(`${sm[1].toLowerCase()}/saison-${sm[2]}`, loc);
      }
    }

    if (looksLikeXml(episodesXml)) {
      const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
      let m;
      while ((m = re.exec(episodesXml)) !== null) {
        const loc = m[1].replace(/&amp;/g, '&');
        const path = loc.replace(SITE.BASE_URL + '/', '').replace(/\/$/, '');
        const mm = path.match(/^([a-z0-9-]+)\/(\d+)x(\d+)$/i);
        if (mm) episodes.set(`${mm[1].toLowerCase()}/${mm[2]}x${mm[3]}`, loc);
      }
    }

    console.log(`[Flemmix] Index structure: ${seasons.size} saison(s), ${episodes.size} épisode(s)`);
    return { seasons, episodes };
  }, { successTtl: 1800000, failureTtl: 120000 });
}

// Hôtes de lecteurs dont l'URL finale n'est jamais lisible en direct
// (my.mail.ru : 403 sur HEAD et GET, avec ou sans Referer — vérifié en live).
const DEAD_HOST_RE = /(^|\.)(my\.mail\.ru|ok\.ru)$/i;

function hostOf(url) {
  const m = String(url || '').match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : '';
}

/** Corrige les bases de playlist (VOE `…/urlset/`) et rejette le non-jouable. */
function fixFinalUrl(url) {
  let u = String(url || '').trim();
  if (!u) return null;
  if (hostOf(u) && DEAD_HOST_RE.test(hostOf(u))) return null;
  if (/\/urlset\/?$/i.test(u)) u = u.replace(/\/$/, '') + '/master.m3u8';
  if (/\.(mp4|m3u8|mkv|webm|mpd)(\?.*)?$/i.test(u)) return u;
  if (/\/master\.m3u8/i.test(u)) return u;
  return null;
}

/** Priorité de résolution : vidmoly d'abord (m3u8 en clair, mesuré le plus
 *  rapide), puis les autres lecteurs du site. */
function serverRank(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('minochinos') || u.includes('vidmoly') || u.includes('vmpx')) return 0;
  if (u.includes('myvidplay') || u.includes('playmogo')) return 1;
  if (u.includes('vidsrc')) return 8; // non résoluble (ChaCha20/wasm) → en dernier
  return 5;
}

async function resolveWithTimeout(stream, timeoutMs = 14000) {
  try {
    const resolved = await withTimeout(resolveStream(stream), timeoutMs)
    if (resolved && resolved.url && resolved.isDirect) return resolved
    return null
  } catch {
    return null
  }
}

/**
 * Résout les serveurs. Sources réelles du site :
 *  - embeds signés flemmix (peel → minochinos → player packé → master.m3u8)
 *  - vidsrc-embed.ru (VO/VOSTFR) : chaîne /vs_src.php → cloud gate fermée
 *    (403 "Session expired", token host-bound non reproductible hors
 *    navigateur — vérifié en live) → embed NON retourné (non jouable par
 *    ExoPlayer, convention repo : ne jamais retourner d'embed irrésolu).
 */
async function createStreamsFromServers(servers, name, subType) {
  // Serveurs triés par fiabilité (le 1er flux de la liste est celui que l'app
  // tente en premier) et dédoublonnés par URL d'embed.
  const seen = new Set()
  const ordered = servers
    .filter((s) => {
      if (!s || !s.url || seen.has(s.url)) return false
      seen.add(s.url)
      return !DEAD_HOST_RE.test(hostOf(s.url))
    })
    .sort((a, b) => serverRank(a.url) - serverRank(b.url))

  const results = await Promise.allSettled(
    ordered.map(async (server) => {
      const stream = toStream(server.url, server.language || 'VF', name, SITE.BASE_URL, { quality: server.quality || 'HD', subType })
      // Referer flemmix sur l'embed signé (hotlink check)
      if (/flemmix\.me\/embed\//.test(server.url)) {
        stream.headers = { ...stream.headers, Referer: `${SITE.BASE_URL}/`, Origin: SITE.BASE_URL }
      }
      // vidsrc.sh : player à déchiffrement ChaCha20/WebAssembly (absent de
      // QuickJS) — jamais résoluble ici. On lui donne un budget court au lieu
      // des 14 s, sinon chaque épisode dont c'est le seul lecteur coûtait
      // 14 s pour finir à 0 flux (mesuré : 19,4 s → 4,1 s sur AHS).
      const isVidsrc = /vidsrc\./i.test(server.url)
      const resolved = await resolveWithTimeout(stream, isVidsrc ? 3500 : 14000)
      if (!resolved || !resolved.url || !resolved.isDirect) {
        console.log('[Flemmix] Non résolu: ' + server.language + ' ' + server.url.slice(0, 70) +
          (isVidsrc ? ' (vidsrc chiffré/wasm — non supporté)' : ''))
        return null
      }
      const finalUrl = fixFinalUrl(resolved.url)
      if (!finalUrl) {
        console.log('[Flemmix] URL finale non jouable ignorée: ' + String(resolved.url).slice(0, 70))
        return null
      }
      return { ...resolved, url: finalUrl, provider: 'flemmix' }
    })
  )

  const out = []
  const seenUrl = new Set()
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    const key = `${r.value.language || ''}|${r.value.url}`
    if (seenUrl.has(key)) continue
    seenUrl.add(key)
    out.push(r.value)
  }
  return filterPlayable(out)
}

/**
 * Sonde les URLs finales et écarte celles qui ne se lancent pas (502/403/404,
 * page HTML d'erreur). Gain vérifié en live : une chaîne CDN VidMoly peut
 * répondre 502 sur le master 1080p alors que le 720p fonctionne — sans sonde,
 * l'app ouvrait le flux mort en premier et rien ne démarrait.
 *
 * Si une langue perd TOUS ses flux, on la restaure telle quelle : mieux vaut un
 * flux incertain que plus aucune option pour cette langue.
 */
async function filterPlayable(streams) {
  if (!streams.length) return streams
  const verdicts = await Promise.all(streams.map((s) =>
    verifyPlayableUrl(s.url, s.headers || {}, { timeoutMs: 6000 }).catch(() => 'unknown')
  ))
  const alive = streams.filter((_, i) => verdicts[i] !== 'dead')
  const langs = new Set(streams.map((s) => s.language || ''))
  const aliveLangs = new Set(alive.map((s) => s.language || ''))
  for (const lang of langs) {
    if (!aliveLangs.has(lang)) {
      alive.push(...streams.filter((s) => (s.language || '') === lang))
      console.log(`[Flemmix] Aucun flux ${lang} ne répond à la sonde → flux conservés par défaut`)
    }
  }
  const dead = streams.length - streams.filter((_, i) => verdicts[i] !== 'dead').length
  if (dead > 0) console.log(`[Flemmix] ${dead} flux mort(s) écarté(s) par la sonde`)
  return alive
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  // ⚠️ Nuvio passe 'series' (jamais 'tv') — resolveTargetEpisodes exige 'tv'.
  const isTv = mediaType === 'series' || mediaType === 'tv'

  const rawTitles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!rawTitles || rawTitles.length === 0) return []
  // Strip season suffixes (ex: "Naruto Season 1" → "Naruto")
  const titles = rawTitles.map(t => stripSeasonSuffix(t))
  titles._metadata = rawTitles._metadata
  titles.effectiveSeason = rawTitles.effectiveSeason

  const subType = await detectSubType(tmdbId, mediaType, titles)
  if (subType) console.log(`[Flemmix] Detected subtype: ${subType}`)

  if (isAborted(signal)) return []

  if (!isTv) {
    return extractMovie(tmdbId, titles, subType)
  }

  return extractSeries(tmdbId, mediaType, titles, season, episode, subType)
}

async function extractMovie(tmdbId, titles, subType) {
  // Sitemap d'abord : une seule requête (cache 30 min) couvrant TOUT le
  // catalogue (903 films), alors que `/search` est throttlé et incomplet.
  const match = await trySitemap(titles, false) || await trySearchBilingual(titles, false)
  if (!match) {
    console.warn(`[Flemmix] Movie not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Flemmix] Movie match: ${match.title} -> ${match.url}`)
  try {
    const pageHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    const $ = cheerio.load(pageHtml)
    const servers = parseServerTabs($, SELECTORS.MOVIE_PLAYER_TABS)

    if (servers.length === 0) {
      console.warn(`[Flemmix] No servers on ${match.url}`)
      return []
    }
    console.log(`[Flemmix] Movie: ${servers.length} serveur(s) [${servers.map(s => s.language).join(', ')}]`)

    return await createStreamsFromServers(servers, 'Flemmix', subType)
  } catch (e) {
    console.warn(`[Flemmix] Movie extraction failed: ${e.message}`)
  }
  return []
}

async function extractSeries(tmdbId, mediaType, titles, season, episode, subType) {
  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  let targetSeasonNum = parseInt(effectiveSeason) || 1
  // resolveTargetEpisodes exige mediaType === 'tv' → normaliser
  let targetEpisodeNums = await resolveTargetEpisodes(tmdbId, 'tv', season, episode)

  // App NuvioTV sur les IDs anime : `season=null` + numéro ABSOLU. Sans
  // reverse-map, le provider cherchait S1E{absolu} (`S1E1000`) et ne trouvait
  // jamais rien. On convertit l'absolu en (saison, épisode) TMDB, qui est la
  // numérotation utilisée par les pages `{s}x{e}` du site.
  if ((season == null || season === '') && episode) {
    const mapped = await getSeasonEpisodeFromAbsolute(tmdbId, parseInt(episode) || 0)
    if (mapped && mapped.season) {
      targetSeasonNum = mapped.season
      targetEpisodeNums = [mapped.episode]
      console.log(`[Flemmix] Épisode absolu ${episode} → S${mapped.season}E${mapped.episode}`)
    }
  }

  // Sitemap d'abord (voir extractMovie) : couvre les 455 séries du site.
  const match = await trySitemap(titles, true) || await trySearchBilingual(titles, true)
  if (!match) {
    console.warn(`[Flemmix] Series not found for TMDB ${tmdbId}`)
    return []
  }

  console.log(`[Flemmix] Series match: ${match.title} -> ${match.url}`)
  try {
    const seriesSlug = (match.url.match(/\/serie\/([^/?#]+)/) || [])[1] || ''
    let structure = null
    const getStructure = async () => {
      if (structure) return structure
      try {
        structure = await loadStructureIndex()
      } catch {
        // Sitemaps throttlés/indisponibles : on continue sans index de secours.
        structure = { seasons: new Map(), episodes: new Map() }
      }
      return structure
    }

    let seriesHtml = ''
    try {
      seriesHtml = await fetchText(match.url, { timeout: TIMEOUTS.PAGE })
    } catch (e) {
      console.warn(`[Flemmix] Series page failed (${e.message}), sitemap fallback`)
    }
    const seasons = seriesHtml ? parseSeasons(seriesHtml) : []

    // Page saison : listing HTML, sinon sitemap `seasons` (certaines séries
    // n'exposent pas leurs season-cards dans le HTML).
    let seasonLink = (seasons.find(s => s.num === targetSeasonNum) || {}).link || ''
    let fromSitemapSeason = false
    if (!seasonLink && seriesSlug) {
      const idx = await getStructure()
      const sitemapSeason = idx.seasons.get(`${seriesSlug}/saison-${targetSeasonNum}`)
      if (sitemapSeason) {
        seasonLink = sitemapSeason
        fromSitemapSeason = true
      }
    }

    // ⚠️ Anti-mismatch : si la saison demandée n'existe pas sur le site, ne
    // JAMAIS retomber sur une autre saison (l'utilisateur recevrait des
    // épisodes qui ne correspondent pas au titre). On abandonne proprement.
    if (!seasonLink) {
      console.warn(`[Flemmix] Season ${targetSeasonNum} not found on site (available: ${seasons.map(s => s.num).join(', ') || 'aucune'})`)
      return []
    }
    console.log(`[Flemmix] Selected season: ${targetSeasonNum} -> ${seasonLink}${fromSitemapSeason ? ' (sitemap)' : ''}`)

    let seasonHtml = ''
    try {
      seasonHtml = await fetchText(seasonLink, { timeout: TIMEOUTS.PAGE })
    } catch (e) {
      console.warn(`[Flemmix] Season page failed: ${e.message}`)
    }
    const episodes = seasonHtml ? parseSeasonEpisodes(seasonHtml, seriesSlug) : []

    let ep = null
    for (const epNum of targetEpisodeNums) {
      ep = episodes.find(e => e.season === targetSeasonNum && e.episode === epNum)
      if (ep) break
    }
    // ⚠️ PAS de fallback par index (l'ancien `episodes[epNum-1]` donnait
    // l'épisode suivant/précédent quand un numéro manquait = mismatch) : le
    // repli se fait uniquement sur le sitemap, avec le MÊME numéro S/E.
    if (!ep && seriesSlug) {
      const idx = await getStructure()
      for (const epNum of targetEpisodeNums) {
        const key = `${seriesSlug}/${targetSeasonNum}x${epNum}`
        const loc = idx.episodes.get(key)
        if (loc) {
          ep = { season: targetSeasonNum, episode: epNum, link: loc }
          console.log(`[Flemmix] Episode via sitemap: S${targetSeasonNum}E${epNum}`)
          break
        }
      }
    }
    if (!ep) {
      console.warn(`[Flemmix] Episode ${targetEpisodeNums[0]} not found in season ${targetSeasonNum} (${episodes.length} episodes available)`)
      return []
    }

    console.log(`[Flemmix] Episode: S${ep.season}E${ep.episode} -> ${ep.link}`)
    const epHtml = await fetchText(ep.link, { timeout: TIMEOUTS.PAGE })
    const $ = cheerio.load(epHtml)
    const servers = parseServerTabs($, SELECTORS.EPISODE_PLAYER_TABS)

    if (servers.length === 0) {
      console.warn(`[Flemmix] No servers on episode page`)
      return []
    }
    console.log(`[Flemmix] Episode: ${servers.length} serveur(s) [${servers.map(s => s.language).join(', ')}]`)

    return await createStreamsFromServers(servers, 'Flemmix', subType)
  } catch (e) {
    console.warn(`[Flemmix] Series extraction failed: ${e.message}`)
  }
  return []
}
