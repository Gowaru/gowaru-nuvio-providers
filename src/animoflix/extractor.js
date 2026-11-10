import { fetchText, fetchJson, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, sortStreamsByLanguage, sleep, fetchWithRetry, isAborted } from '../utils/resolvers.js';
import { resolveTargetEpisodes, toSlug } from '../utils/dle-extractor.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { createCache } from '../utils/cache.js';

const BASE_URL = "https://animoflix.to";
const SEARCH_URL = `${BASE_URL}/search-autocomplete.php`;
const TIMEOUT = 25000;

const SPECIAL_SLUG_RE = /(?:ona|oav|film|movie|special|scan|chapitre|volume|dub|uncut)(?:-|$)/i;
const MAX_TITLE_SEARCHES = 3;
const MAX_TITLE_SEARCHES_MOVIE = 2;

// Hosts irrésolubles en fetch statique → ne JAMAIS les résoudre (gain 15 s
// chacun, ils finissaient en timeout dans le budget du provider) :
//  - lpayer.embed4me.com/#hash : SPA React, les URLs sortent d'un worker client
//  - smoothpre.com : EarnVids verrouillé par domaine ("Video embed restricted
//    for this domain animoflix.to", vérifié live quel que soit le Referer)
//  - oneupload.to : gateway JS (page « Loading… » 497 o qui redirige via
//    window.location.replace vers ?ch=1&js=<JWT>&sid=…, puis une pub) : sans
//    jar de cookies ni JS, le player n'est jamais servi → resolveUqload le
//    déclare mort après ~9 s de fetch, budget perdu à chaque épisode.
const DEAD_HOST_RE = /(embed4me|lpayer\.|smoothpre\.|oneupload\.)/i;
const MAX_EMBEDS_PER_EPISODE = 6;

// Cache partagé LRU — TTL long sur échecs (rate limiting agressif sur ce site)
const withCache = createCache('af', 'AnimoFlix', { failureTtl: 120_000, maxSize: 200 }) // 2min failure (vs 30s)

/**
 * Requête l'API d'autocomplete du site.
 *
 * ⚠ Contrainte vérifiée en live (2026-11) : le serveur matche la requête
 * comme un PRÉFIXE de `title` ou d'UN alias de `title2` (séparés par virgule),
 * jamais du titre complet TMDB (« Demon Slayer: Kimetsu no Yaiba » → [],
 * « Demon Slayer Kimetsu » → [], mais « Demon Slayer » et « Kimetsu » → OK).
 * Les deux-points cassent donc le match → on découpe la requête.
 */
async function apiSearch(query) {
    try {
        const results = await fetchJson(`${SEARCH_URL}?q=${encodeURIComponent(query)}`, { timeout: TIMEOUT });
        return Array.isArray(results) ? results : [];
    } catch (e) {
        console.warn(`[AnimoFlix] Search API failed for "${query}": ${e.message}`);
        return [];
    }
}

/**
 * Variantes de requête pour un titre TMDB, de la plus précise à la plus large.
 * Le premier segment (« Demon Slayer », « L'Attaque des Titans ») suffit
 * presque toujours ; les préfixes courts rattrapent les sous-titres.
 */
function queryVariants(title) {
    const out = [];
    const push = (q) => {
        const v = String(q || '').replace(/\s+/g, ' ').trim();
        if (v.length < 3) return;
        if (!out.some(o => o.toLowerCase() === v.toLowerCase())) out.push(v);
    };
    const raw = String(title || '').trim();
    push(raw);
    // Sans suffixe de saison / mention VF(FR) / parenthèses
    const noSuffix = raw
        .replace(/\s*[-–:]?\s*(?:saison|season)\s*\d+.*$/i, '')
        .replace(/\s*\((?:vf|vostfr|fr|vfq|vff)\)\s*$/i, '')
        .replace(/\s*[-–:]?\s*\b(?:vf|vostfr)\b\s*$/i, '')
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    push(noSuffix);
    // Premier segment : avant « : », « - » ou virgule (« Demon Slayer: Kimetsu… »)
    for (const sep of [':', ' - ', ',', ' – ']) {
        const i = noSuffix.indexOf(sep);
        if (i > 2) push(noSuffix.slice(0, i));
    }
    // Préfixes de mots (l'API matche en préfixe)
    const words = noSuffix.split(/\s+/).filter(Boolean);
    for (const n of [3, 2]) {
        if (words.length > n) push(words.slice(0, n).join(' '));
    }
    return out;
}

