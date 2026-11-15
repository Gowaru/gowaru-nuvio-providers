/**
 * Extractor for VoirAnime.one (voiranime.one — SPA Next.js/RSC, diag live 2026-09).
 *
 * Chaîne réelle :
 *   1. Search : GET /api/anime/search?q=X&langue=&type=&page=N
 *      → { animes:[{slug,title,titleFrench,titleEnglish,titleOriginal,titleJp,
 *         synonyms,malId,type:"TV"|"Film"|"OVA"|"Spécial",seasons,langues,…}] }
 *      (API publique sans auth ; catalogue ≈ 1395 fiches).
 *   2. Fiche /{slug} : payload RSC (self.__next_f.push) avec
 *      seasons:[{number, episodes:[{number, released, langues:["VF","VOSTFR"]}]}].
 *      → plan de saison/épisodes + garde `released` (pas de page fantôme).
 *   3. Page épisode : /{slug}/{saison}/{VF|VOSTFR}/{ep}
 *      Films : /{slug}/film/{VF|VOSTFR}/1 (slot saison = "film", 1 seul lecteur).
 *      Contient exactement UNE iframe /embed/{cuid} (1 langue = 1 lecteur).
 *   4. L'embed /embed/{cuid} (page Next.js du site) contient l'iframe externe
 *      réelle (vidmoly, sibnet, …) → resolveStream gère le host.
 *
 * Anti-faux-match :
 *  - Scoring par tokens entiers + bonus position + pénalité extra words,
 *    comparé sur TOUS les titres du résultat (title, titleFrench, titleEnglish,
 *    titleOriginal, titleJp, synonyms, slug) ;
 *  - Exclusions d'homonymes (Steins;Gate, The New Gate, Ikebukuro West Gate
 *    Park, Rio - Rainbow Gate, Mister Gates…) ;
 *  - Garde type : une demande TV ne prend jamais un enregistrement "Film"/"OVA"
 *    (et inversement) — le champ API `type` est fiable ( MAL ).
 *  - Garde saison : `seasons` vient de l'API, épisodes réels de la fiche RSC ;
 *    une demande S2+ sur une fiche sans cette saison → 0 (pas d'épisode S1).
 */

