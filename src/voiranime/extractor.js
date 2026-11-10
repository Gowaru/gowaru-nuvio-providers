/**
 * Extractor Logic for VoirAnime
 * Optimisé : batchProbe plus rapide, slugs ciblés, fallback WordPress réactivé
 */

import { fetchText, setCurrentSignal, isRateLimited, resetRateLimit } from "./http.js";
import cheerio from "cheerio-without-node-native";
import { resolveStream, isBudgetExhausted, sanitizeSearchQuery, sortStreamsByLanguage, sleep, fetchWithRetry, isAborted, safeFetch, USER_AGENT } from "../utils/resolvers.js";
import { toSlug, resolveTargetEpisodes, resolveSeasonEpisodeInputs } from '../utils/dle-extractor.js';
import { getTmdbTitles } from "../utils/metadata.js";

const BASE_URL = "https://voir-anime.to";
const HEAD_TIMEOUT = 800;
const PAGE_TIMEOUT = 10000;
const HOST_TIMEOUT = 4000;
const SEARCH_TIMEOUT = 15000;
const BUDGET_MS = 36000;
// Timeout pour les probes de slugs (HEAD, aucun corps téléchargé).
// Mesuré en live : 0,7 s sur les fiches normales, ~1 s sur les grosses.
const PROBE_TIMEOUT = 4500;
// Budget alloué au sondage de slugs : au-delà, la résolution des lecteurs
// (la partie qui produit vraiment des streams) doit prendre le relais.
const PROBE_BUDGET_MS = 9000;
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 300000;

// Cache des slugs déjà testés (évite les doubles HEAD requests dans la même exécution)
const slugProbeCache = new Map();

// Labels LECTEUR du site → noms de domaines réels (pour logging)
const HOST_LABEL_MAP = {
  'LECTEUR myTV': 'voembed.net',      // VidMoly wrapper
  'LECTEUR MOON': 'gn1r5n.org',       // Byse/myTV SPA
  'LECTEUR SB': 'streamhide.to',       // ParkLogic gate (mort)
  'LECTEUR VOE': 'voe.sx',            // Voe SPA
  'LECTEUR Stape': 'streamtape.com',   // StreamTape
  'LECTEUR FHD1': 'my.mail.ru',       // Mail.ru
  'LECTEUR YU': 'yourupload.com',      // YourUpload
};

// Embeds dont la page utilise une SPA React / une gate JS (ParkLogic) et ne
// PEUVENT PAS être résolus vers une URL directe sans navigateur.
// ATTENTION au matching : 'voe.' ne doit PAS matcher "voembed.net" (famille
// VidMoly, résolvable en m3u8 !). Bug historique: le pattern 'voe' classait
// voembed comme non résolvable → 0 stream direct sur tous les épisodes.
// ⚠ VERIFIÉ LIVE 2026-11 : `resolveVoe()` résout DÉSORMAIS les pages voe.sx
// (SPA « Byse ») en master HLS direct. Exclure 'voe.' supprimait au moins un
// lecteur par épisode et une grande partie des VF (« la VF n'apparaît pas »).
// Ne restent que les gates réellement infranchissables (ParkLogic/streamhide,
// SPA mfw09/gn1r5n testée → non résolue).
const UNRESOLVABLE_EMBEDS = ['streamhide.', 'gn1r5n.', 'mfw09.', 'parklogic', 'ds2play', 'bigwar5'];

// Iframes placeholder servies par l'anti-bot de VoirAnime quand les vrais
// lecteurs sont indisponibles (détection bot / rate-limit / épisode non
// encore disponible). Ces iframes ne sont PAS des vidéos : les retourner
// produisait des streams qui ne démarrent jamais dans l'app.
const PLACEHOLDER_IFRAMES = ['youtube.com/embed', 'youtu.be/', 'facebook.com/plugins', 'twitter.com/i/videos', 'ok.ru/videoembed'];

const SPINOFF_KEYWORDS = ['fan letter', 'log:', 'memories', 'vigilante', 'illegals', 'film', 'movie', 'special', 'oav', 'ona', 'x ut', 'collab'];



/**
 * Double les voyelles à macron (translittération japonaise) : "Shippūden" → "Shippuuden".
 * Beaucoup de sites FR écrivent les voyelles longues en double (uu, aa, oo)
 * alors que TMDB utilise les macrons (ū, ā, ō).
 */
function expandMacrons(s) {
  if (!s) return s;
  let out = '';
  for (const ch of s) {
    const d = ch.normalize('NFD');
    if (d.length > 1 && d.includes('\u0304') && 'aeiouAEIOU'.includes(d[0])) out += d[0] + d[0];
    else out += ch;
  }
  return out;
}

function isSpinoff(title) {
  const t = title.toLowerCase();
  return SPINOFF_KEYWORDS.some(k => t.includes(k));
}

