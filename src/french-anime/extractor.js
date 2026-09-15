/**
 * Extractor for French-Anime (french-anime.com).
 *
 * Architecture réelle (diagnostic live + archive 2026-09) :
 *  - french-anime.com = site DLE réel : fiches /animes-vf/{id}-{slug}.html et
 *    /animes-vostfr/{id}-{slug}.html (ex: /animes-vf/1084-chainsaw-man.html,
 *    12 épisodes × 4 serveurs : uqload.bz, vudeo.co, upstream.to, vvide0.com).
 *    Les épisodes sont INLINE dans la fiche : <div class="eps">1!url,url\n2!…</div>.
 *    Le site est derrière un Cloudflare managed challenge — bloqué depuis les
 *    IP datacenter, mais les IP résidentielles (réseau de l'app) passent.
 *  - Le même catalogue (et une partie seulement : ex. Chainsaw Man série
 *    absente) est servi par coflix.wiki via une API AJAX sans challenge.
 *
 * Stratégie :
 *  1. Canal DIRECT : extraction DLE sur french-anime.com (recherche POST DLE,
 *     fiche, parsing `class="eps"`, résolution des embeds).
 *  2. Fallback : si challenge CF → coflix.wiki (même pipeline que le provider
 *     Coflix, jamais de repli "fiche la plus proche").
 *
 * Garde-fous (conventions repo) :
 *  - 'series' normalisé en 'tv' ;
 *  - langue dérivée de la catégorie d'URL (animes-vf → fr, animes-vostfr → ja) ;
 *  - saison : fiche avec marqueur explicite (saison-N / suffixe -N) requis pour
 *    S2+ ; jamais de repli cross-saison (leçon Gate/Steins-Gate) ;
 *  - exclusions anti-faux-match homonymes ;
 *  - 0 stream propre > faux stream.
 */

import { fetchFaText, fetchTextSafe, ajaxGet, ajaxPost, setCurrentSignal, FA_SITE, SITE } from './http.js';
import { resolveStream, isAborted, safeFetch } from '../utils/resolvers.js';
import { createCache } from '../utils/cache.js';
import { getTmdbTitles } from '../utils/metadata.js';

const withCache = createCache('fra', 'FrenchAnime');

const PAGE_TIMEOUT = 12000;
const MAX_SUGGEST_QUERIES = 5;
const MAX_EMBEDS_PER_LANG = 2;
const MAX_LANGS = 2;

/** Hosts confirmés morts/irrésolvables (2026-09). */
const DEAD_HOSTS = ['kakaflix', 'upstream.to'];

/** Faux-matchs homonymes à exclure (leçon du sweep Gate 63663). */
const EXCLUDED_SLUGS = [
    'steins-gate',
    'the-new-gate',
    'divine-gate',
    'mister-gates',
    'corruption-of-champions',
];

/** Marqueurs de film/OAV dans un slug — interdits pour une demande TV. */
const FILM_MARKER = /(^|-)(le-film|film|movie|oav|ova|special)(-|$)/i;

function isDeadUrl(url) {
    const u = (url || '').toLowerCase();
    return DEAD_HOSTS.some(d => u.includes(d));
}

function isExcludedSlug(slug) {
    const s = String(slug || '').toLowerCase();
    return EXCLUDED_SLUGS.some((x) => s.includes(x));
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

/** Numéro de saison explicite dans un slug DLE (ex: ...-saison-2, ...-2-french). */
function slugSeason(slug) {
    const s = String(slug || '').toLowerCase();
    let m = s.match(/saison-(\d+)/);
    if (m) return parseInt(m[1], 10);
    m = s.replace(/-(french|vf|vostfr|truefrench)$/, '').match(/-(\d+)$/);
    if (m) return parseInt(m[1], 10);
    return null;
}

// ════════════════════════════════════════════════════════════════════════════
// CANAL DIRECT — french-anime.com (DLE)
// ════════════════════════════════════════════════════════════════════════════

/** Parse un contenu de fiche DLE : lignes `<num>!<url1>,<url2>,…`. */
export function parseEpsBlocks(html) {
    if (!html) return new Map();
    const out = new Map();
    const blockMatch = html.match(/<div[^>]*class="eps"[^>]*>([\s\S]*?)<\/div>/i);
    const body = blockMatch ? blockMatch[1] : html;
    const re = /(\d+)!(https?:\/\/[^\s<]+)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        const num = parseInt(m[1], 10);
        if (!num || out.has(num)) continue;
        out.set(num, m[2].split(',').map((u) => u.trim()).filter(Boolean));
    }
    return out;
}

/**
 * Recherche DLE sur french-anime.com. Retourne [{ slug, id, cat, label }]
 * (cat = 'vf' | 'vostfr'). null si challenge CF (déclenche le fallback).
 */
