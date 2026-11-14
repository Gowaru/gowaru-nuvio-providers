/**
 * Extractor Logic for Anime-Sama — nouveau front `animes-sama.fr` (2026-11).
 *
 * L'ancien front (`anime-sama.to`) servait la liste des lecteurs dans
 * `/catalogue/{slug}/{saison}/{lang}/episodes.js`. Ce fichier n'existe plus
 * (404 sur tout le catalogue, y compris One Piece) → l'ancien provider rendait
 * 0 stream partout. Le nouveau front fonctionne autrement :
 *
 *  1. `GET /catalogue/{slug}`            fiche : liens
 *     `/catalogue/{slug}/{saison}/{lang}` (+ `film`, `oav`, `scan`).
 *     Le `<title>` sert de garde anti-faux-match.
 *  2. `GET /catalogue/{slug}/{saison}/{lang}`  page saison, qui inline :
 *       - `window.__EPISODE_NUMBERS = [1,2,…]`      numéros affichés
 *       - `var epsN = ["1","", …]`                  disponibilité par lecteur
 *       - `window.__PROFILE = { csrf: "…" }`        jeton de signature
 *     ⚠ `epsN` ne contient plus d'URL : seulement « 1 » ou vide.
 *  3. `POST /api/player/sign/{slug}/{saison}/{lang}` {ep, lecteur} + csrf +
 *     cookie de session → URL signée `/player/…`.
 *  4. Cette URL redirige (302) vers `/player/embed?t=…` puis vers l'embed
 *     hébergeur réel (sibnet, vidmoly, sendvid…), passé à `resolveStream`.
 *
 * Le cookie PHPSESSID est indispensable (sinon 419 sur le sign) : il est capté
 * sur la première page chargée (voir http.js).
 */

import { fetchPage, searchHtml, signPlayer, resolveEmbed, fetchEmbedTitle, ensureSession, setCurrentSignal, BASE_URL } from './http.js';
import {
    resolveStream, withTimeout, isBudgetExhausted, isAborted,
    sortStreamsByLanguage,
} from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import {
    hasForeignLeadingTokens, toSlug, stripSeasonSuffix, normalize,
    resolveSeasonEpisodeInputs,
} from '../utils/dle-extractor.js';

const BUDGET_MS = 40000;
const PLAYER_BUDGET_MS = 20000;
const PAGE_TIMEOUT = 12000;
const PLAYER_TIMEOUT = 9000;
const TARGET_STREAMS = 5;
// Arrêt dès 3 flux : couvre déjà VF + VOSTFR (le site en sert souvent 2 par
// langue) sans enchaîner les slugs suivants (coût en secondes).
const ENOUGH_STREAMS = 3;
const TARGET_PER_LANG = 2;      // lecteurs résolus par langue
const MAX_READERS = 4;          // eps1…epsN sondés par épisode
const MAX_SEARCH_QUERIES = 3;
const MAX_SLUGS_FROM_SEARCH = 4;
const TITLE_GUARD_THRESHOLD = 80;

// Langues du site, par ordre de préférence (le catalogue est VOSTFR-first).
const LANG_ORDER = ['vostfr', 'vf', 'vf1', 'vf2', 'vqc', 'va', 'var', 'vkr', 'vcn'];
const LANG_LABEL = {
    vostfr: 'VOSTFR', vf: 'VF', vf1: 'VF1', vf2: 'VF2', vqc: 'VFQ',
    va: 'VA', var: 'VAR', vkr: 'VKR', vcn: 'VCN',
};
// Codes Nuvio : VOSTFR = audio japonais (cf. AGENTS.md), VA = anglais, etc.
const LANG_CODE = {
    vostfr: 'ja', vf: 'fr', vf1: 'fr', vf2: 'fr', vqc: 'fr',
    va: 'en', var: 'ar', vkr: 'ko', vcn: 'zh',
};

// ─── Garde anti-faux-match ──────────────────────────────────────────────────

