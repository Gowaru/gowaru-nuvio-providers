import { fetchJson, fetchText, setCurrentSignal } from './http.js';
import {
  resolveStream, withTimeout, safeFetch, USER_AGENT, isAborted,
  isBudgetExhausted, getScraperSettings, sanitizeSearchQuery,
} from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { scoreMatch, getUrlOrigin } from '../utils/dle-extractor.js';
import {
  API, SITE, TIMEOUTS, MAX_STREAMS, TARGET_STREAMS, BUDGET_MS,
  PROVIDER_NAME, SLOW_HOSTS, SCORES,
} from './config.js';

// ─── Settings ─────────────────────────────────────────────────────────────

function getPrefs() {
  let s = {};
  try { s = getScraperSettings() || {}; } catch (e) { s = {}; }
  let excludeHosts = [];
  if (typeof s.excludeHosts === 'string' && s.excludeHosts.trim()) {
    excludeHosts = s.excludeHosts.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  }
  return {
    language: (s.language === 'vf' || s.language === 'vostfr') ? s.language : 'all',
    excludeHosts,
  };
}

function filterByLanguagePref(streams, pref) {
  if (!pref || pref === 'all' || !Array.isArray(streams) || streams.length === 0) return streams;
  const isVOSTFR = (x) => `${x.language || ''} ${x.title || ''}`.toUpperCase().includes('VOSTFR');
  const wanted = pref === 'vf' ? ((x) => !isVOSTFR(x)) : isVOSTFR;
  const filtered = streams.filter(wanted);
  return filtered.length > 0 ? filtered : streams;
}

// ─── Langue / qualité ─────────────────────────────────────────────────────
// On propage TOUJOURS le brut VF/VOSTFR et on laisse expandStreamQualities +
// normalizeLanguageCode normaliser vers fr. Le tag reste visible dans title.

