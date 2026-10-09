import { fetchText, BASE, setCurrentSignal } from './http.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { resolveStream, safeJson, isAborted } from '../utils/resolvers.js';
import { normalize, toSlug, stripSeasonSuffix, hasForeignLeadingTokens, countExtraWords, GENERIC_TOKENS } from '../utils/dle-extractor.js';
import { createCache } from '../utils/cache.js';

function extractPushContent(html) {
    const chunks = [];
    let pos = 0;
    while (true) {
        const start = html.indexOf('self.__next_f.push([1,"', pos);
        if (start === -1) break;
        const strStart = start + 'self.__next_f.push([1,"'.length;

        let i = strStart;
        let chunk = '';
        let escaped = false;
        while (i < html.length) {
            const ch = html[i];
            if (escaped) {
                if (ch === 'n') chunk += '\n';
                else if (ch === 't') chunk += '\t';
                else if (ch === 'r') chunk += '\r';
                else if (ch === '\\') chunk += '\\';
                else if (ch === '"') chunk += '"';
                else if (ch === '/') chunk += '/';
                else if (ch === 'u') {
                    const hex = html.substring(i + 1, i + 5);
                    chunk += String.fromCharCode(parseInt(hex, 16));
                    i += 4;
                } else chunk += ch;
                escaped = false;
                i++;
                continue;
            }
            if (ch === '\\') { escaped = true; i++; continue; }
            if (ch === '"' && html.substring(i + 1, i + 3) === '])') break;
            chunk += ch;
            i++;
        }

        if (chunk) chunks.push(chunk);
        pos = i + 1;
    }
    return chunks.join('');
}

function extractAnimeServerData(html) {
    const allData = extractPushContent(html);

    const marker = '"animeServer":';
    const idx = allData.indexOf(marker);
    if (idx === -1) return null;

    const valueStart = allData.indexOf('{', idx + marker.length);
    if (valueStart === -1) return null;

    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = valueStart;
    for (let i = valueStart; i < allData.length; i++) {
        const ch = allData[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inStr) { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) { end = i + 1; break; }
        }
    }

    const jsonStr = allData.substring(valueStart, end);
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("[Mugiwara] JSON parse error:", e.message);
        return null;
    }
}

function searchAnime(html) {
    try {
        const results = safeJson(JSON.parse(html || '{}'));
        if (results && Array.isArray(results.results)) return results.results;
    } catch (e) {
        console.warn('[Mugiwara] Search JSON parse failed:', e.message);
    }
    return null;
}

function getEpisodeCount(saison) {
    if (!saison || !saison.lang) return 0;
    let maxCount = 0;
    for (const langData of Object.values(saison.lang)) {
        if (Array.isArray(langData) && langData.length > 0) {
            const first = langData[0];
            if (Array.isArray(first) && first.length > maxCount) {
                maxCount = first.length;
            }
        }
    }
    return maxCount;
}

function matchSaison(saisons, tmdbSeason, episodeNum) {
    if (!saisons || !Array.isArray(saisons)) return null;

    const seasonStr = String(tmdbSeason);

    for (const s of saisons) {
        if (s.notASeason) continue;
        if (s.id === seasonStr) {
            const count = getEpisodeCount(s);
            if (episodeNum <= count) return { saison: s, episodeIndex: episodeNum - 1 };
            break;
        }
    }

    const subSeasons = saisons.filter(s => {
        if (s.notASeason) return false;
        const numPart = s.id.split('-')[0];
        return numPart === seasonStr;
    }).sort((a, b) => {
        const pa = a.id.split('-');
        const pb = b.id.split('-');
        const na = parseInt(pa[0]) || 0;
        const nb = parseInt(pb[0]) || 0;
        if (na !== nb) return na - nb;
        const sa = pa.length > 1 ? parseInt(pa[1]) || 0 : 0;
        const sb = pb.length > 1 ? parseInt(pb[1]) || 0 : 0;
        return sa - sb;
    });

    if (subSeasons.length > 0) {
        let cumStart = 0;
        for (const s of subSeasons) {
            const count = getEpisodeCount(s);
            if (episodeNum > cumStart && episodeNum <= cumStart + count) {
                return { saison: s, episodeIndex: episodeNum - cumStart - 1 };
            }
            cumStart += count;
        }
    }

    const ordered = saisons.filter(s => !s.notASeason);
    const idx = tmdbSeason - 1;
    if (idx >= 0 && idx < ordered.length) {
        const s = ordered[idx];
        const count = getEpisodeCount(s);
        if (episodeNum <= count) {
            return { saison: s, episodeIndex: episodeNum - 1 };
        }
    }

    // Cumulative fallback: only try if season number is within range of available sagas
    const mainSeasons = saisons.filter(s => {
        if (s.notASeason) return false;
        if (!s.lang || Object.keys(s.lang).length === 0) return false;
        if (/[a-zA-Z]/.test(s.id.replace(/-/g, ''))) return false;
        return true;
    });

    // Don't use cumulative fallback if season exceeds available sagas
    // (e.g., One Piece S20 should not match S1 East Blue)
    if (tmdbSeason > mainSeasons.length) return null;

    let cumulativeStart = 0;
    for (const s of mainSeasons) {
        const count = getEpisodeCount(s);
        if (count > 0 && episodeNum > cumulativeStart && episodeNum <= cumulativeStart + count) {
            return { saison: s, episodeIndex: episodeNum - cumulativeStart - 1 };
        }
        cumulativeStart += count;
    }

    return null;
}