import { fetchText, fetchJson, getBase, resolveBase, isBaseAlive } from './http.js';
import { resolveStream, isAborted, isBudgetExhausted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const SITE = 'voiranime.one';

/* ────────────────────────── Config ────────────────────────── */

const TIMEOUTS = { search: 10000, fiche: 12000, episode: 12000, resolve: 15000 };
const BUDGET_MS = 40000;

/** Homonymes à exclure (tokens interdits dans slug/titres quand la requête ne les contient pas). */
const HOMONYM_EXCLUSIONS = [
    'steins-gate', 'stein-s-gate', 'the-new-gate', 'rainbow-gate',
    'west-gate', 'gates', 'gate-7', 'burikko-gate', 'gate-of-revelation',
];

const SEASON_SLOT = 'film';

/* ────────────────────────── Helpers ────────────────────────── */

const STOP_WORDS = new Set([
    // EN
    'the', 'a', 'an', 'of', 'no', 'wa', 'ga', 'wo', 'o', 'ni', 'to', 'da',
    // FR (articles/prépositions — bruits dans les titres FR)
    'de', 'la', 'le', 'les', 'des', 'du', 'et', 'un', 'une', 'au', 'aux',
    'en', 'sur', 'pour', 'par', 'd', 'l',
    'i', // numérotation romaine/lettre seule
]);

function normalizeText(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function tokens(s) {
    return normalizeText(s).split(' ').filter(Boolean);
}

/**
 * Score de correspondance query ↔ titre (0..100).
 * - tokens entiers uniquement ("gate" ne matche pas "gates") ;
 * - bonus position si le titre COMMENCE par la requête ;
 * - pénalité par mot du titre non couvert (extra words), stop-words ignorés.
 */
function scoreMatch(queryTokens, title) {
    const titleTok = tokens(title);
    if (!queryTokens.length || !titleTok.length) return 0;
    const titleSet = new Set(titleTok);
    let matched = 0;
    for (const q of queryTokens) if (titleSet.has(q)) matched++;
    if (matched === 0) return 0;
    const extra = titleTok.filter(t => !STOP_WORDS.has(t) && !queryTokens.includes(t)).length;
    let score = Math.round((matched / queryTokens.length) * 70 + (matched / titleTok.length) * 30);
    // bonus position : le titre commence par la requête complète
    const joined = normalizeText(title);
    const qJoined = queryTokens.join(' ');
    if (joined === qJoined) score += 30;
    else if (joined.startsWith(qJoined + ' ')) score += 20;
    score -= extra * 15;
    return Math.max(0, score);
}

function isHomonym(slug, titles, queryTokens) {
    const s = String(slug || '').toLowerCase();
    for (const bad of HOMONYM_EXCLUSIONS) {
        if (!s.includes(bad)) continue;
        // le terme exclu ne doit pas faire partie de la requête elle-même
        const badTok = bad.split('-');
        if (badTok.every(t => queryTokens.includes(t))) continue;
        return true;
    }
    // vérifie aussi dans les titres alternatifs
    const joined = normalizeText(titles.join(' '));
    for (const bad of HOMONYM_EXCLUSIONS) {
        if (!joined.includes(bad.replace(/-/g, ' '))) continue;
        const badTok = bad.split('-');
        if (badTok.every(t => queryTokens.includes(t))) continue;
        return true;
    }
    return false;
}

/**
 * Extrait le payload RSC concaténé d'une page Next.js.
 * Chaque chunk est un littéral JSON complet (`self.__next_f.push([1,"…"])`) :
 * on le parse individuellement au lieu de recoller les échappements à la main
 * (l'ancien `replace(/"/g,'\\"')` corrompait les chaînes contenant des guillemets,
 * ce qui faisait échouer le parse de `seasons` sur les fiches au synopsis riche).
 */
function extractRscPayload(html) {
    const chunks = [];
    const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        try { chunks.push(JSON.parse(m[1])); } catch { /* chunk partiel : ignoré */ }
    }
    if (!chunks.length) {
        // repli : chunk découpé par le serveur, on recolle les littéraux bruts
        const raw = [];
        const re2 = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
        while ((m = re2.exec(html)) !== null) raw.push(m[1]);
        if (!raw.length) return '';
        chunks.push(raw.join(''));
    }
    return chunks.join('')
        .replace(/\\\\u002F/gi, '/')
        .replace(/\\u002F/gi, '/')
        .replace(/\\n/g, '\n');
}

/**
 * Récupère le tableau `"seasons":[…]` par appariement de crochets.
 * Plus sûr que l'ancienne regex non-greedy, qui s'arrêtait au premier mot-clé
 * connu et cassait dès qu'un synopsis contenait `],"rating`.
 */
function extractSeasonsArray(src) {
    const key = src.indexOf('"seasons":[');
    if (key === -1) return null;
    const start = key + '"seasons":'.length;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < src.length; i++) {
        const ch = src[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '[') depth++;
        else if (ch === ']') {
            depth--;
            if (depth === 0) {
                try { return JSON.parse(src.slice(start, i + 1)); } catch { return null; }
            }
        }
    }
    return null;
}

/* ────────────────────────── Search ────────────────────────── */

/**
 * Recherche côté site. Retourne [{slug, type, langues, titles:[…]}].
 * Essaie plusieurs requêtes (titres TMDB) et accumule les résultats (jamais
 * d'écrasement — bug d'accumulation déjà vu sur coflix).
 */
