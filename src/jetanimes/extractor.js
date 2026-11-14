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

import cheerio from 'cheerio-without-node-native';
import { fetchText, fetchMeta, fetchJson, postForm, setCurrentSignal } from './http.js';
import { resolveByse, isByseUrl } from './byse.js';
import { isAborted, isBudgetExhausted } from '../utils/resolvers.js';
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
        // Slug bilingue : la fiche préfixe le titre avec sa traduction
        // (`lattaque-des-titans-shingeki-no-kyojin-hd`). On tolère le reste
        // seulement si la requête est déjà multi-mots (≥2 tokens signif. :
        // évite "naruto" → "naruto-shippuden", série différente).
        const bilingual = qt.length >= 2 && seriesSlug.startsWith(`${querySlug}-`);
        if (unexplained.length && !bilingual) return 0;
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
/** Recherche structurée via le CPT `tvshows` (≈3 s, pas de parsing HTML). */
async function searchSeriesRest(query, signal) {
    const data = await fetchJson(
        `${SITE}/wp-json/wp/v2/tvshows?search=${encodeURIComponent(query)}&per_page=10&_fields=slug,title,link`,
        { signal, timeout: 10000 },
    ).catch(() => null);
    if (!Array.isArray(data)) return [];
    return data
        .filter((e) => e && typeof e.slug === 'string')
        .map((e) => ({
            slug: e.slug,
            title: String((e.title && e.title.rendered) || e.slug.replace(/-/g, ' ')).replace(/<[^>]+>/g, '').trim(),
            href: `${SITE}/serie/${e.slug}/`,
        }));
}

