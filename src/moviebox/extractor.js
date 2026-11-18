/**
 * Extrait les flux de moviebox01.com (infra Moviebox : aoneroom.com).
 *
 * Chaîne de résolution :
 *   TMDB → titres → recherche signée (API mobile) → fiche (BFF web)
 *   → pistes audio (`dubs`, VF incluse) → `/subject/play` → MP4/HLS/DASH.
 *
 * Les trois blocages historiques et leurs correctifs sont documentés au fil
 * des commentaires : signature HMAC des requêtes mobiles, `se=0&ep=0` pour
 * les films, et Referer du domaine player pour `/subject/play`.
 */

import {
    isAborted,
    isBudgetExhausted,
    normalizeLanguageCode,
} from '../utils/resolvers.js';
import { resolveSeasonEpisodeInputs } from '../utils/dle-extractor.js';
import { getTmdbTitles } from '../utils/metadata.js';
import {
    searchSubjects,
    getDetail,
    getPlay,
    getToken,
    getPlayerDomain,
    getMobileSubject,
    getMobileSeasons,
    getMobilePlay,
} from './http.js';
import {
    BUDGET_MS,
    MAX_SEARCH_QUERIES,
    MAX_AUDIO_TRACKS,
    SITE_ORIGIN,
} from './config.js';

const LANG_PRIORITY = ['fr', 'ja', 'en', 'ko', 'zh'];

// ─── Normalisation & scoring ────────────────────────────────────────────────

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'of', 'and', 'les', 'le', 'la', 'des', 'de', 'du', 'un', 'une',
    'et', 'version', 'francaise', 'française', 'vf', 'vostfr', 'film', 'movie', 'serie', 'série',
    'season', 'saison', 'part', 'partie', 'chapter', 'chapitre',
]);

/** Retire les suffixes éditoriaux du site ("[Version française]", "[Hindi]"…). */
function cleanTitle(raw) {
    let t = String(raw || '');
    t = t.replace(/\[[^\]]*\]/g, ' ');
    t = t.replace(/\([^)]*\)/g, ' ');
    t = t.replace(/\bS\d+(\s*-\s*S\d+)?\b/gi, ' ');
    t = t.replace(/\bSaison\s*\d+\b/gi, ' ');
    return t.replace(/\s+/g, ' ').trim();
}