function detectLangRaw(apiLang, url, defaultLang, extraHaystack) {
  const raw = String(apiLang || '').toUpperCase();
  if (raw.includes('VOSTFR') || raw.includes('VOST')) return 'VOSTFR';
  if (raw === 'VF' || raw === 'VFF' || raw === 'VFQ' || raw === 'FR') return 'VF';
  const u = String(url || '');
  const extra = String(extraHaystack || '');
  const hay = extra ? `${u} ${extra}` : u;
  if (/\/VOSTFR\//i.test(hay) || /vostfr/i.test(hay)) return 'VOSTFR';
  if (/\/VF\//.test(hay) || /-vf\b/i.test(hay)) return 'VF';
  if (raw) return raw;
  return defaultLang || 'VF';
}

// Défaut de langue quand AUCUN signal explicite (ni language API, ni
// marqueur /VF/, -vf, vostfr dans l'URL/slug) : on se base sur la langue
// originale TMDB. Une émission ko/ja/en sans piste VF signalée est
// presque sûrement VOSTFR — l'ancien défaut aveugle 'VF' est conservé
// uniquement pour les contenus fr ou quand la metadata est indisponible.
function defaultLangForOriginal(origLang) {
  const o = String(origLang || '').trim().toLowerCase();
  if (!o) return 'VF';
  return o === 'fr' ? 'VF' : 'VOSTFR';
}

function hasExplicitLangSignal(apiLang, url, extraHaystack) {
  if (String(apiLang || '').trim()) return true;
  const hay = `${String(url || '')} ${String(extraHaystack || '')}`;
  return /\/VOSTFR\//i.test(hay) || /vostfr/i.test(hay) || /\/VF\//.test(hay) || /-vf\b/i.test(hay);
}

// Best-effort, jamais bloquant : réutilise les titres déjà en main (leur
// _metadata contient originalLanguage, coût nul), sinon 1 appel TMDB capé
// à 2 s (withTimeout actif sous Node ; sur QuickJS le deadline interne
// metadata + les timeouts natifs bornent). Échec/timeout → '' → défaut VF.
async function fetchOriginalLanguage(tmdbId, mediaType, cachedTitles, startTime) {
  try {
    const meta = cachedTitles && cachedTitles._metadata;
    if (meta && meta.originalLanguage) return String(meta.originalLanguage).trim().toLowerCase();
  } catch (e) {}
  try {
    if (startTime && (Date.now() - startTime) > (BUDGET_MS - 8000)) return '';
    const t = await withTimeout(getTmdbTitles(tmdbId, mediaType), 2000, 'webflix-origlang');
    const m = t && t._metadata;
    if (m && m.originalLanguage) return String(m.originalLanguage).trim().toLowerCase();
  } catch (e) {}
  return '';
}

function qualityFromApi(apiQuality, size) {
  const q = String(apiQuality || '').trim();
  if (q && !/^unknown$/i.test(q)) return q.toUpperCase();
  // Size-based : les MP4 FastFlux > 3 GB sont du 1080p typique, sinon HD→720p via expand
  const m = String(size || '').match(/([\d.,]+)\s*(TB|GB|MB|KB)/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    const unit = m[2].toUpperCase();
    const gb = unit === 'TB' ? v * 1024 : unit === 'GB' ? v : unit === 'MB' ? v / 1024 : v / 1048576;
    if (gb >= 3) return '1080p';
  }
  return 'HD';
}

function streamHeaders(url) {
  const origin = getUrlOrigin(url, SITE.BASE_URL);
  return { Referer: `${SITE.BASE_URL}/`, Origin: SITE.BASE_URL, 'User-Agent': USER_AGENT, _cdnOrigin: origin };
}

function makeDirect(url, langRaw, size, apiQuality, label, defaultLang, extraHaystack) {
  const lang = detectLangRaw(langRaw, url, defaultLang, extraHaystack);
  const headers = streamHeaders(url);
  delete headers._cdnOrigin;
  return {
    name: PROVIDER_NAME,
    title: `[${lang}] Webflix FastFlux ${label}`,
    url,
    quality: qualityFromApi(apiQuality, size),
    language: lang,
    ...(size ? { size: String(size) } : {}),
    type: 'mp4',
    isDirect: true,
    headers,
  };
}

function makeEmbed(url, langRaw, source, defaultLang, extraHaystack) {
  const lang = detectLangRaw(langRaw, url, defaultLang, extraHaystack);
  const headers = streamHeaders(url);
  delete headers._cdnOrigin;
  return {
    name: PROVIDER_NAME,
    title: `[${lang}] Webflix ${source}`,
    url,
    quality: 'HD',
    language: lang,
    headers,
  };
}

// ─── Hosts : dead / lents / dépriorisés ───────────────────────────────────

function isDeadHost(url) {
  const u = String(url || '').toLowerCase();
  // Hard-exclus : kakaflix + dood + streamtape (timeouts vérifiés).
  // vidzy figure dans DEAD_HOSTS pour traçabilité mais reste tenté en
  // dernier recours (player1 des fiches, spec §Film : "dépriorisé").
  if (u.includes('vidzy')) return false;
  return u.includes('kakaflix') || u.includes('dood') || u.includes('streamtape');
}

function isSlowHost(url) {
  const u = String(url || '').toLowerCase();
  return SLOW_HOSTS.some((h) => u.includes(h)) || u.includes('vidzy');
}

function isExcludedByUser(url, excludeHosts) {
  if (!excludeHosts || excludeHosts.length === 0) return false;
  const u = String(url || '').toLowerCase();
  return excludeHosts.some((h) => h && u.includes(h));
}

function embedPriority(a, b) {
  const tier = (x) => {
    const u = String(x.url || '').toLowerCase();
    if (u.includes('vidzy')) return 2;
    if (SLOW_HOSTS.some((h) => u.includes(h))) return 1;
    return 0;
  };
  const dt = tier(a) - tier(b);
  if (dt !== 0) return dt;
  const la = String(a.language || '').toUpperCase();
  const lb = String(b.language || '').toUpperCase();
  const rank = (l) => (l === 'VOSTFR' ? 1 : 0);
  return rank(la) - rank(lb);
}

function isPlayableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase();
  return /\.(mp4|m3u8|mkv|webm|mpd)(\?.*)?$/.test(u) || u.includes('/hls2/') || u.includes('/hls/');
}

// ─── API : fastflux / discovery ───────────────────────────────────────────

export async function fetchFastfluxMovie(tmdbId) {
  const data = await fetchJson(API.FASTFLUX_MOVIE(tmdbId), { timeout: TIMEOUTS.FASTFLUX });
  if (!data || data.success !== true || data.available !== true) return null;
  const d = data.data;
  if (!d || !d.url || typeof d.url !== 'string') return null;
  return d;
}

export async function fetchFastfluxEpisode(tmdbId, season, episode) {
  const data = await fetchJson(API.FASTFLUX_EPISODE(tmdbId, season, episode), { timeout: TIMEOUTS.FASTFLUX });
  if (!data || data.success !== true || data.available !== true) return null;
  const d = data.data;
  if (!d || !d.url || typeof d.url !== 'string') return null;
  return d;
}

export async function fetchDiscovery(tmdbId) {
  const data = await fetchJson(API.DISCOVERY(tmdbId), { timeout: TIMEOUTS.DISCOVERY });
  if (!data || data.success !== true || !data.fastflux || typeof data.fastflux !== 'object') return null;
  return data.fastflux;
}

// ─── API : search + fiches ────────────────────────────────────────────────

const SEARCH_NOISE = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'en', 'au', 'aux',
  'film', 'serie', 'saison', 'season', 'episode', 'streaming', 'complet', 'vf', 'vostfr',
  'the', 'of', 'a', 'an', 'and',
]);