async function searchSeries(query, signal) {
    return withCache(`search_${query}`, async () => {
        const out = [];
        const seen = new Set();
        for (const q of [...new Set([query, query.split(/[\s:'’]/)[0]].filter((x) => x && x.length >= 3))]) {
            if (out.length >= 5) break;
            try {
                for (const f of await searchSeriesRest(q, signal)) {
                    if (seen.has(f.href)) continue;
                    seen.add(f.href);
                    out.push(f);
                }
                if (out.length) break;
                const html = await fetchText(`${GATEWAY}/?s=${encodeURIComponent(q)}`, { signal, timeout: 15000 });
                if (!html) continue;
                // Les liens de résultats sont des vignettes (l'ancre contient une
                // <img>, pas du texte) : l'ancien regex texte ne matchait rien et
                // tout le provider renvoyait 0 flux (diag live 2026-11).
                const $ = cheerio.load(html);
                // `.result-item` = vrais résultats ; la page « aucun résultat »
                // contient uniquement menus/sidebars — les prendre pour des
                // fiches produisait des homonymes puis 0 flux.
                let anchors = $('.result-item .details .title a[href]');
                if (!anchors || anchors.length === 0) anchors = $('.result-item a[href*="/serie/"]');
                anchors.each((_, el) => {
                    const href = $(el).attr('href') || '';
                    const m = /^https?:\/\/on\.jetanimes\.com\/serie\/([^/"#?]+)\//.exec(href);
                    if (!m || seen.has(href)) return;
                    const title = $(el).text().trim() || $(el).find('img').attr('alt') || '';
                    seen.add(href);
                    out.push({ slug: m[1], title: title.trim(), href });
                });
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
    // Guillemets simples ET doubles : le thème rend les liens d'épisodes en
    // attributs single-quoted ('href'), l'ancien regex double-quote ne les
    // voyait pas.
    const epRe = /href=['"](https?:\/\/on\.jetanimes\.com\/episodes\/([^/'"]+))\/?['"]/g;
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

/**
 * Le slug d'épisode du site n'a pas toujours le même stem que la fiche
 * (`sousou-no-frieren-frieren-saison-2-episode-8` pour la fiche `frieren`).
 * On teste donc (saison, épisode) en fin de slug, avec ou sans marqueur de
 * saison, et avec suffixe de doublon éventuel (`-2`).
 */
function slugMatchesEpisode(slug, season, episode) {
    if (!slug) return false;
    const withSeason = /-saison-(\d+)-episode-(\d+)(?:-\d+)?$/i.exec(slug);
    if (withSeason) return parseInt(withSeason[1], 10) === season && parseInt(withSeason[2], 10) === episode;
    const bare = /-episode-(\d+)(?:-\d+)?$/i.exec(slug);
    if (bare) return season === 1 && parseInt(bare[1], 10) === episode;
    return false;
}

/**
 * Trouve l'URL réelle de la page épisode :
 *  1. liens d'épisodes de la fiche (le thème les rend en single-quoted) ;
 *  2. index WP REST du CPT `episodes` (complet, exposé sans auth).
 * La construction d'URL à l'aveugle (stem + saison-numéro) échouait pour la
 * moitié du catalogue et renvoyait 0 flux.
 */
async function findEpisodeUrl(fiche, season, episode, signal) {
    const fromList = (urls) => urls.find((u) => {
        const slug = String(u).replace(/\/+$/, '').split('/episodes/')[1] || '';
        return slugMatchesEpisode(slug, season, episode);
    }) || null;

    const stem = fiche.slug.replace(/-(?:saison|season)-\d{1,2}$/, '');
    const tokens = stem.split('-').filter((w) => w.length >= 4);
    // La recherche REST est un LIKE multi-mots : un slug bilingue entier
    // ("lattaque des titans shingeki no kyojin hd") ne renvoie rien. On
    // dégrade progressivement jusqu'au token le plus distinctif.
    const queries = [...new Set([
        stem.replace(/-/g, ' '),
        tokens.slice(-3).join(' '),
        tokens.reduce((a, b) => (b.length > a.length ? b : a), ''),
    ].filter((q) => q && q.length >= 4))];

    let data = null;
    for (const q of queries) {
        const res = await fetchJson(
            `${SITE}/wp-json/wp/v2/episodes?search=${encodeURIComponent(q)}&per_page=100&_fields=slug,link,id&orderby=date&order=asc`,
            { signal, timeout: 12000 },
        ).catch(() => null);
        if (Array.isArray(res) && res.length > 0) { data = res; break; }
    }
    if (!Array.isArray(data) || data.length === 0) {
        // Index REST muet : repli sur les liens d'épisodes de la fiche.
        const html = await fetchText(fiche.href, { signal, timeout: 12000 }).catch(() => null);
        if (html) {
            const hit = fromList(parseFiche(html).episodes);
            if (hit) return { url: hit, postId: null };
        }
        return null;
    }
    const candidates = data.filter((e) => {
        if (!e || typeof e.slug !== 'string') return false;
        if (!slugMatchesEpisode(e.slug, season, episode)) return false;
        if (!tokens.length) return true;
        return tokens.some((t) => e.slug.includes(t));
    });
    if (!candidates.length) return null;
    // Slugs les plus proches du stem de la fiche d'abord (évite les homonymes)
    candidates.sort((a, b) => {
        const sa = tokens.filter((t) => a.slug.includes(t)).length;
        const sb = tokens.filter((t) => b.slug.includes(t)).length;
        return sb - sa || a.slug.length - b.slug.length;
    });
    const winner = candidates[0];
    // L'id du CPT episode permet d'appeler doo_player_ajax sans télécharger
    // la page épisode (gain ~8 s par run en live 2026-11).
    return { url: `${SITE}/episodes/${winner.slug}/`, postId: winner.id || null };
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
 * Interroge doo_player_ajax pour nume=1..2 (serveurs 1 puis secours).
 * `nonce` peut être vide : l'AJAX répond quand même avec une session
 * anonyme (vérifié en live 2026-11) — c'est ce qui permet de sauter le
 * téléchargement de la page épisode (8 s de TTFB) quand l'id REST est connu.
 */
async function fetchEmbeds(postId, nonce, ptype, epUrl, signal) {
    if (!postId) return [];
    const attempts = [1, 2].map((nume) => postForm(
        `${SITE}/wp-admin/admin-ajax.php`,
        `action=doo_player_ajax&post=${postId}&nume=${nume}&nonce=${nonce || ''}&type=${ptype}`,
        { signal, timeout: 10000, headers: { Referer: epUrl } },
    ).catch(() => null));
    const settled = await Promise.allSettled(attempts);
    const embeds = [];
    for (const s of settled) {
        const u = s.status === 'fulfilled' && s.value && s.value.embed_url;
        if (u && typeof u === 'string' && u.startsWith('http') && !embeds.includes(u)) embeds.push(u);
    }
    return embeds;
}

/**
 * Résout une page épisode → stream direct (via doo_player_ajax + Byse).
 * `knownPostId` (id du CPT episode, via REST) évite un fetch de page complet.
 * Retourne [{ stream }] ou [].
 */
async function resolveEpisodePage(epUrl, baseStream, signal, knownPostId = null) {
    let embeds = [];
    let html = null;

    // VOIE 1 (rapide) : id REST connu → AJAX direct (type=tv obligatoire,
    // sinon {"embed_url":"","type":false}) — pas de page à télécharger.
    if (knownPostId) {
        embeds = await fetchEmbeds(knownPostId, '', 'tv', epUrl, signal);
    }

    if (!embeds.length) {
        html = await fetchText(epUrl, { signal, timeout: 12000 }).catch(() => null);
        if (!html) return null;
        // VOIE 2 : player Dooplay AJAX depuis la page — prioritaire car la page
        // contient aussi des liens promo secured.lol (hdsboost, /tv…) que le
        // scan d'iframe capterait à tort (diag live 2026-09).
        embeds = await fetchEmbeds(extractEpisodePostId(html), extractNonce(html), extractPlayerType(html), epUrl, signal);
        // VOIE 3 (secours) : iframe directe dans la page
        if (!embeds.length) {
            const embed = extractEmbedUrl(html);
            if (embed) embeds.push(embed);
        }
    }
    if (!embeds.length) return null;

    // 4. Résolution des embeds — en PARALLÈLE (max 2 retenus) : chaque
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
        const title = String(r.title || '');
        results.push({
            ...baseStream,
            url: r.url,
            quality: r.label || r.quality || 'HD',
            type: r.type || 'hls',
            // Langue réelle : l'API Byse renseigne « (VF) » / « VOSTFR ».
            // Détection uniquement quand le marqueur est explicite.
            _vf: /(?:\(|\[)\s*VF\s*(?:\)|\])/i.test(title),
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
    // Toutes les variantes servent au SCORING (un titre FR tardif peut être
    // le seul à matcher une fiche bilingue, ex. "L'Attaque des Titans" pour
    // `lattaque-des-titans-shingeki-no-kyojin-hd`) ; seules les 6 premières
    // sont envoyées au moteur de recherche.
    const titleVariants = [...new Set(
        [primary, ...titles.filter((t) => typeof t === 'string' && t.length >= 3)]
            .map((t) => normSlug(String(t).split(' (')[0]))
            .filter(Boolean),
    )];
    const searchVariants = titleVariants.slice(0, 6);

    // 1. Recherche gateway : essayer les variantes jusqu'à trouver des fiches
    let fiches = [];
    if (!isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        // Requêtes : titres bruts (le moteur WP cherche du texte), puis les
        // mêmes en mots dérivés des slugs normalisés (retire apostrophes).
        const rawVariants = [primary, ...titles.filter((t) => typeof t === 'string' && t.length >= 3)]
            .map((t) => String(t).split(' (')[0].trim())
            .filter((t) => t.length >= 3)
            .slice(0, 6);
        const slugQueries = searchVariants.map((v) => v.replace(/-/g, ' '));
        const allQueries = [...rawVariants, ...slugQueries];
        const seenQ = new Set();
        for (const q of allQueries) {
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
            const key = q.toLowerCase();
            if (seenQ.has(key)) continue;
            seenQ.add(key);
            fiches = await searchSeries(q, signal);
            console.log(`[Jetanimes] Search "${q}" → ${fiches.length} fiche(s)`);
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

    const baseStream = {
        name: 'Jetanimes',
        // VOSTFR = audio japonais : `normalizeLanguageCode('VOSTFR')` renvoie
        // 'fr' (code de la piste de sous-titres), ce qui classait à tort les
        // flux en VF dans les filtres NuvioTV.
        language: 'ja',
        quality: 'HD',
    };

    const emit = (streams, isVf) => {
        const tag = isVf ? 'VF' : 'VOSTFR';
        for (const s of streams) {
            s.title = `${primary} S${seasonNum}E${epNum} [${tag}]`;
            // VF = piste française, VOSTFR = audio japonais (le code de la
            // piste de sous-titres n'est pas la langue du flux).
            s.language = isVf ? 'fr' : 'ja';
            delete s._vf;
        }
        return streams;
    };

    // 3a. URL réelle de l'épisode (fiche puis index REST)
    const resolved = await findEpisodeUrl(best, seasonNum, epNum, signal).catch(() => null);
    console.log(`[Jetanimes] Episode URL: ${(resolved && resolved.url) || 'introuvable'} (fiche ${best.slug}, id ${resolved && resolved.postId})`);
    if (resolved && resolved.url && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const streams = await resolveEpisodePage(resolved.url, baseStream, signal, resolved.postId).catch(() => null);
        if (streams && streams.length) {
            return emit(streams, streams.some((s) => s._vf));
        }
    }

    // 3b. Dernier recours : URLs construites (convention historique du site).
    // Coûteux (1 page + 2 AJAX + résolutions) → 2 essais max, et seulement si
    // le run n'a pas déjà consommé son budget.
    if (isAborted(signal) || Date.now() - startTime > 25000) return [];
    const probes = episodeSlugCandidates(best.slug, seasonNum, epNum).slice(0, 2);
    for (const slug of probes) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        const epUrl = `${SITE}/episodes/${slug}/`;
        const streams = await resolveEpisodePage(epUrl, baseStream, signal).catch(() => null);
        if (streams && streams.length) {
            return emit(streams, streams.some((s) => s._vf));
        }
    }

    return [];
}
