/**
 * Extractor Logic for Anime-Ultime (v5.anime-ultime.net)
 *
 * Pipeline validé par PoC :
 *   1. POST /MenuSearch.html  → JSON [{id,title,type,format,url,number,img_url}]
 *   2. GET  /<slug>-streaming.html → data-serie + liens d'épisodes relatifs
 *   3. GET  page épisode ancre → data-focus
 *   4. POST /VideoPlayer.html (idserie + focusFile) → JSON {qualité:{mp4:{url}}, playlist[]}
 *   5. Match épisode cible dans la playlist → 2e POST → URL mp4 directe (CDN sans protection)
 *
 * Contrainte site : les séries licenciées renvoient {"error":"Série licenciée"} → [].
 */

import { fetchText, postForm, setCurrentSignal, BASE_URL } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, withTimeout, isBudgetExhausted, sortStreamsByLanguage, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { toSlug, normalize, stripSeasonSuffix, resolveTargetEpisodes } from '../utils/dle-extractor.js';

const MAX_SEARCH_TITLES = 6;
const BUDGET_MS = 40000;
const PLAYER_TIMEOUT_MS = 8000;

/** --------------------------------------------------------------------------
 * Recherche
 * -------------------------------------------------------------------------- */

function scoreSearchResult(result, query, season) {
    const q = normalize(query);
    const t = normalize(result.title);
    if (!q || !t) return 0;
    let score = 0;
    if (t === q) score += 100;
    else if (t.includes(q) || q.includes(t)) score += 60;

    const qWords = q.split(/\s+/).filter(w => w.length > 2);
    const tWords = t.split(/\s+/);
    for (const w of qWords) {
        if (tWords.includes(w)) score += 12;
    }
    // Pénalités selon le format (pour une série TV, éviter OAV/OST/Film)
    const fmt = (result.format || '').toUpperCase();
    if (fmt === 'OAV' || fmt === 'OST') score -= 25;
    if (fmt === 'FILM') score -= 10;

    // Bonus/malus de saison : privilégier la page de la saison demandée
    // (ex: "Zero no tsukaima (saison 2)" doit gagner pour une requête S2)
    const targetSeason = parseInt(season, 10);
    if (Number.isFinite(targetSeason)) {
        const sm = (result.title || '').match(/saison\s*(\d+)/i);
        if (sm) {
            score += (parseInt(sm[1], 10) === targetSeason) ? 50 : -20;
        }
    }
    return score;
}

async function searchSite(query, signal) {
    try {
        const data = await withTimeout(
            postForm(`${BASE_URL}/MenuSearch.html`, `search=${encodeURIComponent(query)}`, { signal }),
            PLAYER_TIMEOUT_MS,
            `search ${query.slice(0, 30)}`
        );
        if (!Array.isArray(data)) return [];
        return data.map(r => ({
            title: (r.title || '').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim(),
            url: r.url || '',
            type: r.type || '',
            format: r.format || '',
            number: r.number || ''
        })).filter(r => r.url && r.title);
    } catch (e) {
        return [];
    }
}

/** --------------------------------------------------------------------------
 * Pages
 * -------------------------------------------------------------------------- */

