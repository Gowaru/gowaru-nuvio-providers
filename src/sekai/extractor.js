/**
 * Extractor Logic for Sekai (sekai.one)
 * Rewritten for the new site architecture:
 * - Homepage (/) returns 301 redirect → n'utilise plus seriesData
 * - episodesData.js contient les slugs actifs
 * - Saga pages (/piece/saga-1) contiennent le JS inline avec atob() + episodeHD[N]
 */

import { fetchText, setCurrentSignal } from './http.js';
import { isBudgetExhausted, isAborted } from '../utils/resolvers.js';
import { resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { createCache } from '../utils/cache.js';

const BASE_URL = "https://sekai.one";
const BUDGET_MS = 40000;
const CACHE_TTL = 300000; // 5 min

// Cache partagé — TTL long (données épisodes changent rarement)
const withCache = createCache('sk', 'Sekai', { successTtl: 10 * 60_000, maxSize: 200 }); // 10min

// Slug alternatif pour les séries dont le slug sekai diffère du toSlug()
const SLUG_OVERRIDES = {
  'one-piece': 'piece',
  'one piece': 'piece',
  'dr-stone': 'drstone',
  'dr stone': 'drstone',
  're-zero': 'rezero',
  're zero': 'rezero',
  're:zero': 'rezero',
  're:zero kara hajimeru isekai seikatsu': 'rezero',
  'jojos-bizarre-adventure': 'jojo',
  'jojo no kimyou na bouken': 'jojo',
  'jojos': 'jojo',
  'ghost in the shell': 'ghost',
  'black clover': 'black',
  'black': 'black',
};

function toSekaiSlug(title) {
    if (!title) return '';
    let slug = title.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, '')
        .replace(/[':!.,?'']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .replace(/-+/g, '-');

    // Appliquer les overrides pour les slugs sekai spécifiques
    if (SLUG_OVERRIDES[slug]) return SLUG_OVERRIDES[slug];

    return slug;
}

function normalizeTitle(s) {
    if(!s) return "";
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, '')
        .replace(/[':!.,?]/g, '')
        .replace(/\b(the|season|part|cour)\b/ig, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function scoreMatch(searchTerm, candidate) {
    if (!searchTerm || !candidate) return 0;
    if (searchTerm === candidate) return 100;
    if (candidate.includes(searchTerm) && searchTerm.length >= 4) return 80;
    if (searchTerm.includes(candidate) && candidate.length >= 4) return 70;
    return 0;
}

/**
 * Parse episodesData.js pour obtenir les slugs de séries actifs.
 * episodesData.js = window.episodesData = { op: {lastEpisode:1168,...}, drstone: {...}, ... }
 * Cache partagé via createCache('sk') — TTL 5min succès, 30s échec.
 */
async function getSeriesSlugs() {
    return withCache('series_slugs_from_api', async () => {
        try {
            const js = await fetchText(`${BASE_URL}/episodesData.js`);
            // Extrait les clés de l'objet: { op: { ... }, drstone: { ... }, ... }
            const slugKeys = [];
            const slugRegex = /^\s*([a-zA-Z0-9_]+)\s*:\s*\{/gm;
            let match;
            while ((match = slugRegex.exec(js)) !== null) {
                const key = match[1];
                if (!slugKeys.includes(key)) slugKeys.push(key);
            }

            // Construire les données de séries (slug → URL)
            const results = [];
            for (const key of slugKeys) {
                // "op" → "piece" (One Piece), autres slugs directement
                const urlSlug = (key === 'op') ? 'piece' : key;
                results.push({
                    title: key,          // nom interne (op, drstone)
                    url: `${BASE_URL}/${urlSlug}`,
                    slug: urlSlug,       // slug URL réel
                });
            }

            console.log(`[Sekai] Loaded ${results.length} series slugs from episodesData.js`);
            return results;
        } catch (e) {
            console.error(`[Sekai] Failed to parse episodesData.js: ${e.message}`);
            return [];
        }
    }, { successTtl: CACHE_TTL });
}

/**
 * Construit un mapping épisodes complet à partir des saga pages.
 * Chaque saga page contient:
 *   var mu4 = atob("aHR0cHM6Ly80Lm11Z2l3YXJhLm9uZS8=")  → https://4.mugiwara.one/
 *   episodeHD[1] = mu4 + "op/saga-1/hd/op-01.mp4"
 */
function parseEpisodeMapFromHtml(html) {
    const epMap = {}; // { num: { episodeHD: url, episode?: url, episodeLow?: url } }

    // Étape 1: Décoder toutes les constantes atob()
    const b64Regex = /var\s+([a-zA-Z0-9_]+)\s*=\s*atob\(\"([^\"]+)\"\)/g;
    const constants = {};
    for (const match of html.matchAll(b64Regex)) {
        try {
            constants[match[1]] = atob(match[2]);
        } catch (e) {
            // Ignorer les atob() invalides
        }
    }

    // Étape 2: Extraire les assignations episodeHD[N]
    // Pattern: episodeHD[1] = mu4 + "op/saga-1/hd/op-01.mp4"
    const epHdRegex = /episodeHD\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*\"([^\"]+\.mp4)\"/g;
    for (const match of html.matchAll(epHdRegex)) {
        const num = parseInt(match[1]);
        const domainVar = match[2];
        const path = match[3];
        const domain = constants[domainVar] || '';
        if (!epMap[num]) epMap[num] = {};
        epMap[num].episodeHD = domain + path;
    }

    // Étape 3: Extraire les assignations episode[N] (SD)
    const epSdRegex = /episode\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*\"([^\"]+\.mp4)\"/g;
    for (const match of html.matchAll(epSdRegex)) {
        const num = parseInt(match[1]);
        const domainVar = match[2];
        const path = match[3];
        const domain = constants[domainVar] || '';
        if (!epMap[num]) epMap[num] = {};
        epMap[num].episode = domain + path;
    }

    // Étape 4: Extraire les assignations episodeLow[N]
    const epLowRegex = /episodeLow\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*\"([^\"]+\.mp4)\"/g;
    for (const match of html.matchAll(epLowRegex)) {
        const num = parseInt(match[1]);
        const domainVar = match[2];
        const path = match[3];
        const domain = constants[domainVar] || '';
        if (!epMap[num]) epMap[num] = {};
        epMap[num].episodeLow = domain + path;
    }

    return epMap;
}

/**
 * Extrait les URLs des saga pages à partir de la page série principale.
 * Pattern: href="piece/saga-12" ou dans les attr-data
 */
function extractSagaUrls(html, slug) {
    const sagas = new Set();

    // Pattern 1: href="slug/saga-N" (liens de navigation)
    const hrefRegex = new RegExp(`href=["']${slug}/saga-(\\d+)["']`, 'gi');
    for (const match of html.matchAll(hrefRegex)) {
        sagas.add(`${BASE_URL}/${slug}/saga-${match[1]}`);
    }

    // Pattern 2: onclick ou href contenant saga-N (évite les CSS classes)
    const attrRegex = new RegExp(`(?:href|onclick)=["'][^"']*saga-(\\d+)`, 'gi');
    for (const match of html.matchAll(attrRegex)) {
        const num = match[1];
        if (num && !isNaN(num)) {
            sagas.add(`${BASE_URL}/${slug}/saga-${num}`);
        }
    }

    return [...sagas].sort((a, b) => {
        const na = parseInt(a.match(/saga-(\d+)/)?.[1] || '0');
        const nb = parseInt(b.match(/saga-(\d+)/)?.[1] || '0');
        return na - nb;
    });
}

/**
 * Récupère les données de séries pour le title matching.
 * Combine episodesData.js + titles from series pages.
 */
async function getSeriesData() {
    const slugs = await getSeriesSlugs();
    if (slugs.length === 0) return [];

    return slugs.map(s => ({
        title: s.slug,
        url: s.url,
        aliases: [s.title], // le nom interne comme alias
    }));
}

/**
 * Récupère la page d'une saga et parse les épisodes.
 * Cache partagé via createCache('sk') — TTL 5min succès, 30s échec.
 * Remplace l'ancien sagaPageCache Map + gestion manuelle TTL.
 */
async function fetchSagaPage(sagaUrl) {
    return withCache(`saga_page_${sagaUrl}`, async () => {
        try {
            const html = await fetchText(sagaUrl);
            return (html && html.length > 1000) ? html : '';
        } catch (e) {
            return '';
        }
    }, { successTtl: CACHE_TTL });
}

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const startTime = Date.now();
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const [ep, absoluteEp] = await resolveTargetEpisodes(tmdbId, mediaType, season, episodeNum, { startTime, budgetMs: BUDGET_MS });
    const absEp = absoluteEp || ep;

    console.log(`[Sekai] Checking ${mediaType} S${season} E${episodeNum} -> Absolute: ${absEp}`);

    // 1. Générer le slug sekai depuis le premier titre TMDB
    //    Si le slug principal échoue, on essaie tous les titres alternatifs
    const slug = toSekaiSlug(titles[0]);
    let seriesUrl = `${BASE_URL}/${slug}`;

    // 2. Fetch la page série pour trouver les sagas
    let mainHtml = '';
    try {
        mainHtml = await fetchText(seriesUrl);
    } catch (e) {
        console.log(`[Sekai] Series page not found at ${seriesUrl}`);
    }

    // 3. Si le slug principal échoue, essayer les titres alternatifs (ex: titre EN vs FR)
    if (mainHtml.length < 5000) {
        for (const altTitle of titles.slice(1)) {
            if (!altTitle || isBudgetExhausted(startTime, BUDGET_MS)) break;
            const altSlug = toSekaiSlug(altTitle);
            if (altSlug === slug) continue; // même slug, déjà essayé

            const altUrl = `${BASE_URL}/${altSlug}`;
            try {
                mainHtml = await fetchText(altUrl);
                if (mainHtml.length >= 5000) {
                    seriesUrl = altUrl;
                    console.log(`[Sekai] Alternative title matched: "${altTitle}" → ${altUrl}`);
                    break;
                }
            } catch (e) { /* ignore */ }
        }
    }

    // 4. Fallback: si toujours rien, essayer les slugs connus depuis episodesData.js
    if (mainHtml.length < 5000) {
        const allSeries = await getSeriesData();
        if (allSeries.length > 0) {
            console.log(`[Sekai] Trying fallback across ${allSeries.length} known slugs...`);

            // Étape A: score matching entre les titres TMDB et les slugs connus
            for (const s of allSeries) {
                if (isBudgetExhausted(startTime, BUDGET_MS)) break;

                for (const t of titles) {
                    if (!t) continue;
                    const nt = normalizeTitle(t);
                    const ns = normalizeTitle(s.slug);
                    const score = scoreMatch(nt, ns);
                    if (score >= 70) {
                        try {
                            mainHtml = await fetchText(s.url);
                            if (mainHtml.length >= 5000) {
                                seriesUrl = s.url;
                                console.log(`[Sekai] Fallback (score): ${s.url}`);
                            }
                        } catch (e) { /* ignore */ }
                        break;
                    }
                }

                if (mainHtml.length >= 5000) break;
            }

            // Étape B: dernier recours — essayer TOUS les slugs connus
            if (mainHtml.length < 5000) {
                for (const s of allSeries) {
                    if (isBudgetExhausted(startTime, BUDGET_MS)) break;
                    const sUrl = `${BASE_URL}/${s.slug}`;
                    if (sUrl === seriesUrl) continue;
                    try {
                        mainHtml = await fetchText(sUrl);
                        if (mainHtml.length >= 5000) {
                            seriesUrl = sUrl;
                            console.log(`[Sekai] Fallback (brute): ${sUrl}`);
                            break;
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        }

        if (mainHtml.length < 5000) {
            console.log(`[Sekai] No series page found for tmdbId ${tmdbId}`);
            return [];
        }
    }

    console.log(`[Sekai] Series page: ${seriesUrl || 'fallback'}`);

    // 3. Extraire le slug depuis l'URL effectivement utilisée (ou celle du fallback)
    // L'URL réelle peut différer du slug original si le fallback a trouvé une autre série
    const actualSeriesUrl = mainHtml.length >= 5000 && seriesUrl ? seriesUrl : null;
    const effectiveSlug = actualSeriesUrl
        ? actualSeriesUrl.split('/').pop().replace(/\?.*$/, '')
        : slug;
    
    if (!effectiveSlug) {
        console.log(`[Sekai] Could not determine slug for series page`);
        return [];
    }
    const sagaUrls = extractSagaUrls(mainHtml, effectiveSlug);
    console.log(`[Sekai] Found ${sagaUrls.length} sagas for slug "${effectiveSlug}"`);

    // 4. Fetch les saga pages et construire le mapping des épisodes
    let epMap = {};

    // Cas 1: Séries avec sagas (ex: One Piece) — fetch les pages saga
    const sagasToFetch = sagaUrls.slice(0, 6);
    if (!isBudgetExhausted(startTime, BUDGET_MS) && sagasToFetch.length > 0) {
        // Fetch en parallèle avec limite de concurrence (3 à la fois)
        let idx = 0;
        while (idx < sagasToFetch.length && !isBudgetExhausted(startTime, BUDGET_MS)) {
            const batch = sagasToFetch.slice(idx, idx + 3);
            const batchHtmls = await Promise.all(
                batch.map(url => fetchSagaPage(url).catch(() => ''))
            );

            for (const html of batchHtmls) {
                if (!html || html.length < 1000) continue;
                const sagaMap = parseEpisodeMapFromHtml(html);
                // Merge dans epMap
                for (const [num, sources] of Object.entries(sagaMap)) {
                    if (!epMap[num]) epMap[num] = {};
                    Object.assign(epMap[num], sources);
                }
            }

            // Early exit: si l'épisode est trouvé, arrêter de fetcher les sagas
            if (epMap[absEp] && Object.keys(epMap[absEp]).length > 0) {
                console.log(`[Sekai] Found episode ${absEp} (early exit after batch)`);
                break;
            }

            idx += 3;
        }
    }

    // Cas 2: Séries sans sagas (JJK, Demon Slayer, etc.) — parser directement la page série
    // Ces séries ont episode[N] / episodeLow[N] directement dans le HTML
    if (Object.keys(epMap).length === 0 && mainHtml && mainHtml.length > 1000) {
        console.log(`[Sekai] No sagas found, parsing main series page directly...`);
        const mainMap = parseEpisodeMapFromHtml(mainHtml);
        for (const [num, sources] of Object.entries(mainMap)) {
            if (!epMap[num]) epMap[num] = {};
            Object.assign(epMap[num], sources);
        }
        if (Object.keys(epMap).length > 0) {
            console.log(`[Sekai] Parsed ${Object.keys(epMap).length} episodes from main page`);
        }
    }

    // 5. Vérifier si l'épisode demandé est dans le mapping
    if (epMap[absEp] && Object.keys(epMap[absEp]).length > 0) {
        console.log(`[Sekai] Found episode ${absEp} in saga pages`);
        return formatStreams(epMap[absEp]);
    }

    console.log(`[Sekai] Episode ${absEp} not found in ${Object.keys(epMap).length} parsed episodes across ${sagasToFetch.length} sagas`);
    return [];
}

function formatStreams(epSources) {
    const streams = [];
    if (epSources.episodeHD) {
        streams.push({
             name: "Sekai (VOSTFR)",
             title: "Sekai-HD - VOSTFR",
             url: epSources.episodeHD,
             quality: "1080p",
             isDirect: true,
             headers: { "Referer": BASE_URL }
        });
    }
    if (epSources.episode) {
        streams.push({
             name: "Sekai (VOSTFR)",
             title: "Sekai-SD - VOSTFR",
             url: epSources.episode,
             quality: "720p",
             isDirect: true,
             headers: { "Referer": BASE_URL }
        });
    }
    if (epSources.episodeLow) {
        streams.push({
             name: "Sekai (VOSTFR)",
             title: "Sekai-LOW - VOSTFR",
             url: epSources.episodeLow,
             quality: "360p",
             isDirect: true,
             headers: { "Referer": BASE_URL }
        });
    }
    return streams;
}
