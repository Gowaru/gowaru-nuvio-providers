/**
 * Extractor for Neko-Sama (animes-sama.su)
 * WordPress "animestream" theme — structure vérifiée en live (11/2026) :
 * 1. Catalogue : /wp-sitemap-posts-anime-1.xml (~1440 URLs, 177 Ko) — 1 GET
 *    donne TOUTES les pages du site (hubs + pages saison) sans sondage aveugle.
 * 2. Hub /anime/{slug}/          → eplister VIDE (liens vers les pages saison)
 * 3. Page saison …-saison-N/     → ul.eplister > li > a[href="…/{slug}-episode-N-saison-M/"]
 *                                  avec <div class="epl-num"> / <div class="epl-title"> (DIV, pas SPAN)
 * 4. Page épisode                → boutons loadMi({ value: base64 }) groupés en .server-group
 *                                  avec <label>SUB:</label> (VOSTFR) ou <label>VF:</label>
 * 5. b64 décodé                  → iframe src = page player du thème (player/?source=embed&url=TOKEN)
 * 6. Page player (SSR)           → <iframe class="player-iframe" src="EMBED"> (vidmoly, sibnet, sendvid…)
 * 7. EMBED                       → résolu via resolveStream() (gère le challenge JWT vidmoly, etc.)
 *
 * Correctifs 11/2026 (diagnostic live) :
 *  - Faux matches : l'ancien scoring acceptait `sn.includes(norm)` sur des titres
 *    courts ("GoT" ⊂ "omaegotoki") → épisode d'une AUTRE série servi. Matching
 *    désormais par tokens de slug + couverture minimale + garde film/OVA.
 *  - Budget : l'ancien code sondait jusqu'à ~40 slugs devinés (404 en cascade,
 *    43 s mesurées sur un titre absent). Le catalogue sitemap supprime ces
 *    sondages : 1 GET et une sélection locale.
 *  - Un seul serveur était tenté par langue : si le CDN vidmoly tombe, plus rien
 *    ne se lance. On résout maintenant plusieurs hébergeurs distincts par langue.
 *  - Groupes serveurs : parsing robuste (split sur .server-group) au lieu d'une
 *    lookahead qui fusionnait/perdait les groupes SUB/VF.
 */

import { fetchText, setCurrentSignal } from './http.js';
import { isAborted, isBudgetExhausted, resolveStream, normalizeLanguageCode } from '../utils/resolvers.js';
import { resolveSeasonEpisodeInputs, getAbsoluteEpisodeFromTmdb } from '../utils/dle-extractor.js';

const BASE_URL = "https://animes-sama.su";
const SITEMAP_URL = `${BASE_URL}/wp-sitemap-posts-anime-1.xml`;
const SITEMAP_INDEX = `${BASE_URL}/wp-sitemap.xml`;
const BUDGET_MS = 38000;
const MAX_PAGE_FETCHES = 6;
const MAX_PART_PAGES = 4;
// Un server-group contient TOUTES les langues (VO-1…, VF-1…, VA-1…, VKR-1…).
// On sonde plus de boutons par langue et on garde plusieurs CDN distincts :
// un seul hébergeur mort ne doit jamais vider une langue.
const MAX_BUTTONS_PER_LANG = 8;
const MAX_HOSTS_PER_LANG = 3;

// ---- helpers ----

