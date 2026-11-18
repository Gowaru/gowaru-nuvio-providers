/**
 * Extractor Logic for Vostfree
 *
 * ⚠️ Constat live 2026-11 (cause racine des 0 stream / mauvais épisodes) :
 *  - la recherche POST `index.php?do=search` est **incomplète** (elle ne
 *    renvoie pas les saisons 2+, et renvoie 0 résultat pour beaucoup de
 *    requêtes) — le provider ne « voyait » donc qu'une partie du catalogue ;
 *  - une même série est découpée en **plusieurs fiches par plage d'épisodes**
 *    (One Piece VOSTFR = 1 fiche `one-piece-1014-vostfr` qui commence à
 *    l'épisode 747, One Piece VF = 1 fiche 1→887) → sans lire la bonne fiche,
 *    l'épisode servi ne correspondait pas ;
 *  - les fiches ont un `<select class="new_player_selector">` dont les
 *    `value="buttons_N"` ne suivent PAS le numéro d'épisode (`buttons_747` =
 *    « Episode 0747 ») : la correspondance se fait sur le **texte** de
 *    l'option, jamais sur son index.
 *
 * Le `sitemap.xml` (218 Ko, ~1200 fiches, 1 seule requête) sert de catalogue :
 * on y choisit les fiches par titre + saison, puis on sonde chaque fiche
 * jusqu'à trouver l'épisode. Recherche POST conservée en repli.
 */

import { fetchText, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, withTimeout, isBudgetExhausted, isAborted, sortStreamsByLanguage } from '../utils/resolvers.js';
import { resolveTargetEpisodes, resolveSeasonEpisodeInputs } from '../utils/dle-extractor.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = 'https://ipv4.vostfree.ws';
const BUDGET_MS = 45000;
const PLAYER_TIMEOUT_MS = 9000;
const MAX_PAGES = 6;              // fiches sondées (sitemap) par exécution
const MAX_FALLBACK_PAGES = 3;     // fiches sondées en repli de saison
const MAX_SEARCH_TITLES = 5;      // repli recherche POST
const TARGET_DIRECT_PER_LANG = 2; // flux directs visés par langue
const MAX_STREAMS = 8;

// Lecteurs dont l'embed est un mur JS/fingerprint, un domaine parqué ou un DNS
// mort — vérifiés en live 2026-11 : getvid.club (sert les `player_vip`) n'a
// plus de DNS, voe/streamtape/dood sont derrière un captcha, et les autres
// hôtes du site sont carrément disparus : myvi.ru (→ domaine en vente),
// myvi.tv (injoignable), iframedream.com (`gtv` → page de pub), kaztube.kz
// (DNS mort), fembed.com/vfree.to (DNS mort). `mail2` (my.mail.ru) et
// `ok` (ok.ru/videoembed, manifest dans `data-options`) restent tentés : les
// résolveurs savent les lire.
const UNRESOLVABLE_HOSTS = ['voe.sx', 'streamtape', 'stape', 'dood.', 'ds2play', 'bigwar5',
    'ninjastream', 'upvid', 'opvid', 'jetload', 'getvid.', 'lvturbo', 'streamlare', 'filemoon',
    'myvi.ru', 'myvi.tv', 'iframedream', 'kaztube', 'fembed.', 'vfree.',
    // Famille StreamSB (`sb…`) et MixDrop, portées par les slots `vip` :
    // domaines parqués (ww16/ww17) ou résolution derrière reCAPTCHA v3.
    'sbchill.', 'sbbrisk.', 'sbhight.', 'sbface.', 'sbrity.', 'sbanh.', 'sblongvu.', 'sblanh.',
    'sbfast.', 'sbfull.', 'sbthe.', 'sbspeed.', 'sblona.', 'viewsb.', 'likessb.',
    'mixdrop.', 'vudeo.', 'gvstream.', 'gvlod.', 'vidfast.', 'rapids.', 'vidspot.', 'openload.'];

// `sibnet` est le lecteur le plus courant du catalogue mais répond **403**
// depuis un datacenter : il est tenté quand même (il fonctionne depuis une IP
// résidentielle). `mail2` (my.mail.ru) est le seul **second** hôte encore
// résoluble : 6/12 des embeds testés rendent un MP4 direct signé (cdn*.my.mail.ru).