export async function searchSlugs(query) {
  const data = await fetchJson(API.SEARCH(query), { timeout: TIMEOUTS.SEARCH });
  const list = data && Array.isArray(data.data) ? data.data : null;
  if (!list) return [];
  return list
    .filter((r) => r && r.s)
    .map((r) => ({
      slug: String(r.s),
      name: String(r.n || ''),
      type: r.t === 'series' ? 'tv' : String(r.t || ''),
      src: r.src || null,
    }));
}

export async function fetchMovieBySlug(slug) {
  const data = await fetchJson(API.MOVIE_BY_SLUG(slug), { timeout: TIMEOUTS.FICHE });
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!data.player1 && !data.player2 && !data.player3 && !data.player4 && !data.player5 && !data.player6) return null;
  return data;
}

export async function fetchSeriesBySlug(slug) {
  const data = await fetchJson(API.SERIES_BY_SLUG(slug), { timeout: TIMEOUTS.FICHE });
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!Array.isArray(data.seasons)) return null;
  return data;
}

// Mots inexpliqués ≥ 4 lettres dans le résultat → homonyme → rejet.
// Seuil ≥ 2 mots : un seul mot extra reste couvert par la pénalité scoreMatch
// (ex: "Spider-Man" → "Spider-Man No Way Home" légitime).
function hasUnexplainedWords(resultName, queryTitle) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç\s]/gi, ' ').split(/\s+/).filter(Boolean);
  const qWords = new Set(norm(queryTitle));
  const extra = norm(resultName).filter(
    (w) => w.length >= 4 && !/^\d+$/.test(w) && !SEARCH_NOISE.has(w) && !qWords.has(w),
  );
  return extra.length >= 2;
}

function pickSlugs(candidates, titles, wantedType) {
  const ranked = [];
  for (const c of candidates) {
    if (!c.slug || (c.type && c.type !== wantedType)) continue;
    let best = 0;
    for (const t of titles) {
      const s = scoreMatch(c.name, t, SCORES);
      if (s > best) best = s;
    }
    if (best < SCORES.MIN_MATCH) continue;
    if (titles.some((t) => hasUnexplainedWords(c.name, t)) && best < SCORES.EXACT_MATCH) continue;
    ranked.push({ ...c, score: best });
  }
  ranked.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return ranked.filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)));
}

// ─── Embeds TMDB-only (sans slug, 100% couverture) ────────────────────────

