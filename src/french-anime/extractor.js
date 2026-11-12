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

import { fetchFaText, fetchTextSafe, ajaxGet, ajaxPost, setCurrentSignal, ensureSite, FA_SITE, SITE } from './http.js';
import { resolveStream, isAborted, safeFetch, withTimeout } from '../utils/resolvers.js';
import { createCache } from '../utils/cache.js';
import { isTurnstileSolverEnabled } from '../utils/turnstile.js';
import { getTmdbTitles } from '../utils/metadata.js';

const withCache = createCache('fra', 'FrenchAnime');

const PAGE_TIMEOUT = 12000;
const MAX_SUGGEST_QUERIES = 8;

/**
 * Titres localisés TMDB (fr-FR). Les métadonnées bundlées n'exposent pas
 * toujours le titre FR (« Spirited Away » sans « Le Voyage de Chihiro ») et
 * les deux canaux (french-anime.com / coflix) cataloguent en FR → un film
 * pourtant présent restait introuvable.
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
// 2 lecteurs/langue : l'ordre d'hôtes est trié (vidzy/uqload d'abord), donc
// 2 essais suffisent. Au-delà on ne faisait que payer des CDN muets.
const MAX_EMBEDS_PER_LANG = 2;

// Lecteurs qui passent systématiquement par le CDN tnmr.org (403) ou par une
// SPA JS : sondés pour rien (12 s chacun, vérifié 2026-11).
const SKIP_EMBED_HOSTS = ['livavid.', 'kakaflix.'];
const isSkippedEmbed = (u) => SKIP_EMBED_HOSTS.some((h) => String(u || '').toLowerCase().includes(h));
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

/**
 * Slug de film sur coflix : marqueur explicite OU suffixe de numéro d'opus
 * (`jujutsu-kaisen-0-vf` = le film JJK 0, qui était servi pour « S2E1 »).
 */
function isFilmSlug(slug) {
    const s = String(slug || '').toLowerCase().replace(/-(vf|vostfr|truefrench|french)$/, '');
    return FILM_MARKER.test(s) || /-(0|1er|premier)$/.test(s);
}

/** Saison explicite d'un slug coflix (`…-saison-2-vf`). */
function slugSaison(slug) {
    const m = String(slug || '').match(/saison-(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
}

/**
 * Tolérance de frappe : le site perd parfois des lettres accentuées dans ses
 * slugs (« Le Garçon et le Héron » → `Le-Garon-et-le-hron`). Un mot quasi
 * identique (1-2 éditions) doit compter comme un hit.
 */
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

function isDeadUrl(url) {
    const u = (url || '').toLowerCase();
    return DEAD_HOSTS.some(d => u.includes(d));
}

/**
 * CDN qui répond 403 sur toute URL tokenisée (re-vérifié 2026-11 :
 * `3duxixhjxwkg.tnmr.org/hls2/…/index-v1-a1.m3u8` → 403 nginx, avec ou sans
 * Referer Origin). Servir ces URL produit un flux qui ne démarre jamais →
 * on garde les autres lecteurs du même épisode.
 */
function isBlockedCdn(url) {
    const u = String(url || '').toLowerCase();
    return u.includes('tnmr.org') && !u.includes('cdn-tnmr.org');
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
                    if (isBlockedCdn(resolved.url)) continue;
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
    // Domaine variable (coflix.gold aujourd'hui, coflix.wiki hier) : ne jamais
    // figer le TLD dans le parseur, sinon 0 candidat après rotation.
    const re = /href="https?:\/\/[a-z0-9.-]*coflix\.[a-z]+\/film\/([^"\/]+)\/ep-(\d+)"/g;
    let m;
    while ((m = re.exec(json.html)) !== null) {
        const slug = m[1];
        if (seen.has(slug)) continue;
        if (isExcludedSlug(slug)) continue;
        seen.add(slug);
        const lang = /-vostfr$/i.test(slug) ? 'ja'
            : /(-vf|-truefrench|-french)$/i.test(slug) ? 'fr' : 'fr';
        out.push({ slug, epId: m[2], lang, isFilm: FILM_MARKER.test(slug) });
    }
    return out.slice(0, 8);
}

