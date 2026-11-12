/**
 * Extractor for Coflix — domaine actif : coflix.wiki (vérifié live 2026-09).
 *
 * Pourquoi l'ancien provider renvoyait 0 stream :
 *  - les domaines codés en dur (coflix.boston/.cymru/.esq/.group) sont derrière
 *    BotBlocker (fingerprinting + CAPTCHA + cookie signé) → tout échouait ;
 *  - coflix.fr est une vitrine white-label vers gupy.fr (offres SVOD légales,
 *    aucun lecteur) — l'API WP REST codée en dur n'a jamais existé.
 *
 * Nouvelle chaîne (API AJAX du thème, SANS challenge) :
 *   1. GET  /ajax/search/suggest?keyword={titre}     → {html} avec hrefs
 *      /film/{slug}-vf|vostfr|truefrench/ep-{epId}
 *   2. GET  /ajax/episode/list-episode?movieId={id}  → {html} data-num/data-id
 *      (les épisodes = epId directs, PAS des numéros)
 *   3. POST /ajax/episode/player?episode_id={epId}   → {message:[{version,
 *      server_link, server_type}]} — TOUS les embeds en une requête.
 *
 * Garde-fous (conventions repo) :
 *  - 'series' normalisé en 'tv' ;
 *  - embeds non résolus (isDirect:false) JAMAIS retournés ;
 *  - wrappers kakaflix (dood/voe sur ce site) = morts → écartés avant résolution.
 */

import { fetchText, fetchTextSafe, ajaxGet, ajaxPost, setCurrentSignal, ensureSite, SITE } from './http.js';
import { resolveStream, isAborted, safeFetch, withTimeout } from '../utils/resolvers.js';
import { isTurnstileSolverEnabled } from '../utils/turnstile.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { toStream, resolveSeasonEpisodeInputs } from '../utils/dle-extractor.js';
import { createCache } from '../utils/cache.js';

const withCache = createCache('cfw', 'Coflix');

const SEARCH_TIMEOUT = 12000;
const PAGE_TIMEOUT = 12000;
const RESOLVE_TIMEOUT = 9000;
// Un lecteur protégé par Turnstile (dood/playmogo) peut prendre plus longtemps
// quand l'utilisateur a activé le solveur dans les réglages du provider.
const embedTimeoutMs = () => (isTurnstileSolverEnabled() ? 26000 : 12000);
const MAX_LANGS = 2;             // VF + VOSTFR
const MAX_EMBEDS_PER_LANG = 2;   // lecteurs résolus par langue
const MAX_SUGGEST_QUERIES = 3;

// Hosts morts sur ce site (vérifié live 2026-09 : timeout 18 s) → écartés
const DEAD_HOSTS = ['kakaflix'];

/**
 * DIAG 2026-11 : le CDN `*.tnmr.org` répond **403 nginx** sur toute URL
 * tokenisée (avec/sans Referer, Origin, via proxy) → ces flux « ne se lancent
 * jamais ». Tous les lecteurs `livavid.sbs` y aboutissent : on évite même de
 * les sonder (12 s chacun).
 */
const SKIP_EMBED_HOSTS = ['livavid.', 'kakaflix.'];
const isSkippedEmbed = (u) => SKIP_EMBED_HOSTS.some((h) => String(u || '').toLowerCase().includes(h));

function isBlockedCdn(url) {
    const u = String(url || '').toLowerCase();
    return u.includes('tnmr.org') && !u.includes('cdn-tnmr.org');
}

function isDeadUrl(url) {
    const u = (url || '').toLowerCase();
    return DEAD_HOSTS.some(d => u.includes(d)) || isSkippedEmbed(u);
}

/** Marqueurs film/OAV dans un slug — interdits pour une demande TV. */
const FILM_MARKER = /(^|-)(le-film|film|movie|oav|ova|special)(-|$)/i;

/** Slug de film : marqueur explicite OU suffixe de numéro d'opus (`jujutsu-kaisen-0-vf`). */
function isFilmSlug(slug) {
    const s = String(slug || '').toLowerCase().replace(/-(vf|vostfr|truefrench|french)$/, '');
    return FILM_MARKER.test(s) || /-(0|1er|premier)$/.test(s);
}

