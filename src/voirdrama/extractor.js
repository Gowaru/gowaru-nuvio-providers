/**
 * Extractor for Voirdrama (voirdrama.to) — provider de dramas.
 *
 * Architecture (diagnostic live 2026-09) :
 *  - WordPress + thème Madara (moteur voiranime), SANS challenge Cloudflare.
 *  - Recherche : POST admin-ajax.php `action=wp-manga-search-manga` → JSON.
 *  - VF et VOSTFR = séries distinctes : slug suffixe `-vf` pour la VF,
 *    slug sans suffixe (ou suffixe numérique `-2`, `-3` = saison 2, 3...)
 *    pour la VOSTFR.
 *  - Page série : liste des épisodes en hrefs dont le slug épisode diffère
 *    souvent du slug série (ex: /drama/the-glory-2/the-glory-2025-01-vostfr/)
 *    → TOUJOURS parser les hrefs réels, jamais reconstruire le slug.
 *  - Page épisode : `var thisChapterSources = {"☰ LECTEUR 6 VIDM": "<iframe...>"}`.
 *  - Lecteurs observés : voembed.net (famille VidMoly → m3u8 direct).
 *
 * Garde-fous (symptômes classiques des providers du repo) :
 *  - série/`tv` normalisé (Nuvio passe parfois `series`) ;
 *  - les embeds non résolus (isDirect:false) sont JAMAIS retournés
 *    (l'app recevrait une page HTML qui ne démarre jamais) ;
 *  - titre = label réel du site + numéro d'épisode demandé.
 */

