/**
 * Extractor Fluneo (myfluneo.eu)
 *
 * Le lecteur du site n'est pas nécessaire : chaque page contient, dans son
 * payload RSC, l'objet épisode avec `embeds_json` (vidmoly / voe.sx /
 * streamtape). On lit ce payload, on résout les hébergeurs avec
 * `resolveStream`, et on n'utilise le iframe `/embed-player?v=<base64>`
 * qu'en repli.
 *
 * Trois causes historiques de « 0 flux » :
 *  1. Cloudflare challenge sur tout le domaine → traité dans http.js
 *     (circuit ouvert + cookie cf_clearance via les réglages).
 *  2. Slug deviné au hasard : le site sépare VF (`-vf`) et chaque saison est
 *     un slug distinct (`dandadan-2`, `dandadan-2-vf`). Ancien code :
 *     `slug-saison-N` → 404 systématique et mauvais épisode.
 *  3. Pages d'épisode > 1 Mo (longues séries) refusées par safeFetch →
 *     lecture partielle tolérante (les embeds sont en tête de document).
 *
 * Les VF manquantes venaient du fait qu'une seule page était lue : on lit
 * désormais la page VOSTFR **et** la page VF (liens du sélecteur de langue)
 * et on fusionne les deux.
 */

import { fetchHtmlPartial, isCfBlocked } from './http.js';
import { SITE, TIMEOUTS, LIMITS, PLAYER_ORDER } from './config.js';
import {
  resolveStream,
  withTimeout,
  isAborted,
  getScraperSettings,
  HAS_NATIVE_TIMERS,
} from '../utils/resolvers.js';
import { resolveSeasonEpisodeInputs, resolveTargetEpisodes, stripSeasonSuffix } from '../utils/dle-extractor.js';

const MAX_ATTEMPTS = LIMITS.MAX_SLUG_ATTEMPTS;

/* ─────────────────────────── Helpers texte ─────────────────────────── */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugify(s) {
  return norm(s)
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Aplatit l'échappement du payload RSC : le HTML contient `\"clé\":` (une
 * couche) et `\\\"clé\\\"` dans embeds_json (deux couches). On normalise
 * pour obtenir des clés JSON lisibles, tout en laissant une couche sur la
 * valeur de embeds_json (nécessaire à son JSON.parse).
 */
export function flattenPayload(html) {
  // Une seule couche : `"clé":` → `"clé"` (les quotes de embeds_json gardent
  // leur échappement `\\"`, indispensable au JSON.parse de la valeur).
  return String(html || '').replace(/\\"/g, '"');
}

/** Déballe une string JSON échappée (1 à 3 couches), null si impossible. */
export function unwrapJsonString(s) {
  let cur = String(s || '');
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = JSON.parse('"' + cur + '"');
      if (typeof parsed !== 'string') return null;
      if (parsed === cur) break;
      cur = parsed;
      if (cur.indexOf('{') === 0) {
        try { JSON.parse(cur); return cur; } catch (e) { /* encore échappé */ }
      }
    } catch (e) {
      break;
    }
  }
  return cur;
}

/* ─────────────────────── Parsing de la page épisode ─────────────────────── */