async function fetchSeriesPage(url, signal) {
    const html = await fetchText(url, { signal });
    const $ = cheerio.load(html);

    const serieMatch = html.match(/data-serie="(\d+)"/);
    const serieId = serieMatch ? serieMatch[1] : null;

    // data-focus directement sur la page (cas film / page unique)
    const focusMatch = html.match(/data-focus="(\d+)"/);
    const directFocus = focusMatch ? focusMatch[1] : null;

    // Liens d'épisodes : href relatif "Titre-streaming-Episode-XX-(vostfr|vf)-par-Fansub.html"
    const epLinks = [];
    $('a[href]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/Episode-(\d+)-(vostfr|vf)-par-([^".]+)\.html/i);
        if (m) {
            epLinks.push({ href, num: parseInt(m[1], 10), lang: m[2].toLowerCase(), fansub: m[3] });
        }
    });
    // Dédoublonner
    const seen = new Set();
    const unique = [];
    for (const l of epLinks) {
        const key = `${l.num}-${l.lang}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(l);
    }

    return { serieId, directFocus, epLinks: unique };
}

async function fetchEpisodeFocus(url, signal) {
    const html = await fetchText(url, { signal });
    const m = html.match(/data-focus="(\d+)"/);
    return m ? m[1] : null;
}

/** --------------------------------------------------------------------------
 * Player API
 * -------------------------------------------------------------------------- */

async function fetchPlayer(serieId, focusFile, signal) {
    const data = await withTimeout(
        postForm(`${BASE_URL}/VideoPlayer.html`, `idserie=${serieId}&focusFile=${focusFile}`, { signal }),
        PLAYER_TIMEOUT_MS,
        `player ${serieId}/${focusFile}`
    );
    if (data && data.error) {
        console.warn(`[Anime-Ultime] Player error: ${data.error}`);
        // Marqueur "série licenciée" : la série principale existe mais est bloquée par le site.
        if (typeof data.error === 'string' && data.error.toLowerCase().includes('licenci')) {
            return { __licensed: true };
        }
        return null;
    }
    return data;
}

function extractMp4Url(data) {
    if (!data || typeof data !== 'object') return null;
    const q = data.quality || Object.keys(data).find(k => /^\d+p$/.test(k));
    if (!q) return null;
    const mp4 = data[q] && data[q].mp4;
    if (!mp4 || !mp4.url) return null;
    return { url: mp4.url, quality: q };
}

function findPlaylistEntry(playlist, targetNums) {
    if (!Array.isArray(playlist)) return null;
    for (const num of targetNums) {
        const byTitle = playlist.find(p => {
            const m = (p.title || '').match(/(\d+)/);
            return m && parseInt(m[1], 10) === num;
        });
        if (byTitle) return byTitle;
    }
    return null;
}

/** --------------------------------------------------------------------------
 * Résolution d'une série (tous les épisodes candidats d'une langue)
 * -------------------------------------------------------------------------- */

async function resolveSeries(page, mediaType, episodeNums, lang, signal, startTime) {
    if (!page.serieId) return [];

    // Cas film : la page série porte directement data-focus, sinon premier lien
    if (mediaType === 'movie') {
        const focus = page.directFocus
            || (page.epLinks.length > 0 ? await fetchEpisodeFocus(BASE_URL + '/' + page.epLinks[0].href, signal) : null);
        if (!focus) return { streams: [], licensed: false };
        const player = await fetchPlayer(page.serieId, focus, signal);
        if (player && player.__licensed) return { streams: [], licensed: true };
        const mp4 = extractMp4Url(player);
        if (mp4) {
            // Label selon la langue réelle du lien (VF ou VOSTFR)
            const filmLang = page.epLinks.length > 0 ? page.epLinks[0].lang : 'vf';
            const stream = await buildStream(player, mp4, filmLang, startTime);
            return { streams: stream ? [stream] : [], licensed: false };
        }
        return { streams: [], licensed: false };
    }

    // --- TV : utiliser la playlist API pour couvrir TOUS les épisodes ---
    // Ancre : épisode cible si le lien existe (langue), sinon premier lien de la langue
    const anchorLink = page.epLinks.find(l => episodeNums.includes(l.num) && l.lang === lang)
              || page.epLinks.find(l => episodeNums.includes(l.num))
              || page.epLinks.find(l => l.lang === lang)
              || page.epLinks[0];
    if (!anchorLink) return { streams: [], licensed: false };

    const focus = await fetchEpisodeFocus(BASE_URL + '/' + anchorLink.href, signal);
    if (!focus) return { streams: [], licensed: false };

    const player = await fetchPlayer(page.serieId, focus, signal);
    if (player && player.__licensed) return { streams: [], licensed: true };
    if (!player) return { streams: [], licensed: false };

    const playlist = Array.isArray(player.playlist) ? player.playlist : [];
    const mp4 = extractMp4Url(player);

    const streams = [];

    // Helper: push seulement les streams valides (jamais null).
    // Label = langue réelle de l'ancre quand elle EST la cible (évite le mislabel
    // quand le fallback #2 retombe sur un épisode d'une autre langue).
    const pushIfValid = async (p, m, labelLang) => {
        if (!m) return;
        const s = await buildStream(p, m, labelLang || lang, startTime);
        if (s) streams.push(s);
    };

    // Si l'ancre EST l'épisode cible, l'URL du 1er POST suffit
    const isAnchorTarget = episodeNums.includes(anchorLink.num);
    if (isAnchorTarget) {
        await pushIfValid(player, mp4, anchorLink.lang);
    }

    // Sinon (ou en plus), chercher l'épisode cible dans la playlist et faire un 2e POST
    if (episodeNums.length > 0 && (!isAnchorTarget || streams.length === 0)) {
        const targetEntry = findPlaylistEntry(playlist, episodeNums);
        if (targetEntry && targetEntry.id) {
            const targetPlayer = await fetchPlayer(page.serieId, targetEntry.id, signal);
            await pushIfValid(targetPlayer, extractMp4Url(targetPlayer));
        }
    }

    return { streams, licensed: false };
}

async function buildStream(player, mp4, lang, startTime) {
    if (isBudgetExhausted(startTime, BUDGET_MS)) return null;
    const quality = mp4.quality || player.quality || 'HD';
    const title = player.title ? `${player.title} - ${lang.toUpperCase()}` : `Anime-Ultime ${lang.toUpperCase()}`;
    // L'URL CDN n'a pas d'extension (strhq-fr.anime-ultime.net/TOKEN/TIMESTAMP%2FHASH).
    // Ajouter ?v=.mp4 (accepté par le CDN, vérifié HTTP 206) pour que resolveStream
    // la classe comme mp4 direct sans tenter de parser le binaire comme HTML.
    const url = (mp4.url.includes('?') ? mp4.url + '&' : mp4.url + '?') + 'v=.mp4';
    try {
        const stream = await withTimeout(
            resolveStream({
                name: `Anime-Ultime (${lang.toUpperCase()})`,
                title,
                url,
                quality,
                headers: { "Referer": BASE_URL + "/" }
            }),
            PLAYER_TIMEOUT_MS,
            `AnimeUltime stream ${lang}`
        );
        return stream;
    } catch (e) {
        return null;
    }
}

/** --------------------------------------------------------------------------
 * Extraction principale
 * -------------------------------------------------------------------------- */

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
    const startTime = Date.now();

    // ArmSync : épisode absolu en complément de l'épisode local
    // NB: nombres (pas strings) car les ids playlist du site et num d'épisodes sont numériques
    const targetEpisodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: BUDGET_MS });
    const episodeNums = targetEpisodes.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0);
    const lang = options.lang || null;

    // Ordre des langues : VOSTFR par défaut, VF ensuite (sauf demande explicite)
    const langOrder = lang ? [lang] : (mediaType === 'movie' ? ['vf'] : ['vostfr', 'vf']);

    // Dédupliquer les variantes de saison ("Titre Season 1"/"Titre S1"...) pour
    // laisser la place aux titres alternatifs réels (romaji/FR) dans le top N.
    // Sans ça, une série anglophone peut avoir ses 4 premiers titres = variantes
    // du même titre anglais, masquant le titre romaji utilisé par le site.
    const seenBase = new Set();
    const searchTitles = [];
    for (const t of titles) {
        const base = stripSeasonSuffix(t).toLowerCase();
        if (seenBase.has(base)) continue;
        seenBase.add(base);
        searchTitles.push(t);
    }
    const titlePool = searchTitles.length > 0 ? searchTitles : titles;

    const streams = [];
    const seenUrls = new Set();

    for (const title of titlePool.slice(0, MAX_SEARCH_TITLES)) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        if (streams.length > 0) break;

        const found = await findSeriesForTitle(title, mediaType, effectiveSeason, signal, startTime);
        if (!found) continue;

        for (const l of langOrder) {
            if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
            const resolved = await resolveSeries(found.page, mediaType, episodeNums, l, signal, startTime);
            // Série licenciée : la série principale est bloquée par le site.
            // Ne pas enchaîner sur des titres alternatifs (risque de faux positif).
            if (resolved && resolved.licensed) {
                console.warn(`[Anime-Ultime] Licensed series matched ("${title}"), skipping alt titles`);
                return [];
            }
            const list = (resolved && resolved.streams) || [];
            for (const s of list) {
                if (s && s.url && !seenUrls.has(s.url)) {
                    seenUrls.add(s.url);
                    streams.push(s);
                }
            }
            if (streams.length > 0) break;
        }
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[Anime-Ultime] Total streams found: ${validStreams.length}`);
    return sortStreamsByLanguage(validStreams);
}

