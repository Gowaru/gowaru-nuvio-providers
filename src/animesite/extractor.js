/**
 * Extractor for AnimeSite (animesite.fr — Next.js 15 / RSC, diag live 2026-09).
 *
 * Chaîne réelle (chaque étape prouvée en live) :
 *   1. Search : GET /search?q={q} → RSC flight contenant les cartes
 *      <a title="..." href="/{id}-{slug}"> (le site filtre côté serveur ;
 *      une section « populaires » est mélangée → scoring local obligatoire).
 *   2. Fiche : GET /{id}-{slug} → JSON-LD TVSeries avec containsSeason
 *      [{seasonNumber, numberOfEpisodes}] (validation d'existence) + flight
 *      RSC seasons[{numero, episodes[]}].
 *   3. Player : POST /api/stream/token { idAndSlugTitle, seasonNumber,
 *      episodeNumber, playerIndex } → { status:"ok", src:"/v/{token}" } →
 *      GET /v/{token} → 302 vers l'embed réel.
 *   4. 5 lecteurs par épisode (playerIndex 0..4) : sibnet (VF et/ou VOSTFR
 *      selon l'ID), bysedikamoum (Byse AES-GCM → resolveByse), sendvid, ...
 *
 * Langue : le site n'expose PAS la langue par player → détection sur le titre
 * sibnet (« ... VOSTFR » dans shell.php) ; défaut VF (majorité du catalogue).
 */
import { fetchPage, resolveStreamSrc, fetchStreamToken, isRateLimited, BASE, USER_AGENT } from './http.js';
import { resolveByse, isByseUrl } from '../jetanimes/byse.js';
import { isAborted, isBudgetExhausted, normalizeLanguageCode, safeFetch, withTimeout } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { hasForeignLeadingTokens, getAbsoluteEpisodeFromTmdb, resolveSeasonEpisodeInputs } from '../utils/dle-extractor.js';

const PROVIDER = 'AnimeSite';
const BUDGET_MS = 42000;
const RESERVE_MS = 14000;
const MAX_STREAMS = 8;
// Le site expose jusqu'à 10 lecteurs par épisode (constaté : 0…9, VF souvent
// aux index 6-9). L'ancien plafond de 5 index ne voyait JAMAIS le VF.
// Plafonné à 10 : chaque lecteur coûte 2 requêtes (token + /v/) et le rate-limit
// IP du site bannit ~3,5 min au-delà d'une trentaine de requêtes (mesuré).
const MAX_PLAYERS = 10;
const MAX_PER_LANG = 3;

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Search → cartes
// ─────────────────────────────────────────────────────────────────────────────

/** Cartes de la page search : <a title="..." href="/{id}-{slug}">. */
export function parseSearchCards(html) {
  if (!html) return [];
  const out = [];
  const seen = new Set();
  const push = (title, slug) => {
    if (!slug || seen.has(slug)) return;
    const t = decodeEntities(title).trim();
    if (t.length < 2) return;
    seen.add(slug);
    out.push({ idAndSlug: slug, title: t });
  };
  let m;
  const re = /<a\s+title="([^"]{2,140})"\s+href="\/(\d{3,}-[a-z0-9-]+)"/g;
  while ((m = re.exec(html)) !== null) push(m[1], m[2]);
  if (out.length === 0) {
    const re2 = /<a\s+href="\/(\d{3,}-[a-z0-9-]+)"\s+title="([^"]{2,140})"/g;
    while ((m = re2.exec(html)) !== null) push(m[2], m[1]);
  }
  if (out.length === 0) {
    // dernier recours : hrefs nus (sans title)
    const re3 = /href="\/(\d{3,}-[a-z0-9-]+)"/g;
    while ((m = re3.exec(html)) !== null) push(m[1].replace(/^\d+-/, ''), m[1]);
  }
  return out;
}