/** Saison explicite d'un slug coflix (`…-saison-2-vf`). */
function slugSaison(slug) {
    const m = String(slug || '').match(/saison-(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
}

/** Distance d'édition (tolérance de frappe du catalogue, accents perdus). */
function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (!m || !n) return Math.max(m, n);
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        const t = prev; prev = cur; cur = t;
    }
    return prev[n];
}

function fuzzyWordMatch(q, w) {
    if (q === w) return true;
    if (q.length < 4 || w.length < 4) return false;
    const d = editDistance(q, w);
    return d <= (Math.max(q.length, w.length) >= 6 ? 2 : 1);
}

function normalizeMediaType(mediaType) {
    const t = String(mediaType || '').toLowerCase();
    if (t === 'movie' || t === 'film') return 'movie';
    return 'tv';
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

/** Score mots communs (mots ≥ 3 lettres, demi-poids sur 3).
 * Garde stricte anti-homonymes/spin-offs : tout mot significatif du slug (≥4
 * lettres, non générique) doit être expliqué par la requête (exact, préfixe ou
 * extension) — sinon score 0. Ex : requête "physical 100" vs slug
 * "physical-100-mexique-saison-1-vf" → "mexique" inexpliqué → rejet. */
function titleScore(candidate, query) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const qw = norm(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    if (!qw.length) return 0;
    const cw = new Set(norm(candidate).split(/[^a-z0-9]+/));
    let hits = 0;
    for (const w of qw) {
        if (cw.has(w)) hits += (w.length === 3 ? 0.5 : 1);
        else if ([...cw].some((c) => fuzzyWordMatch(w, c))) hits += (w.length === 3 ? 0.5 : 1);
    }
    const GENERIC = /(vf|vostfr|truefrench|french|saison|season|film|movie|episode|complete|integral|integrale|oav|special)$/;
    for (const w of cw) {
        if (w.length < 4 || GENERIC.test(w)) continue;
        if (qw.some((q) => q === w || (q.length >= 4 && (w.startsWith(q) || q.startsWith(w))) || fuzzyWordMatch(q, w))) continue;
        return 0; // mot étranger à la requête → pas ce titre
    }
    return hits / qw.length;
}

// ─── 1. Recherche ───────────────────────────────────────────────────────────
/**
 * Recherche suggest. Retourne des candidats dédupliqués par slug de série :
 *   { slug, epId, label, lang }
 * La langue est déduite du suffixe du slug (convention du site).
 */
export async function searchCandidates(query, opts = {}) {
    const json = await ajaxGet(`/ajax/search/suggest?keyword=${encodeURIComponent(query)}`, opts);
    if (!json || !json.html || typeof json.html !== 'string') return [];
    const out = [];
    const seen = new Set();
    // Domaine variable (coflix.gold aujourd'hui, coflix.wiki hier) : ne jamais
    // figer le TLD dans le parseur, sinon 0 candidat après rotation.
    const re = /href="https?:\/\/[a-z0-9.-]*coflix\.[a-z]+\/film\/([^"\/]+)\/ep-(\d+)"/g;
    let m;
    while ((m = re.exec(json.html)) !== null) {
        const slug = m[1];
        if (seen.has(slug)) continue;
        seen.add(slug);
        const lang = /-vostfr$/i.test(slug) ? 'ja'
            : /(-vf|-truefrench|-french)$/i.test(slug) ? 'fr' : 'fr';
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
        await ensureSite();
        const html = await fetchTextSafe(`${SITE}/film/${slug}/`, { ...opts, timeout: PAGE_TIMEOUT });
        if (!html) return null;
        const m = html.match(/id="watch-page"[\s\S]{0,200}?data-id="(\d+)"/) || html.match(/data-id="(\d+)"/);
        if (!m) return null;
        // data-ep-name (le 1er epId serve par la page) — clé du fallback séquentiel
        const epm = html.match(/data-ep-name="(\d+)"/) || html.match(/episode_play = { id : "(\d+)"/);
        return { movieId: m[1], baseEpId: epm ? epm[1] : null };
    }, { successTtl: 300000, failureTtl: 60000 });
}

