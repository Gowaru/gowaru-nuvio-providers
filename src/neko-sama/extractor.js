/**
 * Extractor for Neko-Sama (animes-sama.su)
 * WordPress "animestream" theme — structure vérifiée en live (09/2026) :
 * 1. Hub /anime/{slug}/          → eplister VIDE (liens vers les pages saison)
 * 2. Page saison …-saison-N/     → ul.eplister > li > a[href="…/{slug}-episode-N-saison-M/"]
 *                                  avec <div class="epl-num"> / <div class="epl-title"> (DIV, pas SPAN)
 * 3. Page épisode                → boutons loadMi({ value: base64 }) groupés en .server-group
 *                                  avec <label>SUB:</label> (VOSTFR) ou <label>VF:</label>
 * 4. b64 décodé                  → iframe src = page player du thème (player/?source=embed&url=TOKEN)
 * 5. Page player (SSR)           → <iframe class="player-iframe" src="EMBED"> (vidmoly, sibnet, sendvid…)
 * 6. EMBED                       → résolu via resolveStream() (gère le challenge JWT vidmoly, etc.)
 */

import { fetchText, setCurrentSignal } from './http.js';
import { safeFetch, isAborted, isBudgetExhausted, resolveStream, normalizeLanguageCode } from '../utils/resolvers.js';

const BASE_URL = "https://animes-sama.su";
const BUDGET_MS = 40000;

// ---- helpers ----

/** Normalise un href (relatif → absolu, entités HTML). */
function absoluteUrl(href) {
    if (!href) return null;
    let u = href.replace(/&#038;/g, '&').replace(/&amp;/g, '&').trim();
    if (u.startsWith('//')) u = 'https:' + u;
    else if (u.startsWith('/')) u = BASE_URL + u;
    return /^https?:\/\//.test(u) ? u : null;
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
    const scope = endUl > -1 ? html.slice(start, endUl) : html.slice(start, start + 100000);
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

/**
 * Sous-pages légitimes d'un hub, limitées à SA franchise.
 * Garde-fou anti-sidebar : sur un hub /anime/one-piece/, seuls les liens dont
 * le slug commence par le slug de la page (one-piece-*) sont légitimes — la
 * sidebar liste les pages d'AUTRES séries (solo-leveling, invincible…) et
 * l'ancien code les suivait → mauvais épisode servi.
 * Gère 2 hiérarchies :
 *   - …-saison-N/  (série classique multi-saisons)
 *   - …-saga-N-…/  (catalogues par arc, ex. one-piece-saga-1-east-blue/)
 * Retourne [{ url, season }] (season peut être null pour les pages catalogue).
 */
function extractSeasonPageLinks(html, pageUrl) {
    const out = [];
    const seen = new Set();
    if (!pageUrl) return out;
    const baseSlug = pageUrl.replace(/.*\/anime\//, '').replace(/\/$/, '').toLowerCase();
    const re = /href="([^"]*\/anime\/([a-z0-9-]+?)\/?)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const url = absoluteUrl(m[1]);
        const slug = (m[2] || '').toLowerCase();
        if (!url || seen.has(url)) continue;
        if (slug !== baseSlug && !slug.startsWith(baseSlug + '-')) continue;
        if (slug === baseSlug) continue; // le hub lui-même (eplister vide)
        seen.add(url);
        const saisonM = slug.match(/-saison-(\d+)/);
        const sagaM = slug.match(/-saga-(\d+)/);
        out.push({ url, season: saisonM ? parseInt(saisonM[1], 10) : (sagaM ? parseInt(sagaM[1], 10) : null) });
    }
    return out;
}