// ── Catalogue complet via sitemap.xml ──────────────────────────────────────
// La search SSR IGNORE le paramètre q (renvoie les « populaires ») : un titre
// absent de cette liste serait introuvable bien que sa fiche existe.
// /sitemap.xml liste TOUTES les fiches (~2670, 55 KB) → titre dérivé du slug.

let sitemapCache = { at: 0, items: null };
const SITEMAP_TTL = 24 * 60 * 60 * 1000;

function titleFromSlug(slug) {
  return String(slug || '')
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .trim();
}

export function parseSitemapItems(xml) {
  if (!xml) return [];
  const out = [];
  const seen = new Set();
  const re = /<loc>https:\/\/animesite\.fr\/(\d{3,}-[a-z0-9-]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const title = titleFromSlug(slug);
    if (title.length >= 2) out.push({ idAndSlug: slug, title });
  }
  return out;
}

async function getFullCatalog(signal) {
  if (sitemapCache.items && Date.now() - sitemapCache.at < SITEMAP_TTL) return sitemapCache.items;
  const xml = await fetchPage(`${BASE}/sitemap.xml`, { signal });
  const items = parseSitemapItems(xml);
  if (items.length > 0) {
    sitemapCache = { at: Date.now(), items };
    console.log(`[${PROVIDER}] Sitemap: ${items.length} fiches`);
    return items;
  }
  return null;
}

function scoreCard(card, queryNorm) {
  const nTitle = normalize(card.title);
  if (!nTitle || !queryNorm) return 0;
  if (nTitle === queryNorm) return 120;
  if (hasForeignLeadingTokens(nTitle, queryNorm)) return 0;
  if (nTitle.startsWith(queryNorm + ' ') || queryNorm.startsWith(nTitle + ' ')) return 90;
  if (nTitle.includes(queryNorm) || queryNorm.includes(nTitle)) return 70;
  const qWords = queryNorm.split(/\s+/).filter((w) => w.length > 2);
  const tWords = new Set(nTitle.split(/\s+/));
  const matched = qWords.filter((w) => tWords.has(w)).length;
  if (qWords.length >= 2 && matched < 2) return 0;
  return Math.round((matched / Math.max(qWords.length, 1)) * 60);
}

/**
 * Titres localisés TMDB (fr-FR). Les métadonnées bundlées de `metadata.js`
 * n'exposent pas toujours le titre FR (« Spirited Away » sans « Le Voyage de
 * Chihiro ») alors que le catalogue du site est en FR → introuvable.
 * 1 requête, uniquement quand la recherche initiale a échoué.
 */
const TMDB_API_KEY =
  (typeof globalThis !== 'undefined' && globalThis.TMDB_API_KEY) || '8265bd1679663a7ea12ac168da84d2e8';

async function fetchLocalizedTitles(tmdbId, mediaType, signal) {
  const out = [];
  const kind = mediaType === 'movie' ? 'movie' : 'tv';
  for (const lang of ['fr-FR', 'en-US']) {
    if (!/^\d+$/.test(String(tmdbId))) break;
    try {
      const res = await safeFetch(
        `https://api.themoviedb.org/3/${kind}/${tmdbId}?api_key=${TMDB_API_KEY}&language=${lang}`,
        { headers: { Accept: 'application/json' }, timeout: 10000, signal }
      );
      const text = res ? await res.text().catch(() => '') : '';
      if (!text) continue;
      const json = JSON.parse(text);
      for (const t of [json && json.title, json && json.name, json && json.original_title, json && json.original_name]) {
        if (typeof t === 'string' && t.trim().length >= 2 && !out.includes(t.trim())) out.push(t.trim());
      }
    } catch (e) { /* titre localisé optionnel */ }
    if (out.length >= 2) break;
  }
  return out;
}

