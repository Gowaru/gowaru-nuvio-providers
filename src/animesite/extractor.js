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
import { fetchPage, resolveStreamSrc, BASE, USER_AGENT } from './http.js';
import { resolveByse, isByseUrl } from '../jetanimes/byse.js';
import { isAborted, isBudgetExhausted, normalizeLanguageCode, safeFetch, withTimeout } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { hasForeignLeadingTokens } from '../utils/dle-extractor.js';

const PROVIDER = 'AnimeSite';
const BUDGET_MS = 42000;
const RESERVE_MS = 14000;
const MAX_STREAMS = 4;

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
  if (best && bestScore >= 70) return best;
  // 2) Fallback : scoring du catalogue complet (sitemap) sur TOUTES les
  //    variantes TMDB — la search SSR ne couvre pas les titres peu populaires.
  const catalog = await getFullCatalog(signal);
  if (catalog) {
    for (const title of (titles || []).filter(Boolean).slice(0, 8)) {
      const q = normalize(title);
      if (!q || q.length < 3) continue;
      for (const item of catalog) {
        const s = scoreCard(item, q);
        if (s > bestScore) {
          bestScore = s;
          best = item;
        }
      }
      if (bestScore >= 120) break;
    }
  }
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
    if (/byse|secured\.lol|hdsplay/i.test(embedUrl)) {
      const r = await withTimeout(
        resolveByse(embedUrl, async (u, o) => {
          const res = await safeFetch(u, { ...o, headers: { ...((o && o.headers) || {}), Referer: BASE + '/' } });
          return res ? { text: await res.text(), finalUrl: res.url } : null;
        }, signal),
        20000
      ).catch(() => null);
      // ⚠ resolveByse retourne { url, label } — ne pas passer l'objet comme URL
      if (r && r.url) return { url: r.url, type: 'hls', host, langHint };
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
      return { url: r.url, type, resolved: r, host, langHint };
    }
    return null;
  } catch (e) {
    if (isAborted(signal)) throw e;
    console.log(`[${PROVIDER}] resolve ${host} failed: ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null;
  if (isAborted(signal)) return [];
  const startTime = Date.now();

  const titles = await getTmdbTitles(tmdbId, mediaType === 'movie' ? 'movie' : 'tv', { season });
  if (!titles || titles.length === 0) {
    console.log(`[${PROVIDER}] No TMDB titles for ${tmdbId}`);
    return [];
  }
  console.log(`[${PROVIDER}] Titles: ${titles.slice(0, 3).join(' | ')}`);

  const series = await findSeries(titles, signal);
  if (!series) {
    console.log(`[${PROVIDER}] Not found on AnimeSite: ${tmdbId}`);
    return [];
  }
  console.log(`[${PROVIDER}] Match: "${series.title}" (${series.idAndSlug})`);

  // Validation d'existence côté site (JSON-LD du site = numérotation de référence)
  const s = parseInt(season, 10) || 1;
  const e = parseInt(episode, 10) || 1;
  if (mediaType !== 'movie') {
    const ficheHtml = await fetchPage(`${BASE}/${series.idAndSlug}`, { signal });
    const meta = parseFicheMeta(ficheHtml);
    if (meta && Object.keys(meta.seasons).length > 0) {
      if (meta.seasons[s] == null) {
        console.log(`[${PROVIDER}] Saison ${s} absente du site (${Object.keys(meta.seasons).join(',')}) — 0 propre`);
        return [];
      }
      if (meta.seasons[s] > 0 && e > meta.seasons[s]) {
        console.log(`[${PROVIDER}] Épisode ${e} > ${meta.seasons[s]} (S${s} du site) — 0 propre`);
        return [];
      }
      console.log(`[${PROVIDER}] S${s}E${e} ✓ (site: S${s} = ${meta.seasons[s]} eps)`);
    }
  }

  // Sondage des 5 lecteurs en parallèle (API maison, tokens signés)
  const probe = await Promise.allSettled(
    [0, 1, 2, 3, 4].map((pi) => resolveStreamSrc(series.idAndSlugTitle || series.idAndSlug, s, e, pi, { signal }))
  );
  const embeds = [];
  const seenUrls = new Set();
  for (const p of probe) {
    const r = p.status === 'fulfilled' ? p.value : null;
    if (!r) continue;
    if (r.kind === 'hls' && r.url) {
      const key = r.url.split('?')[0];
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        embeds.push({ host: 'Direct HLS', url: r.url, type: 'hls', headers: r.headers, langHint: null });
      }
    } else if (r.kind === 'embed' && r.embedUrl) {
      const host = hostLabel(r.embedUrl);
      const key = r.embedUrl.split('?')[0];
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        embeds.push({ host, url: r.embedUrl, type: 'embed', langHint: null });
      }
    }
  }
  if (embeds.length === 0) {
    console.log(`[${PROVIDER}] 0 lecteur pour S${s}E${e}`);
    return [];
  }
  console.log(`[${PROVIDER}] ${embeds.length} lecteur(s): ${embeds.map((x) => x.host).join(', ')}`);

  // Résolution : sibnet d'abord (langue détectable), puis Byse (HLS propre)
  const order = { Sibnet: 0, Byse: 1, Mova: 2, Sendvid: 3 };
  embeds.sort((a, b) => (order[a.host] != null ? order[a.host] : 9) - (order[b.host] != null ? order[b.host] : 9));

  const streams = [];
  const langsSeen = new Set();
  for (const embed of embeds) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) break;
    if (isAborted(signal)) break;
    const result = await resolveEmbed(embed, e, signal, series.title);
    if (!result || !result.url) continue;
    const langLabel = result.langHint || embed.langHint || 'VF';
    const langCode = normalizeLanguageCode(langLabel) || 'fr';
    // 1er flux d'une langue non encore vue = prioritaire ; ensuite 2 max
    if (streams.length >= 2 && !langsSeen.has(langLabel)) continue;
    if (streams.length >= MAX_STREAMS) break;
    langsSeen.add(langLabel);
    const base = {
      name: `${PROVIDER} (${langLabel})`,
      title: `${PROVIDER} [${langLabel}] S${s}E${e} - ${series.title} (${result.host || embed.host})`,
      url: result.url,
      quality: 'HD',
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
