/**
 * Extractor for FullAnime (fullanime.fr) — diag live 2026-11.
 *
 * Site PHP SSR, **VOSTFR uniquement** (aucune page `-vf` sur tout le catalogue) :
 *  - Recherche : /search?s=… → /voir-anime/{slug}-vostfr
 *  - Fiche : /voir-anime/{slug}-vostfr → liens /episode/NN (NN = numéro LOCAL à
 *    la page : les catalogues par arc type `one-piece-saga-N` redémarrent à 1)
 *  - Épisode : page contenant `var links = ["…"]` → 2 à 5 hébergeurs
 *    (vidmoly.to, sibnet, sendvid, oneupload, myvi…)
 *
 * Correctifs 11/2026 (diagnostic live) :
 *  - `season`/`episode` n'étaient JAMAIS convertis en nombre : l'app passant des
 *    chaînes suffisait à rendre `e.num === episodeNum` toujours faux → « Episode
 *    1 not found (available: 1, 2, 3…) » et 0 flux partout.
 *  - Les films ne marchaient pas : `episode` est absent pour un film → cible
 *    forcée à 1, et préférence aux pages `-film-`.
 *  - Franchises découpées (`one-piece-saga-N`, `naruto-avec-fillers`, `-kai-`) :
 *    le scoring prenait la 1re page dont le slug *contenait* le titre
 *    ("one piece" → `one-piece-kai-saga-10-pays-des-wa`) → contenu d'une AUTRE
 *    saison. Sélection désormais par saison/arc + numérotation absolue TMDB et
 *    chaîne de sagas (cumul des épisodes), les variantes `-kai-` étant écartées.
 *  - Un seul hébergeur était résolu (`streams.length >= 2`) : si vidmoly tombait,
 *    plus rien ne se lançait. On tente maintenant tous les hébergeurs (4 max).
 */