async function findSeries(titles, signal) {
  const candidates = (titles || []).filter(Boolean).slice(0, 6);
  let best = null;
  let bestScore = 0;
  // 1) Search SSR (rapide ; ignore q mais couvre les populaires)
  for (const title of candidates) {
    if (isBudgetExhausted(Date.now(), BUDGET_MS - RESERVE_MS)) break;
    const q = normalize(title);
    if (!q || q.length < 3) continue;
    const html = await fetchPage(`${BASE}/search?q=${encodeURIComponent(title)}`, { signal });
    if (!html) continue;
    const cards = parseSearchCards(html);
    for (const card of cards) {
      const s = scoreCard(card, q);
      if (s > bestScore) {
        bestScore = s;
        best = card;
      }
    }
    if (bestScore >= 120) break;
  }
  // Ne pas s'arrêter sur un match FAIBLE (70 = simple inclusion) : pour un film
  // (« Demon Slayer - The Movie: Mugen Train ») la série « Kimetsu no Yaiba »
  // marquait 70 et était retournée avant que la fiche film (match exact 120)
  // ne soit vue → on servait l'épisode 1 de la série à la place du film.
  // Seul un match EXACT (120) permet d'éviter le catalogue : un simple préfixe
  // (90) suffisait à retourner la série « Demon Slayer » pour le film « Demon
  // Slayer - The Movie: Mugen Train ».
  if (best && bestScore >= 120) return best;
  // 2) Fallback : scoring du catalogue complet (sitemap) sur TOUTES les
  //    variantes TMDB — la search SSR ne couvre pas les titres peu populaires.
  const catalog = await getFullCatalog(signal);
  let bestLabel = null;
  if (catalog) {
    for (const title of (titles || []).filter(Boolean).slice(0, 8)) {
      const q = normalize(title);
      if (!q || q.length < 3) continue;
      for (const item of catalog) {
        const s = scoreCard(item, q);
        if (s > bestScore) {
          bestScore = s;
          best = item;
          bestLabel = title;
        }
      }
      if (bestScore >= 120) break;
    }
  }
  // Les fiches du sitemap n'ont qu'un titre dérivé du slug (minuscules, tirets)
  // → on affiche le titre TMDB qui a matché.
  if (best && bestLabel) best = { ...best, title: bestLabel };
  return best && bestScore >= 70 ? best : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fiche → validation saison/épisode (JSON-LD containsSeason)
// ─────────────────────────────────────────────────────────────────────────────

/** JSON-LD TVSeries : name + containsSeason (numérotation du SITE). */
export function parseFicheMeta(html) {
  if (!html) return null;
  const out = { title: null, seasons: {} };
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let json = null;
    try {
      json = JSON.parse(m[1]);
    } catch (e) {
      continue;
    }
    const objs = Array.isArray(json) ? json : [json];
    for (const o of objs) {
      if (o && o['@type'] === 'TVSeries') {
        if (o.name) out.title = decodeEntities(o.name);
        if (Array.isArray(o.containsSeason)) {
          for (const s of o.containsSeason) {
            const n = parseInt(s && s.seasonNumber, 10);
            const c = parseInt(s && s.numberOfEpisodes, 10) || 0;
            if (n > 0) out.seasons[n] = c;
          }
        }
      }
    }
  }
  return out.title || Object.keys(out.seasons).length > 0 ? out : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecteurs
// ─────────────────────────────────────────────────────────────────────────────

// ── Langue et épisode réels d'un lecteur ──────────────────────────────────
// DIAG 2026-11 : le site n'expose AUCUNE langue par player (l'API token ne
// renvoie que { src }) et les lecteurs VF / VOSTFR sont MÉLANGÉS dans la liste
// (le VF arrive souvent aux index 6-9, au-delà des 5 index sondés avant).
// Chaque page d'embed porte le nom réel de la vidéo :
//   sendvid  → og:title "Jujutsu Kaisen 2 VF 720p"
//   vidmoly  → <title> "Jujutsu Kaisen S1 02 VOSTFR"
//   ansembed → <title> "One Piece 01 VOSTFR"
// L'ancienne détection cherchait « vostfr » n'importe où dans les 12 premiers
// Ko (menus, suggestions) : un embed VF ressortait VOSTFR, et le filtre VF
// affichait du contenu non doublé. On lit donc le TITRE, on en déduit langue,
// numéro d'épisode et qualité, et on écarte les embed morts (sendvid 404).
const embedProbeCache = new Map();
const EMBED_PROBE_TTL = 5 * 60 * 1000;

function langFromTitle(title) {
  const t = String(title || '');
  if (/vostfr|vostf\b/i.test(t)) return 'VOSTFR';
  if (/(^|[^a-z0-9])vf([^a-z0-9]|$)/i.test(t) || /version fran[cç]aise/i.test(t)) return 'VF';
  return null;
}

/** Numéro d'épisode lu dans le titre d'un embed ("… S1 02 VOSTFR", "… 1 VF 720p"). */
function episodeFromTitle(title) {
  const t = String(title || '').replace(/\b(?:2160|1080|720|480|360)p\b/gi, ' ');
  const m = /\b0*(\d{1,4})\b/.exec(t);
  return m ? parseInt(m[1], 10) : null;
}

/** Qualité annoncée dans le titre ("720p", "1080p"). */
function qualityFromTitle(title) {
  const m = /\b(2160|1080|720|480|360)p\b/i.exec(String(title || ''));
  return m ? m[1] + 'p' : null;
}

async function probeEmbedInfo(embedUrl) {
  const key = String(embedUrl).split('?')[0];
  const hit = embedProbeCache.get(key);
  if (hit && Date.now() - hit.at < EMBED_PROBE_TTL) return hit;
  const info = { lang: null, ep: null, quality: null, title: '', dead: false };
  try {
    const res = await safeFetch(embedUrl, {
      headers: { Referer: BASE + '/', 'User-Agent': USER_AGENT },
      timeout: 8000,
    });
    if (res) {
      const text = await res.text().catch(() => '');
      if (res.status === 404 || res.status === 410) info.dead = true;
      const og =
        /property="og:title"\s+content="([^"]*)"/i.exec(text) ||
        /name="twitter:title"\s+content="([^"]*)"/i.exec(text);
      const ti = /<title[^>]*>([^<]*)</i.exec(text);
      const title = decodeEntities((og && og[1]) || (ti && ti[1]) || '').trim();
      info.title = title;
      info.lang = langFromTitle(title);
      info.ep = episodeFromTitle(title);
      info.quality = qualityFromTitle(title);
    }
  } catch (e) { /* host muet → inconnu */ }
  embedProbeCache.set(key, info);
  return info;
}