/** Parse une valeur embeds_json → [{ label, url }] triés par priorité. */
export function parseEmbedsJson(raw) {
  if (!raw) return [];
  let obj = null;
  const candidates = [raw];
  const unwrapped = unwrapJsonString(raw);
  if (unwrapped && unwrapped !== raw) candidates.push(unwrapped);
  for (const c of candidates) {
    try { obj = JSON.parse(c); break; } catch (e) { /* suivant */ }
  }
  if (!obj || typeof obj !== 'object') return [];
  const entries = Object.keys(obj)
    .map((label) => ({ label, url: String(obj[label] || '').trim() }))
    .filter((e) => /^https?:\/\//i.test(e.url));
  entries.sort((a, b) => playerRank(a) - playerRank(b));
  return entries;
}

function playerRank(entry) {
  const hay = (entry.label + ' ' + entry.url).toLowerCase();
  for (let i = 0; i < PLAYER_ORDER.length; i++) {
    if (hay.indexOf(PLAYER_ORDER[i]) !== -1) return i;
  }
  return 99;
}

/** Étiquette lisible d'un lecteur depuis son URL. */
export function playerLabel(url) {
  const u = String(url || '').toLowerCase();
  if (u.indexOf('vidmoly') !== -1) return 'VidMoly';
  if (u.indexOf('voe') !== -1) return 'VOE';
  if (u.indexOf('streamtape') !== -1 || u.indexOf('stape') !== -1) return 'Streamtape';
  if (u.indexOf('sibnet') !== -1) return 'Sibnet';
  if (u.indexOf('sendvid') !== -1) return 'SendVid';
  if (u.indexOf('filemoon') !== -1 || u.indexOf('moonplayer') !== -1) return 'FileMoon';
  if (u.indexOf('uqload') !== -1) return 'Uqload';
  if (u.indexOf('dood') !== -1) return 'Dood';
  if (u.indexOf('mp4upload') !== -1) return 'MP4Upload';
  if (u.indexOf('oneupload') !== -1) return 'OneUpload';
  if (u.indexOf('ansembed') !== -1) return 'Ansembed';
  const m = u.match(/^https?:\/\/([^/]+)/);
  return m ? m[1].replace(/^www\./, '') : 'Lecteur';
}

/**
 * Extrait tous les couples (saison, épisode) → embeds du payload.
 * Tolérant : fonctionne sur un payload tronqué (préfixe).
 */
export function collectEpisodeEmbeds(html) {
  const out = [];
  for (const flat of [flattenPayload(html), flattenPayload(flattenPayload(html))]) {
    scanEmbeds(flat, out);
    if (out.length) break;
  }
  return out;
}

function scanEmbeds(flat, out) {
  const re = /"embeds_json":"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(flat)) !== null) {
    const embeds = parseEmbedsJson(m[1]);
    if (!embeds.length) continue;
    const before = flat.slice(Math.max(0, m.index - 1200), m.index);
    const nums = before.match(/"season_number":([\d.]+),"episode_number":([\d.]+)/g);
    let season = null;
    let episode = null;
    if (nums && nums.length) {
      const mm = nums[nums.length - 1].match(/:([\d.]+),"episode_number":([\d.]+)/);
      if (mm) { season = parseFloat(mm[1]); episode = parseFloat(mm[2]); }
    }
    out.push({ season, episode, embeds });
  }
}

/** Repli : iframe `/embed-player?v=<base64>` → URL de l'hébergeur. */
export function collectIframeEmbeds(html) {
  const out = [];
  const re = /\/embed-player\?v=([A-Za-z0-9+/=%_-]+)/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const raw = m[1].replace(/&amp;/g, '');
    let url = '';
    try { url = atob(decodeURIComponent(raw)); } catch (e) { continue; }
    if (!/^https?:\/\//i.test(url)) continue;
    if (out.some((e) => e.url === url)) continue;
    out.push({ label: 'embed-player', url });
  }
  return out;
}

/**
 * Liens du sélecteur de langue :
 *   { vostfr: { slug, season, episode }, vf: { ... } }
 * Sur une page épisode, les liens pointent vers l'épisode équivalent de
 * l'autre langue (`/anime/<slug>/saison-S/episode-E`) — d'où la récupération
 * directe de la cible sans deviner le slug.
 */
export function parseLanguageSlugs(html) {
  const res = { vostfr: null, vf: null };
  for (const a of parseAnchors(html)) {
    const text = a.text.toUpperCase();
    if (text !== 'VF' && text !== 'VOSTFR') continue;
    const lang = text === 'VF' ? 'vf' : 'vostfr';
    if (res[lang]) continue;
    res[lang] = { slug: a.slug, season: a.season, episode: a.episode };
  }
  return res;
}

/** Liens de saisons : { 2: 'dandadan-2', 3: ... }. */
export function parseSeasonSlugs(html) {
  const res = {};
  for (const a of parseAnchors(html)) {
    const m = a.text.match(/^S\s*(\d+)$/i);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > 0 && !res[n]) res[n] = a.slug;
  }
  return res;
}

/**
 * Ancres internes /anime/... : tolère le HTML rendu ET le payload RSC
 * (quotes échappées `\"`) ainsi que les commentaires React (`<!-- -->`).
 */
