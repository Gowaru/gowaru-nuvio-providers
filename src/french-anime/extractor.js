/**
 * Extractor for French-Anime (french-anime.com).
 *
 * Architecture réelle (diagnostic live 2026-09) :
 *  - french-anime.com : Cloudflare MANAGED challenge (cf-mitigated: challenge,
 *    cType: 'managed') sur toutes les routes → non contournable en QuickJS.
 *  - french-anime.fr : IP OVH sans Cloudflare, répond 200, mais c'est une
 *    VITRINE white-label (WordPress 6.7.7) dont les 321 liens de contenu
 *    pointent vers gupy.fr (portail SVOD légal, lui aussi CF-challengé) —
 *    aucun lecteur sur le domaine lui-même.
 *  - Le catalogue exact du showcase (Your Name, Le Château ambulant,
 *    Chainsaw Man Le Film : L'arc de Reze, JJK Exécution, Demon Slayer
 *    La Forteresse infinie…) est celui de coflix.wiki — vérifié titre par
 *    titre via /ajax/search/suggest.
 *
 * Stratégie : déléguer au backend réel (coflix.wiki, API AJAX sans challenge)
 * avec le même pipeline que le provider Coflix (search → épisodes → embeds →
 * résolveurs), en excluant les faux-matchs homonymes connus (Gate→Steins-Gate,
 * Gates→Mister Gates).
 */

import { fetchTextSafe, ajaxGet, ajaxPost, setCurrentSignal, SITE } from './http.js';
import { resolveStream, isAborted } from '../utils/resolvers.js';
import { createCache } from '../utils/cache.js';
import { getTmdbTitles } from '../utils/metadata.js';

const withCache = createCache('fra', 'FrenchAnime');

const PAGE_TIMEOUT = 12000;
const MAX_SUGGEST_QUERIES = 5;
const MAX_EMBEDS_PER_LANG = 2;
const MAX_LANGS = 2;

/** Hosts confirmés morts ou irrésolvables sur ce backend (2026-09). */
const DEAD_HOSTS = ['kakaflix'];

function isDeadUrl(url) {
    const u = (url || '').toLowerCase();
    return DEAD_HOSTS.some(d => u.includes(d));
}

function normalizeMediaType(mediaType) {
    const t = String(mediaType || '').toLowerCase();
    if (t === 'movie' || t === 'film') return 'movie';
    return 'tv';
}

/**
 * Faux-matchs homonymes à exclure (leçon du sweep Gate 63663) :
 * la search textuelle renvoie ces slugs pour des requêtes courtes.
 */
const EXCLUDED_SLUGS = [
    'steins-gate',
    'the-new-gate',
    'divine-gate',
    'mister-gates',
    'corruption-of-champions',
];

function isExcludedSlug(slug) {
    const s = String(slug || '').toLowerCase();
    return EXCLUDED_SLUGS.some((x) => s.includes(x));
}

