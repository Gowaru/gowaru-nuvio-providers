/**
 * Extractor for VoiranimeBE (voiranime.be)
 *
 * Site WordPress (thème dramastream), diagnostic live 2026-10 :
 *   - AUCUN challenge Cloudflare (IP datacenter OK) ;
 *   - sitemap_index.xml → post-sitemap*.xml = inventaire COMPLET (~5969 URLs
 *     servies en https) : épisodes {base}[-episode-]{N}-{lang} (N zero-padé
 *     accepté) + une quarantaine de pages film-/oav- ; 12 pages VF seulement
 *     (0,2 %) → VOSTFR d'abord, VF en repli, label selon la page servie ;
 *   - 404 déguisée : URL inconnue → 301 → homepage HTTP 200 → on compare
 *     l'URL finale à la homepage et on abandonne vite (série absente) ;
 *   - recherche WP ?s= multi-mots fonctionnelle et discriminante ; la page
 *     sans résultat ne contient AUCUN <article> (les liens /series/ de la
 *     sidebar sont donc ignorés en ne parsant que les <article>) ;
 *   - le piège des saisons 2+ : la FICHE (…-season-N) et la BASE des épisodes
 *     (nue …-N) diffèrent — ex. fiche
 *     mushoku-tensei-jobless-reincarnation-season-3 vs base mushoku-tensei-3
 *     → variantes de base + balayage d'inventaire à stem tronqué ;
 *   - garde anti faux positif : un slug de fiche n'est retenu que sur score
 *     de titre STRICTEMENT positif (un bonus de saison seul ne suffit plus) ;
 *   - pages épisodes/films → 1 iframe (vidmoly.biz vivant, m3u8 en clair) →
 *     résolveurs existants, timeout borné par embed.
 */

import { fetchText, fetchPage, isHomepageUrl, setCurrentSignal } from './http.js';
import { resolveStream, isAborted, isBudgetExhausted, normalizeLanguageCode, withTimeout } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { createCache } from '../utils/cache.js';

const withCache = createCache('vbe', 'VoiranimeBE');

const SITE = 'https://voiranime.be';
const BUDGET_MS = 45000;
const SITEMAP_TIMEOUT = 15000;
const SEARCH_TIMEOUT = 15000;
const EPISODE_FETCH_TIMEOUT = 12000;
const EMBED_RESOLVE_TIMEOUT = 20000;
const LANGS = ['vostfr', 'vf'];
// Série absente (pas de fiche) : au-delà de N redirects homepage consécutifs,
// on abandonne au lieu de sonder ~20 URLs dans le vide.
const HOMEPAGE_ABANDON_STREAK = 3;
// Seuil final de sélection de fiche : un score nul + bonus de saison (+25)
// ne doit JAMAIS sélectionner (faux positifs Arcane/1899 → Black Clover).
const FICHE_MIN_SCORE = 40;

const SITEMAP_INDEX = `${SITE}/sitemap_index.xml`;
const SITEMAP_POST = (i) => `${SITE}/post-sitemap${i || ''}.xml`;

// ─── Normalisation / matching de slugs ─────────────────────────────────────

