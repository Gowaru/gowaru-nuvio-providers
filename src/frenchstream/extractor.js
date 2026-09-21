import { stripSeasonSuffix, toStream, resolveTargetEpisodes, countExtraWords, hasForeignLeadingTokens } from '../utils/dle-extractor.js';
import cheerio from 'cheerio-without-node-native';
import { safeFetch, resolveStream, isBudgetExhausted, isAborted, getScraperSettings } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { fetchText, fetchJson, fetchPost, BASE_URL, BASE_URLS, setCurrentSignal } from './http.js';
import { createCache } from '../utils/cache.js';

const withCache = createCache('fs', 'FrenchStream', { failureTtl: 120_000, maxSize: 200 }); // 2min failure (rate limiting)

const MIN_MATCH_SCORE = 60;
const MOVIE_MATCH_SCORE = 55;
const MAX_SEARCH_QUERIES = 3;
const MAX_CANDIDATES = 6;   // était 3 : kakaflix (netu/voe) timeout → 2/3 candidats morts
const TARGET_DIRECT = 4;     // VF + VOSTFR même si les 1ers hosts échouent
// Budget de la phase de résolution (~5s par host fsvid/vidzy : embed + master +
// variante). 15s ne laissait la place qu'à 2 résolutions → VOSTFR jamais atteinte
// (les candidats VF passent avant). 22s ≈ 4 résolutions, reste < 45s de budget plugin.
const RESOLVE_TIMEOUT_MS = 22000;
// Hosts connus pour timeout systématique (vérifié en live 2026-09) → jamais
// en tête de file. 'kakaflix' = wrapper actuel de dood/voe/netu sur
// french-stream.one (timeout 18 s vérifié) — matcher l'URL couvre toutes les
// variantes (/d00d/, /sydney/, /voe3/, /tokyo/).
const DEAD_HOSTS = ['kakaflix', 'dood', 'streamtape'];

// ─── Settings utilisateur (SCRAPER_SETTINGS injecté par l'app) ──────────────
// NuvioMobile : UI via module.exports.onSettings() (voir index.js)
// NuvioTV : réglages injectés sans UI (globalThis.SCRAPER_SETTINGS)

/**
 * Lit les préférences utilisateur avec fallback sûr si absentes/invalides.
 * @returns {{ language: 'all'|'vf'|'vostfr', excludeHosts: string[] }}
 */
function getPrefs() {
    const s = getScraperSettings() || {};
    const language = (s.language === 'vf' || s.language === 'vostfr') ? s.language : 'all';
    // exclusion d'hosts : accepte string ('fsvid, dood') ou array (['fsvid','dood'])
    let excludeHosts = [];
    if (typeof s.excludeHosts === 'string') {
        excludeHosts = s.excludeHosts.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    } else if (Array.isArray(s.excludeHosts)) {
        excludeHosts = s.excludeHosts.map(x => String(x).trim().toLowerCase()).filter(Boolean);
    }
    return { language, excludeHosts };
}

/**
 * Un host (clé API ou label) est-il exclu par les préférences ?
 * Match par sous-chaîne dans les deux sens (ex: 'dood' exclut 'doodstream',
 * 'kakaflix.lol/d00d' exclu par 'kakaflix' comme par 'dood').
 */
function isHostExcluded(hostKey, excludeHosts) {
    if (!excludeHosts || excludeHosts.length === 0) return false;
    const h = String(hostKey || '').toLowerCase();
    if (!h) return false;
    return excludeHosts.some(x => h.includes(x) || x.includes(h));
}
const CACHE_TTL_MS = 300000;
const CATEGORY_FETCH_TIMEOUT = 8000;
const TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

const GENRE_TO_CATEGORY = {
    28: '/films/actions/', 12: '/films/aventures/', 16: '/films/animations/',
    35: '/films/comedies/', 80: '/films/policiers/', 99: '/films/documentaires/',
    18: '/films/drames/', 10751: '/films/familles/', 14: '/films/fantastiques/',
    36: '/films/historiques/', 27: '/films/epouvante-horreurs/', 10752: '/films/guerres/',
    9648: '/films/thrillers/', 10749: '/films/romances/', 878: '/films/science-fictions/',
    53: '/films/thrillers/', 37: '/films/westerns/', 10759: '/films/actions/',
    10402: '/films/biopics/', 10770: '/films/vf/'
};

const ALL_CATEGORIES = [
    '/films/actions/', '/films/aventures/', '/films/animations/', '/films/biopics/',
    '/films/comedies/', '/films/drames/', '/films/documentaires/', '/films/epouvante-horreurs/',
    '/films/historiques/', '/films/espionnages/', '/films/familles/', '/films/fantastiques/',
    '/films/guerres/', '/films/policiers/', '/films/romances/', '/films/science-fictions/',
    '/films/thrillers/', '/films/westerns/', '/films/vf/', '/films/cultes/'
];

/* old cached() removed — all migrated to withCache */

async function fetchTmdbJson(url) {
    const res = await safeFetch(url);
    if (!res || !res.ok) return null;
    return await res.json();
}

const ANIME_KEYWORDS = /\b(?:anime|japon|shonen|shoujo|seinen|manga)\b/i;

function isJapaneseOrChinese(text) {
    return /[\u3000-\u9FFF\uF900-\uFAFF]/.test(text || '');
}