async function searchSite(queries, mediaType, signal) {
    const bySlug = new Map();
    const addList = (list) => {
        for (const a of list) {
            if (!a || !a.slug || bySlug.has(a.slug)) continue;
            bySlug.set(a.slug, {
                slug: a.slug,
                type: String(a.type || '').toLowerCase(), // tv | film | ova | spécial
                langues: Array.isArray(a.langues) ? a.langues : [],
                titles: [
                    a.title, a.titleFrench, a.titleEnglish,
                    a.titleOriginal, a.titleJp,
                    ...(Array.isArray(a.synonyms) ? a.synonyms : []),
                    a.slug,
                ].filter(Boolean),
            });
        }
    };
    for (const q of queries) {
        if (!q || isAborted(signal)) break;
        const data = await fetchJson(
            `/api/anime/search?q=${encodeURIComponent(q)}&page=1`,
            { timeout: TIMEOUTS.search, signal },
        );
        const list = (data && Array.isArray(data.animes)) ? data.animes : null;
        if (!list) continue;
        addList(list);
        // Pagination : une requête courte ("naruto") renvoie plusieurs pages ;
        // n'en lire qu'une faisait manquer la fiche exacte noyée dans les dérivés.
        const totalPages = Number(data.totalPages) || 1;
        if (bySlug.size < 8 && totalPages > 1) {
            const p2 = await fetchJson(
                `/api/anime/search?q=${encodeURIComponent(q)}&page=2`,
                { timeout: TIMEOUTS.search, signal },
            );
            if (p2 && Array.isArray(p2.animes)) addList(p2.animes);
        }
        if (bySlug.size >= 12) break; // assez de candidats
    }
    return [...bySlug.values()];
}

/* ────────────────────────── Fiche ────────────────────────── */

/**
 * Récupère le plan de saisons d'une fiche : { seasons: Map(num → {maxEp, releasedSet}),
 * isFilm }. Tolère le HTML échappé ou non.
 */
async function getFichePlan(slug, signal) {
    const html = await fetchText(`/${slug}`, { timeout: TIMEOUTS.fiche, signal });
    if (!html) return null;
    const payload = extractRscPayload(html);
    const plan = extractSeasonsArray(payload || html);
    if (!plan || !Array.isArray(plan)) return null;

    const seasons = new Map();
    let hasEpisodeData = false;
    for (const s of plan) {
        if (!s || typeof s.number !== 'number') continue;
        const eps = Array.isArray(s.episodes) ? s.episodes : [];
        const released = new Set();
        let maxEp = 0;
        for (const e of eps) {
            if (!e || typeof e.number !== 'number') continue;
            hasEpisodeData = true;
            if (e.released !== false) released.add(e.number);
            if (e.number > maxEp) maxEp = e.number;
        }
        seasons.set(s.number, { maxEp, released });
    }
    return { seasons, hasEpisodeData };
}

/* ────────────────────────── Page épisode ────────────────────────── */

