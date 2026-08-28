/**
 * Extractor Logic for Anime-Sama
 * Optimisé : réduit le slug probing, fetchJs séquentiel, budget check renforcé
 */

import { fetchText, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, withTimeout, isBudgetExhausted, sortStreamsByLanguage, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { toSlug, stripSeasonSuffix, resolveTargetEpisodes } from '../utils/dle-extractor.js';

const BASE_URL = "https://anime-sama.to";
const MAX_FALLBACK_TITLES = 5;
const MAX_FALLBACK_SLUGS = 2;
const BUDGET_MS = 40000;

/**
 * Search for slugs on Anime-Sama, scored by relevance to the query
 */
async function searchSlugsScored(query) {
    try {
        const html = await withTimeout(fetchText(`${BASE_URL}/template-php/defaut/fetch.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': BASE_URL
            },
            body: `query=${encodeURIComponent(query)}`
        }), 8000, `search ${query.slice(0, 30)}`);
        const $ = cheerio.load(html);
        const results = [];
        $('a[href*="/catalogue/"]').each((i, el) => {
            const h = $(el).attr('href');
            const match = h.match(/\/catalogue\/([^/]+)\/?/);
            if (!match) return;
            const slug = match[1];
            if (results.some(r => r.slug === slug)) return;
            const title = $(el).find('.asn-search-result-title').text().trim();
            const subtitle = $(el).find('.asn-search-result-subtitle').text().trim();
            const score = scoreSearchResult(title, subtitle, query);
            results.push({ slug, title, subtitle, score });
        });
        results.sort((a, b) => b.score - a.score);
        // Only return slugs with a meaningful score (avoid false positives)
        return results.filter(r => r.score >= 15).map(r => r.slug);
    } catch (e) { return []; }
}

function scoreSearchResult(resultTitle, resultSubtitle, query) {
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = resultTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const s = resultSubtitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let score = 0;
    if (t === q) return 100;
    if (t.includes(q)) score += 60;
    else if (q.includes(t)) {
        // Penalize short results that are substrings of the query
        // e.g. "Another" in "No Longer Allowed in Another World" → low score
        const qWordCount = q.split(/[^a-z0-9]+/).filter(w => w.length > 2).length;
        const tWordCount = t.split(/[^a-z0-9]+/).filter(w => w.length > 2).length;
        if (qWordCount > 1 && tWordCount <= 1) {
            // Single-word result in a multi-word query: heavy penalty
            score += 10;
        } else {
            score += 50;
        }
    }

    const qWords = q.split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const tWords = t.split(/[^a-z0-9]+/).filter(w => w.length > 2);

    for (const w of qWords) {
        if (tWords.includes(w)) score += 15;
    }
    for (const w of qWords) {
        if (s.includes(w) && !t.includes(w)) score += 3;
    }

    // Anti-false-positive: penalize if result has very few words compared to query
    // e.g. "Another" (1 word) matching "No Longer Allowed in Another World" (5 words)
    if (qWords.length >= 3 && tWords.length <= 1) {
        score = Math.min(score, 5);
    } else if (qWords.length >= 2 && tWords.length <= 1) {
        score = Math.min(score, 10);
    }

    return score;
}



function getPlayerName(varName, url) {
    if (url.includes('sibnet')) return 'Sibnet';
    if (url.includes('vidmoly')) return 'Vidmoly';
    if (url.includes('sendvid')) return 'Sendvid';
    if (url.includes('voe')) return 'Voe';
    if (url.includes('stape') || url.includes('streamtape')) return 'Streamtape';
    if (url.includes('dood')) return 'Doodstream';
    if (url.includes('uqload') || url.includes('oneupload')) return 'Uqload';
    return 'Player';
}

function parseUrls(jsContent) {
    const varRegex = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm;
    const results = [];
    let match;
    while ((match = varRegex.exec(jsContent)) !== null) {
        const urls = match[2].match(/['"]([^'"]+)['"]/g)?.map(u => u.slice(1, -1)) || [];
        results.push({ varName: match[1], urls });
    }
    return results;
}

async function fetchJs(slug, seasonPath, lang) {
    const url = `${BASE_URL}/catalogue/${slug}${seasonPath ? '/' + seasonPath : ''}/${lang}/episodes.js`;
    try {
        const content = await withTimeout(fetchText(url), 8000, `fetchJs ${slug}`);
        return content || null;
    } catch (e) { return null; }
}

async function buildStreams(parsed, lang, episode, idx) {
    // OPTIMISATION: Résolution séquentielle avec early-exit
    // (fetch synchrone en QuickJS = Promise.allSettled ne parallélise pas)
    const TARGET_DIRECT = 2;
    const playable = [];
    const startTime = Date.now();
    const BUDGET_MS = 12000;

    for (const { varName, urls } of parsed) {
        if (playable.length >= TARGET_DIRECT) break;
        if (Date.now() - startTime > BUDGET_MS) break;

        const playerUrl = urls[idx];
        if (!playerUrl || !playerUrl.startsWith('http')) continue;

        const epLabel = episode ? `Ep ${episode} - ` : '';
        try {
            const stream = await withTimeout(
                resolveStream({
                    name: `Anime-Sama (${lang.toUpperCase()})`,
                    title: `${getPlayerName(varName, playerUrl)} - ${epLabel}${lang.toUpperCase()}`,
                    url: playerUrl,
                    quality: "HD",
                    headers: { "Referer": BASE_URL }
                }),
                8000,
                `AnimeSama player ${getPlayerName(varName, playerUrl)}`
            );
            if (stream) playable.push(stream);
        } catch (e) { /* skip failed player */ }
    }
    return playable;
}

async function fetchAndGetUrl(slug, lang, season, episode, mediaType, altEpisodes = []) {
    const episodesToTry = [episode, ...altEpisodes.filter(e => e !== episode)];

    if (mediaType === 'movie') {
        const jsContent = await fetchJs(slug, 'film', lang);
        if (!jsContent) return [];
        const parsed = parseUrls(jsContent);
        if (parsed.length === 0) return [];
        return buildStreams(parsed, lang, null, 0);
    }

    for (const ep of episodesToTry) {
        const result = await tryFetchEpisode(slug, lang, season, ep);
        if (result.length > 0) return result;
    }
    return [];
}

/**
 * Récupère les épisodes pour un slug/lang/saison.
 * Optimisé : fetch d'abord main+root, puis sub-seasons seulement si nécessaire.
 */
async function tryFetchEpisode(slug, lang, season, episode) {
    // OPTIMISATION: Fetch séquentiel (fetch synchrone en QuickJS)
    // Essayer main season d'abord (le plus probable), root en fallback
    const mainJs = await fetchJs(slug, `saison${season}`, lang);

    // Traiter le main season d'abord
    if (mainJs) {
        const parsed = parseUrls(mainJs);
        if (parsed.length > 0) {
            const totalEps = parsed[0].urls.length;
            if (episode >= 1 && episode <= totalEps) {
                return buildStreams(parsed, lang, episode, episode - 1);
            }

            // Le épisode n'est pas dans le main season : chercher dans les sub-seasons
            let cumulativeEps = totalEps;
            const subSeasons = ['2', '3', '4', '5'];
            for (const subNum of subSeasons) {
                const subJs = await fetchJs(slug, `saison${season}-${subNum}`, lang);
                if (!subJs) continue;
                const subParsed = parseUrls(subJs);
                if (subParsed.length === 0) continue;
                const subTotal = subParsed[0].urls.length;
                const localEp = episode - cumulativeEps;
                if (localEp >= 1 && localEp <= subTotal) {
                    return buildStreams(subParsed, lang, episode, localEp - 1);
                }
                cumulativeEps += subTotal;
            }
        }
    }

    // Essayer le root path (sans préfixe de saison) - fetch en fallback
    const rootJs = await fetchJs(slug, '', lang);
    if (rootJs) {
        const parsed = parseUrls(rootJs);
        if (parsed.length > 0) {
            const idx = episode - 1;
            if (idx >= 0 && idx < parsed[0].urls.length) {
                return buildStreams(parsed, lang, episode, idx);
            }
        }
    }

    return [];
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
    const startTime = Date.now();

    // --- ArmSync: resolve absolute episode for TV series ---
    const episodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: BUDGET_MS });
    const altEpisodes = episodes.length > 1 ? [episodes[1]] : [];
    // ------------------------------------

    const title = titles[0];
    const slug = toSlug(title);
    const languages = ['vostfr', 'vf'];
    const streams = [];

    // OPTIMISATION: Traitement séquentiel des langues avec early-exit
    // (fetch synchrone en QuickJS = Promise.all ne parallélise pas)
    const TARGET_STREAMS = 3;

    // Primary: try the generated slug for each language
    if (!isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        for (const lang of languages) {
            if (streams.length >= TARGET_STREAMS) break;
            const result = await fetchAndGetUrl(slug, lang, effectiveSeason, episode, mediaType, altEpisodes);
            streams.push(...result);
        }
    }

    // If primary failed, try slug with season suffix (e.g., "overlord-saison-3")
    if (streams.length === 0 && effectiveSeason > 1 && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const seasonSlug = `${slug}-saison-${effectiveSeason}`;
        for (const lang of languages) {
            if (streams.length >= TARGET_STREAMS) break;
            const result = await fetchAndGetUrl(seasonSlug, lang, effectiveSeason, episode, mediaType, altEpisodes);
            streams.push(...result);
        }
    }

    // If still empty, try season numeric slug (e.g., "overlord-3")
    if (streams.length === 0 && effectiveSeason > 1 && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const numSlug = `${slug}-${effectiveSeason}`;
        for (const lang of languages) {
            if (streams.length >= TARGET_STREAMS) break;
            const result = await fetchAndGetUrl(numSlug, lang, effectiveSeason, episode, mediaType, altEpisodes);
            streams.push(...result);
        }
    }

    // If primary failed, try search API to find correct slug (much faster than alt slug probing)
    if (streams.length === 0 && !isAborted(signal) && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const foundSlugs = [];
        // Strip season suffixes before searching ("No Longer Allowed in Another World Season 1"
        // returns wrong results; "No Longer Allowed in Another World" returns correct slug)
        const searchTitles = titles.slice(0, MAX_FALLBACK_TITLES).map(t => stripSeasonSuffix(t));
        for (const t of searchTitles) {
            const slugs = await searchSlugsScored(t);
            for (const s of slugs) {
                if (!foundSlugs.includes(s)) foundSlugs.push(s);
                if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
            }
            if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
        }

        const checkedSlugs = new Set([slug]);
        for (const fSlug of foundSlugs) {
            if (checkedSlugs.has(fSlug)) continue;
            checkedSlugs.add(fSlug);
            if (streams.length >= TARGET_STREAMS) break;

            for (const lang of languages) {
                if (streams.length >= TARGET_STREAMS) break;
                const result = await fetchAndGetUrl(fSlug, lang, effectiveSeason, episode, mediaType, altEpisodes);
                streams.push(...result);
            }
        }
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[Anime-Sama] Total streams found: ${validStreams.length}`);

    return sortStreamsByLanguage(validStreams);
}