function normalize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getOrigin(url) {
    try { return new URL(url).origin; }
    catch (e) { return BASE_URL; }
}

function pickNewsId(onclick, href) {
    // 1. Try info-button onclick (openModal('12345'))
    const modalId = (onclick || '').match(/openModal\('(\d+)'\)/i)?.[1];
    if (modalId) return modalId;

    // 2. Try extracting newsid from /index.php?newsid=XXXXXX format (DLE standard)
    const newsIdMatch = (href || '').match(/[?&]newsid=(\d+)/i);
    if (newsIdMatch) return newsIdMatch[1];

    // 3. Try /\d+-title format
    const pathMatch = (href || '').match(/^\/(\d+)-/);
    if (pathMatch) return pathMatch[1];

    // 4. Try /newsid-\d+ pattern
    const numericMatch = (href || '').match(/\/(\d+)(?:-|\/|$)/);
    if (numericMatch) return numericMatch[1];

    return null;
}

function isSeriesCard($card, href, title) {
    if ($card.find('.mli-eps').length > 0) return true;
    const text = (href || '') + ' ' + (title || '');
    return /saison|series|\/s-tv\//i.test(text);
}

function normalizeHref(href, baseUrl) {
    if (!href || typeof href !== 'string') return null;
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return 'https:' + trimmed;
    if (trimmed.startsWith('/')) return baseUrl + trimmed;
    return baseUrl + '/' + trimmed.replace(/^\/+/, '');
}

function parseSearchCards(html, baseUrl) {
    const $ = cheerio.load(html);
    const cards = [];

    // Try multiple selectors to handle different DLE template structures
    const selectors = [
        '.short .short-in',      // nested structure
        '.short-in',             // flat structure
        '.short',                // fallback: direct short containers
    ];

    for (const selector of selectors) {
        $(selector).each((_, element) => {
            const $card = $(element);
            const hrefRaw = $card.find('a.short-poster').first().attr('href') ||
                $card.find('a.img-box').first().attr('href') ||
                $card.find('a[href]').first().attr('href') || '';
            const href = normalizeHref(hrefRaw, baseUrl);
            if (!href) return;

            // Try multiple title selectors
            const title = ($card.find('.short-title').first().text() ||
                $card.find('.title').first().text() ||
                $card.find('img').first().attr('alt') || '').trim();
            if (!title) return;

            // Extract newsId from multiple possible sources
            const onclick = $card.find('.info-button').attr('onclick') || '';
            const dataId = $card.find('[data-id]').first().attr('data-id') || $card.attr('data-id') || '';
            // Chercher aussi dans tous les hrefs de la card (le lien newsid peut ne pas être le premier)
            let newsId = pickNewsId(onclick, hrefRaw) || dataId;
            if (!newsId) {
                $card.find('a[href]').each((_, el) => {
                    if (newsId) return;
                    const h = $(el).attr('href') || '';
                    newsId = pickNewsId('', h);
                });
            }
            if (!newsId) return;

            // Avoid duplicate cards with same newsId
            if (cards.some(c => c.newsId === newsId)) return;

            cards.push({ newsId, href, title, isSeries: isSeriesCard($card, href, title), baseUrl });
        });

        // If we found cards with this selector, don't try other selectors
        if (cards.length > 0) break;
    }

    return cards;
}

function buildTitleQueries(titles) {
    const queries = [];
    const push = (v) => { if (typeof v === 'string' && v.trim() && !queries.some(q => q.toLowerCase() === v.trim().toLowerCase())) queries.push(v.trim()); };
    for (const title of (titles || []).slice(0, 2)) {
        push(stripSeasonSuffix(title));
        const bc = stripSeasonSuffix(title).split(':')[0];
        if (bc && bc.length >= 3) push(bc);
    }
    return queries.slice(0, MAX_SEARCH_QUERIES);
}

function scoreCard(card, queryTitle, mediaType, season) {
    const q = normalize(queryTitle);
    const t = normalize(card.title);
    const hrefN = normalize(card.href || '');
    const hay = (t + ' ' + hrefN).trim();
    if (!q || !t) return 0;
    let score = 0;
    if (t === q) score += 120;
    if (hay.includes(q)) {
      // Garde anti-homonymes (bug "Gate" → Steins;Gate) : un token
      // significatif AVANT la requête ("steins", "new"…) rejette le match.
      if (hasForeignLeadingTokens(hay, q)) return 0
      score += 70;
      // Pénalité anti-fan-edit : utilise uniquement le titre (pas l'href)
      // pour éviter les faux négatifs dus aux mots parasites dans l'URL
      // (newsid, index, php, etc.).
      const extra = countExtraWords(t, q);
      if (extra > 0) score -= Math.min(extra * 25, 55);
    }
    if (q.includes(t) && q.startsWith(t + ' ')) score += 40;
    const qWords = new Set(q.split(' ').filter(w => w && w.length > 2 && !['the','and','for','with','from','des','les','une','dans','sur','via','de','du','la','le'].includes(w)));
    const tWords = new Set(hay.split(' ').filter(Boolean));
    let common = 0;
    for (const w of qWords) { if (tWords.has(w)) common += 1; }
    score += common * 8;
    if (mediaType === 'movie' && card.isSeries) score -= 50;
    if (mediaType === 'tv' && !card.isSeries) score -= 30;
    const sn = Number(season) || 1;
    const text = (card.title + ' ' + card.href).toLowerCase();
    const hasSeason = /saison\s*\d+|s-tv\//i.test(text);
    if (mediaType === 'tv') {
        if (sn > 1) {
            const sr = new RegExp('saison\\s*' + sn + '|[-_/]' + sn + '(?:[^0-9]|$)', 'i');
            if (sr.test(text)) score += 20;
            if (hasSeason && !sr.test(text)) score -= 25;
        } else if (sn === 1 && /saison\s*[2-9]/i.test(text)) score -= 25;
    }
    return score;
}