async function searchDirect(query, opts = {}) {
    try {
        const html = await fetchFaText(`${FA_SITE}/index.php?do=search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `${FA_SITE}/`,
            },
            body: `do=search&subaction=search&story=${encodeURIComponent(query)}`,
            timeout: PAGE_TIMEOUT,
            ...opts,
        });
        if (!html) return [];
        const out = [];
        const seen = new Set();
        const re = /href="https?:\/\/french-anime\.com\/animes-(vf|vostfr)\/(\d+)-([^"\/]+?)\.html"[^>]*(?:title="([^"]*)")?[^>]*>([^<]*)/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const cat = m[1].toLowerCase();
            const id = m[2];
            const slug = m[3];
            const key = `${cat}/${slug}`;
            if (seen.has(key) || isExcludedSlug(slug)) continue;
            seen.add(key);
            const label = (m[4] || m[5] || '').trim();
            out.push({ slug, id, cat, label });
        }
        return out;
    } catch (e) {
        if (isAborted(opts.signal || null)) throw e;
        if (e.blocked) throw e; // signaler le challenge au pipeline
        return [];
    }
}

/** Fiche directe : retourne la Map épisodes → urls, ou null si CF bloque. */
async function fetchDirectArticle(url, opts = {}) {
    try {
        return await fetchFaText(url, { timeout: PAGE_TIMEOUT, ...opts });
    } catch (e) {
        if (isAborted(opts.signal || null)) throw e;
        if (e.blocked) throw e;
        return null;
    }
}

/**
 * Canal direct complet. Retourne les streams, ou **null** si le site est
 * CF-challengé (pour déclencher le fallback coflix).
 */
async function extractFromFrenchAnime(titles, mediaType, season, episode, opts = {}) {
    const signal = opts.signal || null;
    const epNum = Math.max(1, parseInt(episode, 10) || 1);
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);
    const isMovie = mediaType === 'movie';
    const targetSeason = isMovie ? 1 : seasonNum;

    // 1. Recherche (requêtes dédupliquées, ACCUMULATION obligatoire)
    const queries = [...new Set(titles.slice(0, MAX_SUGGEST_QUERIES).map((t) => String(t).trim()).filter(Boolean))];
    const cleanedQueries = [];
    for (const q of queries) {
        cleanedQueries.push(q);
        const cleaned = cleanTitleForSlug(String(titles[0] || q)).replace(/-/g, ' ');
        if (cleaned && cleaned !== q.toLowerCase()) cleanedQueries.push(cleaned);
    }
    const seenQuery = new Set();
    const allResults = [];
    const seenSlugs = new Set();
    try {
        for (const q of cleanedQueries) {
            if (isAborted(signal)) return [];
            const key = q.toLowerCase();
            if (seenQuery.has(key)) continue;
            seenQuery.add(key);
            const batch = await searchDirect(q, { signal });
            for (const r of batch || []) {
                if (!seenSlugs.has(r.cat + '/' + r.slug)) {
                    seenSlugs.add(r.cat + '/' + r.slug);
                    allResults.push(r);
                }
            }
            if (allResults.length >= 6) break;
        }
    } catch (e) {
        if (e.blocked) return null; // → fallback coflix
        throw e;
    }
    if (!allResults.length) return [];

    // 2. Score : mots du titre + garde saison explicite
    const langOf = (cat) => (cat === 'vf' ? 'fr' : 'ja');
    const scored = [];
    for (const r of allResults) {
        const slugClean = r.slug.replace(/-(french|vf|vostfr|truefrench)$/i, '');
        let best = 0;
        for (const t of titles.slice(0, 5)) {
            const s = titleScore(slugClean, String(t).trim());
            if (s > best) best = s;
        }
        if (best < 0.5) continue; // exige une vraie correspondance de titre
        const sSeason = slugSeason(r.slug);
        // Garde anti cross-saison : S2+ exige un marqueur explicite égal.
        if (!isMovie && targetSeason > 1 && sSeason !== targetSeason) continue;
        // S1 : préférer sans marqueur ou saison-1 ; refuser saison marquée ≠ 1
        if (!isMovie && targetSeason === 1 && sSeason !== null && sSeason !== 1) continue;
        // Movie : une page de série (saison marquée) ne peut pas répondre
        if (isMovie && sSeason !== null) continue;
        scored.push({ ...r, score: best + (langOf(r.cat) === 'fr' ? 0.05 : 0) });
    }
    if (!scored.length) return [];
    scored.sort((a, b) => b.score - a.score);

    // 3. Fiches (une par langue dispo), parsing épisodes inline
    const streams = [];
    const seenEmbeds = new Set();
    let langsResolved = 0;
    for (const lang of ['fr', 'ja']) {
        if (isAborted(signal)) break;
        if (langsResolved >= MAX_LANGS) break;
        const cat = lang === 'fr' ? 'vf' : 'vostfr';
        const langCands = scored.filter((c) => c.cat === cat).slice(0, 2);
        for (const cand of langCands) {
            if (isAborted(signal)) break;
            let html = null;
            try {
                html = await fetchDirectArticle(`${FA_SITE}/animes-${cat}/${cand.id}-${cand.slug}.html`, { signal });
            } catch (e) {
                if (e.blocked) return null; // challenge en cours de pipeline → fallback
                continue;
            }
            if (!html) continue;
            const eps = parseEpsBlocks(html);
            let urls = eps.get(epNum);
            if (!urls || !urls.length) continue;

            let resolvedThisLang = 0;
            for (const url of urls) {
                if (resolvedThisLang >= MAX_EMBEDS_PER_LANG) break;
                if (seenEmbeds.has(url) || isDeadUrl(url)) continue;
                seenEmbeds.add(url);
                const baseStream = {
                    name: 'FrenchAnime',
                    title: `[${lang === 'fr' ? 'VF' : 'VOSTFR'}] Épisode ${epNum}`,
                    language: lang,
                    quality: 'HD',
                };
                let st = null;
                try {
                    const resolved = await resolveStream({ ...baseStream, url }, 0);
                    if (!resolved || resolved.isDirect === false) continue;
                    if (!resolved.url || resolved.url.includes('[object')) continue;
                    st = resolved;
                } catch (e) {
                    if (isAborted(signal)) throw e;
                    continue;
                }
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

// ════════════════════════════════════════════════════════════════════════════
// FALLBACK — coflix.wiki (API AJAX, sans challenge)
// ════════════════════════════════════════════════════════════════════════════

/** Recherche suggest coflix. Candidats dédupliqués, hors exclusions. */
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
        out.push({ slug, epId: m[2], lang, isFilm: FILM_MARKER.test(slug) });
    }
    return out.slice(0, 8);
}

/** Liste des épisodes du record série (movieId = data-id de la page). */
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

/** data-id du record depuis une page /film/{slug}/. */
async function getMovieId(slug, opts = {}) {
    return withCache(`mid_${slug}`, async () => {
        const html = await fetchTextSafe(`${SITE}/film/${slug}/`, { ...opts, timeout: PAGE_TIMEOUT });
        if (!html) return null;
        const m = html.match(/id="watch-page"[^>]*data-id="(\d+)"/) || html.match(/data-id="(\d+)"/);
        return m ? m[1] : null;
    }, { successTtl: 300000, failureTtl: 60000 });
}

/** POST /ajax/episode/player → [{ url, lang }]. */
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

/** Pipeline coflix (fallback). Retourne [] si rien, jamais de faux contenu. */
async function extractFromCoflix(titles, mediaType, season, episode, opts = {}) {
    const signal = opts.signal || null;
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const epNum = Math.max(1, parseInt(episode, 10) || 1);
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);

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
        // Garde film/OAV : un film ne peut jamais répondre à une demande TV
        // (le record expose un épisode 1 factice — faux contenu Chainsaw Man).
        .filter((c) => type === 'movie' || !c.isFilm)
        .sort((a, b) => b.score - a.score);

    const streams = [];
    const seenEmbeds = new Set();
    let langsResolved = 0;

    for (const lang of ['fr', 'ja']) {
        if (isAborted(signal)) break;
        if (langsResolved >= MAX_LANGS) break;

        const langCands = scored.filter((c) => c.lang === lang);
        if (!langCands.length) continue;

        for (const cand of langCands.slice(0, 3)) {
            if (isAborted(signal)) break;

            let embeds = [];
            if (type === 'movie' || !seasonNum) {
                embeds = await getEpisodeEmbeds(cand.epId, lang, { signal });
            } else {
                const movieId = await getMovieId(cand.slug, { signal });
                if (!movieId) continue;
                const eps = await listEpisodes(movieId, { signal });
                const target = eps.find((e) => e.num === epNum);
                if (!target) continue; // épisode absent : pas de repli
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

// ════════════════════════════════════════════════════════════════════════════
// Pipeline principal
// ════════════════════════════════════════════════════════════════════════════
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

    if (signal) setCurrentSignal(signal);

    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, type, { season: parseInt(season, 10) || 1 });
    } catch (e) {
        if (isAborted(signal)) throw e;
    }
    if (!titles || titles.length === 0) return [];

    // 1. Canal direct (french-anime.com DLE). null = challenge CF → fallback.
    let direct = null;
    try {
        direct = await extractFromFrenchAnime(titles, type, season, episode, { signal });
    } catch (e) {
        if (isAborted(signal)) throw e;
        direct = null;
    }
    if (direct === null) {
        console.log('[FrenchAnime] Challenge CF sur french-anime.com → fallback coflix.wiki');
        return extractFromCoflix(titles, type, season, episode, { signal });
    }
    if (direct.length > 0) return direct;

    // 2. Titre introuvable en direct (ou épisode absent) : le catalogue du
    //    showcase est aussi porté par coflix.wiki — tenter le fallback avant
    //    de conclure à l'absence.
    return extractFromCoflix(titles, type, season, episode, { signal });
}