/**
 * Repli catalogue : la recherche « suggest » du thème n'indexe qu'une partie
 * du catalogue (ex. « attack on titan » → 2 films, la série est absente).
 * `/filter?keyword=` liste TOUS les enregistrements correspondants (films ET
 * séries) — 1 requête HTML, même format de slug que suggest.
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
    const re = /href="https?:\/\/[a-z0-9.-]*coflix\.[a-z]+\/film\/([^"\/]+)\/(?:ep-)?(\d+)?"?/g;
    // 1re passe : slugs nus (sans /ep-), pour ne pas dupliquer les entrées
    const slugRe = /href="https?:\/\/[a-z0-9.-]*coflix\.[a-z]+\/film\/([^"\/]+)\/?"/g;
    let m;
    while ((m = slugRe.exec(html)) !== null) {
        const slug = m[1];
        if (!slug || seen.has(slug) || isExcludedSlug(slug)) continue;
        seen.add(slug);
        const lang = /-vostfr$/i.test(slug) ? 'ja'
            : /(-vf|-truefrench|-french)$/i.test(slug) ? 'fr' : 'fr';
        out.push({ slug, epId: null, lang, isFilm: FILM_MARKER.test(slug) });
    }
    if (out.length === 0) {
        while ((m = re.exec(html)) !== null) {
            const slug = m[1];
            if (!slug || seen.has(slug)) continue;
            seen.add(slug);
            const lang = /-vostfr$/i.test(slug) ? 'ja' : /(-vf|-truefrench|-french)$/i.test(slug) ? 'fr' : null;
            out.push({ slug, epId: m[2] || null, lang, isFilm: FILM_MARKER.test(slug) });
        }
    }
    return out.slice(0, 12);
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
        await ensureSite();
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
            // ⚠ Le champ `version` du thème vaut « VF » même pour les fiches
            // `-vostfr` (vérifié en live sur one-piece-saison-2-vostfr) → il ne
            // sert qu'en dernier recours : la langue du slug est autoritaire.
            const v = String(srv.version || '').toLowerCase();
            const fromVersion = v.includes('vostfr') ? 'ja'
                : (v.includes('vf') || v.includes('french') || v.includes('true')) ? 'fr' : null;
            const lang = fallbackLang || fromVersion || 'fr';
            out.push({ url, lang });
        }
        return out;
    }, { successTtl: 120000, failureTtl: 30000 });
}

/** Premier `ep-{id}` de la fiche (films) — utilisé quand /filter n'en donne pas. */
async function getFirstEpId(slug, opts = {}) {
    return withCache(`fep_${slug}`, async () => {
        await ensureSite();
        const html = await fetchTextSafe(`${SITE}/film/${slug}/`, { ...opts, timeout: PAGE_TIMEOUT });
        if (!html) return null;
        const m = html.match(/\/ep-(\d+)/) || html.match(/data-id="(\d+)"/);
        return m ? m[1] : null;
    }, { successTtl: 300000, failureTtl: 60000 });
}

