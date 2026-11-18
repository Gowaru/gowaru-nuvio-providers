/**
 * Extractor for VoirAnime.one — rebranché 2026-11 sur le moteur **Anisama**
 * (`anisama.fr`), après la mort DNS des domaines Next.js historiques
 * (`voiranime.one`, `anisama.org`, `anisama.net`).
 *
 * Chaîne réelle (vérifiée en live 2026-11) :
 *   1. Recherche : GET /recherche?q={titre}
 *      → cartes `<a class="card … card--anime-id" href="/catalogue/{slug}/"
 *        title="{Titre}">` (les cartes de scans `card--scan-id` sont ignorées).
 *   2. Fiche /catalogue/{slug}/ :
 *      - séries : liens `/catalogue/{slug}/saison-{N}/` (One Piece et quelques
 *        longues séries utilisent des **sagas** : `/saga-3-…-episode-144-a-206/`
 *        avec numérotation **absolue** des épisodes) ;
 *      - films : `/catalogue/{slug}/film/episode-1/{vf|vostfr}/`.
 *   3. Page épisode `…/episode-{N}/{vf|vostfr}/` : les lecteurs sont dans
 *      `<option value="{url embed}" data-key="{vf|vostfr}_…">`.
 *   4. `resolveStream` gère les hôtes : `ansembed.net` (clone uqload, master
 *      HLS signé lisible) est le lecteur principal ; `jeremyparticipantanything`
 *      (redirection dood) et `Smoothpre` (EarnVids) sont des leurres sans flux.
 *
 * Garde-fous : un épisode n'est **jamais** servi depuis une autre saison
 * (saison absente → 0 flux + log) ; les sagas sont résolues par épisode
 * absolu calculé sur TMDB ; un film ne répond pas à une demande TV.
 */

