/**
 * Extractor for Jetanimes (jetanimes.com → on.jetanimes.com)
 *
 * Réseau multi-domaines (diag live 2026-09) :
 *   - jetanimes.com  : passerelle de recherche WP (?s=) → fiches hébergées
 *     sur le SOUS-DOMAINE de contenu on.jetanimes.com ;
 *   - on.jetanimes.com : WordPress Dooplay — fiches /serie/{slug}/, pages
 *     épisodes /episodes/{serie}-saison-{N}-episode-{M}/, sitemaps
 *     episodes-sitemap{1..25}.xml (~25 000 pages) ;
 *   - player : admin-ajax `doo_player_ajax` (nonce public `linksnonce`
 *     inline dans dtAjax) → embed_url raccourcie (secured.lol) ;
 *   - secured.lol → 302 → hdsplay2.xyz/e/{code} (hébergeur « Byse ») ;
 *   - source finale : AES-256-GCM déchiffré côté client (voir byse.js).
 *
 * Sans challenge Cloudflare ; quasi-VOSTFR (VF rare, inexistante sur
 * l'échantillon testé) → un seul flux par épisode.
 */

import { fetchText, fetchMeta, postForm, setCurrentSignal } from './http.js';
import { resolveByse, isByseUrl } from './byse.js';
import { isAborted, isBudgetExhausted, normalizeLanguageCode } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { createCache } from '../utils/cache.js';

const withCache = createCache('jta', 'Jetanimes');

const GATEWAY = 'https://jetanimes.com';
const SITE = 'https://on.jetanimes.com';
const BUDGET_MS = 45000;

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

/** Match de token : exact, ou préfixe partagé (≥4 chars, ex: "caramelise" ↔
 * "carameliser") — tolère les variations de conjugaison/pluriel du site. */
function tokenMatch(w, q) {
    return w === q || (q.length >= 4 && w.length >= 4 && (w.startsWith(q) || q.startsWith(w)));
}

/** Préfixe ordonné : tous les tokens de `a` matchent des tokens de `b` DANS L'ORDRE. */
export function isOrderedPrefix(a, b) {
    const at = slugTokens(a);
    if (!at.length) return false;
    const bt = slugTokens(b);
    let i = 0;
    for (const w of bt) {
        if (tokenMatch(w, at[i])) i++;
        if (i >= at.length) return true;
    }
    return i >= at.length;
}

/**
 * Score de matching fiche↔requête.
 * Préfixe ordonné dans les DEUX sens : le site prend des slugs plus longs
 * ("jujutsu-kaisen-2026" pour la requête "jujutsu-kaisen") OU plus courts
 * ("frieren" pour "frieren-beyond-journeys-end"). Le slug d'épisode sondé
 * (404 → suivant) reste l'arbitre final contre les homonymes.
 */
export function matchScore(seriesSlug, querySlug) {
    if (!querySlug) return 0;
    const exact = seriesSlug === querySlug;
    const qPrefix = isOrderedPrefix(querySlug, seriesSlug); // requête ⊆ fiche
    const sPrefix = isOrderedPrefix(seriesSlug, querySlug); // fiche courte ⊆ requête
    if (!exact && !qPrefix && !sPrefix) return 0;

    const qt = slugTokens(querySlug);
    const st = slugTokens(seriesSlug);
    const stArr = st;
    let covered = 0;
    for (const w of qt) {
        if (stArr.some((s) => tokenMatch(s, w))) covered++;
    }
    let score = (exact ? 100 : 60) + Math.round((covered / Math.max(1, qt.length)) * 40);

    // Garde anti-homonymes (sens requête ⊆ fiche) : tout token de la fiche
    // non expliqué par la requête doit être générique (année, hdN, numéro)
    // sinon rejet — "gate" ne doit PAS matcher "the-new-gate" ni
    // "gate-keepers" (diag live 2026-09 : faux contenu servi).
    if (!exact && !sPrefix) {
        const generic = (w) => /^(?:19|20)\d{2}$/.test(w) || /^hd\d*$/.test(w) || /^\d+$/.test(w);
        const unexplained = st.filter((w) => !qt.some((q) => tokenMatch(q, w)) && !generic(w));
        if (unexplained.length) return 0;
    }

    const qm = querySlug.match(/-(?:saison|season)-(\d+)$/);
    if (qm) {
        const sm = seriesSlug.match(/-(?:saison|season)-(\d+)$/);
        if (sm) score += sm[1] === qm[1] ? 30 : -25;
    }
    return score;
}