/** Normalise un href (relatif → absolu, entités HTML). */
function absoluteUrl(href) {
    if (!href) return null;
    let u = href.replace(/&#038;/g, '&').replace(/&amp;/g, '&').trim();
    if (u.startsWith('//')) u = 'https:' + u;
    else if (u.startsWith('/')) u = BASE_URL + u;
    return /^https?:\/\//.test(u) ? u : null;
}

function normalizeKey(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' et ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Retire un suffixe de saison/partie d'un titre TMDB. */
function stripSeasonSuffix(title) {
    return String(title || '')
        .replace(/\s*[-–:]\s*(?:saison|season|partie|part|cour|s)\s*\d{1,2}\s*$/i, '')
        .replace(/\s+(?:saison|season|partie|part|cour)\s*\d{1,2}\s*$/i, '')
        .replace(/\s+s\d{1,2}\s*$/i, '')
        .trim();
}

const TITLE_STOP = new Set([
    'de', 'la', 'le', 'les', 'des', 'du', 'et', 'the', 'a', 'an', 'of', 'and',
    'no', 'wa', 'ga', 'wo', 'ni', 'to', 'da', 'un', 'une', 'aux', 'au', 'l', 'd',
    'en', 'sur', 'pour', 'par', 'in', 'on', 'with', 'les',
]);

function titleTokens(title) {
    return normalizeKey(stripSeasonSuffix(title))
        .split(' ')
        .filter(t => t && !TITLE_STOP.has(t));
}

/**
 * Épisodes d'une page saison. AGNOSTIQUE div/span : le thème utilise des
 * <div class="epl-num"> (l'ancienne regex n'acceptait que <span> → 0 épisode).
 * - Scoper STRICTEMENT au bloc eplister (jusqu'à son </ul>) : la sidebar liste
 *   les épisodes d'AUTRES séries (pollution constatée live).
 * - 2 formes d'URL : …-episode-N-saison-M/ ET …-episode-N/ (pages saga, sans
 *   suffixe saison — sinon 0 épisode sur one-piece-saga-*).
 * - Le numéro FAIT FOI depuis le contenu epl-num (fallback : numéro d'URL).
 */
function extractEpisodesFromHtml(html) {
    const eps = [];
    const seen = new Set();
    const start = html.indexOf('eplister');
    if (start === -1) return eps;
    const endUl = html.indexOf('</ul>', start);
    const scope = endUl > -1 ? html.slice(start, endUl) : html.slice(start, start + 200000);
    const re = /<a[^>]+href="([^"]*episode-(\d+)(?:-saison-(\d+))?(?:-partie-(\d+))?[^"?]*)"[^>]*>[\s\S]{0,400}?<(?:div|span)[^>]*class="[^"]*epl-num[^"]*"[^>]*>([^<]{0,30})<\/(?:div|span)>/gi;
    let m;
    while ((m = re.exec(scope)) !== null) {
        const url = absoluteUrl(m[1]);
        if (!url) continue;
        // Numéro affiché (epl-num) prioritaire sur le numéro d'URL
        const num = parseInt((m[5] || '').trim(), 10) || parseInt(m[2], 10);
        if (!num) continue;
        const season = m[3] ? parseInt(m[3], 10) : null;
        const part = m[4] ? parseInt(m[4], 10) : 1;
        // Dédup par (numéro, saison, partie) : une page peut exposer plusieurs
        // parties (Dr. Stone S3 partie 1/2) qui renumérotent à 1 → l'ancien
        // dédoublonnage par numéro seul supprimait la moitié des épisodes.
        const key = `${num}|${season == null ? 'x' : season}|${part}`;
        if (seen.has(key)) continue;
        seen.add(key);
        eps.push({ url, num, season, part, label: `Épisode ${num}` });
    }
    return eps;
}

// ---- catalogue (sitemap) ----

let _catalogPromise = null;

/**
 * Charge le catalogue du site depuis le sitemap WordPress.
 * Retourne [{ slug, url, base, season }] ou null si indisponible.
 * Mémoïsé pour la durée du run (une instance QuickJS = un getStreams).
 */
function getCatalog() {
    if (!_catalogPromise) _catalogPromise = loadCatalog();
    return _catalogPromise;
}

async function loadCatalog() {
    let xml = await fetchText(SITEMAP_URL, { timeout: 12000 });
    if (!xml || xml.indexOf('/anime/') === -1) {
        // Sitemap paginé/renommé : on lit l'index WordPress pour retrouver
        // la page posts-anime courante. Sans ça, un changement côté site
        // faisait tomber tout le catalogue sur le repli HTML (lent, partiel).
        const index = await fetchText(SITEMAP_INDEX, { timeout: 10000 });
        const alt = index && (index.match(/<loc>([^<]*posts-anime[^<]*)<\/loc>/i) || [])[1];
        if (alt) xml = await fetchText(alt, { timeout: 12000 });
    }
    if (!xml || xml.indexOf('<loc>') === -1) return null;
    const entries = [];
    const re = /<loc>(https?:\/\/[^<]*?\/anime\/([a-z0-9][a-z0-9-]*)\/?)\s*<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const slug = (m[2] || '').toLowerCase();
        const url = absoluteUrl(m[1]);
        if (!url || !slug) continue;
        // 2 hiérarchies : …-saison-N/ et les catalogues par arc …-saga-N-…/
        // (One Piece : TMDB S1 = saga 1). Le numéro pilote la garde saison.
        // …-saison-3-partie-2 : le suffixe partie ne doit pas casser la
        // détection de saison (sinon ces pages passaient pour des hubs et
        // un épisode d'une AUTRE saison était servi).
        const seasonM = slug.match(/-saison-(\d+)(?:-partie-(\d+))?$/);
        const sagaM = slug.match(/-saga-(\d+)/);
        const partM = slug.match(/-partie-(\d+)/);
        entries.push({
            slug,
            url,
            base: seasonM ? slug.slice(0, seasonM.index) : slug,
            season: seasonM ? parseInt(seasonM[1], 10) : (sagaM ? parseInt(sagaM[1], 10) : null),
            part: partM ? parseInt(partM[1], 10) : 1,
        });
    }
    if (entries.length) console.log(`[NekoSama] catalogue sitemap : ${entries.length} pages`);
    return entries.length ? entries : null;
}

/**
 * Score titre ↔ slug (0..). Tokens entiers uniquement ("got" ne matche pas
 * "omaegotoki"), pénalité pour les mots de slug non couverts, couverture
 * minimale exigée : c'est ce qui empêchait les faux matches.
 */
function scoreSlug(tokens, slug) {
    const st = slug.split('-').filter(Boolean);
    if (!st.length) return 0;
    const set = new Set(st);
    const elisions = new Set();
    for (const s of st) {
        // Le site colle l'élision FR : "l'apothicaire" → "lapothicaire"
        if (s.length > 3 && (s.charAt(0) === 'l' || s.charAt(0) === 'd' || s.startsWith('qu'))) {
            elisions.add(s.replace(/^qu/, '').replace(/^[ld]/, ''));
        }
    }
    let matched = 0;
    for (const t of tokens) {
        if (set.has(t) || elisions.has(t)) matched++;
    }
    if (!matched) return 0;
    const coverage = matched / tokens.length;
    if (coverage < 0.6) return 0;
    let score = coverage * 100;
    score -= Math.max(0, st.length - matched) * 8;
    const stJoined = st.join(' ');
    const tJoined = tokens.join(' ');
    if (stJoined === tJoined) score += 40;
    else if (stJoined.indexOf(tJoined) === 0) score += 20;
    // Forme collée : "les-carnets-de-lapothicaire" vs "les carnets de l apothicaire"
    if (slug.replace(/-/g, '') === tokens.join('') && tokens.length > 1) score += 25;
    return score;
}

const FILM_RE = /(^|-)(film|films|movie|oav|ova|special|speciales|recap|fan-letter)(-|$)/;

/** Pondère selon le type demandé (série vs film / spin-off). */
function typeBias(slug, isMovie) {
    const isFilm = FILM_RE.test(slug);
    if (isMovie) return isFilm ? 25 : -15;
    // Un spin-off ne doit jamais voler un slot de fetch à la vraie fiche
    return isFilm ? -60 : 0;
}

/**
 * Sélectionne les pages candidates (saison/hub) pour les titres TMDB.
 * Retourne [{ url, slug, base, season, score }] triées par score.
 */
function pickCandidates(catalog, titles, wantedSeason, isMovie, signal) {
    const scored = [];
    for (const e of catalog) {
        if (isAborted(signal)) break;
        let best = 0;
        for (const title of titles) {
            const tk = titleTokens(title);
            if (!tk.length) continue;
            const s = scoreSlug(tk, e.slug);
            if (s <= 0) continue;
            if (s > best) best = s;
        }
        if (best <= 0) continue;
        let s = best + typeBias(e.slug, isMovie);
        if (wantedSeason) {
            // Un hub (eplister vide) n'est qu'un conteneur : il ne doit pas
            // passer devant la page saison/saga réellement demandée (constaté :
            // hub 140 > saison 139 → 1 fetch gaspillé + épisode d'une autre saison).
            if (e.season == null) s -= 70;
            else if (e.season === wantedSeason) s += 35 + (e.part === 1 ? 2 : 0);
            else s -= Math.min(30, Math.abs(e.season - wantedSeason) * 4);
        }
        scored.push({ ...e, score: s });
    }
    return scored.sort((a, b) => b.score - a.score);
}

// ---- recherche HTML (repli si le sitemap est indisponible) ----

async function searchSeries(query) {
    const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(query)}`, { timeout: 12000 });
    if (!html || html.length < 1000) return [];
    const links = new Set();
    const re = /href="(https?:\/\/animes-sama\.su\/anime\/[^"]+)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) links.add(absoluteUrl(m[1]));
    return [...links].filter(Boolean);
}

function linkToEntry(url) {
    const slug = url.replace(/.*\/anime\//, '').replace(/\/$/, '').toLowerCase();
    const seasonM = slug.match(/-saison-(\d+)(?:-partie-(\d+))?$/);
    const sagaM = slug.match(/-saga-(\d+)/);
    const partM = slug.match(/-partie-(\d+)/);
    return {
        slug,
        url,
        base: seasonM ? slug.slice(0, seasonM.index) : slug,
        season: seasonM ? parseInt(seasonM[1], 10) : (sagaM ? parseInt(sagaM[1], 10) : null),
        part: partM ? parseInt(partM[1], 10) : 1,
        score: 0,
    };
}

/**
 * Repli : recherche HTML du site puis matching strict identique au sitemap.
 * (Le moteur WP renvoie la sidebar quand il n'a aucun résultat → on ne garde
 * que les liens dont le slug couvre réellement les tokens du titre.)
 */
async function searchCandidates(titles, wantedSeason, isMovie) {
    const byUrl = new Map();
    for (const title of titles) {
        const key = normalizeKey(stripSeasonSuffix(title));
        if (!key) continue;
        const variants = [stripSeasonSuffix(title)];
        const words = key.split(' ');
        if (words.length > 2) variants.push(words.slice(0, 2).join(' '));
        if (words.length > 3) variants.push(words.slice(0, 3).join(' '));
        let links = [];
        for (const v of variants) {
            links = await searchSeries(v);
            if (links.length) break;
        }
        for (const l of links) {
            const e = linkToEntry(l);
            if (byUrl.has(e.url)) continue;
            let best = 0;
            for (const t of titles) {
                const tk = titleTokens(t);
                if (tk.length) best = Math.max(best, scoreSlug(tk, e.slug));
            }
            if (best < 55) continue;
            let s = best + typeBias(e.slug, isMovie);
            if (wantedSeason) {
                if (e.season === wantedSeason) s += 35;
                else if (e.season != null) s -= Math.min(30, Math.abs(e.season - wantedSeason) * 4);
            }
            byUrl.set(e.url, { ...e, score: s });
        }
        if (byUrl.size) break;
    }
    return [...byUrl.values()].sort((a, b) => b.score - a.score);
}

// ---- page épisode ----

/**
 * Langue d'un libellé de bouton/serveur.
 * Le thème regroupe TOUTES les langues dans un même `server-group` (label
 * « SUB: ») : boutons VO-1… (VOSTFR), VF-1…/VF1-…/VF2-… (VF), VA-1… (anglais),
 * VKR-1… (coréen). L'ancien code déduisait la langue du label du GROUPE et
 * plafonnait à 4 boutons → les VF (toujours après les VO) n'étaient jamais
 * résolues et étaient étiquetées VOSTFR.
 */
function buttonLang(raw) {
    const t = String(raw || '').toUpperCase().replace(/\s+/g, '');
    if (!t) return '';
    if (/^VOST/.test(t) || /^SUB/.test(t) || /^VO([-\d]|$)/.test(t)) return 'VOSTFR';
    if (/^VF/.test(t) || /^FRENCH/.test(t)) return 'VF';
    if (/^VA([-\d]|$)/.test(t)) return 'VA';
    if (/^VKR/.test(t)) return 'VKR';
    return '';
}

/** Code langue app Nuvio (fr/en/multi/ja) depuis le libellé du site. */
function langCode(lang) {
    if (lang === 'VF') return 'fr';
    if (lang === 'VA') return 'en';
    if (lang === 'VKR') return 'ko';
    return normalizeLanguageCode(lang) || 'fr';
}

/**
 * Serveurs d'une page épisode, groupés PAR LANGUE (un bouton = une langue).
 * Retourne [{ lang, servers: [src,…] }] : VF, VOSTFR, puis VA/VKR.
 */
function extractServerGroups(html) {
    const zoneStart = html.indexOf('class="server-right"');
    const zone = zoneStart >= 0 ? html.slice(zoneStart, zoneStart + 80000) : html;
    const parts = zone.split('<div class="server-group">');
    const byLang = new Map();
    let hint = '';
    const push = (lang, src) => {
        if (!lang || !src) return;
        if (!byLang.has(lang)) byLang.set(lang, []);
        const list = byLang.get(lang);
        if (!list.includes(src)) list.push(src);
    };

    for (let i = 1; i < parts.length; i++) {
        // Commentaire de section précédent (<!-- VF SERVERS -->) : indice de
        // dernier recours seulement, le thème l'affiche parfois à l'envers.
        const before = parts[i - 1] || '';
        const cm = before.match(/<!--\s*(VOSTFR|VO|VF|VA|VKR)\s+SERVERS?\s*-->/gi);
        if (cm) hint = buttonLang(cm[cm.length - 1].replace(/<!--|-->|SERVERS?/gi, '').trim());

        const body = parts[i].slice(0, 20000);
        const labelM = body.match(/<label[^>]*>([\s\S]*?)<\/label>/);
        const groupLang = buttonLang(labelM ? labelM[1].replace(/<[^>]+>/g, '') : '');
        const btnRe = /loadMi\(\{\s*value:\s*'([A-Za-z0-9+/=]{20,})'\s*\}\)[^>]*>\s*([^<]{0,24})</g;
        let b;
        while ((b = btnRe.exec(body)) !== null) {
            const lang = buttonLang(b[2]) || groupLang || hint || 'VOSTFR';
            try {
                const decoded = atob(b[1]);
                const srcM = decoded.match(/src="([^"]+)"/);
                push(lang, srcM ? absoluteUrl(srcM[1]) : null);
            } catch (_) { /* base64 invalide */ }
        }
    }
    const order = { VF: 0, VOSTFR: 1, VA: 2, VKR: 3 };
    return [...byLang.entries()]
        .map(([lang, servers]) => ({ lang, servers }))
        .sort((a, b) => (order[a.lang] ?? 9) - (order[b.lang] ?? 9));
}

/** Page player du thème → iframe hébergeur réelle. */
async function resolvePlayerIframe(src, referer) {
    if (!src.includes('animes-sama.su')) return src;
    const pHtml = await fetchText(src, { timeout: 12000, headers: { Referer: referer } });
    if (!pHtml) return null;
    const real = (pHtml.match(/class="player-iframe"[\s\S]{0,300}?src="([^"]+)"/) || [])[1]
        // Certains thèmes injectent l'iframe dans le JSON inline (src échappée)
        || (pHtml.match(/"src"\s*:\s*"(https?:[^"]+)"[\s\S]{0,80}?player-iframe/) || [])[1];
    const abs = real ? absoluteUrl(real) : null;
    return abs || null;
}

/**
 * Numérotation ABSOLUE : les catalogues par arc (one-piece-saga-N) et
 * certaines fiches uniques numérotent en continu alors que TMDB redémarre à 1.
 * Si la plage est contiguë et ne commence pas à 1, on décale l'épisode TMDB.
 */
function remapAbsolute(list, targetEp) {
    if (!list.length) return null;
    const nums = list.map(e => e.num).sort((a, b) => a - b);
    const min = nums[0];
    const max = nums[nums.length - 1];
    if (min < 2) return null;
    if (max - min + 1 !== nums.length) return null;
    const abs = min + targetEp - 1;
    if (abs > max) return null;
    const hit = list.find(e => e.num === abs);
    if (hit) {
        console.log(`[NekoSama] numérotation absolue : E${targetEp} → ép. ${abs}`);
        return hit;
    }
    return null;
}

/**
 * Trouve la page + l'épisode cible.
 * - Saison demandée : on charge les pages de CETTE saison (toutes parties),
 *   on cherche le numéro, puis on assemble les parties dans l'ordre (partie 1
 *   = E1..N, partie 2 = E(N+1)..) — Dr. Stone S3, Fate, etc.
 * - Puis hubs / autres saisons, avec remap absolu.
 * Retourne { page, ep, episodes } ou null.
 */
async function findEpisodePage(candidates, wantedSeason, targetEp, tmdbId, isMovie, t0, signal) {
    let tried = 0;
    const triedUrls = new Set();
    const maxFetches = wantedSeason ? MAX_PAGE_FETCHES : MAX_PAGE_FETCHES + 2;
    // Numéro ABSOLU TMDB (S2E1 → 62 sur One Piece) : indispensable pour les
    // catalogues par arc et les fiches uniques qui numérotent en continu.
    let absoluteEp = null;
    if (wantedSeason && wantedSeason > 1) {
        try {
            absoluteEp = await getAbsoluteEpisodeFromTmdb(tmdbId, wantedSeason, targetEp);
        } catch (_) { absoluteEp = null; }
    }

    const fetchPage = async (c) => {
        if (!c || triedUrls.has(c.url) || tried >= maxFetches) return null;
        if (isAborted(signal) || isBudgetExhausted(t0, BUDGET_MS)) return null;
        triedUrls.add(c.url);
        tried++;
        const html = await fetchText(c.url, { timeout: 12000 });
        if (!html || html.length < 2000) return null;
        const eps = extractEpisodesFromHtml(html);
        return eps.length ? { c, eps } : null;
    };

    // Un épisode ne peut être retenu que si ses métadonnées (quand elles
    // existent) désignent bien la saison demandée.
    const inSeason = (e) => !wantedSeason || e.season == null || e.season === wantedSeason;

    // 1) Pages de la saison demandée, dans l'ordre des parties.
    if (wantedSeason) {
        const seasonPages = candidates
            .filter(c => c.season === wantedSeason)
            .sort((a, b) => (a.part || 1) - (b.part || 1) || b.score - a.score);
        const loaded = [];
        for (const c of seasonPages.slice(0, MAX_PART_PAGES)) {
            const p = await fetchPage(c);
            if (p) loaded.push(p);
        }
        if (loaded.length) {
            for (const p of loaded) {
                const ep = p.eps.find(e => e.num === targetEp && inSeason(e));
                if (ep) return { page: p.c, ep, episodes: p.eps };
            }
            if (loaded.length > 1) {
                // Saison découpée en parties : la partie N renumérote à 1.
                // On décale par la taille d'une partie (max d'épisodes observé :
                // la page peut avoir des trous, le compteur exact est faux).
                const ordered = [];
                for (const p of loaded) {
                    p.eps.slice().sort((a, b) => a.num - b.num)
                        .forEach(e => ordered.push({ ...e, page: p.c }));
                }
                const partSize = Math.max(0, ...loaded.map(p => Math.max(...p.eps.map(e => e.num))));
                if (partSize > 0) {
                    const partIndex = Math.floor((targetEp - 1) / partSize);
                    const epInPart = targetEp - partIndex * partSize;
                    const target = loaded[partIndex];
                    const hit = target && target.eps.find(e => e.num === epInPart);
                    if (hit) {
                        console.log(`[NekoSama] saison en plusieurs parties : E${targetEp} → ${target.c.slug} ép. ${hit.num}`);
                        return { page: target.c, ep: hit, episodes: target.eps };
                    }
                }
                if (targetEp <= ordered.length) {
                    const hit = ordered[targetEp - 1];
                    console.log(`[NekoSama] saison en plusieurs parties (repli index) : E${targetEp} → ${hit.page.slug} ép. ${hit.num}`);
                    return { page: hit.page, ep: hit, episodes: ordered };
                }
            }
            const all = [];
            for (const p of loaded) p.eps.forEach(e => all.push({ ...e, page: p.c }));
            if (absoluteEp != null) {
                const hit = all.find(e => e.num === absoluteEp && inSeason(e));
                if (hit) {
                    console.log(`[NekoSama] numérotation absolue TMDB : E${targetEp} → ép. ${absoluteEp}`);
                    return { page: hit.page, ep: hit, episodes: all };
                }
            }
            const remapped = remapAbsolute(all, targetEp);
            if (remapped) return { page: remapped.page, ep: remapped, episodes: all };
        }
    }

    // 2) Hubs (saison inconnue) puis autres saisons : match direct, absolu, remap.
    for (const phase of ['hub', 'other']) {
        for (const c of candidates) {
            if (phase === 'hub' && c.season != null) continue;
            if (phase === 'other' && c.season == null) continue;
            if (c.season === wantedSeason) continue;
            const p = await fetchPage(c);
            if (!p) continue;
            const list = p.eps.map(e => ({ ...e, page: c }));
            // Hub « toute la franchise » (numérotation continue) : en S2+, le
            // numéro local 1 désigne le début de la S1 → on ne l'accepte
            // JAMAIS, seul l'absolu TMDB fait foi.
            const franchiseHub = c.season == null && wantedSeason > 1 && absoluteEp != null;
            if (!franchiseHub) {
                const direct = list.find(e => e.num === targetEp && inSeason(e));
                if (direct) return { page: c, ep: direct, episodes: p.eps };
            }
            if (absoluteEp != null) {
                const hit = list.find(e => e.num === absoluteEp && inSeason(e));
                if (hit) {
                    console.log(`[NekoSama] numérotation absolue TMDB : E${targetEp} → ép. ${absoluteEp}`);
                    return { page: c, ep: hit, episodes: p.eps };
                }
            }
            if (phase === 'other') continue; // jamais de match local sur une autre saison
            const remapped = remapAbsolute(list, targetEp);
            if (remapped) return { page: remapped.page, ep: remapped, episodes: p.eps };
        }
    }
    console.log(`[NekoSama] épisode ${targetEp} introuvable (pages testées: ${tried})`);
    return null;
}

// ===================== neko-sama.fr (domaine officiel) =====================
//
// neko-sama.fr est un site DISTINCT d'animes-sama.su (thème WordPress
// « animestream » que ce provider ne ciblait que jusqu'ici). Son front statique
// expose tout ce qu'il faut en DEUX requêtes, sans page épisode :
//   1. /fr/data/search.json → catalogue complet (451 animes : name, slug, year)
//   2. /anime/{slug}        → <script type="application/json"
//      id="js-seasons-data"> contenant TOUTES les saisons, TOUS les épisodes et
//      TOUS les lecteurs, déjà répartis par langue :
//      [{ name: "Saison 2", episods: { vostfr: [{num, players:[{src,name}]}],
//                                       vf: [...], en: [...] } }]
// Conséquence : plus de sondage de slugs, plus de 404, plus de page player
// intermédiaire — et les VF (souvent absentes des autres sources) sont là.
const NS_BASE = 'https://neko-sama.fr';
const NS_CATALOG_URL = `${NS_BASE}/fr/data/search.json`;
const NS_LANG_ORDER = ['vf', 'vostfr', 'en'];
const NS_MAX_HOSTS_PER_LANG = 2;
const NS_MAX_PLAYERS_PER_LANG = 4;

let _nsCatalogPromise = null;
function getNsCatalog() {
    if (!_nsCatalogPromise) _nsCatalogPromise = loadNsCatalog();
    return _nsCatalogPromise;
}

async function loadNsCatalog() {
    const txt = await fetchText(NS_CATALOG_URL, { timeout: 12000 });
    if (!txt) return null;
    try {
        const arr = JSON.parse(txt);
        const list = Array.isArray(arr) ? arr.filter(x => x && x.slug) : [];
        if (list.length) console.log(`[NekoSama] catalogue neko-sama.fr : ${list.length} animes`);
        return list.length ? list : null;
    } catch (_) {
        return null;
    }
}

/** Sélectionne la fiche neko-sama.fr (matching slug + nom normalisé). */
function nsPickEntry(catalog, titles) {
    let best = null;
    let bestScore = 0;
    for (const e of catalog) {
        const slug = String(e.slug || '').toLowerCase();
        if (!slug) continue;
        const nameSlug = normalizeKey(e.name).replace(/\s+/g, '-');
        let s = 0;
        for (const t of titles) {
            const tk = titleTokens(t);
            if (!tk.length) continue;
            s = Math.max(s, scoreSlug(tk, slug), nameSlug ? scoreSlug(tk, nameSlug) : 0);
        }
        if (s > bestScore) { bestScore = s; best = e; }
    }
    return bestScore >= 55 ? { entry: best, score: bestScore } : null;
}

/** « Saison 2 Partie 1 » → { season: 2, part: 1 } (sinon position dans la liste). */
function nsSeasonInfo(name, idx) {
    const n = String(name || '');
    const sm = n.match(/saison\s*(\d+)/i);
    const pm = n.match(/(?:partie|cour)\s*(\d+)/i);
    return {
        season: sm ? parseInt(sm[1], 10) : idx + 1,
        part: pm ? parseInt(pm[1], 10) : 1,
        isFilm: /\b(film|movie|oav|ova)\b/i.test(n),
    };
}

/** Récupère et parse le JSON `js-seasons-data` d'une fiche animé. */
async function nsLoadSeasons(slug) {
    const html = await fetchText(`${NS_BASE}/anime/${slug}`, { timeout: 12000 });
    if (!html) return null;
    const m = html.match(/<script[^>]+id="js-seasons-data"[^>]*>([\s\S]*?)<\/script>/i);
    if (!m) {
        console.log(`[NekoSama] neko-sama.fr : pas de js-seasons-data sur ${slug}`);
        return null;
    }
    try {
        const arr = JSON.parse(m[1]);
        return Array.isArray(arr) ? arr : null;
    } catch (e) {
        console.log(`[NekoSama] neko-sama.fr : JSON saisons invalide (${slug})`);
        return null;
    }
}

/** Saisons de la saison demandée (toutes les parties, dans l'ordre). */
function nsSeasonParts(seasons, wantedSeason, isMovie) {
    const decorated = seasons.map((s, idx) => ({ raw: s, ...nsSeasonInfo(s.name, idx) }));
    if (isMovie) {
        // Le catalogue neko-sama.fr ne contient que des séries : servir la S1
        // pour une demande de film donnerait un épisode qui ne correspond pas
        // au titre. On n'accepte donc QUE les fiches dont une entrée est
        // explicitement un film/OVA (sinon 0 flux, et animes-sama.su prend le
        // relais s'il connaît le film).
        const films = decorated.filter(d => d.isFilm);
        return { parts: films, isFilm: true };
    }
    const same = decorated.filter(d => d.season === wantedSeason);
    return { parts: same.sort((a, b) => a.part - b.part), isFilm: false };
}

/**
 * Players de l'épisode cible, par langue.
 * Les parties d'une même saison renumérotent à 1 : on ne retombe sur l'index
 * global QUE si la saison est réellement découpée (parts > 1), jamais pour
 * combler un trou de numérotation (sinon = faux épisode).
 */
function nsPlayersByLang(parts, targetEp, absoluteEp) {
    const byLang = {};
    for (const p of parts) {
        const eps = (p.raw && p.raw.episods) || {};
        for (const [lang, list] of Object.entries(eps)) {
            if (!Array.isArray(list) || !list.length) continue;
            byLang[lang] = byLang[lang] || [];
            list.slice().sort((a, b) => (a.num || 0) - (b.num || 0)).forEach(e => byLang[lang].push(e));
        }
    }
    const out = {};
    for (const [lang, list] of Object.entries(byLang)) {
        let hit = list.find(e => e.num === targetEp);
        if (!hit && absoluteEp != null) hit = list.find(e => e.num === absoluteEp);
        // Numérotation CONTINUE dans la saison : neko-sama.fr numérote parfois
        // la S2 13..25 (Solo Leveling) au lieu de redémarrer à 1. Sans ce
        // décalage, S2E1 tombait sur « aucun lecteur » et basculait sur le
        // repli lent d'animes-sama.su. On ne l'applique que si la plage est
        // contiguë, sinon on risque un faux épisode.
        if (!hit && parts.length === 1) {
            const nums = list.map(e => e.num).filter(n => typeof n === 'number').sort((a, b) => a - b);
            const min = nums[0];
            const max = nums[nums.length - 1];
            if (min > 1 && max - min + 1 === nums.length) {
                const abs = min + targetEp - 1;
                if (abs <= max) {
                    const shifted = list.find(e => e.num === abs);
                    if (shifted) {
                        console.log(`[NekoSama] neko-sama.fr numérotation continue : E${targetEp} → ép. ${abs}`);
                        hit = shifted;
                    }
                }
            }
        }
        if (!hit && parts.length > 1 && list[targetEp - 1]) hit = list[targetEp - 1];
        if (hit && Array.isArray(hit.players) && hit.players.length) out[lang] = hit.players;
    }
    return out;
}

/** Priorité des hébergeurs neko-sama.fr (ansembed = VidMoly, le plus rapide). */
function nsPlayerRank(src) {
    const u = String(src || '').toLowerCase();
    if (u.includes('ansembed')) return 0;
    if (u.includes('smoothpre') || u.includes('earnvids')) return 8;
    return 3;
}

/**
 * Résout les lecteurs d'un épisode neko-sama.fr (VF d'abord, puis VOSTFR, VA),
 * avec les mêmes garde-fous que le reste du provider : hôtes distincts,
 * plafond par langue et budget global.
 */
async function nsResolveEpisode({ playersByLang, label, seriesName, signal, t0 }) {
    // Les langues sont indépendantes (hôtes différents) : les résoudre en
    // parallèle ramène le pire cas (VOE ~7-8 s) au lieu de les additionner.
    const resolveLang = async (langKey) => {
        const players = playersByLang[langKey];
        if (!players || !players.length) return [];
        const out = [];
        const siteLang = langKey === 'vf' ? 'VF' : langKey === 'vostfr' ? 'VOSTFR' : 'VA';
        const hosts = new Set();
        let attempts = 0;
        const ordered = players
            .slice()
            .sort((a, b) => nsPlayerRank(a.src) - nsPlayerRank(b.src));
        for (const p of ordered) {
            if (hosts.size >= NS_MAX_HOSTS_PER_LANG) break;
            if (attempts >= NS_MAX_PLAYERS_PER_LANG) break;
            if (isAborted(signal) || isBudgetExhausted(t0, BUDGET_MS)) break;
            attempts++;
            const embed = absoluteUrl(p.src);
            if (!embed) continue;
            try {
                const resolved = await resolveStream({ url: embed, language: siteLang });
                if (!resolved || !resolved.url || resolved.url === embed) {
                    console.log(`[NekoSama] ✗ neko-sama.fr ${siteLang} ${String(p.name || '').slice(0, 20)}`);
                    continue;
                }
                let host = '';
                try { host = new URL(resolved.url).hostname; } catch (_) { host = resolved.url.slice(0, 40); }
                if (hosts.has(host)) continue;
                hosts.add(host);
                out.push({
                    url: resolved.url,
                    title: `NekoSama [${siteLang}] ${label} - ${seriesName} (${host})`,
                    name: `NekoSama (${siteLang}) ${label}`,
                    language: langCode(siteLang),
                    provider: 'NekoSama',
                    type: /\.m3u8/i.test(resolved.url) ? 'hls' : 'mp4',
                    headers: resolved.headers || undefined,
                });
                console.log(`[NekoSama] ✓ neko-sama.fr ${siteLang} ${host}`);
            } catch (e) {
                if (String(e && e.message).includes('AbortError')) throw e;
                console.log(`[NekoSama] ✗ neko-sama.fr ${siteLang}: ${e?.message}`);
            }
        }
        return out;
    };

    const results = await Promise.allSettled(NS_LANG_ORDER.map(l => resolveLang(l)));
    const streams = [];
    const seen = new Set();
    for (const r of results) {
        if (r.status !== 'fulfilled') {
            if (String(r.reason && r.reason.message).includes('AbortError')) throw r.reason;
            continue;
        }
        for (const st of r.value) {
            const key = `${st.language}|${st.url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            streams.push(st);
        }
    }
    return streams;
}