function normalizeForSearch(s) {
  return (s || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[':!.,?()\[\]]/g, ' ')
    .replace(/\b(the|vostfr|vost|vf|french|streaming|anime)\s+/g, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Score search result: title match + season match + spinoff penalty
 *
 * `altTitles` (tous les titres TMDB de l'œuvre) est INDISPENSABLE : le site
 * indexe en romaji/FR (`Shingeki no Kyojin 4 : The Final Season`) alors que
 * la requête peut être anglaise (`Attack on Titan`) — sans comparaison aux
 * titres alternatifs, ce résultat légitime tombait à 0 et le provider ne
 * trouvait plus rien pour Attack on Titan S4.
 */
function scoreSearchResult(resultTitle, resultUrl, searchTitle, searchSeason, altTitles) {
  const queries = [searchTitle, ...(altTitles || [])]
    .filter(t => typeof t === 'string' && t)
    .map(normalizeForSearch)
    .filter(Boolean);
  const nr = normalizeForSearch(resultTitle);
  if (!nr || queries.length === 0) return 0;

  let score = 0;
  for (const ns of queries) {
    let s = 0;
    if (nr === ns) s = 100;
    else if (nr.includes(ns) || ns.includes(nr)) s = 80;
    else {
      const rWords = new Set(nr.split(/\s+/).filter(w => w.length > 2));
      const sWords = new Set(ns.split(/\s+/).filter(w => w.length > 2));
      if (rWords.size > 0 && sWords.size > 0) {
        let overlap = 0;
        for (const w of sWords) {
          if (rWords.has(w)) overlap++;
        }
        const maxLen = Math.max(rWords.size, sWords.size);
        s = Math.round((overlap / maxLen) * 50);
      }
    }
    if (s > score) score = s;
    if (score >= 100) break;
  }

  if (isSpinoff(resultTitle) || isSpinoff(resultUrl)) score -= 50;
  if (resultTitle.toLowerCase().includes('x ut')) score -= 30;

  const seasonMatch = resultUrl.match(/[-](\d+)(?:-vf|-vostfr)?\/?$/);
  const saisonMatch = resultUrl.match(/saison[_-](\d+)/i);
  const urlSeason = seasonMatch ? parseInt(seasonMatch[1]) : (saisonMatch ? parseInt(saisonMatch[1]) : null);

  if (urlSeason !== null) {
    if (urlSeason === searchSeason) score += 20;
    else score -= 40;
  } else if (searchSeason === 1) {
    score += 10;
  }

  return Math.max(score, 0);
}

/**
 * Numéros de saison portés par un TITRE de fiche.
 * « Shingeki no Kyojin 4 : The Final Season » → 4, alors que son URL
 * `…-the-final-season/` ne porte aucun numéro (la fiche VOSTFR de cette
 * saison n'est donc trouvable que par le titre).
 * Borné à 20 pour ne pas prendre « Mob Psycho 100 » pour une saison.
 */
function titleSeasonNumbers(title) {
  const t = String(title || '').replace(/\((?:VF|VOSTFR)\)/gi, ' ');
  const out = [];
  for (const m of t.matchAll(/(?:saison|season)\s*(\d+)/gi)) out.push(parseInt(m[1], 10));
  for (const m of t.matchAll(/(?:^|\s)(\d{1,2})\s*(?::|\s*$)/g)) out.push(parseInt(m[1], 10));
  return out.filter(n => n >= 1 && n <= 20);
}

/** Numéros de saison portés par une URL de fiche (`-2`, `-saison-2`). */
function urlSeasonNumbers(url) {
  return [...String(url || '').toLowerCase().matchAll(/(?:^|[-/])(?:saison-?|season-?)?(\d+)(?:[-/]|$)/g)]
    .map(m => parseInt(m[1], 10))
    .filter(n => n > 0 && n < 1900);
}

function rankMatchesBySeason(matches, season) {
  const want = parseInt(season, 10) || 1;
  const withSeason = [];
  const neutral = [];
  const other = [];
  for (const m of matches) {
    // Les années (`spirited-away-2001`, `-2024`) ne sont pas des saisons.
    const nums = [...String(m.url).toLowerCase().matchAll(/(?:^|[-/])(?:saison-?|season-?)?(\d+)(?:[-/]|$)/g)]
      .map(x => parseInt(x[1], 10))
      .filter(n => n > 0 && n < 1900);
    if (nums.includes(want)) withSeason.push(m);
    else if (nums.length > 0) other.push(m);
    else neutral.push(m);
  }
  // Une fiche qui porte EXPLICITEMENT une autre saison (`…-3-…`, `saison-2`)
  // n'est jamais le bon contenu : la garder servait la S3 pour une demande
  // S4, ou `solo-leveling-2` pour `Solo Leveling` S1 (cause directe des
  // « épisodes qui ne correspondent pas aux titres »).
  // S1 : les fiches SANS marqueur passent d'abord (le site ne suffixe pas la
  // saison 1) ; S2+ : celles qui portent la saison demandée.
  // `other` (saison explicite différente) n'est JAMAIS servi : mieux vaut 0
  // stream qu'un épisode d'une autre saison (symptôme « l'épisode ne
  // correspond pas au titre »).
  if (withSeason.length + neutral.length === 0) return [];
  return want <= 1 ? [...neutral, ...withSeason] : [...withSeason, ...neutral];
}

// Marqueurs d'œuvre dérivée : un fiche qui en porte un ne peut pas servir une
// demande dont le titre principal n'en porte pas (AOT S4 → Lost Girls OAV).
const SPINOFF_MARKERS = [
  'lost girls', 'junior high', 'no regrets', 'chronicle', 'picture drama',
  'recap', 'fan letter', 'ilse langnar', 'oav', 'ova'
];

function hasSpinoffMarker(text) {
  const t = normalizeForSearch(text || '');
  return SPINOFF_MARKERS.some(k => t.includes(k));
}

/**
 * Liens d'épisodes d'une fiche (hors films/OAV/spéciaux), dans l'ordre du site
 * (DESCENDANT). Sert au mapping par numéro ET à la validation du nombre
 * d'épisodes de la fiche.
 */
function collectChapterLinks($) {
  const out = [];
  $(".wp-manga-chapter a, ul.main.version-chap.no-volumn li.wp-manga-chapter a, .listing-chapters a, .list-chapter a").each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (!href) return;
    if (/\/(special|oav|ova|film|movie|recap)\b/i.test(href)) return;
    if (out.some(x => x.href === href)) return;
    out.push({ href, text });
  });
  return out;
}

function extractSeasonFromEpisodeLink(text, url) {
  const combined = `${text || ''} ${url || ''}`;
  const match = combined.match(/S(?:aison|eason)\s*[:\\(\\s-]*\s*(\d+)/i) ||
                combined.match(/saison[_-](\d+)/i) ||
                combined.match(/S(\d+)\s*(?:E|V|VF|VOSTFR|\b)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

/**
 * Generate season-aware slug variants for fallback probing.
 * Ajoute des variantes avec année pour les slugs (ex: spirited-away-2001).
 */
function generateFallbackSlugs(baseSlug, season, year) {
  const slugs = [
    `${baseSlug}-${season}`,
    `${baseSlug}-${season}-vf`,
    `${baseSlug}-saison-${season}`,
  ]
  if (year) {
    slugs.push(`${baseSlug}-${year}`)
    slugs.push(`${baseSlug}-${year}-vf`)
  }
  return slugs.filter(Boolean)
}

function cleanSlug(slug) {
  return slug
    .replace(/-(?:1st|2nd|3rd|4th|5th)-season$/, '')
    .replace(/-(?:season|saison)-?\d+$/, '')
    .replace(/-s\d+$/, '')
    .replace(/-(?:part|cour|arc|volume)-?\d+$/, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Probe une URL pour vérifier si la page existe.
 *
 * HEAD d'abord, GET en repli : la fiche pèse ~250 Ko et on ne lit que le
 * statut. Mesuré en live : HEAD 0,7 s / 0 octet contre GET 1,4 s / 248 Ko.
 * Les serveurs qui refusent HEAD (405/501) basculent sur GET.
 */
async function probeUrl(url) {
  if (slugProbeCache.has(url)) return slugProbeCache.get(url);
  // Site en mode blocage → chaque HEAD échouerait de toute façon.
  if (isRateLimited()) {
    slugProbeCache.set(url, false);
    return false;
  }
  // safeFetch ne throw jamais (catch interne → retourne null) donc pas de try/catch nécessaire
  let res = await safeFetch(url, { method: "HEAD", timeout: PROBE_TIMEOUT });
  if (!res || res.status === 405 || res.status === 501) {
    res = await safeFetch(url, { method: "GET", timeout: PROBE_TIMEOUT });
  }
  if (!res || !res.ok) {
    slugProbeCache.set(url, false);
    return false;
  }
  // Détecter les redirects 301/302 vers une page différente (ex: arc spécifique au lieu de la page principale)
  // Si l'URL finale diffère de l'URL demandée, c'est un redirect → la page probeée n'est pas la bonne
  const finalUrl = res.url || url;
  if (finalUrl !== url) {
    // Extraire le chemin après /anime/ pour comparer
    const origPath = url.replace(/https?:\/\/[^/]+/, '');
    const finalPath = finalUrl.replace(/https?:\/\/[^/]+/, '');
    // Si le chemin final est différent, c'est un redirect vers une autre page
    // (ex: /anime/X/ → /anime/X-arc-name/) → invalide
    if (origPath !== finalPath) {
      slugProbeCache.set(url, false);
      return false;
    }
  }
  slugProbeCache.set(url, true);
  return true;
}

/**
 * Sonde une liste d'URLs par lots.
 * `deadline` borne le sondage : sans elle, 40 URLs × 6 s de timeout
 * consommaient tout le budget de 45 s et le provider rendait 0 stream
 * (constaté en live sur Attack on Titan S4E28 / Demon Slayer S1E1).
 */
async function batchProbe(urls, batchSize = 5, delayMs = 0, deadline = null) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    if (deadline != null && Date.now() > deadline) break;
    if (isRateLimited()) break;
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        const ok = await probeUrl(url);
        return ok ? url : null;
      })
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
    if (results.length > 0) return results; // Early exit si trouvé
    if (delayMs > 0 && i + batchSize < urls.length) await sleep(delayMs);
  }
  return results;
}

/**
 * WordPress search sur VoirAnime avec parsing du HTML de résultats.
 * Fallback quand le slug probing direct échoue.
 *
 * `wordpressSearch` filtre par score (>= 30) ; `wordpressSearchRaw` renvoie
 * TOUS les résultats avec leur score — nécessaire à l'oracle de slug, où le
 * titre du site (romaji) ne partage souvent aucun mot avec la requête TMDB.
 */
async function wordpressSearchRaw(query, season, altTitles) {
  try {
    // Blocage Cloudflare actif : la requête serait rejetée d'avance — inutile
    // d'enchaîner les échecs (et leurs logs) pendant tout le budget restant.
    if (isRateLimited()) return [];
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(sanitizeSearchQuery(query))}`;
    const html = await fetchText(searchUrl, { timeout: 9000 });
    if (!html) return [];

    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();

    // Fiches de résultat : le thème Madara les rend dans .post-title > h3 > a
    // (le libellé du lien est le TITRE réel du site, la vignette porte le
    // même href en attribut title).
    const push = (href, title) => {
      if (!href || !title) return;
      // Ne garder que la FICHE (un seul segment après /anime/) : les liens
      // d'épisodes (…/slug/naruto-001-vostfr/) ne sont pas des candidats.
      const m = String(href).match(/^(https?:\/\/[^/]+)?\/anime\/([^/"'#?]+)\/?$/);
      if (!m) return;
      const url = `${BASE_URL}/anime/${m[2]}/`;
      if (seen.has(url)) return;
      seen.add(url);
      const score = scoreSearchResult(title, url, query, season, altTitles);
      results.push({ title: title.trim(), url, score });
    };

    $('.post-title a[href*="/anime/"], h3 a[href*="/anime/"], .entry-title a[href*="/anime/"], .result-item a[href*="/anime/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = ($(el).text() || $(el).attr('title') || '').replace(/\s+/g, ' ').trim();
      push(href, title);
    });
    // Vignettes (href + title en attribut) : couvre les thèmes sans .post-title
    $('a[title][href*="/anime/"]').each((_, el) => {
      push($(el).attr('href'), $(el).attr('title'));
    });

    results.sort((a, b) => b.score - a.score);
    return results;
  } catch (e) {
    console.warn(`[VoirAnime] WordPress search failed: ${e?.message}`);
    return [];
  }
}

async function wordpressSearch(query, season, altTitles) {
  const results = await wordpressSearchRaw(query, season, altTitles);
  const best = results.filter(r => r.score >= 30).slice(0, 4);
  console.log(`[VoirAnime] WP search "${query}": ${best.length} fiche(s) retenue(s) (sur ${results.length}) ${best.map(r => `${r.url.split('/anime/')[1]}(${r.score})`).join(', ')}`);
  return best.map(r => ({ title: r.title, url: r.url }));
}

/**
 * Slug de base déduit d'un titre de fiche du site.
 * Ex : "Shingeki no Kyojin 4 : The Final Season" → `shingeki-no-kyojin`.
 * C'est ce slug (et non celui du titre TMDB anglais) que le site utilise.
 */
function deriveBaseSlug(title) {
  let t = String(title || '')
    .replace(/\((?:VF|VOSTFR)\)/gi, ' ')
    .replace(/\b(?:vf|vostfr)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.split(/\s*[:–]\s*/)[0]
    .replace(/\s+(?:saison|season)\s*\d+.*$/i, '')
    .replace(/\s+(?:the\s+)?final\s+seasons?.*$/i, '')
    .replace(/\s+(?:part|cour|arc)\s*\d+.*$/i, '')
    .replace(/\s+(?:ova|oav|film|movie|special|sp[ée]cial)\b.*$/i, '')
    .replace(/\s+\d+\s*$/, '');
  return toSlug(t);
}

/**
 * Slugs de BASE tirés des résultats WP, les plus fréquents d'abord.
 * Le site nomme ses fiches en romaji : une recherche « Attack on Titan »
 * renvoie `shingeki-no-kyojin-3-vf`, `…-the-final-season`, etc. — la base
 * dérivée `shingeki-no-kyojin` revient dans presque tous les résultats, donc
 * la fréquence classe correctement sans deviner la translittération.
 * On ne garde QUE la base : une fiche dérivée (OAV, « Final Season ») sondée
 * pour une autre saison servirait le mauvais contenu.
 */
function rankOracleSlugs(results) {
  const counts = new Map();
  for (const r of results || []) {
    const base = deriveBaseSlug(r.title);
    if (!base || base.length <= 3 || hasSpinoffMarker(base)) continue;
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug);
}

/**
 * Search for anime on VoirAnime
 * Priority: 1) Season-specific slug probing, 2) Generic slug, 3) WordPress search
 */
async function searchAnime(title, season = 1, year, altTitles) {
  const baseSlug = toSlug(title);
  const results = [];
  const searchStartTime = Date.now();

  function isProbeBudgetExhausted() {
    return Date.now() - searchStartTime >= 15000;
  }

  // --- STEP 0: Season-specific slugs for S2+ ---
  if (season > 1 && baseSlug.length > 3 && !isProbeBudgetExhausted()) {
    const seasonSlugs = generateFallbackSlugs(baseSlug, season, year);
    const seasonUrls = seasonSlugs.map(s => `${BASE_URL}/anime/${s}/`);
    const validSeasonUrls = await batchProbe(seasonUrls, 2, 300, Date.now() + PROBE_BUDGET_MS);

    if (validSeasonUrls.length > 0) {
      console.log(`[VoirAnime] Season slugs found (S${season}): ${validSeasonUrls}`);
      validSeasonUrls.forEach(url => {
        const lang = url.includes('-vf') ? 'VF' : 'VOSTFR';
        results.push({ title: `${title} S${season} ${lang}`, url });
      });
      return results;
    }

    // Try with cleaned slug
    const cleanBaseSlug = cleanSlug(baseSlug);
    if (cleanBaseSlug !== baseSlug && cleanBaseSlug.length > 3 && !isProbeBudgetExhausted()) {
      const cleanSlugs = generateFallbackSlugs(cleanBaseSlug, season, year);
      const cleanUrls = cleanSlugs.map(s => `${BASE_URL}/anime/${s}/`);
      const validCleanUrls = await batchProbe(cleanUrls, 2, 300, Date.now() + PROBE_BUDGET_MS);

      if (validCleanUrls.length > 0) {
        console.log(`[VoirAnime] Clean season slugs found (S${season}): ${validCleanUrls}`);
        validCleanUrls.forEach(url => {
          const lang = url.includes('-vf') ? 'VF' : 'VOSTFR';
          results.push({ title: `${title} S${season} ${lang}`, url });
        });
        return results;
      }
    }
  }

  // --- STEP 1: Generic slug (VF + VOSTFR en parallèle) ---
  if (baseSlug.length > 3 && !isProbeBudgetExhausted()) {
    const exactUrl = `${BASE_URL}/anime/${baseSlug}/`;
    const exactVfUrl = `${BASE_URL}/anime/${baseSlug}-vf/`;

    // Prober les 2 variantes en parallèle
    const [hasVostfr, hasVf] = await Promise.all([
      probeUrl(exactUrl),
      probeUrl(exactVfUrl),
    ]);

    if (hasVostfr) results.push({ title, url: exactUrl });
    if (hasVf) results.push({ title: `${title} VF`, url: exactVfUrl });
    if (results.length > 0) return results;
  }

  // --- STEP 1.5: Alternative slugs (short keywords, compacted Japanese) ---
  // Certains sites utilisent des slugs radicalement différents du titre TMDB.
  // On essaie des variantes plus courtes basées sur les mots-clés distinctifs.
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const words = title.split(/\s+/).filter(w => w.length > 2)
    const altSlugs = []
    
    // Variante 1: Enlever les mots trop génériques du début
    const skipPrefixes = ['dealing', 'with', 'the', 'my', 'that', 'this', 'dans', 'and', 'of', 'a', 'an']
    const filtered = words.filter(w => !skipPrefixes.includes(w.toLowerCase()))
    if (filtered.length >= 2 && filtered.length < words.length) {
      altSlugs.push(filtered.join('-'))
    }
    
    // Variante 2: Dernier mot long + avant-dernier mot long
    const longWords = words.filter(w => w.length >= 4)
    if (longWords.length >= 2) {
      altSlugs.push(longWords.slice(0, 3).join('-'))
    }
    
    // Variante 3: Juste les mots distinctifs (2-3 mots longs)
    if (longWords.length >= 2) {
      altSlugs.push(longWords.slice(-2).join('-'))
    }
    
    // Variante 4: Version compactée pour les titres japonais
    // Ex: "Mikadono San Shimai wa Angai Choroi" → "mikadono-sanshimai-wa-angai-choroi"
    // Certains sites écrivent les composés japonais en un seul mot ("sanshimai")
    // alors que TMDB les sépare ("san shimai"). On génère plusieurs variantes :
    // - chaque mot court collé individuellement au mot suivant
    // - tous les mots courts collés en une fois
    const compactWords = title.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[':!.,?()\[\]]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    
    if (compactWords.length >= 3) {
      // Trouver les positions des mots courts (≤3 lettres, pas le dernier)
      const shortPos = []
      for (let i = 0; i < compactWords.length - 1; i++) {
        if (compactWords[i].length <= 3) shortPos.push(i)
      }
      
      if (shortPos.length > 0) {
        const compactVariants = []
        
        // Variante: coller chaque mot court individuellement
        for (const pos of shortPos) {
          const parts = [...compactWords]
          parts[pos] = parts[pos] + parts[pos + 1]
          parts.splice(pos + 1, 1)
          compactVariants.push(parts.join('-'))
        }
        
        // Variante: coller TOUS les mots courts
        if (shortPos.length > 1) {
          const parts = [...compactWords]
          let offset = 0
          for (const pos of shortPos) {
            const actualPos = pos - offset
            parts[actualPos] = parts[actualPos] + parts[actualPos + 1]
            parts.splice(actualPos + 1, 1)
            offset++
          }
          compactVariants.push(parts.join('-'))
        }
        
        // Ajouter les variantes uniques et différentes du slug normal
        // Limiter à 2 variantes max (fetch synchrone en QuickJS = pas de parallélisme)
        const uniqueCompact = [...new Set(compactVariants)].filter(v => v !== baseSlug && v.length > 5)
        for (const v of uniqueCompact.slice(0, 2)) {
          altSlugs.push(v)
          altSlugs.push(v + '-vf')
        }
      }
    }
    
    // Prober les slugs alternatifs uniques
    const uniqueAltSlugs = [...new Set(altSlugs.filter(s => s && s.length > 3))]
    if (uniqueAltSlugs.length > 0) {
      console.log(`[VoirAnime] Trying ${uniqueAltSlugs.length} alt slug(s): ${uniqueAltSlugs.slice(0, 3).join(', ')}...`)
      const altUrls = uniqueAltSlugs.flatMap(s => [
        `${BASE_URL}/anime/${s}/`,
        `${BASE_URL}/anime/${s}-vf/`,
      ])
      const validAltUrls = await batchProbe(altUrls, 2, 200, Date.now() + PROBE_BUDGET_MS)
      
      if (validAltUrls.length > 0) {
        console.log(`[VoirAnime] Alt slugs found: ${validAltUrls}`)
        validAltUrls.forEach(url => {
          const lang = url.includes('-vf') ? 'VF' : 'VOSTFR'
          results.push({ title: `${title} [alt]`, url })
        })
        return results
      }
    }
  }

  // --- STEP 2: WordPress search (15s timeout) ---
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const searchResults = await wordpressSearch(title, season, altTitles);
    for (const r of searchResults) {
      const lang = r.url.includes('-vf') ? 'VF' : 'VOSTFR';
      if (!results.some(ex => ex.url === r.url)) {
        results.push({ ...r, title: `${r.title}` });
      }
    }
    if (results.length > 0) return results;
  }

  // --- STEP 3: WordPress search with short keywords ---
  // Si la recherche avec le titre complet n'a rien donné, essayer avec
  // des mots-clés courts (le moteur de recherche WP est parfois meilleur
  // avec des termes précis qu'avec des titres longs).
  if (results.length === 0 && !isProbeBudgetExhausted()) {
    const longWords = title.split(/\s+/).filter(w => w.length > 2)
    const keywordQueries = [
      longWords.slice(-2).join(' '),  // 2 derniers mots longs
      longWords.slice(0, 2).join(' '), // 2 premiers mots longs
      longWords.filter(w => w.length >= 4).slice(0, 2).join(' '), // mots très distinctifs
    ]
    
    const seenQueries = new Set()
    const uniqueQueries = keywordQueries.filter(q => {
      if (!q || seenQueries.has(q.toLowerCase())) return false
      seenQueries.add(q.toLowerCase())
      return true
    })
    
    if (uniqueQueries.length > 0) {
      console.log(`[VoirAnime] Parallel keyword WP search: ${uniqueQueries.length} queries`)
      const searchResults = await Promise.allSettled(
        uniqueQueries.map(q => wordpressSearch(q, season, altTitles))
      )
      for (const r of searchResults) {
        if (r.status === 'fulfilled') {
          for (const res of r.value) {
            if (!results.some(ex => ex.url === res.url)) {
              results.push({ ...res, title: `${res.title}` })
            }
          }
        }
      }
      if (results.length > 0) {
        console.log(`[VoirAnime] Parallel keyword search found ${results.length} result(s)`)
        return results
      }
    }
  }

  return [];
}

function extractHosts(html) {
  const urls = [];
  const regex = /<option[^>]*value="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const val = m[1];
    // Filtrer les vrais lecteurs : les options LECTEUR xxx sont les seules valides.
    // Les autres <option> contiennent des slugs d'épisodes (navigation) qui ne
    // sont PAS des hosts d'embed. L'ancien filtre "Choisir un lecteur" ne suffisait pas.
    if (val && val.startsWith('LECTEUR ')) urls.push(val);
  }
  return [...new Set(urls)];
}

/**
 * Récupère l'URL d'embed d'un lecteur depuis la page ?host=X d'un épisode.
 * Retourne l'URL brute SANS classification — le filtrage placeholder et le tri
 * se font globalement dans resolveEpisodeStreams (les labels LECTEUR du site
 * ne correspondent PAS aux domaines réels : myTV→voembed, FHD1→mail.ru, etc.).
 */
async function fetchHostEmbed(host, episodeUrl) {
  try {
    const hostUrl = `${episodeUrl}${episodeUrl.includes("?") ? "&" : "?"}host=${encodeURIComponent(host)}`;
    const hostHtml = await fetchText(hostUrl, { timeout: HOST_TIMEOUT });

    const iframeMatch = hostHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    let embedUrl = iframeMatch ? iframeMatch[1] : null;

    if (!embedUrl) {
      const scriptMatch = hostHtml.match(/https?:\/\/[^"'\s<>]+\/(?:embed|e|v|player)\/[^"'\s<>]+/);
      if (scriptMatch && !scriptMatch[0].includes("voiranime.com")) embedUrl = scriptMatch[0];
    }
    return embedUrl;
  } catch (err) {
    console.warn(`[VoirAnime] fetchHostEmbed(${host}) failed: ${err?.message}`);
    return null;
  }
}

function embedDomain(url) {
  return (url || '').replace(/^https?:\/\//, '').split('/')[0];
}

/**
 * Embeds déjà inline dans la page : `var thisChapterSources = { "LECTEUR x":
 * "<iframe src=…>" }`.
 *
 * Le thème Madara de VoirAnime sérialise le HTML de CHAQUE lecteur directement
 * dans la page de l'épisode : en le lisant, on économise les 1 à 3 requêtes
 * `?host=X` (pages de ~250 Ko chacune) par épisode — coût dominant du provider
 * (16 à 44 s par cas de test) et première cause de timeout/budget épuisé.
 * Filtre de résilience : si le balisage `<option>` disparaît un jour, ce bloc
 * suffit encore à construire les streams.
 */
function extractChapterSources(html) {
  if (!html || typeof html !== 'string' || !html.includes('thisChapterSources')) return [];
  const anchor = html.indexOf('thisChapterSources');
  const eq = html.indexOf('=', anchor);
  if (eq < 0) return [];
  const start = html.indexOf('{', eq);
  if (start < 0) return [];
  // Équilibre des accolades HORS chaînes (le JSON embarque du HTML).
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  let obj;
  try { obj = JSON.parse(html.slice(start, end + 1)); } catch (e) { return []; }
  const out = [];
  for (const host of Object.keys(obj)) {
    const val = obj[host];
    if (typeof val !== 'string') continue;
    const m = val.match(/<iframe[^>]+src="([^"]+)"/i) || val.match(/<iframe[^>]+src='([^']+)'/i);
    if (m && m[1].startsWith('http')) out.push({ host, url: m[1] });
  }
  return out;
}

/**
 * Sous-page film d'une fiche : `/anime/{slug}/film-vostfr-{slug}/` (ou
 * `film-vf-…` sur la fiche -vf). C'est là que vit le lecteur d'un film —
 * la fiche elle-même ne porte qu'un placeholder YouTube anti-bot.
 * Préfère la variante correspondant à la langue de la fiche, sinon la
 * première trouvée (le site ne publie pas toujours les 2 versions).
 */
function findFilmSubPage(html, lang, ficheUrl) {
  const $ = cheerio.load(html);
  const wantVf = String(lang || '').toUpperCase() === 'VF';
  const ownSlug = (() => {
    const m = String(ficheUrl || '').match(/\/anime\/([^/]+)\/?$/);
    return m ? m[1] : null;
  })();
  let best = null;
  let other = null;
  $('a[href*="film-"]').each((_, el) => {
    const raw = ($(el).attr('href') || '').split('#')[0].split('?')[0];
    if (!raw || !/\/film-(vostfr|vf)-/i.test(raw)) return;
    let url = raw;
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('/')) url = BASE_URL + url;
    // Lien externe (flux RSS, partage) → ignoré
    if (!/\/anime\//i.test(url)) return;
    // La sous-page doit appartenir à la FICHE consultée : la page d'un film
    // liste aussi les films voisins (sidebar "suggestions") qui pointent
    // vers /anime/{autre-slug}/film-… — les servir serait du faux contenu.
    const own = ownSlug ? url.includes(`/anime/${ownSlug}/`) : true;
    if (!own) return;
    const isVf = /\/film-vf-/i.test(url);
    if (isVf === wantVf) { if (!best) best = url; }
    else if (!other) other = url;
  });
  // `other` = même fiche, autre langue (VOSTFR ↔ VF) : le bon film,
  // acceptable en secours. Un film d'une AUTRE fiche n'est jamais retenu.
  return best || other;
}

/**
 * Numéro(s) d'épisode porté par le dernier segment d'une URL d'épisode :
 *   `naruto-001-vostfr`         → [1]
 *   `naruto-214x215-vostfr`     → [214, 215] (page groupant 2 épisodes)
 *   `gate-2-005-vostfr`         → [5]  (le « 2 » du slug n'est PAS un ép.)
 * Retourne [] quand le segment ne se termine pas par un numéro d'épisode.
 */
function episodeNumbersFromHref(href) {
  const seg = String(href || '').split('?')[0].split('/').filter(Boolean).pop() || '';
  const m = seg.match(/(?:^|-)(\d+(?:x\d+)*)(?:-v(?:ostfr|f))?$/i);
  if (!m) return [];
  return m[1].split('x').map(n => parseInt(n, 10));
}

/**
 * Sélection équilibrée des fiches à parcourir : garantit au moins une fiche
 * VOSTFR ET une fiche VF dans les N retenues. Sans cela, un sondage qui
 * remonte 3 variantes VOSTFR + 1 VF (ou l'inverse) écrasait l'autre langue
 * au `.slice(0, N)` — symptôme « la VF n'apparaît jamais ».
 */
function pickBalanced(list, n) {
  const isVf = m => String(m.title || '').toUpperCase().includes('VF') || String(m.url || '').includes('-vf');
  const vf = list.filter(m => isVf(m));
  const vostfr = list.filter(m => !isVf(m));
  // VF d'abord : les fiches VF sont plus rares et le budget lecteurs partagé
  // s'épuise sur la VOSTFR en premier — c'était la cause n°1 des « VF qui
  // n'apparaissent jamais » (le budget tombait à 0 avant d'atteindre la VF).
  const out = [];
  for (let i = 0; out.length < n && (i < vf.length || i < vostfr.length); i++) {
    if (vf[i]) out.push(vf[i]);
    if (out.length < n && vostfr[i]) out.push(vostfr[i]);
  }
  for (const m of list) {
    if (out.length >= n) break;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Classifie un embed :
 *   - 'placeholder'   : iframe anti-bot YouTube/etc. à EXCLURE absolument
 *   - 'unresolvable'  : SPA/gate JS (voe.sx, streamhide/ParkLogic) → dernier recours
 *   - 'resolvable'    : page avec m3u8/mp4 extractible → à résoudre en priorité
 */
function classifyEmbed(url) {
  const u = (url || '').toLowerCase();
  if (PLACEHOLDER_IFRAMES.some(p => u.includes(p))) return 'placeholder';
  if (UNRESOLVABLE_EMBEDS.some(p => u.includes(p))) return 'unresolvable';
  return 'resolvable';
}

async function generateEpisodeUrl(html, targetEp, startTime, effectiveSeason) {
  const $ = cheerio.load(html);
  const firstLink = $('.wp-manga-chapter a').first();
  if (!firstLink.length) return null;

  const href = firstLink.attr('href') || '';
  // ⚠ Ne JAMAIS fabriquer d'URL depuis un lien film/OAV/spécial : le " 0 "
  // final de « Jujutsu Kaisen 0 » (film-vostfr-jujutsu-kaisen-0) était pris
  // pour un numéro d'épisode → /film-…-001/, page soft-404 servie par le site
  // (200 sans lecteur) → 0 stream sur tous les films de ce type.
  const lastSeg = href.split('?')[0].split('/').filter(Boolean).pop() || '';
  if (/^(?:film|oav|ova|special|movie|recap)[-/]/i.test(lastSeg)) return null;
  const match = href.match(/\/anime\/([^/]+)\/(.+?-)(\d+)(-v(?:ostfr|f))?\//);
  if (!match) return null;

  const slugName = match[1];
  const prefix = match[2];
  const suffix = match[4] || '';

  // ⚠ ANTI-FAUX-CONTENU : le préfixe contient la saison de la page source
  // (ex: "...-saison-1-"). Si la saison demandée n'existe pas sur le site,
  // fabriquer l'URL depuis ce préfixe servait l'épisode de la SAISON 1
  // (bug Gate S2 : 2 streams S1 servis pour la S2). Refuser le cross-saison.
  const prefixSeason = prefix.match(/saison-(\d+)/i);
  if (prefixSeason && effectiveSeason != null && parseInt(prefixSeason[1], 10) !== parseInt(effectiveSeason, 10)) {
    return null;
  }

  // Paddings testés en parallèle
  const paddings = ['00', '0', ''];
  const results = await Promise.allSettled(
    paddings.map(async (pad) => {
      if (isBudgetExhausted(startTime, BUDGET_MS)) return null;
      const url = `https://voir-anime.to/anime/${slugName}/${prefix}${pad}${targetEp}${suffix}/`;
      const ok = await probeUrl(url);
      return ok ? url : null;
    })
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) return r.value;
  }
  return null;
}