async function resolveEmbedToStream(embedUrl, baseStream, signal) {
    try {
        const resolved = await resolveStream({ ...baseStream, url: embedUrl }, 0);
        if (!resolved || resolved.isDirect === false) return null;
        if (!resolved.url || resolved.url.includes('[object')) return null;
        if (isBlockedCdn(resolved.url)) {
            console.log(`[FrenchAnime] CDN bloqué (403) ignoré : ${resolved.url.slice(0, 60)}…`);
            return null;
        }
        return resolved;
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}

/** Pipeline coflix (fallback). Retourne [] si rien, jamais de faux contenu. */
async function extractFromCoflix(tmdbId, titles, mediaType, season, episode, opts = {}) {
    const signal = opts.signal || null;
    // Budget interne : la résolution d'un lecteur lent (CDN muet, iframe JS)
    // ne doit pas manger les 45 s du plugin (mesuré 37 s sur un film).
    const startTime = Date.now();
    const DEADLINE_MS = 38000;
    const overBudget = () => Date.now() - startTime > DEADLINE_MS;
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const epNum = Math.max(1, parseInt(episode, 10) || 1);
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);

    let queries = [...new Set(titles.slice(0, MAX_SUGGEST_QUERIES).map((t) => String(t).trim()).filter(Boolean))];
    let candidates = [];
    const seenSlugs = new Set();
    const runQueries = async (list) => {
        for (const q of list) {
            if (isAborted(signal)) return;
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
    };
    await runQueries(queries);

    // Le catalogue coflix est en français : le titre FR localisé doit
    // participer au scoring, sinon un film trouvé via /filter (titre FR
    // uniquement) est rejeté à 0 (cas « Le Voyage de Chihiro »).
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
        // Garde film/OAV : un film ne peut jamais répondre à une demande TV
        // (le record expose un épisode 1 factice — « Jujutsu Kaisen 0 » servi
        // pour JJK S2E1, « Chainsaw Man le film » pour la série).
        .filter((c) => type === 'movie' || (!c.isFilm && !isFilmSlug(c.slug)))
        .filter((c) => {
            const ss = slugSaison(c.slug);
            if (type === 'movie') return ss == null;        // page saison ≠ film
            if (ss != null && ss !== seasonNum) return false; // autre saison
            return true;
        })
        .sort((a, b) => b.score - a.score);

    let scored = buildScored(candidates);
    let localized = null;

    // Repli titre FR : les titres bundlés TMDB sont souvent EN/romaji.
    if (scored.length === 0) {
        localized = await fetchLocalizedTitles(tmdbId, mediaType, signal);
        if (localized.length) {
            console.log(`[FrenchAnime] Repli titres FR: ${localized.join(' | ')}`);
            scoreTitles.unshift(...localized);
            queries = localized;
            await runQueries(localized);
            scored = buildScored(candidates);
        }
    }

    // Repli `/filter?keyword=` : le suggest du thème n'indexe pas tout le
    // catalogue (séries et films absents de la suggestion, ex. Attack on Titan).
    if (scored.length === 0) {
        const filterQueries = [...new Set([...(localized || []), ...queries])].slice(0, 4);
        for (const q of filterQueries) {
            if (isAborted(signal)) break;
            try {
                const extra = await searchFilterCandidates(q, { signal });
                for (const c of extra) {
                    if (!seenSlugs.has(c.slug)) { seenSlugs.add(c.slug); candidates.push(c); }
                }
            } catch (e) {
                if (isAborted(signal)) throw e;
            }
            scored = buildScored(candidates);
            if (scored.length > 0) break;
        }
        if (candidates.length > 0) {
            console.log(`[FrenchAnime] Repli filtre: ${candidates.length} candidat(s), ${scored.length} retenu(s)`);
        }
    }
    if (scored.length === 0) return [];
    console.log(`[FrenchAnime] Candidats coflix: ${scored.slice(0, 4).map((c) => `${c.slug}(${c.score.toFixed(2)}${c.lang ? ',' + c.lang : ''})`).join(', ')}`);

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
                // Candidats issus de /filter : pas d'epId dans le HTML de
                // listing → on le lit sur la page du film.
                let epId = cand.epId;
                if (!epId) epId = await getFirstEpId(cand.slug, { signal });
                if (!epId) continue;
                embeds = await getEpisodeEmbeds(epId, lang, { signal });
            } else {
                const movieId = await getMovieId(cand.slug, { signal });
                if (!movieId) continue;
                const eps = await listEpisodes(movieId, { signal });
                const target = eps.find((e) => e.num === epNum);
                if (!target) continue; // épisode absent : pas de repli
                embeds = await getEpisodeEmbeds(target.epId, lang, { signal });
            }

            // Priorité d'hôtes : les lecteurs qui répondent vite et qui ne
            // passent pas par le CDN tnmr.org (403) d'abord — sinon 2 lecteurs
            // lents/morts consomment le quota (mesuré 23 s pour 1 film).
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
                    console.warn('[FrenchAnime] Budget de résolution atteint — arrêt');
                    return streams;
                }
                if (seenEmbeds.has(emb.url)) continue;
                seenEmbeds.add(emb.url);
                const baseStream = {
                    name: 'FrenchAnime',
                    title: type === 'movie'
                        ? `[${lang === 'fr' ? 'VF' : 'VOSTFR'}] Film`
                        : `[${lang === 'fr' ? 'VF' : 'VOSTFR'}] Épisode ${epNum}`,
                    language: lang,
                    quality: 'HD',
                };
                const st = await withTimeout(
                    resolveEmbedToStream(emb.url, baseStream, signal),
                    // Lecteur protégé par Turnstile (dood/playmogo) : plus de
                    // marge quand l'utilisateur a activé le solveur.
                    isTurnstileSolverEnabled() ? 26000 : 12000,
                    'french-anime embed'
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
        return extractFromCoflix(tmdbId, titles, type, season, episode, { signal });
    }
    if (direct.length > 0) return direct;

    // 2. Titre introuvable en direct (ou épisode absent) : le catalogue du
    //    showcase est aussi porté par coflix.wiki — tenter le fallback avant
    //    de conclure à l'absence.
    return extractFromCoflix(tmdbId, titles, type, season, episode, { signal });
}
