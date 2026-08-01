/**
 * Extractor for Coflix
 * WordPress DLE-based site with:
 * - /film/{slug}/ for movies
 * - /episode/{slug}-{season}x{episode}/ for TV episodes
 * Uses iframe embed from lecteurvideo.com for streaming
 * Supports: films, séries, anime
 */

import { stripSeasonSuffix, toStream, resolveTargetEpisodes, countExtraWords } from '../utils/dle-extractor.js'
import { fetchText, fetchJson, setCurrentSignal } from './http.js'
import { resolveStream, isAborted } from '../utils/resolvers.js'
import { getTmdbTitles } from '../utils/metadata.js'
import { createCache } from '../utils/cache.js'

// ─── Cache intelligent partagé ──────────────────────────────────────────────
const withCache = createCache('cf', 'Coflix');

const PAGE_TIMEOUT = 5000;

// Limiter le nombre de titres/slugs à tester pour éviter le timeout budget
const MAX_MOVIE_TITLES = 2;
const MAX_SERIES_TITLES = 2;
const MAX_SLUG_CANDIDATES = 4;

// ─── Helpers ────────────────────────────────────────────────────────────────

function toSlug(title) {
  const clean = stripSeasonSuffix(title)
  return clean
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[':!.,?()\[\]"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Génère des candidats de slug pour un titre.
 * Inclut variantes avec année, "the-" préfixe, saison.
 */
function generateSlugCandidates(title, season, year) {
  const base = toSlug(title)
  const candidates = []

  // Slug de base
  candidates.push(base)

  // Slug sans "the-" préfixe
  if (base.startsWith('the-')) candidates.push(base.slice(4))

  // Slug avec année (ex: fight-club-1999)
  if (year) {
    candidates.push(`${base}-${year}`)
    if (base.startsWith('the-')) candidates.push(`${base.slice(4)}-${year}`)
  }

  // Slug avec saison
  if (season) {
    candidates.push(`${base}-s${season}`)
    candidates.push(`${base}-saison-${season}`)
    if (year) {
      candidates.push(`${base}-${year}-s${season}`)
    }
  }

  return [...new Set(candidates.filter(Boolean))]
}

function extractIframeUrl(html) {
  if (!html) return null

  const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  if (iframeMatch) {
    let src = iframeMatch[1]
    if (src.startsWith('//')) src = 'https:' + src
    if (src.includes('lecteurvideo.com') || (src.startsWith('http') && !src.includes('youtube') && !src.includes('googlevideo') && !src.includes('googleads'))) {
      return src
    }
  }

  const lvMatch = html.match(/https:\/\/lecteurvideo\.com\/\?get=[^"'\s]+/)
  if (lvMatch) return lvMatch[0]

  const dataSrcMatch = html.match(/data-src=["']([^"']*lecteurvideo[^"']*)["']/i)
  if (dataSrcMatch) return dataSrcMatch[1]

  return null
}

function extractLanguage(html, url) {
  if (!html) return 'VF'
  const lower = html.toLowerCase()
  const urlLower = url.toLowerCase()

  if (urlLower.includes('vostfr')) return 'VOSTFR'
  if (urlLower.includes('-vf') || urlLower.includes('/vf/')) return 'VF'

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  if (titleMatch) {
    const t = titleMatch[1].toLowerCase()
    if (t.includes('vostfr')) return 'VOSTFR'
    if (t.includes(' vf ') || / vf[^a-z]/.test(t)) return 'VF'
  }

  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/)
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1])
      const name = (ld.name || ld.title || '').toLowerCase()
      if (name.includes('vostfr')) return 'VOSTFR'
      if (name.includes(' vf ')) return 'VF'
    } catch {}
  }

  if (/vostfr/i.test(lower)) return 'VOSTFR'
  return 'VF'
}

function extractEpisodeNumber(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  if (titleMatch) {
    const t = titleMatch[1]
    const epMatch = t.match(/(\d+)x(\d+)/i) || t.match(/[Ss](\d+)[Ee](\d+)/)
    if (epMatch) return { season: parseInt(epMatch[1]), episode: parseInt(epMatch[2]) }
  }
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/)
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1])
      const name = ld.name || ''
      const epMatch = name.match(/(\d+)x(\d+)/i) || name.match(/[Ss](\d+)[Ee](\d+)/)
      if (epMatch) return { season: parseInt(epMatch[1]), episode: parseInt(epMatch[2]) }
    } catch {}
  }
  return null
}

