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

const BASE_URL = "https://animes-sama.su";
const SITEMAP_URL = `${BASE_URL}/wp-sitemap-posts-anime-1.xml`;
const BUDGET_MS = 38000;
const MAX_PAGE_FETCHES = 4;
const MAX_BUTTONS_PER_LANG = 4;
const MAX_HOSTS_PER_LANG = 2;

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
    const re = /<a[^>]+href="([^"]*episode-(\d+)(?:-saison-(\d+))?[^"?]*)"[^>]*>[\s\S]{0,400}?<(?:div|span)[^>]*class="[^"]*epl-num[^"]*"[^>]*>([^<]{0,30})<\/(?:div|span)>/gi;
    let m;
    while ((m = re.exec(scope)) !== null) {
        const url = absoluteUrl(m[1]);
        if (!url) continue;
        // Numéro affiché (epl-num) prioritaire sur le numéro d'URL
        const num = parseInt((m[4] || '').trim(), 10) || parseInt(m[2], 10);
        if (!num || seen.has(num)) continue;
        seen.add(num);
        eps.push({ url, num, season: m[3] ? parseInt(m[3], 10) : null, label: `Épisode ${num}` });
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
    const xml = await fetchText(SITEMAP_URL, { timeout: 12000 });
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
        const seasonM = slug.match(/-saison-(\d+)$/);
        const sagaM = slug.match(/-saga-(\d+)/);
        entries.push({
            slug,
            url,
            base: seasonM ? slug.slice(0, seasonM.index) : slug,
            season: seasonM ? parseInt(seasonM[1], 10) : (sagaM ? parseInt(sagaM[1], 10) : null),
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
            // passer devant la page saison/saga réellement demandée.
            if (e.season == null) s -= 25;
            else if (e.season === wantedSeason) s += 35;
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
    const seasonM = slug.match(/-saison-(\d+)$/);
    const sagaM = slug.match(/-saga-(\d+)/);
    return {
        slug,
        url,
        base: seasonM ? slug.slice(0, seasonM.index) : slug,
        season: seasonM ? parseInt(seasonM[1], 10) : (sagaM ? parseInt(sagaM[1], 10) : null),
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
 * Groupes serveurs d'une page épisode (SUB = VOSTFR, VF = doublage).
 * Split sur `<div class="server-group">` : la lookahead précédente exigeait
 * `</div></div><div class="server-divider"` et ratait des groupes.
 * Retourne [{ lang, servers: [src,…] }] dans l'ordre du DOM.
 */
function extractServerGroups(html) {
    const zoneStart = html.indexOf('class="server-right"');
    const zone = zoneStart >= 0 ? html.slice(zoneStart, zoneStart + 60000) : html;
    const parts = zone.split('<div class="server-group">');
    const groups = [];
    parts.slice(1).forEach((raw, gi) => {
        const body = raw.slice(0, 12000);
        const labelM = body.match(/<label[^>]*>([\s\S]*?)<\/label>/);
        const label = labelM ? labelM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toUpperCase() : '';
        let lang = '';
        if (/^VF/.test(label) || /FRENCH/.test(label) || /^VA/.test(label)) lang = 'VF';
        else if (/^SUB/.test(label) || /VOSTFR/.test(label) || /^VO/.test(label)) lang = 'VOSTFR';

        const servers = [];
        const seen = new Set();
        const btnRe = /loadMi\(\{\s*value:\s*'([A-Za-z0-9+/=]{20,})'\s*\}\)[^>]*>\s*([^<]{0,24})</g;
        let b;
        while ((b = btnRe.exec(body)) !== null) {
            const text = (b[2] || '').trim().toUpperCase();
            if (!lang) {
                if (/^VF/.test(text)) lang = 'VF';
                else if (/^(VO|SUB|VOST)/.test(text)) lang = 'VOSTFR';
            }
            try {
                const decoded = atob(b[1]);
                const srcM = decoded.match(/src="([^"]+)"/);
                const src = srcM ? absoluteUrl(srcM[1]) : null;
                if (!src || seen.has(src)) continue;
                seen.add(src);
                servers.push(src);
            } catch (_) { /* base64 invalide */ }
        }
        if (servers.length) groups.push({ lang: lang || 'VOSTFR', servers, order: gi });
    });
    return groups;
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

// ---- export ----

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const t0 = Date.now();
    const isMovie = mediaType === 'movie';
    const wantedSeason = isMovie ? null : (parseInt(season, 10) || null);
    const targetEp = parseInt(episodeNum, 10) || 1;

    // 1. titres TMDB (aucune requête sortante)
    const { getTmdbTitles } = await import('../utils/metadata.js');
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) {
        console.log(`[NekoSama] aucun titre TMDB pour ${tmdbId}`);
        return [];
    }
    console.log(`[NekoSama] titres: ${titles.slice(0, 3).join(', ')}`);

    // 2. catalogue (sitemap) puis sélection stricte
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
        console.log(`[NekoSama] série introuvable (${Date.now() - t0}ms)`);
        return [];
    }
    console.log(`[NekoSama] candidats: ${candidates.slice(0, 3).map(c => `${c.slug}(${Math.round(c.score)})`).join(', ')}`);

    // 3. page contenant l'épisode cible
    let found = null;
    let tried = 0;
    const triedBases = new Set();
    // Sans saison (IDs traceurs kitsu:…:ep absolu), l'épisode peut vivre sur
    // n'importe quelle page saison/saga de la franchise → plus de tentatives.
    const maxFetches = wantedSeason ? MAX_PAGE_FETCHES : MAX_PAGE_FETCHES + 2;
    for (const c of candidates) {
        if (tried >= maxFetches) break;
        if (isBudgetExhausted(t0, BUDGET_MS)) break;
        // Hub + page saison du même numéro = même contenu utile : on évite le doublon
        const key = `${c.base}|${c.season == null ? 'hub' : c.season}`;
        if (triedBases.has(key)) continue;
        triedBases.add(key);
        const html = await fetchText(c.url, { timeout: 12000 });
        tried++;
        if (!html || html.length < 2000) continue;
        const eps = extractEpisodesFromHtml(html);
        if (!eps.length) continue; // hub vide → les pages saison sont aussi candidates
        let ep = eps.find(e => e.num === targetEp);
        if (!ep) {
            // Catalogues par arc (one-piece-saga-N) : la page numérote en ABSOLU
            // (saga 2 = 62..143) alors que TMDB redémarre à 1 → sans remap,
            // S2E1 rendait 0 stream. On décale si la plage est contiguë.
            const isSaga = /-saga-\d+/.test(c.slug);
            if (isSaga && c.season === wantedSeason) {
                const nums = eps.map(e => e.num).sort((a, b) => a - b);
                const min = nums[0];
                const max = nums[nums.length - 1];
                const contiguous = max - min + 1 === nums.length;
                const absolute = min + targetEp - 1;
                if (contiguous && min >= 2 && absolute <= max) {
                    ep = eps.find(e => e.num === absolute);
                    if (ep) console.log(`[NekoSama] saga absolue : E${targetEp} → ép. ${absolute}`);
                }
            }
        }
        if (ep) {
            console.log(`[NekoSama] série ${c.url} (${eps.length} ép.)`);
            found = { page: c, ep, episodes: eps };
            break;
        }
    }
    if (!found) {
        console.log(`[NekoSama] épisode ${targetEp} introuvable (pages testées: ${tried})`);
        return [];
    }
    console.log(`[NekoSama] épisode ${targetEp}: ${found.ep.url}`);

    // 4. groupes serveurs par langue
    const epHtml = await fetchText(found.ep.url, { timeout: 12000 });
    if (!epHtml || epHtml.length < 1000) return [];
    const groups = extractServerGroups(epHtml);
    console.log(`[NekoSama] groupes: ${groups.map(g => `${g.lang}:${g.servers.length}`).join(', ') || 'aucun'}`);

    // 5. résolution multi-hébergeurs : VF d'abord, puis VOSTFR
    const ordered = [
        ...groups.filter(g => g.lang === 'VF'),
        ...groups.filter(g => g.lang !== 'VF'),
    ];
    const label = isMovie ? 'Film' : `S${wantedSeason || 1}E${targetEp}`;
    const streams = [];

    for (const group of ordered) {
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
                    title: `NekoSama [${group.lang}] ${label}`,
                    name: `NekoSama (${group.lang})`,
                    language: normalizeLanguageCode(group.lang) || 'fr',
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

    console.log(`[NekoSama] ${streams.length} stream(s) retourné(s) (${Date.now() - t0}ms)`);
    return streams;
}
