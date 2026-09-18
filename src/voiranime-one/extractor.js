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

import { fetchText, fetchJson, BASE } from './http.js';
import { resolveStream, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const SITE = 'voiranime.one';

/* ────────────────────────── Config ────────────────────────── */

const TIMEOUTS = { search: 12000, fiche: 14000, episode: 14000, resolve: 15000 };

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

/** Extrait le payload RSC concaténé d'une page Next.js. */
function extractRscPayload(html) {
    const chunks = [];
    const re = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/g;
    let m;
    while ((m = re.exec(html)) !== null) chunks.push(m[1]);
    if (!chunks.length) return '';
    let payload = chunks.join('');
    // dé-échappement JS minimal
    try { payload = JSON.parse(`"${payload.replace(/"/g, '\\"').replace(/\\"/g, '"')}"`); } catch { /* noop */ }
    return payload
        .replace(/\\\\u002F/gi, '/')
        .replace(/\\u002F/gi, '/')
        .replace(/\\n/g, '\n');
}

/* ────────────────────────── Search ────────────────────────── */

/**
 * Recherche côté site. Retourne [{slug, type, langues, titles:[…]}].
 * Essaie plusieurs requêtes (titres TMDB) et accumule les résultats (jamais
 * d'écrasement — bug d'accumulation déjà vu sur coflix).
 */
async function searchSite(queries, mediaType, signal) {
    const bySlug = new Map();
    for (const q of queries) {
        if (!q || isAborted(signal)) break;
        const data = await fetchJson(
            `/api/anime/search?q=${encodeURIComponent(q)}`,
            { timeout: TIMEOUTS.search, signal },
        );
        const list = (data && Array.isArray(data.animes)) ? data.animes : null;
        if (!list) continue;
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
    const src = payload || html;

    const m = src.match(/"seasons":\[(.*?)\],"?(?:rating|isAdult|genres|published|featured|backdrop)/);
    if (!m) return null;
    let plan;
    try { plan = JSON.parse(`[${m[1]}]`); } catch { return null; }
    if (!Array.isArray(plan)) return null;

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
        headers: { Referer: `${BASE}/` },
    });
    if (!embedHtml) return [];

    const external = (embedHtml.match(/<iframe[^>]*src="(https?:\/\/[^"]+)"/)?.[1] || '')
        .split(String.fromCharCode(92) + '/').join('/'); // dé-échappe \/ (iframe parfois inline dans le JSON RSC de l'embed)
    if (!external) return [];

    if (!/^https?:\/\//.test(external)) return []; // sanity : URL absolue uniquement
    const isFilm = seasonSlot === SEASON_SLOT;
    const langLower = lang.toLowerCase();
    const label = isFilm ? 'Film' : `S${seasonSlot}E${ep}`;
    const out = await resolveStream({
        url: external,
        name: `${SITE} ${label}`,
        title,
        language: langLower === 'vf' ? 'fr' : 'fr', // VF et VOSTFR → fr (sous-titres pour VOSTFR)
        quality: '',
        provider: SITE,
    }, 0);
    if (!out || !out.url) return [];
    if (out.isDirect === false) return []; // pas de flux non résolu (lecteur mort)
    return [{
        url: out.url,
        name: `${SITE} ${label} ${lang}`,
        title: title || null,
        quality: out.quality || '',
        language: 'fr',
        headers: out.headers || undefined,
        provider: SITE,
    }];
}

/* ────────────────────────── Flux principal ────────────────────────── */

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options.signal;
    const seasonNum = parseInt(season, 10) || 1;
    const epNum = parseInt(episode, 10) || 1;
    const isMovie = mediaType === 'movie';

    // 1. Titres de recherche (TMDB)
    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, isMovie ? 'movie' : 'tv', { season: seasonNum, episode: epNum });
    } catch { /* noop */ }
    const queries = [...new Set([titles[0], ...titles].filter(Boolean))].slice(0, 4);
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

    // 5. Langues : VF et VOSTFR si dispo, sinon celle connue
    const langs = [];
    const known = (best.langues || []).map(l => String(l).toUpperCase());
    if (known.includes('VF')) langs.push('VF');
    if (known.includes('VOSTFR')) langs.push('VOSTFR');
    if (!langs.length) langs.push('VOSTFR', 'VF');

    // 6. Extraction par langue (séquentiel, garde-fou temps côté index)
    const all = [];
    for (const lang of langs) {
        if (isAborted(signal)) break;
        try {
            const streams = await extractFromEpisodePage(best.slug, String(seasonSlot), lang, epNum, signal, titles[0] || best.titles[0]);
            all.push(...streams);
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
        }
    }

    // 7. Dédup par host+path (VF/VOSTFR peuvent pointer vers le même fichier)
    const seen = new Set();
    const dedup = all.filter(st => {
        try {
            const u = new URL(st.url);
            const key = `${u.host}${u.pathname.replace(/\?.*$/, '')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        } catch { return true; }
    });

    return dedup;
}
