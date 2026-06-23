/**
 * Extractor Logic for Anime-Sama
 * Optimisé : réduit le slug probing, fetchJs séquentiel, budget check renforcé
 */

import { fetchText } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, withTimeout, isBudgetExhausted, sortStreamsByLanguage } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { getImdbId, getAbsoluteEpisode } from '../utils/armsync.js';

const BASE_URL = "https://anime-sama.to";
const MAX_FALLBACK_TITLES = 2;
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
        return results.map(r => r.slug);
    } catch (e) { return []; }
}

function scoreSearchResult(resultTitle, resultSubtitle, query) {
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t = resultTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const s = resultSubtitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let score = 0;
    if (t === q) return 100;
    if (t.includes(q)) score += 60;
    else if (q.includes(t)) score += 50;

    const qWords = q.split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const tWords = t.split(/[^a-z0-9]+/).filter(w => w.length > 2);

    for (const w of qWords) {
        if (tWords.includes(w)) score += 15;
    }
    for (const w of qWords) {
        if (s.includes(w) && !t.includes(w)) score += 3;
    }

    return score;
}

function toSlug(title) {
    return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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

function buildStreams(parsed, lang, episode, idx) {
    const promises = [];
    for (const { varName, urls } of parsed) {
        const playerUrl = urls[idx];
        if (playerUrl && playerUrl.startsWith('http')) {
            const epLabel = episode ? `Ep ${episode} - ` : '';
            const promise = withTimeout(
                resolveStream({
                    name: `Anime-Sama (${lang.toUpperCase()})`,
                    title: `${getPlayerName(varName, playerUrl)} - ${epLabel}${lang.toUpperCase()}`,
                    url: playerUrl,
                    quality: "HD",
                    headers: { "Referer": BASE_URL }
                }),
                12000,
                `AnimeSama player ${getPlayerName(varName, playerUrl)}`
            );
            promises.push(promise);
        }
    }
    return Promise.allSettled(promises).then(r => r.filter(s => s.status === 'fulfilled' && s.value != null).map(s => s.value));
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
    // Étape 1 : fetch main season + root en parallèle (les plus probables)
    const [mainJs, rootJs] = await Promise.all([
        fetchJs(slug, `saison${season}`, lang),
        fetchJs(slug, '', lang),
    ]);

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

    // Essayer le root path (sans préfixe de saison)
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

export async function extractStreams(tmdbId, mediaType, season, episode) {
    const startTime = Date.now();
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    // --- ARMSYNC Metadata Resolution ---
    let altEpisodes = [];
    if (mediaType === 'tv' && !isBudgetExhausted(startTime, BUDGET_MS)) {
        try {
            const imdbId = await getImdbId(tmdbId, mediaType);
            if (imdbId && !isBudgetExhausted(startTime, BUDGET_MS)) {
                const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
                if (absoluteEpisode && absoluteEpisode !== episode) {
                    altEpisodes.push(absoluteEpisode);
                }
            }
        } catch (e) {
            console.warn(`[Anime-Sama] ArmSync failed: ${e.message}`);
        }
    }
    // ------------------------------------

    const title = titles[0];
    const slug = toSlug(title);
    const languages = ['vostfr', 'vf'];
    const streams = [];

    // Primary: try the generated slug for each language
    if (!isBudgetExhausted(startTime, BUDGET_MS)) {
        const primaryPromises = [];
        for (const lang of languages) {
            primaryPromises.push(fetchAndGetUrl(slug, lang, effectiveSeason, episode, mediaType, altEpisodes));
        }
        const primaryResults = await Promise.all(primaryPromises);
        for (const result of primaryResults) {
            streams.push(...result);
        }
    }

    // If primary failed, try slug with season suffix (e.g., "overlord-saison-3")
    if (streams.length === 0 && effectiveSeason > 1 && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const seasonSlug = `${slug}-saison-${effectiveSeason}`;
        const seasonPromises = [];
        for (const lang of languages) {
            seasonPromises.push(fetchAndGetUrl(seasonSlug, lang, effectiveSeason, episode, mediaType, altEpisodes));
        }
        const seasonResults = await Promise.all(seasonPromises);
        for (const result of seasonResults) {
            streams.push(...result);
        }
    }

    // If still empty, try season numeric slug (e.g., "overlord-3")
    if (streams.length === 0 && effectiveSeason > 1 && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const numSlug = `${slug}-${effectiveSeason}`;
        const numPromises = [];
        for (const lang of languages) {
            numPromises.push(fetchAndGetUrl(numSlug, lang, effectiveSeason, episode, mediaType, altEpisodes));
        }
        const numResults = await Promise.all(numPromises);
        for (const result of numResults) {
            streams.push(...result);
        }
    }

    // Multi-title slug fallback: limité à 5 slugs vraiment uniques (pas juste des variantes de saison)
    if (streams.length === 0 && titles.length > 1 && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const triedSlugs = new Set([slug]);
        const altSlugTasks = [];
        const seasonSuffixRe = /-(?:saison|season|s)\d+$/i;
        let slugsAdded = 0;

        for (let i = 1; i < titles.length && slugsAdded < 5; i++) {
            const altSlug = toSlug(titles[i]);
            if (!altSlug || triedSlugs.has(altSlug)) continue;
            triedSlugs.add(altSlug);
            // Skip season-only variants of the same base slug
            if (altSlug.replace(seasonSuffixRe, '') === slug) continue;
            slugsAdded++;

            for (const lang of languages) {
                const task = withTimeout(
                    fetchAndGetUrl(altSlug, lang, effectiveSeason, episode, mediaType, altEpisodes),
                    5000,
                    `alt-slug ${altSlug}`
                ).catch(() => []);
                altSlugTasks.push(task);
            }
        }

        if (altSlugTasks.length > 0) {
            console.log(`[Anime-Sama] Trying ${altSlugTasks.length} alt slug probes (max 5 slugs)`);
            // Limiter la concurrence à 3 pour éviter de flooder
            let resolvedCount = 0;
            while (resolvedCount < altSlugTasks.length && !isBudgetExhausted(startTime, BUDGET_MS)) {
                const batch = altSlugTasks.slice(resolvedCount, resolvedCount + 3);
                const batchResults = await Promise.allSettled(batch);
                for (const r of batchResults) {
                    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
                        streams.push(...r.value);
                    }
                }
                if (streams.length > 0) break;
                resolvedCount += 3;
            }
        }
    }

    // Fallback search
    if (streams.length === 0 && !isBudgetExhausted(startTime, BUDGET_MS)) {
        const foundSlugs = [];
        for (const t of titles.slice(0, MAX_FALLBACK_TITLES)) {
            const slugs = await searchSlugsScored(t);
            for (const s of slugs) {
                if (!foundSlugs.includes(s)) foundSlugs.push(s);
                if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
            }
            if (foundSlugs.length >= MAX_FALLBACK_SLUGS) break;
        }

        const checkedSlugs = new Set([slug]);
        const fallbackPromises = [];

        for (const fSlug of foundSlugs) {
            if (checkedSlugs.has(fSlug)) continue;
            checkedSlugs.add(fSlug);

            for (const lang of languages) {
                fallbackPromises.push(fetchAndGetUrl(fSlug, lang, effectiveSeason, episode, mediaType, altEpisodes));
            }
        }

        if (fallbackPromises.length > 0) {
            const fallbackResults = await Promise.all(fallbackPromises);
            for (const result of fallbackResults) {
                streams.push(...result);
            }
        }
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[Anime-Sama] Total streams found: ${validStreams.length}`);

    return sortStreamsByLanguage(validStreams);
}