function extractEpisodeUrls(saison, lang) {
    if (!saison || !saison.lang) return [];
    const langData = saison.lang[lang];
    if (!langData || !Array.isArray(langData) || langData.length === 0) return [];

    const urls = [];
    const maxLen = Math.max(...langData.map(arr => Array.isArray(arr) ? arr.length : 0));
    for (let ep = 0; ep < maxLen; ep++) {
        const sources = [];
        for (let sourceIdx = 0; sourceIdx < langData.length; sourceIdx++) {
            const arr = langData[sourceIdx];
            if (Array.isArray(arr) && ep < arr.length) {
                sources.push(arr[ep]);
            }
        }
        if (sources.length > 0) urls.push(sources);
    }
    return urls;
}

const SOURCE_LABELS = ['Sibnet', 'Vidmoly', 'Sendvid', 'VK', 'Youtube', 'Other'];

// Hosts morts ou irrésolubles en fetch statique — skip avant résolution.
// sendvid = 404 mort ; lpayer.embed4me.com = SPA React (URLs finales
// construites côté client, inaccessibles sans navigateur).
const DEAD_HOSTS = ['sendvid', 'embed4me', 'uqload.co', 'uqload.bz', 'uqload.to', 'oneupload.to'];
function isDeadHost(url) {
    if (!url) return false;
    return DEAD_HOSTS.some(h => url.includes(h));
}

function detectHostLabel(url) {
    if (!url) return 'Other';
    const lower = url.toLowerCase();
    if (lower.includes('sibnet')) return 'Sibnet';
    if (lower.includes('vidmoly') || lower.includes('voembed')) return 'Vidmoly';
    if (lower.includes('ansembed')) return 'AnsEmbed';
    if (lower.includes('embed4me') || lower.includes('lpayer')) return 'Embed4Me';
    if (lower.includes('sendvid')) return 'Sendvid';
    if (lower.includes('vk.com') || lower.includes('vkvideo')) return 'VK';
    if (lower.includes('youtube')) return 'YouTube';
    if (lower.includes('dood')) return 'Dood';
    if (lower.includes('voe') || lower.includes('veev')) return 'Voe';
    if (lower.includes('filemoon')) return 'Filemoon';
    return 'Other';
}

function buildStreamEntry(url, label, langLabel, title, quality) {
    let resolvedUrl = url;
    if (typeof resolvedUrl === 'string' && resolvedUrl.startsWith('//')) resolvedUrl = 'https:' + resolvedUrl;
    // Détecter le vrai hébergeur depuis l'URL
    const hostLabel = detectHostLabel(resolvedUrl);
    // FIX : language = code normalisé (fr/ja) pour les filtres/tri NuvioTV.
    // Les labels VF/VOSTFR restaient classés "Unknown" côté app.
    const language = langLabel === 'VF' ? 'fr' : 'ja';
    return {
        name: `Mugiwara (${langLabel})`,
        title: `${title} - ${hostLabel}`,
        url: resolvedUrl,
        quality: quality || 'HD',
        language,
        headers: { 'Referer': BASE + '/' }
    };
}

async function resolveStreams(streams) {
    // Sequential resolution with early-exit (QuickJS: fetch synchrone)
    // FIX "ne se lance jamais" : plus AUCUN fallback embed. Un embed non
    // résolu = page HTML d'hébergeur que l'app ne peut pas lire. Convention
    // repo (wookafr/fluneo/franime/coflix) : isDirect:false est rejeté.
    const direct = [];
    for (const stream of streams) {
        try {
            const r = await resolveStream(stream);
            if (r && r.url && r.isDirect) {
                // Ne PAS stripper isDirect : test_providers.js et les apps
                // filtrent sur ce flag (isDirect:false/undefined = rejeté).
                const { originalUrl, ...clean } = r;
                direct.push({ ...stream, ...clean, isDirect: true, quality: r.quality || stream.quality });
            }
        } catch { /* skip failed candidate */ }
        // Early exit: 3 direct streams is enough
        if (direct.length >= 3) break;
    }
    return direct;
}

function collectSourceUrls(episodeSourceUrls) {
    if (!episodeSourceUrls || episodeSourceUrls.length === 0) return [];
    const streams = [];
    let skipped = 0;
    for (let i = 0; i < episodeSourceUrls.length; i++) {
        let url = episodeSourceUrls[i];
        if (!url || typeof url !== 'string') continue;
        if (url.startsWith('//')) url = 'https:' + url;
        // Skip dead hosts avant résolution (gain ~5-10s par stream mort)
        if (isDeadHost(url)) {
            skipped++;
            continue;
        }
        streams.push({ url, sourceIndex: i });
    }
    if (skipped > 0) console.log(`[Mugiwara] Skipped ${skipped} dead host(s) before resolution`);
    return streams;
}