function cleanTitleForSlug(title) {
    return String(title || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, 'and')
        .replace(/[’'`]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Score mots communs (mots ≥ 3 lettres, demi-poids sur 3). */
function titleScore(candidate, query) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const qw = norm(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    if (!qw.length) return 0;
    const cw = new Set(norm(candidate).split(/[^a-z0-9]+/));
    let hits = 0;
    for (const w of qw) if (cw.has(w)) hits += (w.length === 3 ? 0.5 : 1);
    return hits / qw.length;
}

// ─── 1. Recherche ───────────────────────────────────────────────────────────
/**
 * Recherche suggest. Retourne des candidats dédupliqués par slug :
 *   { slug, epId, lang }
 * La langue est déduite du suffixe du slug (convention du site).
 */
export async function searchCandidates(query, opts = {}) {
    const json = await ajaxGet(`/ajax/search/suggest?keyword=${encodeURIComponent(query)}`, opts);
    if (!json || !json.html || typeof json.html !== 'string') return [];
    const out = [];
    const seen = new Set();
    const re = /href="https?:\/\/coflix\.wiki\/film\/([^"\/]+)\/ep-(\d+)"/g;
    let m;
    while ((m = re.exec(json.html)) !== null) {
        const slug = m[1];
        if (seen.has(slug)) continue;
        if (isExcludedSlug(slug)) continue;
        seen.add(slug);
        const lang = /-vostfr$/i.test(slug) ? 'ja'
            : /(-vf|-truefrench|-french)$/i.test(slug) ? 'fr' : null;
        out.push({ slug, epId: m[2], lang });
    }
    return out.slice(0, 8);
}

// ─── 2. Épisodes d'une série ────────────────────────────────────────────────
/**
 * Liste des épisodes du record série (movieId = data-id de la page).
 * Retourne [{ num, epId }] triés par numéro.
 */
async function listEpisodes(movieId, opts = {}) {
    return withCache(`eps_${movieId}`, async () => {
        const json = await ajaxGet(`/ajax/episode/list-episode?movieId=${encodeURIComponent(movieId)}`, opts);
        if (!json || !json.html || typeof json.html !== 'string') return [];
        const eps = [];
        const re = /data-num="(\d+)"[^>]*data-id="(\d+)"|data-id="(\d+)"[^>]*data-num="(\d+)"/g;
        let m;
        while ((m = re.exec(json.html)) !== null) {
            const num = parseInt(m[1] || m[4], 10);
            const epId = m[2] || m[3];
            if (num && epId) eps.push({ num, epId });
        }
        const byNum = new Map();
        for (const e of eps) if (!byNum.has(e.num)) byNum.set(e.num, e);
        return [...byNum.values()].sort((a, b) => a.num - b.num);
    }, { successTtl: 120000, failureTtl: 30000 });
}

/** data-id du record depuis une page /film/{slug}/ ou /film/{slug}/ep-{id}/. */
async function getMovieId(slug, opts = {}) {
    return withCache(`mid_${slug}`, async () => {
        const html = await fetchTextSafe(`${SITE}/film/${slug}/`, { ...opts, timeout: PAGE_TIMEOUT });
        if (!html) return null;
        const m = html.match(/id="watch-page"[^>]*data-id="(\d+)"/) || html.match(/data-id="(\d+)"/);
        return m ? m[1] : null;
    }, { successTtl: 300000, failureTtl: 60000 });
}

// ─── 3. Player (tous les embeds d'un épisode) ───────────────────────────────
/**
 * POST /ajax/episode/player?episode_id={epId} → liste d'embeds.
 * Chaque record : { version: 'VF'|'VOSTFR'|..., server_link, server_type }.
 * Retourne [{ url, lang }] — lang déduit de version, complété par le slug.
 */
async function getEpisodeEmbeds(epId, fallbackLang, opts = {}) {
    return withCache(`emb_${epId}`, async () => {
        const json = await ajaxPost(`/ajax/episode/player?episode_id=${encodeURIComponent(epId)}`,
            `episode_id=${encodeURIComponent(epId)}`, opts);
        if (!json || json.status === false || !Array.isArray(json.message)) return [];
        const out = [];
        for (const srv of json.message) {
            let url = srv && srv.server_link;
            if (url && typeof url === 'object' && url.url) url = url.url;
            if (!url || typeof url !== 'string' || !url.startsWith('http')) continue;
            if (isDeadUrl(url)) continue;
            const v = String(srv.version || '').toLowerCase();
            const lang = v.includes('vostfr') ? 'ja'
                : (v.includes('vf') || v.includes('french') || v.includes('true')) ? 'fr' : fallbackLang;
            out.push({ url, lang });
        }
        return out;
    }, { successTtl: 120000, failureTtl: 30000 });
}

// ─── Résolution ─────────────────────────────────────────────────────────────
async function resolveEmbedToStream(embedUrl, baseStream, signal) {
    try {
        const resolved = await resolveStream({ ...baseStream, url: embedUrl }, 0);
        if (!resolved || resolved.isDirect === false) return null;
        if (!resolved.url || resolved.url.includes('[object')) return null;
        return resolved;
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}

// ─── Pipeline principal ─────────────────────────────────────────────────────
/**
 * @param {string|number} tmdbId
 * @param {'tv'|'series'|'movie'} mediaType - 'series' normalisé en 'tv'
 * @param {string|number} [season]
 * @param {string|number} [episode]
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array>}
 */
export async function extractStreams(tmdbId, mediaType, season, episode, { signal } = {}) {
    const type = normalizeMediaType(mediaType);
    const epNum = Math.max(1, parseInt(episode, 10) || 1);
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);

    if (signal) setCurrentSignal(signal);

    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, type, { season: seasonNum });
    } catch (e) {
        if (isAborted(signal)) throw e;
    }
    if (!titles || titles.length === 0) return [];

    // 1. Recherche — ACCUMULER les candidats de toutes les requêtes (ne
    //    jamais réassigner : un titre alternatif à 0 résultat écraserait
    //    un bon hit précédent).
    const queries = [...new Set(titles.slice(0, MAX_SUGGEST_QUERIES).map((t) => String(t).trim()).filter(Boolean))];
    let candidates = [];
    const seenSlugs = new Set();
    for (const q of queries) {
        if (isAborted(signal)) return [];
        try {
            const batch = await searchCandidates(q, { signal });
            for (const c of batch || []) {
                if (!seenSlugs.has(c.slug)) {
                    seenSlugs.add(c.slug);
                    candidates.push(c);
                }
            }
        } catch (e) {
            if (isAborted(signal)) throw e;
        }
        if (candidates.length >= 3) break;
    }
    if (!candidates.length) return [];

    // 2. Score contre TOUTES les variantes TMDB → meilleur score.
    const scoreOf = (c) => {
        const slugClean = c.slug.replace(/-(vf|vostfr|truefrench|french)$/i, '');
        let best = 0;
        for (const t of titles.slice(0, 5)) {
            const s = titleScore(slugClean, String(t).trim());
            if (s > best) best = s;
        }
        return best;
    };
    const scored = candidates
        .map((c) => ({ ...c, score: scoreOf(c) }))
        .filter((c) => c.score >= 0.34)
        .sort((a, b) => b.score - a.score);

    const streams = [];
    const seenEmbeds = new Set();
    let langsResolved = 0;

    // 3. Par langue (VF puis VOSTFR) : retrouver le record et l'épisode
    for (const lang of ['fr', 'ja']) {
        if (isAborted(signal)) break;
        if (langsResolved >= MAX_LANGS) break;

        const langCands = scored.filter((c) => c.lang === lang);
        if (!langCands.length) continue;

        for (const cand of langCands.slice(0, 3)) {
            if (isAborted(signal)) break;

            let embeds = [];
            if (type === 'movie' || !seasonNum) {
                // Film : epId du suggest = fiche unique
                embeds = await getEpisodeEmbeds(cand.epId, lang, { signal });
            } else {
                // Série : list-episode du record → epId du numéro demandé.
                // Pas de repli "saison la plus proche" : jamais de faux épisode.
                const movieId = await getMovieId(cand.slug, { signal });
                if (!movieId) continue;
                const eps = await listEpisodes(movieId, { signal });
                const target = eps.find((e) => e.num === epNum);
                if (!target) continue;
                embeds = await getEpisodeEmbeds(target.epId, lang, { signal });
            }

            let resolvedThisLang = 0;
            for (const emb of embeds) {
                if (resolvedThisLang >= MAX_EMBEDS_PER_LANG) break;
                if (seenEmbeds.has(emb.url)) continue;
                seenEmbeds.add(emb.url);

                const baseStream = {
                    name: 'FrenchAnime',
                    title: `[${lang === 'fr' ? 'VF' : 'VOSTFR'}] Épisode ${epNum}`,
                    language: lang,
                    quality: 'HD',
                };
                const st = await resolveEmbedToStream(emb.url, baseStream, signal);
                if (!st) continue;
                delete st.isDirect;
                delete st.originalUrl;
                streams.push(st);
                resolvedThisLang++;
            }

            if (resolvedThisLang > 0) { langsResolved++; break; }
        }
    }

    return streams;
}