/**
 * Trouve l'URL de la série pour un titre (recherche + probes de slugs en fallback).
 */
async function findSeriesForTitle(title, mediaType, season, signal, startTime) {
    // 1) MenuSearch (retourne des JSON ciblés)
    const results = await searchSite(title, signal);
    const scored = results.map(r => ({ ...r, score: scoreSearchResult(r, title, season) }))
        .sort((a, b) => b.score - a.score);
    for (const r of scored) {
        if (r.score < 40) continue;
        // Pour une série TV, exclure OST/OAV/Film (faux positifs type OST "One Piece")
        const fmt = (r.format || '').toUpperCase();
        if (mediaType === 'tv' && (fmt === 'OST' || fmt === 'OAV' || fmt === 'FILM')) continue;
        if (mediaType === 'movie' && fmt !== 'FILM' && fmt !== 'EPISODE') continue;
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        try {
            const pageUrl = r.url.startsWith('http') ? r.url : BASE_URL + r.url;
            const page = await fetchSeriesPage(pageUrl, signal);
            if (page.serieId) return { page };
        } catch (e) { /* page suivante */ }
    }

    // 2) Fallback : probes de slugs générés (séries absentes de MenuSearch)
    //    Le site découpe les saisons en pages séparées (Titre-saison-N-streaming.html)
    if (!isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const slug = toSlug(title);
        if (slug) {
            const seasonNum = parseInt(season, 10);
            const candidates = [
                `${slug}-streaming.html`,
                `${slug}-saison-1-streaming.html`
            ];
            if (seasonNum > 1) {
                candidates.push(`${slug}-saison-${seasonNum}-streaming.html`);
                candidates.push(`${slug}-${seasonNum}-streaming.html`);
            }
            for (const cand of candidates) {
                const url = `${BASE_URL}/${cand}`;
                try {
                    const page = await fetchSeriesPage(url, signal);
                    if (page.serieId) return { page };
                } catch (e) { /* slug suivant */ }
            }
        }
    }

    return null;
}