function extractSerieTag(html) {
    // Extraire le tagz depuis #serie-data > .sd-tagz dans la page d'une série.
    // Le tag a le format 's-XXXXX' et est utilisé par get_seasons.php.
    const tagMatch = html.match(/sd-tagz[^>]*>[\s\S]*?(s-[A-Za-z0-9_-]+)/);
    if (tagMatch) return tagMatch[1];
    // Fallback: chercher data-tagz attribute
    const dataTagMatch = html.match(/data-tagz=["']([^"']+)/);
    if (dataTagMatch) return dataTagMatch[1];
    return null;
}

async function searchByTitle(title, mediaType, season) {
    // Normaliser : l'app passe 'series', le scoring attend 'tv'
    const mt = mediaType === 'series' ? 'tv' : mediaType;
    const allCards = [];
    // Le site bloque la recherche GET (302 → /). Utiliser POST.
    const results = await Promise.allSettled(
        BASE_URLS.map(baseUrl => {
            const url = baseUrl + '/index.php';
            const body = 'do=search&subaction=search&story=' + encodeURIComponent(title);
            return fetchPost(url, body, { baseUrl }).then(html => parseSearchCards(html, baseUrl));
        })
    );
    for (const r of results) {
        if (r.status === 'fulfilled') allCards.push(...r.value);
    }
    const filtered = allCards.filter(c => mt === 'tv' ? c.isSeries : !c.isSeries);
    if (filtered.length === 0) return [];
    return filtered.map(c => ({ ...c, _score: scoreCard(c, title, mt, season), _matchedTitle: title }))
        .sort((a, b) => b._score - a._score).slice(0, 8);
}

async function getTmdbDetails(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = TMDB_API_BASE + '/' + type + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=en-US';
    return withCache('tmdb_det_' + tmdbId + '_' + type, () => fetchTmdbJson(url), { successTtl: CACHE_TTL_MS, failureTtl: 60000 });
}

async function detectSubType(tmdbId, mediaType, titles) {
    try {
        const isTv = mediaType === 'tv' || mediaType === 'series';
        const d = await getTmdbDetails(tmdbId, mediaType);
        if (!d) return null;
        const genres = (d.genres || []).map(g => g.id);
        const isAnim = genres.includes(16);
        const orig = isTv ? d.original_name : d.original_title;
        const jap = isJapaneseOrChinese(orig);
        const tm = titles.some(t => ANIME_KEYWORDS.test(t));
        if (isAnim && (jap || tm)) return 'anime';
        if (isAnim && isTv) return 'cartoon';
    } catch (e) {
        console.warn(`[Frenchstream] detectSubType failed: ${e?.message}`);
    }
    return null;
}

function hostLabel(k) {
    const h = (k || '').toLowerCase();
    if (h === 'premium') return 'FSVID';
    if (h === 'vidzy') return 'VIDZY';
    if (h === 'uqload') return 'UQLOAD';
    if (h === 'dood') return 'DOOD';
    if (h === 'voe') return 'VOE';
    if (h === 'filmoon') return 'FILEMOON';
    if (h === 'netu') return 'NETU';
    return k ? k.toUpperCase() : 'PLAYER';
}

function languageLabel(k) {
    const l = (k || '').toLowerCase();
    // Vérifié en live sur film_api : les langues réelles sont vf/vff/vfq/vostfr/vo
    // et 'default' = doublon exact de 'vff' (même URL). Le mapper vers 'VF'
    // écrasait VFF (TrueFrench) lors de la dédup par URL → "VF n'apparaît pas".
    if (l === 'vf' || l === 'default' || l === 'vfq') return 'VFF';
    if (l === 'vostfr') return 'VOSTFR';
    if (l === 'vo') return 'VO';
    return l ? l.toUpperCase() : 'VFF';
}

function makeStream(name, host, language, url, quality, subType) {
    const lang = languageLabel(language);
    const origin = getOrigin(url);
    const opts = { quality: quality || 'HD', subType };
    // Frenchstream utilise le nom de l'hôte (FSVID, UQLOAD, etc.) dans le titre
    opts.title = '[' + lang + '] ' + hostLabel(host) + (quality && quality !== 'HD' ? ' [' + quality + ']' : '');
    return toStream(url, lang, name, origin, opts);
}

function dedupeByUrl(streams) {
    const seen = new Set(), out = [];
    for (const s of streams) { if (s && s.url && !seen.has(s.url)) { seen.add(s.url); out.push(s); } }
    return out;
}

/* ---------- SITE API METHODS ---------- */

async function fetchSeasons(tmdbId) {
    const tag = 's-' + tmdbId;
    return fetchSeasonsRaw(tag, tmdbId);
}

async function fetchSeasonsRaw(tag, cacheKey) {
    const url = BASE_URL + '/engine/ajax/get_seasons.php?serie_tag=' + encodeURIComponent(tag) + '&news_id=0';
    return withCache('seasons_' + (cacheKey || tag), async () => {
        const data = await fetchJson(url, { baseUrl: BASE_URL });
        if (!Array.isArray(data)) return [];
        return data;
    }, { successTtl: CACHE_TTL_MS, failureTtl: 60000 });
}

async function fetchEpisodeData(seasonNewsId) {
    const url = BASE_URL + '/data/eps_' + seasonNewsId + '.txt?v=' + Math.floor(Date.now() / 30000);
    return withCache('eps_' + seasonNewsId, async () => {
        const data = await fetchJson(url, { baseUrl: BASE_URL });
        return data;
    }, { successTtl: 30000, failureTtl: 10000 });
}

function collectTvSiteCandidates(epData, episode, subType) {
    const epNum = Number(episode) || 1;
    const { excludeHosts } = getPrefs();
    // Vérifié en live : eps file = {vf:{1:{host:url}}, vostfr:{...}, vo:{...}, info:{...}}
    // + ordre d'itération = priorité de résolution (premium/vidzy/uqload d'abord,
    // kakaflix/netu — qui timeout — en fin de liste).
    const perLang = [];
    for (const lang of ['vf', 'vostfr', 'vo']) {
        const byEp = epData && epData[lang];
        if (!byEp || typeof byEp !== 'object') continue;
        const players = byEp[String(epNum)] || byEp[epNum];
        if (!players || typeof players !== 'object') continue;
        const hosts = Object.keys(players)
            .filter(h => (players[h] || '').startsWith('http'))
            .sort((a, b) => hostPriority(a, excludeHosts, players[a]) - hostPriority(b, excludeHosts, players[b]));
        perLang.push(hosts.map(host => makeStream('Frenchstream', host, lang, players[host], null, subType)));
    }
    // Interleave par langue : [VF1, VOSTFR1, VF2, VOSTFR2, ...]. Sans ça, les
    // 5 VF (dont certaines lentes) épuisent le budget AVANT la 1ère VOSTFR →
    // "les VOSTFR n'apparaissent jamais" (l'inverse du bug initial).
    const streams = [];
    let added = true;
    for (let i = 0; added; i++) {
        added = false;
        for (const list of perLang) {
            if (list[i]) { streams.push(list[i]); added = true; }
        }
    }
    return streams;
}

/**
 * Tri de fiabilité des hosts : 0 = résoudre d'abord, 200 = mort/jamais.
 * FIX 2026-09 : vérifier la CLÉ **ET** l'URL. Les hosts "voe"/"netu" sont
 * servis via des wrappers kakaflix.lol qui timeout (18 s vérifiés en live)
 * — la clé seule ('voe') ne matchait pas DEAD_HOSTS → ils étaient triés
 * EN PREMIER et épuisaient le budget de résolution avant vidzy/uqload.
 */
function hostPriority(hostKey, excludeHosts, url) {
    const h = (hostKey || '').toLowerCase();
    const u = (url || '').toLowerCase();
    if (DEAD_HOSTS.some(d => h.includes(d) || u.includes(d))) return 200;
    if (excludeHosts && (isHostExcluded(h, excludeHosts) || isHostExcluded(u, excludeHosts))) return 150; // exclu par l'utilisateur mais pas mort → en tout dernier si rien d'autre
    return 0;
}


/* ---------- STREAM RESOLUTION ---------- */

function resolveSingle(stream) {
    // Wrap with timeout to avoid slow hosts blocking resolution
    const promise = resolveStream(stream);
    if (typeof setTimeout === 'undefined') return promise;
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve({ ...stream, isDirect: false }), RESOLVE_TIMEOUT_MS))
    ]);
}