function buildTmdbEmbeds(tmdbId, mediaType, season, episode) {
  const s = Number(season) || 1;
  const e = Number(episode) || 1;
  const out = [];
  if (mediaType === 'movie') {
    out.push(makeEmbed(`https://frembed.best/api/film.php?id=${encodeURIComponent(tmdbId)}`, 'VF', 'Frembed'));
    out.push(makeEmbed(`https://frembed.cyou/api/film.php?id=${encodeURIComponent(tmdbId)}`, 'VF', 'Frembed'));
    out.push(makeEmbed(`https://fluxora.sbs/embed/zenix?tmdb=${encodeURIComponent(tmdbId)}&type=movie&season=&episode=&lang=vf`, 'VF', 'Zenix'));
    out.push(makeEmbed(`https://fluxora.sbs/embed/zenix?tmdb=${encodeURIComponent(tmdbId)}&type=movie&season=&episode=&lang=vostfr`, 'VOSTFR', 'Zenix'));
    out.push(makeEmbed(`https://heiwastream.fr/embed/movie/${encodeURIComponent(tmdbId)}`, 'VF', 'Heiwastream'));
    out.push(makeEmbed(`https://wwembed.wavewatch.cc/api/v1/streaming/ww-movie-${encodeURIComponent(tmdbId)}`, 'VF', 'WWEmbed'));  } else {
    out.push(makeEmbed(`https://frembed.best/api/serie.php?id=${encodeURIComponent(tmdbId)}&sa=${s}&ep=${e}`, 'VF', 'Frembed'));
    out.push(makeEmbed(`https://fluxora.sbs/embed/zenix?tmdb=${encodeURIComponent(tmdbId)}&type=tv&season=${s}&episode=${e}&lang=vf`, 'VF', 'Zenix'));
    out.push(makeEmbed(`https://fluxora.sbs/embed/zenix?tmdb=${encodeURIComponent(tmdbId)}&type=tv&season=${s}&episode=${e}&lang=vostfr`, 'VOSTFR', 'Zenix'));
    out.push(makeEmbed(`https://heiwastream.fr/embed/tv/${encodeURIComponent(tmdbId)}/s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`, 'VF', 'Heiwastream'));
    out.push(makeEmbed(`https://wwembed.wavewatch.cc/api/v1/streaming/ww-tv-${encodeURIComponent(tmdbId)}-s${s}-e${e}`, 'VF', 'WWEmbed'));
  }
  return out;
}

const FLUXORA_ORIGIN = 'https://fluxora.sbs';

// ─── Résolveur Zenix custom (fluxora.sbs) ─────────────────────────────────
// La page /embed/zenix?tmdb=… expose `const SID = "…"`, puis :
//   POST /api/embed-player/play {sid, lang, source?} → {ok, mode, stream_url, lang}
//   GET stream_url (page /embed/anime/… ou /embed-stream/…) → `urls=["…"]` en clair
// Le resolveStream générique échoue ici (iframe à src vide + JS) → flow dédié.
// Vérifié en live : play sans source choisit le meilleur (anime VF One Piece
// → sibnet, résolu par resolveSibnet), source "s3" → heiwa (embed tv dédié).

function extractZenixSid(html) {
  const m = String(html || '').match(/const SID\s*=\s*"([^"]{4,80})"/);
  return m ? m[1] : null;
}

async function zenixPlay(sid, lang, source, referer, signal) {
  if (isAborted(signal)) return null;
  try {
    const res = await safeFetch(`${FLUXORA_ORIGIN}/api/embed-player/play`, {
      method: 'POST',
      timeout: 10000,
      headers: {
        Referer: referer,
        Origin: FLUXORA_ORIGIN,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ sid, lang, embed_mobile: 0, ...(source ? { source } : {}) }),
      signal,
    });
    if (!res || !res.ok) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!data || data.ok !== true || !data.stream_url) return null;
    return data;
  } catch (e) {
    return null;
  }
}