/**
 * Épisode d'une série. Deux modes :
 *  1) list-episode → data-num/data-id (records "complets")
 *  2) Fallback ID séquentiel : les records d'une saison exposent le 1er épisode
 *     (data-ep-name) et les epIds du site sont s________ consécutifs pour la
 *     saison entière (vérifié live 2026-10 : AOT VF S1 = 208555→208579, 25/25).
 *     On POST /ajax/episode/player sur base+offset jusqu'à trouver l'épisode.
 * Retourne `epId` correspondant au numéro demandé ou null.
 */
async function findEpisodeId(movieId, baseEpId, epNum, opts = {}) {
    // Mode 1 : listing complet d'abord (rapide, 1 requête, cache 120s)
    const eps = await listEpisodes(movieId, opts);
    const target = eps.find((e) => e.num === epNum);
    if (target) return target.epId;
    // Mode 2 : IDs séquentiels (base = data-ep-name de la page courante)
    if (!baseEpId) return null;
    const base = parseInt(baseEpId, 10);
    if (!Number.isFinite(base) || base <= 0) return null;
    // Sonde base+epNum-1 puis quelques voisins (gaps éventuels dans la numérotation interne)
    for (let extra = 0; extra <= 4; extra++) {
        const candId = String(base + epNum - 1 + extra);
        // Ne PAS passer par getEpisodeEmbeds (cache) ici : on teste la présence.
        const json = await ajaxPost(`/ajax/episode/player?episode_id=${candId}`, `episode_id=${candId}`, opts);
        if (json && Array.isArray(json.message) && json.message.length > 0) return candId;
    }
    return null;
}

// ─── 3. Player (tous les embeds d'un épisode) ─────────────────────────────
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
            const fromVersion = v.includes('vostfr') ? 'ja'
                : (v.includes('vf') || v.includes('french') || v.includes('true')) ? 'fr' : null;
            // ⚠ Le champ `version` du thème vaut « VF » même sur les fiches
            // `-vostfr` (vérifié live) → la langue du slug est autoritaire.
            const lang = fallbackLang || fromVersion || 'fr';
            out.push({ url, lang });
        }
        return out;
    }, { successTtl: 120000, failureTtl: 30000 });
}

/**
 * Repli catalogue : la suggestion du thème n'indexe qu'une partie du catalogue.
 * `/filter?keyword=` liste TOUS les enregistrements correspondants (films ET
 * séries) — 1 requête HTML, mêmes slugs que suggest.
 */
export async function searchFilterCandidates(query, opts = {}) {
    await ensureSite();
    const html = await fetchTextSafe(`${SITE}/filter?keyword=${encodeURIComponent(query)}`, {
        ...opts,
        timeout: PAGE_TIMEOUT,
    });
    if (!html) return [];
    const out = [];
    const seen = new Set();
    const re = /href="https?:\/\/[a-z0-9.-]*coflix\.[a-z]+\/film\/([^"\/]+)\/?"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const slug = m[1];
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        const lang = /-vostfr$/i.test(slug) ? 'ja'
            : /(-vf|-truefrench|-french)$/i.test(slug) ? 'fr' : 'fr';
        out.push({ slug, epId: null, lang });
    }
    return out.slice(0, 12);
}

/** Premier `ep-{id}` de la fiche (films) — quand /filter n'en donne pas. */
async function getFirstEpId(slug, opts = {}) {
    return withCache(`fep_${slug}`, async () => {
        await ensureSite();
        const html = await fetchTextSafe(`${SITE}/film/${slug}/`, { ...opts, timeout: PAGE_TIMEOUT });
        if (!html) return null;
        const m = html.match(/\/ep-(\d+)/) || html.match(/data-id="(\d+)"/);
        return m ? m[1] : null;
    }, { successTtl: 300000, failureTtl: 60000 });
}

/**
 * Titres localisés TMDB (fr-FR). Les métadonnées bundlées n'exposent pas
 * toujours le titre FR (« Spirited Away » sans « Le Voyage de Chihiro ») alors
 * que le catalogue coflix est en français → introuvable.
 */
const TMDB_API_KEY =
    (typeof globalThis !== 'undefined' && globalThis.TMDB_API_KEY) || '8265bd1679663a7ea12ac168da84d2e8';