/**
 * Oracle sitemap : `sitemap-animes.xml` (~270 Ko) liste les 2 300+ fiches du
 * catalogue. Indispensable pour les titres que l'API ne matche pas
 * (translittérations, titres FR agglutinés, sous-titres) : l'appel API est un
 * confort, le sitemap est la source de vérité.
 * Cache mémoire par exécution (une instance QuickJS par getStreams).
 */
let _animeSlugsPromise = null;

function getSitemapAnimeSlugs() {
    if (!_animeSlugsPromise) {
        _animeSlugsPromise = (async () => {
            try {
                const xml = await fetchText(`${BASE_URL}/sitemap-animes.xml`, { timeout: TIMEOUT });
                if (!xml || xml.length < 1000) return [];
                const slugs = [];
                const re = /<loc>([^<]*)<\/loc>/gi;
                let m;
                while ((m = re.exec(xml)) !== null) {
                    const sm = m[1].trim().match(/\/anime\/([^\/?#]+)\/?$/);
                    if (sm && sm[1]) slugs.push(decodeURIComponent(sm[1]).toLowerCase());
                }
                console.log(`[AnimoFlix] Sitemap: ${slugs.length} fiche(s)`);
                return slugs;
            } catch (e) {
                console.warn(`[AnimoFlix] Sitemap unavailable: ${e.message}`);
                return [];
            }
        })();
    }
    return _animeSlugsPromise;
}

/**
 * Score d'un slug de sitemap contre les titres TMDB (conservateur : égalité
 * normalisée, ou tous les mots du titre présents dans le slug).
 */
function scoreSitemapSlug(slugWords, titleWords) {
    if (!slugWords.length || !titleWords.length) return 0;
    if (slugWords.join(' ') === titleWords.join(' ')) return 100;
    const slugSet = new Set(slugWords);
    const missing = titleWords.filter(w => !slugSet.has(w)).length;
    if (missing === 0 && titleWords.length >= 2) return 85;
    // Titre court ("Naruto") inclus en tête du slug ("naruto-shippuden") →
    // ambigu (c'est une autre série) : on ne le prend QUE pour un mot unique
    // et un slug qui commence par lui, avec un score faible (arbitrage
    // départagé plus loin par la vérification du titre de la fiche).
    if (titleWords.length === 1 && titleWords[0].length >= 5 && slugWords[0] === titleWords[0]) return 60;
    return 0;
}

function findSitemapMatches(slugs, titles) {
    const out = [];
    const seen = new Set();
    for (const t of titles.slice(0, 8)) {
        const nt = normalize(t);
        if (!nt) continue;
        const titleWords = nt.split(/\s+/).filter(Boolean);
        for (const slug of slugs) {
            if (seen.has(slug)) continue;
            const s = scoreSitemapSlug(slug.split(/[-_]+/).filter(Boolean), titleWords);
            if (s >= 60) {
                seen.add(slug);
                out.push({
                    title: slug.replace(/-/g, ' '),
                    title2: t,
                    slug,
                    url: `${BASE_URL}/anime/${slug}/`,
                    _sitemap: true,
                    _sitemapScore: s,
                });
            }
        }
    }
    return out.sort((a, b) => b._sitemapScore - a._sitemapScore).slice(0, 6);
}

function normalize(s) {
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/-/g, ' ')
        .replace(/[':!.,?()[\]]/g, '').replace(/\b(the|vostfr|vost|vf|french|streaming|anime)\s+/g, '')
        .replace(/\s+/g, ' ').trim();
}

function scoreSearchMatch(result, searchTitle) {
    const nt = normalize(searchTitle);
    const nTitle = normalize(result.title);
    const nTitle2 = normalize(result.title2 || "");
    const nSlug = normalize(result.slug.replace(/-/g, " "));

    let score = 0;
    let fieldScore = 0;
    if (nTitle.includes(nt) || nt.includes(nTitle)) fieldScore = Math.max(fieldScore, 100);
    if (nTitle2.includes(nt) || nt.includes(nTitle2)) fieldScore = Math.max(fieldScore, 80);
    if (nSlug.includes(nt) || nt.includes(nSlug)) fieldScore = Math.max(fieldScore, 60);

    // Penalize score from slug-only match if slug is much shorter than search title (franchise page)
    const slugWords = nSlug.split(/\s+/).filter(Boolean);
    const titleWords = nt.split(/\s+/).filter(Boolean);
    if (fieldScore <= 60 && slugWords.length > 0 && titleWords.length > slugWords.length + 1) {
        const missing = titleWords.filter(w => !nSlug.includes(w)).length;
        if (missing > titleWords.length / 2) {
            fieldScore = Math.max(fieldScore - 40, 0);
        }
    }

    // Also penalize if result title is shorter than search title (franchise catch-all page)
    if (fieldScore > 0 && titleWords.length > 3 && nTitle.split(/\s+/).filter(Boolean).length < titleWords.length - 1) {
        fieldScore = Math.max(fieldScore - 30, 10);
    }

    score += fieldScore;

    const matchWords = new Set([...nTitle.split(/\s+/), ...nTitle2.split(/\s+/), ...nSlug.split(/\s+/)]);
    const matched = titleWords.filter(w => matchWords.has(w)).length;
    if (titleWords.length > 0) score += (matched / titleWords.length) * 50;

    const nTitleWords = nTitle.split(/\s+/).filter(Boolean);
    const extraWords = nTitleWords.length - titleWords.length;
    if (extraWords > 0) {
        score -= Math.min(extraWords * 40, 80);
    }

    // Penalize if search title has many more words than result title (generic franchise match)
    if (titleWords.length > nTitleWords.length + 2) {
        score -= Math.min((titleWords.length - nTitleWords.length) * 40, 80);
    }

    return score;
}

function parseSeasonNumber(seasonSlug) {
    const m = seasonSlug.match(/saison[-\s]*(\d+)/i);
    if (m) return parseInt(m[1]);
    const sm = seasonSlug.match(/season[-\s]*(\d+)/i);
    if (sm) return parseInt(sm[1]);
    const cm = seasonSlug.match(/cour[-\s]*(\d+)/i);
    if (cm) return parseInt(cm[1]);
    if (/final-season|the-final-season/i.test(seasonSlug)) return 99;
    if (/partie-\d+/i.test(seasonSlug)) {
        const pm = seasonSlug.match(/partie-(\d+)/i);
        if (pm) return parseInt(pm[1]);
    }
    const ptm = seasonSlug.match(/part[-\s]*(\d+)/i);
    if (ptm) return parseInt(ptm[1]);
    return null;
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    return _extractStreams(tmdbId, mediaType, season, episode, options);
}

async function _extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options && options.signal ? options.signal : null;
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const isMovie = mediaType === 'movie';
    const targetEpisodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode);

    let bestMatch = null;
    const badSlugs = new Set();

    // Search titles sequentially with small delays to avoid 429 rate limiting
    // The site is very aggressive with rate limits — parallel requests trigger 429
    // FILMS : le site classe les films sous le catalogue de la SÉRIE
    // (/anime/demon-slayer/film/). La search API est stricte (le titre complet
    // du film renvoie []) → chercher d'abord le titre de série dérivé (marqueurs
    // movie/film/oav strippés), puis le titre brut en fallback (films standalone).
    const maxSearches = isMovie ? MAX_TITLE_SEARCHES_MOVIE : MAX_TITLE_SEARCHES;
    let searchPool = titles.slice(0, maxSearches);
    if (isMovie) {
        const pool = [];
        for (const t of titles.slice(0, maxSearches)) {
            const seriesTitle = t
                .replace(/\s*[-–:]?\s*(?:the\s+)?movie\b.*$/i, '')
                .replace(/\s*[-–:]?\s*(?:le\s+)?film\b.*$/i, '')
                .replace(/\s*[-–:]?\s*oav\b.*$/i, '')
                .trim();
            // La search API matche en PRÉFIXE (q="kimetsu" ✓, q="Demon Slayer -Kimetsu…" [])
            // → ajouter des variantes courtes (2 puis 3 premiers mots) pour passer le
            // sous-titre "-Kimetsu no Yaiba-" qui casse le match préfixe.
            const words = seriesTitle.split(/\s+/).filter(Boolean);
            for (const n of [2, 3]) {
                const short = words.slice(0, n).join(' ');
                if (short.length >= 3 && !pool.includes(short)) pool.push(short);
            }
            if (seriesTitle.length >= 3 && !pool.includes(seriesTitle)) pool.push(seriesTitle);
            if (!pool.includes(t)) pool.push(t);
        }
        searchPool = pool;
    }
    // ─── Candidats ──────────────────────────────────────────────────────────
    // 1) Slug direct (gratuit en cas de succès, pas de recherche)
    // 2) Oracle sitemap (couvre tout le catalogue, 1 GET partagé)
    // 3) API autocomplete (rapide quand le préfixe matche)
    const allResults = [];

    const primarySlug = toSlug(titles[0]);
    if (primarySlug && primarySlug.length > 3) {
        try {
            const slugHtml = await fetchText(`${BASE_URL}/anime/${primarySlug}/`, { timeout: 8000 });
            if (slugHtml && slugHtml.length > 1000 && slugHtml.includes('hero-title')) {
                console.log(`[AnimoFlix] Slug direct valide: ${primarySlug}`);
                allResults.push({
                    title: primarySlug.replace(/-/g, ' '),
                    title2: titles[0],
                    slug: primarySlug,
                    url: `${BASE_URL}/anime/${primarySlug}/`,
                    _queryTitle: titles[0],
                });
            }
        } catch (e) { /* slug absent → oracle */ }
    }

    if (allResults.length === 0 && !isAborted(signal)) {
        const sitemapSlugs = await getSitemapAnimeSlugs();
        if (sitemapSlugs.length > 0) {
            const matches = findSitemapMatches(sitemapSlugs, titles);
            for (const m of matches) {
                allResults.push({ ...m, _queryTitle: m.title2 });
            }
            if (matches.length > 0) {
                console.log(`[AnimoFlix] Sitemap: ${matches.map(m => m.slug + '(' + m._sitemapScore + ')').join(', ')}`);
            }
        }
    }

    // API autocomplete : complète (et départage) les candidats. On teste des
    // variantes de requête jusqu'à obtenir un match franc.
    let apiQueryCount = 0;
    const MAX_API_QUERIES = isMovie ? 6 : 7;
    for (const searchTitle of searchPool) {
        if (isAborted(signal) || apiQueryCount >= MAX_API_QUERIES) break;
        const variants = queryVariants(searchTitle);
        let strongFound = false;
        for (const q of variants) {
            if (isAborted(signal) || apiQueryCount >= MAX_API_QUERIES) break;
            const nt = normalize(q);
            if (nt.length < 4) continue;
            apiQueryCount++;
            const results = await apiSearch(q);
            const filtered = results
                .filter(r => r && r.slug && !SPECIAL_SLUG_RE.test(r.slug) && !badSlugs.has(r.slug))
                .map(r => ({ ...r, _queryTitle: searchTitle }));
            allResults.push(...filtered);
            if (filtered.some(r => scoreSearchMatch(r, searchTitle) >= 100)) { strongFound = true; break; }
            if (filtered.length === 0) continue;
            // Résultats trouvés mais aucun franc : inutile d'élargir encore la
            // requête pour ce titre (les variantes suivantes sont plus larges →
            // même jeu de résultats).
            break;
        }
        if (strongFound) break;
        if (allResults.length === 0) await sleep(400);
    }

    // Score et déduplication par slug (les candidats sitemap gardent leur
    // score propre tant qu'aucun match API ne fait mieux).
    const scored = new Map();
    for (const r of allResults) {
        if (badSlugs.has(r.slug)) continue;
        const score = Math.max(
            r._sitemapScore || 0,
            scoreSearchMatch(r, r._queryTitle || titles[0])
        );
        const existing = scored.get(r.slug);
        if (!existing || score > existing.score) {
            scored.set(r.slug, { ...r, score });
        }
    }

    const ranked = [...scored.values()].sort((a, b) => b.score - a.score);

    // Verify top candidate only (site is very aggressive with rate limiting)
    // If the top score is good enough, skip verification to save time
    const topCandidates = ranked.slice(0, 3);
    let foundMatch = false;
    
    // Fast path: if top score is excellent (>=100), use directly without verification
    if (topCandidates.length > 0 && topCandidates[0].score >= 100) {
      bestMatch = topCandidates[0];
      foundMatch = true;
      console.log(`[AnimoFlix] Fast match (score ${bestMatch.score}): "${bestMatch.title}"`);
    }
    
    // Verify only if fast path didn't work
    if (!foundMatch) {
      for (let i = 0; i < topCandidates.length && !foundMatch; i++) {
        const candidate = topCandidates[i];
        try {
          const verifyHtml = await fetchWithRetry(() => fetchText(`${BASE_URL}/anime/${candidate.slug}/`, { timeout: 8000 }));
          const $v = cheerio.load(verifyHtml);
          const pageTitle = $v('h1.hero-title').first().text().trim();
          if (!pageTitle) {
            badSlugs.add(candidate.slug);
            continue;
          }
          const nPage = normalize(pageTitle);
          const nTmdbTitles = titles.slice(0, 5).map(t => normalize(t));
          const matchesTmdb = nTmdbTitles.some(nt => nPage.includes(nt) || nt.includes(nPage));
          if (!matchesTmdb) {
            badSlugs.add(candidate.slug);
            continue;
          }
          bestMatch = candidate;
          foundMatch = true;
        } catch {
          badSlugs.add(candidate.slug);
        }
        // Small delay between verifications
        if (!foundMatch && i + 1 < topCandidates.length) {
          await sleep(500);
        }
      }
    }

    if (!bestMatch) {
        console.warn(`[AnimoFlix] No match found for "${titles[0]}"`);
        return [];
    }

    const slug = bestMatch.slug;
    console.log(`[AnimoFlix] Matched: "${bestMatch.title}" (slug: ${slug})`);

    const animeDetailHtml = await withCache(`serie_${slug}`, () =>
      fetchWithRetry(() => fetchText(`${BASE_URL}/anime/${slug}/`, { timeout: TIMEOUT }))
    );
    const $ = cheerio.load(animeDetailHtml);

    const pageTitle = $('h1.hero-title').first().text().trim();
    if (pageTitle) {
        const nPage = normalize(pageTitle);
        const nSearch = normalize(bestMatch.title);
        if (!nPage.includes(nSearch) && !nSearch.includes(nPage)) {
            console.warn(`[AnimoFlix] Page title mismatch post-verify: "${pageTitle}" vs "${bestMatch.title}"`);
        }
    }

    const seasons = [];
    // ⚠ Une série peut lister PLUSIEURS films (Demon Slayer : Train de
    // l'infini + Forteresse infinie) : garder un seul href servait toujours le
    // dernier → mauvais film pour un « épisode qui ne correspond pas au titre ».
    // On collecte tout, puis on choisit par titre TMDB.
    const filmCards = [];

    // Primary: parse .season-card elements
    $('.season-card').each((i, el) => {
        const href = $(el).attr('href');
        const title = $(el).find('.season-card-title').text().trim();
        if (href && title) {
            if (/film|movie/i.test(title) || /\/film[-\/]/i.test(href)) {
                filmCards.push({ href, title });
                return;
            }
            if (/oav|ona/i.test(title)) return;
            const seasonNum = parseSeasonNumber(href);
            seasons.push({ href, title, seasonNum });
        }
    });

    // Fallback: if no season cards found, try a[href*="saison-"] links
    if (seasons.length === 0 && filmCards.length === 0) {
        $('a[href*="saison-"]').each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim();
            if (href && title && href.includes('/anime/' + slug + '/')) {
                const seasonNum = parseSeasonNumber(href);
                if (seasonNum) {
                    seasons.push({ href, title, seasonNum });
                }
            }
        });
        // Also try film/movie links
        if (filmCards.length === 0) {
            $('a[href*="/film/"], a[href*="/movie/"], a[href*="/film-"], a[href*="/film-"]').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.includes('/anime/' + slug + '/')) {
                    filmCards.push({ href, title: $(el).text().trim() });
                }
            });
        }
    }

    /** URL absolue d'une fiche/saison. */
    const absUrl = (href) => href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;

    /**
     * Choisit le film de la fiche qui correspond au film TMDB demandé.
     * Score = mots du titre du film présents dans le href/titre de la carte.
     * Sans correspondance (film standalone, noms FR différents), on garde le
     * premier — mieux vaut un film plausible que zéro.
     */
    const pickFilm = () => {
        if (filmCards.length === 0) return null;
        let best = filmCards[0];
        let bestScore = 0;
        for (const f of filmCards) {
            const hay = normalize(`${f.href} ${f.title}`);
            let score = 0;
            for (const t of titles.slice(0, 6)) {
                const words = normalize(t).split(/\s+/).filter(w => w.length >= 4);
                for (const w of words) if (hay.includes(w)) score++;
            }
            if (score > bestScore) { bestScore = score; best = f; }
        }
        if (bestScore > 0) console.log(`[AnimoFlix] Film retenu: \"${best.title || best.href}\" (score ${bestScore})`);
        return best;
    };

    if (isMovie) {
        const film = pickFilm();
        if (film) {
            const movieStreams = await extractMovieStreams(slug, absUrl(film.href));
            if (movieStreams.length > 0) return movieStreams;
        }
        // Films classés comme « Saison 1 » sur la fiche (pas de carte film)
        const movieSeasonHref = seasons.find(s => s.seasonNum === 1)?.href;
        if (movieSeasonHref) return extractMovieStreams(slug, absUrl(movieSeasonHref));
        return extractMovieStreams(slug, null);
    }

    if (seasons.length === 0) {
        const film = pickFilm();
        if (film) return extractMovieStreams(slug, absUrl(film.href));
        return [];
    }

    const streams = [];

    // Collect ALL season parts matching the target season number (e.g. saison-4-partie-1,2,3,4)
    // PAS de fallback "saison la plus proche" : servir la S1 quand l'utilisateur demande
    // la S4 = mauvais épisodes (bug Gate S2 : 1 stream servi = en fait l'épisode de la
    // S1). S'il n'y a pas de correspondance, on teste une seule candidature probable :
    // la partie "saisonN-partieX" n'expose pas toujours son numéro correctement.
    // ⚠ L'app passe season en STRING ("1") : comparaison stricte === échoue
    // ("1" === 1 → false) → le fallback "nearest" servait S1 par coïncidence.
    // Coercion en number AVANT le filtre.
    const targetSeasonNum = parseInt(effectiveSeason, 10);
    // Numéro de partie dans l'URL (saison-4-partie-2 → 2) : l'ordre des
    // parties pilote la numérotation cumulative des épisodes.
    const partNum = (href) => {
        const m = String(href).match(/partie[-_]?(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    };
    const sameSeason = seasons.filter(s => s.seasonNum === targetSeasonNum);
    // Préférer les URLs canoniques `/saison-N/` aux variantes (remake, hash
    // `saison-1-03c005b0`) qui contiennent souvent un autre contenu.
    const canonicalSeason = sameSeason.filter(s =>
        new RegExp(`/saison-${targetSeasonNum}/?$`, 'i').test(s.href)
    );
    const targetSeasons = (canonicalSeason.length > 0 ? canonicalSeason : sameSeason)
        .slice()
        .sort((a, b) => partNum(a.href) - partNum(b.href));
    const fallbackSeasons = targetSeasons.length === 0
        ? seasons.filter(s => s.seasonNum == null).slice(0, 1)
        : targetSeasons;

    const langs = ['vostfr', 'vf'];
    const checkedEpisodeUrls = new Set();
    let cumulOffset = 0;

    for (const targetSeason of fallbackSeasons) {
        const seasonPageUrl = targetSeason.href.startsWith('http')
            ? targetSeason.href
            : `${BASE_URL}${targetSeason.href.startsWith('/') ? '' : '/'}${targetSeason.href}`;

        const seasonHtml = await withCache(`season_${slug}_${targetSeason.seasonNum}`, () =>
          fetchWithRetry(() => fetchText(seasonPageUrl, { timeout: TIMEOUT }))
        );
        const $s = cheerio.load(seasonHtml);
        const episodeLinks = {};

        for (const lang of langs) {
            episodeLinks[lang] = [];
            // URLs réelles: /anime/{slug}/saison-{N}/{lang}/episode-{N}/
            // Les <a> n'ont PAS de classe 'episode-card' → on matche par pattern d'URL
            $s(`a[href*="/${lang}/episode-"]`).each((i, el) => {
                const href = $(el).attr('href');
                const epMatch = href.match(/episode-(\d+)\/?$/);
                if (href && epMatch) {
                    episodeLinks[lang].push({
                        num: parseInt(epMatch[1]),
                        cumulative: parseInt(epMatch[1]) + cumulOffset,
                        href: href.startsWith('http') ? href : `${BASE_URL}${href}`
                    });
                }
            });
        }

        const epTasks = [];
        for (const lang of langs) {
            const episodes = episodeLinks[lang] || [];
            if (episodes.length === 0) continue;

            for (const targetEp of targetEpisodes) {
                const episode = episodes.find(e => e.num === targetEp || e.cumulative === targetEp);
                if (!episode) continue;
                if (checkedEpisodeUrls.has(episode.href)) continue;
                checkedEpisodeUrls.add(episode.href);

                const langLabel = lang === 'vf' ? 'VF' : 'VOSTFR';
                epTasks.push(
                    extractEpisodeStreams(episode.href, langLabel, slug)
                        .then(epStreams => streams.push(...epStreams))
                        .catch(e => console.warn(`[AnimoFlix] Failed to extract ${lang} ep ${targetEp}: ${e.message}`))
                );
            }
        }
        await Promise.allSettled(epTasks);

        // Update cumulative offset for next part
        const maxRelEp = Math.max(
            ...langs.flatMap(l => (episodeLinks[l] || []).map(e => e.num)),
            0
        );
        cumulOffset += maxRelEp;

        // If we found streams, stop searching more parts
        if (streams.filter(s => s && s.isDirect).length > 0) break;
    }

    const validStreams = streams.filter(s => s && s.isDirect);
    console.log(`[AnimoFlix] Total streams found: ${validStreams.length}`);

    return sortStreamsByLanguage(validStreams);
}

async function extractMovieStreams(slug, seasonHref) {
    const streams = [];
    const langs = ['vf', 'vostfr'];

    // Build URL patterns: use season href if available, else fallback patterns
    const tryUrlBuilders = [];
    if (seasonHref) {
        for (const lang of langs) {
            const base = seasonHref.startsWith('http') ? seasonHref : `${BASE_URL}${seasonHref.startsWith('/') ? '' : '/'}${seasonHref}`;
            tryUrlBuilders.push((l) => `${base.replace(/\/+$/, '')}/${l}/episode-1/`);
            tryUrlBuilders.push((l) => `${base.replace(/\/+$/, '')}/${l}/`);
        }
    }
    tryUrlBuilders.push(
        (lang) => `${BASE_URL}/anime/${slug}/film/${lang}/episode-1/`,
        (lang) => `${BASE_URL}/anime/${slug}/film/${lang}/`,
        (lang) => `${BASE_URL}/anime/${slug}/movie/${lang}/episode-1/`,
        (lang) => `${BASE_URL}/anime/${slug}/film/${lang}/`,
        (lang) => `${BASE_URL}/anime/${slug}/${lang}/episode-1/`,
    );

    for (const lang of langs) {
        const langResults = await Promise.allSettled(
            tryUrlBuilders.map(buildUrl => {
                const url = buildUrl(lang);
                return fetchWithRetry(() => fetchText(url, { timeout: TIMEOUT })).then(html => {
                    // Check for player presence: either #epLecteurSelect, JSON-LD embedUrl, or iframe
                    if (html.includes('epLecteurSelect') || html.includes('"embedUrl"') || html.includes('<iframe')) {
                        return extractEpisodeStreams(url, lang === 'vf' ? 'VF' : 'VOSTFR', slug);
                    }
                    throw new Error('No player');
                });
            })
        );
        for (const r of langResults) {
            if (r.status === 'fulfilled' && r.value) {
                // ⚠ Filtrer UNIQUEMENT les streams réellement résolus (isDirect: true)
                // Les streams non-résolus (isDirect: false) ont des URLs d'embed
                // qui ne peuvent pas être lues par ExoPlayer
                const validStreams = (r.value || []).filter(s => s && s.isDirect)
                if (validStreams.length > 0) {
                    streams.push(...validStreams);
                    break;
                }
            }
        }
    }

    return streams;
}

async function extractEpisodeStreams(episodeUrl, langLabel, slug) {
    const html = await fetchWithRetry(() => fetchText(episodeUrl, { timeout: TIMEOUT }));
    const $ = cheerio.load(html);

    const embedUrls = [];
    
    // Method 1: Try #epLecteurSelect (site's actual player select ID)
    $('#epLecteurSelect option').each((i, el) => {
        const val = $(el).val();
        if (val && val.startsWith('http')) {
            embedUrls.push(val);
        }
    });
    
    // Method 2: Try fallback selectors (older site version)
    if (embedUrls.length === 0) {
        $('#lecteurSelect option, select.video-source option, select.player-select option').each((i, el) => {
            const val = $(el).val();
            if (val && val.startsWith('http')) {
                embedUrls.push(val);
            }
        });
    }

    // Method 3: JSON-LD embedUrl
    if (embedUrls.length === 0) {
        // Match both double-quoted and single-quoted embedUrl values
        const jsonLdMatch = html.match(/"embedUrl"\s*:\s*"(https?:\/\/[^"]+)"/) ||
                           html.match(/'embedUrl'\s*:\s*'(https?:\/\/[^']+)'/) ||
                           html.match(/embedUrl\s*:\s*["'](https?:\/\/[^"']+)["']/);
        if (jsonLdMatch) {
            embedUrls.push(jsonLdMatch[1]);
        }
        // Try to find all embedUrl variants in JSON-LD array
        const allEmbeds = html.match(/"embedUrl"\s*:\s*"(https?:\/\/[^"]+)"/g);
        if (allEmbeds && allEmbeds.length > 1) {
            for (const e of allEmbeds) {
                const url = e.match(/"embedUrl"\s*:\s*"([^"]+)"/);
                if (url && !embedUrls.includes(url[1])) {
                    embedUrls.push(url[1]);
                }
            }
        }
    }

    // Method 4: Iframe fallback
    if (embedUrls.length === 0) {
        const knownIframeSelectors = [
            '#videoPlayer',
            '.video-wrapper iframe',
            '.player-wrapper iframe',
            '.embed-wrapper iframe',
            'iframe[src*="sibnet"]',
            'iframe[src*="sendvid"]',
            'iframe[src*="dood"]',
            'iframe[src*="voe"]',
            'iframe[src*="uqload"]',
            'iframe[src*="vidmoly"]',
        ];
        for (const sel of knownIframeSelectors) {
            $(sel).each((i, el) => {
                const src = $(el).attr('src');
                if (src && src.startsWith('http')) {
                    embedUrls.push(src);
                }
            });
            if (embedUrls.length > 0) break;
        }
        // Last resort: any iframe with http src
        if (embedUrls.length === 0) {
            $('iframe[src^="http"]').each((i, el) => {
                const src = $(el).attr('src');
                if (src) embedUrls.push(src);
            });
        }
    }

    // Method 5: Extract from data-player or data-src attributes (site-specific)
    if (embedUrls.length === 0) {
        $('[data-player], [data-src]').each((i, el) => {
            const player = $(el).attr('data-player') || $(el).attr('data-src');
            if (player && player.startsWith('http') && !embedUrls.includes(player)) {
                embedUrls.push(player);
            }
        });
    }

    // Method 6: Parse embedded player URL from JSON configuration in inline scripts
    if (embedUrls.length === 0) {
        const playerMatch = html.match(/playerUrl\s*[=:]\s*['"]?(https?:\/\/[^'"\s]+)['"\s]/i) ||
                           html.match(/videoUrl\s*[=:]\s*['"]?(https?:\/\/[^'"\s]+)['"\s]/i) ||
                           html.match(/srcUrl\s*[=:]\s*['"]?(https?:\/\/[^'"\s]+)['"\s]/i);
        if (playerMatch && playerMatch[1].startsWith('http')) {
            embedUrls.push(playerMatch[1]);
        }
    }

    // Method 7: data-video or data-embed-url attributes
    if (embedUrls.length === 0) {
        $('[data-video], [data-embed-url], [data-player-url]').each((i, el) => {
            const val = $(el).attr('data-video') || $(el).attr('data-embed-url') || $(el).attr('data-player-url');
            if (val && val.startsWith('http') && !embedUrls.includes(val)) {
                embedUrls.push(val);
            }
        });
    }

    // Method 8: Look for <a> with class play-now or similar that has data-href
    if (embedUrls.length === 0) {
        $('a[data-href*="http"], a.play-now[href*="http"], a.btn-player[href*="http"]').each((i, el) => {
            const val = $(el).attr('data-href') || $(el).attr('href');
            if (val && val.startsWith('http') && !embedUrls.includes(val)) {
                embedUrls.push(val);
            }
        });
    }

    // Method 9: Parse embedded base64-encoded URLs in scripts
    if (embedUrls.length === 0) {
        const b64matches = html.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/g);
        if (b64matches) {
            for (const match of b64matches) {
                try {
                    const b64 = match.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/);
                    if (b64) {
                        const decoded = atob(b64[1]);
                        if (decoded.startsWith('http') && !embedUrls.includes(decoded)) {
                            embedUrls.push(decoded);
                        }
                    }
                } catch {}
            }
        }
    }

    // Method 10: Search for any URL pattern ending in .mp4/.m3u8 within script content
    if (embedUrls.length === 0) {
        $('script').each((i, el) => {
            const content = $(el).html() || '';
            // Skip scripts with only whitespace or JSON
            if (content.length < 20) return;
            const urls = content.match(/"(https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)"/i);
            if (urls && !embedUrls.includes(urls[1])) {
                embedUrls.push(urls[1]);
                return false; // stop after first found
            }
        });
    }

    // Hosts morts/injoignables : ne pas gaspiller le budget (chacun coûtait
    // 9 à 15 s de fetch avant de rendre isDirect:false).
    const skipped = embedUrls.filter(u => DEAD_HOST_RE.test(u)).length;
    const liveEmbeds = embedUrls.filter(u => !DEAD_HOST_RE.test(u)).slice(0, MAX_EMBEDS_PER_EPISODE);
    if (skipped > 0) console.log(`[AnimoFlix] ${skipped} lecteur(s) mort(s) ignoré(s) (${langLabel})`);

    const results = await Promise.allSettled(
        liveEmbeds.map(url =>
            resolveStream({
                name: `AnimoFlix (${langLabel})`,
                title: `[${langLabel}] AnimoFlix`,
                language: langLabel,
                url: url,
                quality: 'HD',
                headers: { Referer: `${BASE_URL}/anime/${slug}/` }
            }).then(stream => stream || null)
        )
    );

    return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
}