function includesWordStrict(hay, needle) {
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

function scorePageTitle(pageName, title) {
    const nt = normalize(title);
    const nr = normalize(pageName);
    if (!nt || !nr) return 0;
    if (nr === nt) return 100;
    if ((includesWordStrict(nr, nt) || includesWordStrict(nt, nr)) && !hasForeignLeadingTokens(nr, nt)) return 80;
    return 0;
}

function maxPageTitleScore(pageName, titles) {
    let best = 0;
    for (const t of titles || []) {
        if (typeof t !== 'string' || !t) continue;
        const s = scorePageTitle(pageName, t);
        if (s > best) best = s;
        if (best >= 100) break;
    }
    return best;
}

// ─── Garde des FILMS ──────────────────────────────────────────────────────
// Le site range certains films sous la fiche de la série (`/film`), sans
// jamais indiquer lequel dans la page : la fiche One Piece `/film` sert en
// réalité « One Piece S01E01 ». On ne garde donc un flux de film que si le
// titre annoncé par l'hébergeur correspond au film demandé.
const TITLE_NOISE = /\b(vostfr|vf\d?|vqc|va|var|vkr|vcn|film|films|movie|movies|le|la|les|de|des|du|the|of|and|et|ep|episode|episodes|saison|season|hd|fhd|sd|video)\b/g;

function titleTokens(s) {
    return normalize(String(s || '').replace(TITLE_NOISE, ' ')).split(' ').filter((w) => w.length > 1);
}

/** Le titre d'embed contient-il le titre du film demandé (≥ 80 % des mots) ? */
function movieTitleMatches(embedTitle, titles) {
    const embedTokens = new Set(titleTokens(embedTitle));
    if (!embedTokens.size) return false;
    for (const t of titles || []) {
        const want = titleTokens(t).filter((w) => w.length > 2);
        if (!want.length) continue;
        let hit = 0;
        for (const w of want) if (embedTokens.has(w)) hit++;
        if (hit / want.length >= 0.8) return true;
    }
    return false;
}

/** `<title>Titre | Anime-Sama …</title>` → « Titre ». */
function extractPageTitle(html) {
    if (!html || html.length < 500) return null;
    const m = html.match(/<title[^>]*>([^<]{2,200})<\/title>/i);
    if (!m) return null;
    return m[1].split('|')[0].replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
}

// ─── Parsing des pages ──────────────────────────────────────────────────────

/**
 * Liens de la fiche : `path` (« saison1 », « film »…) → langues disponibles.
 * Les `scan` (manga) sont ignorés.
 */
function parseFicheLinks(html) {
    const map = new Map();
    if (!html) return map;
    const re = /\/catalogue\/[^"'/\s]+\/([a-z0-9][a-z0-9-]*)\/(vostfr|vf\d*|vqc|va|var|vkr|vcn)\b/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const path = m[1];
        if (path === 'scan') continue;
        if (!map.has(path)) map.set(path, new Set());
        map.get(path).add(m[2]);
    }
    return map;
}

/** Numéros d'épisodes + disponibilité par lecteur + jeton csrf d'une page saison. */
function parseSeasonPage(html) {
    if (!html || html.length < 500) return null;
    const numsRaw = (html.match(/window\.__EPISODE_NUMBERS\s*=\s*(\[[^\]]*\])/) || [])[1];
    if (!numsRaw) return null;
    let numbers = [];
    try { numbers = JSON.parse(numsRaw); } catch (e) { return null; }
    const readers = [];
    const re = /var\s+eps(\d+)\s*=\s*\[([^\]]*)\]/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const idx = parseInt(m[1], 10);
        const flags = m[2].match(/"[^"]*"|'[^']*'/g) || [];
        readers.push({ idx, flags: flags.map((f) => f.slice(1, -1)) });
    }
    const csrf = (html.match(/csrf:\s*"([a-f0-9]{16,})"/) || [])[1] || '';
    return { numbers, readers, csrf };
}

/** Position 0-based de l'épisode demandé dans `__EPISODE_NUMBERS`. */
function episodePosition(numbers, episode) {
    const want = parseInt(episode, 10);
    if (!numbers.length) return null;
    const exact = numbers.indexOf(want);
    if (exact !== -1) return exact;
    // Saison numérotée en absolu (suite de série) : on retombe sur la position.
    const pos = want - 1;
    return pos >= 0 && pos < numbers.length ? pos : null;
}

// ─── Recherche ──────────────────────────────────────────────────────────────

/**
 * Score d'un résultat de recherche.
 * Le sous-titre liste TOUS les titres alternatifs FR/EN/romaji : c'est lui qui
 * rattrape « Attack on Titan » → fiche `shingeki-no-kyojin` (le titre affiché
 * est en romaji, sans recoupement avec la requête anglaise).
 */
