/**
 * Extractor for VoiranimeBE (voiranime.be)
 *
 * Site WordPress (thème dramastream), diagnostic live 2026-09 :
 *   - AUCUN challenge Cloudflare (IP datacenter OK) ;
 *   - quasi 100 % VOSTFR (5 698 pages VOSTFR vs 11 VF) → on expose VOSTFR
 *     uniquement (un faux label VF serait pire que son absence) ;
 *   - le contenu ultra-frais (simulcast) est la valeur ajoutée : One Piece
 *     ép. 1178, Bleach TYBW, Mushoku S3, Dandadan, Frieren…
 *
 * Chaîne :
 *   1. Sitemap index → post-sitemap*.xml = inventaire COMPLET des pages
 *      épisodes (source de vérité, ~787 KB, sous la limite QuickJS 1 MB) ;
 *   2. Chaque URL suit {base}[-episode-]{N}-{lang}[-k] ;
 *   3. Le piège : la FICHE (search WP /series/{slug}/) et la BASE des
 *      épisodes diffèrent souvent pour les saisons 2+ :
 *        fiche  mushoku-tensei-jobless-reincarnation-season-3
 *        base   mushoku-tensei-3
 *      → dérivation de variantes de base (marker -season-N/-saison-N/-sN/-N
 *      → formes -N, -sN, sans marker) testées contre l'inventaire ;
 *   4. Recherche WP ?s= (MONO-mot : les requêtes multi-mots renvoient 0)
 *      pour trouver la fiche et lever l'ambiguïté de saison ;
 *   5. Page épisode → 1 iframe (voembed = famille vidzy, vidmoly…) →
 *      résolveurs existants.
 */

import { fetchText, setCurrentSignal } from './http.js';
import { resolveStream, isAborted, isBudgetExhausted, normalizeLanguageCode } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { createCache } from '../utils/cache.js';

const withCache = createCache('vbe', 'VoiranimeBE');

const SITE = 'https://voiranime.be';
const BUDGET_MS = 45000;

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

/** Extrait le marqueur de saison terminal d'un slug : {marker, num, bare} (null si S1). */
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
 *   → mushoku-tensei-3 (forme « nue » utilisée par les URLs d'épisodes)
 *     mushoku-tensei-jobless-reincarnation-s3
 *     mushoku-tensei-jobless-reincarnation (S1, rejetée pour une demande S3)
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
        if (mk.num === season) push(stem); // demande S2+ : le stem sans marker est une autre saison → dernier recours
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

// ─── 1. Sitemap : inventaire des épisodes ──────────────────────────────────

/**
 * Parse les URLs d'épisodes d'un post-sitemap.
 * Retourne [{ base, num, lang, url }] — base sans numéro d'épisode ni langue.
 */
export function parseEpisodeUrls(xml) {
    const out = [];
    if (!xml || typeof xml !== 'string') return out;
    // NB : le sitemap liste les URLs en http:// (redirigées en https) — accepter
    // les deux ; le path garde son slash final.
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
 * Inventaire complet : Map base → Map num → URL (première vue = canonique).
 * Cache 5 min ; 6 sitemaps ~130 KB chacun (sous la limite 1 MB).
 */
async function fetchInventory(signal) {
    return withCache('inv', async () => {
        const map = new Map();
        // Nombre de post-sitemaps depuis l'index (fallback : 6)
        let count = 6;
        try {
            const idx = await fetchText(SITEMAP_INDEX, { signal, timeout: 15000 });
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
                const xml = await fetchText(SITEMAP_POST(i === 1 ? '' : String(i)), { signal, timeout: 15000 });
                for (const inv of parseEpisodeUrls(xml)) {
                    if (!map.has(inv.base)) map.set(inv.base, new Map());
                    const byNum = map.get(inv.base);
                    if (!byNum.has(inv.num)) byNum.set(inv.num, inv.url);
                }
            } catch (e) {
                if (isAborted(signal)) throw e;
                // sitemap manquant : continuer
            }
        }
        return map;
    }, { successTtl: 300000, failureTtl: 60000 });
}

// ─── 2. Recherche WP (fiche → slug de série) ───────────────────────────────

/**
 * Search WordPress ?s= → slugs de fiches /series/{slug}/.
 * ⚠ Capricieuse : les requêtes multi-mots renvoient 0 → le caller envoie un
 * seul mot significatif. 0/échec = silencieux (fallback sonde de slug).
 */
async function searchSeriesSlugs(word, signal) {
    return withCache(`search_${word}`, async () => {
        try {
            const html = await fetchText(`${SITE}/?s=${encodeURIComponent(word)}`, { signal, timeout: 15000 });
            if (!html) return [];
            const out = [];
            const re = /href="https?:\/\/voiranime\.be\/series\/([^/"]+)\//g;
            let m;
            while ((m = re.exec(html)) !== null) {
                if (!out.includes(m[1])) out.push(m[1]);
            }
            return out.slice(0, 10);
        } catch (e) {
            if (isAborted(signal)) throw e;
            return [];
        }
    }, { successTtl: 120000, failureTtl: 30000 });
}