/** Pipeline complet neko-sama.fr (catalogue → fiche → lecteurs). */
async function extractFromNekoSamaFr({ isMovie, wantedSeason, targetEp, absoluteEp, titles, signal, t0 }) {
    const catalog = await getNsCatalog();
    if (!catalog) return [];
    if (isAborted(signal)) return [];
    const picked = nsPickEntry(catalog, titles);
    if (!picked) {
        console.log('[NekoSama] neko-sama.fr : fiche introuvable');
        return [];
    }
    const seasons = await nsLoadSeasons(picked.entry.slug);
    if (!seasons || !seasons.length) return [];
    const { parts } = nsSeasonParts(seasons, wantedSeason, isMovie);
    if (!parts.length) {
        console.log(`[NekoSama] neko-sama.fr : saison ${wantedSeason} absente (${seasons.map(s => s.name).join(' / ')})`);
        return [];
    }
    const playersByLang = nsPlayersByLang(parts, isMovie ? 1 : targetEp, absoluteEp);
    const langs = Object.keys(playersByLang);
    if (!langs.length) {
        console.log('[NekoSama] neko-sama.fr : aucun lecteur pour cet épisode');
        return [];
    }
    const label = isMovie ? 'Film' : `S${wantedSeason || 1}E${targetEp}`;
    const seriesName = picked.entry.name || titles[0] || '';
    console.log(`[NekoSama] neko-sama.fr ${picked.entry.slug} (${parts.map(p => p.raw.name).join(' + ')}) langues: ${langs.join(',')}`);
    return nsResolveEpisode({ playersByLang, label, seriesName, signal, t0 });
}