async function fetchLocalizedTitles(tmdbId, mediaType, signal) {
    const out = [];
    if (!/^\d+$/.test(String(tmdbId))) return out;
    const kind = mediaType === 'movie' ? 'movie' : 'tv';
    try {
        const res = await safeFetch(
            `https://api.themoviedb.org/3/${kind}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`,
            { headers: { Accept: 'application/json' }, timeout: 10000, signal }
        );
        const text = res ? await res.text().catch(() => '') : '';
        if (!text) return out;
        const json = JSON.parse(text);
        for (const t of [json.title, json.name]) {
            if (typeof t === 'string' && t.trim().length >= 2 && !out.includes(t.trim())) out.push(t.trim());
        }
    } catch (e) { /* repli optionnel */ }
    return out;
}

// ─── Résolution ─────────────────────────────────────────────────────────────
async function resolveEmbedToStream(embedUrl, baseStream, signal) {
    try {
        const resolved = await resolveStream({ ...baseStream, url: embedUrl }, 0);
        if (!resolved || resolved.isDirect === false) return null;
        if (!resolved.url || resolved.url.includes('[object')) return null;
        if (isBlockedCdn(resolved.url)) {
            console.log(`[Coflix] CDN bloqué (403) ignoré : ${resolved.url.slice(0, 60)}…`);
            return null;
        }
        return resolved;
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}

// ─── Pipeline principal ─────────────────────────────────────────────────────
export async function extractStreams(tmdbId, mediaType, season, episode, { signal } = {}) {
    const type = normalizeMediaType(mediaType);

    // NuvioTV (videoId anime kitsu:/mal:/anilist:) envoie season=null + épisode
    // ABSOLU. Les pages Coflix sont par saison : sans reverse-map, l'absolu
    // était cherché en saison 1 → 0 stream / faux épisode.
    const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, { mediaType: type });
    const epNum = Math.max(1, se.episode);
    const seasonNum = Math.max(1, se.season);

    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, type, { season: seasonNum });
    } catch (e) {
        if (isAborted(signal)) throw e;
    }
    if (!titles || titles.length === 0) return [];

    // 1. Recherche (requêtes dédupliquées, budget serré)
    // FIX : ACCUMULER les candidats de toutes les requêtes — l'ancien code
    // réassignait `candidates =` à chaque itération, donc un titre alternatif
    // renvoyant 0 écrasait le bon résultat de la requête précédente
    // (ex: 4935 = Howl : "Le Château ambulant" → 1 hit, puis les variantes
    // exotiques → 0 → pipeline mort).
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
    // 2. Score contre TOUTES les variantes TMDB (le site utilise parfois le
    //    titre FR quand TMDB expose le titre EN en primary : Vaiana/Moana) →
    //    on prend le meilleur score pour éviter les faux rejets.
    const scoreTitles = [...titles];
    const scoreOf = (c) => {
        const slugClean = c.slug.replace(/-(vf|vostfr|truefrench|french)$/i, '');
        let best = 0;
        for (const t of scoreTitles.slice(0, 6)) {
            const s = titleScore(slugClean, String(t).trim());
            if (s > best) best = s;
        }
        return best;
    };
    const buildScored = (list) => list
        .map((c) => ({ ...c, score: scoreOf(c) }))
        .filter((c) => c.score >= 0.34)
        // Garde film vs série : un film ne répond jamais à une demande TV
        // (`jujutsu-kaisen-0-vf` servait S2E1) et une page saisonnée n'est
        // jamais le film demandé.
        .filter((c) => type === 'movie' || !isFilmSlug(c.slug))
        .filter((c) => {
            const ss = slugSaison(c.slug);
            if (type === 'movie') return ss == null;
            if (ss != null && ss !== seasonNum) return false;
            return true;
        })
        .sort((a, b) => b.score - a.score);

    let scored = buildScored(candidates);
    let localized = null;

    // Repli titres FR (catalogue du site en français)
    if (scored.length === 0) {
        localized = await fetchLocalizedTitles(tmdbId, type, signal);
        if (localized.length > 0) {
            console.log(`[Coflix] Repli titres FR: ${localized.join(' | ')}`);
            scoreTitles.unshift(...localized);
            for (const q of localized.slice(0, 3)) {
                if (isAborted(signal)) break;
                try {
                    const batch = await searchCandidates(q, { signal });
                    for (const c of batch || []) {
                        if (!seenSlugs.has(c.slug)) { seenSlugs.add(c.slug); candidates.push(c); }
                    }
                } catch (e) { if (isAborted(signal)) throw e; }
            }
            scored = buildScored(candidates);
        }
    }

    // Repli `/filter?keyword=` (le suggest n'indexe pas tout le catalogue)
    if (scored.length === 0) {
        const filterQueries = [...new Set([...(localized || []), ...queries])].slice(0, 4);
        for (const q of filterQueries) {
            if (isAborted(signal)) break;
            try {
                const extra = await searchFilterCandidates(q, { signal });
                for (const c of extra) {
                    if (!seenSlugs.has(c.slug)) { seenSlugs.add(c.slug); candidates.push(c); }
                }
            } catch (e) { if (isAborted(signal)) throw e; }
            scored = buildScored(candidates);
            if (scored.length > 0) break;
        }
        if (candidates.length > 0) {
            console.log(`[Coflix] Repli filtre: ${candidates.length} candidat(s), ${scored.length} retenu(s)`);
        }
    }
    if (scored.length === 0) return [];
    console.log(`[Coflix] Candidats: ${scored.slice(0, 4).map((c) => `${c.slug}(${c.score.toFixed(2)}${c.lang ? ',' + c.lang : ''})`).join(', ')}`);

    const streams = [];
    const seenEmbeds = new Set();
    let langsResolved = 0;
    const startTime = Date.now();
    const DEADLINE_MS = 38000;
    const overBudget = () => Date.now() - startTime > DEADLINE_MS;

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
                // Film : epId du suggest = fiche unique ; candidats issus de
                // /filter n'en ont pas → on le lit sur la page du film.
                const epId = cand.epId || (await getFirstEpId(cand.slug, { signal }));
                if (!epId) continue;
                embeds = await getEpisodeEmbeds(epId, lang, { signal });
            } else {
                // Série : list-episode (mode 1) → fallback IDs séquentiels (mode 2)
                const rec = await getMovieId(cand.slug, { signal });
                if (!rec) continue;
                const movieId = typeof rec === 'object' ? rec.movieId : rec;
                const baseEpId = typeof rec === 'object' ? rec.baseEpId : null;
                const epId = await findEpisodeId(movieId, baseEpId || cand.epId, epNum, { signal });
                if (!epId) continue; // épisode absent du site : pas de repli
                embeds = await getEpisodeEmbeds(epId, lang, { signal });
            }

            // Lecteurs qui répondent vite et ne passent pas par tnmr.org d'abord.
            const hostRank = (u) => {
                const s = String(u || '').toLowerCase();
                if (s.includes('vidzy')) return 0;
                if (s.includes('uqload')) return 1;
                if (s.includes('byse')) return 2;
                if (s.includes('fsvid')) return 3;
                return 5;
            };
            embeds = [...embeds]
                .filter((e) => !isSkippedEmbed(e.url))
                .sort((a, b) => hostRank(a.url) - hostRank(b.url));

            let resolvedThisLang = 0;
            for (const emb of embeds) {
                if (resolvedThisLang >= MAX_EMBEDS_PER_LANG) break;
                if (overBudget()) {
                    console.warn('[Coflix] Budget de résolution atteint — arrêt');
                    return streams;
                }
                if (seenEmbeds.has(emb.url)) continue;
                seenEmbeds.add(emb.url);

                const baseStream = {
                    name: 'Coflix',
                    title: type === 'movie'
                        ? `[${lang === 'fr' ? 'VF' : 'VOSTFR'}] Film`
                        : `[${lang === 'fr' ? 'VF' : 'VOSTFR'}] Épisode ${epNum}`,
                    language: lang,
                    quality: 'HD',
                };
                const st = await withTimeout(
                    resolveEmbedToStream(emb.url, baseStream, signal),
                    embedTimeoutMs(),
                    'coflix embed'
                ).catch(() => null);
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