/**
 * Applique les préférences utilisateur aux candidats AVANT résolution :
 *   - excludeHosts : retire les hosts exclus (fallback: tout garder si ça vide tout)
 *   - language 'vf' / 'vostfr' : ne garde que la langue demandée (idem fallback)
 * Point d'entrée unique → couvre les flux film ET série.
 */
function applyPrefsToCandidates(candidates, prefs) {
    if (!Array.isArray(candidates) || candidates.length === 0) return candidates;
    let list = candidates;
    if (prefs.excludeHosts && prefs.excludeHosts.length > 0) {
        // Match sur titre (ex: '[VFF] FSVID [720p]') + URL (ex: kakaflix.lol/...)
        const filtered = list.filter(s => !isHostExcluded((s.title || '') + ' ' + (s.url || ''), prefs.excludeHosts));
        if (filtered.length > 0) list = filtered;
    }
    if (prefs.language === 'vf') {
        // 'VF' matche VFF/VFQ/VF mais PAS VOSTFR ni VO
        const filtered = list.filter(s => (s.title || '').toUpperCase().includes('VF'));
        if (filtered.length > 0) list = filtered;
    } else if (prefs.language === 'vostfr') {
        const filtered = list.filter(s => (s.title || '').toUpperCase().includes('VOSTFR'));
        if (filtered.length > 0) list = filtered;
    }
    return list;
}