// ─── 1. Recherche (gateway ?s= → fiches on.) ───────────────────────────────

/**
 * Recherche sur la passerelle. Retourne des fiches [{ slug, title, href }]
 * triées par score contre la requête. Les requêtes mono-mot sont les plus
 * fiables (WP); on envoie le titre complet puis le 1er mot significatif.
 */
async function searchSeries(query, signal) {
    return withCache(`search_${query}`, async () => {
        const out = [];
        const seen = new Set();
        for (const q of [...new Set([query, query.split(/[\s:'’]/)[0]].filter((x) => x && x.length >= 3))]) {
            if (out.length >= 5) break;
            try {
                const html = await fetchText(`${GATEWAY}/?s=${encodeURIComponent(q)}`, { signal, timeout: 15000 });
                if (!html) continue;
                const re = /href="(https?:\/\/on\.jetanimes\.com\/serie\/([^/"]+)\/)"[^>]*>([^<]{1,80})</g;
                let m;
                while ((m = re.exec(html)) !== null) {
                    if (seen.has(m[1])) continue;
                    seen.add(m[1]);
                    out.push({ slug: m[2], title: (m[3] || '').trim(), href: m[1] });
                }
            } catch (e) {
                if (isAborted(signal)) throw e;
            }
        }
        return out;
    }, { successTtl: 120000, failureTtl: 30000 });
}

// ─── 2. Fiche → post_id + épisodes ─────────────────────────────────────────

/**
 * Parse la fiche : post_id (shortlink) + items d'épisodes exposés.
 * Dooplay charge la liste via AJAX mais l'HTML embarque souvent les items
 * (sélecteur de saison) — on extrait ce qui est disponible.
 */
function parseFiche(html) {
    const out = { postId: null, episodes: [] };
    if (!html) return out;
    let m = /rel="shortlink"\s+href="[^"]*\?p=(\d+)"/.exec(html)
        || /postid-(\d+)/.exec(html)
        || /"post_id":\s*(\d+)/.exec(html);
    if (m) out.postId = m[1];
    const epRe = /href="(https?:\/\/on\.jetanimes\.com\/episodes\/([^/"]+))\/?"/g;
    while ((m = epRe.exec(html)) !== null) {
        if (!out.episodes.includes(m[1])) out.episodes.push(m[1]);
    }
    return out;
}

/**
 * Construit les slugs d'épisode candidats pour (ficheSlug, season, episode).
 * Le stem de la fiche diverge souvent du stem des URLs d'épisodes :
 *   - fiche datée "jujutsu-kaisen-2026" → épisodes "jujutsu-kaisen-…" (sans
 *     l'année) ;
 *   - fiche "mushoku-tensei-jobless-reincarnation-season-3" → stem nu.
 * Les variantes sans année sont testées APRÈS le stem complet (coût : un
 * 404 rapide quand inutile).
 */
export function episodeSlugCandidates(ficheSlug, season, episode) {
    const out = [];
    const push = (s) => { if (s && !out.includes(s)) out.push(s); };
    const n = String(episode);
    const nn = episode < 10 ? `0${episode}` : String(episode);
    // La fiche porte rarement le marqueur de saison ; l'URL d'épisode SI.
    const stem = ficheSlug.replace(/-(?:saison|season)-\d{1,2}$/, '');
    const stemNoYear = stem
        .replace(/-(?:19|20)\d{2}$/, '')       // année finale (jujutsu-kaisen-2026)
        .replace(/-(?:19|20)\d{2}(?=-)/, '');  // année médiane (…-2024-saison…)
    const stems = [...new Set([stem, stemNoYear, ficheSlug])];
    for (const s of stems) {
        push(`${s}-saison-${season}-episode-${n}`);
        push(`${s}-saison-${season}-episode-${nn}`);
        if (season === 1) {
            push(`${s}-episode-${n}`);
            push(`${s}-episode-${nn}`);
        }
    }
    return out;
}

