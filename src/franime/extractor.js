/**
 * Extractor for Franime (franime.fr)
 *
 * Architecture du site (diagnostic live 2026-09) :
 *  - Site Next.js SPA + API ouverte https://api.franime.fr/api/ (Cloudflare).
 *  - Catalogue complet /api/animes ≈ 11 MB → INTERDIT (limite QuickJS 1 MB).
 *    La recherche passe par Kitsu (filter[text]) : franime indexe les MÊMES
 *    IDs Kitsu (champ source_url + anime-seasons/{id}/N).
 *  - Catalogue d'un anime : /api/anime-seasons/{id} (UNE requête, ~10-300 KB)
 *    → { mappings, episodeDetails: [{ seasonNumber, episodes: [{ number, title, _id }] }] }
 *    saisonIndex = position dans episodeDetails, episodeIndex = position dans
 *    episodes (0-based — ce sont EUX que GET_LECTEUR attend, pas les numéros).
 *  - Lecteur : /api/anime/{id}/{saisonIndex}/{episodeIndex}/{lang}/{lecteurIndex}
 *    (lang = vo|vf ; INDEX 0-based, cf. player du site : saisonIndex/episodeIndex)
 *    → corps = URL franime.fr/watch2/?a=<token chiffré> (ou déjà enrichie &b=)
 *    → 302 : l'URL FINALE (response.url) expose l'embed dans le paramètre `b` :
 *    b = base64 → hex → XOR 0x01 → "https://vidmoly.biz/embed-xxxx.html".
 *    ⚠️ ANTI-LEURRE (constaté live 2026-09) : face à un client non navigateur,
 *    l'API renvoie un embed GÉNÉRIQUE identique (placeholder vidmoly
 *    "try-again", ~20 min noir) quel que soit l'anime/épisode/langue.
 *    Le VRAI embed est chiffré dans les blobs binaires (d, i, j, m, o) et
 *    n'est déchiffrable que par le JS de la page watch2 — elle-même derrière
 *    un challenge Cloudflare interactif. Détecté par canary (voir plus bas).
 *  - Tokens stables à court terme ; jamais mis en cache (rotation possible).
 *  - Lecteurs connus : sibnet, sendvid, vidmoly, filemoon, uqload — tous
 *    résolus par resolveStream (resolvers.js). sibnet = MP4 direct,
 *    les autres = embeds.
 */

import { fetchJson, fetchTextSafe, fetchFinalUrl, apiHeaders, API, SITE } from './http.js';
import { resolveStream, normalizeLanguageCode, isAborted, safeFetch, sleep } from '../utils/resolvers.js';
import { getAbsoluteEpisodeFromTmdb, resolveSeasonEpisodeInputs } from '../utils/dle-extractor.js';
import { resolveByse, isByseUrl } from '../jetanimes/byse.js';
import { HEADERS } from './http.js';

const KITSU_SEARCH = 'https://kitsu.io/api/edge/anime?filter[text]=';
const MAX_CATALOG_PROBES = 3;      // candidats sondés max (chaque sonde ~10 KB)
const MAX_LECTEURS_PER_LANG = 3;   // lecteurs résolus max par langue

/**
 * Décodage du token watch2 : base64 → hex → XOR d'un OCTET UNIQUE.
 *
 * DIAG 2026-11 : la clé XOR n'est plus fixe (0x01 historique). Elle change à
 * CHAQUE requête (0x51, 0x55, 0x5d, 0x03, 0x04… observés sur 6 appels
 * consécutifs) et n'est transmise nulle part en clair : elle est dérivée côté
 * serveur du token `a`. Chercher une clé fixe renvoyait donc systématiquement
 * null → « aucun lecteur fiable résolu » → 0 stream pour TOUT le catalogue.
 *
 * On retrouve la clé par force brute (256 essais sur ~35 octets, négligeable) :
 * le seul décodage qui produit une URL http(s) bien formée est le bon. Les
 * autres paramètres (a/c/d/…) ne sont pas des URLs — seul `b` porte l'embed.
 */