async function resolveCandidates(candidates) {
    // Préférences utilisateur (langue / hosts exclus) — fallback sûr si absentes
    const prefs = getPrefs();
    candidates = applyPrefsToCandidates(candidates, prefs);

    // OPTIMISATION: Résolution séquentielle avec early-exit
    // (fetch synchrone en QuickJS = Promise.allSettled ne parallélise pas)
    // Les candidats doivent être pré-triés par hostPriority (fait dans
    // collectTvSiteCandidates / le tri film ci-dessous).
    const limited = candidates.slice(0, MAX_CANDIDATES);
    const direct = [];
    const embeds = [];
    const startTime = Date.now();

    for (const candidate of limited) {
        if (direct.length >= TARGET_DIRECT) break;
        if (Date.now() - startTime > RESOLVE_TIMEOUT_MS) break;

        try {
            const s = await resolveSingle(candidate);
            if (s && s.url && s.isDirect) direct.push(s);
            // FIX "ne se lance jamais" : plus AUCUN fallback embed. Un embed
            // non résolu = page HTML d'hébergeur que l'app ne peut pas lire →
            // le stream apparaît mais ne démarre jamais. Convention repo
            // (wookafr/fluneo/franime) : isDirect:false est rejeté.
        } catch (e) { /* skip failed candidate */ }
    }

    return dedupeByUrl(direct);
}

/**
 * Recherche EXACTE par tag TMDB via xfsearch (découvert en live) :
 *   film  → /index.php?do=xfsearch&xfname=tagz&xf=f-{tmdbId}
 *   série → /index.php?do=xfsearch&xfname=tagz&xf=s-{tmdbId}
 * Le site tagge chaque fiche avec l'ID TMDB → zéro fuzzy matching, zéro
 * mismatch de titre/épisode. Retourne [{newsId, href, title, isSeries, baseUrl}].
 */
async function searchByTmdbTag(tmdbId, mediaType) {
    const prefix = mediaType === 'movie' ? 'f' : 's';
    const url = BASE_URL + '/index.php?do=xfsearch&xfname=tagz&xf=' + prefix + '-' + encodeURIComponent(tmdbId);
    try {
        const html = await fetchText(url, { baseUrl: BASE_URL, timeout: 10000 });
        const cards = parseSearchCards(html, BASE_URL);
        // xfsearch peut mélanger films (f-) et séries (s-) quand le préfixe
        // seul est cherché — re-filtrer par type de carte.
        const filtered = cards.filter(c => mediaType === 'tv' ? c.isSeries : !c.isSeries);
        const result = (filtered.length > 0 ? filtered : cards).map(c => ({ ...c, _score: 200 }));
        console.log('[Frenchstream] xfsearch ' + prefix + '-' + tmdbId + ': ' + result.length + ' card(s)');
        return result;
    } catch (e) {
        console.warn('[Frenchstream] xfsearch failed: ' + e.message);
        return [];
    }
}

/* ---------- MOVIE CATEGORY BROWSING ---------- */

function parseCategoryMovies(html) {
    const $ = cheerio.load(html);
    const movies = [];
    $('.short').each((_, el) => {
        const $card = $(el);
        const newsId = $card.find('[data-id]').first().attr('data-id') ||
            ($card.find('.info-button').attr('onclick') || '').match(/openModal\('(\d+)'\)/)?.[1];
        const title = ($card.find('.short-title').first().text() || '').trim();
        const poster = $card.find('img').first().attr('src') || '';
        if (newsId && title) movies.push({ newsId, title, poster });
    });
    return movies;
}

async function fetchCategoryMovies(catPath) {
    const url = BASE_URL + catPath;
    return withCache('cat_' + catPath.replace(/[\/\s]/g, '_'), async () => {
        const html = await fetchText(url, { timeout: CATEGORY_FETCH_TIMEOUT, baseUrl: BASE_URL });
        return parseCategoryMovies(html);
    }, { successTtl: CACHE_TTL_MS, failureTtl: 60000 });
}

async function verifyAndExtractMovieStreams(newsId, tmdbId, subType) {
    const url = BASE_URL + '/engine/ajax/film_api.php?id=' + newsId;
    try {
        const data = await fetchJson(url, { baseUrl: BASE_URL });
        const tagz = data?.meta?.tagz || '';
        const expectedTag = 'f-' + tmdbId;
        if (tagz !== expectedTag) {
            console.log('[Frenchstream] Tagz mismatch: got ' + tagz + ', expected ' + expectedTag);
            return null;
        }
        const players = data?.players;
        if (!players || typeof players !== 'object') return [];
        const streams = [];
        // Vérifié en live : film_api renvoie aussi des non-URLs (ex: netu = "BafWadqiVSI2",
        // un ID vidéo brut) → le filtre startsWith('http') les écarte déjà.
        // Ordre : hosts fiables d'abord, kakaflix/dood (timeout live) en dernier.
        const { excludeHosts } = getPrefs();
        const hosts = Object.keys(players).filter(host => {
            const versions = players[host];
            return versions && typeof versions === 'object' &&
                Object.values(versions).some(u => typeof u === 'string' && u.startsWith('http'));
        }).sort((a, b) => {
            const ua = Object.values(players[a]).find(u => typeof u === 'string') || '';
            const ub = Object.values(players[b]).find(u => typeof u === 'string') || '';
            return hostPriority(a, excludeHosts, ua) - hostPriority(b, excludeHosts, ub);
        });
        for (const host of hosts) {
            const versions = players[host];
            if (!versions || typeof versions !== 'object') continue;
            for (const lang of Object.keys(versions)) {
                const url = versions[lang];
                if (typeof url === 'string' && url.startsWith('http')) {
                    // FIX : les wrappers kakaflix (dood/voe/netu) sont morts en
                    // live (timeout 18 s) → jamais proposés, sinon ils brûlent
                    // le budget de résolution et la VOSTFR n'est jamais atteinte.
                    if (hostPriority(host, excludeHosts, url) >= 200) continue;
                    streams.push(makeStream('Frenchstream', host, lang, url, null, subType));
                }
            }
        }
        return streams;
    } catch (e) {
        console.warn('[Frenchstream] film_api verify failed for ' + newsId + ': ' + e.message);
        return null;
    }
}