import { fetchText, fetchTextSafe, postAjax, isCloudflareChallenge, SITE } from './http.js';
import { safeFetch, resolveStream, withTimeout, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

// ─── Budgets ────────────────────────────────────────────────────────────────
const PAGE_TIMEOUT = 15000;      // page série / épisode
const SEARCH_TIMEOUT = 12000;    // recherche AJAX
const RESOLVE_TIMEOUT = 8000;    // resolveStream par lecteur
const MAX_LANGS = 2;             // max variantes langue sondées (VF + VOSTFR)
const MAX_EMBEDS_PER_LANG = 2;   // max lecteurs résolus par langue

// ─── Normalisation mediaType (Nuvio passe parfois "series") ────────────────
function normalizeMediaType(mediaType) {
    const t = String(mediaType || '').toLowerCase();
    if (t === 'movie' || t === 'film') return 'movie';
    return 'tv'; // séries/dramas = défaut
}

// ─── Slugs ──────────────────────────────────────────────────────────────────
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

/**
 * Slugs candidats pour un drama, priorité décroissante.
 *   VF      → `{slug}-vf`
 *   VOSTFR  → `{slug}` (forme standard), sinon dérivés du 1er candidat de
 *             recherche (le site utilise parfois des slugs différents).
 * Saisons : le site sépare les saisons en séries distinctes avec suffixe
 * NUMÉRIQUE (`the-glory-2` = saison 2) — les variantes TMDB "Season 2"
 * nettoyées donnent `the-glory-season-2` qui n'existe pas → on ajoute
 * systématiquement les suffixes numériques pour season > 1.
 */
function buildSlugCandidates(baseTitle, lang, searchTitles, seasonNum) {
    const wanted = cleanTitleForSlug(baseTitle);
    const cands = [];
    const push = (s) => { if (s && !cands.includes(s)) cands.push(s); };
    const seasonSuffix = seasonNum > 1 ? `-${seasonNum}` : '';

    // 1. Formes standards D'ABORD (le vrai slug est presque toujours là) :
    //    VOSTFR = série sans suffixe -vf ; VF = série suffixée -vf.
    //    Saisons : suffixe numérique sur le site (the-glory-2 = saison 2).
    // ⚠️ Season > 1 : STRICT — uniquement des slugs suffixés. Un slug nu
    //    renvoie vers la saison 1 → serving S1 pour une demande S3 = faux
    //    contenu (l'épisode 1 existe sur les deux pages). 0 stream propre
    //    vaut mieux qu'un mauvais épisode.
    if (lang === 'fr') {
        push(`${wanted}${seasonSuffix}-vf`);
        if (seasonNum === 1) push(`${wanted}-vf`);
    } else {
        push(`${wanted}${seasonSuffix}`);
        if (seasonNum === 1) push(wanted);
    }
    // 2. Variantes dérivées des titres TMDB (Season/Saison/S1 nettoyés) en
    //    repli — certains slugs du site intègrent l'année ou un sous-titre.
    //    Idem : seulement pour la saison 1 (les variantes sont suffixées
    //    "-season-N" qui n'existe pas sur le site pour N > 1).
    if (seasonNum === 1) {
        for (const t of searchTitles) {
            const c = cleanTitleForSlug(t);
            if (!c || c === wanted) continue;
            push(lang === 'fr' ? `${c}-vf` : c);
        }
    }
    return cands.slice(0, 5);
}

// ─── Recherche Madara ───────────────────────────────────────────────────────
/**
 * Recherche AJAX Madara (action=wp-manga-search-manga).
 * @returns {Array<{title:string, url:string}>} liste brute (≤ 10)
 */
async function searchMadara(query, opts = {}) {
    if (!query || String(query).trim().length < 2) return [];
    try {
        const json = await withTimeout(
            postAjax(`action=wp-manga-search-manga&title=${encodeURIComponent(query.trim())}`, opts),
            SEARCH_TIMEOUT,
            'voirdrama-search'
        );
        if (!json || !json.success || !Array.isArray(json.data)) return [];
        return json.data
            .filter((d) => d && d.url && typeof d.url === 'string' && d.url.includes('/drama/'))
            .slice(0, 10)
            .map((d) => ({ title: String(d.title || ''), url: d.url }));
    } catch (e) {
        if (isAborted(opts.signal)) throw e;
        return [];
    }
}

/** Score de similitude mots communs (mots de ≥ 3 lettres, demi-poids sur 3). */
function titleScore(candidate, query) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const qw = norm(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    if (!qw.length) return 0;
    const cw = new Set(norm(candidate).split(/[^a-z0-9]+/));
    let hits = 0;
    for (const w of qw) if (cw.has(w)) hits += (w.length === 3 ? 0.5 : 1);
    return hits / qw.length;
}

// ─── Page série ─────────────────────────────────────────────────────────────
/**
 * Extrait les épisodes d'une page série : hrefs réels sous /drama/{slug}/.
 * Gère les listes paginées via l'AJAX Madara (action=madara_load_more).
 * @returns {Array<{num:number, url:string}>} triés par numéro croissant
 */
export async function extractEpisodeList(seriesUrl, opts = {}) {
    const url = seriesUrl.endsWith('/') ? seriesUrl : `${seriesUrl}/`;
    let html = null;
    try {
        html = await withTimeout(fetchText(url, { timeout: PAGE_TIMEOUT, ...opts }), PAGE_TIMEOUT, 'voirdrama-series');
    } catch (e) {
        if (isAborted(opts.signal)) throw e;
        return [];
    }
    if (html && isCloudflareChallenge(html)) return [];

    // Pages série Madara : hrefs d'épisodes directs dans le listing.
    const m = url.match(/voirdrama\.to\/drama\/([^/]+)\/?$/);
    const seriesSlug = m ? m[1] : null;
    const eps = [];
    const seen = new Set();

    if (html) {
        const re = /href="(https?:\/\/voirdrama\.to\/drama\/[^"]+?)"/g;
        let mm;
        while ((mm = re.exec(html)) !== null) {
            const href = mm[1];
            if (href.includes('/drama-genre/') || href.endsWith('#comments')) continue;
            if (/\/drama\/[^/]+\/[^/]+\/$/.test(href)) { // /drama/serie/episode/
                if (seriesSlug && !href.includes(`/${seriesSlug}/`)) continue;
                if (seen.has(href)) continue;
                seen.add(href);
                const em = href.match(/-([0-9]{1,4})(?:-vf|-vostfr)?\/?$/);
                if (em) eps.push({ num: parseInt(em[1], 10), url: href });
            }
        }
    }

    // Fallback pagination AJAX si le listing initial est vide ou court.
    if (eps.length < 3) {
        const postId = html ? (html.match(/data-post-id="(\d+)"/) || html.match(/"post_id":"(\d+)"/) || [])[1] : null;
        if (postId) {
            try {
                const json = await withTimeout(
                    postAjax(
                        `action=madara_load_more&page=1&template=madara-core%2Fcontent%2Fcontent-chapter&vars%5Bpost_id%5D=${postId}&vars%5Bmanga%5D=${postId}&vars%5Border%5D=&vars%5Bmeta_key%5D=_latest_chapter&vars%5Bmeta_value%5D=0&vars%5Bposts_per_page%5D=100`,
                        opts
                    ),
                    SEARCH_TIMEOUT,
                    'voirdrama-load-more'
                );
                const chunk = json && typeof json === 'string' ? json : (json && json.data) || json && json.html || null;
                if (typeof chunk === 'string') {
                    const re2 = /href="(https?:\/\/voirdrama\.to\/drama\/[^"]+?)"/g;
                    let mm2;
                    while ((mm2 = re2.exec(chunk)) !== null) {
                        const href = mm2[1];
                        if (!seen.has(href)) {
                            seen.add(href);
                            const em = href.match(/-([0-9]{1,4})(?:-vf|-vostfr)?\/?$/);
                            if (em) eps.push({ num: parseInt(em[1], 10), url: href });
                        }
                    }
                }
            } catch (e) {
                if (isAborted(opts.signal)) throw e;
            }
        }
    }

    const byNum = new Map();
    for (const e of eps) if (!byNum.has(e.num)) byNum.set(e.num, e);
    return [...byNum.values()].sort((a, b) => a.num - b.num);
}