function normSlug(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, 'and')
        .replace(/[’'`]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function slugTokens(s) {
    return String(s || '').split('-').filter((w) => w.length >= 3);
}

/** Préfixe ordonné : tous les tokens de `a` apparaissent dans `b` DANS L'ORDRE. */
export function isOrderedPrefix(a, b) {
    const at = slugTokens(a);
    if (!at.length) return false;
    const bt = slugTokens(b);
    let i = 0;
    for (const w of bt) {
        if (w === at[i]) i++;
        if (i >= at.length) return true;
    }
    return i >= at.length;
}

/** Score de requête : préfixe ordonné obligatoire, bonus couverture, affinité de saison. */
export function matchScore(seriesSlug, querySlug) {
    if (!querySlug) return 0;
    const exact = seriesSlug === querySlug;
    const prefix = isOrderedPrefix(querySlug, seriesSlug);
    if (!exact && !prefix) return 0;
    const qt = slugTokens(querySlug);
    const st = new Set(slugTokens(seriesSlug));
    let covered = 0;
    for (const w of qt) if (st.has(w)) covered++;
    let score = (exact ? 100 : 60) + Math.round((covered / Math.max(1, qt.length)) * 40);
    const qm = querySlug.match(/-(?:saison|season)-(\d+)$/);
    if (qm) {
        const sm = seriesSlug.match(/-(?:saison|season)-(\d+)$/);
        if (sm) score += sm[1] === qm[1] ? 30 : -25;
    }
    return score;
}

/** Extrait le marqueur de saison terminal d'un slug : {marker, num} (null si S1). */
function seasonMarker(slug) {
    let m = /-(saison|season)-(\d{1,2})$/.exec(slug);
    if (m) return { marker: m[0], num: parseInt(m[2], 10) };
    m = /-s(\d{1,2})$/.exec(slug);
    if (m && !/-(?:saison|season)$/.test(slug.slice(0, m.index))) return { marker: m[0], num: parseInt(m[1], 10) };
    return null;
}

/**
 * Variantes de base d'épisodes dérivées d'un slug de fiche.
 * Ex : mushoku-tensei-jobless-reincarnation-season-3 (S3)
 *   → mushoku-tensei-jobless-reincarnation-3
 *     mushoku-tensei-jobless-reincarnation-s3 / -saison-3 / -season-3
 * (le stem tronqué mushoku-tensei-3 est trouvé par balayage d'inventaire).
 */
function baseVariants(slug, season) {
    const out = [];
    const push = (s) => { if (s && !out.includes(s)) out.push(s); };
    const mk = seasonMarker(slug);
    if (mk) {
        const stem = slug.slice(0, slug.length - mk.marker.length);
        push(`${stem}-${mk.num}`);
        push(`${stem}-s${mk.num}`);
        push(`${stem}-saison-${mk.num}`);
        push(`${stem}-season-${mk.num}`);
        if (mk.num === season) push(stem); // même saison : le stem nu en dernier recours
    } else {
        push(slug);
        // slug sans marker mais demande SN : formes marquées
        push(`${slug}-${season}`);
        push(`${slug}-s${season}`);
        push(`${slug}-saison-${season}`);
        push(`${slug}-season-${season}`);
        if (season === 1) { /* le slug nu EST la bonne base pour S1 */ }
    }
    return out;
}

// ─── 1. Sitemap : inventaire des épisodes + films ───────────────────────────

/**
 * Parse les URLs d'épisodes d'un post-sitemap.
 * Retourne [{ base, num, lang, url }] — base sans numéro d'épisode ni langue.
 * Motifs observés : {base}-episode-{N}-{lang}, {base}-{N}-{lang},
 * {base}-{01}-{lang} (zero-padé), suffixe -2 en cas de doublon de slug.
 */
export function parseEpisodeUrls(xml) {
    const out = [];
    if (!xml || typeof xml !== 'string') return out;
    const re = /<loc>(https?:\/\/voiranime\.be\/([^<]+))<\/loc>/g;
    const epRe = /^(.+?)(?:-episode-|-)(\d{1,4})-(vf|vostfr)(?:-\d+)?\/?$/;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const em = epRe.exec(m[2]);
        if (em) out.push({ base: em[1], num: parseInt(em[2], 10), lang: em[3], url: m[1] });
    }
    return out;
}

/**
 * Normalise le path d'une page film/OAV : { base, lang } ou null.
 * Formes observées : film-vostfr-{slug}, oav-vostfr-{slug} (+ tiret parfois
 * absent : film-vostfrbleach-…), {slug}-film-vostfr, {slug}-oav01-vostfr,
 * {slug}-vf (ex. kimetsu-no-yaiba-mugenjou-hen-movie-1-akaza-sairai-vf).
 */
