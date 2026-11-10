/**
 * Extractor Logic for Anime-Sama (anime-sama.to) — diag live 2026-10.
 *
 * Chaîne réelle du site (vérifiée en live) :
 *  1. Recherche : POST /template-php/defaut/fetch.php {query} → liens
 *     /catalogue/{slug} avec titre + sous-titres (`.asn-search-result-*`).
 *  2. Fiche   : GET /catalogue/{slug}/ → les panneaux sont déclarés par
 *     `panneauAnime("Titre [Episode 1 à 61]", "saison1/vostfr")`. C'est
 *     l'INDEX AUTORITAIRE du site : liste des saisons/sagas/films/OAV avec,
 *     pour les longues séries, la PLAGE D'ÉPISODES ABSOLUS. Il contient aussi
 *     les entrées que le provider ignorait (`film1`, `film2`, `oav`,
 *     `saison1hs` sans fillers, `kai*` recuts).
 *  3. Épisodes: GET /catalogue/{slug}/{saison}/{lang}/episodes.js
 *     → `var epsN = ['https://player/embed-xxx', ...]` (un var par groupe de
 *     lecteurs). L'INDEX DU TABLEAU = numéro d'épisode LOCAL À LA SAISON.
 *  4. Langues : le dossier `{lang}` existe ou non (404/soft-404 « Accès
 *     Introuvable »). Le site propose `vostfr`, `vf`, `vf1`, `vf2` (2ᵉ/3ᵉ
 *     doublage FR), `vqc` (VF québécoise), `va` (anglais), `var` (arabe),
 *     `vkr` (coréen), `vcn` (chinois). Les boutons `switchXXX` de la page
 *     sont TOUJOURS présents (masqués en JS) → seule la sonde du dossier
 *     tranche.
 *
 * Deux bugs structurels corrigés ici :
 *  A. MAPPING DES ÉPISODES — le provider supposait `saison TMDB N == saison N`
 *     du site et `épisode TMDB == index du tableau`. Faux dès que le site
 *     découpe en sagas : One Piece (TMDB S3E1 = absolu 78) tombait dans
 *     `saison3` (site 144-206) → épisode 144 servi. Détective Conan (TMDB
 *     S1 de 1100+ épisodes) tombait dans `saison1` (1-42) → 0 stream.
 *     On mappe désormais l'épisode ABSOLU (somme TMDB des saisons
 *     précédentes) sur la plage de la saga → index local exact.
 *  B. LANGUES — seuls `vostfr` et `vf` étaient sondés, alors que `vf2`
 *     (One Piece S1), `va`, `var`, `vqc`… contiennent du contenu réel.
 *     Les 9 dossiers sont sondés (français d'abord, puis le reste si peu de
 *     résultats) et chaque piste est étiquetée dans le titre.
 */