/**
 * Cherche via l'API REST WordPress (/wp-json/v2/posts?search=...)
 * pour trouver l'URL exacte d'une page film/épisode
 */
async function searchViaWpApi(query, mediaType, season, episode) {
  const searchQuery = encodeURIComponent(query);
  const path = `/wp-json/v2/posts?search=${searchQuery}&per_page=10`;

  console.log(`[Coflix] WP API search: \"${query}\"`);
  const posts = await fetchJson(path);

  if (!posts || !Array.isArray(posts) || posts.length === 0) {
    console.log(`[Coflix] No WP API results for \"${query}\"`);
    return null;
  }

  console.log(`[Coflix] WP API: ${posts.length} post(s) found`);

  for (const post of posts) {
    const link = post.link || '';
    const slug = post.slug || '';
    const title = (post.title?.rendered || '').toLowerCase();

    // Vérifier la pertinence du résultat
    const queryLower = query.toLowerCase();
    const isRelevant = title.includes(queryLower) || slug.includes(toSlug(query));

    // Garde anti-fan-edit : un résultat avec ≥2 mots significatifs en trop
    // (ex: requête "Naruto" → post "Naruto Shippuden Kai") est un dérivé/recut → écarter
    if (isRelevant && countExtraWords(title, queryLower) >= 2) {
      console.log(`[Coflix] WP result is a fan-edit/derivative, skipped: "${title}"`);
      continue;
    }

    if (!isRelevant) {
      console.log(`[Coflix] WP result not relevant: \"${title}\" for \"${query}\"`);
      continue;
    }

    // Pour les séries, on construit l'URL d'épisode
    if (mediaType === 'tv' && season && episode) {
      // Essayer de construire l'URL d'épisode basée sur le lien du post
      const seriesSlug = slug || toSlug(query);
      const patterns = [
        `/episode/${seriesSlug}-${season}x${episode}/`,
        `/episode/${seriesSlug}-s${season}e${episode}/`,
      ];

      for (const epPath of patterns) {
        const html = await fetchText(epPath, { timeout: PAGE_TIMEOUT });
        if (html && html.length > 100) {
          const iframeUrl = extractIframeUrl(html);
          if (iframeUrl) {
            console.log(`[Coflix] WP search found episode: ${epPath}`);
            return { url: iframeUrl, lang: extractLanguage(html, epPath) };
          }
        }
      }
    }

    // Pour les films ou si l'épisode n'a pas matché, essayer la page directement
    const slugToTry = slug || toSlug(query);
    const moviePath = `/film/${slugToTry}/`;
    const html = await fetchText(moviePath, { timeout: PAGE_TIMEOUT });
    if (html && html.length > 200) {
      const iframeUrl = extractIframeUrl(html);
      if (iframeUrl) {
        console.log(`[Coflix] WP search found: ${moviePath}`);
        return { url: iframeUrl, lang: extractLanguage(html, moviePath) };
      }
    }
  }

  return null;
}

// ─── Probing functions ──────────────────────────────────────────────────────

async function probeMovie(slug) {
  return withCache(`movie_${slug}`, async () => {
    const patterns = [`/film/${slug}/`, `/movie/${slug}/`]
    for (const path of patterns) {
      const html = await fetchText(path, { timeout: PAGE_TIMEOUT })
      if (html && html.length > 200) {
        const iframeUrl = extractIframeUrl(html)
        if (iframeUrl) {
          console.log(`[Coflix] Found movie at: ${path}`)
          return { url: iframeUrl, lang: extractLanguage(html, path) }
        }
      }
    }
    return null
  }, { successTtl: 300000, failureTtl: 30000 })
}

async function probeEpisode(slug, season, episode) {
  return withCache(`ep_${slug}_${season}_${episode}`, async () => {
    const patterns = [
      `${slug}-${season}x${episode}`,
      `${slug}-s${season}e${episode}`,
      `${slug}-saison-${season}-episode-${episode}`,
    ]

    for (const pattern of [...new Set(patterns)]) {
      const path = `/episode/${pattern}/`
      const html = await fetchText(path, { timeout: PAGE_TIMEOUT })
      if (html && html.length > 100) {
        const pageEp = extractEpisodeNumber(html)
        if (pageEp && pageEp.season === season && pageEp.episode === episode) {
          console.log(`[Coflix] Found episode (validated): ${path}`)
        } else if (pageEp && Math.abs((pageEp.episode || 0) - episode) > 1) {
          continue
        }

        const iframeUrl = extractIframeUrl(html)
        if (iframeUrl) {
          return { url: iframeUrl, lang: extractLanguage(html, path) }
        }
      }
    }
    return null
  }, { successTtl: 300000, failureTtl: 30000 })
}