function parseAnchors(html) {
  const out = [];
  const re = /<a\b[^>]*?href=\\?"\/anime\/([a-z0-9-]+)(?:\/saison-([\d.]+)\/episode-([\d.]+))?\\?"[^>]*>([\s\S]{0,120}?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const text = m[4]
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length > 12) continue;
    out.push({
      slug: m[1],
      season: m[2] ? parseFloat(m[2]) : null,
      episode: m[3] ? parseFloat(m[3]) : null,
      text,
    });
  }
  return out;
}

/** Titre de série depuis <title> : "Dandadan (VF) Streaming VF/VOSTFR S1 Ep.1". */
export function parseSeriesTitle(html, fallback) {
  const m = String(html || '').match(/<title>([^<]{2,200})<\/title>/i);
  if (!m) return fallback || '';
  let t = decodeEntities(m[1])
    .replace(/\s+(?:en\s+)?Streaming\b[\s\S]*$/i, '')
    .replace(/\s+VF\/VOSTFR\b[\s\S]*$/i, '')
    .replace(/\s*\((?:VF|VOSTFR)\)\s*$/i, '');
  t = t.trim();
  return t || fallback || '';
}

/* ─────────────────────────── Slugs candidats ─────────────────────────── */

/**
 * Génère les slugs à tester. Ordre : saison explicite d'abord (quand S > 1),
 * puis slug de base (séries « absolues » type One Piece), chaque fois en
 * VOSTFR et en VF.
 */
export function buildSlugCandidates(titles, season, isTv) {
  const list = [];
  const seenSlug = new Set();
  const push = (slug, seasonPath, langHint) => {
    if (!slug || slug.length < 2 || seenSlug.has(slug)) return;
    seenSlug.add(slug);
    list.push({ slug, seasonPath, langHint });
  };

  const bases = [];
  const seenBase = new Set();
  const addBase = (b) => {
    if (b && b.length > 1 && !seenBase.has(b)) { seenBase.add(b); bases.push(b); }
  };
  for (const title of (Array.isArray(titles) ? titles : []).slice(0, 8)) {
    // « JUJUTSU KAISEN Season 1 » et « … Saison 1 » ne sont pas des slugs :
    // le site garde la saison dans un slug séparé (`-2`, `-3`).
    const base = slugify(stripSeasonSuffix(title));
    addBase(base);
    // Variante sans tirets : « Dan Da Dan » → dan-da-dan, mais le site
    // écrit `dandadan` (et TMDB fournit `DanDaDan` → dandadan).
    if (base.indexOf('-') !== -1) addBase(base.replace(/-/g, ''));
  }

  // Le site écrit le plus souvent le titre « collé » (dandadan) alors que
  // TMDB fournit « Dan Da Dan » : on teste d'abord les slugs les plus courts
  // (moins de tirets), ce qui évite 2 requêtes 404 par appel.
  bases.sort((a, b) => (a.split('-').length - b.split('-').length));

  for (const base of bases) {
    if (isTv && season > 1) {
      push(base + '-' + season, season, 'vostfr');
      push(base + '-' + season + '-vf', season, 'vf');
    }
    push(base, 1, 'vostfr');
    push(base + '-vf', 1, 'vf');
  }
  return list;
}

function episodeUrl(slug, seasonPath, episodeNum) {
  return SITE.BASE_URL + '/anime/' + slug + '/saison-' + seasonPath + '/episode-' + episodeNum;
}

function animeUrl(slug) {
  return SITE.BASE_URL + '/anime/' + slug;
}

/** Embeds d'une page (payload RSC, puis iframe en repli). */
function collectEntries(html) {
  const entries = collectEpisodeEmbeds(html);
  if (entries.length) return entries;
  const iframes = collectIframeEmbeds(html);
  return iframes.length ? [{ season: null, episode: null, embeds: iframes }] : [];
}

/* ─────────────────────────── Sélection épisode ─────────────────────────── */

function pickEpisode(list, seasonPath, episodeNum) {
  if (!list.length) return null;
  const byNum = list.filter((e) => e.episode === episodeNum);
  if (!byNum.length) return null;
  const bySeason = byNum.filter((e) => e.season === seasonPath || e.season === null);
  return (bySeason.length ? bySeason : byNum)[0];
}

/* ─────────────────────────── Point d'entrée ─────────────────────────── */