function normalizeKey(raw) {
    return cleanTitle(raw)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function tokenSet(raw) {
    const out = new Set();
    for (const w of normalizeKey(raw).split(' ')) {
        if (w.length < 2) continue;
        if (STOP_WORDS.has(w)) continue;
        out.add(w);
    }
    return out;
}

function yearOf(value) {
    if (!value) return null;
    const m = String(value).match(/(19|20)\d{2}/);
    return m ? parseInt(m[0], 10) : null;
}

/**
 * Score de correspondance entre un titre TMDB et un résultat du site.
 * Bonus fort aux fiches « Version française » (le provider est FR), année
 * proche, et type cohérent avec la demande.
 */
function scoreItem(item, wantedTitleSets, wantedYear, wantedMovie) {
    const titleTokens = tokenSet(item.title || '');
    if (!titleTokens.size || !wantedTitleSets.length) return 0;

    // On compare chaque titre TMDB séparément : « Coco » doit matcher « Coco
    // [Version française] » même si les titres alternatifs (portugais, slovaque)
    // ajoutent des dizaines de mots sans rapport.
    let best = 0;
    for (const wanted of wantedTitleSets) {
        if (!wanted.size) continue;
        let inter = 0;
        for (const t of wanted) if (titleTokens.has(t)) inter++;
        if (!inter) continue;

        const inWanted = inter / wanted.size;
        const inTitle = inter / titleTokens.size;
        // Tolérance sur le titre (sous-titres, suffixes) mais exigence forte
        // sur la requête : un seul mot commun ne suffit pas.
        if (inWanted < 0.5) continue;

        let score = inWanted * 60 + inTitle * 20;
        best = Math.max(best, score);
    }
    if (!best) return 0;

    let score = best;

    const itemYear = yearOf(item.releaseDate);
    if (wantedYear && itemYear) {
        const diff = Math.abs(itemYear - wantedYear);
        if (diff === 0) score += 18;
        else if (diff === 1) score += 10;
        else if (diff <= 2) score += 4;
        else if (diff > 8) score -= 12;
    }

    // `subjectType` : 1 = film, 2 = série.
    if (typeof item.subjectType === 'number') {
        const itemMovie = item.subjectType === 1;
        if (itemMovie === wantedMovie) score += 12;
        else score -= 20;
    }

    const raw = String(item.title || '').toLowerCase();
    if (/version fran/.test(raw) || /\bvf\b/.test(raw)) score += 14;
    else if (/\[(?!version)[a-z]+\]/.test(raw)) score -= 6; // doublage étranger

    if (item.hasResource === false) score -= 8;
    // Sans `detailUrl`, pas de slug → la fiche n'est pas lisible côté BFF web,
    // et l'API mobile ne sert qu'un extrait de ~23 s (placeholder invité).
    if (detailPathFrom(item)) score += 15;
    else score -= 10;
    return score;
}

function subjectIdOf(item) {
    if (!item) return null;
    if (item.subjectId) return String(item.subjectId);
    // Repli : l'ID est le suffixe du slug (`...-QsPQLm3Iag7`), mais uniquement
    // quand il ressemble à un identifiant (11+ caractères base62).
    const dp = detailPathFrom(item);
    const m = dp && dp.match(/-([A-Za-z0-9]{9,})$/);
    return m ? m[1] : null;
}

function detailPathFrom(item) {
    const url = item && (item.detailUrl || (item.playUrl && item.playUrl.playUrl) || '');
    if (!url) return null;
    const segs = String(url).split('?')[0].split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (!last || last === 'detail' || last === 'movies') return null;
    return last;
}

// ─── Recherche ───────────────────────────────────────────────────────────────

async function rankCandidates({ titles, isMovie, wantedYear, signal }) {
    const queries = [];
    for (const t of titles) {
        const q = cleanTitle(t);
        if (q && q.length > 1 && !queries.includes(q)) queries.push(q);
        if (queries.length >= MAX_SEARCH_QUERIES) break;
    }
    // Variante FR : le catalogue du site est séparé par langue de doublage et
    // les fiches VF ne sortent pas toujours sur le titre TMDB brut.
    const frQueries = queries.slice(0, 2).map(q => `${q} version française`);

    const seen = new Set();
    const candidates = [];
    for (const q of [...queries, ...frQueries]) {
        if (isAborted(signal) || isBudgetExhausted(Date.now(), 0)) break;
        let items = [];
        try {
            items = await searchSubjects(q, { perPage: 12, signal });
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
            console.log(`[MovieBox] recherche « ${q} » : ${e?.message}`);
            continue;
        }
        for (const it of items) {
            if (!it || seen.has(it.subjectId)) continue;
            seen.add(it.subjectId);
            candidates.push(it);
        }
        if (candidates.length >= 40) break;
    }
    if (!candidates.length) return null;

    const wantedTitleSets = titles.map(t => tokenSet(t)).filter(st => st.size);

    const scored = candidates
        .map(it => ({ it, s: scoreItem(it, wantedTitleSets, wantedYear, isMovie) }))
        .filter(x => x.s >= 55)
        .sort((a, b) => b.s - a.s);

    if (!scored.length) {
        console.log(`[MovieBox] aucun candidat convaincant`);
        return [];
    }
    // Les fiches sans slug passent en dernier : seules celles avec `detailUrl`
    // sont lisibles côté web (l'API mobile ne sert qu'un extrait de 23 s).
    // Ne garder que les variantes du MÊME contenu : « Avengers: Endgame » et
    // « Avengers Endgame: Encore » sont deux œuvres distinctes — changer de
    // candidat quand le premier n'a pas de slug servait un mauvais film.
    const bestKey = normalizeKey(cleanTitle(scored[0].it.title));
    const sameWork = scored.filter(x => normalizeKey(cleanTitle(x.it.title)) === bestKey);
    const pool = sameWork.length ? sameWork : [scored[0]];

    const withSlug = pool.filter(x => detailPathFrom(x.it));
    const ordered = withSlug.length
        ? withSlug.concat(pool.filter(x => !detailPathFrom(x.it)))
        : pool;
    return ordered.map(x => ({ item: x.it, score: Math.round(x.s) }));
}

// ─── Pistes audio ────────────────────────────────────────────────────────────

/**
 * Construit la liste des pistes à interroger : VF d'abord, puis la langue
 * originale, puis l'anglais. Chaque piste a son propre `subjectId` — ignorer
 * `dubs` est la cause des « VF qui n'apparaissent pas ».
 */
function buildAudioTracks(subject, primaryId) {
    const tracks = [];
    // Langue originale de la fiche : évite de classer la VO d'un anime en `en`
    // (l'app l'afficherait alors comme une VA anglaise).
    const originLang = String(subject.language || '').toLowerCase().slice(0, 2);
    const push = (id, code, label) => {
        if (!id) return;
        if (tracks.some(t => t.id === String(id))) return;
        tracks.push({ id: String(id), code: (code || '').toLowerCase(), label });
    };

    const dubs = Array.isArray(subject.dubs) ? subject.dubs : [];
    for (const d of dubs) {
        if (!d) continue;
        const code = String(d.lanCode || '').toLowerCase();
        if (code === 'fr') push(d.subjectId, 'fr', 'VF');
    }
    for (const d of dubs) {
        if (!d) continue;
        if (d.original) push(d.subjectId, String(d.lanCode || originLang || '').toLowerCase(), 'VO');
    }
    push(primaryId, originLang, 'VO');
    for (const d of dubs) {
        if (!d) continue;
        const code = String(d.lanCode || '').toLowerCase();
        if (code === 'en') push(d.subjectId, 'en', 'VA');
    }
    for (const d of dubs) {
        if (!d) continue;
        const code = String(d.lanCode || '').toLowerCase();
        if (code === 'ja' || code === 'ko') push(d.subjectId, code, code.toUpperCase());
    }
    return tracks.slice(0, MAX_AUDIO_TRACKS);
}

function languageFor(track) {
    const raw = track.code;
    if (raw === 'fr') return 'fr';
    if (raw === 'en') return 'en';
    if (raw === 'ja') return 'ja';
    if (raw === 'ko') return 'ko';
    // Piste originale sans code exploitable : on laisse `multi` (classée par
    // l'app) plutôt que d'inventer une langue, et le `title` porte le détail.
    const norm = normalizeLanguageCode(raw || '');
    return norm || 'multi';
}

// ─── Construction des streams ────────────────────────────────────────────────

function maxResolution(value) {
    const nums = String(value || '').match(/\d{3,4}/g);
    if (!nums) return null;
    let best = 0;
    for (const n of nums) best = Math.max(best, parseInt(n, 10));
    return best || null;
}

function streamType(format, url) {
    const f = String(format || '').toLowerCase();
    const u = String(url || '').toLowerCase();
    if (f.includes('dash') || u.includes('.mpd')) return 'dash';
    if (f.includes('hls') || f.includes('m3u8') || u.includes('.m3u8')) return 'hls';
    return 'mp4';
}

function captionsToSubtitles(captions) {
    if (!Array.isArray(captions) || !captions.length) return undefined;
    const out = [];
    for (const c of captions) {
        const url = c && (c.url || c.captionUrl);
        if (!url || !/^https?:\/\//.test(url)) continue;
        const code = c.language_code || c.languageCode || c.language || '';
        out.push({
            url,
            language: normalizeLanguageCode(String(code)) || 'Unknown',
            name: c.language || c.languageName || 'Subtitle',
        });
    }
    return out.length ? out : undefined;
}

function buildStreams(playData, { track, seriesName, episodeTag }) {
    if (!playData) return [];
    const out = [];
    const hdrs = { Referer: `${SITE_ORIGIN}/` };

    const add = (entry, fallbackFormat) => {
        if (!entry) return;
        const url = entry.url || entry.playUrl || entry.src;
        if (!url || !/^https?:\/\//.test(url)) return;
        if (entry.vipLocked) return;

        const type = streamType(entry.format || fallbackFormat, url);
        // ⚠ L'API mobile renvoie un EXTRAIT de ~23 s pour les invités (même
        // URL pour tous les titres). C'est exactement le symptôme « le flux ne
        // se lance jamais / ne dure que quelques secondes » : on refuse tout
        // ce qui est trop court pour être un épisode.
        const duration = parseInt(String(entry.duration || 0), 10);
        if (Number.isFinite(duration) && duration > 0 && duration < 120) {
            console.log(`[MovieBox] extrait ignoré (${duration}s)`);
            return;
        }

        const res = maxResolution(entry.resolutions || entry.resolution);
        const quality = res ? `${res}p` : undefined;
        const subtitles = captionsToSubtitles(entry.captions);

        let size;
        const rawSize = entry.size;
        if (rawSize !== undefined && rawSize !== null && rawSize !== '') {
            const bytes = parseInt(String(rawSize), 10);
            if (Number.isFinite(bytes) && bytes > 0) {
                const gb = bytes / (1024 * 1024 * 1024);
                size = gb >= 1 ? `${gb.toFixed(2).replace(/\.?0+$/, '')} GB`
                    : `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
            } else if (/\d+(,\d+)?\s*(TB|GB|MB|KB)/i.test(String(rawSize))) {
                size = String(rawSize);
            }
        }

        const extraHeaders = { ...hdrs };
        if (entry.signCookie) extraHeaders.Cookie = entry.signCookie;
        if (entry.signHeaderKey && entry.signHeaderValue) extraHeaders[entry.signHeaderKey] = entry.signHeaderValue;

        out.push({
            url,
            name: `MovieBox (${track.label}) ${episodeTag}`,
            title: `MovieBox [${track.label}] ${episodeTag} - ${seriesName}${quality ? ` (${quality})` : ''}`,
            language: languageFor(track),
            provider: 'MovieBox',
            type,
            quality,
            size,
            headers: extraHeaders,
            subtitles,
        });
    };

    for (const s of playData.streams || []) add(s, 'MP4');
    for (const s of playData.hls || []) add(s, 'HLS');
    for (const s of playData.dash || []) add(s, 'DASH');
    return out;
}

// ─── Entrée ──────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];

    const t0 = Date.now();
    const isMovie = mediaType === 'movie';

    if (!isMovie) {
        const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, { mediaType: 'tv' });
        season = se.season;
        episode = se.episode;
    }
    const wantedSeason = isMovie ? null : (parseInt(season, 10) || 1);
    const targetEp = isMovie ? 0 : (parseInt(episode, 10) || 1);

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || !titles.length) {
        console.log(`[MovieBox] aucun titre TMDB pour ${tmdbId}`);
        return [];
    }
    console.log(`[MovieBox] titres: ${titles.slice(0, 3).join(', ')}`);

    // Le token est indispensable à la recherche : on l'obtient en amont pour
    // échouer vite (et proprement) si l'API refuse.
    const token = await getToken(signal);
    if (!token) {
        console.log('[MovieBox] token invité indisponible → abandon');
        return [];
    }
    await getPlayerDomain(token, signal);    const wantedYear = null; // getTmdbTitles ne fournit pas l'année fiable
    const ranked = await rankCandidates({ titles, isMovie, wantedYear, signal });
    if (!ranked.length) return [];
    console.log(`[MovieBox] candidats: ${ranked.slice(0, 3).map(c => `${c.item.title}(${c.score})`).join(', ')}`);

    let subject = null;
    let resource = null;
    let h5Token = token;
    let h5Ready = false;
    let detailPath = null;
    let primaryId = '';
    let matchedTitle = '';

    // Le slug "Version française" renvoyé par la recherche mobile est souvent
    // inconnu du BFF web (404) : on essaie les candidats suivants jusqu'à
    // trouver une fiche réellement servie.
    for (const cand of ranked.slice(0, 3)) {
        if (isAborted(signal) || isBudgetExhausted(t0, BUDGET_MS)) break;
        const slug = detailPathFrom(cand.item);
        if (!slug) continue;
        try {
            const detail = await getDetail(slug, { token, signal });
            if (detail && detail.data) {
                subject = detail.data.subject || {};
                resource = detail.data.resource || {};
                h5Token = detail.token || token;
                h5Ready = true;
                detailPath = slug;
                primaryId = String(subject.subjectId || subjectIdOf(cand.item) || '');
                matchedTitle = cand.item.title;
                console.log(`[MovieBox] fiche ${slug}`);
                break;
            }
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
        }
    }

    // Repli API mobile : fiche sans slug. Seuls les vrais fichiers passeront le
    // filtre de durée (l'API invité ne sert qu'un extrait de 23 s).
    if (!subject) {
        const fallback = ranked.map(c => c.item).find(subjectIdOf);
        if (!fallback) {
            console.log('[MovieBox] aucune fiche exploitable');
            return [];
        }
        primaryId = String(subjectIdOf(fallback));
        matchedTitle = fallback.title || '';
        subject = await getMobileSubject(primaryId, { signal });
        if (!subject) {
            console.log('[MovieBox] fiche introuvable (web + mobile)');
            return [];
        }
        console.log('[MovieBox] fiche via API mobile (pas de slug)');
    }

    const seriesName = cleanTitle(subject.title || matchedTitle || titles[0]);
    const episodeTag = isMovie ? 'Film' : `S${wantedSeason}E${targetEp}`;

    // Films : le serveur n'expose la ressource qu'avec se=0&ep=0.
    let se = isMovie ? 0 : wantedSeason;
    let ep = isMovie ? 0 : targetEp;

    // Saisons réellement présentes côté site (évite les saisons fantômes).
    let seasonsSource = (resource && resource.seasons) || [];
    if (!seasonsSource.length && !isMovie) {
        const info = await getMobileSeasons(primaryId, { signal });
        seasonsSource = (info && info.seasons) || [];
    }
    const siteSeasons = seasonsSource
        .map(s => parseInt(s.se, 10))
        .filter(n => Number.isFinite(n));
    if (!isMovie && siteSeasons.length && !siteSeasons.includes(se)) {
        console.log(`[MovieBox] saison ${se} absente du site (${siteSeasons.join(',')})`);
        se = siteSeasons[0];
    }

    const tracks = buildAudioTracks(subject, subject.subjectId || primaryId);
    if (!tracks.length) {
        console.log('[MovieBox] aucune piste audio');
        return [];
    }

    const hasStreams = (p) => !!(p && ((p.streams || []).length || (p.hls || []).length || (p.dash || []).length));

    const streams = [];
    for (const track of tracks) {
        if (isAborted(signal) || isBudgetExhausted(t0, BUDGET_MS)) break;
        try {
            let playData = null;
            if (h5Ready) {
                playData = await getPlay({ detailPath, subjectId: track.id, se, ep }, { token: h5Token, signal });
            }
            if (!hasStreams(playData)) {
                const alt = await getMobilePlay({ subjectId: track.id, se, ep }, { signal });
                if (hasStreams(alt)) playData = alt;
            }
            if (!hasStreams(playData) && h5Ready) {
                const alt = await getMobilePlay({ subjectId: track.id, se, ep }, { signal });
                if (hasStreams(alt)) playData = alt;
            }

            const built = buildStreams(playData, { track, seriesName, episodeTag });
            if (built.length) {
                console.log(`[MovieBox] ✓ ${track.label} ${built.length} flux`);
                streams.push(...built);
            } else {
                console.log(`[MovieBox] ✗ ${track.label} sans flux`);
            }
        } catch (e) {
            if (String(e && e.message).includes('AbortError')) throw e;
            console.log(`[MovieBox] ✗ ${track.label}: ${e?.message}`);
        }
    }

    // Dédup par URL : le site renvoie souvent le MÊME fichier pour la piste
    // VF et la piste originale (doublon strictement inutile dans l'UI).
    const seen = new Set();
    const unique = [];
    for (const s of streams) {
        const key = s.url;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(s);
    }

    console.log(`[MovieBox] ${unique.length} stream(s) (${Date.now() - t0}ms)`);
    return unique;
}