// ─── Fonction principale ────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null
  if (isAborted(signal)) return []
  setCurrentSignal(signal)

  const titles = await getTmdbTitles(tmdbId, mediaType, { season })
  if (!titles || titles.length === 0) return []

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season
  const targetSeason = parseInt(effectiveSeason) || 1
  const targetEpisode = parseInt(episode) || 1

  // ─── FILMS ───────────────────────────────────────────────────────────────
  if (mediaType === 'movie') {
    for (const title of titles.slice(0, MAX_MOVIE_TITLES)) {
      const candidates = generateSlugCandidates(title, null, titles._metadata?.year).slice(0, MAX_SLUG_CANDIDATES)
      for (const slug of [...new Set(candidates)]) {
        const result = await probeMovie(slug)
        if (result) {
          const stream = toStream(result.url, result.lang, 'Coflix', 'https://coflix.cymru')
          const resolved = await resolveStream(stream)
          if (resolved && resolved.url) return [{ ...resolved, provider: 'coflix' }]
          return [{ ...stream, provider: 'coflix', type: 'embed' }]
        }
      }
    }

    // Fallback : recherche via WP REST API
    console.log('[Coflix] Movie slug failed, trying WP API search...')
    const wpResult = await searchViaWpApi(titles[0], mediaType, null, null)
    if (wpResult) {
      const stream = toStream(wpResult.url, wpResult.lang, 'Coflix', 'https://coflix.cymru')
      const resolved = await resolveStream(stream)
      if (resolved && resolved.url) return [{ ...resolved, provider: 'coflix' }]
      return [{ ...stream, provider: 'coflix', type: 'embed' }]
    }

    console.log(`[Coflix] No movie match for ${tmdbId}`)
    return []
  }

  // ─── SÉRIES (TV / Anime) ────────────────────────────────────────────────
  // Résolution des épisodes cibles via ArmSync (gère les saisons multiples)
  const targetEpisodes = await resolveTargetEpisodes(tmdbId, mediaType, targetSeason, targetEpisode)

  for (const ep of targetEpisodes) {
    for (const title of titles.slice(0, MAX_SERIES_TITLES)) {
      const candidates = generateSlugCandidates(title, targetSeason, titles._metadata?.year).slice(0, MAX_SLUG_CANDIDATES)
      for (const slug of [...new Set(candidates)]) {
        const result = await probeEpisode(slug, targetSeason, ep)
        if (result) {
          const stream = toStream(result.url, result.lang, 'Coflix', 'https://coflix.cymru')
          const resolved = await resolveStream(stream)
          if (resolved && resolved.url) return [{ ...resolved, provider: 'coflix' }]
          return [{ ...stream, provider: 'coflix', type: 'embed' }]
        }
      }
    }

    // Fallback : chercher avec l'épisode original si le numéro absolu diffère
    if (ep !== targetEpisode) {
      for (const title of titles.slice(0, MAX_SERIES_TITLES)) {
        const candidates = generateSlugCandidates(title, targetSeason, null).slice(0, MAX_SLUG_CANDIDATES)
        for (const slug of [...new Set(candidates)]) {
          const result = await probeEpisode(slug, targetSeason, targetEpisode)
          if (result) {
            const stream = toStream(result.url, result.lang, 'Coflix', 'https://coflix.cymru')
            const resolved = await resolveStream(stream)
            if (resolved && resolved.url) return [{ ...resolved, provider: 'coflix' }]
            return [{ ...stream, provider: 'coflix', type: 'embed' }]
          }
        }
      }
    }
  }

  // Fallback final : recherche via WP REST API
  console.log('[Coflix] All slug attempts failed, trying WP API search...')
  const wpResult = await searchViaWpApi(titles[0], mediaType, targetSeason, targetEpisode)
  if (wpResult) {
    const stream = toStream(wpResult.url, wpResult.lang, 'Coflix', 'https://coflix.cymru')
    const resolved = await resolveStream(stream)
    if (resolved && resolved.url) return [{ ...resolved, provider: 'coflix' }]
    return [{ ...stream, provider: 'coflix', type: 'embed' }]
  }

  console.log(`[Coflix] No match found for ${tmdbId} (${mediaType})`)
  return []
}