import { fetchHtml, getBase, resolveBase } from './http.js';
import { resolveStream, dedupeStreams, isAborted, isBudgetExhausted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { getAbsoluteEpisodeFromTmdb } from '../utils/dle-extractor.js';

const PROVIDER = 'VoirAnime.one';
const TIMEOUTS = { search: 10000, fiche: 12000, episode: 12000 };
const BUDGET_MS = 40000;
const MAX_CANDIDATES = 3;
const MAX_EMBEDS = 6;

/* ────────────────────────── Helpers texte ────────────────────────── */

function norm(s) {
    return String(s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(le|la|les|the|a|of|de|des|du|et|and|au|aux)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokens(s) {
    return new Set(norm(s).split(' ').filter(Boolean));
}

/**
 * Score 0..1 : part des tokens du titre TMDB retrouvés dans le candidat,
 * pénalisée par les mots en trop du candidat (évite « X le film » pour « X »).
 */
function titleScore(target, candidate) {
    const a = tokens(target);
    const b = tokens(candidate);
    if (!a.size || !b.size) return 0;
    let hit = 0;
    for (const t of a) if (b.has(t)) hit++;
    const coverage = hit / a.size;
    const extra = Math.max(0, b.size - a.size);
    return coverage * (1 - Math.min(0.25, extra * 0.05));
}

/* ────────────────────────── Recherche ────────────────────────── */

/** Cartes de résultat d'une page /recherche : [{ slug, title }]. */
function parseSearchCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<a\b[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        if (!/card--anime-id/.test(tag)) continue;      // exclut card--scan-id
        const href = tag.match(/href="https?:\/\/[^/"]+\/catalogue\/([^/"]+)\/"/);
        if (!href) continue;
        const title = tag.match(/title="([^"]*)"/);
        const slug = href[1];
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push({ slug, title: decodeHtml(title ? title[1] : slug) });
    }
    return out;
}

function decodeHtml(s) {
    return String(s || '')
        .replace(/&#0?39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

/**
 * Nettoie une requête pour la recherche du site : la ponctuation des titres
 * TMDB (« Your Name. », « Hatena☆Illusion », « Re:Zero ») fait renvoyer 0
 * résultat au moteur, qui indexe des titres alphanumériques.
 */
function cleanQuery(s) {
    return String(s || '')
        .replace(/[.:;!?()\[\]{}"“”'’☆★·:–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Variantes de requête pour un titre, de la plus fidèle à la plus large.
 * Le moteur fait un LIKE strict : « Kaguya-sama: Love Is War » trouve la fiche,
 * « Kaguya-sama Love Is War » (tiret supprimé) renvoie 0 — d'où l'ordre : titre
 * brut d'abord, ponctuation retirée ensuite, dernier mot distinctif en secours.
 */
function queryVariants(title) {
    const raw = String(title || '').trim();
    const out = [raw, raw.replace(/[.:;!?]+$/g, '').trim(), cleanQuery(raw)];
    const longest = cleanQuery(raw).split(' ').filter(w => w.length >= 4).sort((a, b) => b.length - a.length)[0];
    if (longest) out.push(longest);
    return [...new Set(out.filter(Boolean))];
}

/** Cherche les titres TMDB sur le moteur et renvoie les candidats triés. */
async function searchCandidates(titles, signal, start) {
    const cands = new Map();
    const queries = [];
    for (const title of titles.slice(0, 4)) {
        for (const q of queryVariants(title)) if (!queries.includes(q)) queries.push(q);
    }
    for (const q of queries) {
        if (isAborted(signal) || isBudgetExhausted(start, BUDGET_MS)) break;
        const html = await fetchHtml(`/recherche/?q=${encodeURIComponent(q)}`, {
            timeout: TIMEOUTS.search,
            signal,
        }).catch(() => null);
        if (!html) continue;
        for (const card of parseSearchCards(html)) {
            let score = 0;
            for (const t of titles) score = Math.max(score, titleScore(t, card.title));
            // Un slug proche du titre compte aussi (le `title` du site peut
            // contenir une saison ou un suffixe).
            for (const t of titles) score = Math.max(score, titleScore(t, card.slug.replace(/-/g, ' ')) * 0.95);
            const prev = cands.get(card.slug);
            if (!prev || prev.score < score) cands.set(card.slug, { ...card, score });
        }
        if ((cands.size && Math.max(...[...cands.values()].map(c => c.score)) >= 0.9)) break;
    }
    return [...cands.values()]
        .filter(c => c.score >= 0.7)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_CANDIDATES);
}

/* ────────────────────────── Fiche ────────────────────────── */

async function loadCatalogue(slug, signal) {
    const html = await fetchHtml(`/catalogue/${slug}/`, { timeout: TIMEOUTS.fiche, signal });
    if (!html) return null;

    const saisons = [...new Set(
        [...html.matchAll(new RegExp(`/catalogue/${escapeRe(slug)}/saison-(\\d+)/`, 'g'))]
            .map(m => parseInt(m[1], 10))
    )].filter(n => n > 0).sort((a, b) => a - b);

    // Sagas (One Piece…) : numérotation ABSOLUE des épisodes, la plage est
    // inscrite dans le slug (`…-episode-144-a-206/`).
    const sagas = [];
    const sagaRe = new RegExp(`/catalogue/${escapeRe(slug)}/((?:kai-)?saga-[^"/]+)/`, 'g');
    for (const m of html.matchAll(sagaRe)) {
        const path = m[1].replace(/\/$/, '');
        const range = path.match(/episode-(\d+)-a-(\d+)?/);
        sagas.push({
            path,
            from: range ? parseInt(range[1], 10) : 0,
            to: range && range[2] ? parseInt(range[2], 10) : Infinity,
        });
    }

    return {
        saisons,
        sagas,
        hasFilm: new RegExp(`/catalogue/${escapeRe(slug)}/film/episode-1/`).test(html),
    };
}

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ────────────────────────── Épisodes ────────────────────────── */

/** Numéros d'épisodes présents dans une page de saison/saga. */
function parseEpisodeNumbers(html, basePath) {
    const nums = new Set();
    const re = new RegExp(`${escapeRe(basePath)}/episode-(\\d+)/`, 'g');
    for (const m of html.matchAll(re)) nums.add(parseInt(m[1], 10));
    return nums;
}

/** Lecteurs d'une page épisode : [{ url, lang }]. */
function parseEmbeds(html) {
    const out = [];
    const seen = new Set();
    const re = /<option\b[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        const value = tag.match(/value="(https?:\/\/[^"]+)"/);
        const key = tag.match(/data-key="(vf|vostfr)_/);
        if (!value) continue;
        const url = decodeHtml(value[1]);
        if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
        seen.add(url);
        out.push({ url, lang: key && key[1] === 'vf' ? 'fr' : 'ja' });
    }
    return out;
}

/** Priorité : ansembed (vrai flux) d'abord, puis le reste. */
function hostRank(url) {
    const u = String(url).toLowerCase();
    if (u.includes('ansembed.')) return 0;
    if (u.includes('sibnet') || u.includes('uqload') || u.includes('vidmoly')) return 1;
    return 2;
}

/**
 * Lecteurs leurres du site (vérifié 2026-11) : `jeremyparticipantanything`
 * redirige vers un dood sans flux, `Smoothpre` (EarnVids) sert une page vide,
 * `arianathankspecial` ne contient qu'une vidéo de démo → aucune résolution
 * possible, on les écarte au lieu de livrer une page HTML comme « flux ».
 */
const JUNK_EMBED_HOSTS = ['jeremyparticipantanything.', 'arianathankspecial.', 'smoothpre.', 'earnvids.'];
function isJunkEmbed(url) {
    const u = String(url).toLowerCase();
    return JUNK_EMBED_HOSTS.some(h => u.includes(h));
}

async function fetchEmbeds(path, signal) {
    const html = await fetchHtml(path, { timeout: TIMEOUTS.episode, signal }).catch(() => null);
    return html ? parseEmbeds(html) : [];
}

/* ────────────────────────── Flux ────────────────────────── */

/**
 * @param {string|number} tmdbId
 * @param {'tv'|'movie'} mediaType
 * @param {string|number} [season]
 * @param {string|number} [episode]
 * @param {object} [options] - { signal }
 * @returns {Promise<Array>}
 */
export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const start = Date.now();
    const signal = options.signal;
    if (isAborted(signal)) throw new Error('AbortError: aborted');

    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);
    const epNum = Math.max(1, parseInt(episode, 10) || 1);

    const base = await resolveBase(signal);
    if (!base) {
        console.warn(`[${PROVIDER}] Aucun domaine du moteur disponible — 0 stream`);
        return [];
    }

    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, type, type === 'tv' ? { season: seasonNum } : {});
    } catch (e) {
        if (isAborted(signal)) throw e;
    }
    if (!titles || titles.length === 0) {
        console.warn(`[${PROVIDER}] Aucun titre TMDB pour ${tmdbId}`);
        return [];
    }

    const candidates = await searchCandidates(titles, signal, start);
    if (candidates.length === 0) {
        console.log(`[${PROVIDER}] Aucun candidat pour "${titles[0]}"`);
        return [];
    }

    // Épisode absolu (utile uniquement pour les fiches en sagas).
    let absoluteEp = null;
    if (type === 'tv') {
        try {
            absoluteEp = await getAbsoluteEpisodeFromTmdb(tmdbId, seasonNum, epNum);
        } catch (e) {
            if (isAborted(signal)) throw e;
        }
    }

    for (const cand of candidates) {
        if (isAborted(signal) || isBudgetExhausted(start, BUDGET_MS)) break;

        const cat = await loadCatalogue(cand.slug, signal);
        if (!cat) continue;

        let episodePaths = [];
        let servedEp = epNum;

        if (type === 'movie') {
            if (!cat.hasFilm) continue;
            episodePaths = [
                `/catalogue/${cand.slug}/film/episode-1/vostfr/`,
                `/catalogue/${cand.slug}/film/episode-1/vf/`,
            ];
        } else {
            if (cat.saisons.length > 0) {
                if (!cat.saisons.includes(seasonNum)) {
                    // Saison absente : on ne sert JAMAIS l'épisode d'une autre
                    // saison (demande explicite de non-régression).
                    console.log(`[${PROVIDER}] Saison ${seasonNum} absente de "${cand.slug}" (site : ${cat.saisons.join(', ')})`);
                    continue;
                }
                episodePaths = [
                    `/catalogue/${cand.slug}/saison-${seasonNum}/episode-${epNum}/vostfr/`,
                    `/catalogue/${cand.slug}/saison-${seasonNum}/episode-${epNum}/vf/`,
                ];
            } else if (cat.sagas.length > 0) {
                if (!absoluteEp) continue;
                const saga = cat.sagas.find(s => absoluteEp >= s.from && absoluteEp <= s.to)
                    // Plage ouverte (`episode-1156-a`) : dernière saga connue.
                    || cat.sagas[cat.sagas.length - 1];
                if (!saga) continue;
                servedEp = absoluteEp;
                episodePaths = [
                    `/catalogue/${cand.slug}/${saga.path}/episode-${absoluteEp}/vostfr/`,
                    `/catalogue/${cand.slug}/${saga.path}/episode-${absoluteEp}/vf/`,
                ];
            } else {
                // Fiche film uniquement : jamais de repli pour une demande TV.
                continue;
            }
        }

        // Lecture des lecteurs des deux langues.
        const embeds = [];
        for (const path of episodePaths) {
            if (isAborted(signal) || isBudgetExhausted(start, BUDGET_MS)) break;
            const list = await fetchEmbeds(path, signal);
            for (const em of list) if (!embeds.some(x => x.url === em.url)) embeds.push(em);
        }
        if (embeds.length === 0) continue;

        const ranked = embeds
            .filter(em => !isJunkEmbed(em.url))
            .sort((a, b) => hostRank(a.url) - hostRank(b.url))
            .slice(0, MAX_EMBEDS);
        if (ranked.length === 0) continue;

        const epLabel = type === 'movie' ? 'Film' : `Ép.${servedEp}`;
        const streams = ranked.map(em => ({
            url: em.url,
            title: `[${em.lang === 'fr' ? 'VF' : 'VOSTFR'}] Anisama · ${epLabel}`,
            name: `${PROVIDER} ${em.lang === 'fr' ? 'VF' : 'VOSTFR'}`,
            language: em.lang,
            provider: PROVIDER,
        }));

        const resolved = [];
        for (let i = 0; i < streams.length; i++) {
            if (isAborted(signal) || isBudgetExhausted(start, BUDGET_MS)) break;
            const st = streams[i];
            try {
                const r = await resolveStream(st, i);
                const outUrl = r && r.url ? r.url : st.url;
                // Un embed qui ressort inchangé n'a pas été résolu : c'est une
                // page HTML, pas un flux (le player de l'app ne peut rien en
                // faire). Seuls les hôtes déjà directs sont conservés tels quels.
                if (outUrl === st.url && !/\/(hls\d?|dash)\/|\.(m3u8|mp4|mkv|webm|mpd)([?#]|$)/i.test(outUrl)) {
                    console.log(`[${PROVIDER}] lecteur non résolu, écarté : ${st.url.slice(0, 70)}`);
                    continue;
                }
                if (r && r.url) {
                    const { isDirect, originalUrl, ...clean } = r;
                    resolved.push({ ...st, ...clean, provider: PROVIDER });
                }
            } catch (e) {
                if (isAborted(signal)) throw e;
                console.log(`[${PROVIDER}] resolveStream échoué : ${e && e.message}`);
            }
        }

        const final = dedupeStreams(resolved);
        if (final.length > 0) {
            console.log(`[${PROVIDER}] "${cand.slug}" → ${final.length} flux en ${Date.now() - start}ms`);
            return final;
        }
        console.log(`[${PROVIDER}] "${cand.slug}" : lecteurs présents mais aucun flux résolu`);
    }

    console.log(`[${PROVIDER}] Done: 0 stream en ${Date.now() - start}ms`);
    return [];
}

export default { extractStreams };