// ─── 3. Page épisode → embed → Byse ────────────────────────────────────────

function extractEmbedUrl(html) {
    if (!html) return null;
    let m = /<iframe[^>]*src="(https?:\/\/[^"]+)"/i.exec(html);
    if (m && m[1]) return m[1];
    m = /<iframe[^>]*data-litespeed-src="(https?:\/\/[^"]+)"/i.exec(html);
    if (m && m[1]) return m[1];
    m = /["'](https?:\/\/[^"']*(?:embed|secured\.lol|hdsplay)[^"']*)["']/i.exec(html);
    return m ? m[1] : null;
}

function extractNonce(html) {
    const m = /"linksnonce":"([a-f0-9]+)"/.exec(html || '');
    return m ? m[1] : null;
}

function extractEpisodePostId(html) {
    const m = /rel="shortlink"\s+href="[^"]*\?p=(\d+)"/.exec(html)
        || /postid-(\d+)/.exec(html)
        || /"post_id":\s*(\d+)/.exec(html);
    return m ? m[1] : null;
}

/** data-type du <li dooplay_player_option> ('tv' pour les épisodes). */
function extractPlayerType(html) {
    const m = /dooplay_player_option[^>]*data-type=['"]([a-z]+)['"]/i.exec(html || '');
    return m ? m[1] : 'tv';
}

/**
 * Résout une page épisode → stream direct (via doo_player_ajax + Byse).
 * Retourne [{ stream }] ou [].
 */async function resolveEpisodePage(epUrl, baseStream, signal) {
    const html = await fetchText(epUrl, { signal, timeout: 15000 }).catch(() => null);
    if (!html) return null;    // VOIE 1 (principale) : player Dooplay AJAX — prioritaire car la page
    // contient aussi des liens promo secured.lol (hdsboost, /tv…) que le
    // scan d'iframe capterait à tort (diag live 2026-09).
    let embeds = [];
    const postId = extractEpisodePostId(html);
    const nonce = extractNonce(html);
    if (postId && nonce) {
        // type=tv OBLIGATOIRE (data-type du <li> dooplay) — sans lui
        // l'AJAX répond {"embed_url":"","type":false} (diag live 2026-09).
        const ptype = extractPlayerType(html);
        // nume=1..3 : serveurs multiples éventuels — en PARALLÈLE : le
        // raccourcisseur/AJAX est parfois lent, la concurrence absorbe la
        // flakiness (diag live 2026-09 : nume=2 est le secours de nume=1).
        const attempts = [1, 2, 3].map((nume) => postForm(
            `${SITE}/wp-admin/admin-ajax.php`,
            `action=doo_player_ajax&post=${postId}&nume=${nume}&nonce=${nonce}&type=${ptype}`,
            { signal, timeout: 12000, headers: { Referer: epUrl } },
        ).catch(() => null));
        const settled = await Promise.allSettled(attempts);
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i].status === 'fulfilled' ? settled[i].value : null;
            const u = r && r.embed_url;
            if (u && typeof u === 'string' && u.startsWith('http')) {
                if (!embeds.includes(u)) embeds.push(u);
            }
        }
    }

    // VOIE 2 (secours) : iframe directe dans la page
    if (!embeds.length) {
        const embed = extractEmbedUrl(html);
        if (embed) embeds.push(embed);
    }
    if (!embeds.length) return null;

    // 3. Résolution des embeds — en PARALLÈLE (max 2 retenus) : chaque
    // résolution passe par le raccourcisseur + page player, 10-25 s en cas
    // de lenteur ; la concurrence évite qu'un serveur lent masque un bon.
    const results = [];
    const settleList = await Promise.allSettled(embeds.map((emb) => (async () => {
        if (isByseUrl(emb) || /secured\.lol/.test(emb)) {
            return resolveByse(emb, fetchMeta, signal).catch(() => null);
        }
        const { resolveStream } = await import('../utils/resolvers.js');
        const r = await resolveStream({ ...baseStream, url: emb }, 0).catch(() => null);
        if (r && r.url && r.isDirect !== false && !r.url.includes('[object')) {
            delete r.isDirect;
            delete r.originalUrl;
            return r;
        }
        return null;
    })()));
    const seen = new Set();
    for (let i = 0; i < settleList.length && results.length < 2; i++) {
        const r = settleList[i].status === 'fulfilled' ? settleList[i].value : null;
        if (!r || !r.url || seen.has(r.url)) continue;
        seen.add(r.url);
        results.push({
            ...baseStream,
            url: r.url,
            quality: r.label || r.quality || 'HD',
            type: r.type || 'hls',
        });
    }
    return results.length ? results : null;
}