// ─── Page épisode ───────────────────────────────────────────────────────────
/**
 * Parse `var thisChapterSources = {...}` (JSON avec iframes HTML).
 * Utilise un brace-matching conscient des chaînes (regex naïve = tronquée).
 * @returns {Array<{label:string, embedUrl:string}>}
 */
export function parseChapterSources(html) {
    const out = [];
    const i = html.indexOf('thisChapterSources');
    if (i < 0) return out;
    const start = html.indexOf('{', i);
    if (start < 0) return out;

    let depth = 0, j = start, inStr = false, esc = false;
    while (j < html.length) {
        const c = html[j];
        if (esc) { esc = false; }
        else if (c === '\\') { esc = true; }
        else if (inStr) { if (c === '"') inStr = false; }
        else if (c === '"') { inStr = true; }
        else if (c === '{') { depth++; }
        else if (c === '}') {
            depth--;
            if (depth === 0) break;
        }
        j++;
    }
    const raw = html.slice(start, j + 1);
    let obj = null;
    try { obj = JSON.parse(raw); } catch { return out; }
    if (!obj || typeof obj !== 'object') return out;

    for (const [label, iframeHtml] of Object.entries(obj)) {
        if (typeof iframeHtml !== 'string') continue;
        const sm = iframeHtml.match(/src\s*=\s*["']([^"']+)["']/i);
        if (sm && /^https?:\/\//.test(sm[1])) {
            out.push({ label: String(label).trim(), embedUrl: sm[1] });
        }
    }
    return out;
}

// ─── Résolution des lecteurs ────────────────────────────────────────────────
/**
 * Résout un embed via le resolvers central (convention repo : le provider
 * appelle resolveStream lui-même) et renvoie le stream final DIRECT uniquement.
 * Un embed non résolu (isDirect:false) = page HTML → jamais retourné.
 */
async function resolveEmbedToStream(embedUrl, baseStream, signal) {
    try {
        const resolved = await withTimeout(
            resolveStream({ ...baseStream, url: embedUrl }, 0),
            RESOLVE_TIMEOUT,
            'voirdrama-resolve'
        );
        if (!resolved || resolved.isDirect === false) return null;
        if (!resolved.url || resolved.url.includes('[object')) return null;
        return resolved;
    } catch (e) {
        if (isAborted(signal)) throw e;
        return null;
    }
}