function scoreSearchResult(resultTitle, resultSubtitle, query) {
    const q = normalize(query);
    const t = normalize(resultTitle);
    const s = normalize(resultSubtitle || '');
    if (!q) return 0;
    let score = 0;
    if (t === q) return 100;
    if (t && !hasForeignLeadingTokens(t, q)) {
        if (t.includes(q)) score += 60;
        else if (q.includes(t)) score += 40;
        const qWords = q.split(' ').filter((w) => w.length > 3);
        const tWords = t.split(' ').filter((w) => w.length > 3);
        for (const w of qWords) if (tWords.includes(w)) score += 15;
        if (qWords.length >= 2 && tWords.length <= 1) score = Math.min(score, 10);
    }
    // Sous-titre : liste d'alias (égalité/inclusion → excellent signal).
    if (s && q.length >= 4) {
        if (s === q) score = Math.max(score, 100);
        else if (s.includes(q)) score = Math.max(score, 85);
        else if (q.includes(s)) score = Math.max(score, 60);
    }
    return score;
}

/** Recherche AJAX du site → slugs triés par pertinence (seuil 15). */
async function searchSlugs(query, signal, startTime) {
    if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return [];
    const html = await withTimeout(searchHtml(query, { signal }), 10000, 'anime-sama search').catch(() => null);
    if (!html) return [];
    const out = [];
    const seen = new Set();
    for (const block of html.split('<a href="/catalogue/').slice(1)) {
        const slug = block.split('"')[0];
        if (!slug || slug.includes('/') || seen.has(slug)) continue;
        seen.add(slug);
        const title = (block.match(/asn-search-result-title[^>]*>([^<]*)/) || [])[1] || '';
        const subtitle = (block.match(/asn-search-result-subtitle[^>]*>([^<]*)/) || [])[1] || '';
        const score = scoreSearchResult(title, subtitle, query);
        if (score >= 15) out.push({ slug, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.map((r) => r.slug);
}

// ─── Résolution d'une saison ────────────────────────────────────────────────

/**
 * Signe les lecteurs disponibles d'un épisode et résout les embeds.
 * @returns {Promise<Array>} streams directs (isDirect)
 */
async function resolveFromSeasonPage(slugPath, lang, episode, ctx) {
    const seasonPath = `${slugPath}/${lang}`;
    const html = await withTimeout(
        fetchPage(`${BASE_URL}/catalogue/${seasonPath}`, { signal: ctx.signal, timeout: PAGE_TIMEOUT }),
        PAGE_TIMEOUT,
        `season ${seasonPath}`
    ).catch(() => null);
    if (!html) return [];

    const page = parseSeasonPage(html);
    if (!page || !page.readers.length) {
        console.log(`[Anime-Sama] ${seasonPath}: aucun lecteur sur la page`);
        return [];
    }
    if (!page.csrf) {
        console.log(`[Anime-Sama] ${seasonPath}: csrf absent`);
        return [];
    }
    const pos = episodePosition(page.numbers, episode);
    if (pos == null) {
        console.log(`[Anime-Sama] ${seasonPath}: épisode ${episode} absent (${page.numbers.length} dispo)`);
        return [];
    }

    const label = LANG_LABEL[lang] || lang.toUpperCase();
    const code = LANG_CODE[lang] || 'fr';
    const epNumber = page.numbers[pos];
    const streams = [];
    const seenUrls = new Set();

    for (const reader of page.readers.slice(0, MAX_READERS)) {
        if (streams.length >= TARGET_PER_LANG) break;
        if (isAborted(ctx.signal) || isBudgetExhausted(ctx.startTime, BUDGET_MS)) break;
        if (String(reader.flags[pos] || '').trim() === '') continue;

        const signed = await signPlayer(seasonPath, epNumber, reader.idx, page.csrf, { signal: ctx.signal })
            .catch(() => null);
        if (!signed) continue;
        const embedUrl = await resolveEmbed(signed, { signal: ctx.signal }).catch(() => null);
        if (!embedUrl) {
            console.log(`[Anime-Sama] ${seasonPath} lecteur ${reader.idx}: pas d'embed hébergeur`);
            continue;
        }
        if (seenUrls.has(embedUrl)) continue;
        seenUrls.add(embedUrl);

        // Films : vérifier que l'hébergeur sert bien CE film (voir TITLE_NOISE).
        let embedTitle = '';
        if (ctx.mediaType === 'movie') {
            embedTitle = await fetchEmbedTitle(embedUrl, { signal: ctx.signal }).catch(() => '');
            if (!embedTitle) {
                console.log(`[Anime-Sama] ${seasonPath} lecteur ${reader.idx}: film non identifiable, écarté`);
                continue;
            }
            if (!movieTitleMatches(embedTitle, ctx.titles)) {
                console.log(`[Anime-Sama] ${seasonPath} lecteur ${reader.idx}: "${embedTitle}" ≠ film demandé`);
                continue;
            }
            console.log(`[Anime-Sama] ${seasonPath} lecteur ${reader.idx}: film confirmé "${embedTitle}"`);
        }

        try {
            const stream = await withTimeout(
                resolveStream({
                    name: 'Anime-Sama',
                    title: ctx.mediaType === 'movie' && embedTitle
                        ? `${embedTitle} - ${label}`
                        : `Lecteur ${reader.idx} - ${ctx.episodeLabel ? `Ep ${ctx.episodeLabel} - ` : ''}${label}`,
                    url: embedUrl,
                    quality: 'HD',
                    language: code,
                    headers: { Referer: BASE_URL },
                }),
                PLAYER_TIMEOUT,
                `anime-sama lecteur ${reader.idx}`
            );
            if (stream && stream.isDirect && stream.url && !stream.url.includes('[object')) {
                streams.push(stream);
            }
        } catch (e) { /* lecteur mort : on passe au suivant */ }
    }

    console.log(`[Anime-Sama] ${seasonPath} ep ${episode}: ${streams.length} flux`);
    return streams;
}

/** Chemins de saison candidats pour la demande (ordre = coût croissant). */
function seasonPathCandidates(links, mediaType, season) {
    const paths = [...links.keys()];
    const out = [];
    const push = (p) => { if (p && links.has(p) && !out.includes(p)) out.push(p); };

    if (mediaType === 'movie') {
        for (const p of ['film', 'film1', 'oav', 'oav1', 'ona', 'ona1']) push(p);
        return out;
    }
    if (season != null) push(`saison${season}`);
    // Repli : saisons découpées (`saison4-2`…) puis toute saison restante.
    if (season != null) {
        for (const p of paths) if (new RegExp(`^saison${season}-\\d+$`).test(p)) push(p);
    }
    const episodePaths = paths.filter((p) => /^saison\d+$/.test(p));
    if (episodePaths.length === 1) push(episodePaths[0]);
    return out.slice(0, 3);
}

/** Langues à essayer pour un chemin donné (ordre de préférence du site). */
function langsFor(links, path) {
    const langs = links.get(path) || new Set();
    return LANG_ORDER.filter((l) => langs.has(l));
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

async function collectFromSlug(slug, ctx) {
    const html = await withTimeout(
        fetchPage(`${BASE_URL}/catalogue/${slug}`, { signal: ctx.signal, timeout: PAGE_TIMEOUT }),
        PAGE_TIMEOUT,
        `fiche ${slug}`
    ).catch(() => null);
    if (!html) return [];

    const pageTitle = extractPageTitle(html);
    const guard = maxPageTitleScore(pageTitle || '', ctx.titles);
    if (guard < TITLE_GUARD_THRESHOLD) {
        console.log(`[Anime-Sama] Slug ${slug} rejeté: titre "${pageTitle || '?'}" (score ${guard})`);
        return [];
    }
    const links = parseFicheLinks(html);
    if (!links.size) return [];

    const paths = seasonPathCandidates(links, ctx.mediaType, ctx.effectiveSeason);
    if (!paths.length) {
        console.log(`[Anime-Sama] ${slug}: aucune saison pertinente (${[...links.keys()].join(',')})`);
        return [];
    }

    const streams = [];
    for (const path of paths) {
        if (isBudgetExhausted(ctx.startTime, BUDGET_MS) || isAborted(ctx.signal)) break;
        if (streams.length >= TARGET_STREAMS) break;
        const langs = langsFor(links, path);
        // VOSTFR puis VF : les deux langues sont servies quand elles existent
        // (l'app filtre/trie par langue, un seul code priverait la moitié des
        // utilisateurs). Les langues rares (VA/VAR…) ne sont sondées que si
        // rien n'a été trouvé.
        for (const lang of langs.slice(0, 2)) {
            if (streams.length >= TARGET_STREAMS) break;
            if (isBudgetExhausted(ctx.startTime, BUDGET_MS) || isAborted(ctx.signal)) break;
            const found = await resolveFromSeasonPage(`${slug}/${path}`, lang, ctx.episode, ctx);
            for (const s of found) {
                if (!streams.some((x) => x.url === s.url)) streams.push(s);
            }
        }
        if (!streams.length && langs.length > 2) {
            for (const lang of langs.slice(2, 4)) {
                if (isBudgetExhausted(ctx.startTime, BUDGET_MS) || isAborted(ctx.signal)) break;
                const found = await resolveFromSeasonPage(`${slug}/${path}`, lang, ctx.episode, ctx);
                for (const s of found) {
                    if (!streams.some((x) => x.url === s.url)) streams.push(s);
                }
                if (streams.length) break;
            }
        }
        if (streams.length >= ENOUGH_STREAMS) break;
    }
    return streams;
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    // NuvioTV (videoId anime) envoie season=null + épisode absolu.
    const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, {
        mediaType: mediaType === 'movie' ? 'movie' : 'tv',
    });
    season = se.season;
    episode = se.episode;

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles.length) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
    const startTime = Date.now();

    await ensureSession(signal).catch(() => null);

    const ctx = {
        signal,
        startTime,
        mediaType: mediaType === 'movie' ? 'movie' : 'tv',
        titles,
        effectiveSeason,
        episode: parseInt(episode, 10) || 1,
        episodeLabel: mediaType === 'movie' ? '' : (parseInt(episode, 10) || 1),
    };

    // 1. Recherche AJAX du site (le catalogue est FR : les titres TMDB EN ne
    //    donnent souvent aucun slug direct). Les résultats de recherche
    //    passent EN PREMIER, les dérivés toSlug servent de filet.
    const searchCandidates = [];
    const searchTitles = [];
    // Le catalogue est FR : les titres français passent en premier (un titre
    // EN ne ramène souvent qu'un spin-off ou rien).
    const frenchTitles = titles.filter((t) => /[àâéèêëîïôùûüçœæ']/i.test(t));
    for (const t of [...frenchTitles, ...titles]) {
        const b = stripSeasonSuffix(t);
        if (b && !searchTitles.includes(b)) searchTitles.push(b);
        if (searchTitles.length >= MAX_SEARCH_QUERIES) break;
    }
    for (const q of searchTitles) {
        if (isBudgetExhausted(startTime, BUDGET_MS) || isAborted(signal)) break;
        const slugs = await searchSlugs(q, signal, startTime);
        for (const s of slugs) {
            if (!searchCandidates.includes(s)) searchCandidates.push(s);
        }
        if (searchCandidates.length >= MAX_SLUGS_FROM_SEARCH) break;
    }

    // 2. Dérivés toSlug des titres TMDB (gratuit). Pour un FILM, le site range
    //    les longs métrages sous la fiche de la série (`/film`, `/film2`) : on
    //    ne garde que les slugs de film explicites, sinon on servirait le film
    //    d'une autre œuvre.
    const slugGuesses = [];
    const pushGuess = (s) => { if (s && !slugGuesses.includes(s)) slugGuesses.push(s); };
    if (ctx.mediaType === 'movie') {
        for (const t of titles.slice(0, 6)) pushGuess(toSlug(stripSeasonSuffix(t)));
        // Dérivé « série » : le site range les films sous la fiche de la série
        // (ex. `one-piece` → `/catalogue/one-piece/film`). Le contenu est
        // ensuite vérifié par la garde de titre d'embed.
        for (const t of titles.slice(0, 6)) {
            const series = stripSeasonSuffix(t)
                .replace(/\s*[-–:]?\s*(?:the\s+)?(?:movie|film)\b.*$/i, '')
                .replace(/\s*[-–:]?\s*oav\b.*$/i, '')
                .trim();
            if (series && series !== t) pushGuess(toSlug(series));
        }
    } else {
        pushGuess(toSlug(titles[0]));
        for (const t of titles.slice(0, 4)) pushGuess(toSlug(stripSeasonSuffix(t)));
    }
    const candidates = [...searchCandidates, ...slugGuesses];
    console.log(`[Anime-Sama] Candidats: ${candidates.slice(0, 6).join(', ') || '(aucun)'}`);

    const streams = [];
    for (const slug of candidates.slice(0, 6)) {
        if (isBudgetExhausted(startTime, BUDGET_MS) || isAborted(signal)) break;
        if (streams.length >= ENOUGH_STREAMS) break;
        const found = await collectFromSlug(slug, ctx);
        for (const s of found) {
            if (!streams.some((x) => x.url === s.url)) streams.push(s);
        }
    }

    console.log(`[Anime-Sama] Total streams found: ${streams.length}`);
    return sortStreamsByLanguage(streams);
}