/** Récupère l'embed /embed/{cuid} d'une page épisode et résout son iframe externe. */
async function extractFromEpisodePage(slug, seasonSlot, lang, ep, signal, title) {
    const path = `/${slug}/${seasonSlot}/${lang}/${ep}`;
    const html = await fetchText(path, { timeout: TIMEOUTS.episode, signal });
    if (!html) return [];

    const cuid = html.match(/\/embed\/([a-z0-9]+(?:\d[a-z0-9]*))/)?.[1];
    if (!cuid) return [];

    const embedHtml = await fetchText(`/embed/${cuid}`, {
        timeout: TIMEOUTS.episode,
        signal,
        headers: { Referer: `${getBase()}/` },
    });
    if (!embedHtml) return [];

    const external = (embedHtml.match(/<iframe[^>]*src="(https?:\/\/[^"]+)"/)?.[1] || '')
        .split(String.fromCharCode(92) + '/').join('/'); // dé-échappe \/ (iframe parfois inline dans le JSON RSC de l'embed)
    if (!external) return [];

    if (!/^https?:\/\//.test(external)) return []; // sanity : URL absolue uniquement
    const isFilm = seasonSlot === SEASON_SLOT;
    const label = isFilm ? 'Film' : `S${seasonSlot}E${ep}`;
    // VF = doublage FR (piste fr), VOSTFR = VO sous-titrée : même code langue
    // côté app (fr), mais le label doit rester visible dans le titre.
    const out = await resolveStream({
        url: external,
        name: `${SITE} ${label} ${lang}`,
        title,
        language: 'fr',
        quality: '',
        provider: SITE,
    }, 0);
    if (!out || !out.url) return [];
    if (out.isDirect === false) return []; // pas de flux non résolu (lecteur mort)
    return [{
        url: out.url,
        name: `${SITE} ${label} ${lang}`,
        title: title ? `${title} [${lang}]` : `[${lang}]`,
        quality: out.quality || '',
        language: 'fr',
        headers: out.headers || undefined,
        provider: SITE,
    }];
}

/* ────────────────────────── Flux principal ────────────────────────── */

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options.signal;
    const t0 = Date.now();
    const seasonNum = parseInt(season, 10) || 1;
    const epNum = parseInt(episode, 10) || 1;
    const isMovie = mediaType === 'movie';

    // 0. Domaine vivant ? Le moteur nomade change d'hôte : sans cette sonde,
    // chaque requête partait vers un domaine à la délégation DNS cassée.
    const base = await resolveBase(signal);
    if (!base || !isBaseAlive()) return [];

    // 1. Titres de recherche (TMDB)
    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, isMovie ? 'movie' : 'tv', { season: seasonNum, episode: epNum });
    } catch { /* noop */ }
    const queries = [...new Set([titles[0], ...titles].filter(Boolean))].slice(0, 6);
    if (!queries.length) return [];

    // 2. Recherche site
    const candidates = await searchSite(queries, mediaType, signal);
    if (!candidates.length) return [];

    // 3. Scoring + gardes — score = max sur TOUTES les requêtes (titres TMDB
    // FR/EN/romaji : le site indexe sous son propre titre, souvent le FR)
    const queryTokenSets = queries.map(q => tokens(q));
    let best = null;
    let bestScore = 0;
    for (const c of candidates) {
        if (isHomonym(c.slug, c.titles, queryTokenSets[0])) continue;
        // Garde type : TV ≠ film/ova
        if (isMovie && c.type !== 'film') continue;
        if (!isMovie && c.type === 'film') continue;
        let s = 0;
        for (const qt of queryTokenSets) {
            for (const t of c.titles) s = Math.max(s, scoreMatch(qt, t));
        }
        if (s > bestScore) { bestScore = s; best = c; }
    }
    if (!best || bestScore < 45) return [];
    console.log(`[VoirAnimeOne] Match: ${best.slug} (score ${bestScore}, type ${best.type})`);

    // 4. Plan de saisons (garde existence) — sauf films (1 lecteur, pas de plan)
    let seasonSlot;
    if (isMovie) {
        seasonSlot = SEASON_SLOT;
    } else {
        const plan = await getFichePlan(best.slug, signal);
        if (plan && plan.hasEpisodeData) {
            const s = plan.seasons.get(seasonNum);
            if (!s) {
                console.log(`[VoirAnimeOne] S${seasonNum} absente de ${best.slug} (${[...plan.seasons.keys()].join(',')}), abandon`);
                return [];
            }
            if (s.released.size && !s.released.has(epNum)) {
                console.log(`[VoirAnimeOne] S${seasonNum}E${epNum} non sorti sur le site, abandon`);
                return [];
            }
        }
        // sans plan, on tente la page directement (l'API peut être en retard sur la fiche)
        seasonSlot = seasonNum;
    }

    // 5. Langues : on tente TOUJOURS VF et VOSTFR (le champ `langues` de l'API
    // est un résumé par série, souvent en retard sur les pages épisode : s'y
    // fier faisait disparaître les VF fraîchement ajoutées). Ordre = préférence.
    const known = (best.langues || []).map(l => String(l).toUpperCase());
    const langs = [];
    if (known.includes('VF') || !known.length) langs.push('VF');
    langs.push('VOSTFR');
    if (!langs.includes('VF')) langs.push('VF');

    // 6. Extraction par langue (séquentiel, garde-fou temps côté index)
    const all = [];
    for (const lang of langs) {
        if (isAborted(signal)) break;
        if (isBudgetExhausted(t0, BUDGET_MS)) {
            console.log(`[VoirAnimeOne] budget atteint, langues restantes ignorées (${lang})`);
            break;
        }
        try {
            const streams = await extractFromEpisodePage(best.slug, String(seasonSlot), lang, epNum, signal, titles[0] || best.titles[0]);
            all.push(...streams);
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
        }
    }

    // 7. Dédup par langue + host + path : VF et VOSTFR peuvent pointer vers le
    // même fichier vidéo ; ils doivent pourtant rester deux entrées distinctes.
    const seen = new Set();
    return all.filter(st => {
        try {
            const u = new URL(st.url);
            const key = `${String(st.name || '').toUpperCase()}|${u.host}${u.pathname.replace(/\?.*$/, '')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        } catch { return true; }
    });
}
