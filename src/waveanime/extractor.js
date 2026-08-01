/**
 * Extractor for WaveAnime (waveanime.fr)
 * SPA React + API REST publique :
 *   1. GET /api/series?query=X        → recherche (JSON)
 *   2. GET /api/series/:id            → détail série + episodes[] à la racine
 *   3. GET /playback/:epId/manifest.mpd → manifest DASH (public, sans auth)
 *
 * Format DASH : ExoPlayer/Media3 (Android) lit .mpd nativement (Util.inferContentType
 * → DashMediaSource). Le provider renvoie donc l'URL du manifest avec type:'dash'.
 * NB: AVPlayer (iOS) ne lit PAS le DASH → provider limité à Android.
 */

import { fetchJson, fetchText, setCurrentSignal } from './http.js';
import { isBudgetExhausted, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { normalize } from '../utils/dle-extractor.js';

const BASE_URL = "https://waveanime.fr";
const BUDGET_MS = 45000;
const MAX_SEARCH_TITLES = 6;
// Les épisodes récents (created_timestamp >= ce seuil) utilisent le code langue "fra"
// dans les URLs de sous-titres ASS, les plus anciens utilisent "fr" (déterminé par le
// bundle JS du site : `created_timestamp >= 1777804042435 ? "fra" : "fr"`)
const SUBTITLE_LANG_THRESHOLD = 1777804042435;

/** --------------------------------------------------------------------------
 * Recherche & matching
 * -------------------------------------------------------------------------- */

function scoreSearchResult(result, query) {
    const q = normalize(query);
    const t = normalize(result.title || '');
    if (!q || !t) return 0;
    let score = 0;
    if (t === q) score += 100;
    else if (t.includes(q) || q.includes(t)) score += 60;

    const qWords = q.split(/\s+/).filter(w => w.length > 2);
    const tWords = t.split(/\s+/);
    for (const w of qWords) {
        if (tWords.includes(w)) score += 12;
    }
    return score;
}

async function searchSite(query, signal) {
    try {
        const data = await fetchJson(`${BASE_URL}/api/series?query=${encodeURIComponent(query)}`, { signal });
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

/**
 * Catalogue complet (le site n'a que ~80 entrées, limit max = 100).
 * Utilisé en fallback quand la recherche par titre ne remonte rien.
 */
async function fetchCatalog(signal) {
    try {
        const data = await fetchJson(`${BASE_URL}/api/series?limit=100`, { signal });
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

async function fetchSerieDetail(id, signal) {
    try {
        return await fetchJson(`${BASE_URL}/api/series/${id}`, { signal });
    } catch (e) {
        return null;
    }
}

/** --------------------------------------------------------------------------
 * Résolution épisode
 * -------------------------------------------------------------------------- */

function findEpisode(serieData, mediaType, season, episode) {
    if (!serieData || !Array.isArray(serieData.episodes)) return null;
    const eps = serieData.episodes;
    if (mediaType === 'movie') {
        return eps.find(e => e.number === 1) || eps[0] || null;
    }
    const s = parseInt(season, 10) || 1;
    const e = parseInt(episode, 10) || 1;
    return eps.find(ep => ep.season_number === s && ep.number === e) || null;
}

/**
 * Fallback de numérotation continue pour les entrées 'kai' (saisons regroupées :
 * tous les épisodes du site sont en season_number=1, numérotés 1..N).
 * Ex: TMDB SAO S2E1 = épisode continu n°(nb_eps_S1 + 1).
 *
 * Gardes anti-faux-positifs (échec silencieux → null si doute) :
 *  1. Uniquement pour S>1 (S1 est déjà couvert par le match exact) et si TMDB
 *     fournit le comptage par saison (sinon impossible de calculer l'offset).
 *  2. Tous les épisodes du site doivent être en season 1 ET numérotés
 *     strictement 1..N sans doublon ni trou (sinon la numérotation n'est pas
 *     fiable, ex: entrée AOT avec des doublons [DEV]/[STABLE]).
 *  3. Le comptage TMDB doit être complet pour TOUTES les saisons 1..S-1.
 *  4. Le numéro continu calculé doit exister côté site (1..maxN).
 */
export function findEpisodeContinuous(serieData, seasonCounts, season, episode) {
    if (!serieData || !Array.isArray(serieData.episodes)) return null;
    const s = parseInt(season, 10) || 1;
    const e = parseInt(episode, 10) || 1;
    if (s <= 1 || !seasonCounts) return null;

    const eps = serieData.episodes;

    // Garde 2 : tous en season 1, numérotation stricte 1..N sans doublon/trou
    const numbers = [];
    for (const ep of eps) {
        if (ep.season_number !== 1 || typeof ep.number !== 'number' || !Number.isInteger(ep.number) || ep.number < 1) {
            return null;
        }
        numbers.push(ep.number);
    }
    numbers.sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
        if (numbers[i] !== i + 1) return null;
    }
    const maxN = numbers.length;
    if (maxN < 1) return null;

    // Garde 3 : offset TMDB complet pour toutes les saisons précédentes
    let offset = 0;
    for (let i = 1; i < s; i++) {
        const c = seasonCounts[i];
        if (!c || c <= 0) return null;
        offset += c;
    }
    const continuous = offset + e;

    // Garde 4 : l'épisode continu doit exister côté site
    if (continuous < 1 || continuous > maxN) return null;

    return eps.find(ep => ep.number === continuous) || null;
}

/** --------------------------------------------------------------------------
 * Sous-titres ASS → WebVTT
 *
 * Le site ne sert que des ASS (pas de pistes text dans le MPD). Or ASS n'est pas
 * rendu nativement par AVPlayer (iOS) — ExoPlayer/Media3 Android l'est via son
 * SsaParser, mais pas iOS. Stratégie retenue : le provider fetch l'ASS, le convertit
 * en WebVTT (pur JS, sans dépendance) et renvoie une **data URI**
 * (`data:text/vtt;charset=utf-8,...`) au lieu de l'URL ASS.
 *
 * Pourquoi pas un proxy HTTP : en runtime QuickJS le provider ne peut pas héberger
 * de serveur et le player fetch lui-même les URLs de sous-titres → seul un format
 * auto-contenu (data URI) est livrable. ExoPlayer lit les data URIs via son
 * DataSchemeDataSource ; AVPlayer à confirmer en Plugin Tester.
 * -------------------------------------------------------------------------- */

/**
 * Convertit un timestamp ASS (H:MM:SS.cc — centièmes) en timestamp WebVTT
 * (HH:MM:SS.mmm). Retourne null si le format est invalide.
 */
function assTimeToVttTime(t) {
    const m = /^(\d+):(\d{1,2}):(\d{1,2})[.](\d{1,2})$/.exec(t);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const s = parseInt(m[3], 10);
    const totalMs = ((h * 3600 + min * 60 + s) * 1000) + (parseInt(m[4], 10) * 10);
    const hh = String(Math.floor(totalMs / 3600000)).padStart(2, '0');
    const mm = String(Math.floor((totalMs % 3600000) / 60000)).padStart(2, '0');
    const ss = String(Math.floor((totalMs % 60000) / 1000)).padStart(2, '0');
    const mmm = String(totalMs % 1000).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${mmm}`;
}

/**
 * Nettoie le texte ASS pour WebVTT :
 *  - \\N / \\n → saut de ligne (\n)
 *  - \\h → espace dure (espace)
 *  - blocs d'overrides `{...}` : \i1/\i0, \b1/\b0, \u1/\u0 → tags <i>/<b>/<u>,
 *    les autres (pos, fad, t, ...) sont supprimés
 */
function assTextToVtt(text) {
    if (!text) return '';
    let t = text
        .replace(/\\[Nn]/g, '\n')
        .replace(/\\h/g, ' ');
    t = t.replace(/\{([^}]*)\}/g, (block, inner) => {
        let out = '';
        const re = /\\([ibu])([01])/g;
        let m;
        while ((m = re.exec(inner)) !== null) {
            out += m[2] === '1' ? `<${m[1]}>` : `</${m[1]}>`;
        }
        return out;
    });
    // Supprime tout résidu de crochets d'overrides (pos, fad, alpha, ...)
    t = t.replace(/[{}]/g, '');
    // Tags fermants orphelins en tête de texte (ex: le style ASS est en italique et
    // le dialogue commence par {\i0\b0} pour le désactiver → `</i></b>` sans ouverture).
    // Les parsers WebVTT les ignorent, mais on les nettoie pour la propreté.
    t = t.replace(/^(<\/[ibu]>)+/, '');
    // Échappement HTML du texte restant : un `<` ou `&` littéral (rare dans des
    // dialogues FR) serait interprété comme tag/référence de caractère par le
    // parseur WebVTT. On échappe `&` d'abord, puis `<` sauf s'il débute un de nos
    // propres tags <i>/<b>/<u> déjà injectés.
    t = t.replace(/&/g, '&amp;');
    t = t.replace(/<(?!\/?(?:i|b|u)>)/g, '&lt;');
    return t.replace(/\s+$/g, '');
}

/**
 * Convertit un contenu ASS complet en WebVTT.
 * Ne traite que les lignes `Dialogue:` (Layer,Start,End,Style,Name,M1,M2,M3,Effect,Text
 * — le texte peut contenir des virgules, on découpe sur les 9 premières).
 * Retourne null si aucun cue valide.
 */
function assToVtt(ass) {
    if (!ass || typeof ass !== 'string') return null;
    const lines = ass.split(/\r?\n/);
    const cues = [];
    for (const line of lines) {
        if (!line.startsWith('Dialogue:')) continue;
        const body = line.slice('Dialogue:'.length).trim();
        const commaIdx = [];
        let idx = -1;
        for (let i = 0; i < 9; i++) {
            idx = body.indexOf(',', idx + 1);
            if (idx === -1) break;
            commaIdx.push(idx);
        }
        if (commaIdx.length < 9) continue;
        const fields = [];
        let start = 0;
        for (let i = 0; i < 9; i++) {
            fields.push(body.slice(start, commaIdx[i]));
            start = commaIdx[i] + 1;
        }
        const startVtt = assTimeToVttTime(fields[1]);
        const endVtt = assTimeToVttTime(fields[2]);
        const text = assTextToVtt(body.slice(start));
        if (!startVtt || !endVtt || !text) continue;
        cues.push(`${startVtt} --> ${endVtt}\n${text}`);
    }
    if (cues.length === 0) return null;
    return 'WEBVTT\n\n' + cues.join('\n\n') + '\n';
}

/** Encapsule un VTT dans une data URI (encodeURIComponent est disponible en QuickJS). */
function vttToDataUri(vtt) {
    return 'data:text/vtt;charset=utf-8,' + encodeURIComponent(vtt);
}

/**
 * Récupère les métadonnées complètes d'un épisode (subtitles, audios, durée).
 * Les épisodes du détail série n'exposent pas `subtitles` — il faut le fetch dédié,
 * comme le fait le bundle JS du site (GET /api/episodes/:id).
 */
async function fetchEpisodeMeta(epId, signal) {
    try {
        return await fetchJson(`${BASE_URL}/api/episodes/${epId}`, { signal });
    } catch (e) {
        return null;
    }
}

/**
 * Construit les pistes de sous-titres (fra_full / fra_forced) au format attendu par
 * le runtime NuvioMobile (PluginRuntime.parseJsonResults) :
 * `[{ url, language, name, headers }]`. L'ASS est fetché et converti en WebVTT
 * (data URI) ; si la conversion échoue, l'URL ASS d'origine est gardée en fallback
 * (les headers Referer/Origin permettent au player de re-fetcher l'ASS).
 * Format d'URL ASS (extrait du bundle JS du site) :
 *   /playback/subtitles/{epId}-{lang}-{full|forced}.ass
 * avec lang = 'fra' pour les épisodes récents, 'fr' pour les anciens.
 */
async function buildSubtitles(epMeta, epId, signal) {
    if (!epMeta || !epMeta.subtitles) return [];
    const lang = (epMeta.created_timestamp || 0) >= SUBTITLE_LANG_THRESHOLD ? 'fra' : 'fr';
    const subtitles = [];
    const tracks = [
        { key: 'fra_full', flag: 'full', label: 'Français' },
        { key: 'fra_forced', flag: 'forced', label: 'Français (forced)' },
    ];
    for (const track of tracks) {
        if (!epMeta.subtitles[track.key]) continue;
        // Sortie propre si abort pendant la conversion (les subs déjà construits
        // restent livrés, le stream est déjà garanti par le garde d'appel)
        if (isAborted(signal)) return subtitles;
        const assUrl = `${BASE_URL}/playback/subtitles/${epId}-${lang}-${track.flag}.ass`;
        let url = assUrl;
        try {
            const assText = await fetchText(assUrl, { signal });
            const vtt = assToVtt(assText);
            if (vtt) url = vttToDataUri(vtt);
        } catch (e) {
            // fallback : garder l'URL ASS d'origine
        }
        // Format NuvioMobile : url + language (ISO 639-2) + name + headers par piste.
        // `language: 'fra'` est lu tel quel (défaut "Unknown" si absent) — l'ancien
        // format { id, url, lang, label } était ignoré (lang/label non reconnus).
        subtitles.push({
            url,
            language: 'fra',
            name: track.label,
            headers: {
                'Referer': `${BASE_URL}/`,
                'Origin': BASE_URL,
            },
        });
    }
    return subtitles;
}

/** --------------------------------------------------------------------------
 * Qualité depuis le manifest DASH
 * -------------------------------------------------------------------------- */

async function parseMpdQuality(manifestUrl, signal) {
    try {
        const text = await fetchText(manifestUrl, { signal });
        // Extraire toutes les hauteurs vidéo (width/height sur les Representations)
        let maxH = 0;
        const re = /height="(\d+)"/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const h = parseInt(m[1], 10);
            if (h > maxH) maxH = h;
        }
        if (maxH >= 2160) return '2160p';
        if (maxH >= 1080) return '1080p';
        if (maxH >= 720) return '720p';
        if (maxH >= 480) return '480p';
        if (maxH > 0) return `${maxH}p`;
        return 'HD';
    } catch (e) {
        return 'HD';
    }
}

/** --------------------------------------------------------------------------
 * Extraction principale
 * -------------------------------------------------------------------------- */

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);
    const startTime = Date.now();

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    // Formats acceptés : 'serie' (classique) et 'kai' (séries à saisons regroupées,
    // ex: Frieren, HxH, SAO, Fairy Tail, AOT — tous les épisodes en season 1).
    // Pour les entrées 'kai', un fallback de numérotation continue (TMDB S2E1 =
    // épisode n°(nb_eps_S1 + 1)) gère les saisons au-delà de S1 si le site un jour
    // contient plus d'épisodes que la saison 1 TMDB. NB: sur le catalogue actuel
    // aucun kai ne dépasse la S1 TMDB (Fairy Tail: 37 eps < S1=48) → fallback
    // préventif/future-proof, validé par tests synthétiques uniquement.
    const wantedFormats = mediaType === 'movie' ? ['movie'] : ['serie', 'kai'];

    // 1) Recherche par titre (les titres TMDB FR/EN/romaji sont essayés)
    let serie = null;
    const seenIds = new Set();
    for (const title of titles.slice(0, MAX_SEARCH_TITLES)) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        if (!title || title.length < 3) continue;

        const results = await searchSite(title, signal);
        const scored = results
            .filter(r => wantedFormats.includes(r.format) && !seenIds.has(r.id))
            .map(r => ({ ...r, score: scoreSearchResult(r, title) }))
            .sort((a, b) => b.score - a.score);

        for (const r of scored) {
            if (r.score < 40) continue;
            seenIds.add(r.id);
            serie = r;
            break;
        }
        if (serie) break;
    }

    // 2) Fallback : scan du catalogue complet (petit, ~80 entrées)
    if (!serie && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const catalog = await fetchCatalog(signal);
        let best = null;
        for (const r of catalog) {
            if (!wantedFormats.includes(r.format)) continue;
            let bestScore = 0;
            for (const t of titles) {
                const sc = scoreSearchResult(r, t);
                if (sc > bestScore) bestScore = sc;
            }
            if (bestScore > 40 && (!best || bestScore > best.score)) {
                best = { ...r, score: bestScore };
            }
        }
        if (best) serie = best;
    }

    if (!serie) return [];

    const detail = await fetchSerieDetail(serie.id, signal);
    let ep = findEpisode(detail, mediaType, season, episode);

    // Fallback numérotation continue (uniquement entrées 'kai', S>1, match exact raté)
    let usedContinuous = false;
    if (!ep && mediaType === 'tv' && serie.format === 'kai' && !isAborted(signal)) {
        const seasonCounts = titles._metadata && titles._metadata.seasonEpisodeCounts;
        ep = findEpisodeContinuous(detail, seasonCounts, season, episode);
        usedContinuous = !!ep;
    }
    if (!ep || !ep.id) return [];

    const manifestUrl = `${BASE_URL}/playback/${ep.id}/manifest.mpd`;
    const quality = await parseMpdQuality(manifestUrl, signal);

    // Sous-titres ASS → WebVTT (data URI) — fetch dédié épisode + conversion
    // (gardé par le budget/abort pour rester cohérent avec le reste du pipeline)
    let subtitles = [];
    if (!isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const epMeta = await fetchEpisodeMeta(ep.id, signal);
        subtitles = await buildSubtitles(epMeta, ep.id, signal);
    }

    // Le label affiche la saison/épisode demandée (S2E1) plutôt que la numérotation
    // interne du site (S1E27) quand le fallback continu est utilisé
    const epLabel = mediaType === 'movie' ? '' : ` S${usedContinuous ? (parseInt(season, 10) || 1) : (ep.season_number || season || 1)}E${usedContinuous ? (parseInt(episode, 10) || 1) : (ep.number || episode || 1)}`;
    const stream = {
        name: 'WaveAnime',
        title: `${serie.title}${epLabel}`,
        url: manifestUrl,
        quality,
        type: 'dash',
        language: 'VOSTFR',
        headers: {
            'Referer': `${BASE_URL}/`,
            'Origin': BASE_URL,
        },
    };
    // Sous-titres externes Stremio-style (additif, ignoré si le runtime ne les lit pas)
    if (subtitles.length > 0) stream.subtitles = subtitles;

    console.log(`[WaveAnime] Stream: ${stream.quality} dash | ${serie.title}${epLabel}${subtitles.length > 0 ? ` | ${subtitles.length} sub(s)` : ''}`);
    return [stream];
}
