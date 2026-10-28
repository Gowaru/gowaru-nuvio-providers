/**
 * Extractor Logic for Anime-Sama
 * Optimisé : réduit le slug probing, fetchJs séquentiel, budget check renforcé
 */

import { fetchText, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, withTimeout, isBudgetExhausted, sortStreamsByLanguage, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { hasForeignLeadingTokens } from '../utils/dle-extractor.js';
import { toSlug, stripSeasonSuffix, resolveTargetEpisodes, normalize } from '../utils/dle-extractor.js';

const BASE_URL = "https://anime-sama.to";
const MAX_FALLBACK_TITLES = 5;
const MAX_FALLBACK_SLUGS = 2;
const MAX_VERIFIED_SLUGS = 12;
const BUDGET_MS = 40000;

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

// Fiche de l'œuvre (`catalogue/{slug}/`), lue une fois par requête :
//  - title : <h1 id="titreOeuvre"> (repli <title>), null = 404/soft-404 ;
//  - paths : saisons/langues réellement publiées, tirées des appels
//    `panneauAnime("Saison 1", "saison1/vostfr");` du HTML statique. On évite
//    ainsi de deviner (saison1-2…5, film/film2, vf) à coups de fetch aveugles.
//    null si la fiche n'a pas pu être lue (on retombe alors sur le sondage).
const catalogueCache = new Map();

function parsePanelPaths(html) {
    const paths = [];
    const re = /panneauAnime\(\s*["']([^"']*)["']\s*,\s*["']([^"']+)["']\s*\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const p = m[2].replace(/^\/+|\/+$/g, '');
        // Ignore le gabarit commenté `panneauAnime("nom", "url")`
        if (!/\//.test(p) || p === 'url') continue;
        if (!paths.includes(p)) paths.push(p);
    }
    return paths;
}

async function fetchCatalogue(slug) {
    if (catalogueCache.has(slug)) return catalogueCache.get(slug);
    let html = null;
    try {
        html = await fetchText(`${BASE_URL}/catalogue/${slug}/`);
    } catch (_) { html = null; }
    let info = { title: null, paths: null };
    if (html && html.length >= 500 && !/acc[eè]s\s+introuvable/i.test(html)) {
        try {
            const $ = cheerio.load(html);
            const h1 = ($('#titreOeuvre').first().text() || $('h1').first().text()).trim();
            const t = $('title').first().text().trim();
            info.title = h1 || (t ? t.split('|')[0].trim() : null);
        } catch (_) {}
        const paths = parsePanelPaths(html);
        info.paths = paths.length > 0 ? paths : null;
    }
    catalogueCache.set(slug, info);
    return info;
}

async function fetchCatalogueTitle(slug) {
    return (await fetchCatalogue(slug)).title;
}

// Chemins publiés pour une saison et une langue, dans l'ordre du site :
// `saison1/vostfr`, puis les parties `saison1-2/vostfr`, `saison1-3/vostfr`…
function seasonPathsFor(paths, season, lang) {
    const re = new RegExp(`^(saison${season}(?:-\\d+)?)/${lang}$`, 'i');
    return paths.map(p => (p.match(re) || [])[1]).filter(Boolean);
}

// Langues publiées pour la saison : vostfr, puis vf et ses variantes (vf1, vf2).
function languagesFor(paths, season, mediaType) {
    const order = ['vostfr', 'vf', 'vf1', 'vf2'];
    if (!paths) return ['vostfr', 'vf'];
    const prefix = mediaType === 'movie' ? /^film\d*\// : new RegExp(`^saison${season}(?:-\\d+)?/`, 'i');
    const found = new Set(paths.filter(p => prefix.test(p)).map(p => p.split('/').pop().toLowerCase()));
    return order.filter(l => found.has(l));
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



// ─── Lecteurs (miroir de `lecteursInfos` des pages saison, refonte 10/2026) ──
// Le site publie sur chaque page saison la table des lecteurs avec un drapeau
// `mort` (ex. « Le lecteur Sibnet n'est plus disponible »). On en garde ici une
// copie : nom affiché, et hôtes morts écartés avant toute résolution.
const VOE_DOMAINS = ['voe.sx', 'teresapoliticallearn', 'megankiddifference', 'jeremyparticipantanything',
    'jamesbornmain', 'claireguessthousand', 'derricknationtop'];
const EARNVIDS_DOMAINS = ['smoothpre', 'morencius', 'movearnpre', 'earnvids', 'minochinos'];

function getPlayerName(varName, url) {
    const u = (url || '').toLowerCase();
    if (u.includes('vidmoly') || u.includes('ansembed')) return 'Vidmoly';
    if (VOE_DOMAINS.some(d => u.includes(d))) return 'VOE';
    if (EARNVIDS_DOMAINS.some(d => u.includes(d))) return 'Earnvids';
    if (u.includes('uqload')) return 'Uqload';
    if (u.includes('oneupload')) return 'OneUpload';
    if (u.includes('sibnet')) return 'Sibnet';
    if (u.includes('sendvid')) return 'Sendvid';
    if (u.includes('vk.com') || u.includes('vkvideo')) return 'VK';
    if (u.includes('dailymotion')) return 'Dailymotion';
    if (u.includes('stape') || u.includes('streamtape')) return 'Streamtape';
    if (u.includes('dood')) return 'Doodstream';
    if (/embed4me|player4me|4meplayer/.test(u)) return 'Embed4me';
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

// Vrai dès qu'un episodes.js revient bloqué par Cloudflare : les autres
// episodes.js le seront aussi, inutile d'enchaîner recherche et sondages.
let episodesBlocked = false;

async function fetchJs(slug, seasonPath, lang) {
    if (episodesBlocked) return null;
    const url = `${BASE_URL}/catalogue/${slug}${seasonPath ? '/' + seasonPath : ''}/${lang}/episodes.js`;
    try {
        const content = await withTimeout(fetchText(url), 8000, `fetchJs ${slug}`);
        return content || null;
    } catch (e) {
        if (/Cloudflare block/.test(e && e.message || '')) episodesBlocked = true;
        return null;
    }
}

// Exclus AVANT resolveStream (budget brûlé pour rien) :
//  - marqués `mort: true` par le site : sibnet, oneupload, myvi, embed4me et ses miroirs ;
//  - sendvid : SPA React irrésoluble.
const DEAD_HOSTS = /sibnet\.ru|oneupload\.|myvi\.|embed4me|player4me|4meplayer|sendvid/i;
// Hosts avec résolveur dédié d'abord (évite de brûler le budget 12s sur des players génériques)
const HOST_PRIORITY = [
    [/vidmoly|ansembed/i, 0],
    [/uqload/i, 1],
    [new RegExp(VOE_DOMAINS.map(d => d.replace('.', '\\.')).join('|'), 'i'), 2],
    [new RegExp(EARNVIDS_DOMAINS.join('|'), 'i'), 3]
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

// Sonde d'existence film : /film/ puis /film2/ (le site utilise l'un ou l'autre).
async function verifySlugMovie(slug, signal, startTime) {
    for (const seasonPath of ['film', 'film2']) {
        for (const lang of ['vostfr', 'vf']) {
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return null;
            const js = await fetchJs(slug, seasonPath, lang);
            if (isValidFilmJs(js)) return slug;
        }
    }
    return null;
}

async function buildStreams(parsed, lang, episode, idx) {
    // OPTIMISATION: Résolution séquentielle avec early-exit
    // (fetch synchrone en QuickJS = Promise.allSettled ne parallélise pas)
    const TARGET_DIRECT = 2;
    const playable = [];
    const startTime = Date.now();
    const BUDGET_MS = 12000;

    // Ordonner les vars en favorisant les hosts à résolveur dédié
    // (tri stable : l'ordre du site est préservé à priorité égale)
    const ordered = parsed.slice().sort((a, b) =>
        hostScore(a.urls[idx] || '') - hostScore(b.urls[idx] || ''));

    for (const { varName, urls } of ordered) {
        if (playable.length >= TARGET_DIRECT) break;
        if (Date.now() - startTime > BUDGET_MS) break;

        const playerUrl = urls[idx];
        if (!playerUrl || !playerUrl.startsWith('http')) continue;
        if (DEAD_HOSTS.test(playerUrl)) continue;

        const epLabel = episode ? `Ep ${episode} - ` : '';
        try {
            const stream = await withTimeout(
                resolveStream({
                    name: `Anime-Sama (${lang.toUpperCase()})`,
                    title: `${getPlayerName(varName, playerUrl)} - ${epLabel}${lang.toUpperCase()}`,
                    url: playerUrl,
                    quality: "HD",
                    headers: { "Referer": BASE_URL }
                }),
                8000,
                `AnimeSama player ${getPlayerName(varName, playerUrl)}`
            );
            if (stream) playable.push(stream);
        } catch (e) { /* skip failed player */ }
    }
    return playable;
}

async function fetchAndGetUrl(slug, lang, season, episode, mediaType, altEpisodes = [], paths = null) {
    const episodesToTry = [episode, ...altEpisodes.filter(e => e !== episode)];

    if (mediaType === 'movie') {
        // Les films vivent sous le catalogue de la série, en /film/ OU /film2/
        // (constaté en live 09/2026 : demon-slayer/film2/, tensei-slime/film2/…
        // — /film/ renvoie une soft-404 HTML sans `var` → parseUrls vide).
        // Si la fiche liste ses films, on ne sonde que ceux-là.
        const filmPaths = paths
            ? paths.filter(p => new RegExp(`^film\\d*/${lang}$`, 'i').test(p)).map(p => p.split('/')[0])
            : ['film', 'film2'];
        for (const seasonPath of filmPaths) {
            const jsContent = await fetchJs(slug, seasonPath, lang);
            if (!jsContent) continue;
            const parsed = parseUrls(jsContent);
            if (parsed.length === 0) continue;
            const streams = await buildStreams(parsed, lang, null, 0);
            if (streams.length > 0) return streams;
        }
        return [];
    }

    for (const ep of episodesToTry) {
        const result = paths
            ? await tryFetchEpisodeFromPanels(slug, lang, seasonPathsFor(paths, season, lang), ep)
            : await tryFetchEpisode(slug, lang, season, ep);
        if (result.length > 0) return result;
    }
    return [];
}

/**
 * Variante guidée par la fiche : parcourt uniquement les parties publiées de la
 * saison (`saison1`, `saison1-2`…) en cumulant leurs épisodes, sans sonder.
 */
async function tryFetchEpisodeFromPanels(slug, lang, seasonPaths, episode) {
    let cumulativeEps = 0;
    for (const seasonPath of seasonPaths) {
        const js = await fetchJs(slug, seasonPath, lang);
        if (!js) return []; // bloqué ou absent : les parties suivantes le seront aussi
        const parsed = parseUrls(js);
        if (parsed.length === 0) continue;
        const total = parsed[0].urls.length;
        const localEp = episode - cumulativeEps;
        if (localEp >= 1 && localEp <= total) {
            return buildStreams(parsed, lang, episode, localEp - 1);
        }
        cumulativeEps += total;
    }
    return [];
}

/**
 * Récupère les épisodes pour un slug/lang/saison (fiche illisible : sondage).
 * Optimisé : fetch d'abord main+root, puis sub-seasons seulement si nécessaire.
 */
async function tryFetchEpisode(slug, lang, season, episode) {
    // OPTIMISATION: Fetch séquentiel (fetch synchrone en QuickJS)
    // Essayer main season d'abord (le plus probable), root en fallback
    const mainJs = await fetchJs(slug, `saison${season}`, lang);

    // Traiter le main season d'abord
    if (mainJs) {
        const parsed = parseUrls(mainJs);
        if (parsed.length > 0) {
            const totalEps = parsed[0].urls.length;
            if (episode >= 1 && episode <= totalEps) {
                return buildStreams(parsed, lang, episode, episode - 1);
            }

            // Le épisode n'est pas dans le main season : chercher dans les sub-seasons
            let cumulativeEps = totalEps;
            const subSeasons = ['2', '3', '4', '5'];
            for (const subNum of subSeasons) {
                const subJs = await fetchJs(slug, `saison${season}-${subNum}`, lang);
                if (!subJs) continue;
                const subParsed = parseUrls(subJs);
                if (subParsed.length === 0) continue;
                const subTotal = subParsed[0].urls.length;
                const localEp = episode - cumulativeEps;
                if (localEp >= 1 && localEp <= subTotal) {
                    return buildStreams(subParsed, lang, episode, localEp - 1);
                }
                cumulativeEps += subTotal;
            }
        }
    }

    // Essayer le root path (sans préfixe de saison) - fetch en fallback
    const rootJs = await fetchJs(slug, '', lang);
    if (rootJs) {
        const parsed = parseUrls(rootJs);
        if (parsed.length > 0) {
            const idx = episode - 1;
            if (idx >= 0 && idx < parsed[0].urls.length) {
                return buildStreams(parsed, lang, episode, idx);
            }
        }
    }

    return [];
}

// Toutes les langues publiées d'un slug, jusqu'à `target` flux.
// La fiche (1 fetch, mis en cache) dit quelles saisons/langues existent ;
// fiche 404 → slug abandonné sans sonder episodes.js.
async function streamsForSlug(slug, season, episode, mediaType, altEpisodes, target) {
    const { title, paths } = await fetchCatalogue(slug);
    if (!title) return [];
    const streams = [];
    for (const lang of languagesFor(paths, season, mediaType)) {
        if (streams.length >= target) break;
        const result = await fetchAndGetUrl(slug, lang, season, episode, mediaType, altEpisodes, paths);
        streams.push(...result);
    }
    return streams;
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);
    catalogueCache.clear();
    episodesBlocked = false;
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
    const startTime = Date.now();

    // --- ArmSync: resolve absolute episode for TV series ---
    const episodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: BUDGET_MS });
    const altEpisodes = episodes.length > 1 ? [episodes[1]] : [];
    // ------------------------------------

    const title = titles[0];
    const slug = toSlug(title);
    const streams = [];

    // OPTIMISATION: Traitement séquentiel des langues avec early-exit
    // (fetch synchrone en QuickJS = Promise.all ne parallélise pas)
    const TARGET_STREAMS = 3;

    // FILMS : le site classe les films sous le catalogue de la SÉRIE (demon-slayer/film2/)
    // → le slug dérivé du titre TMDB du film est un soft-404 garanti. Aller directement
    // à la recherche (titres de série dérivés en premier) au lieu de brûler 4 fetchJs.
    const searchTitles = titles.slice(0, MAX_FALLBACK_TITLES).map(t => stripSeasonSuffix(t));
    if (mediaType === 'movie') {
        for (const t of [...searchTitles]) {
            const seriesTitle = t
                .replace(/\s*[-–:]?\s*(?:the\s+)?movie\b.*$/i, '')
                .replace(/\s*[-–:]?\s*(?:le\s+)?film\b.*$/i, '')
                .replace(/\s*[-–:]?\s*oav\b.*$/i, '')
                .trim();
            if (seriesTitle.length >= 3 && !searchTitles.includes(seriesTitle)) searchTitles.unshift(seriesTitle);
        }
    }

    // Primary: try the generated slug for each language (skip for movies — see above)
    // testedSlugs suit les slugs VRAIMENT sondés (un slug trouvé par la
    // recherche mais jamais testé — cas films — doit rester candidat).
    const testedSlugs = new Set();
    if (mediaType !== 'movie' && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        testedSlugs.add(slug);
        streams.push(...await streamsForSlug(slug, effectiveSeason, episode, mediaType, altEpisodes, TARGET_STREAMS));
    }

    if (episodesBlocked) {
        console.warn('[Anime-Sama] episodes.js refusé par Cloudflare : arrêt (0 flux, ce n\'est pas un problème de titre ni de saison)');
        return [];
    }

    // If primary failed, try slug with season suffix (e.g., "overlord-saison-3")
    if (streams.length === 0 && effectiveSeason > 1 && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const seasonSlug = `${slug}-saison-${effectiveSeason}`;
        testedSlugs.add(seasonSlug);
        streams.push(...await streamsForSlug(seasonSlug, effectiveSeason, episode, mediaType, altEpisodes, TARGET_STREAMS));
    }

    // If still empty, try season numeric slug (e.g., "overlord-3")
    if (streams.length === 0 && effectiveSeason > 1 && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const numSlug = `${slug}-${effectiveSeason}`;
        testedSlugs.add(numSlug);
        streams.push(...await streamsForSlug(numSlug, effectiveSeason, episode, mediaType, altEpisodes, TARGET_STREAMS));
    }

    // If primary failed, try search API to find correct slug (much faster than alt slug probing)
    // Passe 1 — recherche scorée (seuil 15 : protège des homonymes, inchangé)
    const foundSlugs = [];
    if (streams.length === 0 && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        for (const t of searchTitles) {
            const slugs = await searchSlugsScored(t);
            for (const s of slugs) {
                if (!foundSlugs.includes(s)) foundSlugs.push(s);
                if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
            }
            if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
        }

        for (const fSlug of foundSlugs) {
            if (testedSlugs.has(fSlug)) continue;
            testedSlugs.add(fSlug);
            if (streams.length >= TARGET_STREAMS) break;
            // Garde anti-faux-match : la recherche floue peut renvoyer une
            // AUTRE œuvre (`black-torch` pour "Kamen Rider", `great-pretender`
            // pour "Great Mazinger" — episodes.js valides). Titre réel exigé.
            if (!(await passesTitleGuard(fSlug, titles, signal, startTime))) continue;

            streams.push(...await streamsForSlug(fSlug, effectiveSeason, episode, mediaType, altEpisodes, TARGET_STREAMS - streams.length));
        }
    }

    // Passe 2 — discovery vérifiée : le seuil 15 de la passe 1 rejette les
    // vrais matchs quand le titre TMDB (EN) ne recoupe pas le titre site
    // (romaji/FR), ex. « attack on titan » vs slug `shingeki-no-kyojin`.
    // On sonde toSlug() des titres TMDB (dérivés série, FR, courts, reste)
    // et on accepte au premier episodes.js valide + garde titre (un
    // episodes.js valide seul n'exclut PAS les faux positifs : `black-torch`
    // a servi des streams pour "Kamen Rider").
    if (streams.length === 0 && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        // Seuls les slugs VRAIMENT sondés sont exclus (le primaire film,
        // jamais testé, reste candidat — ex. `suzume` trouvé en passe 1).
        const seen = new Set(testedSlugs);
        const candidates = [];
        for (const b of orderVerificationTitles(titles, searchTitles, mediaType)) {
            if (candidates.length >= MAX_VERIFIED_SLUGS) break;
            const s = toSlug(b);
            if (s && !seen.has(s)) { seen.add(s); candidates.push(s); }
        }

        for (const cSlug of candidates) {
            if (streams.length >= TARGET_STREAMS) break;
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
            // Existence : d'abord la fiche (titre + saisons publiées) ; si elle
            // ne liste rien, repli sur le sondage episodes.js d'avant.
            const { title: ficheTitle, paths } = await fetchCatalogue(cSlug);
            if (!ficheTitle) continue;
            const verified = paths
                ? languagesFor(paths, effectiveSeason, mediaType).length > 0
                : mediaType === 'movie'
                    ? await verifySlugMovie(cSlug, signal, startTime)
                    : await verifySlugTv(cSlug, effectiveSeason, signal, startTime);
            if (!verified) continue;
            // Garde anti-faux-match sur le slug vérifié gagnant (fiche déjà en
            // cache) : échec → slug rejeté, on continue la passe 2 (pas
            // d'arrêt) ; si aucun slug ne passe → 0 propre.
            if (!(await passesTitleGuard(cSlug, titles, signal, startTime))) continue;
            console.log(`[Anime-Sama] Verified slug: ${cSlug}`);
            streams.push(...await streamsForSlug(cSlug, effectiveSeason, episode, mediaType, altEpisodes, TARGET_STREAMS - streams.length));
        }
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[Anime-Sama] Total streams found: ${validStreams.length}`);

    return sortStreamsByLanguage(validStreams);
}