import { fetchText, setCurrentSignal } from './http.js';
import { resolveStream, isAborted, isBudgetExhausted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { hasForeignLeadingTokens, getAbsoluteEpisodeFromTmdb } from '../utils/dle-extractor.js';

const BASE_URL = 'https://www.fullanime.fr';
const BUDGET_MS = 38000;
const MAX_DIRECT_PAGES = 4;   // pages testées à partir des slugs devinés
const MAX_SEARCH_PAGES = 5;   // pages testées depuis les résultats de recherche
const MAX_CHAIN_PAGES = 6;    // sagas explorées pour le mapping absolu
const MAX_STREAMS = 4;        // hébergeurs distincts conservés

/* ────────────────────────── Helpers texte ────────────────────────── */

function normalize(s) {
    if (!s) return '';
    return s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[':!.,?]/g, '')
        .replace(/-/g, ' ')
        .replace(/\b(the|season|part|cour|saison)\b/ig, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Retire un suffixe de saison d'un titre TMDB ("… Saison 2"). */
function stripSeasonSuffix(title) {
    return String(title || '')
        .replace(/\s*[-–:]\s*(?:saison|season|partie|part|cour|s)\s*\d{1,2}\s*$/i, '')
        .replace(/\s+(?:saison|season|partie|part|cour)\s*\d{1,2}\s*$/i, '')
        .replace(/\s+s\d{1,2}\s*$/i, '')
        .trim();
}

function toSlug(title) {
    if (!title) return '';
    return title.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[':!.,?'']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .replace(/-+/g, '-');
}

const SIGNIFICANT_STOP = new Set(['de', 'la', 'le', 'les', 'des', 'du', 'et', 'the', 'a', 'an', 'of', 'no', 'wa', 'ga', 'wo', 'ni', 'to', 'da', 'un', 'une', 'aux', 'au', 'l', 'd', 'en', 'sur', 'pour', 'par', 'film', 'movie', 'vostfr', 'vf']);

const SLUG_MARKERS = new Set(['vostfr', 'vf', 'filler', 'fillers', 'avec', 'sans', 'kai', 'saga', 'saison', 'season', 'film', 'films', 'movie', 'oav', 'ova', 'special', 'recap', 'hors', 'serie', 'complet', 'integrale', 'uncut', 'partie', 'part']);

/**
 * Mots du slug qui ne viennent PAS du titre TMDB ("naruto-shippuden" pour le
 * titre "Naruto"). Sert à éviter qu'une fiche d'une AUTRE série (Shippuden,
 * Kai…) soit préférée parce qu'elle compte plus d'épisodes.
 */
function extraTokens(base, titles) {
    const words = normalize(base).split(' ')
        .filter(w => w && !SLUG_MARKERS.has(w) && !/^\d+$/.test(w));
    let best = null;
    for (const title of titles) {
        const tt = new Set(tokensOf(title));
        const missing = words.filter(w => !tt.has(w) && !(w.length > 3 && tt.has(w.slice(1))));
        if (!best || missing.length < best.length) best = missing;
        if (!best.length) break;
    }
    return best || words;
}

function tokensOf(s) {
    return normalize(s).split(' ').filter(t => t && !SIGNIFICANT_STOP.has(t));
}

/**
 * Métadonnées d'un slug : type de page + numéros de saison/arc.
 * `-kai-` = remaster condensé (contenu DIFFÉRENT) ; `-avec/sans-fillers` = deux
 * découpages concurrents de la même série.
 */
function parseSlugMeta(slug) {
    const s = String(slug || '').replace(/-vostfr$/, '').replace(/-vf$/, '');
    const seasonM = s.match(/-saison-(\d+)/);
    const sagaM = s.match(/-saga-(\d+)/);
    return {
        slug,
        base: s,
        season: seasonM ? parseInt(seasonM[1], 10) : null,
        saga: sagaM ? parseInt(sagaM[1], 10) : null,
        isKai: /(^|-)kai(-|$)/.test(s),
        isFilm: /(^|-)(film|films|movie)(-|$)/.test(s),
        isSpecial: /(^|-)(oav|ova|special|recap|hors-serie)(-|$)/.test(s),
        fillers: /(^|-)avec-fillers/.test(s) ? 'avec' : (/(^|-)sans-fillers/.test(s) ? 'sans' : null),
    };
}

/** Couverture des tokens du titre par le slug (0..100). */
function slugCoverage(titleTokens, slug) {
    if (!titleTokens.length) return 0;
    const words = normalize(slug).split(' ').filter(Boolean);
    if (!words.length) return 0;
    const set = new Set(words);
    const elisions = new Set();
    for (const w of words) {
        if (w.length > 3 && (w[0] === 'l' || w[0] === 'd')) elisions.add(w.slice(1));
    }
    let matched = 0;
    for (const t of titleTokens) if (set.has(t) || elisions.has(t)) matched++;
    if (!matched) return 0;
    const coverage = matched / titleTokens.length;
    if (coverage < 0.6) return 0;
    return coverage * 100 - Math.max(0, words.length - matched) * 4;
}

/* ────────────────────────── Pages ────────────────────────── */

async function fetchPage(url) {
    try {
        const html = await fetchText(url);
        if (!html || html.length < 1000) return null;
        return html;
    } catch (e) {
        if (String(e && e.message).includes('AbortError')) throw e;
        return null;
    }
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Épisodes d'une fiche FullAnime, SCOPÉS au slug demandé.
 * Les 404 du site renvoient la home (200) avec les derniers épisodes d'AUTRES
 * séries : sans ce scope, une fiche inexistante "trouvait" des épisodes et le
 * provider servait un contenu arbitraire.
 */
function extractEpisodes(html, slug) {
    const episodes = [];
    const seen = new Set();
    const scope = slug ? `/voir-anime/${escapeRe(slug.replace(/-vostfr$/, ''))}` : '/voir-anime/[^\"]*';
    const re = new RegExp(`href="(${scope}(?:-vostfr)?\\/episode\\/(\\d+))"[^>]*(?:title="([^"]*)")?`, 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
        const num = parseInt(m[2], 10);
        if (!num || seen.has(num)) continue;
        seen.add(num);
        episodes.push({ num, url: `${BASE_URL}${m[1]}`, title: m[3] || '' });
    }
    episodes.sort((a, b) => a.num - b.num);
    return episodes;
}

/** Recherche du site (LIKE sur la chaîne entière → requêtes courtes privilégiées). */
async function searchAnime(query) {
    const html = await fetchPage(`${BASE_URL}/search?s=${encodeURIComponent(query)}&_t=${Date.now()}`);
    if (!html) return [];
    const out = [];
    const seen = new Set();
    const re = /href="(\/voir-anime\/[^"]+)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const path = m[1];
        if (seen.has(path)) continue;
        seen.add(path);
        const slug = path.replace('/voir-anime/', '');
        out.push({ slug, url: `${BASE_URL}${path}`, title: slug.replace(/-vostfr$/, '').replace(/-/g, ' ') });
    }
    return out;
}

/** Embeds d'une page épisode : `var links = ["…"]` (échappés `\/`). */
function extractEmbedUrls(html) {
    const urls = [];
    const linksMatch = html.match(/var\s+links\s*=\s*\[([\s\S]*?)\]/);
    if (linksMatch) {
        const re = /"(https?:[^"]+)"/g;
        let m;
        while ((m = re.exec(linksMatch[1])) !== null) {
            const url = m[1].replace(/\\\//g, '/').replace(/\\/g, '');
            if (/^https?:\/\//.test(url) && !urls.includes(url)) urls.push(url);
        }
    }
    if (!urls.length) {
        const iframe = html.match(/<iframe[^>]*src="(https?:[^"]+)"/i);
        const src = iframe ? iframe[1].replace(/\\\//g, '/') : null;
        if (src && /^https?:\/\//.test(src)) urls.push(src);
    }
    return urls;
}

/* ────────────────────────── Sélection ────────────────────────── */

/**
 * Préfixes de slug d'un titre, du plus court au plus long (≥ 2 mots).
 * Le site nomme souvent ses fiches sur un titre tronqué
 * ("Demon Slayer" pour "Demon Slayer: Kimetsu no Yaiba").
 */
function slugPrefixes(title) {
    const slug = toSlug(stripSeasonSuffix(title));
    if (!slug) return [];
    const parts = slug.split('-').filter(Boolean);
    const out = [];
    for (let n = Math.min(parts.length, 2); n <= parts.length; n++) {
        out.push(parts.slice(0, n).join('-'));
        if (parts.length === 1) break;
    }
    return out.length ? out : [slug];
}

function buildDirectSlugs(titles, season, isMovie) {
    const out = [];
    const push = (slug) => { if (slug && !out.includes(slug)) out.push(slug); };
    for (const title of titles.slice(0, 4)) {
        for (const base of slugPrefixes(title)) {
            if (isMovie) {
                push(`${base}-film-vostfr`);
                push(`${base}-vostfr`);
                continue;
            }
            if (season && season > 1) push(`${base}-saison-${season}-vostfr`);
            push(`${base}-vostfr`);
        }
    }
    return out;
}

/**
 * Score pré-fetch d'un slug pour un titre/saison.
 * Sert à ordonner les pages de recherche avant de dépenser des requêtes.
 */
function preScore(slug, titles, season, isMovie) {
    const meta = parseSlugMeta(slug);
    let best = 0;
    for (const title of titles) {
        best = Math.max(best, slugCoverage(tokensOf(title), slug));
    }
    if (!best) return 0;
    let score = best;
    if (isMovie) {
        score += meta.isFilm ? 40 : -25;
    } else {
        if (meta.isFilm) score -= 80;
        if (meta.isSpecial) score -= 25;
        if (meta.isKai) score -= 90;           // contenu remaster condensé
        if (meta.fillers) score += meta.fillers === 'avec' ? 8 : 0;
        if (season && season > 1) {
            if (meta.season === season) score += 70;
            else if (meta.season != null) score -= Math.min(40, Math.abs(meta.season - season) * 6);
            else if (meta.saga != null) score += 20; // catalogue par arcs
            else score -= 25;                        // page plate (S1 only en général)
        } else if (season === 1) {
            if (meta.season == null) score += 15;
            else if (meta.season !== 1) score -= 30;
            // Les catalogues par arc sont les fiches COMPLÈTES (One Piece :
            // `one-piece-vostfr` n'a qu'un épisode leurre, `saga-1` en a 61).
            if (meta.saga != null) score += 25;
        }
    }
    return score;
}

/**
 * Choisit la page + l'épisode local.
 * Priorité : saison exacte > film > page plate (numérotation absolue) > arcs.
 * @returns {{page, ep}|null}
 */
function choosePageEpisode(pages, ctx) {
    const { season, epNum, absEp, isMovie } = ctx;

    // 1. Saison exacte demandée (pages `-saison-N`)
    if (!isMovie && season) {
        const hit = pages.find(p => p.meta.season === season && p.eps.some(e => e.num === epNum));
        if (hit) return { page: hit, ep: hit.eps.find(e => e.num === epNum) };
    }

    // 2. Film : la page film n'a qu'un « épisode 1 »
    if (isMovie) {
        const ordered = pages.slice().sort((a, b) => (b.meta.isFilm ? 1 : 0) - (a.meta.isFilm ? 1 : 0));
        const hit = ordered.find(p => p.eps.some(e => e.num === 1));
        if (hit) return { page: hit, ep: hit.eps.find(e => e.num === 1) };
    }

    // 3. Page plate (pas de saison/arc) numérotée en ABSOLU (Naruto 220 ép.).
    //    Plusieurs fiches plates coexistent (`naruto-vostfr` = 1 ép. leurre vs
    //    `naruto-avec-fillers` = 220) → la plus complète gagne.
    if (absEp) {
        const flat = pages
            .filter(p => p.meta.season == null && p.meta.saga == null && !p.meta.isFilm && !p.meta.isKai)
            .filter(p => p.eps.some(e => e.num === absEp))
            .sort((a, b) => {
                const ea = extraTokens(a.meta.base, ctx.titles).length;
                const eb = extraTokens(b.meta.base, ctx.titles).length;
                if (ea !== eb) return ea - eb;
                return b.eps.length - a.eps.length;
            });
        if (flat.length) return { page: flat[0], ep: flat[0].eps.find(e => e.num === absEp) };
    }

    // ⚠️ Pas de raccourci « saga === saison » : la découpe du site ne suit pas
    //    celle de TMDB (One Piece : TMDB S4 = Alabasta alors que
    //    `one-piece-saga-4` = Water Seven). Le mapping passe par l'absolu
    //    (resolveSagaChain), seul correct pour ces franchises.
    // 5. Page plate contenant l'épisode demandé (S1 et numérotation locale).
    //    Plusieurs fiches peuvent le
    //    contenir (One Piece : `one-piece-vostfr` = 1 ép. leurre vs
    //    `one-piece-saga-1-east-blue` = 61 ép.) → la couverture la plus large
    //    gagne, sinon on servait un stub sans hébergeur (0 flux).
    if (!isMovie) {
        const plate = pages
            .filter(p => p.meta.season == null && p.meta.saga == null && !p.meta.isKai && !p.meta.isFilm)
            .filter(p => p.eps.some(e => e.num === epNum))
            .sort((a, b) => {
                const ea = extraTokens(a.meta.base, ctx.titles).length;
                const eb = extraTokens(b.meta.base, ctx.titles).length;
                if (ea !== eb) return ea - eb;
                return b.eps.length - a.eps.length;
            });
        if (plate.length) {
            const hit = plate[0];
            return { page: hit, ep: hit.eps.find(e => e.num === epNum) };
        }
    }
    return null;
}

/**
 * Mapping absolu pour les franchises à pages d'arcs qui redémarrent à 1
 * (One Piece : TMDB S2-S5 = « saga-2 » 82 ép.). On cumule les épisodes des
 * sagas dans l'ordre jusqu'à couvrir l'épisode absolu.
 */
async function resolveSagaChain(ctx) {
    const { titles, absEp, startTime, fetchedPages } = ctx;
    if (!absEp) return null;

    // Liste des sagas : la recherche du site renvoie toutes les pages de la
    // franchise ; on ne garde que les arcs non-Kai d'un même préfixe.
    const queries = [];
    for (const title of titles.slice(0, 2)) {
        const tok = tokensOf(title);
        if (!tok.length) continue;
        queries.push(tok.slice(0, 2).join(' '));
    }

    let sagas = [];
    for (const q of queries) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        const results = await searchAnime(q);
        for (const r of results) {
            const meta = parseSlugMeta(r.slug);
            if (meta.saga == null || meta.isKai || meta.isFilm) continue;
            sagas.push({ ...r, meta });
        }
        if (sagas.length) break;
    }
    if (!sagas.length) return null;

    // Regroupe par préfixe (plusieurs franchises peuvent remonter) et garde le
    // groupe le plus probable : celui dont la saga 1 existe.
    const groups = new Map();
    for (const s of sagas) {
        const key = s.meta.base.split('-saga-')[0];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
    }
    let bestGroup = null;
    let bestScore = -1;
    for (const [key, list] of groups) {
        const coverage = Math.max(...titles.slice(0, 4).map(t => slugCoverage(tokensOf(t), key)));
        const hasFirst = list.some(x => x.meta.saga === 1);
        const score = coverage + (hasFirst ? 15 : 0) + Math.min(list.length, 12);
        if (score > bestScore) { bestScore = score; bestGroup = list; }
    }
    if (!bestGroup) return null;

    const ordered = bestGroup.slice().sort((a, b) => a.meta.saga - b.meta.saga);
    let acc = 0;
    let tries = 0;
    for (const saga of ordered) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        if (tries >= MAX_CHAIN_PAGES) break;
        tries++;

        let page = fetchedPages.find(p => p.meta.slug === saga.slug);
        if (!page) {
            const html = await fetchPage(saga.url);
            if (!html) { continue; }
            const eps = extractEpisodes(html, saga.slug);
            if (!eps.length) continue;
            page = { meta: saga.meta, eps, url: saga.url };
            fetchedPages.push(page);
        }
        const count = page.eps.length;
        if (absEp <= acc + count) {
            const local = absEp - acc;
            const ep = page.eps.find(e => e.num === local);
            if (ep) {
                console.log(`[FullAnime] arc ${saga.meta.saga} : absolu ${absEp} → ép. local ${local}`);
                return { page, ep };
            }
            return null;
        }
        acc += count;
    }
    return null;
}

/* ────────────────────────── Entrée ────────────────────────── */

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const startTime = Date.now();
    const isMovie = mediaType === 'movie';
    const seasonNum = isMovie ? null : (parseInt(season, 10) || 1);
    const epNum = isMovie ? 1 : (parseInt(episodeNum, 10) || 1);

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];
    console.log(`[FullAnime] Titles: ${titles.slice(0, 3).join(', ')}`);

    // Épisode absolu TMDB (autorité) : indispensable pour les pages à
    // numérotation globale (Naruto 220 ép.) et les chaînes de sagas.
    let absEp = epNum;
    if (!isMovie && seasonNum > 1) {
        const computed = await getAbsoluteEpisodeFromTmdb(tmdbId, seasonNum, epNum);
        if (computed) absEp = computed;
    }
    if (!isMovie && absEp !== epNum) {
        console.log(`[FullAnime] S${seasonNum}E${epNum} → absolu ${absEp}`);
    }

    const ctx = { season: seasonNum, epNum, absEp, isMovie, titles, startTime, signal, fetchedPages: [] };

    // 1. Slugs devinés (rapides, sans recherche)
    const directSlugs = buildDirectSlugs(titles, seasonNum, isMovie);
    for (const slug of directSlugs.slice(0, MAX_DIRECT_PAGES)) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        const url = `${BASE_URL}/voir-anime/${slug}`;
        const html = await fetchPage(url);
        if (!html) continue;
        const eps = extractEpisodes(html, slug);
        if (!eps.length) continue;
        ctx.fetchedPages.push({ meta: parseSlugMeta(slug), eps, url });
    }

    let chosen = choosePageEpisode(ctx.fetchedPages, ctx);

    /** Fiche « leurre » : quelques épisodes seulement (one-piece-vostfr = 1). */
    const isThin = (c) => !!(c && !isMovie && c.page.eps.length <= 3 &&
        c.page.meta.saga == null && c.page.meta.season == null);

    // 2. Recherche. Toujours lancée quand la page devinée est un leurre
    //    (« one-piece-vostfr » ne contient qu'un épisode alors que les sagas
    //    sont des fiches séparées) ou quand la saison demande un découpage.
    if (!chosen || isThin(chosen) || seasonNum > 1) {
        // Le moteur du site fait un LIKE sur la chaîne ENTIÈRE
        // ("demon slayer kimetsu" → 0 résultat) : on dégrade la requête.
        const queries = [];
        for (const title of titles.slice(0, 3)) {
            const tok = tokensOf(stripSeasonSuffix(title));
            if (!tok.length) continue;
            if (tok.length >= 2) queries.push(tok.slice(0, 2).join(' '));
            queries.push(tok[0]);
        }
        const seen = new Set();
        const results = [];
        for (const q of [...new Set(queries)].slice(0, 6)) {
            if (isBudgetExhausted(startTime, BUDGET_MS)) break;
            for (const r of await searchAnime(q)) {
                if (seen.has(r.slug)) continue;
                seen.add(r.slug);
                results.push(r);
            }
            if (results.length >= 12) break;
        }
        const ranked = results
            .map(r => ({ ...r, score: preScore(r.slug, titles, seasonNum, isMovie) }))
            .filter(r => r.score >= 45)
            .sort((a, b) => b.score - a.score);
        console.log(`[FullAnime] Recherche: ${results.length} résultats, ${ranked.length} retenus`);

        for (const r of ranked.slice(0, MAX_SEARCH_PAGES)) {
            if (isBudgetExhausted(startTime, BUDGET_MS)) break;
            const html = await fetchPage(r.url);
            if (!html) continue;
            const eps = extractEpisodes(html, r.slug);
            if (!eps.length) continue;
            ctx.fetchedPages.push({ meta: parseSlugMeta(r.slug), eps, url: r.url });
        }
        console.log(`[FullAnime] fiches: ${ctx.fetchedPages.map(p => `${p.meta.slug}:${p.eps.length}`).join(', ')}`);
        const searched = choosePageEpisode(ctx.fetchedPages, ctx);
        if (searched && (!chosen || searched.page.eps.length > chosen.page.eps.length)) {
            chosen = searched;
        }
    }

    // 3. Chaîne de sagas (One Piece & co : arcs locaux, TMDB en saisons)
    if (!chosen || isThin(chosen)) {
        const chain = await resolveSagaChain(ctx);
        if (chain) chosen = chain;
    }

    if (!chosen) {
        console.log(`[FullAnime] S${seasonNum}E${epNum} introuvable (pages: ${ctx.fetchedPages.length})`);
        return [];
    }
    console.log(`[FullAnime] ${chosen.page.url} → épisode ${chosen.ep.num}`);

    // 4. Page épisode → hébergeurs
    let epHtml = await fetchPage(chosen.ep.url);
    if (!epHtml) {
        // Le site numérote ses URLs en `episode/01` : repli sur la forme paddée.
        const padded = chosen.ep.url.replace(/\/episode\/(\d+)$/, (m, n) => `/episode/${String(n).padStart(2, '0')}`);
        if (padded !== chosen.ep.url) epHtml = await fetchPage(padded);
    }
    if (!epHtml) return [];
    const embeds = extractEmbedUrls(epHtml);
    console.log(`[FullAnime] ${embeds.length} hébergeur(s)`);
    if (!embeds.length) return [];

    // 5. Résolution : tous les hébergeurs, jusqu'à 4 flux distincts.
    //    (Le site est 100 % VOSTFR → code langue `ja`, label VOSTFR conservé.)
    const PRIORITY = ['vidmoly', 'sendvid', 'sibnet', 'oneupload', 'smoothpre', 'myvi'];
    const sorted = embeds.slice().sort((a, b) => {
        const rank = (u) => {
            const i = PRIORITY.findIndex(p => u.toLowerCase().includes(p));
            return i === -1 ? 99 : i;
        };
        return rank(a) - rank(b);
    });

    const streams = [];
    const hosts = new Set();
    for (const embedUrl of sorted) {
        if (isBudgetExhausted(startTime, BUDGET_MS)) break;
        if (streams.length >= MAX_STREAMS) break;

        let host = '';
        try { host = new URL(embedUrl).hostname; } catch (e) { host = embedUrl.split('/')[2] || ''; }
        if (hosts.has(host)) continue;

        const baseStream = {
            name: 'FullAnime (VOSTFR)',
            title: `FullAnime [VOSTFR] - ${host}`,
            language: 'ja',
            quality: 'HD',
            headers: { Referer: `${BASE_URL}/` },
        };
        try {
            const resolved = await resolveStream({ ...baseStream, url: embedUrl }, 0);
            if (resolved && resolved.isDirect !== false && resolved.url &&
                /^https?:\/\//.test(resolved.url) && !resolved.url.includes('[object')) {
                const { isDirect, originalUrl, ...clean } = resolved;
                hosts.add(host);
                streams.push({ ...baseStream, ...clean, provider: 'FullAnime' });
                console.log(`[FullAnime] ✓ ${host}`);
            } else {
                console.log(`[FullAnime] ✗ ${host} non résolu`);
            }
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
            console.log(`[FullAnime] ✗ ${host}: ${e.message}`);
        }
    }

    console.log(`[FullAnime] ${streams.length} stream(s) (${Date.now() - startTime}ms)`);
    return streams;
}