/** Score des sous-pages d'un hub : saison/saga voulue > autre, catalogue > spécial. */
function scoreHubLinks(links, wantedSeason) {
    return links.map(l => {
        const slug = l.url.replace(/.*\/anime\//, '').replace(/\/$/, '').toLowerCase();
        let s = 0;
        if (wantedSeason && l.season === wantedSeason) s += 40;
        else if (wantedSeason && l.season) s -= Math.min(20, Math.abs(l.season - wantedSeason) * 2);
        if (l.season == null) s -= 10;
        if (/(^|-)(oav|special|film|films|movie|recap|fan-letter)(-|$)/.test(slug)) s -= 25;
        return { ...l, score: s };
    }).sort((a, b) => b.score - a.score);
}

/**
 * Suit les sous-pages d'un hub (saison/saga) et retourne la page contenant
 * l'épisode cible (ou la première sous-page peuplée en fallback).
 */
async function followHub(hubUrl, hubHtml, wantedSeason, targetEp, t0) {
    const hubLinks = scoreHubLinks(extractSeasonPageLinks(hubHtml, hubUrl), wantedSeason);
    let fallback = null;
    for (const target of hubLinks.slice(0, 4)) {
        if (isBudgetExhausted(t0, BUDGET_MS)) break;
        const subHtml = await fetchText(target.url);
        const subEps = subHtml ? extractEpisodesFromHtml(subHtml) : [];
        if (subEps.length === 0) continue;
        console.log(`[NekoSama] hub → page ${target.url} (${subEps.length} ép.)`);
        if (targetEp && subEps.some(e => e.num === targetEp)) {
            return { url: target.url, episodes: subEps };
        }
        if (!fallback) fallback = { url: target.url, episodes: subEps };
    }
    return fallback;
}

/**
 * Boutons serveur d'une page épisode, groupés par langue.
 * Chaque <div class="server-group"> porte un <label>SUB:</label> ou <label>VF:</label>
 * qui est la SEULE source fiable de la langue (pas le titre de l'embed).
 * Retourne [{ lang, iframeSrc }] — iframeSrc = page player du thème ou embed direct.
 */
function extractLangButtons(html) {
    const out = [];
    // On découpe la zone server-right en groupes ; le dernier groupe se termine
    // au premier label SUB/VF suivant — la lookahead garantit la découpe.
    const groupRe = /<div class="server-group">([\s\S]*?)(?=<div class="server-group">|<\/div>\s*<\/div>\s*<div class="server-divider"|<!-- VF SERVERS -->|$)/gi;
    let g;
    while ((g = groupRe.exec(html)) !== null) {
        const body = g[1];
        const labelM = body.match(/<label[^>]*>([\s\S]*?)<\/label>/);
        const label = labelM ? labelM[1].replace(/<[^>]+>/g, '').trim().toUpperCase() : '';
        let lang = 'VOSTFR';
        if (/^VF/.test(label) || /FRENCH/.test(label)) lang = 'VF';
        else if (/^SUB/.test(label) || /VOSTFR/.test(label)) lang = 'VOSTFR';

        const btnRe = /loadMi\(\{\s*value:\s*'([A-Za-z0-9+/=]{20,})'\s*\}\)/g;
        let b;
        while ((b = btnRe.exec(body)) !== null) {
            try {
                const decoded = atob(b[1]);
                const srcM = decoded.match(/src="([^"]+)"/);
                const src = srcM ? absoluteUrl(srcM[1]) : null;
                if (src) out.push({ lang, iframeSrc: src });
            } catch (_) { /* base64 invalide */ }
        }
    }
    return out;
}

// ---- recherche ----

async function searchSeries(query) {
    const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
    if (!html || html.length < 1000) return [];
    const links = new Set();
    const re = /href="(https?:\/\/animes-sama\.su\/anime\/[^"]+)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) links.add(absoluteUrl(m[1]));
    return [...links].filter(Boolean);
}

/**
 * Cherche la meilleure page série pour un titre + saison.
 * Score : match de slug exact > contient ; page saison > hub ; saison voulue > autre.
 * Suit les hubs (eplister vide) vers leur page saison.
 */
async function findSeriesPage(titles, wantedSeason, targetEp) {
    const t0 = Date.now();
    for (const t of titles) {
        const norm = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        // Variantes de recherche : le moteur du site matche mal les titres longs
        // avec sous-titre ("Demon Slayer: Kimetsu no Yaiba" → 0 résultat) → on
        // retente avec les 2-3 premiers mots.
        const words = norm.split(/\s+/);
        const variants = [t];
        if (words.length > 2) variants.push(words.slice(0, 2).join(' '));
        if (words.length > 3) variants.push(words.slice(0, 3).join(' '));
        let candidates = [];
        for (const v of variants) {
            candidates = await searchSeries(v);
            if (candidates.length > 0) break;
        }
        if (candidates.length === 0) continue;
        const scored = candidates.map(u => {
            const slug = u.replace(BASE_URL + '/anime/', '').replace(/\/$/, '');
            const sn = slug.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
            let s = 0;
            if (sn === norm) s = 100;
            else if (sn.includes(norm) || norm.includes(sn)) s = 70;
            // PAS de score par défaut : les hubs de la sidebar (solo-leveling,
            // tensei-shitara…) polluaient les candidats → fetchs inutiles.
            else return { url: u, score: -1 };
            const seasonM = slug.match(/saison-(\d+)/);
            if (seasonM) {
                s += 5; // page saison > hub
                if (wantedSeason && parseInt(seasonM[1], 10) === wantedSeason) s += 40;
            }
            if (/(^|\s)(oav|special|film|movie)(\s|$)/.test(sn)) s -= 25;
            return { url: u, score: s };
        }).sort((a, b) => b.score - a.score);

        // 6 candidats : les variantes "kai" (catalogues vides) précèdent souvent
        // les pages saga réelles dans les résultats de recherche.
        for (const c of scored.filter(x => x.score > 0).slice(0, 6)) {
            if (isBudgetExhausted(t0, BUDGET_MS)) break;
            let html = await fetchText(c.url);
            if (!html || html.length < 2000) continue;

            let eps = extractEpisodesFromHtml(html);

            // Hub (eplister vide) : suivre les sous-pages de SA franchise
            // (saison ET saga), et chercher l'épisode cible sur plusieurs pages.
            if (eps.length === 0) {
                const found = await followHub(c.url, html, wantedSeason, targetEp, t0);
                if (found) return found;
                continue;
            }

            if (eps.length > 0) {
                console.log(`[NekoSama] ✓ série ${c.url} (${eps.length} épisodes)`);
                return { url: c.url, episodes: eps };
            }
        }

        // Hub franchise absent des résultats de recherche (candidats kai/variants
        // seulement) : sonde directe /anime/{slug}/ dérivé du titre.
        if (isBudgetExhausted(t0, BUDGET_MS)) break;
        const hubUrl = `${BASE_URL}/anime/${norm.replace(/\s+/g, '-')}/`;
        const hubHtml = await fetchText(hubUrl);
        if (hubHtml && hubHtml.length > 2000) {
            const found = await followHub(hubUrl, hubHtml, wantedSeason, targetEp, t0);
            if (found) return found;
        }
    }
    return null;
}

