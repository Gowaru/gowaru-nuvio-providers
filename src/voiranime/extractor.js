/**
 * Extractor Logic for VoirAnime
 * Optimisé : batchProbe plus rapide, slugs ciblés, fallback WordPress réactivé
 */

import { fetchText, setCurrentSignal } from "./http.js";
import cheerio from "cheerio-without-node-native";
import { resolveStream, isBudgetExhausted, sanitizeSearchQuery, sortStreamsByLanguage, sleep, fetchWithRetry, isAborted, safeFetch, USER_AGENT } from "../utils/resolvers.js";
import { toSlug, resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { getTmdbTitles } from "../utils/metadata.js";

const BASE_URL = "https://voir-anime.to";
const HEAD_TIMEOUT = 800;
const PAGE_TIMEOUT = 10000;
const HOST_TIMEOUT = 8000;
const SEARCH_TIMEOUT = 15000;
const BUDGET_MS = 45000;
// Timeout pour les probes de slugs (GET headers only). Les grosses pages
// (ex: naruto-shippuden ~180KB derrière Cloudflare) peuvent mettre >3s à
// répondre — l'ancien timeout de 3.2s les déclarait inexistantes à tort.
const PROBE_TIMEOUT = 6000;
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
const UNRESOLVABLE_EMBEDS = ['voe.', 'streamhide.', 'gn1r5n.', 'parklogic', 'ds2play', 'dood.', 'bigwar5'];

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
 */
function scoreSearchResult(resultTitle, resultUrl, searchTitle, searchSeason) {
  const nr = normalizeForSearch(resultTitle);
  const ns = normalizeForSearch(searchTitle);
  if (!nr || !ns) return 0;

  let score = 0;

  if (nr === ns) score = 100;
  else if (nr.includes(ns) || ns.includes(nr)) score = 80;
  else {
    const rWords = new Set(nr.split(/\s+/).filter(w => w.length > 2));
    const sWords = new Set(ns.split(/\s+/).filter(w => w.length > 2));
    if (rWords.size > 0 && sWords.size > 0) {
      let overlap = 0;
      for (const w of sWords) {
        if (rWords.has(w)) overlap++;
      }
      const maxLen = Math.max(rWords.size, sWords.size);
      score = Math.round((overlap / maxLen) * 50);
    }
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
 * Utilise safeFetch (GET) au lieu de HEAD car fetchText avec HEAD
 * ne permet pas de distinguer 200 (succès) de 404 (pas trouvé)
 * — les deux retournent '' dans le runtime QuickJS.
 *
 * GET avec un timeout court (~1.6s) et vérification du status code.
 */
async function probeUrl(url) {
  if (slugProbeCache.has(url)) return slugProbeCache.get(url);
  // safeFetch ne throw jamais (catch interne → retourne null) donc pas de try/catch nécessaire
  const res = await safeFetch(url, { method: "GET", timeout: PROBE_TIMEOUT });
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

async function batchProbe(urls, batchSize = 5, delayMs = 0) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
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
 */
async function wordpressSearch(query, season) {    try {
      const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(sanitizeSearchQuery(query))}`;
      const html = await fetchText(searchUrl, { timeout: 8000 });
    if (!html) return [];

    const $ = cheerio.load(html);
    const results = [];

    // Pattern: les résultats de recherche sont dans des articles ou des listes
    $('article a[href*="/anime/"], .post-title a[href*="/anime/"], .entry-title a[href*="/anime/"], .result-item a[href*="/anime/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).text().trim();
      if (title && href) {
        // Éviter les doublons VF/VOSTFR ici (on gère ça plus tard)
        if (results.some(r => r.url === href)) return;
        const score = scoreSearchResult(title, href, query, season);
        results.push({ title, url: href, score });
      }
    });

    // Fallback: chercher les liens /anime/ dans tout le HTML
    if (results.length === 0) {
      const animeRegex = /<a[^>]+href="([^"]*\/anime\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let m;
      while ((m = animeRegex.exec(html)) !== null) {
        const href = m[1].startsWith('http') ? m[1] : `https://voir-anime.to${m[1]}`;
        const title = m[2].trim();
        if (title && href && !results.some(r => r.url === href)) {
          const score = scoreSearchResult(title, href, query, season);
          results.push({ title, url: href, score });
        }
      }
    }

    // Trier par score et prendre les meilleurs résultats
    results.sort((a, b) => b.score - a.score);
    const best = results.filter(r => r.score >= 30).slice(0, 4);

    console.log(`[VoirAnime] WordPress search for "${query}": ${best.length} results (from ${results.length} total)`);
    return best.map(r => ({ title: r.title, url: r.url }));
  } catch (e) {
    console.warn(`[VoirAnime] WordPress search failed: ${e?.message}`);
    return [];
  }
}

/**
 * Search for anime on VoirAnime
 * Priority: 1) Season-specific slug probing, 2) Generic slug, 3) WordPress search
 */
async function searchAnime(title, season = 1, year) {
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
    const validSeasonUrls = await batchProbe(seasonUrls, 2, 300);

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
      const validCleanUrls = await batchProbe(cleanUrls, 2, 300);

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
        for (const v of [...new Set(compactVariants)]) {
          if (v !== baseSlug && v.length > 5) {
            altSlugs.push(v)
            altSlugs.push(v + '-vf')
          }
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
      const validAltUrls = await batchProbe(altUrls, 2, 200)
      
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
    const searchResults = await wordpressSearch(title, season);
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
        uniqueQueries.map(q => wordpressSearch(q, season))
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

async function generateEpisodeUrl(html, targetEp, startTime) {
  const $ = cheerio.load(html);
  const firstLink = $('.wp-manga-chapter a').first();
  if (!firstLink.length) return null;

  const href = firstLink.attr('href') || '';
  const match = href.match(/\/anime\/([^/]+)\/(.+?-)(\d+)(-v(?:ostfr|f))?\//);
  if (!match) return null;

  const slugName = match[1];
  const prefix = match[2];
  const suffix = match[4] || '';

  // Paddings testés en parallèle
  const paddings = ['0', ''];
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

const MAX_DIRECT_STREAMS = 4;

/**
 * Résout les streams d'un épisode en 3 phases :
 *   1. Collecte parallèle des embeds de tous les lecteurs
 *   2. Filtrage des placeholders anti-bot + tri (résolvables d'abord)
 *   3. Résolution séquentielle avec early-exit dès MAX_DIRECT_STREAMS directs
 *
 * Les embeds non résolus (SPA/gates) ne sont retournés qu'en DERNIER recours
 * si aucun stream direct n'a pu être obtenu.
 */
async function resolveEpisodeStreams(episodeUrl, lang, streamHeaders, startTime) {
  try {
    const epRawHtml = await fetchWithRetry(() => fetchText(episodeUrl, { timeout: PAGE_TIMEOUT }), { retries: 1 });
    const allHosts = extractHosts(epRawHtml);

    if (allHosts.length === 0) {
      // Page sans aucun lecteur = réponse dégradée anti-bot du site (ou épisode
      // pas encore disponible). On log pour faciliter le diagnostic.
      console.log(`[VoirAnime] No player options on episode page (anti-bot response or unavailable): ${episodeUrl.slice(0, 70)}`);
    }

    // Les hosts sont déjà filtrés par extractHosts ( commence par "LECTEUR ")
    // On les déduplique et on skip les hosts connus morts
    const deadHosts = ['LECTEUR SB']; // streamhide.to = ParkLogic gate
    const filteredHosts = allHosts.filter(h => !deadHosts.includes(h));

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
    const collected = await Promise.allSettled(
      filteredHosts.map(host => fetchHostEmbed(host, episodeUrl))
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
      if (isBudgetExhausted(startTime, BUDGET_MS)) break;

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

  const titles = await getTmdbTitles(tmdbId, mediaType, { season });
  if (titles.length === 0) return [];

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
  const startTime = Date.now();

  // Vider le cache de slug probing pour une nouvelle exécution
  slugProbeCache.clear();

  // ArmSync: resolve absolute episode (VoirAnime replaces, not pushes)
  const resolvedEps = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: BUDGET_MS });
  let targetEpisodes = resolvedEps;
  if (resolvedEps.length > 1) {
    targetEpisodes = [resolvedEps[1]]; // Replace with absolute only
  }

  // Search cache
  const cacheKey = `${tmdbId}-${effectiveSeason}`;
  let matches = [];
  if (SEARCH_CACHE.has(cacheKey) && Date.now() - SEARCH_CACHE.get(cacheKey).ts < SEARCH_CACHE_TTL) {
    matches = SEARCH_CACHE.get(cacheKey).matches || [];
    console.log(`[VoirAnime] Search cache hit for ${cacheKey}`);
  } else {
    const searchTitles = titles.slice(0, 15);
    const baseTitles = searchTitles.filter(t => !/\bS(?:eason|aison)?\s*\d/i.test(t));
    const seasonTitles = searchTitles.filter(t => /\bS(?:eason|aison)?\s*\d/i.test(t));

    // --- OPTIMISATION : Prober tous les slugs en parallèle ---
    // Avant de faire la boucle linéaire (qui peut prendre 15s par titre
    // avec WordPress search), on probe TOUS les slugs de TOUS les titres
    // simultanément. Si l'un d'eux match, on évite WordPress complètement.
    const allTitles = [...baseTitles, ...seasonTitles];
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

      // Construire les URLs (VOSTFR + VF) pour tous les slugs
      const allUrls = uniqueSlugs.flatMap(slug => [
        `${BASE_URL}/anime/${slug}/`,
        `${BASE_URL}/anime/${slug}-vf/`,
      ]);

      console.log(`[VoirAnime] Parallel probe: ${uniqueSlugs.length} unique slugs`);
      const validUrls = await batchProbe(allUrls, 5, 0);

      if (validUrls.length > 0) {
        // Associer les URLs valides aux titres correspondants
        for (const url of validUrls) {
          const urlSlug = url.match(/\/anime\/([^/]+)\/$/)?.[1]?.replace(/-vf$/, '');
          const matchingTitle = allTitles.find(t => toSlug(t) === urlSlug);
          const detectedLang = url.includes('-vf') ? 'VF' : 'VOSTFR';
          // Convention : VOSTFR n'a pas de suffixe dans le titre (compatible
          // avec la détection de langue plus bas qui utilise includes("VF"))
          const baseName = matchingTitle || `[slug:${urlSlug}]`;
          matches.push({
            title: detectedLang === 'VF' ? `${baseName} VF` : baseName,
            url,
          });
        }
        console.log(`[VoirAnime] Parallel probe found ${matches.length} match(es): ${validUrls.join(', ')}`);
      }
    }

    // Fallback: boucle linéaire avec WordPress search si le probe parallèle n'a rien trouvé
    if (matches.length === 0) {
      for (const title of allTitles) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        const result = await searchAnime(title, effectiveSeason, titles._metadata?.year);
        if (result && result.length > 0) {
          matches = result;
          break;
        }
      }
    }

    if (matches.length > 0) {
      SEARCH_CACHE.set(cacheKey, { ts: Date.now(), matches });
    }
  }

  if (matches.length === 0) return [];

  const streams = [];
  const checkedUrls = new Set();
  const streamHeaders = { Referer: BASE_URL, Origin: BASE_URL, "User-Agent": USER_AGENT };

  for (const match of matches) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) break;
    if (checkedUrls.has(match.url)) continue;
    checkedUrls.add(match.url);

    const lang = match.title.toUpperCase().includes("VF") || match.url.includes("-vf") ? "VF" : "VOSTFR";

    try {
      const html = await fetchText(match.url, { timeout: 6000 });
      if (!html) continue;
      const $ = cheerio.load(html);

      const paddings = ["0", ""];
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
        const chapterLinks = [];
        $(".wp-manga-chapter a, ul.main.version-chap.no-volumn li.wp-manga-chapter a").each((i, el) => {
          const href = $(el).attr("href") || '';
          const text = $(el).text().trim();
          if (href && !href.includes('/special') && !href.includes('/oav') && !href.includes('/film') && !href.includes('/ova')) {
            const linkSeason = extractSeasonFromEpisodeLink(text, href);
            if (linkSeason === null || linkSeason === effectiveSeason) {
              chapterLinks.push({ href, text });
            }
          }
        });
        for (const ep of targetEpisodes) {
          for (const link of chapterLinks) {
            const epFromHref = link.href.match(/[-/]0*(\d+)(?:-v(?:ostfr|f))?(?:\/|$)/i);
            if (epFromHref && parseInt(epFromHref[1], 10) === ep) {
              episodeUrl = link.href;
              break;
            }
          }
          if (episodeUrl) break;
        }
        if (!episodeUrl && chapterLinks.length > 0) {
          const hrefs = chapterLinks.map(l => l.href);
          for (const ep of targetEpisodes) {
            const idx = ep - 1;
            if (idx >= 0 && idx < hrefs.length) {
              episodeUrl = hrefs[idx];
              break;
            }
          }
        }
      }

      if (!episodeUrl && targetEpisodes.length > 0) {
        for (const ep of targetEpisodes) {
          if (isBudgetExhausted(startTime, BUDGET_MS)) break;
          const genUrl = await generateEpisodeUrl(html, ep, startTime);
          if (genUrl) {
            episodeUrl = genUrl;
            break;
          }
        }
      }

      // For movies, the player is on the main page itself — use match URL as fallback
      if (!episodeUrl && mediaType === 'movie') {
        episodeUrl = match.url;
        console.log(`[VoirAnime] Movie fallback: using match URL as episode URL`);
      }

      if (!episodeUrl) continue;

      const epStreams = await resolveEpisodeStreams(episodeUrl, lang, streamHeaders, startTime);
      streams.push(...epStreams);

    } catch (e) { console.warn(`[VoirAnime] Match processing failed: ${e?.message}`); }
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

  // Prefer direct streams. If none found, include embed URLs as fallback
  // so the native player can attempt playback (ExoPlayer/AVPlayer handle some embeds).
  const validStreams = directStreams.length > 0 ? directStreams : embedStreams;
  if (directStreams.length === 0 && embedStreams.length > 0) {
    console.log(`[VoirAnime] No direct streams, using ${embedStreams.length} embed URL(s) as fallback`);
  }
  console.log(`[VoirAnime] Total streams: ${validStreams.length} (${directStreams.length} direct, ${embedStreams.length} embed)`);

  return sortStreamsByLanguage(validStreams);
}
