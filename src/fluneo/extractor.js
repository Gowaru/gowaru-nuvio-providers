/**
 * Extractor for Fluneo (myfluneo.eu)
 *
 * Architecture du site (diagnostic live + archives 2026-09) :
 *  - Next.js App Router, Cloudflare. Selon l'IP/période : challenge managé
 *    sur tout le domaine (403 "Just a moment") — le trafic résidentiel de
 *    l'app passe généralement (snapshots d'archives: 200 la plupart du temps).
 *  - Page anime : /anime/{slug} (slugs avec suffixe -vf pour les VF) —
 *    le payload RSC inline contient TOUS les épisodes :
 *      { id, title, filename, season_number, episode_number,
 *        url: embed principal (vidmoly), embeds_json: '{"LECTEUR myTV": "https://vidmoly.biz/embed-x.html", "LECTEUR VOE": "https://voe.sx/e/x", "LECTEUR Stape": "https://streamtape.com/e/x"}' }
 *  - Épisodes URL : /anime/{slug}/saison-{N}/episode-{N} — la page épisode
 *    n'est PAS nécessaire : tout est dans la page anime.
 *  - Lecteurs : myTV = vidmoly (→ m3u8), VOE = voe.sx, Stape = streamtape —
 *    tous résolus par resolveStream (resolvers.js).
 *  - Recherche : pas d'endpoint JSON confirmé (challenge) → fallback
 *    sitemap/URL directe. Le site est indexé Google : les pages existent.
 */

import { fetchText, fetchPage, isCloudflareChallenge, SITE, HEADERS } from './http.js';
import { resolveStream, normalizeLanguageCode, isAborted, sleep, withTimeout } from '../utils/resolvers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Recherche : candidats de slugs + validation
// ─────────────────────────────────────────────────────────────────────────────

/** Titre normalisé minuscule sans accents (comparaisons) */
function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'no', 'wa', 'to', 'de', 'la', 'le', 'les', 'des', 'du', 'et', 'da', 'season', 'saison', 'part']);