export function parseFilmPath(path) {
    let p = String(path || '').replace(/\/$/, '');
    if (!p) return null;
    let lang = null;
    const lm = /-(vf|vostfr)$/.exec(p);
    if (lm) { lang = lm[1]; p = p.slice(0, lm.index); }
    if (!p) return null;
    const pre = /^(film|oav)-(vf|vostfr)-?(.*)$/.exec(p);
    if (pre) {
        if (!pre[3]) return null;
        return { base: pre[3], lang: lang || pre[2] };
    }
    const suf = /^(.*)-(film|oav)\d*$/.exec(p);
    if (suf && suf[1]) return { base: suf[1], lang: lang || 'vostfr' };
    if (lang) return { base: p, lang };
    return null;
}

/** Vrai si ce path de sitemap est une page épisode (à exclure des films). */
function isEpisodePath(path) {
    return /^(.+?)(?:-episode-|-)(\d{1,4})-(vf|vostfr)(?:-\d+)?\/?$/.test(path);
}

/**
 * Parse les URLs de films/OAV d'un post-sitemap.
 * Retourne [{ base, lang, url }].
 */
export function parseFilmUrls(xml) {
    const out = [];
    if (!xml || typeof xml !== 'string') return out;
    const re = /<loc>(https?:\/\/voiranime\.be\/([^<]+))<\/loc>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        if (isEpisodePath(m[2])) continue;
        const film = parseFilmPath(m[2]);
        if (film) out.push({ base: film.base, lang: film.lang, url: m[1] });
    }
    return out;
}

/**
 * Inventaire complet : { episodes, films }.
 * episodes : Map base → Map num → { vostfr, vf } (les deux langues conservées,
 *   la VF sert de repli) ; films : [{ base, lang, url }].
 * Cache 5 min ; 6 sitemaps ~130 KB chacun (sous la limite 1 MB).
 */
async function fetchInventory(signal) {
    return withCache('inv2', async () => {
        const episodes = new Map();
        const films = [];
        // Nombre de post-sitemaps depuis l'index (fallback : 6)
        let count = 6;
        try {
            const idx = await fetchText(SITEMAP_INDEX, { signal, timeout: SITEMAP_TIMEOUT });
            const locs = (idx.match(/<loc>[^<]+<\/loc>/g) || [])
                .map((l) => l.replace(/<\/?loc>/g, ''))
                .filter((u) => /post-sitemap\d*\.xml$/.test(u));
            if (locs.length > 0) count = locs.length;
        } catch (e) {
            if (isAborted(signal)) throw e;
        }
        for (let i = 1; i <= count; i++) {
            if (isAborted(signal)) break;
            try {
                const xml = await fetchText(SITEMAP_POST(i === 1 ? '' : String(i)), { signal, timeout: SITEMAP_TIMEOUT });
                for (const inv of parseEpisodeUrls(xml)) {
                    if (!episodes.has(inv.base)) episodes.set(inv.base, new Map());
                    const byNum = episodes.get(inv.base);
                    if (!byNum.has(inv.num)) byNum.set(inv.num, {});
                    const slot = byNum.get(inv.num);
                    if (!slot[inv.lang]) slot[inv.lang] = inv.url;
                }
                for (const f of parseFilmUrls(xml)) {
                    if (!films.some((e) => e.url === f.url)) films.push(f);
                }
            } catch (e) {
                if (isAborted(signal)) throw e;
                // sitemap manquant : continuer
            }
        }
        return { episodes, films };
    }, { successTtl: 300000, failureTtl: 60000 });
}

/**
 * Balayage d'inventaire : bases au stem tronqué (fiche longue vs base nue).
 * Ex. S3 : fiche mushoku-tensei-jobless-reincarnation-season-3, base
 * mushoku-tensei-3 — aucune variante dérivée de la fiche ne la trouve.
 * Retient les bases se terminant par -N/-sN/-saison-N/-season-N (N = saison
 * demandée) dont le stem est entièrement contenu dans le titre TMDB
 * (stem exact, ou ≥2 tokens dans l'ordre pour les stems tronqués).
 */