function extractFilmStreams(filmOptions) {
    if (!filmOptions || !filmOptions.lang) return [];

    // Migration site 2026 : FILM_OPTIONS.lang = "$undefined" (URLs passées
    // côté client, servies par /api/search/sources derrière auth NextAuth).
    // Les films ne sont plus accessibles sans compte → log clair au lieu d'un
    // 0 stream silencieux.
    if (typeof filmOptions.lang === 'string') {
        console.log('[Mugiwara] FILM_OPTIONS.lang migrated to client-side format (auth-gated /api/search/sources) — films unavailable without site account');
        return [];
    }

    const labels = SOURCE_LABELS;
    const filmNames = (filmOptions.names || []).map(n => n && n.name ? n.name : 'Film');
    const filmCount = filmNames.length > 0 ? filmNames.length : 1;

    const allFilmStreams = [];
    for (let filmIdx = 0; filmIdx < filmCount; filmIdx++) {
        const filmName = filmNames[filmIdx] || `Film ${filmIdx + 1}`;
        for (const [lang, langData] of Object.entries(filmOptions.lang)) {
            if (!Array.isArray(langData)) continue;
            const langLabel = lang === 'vf' ? 'VF' : lang.toUpperCase();
            for (let sourceIdx = 0; sourceIdx < langData.length; sourceIdx++) {
                const arr = langData[sourceIdx];
                if (!Array.isArray(arr) || filmIdx >= arr.length) continue;
                const url = arr[filmIdx];
                if (!url || typeof url !== 'string') continue;
                // Valider la présence d'une vraie URL (rejette "$undefined"
                // et autres placeholders de la migration client-side 2026).
                if (!/^https?:\/\//i.test(url) && !url.startsWith('//')) continue;
                const sourceLabel = sourceIdx < labels.length ? labels[sourceIdx] : `Source ${sourceIdx + 1}`;
                allFilmStreams.push(buildStreamEntry(url, sourceLabel, langLabel, filmName));
            }
        }
    }
    return allFilmStreams;
}// Match avec frontières de mots (chaînes normalisées, espaces simples) :
// 'gate' ⊂ 'gates' rejeté, 'naruto' en tête de 'naruto shippuden' accepté.
function includesWord(hay, needle) {
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

// Mots communs requête/résultat : mots-outils filtrés (the/le/des… via
// GENERIC_TOKENS), substring acceptée seulement pour les mots longs
// (agglutination "lattaque"/"attaque"), mot exact exigé pour les courts
// ('sen', 'and' ne matchent plus 'present'/'handyman').
function countCommonWords(nr, nt) {
    const nrWords = new Set(nr.split(/\s+/));
    let n = 0;
    for (const w of nt.split(/\s+/)) {
        if (w.length <= 2 || GENERIC_TOKENS.has(w)) continue;
        if (w.length >= 5 ? nr.includes(w) : nrWords.has(w)) n++;
    }
    return n;
}

// ─── Garde anti-faux-match (titre page vs titres TMDB) ──────────────────────
// Le slug ne prouve rien (soft-404, homonymes, fuzzy serveur) : on valide le
// TITRE RÉEL de la fiche (champ "anime" du animeServer, pas le slug) contre
// les titres TMDB avec le scoring existant, SANS la branche lâche
// countCommonWords (un 60/100 laisserait passer "Tojima Wants to Be a Kamen
// Rider" pour "Kamen Rider"). Seuil 80 :
//   "Shingeki no Kyojin" vs titres AOT → 100 (passe) ;
//   "BLACK TORCH"/"GREAT PRETENDER" vs Kamen/Mazinger → 0 (rejet) ;
//   "Tojima Wants to Be a Kamen Rider" vs "Kamen Rider" → 0 (tokens
//   étrangers avant la requête → rejet).
const TITLE_GUARD_THRESHOLD = 80;

function scorePageTitle(pageName, title) {
    const nt = normalize(title);
    const nr = normalize(pageName);
    if (!nt || !nr) return 0;
    if (nr === nt) return 100;
    if ((includesWord(nr, nt) || includesWord(nt, nr)) && !hasForeignLeadingTokens(nr, nt)) return 80;
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

const MAX_SLUG_SEARCH = 5; // Max titres à chercher (gain ~15-20s)

async function findSlugs(titles) {
    const seenQueries = new Set();
    const tryQueries = [];
    for (const t of titles) {
        if (!t || seenQueries.has(t.toLowerCase())) continue;
        seenQueries.add(t.toLowerCase());
        const isFrench = /[\u00C0-\u00FF]/.test(t) || t.toLowerCase().startsWith("l'");
        tryQueries.push({ title: t, priority: isFrench ? 0 : t === titles[0] ? 1 : 2 });
    }
    tryQueries.sort((a, b) => a.priority - b.priority);

    // Limiter le nombre de titres recherchés (gain ~15-20s)
    const limitedQueries = tryQueries.slice(0, MAX_SLUG_SEARCH);

    const allCandidates = [];
    const seenSlugs = new Set();

    for (let qi = 0; qi < limitedQueries.length; qi++) {
        const { title: t } = limitedQueries[qi];
        const nt = normalize(t);
        if (nt.length < 4) continue;

        const query = encodeURIComponent(t);
        let searchHtml;
        try {
            searchHtml = await fetchText(`${BASE}/api/search?q=${query}`);
        } catch (e) {
            continue;
        }

        const results = searchAnime(searchHtml);
        if (!results || results.length === 0) continue;

        for (const r of results) {
            const nr = normalize(r.anime);
            let score = 0;
            if (nr === nt) score = 100;
            // Garde anti-homonymes (bug "Gate" → Steins;Gate) : un token
            // significatif AVANT la requête ("steins", "new"…) rejette le match.
            else if ((includesWord(nr, nt) || includesWord(nt, nr)) && !hasForeignLeadingTokens(nr, nt)) score = 80;
            else if (r.matched && normalize(r.matched) === nt) score = 90;
            else if (r.anime) {
                if (countCommonWords(nr, nt) >= 2) score = 60;
            }

            if (score >= 60 && r.slug && !seenSlugs.has(r.slug)) {
                seenSlugs.add(r.slug);
                allCandidates.push({ slug: r.slug, score });
            }
        }

        // Early exit dès qu'on a des candidats (le 1er titre TMDB — le
        // principal — donne presque toujours le bon slug). Avant : on
        // interrogeait jusqu'à 8 variantes TMDB ("wan pisu", "budak getah"…)
        // → 30 s perdues par requête sans bénéfice.
        if (allCandidates.length > 0) {
            console.log(`[Mugiwara] Early exit after ${qi + 1} title(s): ${allCandidates.length} candidate(s)`);
            break;
        }
    }

    if (allCandidates.length === 0) return null;

    allCandidates.sort((a, b) => b.score - a.score);
    console.log(`[Mugiwara] Found ${allCandidates.length} slug candidate(s): ${allCandidates.map(c => c.slug + '(' + c.score + ')').join(', ')}`);
    return allCandidates.map(c => c.slug);
}

// Titres d'épisodes FR (EPISODES_OPTIONS.names) avec alerte si l'index
// calculé sort des bornes (désalignement saga/épisodes).
function getEpisodeDisplayTitle(animeData, episodeIndex, fallback) {
    const names = animeData && animeData.options && animeData.options.EPISODES_OPTIONS && animeData.options.EPISODES_OPTIONS.names;
    if (Array.isArray(names) && names.length > 0) {
        if (episodeIndex >= 0 && episodeIndex < names.length) {
            const entry = names[episodeIndex];
            const t = entry && (typeof entry === 'string' ? entry : entry.name || entry.title);
            if (typeof t === 'string' && t.trim()) return t.trim();
            return fallback;
        }
        console.log(`[Mugiwara] WARNING: episodeIndex ${episodeIndex} out of bounds (EPISODES_OPTIONS.names: ${names.length}) — fallback "${fallback}"`);
    }
    return fallback;
}

function collectStreamsForLang(saison, lang, episodeIndex, seasonName) {
    const episodeUrls = extractEpisodeUrls(saison, lang);
    if (episodeIndex < 0 || episodeIndex >= episodeUrls.length) return [];

    const sourceUrls = episodeUrls[episodeIndex];
    const langLabel = lang === 'vf' ? 'VF' : 'VOSTFR';
    return collectSourceUrls(sourceUrls).map(s => {
        const label = s.sourceIndex < SOURCE_LABELS.length ? SOURCE_LABELS[s.sourceIndex] : `Source ${s.sourceIndex + 1}`;
        return buildStreamEntry(s.url, label, langLabel, seasonName);
    });
}

// Cache partagé LRU avec TTL configuré par type de donnée
// slugCache: slug des animes par titre TMDB (multi-clés, lookup rapide)
const slugCache = createCache('mg_slug', 'MugiwaraSlug', { successTtl: 10 * 60_000, maxSize: 200 }); // 10min
// animeDataCache: données extraites des pages Next.js par slug+type (fetch intensif)
const animeDataCache = createCache('mg_data', 'MugiwaraData', { successTtl: 15 * 60_000, maxSize: 100 }); // 15min

async function findCachedSlugs(titles) {
    // Le cache stocke le tableau complet des slugs tries par score.
    // On vérifie si l'un des titres est déjà en cache.
    for (const t of titles) {
        const slugs = await slugCache(`slugs_${t.toLowerCase()}`, async () => {
            const found = await findSlugs(titles);
            if (found && found.length > 0) {
                // Pré-cacher sous tous les titres pour les requêtes futures
                for (const other of titles) {
                    if (other.toLowerCase() !== t.toLowerCase()) {
                        await slugCache(`slugs_${other.toLowerCase()}`, async () => found);
                    }
                }
                return found;
            }
            return null;
        });
        if (slugs && slugs.length > 0) return slugs;
    }
    return null;
}

// Ids de pages …/episodes/<id> listés dans le HTML (saison1, saison2,
// saison1-2 pour les sagas…). Sert aux sondes dynamiques.
function extractSaisonPageIds(html) {
    if (!html) return [];
    const ids = [];
    const seen = new Set();
    const re = /saison\d[\w-]*/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const id = m[0].toLowerCase();
        if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
    return ids;
}

async function getAnimeData(slug, mediaType) {
    const cacheKey = slug + ':' + mediaType;
    return animeDataCache(cacheKey, async () => {
        const pageUrl = mediaType === 'movie'
            ? `${BASE}/catalogue/${slug}/films`
            : `${BASE}/catalogue/${slug}/episodes/saison1`;

        let pageHtml = null;
        try {
            pageHtml = await fetchText(pageUrl);
        } catch (e) { /* probe ci-dessous */ }
        // FIX : fetchText renvoie '' sur 404 (falsy) — l'ancien code probe
        // alors toutes les saisons 2..20 en serie (echec du fetch de la page
        // = jusqu'a 20 requetes perdues). On sonde seulement si la page
        // saison1 renvoie un vrai contenu SANS donnees animeServer.
        if (!pageHtml || pageHtml.length < 1000 || pageHtml.indexOf('animeServer') === -1) {
            if (mediaType !== 'movie') {
                // Sonde dynamique : segments exacts du sitemap d'abord
                // (saisonN, oav, saison1hs…), puis ids listés sur la page
                // saison1 (sagas…), repli saison2..5.
                const smSegs = await getSitemapSegments(slug);
                const listed = extractSaisonPageIds(pageHtml);
                const probes = [];
                const seenP = new Set(['saison1']);
                for (const seg of smSegs.concat(listed)) {
                    const id = String(seg).toLowerCase();
                    if (!seenP.has(id)) { seenP.add(id); probes.push(id); }
                }
                if (probes.length === 0) probes.push('saison2', 'saison3', 'saison4', 'saison5');
                for (const pid of probes.slice(0, 6)) {
                    try {
                        const html = await fetchText(`${BASE}/catalogue/${slug}/episodes/${pid}`);
                        if (html && html.indexOf('animeServer') !== -1) { pageHtml = html; break; }
                    } catch (_) {}
                }
            }
        }

        if (!pageHtml) {
            console.log(`[Mugiwara] No page found for ${cacheKey}`);
            return null;
        }

        return extractAnimeServerData(pageHtml) || null;
    });
}

/**
 * FIX "0 stream sur les saisons ≥ 2" : sur le site, chaque saison vit sur sa
 * propre page (…/catalogue/<slug>/episodes/saisonN). La page saison1 liste
 * toutes les saisons mais souvent avec 0 épisode pour N ≥ 2 → on recharge les
 * données depuis la page dédiée. sagaId = id de saga listé sur la page
 * saison1 (ex "2", "1-3"), PAS le numéro TMDB.
 */
async function getSaisonPageData(slug, sagaId, isSegment) {
    const raw = String(sagaId == null ? '' : sagaId).trim();
    if (!raw) return null;
    // isSegment = segment d'URL exact du sitemap ('saison2', 'oav'…),
    // sinon id de saga ('2', '1-3') préfixé en 'saison…'.
    const pageId = (isSegment || /^saison/i.test(raw)) ? raw.toLowerCase() : 'saison' + raw;
    const cacheKey = slug + ':' + pageId;
    return animeDataCache(cacheKey, async () => {
        let pageHtml = null;
        try {
            pageHtml = await fetchText(`${BASE}/catalogue/${slug}/episodes/${pageId}`);
        } catch (_) {}
        if (!pageHtml || pageHtml.length < 1000) return null;
        if (pageHtml.replace(/\\/g, '').includes('"animeServer":0')) return null; // soft-404
        const data = extractAnimeServerData(pageHtml);
        return data && data.options && data.options.saisons ? data : null;
    });
}

/**
 * Logique séries extraite : match de la saison + collecte/dédup des flux.
 * Retourne les streams résolus, ou null si cette source de données n'a rien.
 */
async function trySeriesStreams(slug, animeData, season, episodeNum, effectiveSeason) {
    if (!animeData.options || !animeData.options.saisons) {
        console.log(`[Mugiwara] No saisons in extracted data for ${slug}`);
        return null;
    }

    const saisons = animeData.options.saisons;
    const langs = ['vostfr', 'vf'];

    // Nouveau format: EPISODES_OPTIONS sans saison.lang
    // Les URLs sont chargees cote client → impossible a recuperer sans navigateur
    if (saisons.length > 0 && !saisons[0].lang && saisons[0].langToShow) {
        console.log(`[Mugiwara] ${slug} uses new client-side format (EPISODES_OPTIONS), falling back...`);
        return null;
    }

    const matched = matchSaison(saisons, effectiveSeason, episodeNum);
    if (!matched) {
        console.log(`[Mugiwara] No matching saison for S${season}E${episodeNum} on ${slug} (available: ${saisons.filter(s => !s.notASeason).map(s => s.id + '(' + getEpisodeCount(s) + 'eps)').join(', ')})`);
        return null;
    }

    const { saison: matchedSaison, episodeIndex: epIndex } = matched;
    const seasonName = matchedSaison.name || 'Saison ' + matchedSaison.id;
    // Vrais titres FR (EPISODES_OPTIONS.names) quand dispos, sinon nom de saga.
    const displayTitle = getEpisodeDisplayTitle(animeData, epIndex, seasonName);

    const seenUrls = new Set();
    const allStreams = [];

    for (const lang of langs) {
        if (!matchedSaison.lang || !matchedSaison.lang[lang]) {
            console.log(`[Mugiwara] No ${lang} data for ${seasonName}`);
            continue;
        }

        const langEpCount = Math.max(...matchedSaison.lang[lang].map(arr => Array.isArray(arr) ? arr.length : 0));
        if (epIndex >= langEpCount) {
            console.log(`[Mugiwara] ${lang} only has ${langEpCount} episodes, S${season}E${episodeNum} out of range`);
            continue;
        }

        const streams = collectStreamsForLang(matchedSaison, lang, epIndex, displayTitle);
        for (const s of streams) {
            // Dédup par URL + langue (VF/VOSTFR partagent souvent la même
            // URL vidmoly — les deux versions doivent coexister).
            const urlKey = lang + '::' + s.url.replace(/\?.*$/, ''); // strip query params
            if (!seenUrls.has(urlKey)) {
                seenUrls.add(urlKey);
                allStreams.push(s);
            }
        }
    }

    if (allStreams.length > 0) {
        console.log(`[Mugiwara] Found ${allStreams.length} sources for ${slug} S${season}E${episodeNum} (${langs.filter(l => matchedSaison.lang && matchedSaison.lang[l]).map(l => l.toUpperCase()).join('/')})`);
        return await resolveStreams(allStreams);
    }
    return null;
}

// Soft-404 catalogue : HTTP 200 ~82 Ko, animeServer: 0, mention « Aucun ».
const SOFT404_MIN_VALID_SIZE = 85000;

function isValidCataloguePage(html, data, mediaType) {
    if (!html || !data || typeof data !== 'object') return false;
    if (mediaType === 'movie') return !!(data.options && data.options.FILM_OPTIONS);
    const saisons = data.options && data.options.saisons;
    if (!Array.isArray(saisons) || saisons.length === 0) return false;
    // Cas nominal : au moins une saga/saison avec des épisodes.
    if (saisons.some(s => getEpisodeCount(s) > 0)) return true;
    // Page listant des sagas sans bloc lang : n'accepter que si la page
    // dépasse nettement le gabarit soft-404 (~82 Ko).
    return html.length > SOFT404_MIN_VALID_SIZE;
}

// Slugs candidats depuis les titres TMDB (toSlug = tirets, pas d'espaces).
function buildSlugCandidates(titles, alreadyHave) {
    const have = new Set((alreadyHave || []).map(s => String(s).toLowerCase()));
    const seen = new Set();
    const out = [];
    const push = (slug) => {
        if (!slug || slug.length < 3) return;
        const key = slug.toLowerCase();
        if (seen.has(key) || have.has(key)) return;
        seen.add(key);
        out.push(slug);
    };
    const strTitles = titles.filter(t => t && typeof t === 'string');
    // Passe 1 : titres exacts (le principal d'abord) ; passe 2 : variantes
    // sans suffixe saison (évite que "x-saison-1" mange le quota avant
    // "shingeki-no-kyojin").
    for (const t of strTitles) {
        push(toSlug(t));
        if (out.length >= 8) break;
    }
    if (out.length < 8) {
        for (const t of strTitles) {
            const stripped = stripSeasonSuffix(t);
            if (stripped && stripped !== t) push(toSlug(stripped));
            if (out.length >= 8) break;
        }
    }
    return out;
}

// Sonde …/catalogue/<slug>/… : ne retient que les pages valides
// (rejette les soft-404 HTTP 200). Arrêt au premier valide côté appelant.
async function probeSlugCandidate(slug, mediaType) {
    const pageUrl = mediaType === 'movie'
        ? `${BASE}/catalogue/${slug}/films`
        : `${BASE}/catalogue/${slug}/episodes/saison1`;
    let html = null;
    try {
        html = await fetchText(pageUrl);
    } catch (_) { return false; }
    if (!html || html.length < 1000) return false;
    if (html.replace(/\\/g, '').includes('"animeServer":0')) {
        console.log(`[Mugiwara] Slug ${slug}: soft-404 (animeServer: 0)`);
        return false;
    }
    const data = extractAnimeServerData(html);
    if (!isValidCataloguePage(html, data, mediaType)) {
        console.log(`[Mugiwara] Slug ${slug}: page invalide/soft-404 (${html.length} o)`);
        return false;
    }
    return true;
}

// ─── Discovery via sitemap.xml ──────────────────────────────────────────────
// Le sitemap catalogue (XML statique ~450 Ko, non WAF) liste les slugs exacts
// (…/catalogue/<slug>) + les pages saisons (…/episodes/saisonN|oav|1hs…) et
// films. Indispensable pour les slugs non devinables par toSlug :
// "L'Attaque des Titans" → lattaque-des-titans (article agglutiné),
// "Demon Slayer" → demon-slayer-kimetsu-no-yaiba.
let _sitemapPromise = null;

async function getSitemapEntries() {
    if (!_sitemapPromise) {
        _sitemapPromise = (async () => {
            let xml = null;
            try {
                xml = await fetchText(`${BASE}/sitemap.xml`);
            } catch (_) { return null; }
            // Garde anti-troncature (corps >1 Mo tronqués par le runtime) :
            // la regex ne parse que des <loc> complets, dégradation gracieuse.
            if (!xml || xml.length < 1000) return null;
            const entries = [];
            const re = /<loc>([^<]*)<\/loc>/gi;
            let m;
            while ((m = re.exec(xml)) !== null) {
                const cm = m[1].trim().match(/\/catalogue\/([^\/\?#]+)(?:\/(episodes|films|scans)(?:\/([^\/\?#]+))?)?\/?$/);
                if (!cm || !cm[1]) continue;
                entries.push({ slug: decodeURIComponent(cm[1]).toLowerCase(), kind: cm[2] || 'base', page: cm[3] ? decodeURIComponent(cm[3]).toLowerCase() : null });
            }
            console.log(`[Mugiwara] Sitemap: ${entries.length} entrée(s) catalogue`);
            return entries.length > 0 ? entries : null;
        })();
    }
    return _sitemapPromise;
}

function findSitemapSlugs(entries, titles) {
    const base = [];
    const seenSlug = new Set();
    for (const e of entries) {
        if (e.kind && e.kind !== 'base') continue;
        if (seenSlug.has(e.slug)) continue;
        seenSlug.add(e.slug);
        const nr = normalize(e.slug.replace(/-/g, ' '));
        if (nr) base.push({ slug: e.slug, nr });
    }
    const seen = new Set();
    const cands = [];
    for (const t of titles) {
        if (!t || typeof t !== 'string') continue;
        const nt = normalize(t);
        if (!nt) continue;
        for (const b of base) {
            if (seen.has(b.slug)) continue;
            let score = 0;
            if (b.nr === nt) score = 100;
            else if (nt.length < 4) continue; // titres courts : égalité stricte only
            else if ((includesWord(b.nr, nt) || includesWord(nt, b.nr)) && !hasForeignLeadingTokens(b.nr, nt)) score = 80;
            else if (countCommonWords(b.nr, nt) >= 2) score = 60;
            if (score >= 60) { seen.add(b.slug); cands.push({ slug: b.slug, score, extra: countExtraWords(b.nr, nt) }); }
        }
    }
    // Tri : score, puis pénalité mots superflus (spin-off "junior-high"
    // après la série mère), puis slug court. Cap anti-budget.
    cands.sort((a, b) => b.score - a.score || a.extra - b.extra || a.slug.length - b.slug.length);
    const capped = cands.slice(0, 15);
    if (capped.length > 0) console.log(`[Mugiwara] Sitemap match: ${capped.map(c => c.slug + '(' + c.score + ')').join(', ')}${cands.length > capped.length ? ` (+${cands.length - capped.length} écartés)` : ''}`);
    return capped.map(c => c.slug);
}

// Segments de pages …/episodes/<seg> listés au sitemap pour un slug
// (ordre site : 'saison1', 'saison2', … 'oav', 'saison1hs'…).
async function getSitemapSegments(slug) {
    const entries = await getSitemapEntries();
    if (!entries) return [];
    const segs = [];
    const seen = new Set();
    for (const e of entries) {
        if (e.slug !== slug || e.kind !== 'episodes' || !e.page) continue;
        if (!seen.has(e.page)) { seen.add(e.page); segs.push(e.page); }
    }
    return segs;
}

// Slugs de sous-pages …/films/<filmSlug> listés au sitemap pour un slug
// catalogue (ordre site). Ex : jujutsu-kaisen → ['jujutsu-kaisen-0'].
async function getSitemapFilmSlugs(slug) {
    const entries = await getSitemapEntries();
    if (!entries) return [];
    const out = [];
    const seen = new Set();
    for (const e of entries) {
        if (e.slug !== slug || e.kind !== 'films' || !e.page) continue;
        if (!seen.has(e.page)) { seen.add(e.page); out.push(e.page); }
    }
    return out;
}

// Candidats film-slug de repli (sitemap vide/incomplet) : noms de films de
// l'index, slug catalogue lui-même (pages mono-film : films/<slug>),
// puis toSlug des titres TMDB.
function extractFilmSlugCandidates(slug, filmOptions, titles) {
    const cands = [];
    const seen = new Set();
    const push = (s) => {
        if (!s || s.length < 3) return;
        const key = String(s).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        cands.push(s);
    };
    const names = (filmOptions && filmOptions.names) || [];
    for (const n of names) {
        const nm = n && (typeof n === 'string' ? n : n.name);
        if (nm) push(toSlug(nm));
    }
    push(slug);
    for (const t of titles || []) {
        if (typeof t === 'string' && t) push(toSlug(stripSeasonSuffix(t)));
    }
    return cands;
}

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    // Collecter les slugs candidats (cache puis direct)
    const slugs = [];
    const cachedSlugs = await findCachedSlugs(titles);
    if (cachedSlugs && cachedSlugs.length > 0) {
        for (const s of cachedSlugs) slugs.push(s);
    } else {
        // Pas de cache → chercher directement via search
        console.log(`[Mugiwara] No cached slugs, searching directly...`);
        const directSearch = await findSlugs(titles);
        if (directSearch && directSearch.length > 0) {
            for (const s of directSearch) slugs.push(s);
        }
    }

    // Discovery sans API (2) : slugs exacts du sitemap.xml (non WAF).
    // Ex : "L'Attaque des Titans" → lattaque-des-titans (article agglutiné,
    // jamais devinable par toSlug).
    try {
        const entries = await getSitemapEntries();
        if (entries) {
            for (const s of findSitemapSlugs(entries, titles)) {
                if (isAborted(signal)) return [];
                if (!slugs.includes(s)) slugs.push(s);
            }
        }
    } catch (_) {}

    // Fallback sans API : slugs toSlug (tirets) depuis chaque titre TMDB
    // (+ variante sans suffixe saison), sondés sur …/catalogue/<slug>/….
    // Seules les pages valides sont retenues (soft-404 HTTP 200 rejetées).
    // Arrêt au premier valide. L'appel /api/search reste premier (utile en
    // résidentiel) avec son circuit-breaker.
    // Dernier recours : le sitemap couvre déjà tout le catalogue.
    const fallbackCandidates = slugs.length === 0 ? buildSlugCandidates(titles, slugs) : [];
    for (const cand of fallbackCandidates) {
        if (isAborted(signal)) return [];
        let ok = false;
        try {
            ok = await probeSlugCandidate(cand, mediaType);
        } catch (_) { ok = false; }
        if (ok) {
            console.log(`[Mugiwara] Slug direct valide: ${cand}`);
            slugs.push(cand);
            break;
        }
    }

    if (slugs.length === 0) {
        console.log(`[Mugiwara] No anime found for tmdbId ${tmdbId}`);
        return [];
    }

    console.log(`[Mugiwara] Trying ${slugs.length} slug(s): ${slugs.join(', ')}`);

    for (const slug of slugs) {
        console.log(`[Mugiwara] Trying slug: ${slug}`);

        const animeData = await getAnimeData(slug, mediaType);
        if (!animeData) {
            console.log(`[Mugiwara] Could not extract anime data for ${slug}`);
            continue;
        }

        // Garde anti-faux-match : le titre réel de la fiche doit matcher un
        // titre TMDB (ex. "BLACK TORCH" servi pour "Kamen Rider" → 0, rejeté
        // avant toute extraction d'épisodes). S'applique à TOUS les slugs
        // retenus (search, sitemap, sondes).
        const pageName = animeData && typeof animeData.anime === 'string' ? animeData.anime : '';
        const pageScore = maxPageTitleScore(pageName, titles);
        if (pageScore < TITLE_GUARD_THRESHOLD) {
            console.log(`[Mugiwara] Slug ${slug} rejeté: titre page "${pageName || '(inconnu)'}" sans rapport (score ${pageScore})`);
            continue;
        }

        if (mediaType === 'movie') {
            const filmOptions = animeData.options && animeData.options.FILM_OPTIONS;
            if (!filmOptions) {
                console.log(`[Mugiwara] No FILM_OPTIONS in extracted data`);
                continue;
            }
            // Cas nominal : l'index …/films contient déjà des URLs.
            const indexStreams = extractFilmStreams(filmOptions);
            if (indexStreams.length > 0) {
                console.log(`[Mugiwara] Found ${indexStreams.length} film sources for ${slug}`);
                const resolved = await resolveStreams(indexStreams);
                if (resolved.length > 0) return resolved;
            }
            // Migration site 2026 : l'index …/films a lang="$undefined", les
            // URLs vivent sur les sous-pages …/films/<film-slug> (ex
            // …/films/le-voyage-de-chihiro : FILM_OPTIONS.lang.vf/vostfr avec
            // sibnet/ansembed). Slugs exacts du sitemap d'abord, puis
            // candidats (noms, slug, titres TMDB). Arrêt au premier succès.
            const filmSlugs = await getSitemapFilmSlugs(slug);
            for (const c of extractFilmSlugCandidates(slug, filmOptions, titles)) {
                if (!filmSlugs.includes(c)) filmSlugs.push(c);
            }
            for (const filmSlug of filmSlugs.slice(0, 6)) {
                if (isAborted(signal)) return [];
                let subHtml = null;
                try {
                    subHtml = await fetchText(`${BASE}/catalogue/${slug}/films/${filmSlug}`);
                } catch (_) {}
                if (!subHtml || subHtml.length < 1000) continue;
                const subData = extractAnimeServerData(subHtml);
                const subFilms = subData && subData.options && subData.options.FILM_OPTIONS;
                if (!subFilms || typeof subFilms.lang !== 'object') continue;
                // Garde anti-faux-match (films) : titre de la sous-page film
                // vs titres TMDB (repli sur le titre de l'index, déjà validé,
                // si la sous-page n'expose pas de champ "anime").
                const subName = (subData && typeof subData.anime === 'string' && subData.anime) || pageName;
                if (maxPageTitleScore(subName, titles) < TITLE_GUARD_THRESHOLD) {
                    console.log(`[Mugiwara] Film ${slug}/films/${filmSlug} rejeté: titre page "${subName || '(inconnu)'}" sans rapport`);
                    continue;
                }
                const streams = extractFilmStreams(subFilms);
                if (streams.length === 0) continue;
                console.log(`[Mugiwara] Found ${streams.length} film sources on ${slug}/films/${filmSlug}`);
                const resolved = await resolveStreams(streams);
                if (resolved.length > 0) return resolved;
            }
            continue;
        }

        // Essai 1 : données de la page par défaut (…/episodes/saison1)
        // NB : [] (sources trouvées mais résolution vide) = échec → slug
        // suivant, PAS un succès ([] est truthy en JS).
        const result = await trySeriesStreams(slug, animeData, season, episodeNum, effectiveSeason);
        if (result && result.length > 0) return result;
        if (result) console.log(`[Mugiwara] ${slug}: résolution vide, slug suivant`);

        // Essai 2 : pages dédiées (saisons ≥ 2, sagas One Piece…). On sonde
        // les ids listés sur la page saison1 — id de saga matché en premier,
        // pas le numéro TMDB — + les segments exacts du sitemap (saisonN,
        // oav, saison1hs…), au lieu de saison2..5 en dur.
        const listedSaisons = animeData.options && animeData.options.saisons;
        if (listedSaisons && listedSaisons.length > 0) {
            const seenP = new Set(['saison1']); // déjà chargée
            const probes = [];
            const addProbe = (sagaId, isSegment) => {
                const raw = String(sagaId == null ? '' : sagaId).trim();
                if (!raw) return;
                const pageId = (isSegment || /^saison/i.test(raw)) ? raw.toLowerCase() : 'saison' + raw;
                if (seenP.has(pageId)) return;
                seenP.add(pageId);
                probes.push({ sagaId: raw, isSegment: !!isSegment });
            };
            const matched0 = matchSaison(listedSaisons, effectiveSeason, episodeNum);
            if (matched0 && matched0.saison && matched0.saison.id != null) addProbe(matched0.saison.id, false);
            for (const seg of await getSitemapSegments(slug)) addProbe(seg, true);
            for (const s of listedSaisons) {
                if (s.notASeason || s.id == null) continue;
                addProbe(s.id, false);
            }
            addProbe(season, false);
            for (const p of probes.slice(0, 6)) {
                if (isAborted(signal)) return [];
                const pageData = await getSaisonPageData(slug, p.sagaId, p.isSegment);
                if (pageData) {
                    console.log(`[Mugiwara] Retrying ${slug} with dedicated page ${p.isSegment ? p.sagaId : 'saison' + p.sagaId}`);
                    const retry = await trySeriesStreams(slug, pageData, season, episodeNum, effectiveSeason);
                    if (retry && retry.length > 0) return retry;
                }
            }
        }
    }

    console.log(`[Mugiwara] No streams found for tmdbId ${tmdbId} after trying ${slugs.length} slug(s)`);
    return [];
}