async function zenixSources(sid, lang, referer, signal) {
  try {
    const res = await safeFetch(
      `${FLUXORA_ORIGIN}/api/embed-player/sources?sid=${encodeURIComponent(sid)}&lang=${encodeURIComponent(lang)}`,
      {
        timeout: 10000,
        headers: { Referer: referer, Origin: FLUXORA_ORIGIN, Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal,
      },
    );
    if (!res || !res.ok) return [];
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    const choices = (data && Array.isArray(data.sources)) ? data.sources : (data && Array.isArray(data.choices)) ? data.choices : [];
    // ids sélectionnables et non-absents (ex: anime disponible, s3 à tester, s2 absent)
    return choices
      .filter((c) => c && c.id && c.selectable !== false && c.available !== false && c.status !== 'absent')
      .map((c) => String(c.id));
  } catch (e) {
    return [];
  }
}

function extractEmbedStreamUrls(html, baseUrl) {
  const out = [];
  const push = (u) => {
    if (!u || typeof u !== 'string') return;
    const clean = u.replace(/\\\//g, '/');
    if (/^https?:\/\//i.test(clean) && !out.includes(clean)) out.push(clean);
  };
  // 1. Tableaux JS urls=["…"] (page /embed/anime/… → sibnet & co)
  try {
    const arrRe = /urls\s*=\s*\[([^\]]{0,4000})\]/g;
    let m;
    while ((m = arrRe.exec(String(html || ''))) !== null) {
      const qRe = /"((?:[^"\\]|\\.)*)"/g;
      let q;
      while ((q = qRe.exec(m[1])) !== null) push(q[1]);
    }
  } catch (e) {}
  // 2. iframes à src non-vide
  try {
    const ifrRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let m;
    while ((m = ifrRe.exec(String(html || ''))) !== null) {
      const src = m[1];
      if (src && !/^about:blank/i.test(src) && !src.startsWith('javascript:') && !src.startsWith('data:')) {
        try { push(new URL(src, baseUrl).toString()); } catch (e) { push(src); }
      }
    }
  } catch (e) {}
  // 3. Dernier recours : URLs .m3u8/.mp4 en clair
  try {
    const loose = String(html || '').match(/https?:\/\/[^"'\\\s]+\.(?:m3u8|mp4)[^"'\\\s]*/gi) || [];
    for (const u of loose) push(u);
  } catch (e) {}
  return out;
}

function zenixLangTag(playLang, requested) {
  const l = String(playLang || requested || '').toLowerCase();
  if (l.includes('vostfr')) return 'VOSTFR';
  if (l === 'vf' || l === 'fr') return 'VF';
  if (l === 'vo') return 'VO';
  return (playLang || 'VF').toUpperCase();
}

async function resolveZenix(zenixUrl, prefs, signal, startTime, seenUrls) {
  const found = [];
  const html = await fetchText(zenixUrl, {
    timeout: 10000,
    signal,
    headers: { Referer: `${SITE.BASE_URL}/`, Origin: SITE.BASE_URL },
  });
  if (!html) return found;
  const sid = extractZenixSid(html);
  if (!sid) {
    console.log('[Webflix] Zenix: pas de SID');
    return found;
  }
  const langs = prefs.language === 'vostfr' ? ['vostfr', 'vf'] : ['vf', 'vostfr'];
  for (const lang of langs) {
    if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
    if (found.length >= TARGET_STREAMS) break;
    const selectable = await zenixSources(sid, lang, zenixUrl, signal);
    const attempts = [undefined];
    for (const id of selectable.slice(0, 2)) {
      if (!attempts.includes(id)) attempts.push(id);
    }
    for (const source of attempts) {
      if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
      if (found.length >= TARGET_STREAMS) break;
      const play = await zenixPlay(sid, lang, source, zenixUrl, signal);
      if (!play || !play.stream_url || seenUrls.has(play.stream_url)) continue;
      seenUrls.add(play.stream_url);
      const tag = zenixLangTag(play.lang, lang);
      // stream_url parfois directement jouable
      if (isPlayableUrl(play.stream_url)) {
        found.push(makeDirect(play.stream_url, tag, undefined, play.quality, 'Zenix'));
        continue;
      }
      const pageHtml = await fetchText(play.stream_url, {
        timeout: 10000,
        signal,
        headers: { Referer: `${FLUXORA_ORIGIN}/`, Origin: FLUXORA_ORIGIN },
      });
      if (!pageHtml) continue;
      const urls = extractEmbedStreamUrls(pageHtml, play.stream_url);
      for (const u of urls) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        if (found.length >= TARGET_STREAMS) break;
        if (seenUrls.has(u)) continue;
        seenUrls.add(u);
        const cand = makeEmbed(u, tag, 'Zenix');
        let r = null;
        try {
          r = await withTimeout(resolveStream({ ...cand }), TIMEOUTS.RESOLVE, 'webflix-zenix');
        } catch (e) { r = null; }
        if (r && r.url && r.isDirect === true && isPlayableUrl(r.url)) {
          const origin = getUrlOrigin(r.url, FLUXORA_ORIGIN);
          found.push({
            name: r.name || cand.name,
            title: r.title || cand.title,
            url: r.url,
            quality: r.quality || 'HD',
            language: r.language || tag,
            ...(r.size ? { size: r.size } : {}),
            ...(r.type ? { type: r.type } : {}),
            isDirect: true,
            headers: {
              ...(r.headers || {}),
              Referer: (r.headers && r.headers.Referer) || `${origin}/`,
              Origin: (r.headers && r.headers.Origin) || origin,
              'User-Agent': USER_AGENT,
            },
          });
        }
      }
    }
  }
  if (found.length > 0) console.log(`[Webflix] Zenix: ${found.length} direct(s) via ${zenixUrl.slice(0, 70)}`);
  return found;
}