// ---- export ----

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const t0 = Date.now();
    const wantedSeason = parseInt(season, 10) || null;
    const targetEp = parseInt(episodeNum, 10);

    // 1. récupérer les titres TMDB (locale, pas de requête sortante)
    const { getTmdbTitles } = await import('../utils/metadata.js');
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) {
        console.log(`[NekoSama] aucun titre TMDB pour ${tmdbId}`);
        return [];
    }
    console.log(`[NekoSama] titres: ${titles.slice(0, 3).join(', ')}`);

    // 2. trouver la page série (hub ou saison) et sa liste d'épisodes
    const series = await findSeriesPage(titles, wantedSeason, targetEp);
    if (!series || series.episodes.length === 0) {
        console.log(`[NekoSama] série introuvable`);
        return [];
    }

    // 3. épisode cible
    const ep = series.episodes.find(e => e.num === targetEp);
    if (!ep) {
        console.log(`[NekoSama] épisode ${targetEp} absent (dispo : ${series.episodes.map(e => e.num).join(',')})`);
        return [];
    }
    console.log(`[NekoSama] épisode ${targetEp}: ${ep.url}`);

    // 4. boutons loadMi groupés par langue
    const epHtml = await fetchText(ep.url);
    if (!epHtml || epHtml.length < 1000) return [];
    const buttons = extractLangButtons(epHtml);
    console.log(`[NekoSama] ${buttons.length} bouton(s) serveur`);

    // 5. résoudre chaque bouton : page player → embed → resolveStream
    //    Priorité langue : VF d'abord (demande usuelle), puis VOSTFR ; 1 stream/langue.
    const ordered = [
        ...buttons.filter(b => b.lang === 'VF'),
        ...buttons.filter(b => b.lang === 'VOSTFR'),
    ];
    const LIMIT_PER_LANG = 1;
    const gotLang = new Set();
    const streams = [];

    for (const btn of ordered) {
        if (isBudgetExhausted(t0, BUDGET_MS)) break;
        if (gotLang.has(btn.lang)) continue;

        try {
            let embedSrc = btn.iframeSrc;

            // Le b64 pointe vers la page player du thème (SSR) → extraire l'iframe réelle.
            // (Un embed externe direct reste possible : on ne fetch que si c'est notre domaine.)
            if (embedSrc.includes('animes-sama.su')) {
                const pHtml = await fetchText(embedSrc, { headers: { Referer: ep.url } });
                const real = pHtml
                    ? (pHtml.match(/class="player-iframe"[\s\S]{0,300}?src="([^"]+)"/) || [])[1]
                    : null;
                const abs = real ? absoluteUrl(real) : null;
                if (!abs) {
                    console.log(`[NekoSama] ✗ page player sans iframe (${btn.lang})`);
                    continue;
                }
                embedSrc = abs;
            }

            console.log(`[NekoSama] résolution ${btn.lang}: ${embedSrc.slice(0, 70)}`);
            const resolved = await resolveStream({ url: embedSrc, language: btn.lang });

            // Embed non résoluble → l'URL retournée est identique → non jouable, on skip.
            if (!resolved || !resolved.url || resolved.url === embedSrc) {
                console.log(`[NekoSama] ✗ non résolu (${btn.lang})`);
                continue;
            }

            streams.push({
                url: resolved.url,
                title: `NekoSama [${btn.lang}] ${ep.label}`.trim(),
                name: `NekoSama (${btn.lang})`,
                language: normalizeLanguageCode(btn.lang) || 'fr', // fr (VF et VOSTFR)
                provider: 'NekoSama',
                type: /\.m3u8/i.test(resolved.url) ? 'hls' : 'mp4',
                headers: resolved.headers || undefined,
            });
            gotLang.add(btn.lang);
            console.log(`[NekoSama] ✓ ${btn.lang}: ${resolved.url.slice(0, 80)}`);

            if (gotLang.size >= 2) break;
        } catch (e) {
            console.log(`[NekoSama] ✗ ${btn.lang}: ${e?.message}`);
        }
    }

    console.log(`[NekoSama] ${streams.length} stream(s) retourné(s)`);
    return streams;
}