export function inventorySeasonBases(episodes, querySlug, seasonNum) {
    const out = [];
    if (!episodes || !querySlug) return out;
    for (const base of episodes.keys()) {
        const m = /^(.*)-(?:saison|season)-(\d{1,2})$/.exec(base)
            || /^(.*)-s(\d{1,2})$/.exec(base)
            || /^(.*)-(\d{1,4})$/.exec(base);
        if (!m) continue;
        const stem = m[1];
        if (parseInt(m[2], 10) !== seasonNum) continue;
        if (!stem || stem.length < 3) continue;
        if (stem === querySlug) { out.push(base); continue; }
        if (slugTokens(stem).length >= 2 && isOrderedPrefix(stem, querySlug)) out.push(base);
    }
    return out;
}

// ─── 2. Recherche WP (fiche → slug de série) ───────────────────────────────

/**
 * Blocs <article> d'une page de recherche. La page SANS résultat du thème
 * n'en contient AUCUN (seule la sidebar — hors articles — liste des
 * /series/ génériques) → [] honnête au lieu de faux positifs.
 */
function extractArticles(html) {
    const m = String(html || '').match(/<article[\s\S]*?<\/article>/gi);
    return m || [];
}

/**
 * Search WordPress ?s= (multi-mots fonctionnelle et discriminante) → slugs
 * de fiches /series/{slug}/ lus UNIQUEMENT dans les <article> de résultats.
 * Tente le titre complet puis un mot significatif en repli.
 */
async function searchSeriesSlugs(queries, signal) {
    const list = Array.isArray(queries) ? queries : [queries];
    for (const q of list) {
        if (!q) continue;
        const key = `search_${q}`;
        const slugs = await withCache(key, async () => {
            try {
                const html = await fetchText(`${SITE}/?s=${encodeURIComponent(q)}`, { signal, timeout: SEARCH_TIMEOUT });
                if (!html) return [];
                const articles = extractArticles(html);
                if (!articles.length) return []; // page sans résultat : sidebar ignorée
                const out = [];
                for (const a of articles) {
                    const re = /href="https?:\/\/voiranime\.be\/series\/([^/"]+)\//g;
                    let m;
                    while ((m = re.exec(a)) !== null) {
                        if (!out.includes(m[1])) out.push(m[1]);
                    }
                    if (out.length >= 10) break;
                }
                return out.slice(0, 10);
            } catch (e) {
                if (isAborted(signal)) throw e;
                return [];
            }
        }, { successTtl: 120000, failureTtl: 30000 });
        if (slugs && slugs.length) return slugs;
    }
    return [];
}

/**
 * Sélection de la fiche : le score de titre doit être STRICTEMENT positif
 * AVANT le bonus de saison, et le score final dépasser FICHE_MIN_SCORE.
 * Sans cela, une page sans résultat (score 0 + bonus +25) sélectionnait une
 * fiche au hasard (Arcane/1899 S2 → Black Clover).
 */
function pickFiche(fiches, querySlug, seasonNum) {
    let ficheSlug = null;
    let bestScore = FICHE_MIN_SCORE;
    for (const f of fiches) {
        const sc = matchScore(f, querySlug);
        if (sc <= 0) continue; // aucun recouvrement de titre → jamais de bonus
        let adj = sc;
        const mk = seasonMarker(f);
        if (mk) adj += mk.num === seasonNum ? 25 : -20;
        else if (seasonNum !== 1) adj -= 5;
        if (adj > bestScore) { bestScore = adj; ficheSlug = f; }
    }
    return ficheSlug;
}

// ─── 3. Extraction du lecteur d'une page épisode / film ────────────────────