// ─── Résolution séquentielle early-exit ────────────────────────────────────

async function resolveEmbeds(candidates, prefs, signal, startTime) {
  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    if (!c || typeof c.url !== 'string' || !c.url.startsWith('http')) continue;
    if (c.url.includes('[object')) continue;
    if (isDeadHost(c.url)) continue;
    if (isExcludedByUser(c.url, prefs.excludeHosts)) continue;
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    uniq.push(c);
  }
  const pool = filterByLanguagePref(uniq, prefs.language);
  pool.sort(embedPriority);

  const playable = [];
  const seenPlayable = new Set();
  const seenUrls = new Set(pool.map((c) => c.url));
  let attempts = 0;
  for (const cand of pool) {
    if (playable.length >= TARGET_STREAMS) break;
    if (attempts >= MAX_STREAMS) break;
    if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
    // Zenix → flow custom SID/play (le générique échoue sur ces pages JS)
    if (cand.url.includes('fluxora.sbs/embed/zenix')) {
      attempts++;
      try {
        const z = await resolveZenix(cand.url, prefs, signal, startTime, seenUrls);
        for (const s of z) {
          if (playable.length >= TARGET_STREAMS) break;
          if (!seenPlayable.has(s.url)) { seenPlayable.add(s.url); playable.push(s); }
        }
      } catch (e) {
        console.log(`[Webflix] Zenix error: ${e?.message}`);
      }
      continue;
    }
    attempts++;
    let r = null;
    try {
      r = await withTimeout(resolveStream({ ...cand }), TIMEOUTS.RESOLVE, 'webflix-resolve');
    } catch (err) {
      console.log(`[Webflix] resolve failed: ${String((err && err.message) || err).slice(0, 100)}`);
    }
    if (!r || !r.url || r.isDirect !== true) continue;
    if (!isPlayableUrl(r.url)) continue;
    if (seenPlayable.has(r.url)) continue;
    seenPlayable.add(r.url);
    const origin = getUrlOrigin(r.url, SITE.BASE_URL);
    playable.push({
      name: r.name || cand.name,
      title: r.title || cand.title,
      url: r.url,
      quality: r.quality || cand.quality || 'HD',
      language: r.language || cand.language,
      ...(r.size || cand.size ? { size: r.size || cand.size } : {}),
      ...(r.type ? { type: r.type } : {}),
      isDirect: true,
      headers: {
        ...(r.headers || {}),
        Referer: (r.headers && r.headers.Referer) || `${origin}/`,
        Origin: (r.headers && r.headers.Origin) || origin,
        'User-Agent': USER_AGENT,
      },
    });
  }

  // Interleave VF/VOSTFR (round-robin, VF d'abord)
  const vf = [];
  const vostfr = [];
  for (const p of playable) {
    const t = `${p.language || ''} ${p.title || ''}`.toUpperCase();
    if (t.includes('VOSTFR')) vostfr.push(p);
    else vf.push(p);
  }
  const mixed = [];
  const n = Math.max(vf.length, vostfr.length);
  for (let i = 0; i < n; i++) {
    if (i < vf.length) mixed.push(vf[i]);
    if (i < vostfr.length) mixed.push(vostfr[i]);
  }
  return mixed;
}

// ─── Extraction film ──────────────────────────────────────────────────────