// Lecteurs définitivement injouables (diag 2026-11) : sbfull.com = clone
// Streamtape (flux uniquement derrière JS/ads), vido.lol = domaine parqué.
const DEAD_EMBED_RE = /(sbfull\.com|vido\.lol|lpayer\.embed4me\.com)/i;

function hostLabel(url) {
  const u = String(url || '');
  if (/sibnet/.test(u)) return 'Sibnet';
  if (/sendvid/.test(u)) return 'Sendvid';
  if (/byse|secured\.lol|hdsplay/.test(u)) return 'Byse';
  if (/vidmoly/.test(u)) return 'Vidmoly';
  if (/dood/.test(u)) return 'Dood';
  if (/voe/.test(u)) return 'Voe';
  if (/streamtape/.test(u)) return 'Streamtape';
  if (/myxvpn|movixhub/.test(u)) return 'Mova';
  if (/ansembed/.test(u)) return 'Ansembed';
  if (/uqload/.test(u)) return 'Uqload';
  if (/sbfull/.test(u)) return 'Sbfull';
  if (/vido\.lol/.test(u)) return 'Vido';
  if (/embed4me/.test(u)) return 'Embed4Me';
  return 'Player';
}

/** Langue + titre réel depuis la page sibnet (le <title> est en cyrillique). */
async function sibnetProbe(embedUrl) {
  const meta = await safeFetch(embedUrl, {
    headers: { Referer: 'https://video.sibnet.ru/', 'User-Agent': USER_AGENT },
    timeout: 10000,
  }).catch(() => null);
  const text = meta ? await meta.text().catch(() => '') : '';
  if (!text) return {};
  const epM = /episode\s*(\d+)/i.exec(text);
  const ogM = /og:title" content="([^"]*)"/.exec(text);
  return {
    vostfr: /vostfr/i.test(text),
    vf: /(^|[^a-z])vf([^a-z]|$)/i.test(text),
    ep: epM ? parseInt(epM[1], 10) : null,
    ogTitle: ogM ? decodeEntities(ogM[1]).trim() : '',
    hasSrc: /player\.src\s*\(\s*\[\s*\{\s*src\s*:\s*["'][^"']+\.mp4/.test(text),
  };
}

/**
 * Garde anti-contenu-étranger : sibnet héberge parfois sous le même embed un
 * show totalement différent (« The Demon Hunter » pour « Gate ») ou une vidéo
 * morte (og:title vide, pas de player.src). Un titre distant sans AUCUN token
 * commun avec la série = contenu étranger → rejet.
 */
function isForeignSibnet(ogTitle, seriesTitle) {
  const ot = normalize(ogTitle);
  const st = normalize(seriesTitle);
  if (!ot) return true; // vidéo morte (og:title vide)
  const stTokens = st.split(/\s+/).filter((w) => w.length >= 3);
  if (stTokens.length === 0) return false; // série trop courte pour valider
  return !stTokens.some((w) => ot.includes(w));
}

async function resolveEmbed(embed, episode, signal, seriesTitle) {
  const embedUrl = embed.url;
  const host = embed.host;
  if (!embedUrl || typeof embedUrl !== 'string') return null;
  try {
    let langHint = null;
    let qualityHint = null;
    if (/sibnet/.test(embedUrl)) {
      const probe = await sibnetProbe(embedUrl);
      if (probe.hasSrc === false) {
        console.log(`[${PROVIDER}] sibnet: vidéo morte (pas de player.src) → rejet`);
        return null;
      }
      if (isForeignSibnet(probe.ogTitle, seriesTitle || '')) {
        console.log(`[${PROVIDER}] sibnet: contenu étranger "${probe.ogTitle || '(sans titre)'}" ≠ série → rejet`);
        return null;
      }
      if (probe.vostfr) langHint = 'VOSTFR';
      else if (probe.vf) langHint = 'VF';
      if (probe.ep && probe.ep !== episode) {
        console.log(`[${PROVIDER}] ⚠ sibnet dit épisode ${probe.ep} (demandé ${episode})`);
      }
    }
    if (!/sibnet/i.test(embedUrl)) {
      // Titre de la page d'embed → langue + épisode + qualité + embed mort.
      const info = await probeEmbedInfo(embedUrl);
      if (info.dead) {
        console.log(`[${PROVIDER}] ${host}: embed mort (HTTP 404) → rejet`);
        return null;
      }
      if (!langHint) langHint = info.lang;
      qualityHint = info.quality;
      // Garde anti-mauvais-épisode : si le titre annonce un autre numéro ET
      // cite la série, c'est un contenu décalé → rejet.
      if (info.ep && episode && info.ep !== episode && info.title) {
        const nt = normalize(info.title);
        const st = normalize(seriesTitle || '');
        const stWords = st.split(/\s+/).filter((w) => w.length >= 4);
        if (stWords.some((w) => nt.includes(w))) {
          console.log(`[${PROVIDER}] ${host}: titre "${info.title.slice(0, 60)}" annonce l'épisode ${info.ep} (demandé ${episode}) → rejet`);
          return null;
        }
      }
    }
    if (/byse|secured\.lol|hdsplay|bysedikamoum/i.test(embedUrl)) {
      const r = await withTimeout(
        resolveByse(embedUrl, async (u, o) => {
          const res = await safeFetch(u, { ...o, headers: { ...((o && o.headers) || {}), Referer: BASE + '/' } });
          return res ? { text: await res.text(), finalUrl: res.url } : null;
        }, signal),
        20000
      ).catch(() => null);
      // ⚠ resolveByse retourne { url, label } — ne pas passer l'objet comme URL
      if (r && r.url) {
        // L'API Byse renvoie un titre du type "42765 0 0 vf" → seule source de
        // langue fiable pour cet hébergeur (page front = coquille JS vide).
        const apiLang = /(^|[^a-z])vf([^a-z]|$)/i.test(String(r.title || ''))
          ? 'VF'
          : /(^|[^a-z])vo([^a-z]|$)/i.test(String(r.title || ''))
            ? 'VOSTFR'
            : null;
        return {
          url: r.url,
          type: 'hls',
          host,
          langHint: apiLang || langHint,
          quality: r.label || qualityHint,
        };
      }
      return null;
    }
    const { resolveStream } = await import('../utils/resolvers.js');
    const r = await resolveStream(
      {
        url: embedUrl,
        headers: { Referer: BASE + '/', 'User-Agent': USER_AGENT },
        title: `${PROVIDER} ${host}`,
        quality: 'HD',
      },
      0
    );
    if (r && r.url && typeof r.url === 'string' && !r.url.includes('[object')) {
      // passthrough non résolu (embed toujours identique) = injouable → discard
      if (r.url === embedUrl || /shell\.php|\/embed\//i.test(r.url)) return null;
      const type = /\.m3u8/i.test(r.url) ? 'hls' : 'mp4';
      return { url: r.url, type, resolved: r, host, langHint, quality: qualityHint };
    }
    return null;
  } catch (e) {
    if (isAborted(signal)) throw e;
    console.log(`[${PROVIDER}] resolve ${host} failed: ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Saison du SITE qui contient un numéro d'épisode ABSOLU.
 *
 * One Piece (fiche 1792560) numérote ses saisons en continu : JSON-LD
 * S1 = 61 eps, S2 = 82 eps (numérotés 62…143), S3 = 63 eps (144…206).
 * TMDB S2E1 = absolu 62 → il faut demander (S2, 62), pas (S2, 1) : l'API
 * répondait 404 pour toutes les saisons ≥ 2 → « épisodes qui ne correspondent
 * pas » puis 0 flux. On retrouve la saison par cumul des comptes JSON-LD.
 */
export function seasonForAbsolute(seasonsMap, absolute) {
  if (!seasonsMap || !absolute) return null;
  const nums = Object.keys(seasonsMap)
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
  let total = 0;
  for (const n of nums) {
    total += parseInt(seasonsMap[n], 10) || 0;
    if (absolute <= total) return n;
  }
  return null;
}

/**
 * Valide un couple (saison, épisode) avec UNE requête (player 0).
 * Indispensable : la numérotation du site varie selon le titre (One Piece =
 * absolue, JJK = par saison) et un couple invalide renvoie 404. Sonder 10
 * lecteurs sur un couple invalide brûlait le quota → ban 429 → 0 flux.
 */
async function isValidEpisode(idAndSlug, seasonNum, episodeNum, signal) {
  const r = await fetchStreamToken(idAndSlug, seasonNum, episodeNum, 0, { signal });
  return !!r && r.status === 'ok';
}

/**
 * Sonde TOUS les lecteurs d'un couple (saison, épisode) en parallèle.
 * Retourne les embeds décodés (/v/{token} → 302), dédupliqués par URL.
 */
async function probePlayers(idAndSlug, seasonNum, episodeNum, signal) {
  const settled = await Promise.allSettled(
    Array.from({ length: MAX_PLAYERS }, (_, pi) =>
      isRateLimited() ? null : resolveStreamSrc(idAndSlug, seasonNum, episodeNum, pi, { signal })
    )
  );
  const out = [];
  const seen = new Set();
  for (const p of settled) {
    const r = p.status === 'fulfilled' ? p.value : null;
    if (!r) continue;
    if (r.kind === 'hls' && r.url) {
      const key = r.url.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ host: 'Direct HLS', url: r.url, type: 'hls', headers: r.headers, langHint: null });
    } else if (r.kind === 'embed' && r.embedUrl) {
      const key = r.embedUrl.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ host: hostLabel(r.embedUrl), url: r.embedUrl, type: 'embed', langHint: null });
    }
  }
  return out;
}

// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null;
  if (isAborted(signal)) return [];
  const startTime = Date.now();

  // season=null (anime videoIds on TV) + absolute episode -> (S,E)
  if (mediaType !== 'movie') {
    const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, { mediaType: 'tv', startTime });
    season = se.season;
    episode = se.episode;
  }

  const titles = await getTmdbTitles(tmdbId, mediaType === 'movie' ? 'movie' : 'tv', { season });
  if (!titles || titles.length === 0) {
    console.log(`[${PROVIDER}] No TMDB titles for ${tmdbId}`);
    return [];
  }
  console.log(`[${PROVIDER}] Titles: ${titles.slice(0, 3).join(' | ')}`);

  let series = await findSeries(titles, signal);
  if (!series) {
    // Repli titre localisé FR (catalogue du site en français)
    const localized = await fetchLocalizedTitles(tmdbId, mediaType, signal);
    if (localized.length > 0) {
      console.log(`[${PROVIDER}] Repli titres FR: ${localized.join(' | ')}`);
      series = await findSeries([...localized, ...titles], signal);
    }
  }
  if (!series) {
    console.log(`[${PROVIDER}] Not found on AnimeSite: ${tmdbId}`);
    return [];
  }
  console.log(`[${PROVIDER}] Match: "${series.title}" (${series.idAndSlug})`);

  // Numérotation de référence côté site (JSON-LD) + numéro absolu
  const s = parseInt(season, 10) || 1;
  const e = parseInt(episode, 10) || 1;
  const isMovie = mediaType === 'movie';
  let meta = null;
  if (!isMovie) {
    const ficheHtml = await fetchPage(`${BASE}/${series.idAndSlug}`, { signal });
    meta = parseFicheMeta(ficheHtml);
    if (meta && Object.keys(meta.seasons).length > 0) {
      console.log(`[${PROVIDER}] Site: ${Object.keys(meta.seasons).map((n) => `S${n}=${meta.seasons[n]}`).join(' ')}`);
    }
  }

  // Certains titres (One Piece…) numérotent les saisons en continu : l'épisode
  // attendu par l'API est alors le numéro ABSOLU (TMDB S2E1 → 62).
  let absolute = null;
  if (!isMovie) {
    try {
      absolute = await getAbsoluteEpisodeFromTmdb(tmdbId, s, e);
    } catch (err) { /* optionnel */ }
  }
  const candidates = [];
  const pushCand = (cs, ce) => {
    if (!candidates.some((c) => c.season === cs && c.episode === ce)) candidates.push({ season: cs, episode: ce });
  };
  pushCand(s, e);
  if (absolute && absolute !== e) {
    const seasonByAbs = seasonForAbsolute(meta && meta.seasons, absolute);
    if (seasonByAbs) pushCand(seasonByAbs, absolute);
    pushCand(s, absolute);
  }

  // Choix du couple valide (1 requête par candidat), puis sondage des lecteurs.
  const idAndSlug = series.idAndSlug;
  let chosen = null;
  for (const cand of candidates) {
    if (isRateLimited() || isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS - RESERVE_MS)) break;
    if (await isValidEpisode(idAndSlug, cand.season, cand.episode, signal)) {
      chosen = cand;
      break;
    }
    if (isRateLimited()) break;
    console.log(`[${PROVIDER}] S${cand.season}E${cand.episode} absent côté site`);
  }
  if (!chosen) {
    console.log(`[${PROVIDER}] Aucun couple valide pour S${s}E${e} (essayés: ${candidates.map((c) => `S${c.season}E${c.episode}`).join(', ')})`);
    return [];
  }
  const siteSeason = chosen.season;
  const siteEpisode = chosen.episode;
  if (siteSeason !== s || siteEpisode !== e) {
    console.log(`[${PROVIDER}] Numérotation site: S${siteSeason}E${siteEpisode} (demandé S${s}E${e})`);
  }

  const embeds = await probePlayers(idAndSlug, siteSeason, siteEpisode, signal);
  if (embeds.length === 0) {
    console.log(`[${PROVIDER}] 0 lecteur pour S${siteSeason}E${siteEpisode}${isRateLimited() ? ' (rate-limit 429)' : ''}`);
    return [];
  }
  console.log(`[${PROVIDER}] ${embeds.length} lecteur(s): ${embeds.map((x) => x.host).join(', ')}`);

  // Résolution : sibnet d'abord (langue détectable), puis Byse (HLS propre)
  const order = { Sibnet: 0, Byse: 1, Mova: 2, Sendvid: 3 };
  embeds.sort((a, b) => (order[a.host] != null ? order[a.host] : 9) - (order[b.host] != null ? order[b.host] : 9));

  // Résolution EN PARALLÈLE (chaque lecteur a ses propres timeouts).
  const playable = embeds.filter((x) => x.url && !DEAD_EMBED_RE.test(x.url));
  const settled = await Promise.allSettled(
    playable.map((embed) => withTimeout(resolveEmbed(embed, siteEpisode, signal, series.title), 16000, 'embed'))
  );

  // Sélection : plafond PAR LANGUE (3) et non plus global à 2 flux — l'ancien
  // garde-fou « pas de nouvelle langue après 2 flux » supprimait le VF, résolu
  // après les VOSTFR (ordre Sendvid/Byse/Vidmoly puis index 6-9).
  const streams = [];
  const perLang = {};
  const seenStreamUrls = new Set();
  for (let i = 0; i < settled.length; i++) {
    const embed = playable[i];
    if (isBudgetExhausted(startTime, BUDGET_MS) || isAborted(signal)) break;
    const result = settled[i].status === 'fulfilled' ? settled[i].value : null;
    if (!result || !result.url) continue;
    const streamKey = String(result.url).split('?')[0];
    if (seenStreamUrls.has(streamKey)) continue;
    seenStreamUrls.add(streamKey);
    // Défaut VOSTFR (catalogue du site quasi exclusivement sous-titré)
    const langLabel = result.langHint || embed.langHint || 'VOSTFR';
    const langCode = normalizeLanguageCode(langLabel) || 'ja';
    if ((perLang[langLabel] || 0) >= MAX_PER_LANG) continue;
    if (streams.length >= MAX_STREAMS) break;
    perLang[langLabel] = (perLang[langLabel] || 0) + 1;
    const epNote = siteEpisode !== e ? ` [ép. site ${siteEpisode}]` : '';
    const base = {
      name: `${PROVIDER} (${langLabel})`,
      title: `${PROVIDER} [${langLabel}] S${s}E${e} - ${series.title} (${result.host || embed.host})${epNote}`,
      url: result.url,
      quality: result.quality || 'HD',
      language: langCode,
      headers: result.headers || { Referer: BASE + '/', 'User-Agent': USER_AGENT },
      type: result.type === 'hls' ? 'hls' : 'mp4',
    };
    if (result.resolved) {
      const { isDirect, originalUrl, title, name, ...clean } = result.resolved;
      // title/name du résolveur écraseraient le label langue → on garde les nôtres
      streams.push({ ...base, ...clean, title: base.title, name: base.name, provider: PROVIDER });
    } else {
      streams.push({ ...base, provider: PROVIDER });
    }
  }

  console.log(`[${PROVIDER}] Done: ${streams.length} stream(s)`);
  return streams;
}