// ---- export ----

/** Pipeline historique animes-sama.su — réutilise les titres déjà résolus. */
async function extractLegacy({ tmdbId, mediaType, season, episodeNum, wantedSeason, targetEp, isMovie, titles, signal, t0, skipLangs }) {
    if (isAborted(signal)) return [];
    const catalog = await getCatalog();
    let candidates = catalog
        ? pickCandidates(catalog, titles, wantedSeason, isMovie, signal)
        : [];
    // Le sitemap WordPress est généré dynamiquement : quand il est disponible,
    // il est exhaustif et fait autorité. Le repli HTML (lent : plusieurs
    // recherches, réponses « 0 résultat » polluées par la sidebar) ne sert
    // que si le sitemap est inaccessible.
    if (!candidates.length && !catalog) {
        candidates = await searchCandidates(titles, wantedSeason, isMovie);
    }
    if (!candidates.length) {
        console.log(`[NekoSama] animes-sama.su : série introuvable`);
        return [];
    }
    console.log(`[NekoSama] candidats: ${candidates.slice(0, 3).map(c => `${c.slug}(${Math.round(c.score)})`).join(', ')}`);

    const found = await findEpisodePage(candidates, wantedSeason, targetEp, tmdbId, isMovie, t0, signal);
    if (!found) return [];
    console.log(`[NekoSama] série ${found.page.url} (${found.episodes.length} ép.)`);
    console.log(`[NekoSama] épisode ${targetEp}: ${found.ep.url}`);

    const epHtml = await fetchText(found.ep.url, { timeout: 12000 });
    if (!epHtml || epHtml.length < 1000) return [];
    const groups = extractServerGroups(epHtml);
    console.log(`[NekoSama] groupes: ${groups.map(g => `${g.lang}:${g.servers.length}`).join(', ') || 'aucun'}`);

    const label = isMovie ? 'Film' : `S${wantedSeason || 1}E${targetEp}`;
    const seriesName = (titles._metadata && titles._metadata.name) || titles[0] || '';
    const streams = [];

    for (const group of groups) {
        if (skipLangs && skipLangs.has(group.lang)) continue;
        if (isBudgetExhausted(t0, BUDGET_MS)) break;
        const hosts = new Set();
        let attempts = 0;
        for (const src of group.servers) {
            if (hosts.size >= MAX_HOSTS_PER_LANG) break;
            if (attempts >= MAX_BUTTONS_PER_LANG) break;
            if (isBudgetExhausted(t0, BUDGET_MS)) break;
            attempts++;
            try {
                const embed = await resolvePlayerIframe(src, found.ep.url);
                if (!embed) {
                    console.log(`[NekoSama] ✗ page player sans iframe (${group.lang})`);
                    continue;
                }
                const resolved = await resolveStream({ url: embed, language: group.lang });
                if (!resolved || !resolved.url || resolved.url === embed) continue;
                let host = '';
                try { host = new URL(resolved.url).hostname; } catch (_) { host = resolved.url.slice(0, 40); }
                if (hosts.has(host)) continue;
                hosts.add(host);
                streams.push({
                    url: resolved.url,
                    // S/E dans name+title : NuvioTV dérive son bingeGroup de
                    // name/title/language/quality — sans épisode, tous les
                    // épisodes partageaient le même groupe (reprise/auto-next
                    // pouvaient rejouer le même fichier).
                    title: `NekoSama [${group.lang}] ${label} - ${seriesName} (${host})`,
                    name: `NekoSama (${group.lang}) ${label}`,
                    language: langCode(group.lang),
                    provider: 'NekoSama',
                    type: /\.m3u8/i.test(resolved.url) ? 'hls' : 'mp4',
                    headers: resolved.headers || undefined,
                });
                console.log(`[NekoSama] ✓ ${group.lang} ${host}`);
            } catch (e) {
                if (String(e && e.message).includes('AbortError')) throw e;
                console.log(`[NekoSama] ✗ ${group.lang}: ${e?.message}`);
            }
        }
    }
    return streams;
}

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const t0 = Date.now();
    const isMovie = mediaType === 'movie';
    // NuvioTV (IDs anime) envoie season=null + épisode ABSOLU → reverse-map
    // TMDB avant toute sélection de page.
    if (!isMovie) {
        const se = await resolveSeasonEpisodeInputs(season, episodeNum, tmdbId, { mediaType: 'tv' });
        season = se.season;
        episodeNum = se.episode;
    }
    const wantedSeason = isMovie ? null : (parseInt(season, 10) || null);
    const targetEp = parseInt(episodeNum, 10) || 1;

    // 1. titres TMDB
    const { getTmdbTitles } = await import('../utils/metadata.js');
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) {
        console.log(`[NekoSama] aucun titre TMDB pour ${tmdbId}`);
        return [];
    }
    console.log(`[NekoSama] titres: ${titles.slice(0, 3).join(', ')}`);

    // Numéro ABSOLU (sagas One Piece, fiches à numérotation continue).
    let absoluteEp = null;
    if (!isMovie && wantedSeason && wantedSeason > 1) {
        try {
            absoluteEp = await getAbsoluteEpisodeFromTmdb(tmdbId, wantedSeason, targetEp);
        } catch (_) { absoluteEp = null; }
    }

    const streams = [];
    const seen = new Set();
    const pushAll = (list) => {
        for (const st of list || []) {
            const key = `${st.language}|${st.url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            streams.push(st);
        }
    };
    const hasLang = (tag) => streams.some(s => String(s.name || '').includes(`(${tag})`));

    // 2. SOURCE PRINCIPALE : neko-sama.fr (catalogue JSON + fiche JSON).
    //    Deux requêtes, VF incluse, aucune page épisode à deviner.
    try {
        pushAll(await extractFromNekoSamaFr({
            isMovie, wantedSeason, targetEp, absoluteEp, titles, signal, t0,
        }));
    } catch (e) {
        if (String(e && e.message).includes('AbortError')) throw e;
        console.log(`[NekoSama] neko-sama.fr en échec: ${e?.message}`);
    }

    // 3. COMPLÉMENT : animes-sama.su (catalogue WordPress) — seulement si une
    //    langue manque encore et qu'il reste du budget. C'est lui qui fournit
    //    les VA/VKR et certains titres absents de neko-sama.fr.
    const missing = !hasLang('VF') || !hasLang('VOSTFR');
    if (missing && !isBudgetExhausted(t0, BUDGET_MS - 10000)) {
        try {
            const skip = new Set();
            if (hasLang('VF')) skip.add('VF');
            if (hasLang('VOSTFR')) skip.add('VOSTFR');
            pushAll(await extractLegacy({
                tmdbId, mediaType, season, episodeNum, wantedSeason, targetEp,
                isMovie, titles, signal, t0, skipLangs: skip,
            }));
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
            console.log(`[NekoSama] animes-sama.su en échec: ${e?.message}`);
        }
    }

    console.log(`[NekoSama] ${streams.length} stream(s) retourné(s) (${Date.now() - t0}ms)`);
    return streams;
}