// Priorité de résolution : uqload/vidmoly répondent vite ; sibnet passe
// ensuite (géo-bloqué en datacenter mais OK en résidentiel) ; les hôtes morts
// n'ont plus à consommer de budget (cf. UNRESOLVABLE_HOSTS).
const HOST_PRIORITY = ['uqload', 'mail2', 'vidmoly', 'sibnet', 'sendvid', 'oneupload'];

// ─── Texte ───────────────────────────────────────────────────────────────────
function normalize(s) {
    if (!s) return '';
    return String(s).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[’'`:!.,?]/g, ' ')
        .replace(/&/g, ' et ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(the|les|le|la|des|de|du|a|an|of|and|et)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokens(s) {
    return normalize(s).split(' ').filter(w => w.length > 1);
}

/** Part des mots du titre TMDB présents dans la fiche (0..1). */
function coverage(candidate, title) {
    const want = tokens(title);
    if (!want.length) return 0;
    const words = normalize(candidate).split(' ').filter(Boolean);
    const got = new Set(words.filter(w => w.length > 1));

    // Le site abrège parfois les titres en initiales : `d-b-s-broly` pour
    // « Dragon Ball Super: Broly ». On fait correspondre les lettres isolées
    // aux initiales des mots du titre, dans l'ordre.
    const initials = want.map(w => w[0]);
    const matchedInitials = new Set();
    let cursor = 0;
    for (const w of words) {
        if (w.length !== 1) continue;
        if (cursor < initials.length && w === initials[cursor]) {
            matchedInitials.add(cursor);
            cursor++;
        }
    }

    let hit = 0;
    for (let i = 0; i < want.length; i++) {
        if (got.has(want[i]) || matchedInitials.has(i)) hit++;
    }
    return hit / want.length;
}

function getSeasonNumber(text) {
    const combined = String(text || '').toLowerCase().replace(/-/g, ' ');
    let m = combined.match(/\bsaison\s*(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    m = combined.match(/\bseason\s*(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    m = combined.match(/\bs\s*(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    return null;
}

const FILM_MARKER = /(^|-)(film|movie|oav|ova|special)(-|$)/i;

// Mots de slug qui ne viennent pas du titre (suffixes du site) : ils ne doivent
// pas être comptés comme « mots en trop » dans le scoring.
const SLUG_MARKERS = new Set(['vostfr', 'vf', 'ddl', 'streaming', 'telecharger', 'fichier', 'uptobox',
    'saison', 'season', 'film', 'movie', 'oav', 'ova', 'special', 'complet', 'integrale', 'vostf']);

/** Mots du slug absents du titre TMDB (« le train de l infini » pour Demon Slayer). */
function extraTokens(base, titles) {
    const words = normalize(base).split(' ').filter(w => w && !SLUG_MARKERS.has(w) && !/^\d+$/.test(w));
    let best = null;
    for (const t of titles.slice(0, 6)) {
        const tt = new Set(tokens(t));
        const missing = words.filter(w => !tt.has(w));
        if (!best || missing.length < best.length) best = missing;
        if (!best.length) break;
    }
    return best || words;
}

// ─── Catalogue (sitemap) ─────────────────────────────────────────────────────

let _catalog = null; // cache intra-exécution (QuickJS : pas d'état entre appels)

/**
 * Catalogue des fiches depuis `sitemap.xml`.
 * @returns {Promise<Array<{url, slug, title, season, lang, isFilm}>>}
 */
async function getCatalog(signal) {
    if (_catalog) return _catalog;
    let xml = null;
    try {
        xml = await fetchText(`${BASE_URL}/sitemap.xml`, { signal });
    } catch (e) {
        console.warn(`[Vostfree] Sitemap indisponible (${e && e.message}) — repli recherche`);
        _catalog = [];
        return _catalog;
    }
    const out = [];
    const re = /<loc>\s*(https?:\/\/[^<\s]+\.html)\s*<\/loc>\s*(?:<lastmod>([^<]*)<\/lastmod>)?/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const url = m[1].trim();
        const path = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '');
        let slug = path.replace(/\.html$/i, '').replace(/^\d+-/, '');
        // Queue SEO du site : « -ddl-streaming… », « -telecharger-streaming… »
        slug = slug.replace(/-(?:ddl|telecharger)-.*$/i, '');
        if (!slug) continue;
        const lang = /-vostfr(?:-|$)/i.test(slug) ? 'VOSTFR' : (/-vf(?:-|$)/i.test(slug) ? 'VF' : 'VOSTFR');
        const base = slug.replace(/-(?:vf|vostfr)$/i, '');
        out.push({
            url,
            slug,
            base,
            title: base.replace(/-/g, ' '),
            season: getSeasonNumber(base),
            lang,
            isFilm: FILM_MARKER.test(base),
        });
    }
    _catalog = out;
    console.log(`[Vostfree] Catalogue: ${out.length} fiche(s) (sitemap)`);
    return out;
}

/**
 * Fiches candidates pour un contenu TMDB, triées par pertinence :
 * saison exacte > pas de saison (page « plate ») > autre saison ;
 * puis recouvrement du titre.
 */
function buildCandidates(catalog, titles, isMovie, seasonForRanking) {
    const cands = [];
    for (const entry of catalog) {
        // ⚠ Un film peut être stocké SANS marqueur (« demon-slayer-…-le-train-de-
        // l-infini-vostfr ») et une série peut porter le même titre de base :
        // c'est le score (recouvrement + mots en trop) qui tranche, pas le
        // marqueur. Seule la demande TV exclut les fiches explicitement film.
        if (!isMovie && entry.isFilm) continue;

        let best = 0;
        for (const t of titles.slice(0, 6)) best = Math.max(best, coverage(entry.base, t));
        if (best < 0.7) continue;

        // Pénalité pour les fiches d'un AUTRE contenu de la même franchise
        // (Demon Slayer : « le train de l'infini », « la forteresse infinie »…).
        let score = best * 100 - extraTokens(entry.base, titles).length * 15;
        if (!isMovie && seasonForRanking != null) {
            if (entry.season === seasonForRanking) score += 60;
            else if (entry.season == null) score += 10;
            else score -= 40;
        }
        if (isMovie && entry.isFilm) score += 20;
        cands.push({ ...entry, score });
    }
    cands.sort((a, b) => b.score - a.score);
    return cands;
}

// ─── Fiches ──────────────────────────────────────────────────────────────────

/**
 * Repère le `buttons_N` de l'épisode demandé dans une fiche.
 * Le texte des options est la seule source fiable (`buttons_747` = ép. 747).
 * @returns {{buttonsId: string, label: string}|null}
 */
function findEpisodeButtons($, episodeNums, isMovie) {
    const wanted = new Set(episodeNums.filter(n => Number.isFinite(n) && n > 0));
    let found = null;
    let firstOption = null;
    $('select.new_player_selector option, select[name="new_player_selector"] option').each((i, el) => {
        const text = $(el).text().trim();
        const val = $(el).attr('value') || '';
        if (!firstOption) firstOption = { value: val, text };
        const m = text.match(/[Ee]pisode\s*0*(\d+)/);
        if (!m) return;
        const num = parseInt(m[1], 10);
        if (wanted.has(num)) {
            found = { buttonsId: val, label: text, num };
            return false;
        }
    });
    if (found) return found;

    // Fiche FILM : l'unique option est libellée « Film » (pas « Episode 01 »).
    if (isMovie) {
        const val = firstOption ? firstOption.value : 'buttons_1';
        return { buttonsId: val || 'buttons_1', label: 'Film', num: null };
    }
    // Pas de sélecteur du tout = fiche mono-épisode (film, épisode unique).
    if (!$('select.new_player_selector').length && firstOption === null) {
        return { buttonsId: 'buttons_1', label: 'épisode unique', num: null };
    }
    return null;
}

/**
 * Saison annoncée par une fiche. La source fiable est la ligne d'en-tête DLE
 * `<li>… Saison:&nbsp;<b>01</b></li>` (présente même quand le slug et le h1
 * n'ont aucun marqueur : « jujutsu-kaisen-vostfr » → Saison 01). On retombe
 * ensuite sur le h1/titre (« Saison 2 », « Season 2 »).
 */
function pageSeason($) {
    try {
        let found = null;
        $('ul.slide-top li').each((i, el) => {
            if (found != null) return;
            const m = $(el).text().match(/saison\s*:?\s*0*(\d{1,2})\b/i)
                || $(el).text().match(/season\s*:?\s*0*(\d{1,2})\b/i);
            if (m) found = parseInt(m[1], 10);
        });
        if (found != null) return found;

        const text = `${$('h1').first().text()} ${$('title').first().text()}`;
        const m = text.match(/saison\s*:?\s*0*(\d{1,2})\b/i) || text.match(/season\s*:?\s*0*(\d{1,2})\b/i);
        return m ? parseInt(m[1], 10) : null;
    } catch (e) {
        return null;
    }
}

/** URL d'embed d'un lecteur, à partir de sa classe `new_player_xxx`. */
function playerUrl(elClass, content) {
    if (!content) return null;
    if (/^https?:\/\//i.test(content)) return content.trim();
    const id = content.trim();
    const host = (String(elClass).match(/new_player_([a-z0-9]+)/) || [])[1] || '';
    switch (host) {
        case 'sibnet': return `https://video.sibnet.ru/shell.php?videoid=${id}`;
        case 'uqload': return `https://uqload.is/embed-${id}.html`;
        case 'oneupload': return `https://oneupload.to/embed-${id}.html`;
        case 'vidmoly': return `https://vidmoly.to/embed-${id}.html`;
        case 'sendvid': return `https://sendvid.com/embed/${id}`;
        // Modèles repris du JS du site (`templates/Animix/js/anime.js`) : le
        // site ne stocke que l'ID et construit l'iframe côté navigateur.
        case 'myvi': return `https://myvi.ru/player/embed/html/${id}`;
        case 'mytv': return `https://www.myvi.tv/embed/${id}`;
        case 'ok': return `https://ok.ru/videoembed/${id}`;
        case 'fembed': return `https://fembed.com/v/${id}`;
        case 'rutube': return `https://rutube.ru/play/embed/${id}`;
        case 'kaztube': return `https://kaztube.kz/video/embed/${id}`;
        case 'gtv': return `https://iframedream.com/embed/${id}.html`;
        case 'mail2': return `https://my.mail.ru/video/embed/${id}`;
        case 'voe': return `https://voe.sx/e/${id}`;
        case 'dood': return `https://dood.to/e/${id}`;
        case 'stape':
        case 'streamtape': return `https://streamtape.com/e/${id}`;
        default: return null; // `vip` (getvid/upvid), `moevideo` (ninjastream), `mp4`
    }
}

async function resolvePlayer(embedUrl, lang, label, signal, startTime) {
    if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return null;
    const lower = embedUrl.toLowerCase();
    if (UNRESOLVABLE_HOSTS.some(h => lower.includes(h))) return null;
    const versionTag = lang === 'VF' ? 'VF' : 'VOSTFR';
    try {
        const resolved = await withTimeout(
            resolveStream({
                name: `Vostfree (${versionTag})`,
                title: `[${versionTag}] ${label}`,
                url: embedUrl,
                quality: 'HD',
                language: lang === 'VF' ? 'fr' : 'ja',
                headers: { Referer: `${BASE_URL}/` },
            }, 0),
            PLAYER_TIMEOUT_MS,
            'Vostfree player'
        );
        if (!resolved || !resolved.url || resolved.isDirect === false) return null;
        if (String(resolved.url).includes('[object')) return null;
        delete resolved.isDirect;
        delete resolved.originalUrl;
        return resolved;
    } catch (e) {
        return null;
    }
}

/** Repli : recherche POST du site (incomplète, utile pour les nouveautés). */
async function searchLegacy(title, signal) {
    try {
        const html = await fetchText(`${BASE_URL}/index.php?do=search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: BASE_URL,
                Origin: BASE_URL,
            },
            body: `do=search&subaction=search&story=${encodeURIComponent(title)}`,
            signal,
        });
        const $ = cheerio.load(html);
        const out = [];
        $('.search-result').each((i, block) => {
            const link = $(block).find('.title a');
            const href = link.attr('href') || '';
            const text = link.text().trim() || link.attr('title') || '';
            if (!href || text.length < 2) return;
            const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            const slug = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '').replace(/\.html$/i, '').replace(/^\d+-/, '');
            const clean = slug.replace(/-(?:ddl|telecharger)-.*$/i, '');
            const lang = /-vostfr(?:-|$)/i.test(clean) ? 'VOSTFR' : (/-vf(?:-|$)/i.test(clean) ? 'VF' : 'VOSTFR');
            const base = clean.replace(/-(?:vf|vostfr)$/i, '');
            out.push({
                url,
                slug: clean,
                base,
                title: text || base.replace(/-/g, ' '),
                season: getSeasonNumber(base),
                lang,
                isFilm: FILM_MARKER.test(base),
                score: 0,
            });
        });
        return out;
    } catch (e) {
        console.warn(`[Vostfree] Recherche POST en échec: ${e && e.message}`);
        return [];
    }
}

// ─── Entrée ──────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const startTime = Date.now();
    const isMovie = mediaType === 'movie';
    const tvType = isMovie ? 'movie' : 'tv';

    // Convention app : season=null + épisode ABSOLU (IDs kitsu:/mal:) → reverse-map.
    const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, { mediaType: tvType, startTime, budgetMs: BUDGET_MS });
    const seasonNum = isMovie ? null : Math.max(1, se.season || 1);
    const epNum = Math.max(1, se.episode || 1);

    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, tvType, { season: seasonNum != null ? seasonNum : season });
    } catch (e) {
        if (isAborted(signal)) return [];
    }
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : seasonNum;

    // Numéros d'épisode acceptés : local ET absolu (les fiches mélangent les
    // deux conventions selon la série).
    let episodeNums = [epNum];
    let absNum = null;
    try {
        const target = await resolveTargetEpisodes(tmdbId, tvType, season, episode, { startTime, budgetMs: BUDGET_MS });
        if (Array.isArray(target) && target.length) {
            episodeNums = target.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0);
        }
    } catch (e) { /* garde [epNum] */ }
    if (!episodeNums.includes(epNum)) episodeNums.unshift(epNum);
    absNum = episodeNums.find(n => n > epNum) || null;
    console.log(`[Vostfree] ${isMovie ? 'Film' : `S${seasonNum}E${epNum}`} — épisodes acceptés: ${episodeNums.join(', ')}${absNum ? ` (dont absolu ${absNum})` : ''}`);

    // 1. Catalogue sitemap (autorité) puis repli recherche POST.
    const catalog = await getCatalog(signal);
    let candidates = catalog.length ? buildCandidates(catalog, titles, isMovie, isMovie ? null : (effectiveSeason != null ? effectiveSeason : seasonNum)) : [];

    if (!candidates.length && !isAborted(signal)) {
        for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
            if (isBudgetExhausted(startTime, BUDGET_MS)) break;
            const found = await searchLegacy(title, signal);
            if (!found.length) continue;
            candidates = buildCandidates(found, titles, isMovie, isMovie ? null : seasonNum);
            if (candidates.length) {
                console.log(`[Vostfree] Repli recherche: ${candidates.length} candidat(s) pour "${title}"`);
                break;
            }
        }
    }

    if (!candidates.length) {
        console.warn('[Vostfree] Aucune fiche pour ce contenu');
        return [];
    }
    console.log(`[Vostfree] ${candidates.length} fiche(s) candidate(s): ${candidates.slice(0, 4).map(c => `${c.base}${c.season ? `(S${c.season})` : ''}/${c.lang}`).join(', ')}`);

    const streams = [];
    const seenEmbeds = new Set();
    const found = new Set(); // langues pour lesquelles on a des flux
    let pagesTried = 0;
    const pageCache = new Map(); // url → html (évite de re-sonder en repli)

    // Deux passes : saison exacte d'abord ; si elle ne donne rien, repli
    // **explicite** sur la saison réellement disponible (le site ne garde
    // souvent qu'une saison par série), annoncée dans le titre des flux.
    for (const allowOtherSeason of [false, true]) {
        if (allowOtherSeason) {
            if (isMovie || streams.length) break;
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
            console.log(`[Vostfree] Saison ${effectiveSeason} sans flux — repli explicite sur la saison disponible`);
            pagesTried = 0;
            found.clear();
        }
        const pageLimit = allowOtherSeason ? MAX_FALLBACK_PAGES : MAX_PAGES;

        for (const cand of candidates) {
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
            if (pagesTried >= pageLimit) break;
            if (found.has(cand.lang) && found.size >= 2) break;
            if (streams.length >= MAX_STREAMS) break;

            // Saison : une fiche explicitement d'une autre saison, ou une fiche
            // sans marqueur de saison pour une demande S2+ dont l'absolu est
            // inconnu (elle peut être la S1), est écartée en passe stricte. En
            // passe de repli, elle est servie avec la saison réelle dans le titre.
            const seasonMismatch = !isMovie && effectiveSeason != null
                && cand.season != null && cand.season !== effectiveSeason;
            const ambiguous = !isMovie && effectiveSeason != null
                && effectiveSeason > 1 && cand.season == null;
            const needsFallback = seasonMismatch || (ambiguous && !absNum);
            if (!allowOtherSeason && needsFallback) {
                if (seasonMismatch) {
                    console.log(`[Vostfree] ${cand.base}: saison ${cand.season} (demandée ${effectiveSeason}) — écartée`);
                } else {
                    console.log(`[Vostfree] ${cand.base}: saison ${effectiveSeason} demandée mais fiche sans saison et absolu inconnu — écartée`);
                }
                continue;
            }
            let html = pageCache.get(cand.url);
            if (html === undefined) {
                pagesTried++;
                try {
                    html = await fetchText(cand.url, { signal });
                } catch (e) {
                    if (isAborted(signal)) break;
                    continue;
                }
                pageCache.set(cand.url, html);
            }
            const $ = cheerio.load(html);

            // En passe de repli, la saison réellement servie va dans le titre :
            // marqueur du slug, sinon « Saison N » affichée sur la fiche.
            let seasonNote = null;
            if (allowOtherSeason) {
                const real = cand.season != null ? cand.season : pageSeason($);
                seasonNote = real != null
                    ? `Saison ${real} (S${effectiveSeason} absente du site)`
                    : `Saison du site (S${effectiveSeason} absente)`;
            }

            // Un film n'a qu'un lecteur : si la fiche expose un sélecteur multi-
            // épisodes, c'est une fiche SÉRIE (ex. « le train de l'infini » = arc
            // TV en 7 épisodes) → jamais l'épisode 1 pour une demande film.
            if (isMovie && $('select.new_player_selector option').length > 1) {
                console.log(`[Vostfree] ${cand.base}: fiche série ignorée pour une demande film`);
                continue;
            }

            const target = findEpisodeButtons($, ambiguous && absNum && !allowOtherSeason ? [absNum] : episodeNums, isMovie);
            if (!target) {
                console.log(`[Vostfree] ${cand.base}: épisode ${episodeNums.join('/')} absent du sélecteur`);
                continue;
            }

            const players = $(`#${target.buttonsId} div[id^="player_"]`).toArray();
            if (!players.length) {
                console.log(`[Vostfree] ${cand.base}: aucun lecteur dans ${target.buttonsId}`);
                continue;
            }

            const priority = (el) => {
                const cls = ($(el).attr('class') || '').toLowerCase();
                for (let i = 0; i < HOST_PRIORITY.length; i++) if (cls.includes(HOST_PRIORITY[i])) return i;
                return HOST_PRIORITY.length;
            };
            const ordered = [...players].sort((a, b) => priority(a) - priority(b));

            let resolvedHere = 0;
            for (const el of ordered) {
                if (resolvedHere >= TARGET_DIRECT_PER_LANG) break;
                if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;

                const id = ($(el).attr('id') || '').replace('player_', '');
                const elClass = ($(el).attr('class') || '').toLowerCase();
                const rawContent = $(`#content_player_${id}`).text().trim();
                const url = playerUrl(elClass, rawContent);
                if (!url || seenEmbeds.has(url)) continue;
                seenEmbeds.add(url);

                const label = `${($(el).text().trim() || 'Lecteur')}${target.num ? ` - Ép.${target.num}` : ''}${seasonNote ? ` · ${seasonNote}` : ''}`;
                const st = await resolvePlayer(url, cand.lang, label, signal, startTime);
                if (!st) continue;
                st.name = st.name || `Vostfree (${cand.lang})`;
                st.title = st.title || `[${cand.lang}] ${label}`;
                st.language = cand.lang === 'VF' ? 'fr' : 'ja';
                streams.push(st);
                resolvedHere++;
            }

            if (resolvedHere > 0) found.add(cand.lang);
            else console.log(`[Vostfree] ${cand.base} (${cand.lang}): 0 flux résolu`);
        }
        if (streams.length) break;
    }

    if (!streams.length) {
        console.warn(`[Vostfree] 0 flux (${pagesTried} fiche(s) sondée(s))`);
        return [];
    }
    console.log(`[Vostfree] ${streams.length} flux en ${Date.now() - startTime} ms`);
    return sortStreamsByLanguage(streams);
}