// 2 lecteurs résolus par langue (VF + VOSTFR = 4 streams bruts, largement
// assez après expansion des qualités) : chaque lecteur supplémentaire coûte
// 1 à 3 requêtes, et le budget du provider est la ressource rare ici.
const MAX_DIRECT_STREAMS = 2;
// Budget de résolution des lecteurs (collecte des embeds + résolveurs) : le
// temps restant après la découverte, borné par le budget global.
const EMBED_BUDGET_MS = 22000;

/**
 * Résout les streams d'un épisode en 3 phases :
 *   1. Collecte parallèle des embeds de tous les lecteurs
 *   2. Filtrage des placeholders anti-bot + tri (résolvables d'abord)
 *   3. Résolution séquentielle avec early-exit dès MAX_DIRECT_STREAMS directs
 *
 * Les embeds non résolus (SPA/gates) ne sont retournés qu'en DERNIER recours
 * si aucun stream direct n'a pu être obtenu.
 */
async function resolveEpisodeStreams(episodeUrl, lang, streamHeaders, startTime, deadline) {
  const expired = () => (deadline != null && Date.now() > deadline) || isBudgetExhausted(startTime, BUDGET_MS);
  try {
    const epRawHtml = await fetchWithRetry(() => fetchText(episodeUrl, { timeout: PAGE_TIMEOUT }), { retries: 1 });
    // Embeds inline (lecture 0 requête) ∪ hosts déclarés en `<option>`
    const inlineSources = extractChapterSources(epRawHtml);
    const inlineByHost = new Map();
    for (const s of inlineSources) if (!inlineByHost.has(s.host)) inlineByHost.set(s.host, s.url);
    const allHosts = [...new Set([
      ...extractHosts(epRawHtml),
      ...inlineSources.map(s => s.host),
    ])];

    if (allHosts.length === 0) {
      // Page sans aucun lecteur = réponse dégradée anti-bot du site (ou épisode
      // pas encore disponible). On log pour faciliter le diagnostic.
      console.log(`[VoirAnime] No player options on episode page (anti-bot response or unavailable): ${episodeUrl.slice(0, 70)}`);
    }

    // Les hosts sont déjà filtrés par extractHosts ( commence par "LECTEUR ")
    // On les déduplique et on skip les hosts connus morts
    const deadHosts = ['LECTEUR SB']; // streamhide.to = ParkLogic gate
    // Ordre de valeur RÉELLEMENT observé en live : myTV = voembed.net (m3u8
    // stable), Stape = streamtape, FHD1 = my.mail.ru (mp4), YU = yourupload
    // (mp4), MOON = SPA « Byse » (mfw09.org/gn1r5n.org) NON résoluble sans
    // navigateur — chaque sonde coûte une page de ~250 Ko pour rien.
    const HOST_ORDER = {
      'LECTEUR myTV': 0,
      'LECTEUR VOE': 1,
      'LECTEUR Stape': 2,
      'LECTEUR FHD1': 3,
      'LECTEUR YU': 4,
      'LECTEUR MOON': 5,
    };
    // Borne dure : 3 lecteurs collectés pour 2 résolus. Chaque lecteur coûte
    // une page de ~250 Ko (+ 1 à 3 requêtes de résolution) : au-delà, on
    // dépasse le budget du provider et l'app jette tout le résultat.
    const MAX_HOSTS = 4;
    const filteredHosts = allHosts
      .filter(h => !deadHosts.includes(h))
      .sort((a, b) => (HOST_ORDER[a] ?? 9) - (HOST_ORDER[b] ?? 9))
      .slice(0, MAX_HOSTS);

    // --- Fallback: pas de lecteurs <option> → iframe par défaut de la page ---
    if (filteredHosts.length === 0) {
      const $ = cheerio.load(epRawHtml);
      let iframe = null;
      $("iframe").each((_, el) => {
        const src = $(el).attr("src") || "";
        if (src.startsWith("http") && !src.includes("voiranime.com") &&
            classifyEmbed(src) !== 'placeholder') {
          iframe = src;
          return false;
        }
      });
      if (!iframe) return [];

      if (classifyEmbed(iframe) === 'resolvable') {
        const stream = await resolveStream({
          name: `VoirAnime (${lang})`,
          title: `Default Player - ${lang}`,
          quality: "HD",
          url: iframe,
          headers: { Referer: BASE_URL, Origin: BASE_URL, "User-Agent": USER_AGENT },
        });
        if (stream && stream.isDirect) return [stream];
        console.log(`[VoirAnime] Default player not resolvable, skipping (${embedDomain(iframe)})`);
      } else {
        console.log(`[VoirAnime] Default player is unresolvable, skipping (${embedDomain(iframe)})`);
      }
      return [];
    }

    // --- Phase 1: collecter tous les embeds en parallèle (avec timeout court) ---
    // `LECTEUR VOE` est un SPA voe.sx : classifié « unresolvable » plus bas,
    // inutile de payer une requête pour le découvrir.
    const collectHosts = filteredHosts;
    const collected = await Promise.allSettled(
      (collectHosts.length > 0 ? collectHosts : filteredHosts).map(host => {
        // Déjà inline dans la page → aucune requête supplémentaire.
        const inline = inlineByHost.get(host);
        if (inline) return inline;
        return fetchHostEmbed(host, episodeUrl);
      })
    );
    const embedUrls = [...new Set(
      collected.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
    )];

    // Fallback: si aucun embed récupéré via les options, essayer l'iframe par défaut
    if (embedUrls.length === 0) {
      const $ = cheerio.load(epRawHtml);
      const defaultIframe = $('iframe[src*="vidmoly"], iframe[src*="voembed"], iframe[src*="mail.ru"]').first().attr('src');
      if (defaultIframe && classifyEmbed(defaultIframe) === 'resolvable') {
        embedUrls.push(defaultIframe);
        console.log(`[VoirAnime] Using default iframe fallback: ${embedDomain(defaultIframe)}`);
      }
    }

    // --- Phase 2: filtrer placeholders + trier (résolvables d'abord) ---
    const candidates = embedUrls
      .map(u => ({ url: u, cls: classifyEmbed(u) }))
      .filter(e => e.cls !== 'placeholder');
    const order = { resolvable: 0, unresolvable: 1 };
    candidates.sort((a, b) => order[a.cls] - order[b.cls]);

    if (candidates.length === 0) {
      console.log('[VoirAnime] Only placeholder iframes found (anti-bot response), no real players available');
      return [];
    }
    console.log(`[VoirAnime] ${candidates.length} embed(s): ${candidates.map(c => `${embedDomain(c.url)}[${c.cls}]`).join(', ')}`);

    // --- Phase 3: résoudre dans l'ordre de priorité, early-exit ---
    const direct = [];
    const unresolved = [];
    for (const cand of candidates) {
      if (direct.length >= MAX_DIRECT_STREAMS) break;
      if (expired()) break;

      if (cand.cls === 'unresolvable') { unresolved.push(cand); continue; }

      try {
        const stream = await resolveStream({
          name: `VoirAnime (${lang})`,
          title: `${embedDomain(cand.url)} - ${lang}`,
          quality: "HD",
          url: cand.url,
          headers: { ...streamHeaders },
        });
        if (stream && stream.isDirect) {
          console.log(`[VoirAnime] Resolved direct: ${embedDomain(cand.url)} -> ${String(stream.url).slice(0, 70)}`);
          direct.push(stream);
        } else {
          console.log(`[VoirAnime] Not resolved: ${embedDomain(cand.url)}`);
          unresolved.push(cand);
        }
      } catch (e) {
        console.warn(`[VoirAnime] Resolve failed for ${embedDomain(cand.url)}: ${e?.message}`);
        unresolved.push(cand);
      }
    }

    if (direct.length > 0) return direct;

    // --- Dernier recours: exposer les embeds non résolus (SPA/gates) ---
    if (unresolved.length > 0) {
      console.log(`[VoirAnime] No direct streams, returning ${unresolved.length} embed URL(s) as last resort`);
      return unresolved.map(c => ({
        name: `VoirAnime (${lang})`,
        title: `${embedDomain(c.url)} - ${lang}`,
        url: c.url,
        quality: "HD",
        headers: { ...streamHeaders },
        isDirect: false,
      }));
    }
    return [];
  } catch (e) {
    console.warn(`[VoirAnime] resolveEpisodeStreams failed: ${e?.message}`);
    return [];
  }
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null;
  if (isAborted(signal)) return [];
  setCurrentSignal(signal);

  // NuvioTV (videoId anime kitsu:/mal:/anilist:) envoie season=null + un
  // numéro ABSOLU. Sans reverse-map, `effectiveSeason` restait null, les
  // fiches S{n} introuvables et la VF jamais sondée (0 stream ou VOSTFR S1).
  const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, {
    mediaType: mediaType === 'movie' ? 'movie' : 'tv',
  });
  season = se.season;
  episode = se.episode;

  const titles = await getTmdbTitles(tmdbId, mediaType, { season });
  if (titles.length === 0) return [];

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
  const startTime = Date.now();

  // Vider le cache de slug probing pour une nouvelle exécution
  slugProbeCache.clear();
  // Chaque getStreams tourne dans une instance QuickJS fraîche : un blocage
  // Cloudflare détecté pendant l'exécution précédente ne doit pas handicaper
  // celle-ci (on repart d'un pied neuf).
  resetRateLimit();

  // ArmSync: épisode saison-local PUIS épisode absolu.
  // Le site numérote locale à la saison (Attack on Titan S4 = 01..30 sur
  // `shingeki-no-kyojin-4-28-vf/`) alors que certaines fiches couvrant toute
  // la série n'exposent que l'absolu : on essaie les deux, le local d'abord.
  // Ne garder QUE l'absolu rendait 0 stream sur toutes les fiches
  // saisonnières (AOT S4E28 → recherche « 87 » dans une liste 01..30).
  const resolvedEps = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: BUDGET_MS });
  const targetEpisodes = [...new Set(resolvedEps.filter(e => e != null && e > 0))];

  // Search cache
  const cacheKey = `${tmdbId}-${effectiveSeason}`;
  let matches = [];
  // Titres pour la recherche WordPress de 2e vague (lue après le bloc cache).
  let titlePool = [];
  if (SEARCH_CACHE.has(cacheKey) && Date.now() - SEARCH_CACHE.get(cacheKey).ts < SEARCH_CACHE_TTL) {
    const hit = SEARCH_CACHE.get(cacheKey);
    matches = hit.matches || [];
    // ⚠ Restaurer AUSSI titlePool : sans lui, la 2e vague WP n'avait aucune
    // requête à lancer et un épisode raté en vague 1 rendait 0 stream en 0,2 s
    // (constaté AOT S4E30 après un premier appel S4E1 dans la même instance).
    titlePool = hit.titlePool || [];
    console.log(`[VoirAnime] Search cache hit for ${cacheKey}`);
  } else {
    const searchTitles = titles.slice(0, 15);
    const baseTitles = searchTitles.filter(t => !/\bS(?:eason|aison)?\s*\d/i.test(t));
    const seasonTitles = searchTitles.filter(t => /\bS(?:eason|aison)?\s*\d/i.test(t));

    const allTitles = [...baseTitles, ...seasonTitles];
    titlePool = [baseTitles[0], seasonTitles[0], baseTitles[1], allTitles[0]].filter(Boolean);

    // --- ÉTAPE A : sondage parallèle des slugs -----------------------------
    // Les slugs dérivés des titres TMDB sont exacts dans l'immense majorité
    // des cas et coûtent 1 HEAD par URL (0 octet). La recherche WordPress
    // prend le relais en 2e vague (voir plus bas) quand ils échouent.
    if (allTitles.length > 0 && !isBudgetExhausted(startTime, BUDGET_MS)) {
      const uniqueSlugs = [...new Set(
        allTitles.map(t => toSlug(t)).filter(s => s && s.length > 3)
      )];

      // Ajouter les variantes avec année (ex: spirited-away-2001)
      const year = titles._metadata?.year
      if (year) {
        const yearVariants = uniqueSlugs.map(s => `${s}-${year}`)
        for (const v of yearVariants) {
          if (!uniqueSlugs.includes(v)) uniqueSlugs.push(v)
        }
      }

      // Variantes avec voyelles longues doublées (ex: "Naruto: Shippūden"
      // → naruto-shippuden sur TMDB mais naruto-shippuuden sur le site)
      for (const t of allTitles) {
        const expanded = toSlug(expandMacrons(t));
        if (expanded && expanded.length > 3 && !uniqueSlugs.includes(expanded)) {
          uniqueSlugs.push(expanded);
        }
      }

      // SAISONS : le site héberge chaque saison sur un slug DÉDIÉ avec un
      // simple suffixe numérique (Gate S2 = `…-2`, AOT S2 = `shingeki-no-kyojin-2`),
      // INVISIBLE de la search WP. On ne peut pas deviner le slug exact du
      // site : on sonde donc d'abord les slugs de BASE (peu coûteux), puis on
      // dérive les variantes `{slugTrouvé}-{N}` — c'est la convention réelle
      // du site, alors qu'un `{titre TMDB}-{N}` tombe presque toujours à côté
      // (AOT = `shingeki-no-kyojin`, pas `attack-on-titan`).
      const VF_PAIR_SIZE = 2;
      const pairUrls = (slugs) => slugs.flatMap(slug =>
        slug.endsWith('-vf')
          ? [`${BASE_URL}/anime/${slug}/`]
          : [`${BASE_URL}/anime/${slug}/`, `${BASE_URL}/anime/${slug}-vf/`]
      );
      const probeDeadline = startTime + PROBE_BUDGET_MS;

      console.log(`[VoirAnime] Parallel probe: ${uniqueSlugs.length} unique slugs`);

      // Étape A0 : 2 premiers slugs de base seulement (4 URLs). Si le slug
      // exact du site est devinable, on s'arrête là sans requête de recherche.
      let validUrls = await batchProbe(pairUrls(uniqueSlugs).slice(0, 4), VF_PAIR_SIZE, 0, probeDeadline);

      // Étape A0b : la recherche WP comme ORACLE de slug (1 requête).
      // Le site nomme ses fiches en romaji (`shingeki-no-kyojin`) alors que le
      // slug dérivé de TMDB est anglais (`attack-on-titan`) : le sondage
      // aveugle consommait 16 HEAD avant de tomber dessus (mesuré en live).
      // Une seule page de résultats donne le slug réel via ses titres.
      if (validUrls.length === 0) {
        const oracleQuery = baseTitles[0] || allTitles[0];
        const oracleResults = oracleQuery
          ? await wordpressSearchRaw(oracleQuery, effectiveSeason, titles)
          : [];
        // 1) Les fiches renvoyées qui portent la saison demandée (URL `…-4-…`
        //    pour une requête S4) sont les plus fiables : on les sonde avant
        //    toute dérivation de slug. Évite une 2e recherche WP en Ét. B.
        //    Garde-fou strict, sinon on sert la mauvaise saison : pour S2+ le
        //    numéro de saison doit figurer dans l'URL (`…-2/`, `…-saison-2/`),
        //    et pour S1 la fiche doit être la fiche « de base » — son titre ne
        //    doit porter ni saison, ni `Final Season`, ni OAV (AOT S1 tombait
        //    sinon sur `shingeki-no-kyojin-the-final-season`, titre romaji
        //    scoré 80 via les alias TMDB ⇒ 3 streams au lieu de 6).
        const seasonUrls = oracleResults
          .filter(r => !(hasSpinoffMarker(r.title) && !hasSpinoffMarker(titles[0] || '')))
          .filter(r => {
            const nums = [...urlSeasonNumbers(r.url), ...titleSeasonNumbers(r.title)];
            if (effectiveSeason > 1) return nums.includes(effectiveSeason);
            if (!nums.every(n => n === 1)) return false;
            const raw = toSlug(String(r.title || '').replace(/\((?:VF|VOSTFR)\)/gi, ' '));
            return raw === deriveBaseSlug(r.title) && (r.score || 0) >= 30;
          })
          .map(r => (String(r.url).match(/\/anime\/([^/]+)\//) || [])[1])
          .filter(Boolean);

        // 2) Slugs de base dérivés des titres du site (`shingeki-no-kyojin`),
        //    avec `{base}-{N}` en tête pour S2+.
        const oracleSlugs = rankOracleSlugs(oracleResults).slice(0, 2);
        const ordered = [...new Set(seasonUrls)].slice(0, 2);
        for (const slug of oracleSlugs) {
          if (effectiveSeason > 1 && !/\d+$/.test(slug)) ordered.push(`${slug}-${effectiveSeason}`);
          ordered.push(slug);
        }
        if (ordered.length > 0) {
          console.log(`[VoirAnime] Oracle WP "${oracleQuery}" → ${ordered.join(', ')}`);
          validUrls = await batchProbe(pairUrls(ordered).slice(0, 12), VF_PAIR_SIZE, 0, probeDeadline);
        }
      }

      // Étape A0c : reste du sondage aveugle (oracle indisponible ou muet).
      if (validUrls.length === 0) {
        validUrls = await batchProbe(pairUrls(uniqueSlugs).slice(4, 24), VF_PAIR_SIZE, 0, probeDeadline);
      }

      // Étape A2 : pour S2+, dériver `{slug}-{N}` des fiches réellement
      // trouvées et remplacer les fiches de base si la saison dédiée existe.
      if (effectiveSeason > 1 && validUrls.length > 0) {
        const foundSlugs = [...new Set(validUrls.map(u =>
          (u.match(/\/anime\/([^/]+)\/$/)?.[1] || '').replace(/-vf$/, '')
        ))].filter(s => s && !/-\d+$/.test(s));
        const seasonUrls = pairUrls(foundSlugs.flatMap(s => [`${s}-${effectiveSeason}`]))
          .slice(0, 16);
        if (seasonUrls.length > 0) {
          const validSeason = await batchProbe(seasonUrls, VF_PAIR_SIZE, 0, probeDeadline);
          if (validSeason.length > 0) {
            console.log(`[VoirAnime] Saison dédiée trouvée: ${validSeason.join(', ')}`);
            validUrls = validSeason;
          }
        }
      }

      if (validUrls.length > 0) {
        // Associer les URLs valides aux titres correspondants
        for (const url of validUrls) {
          const urlSlug = url.match(/\/anime\/([^/]+)\/$/)?.[1]?.replace(/-vf$/, '');
          const matchingTitle = allTitles.find(t => toSlug(t) === urlSlug);
          const detectedLang = url.includes('-vf') ? 'VF' : 'VOSTFR';
          // Convention : VOSTFR n'a pas de suffixe dans le titre (compatible
          // avec la détection de langue plus bas qui utilise includes("VF"))
          const baseName = matchingTitle || titles[0] || urlSlug;
          matches.push({
            title: detectedLang === 'VF' ? `${baseName} VF` : baseName,
            url,
          });
        }
        console.log(`[VoirAnime] Parallel probe found ${matches.length} match(es): ${validUrls.join(', ')}`);
      }
    }

    // --- ÉTAPE B : recherche WordPress (1 requête/titre, max 2) -------------
    // Elle connaît les fiches dont le slug s'éloigne du titre TMDB
    // (`shingeki-no-kyojin-4-the-final-season` pour Attack on Titan S4), que
    // le sondage de slugs ne peut pas deviner.
    if (matches.length === 0 && !isBudgetExhausted(startTime, BUDGET_MS)) {
      const seenQueries = new Set();
      for (const q of titlePool.slice(0, 2)) {
        if (matches.length > 0 || isBudgetExhausted(startTime, BUDGET_MS)) break;
        if (!q || seenQueries.has(q.toLowerCase())) continue;
        seenQueries.add(q.toLowerCase());
        const found = await wordpressSearch(q, effectiveSeason, titles);
        for (const r of found) {
          if (!matches.some(ex => ex.url === r.url)) matches.push({ ...r });
        }
      }
      if (matches.length > 0) {
        console.log(`[VoirAnime] WP search → ${matches.length} fiche(s): ${matches.map(m => m.url.split('/anime/')[1]).join(', ')}`);
      }
    }

    // --- ÉTAPE C : boucle historique (slugs alternatifs, compactage JP) -----
    if (matches.length === 0) {
      // Dernier recours coûteux (slugs alternatifs + 2 requêtes WP par titre) :
      // borné à 8 titres et 16 s, sinon un contenu ABSENT du site consume les
      // 36 s de budget et rend 0 stream en plus de 45 s (constaté live).
      for (const title of allTitles.slice(0, 8)) {
        if (isBudgetExhausted(startTime, BUDGET_MS) || isRateLimited()) break;
        if (Date.now() - startTime > BUDGET_MS - 20000) break;
        const result = await searchAnime(title, effectiveSeason, titles._metadata?.year, titles);
        if (result && result.length > 0) {
          matches = result;
          break;
        }
      }
    }

    if (matches.length > 0) {
      SEARCH_CACHE.set(cacheKey, { ts: Date.now(), matches, titlePool });
    }
  }

  if (matches.length === 0) return [];

  // Reclassement par saison : quand la saison demandée > 1, les fiches qui
  // portent ce numéro (`…-4-the-final-season`, `…-saison-2`) passent devant
  // les OVA/films/recaps homonymes — sinon on peut brûler le budget sur une
  // fiche qui ne contient pas l'épisode (Attack on Titan S4 → Lost Girls).
  let waveMatches = pickBalanced(rankMatchesBySeason(matches, effectiveSeason), 4);

  const streams = [];
  const checkedUrls = new Set();
  const streamHeaders = { Referer: BASE_URL, Origin: BASE_URL, "User-Agent": USER_AGENT };
  // Budget lecteurs partagé entre les fiches retenues (VOSTFR + VF) : sans
  // partage, la 1re fiche consommait tout et la VF disparaissait.
  let embedShare = Math.max(6000, Math.floor(EMBED_BUDGET_MS / Math.max(1, waveMatches.length)));

  for (let wave = 0; wave < 2; wave++) {
  if (wave === 1) {
    if (streams.length > 0) break;
    // 2e vague : recherche WordPress. Le sondage de slugs ne peut pas
    // inventer `shingeki-no-kyojin-4-the-final-season` (Attack on Titan S4,
    // seul slug du site) ; et WP seul ne suffit pas toujours (les fiches
    // anciennes comme `naruto/` ne remontent pas dans ses premiers
    // résultats) → on enchaîne les deux stratégies.
    const wp = [];
    const seenQueries = new Set();
    for (const q of titlePool.slice(0, 2)) {
      if (isBudgetExhausted(startTime, BUDGET_MS)) break;
      if (seenQueries.has(q.toLowerCase())) continue;
      seenQueries.add(q.toLowerCase());
      const found = await wordpressSearch(q, effectiveSeason, titles);
      for (const r of found) {
        if (!checkedUrls.has(r.url) && !wp.some(x => x.url === r.url)) wp.push(r);
      }
    }
    if (wp.length === 0) break;
    waveMatches = pickBalanced(rankMatchesBySeason(wp, effectiveSeason), 3);
    embedShare = Math.max(6000, Math.floor(EMBED_BUDGET_MS / Math.max(1, waveMatches.length)));
    console.log(`[VoirAnime] 2e vague (WP): ${waveMatches.map(m => m.url.split('/anime/')[1]).join(', ')}`);
  }

  for (const match of waveMatches) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) break;
    if (isRateLimited()) {
      console.log('[VoirAnime] Rate limit Cloudflare détecté — arrêt anticipé (prochaine tentative repartira d\'un pied neuf)');
      break;
    }
    if (checkedUrls.has(match.url)) continue;
    checkedUrls.add(match.url);

    const lang = match.title.toUpperCase().includes("VF") || match.url.includes("-vf") ? "VF" : "VOSTFR";

    try {
      const html = await fetchText(match.url, { timeout: 6000 });
      if (!html) continue;
      const $ = cheerio.load(html);

      // ── Garde d'identité de la fiche (vérifiée live 2026-11) ─────────────
      // La recherche WP classe au titre seul : pour « Attack on Titan S4 »,
      // `shingeki-no-kyojin-lost-girls` (OAV, 2 ép.) remontait à 100 et était
      // servie comme S4E1 (→ « les épisodes ne correspondent pas »).
      // Discriminant fiable : le nombre d'épisodes de la fiche vs celui de la
      // saison TMDB (métadonnée déjà chargée, 0 requête) et la présence d'un
      // marqueur de saison contraire.
      const ficheLinks = collectChapterLinks($);
      const ficheSlug = match.url.split('/anime/')[1] || '';
      const ficheName = ($('h1').first().text() || '').trim();
      const expectedCount = titles._metadata?.seasonEpisodeCounts?.[effectiveSeason] || null;
      if (mediaType !== 'movie') {
        // Œuvre dérivée (OAV/recap/spinoff) demandée implicitement : rejet, sauf
        // si le titre principal demandé est lui-même ce dérivé.
        if (hasSpinoffMarker(`${ficheSlug} ${ficheName}`) && !hasSpinoffMarker(titles[0])) {
          console.log(`[VoirAnime] Fiche rejetée (œuvre dérivée): ${ficheSlug}`);
          continue;
        }
        // Écart massif de volume d'épisodes : la fiche ne couvre pas la saison
        // (TMDB et le site divergent souvent de quelques épisodes, on ne
        // rejette qu'en dessous du tiers).
        if (expectedCount && ficheLinks.length > 0 &&
            ficheLinks.length * 3 < expectedCount && expectedCount - ficheLinks.length >= 6) {
          console.log(`[VoirAnime] Fiche rejetée: ${ficheSlug} (${ficheLinks.length} ép. vs ${expectedCount} attendus pour S${effectiveSeason})`);
          continue;
        }
        // Sens inverse (S2+) : une fiche SANS marqueur de saison doit couvrir
        // la saison demandée. Sinon c'est la fiche de la S1 (AOT S4E1 servait
        // S1E1, AOT S2E5 servait S1E5). On tolère ±2 épisodes de divergence
        // TMDB/site ; au-delà, on rejette pour laisser la 2e vague WP trouver
        // la vraie fiche (`…-the-final-season`).
        if (effectiveSeason > 1 && expectedCount && ficheLinks.length > 0) {
          const hasSeasonMarker = /(?:^|[-/])(?:saison-?|season-?)?\d+(?:[-/]|$)/
            .test(ficheSlug.replace(/\d{4}/g, ''));
          if (!hasSeasonMarker && Math.abs(ficheLinks.length - expectedCount) > 2) {
            console.log(`[VoirAnime] Fiche rejetée: ${ficheSlug} (${ficheLinks.length} ép. pour S${effectiveSeason}, ${expectedCount} attendus) — autre saison sans marqueur`);
            continue;
          }
        }
      }

      // « 001 » (Naruto), « 01 » et « 1 » : le site zero-padde selon la
      // saison, et l'ancien jeu ['0',''] ne matchait jamais les 3 chiffres.
      const paddings = ["00", "0", ""];
      const epPatterns = [];
      for (const ep of targetEpisodes) {
        const epS = ep.toString();
        paddings.forEach(p => epPatterns.push(p + epS));
      }

      let episodeUrl = null;

      // Method 1: Pattern match on link text with season validation
      const epSelectors = [
        ".listing-chapters a",
        ".list-chapter a",
        ".wp-manga-chapter a",
        ".episodes a",
        "ul.episodes li a",
        ".episode-list a",
        "ul.main.version-chap.no-volumn li.wp-manga-chapter a",
        'a[href*="/episode/"]',
        'a[href*="/ep/"]',
      ];

      for (const sel of epSelectors) {
        $(sel).each((i, el) => {
          if (episodeUrl) return false;
          const text = $(el).text().trim();
          const href = $(el).attr("href") || '';
          if (href.includes('/special') || href.includes('/oav') || href.includes('/film') || href.includes('/ova')) return;

          const linkSeason = extractSeasonFromEpisodeLink(text, href);
          if (linkSeason !== null && linkSeason !== effectiveSeason) return;

          const cleanText = text.replace(/S(?:aison|eason)\s*\d+/ig, '').trim();
          for (const pattern of epPatterns) {
            const regex = new RegExp(`(?:^|[^0-9])${pattern}(?:$|[^0-9])`, "i");
            if (regex.test(cleanText)) {
              episodeUrl = href;
              return false;
            }
          }
        });
        if (episodeUrl) break;
      }

      if (!episodeUrl) {
        const chapterLinks = ficheLinks.filter(l => {
          const linkSeason = extractSeasonFromEpisodeLink(l.text, l.href);
          return linkSeason === null || linkSeason === effectiveSeason;
        });
        // 1) Numéro exact porté par l'URL (couvre les pages groupées
        //    `naruto-214x215-vostfr` que l'ancien regex ne voyait pas :
        //    il ne retenait que 214 → épisode 215 introuvable).
        for (const ep of targetEpisodes) {
          for (const link of chapterLinks) {
            if (episodeNumbersFromHref(link.href).includes(ep)) {
              episodeUrl = link.href;
              break;
            }
          }
          if (episodeUrl) break;
        }
        // 2) Repli par POSITION. ⚠ Le site liste les épisodes en DESCENDANT
        //    (`naruto-220`, 219 … 1) : l'ancien index brut `hrefs[ep-1]`
        //    servait l'épisode 220 quand on demandait l'épisode 1 — cause
        //    directe des « épisodes qui ne correspondent pas au titre ».
        if (!episodeUrl && chapterLinks.length > 0) {
          const sorted = chapterLinks
            .map(l => ({ href: l.href, n: episodeNumbersFromHref(l.href)[0] }))
            .filter(x => x.n != null)
            .sort((a, b) => a.n - b.n);
          for (const ep of targetEpisodes) {
            const idx = ep - 1;
            if (idx >= 0 && idx < sorted.length) {
              episodeUrl = sorted[idx].href;
              break;
            }
          }
        }
      }

      // FILMS : le lecteur n'est PAS sur la fiche principale (placeholder
      // YouTube anti-bot) mais sur la sous-page /film-vostfr-{slug}/ (ou
      // /film-vf-{slug}/ depuis la fiche -vf). On la lit en priorité : sinon
      // le chemin générique (Method 3) fabriquait /film-…-001/ à partir du
      // " 0 " final du titre — page soft-404, 0 stream.
      if (mediaType === 'movie') {
        const filmUrl = findFilmSubPage(html, lang, match.url);
        if (filmUrl) {
          episodeUrl = filmUrl;
          console.log(`[VoirAnime] Movie sub-page: ${episodeUrl.slice(0, 80)}`);
        } else if (!episodeUrl) {
          episodeUrl = match.url;
          console.log(`[VoirAnime] Movie fallback: using match URL as episode URL`);
        }
      }

      // Method 3 : fabrication d'URL (séries uniquement — voir le garde film
      // dans generateEpisodeUrl et le bloc films ci-dessus).
      if (!episodeUrl && mediaType !== 'movie' && targetEpisodes.length > 0) {
        for (const ep of targetEpisodes) {
          if (isBudgetExhausted(startTime, BUDGET_MS)) break;
          const genUrl = await generateEpisodeUrl(html, ep, startTime, effectiveSeason);
          if (genUrl) {
            episodeUrl = genUrl;
            break;
          }
        }
      }

      if (!episodeUrl) continue;

      // Diagnostic : trace la page d'épisode effectivement choisie (permet de
      // vérifier épisode ↔ titre au lieu de deviner depuis le titre du stream).
      const epLabel = mediaType === 'movie' ? 'film' : `S${effectiveSeason}E${targetEpisodes.join('/')}`;
      console.log(`[VoirAnime] Episode URL (${lang}, ${epLabel}): ${episodeUrl.slice(0, 80)}`);

      const embedDeadline = Math.min(Date.now() + embedShare, startTime + BUDGET_MS - 2000);
      const epStreams = await resolveEpisodeStreams(episodeUrl, lang, streamHeaders, startTime, embedDeadline);
      streams.push(...epStreams);

    } catch (e) { console.warn(`[VoirAnime] Match processing failed: ${e?.message}`); }
  }
  }

  // Dédupliquer les streams par URL (VF et VOSTFR peuvent servir les mêmes sources)
  const seenUrls = new Set();
  const deduped = [];
  for (const s of streams) {
    if (!s || !s.url) continue;
    // Normaliser l'URL pour la dédup (ignorer les params de token qui changent)
    const baseUrl = s.url.split('?')[0];
    if (seenUrls.has(baseUrl)) continue;
    seenUrls.add(baseUrl);
    deduped.push(s);
  }

  const directStreams = deduped.filter(s => s && s.isDirect);
  const embedStreams = deduped.filter(s => s && !s.isDirect && s.url);

  // Prefer direct streams ONLY — convention repo (wookafr/fluneo/coflix) :
  // les embeds non résolus (SPA/gates) ne se lancent jamais dans l'app, les
  // exposer produit des streams qui restent bloqués sur l'écran de chargement.
  // ⚠ Le filtre par base URL exclut les pages embed si un direct du même host
  // existe — c'est voulu (même contenu, mieux résolu).
  const validStreams = directStreams;
  if (directStreams.length === 0 && embedStreams.length > 0) {
    console.log(`[VoirAnime] 0 direct, ${embedStreams.length} embed(s) non résolus rejetés (convention repo)`);
  }
  console.log(`[VoirAnime] Total streams: ${validStreams.length} (${directStreams.length} direct, ${embedStreams.length} embed rejeté)`);

  return sortStreamsByLanguage(validStreams);
}