function extractEmbedUrl(html) {
    if (!html) return null;
    let m = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
    if (m && m[1]) return m[1];
    m = /<iframe[^>]*data-litespeed-src="(https?:\/\/[^"]+)"/i.exec(html);
    if (m && m[1]) return m[1];
    m = /["'](https?:\/\/[^"']*(?:embed|player)[^"']*)["']/i.exec(html);
    return m ? m[1] : null;
}

/** Variantes de slug épisode à sonder quand l'épisode manque à l'inventaire. */
export function episodeUrlCandidates(base, num, lang) {
    const l = lang === 'vf' ? 'vf' : 'vostfr';
    const n = String(num);
    const nn = num < 10 ? `0${num}` : String(num);
    return [
        `${SITE}/${base}-episode-${n}-${l}/`,
        `${SITE}/${base}-${n}-${l}/`,
        `${SITE}/${base}-episode-${nn}-${l}/`,
        `${SITE}/${base}-${nn}-${l}/`,
    ];
}

/**
 * Résout une page épisode/film : garde 404-déguisée (URL finale == homepage
 * → 'homepage'), timeouts bornés par étape pour ne pas pendre le budget
 * sur un seul embed (vidmoly parfois lent).
 */
async function resolveEpisodePage(url, baseStream, signal, startTime) {
    try {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return { status: 'budget' };
        const { html, finalUrl } = await fetchPage(url, { signal, timeout: EPISODE_FETCH_TIMEOUT });
        if (!html) return { status: 'miss' };
        if (isHomepageUrl(finalUrl || url)) return { status: 'homepage' };
        const embed = extractEmbedUrl(html);
        if (!embed) return { status: 'miss' };
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return { status: 'budget' };
        const resolved = await withTimeout(
            resolveStream({ ...baseStream, url: embed }, 0),
            EMBED_RESOLVE_TIMEOUT,
            'voiranime-be embed',
        );
        if (!resolved || !resolved.url || resolved.isDirect === false) return { status: 'miss' };
        if (resolved.url.includes('[object')) return { status: 'miss' };
        return { status: 'ok', resolved };
    } catch (e) {
        if (isAborted(signal)) throw e;
        return { status: 'miss' };
    }
}

function langLabel(lang) {
    return lang === 'vf' ? 'VF' : 'VOSTFR';
}