function settingsLanguage() {
  const s = getScraperSettings() || {};
  const v = String(s.language || 'all').toLowerCase();
  return (v === 'vf' || v === 'vostfr') ? v : 'all';
}

export async function extractStreams(tmdbId, mediaType, season, episode, { signal } = {}) {
  const start = Date.now();
  const isTv = mediaType === 'tv' || mediaType === 'series';
  const deadline = start + TIMEOUTS.BUDGET;

  const inputs = await resolveSeasonEpisodeInputs(season, episode, tmdbId, {
    mediaType: isTv ? 'tv' : 'movie',
    startTime: start,
    budgetMs: TIMEOUTS.BUDGET,
  });
  const S = isTv ? inputs.season : 1;
  const E = inputs.episode || 1;

  console.log('[Fluneo] Extraction ' + mediaType + ' ' + tmdbId + (isTv ? ' S' + S + 'E' + E : ''));

  // Titres TMDB (variantes saison incluses)
  let titles = [];
  try {
    const mod = await import('../utils/metadata.js');
    titles = await mod.getTmdbTitles(tmdbId, mediaType, { season: S });
  } catch (e) {
    if (isAborted(signal)) return [];
    console.warn('[Fluneo] Titres TMDB indisponibles: ' + (e && e.message));
  }
  if (!titles || !titles.length) {
    console.warn('[Fluneo] Aucun titre TMDB pour ' + tmdbId);
    return [];
  }

  // Numéros d'épisode à tenter : local puis absolu (longues séries).
  const epNumbers = [E];
  try {
    const targets = await resolveTargetEpisodes(tmdbId, mediaType, isTv ? S : null, E, {
      startTime: start,
      budgetMs: TIMEOUTS.BUDGET,
    });
    for (const n of targets) if (n && epNumbers.indexOf(n) === -1) epNumbers.push(n);
  } catch (e) { /* optionnel */ }

  const wantLang = settingsLanguage();
  const desiredLangs = (!isTv || wantLang === 'all') ? ['vostfr', 'vf'] : [wantLang];
  const candidates = buildSlugCandidates(titles, S, isTv).slice(0, MAX_ATTEMPTS);
  console.log('[Fluneo] Slugs candidats: ' + candidates.map((c) => c.slug).join(', '));

  const budgetLeft = () => Date.now() < deadline;
  const tried = new Set();

  // Une seule requête par langue : la page anime contient TOUS les épisodes,
  // les slugs des autres saisons et le lien VOSTFR/VF. On ne descend sur une
  // page épisode que si l'entrée manque (page tronquée à 1 Mo).
  async function loadAnime(slug, seasonPath, langHint) {
    if (tried.has(slug) || !budgetLeft()) return null;
    tried.add(slug);
    try {
      const html = await fetchHtmlPartial(animeUrl(slug), { signal, timeout: TIMEOUTS.PAGE });
      return {
        slug,
        seasonPath,
        langHint,
        entries: collectEntries(html),
        langs: parseLanguageSlugs(html),
        seasons: parseSeasonSlugs(html),
        title: parseSeriesTitle(html, slug),
      };
    } catch (e) {
      if (e && e.isChallenge) throw e;
      console.warn('[Fluneo] ' + slug + ': ' + (e && e.message));
      return null;
    }
  }

  const hasWantedSeason = (page) => !isTv || !page.entries.length ||
    page.entries.some((e) => e.season === S);

  const pages = new Map(); // lang -> page
  const queue = candidates.slice();

  while (queue.length && pages.size < desiredLangs.length && budgetLeft()) {
    const cand = queue.shift();
    if (pages.has(cand.langHint)) continue;
    let page = null;
    try {
      page = await loadAnime(cand.slug, cand.seasonPath, cand.langHint);
    } catch (e) {
      if (isCfBlocked()) break;
    }
    if (!page) continue;

    // Page d'une autre saison : ses ancres donnent le slug exact de la saison
    // demandée (`S 2` → /anime/dandadan-2), sans deviner de suffixe.
    if (!hasWantedSeason(page)) {
      const alt = page.seasons && page.seasons[S];
      if (alt) {
        try {
          const altPage = await loadAnime(alt, S, cand.langHint);
          if (altPage && hasWantedSeason(altPage)) page = altPage;
        } catch (e) { if (isCfBlocked()) break; }
      }
    }
    if (hasWantedSeason(page)) pages.set(page.langHint, page);
  }

  // Langue manquante : le sélecteur VOSTFR/VF donne le slug exact.
  for (const lang of desiredLangs) {
    if (pages.has(lang) || !budgetLeft()) continue;
    for (const src of Array.from(pages.values())) {
      const info = src.langs && src.langs[lang];
      if (!info || !info.slug) continue;
      try {
        const alt = await loadAnime(info.slug, info.season || src.seasonPath || S, lang);
        if (alt) { pages.set(lang, alt); break; }
      } catch (e) { if (isCfBlocked()) break; }
    }
  }

  // Sélection de l'épisode : déjà dans la page anime, sinon requête ciblée.
  const resolvedPages = [];
  for (const [lang, page] of pages) {
    let hit = null;
    if (!isTv) {
      hit = page.entries.filter((e) => e.embeds && e.embeds.length)[0] || null;
    } else {
      for (const n of epNumbers) {
        hit = pickEpisode(page.entries, S, n);
        if (hit) break;
      }
      if (!hit) {
        for (const n of epNumbers) {
          if (!budgetLeft()) break;
          try {
            const html = await fetchHtmlPartial(episodeUrl(page.slug, S, n), { signal, timeout: TIMEOUTS.PAGE });
            const picked = pickEpisode(collectEntries(html), S, n);
            if (picked) {
              hit = picked;
              page.title = page.title || parseSeriesTitle(html, page.slug);
              break;
            }
          } catch (e) { if (isCfBlocked()) break; }
        }
      }
    }
    if (hit) {
      resolvedPages.push({
        lang,
        page,
        embeds: hit.embeds,
        episode: hit.episode != null ? hit.episode : E,
      });
    }
  }

  if (!resolvedPages.length) {
    console.warn('[Fluneo] Aucune page exploitable (' +
      (isCfBlocked() ? 'Cloudflare challenge' : 'slugs/épisodes non trouvés') + ')');
    return [];
  }

  const seriesTitle = resolvedPages[0].page.title || '';
  const jobs = [];
  const seenPlayers = new Set();
  for (const rp of resolvedPages) {
    for (const emb of rp.embeds) {
      const label = playerLabel(emb.url);
      const key = rp.lang + '|' + label + '|' + emb.url;
      if (seenPlayers.has(key)) continue;
      seenPlayers.add(key);
      jobs.push({ lang: rp.lang, page: rp.page, episode: rp.episode, emb, label });
    }
  }
  console.log('[Fluneo] ' + jobs.length + ' lecteur(s) à résoudre (' +
    Array.from(pages.keys()).join('+') + ', ' + tried.size + ' page(s))');

  const langLabel = (lang) => (lang === 'vf' ? 'VF' : 'VOSTFR');

  // Plafond bas : 2 lecteurs par langue (vidmoly puis VOE), donc 4 résolutions
  // au plus au lieu de 6-8. Les autres (streamtape) ne servent qu'en repli
  // pour une langue qui ressort bredouille.
  const byLangJobs = new Map();
  for (const job of jobs) {
    const arr = byLangJobs.get(job.lang) || [];
    arr.push(job);
    byLangJobs.set(job.lang, arr);
  }
  // NuvioTV n'a pas de timers : withTimeout() y est inopérant et le fetch est
  // bloquant (30 s OkHttp par requête). On n'y lance donc qu'UN lecteur par
  // langue (2 résolutions max, 60 s au pire) au lieu de 2, et on surveille le
  // budget entre chaque lancement.
  const perLang = HAS_NATIVE_TIMERS ? 2 : 1;
  const maxResolve = HAS_NATIVE_TIMERS ? LIMITS.MAX_RESOLVE : LIMITS.MAX_RESOLVE_TV;
  const batch = [];
  const spare = [];
  for (const arr of byLangJobs.values()) {
    batch.push(...arr.slice(0, perLang));
    spare.push(...arr.slice(perLang));
  }
  const pending = batch.slice(0, maxResolve);

  const seenStreamUrl = new Set();
  const streams = [];

  const runJob = async (job) => {
    if (signal && isAborted(signal)) return null;
    const resolved = await withTimeout(
      resolveStream({ url: job.emb.url, provider: 'fluneo', headers: { Referer: SITE.BASE_URL + '/' } }),
      TIMEOUTS.STREAM
    );
    if (!resolved || !resolved.url || resolved.isDirect === false) {
      console.log('[Fluneo] Non direct: ' + job.label + ' (' + job.emb.url.slice(0, 70) + ')');
      return null;
    }
    const tag = langLabel(job.lang);
    const ep = job.episode || E;
    const seLabel = isTv ? ' S' + S + 'E' + ep : ' Film';
    return {
      lang: job.lang,
      url: resolved.url,
      headers: resolved.headers || { Referer: SITE.BASE_URL + '/' },
      provider: 'fluneo',
      name: 'Fluneo ' + job.label + ' (' + tag + ')',
      title: '[' + tag + '] ' + job.label + seLabel +
        (seriesTitle ? ' · ' + seriesTitle : ''),
      language: tag,
      type: resolved.type,
      quality: resolved.quality || 'HD',
    };
  };

  const have = new Set();
  // Sortie anticipée : l'app n'affiche les flux qu'à la résolution de
  // getStreams(), donc le seul levier est de rendre la main tôt. Dès qu'UN
  // flux existe pour chaque langue demandée, on coupe les résolutions
  // restantes (les 2e lecteurs par langue) au lieu d'attendre les plus lents.
  const expectedLangs = Array.from(new Set(pending.map((job) => job.lang)));
  const allLangsServed = () => expectedLangs.length > 0 &&
    expectedLangs.every((lang) => have.has(lang));
  let releaseEarly;
  const earlyExit = new Promise((resolve) => { releaseEarly = resolve; });
  // Après une sortie anticipée, les résolutions encore en vol ne doivent plus
  // toucher au tableau déjà retourné à l'app.
  let finished = false;
  let cutShort = false;

  const pushStream = (stream) => {
    if (!stream || finished) return;
    // Une même vidéo peut servir les deux langues : la clé inclut la langue.
    const key = stream.lang + '|' + stream.url;
    if (seenStreamUrl.has(key)) return;
    seenStreamUrl.add(key);
    streams.push(stream);
    have.add(stream.lang);
    if (allLangsServed()) releaseEarly();
  };

  const resolveStart = Date.now();
  // TV : chaque job bloque jusqu'à 30 s (OkHttp) → séquentiel + coupe au
  // budget, pour sortir avec un partiel plutôt que de laisser l'app jeter le
  // résultat. Le budget est vérifié AVANT chaque job : le pire cas est donc
  // « budget + 1 job » (~45 s) et non « n jobs × 30 s ».
  const runSequential = async (list) => {
    for (const job of list) {
      if (allLangsServed()) {
        cutShort = true;
        return;
      }
      if (Date.now() - resolveStart > TIMEOUTS.RESOLVE_BUDGET) {
        console.log('[Fluneo] Budget résolution épuisé, sortie avec le partiel');
        return;
      }
      pushStream(await runJob(job));
    }
  };

  if (HAS_NATIVE_TIMERS) {
    // Mobile/Node : résolutions en parallèle ; on rend la main dès qu'un flux
    // par langue est là, sans attendre les lecteurs les plus lents.
    const settled = Promise.allSettled(
      pending.map((job) => runJob(job).then(pushStream, () => null))
    );
    const winner = await Promise.race([
      settled.then(() => 'settled'),
      earlyExit.then(() => 'early'),
    ]);
    if (winner === 'early') {
      finished = true;
      cutShort = true;
    }
  } else {
    await runSequential(pending);
  }

  if (cutShort) {
    console.log('[Fluneo] Sortie anticipée (1 flux/langue) en ' + (Date.now() - resolveStart) + 'ms');
  }

  // Langues bredouilles : on tente leurs lecteurs de secours.
  const retry = spare.filter((job) => !have.has(job.lang));
  if (retry.length && Date.now() < deadline) {
    console.log('[Fluneo] Repli lecteurs: ' + retry.map((j) => j.label).join(', '));
    if (HAS_NATIVE_TIMERS) {
      await Promise.allSettled(retry.map((job) => runJob(job).then(pushStream)));
    } else {
      await runSequential(retry);
    }
  }

  console.log('[Fluneo] ' + streams.length + ' flux résolus en ' + (Date.now() - start) + 'ms');
  return streams;
}