async function extractMovie(tmdbId, prefs, signal, startTime) {
  // 1. FastFlux direct (films servis en faux S01E01, MP4 direct)
  const ff = await fetchFastfluxMovie(tmdbId);
  if (ff) {
    console.log(`[Webflix] FastFlux movie direct: ${ff.url.slice(0, 80)} (${ff.size || '?'})`);
    let def = 'VF';
    if (!hasExplicitLangSignal(ff.language, ff.url)) {
      def = defaultLangForOriginal(await fetchOriginalLanguage(tmdbId, 'movie', null, startTime));
    }
    return [makeDirect(ff.url, ff.language, ff.size, ff.quality, 'Film', def)];
  }
  if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return [];

  // 2. Search → fiche movie → player5 direct, puis embeds
  const embedCandidates = [];
  let ficheDirect = null;
  try {
    const titles = await getTmdbTitles(tmdbId, 'movie');
    const queries = (Array.isArray(titles) ? titles : []).filter(Boolean).slice(0, 2);
    const all = [];
    for (const qRaw of queries) {
      if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
      const q = sanitizeSearchQuery(qRaw);
      if (!q) continue;
      const found = await searchSlugs(q);
      for (const c of found) all.push(c);
    }
    const slugs = pickSlugs(all, queries, 'movie');
    const ficheDef = defaultLangForOriginal(titles && titles._metadata && titles._metadata.originalLanguage);
    for (const cand of slugs.slice(0, 2)) {
      if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
      const fiche = await fetchMovieBySlug(cand.slug);
      if (!fiche) continue;
      console.log(`[Webflix] Movie fiche: ${fiche.name || cand.slug}`);
      const push = (url, source, lang) => {
        if (!url || typeof url !== 'string' || url.includes('[object')) return;
        embedCandidates.push(makeEmbed(url, lang || fiche.language, source, ficheDef, cand.slug));
      };
      // player5 direct d'abord
      if (fiche.player5 && isPlayableUrl(fiche.player5)) {
        ficheDirect = makeDirect(fiche.player5, fiche.language, fiche.size, fiche.quality, 'Film', ficheDef, cand.slug);
        break;
      } else if (fiche.player5) {
        push(fiche.player5, 'Player5');
      }
      push(fiche.player6, 'Frembed');
      push(fiche.player2, 'Uqload');
      if (fiche.player3 && !isDeadHost(fiche.player3)) push(fiche.player3, 'Player3');
      if (fiche.player4 && !isDeadHost(fiche.player4)) push(fiche.player4, 'Player4');
      push(fiche.player1, 'Vidzy'); // dépriorisé au tri (jamais exclu)
      if (embedCandidates.length > 0) break;
    }
  } catch (e) {
    console.log(`[Webflix] Movie search/fiche error: ${e?.message}`);
  }
  if (ficheDirect) return [ficheDirect];

  // 3. Embeds TMDB-only + résolution (uniquement isDirect gardés)
  embedCandidates.push(...buildTmdbEmbeds(tmdbId, 'movie'));
  return resolveEmbeds(embedCandidates, prefs, signal, startTime);
}

// ─── Extraction série ─────────────────────────────────────────────────────