import { fetchText, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, withTimeout, isBudgetExhausted, sortStreamsByLanguage, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import {
    hasForeignLeadingTokens, toSlug, stripSeasonSuffix, resolveTargetEpisodes,
    getAbsoluteEpisodeFromTmdb, normalize, resolveSeasonEpisodeInputs
} from '../utils/dle-extractor.js';

const BASE_URL = "https://anime-sama.to";
const MAX_FALLBACK_TITLES = 5;
const MAX_FALLBACK_SLUGS = 4;
// Passe 3 (discovery vérifiée) : chaque candidat coûte 1 GET JSON + 1 GET HTML.
// 6 suffit très largement — les titres sont déjà ordonnés par pertinence, et
// le budget réseau de NuvioTV est sérialisé (12 candidats = 24 GET).
const MAX_VERIFIED_SLUGS = 6;
const VERIFY_BUDGET_MS = 12000;
const BUDGET_MS = 40000;
// Budget dédié à la résolution des lecteurs (la partie lourde : chaque
// player = 1 à 4 requêtes). Au-delà, on garde ce qui est déjà résolu.
const PLAYER_BUDGET_MS = 20000;
// Dès qu'un slug a fourni du contenu pour l'épisode demandé, on ARRÊTE :
// toutes les langues sont déjà couvertes par les dossiers de la saison du
// site. Continuer revient à interroger des slugs homonymes — c'est ainsi que
// `naruto-shippuden` (saison SUIVANTE) se retrouvait servi pour « Naruto »
// (TMDB 46260), la garde titre acceptant l'inclusion à frontières de mots.
const ENOUGH_STREAMS = 1;
const TARGET_STREAMS = 6;
const TARGET_DIRECT_PER_LANG = 2;
const EPISODES_TIMEOUT = 8000;
const INDEX_TIMEOUT = 9000;

// ─── Langues disponibles sur le site ─────────────────────────────────────────
// `vostfr`/`vf` couvrent la majorité du catalogue ; `vf1`/`vf2`/`vqc`/`va`/
// `var`/`vkr`/`vcn` existent réellement (ex. One Piece S1 → `vf2`) et étaient
// purement inaccessibles.
const LANGS_FR = ['vostfr', 'vf', 'vf1', 'vf2'];
const LANGS_EXTRA = ['vqc', 'va', 'var', 'vkr', 'vcn'];
const LANG_LABEL = {
    vostfr: 'VOSTFR', vf: 'VF', vf1: 'VF1', vf2: 'VF2', vqc: 'VFQ',
    va: 'VA', var: 'VAR', vkr: 'VKR', vcn: 'VCN',
};
// Codes de langue compris par les apps Nuvio (fr/en/multi/ja + codes ISO).
const LANG_CODE = {
    vostfr: 'fr', vf: 'fr', vf1: 'fr', vf2: 'fr', vqc: 'fr',
    va: 'en', var: 'ar', vkr: 'ko', vcn: 'zh',
};

/**
 * Search for slugs on Anime-Sama, scored by relevance to the query
 */
async function searchSlugsScored(query) {
    try {
        const html = await withTimeout(fetchText(`${BASE_URL}/template-php/defaut/fetch.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': BASE_URL
            },
            body: `query=${encodeURIComponent(query)}`
        }), 8000, `search ${query.slice(0, 30)}`);
        const $ = cheerio.load(html);
        const results = [];
        $('a[href*="/catalogue/"]').each((i, el) => {
            const h = $(el).attr('href');
            const match = h.match(/\/catalogue\/([^/]+)\/?/);
            if (!match) return;
            const slug = match[1];
            if (results.some(r => r.slug === slug)) return;
            const title = $(el).find('.asn-search-result-title').text().trim();
            const subtitle = $(el).find('.asn-search-result-subtitle').text().trim();
            const score = scoreSearchResult(title, subtitle, query);
            results.push({ slug, title, subtitle, score });
        });
        results.sort((a, b) => b.score - a.score);
        // Only return slugs with a meaningful score (avoid false positives)
        return results.filter(r => r.score >= 15).map(r => r.slug);
    } catch (e) { return []; }
}

function scoreSearchResult(resultTitle, resultSubtitle, query) {
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = resultTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const s = resultSubtitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let score = 0;
    if (t === q) return 100;
    // Garde anti-homonymes (bug "Gate" → Steins;Gate) : un token significatif
    // AVANT la requête ("steins", "new"…) rejette le match. Les tokens
    // génériques (années, hdN, stop-words) sont ignorés par la garde.
    if ((t.includes(q) || q.includes(t)) && hasForeignLeadingTokens(t, q)) return 0;
    if (t.includes(q)) score += 60;
    else if (q.includes(t)) {
        // Penalize short results that are substrings of the query
        // e.g. "Another" in "No Longer Allowed in Another World" → low score
        // Mots > 3 lettres : "the"/"les"/"des" ne comptent pas (ils faisaient
        // passer des slugs sans rapport au-dessus du seuil de recherche).
        const qWordCount = q.split(/[^a-z0-9]+/).filter(w => w.length > 3).length;
        const tWordCount = t.split(/[^a-z0-9]+/).filter(w => w.length > 3).length;
        if (qWordCount > 1 && tWordCount <= 1) {
            // Single-word result in a multi-word query: heavy penalty
            score += 10;
        } else {
            score += 50;
        }
    }

    const qWords = q.split(/[^a-z0-9]+/).filter(w => w.length > 3);
    const tWords = t.split(/[^a-z0-9]+/).filter(w => w.length > 3);

    // Le résultat de recherche du site expose dans `.asn-search-result-subtitle`
    // la liste des titres alternatifs (FR/EN/romaji). C'est LA source de
    // vérité pour les œuvres dont le titre site est en romaji : « Attack on
    // Titan » ne matche pas le title « Shingeki no Kyojin », mais figure dans
    // le subtitle — sans ce test, la recherche ne proposait jamais la fiche
    // (0 stream sur AOT et tous les titres à double nomenclature).
    // Le garde anti-faux-match de la passe 2 (`passesTitleGuard`) tranche
    // ensuite sur le vrai <h1>, on peut donc se montrer large ici.
    if (s && q.length >= 4) {
        if (s === q) return 100;
        if (s.includes(q)) score = Math.max(score, 80);
        else if (q.includes(s) && s.length >= 4) score = Math.max(score, 60);
    }

    for (const w of qWords) {
        if (tWords.includes(w)) score += 15;
    }
    for (const w of qWords) {
        if (s.includes(w) && !t.includes(w)) score += 3;
    }

    // Anti-false-positive: penalize if result has very few words compared to query
    // e.g. "Another" (1 word) matching "No Longer Allowed in Another World" (5 words)
    if (qWords.length >= 3 && tWords.length <= 1) {
        score = Math.min(score, 5);
    } else if (qWords.length >= 2 && tWords.length <= 1) {
        score = Math.min(score, 10);
    }

    // Anti-false-positive inverse : requête à 1 mot incluse dans un titre plus long
    // ex. TMDB "Gate" (2015) → "Steins Gate" / "The New Gate" (score 75) → contenu
    // d'une AUTRE série servi. Seule l'égalité exacte (t === q → 100) doit passer.
    if (qWords.length === 1 && tWords.length > 1 && t !== q) {
        score = Math.min(score, 10);
    }

    return score;
}

// ─── Garde anti-faux-match (titre page catalogue vs titres TMDB) ─────────────
// episodes.js ne contient AUCUN titre : un slug au contenu valide n'est pas
// forcément la bonne œuvre (constaté : `black-torch` servi pour "Kamen
// Rider", `great-pretender` pour "Great Mazinger" — episodes.js valides dans
// les deux cas). On valide donc le TITRE RÉEL de la page `catalogue/{slug}/`
// (<h1>, repli <title>) contre les titres TMDB, avec la même règle stricte
// que Mugiwara et le même seuil (80) : égalité normalisée (100) ou inclusion
// à frontières de mots sans tokens étrangers ("Shingeki no Kyojin" ≡ titres
// AOT → 100 ; "Black Torch"/"Great Pretender"/"Tojima Wants to Be a Kamen
// Rider" vs Kamen/Mazinger → 0 → rejetés).
const TITLE_GUARD_THRESHOLD = 80;

// Frontières de mots sur chaînes normalisées (miroir d'includesWord mugiwara).
function includesWordStrict(hay, needle) {
    if (!hay || !needle) return false;
    let pos = hay.indexOf(needle);
    while (pos !== -1) {
        const before = pos === 0 || hay[pos - 1] === ' ';
        const after = pos + needle.length >= hay.length || hay[pos + needle.length] === ' ';
        if (before && after) return true;
        pos = hay.indexOf(needle, pos + 1);
    }
    return false;
}

function scorePageTitle(pageName, title) {
    const nt = normalize(title);
    const nr = normalize(pageName);
    if (!nt || !nr) return 0;
    if (nr === nt) return 100;
    if ((includesWordStrict(nr, nt) || includesWordStrict(nt, nr)) && !hasForeignLeadingTokens(nr, nt)) return 80;
    return 0;
}

function maxPageTitleScore(pageName, titles) {
    let best = 0;
    for (const t of titles || []) {
        if (typeof t !== 'string' || !t) continue;
        const s = scorePageTitle(pageName, t);
        if (s > best) {
            best = s;
            if (best >= 100) break;
        }
    }
    return best;
}

// Titre réel de la fiche : <h1> de la page catalogue (repli : <title>).
// null si la page est un 404/soft-404 ou sans titre (= rejet du slug).
async function fetchCatalogueTitle(slug) {
    let html = null;
    try {
        html = await fetchText(`${BASE_URL}/catalogue/${slug}/`);
    } catch (_) { return null; }
    return extractPageTitle(html);
}

function extractPageTitle(html) {
    if (!html || html.length < 500 || /acc[eè]s\s+introuvable/i.test(html)) return null;
    try {
        const $ = cheerio.load(html);
        const h1 = $('h1').first().text().trim();
        if (h1) return h1;
        const t = $('title').first().text().trim();
        if (t) return t.split('|')[0].trim();
    } catch (_) { }
    return null;
}

// 1 fetch HTML supp. max par slug candidat : valide le titre de la fiche,
// false = slug rejeté (l'appelant continue sur le candidat suivant).
async function passesTitleGuard(slug, titles, signal, startTime) {
    if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return false;
    const name = await fetchCatalogueTitle(slug);
    if (!name) {
        console.log(`[Anime-Sama] Slug ${slug} rejeté: page catalogue sans titre (404/soft-404)`);
        return false;
    }
    const score = maxPageTitleScore(name, titles);
    if (score < TITLE_GUARD_THRESHOLD) {
        console.log(`[Anime-Sama] Slug ${slug} rejeté: titre page "${name}" sans rapport (score ${score})`);
        return false;
    }
    console.log(`[Anime-Sama] Slug ${slug}: titre page "${name}" validé (score ${score})`);
    return true;
}

// ─── Index du catalogue (panneauAnime) ───────────────────────────────────────

/**
 * « Saga 2 Alabasta [Episode 62 à 143] » → { start: 62, end: 143 }
 * « Saison 31 [Episode 1187 à ...] »     → { start: 1187, end: null }
 * « Saison 1 »                           → null (pas de plage → index = épisode)
 */
function parseEpisodeRange(label) {
    if (!label) return null;
    const m = label.match(/\[\s*[EÉeé]pisodes?\s*(\d+)\s*(?:à|a|au|-|–|—|to)\s*(\d+)/i);
    if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
    const open = label.match(/\[\s*[EÉeé]pisodes?\s*(\d+)\s*(?:à|a|-|–|—|to)?\s*(?:\.\.\.|…)/i);
    if (open) return { start: parseInt(open[1], 10), end: null };
    const single = label.match(/\[\s*[EÉeé]pisodes?\s*(\d+)\s*\]/i);
    if (single) return { start: parseInt(single[1], 10), end: parseInt(single[1], 10) };
    return null;
}

/**
 * Parse la fiche catalogue : lignes `panneauAnime("Titre", "chemin")`.
 * Retourne [{ label, season, lang, start, end }] dédupliqué par `season`.
 * `season` = dossier réel du site (`saison1`, `saison2-3`, `film1`, `kai`…).
 */
export function parseCatalogueIndex(html) {
    if (!html || typeof html !== 'string') return [];
    const entries = [];
    const seen = new Set();
    const re = /panneauAnime\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const label = m[1];
        const path = m[2];
        const pm = path.match(/^([a-z0-9][a-z0-9-]*)(?:\/([a-z0-9]+))?$/i);
        if (!pm) continue;                     // en-tête d'exemple ("nom","url")
        const season = pm[1];
        if (season === 'url' || label === 'nom') continue;
        if (seen.has(season)) continue;
        seen.add(season);
        const range = parseEpisodeRange(label);
        entries.push({
            label: (label || '').trim(),
            season,
            lang: pm[2] || 'vostfr',
            start: range ? range.start : null,
            end: range ? range.end : null,
        });
    }
    return entries;
}

// Cache par exécution : la fiche est réutilisée entre les candidats de slug.
const INDEX_CACHE = new Map();

// MISSING = la fiche n'existe pas (404 / soft-404 / aucun panneau)
// FAILED  = la requête a échoué (réseau, timeout) → état inconnu, on garde
//           le chemin historique comme filet de sécurité.
const MISSING = { missing: true };
const FAILED = { failed: true };

async function getCatalogueIndex(slug, signal) {
    if (INDEX_CACHE.has(slug)) return INDEX_CACHE.get(slug);
    let result = FAILED;
    if (!isAborted(signal)) {
        let html = null;
        try {
            html = await withTimeout(fetchText(`${BASE_URL}/catalogue/${slug}/`), INDEX_TIMEOUT, `index ${slug}`);
        } catch (_) { html = null; }
        if (typeof html === 'string') {
            if (/acc[eè]s\s+introuvable/i.test(html) || html.length < 500) {
                result = MISSING;
            } else {
                const entries = parseCatalogueIndex(html);
                if (entries.length === 0) {
                    result = MISSING;
                } else {
                    console.log(`[Anime-Sama] Index ${slug}: ${entries.map(e => e.season).join(', ')}`);
                    result = { entries };
                }
            }
        }
    }
    INDEX_CACHE.set(slug, result);
    return result;
}

const FILM_RE = /^(film\d*|movie\d*|oav\d*|ona\d*)$/i;

/**
 * Saisons candidates pour une série, par ordre de pertinence.
 *  - `base` = premier épisode absolu de la saison (null si inconnu).
 *  - `idx`  = index 0-based à lire dans episodes.js.
 * Une plage connue prime sur le numéro de saison TMDB (cas One Piece/Conan).
 */
export function selectSeasonCandidates(index, { effectiveSeason, absEpisode, episode }) {
    const list = Array.isArray(index) ? index : [];
    const out = [];
    const seen = new Set();
    const push = (season, base, label) => {
        if (!season || seen.has(season)) return;
        seen.add(season);
        out.push({ season, base, label: label || '' });
    };

    // 1. Sagas dont la plage contient l'épisode absolu (mapping exact)
    for (const e of list) {
        if (e.start == null) continue;
        if (absEpisode >= e.start && (e.end == null || absEpisode <= e.end)) {
            push(e.season, e.start, e.label);
        }
    }
    // 2. Saison du même numéro que la saison TMDB (structure identique)
    const exact = list.find(e => e.season === `saison${effectiveSeason}`);
    if (exact) push(exact.season, exact.start, exact.label);
    // 3. Une seule saison « épisodes » sur le site (saisons TMDB fusionnées) :
    //    on lit l'épisode absolu dedans.
    const episodeSeasons = list.filter(e => /^saison\d+$/i.test(e.season));
    if (episodeSeasons.length === 1 && !list.some(e => e.season === `saison${effectiveSeason}`)) {
        push(episodeSeasons[0].season, 1, episodeSeasons[0].label);
    }
    // 4. Dernier repli : les saisons à plage (lecture par l'absolu)
    for (const e of list) {
        if (e.start != null) push(e.season, e.start, e.label);
    }
    // On borne : chaque candidat coûte au moins une requête.
    return out.slice(0, 4);
}

/**
 * Entrées « film » du catalogue (film, film1, film2, oav…), ordonnées par
 * ressemblance entre le libellé du panneau et les titres TMDB. Le site ne
 * donne pas le nom du film dans l'URL (`film1`, `film2`) mais le libellé
 * porte la précision (« Film - Train de l'infini »).
 */
export function selectMovieCandidates(index, titles) {
    const list = Array.isArray(index) ? index : [];
    const films = list.filter(e => FILM_RE.test(e.season));
    if (films.length === 0) return [];
    const scored = films.map(e => {
        const label = normalize(e.label);
        let best = 0;
        for (const t of titles || []) {
            const nt = normalize(t);
            if (!nt) continue;
            const words = nt.split(' ').filter(w => w.length > 3);
            if (words.length === 0) continue;
            let hits = 0;
            for (const w of words) if (label.includes(w)) hits++;
            best = Math.max(best, hits);
        }
        return { ...e, score: best };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
}

// ─── Lecture des pistes ──────────────────────────────────────────────────────

function getPlayerName(varName, url) {
    const u = (url || '').toLowerCase();
    if (u.includes('sibnet')) return 'Sibnet';
    if (u.includes('vidmoly')) return 'Vidmoly';
    if (u.includes('voe') || u.includes('jeremy') || u.includes('teresa')) return 'Voe';
    if (u.includes('smoothpre')) return 'Smoothpre';
    if (u.includes('sendvid')) return 'Sendvid';
    if (u.includes('stape') || u.includes('streamtape')) return 'Streamtape';
    if (u.includes('dood')) return 'Doodstream';
    if (u.includes('uqload') || u.includes('oneupload')) return 'Uqload';
    if (u.includes('ansembed')) return 'AnsEmbed';
    if (u.includes('vk.com') || u.includes('vkvideo')) return 'VK';
    if (u.includes('embed4me')) return 'Embed4Me';
    if (u.includes('sibnet')) return 'Sibnet';
    return 'Player';
}

function parseUrls(jsContent) {
    const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm;
    const results = [];
    let match;
    while ((match = varRegex.exec(jsContent)) !== null) {
        const urls = match[2].match(/['"]([^'"]+)['"]/g)?.map(u => u.slice(1, -1)) || [];
        results.push({ varName: match[1], urls });
    }
    return results;
}

async function fetchJs(slug, seasonPath, lang) {
    const url = `${BASE_URL}/catalogue/${slug}${seasonPath ? '/' + seasonPath : ''}/${lang}/episodes.js`;
    try {
        const content = await withTimeout(fetchText(url), EPISODES_TIMEOUT, `fetchJs ${slug}`);
        return content || null;
    } catch (e) { return null; }
}

// Slots morts — exclus AVANT resolveStream pour ne pas brûler le budget.
// ⚠️ sendvid N'EST PLUS ici (vérifié live 2026-10 : resolveSendvid extrait bien
// le MP4 signé quand le fichier est vivant — `videos2.sendvid.com/…mp4` → 200
// video/mp4 ; sendvid apparaît 606 fois sur 14 titres scannés). L'exclure
// supprimait de vraies pistes (dont des VF). Ne reste que la famille embed4me :
// pages qui ne répondent jamais (timeout constaté à 15 s sur lpayer.embed4me.com,
// y compris en fetch direct) → pire cas de gaspillage de budget.
const DEAD_HOSTS = /embed4me/i;
// Hosts avec résolveur dédié d'abord (évite de brûler le budget 12s sur des players génériques)
// VK (18 embeds sur 14 titres) : l'embed n'expose aucun flux, l'API al_video.php
// donne un master HLS okcdn.ru (144→1080p) en 1 requête → priorité haute.
const HOST_PRIORITY = [
    [/sibnet/i, 0],
    [/vk\.com|vkvideo/i, 1],
    [/uqload|oneupload/i, 1],
    [/vidmoly|ansembed/i, 2],
    [/voe|jeremy|teresa|smoothpre|megankiddifference/i, 3]
];
function hostScore(url) {
    const u = url || '';
    for (const [re, score] of HOST_PRIORITY) { if (re.test(u)) return score; }
    return 4;
}

function isValidEpisodesJs(content) {
    if (!content || typeof content !== 'string') return false;
    // Soft-404 du site : 200 + page HTML « Accès Introuvable »
    if (/acc[eè]s\s+introuvable/i.test(content)) return false;
    if (/<html/i.test(content)) return false;
    return /var\s+eps/i.test(content);
}

function isValidFilmJs(content) {
    if (!content || typeof content !== 'string') return false;
    if (/acc[eè]s\s+introuvable/i.test(content)) return false;
    if (/<html/i.test(content)) return false;
    return parseUrls(content).length > 0 || /iframe|player|embed|https?:\/\//i.test(content);
}

// Le site est FR : les slugs sont bâtis sur le titre FR ou romaji, presque
// jamais sur les traductions exotiques (PT/CS/DE…). La passe 2 sonde toSlug()
// des titres TMDB dans cet ordre : dérivés « série » (films), titres FR,
// titres courts (romaji/acronymes), puis le reste dans l'ordre TMDB.
// La vérification episodes.js + la garde titre tranchent (episodes.js seul
// ne suffit pas : une autre œuvre peut avoir un contenu valide).
function isFrenchTitle(t) {
    const n = (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /\b(le|la|les|de|des|du|un|une|et|au|aux|dans|pour|avec|sans|sous|sur|par|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs|je|tu|il|elle|nous|vous|ils|elles|qui|que|est|sont|film|nom|noms)\b/.test(n);
}

function isShortTitle(t) {
    const words = (t || '').split(/[^A-Za-z0-9]+/).filter(Boolean);
    return words.length >= 1 && words.length <= 3;
}

// Ordonne les titres de base (dédupliqués via stripSeasonSuffix) pour la passe 2
function orderVerificationTitles(titles, searchTitles, mediaType) {
    const baseSeen = new Set();
    const base = [];
    const pushBase = (t) => {
        if (!t) return;
        const b = stripSeasonSuffix(t);
        const key = b.toLowerCase();
        if (!b || baseSeen.has(key)) return;
        baseSeen.add(key);
        base.push(b);
    };
    // Films : dérivés « titre de série » en premier (ex. demon-slayer pour un film DS)
    if (mediaType === 'movie') {
        for (const t of searchTitles) pushBase(t);
    }
    const frTitles = [];
    const shortTitles = [];
    const restTitles = [];
    for (const t of titles) {
        const b = stripSeasonSuffix(t);
        const key = (b || '').toLowerCase();
        if (!b || baseSeen.has(key)) continue;
        baseSeen.add(key);
        if (isFrenchTitle(b)) frTitles.push(b);
        else if (isShortTitle(b)) shortTitles.push(b);
        else restTitles.push(b);
    }
    return base.concat(frTitles, shortTitles, restTitles);
}

// Sonde d'existence TV : saison{season} vostfr puis vf. Le contenu
// episodes.js prouve l'existence du slug, PAS son identité (une autre œuvre
// peut avoir un episodes.js valide) → la garde titre tranche ensuite.
async function verifySlugTv(slug, season, signal, startTime) {
    for (const lang of ['vostfr', 'vf']) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return null;
        const js = await fetchJs(slug, `saison${season}`, lang);
        if (isValidEpisodesJs(js)) return slug;
    }
    return null;
}

// Sonde d'existence film : toutes les variantes utilisées par le site.
async function verifySlugMovie(slug, signal, startTime) {
    for (const seasonPath of ['film', 'film1', 'film2']) {
        for (const lang of ['vostfr', 'vf']) {
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return null;
            const js = await fetchJs(slug, seasonPath, lang);
            if (isValidFilmJs(js)) return slug;
        }
    }
    return null;
}

// ─── Résolution des lecteurs ─────────────────────────────────────────────────

const PLAYER_TIMEOUT = 8000;

async function buildStreams(parsed, lang, episode, idx, ctx, deadline) {
    // Résolution séquentielle avec early-exit (le fetch QuickJS est bloquant :
    // paralléliser ne fait que multiplier le pic de timeout de l'app).
    const label = LANG_LABEL[lang] || lang.toUpperCase();
    const code = LANG_CODE[lang] || 'fr';
    const playable = [];

    // Ordonner les vars en favorisant les hosts à résolveur dédié
    // (tri stable : l'ordre du site est préservé à priorité égale)
    const ordered = parsed.slice().sort((a, b) =>
        hostScore(a.urls[idx] || '') - hostScore(b.urls[idx] || ''));

    for (const { varName, urls } of ordered) {
        if (playable.length >= TARGET_DIRECT_PER_LANG) break;
        if (Date.now() > deadline) break;

        const playerUrl = urls[idx];
        if (!playerUrl || !playerUrl.startsWith('http')) continue;
        if (DEAD_HOSTS.test(playerUrl)) continue;

        const epLabel = episode ? `Ep ${episode} - ` : '';
        try {
            const stream = await withTimeout(
                resolveStream({
                    name: `Anime-Sama (${label})`,
                    title: `${getPlayerName(varName, playerUrl)} - ${epLabel}${label}`,
                    url: playerUrl,
                    quality: "HD",
                    language: code,
                    headers: { "Referer": BASE_URL }
                }),
                PLAYER_TIMEOUT,
                `AnimeSama player ${getPlayerName(varName, playerUrl)}`
            );
            if (stream && stream.isDirect) playable.push(stream);
        } catch (e) { /* skip failed player */ }
    }
    return playable;
}

/**
 * Sonde les dossiers de langue d'une saison et retourne les pistes valides.
 * `idx` = index 0-based de l'épisode dans la saison.
 * Les langues FR sont sondées d'abord ; les langues « extra » (VA/VAR/VKR/
 * VCN/VFQ) seulement si le français n'a pas suffi — chaque sonde est un GET.
 */
async function probeLanguages(slug, season, idx, ctx) {
    const valid = [];
    let maxTotal = 0;
    const probe = async (langs) => {
        for (const lang of langs) {
            if (isAborted(ctx.signal) || isBudgetExhausted(ctx.startTime, BUDGET_MS)) return;
            if (ctx.streams.length + valid.length >= TARGET_STREAMS) return;
            const js = await fetchJs(slug, season, lang);
            if (!isValidEpisodesJs(js)) continue;
            const parsed = parseUrls(js);
            if (parsed.length === 0) continue;
            const total = Math.max(...parsed.map(p => p.urls.length));
            if (total > maxTotal) maxTotal = total;
            if (idx < 0 || idx >= total) continue;
            valid.push({ lang, parsed, total });
        }
    };
    await probe(LANGS_FR);
    // Épisode nettement hors plage de la saison (saga voisine, saison
    // découpée en parties) : inutile de sonder les 5 langues restantes.
    const clearlyOutOfRange = valid.length === 0 && maxTotal > 0 && idx >= maxTotal + 2;
    // Les langues extra (VA/VAR/VKR/VCN/VFQ) coûtent 1 GET chacune : on ne les
    // sonde que si le français n'a pas déjà donné au moins 2 pistes (VF et
    // VOSTFR). Sinon on garde le budget pour la résolution des lecteurs.
    if (!clearlyOutOfRange && valid.length < 2 && ctx.streams.length + valid.length < TARGET_STREAMS) {
        await probe(LANGS_EXTRA);
    }
    return valid;
}

/**
 * Résout une saison du site pour l'épisode voulu.
 * Retourne les streams (tableau éventuellement vide).
 */
async function resolveSeason(slug, season, idx, ctx) {
    const tracks = await probeLanguages(slug, season, idx, ctx);
    if (tracks.length === 0) return [];
    // Budget lecteurs : 20 s max par saison, borné par le budget global.
    const deadline = Math.min(Date.now() + PLAYER_BUDGET_MS, ctx.startTime + BUDGET_MS - 3000);
    const out = [];
    for (const track of tracks) {
        if (Date.now() > deadline) break;
        if (isAborted(ctx.signal)) break;
        if (ctx.streams.length + out.length >= TARGET_STREAMS) break;
        const streams = await buildStreams(track.parsed, track.lang, ctx.episodeLabel, idx, ctx, deadline);
        out.push(...streams);
    }
    if (out.length > 0) {
        console.log(`[Anime-Sama] ${slug}/${season}: ${out.length} stream(s) [${tracks.map(t => t.lang).join(',')}]`);
    }
    return out;
}

// ─── Chemin historique (fallback) ────────────────────────────────────────────
// Conservé tel quel : il couvre les saisons découpées en parties
// (`saison4`, `saison4-2`, `saison4-3` — cas Attack on Titan) qui n'exposent
// aucune plage d'épisodes dans l'index, ainsi que les fiches absentes du
// catalogue parsé. Les numéros d'épisode y sont cumulatifs.
async function tryFetchEpisodeLegacy(slug, lang, season, episode, ctx) {
    const deadline = ctx.startTime + BUDGET_MS - 3000;
    const outOfBudget = () => isAborted(ctx.signal) || isBudgetExhausted(ctx.startTime, BUDGET_MS) || Date.now() > deadline;
    const fetchAndBuild = async (seasonPath) => {
        if (outOfBudget()) return null;
        const js = await fetchJs(slug, seasonPath, lang);
        if (!isValidEpisodesJs(js)) return null;
        const parsed = parseUrls(js);
        if (parsed.length === 0) return null;
        return parsed;
    };

    const totalOf = (parsed) => Math.max(...parsed.map(p => p.urls.length));

    const mainParsed = await fetchAndBuild(`saison${season}`);
    if (mainParsed) {
        const totalEps = totalOf(mainParsed);
        if (episode >= 1 && episode <= totalEps) {
            return buildStreams(mainParsed, lang, ctx.episodeLabel, episode - 1, ctx, deadline);
        }
        // L'épisode n'est pas dans la saison principale : sous-saisons
        // (le site découpe « saison N partie K » en `saison{N}-{K}`)
        let cumulativeEps = totalEps;
        for (const subNum of ['2', '3', '4', '5', '6']) {
            const subParsed = await fetchAndBuild(`saison${season}-${subNum}`);
            if (!subParsed) continue;
            const subTotal = totalOf(subParsed);
            const localEp = episode - cumulativeEps;
            if (localEp >= 1 && localEp <= subTotal) {
                return buildStreams(subParsed, lang, ctx.episodeLabel, localEp - 1, ctx, deadline);
            }
            cumulativeEps += subTotal;
        }
    }

    // Chemin racine (sans préfixe de saison)
    const rootParsed = await fetchAndBuild('');
    if (rootParsed) {
        const idx = episode - 1;
        if (idx >= 0 && idx < totalOf(rootParsed)) {
            return buildStreams(rootParsed, lang, ctx.episodeLabel, idx, ctx, deadline);
        }
    }
    return [];
}

async function legacyResolve(slug, season, ctx) {
    const out = [];
    // Filet de sécurité uniquement : 2 langues × (saison + sous-saisons +
    // racine) requêtes — on ne l'étend pas aux 9 langues du site.
    for (const lang of ['vostfr', 'vf']) {
        if (isAborted(ctx.signal) || isBudgetExhausted(ctx.startTime, BUDGET_MS)) break;
        if (ctx.streams.length + out.length >= TARGET_STREAMS) break;
        const streams = await tryFetchEpisodeLegacy(slug, lang, season, ctx.episode, ctx);
        if (streams && streams.length > 0) out.push(...streams);
    }
    return out;
}

/**
 * Collecte les streams d'un slug validé : index du catalogue d'abord
 * (mapping exact des épisodes + toutes les langues), puis chemin historique.
 */
async function collectFromSlug(slug, ctx) {
    const index = await getCatalogueIndex(slug, ctx.signal);
    // Fiche absente : le slug n'existe pas → inutile de sonder des dossiers.
    if (index === MISSING) return false;
    const entries = index && Array.isArray(index.entries) ? index.entries : [];

    const candidates = ctx.mediaType === 'movie'
        ? selectMovieCandidates(entries, ctx.titles)
        : selectSeasonCandidates(entries, {
            effectiveSeason: ctx.effectiveSeason,
            absEpisode: ctx.absEpisode,
            episode: ctx.episode,
        });

    for (const cand of candidates) {
        if (isAborted(ctx.signal) || isBudgetExhausted(ctx.startTime, BUDGET_MS)) break;
        if (ctx.streams.length >= TARGET_STREAMS) break;
        const base = cand.base != null
            ? cand.base
            : (ctx.mediaType === 'movie' ? 1 : null);
        const idx = base != null ? ctx.absEpisode - base : ctx.episode - 1;
        // Diagnostic mapping épisode : "absolu du site" = base + idx ; sert à
        // vérifier qu'on lit la bonne position (épisode ↔ titre).
        console.log(`[Anime-Sama] ${slug}: candidat ${cand.season}` +
            `${cand.label ? ` [${cand.label}]` : ''} → idx=${idx}` +
            ` (absolu site ${base != null ? base + '+' + ctx.absEpisode : 'n/a'}, TMDB S${ctx.effectiveSeason}E${ctx.episode})`);
        const streams = await resolveSeason(slug, cand.season, idx, ctx);
        if (streams.length > 0) {
            ctx.streams.push(...streams);
            return true;
        }
    }

    // Films : le site les héberge dans le catalogue de la SÉRIE sous
    // `film`, `film1`, `film2`… — on retente les dossiers bruts quand
    // l'index ne les a pas listés.
    if (ctx.mediaType === 'movie') {
        for (const season of ['film', 'film1', 'film2']) {
            if (isAborted(ctx.signal) || isBudgetExhausted(ctx.startTime, BUDGET_MS)) break;
            const streams = await resolveSeason(slug, season, 0, ctx);
            if (streams.length > 0) {
                ctx.streams.push(...streams);
                return true;
            }
        }
    }

    // Repli historique : saisons découpées en parties (le site ne publie
    // aucune plage pour `saison4` / `saison4-2` — cas Attack on Titan) et
    // fiches sans panneau. L'index prime, il ne remplace pas ce filet.
    const legacy = await legacyResolve(slug, ctx.effectiveSeason, ctx);
    if (legacy.length > 0) {
        ctx.streams.push(...legacy);
        return true;
    }
    return false;
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);
    INDEX_CACHE.clear();

    // NuvioTV (videoId anime kitsu:/mal:/anilist:/anidb:) envoie season=null +
    // un numéro d'épisode ABSOLU. Sans reverse-map, `effectiveSeason` restait
    // null → candidats `saisonnull` → 0 stream sur TOUT le catalogue anime.
    const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, {
        mediaType: mediaType === 'movie' ? 'movie' : 'tv',
    });
    season = se.season;
    episode = se.episode;

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
    const startTime = Date.now();

    // --- ArmSync: numéro d'épisode absolu (source de vérité du mapping) ---
    const episodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: BUDGET_MS });
    const altEpisodes = episodes.length > 1 ? [episodes[1]] : [];
    let absEpisode = parseInt(episodes[0], 10) || 1;
    if (mediaType !== 'movie') {
        // TMDB est autoritaire pour la structure saisonnière (contrairement à
        // cinemeta/ARM, qui regroupent par arcs TVDB — cf. dle-extractor).
        const tmdbAbs = await getAbsoluteEpisodeFromTmdb(tmdbId, effectiveSeason, episode);
        if (tmdbAbs && tmdbAbs > 0) absEpisode = tmdbAbs;
    }

    const ctx = {
        signal,
        startTime,
        mediaType,
        titles,
        effectiveSeason,
        episode,
        episodeLabel: mediaType === 'movie' ? '' : (parseInt(episode, 10) || 1),
        absEpisode,
        streams: [],
        altEpisodes,
    };

    const baseSlug = toSlug(titles[0]);
    const searchTitles = titles.slice(0, MAX_FALLBACK_TITLES).map(t => stripSeasonSuffix(t));
    if (mediaType === 'movie') {
        // Le site classe les films sous le catalogue de la SÉRIE
        // (demon-slayer/film1/) → le slug du titre TMDB du film est un
        // soft-404 garanti. Les dérivés « titre de série » passent en tête.
        for (const t of [...searchTitles]) {
            const seriesTitle = t
                .replace(/\s*[-–:]?\s*(?:the\s+)?movie\b.*$/i, '')
                .replace(/\s*[-–:]?\s*(?:le\s+)?film\b.*$/i, '')
                .replace(/\s*[-–:]?\s*oav\b.*$/i, '')
                .trim();
            if (seriesTitle.length >= 3 && !searchTitles.includes(seriesTitle)) searchTitles.unshift(seriesTitle);
        }
    }

    // testedSlugs suit les slugs VRAIMENT sondés (un slug trouvé par la
    // recherche mais jamais testé — cas films — doit rester candidat).
    const testedSlugs = new Set();
    const enough = () => ctx.streams.length >= ENOUGH_STREAMS;

    // ── Passe 1 : slug dérivé du titre TMDB (+ variantes de saison) ──────────
    // Les films sont exclus (voir plus haut : le slug du film n'existe pas).
    const directSlugs = [];
    if (mediaType !== 'movie') {
        directSlugs.push(baseSlug);
        // Variantes de saison : uniquement si le slug de base n'a rien donné
        // (le slug de base couvre déjà la saison demandée dans la majorité
        // des cas — le sonder coûte 1 fiche + 4 sondes de langue).
        if (effectiveSeason > 1 && !enough()) {
            directSlugs.push(`${baseSlug}-saison-${effectiveSeason}`);
            directSlugs.push(`${baseSlug}-${effectiveSeason}`);
        }
    }
    for (const slug of directSlugs) {
        if (enough() || isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        testedSlugs.add(slug);
        await collectFromSlug(slug, ctx);
    }

    // ── Passe 2 : recherche scorée (seuil 15, protège des homonymes) ─────────
    const foundSlugs = [];
    if (!enough() && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        for (const t of searchTitles) {
            const slugs = await searchSlugsScored(t);
            for (const s of slugs) {
                if (!foundSlugs.includes(s)) foundSlugs.push(s);
                if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
            }
            if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
        }

        for (const fSlug of foundSlugs) {
            if (enough() || isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
            if (testedSlugs.has(fSlug)) continue;
            testedSlugs.add(fSlug);
            // Garde anti-faux-match : la recherche floue peut renvoyer une
            // AUTRE œuvre (`black-torch` pour "Kamen Rider", `great-pretender`
            // pour "Great Mazinger" — episodes.js valides). Titre réel exigé.
            if (!(await passesTitleGuard(fSlug, titles, signal, startTime))) continue;
            await collectFromSlug(fSlug, ctx);
        }
    }

    // ── Passe 3 : discovery vérifiée (toSlug des titres TMDB) ────────────────
    // Le seuil 15 de la passe 2 rejette les vrais matchs quand le titre TMDB
    // (EN) ne recoupe pas le titre site (romaji/FR), ex. « attack on titan »
    // vs slug `shingeki-no-kyojin`.
    if (!enough() && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const seen = new Set(testedSlugs);
        const candidates = [];
        for (const b of orderVerificationTitles(titles, searchTitles, mediaType)) {
            if (candidates.length >= MAX_VERIFIED_SLUGS) break;
            const s = toSlug(b);
            if (s && !seen.has(s)) { seen.add(s); candidates.push(s); }
        }

        const verifyDeadline = startTime + VERIFY_BUDGET_MS;
        for (const cSlug of candidates) {
            if (enough() || isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
            if (Date.now() > verifyDeadline) break;
            testedSlugs.add(cSlug);
            const verified = mediaType === 'movie'
                ? await verifySlugMovie(cSlug, signal, startTime)
                : await verifySlugTv(cSlug, effectiveSeason, signal, startTime);
            if (!verified) continue;
            // Garde anti-faux-match sur le slug vérifié gagnant (1 fetch HTML
            // supp.) : échec → slug rejeté, on continue la passe 3.
            if (!(await passesTitleGuard(cSlug, titles, signal, startTime))) continue;
            console.log(`[Anime-Sama] Verified slug: ${cSlug}`);
            await collectFromSlug(cSlug, ctx);
        }
    }

    const validStreams = ctx.streams.filter(s => s && s.isDirect);
    console.log(`[Anime-Sama] Total streams found: ${validStreams.length}`);

    return sortStreamsByLanguage(validStreams);
}