// ─── Pipeline principal ────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);
    const startTime = Date.now();

    if (mediaType === 'movie') return []; // catalogue séries/animes (films : section /films/ non mappée TMDB)

    const epNum = Math.max(1, parseInt(episode, 10) || 1);
    const seasonNum = Math.max(1, parseInt(season, 10) || 1);

    const titles = await getTmdbTitles(tmdbId, 'tv', { season: seasonNum });
    if (!titles || titles.length === 0) return [];

    const primary = String((titles._metadata && titles._metadata.name) || titles[0] || '');
    if (!primary) return [];

    // Le titre PRIMAIRE TMDB varie d'un appel à l'autre (romaji "Otome
    // Kaijuu…", accentué "Sósó no Frieren") et la recherche WP peut le
    // rater — on prépare des variantes de slugs pour la recherche ET le
    // scoring (diag live 2026-09).
    const titleVariants = [...new Set(
        [primary, ...titles.filter((t) => typeof t === 'string' && t.length >= 3)]
            .map((t) => normSlug(String(t).split(' (')[0]))
            .filter(Boolean),
    )].slice(0, 5);

    // 1. Recherche gateway : essayer les variantes jusqu'à trouver des fiches
    let fiches = [];
    if (!isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const rawVariants = [primary, ...titles.filter((t) => typeof t === 'string' && t.length >= 3)]
            .map((t) => String(t).split(' (')[0].trim())
            .filter(Boolean);
        const seenQ = new Set();
        for (const q of rawVariants) {
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
            const key = q.toLowerCase();
            if (seenQ.has(key)) continue;
            seenQ.add(key);
            fiches = await searchSeries(q, signal);
            if (fiches.length) break;
        }
    }
    if (!fiches.length) return [];

    // 2. Meilleure fiche : score contre le slug ET le titre affiché, pour
    //    CHAQUE variante de titre (le slug du site peut diverger du primaire
    //    TMDB : "carameliser" vs "caramelise", année en plus/en moins…).
    let best = null;
    let bestScore = 0;
    for (const f of fiches) {
        let sc = 0;
        for (const v of titleVariants) {
            sc = Math.max(sc, matchScore(f.slug, v), matchScore(normSlug(f.title), v));
        }
        if (sc > bestScore) { bestScore = sc; best = f; }
    }
    if (!best || bestScore <= 0) return [];

    // 3. Slugs d'épisodes à sonder (URL directe = la convention du site)
    const probes = episodeSlugCandidates(best.slug, seasonNum, epNum);

    const baseStream = {
        name: 'Jetanimes',
        language: normalizeLanguageCode('VOSTFR') || 'ja',
        quality: 'HD',
    };

    for (const slug of probes) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        const epUrl = `${SITE}/episodes/${slug}/`;
        const streams = await resolveEpisodePage(epUrl, baseStream, signal).catch(() => null);
        if (streams && streams.length) {
            for (const s of streams) {
                s.title = `${primary} S${seasonNum}E${epNum} [VOSTFR]`;
            }
            return streams;
        }
    }

    return [];
}