function decodeWatchToken(value) {
    try {
        const hex = atob(value);
        if (!hex || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
        for (let key = 0; key < 256; key++) {
            let out = '';
            for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] ^ key);
            if (/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[:/]|$)/i.test(out) && !/\s/.test(out)) return out;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Extrait l'embed depuis l'URL finale watch2 (paramètre `b`), avec
 * repli sur les autres paramètres si la structure change.
 */
function extractEmbedFromWatchUrl(finalUrl) {
    if (!finalUrl) return null;
    try {
        const qIndex = finalUrl.indexOf('?');
        if (qIndex === -1) return null;
        const query = finalUrl.slice(qIndex + 1);
        // Parse manuel (les tokens sont urlencodés, `%3D` = '=')
        const params = [];
        for (const pair of query.split('&')) {
            const eq = pair.indexOf('=');
            if (eq === -1) continue;
            const key = pair.slice(0, eq);
            let val = pair.slice(eq + 1);
            try { val = decodeURIComponent(val); } catch (e) { /* garde brut */ }
            params.push([key, val]);
        }
        // Ordre de priorité : b (embed), puis tout paramètre qui décode en URL
        const order = ['b'];
        for (const want of order) {
            const hit = params.find(p => p[0] === want);
            if (hit) {
                const dec = decodeWatchToken(hit[1]);
                if (dec) return dec;
            }
        }
        for (const [key, val] of params) {
            if (key === 'b') continue;
            const dec = decodeWatchToken(val);
            if (dec) {
                console.log(`[Franime] Embed trouvé via paramètre "${key}" (repli)`);
                return dec;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

/** Numéro d'épisode : champ `number` (anime-seasons), repli parsing "Épisode 12" → 12 / 12.5 */
function episodeNumber(ep) {
    const n = ep && ep.number != null ? parseFloat(ep.number) : NaN;
    if (!Number.isNaN(n)) return n;
    const m = String(ep && ep.title || '').match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
}

/** Titre normalisé minuscule sans accents (comparaisons) */
function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'no', 'wa', 'to', 'de', 'la', 'le', 'les', 'des', 'du', 'et', 'da', 'oav']);

/** Mots significatifs d'un titre (len >= 3, hors stop-words) */
function titleWords(title) {
    return norm(title).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Recherche d'IDs Kitsu par texte (mêmes IDs que franime).
 * Renvoie [{ id, title, subtype }] ou [].
 */
async function kitsuSearch(query, signal) {
    const url = `${KITSU_SEARCH}${encodeURIComponent(query)}&page%5Blimit%5D=6`;
    try {
        const res = await safeFetch(url, { headers: { ...HEADERS, "Accept": "application/vnd.api+json" }, signal });
        if (!res || !res.ok) return [];
        const data = await res.json();
        if (!data || !Array.isArray(data.data)) return [];
        return data.data.map(x => {
            const a = x.attributes || {};
            const t = (a.titles && (a.titles.en || a.titles.en_jp)) || a.canonicalTitle || a.slug || '';
            return { id: String(x.id), title: t, subtype: a.subtype || '' };
        }).filter(x => x.id && x.title);
    } catch (e) {
        if (isAborted(signal)) throw e;
        return [];
    }
}

/**
 * Scoring d'un candidat Kitsu contre les mots de titres TMDB demandés.
 * Système de ratio : au moins la moitié des mots doivent être trouvés,
 * bonus si un titre correspond exactement / commence par la requête.
 */
function scoreCandidate(anime, words, wantedSeason, fullQuery) {
    const titles = [anime.title, anime.titleO];
    const t2 = anime.titles;
    if (t2) { for (const k in t2) { if (t2[k]) titles.push(t2[k]); } }
    const hay = titles.filter(Boolean).map(norm);
    if (!hay.length) return 0;
    let score = 0;
    for (const w of words) {
        for (const h of hay) {
            if (!h.includes(w)) continue;
            score += h === w ? 3 : 1.5;
            break;
        }
    }
    // Au moins la moitié des mots requis (et un minimum absolu)
    const minScore = Math.max(words.length * 1.5, 3);
    if (score < minScore) return 0;
    if (fullQuery) {
        const q = norm(fullQuery);
        if (hay.some(h => h === q)) score += 4;
        else if (hay.some(h => h.startsWith(q + ' '))) score += 2;
    }
    // Bonus spécificité saison : "… 2nd Season", "Saison N" avec N = saison voulue
    if (wantedSeason != null && wantedSeason > 1) {
        const sPat = new RegExp(`(?:saison|season)\\s*0*${wantedSeason}\\b|(?:0*${wantedSeason})(?:st|nd|rd|th)\\s*(?:saison|season)`);
        if (hay.some(h => sPat.test(h))) score += 10;
        // Malus si le titre déclare explicitement une AUTRE saison
        const other = hay.some(h => {
            const m = h.match(/(?:saison|season)\s*(\d+)|(?:\d+)(?:st|nd|rd|th)\s*(?:saison|season)/);
            const n = m ? parseInt(m[1] || m[2], 10) : null;
            return n != null && n !== wantedSeason;
        });
        if (other) score -= 6;
    }
    return score;
}

/**
 * Récupère le catalogue complet d'un anime en UNE requête (~10-300 KB, même
 * One Piece entier reste < 300 KB) :
 *   /api/anime-seasons/{id} → { episodeDetails: [{ seasonNumber, episodes[] }] }
 * L'INDEX d'une saison = sa position dans episodeDetails ; l'INDEX d'un
 * épisode = sa position dans le tableau episodes (tous deux 0-based, ce sont
 * eux que GET_LECTEUR attend — pas les numéros affichés).
 */
async function fetchAnimeSeasons(animeId, signal) {
    let data = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
        try {
            data = await fetchJson(`${API}anime-seasons/${animeId}`, { headers: apiHeaders(), signal });
        } catch (e) {
            if (isAborted(signal)) throw e;
            console.warn(`[Franime] anime-seasons/${animeId} échoué (${e.message})`);
            if (attempt === 0) await sleep(800);
        }
    }
    const det = data && Array.isArray(data.episodeDetails) ? data.episodeDetails : null;
    if (!det || !det.length) return null;
    const out = [];
    det.forEach((s, index) => {
        const sn = parseFloat(s.seasonNumber);
        if (Number.isNaN(sn) || !Array.isArray(s.episodes) || s.episodes.length === 0) return;
        out.push({ index, seasonNumber: sn, episodes: s.episodes });
    });
    return out.length ? out : null;
}

/**
 * Résout un lecteur en 2 étapes (INDEX 0-based, cf. player du site) :
 *  1. GET_LECTEUR (API, 200) → corps = URL franime.fr/watch2/?a=<token>
 *     (ou JSON {msg} si la combinaison n'existe pas)
 *  2. GET de l'URL watch2 → 302 → URL FINALE (response.url) dont le
 *     paramètre &b= contient l'embed décodable (b64→hex→XOR1).
 */
async function resolveLecteurEmbed(animeId, saisonIndex, episodeIndex, lang, lecteurIndex, signal) {
    const url = `${API}anime/${animeId}/${saisonIndex}/${episodeIndex}/${lang}/${lecteurIndex}`;
    const watch2Url = (await fetchTextSafe(url, { headers: apiHeaders(), signal }));
    if (!watch2Url) return null;
    const target = watch2Url.trim();
    if (!target.startsWith('http')) return null;
    if (!target.includes('/watch2')) return target; // API a directement renvoyé l'embed
    // L'API peut renvoyer l'URL watch2 déjà ENRICHIE (paramètre &b= présent)
    // → décodage immédiat, sans fetch supplémentaire.
    let embed = /[?&]b=/.test(target) ? extractEmbedFromWatchUrl(target) : null;
    if (!embed) {
        // Repli : suivre la redirection 302 pour récupérer l'URL finale (le
        // serveur y place l'embed dans le paramètre &b=).
        const finalUrl = await fetchFinalUrl(target, { signal });
        embed = extractEmbedFromWatchUrl(finalUrl);
    }
    return embed;
}

/** Étiquette lisible d'un lecteur déduit de l'URL embed (le nom API n'est pas requis) */
function playerLabelFromUrl(url) {
    const u = String(url || '').toLowerCase();
    if (u.includes('sibnet')) return 'Sibnet';
    if (u.includes('byse')) return 'Byse';
    if (u.includes('sendvid')) return 'SendVid';
    if (u.includes('vidmoly')) return 'VidMoly';
    if (u.includes('filemoon') || u.includes('moonplayer')) return 'FileMoon';
    if (u.includes('uqload')) return 'Uqload';
    if (u.includes('oneupload')) return 'OneUpload';
    if (u.includes('vidoza')) return 'Vidoza';
    if (u.includes('streamtape')) return 'Streamtape';
    if (u.includes('smoothpre')) return 'SmoothPre';
    const m = u.match(/^https?:\/\/([^/]+)/);
    return m ? m[1].replace(/^www\./, '') : 'Lecteur';
}

/** Embeds-leurres connus : placeholder générique servi aux clients non navigateur */
const DECOY_EMBEDS = new Set([
    'https://vidmoly.biz/embed-mzyza0y0iaai.html'
]);

function isKnownDecoy(embed) {
    if (!embed) return false;
    return DECOY_EMBEDS.has(String(embed).trim().toLowerCase());
}

/**
 * Point d'entrée de l'extraction.
 * @returns {Promise<Array<object>>} streams bruts (passés à resolveStream par createProvider)
 */
export async function extractStreams(tmdbId, mediaType, season, episode, { signal } = {}) {
    // ⚠️ Nuvio passe 'series' (pas 'tv') — 7ᵉ occurrence du bug de dispatch
    // dans ce repo : toujours normaliser.
    const isTv = mediaType === 'tv' || mediaType === 'series';
    // season=null (anime videoIds on TV) + absolute episode -> (S,E)
    const se = isTv
        ? await resolveSeasonEpisodeInputs(season, episode, tmdbId, { mediaType: 'tv' })
        : { season: null, episode: null };
    const wantedSeason = isTv ? se.season : null;
    const wantedEpisode = isTv ? se.episode : null;

    console.log(`[Franime] Extraction ${mediaType} ${tmdbId}` +
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
        console.warn('[Franime] Aucun titre TMDB');
        return [];
    }

    // 2. Recherche Kitsu (mêmes IDs que franime) + scoring des candidats,
    //    puis validation de l'existence chez franime (sondes cheap).
    const searchQueries = [];
    const primary = String(titles[0] || '').trim();
    if (primary) searchQueries.push(primary);

    // Les mots de scoring viennent de la requête de recherche (pas de toutes
    // les variantes TMDB — sinon le seuil devient inatteignable).
    let words = titleWords(primary);
    if (!words.length) {
        for (const t of titles) {
            words = titleWords(t);
            if (words.length) break;
        }
    }
    if (!words.length) return [];
    // Variante raccourcie pour les longs titres ("Demon Slayer: Kimetsu no Yaiba" → "Demon Slayer")
    if (primary.includes(':') && primary.split(':')[0].trim().length >= 4) searchQueries.push(primary.split(':')[0].trim());
    // Variantes TMDB supplémentaires : le catalogue franime est indexé sous le
    // titre anglais/original Kitsu, alors que TMDB renvoie souvent le titre FR
    // en premier ("Les Carnets de l'apothicaire" ≠ "The Apothecary Diaries").
    for (const t of titles.slice(1, 4)) {
        const s = String(t || '').trim();
        if (s.length >= 3 && !searchQueries.includes(s)) searchQueries.push(s);
    }

    const kitsuCandidates = [];
    for (const q of searchQueries) {
        const res = await kitsuSearch(q, signal);
        for (const c of res) {
            if (!kitsuCandidates.some(k => k.id === c.id)) kitsuCandidates.push(c);
        }
        if (kitsuCandidates.length >= 6) break;
    }
    if (!kitsuCandidates.length) {
        console.warn('[Franime] Recherche Kitsu vide');
        return [];
    }

    // Score des candidats Kitsu en essayant les mots de CHAQUE variante TMDB
    // (le titre FR ne matche pas le canonicalTitle anglais, et inversement).
    const wordSets = [words];
    for (const t of titles.slice(0, 5)) {
        const w = titleWords(t);
        if (w.length && !wordSets.some((x) => x.join(' ') === w.join(' '))) wordSets.push(w);
    }
    let scored = [];
    for (const w of wordSets) {
        scored = kitsuCandidates
            .map(c => ({ ...c, score: scoreCandidate({ title: c.title, titleO: c.title, titles: null }, w, wantedSeason, primary) }))
            .filter(c => c.score > 0)
            .sort((a, b) => b.score - a.score);
        if (scored.length) break;
    }
    if (!scored.length) {
        console.warn('[Franime] Aucun candidat Kitsu pertinent');
        return [];
    }

    // 3. Validation chez franime : UN fetch anime-seasons/{id} par candidat
    //    (~10-300 KB) — fournit saisons + épisodes + INDEX 0-based directs.
    const validated = [];
    for (const cand of scored.slice(0, 5)) {
        if (validated.length >= MAX_CATALOG_PROBES) break;
        const seasons = await fetchAnimeSeasons(cand.id, signal);
        if (seasons) validated.push({ ...cand, seasons });
    }
    if (!validated.length) {
        console.warn('[Franime] Aucun candidat présent dans le catalogue franime');
        return [];
    }

    // 4. Choix du candidat, de la saison et de l'INDEX d'épisode.
    //
    //    DIAG 2026-11 : franime numérote certaines saisons en ABSOLU (One Piece
    //    saison 2 = 62…143, saison 3 = 144…206). Chercher uniquement
    //    « saison N + épisode E » tombait alors sur la saison 1 (épisode 1 au
    //    lieu de l'épisode 62) → « les épisodes ne correspondent pas ». On
    //    calcule donc le numéro absolu TMDB et on l'essaie aussi.
    let absolute = null;
    if (isTv && wantedSeason != null && wantedEpisode != null) {
        try {
            absolute = await getAbsoluteEpisodeFromTmdb(tmdbId, wantedSeason, wantedEpisode);
        } catch (e) {
            if (isAborted(signal)) throw e;
        }
    }
    // Saisons « spéciales » (0.5 = OAV, 0 = bonus) exclues : elles portent une
    // numérotation repartant de 1 et capturaient One Piece S2E1 → épisode 1
    // d'un OAV au lieu de l'épisode 62. Le site les expose comme saison 0.5.
    const isRegularSeason = (sp) => Number(sp.seasonNumber) >= 1;
    const indexOfNumber = (sp, num) => sp.episodes.findIndex(e => episodeNumber(e) === num);
    const pickInSeason = (seasonNumber, num) => {
        if (num == null) return false;
        for (const cand of validated) {
            const sp = cand.seasons.find(s => isRegularSeason(s) && s.seasonNumber === seasonNumber);
            if (!sp) continue;
            const i = indexOfNumber(sp, num);
            if (i >= 0) { chosen = cand; chosenSeason = sp; episodeIndex = i; return true; }
        }
        return false;
    };
    const pickAnySeason = (num, allowSpecials) => {
        if (num == null) return false;
        for (const cand of validated) {
            for (const sp of cand.seasons) {
                if (!allowSpecials && !isRegularSeason(sp)) continue;
                const i = indexOfNumber(sp, num);
                if (i >= 0) { chosen = cand; chosenSeason = sp; episodeIndex = i; return true; }
            }
        }
        return false;
    };
    let chosen = null;
    let chosenSeason = null;
    let episodeIndex = -1;
    // a) numérotation normale : saison demandée + épisode demandé
    if (wantedSeason != null) pickInSeason(wantedSeason, wantedEpisode);
    // b) même saison mais numérotation absolue (One Piece S2E1 = ép. 62)
    if (!chosen && wantedSeason != null && absolute) pickInSeason(wantedSeason, absolute);
    // c) numérotation absolue dans une AUTRE saison (TMDB S3E1 = abs 78, qui
    //    vit chez franime dans la saison 2)
    if (!chosen && absolute) pickAnySeason(absolute, false);
    // d) dernier recours : épisode demandé, hors saisons spéciales
    if (!chosen) pickAnySeason(wantedEpisode, false);
    // e) index positionnel dans la saison demandée (champ `number` exotique) —
    //    jamais une autre saison : mieux vaut 0 flux qu'un épisode faux.
    if (!chosen && wantedSeason != null && wantedEpisode != null) {
        for (const cand of validated) {
            const sp = cand.seasons.find(s => isRegularSeason(s) && s.seasonNumber === wantedSeason);
            if (sp && sp.episodes.length >= wantedEpisode) {
                chosen = cand; chosenSeason = sp; episodeIndex = wantedEpisode - 1; break;
            }
        }
    }
    if (!chosen) {
        console.warn(`[Franime] Épisode ${wantedEpisode} (absolu ${absolute || '?'}) absent du catalogue — 0 propre`);
        return [];
    }

    const animeId = chosen.id;
    console.log(`[Franime] Cible: id=${animeId} "${chosen.title}" saison ${chosenSeason.seasonNumber} ` +
        `(index ${chosenSeason.index}, ${chosenSeason.episodes.length} épisodes, épisode #${episodeNumber(chosenSeason.episodes[episodeIndex])})`);

    // 6. Collecte des lecteurs par langue (VF puis VOSTFR)
    const rawStreams = [];
    const langDefs = [
        { key: 'vf', display: 'VF', code: 'fr' },
        { key: 'vo', display: 'VOSTFR', code: 'ja' }
    ];

    // 6. Résolution des lecteurs (sondes d'index 0..n, 404 = fin de liste).
    //    L'embed est décodé du paramètre `b` de l'URL watch2 (clé XOR variable)
    //    → plus besoin de suivre la redirection : la page watch2 est derrière un
    //    challenge Cloudflare interactif (403) et ne sert qu'en repli.
    const MAX_INDEX_PROBES = 6;
    const seenKeys = new Set();
    for (const ld of langDefs) {
        let resolved = 0;
        let failures = 0;
        for (let i = 0; i < MAX_INDEX_PROBES && resolved < MAX_LECTEURS_PER_LANG; i++) {
            if (isAborted(signal)) break;
            const embed = await resolveLecteurEmbed(animeId, chosenSeason.index, episodeIndex, ld.key, i, signal);
            if (!embed) {
                // Tolère 2 échecs (transitoire ou index troué) avant de
                // considérer la liste terminée pour cette langue.
                failures++;
                if (failures >= 2) break;
                continue;
            }
            if (isKnownDecoy(embed)) {
                console.warn(`[Franime] Embed-leurre statique détecté (${ld.display}) — ignoré`);
                continue;
            }
            const label = playerLabelFromUrl(embed);
            // Dédup par URL + LANGUE : VF et VOSTFR partagent souvent le même
            // hébergeur (sendvid/byse) — dédupliquer par domaine seul supprimait
            // la version VOSTFR du même épisode.
            const key = `${embed}|${ld.key}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            resolved++;
            rawStreams.push({
                url: embed,
                name: `Franime ${label} - ${ld.display}`,
                title: `${chosen.title} E${wantedEpisode} ${ld.display} (${label})`,
                language: ld.code,
                provider: 'franime'
            });
        }
        if (isAborted(signal)) break;
    }

    if (!rawStreams.length) {
        console.warn('[Franime] Aucun lecteur disponible (VF/VOSTFR absents côté site)');
        return [];
    }

    // 7. Résolution des embeds en URLs JOUABLES.
    //    ⚠ createProvider n'appelle pas resolveStream : un provider qui rend
    //    des pages /embed/ livre des flux qui ne démarrent jamais (« le flux
    //    reste sur un écran noir / ne se lance pas »). Byse a son propre
    //    décodeur AES-GCM, le reste passe par resolveStream (sendvid → MP4,
    //    sibnet → MP4, uqload/ansembed → HLS…).
    const REFERER = SITE + '/';
    const resolveOne = async (stream) => {
        try {
            if (isByseUrl(stream.url)) {
                const r = await resolveByse(
                    stream.url,
                    async (u, o) => {
                        const res = await safeFetch(u, {
                            ...o,
                            headers: { ...((o && o.headers) || {}), Referer: REFERER },
                        });
                        return res ? { text: await res.text(), finalUrl: res.url } : null;
                    },
                    signal
                );
                if (!r || !r.url) return null;
                return { ...stream, url: r.url, type: 'hls', quality: stream.quality || '1080p' };
            }
            const r = await resolveStream(
                { ...stream, headers: { Referer: REFERER, 'User-Agent': HEADERS['User-Agent'] } },
                0
            );
            if (!r || !r.url || typeof r.url !== 'string' || r.url.includes('[object')) return null;
            // Passthrough = embed non résolu → injouable, on jette.
            if (r.url === stream.url || (!/\.(mp4|m3u8)(\?|$)/i.test(r.url) && /\/embed|shell\.php|\/e\//i.test(r.url))) return null;
            const type = /\.m3u8/i.test(r.url) ? 'hls' : /\.mp4/i.test(r.url) ? 'mp4' : r.type;
            return { ...stream, ...r, url: r.url, type, title: stream.title, name: stream.name, language: stream.language };
        } catch (e) {
            if (isAborted(signal)) throw e;
            console.warn(`[Franime] Résolution échouée (${stream.name}): ${e.message}`);
            return null;
        }
    };
    const settled = await Promise.allSettled(rawStreams.map((s) => resolveOne(s)));
    const streams = [];
    for (const s of settled) {
        const v = s.status === 'fulfilled' ? s.value : null;
        if (v && v.url) streams.push(v);
    }
    console.log(`[Franime] ${rawStreams.length} lecteurs bruts → ${streams.length} flux jouables`);
    return streams;
}