async function extractSeries(tmdbId, season, episode, prefs, signal, startTime) {
  const s = Number(season) || 1;
  const e = Number(episode) || 1;
  const label = `S${s}E${e}`;

  // 1. Discovery d'abord (1 appel = tous les épisodes), clé exacte "{s}-{e}"
  try {
    const disc = await fetchDiscovery(tmdbId);
    if (disc) {
      const entry = disc[`${s}-${e}`];
      if (entry && entry.url && typeof entry.url === 'string') {
        console.log(`[Webflix] Discovery direct ${label}: ${entry.url.slice(0, 80)}`);
        // Enrichissement best-effort : la discovery ne donne ni size ni
        // language → 1 appel fastflux épisode pour les champs API (pas de HEAD)
        let size = entry.size;
        let lang = entry.language;
        let quality = entry.quality;
        if (!size || !lang) {
          try {
            const ffEp = await fetchFastfluxEpisode(tmdbId, s, e);
            if (ffEp && ffEp.url) {
              size = size || ffEp.size;
              lang = lang || ffEp.language;
              quality = quality || ffEp.quality;
            }
          } catch (e2) {}
        }
        let def = 'VF';
        if (!hasExplicitLangSignal(lang, entry.url)) {
          def = defaultLangForOriginal(await fetchOriginalLanguage(tmdbId, 'tv', null, startTime));
        }
        return [makeDirect(entry.url, lang, size, quality, label, def)];
      }
      console.log(`[Webflix] Discovery: clé ${s}-${e} absente (${Object.keys(disc).length} entrée(s))`);
    }
  } catch (err) {
    console.log(`[Webflix] Discovery error: ${err?.message}`);
  }
  if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return [];

  // 2. FastFlux épisode
  const ff = await fetchFastfluxEpisode(tmdbId, s, e);
  if (ff) {
    console.log(`[Webflix] FastFlux episode direct ${label}: ${ff.url.slice(0, 80)} (${ff.size || '?'})`);
    let def = 'VF';
    if (!hasExplicitLangSignal(ff.language, ff.url)) {
      def = defaultLangForOriginal(await fetchOriginalLanguage(tmdbId, 'tv', null, startTime));
    }
    return [makeDirect(ff.url, ff.language, ff.size, ff.quality, label, def)];
  }
  if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return [];

  // 3. Search → slug série → fiche → match EXACT saison/épisode
  const embedCandidates = [];
  let ficheDirect = null;
  try {
    const titles = await getTmdbTitles(tmdbId, 'tv');
    const queries = (Array.isArray(titles) ? titles : []).filter(Boolean).slice(0, 2);
    const all = [];
    for (const qRaw of queries) {
      if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
      const q = sanitizeSearchQuery(qRaw);
      if (!q) continue;
      const found = await searchSlugs(q);
      for (const c of found) all.push(c);
    }
    const slugs = pickSlugs(all, queries, 'tv');
    const ficheDef = defaultLangForOriginal(titles && titles._metadata && titles._metadata.originalLanguage);
    for (const cand of slugs.slice(0, 2)) {
      if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
      const fiche = await fetchSeriesBySlug(cand.slug);
      if (!fiche) continue;
      // Anti-mismatch : vérifier le tmdb_id de la fiche quand présent
      if (fiche.tmdb_id != null && String(fiche.tmdb_id) !== String(tmdbId)) {
        console.log(`[Webflix] Fiche tmdb mismatch: ${fiche.tmdb_id} != ${tmdbId}, skip`);
        continue;
      }
      const seasonObj = (fiche.seasons || []).find((x) => Number(x && x.season_number) === s);
      if (!seasonObj) {
        console.log(`[Webflix] Saison ${s} absente de la fiche ${cand.slug}, abandon propre`);
        continue;
      }
      const epObj = (seasonObj.episodes || []).find((x) => Number(x && x.episode_number) === e);
      if (!epObj) {
        console.log(`[Webflix] Épisode ${label} absent de la fiche ${cand.slug}, abandon propre`);
        continue;
      }
      console.log(`[Webflix] Fiche match exact ${label} sur ${cand.slug}`);
      const players = (epObj.players && typeof epObj.players === 'object') ? epObj.players : {};
      const push = (url, source) => {
        if (!url || typeof url !== 'string' || url.includes('[object')) return;
        embedCandidates.push(makeEmbed(url, undefined, source, ficheDef, cand.slug));
      };
      if (players.player5 && isPlayableUrl(players.player5)) {
        ficheDirect = makeDirect(players.player5, undefined, undefined, undefined, label, ficheDef, cand.slug);
        break;
      } else if (players.player5) {
        push(players.player5, 'Player5');
      }
      push(players.player3, 'Multiup');
      push(players.player2, 'Uqload');
      if (players.player4 && !isDeadHost(players.player4)) push(players.player4, 'Player4');
      push(players.player1, 'Vidzy'); // dépriorisé au tri (jamais exclu)
      if (embedCandidates.length > 0) break;
    }
  } catch (err) {
    console.log(`[Webflix] Series search/fiche error: ${err?.message}`);
  }
  if (ficheDirect) return [ficheDirect];

  // 4. Embeds TMDB-only + résolution (Naruto/One Piece sans slug : seule voie)
  embedCandidates.push(...buildTmdbEmbeds(tmdbId, 'tv', s, e));
  return resolveEmbeds(embedCandidates, prefs, signal, startTime);
}

// ─── Point d'entrée ───────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = (options && options.signal) || null;
  if (isAborted(signal)) return [];
  setCurrentSignal(signal);
  const startTime = Date.now();

  if (!tmdbId) {
    console.log('[Webflix] Missing tmdbId');
    return [];
  }
  // Nuvio passe 'series' (jamais 'tv') → normaliser
  const isMovie = mediaType === 'movie';
  const prefs = getPrefs();

  try {
    if (isMovie) {
      return await extractMovie(tmdbId, prefs, signal, startTime);
    }
    return await extractSeries(tmdbId, season, episode, prefs, signal, startTime);
  } catch (e) {
    console.log(`[Webflix] extract error: ${e?.message}`);
    return [];
  }
}