/** Mots significatifs d'un titre (>= 3 chars, hors stop-words) */
function titleWords(title) {
    return norm(title).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Génère les slugs candidats pour une page anime :
 *  - "Solo Leveling" → "solo-leveling"
 *  - "Demon Slayer" (saison 2, VF) → "demon-slayer-saison-2-vf"
 *  - avec/sans "-vf" (les VOSTFR n'ont pas de suffixe, les VF ont "-vf")
 */
function slugCandidates(titles, wantedSeason, isTv) {
    const cands = [];
    const seen = new Set();
    const push = s => { if (s && s.length > 1 && !seen.has(s)) { seen.add(s); cands.push(s); } };

    const primary = norm(titles[0] || '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!primary) return cands;

    // Variantes saison : base, base-saison-N (purement numérique, ex "shangri-la-frontier-s3" n'existe pas)
    const seasonVariants = isTv && wantedSeason != null && wantedSeason > 1
        ? [`-${wantedSeason}`, `-saison-${wantedSeason}`, `-s${wantedSeason}`, '']
        : [''];

    for (const sv of seasonVariants) {
        push(primary + sv);
        push(primary + sv + '-vf');
    }
    return cands;
}

/**
 * Recherche Google-index via safeFetch sur les pages du site : on tente les
 * slugs candidats directement (le payload RSC inline répond même sans search
 * API). La page renvoie 404 → slug invalide.
 */
async function validateSlug(slug, signal) {
    const [html, status, challenge] = await fetchPage(`${SITE}/anime/${slug}`, { signal });
    if (challenge) throw Object.assign(new Error('Cloudflare challenge'), { isChallenge: true });
    if (!html || status === 404) return null;
    return parseAnimePage(html, slug);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing de la page anime (payload RSC inline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse le payload RSC de la page anime et extrait les épisodes.
 * ⚠️ Le payload est DOUBLEMENT ÉCHAPPÉ dans le HTML (\\\"episodes\\\" etc.) —
 * on déséchappe localement puis on parse par regex les objets épisodes
 * (id, title, filename, season_number, episode_number, url, embeds_json).
 */
export function parseAnimePage(html, slug) {
    // Le payload RSC est doublement échappé dans le HTML (\"id\" → 2 backslashes
    // avant certaines quotes). Normalisation locale en 2 passes :
    //   \\\\ → \\  puis  \\" → "  — ce qui aplatit 1 et 2 couches d'échappement
    // tout en laissant exactement 1 couche sur le contenu de embeds_json
    // (nécessaire au JSON.parse ultérieur).
    const flat = html.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
    const episodes = [];
    const epRe = /\{"id":(\d+),"title":"((?:[^"\\]|\\.)*)","filename":"((?:[^"\\]|\\.)*)","season_number":([\d.]+),"episode_number":([\d.]+)(?:,"duration":(\d+))?(?:,"thumbnail":(null|[^,{}]*))?(?:,"url":"([^"]*)")?(?:,"embeds_json":"((?:[^"\\]|\\.)*)")?/g;
    let m;
    while ((m = epRe.exec(flat)) !== null) {
        const [, id, title, filename, season, episode, , , url, embedsJson] = m;
        episodes.push({
            id,
            title: title || '',
            filename: filename || '',
            seasonNumber: parseFloat(season),
            episodeNumber: parseFloat(episode),
            url: url || null,
            // embeds_json garde 1 couche d'échappement → déballage JSON string
            embedsJson: embedsJson ? safeUnwrapJsonString(embedsJson) : null
        });
    }
    // Titre de l'anime : <title>X en Streaming VF/VOSTFR | Fluneo</title>
    const tm = html.match(/<title>(.*?)\s+en Streaming VF\/VOSTFR \| Fluneo<\/title>/);
    const animeTitle = tm ? tm[1] : slug;
    return { slug, title: animeTitle, episodes };
}

/** Déballe une string JSON échappée (ex: {\"a\":\"b\"} → {"a":"b"}) sans lever */
function safeUnwrapJsonString(s) {
    try {
        const v = JSON.parse('"' + s + '"');
        return typeof v === 'string' ? v : null;
    } catch (e) {
        return null;
    }
}

/** Parse embeds_json → [{ label, url }] trié par priorité (myTV > VOE > Stape) */
export function parseEmbedsJson(embedsJson) {
    if (!embedsJson) return [];
    try {
        const obj = JSON.parse(embedsJson);
        const order = ['mytv', 'voe', 'stape', 'streamtape', 'vidmoly', 'uqload', 'sendvid', 'sibnet', 'filemoon', 'oneupload'];
        return Object.entries(obj)
            .map(([label, url]) => ({ label, url: String(url || '').trim() }))
            .filter(e => /^https?:\/\//.test(e.url))
            .sort((a, b) => {
                const la = a.label.toLowerCase(), lb = b.label.toLowerCase();
                const pa = order.findIndex(k => la.includes(k));
                const pb = order.findIndex(k => lb.includes(k));
                return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
            });
    } catch (e) {
        return [];
    }
}

/** Étiquette lisible du lecteur depuis son domaine */
function playerLabel(url) {
    const u = String(url || '').toLowerCase();
    if (u.includes('vidmoly')) return 'VidMoly';
    if (u.includes('voe')) return 'VOE';
    if (u.includes('streamtape') || u.includes('stape')) return 'Streamtape';
    if (u.includes('sibnet')) return 'Sibnet';
    if (u.includes('sendvid')) return 'SendVid';
    if (u.includes('filemoon') || u.includes('moonplayer')) return 'FileMoon';
    if (u.includes('uqload')) return 'Uqload';
    if (u.includes('oneupload')) return 'OneUpload';
    if (u.includes('dood')) return 'Dood';
    if (u.includes('mp4upload')) return 'MP4Upload';
    if (u.includes('myvi.')) return 'MyTV';
    const m = u.match(/^https?:\/\/([^/]+)/);
    return m ? m[1].replace(/^www\./, '') : 'Lecteur';
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée de l'extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Point d'entrée de l'extraction.
 * @returns {Promise<Array<object>>} streams bruts (passés à resolveStream par createProvider)
 */
export async function extractStreams(tmdbId, mediaType, season, episode, { signal } = {}) {
    // ⚠️ Normalisation mediaType (Nuvio passe 'series', pas 'tv')
    const isTv = mediaType === 'tv' || mediaType === 'series';
    const wantedSeason = isTv ? parseInt(season, 10) || 1 : null;
    const wantedEpisode = isTv ? parseFloat(episode) : null;

    console.log(`[Fluneo] Extraction ${mediaType} ${tmdbId}` +
        (wantedSeason != null ? ` S${wantedSeason}E${wantedEpisode}` : ''));

    // 1. Titres TMDB (cache + variants saison)
    let titles;
    try {
        const mod = await import('../utils/metadata.js');
        titles = await mod.getTmdbTitles(tmdbId, mediaType, { season: wantedSeason });
    } catch (e) {
        if (isAborted(signal)) throw e;
        titles = [];
    }
    if (!titles || !titles.length) {
        console.warn('[Fluneo] Aucun titre TMDB');
        return [];
    }

    // 2. Candidats de slugs → validation par fetch direct de la page anime
    const cands = slugCandidates(titles, wantedSeason, isTv);
    console.log(`[Fluneo] Candidats: ${cands.slice(0, 6).join(', ')}${cands.length > 6 ? '…' : ''}`);

    let parsed = null;
    for (const slug of cands.slice(0, 6)) {
        if (isAborted(signal)) return [];
        try {
            const res = await validateSlug(slug, signal);
            if (res && res.episodes.length) {
                parsed = res;
                console.log(`[Fluneo] Trouvé: /anime/${slug} "${res.title}" (${res.episodes.length} épisodes)`);
                break;
            }
        } catch (e) {
            if (isAborted(signal)) throw e;
            if (e.isChallenge) {
                console.warn('[Fluneo] Cloudflare challenge actif — extraction impossible depuis cette IP');
                return []; // challenge = rien à faire, ne pas brûler les autres candidats
            }
            // 404 ou erreur réseau sur ce candidat → essayer le suivant
        }
        await sleep(250);
    }
    if (!parsed) {
        console.warn('[Fluneo] Aucune page anime trouvée pour les slugs candidats');
        return [];
    }

    // 3. Filtrer les épisodes : saison + numéro cibles (tolérant : 1.5, etc.)
    let targetEps = parsed.episodes;
    if (isTv) {
        const sameSeason = parsed.episodes.filter(e => e.seasonNumber === wantedSeason);
        targetEps = sameSeason.length ? sameSeason : parsed.episodes;
        if (wantedEpisode != null) {
            const exact = targetEps.filter(e => e.episodeNumber === wantedEpisode);
            targetEps = exact.length ? exact : targetEps;
        }
    } else {
        // Film : épisode 1 de la saison 1 (structure unique du site)
        targetEps = parsed.episodes.filter(e => e.seasonNumber === 1 && e.episodeNumber === 1);
        if (!targetEps.length) targetEps = parsed.episodes.slice(0, 1);
    }

    const target = targetEps[0];
    if (!target) {
        console.warn(`[Fluneo] Épisode ${wantedEpisode} introuvable (saison ${wantedSeason})`);
        return [];
    }
    console.log(`[Fluneo] Épisode cible: "${target.title}" (S${target.seasonNumber}E${target.episodeNumber}) — ${targetEps.length} candidat(s)`);

    // 4. Résoudre les embeds du ou des épisodes cibles (dédupliqués par lecteur)
    //    ⚠️ resolveStream EST la résolution (peeling embed → flux direct) :
    //    createProvider n'appelle PAS resolveStream (seulement dédup + expansion
    //    qualité HLS). Sans cet appel on servirait des pages HTML d'embed.
    //    Convention repo (pattern wookafr) : garder uniquement isDirect !== false.
    const rawStreams = [];
    const seenPlayers = new Set();
    const candidates = targetEps.length > 1 ? targetEps.slice(0, 2) : targetEps;
    const perStreamTimeout = 8000;

    for (const ep of candidates) {
        const embeds = parseEmbedsJson(ep.embedsJson);
        // Repli : embed principal (champ url) si embeds_json vide
        if (!embeds.length && ep.url) embeds.push({ label: 'principal', url: ep.url });

        for (const emb of embeds) {
            if (isAborted(signal)) break;
            const label = playerLabel(emb.url);
            // Déduplique par lecteur (même hébergeur sur 2 épisodes cibles)
            if (seenPlayers.has(label)) continue;
            seenPlayers.add(label);
            const display = emb.label || label;
            try {
                const resolved = await withTimeout(
                    resolveStream({ url: emb.url, provider: 'fluneo' }),
                    perStreamTimeout
                );
                if (resolved && resolved.url && resolved.isDirect !== false) {
                    rawStreams.push({
                        ...resolved,
                        name: `Fluneo ${label} - ${ep.title}`,
                        title: `${parsed.title} E${ep.episodeNumber} (${display})`,
                        language: null, // normalisé ci-dessous selon le slug
                        provider: 'fluneo'
                    });
                    console.log(`[Fluneo] Résolu ${label} → ${String(resolved.url).slice(0, 70)}`);
                } else {
                    console.log(`[Fluneo] Non direct: ${label} (${emb.url.slice(0, 60)})`);
                }
            } catch (e) {
                if (isAborted(signal)) break;
                console.log(`[Fluneo] Échec résolution ${label}: ${e.message}`);
            }
        }
        if (rawStreams.length >= 4) break;
    }

    if (!rawStreams.length) {
        console.warn('[Fluneo] Aucun embed exploitable sur la page anime');
        return [];
    }

    // 5. Langue : le slug décide — "-vf" = VF, sinon VOSTFR (le site sépare
    //    les deux versions en pages distinctes)
    const langCode = /-vf$/.test(parsed.slug) ? 'fr' : 'ja';
    for (const s of rawStreams) {
        s.language = normalizeLanguageCode(langCode);
    }
    console.log(`[Fluneo] ${rawStreams.length} embeds bruts (${langCode === 'fr' ? 'VF' : 'VOSTFR'}) → resolveStream`);
    return rawStreams;
}