// ─── Pipeline principal ────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);
    const startTime = Date.now();

    // 1. Inventaire sitemap (épisodes + films)
    const inventory = await fetchInventory(signal);
    if ((!inventory.episodes.size && !inventory.films.length) || isAborted(signal)) return [];

    if (mediaType === 'movie') {
        return extractMovie(tmdbId, inventory, signal, startTime);
    }

    const epNum = Math.max(1, parseInt(episode, 10) || 1);
    // season=null (IDs anime absolus côté TV) → S1
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);

    const titles = await getTmdbTitles(tmdbId, 'tv', { season: seasonNum });
    if (!titles || titles.length === 0) return [];

    // 2. Slug cible : titre PRIMAIRE TMDB (_metadata.name) — titles[0] peut
    //    être un titre alternatif mal trié (bug observé : "Tuned Tone").
    const primary = String((titles._metadata && titles._metadata.name) || titles[0] || '');
    const querySlug = normSlug(primary.split(' (')[0]);
    if (!querySlug) return [];

    // 3. Fiche via search WP (titre complet multi-mots, mot seul en repli) —
    //    parsing limité aux <article> : la page sans résultat n'en a aucun.
    let ficheSlug = null;
    if (!isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const fullQuery = primary.split(' (')[0].replace(/[–—]/g, ' ').replace(/[''`]/g, "'").replace(/[()[\]{}:;,!?]/g, ' ').replace(/\s+/g, ' ').trim();
        const fallbackWord = querySlug.split('-').find((w) => w.length >= 4) || querySlug;
        const queries = [];
        for (const q of [fullQuery, fallbackWord]) {
            if (q && !queries.some((e) => e.toLowerCase() === q.toLowerCase())) queries.push(q);
        }
        const fiches = await searchSeriesSlugs(queries, signal);
        ficheSlug = pickFiche(fiches, querySlug, seasonNum);
    }

    // 4. Bases candidates : variantes de la fiche (si trouvée), stems
    //    tronqués de l'inventaire (saisons 2+ à base nue), PUIS slug TMDB.
    const baseOrder = [];
    const pushBase = (b) => { if (b && !baseOrder.includes(b)) baseOrder.push(b); };
    if (ficheSlug) {
        for (const v of baseVariants(ficheSlug, seasonNum)) pushBase(v);
    }
    for (const b of inventorySeasonBases(inventory.episodes, querySlug, seasonNum)) pushBase(b);
    for (const v of baseVariants(querySlug, seasonNum)) pushBase(v);

    // 5. URL de l'épisode : inventaire d'abord (exact, par langue), sonde
    //    ensuite (épisodes plus frais que le sitemap). VOSTFR puis VF.
    let homepageStreak = 0;
    for (const base of baseOrder) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        const byNum = inventory.episodes.get(base);
        const known = byNum ? byNum.get(epNum) : null;
        for (const lang of LANGS) {
            const urls = (known && known[lang]) ? [known[lang]] : episodeUrlCandidates(base, epNum, lang);
            for (const u of urls) {
                const r = await resolveEpisodePage(u, {
                    name: 'VoiranimeBE',
                    language: normalizeLanguageCode(langLabel(lang)) || 'ja',
                    quality: 'HD',
                }, signal, startTime);
                if (r.status === 'ok') {
                    const resolved = r.resolved;
                    // isDirect CONSERVÉ (URLs HLS directes ; le delete cassait
                    // le comptage et risquait le filtrage côté app).
                    delete resolved.originalUrl;
                    resolved.title = `${primary} S${seasonNum}E${epNum} [${langLabel(lang)}]`;
                    return [resolved];
                }
                if (r.status === 'homepage') {
                    // 404 déguisée. Sans fiche, la série est quasi sûrement
                    // absente : abandon rapide au lieu de ~20 fetches.
                    if (!ficheSlug && ++homepageStreak >= HOMEPAGE_ABANDON_STREAK) return [];
                } else if (r.status === 'budget' || isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) {
                    break;
                }
            }
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        }
    }

    return [];
}

/**
 * Chemin film : les pages film-/oav- du sitemap (même extracteur d'iframe).
 * Score exigé ≥ 100 (exact ou préfixe ordonné complet), VOSTFR puis VF,
 * label selon la page servie.
 */
async function extractMovie(tmdbId, inventory, signal, startTime) {
    const titles = await getTmdbTitles(tmdbId, 'movie', {});
    if (!titles || titles.length === 0) return [];
    const primary = String((titles._metadata && titles._metadata.name) || titles[0] || '');
    const querySlug = normSlug(primary.split(' (')[0]);
    if (!querySlug) return [];

    const scored = [];
    for (const f of inventory.films) {
        const sc = matchScore(f.base, querySlug);
        if (sc < 100) continue;
        scored.push({ ...f, sc });
    }
    scored.sort((a, b) => (b.sc - a.sc) || ((a.lang === 'vostfr' ? 0 : 1) - (b.lang === 'vostfr' ? 0 : 1)));

    for (const cand of scored.slice(0, 4)) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        const r = await resolveEpisodePage(cand.url, {
            name: 'VoiranimeBE',
            language: normalizeLanguageCode(langLabel(cand.lang)) || 'ja',
            quality: 'HD',
        }, signal, startTime);
        if (r.status === 'ok') {
            const resolved = r.resolved;
            delete resolved.originalUrl;
            resolved.title = `${primary} [${langLabel(cand.lang)}]`;
            return [resolved];
        }
        if (r.status === 'budget') break;
    }
    return [];
}