function scoreMovieCategory(cardTitle, queryTitles) {
    const t = normalize(cardTitle);
    if (!t) return 0;
    let bestScore = 0;
    for (const qt of queryTitles) {
        const q = normalize(qt);
        if (!q) continue;
        let score = 0;
        if (t === q) score += 120;
        else if (t.includes(q) || q.includes(t)) score += 70;
        else {
            const qWords = q.split(' ').filter(w => w.length > 2 && !['the','and','for','with','from','des','les','une','dans','sur','via','de','du','la','le','das','der','die'].includes(w));
            const tWords = new Set(t.split(' '));
            let common = 0;
            for (const w of qWords) { if (tWords.has(w)) common++; }
            score += common * 10;
        }
        if (score > bestScore) bestScore = score;
    }
    return bestScore;
}

async function searchMovieOnSite(tmdbId, titles, subType) {
    const startTime = Date.now();   // FIX : utilisé plus bas mais jamais déclaré (ReferenceError)
    const BUDGET_MS = 40000;

    // Step 0 (définitif) : xfsearch par tag TMDB f-{tmdbId} — le site taggue
    // chaque film avec son ID TMDB → zéro fuzzy matching. Vérifié en live :
    // xf=f-27205 → exactement Inception (newsid 1022).
    try {
        const tagged = await searchByTmdbTag(tmdbId, 'movie');
        if (tagged.length > 0) {
            const streams = await verifyAndExtractMovieStreams(tagged[0].newsId, tmdbId, subType);
            if (streams && streams.length > 0) {
                const resolved = await resolveCandidates(streams);
                console.log('[Frenchstream] Movie found via TMDB tag: ' + resolved.length + ' streams');
                return resolved;
            }
            // Tag trouvé mais players vides → le film existe sans source, pas la
            // peine de scanner les catégories pour retomber sur la même fiche.
            console.log('[Frenchstream] Tag match ' + tagged[0].newsId + ' has no players');
            return [];
        }
    } catch (e) {
        console.warn('[Frenchstream] TMDB tag lookup failed: ' + e.message);
    }

    // Step 1: check DLE search results (fast, sometimes works)
    const queries = buildTitleQueries(titles);
    let dleFoundCards = false;
    for (const title of queries) {
        try {
            const ranked = await searchByTitle(title, 'movie');
            if (ranked.length > 0) {
                dleFoundCards = true;
                if (ranked[0]._score >= MIN_MATCH_SCORE) {
                    const streams = await verifyAndExtractMovieStreams(ranked[0].newsId, tmdbId, subType);
                    if (streams && streams.length > 0) {
                        const resolved = await resolveCandidates(streams);
                        console.log('[Frenchstream] Movie found via DLE search: ' + resolved.length + ' streams');
                        return resolved;
                    }
                }
            } else if (!dleFoundCards) {
                // First query returned 0 cards — DLE search is broken for this film, skip remaining
                break;
            }
        } catch (e) {
            console.warn(`[Frenchstream] Movie search query failed: ${e?.message}`);
        }
    }

    // Step 2: fetch category pages, starting with TMDB genre relevance
    const details = await getTmdbDetails(tmdbId, 'movie');
    const genreIds = (details?.genres || []).map(g => g.id);
    const priorityCats = [...new Set(genreIds.map(id => GENRE_TO_CATEGORY[id]).filter(Boolean))];

    // Build ordered list: priority cats first, then remaining
    const catsToCheck = [...priorityCats];
    for (const cat of ALL_CATEGORIES) {
        if (!catsToCheck.includes(cat)) catsToCheck.push(cat);
    }

    const seenNewsIds = new Set();
    let bestMatch = null;
    let bestScore = 0;

    // Process category batch results and look for matches
    function processCatResults(results) {
        let found = false;
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            for (const movie of r.value) {
                if (seenNewsIds.has(movie.newsId)) continue;
                seenNewsIds.add(movie.newsId);
                const score = scoreMovieCategory(movie.title, titles);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = movie;
                    if (score >= MOVIE_MATCH_SCORE) found = true;
                }
            }
        }
        return found;
    }

    // OPTIMISATION: Fetch catégories séquentiellement avec early-exit
    // (fetch synchrone en QuickJS = Promise.allSettled ne parallélise pas)
    const priorityBatch = priorityCats.length > 0 ? priorityCats : catsToCheck.slice(0, 5);
    for (const cat of priorityBatch) {
        if (bestScore >= MOVIE_MATCH_SCORE) break;
        if (Date.now() - startTime > BUDGET_MS) break;

        try {
            const catMovies = await fetchCategoryMovies(cat);
            for (const movie of catMovies) {
                if (seenNewsIds.has(movie.newsId)) continue;
                seenNewsIds.add(movie.newsId);
                const score = scoreMovieCategory(movie.title, titles);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = movie;
                }
            }
        } catch (e) { /* skip failed category */ }
    }

    if (bestMatch && bestScore >= MOVIE_MATCH_SCORE) {
        const streams = await verifyAndExtractMovieStreams(bestMatch.newsId, tmdbId, subType);
        if (streams && streams.length > 0) {
            const resolved = await resolveCandidates(streams);
            console.log('[Frenchstream] Movie found via category: ' + bestMatch.title + ' → ' + resolved.length + ' streams');
            return resolved;
        }
    }

    // If best score from priority cats is too low (< 40), bail early — film likely not on site
    if (bestScore < 40) {
        return [];
    }

    // Try remaining categories séquentiellement
    const remainingCats = catsToCheck.filter(c => !priorityBatch.includes(c));
    for (const cat of remainingCats) {
        if (bestScore >= MOVIE_MATCH_SCORE) break;
        if (Date.now() - startTime > BUDGET_MS) break;

        try {
            const catMovies = await fetchCategoryMovies(cat);
            for (const movie of catMovies) {
                if (seenNewsIds.has(movie.newsId)) continue;
                seenNewsIds.add(movie.newsId);
                const score = scoreMovieCategory(movie.title, titles);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = movie;
                }
            }
        } catch (e) { /* skip failed category */ }
    }

    if (bestMatch && bestScore >= MOVIE_MATCH_SCORE) {
        const streams = await verifyAndExtractMovieStreams(bestMatch.newsId, tmdbId, subType);
        if (streams && streams.length > 0) {
            const resolved = await resolveCandidates(streams);
            console.log('[Frenchstream] Movie found via category: ' + bestMatch.title + ' → ' + resolved.length + ' streams');
            return resolved;
        }
    }

    return [];
}