// ─── 3. Extraction du lecteur d'une page épisode ───────────────────────────

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

async function resolveEpisodePage(url, baseStream, signal) {
    try {
        const html = await fetchText(url, { signal, timeout: 15000 });
        const embed = extractEmbedUrl(html);
        if (!embed) return null;
        if (isAborted(signal)) return null;
        const resolved = await resolveStream({ ...baseStream, url: embed }, 0);
        if (!resolved || !resolved.url || resolved.isDirect === false) return null;
        if (resolved.url.includes('[object')) return null;
        return resolved;
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}

// ─── Pipeline principal ────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);
    const startTime = Date.now();

    if (mediaType === 'movie') return []; // catalogue 100 % séries/animes

    const epNum = Math.max(1, parseInt(episode, 10) || 1);
    // season=null (IDs anime absolus côté TV) → S1 : la garde de saison ci-
    // dessous évite les faux épisodes quand la base pointe une autre saison.
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);

    const titles = await getTmdbTitles(tmdbId, 'tv', { season: seasonNum });
    if (!titles || titles.length === 0) return [];

    // 1. Inventaire sitemap
    const inventory = await fetchInventory(signal);
    if (!inventory.size || isAborted(signal)) return [];

    // 2. Slug cible : titre PRIMAIRE TMDB (_metadata.name) — titles[0] peut
    //    être un titre alternatif mal trié (bug observé : "Tuned Tone").
    const primary = String((titles._metadata && titles._metadata.name) || titles[0] || '');
    const querySlug = normSlug(primary.split(' (')[0]);
    if (!querySlug) return [];

    // 3. Fiche via search WP (MONO-mot : 1er token significatif du titre)
    //    → désambiguisation de saison (S1 = fiche sans marker, SN = marker N).
    let ficheSlug = null;
    const searchWord = querySlug.split('-').find((w) => w.length >= 4) || querySlug;
    if (!isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const fiches = await searchSeriesSlugs(searchWord, signal);
        let bestScore = 0;
        for (const f of fiches) {
            const sc = matchScore(f, querySlug);
            // bonus affinité de saison : fiche avec marker == seasonNum, ou
            // sans marker pour S1
            let adj = sc;
            const mk = seasonMarker(f);
            if (mk) adj += mk.num === seasonNum ? 25 : -20;
            else if (seasonNum !== 1) adj -= 5;
            if (adj > bestScore) { bestScore = adj; ficheSlug = f; }
        }
    }

    // 4. Bases candidates : variantes de la fiche (si trouvée) PUIS du slug
    //    TMDB — testées contre l'inventaire dans l'ordre.
    const baseOrder = [];
    const pushBase = (b) => { if (b && !baseOrder.includes(b)) baseOrder.push(b); };
    for (const src of [ficheSlug, querySlug]) {
        if (!src) continue;
        for (const v of baseVariants(src, seasonNum)) pushBase(v);
    }

    // 5. URL de l'épisode : inventaire d'abord (exact), sonde ensuite (fraîcheur)
    const baseStream = {
        name: 'VoiranimeBE',
        language: normalizeLanguageCode('VOSTFR') || 'ja',
        quality: 'HD',
    };

    for (const base of baseOrder) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        // 5a. Inventaire : URL exacte connue
        const byNum = inventory.get(base);
        let url = byNum ? byNum.get(epNum) : null;
        // 5b. Sonde (épisodes plus frais que le sitemap, cache 5 min)
        const probes = url ? [url] : episodeUrlCandidates(base, epNum, 'vostfr');
        for (const u of probes) {
            const resolved = await resolveEpisodePage(u, baseStream, signal);
            if (resolved) {
                delete resolved.isDirect;
                delete resolved.originalUrl;
                resolved.title = `${primary} S${seasonNum}E${epNum} [VOSTFR]`;
                return [resolved];
            }
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        }
    }

    return [];
}