// ─── Pipeline principal ─────────────────────────────────────────────────────
export async function extractStreams(tmdbId, mediaType, season, episode, { signal } = {}) {
    const type = normalizeMediaType(mediaType);
    const epNum = Math.max(1, parseInt(episode, 10) || 1);
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);

    // 1. Titres TMDB (variants saison inclus)
    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, type, { season: seasonNum });
    } catch (e) {
        if (isAborted(signal)) throw e;
    }
    if (!titles || titles.length === 0) return [];

    // 2. Recherche Madara — requêtes dédupliquées, budget serré
    const queries = [...new Set(titles.slice(0, 3).map((t) => String(t).trim()).filter(Boolean))];
    const searchResults = [];
    const seenUrls = new Set();
    for (const q of queries) {
        if (isAborted(signal)) return [];
        const results = await searchMadara(q, { signal });
        for (const r of results) {
            if (!seenUrls.has(r.url)) { seenUrls.add(r.url); searchResults.push(r); }
        }
        // Une recherche qui couvre bien suffit (titre principal)
        if (searchResults.length >= 3) break;
    }
    if (!searchResults.length) return [];

    // 3. Pour chaque langue (VOSTFR d'abord, puis VF) : slug candidats →
    //    page série → liste d'épisodes → page épisode → lecteurs
    const streams = [];
    const seenEmbeds = new Set();
    const langs = ['ja', 'fr']; // VOSTFR, VF
    let langsResolved = 0;

    for (const lang of langs) {
        if (isAborted(signal)) break;
        if (langsResolved >= MAX_LANGS) break; // chaque langue voulue

        // Candidats = titres TMDB scorés contre les résultats de recherche
        const scored = searchResults
            .map((r) => ({ ...r, score: titleScore(r.title, titles[0]) }))
            .filter((r) => r.score >= 0.34)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
        if (!scored.length) continue;

        // VOSTFR : slugs standards ; VF : uniquement slugs suffixés -vf
        const slugCands = buildSlugCandidates(titles[0], lang, titles, seasonNum)
            .filter((s) => (lang === 'fr' ? s.endsWith('-vf') : true))
            .slice(0, 5);

        for (const slug of slugCands) {
            if (isAborted(signal)) break;
            const seriesUrl = `${SITE}/drama/${slug}/`;
            const episodes = await extractEpisodeList(seriesUrl, { signal });
            if (!episodes.length) continue;

            // Épisode demandé (le site peut être en retard → pas de repli
            // silencieux sur un autre numéro : jamais de faux contenu).
            const target = episodes.find((e) => e.num === epNum);
            if (!target) continue;

            // Page épisode → lecteurs
            let epHtml = null;
            try {
                epHtml = await withTimeout(
                    fetchText(target.url, { timeout: PAGE_TIMEOUT, signal }),
                    PAGE_TIMEOUT,
                    'voirdrama-episode'
                );
            } catch (e) {
                if (isAborted(signal)) throw e;
                continue;
            }
            if (!epHtml || isCloudflareChallenge(epHtml)) continue;

            const sources = parseChapterSources(epHtml);
            if (!sources.length) {
                // Fallback : iframe inline unique (certains épisodes n'ont
                // pas thisChapterSources mais un iframe direct).
                const im = epHtml.match(/<iframe[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/i);
                if (im) sources.push({ label: 'LECTEUR 1', embedUrl: im[1] });
            }

            let resolvedThisLang = 0;
            for (const src of sources) {
                if (resolvedThisLang >= MAX_EMBEDS_PER_LANG) break;
                if (seenEmbeds.has(src.embedUrl)) continue;
                seenEmbeds.add(src.embedUrl);

                const baseStream = {
                    name: 'Voirdrama',
                    title: `[${lang === 'fr' ? 'VF' : 'VOSTFR'}] ${src.label || 'Lecteur'} — Épisode ${epNum}`,
                    language: lang,
                    quality: 'HD',
                };
                const st = await resolveEmbedToStream(src.embedUrl, baseStream, signal);
                if (!st) continue;
                delete st.isDirect;
                delete st.originalUrl;
                streams.push(st);
                resolvedThisLang++;
            }

            if (resolvedThisLang > 0) { langsResolved++; break; } // slug trouvé
        }
    }

    return streams;
}