/* ---------- MAIN EXPORT ---------- */

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const startTime = Date.now();
    const BUDGET_MS = 45000;
    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    const subType = await detectSubType(tmdbId, mediaType, titles);
    if (subType) console.log('[Frenchstream] subType: ' + subType);

    if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return [];

    // FIX MAJEUR ("les épisodes ne correspondent pas") : l'app passe 'series'
    // (jamais 'tv'). L'ancien check `mediaType === 'tv'` était TOUJOURS false →
    // toutes les séries partaient dans le chemin film (recherche titre incohérente).
    const isTv = mediaType === 'tv' || mediaType === 'series';
    if (isTv) {
        // --- ArmSync: resolve absolute episode for TV series ---
        // NB: on passe 'tv' car resolveTargetEpisodes attend ce libellé interne.
        const targetEpisodes = await resolveTargetEpisodes(tmdbId, 'tv', season, episode);
        // ------------------------------------

        // Étape 0 (définitif) : xfsearch par tag TMDB s-{tmdbId}. Vérifié en live :
        // xf=s-94605 → Arcane Saison 1 (newsid 15109855) + Saison 2. Le tag réel
        // de la page est s-{TMDB ID} (ex: s-94605) — JAMAIS s-{newsid}.
        let tagCards = [];
        try { tagCards = await searchByTmdbTag(tmdbId, 'tv'); } catch (e) { /* ignore */ }

        // Étape 1: Chercher la page de la série (xfsearch d'abord, POST search fallback)
        let serieTag = null;
        let firstSeasonNewsId = null;
        try {
            for (const card of tagCards) {
                const pageHtml = await fetchText(card.href || card.baseUrl + '/index.php?newsid=' + card.newsId, { baseUrl: card.baseUrl || BASE_URL, timeout: 10000 });
                serieTag = extractSerieTag(pageHtml);
                const firstSeasonMatch = pageHtml.match(/data-news-id=["']?(\d+)/);
                if (firstSeasonMatch) firstSeasonNewsId = firstSeasonMatch[1];
                if (serieTag) {
                    console.log('[Frenchstream] Extracted serie_tag: ' + serieTag + ' from xfsearch');
                    break;
                }
            }
            if (!serieTag) for (const title of buildTitleQueries(titles)) {
                const ranked = await searchByTitle(title, 'tv', effectiveSeason);
                if (ranked.length > 0 && ranked[0]._score >= MIN_MATCH_SCORE) {
                    const card = ranked[0];
                    const pageHtml = await fetchText(card.href || card.baseUrl + '/index.php?newsid=' + card.newsId, { baseUrl: card.baseUrl || BASE_URL, timeout: 10000 });
                    serieTag = extractSerieTag(pageHtml);
                    // Extraire aussi le newsId de la première saison depuis la page
                    const firstSeasonMatch = pageHtml.match(/data-news-id=["']?(\d+)/);
                    if (firstSeasonMatch) firstSeasonNewsId = firstSeasonMatch[1];
                    if (serieTag) {
                        console.log('[Frenchstream] Extracted serie_tag: ' + serieTag + ' from search');
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn('[Frenchstream] Serie tag extraction failed: ' + e.message);
        }

        // Étape 2: Fetch les saisons avec le bon tag (extrait ou fallback TMDB ID)
        let seasons = [];
        if (serieTag) {
            try {
                seasons = await fetchSeasonsRaw(serieTag);
            } catch (e) {
                console.warn(`[Frenchstream] fetchSeasons(tag=${serieTag}) failed: ${e.message}`);
            }
        }
        // Fallback: essayer avec s-{tmdbId} (ancien comportement)
        if (seasons.length === 0) {
            try {
                seasons = await fetchSeasons(tmdbId);
            } catch (e) {
                console.warn(`[Frenchstream] fetchSeasons(tmdbId=${tmdbId}) failed: ${e.message}`);
            }
        }
        // Si on a un firstSeasonNewsId, essayer directement fetchEpisodeData
        if (seasons.length === 0 && firstSeasonNewsId) {
            try {
                const epData = await fetchEpisodeData(firstSeasonNewsId);
                if (epData) {
                    for (const ep of targetEpisodes) {
                        const candidates = collectTvSiteCandidates(epData, ep, subType);
                        if (candidates.length > 0) {
                            const streams = await resolveCandidates(candidates);
                            console.log('[Frenchstream] Direct eps ' + firstSeasonNewsId + ': ' + candidates.length + ' candidates, ' + streams.length + ' streams (ep=' + ep + ')');
                            return streams;
                        }
                    }
                }
            } catch (e) {
                console.warn('[Frenchstream] Direct episode data failed: ' + e.message);
            }
        }
        if (seasons.length > 0) {
            const sn = Number(effectiveSeason) || 1;
            const sIdx = seasons.findIndex(s => /saison\s*(\d+)/i.test(s.title) && parseInt(s.title.match(/saison\s*(\d+)/i)[1]) === sn);
            const target = sIdx !== -1 ? seasons[sIdx] : seasons[0];
            if (target) {
                let epData = null;
                try {
                    epData = await fetchEpisodeData(target.id);
                } catch (e) {
                    console.warn(`[Frenchstream] fetchEpisodeData failed: ${e.message}`);
                }
                if (epData) {
                    for (const ep of targetEpisodes) {
                        const candidates = collectTvSiteCandidates(epData, ep, subType);
                        if (candidates.length > 0) {
                            const streams = await resolveCandidates(candidates);
                            if (streams.length > 0) {
                                console.log('[Frenchstream] Site eps ' + target.id + ': ' + candidates.length + ' candidates, ' + streams.length + ' streams (ep=' + ep + ')');
                                return streams;
                            }
                        }
                    }
                }
                // FIX "épisode ne correspond pas" : la saison ciblée n'a pas
                // l'épisode demandé (cas fréquent : les derniers épisodes sont
                // publiés dans une autre saison du site) → retenter sur la
                // dernière saison disponible avant d'abandonner.
                const last = seasons[seasons.length - 1];
                if (last && last.id !== target.id) {
                    try {
                        const lastData = await fetchEpisodeData(last.id);
                        if (lastData) {
                            for (const ep of targetEpisodes) {
                                const candidates = collectTvSiteCandidates(lastData, ep, subType);
                                if (candidates.length > 0) {
                                    const streams = await resolveCandidates(candidates);
                                    if (streams.length > 0) {
                                        console.log('[Frenchstream] Last-season fallback ' + last.id + ': ' + streams.length + ' streams (ep=' + ep + ')');
                                        return streams;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('[Frenchstream] Last-season fallback failed: ' + e.message);
                    }
                }
            }
        }
        console.warn('[Frenchstream] No streams found via site API, trying DLE search fallback...');
        // DLE search fallback: search by title and extract episode data from the card
        for (const title of buildTitleQueries(titles)) {
            if (isBudgetExhausted(startTime, BUDGET_MS)) break;
            try {
                const ranked = await searchByTitle(title, 'tv', effectiveSeason);
                if (ranked.length > 0 && ranked[0]._score >= MIN_MATCH_SCORE) {
                    const card = ranked[0];
                    // Extract newsId from card and try to fetch episode data
                    const cardUrl = card.href || '';
                    const modalMatch = (await (async () => {
                        try {
                            const html = await fetchText(cardUrl, { baseUrl: card.baseUrl || BASE_URL, timeout: 10000 });
                            return html.match(/data-news-id="(\d+)"/)?.[1] || html.match(/openModal\('(\d+)'\)/)?.[1];
                        } catch { return null; }
                    })());
                    if (modalMatch) {
                        const epData = await fetchEpisodeData(modalMatch);
                        if (epData) {
                            for (const ep of targetEpisodes) {
                                const candidates = collectTvSiteCandidates(epData, ep, subType);
                                if (candidates.length > 0) {
                                    const streams = await resolveCandidates(candidates);
                                    console.log('[Frenchstream] DLE fallback eps ' + modalMatch + ': ' + candidates.length + ' candidates, ' + streams.length + ' streams (ep=' + ep + ')');
                                    return streams;
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`[Frenchstream] DLE fallback failed for "${title}": ${e?.message}`);
            }
        }
        return [];
    }

    // Movies: site-native category browsing → film_api verification
    const movieStreams = await searchMovieOnSite(tmdbId, titles, subType);
    if (movieStreams.length > 0) return movieStreams;

    return [];
}
