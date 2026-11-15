/**
 * Extractor for Nakios — **nakios.live** (2026-11)
 *
 * Le site a changé de moteur : ce n'est plus l'API JSON `api.nakios.store`
 * (morte, Cloudflare 525) mais une app **Laravel + Livewire**. Conséquences :
 *
 *  - Les sources ne sont plus dans un JSON mais dans un attribut HTML
 *    `wire:snapshot="…"` (JSON échappé en entités) des composants
 *    `watch-component` (film/épisode) et `season-component` (série).
 *  - Les URLs ne contiennent plus l'ID TMDB mais un **slug** :
 *      film   → /movie/{slug}
 *      série  → /tv-show/{slug}
 *      épisode→ /episode/{slug}/{saison}-{episode}
 *    D'où la résolution par slug (page directe puis /search/{titre}).
 *  - Chaque source est un embed **iframe** (vidzy, uqload, kakaflix, byse…) et
 *    l'API renvoie les DEUX versions (VF **et** VOSTFR) : l'ancien provider ne
 *    renvoyait qu'UNE source → VF manquante et flux morts au premier host down.
 *
 * Pipeline : titre TMDB → slug → page → snapshot → tous les embeds (VF+VOSTFR)
 * → resolveStream (résolveurs maison) → streams directs.
 */

import { fetchPage, BASE_URL, setCurrentSignal } from './http.js';
import {
    resolveStream, withTimeout, isAborted, isBudgetExhausted, sortStreamsByLanguage,
} from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { resolveSeasonEpisodeInputs } from '../utils/dle-extractor.js';

// ─── Réglages ────────────────────────────────────────────────────────────────
const BUDGET_MS = 42000;
const EMBED_TIMEOUT_MS = 9000;
const MAX_SEARCH_TITLES = 4;
const MAX_EMBEDS_PER_VERSION = 3;
const MAX_STREAMS = 12;

// Un embed par version est déjà résolu avant ; on garde une marge pour les
// variantes HLS (720p/480p) qui multiplient les entrées.
const SKIP_EMBED_HOSTS = [
    // bysebuho : player frontend qui exige un payload AES-256-GCM (WebCrypto
    // absent de NuvioTV) → irrésoluble côté runtime, on ne gaspille pas 9 s.
    'bysebuho.com',
];

// Priorité de résolution : vidzy/fsvid répondent en HTML clair, uqload a un
// résolveur natif, le reste est tenté ensuite (kakaflix/voe = packé + DNS
// instable, kokoflix = famille DoodStream avec challenge Turnstile).
function embedRank(url) {
    const u = String(url || '').toLowerCase();
    if (u.includes('vidzy') || u.includes('fsvid')) return 0;
    if (u.includes('uqload') || u.includes('oneupload')) return 1;
    if (u.includes('kakaflix') || u.includes('voe')) return 2;
    if (u.includes('kokoflix') || u.includes('dood') || u.includes('playmogo')) return 3;
    // luluvid/lulustream → CDN tnmr.org : 403 ou 302 vers un hôte injoignable
    // (vérifié live 2026-11). Tenté en dernier, jamais retiré (ça remarche
    // parfois depuis une IP résidentielle).
    if (u.includes('luluvid') || u.includes('lulust') || u.includes('tnmr')) return 5;
    return 4;
}

// ─── Normalisation ───────────────────────────────────────────────────────────
function normalize(s) {
    if (!s) return '';
    return String(s).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[’'`:!.,?]/g, ' ')
        .replace(/&/g, ' et ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(the|les|le|la|des|de|du|a|an|of|and|et)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toSlug(title) {
    if (!title) return '';
    return String(title).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[’'`:!.,?]/g, ' ')
        .replace(/&/g, ' et ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

function tokens(s) {
    return normalize(s).split(' ').filter(w => w.length > 1);
}

/** Part des mots du titre TMDB présents dans la chaîne candidate (0..1). */
function titleCoverage(candidate, title) {
    const want = tokens(title);
    if (!want.length) return 0;
    const got = new Set(tokens(candidate));
    let hit = 0;
    for (const w of want) if (got.has(w)) hit++;
    return hit / want.length;
}

function stripSeasonSuffix(title) {
    return String(title || '')
        .replace(/\s*[-–:]\s*(?:saison|season|partie|part|cour|s)\s*\d{1,2}\s*$/i, '')
        .replace(/\s+(?:saison|season|partie|part|cour)\s*\d{1,2}\s*$/i, '')
        .trim();
}

// ─── Parsing Livewire ────────────────────────────────────────────────────────

/** Décode les entités HTML d'un attribut `wire:snapshot` (JSON échappé). */
function unescapeAttr(raw) {
    return String(raw)
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

/**
 * Tous les snapshots Livewire de la page, parsés.
 * Un snapshot = {data, memo, checksum} ; `data` porte les infos utiles.
 */
function readSnapshots(html) {
    const out = [];
    if (!html) return out;
    let from = 0;
    for (;;) {
        const mark = html.indexOf('wire:snapshot="', from);
        if (mark < 0) break;
        const start = mark + 'wire:snapshot="'.length;
        const end = html.indexOf('"', start);
        if (end < 0) break;
        from = end + 1;
        const raw = unescapeAttr(html.slice(start, end));
        try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.data) out.push(parsed);
        } catch (e) { /* snapshot non JSON (markup) → ignoré */ }
    }
    return out;
}

/**
 * Entrées vidéo d'un snapshot `watch-component` :
 * `videos` est un tableau imbriqué de records
 *   { server_name, label, version: 'VF'|'VOSTFR', embed_type, type, link }
 * (les tableaux Livewire sont marqués par `{"s":"arr"}` — d'où le walk récursif).
 */
function collectEntries(data) {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { for (const v of node) walk(v); return; }
        if (typeof node.link === 'string' && /^https?:/i.test(node.link)) {
            const key = `${node.version || ''}|${node.link}`;
            if (!seen.has(key)) {
                seen.add(key);
                out.push({
                    link: node.link,
                    version: String(node.version || '').toUpperCase() || 'VF',
                    server: node.server_name || 'Server',
                    label: node.label || 'HD',
                    embedType: node.embed_type || '',
                });
            }
        }
        for (const k of Object.keys(node)) {
            const v = node[k];
            if (v && typeof v === 'object') walk(v);
        }
    };
    walk(data.videos);
    if (!out.length) walk(data.videosByVersion);
    return out;
}

/** Snapshot du lecteur (film ou épisode). */
function watchSnapshot(html) {
    const snaps = readSnapshots(html);
    for (const s of snaps) {
        if (s.data && (s.data.videos || s.data.videosByVersion)) return s;
    }
    return null;
}

/** Saison + nombre d'épisodes exposés par la fiche série. */
function seasonInfo(html) {
    const info = { season: null, count: 0, hasVf: false, hasVostfr: false };
    if (!html) return info;
    const snaps = readSnapshots(html);
    for (const s of snaps) {
        const d = s.data || {};
        if (d.season_number != null && info.season == null) info.season = parseInt(d.season_number, 10) || null;
        const versions = d.availableVersions;
        if (Array.isArray(versions)) {
            const flat = JSON.stringify(versions).toUpperCase();
            if (flat.includes('VF')) info.hasVf = true;
            if (flat.includes('VOSTFR')) info.hasVostfr = true;
        }
    }
    const eps = html.match(/\/episode\/[a-z0-9-]+\/\d+-\d+/g) || [];
    info.count = new Set(eps).size;
    return info;
}

/** Cartes de `/search/{q}` : {slug, type, title, year}. */
function parseSearchCards(html) {
    const cards = [];
    if (!html) return cards;
    const seen = new Set();
    const re = /href="(?:https?:\/\/[^/"]+)?\/(movie|tv-show)\/([a-z0-9][a-z0-9-]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const type = m[1];
        const slug = m[2];
        if (seen.has(slug)) continue;
        seen.add(slug);
        // Le titre et l'année sont rendus juste après le lien de la carte.
        const seg = html.slice(m.index, m.index + 3000);
        const h3 = seg.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
        const year = seg.match(/<span>\s*(\d{4})\s*<\/span>/);
        const title = h3 ? unescapeAttr(h3[1].replace(/<[^>]+>/g, '')).trim() : '';
        cards.push({ slug, type, title, year: year ? parseInt(year[1], 10) : null });
    }
    return cards;
}

function pageTitle(html) {
    const m = String(html || '').match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
    if (!m) return '';
    return unescapeAttr(m[1])
        .replace(/\s*\|.*$/, '')
        .replace(/\s*[-–]\s*Nakios\s*$/i, '')
        .replace(/\s+streaming\b.*$/i, '')
        .trim();
}

/**
 * Années affichées par la fiche (`<span>1999</span>`). On ne scanne PAS le
 * HTML brut : les `viewBox="0 0 24 24"` / durées produisaient des faux
 * positifs (2000) qui faisaient rejeter la bonne fiche.
 */
function pageYears(html) {
    const out = [];
    const re = /<span>\s*((?:19|20)\d{2})\s*<\/span>/g;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) out.push(parseInt(m[1], 10));
    return out;
}

// ─── Résolution du slug ──────────────────────────────────────────────────────

function typePath(isMovie) {
    return isMovie ? 'movie' : 'tv-show';
}

/**
 * Vérifie qu'une fiche correspond bien au contenu TMDB (garde anti
 * faux-positif : `lego-one-piece` pour « One Piece », `the-boys-in-the-band`…).
 */
function matchesContent(html, titles, year) {
    const title = pageTitle(html);
    if (!title) return false;
    let best = 0;
    for (const t of titles) best = Math.max(best, titleCoverage(title, stripSeasonSuffix(t)));
    if (best < 0.6) return false;
    if (year) {
        const ys = pageYears(html);
        if (ys.length && !ys.some(y => Math.abs(y - year) <= 1)) {
            console.log(`[Nakios] Fiche "${title}" rejetée (années ${ys.slice(0, 3).join('/')} ≠ ${year})`);
            return false;
        }
    }
    return true;
}

/**
 * Trouve la fiche Nakios : d'abord le slug direct (le site slugifie le titre
 * TMDB tel quel), puis `/search/{titre}` avec scoring.
 */
async function findPost(ctx) {
    const { titles, isMovie, year, startTime, signal } = ctx;
    const path = typePath(isMovie);

    // 1. Slug direct — 1 requête, validation forte par le <title>.
    for (const t of titles.slice(0, 3)) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        const slug = toSlug(stripSeasonSuffix(t));
        if (!slug || slug.length < 2) continue;
        const html = await fetchPage(`/${path}/${slug}`, { signal });
        if (!html) continue;
        if (matchesContent(html, titles, year)) {
            console.log(`[Nakios] Fiche directe: /${path}/${slug}`);
            return { slug, html };
        }
    }

    // 2. Recherche du site (page publique /search/{q}, pas de Livewire requis).
    const cards = [];
    const bySlug = new Set();
    for (const q of titles.slice(0, MAX_SEARCH_TITLES)) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
        const html = await fetchPage(`/search/${encodeURIComponent(q)}`, { signal });
        if (!html) continue;
        for (const c of parseSearchCards(html)) {
            if (c.type !== path) continue;
            if (bySlug.has(c.slug)) continue;
            bySlug.add(c.slug);
            cards.push(c);
        }
        if (cards.length) break; // le 1er titre qui indexe quelque chose suffit
    }
    if (!cards.length) {
        console.warn('[Nakios] Aucune fiche trouvée pour ce contenu');
        return null;
    }

    let best = null;
    let bestScore = 0;
    for (const c of cards) {
        let score = 0;
        for (const t of titles) score = Math.max(score, titleCoverage(c.title || c.slug.replace(/-/g, ' '), stripSeasonSuffix(t)));
        if (year && c.year) {
            const diff = Math.abs(c.year - year);
            if (diff > 2) continue;
            if (diff === 0) score += 0.1;
        }
        if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best || bestScore < 0.5) {
        console.warn(`[Nakios] Aucune fiche assez proche (meilleur score ${bestScore.toFixed(2)})`);
        return null;
    }

    const html = await fetchPage(`/${path}/${best.slug}`, { signal });
    if (!html) return null;
    console.log(`[Nakios] Fiche via recherche: /${path}/${best.slug} (score ${bestScore.toFixed(2)})`);
    return { slug: best.slug, html };
}

// ─── Page à lire (film ou épisode) ───────────────────────────────────────────

/**
 * Charge la page porteuse des sources.
 * Un épisode vit sur /episode/{slug}/{saison}-{episode}. Deux replis :
 *  - numérotation ABSOLUE stockée en saison 1 (animes : `/episode/x/1/{abs}`) ;
 *  - saison demandée absente du catalogue (le site ne garde que la **dernière**
 *    saison) → repli explicite sur la saison présente, **annoncé dans le titre**
 *    du flux (`Saison 5 (S1 absente du site)`) pour ne jamais faire croire à
 *    l'épisode d'origine.
 *
 * Retour : `{ html, servedSeason }` ou `null`.
 */
async function loadWatchPage(ctx, slug) {
    const { isMovie, seasonNum, epNum, absEp, signal } = ctx;
    if (isMovie) {
        const html = await fetchPage(`/movie/${slug}`, { signal });
        return html ? { html, servedSeason: null } : null;
    }

    const attempts = [`/${'episode'}/${slug}/${seasonNum}-${epNum}`];
    if (absEp && absEp !== epNum && absEp > 0) {
        attempts.push(`/episode/${slug}/1-${absEp}`);
    }

    for (const path of attempts) {
        const html = await fetchPage(path, { signal });
        if (html && watchSnapshot(html)) {
            console.log(`[Nakios] Épisode: ${path}`);
            return { html, servedSeason: null };
        }
    }

    // Diagnostic : la série est-elle limitée à sa dernière saison ?
    if (!isAborted(signal) && !isBudgetExhausted(ctx.startTime, BUDGET_MS)) {
        const post = await fetchPage(`/tv-show/${slug}`, { signal });
        const info = seasonInfo(post);
        if (info.season != null) {
            if (info.season !== seasonNum) {
                // `info.count` ne compte que les liens d'épisodes rendus sur la
                // fiche (souvent paginés/partiels) : pas de garde dessus, c'est
                // la présence du `wire:snapshot` sur la page qui décide.
                const fbPath = `/episode/${slug}/${info.season}-${epNum}`;
                const fbHtml = await fetchPage(fbPath, { signal });
                if (fbHtml && watchSnapshot(fbHtml)) {
                    console.warn(`[Nakios] Saison ${seasonNum} absente du catalogue — repli explicite sur la saison ${info.season} (${fbPath})`);
                    return { html: fbHtml, servedSeason: info.season };
                }
                console.warn(`[Nakios] Saison ${seasonNum} absente (site: saison ${info.season}) et pas d'épisode ${epNum} dans celle-ci`);
                return null;
            }
            console.warn(`[Nakios] Épisode ${epNum} absent de la saison ${seasonNum} (${info.count} ép. listés)`);
        } else {
            console.warn(`[Nakios] Aucune page épisode pour S${seasonNum}E${epNum}`);
        }
    }
    return null;
}

// ─── Streams ─────────────────────────────────────────────────────────────────

/** Langue exposée à l'app (VF→fr, VOSTFR→langue originale, défaut ja). */
function versionLanguage(version, meta) {
    const v = String(version || '').toUpperCase();
    if (v.includes('VOSTFR') || v.includes('VOSTA') || v === 'VO' || v === 'SUBFRENCH') {
        const orig = meta && meta.originalLanguage ? String(meta.originalLanguage).toLowerCase() : '';
        if (orig && orig !== 'fr') return orig;
        return meta && meta.isAnime ? 'ja' : (orig || 'fr');
    }
    if (v.includes('MULTI')) return 'multi';
    return 'fr';
}

async function resolveEmbed(entry, lang, meta, signal, startTime, note) {
    if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) return null;
    const label = String(entry.label || 'HD').toUpperCase();
    const versionTag = entry.version.includes('VOSTFR') ? 'VOSTFR' : entry.version;
    const base = {
        name: 'Nakios',
        title: `[${versionTag}] ${entry.server} - ${label}${note ? ` · ${note}` : ''}`,
        url: entry.link,
        quality: label === 'HD' ? 'HD' : label,
        language: lang,
        headers: { Referer: `${BASE_URL}/`, Origin: BASE_URL },
    };
    try {
        const resolved = await withTimeout(resolveStream(base, 0), EMBED_TIMEOUT_MS, 'Nakios embed');
        if (!resolved || !resolved.url) return null;
        if (resolved.isDirect === false) return null;
        if (String(resolved.url).includes('[object')) return null;
        delete resolved.isDirect;
        delete resolved.originalUrl;
        return resolved;
    } catch (e) {
        if (isAborted(signal)) return null;
        return null;
    }
}

// ─── Entrée ──────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const startTime = Date.now();
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const isMovie = type === 'movie';

    // Convention app : season=null + épisode ABSOLU (IDs anime kitsu:/mal:).
    const se = await resolveSeasonEpisodeInputs(season, episode, tmdbId, { mediaType: type, startTime, budgetMs: BUDGET_MS });
    const seasonNum = isMovie ? 1 : Math.max(1, se.season || 1);
    const epNum = Math.max(1, se.episode || 1);
    const absEp = se.absolute != null ? se.absolute : epNum;

    console.log(`[Nakios] ${type} ${tmdbId} → S${seasonNum}E${epNum}${absEp !== epNum ? ` (abs ${absEp})` : ''}`);

    let titles = [];
    try {
        titles = await getTmdbTitles(tmdbId, type, { season: seasonNum });
    } catch (e) {
        if (isAborted(signal)) return [];
    }
    if (!titles || titles.length === 0) {
        console.warn('[Nakios] Aucun titre TMDB');
        return [];
    }
    const meta = titles._metadata || {};
    const year = meta.year || null;

    const post = await findPost({ titles, isMovie, year, startTime, signal });
    if (!post) return [];

    const page = await loadWatchPage({ isMovie, seasonNum, epNum, absEp, startTime, signal }, post.slug);
    if (!page) return [];
    const { html } = page;
    // Repli cross-saison assumé et visible par l'utilisateur.
    const seasonNote = page.servedSeason && page.servedSeason !== seasonNum
        ? `Saison ${page.servedSeason} (S${seasonNum} absente du site)`
        : null;

    const snap = watchSnapshot(html);
    const entries = snap ? collectEntries(snap.data) : [];
    if (!entries.length) {
        console.warn('[Nakios] Aucune source dans la page (lecteur vide ou nouveau layout)');
        return [];
    }
    console.log(`[Nakios] ${entries.length} source(s) déclarée(s): ${entries.map(e => `${e.version}/${e.server}`).join(', ')}`);

    // Ordre : VF d'abord (attendu par la plupart des utilisateurs), puis VOSTFR ;
    // à version égale, les hosts les plus rapides.
    const ordered = entries
        .filter(e => {
            const u = e.link.toLowerCase();
            return !SKIP_EMBED_HOSTS.some(h => u.includes(h));
        })
        .sort((a, b) => {
            const va = a.version.includes('VOSTFR') ? 1 : 0;
            const vb = b.version.includes('VOSTFR') ? 1 : 0;
            if (va !== vb) return va - vb;
            return embedRank(a.link) - embedRank(b.link);
        });

    const streams = [];
    const perVersion = new Map();
    for (const entry of ordered) {
        if (streams.length >= MAX_STREAMS) break;
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) {
            console.warn('[Nakios] Budget atteint — arrêt de la résolution');
            break;
        }
        const vKey = entry.version.includes('VOSTFR') ? 'VOSTFR' : 'VF';
        const done = perVersion.get(vKey) || 0;
        if (done >= MAX_EMBEDS_PER_VERSION) continue;

        const lang = versionLanguage(entry.version, meta);
        const st = await resolveEmbed(entry, lang, meta, signal, startTime, seasonNote);
        if (!st) continue;
        perVersion.set(vKey, done + 1);
        streams.push(st);
    }

    if (!streams.length) {
        console.warn(`[Nakios] 0 flux résolu sur ${entries.length} source(s) — hosts morts ou protégés`);
        return [];
    }
    console.log(`[Nakios] ${streams.length} flux résolu(s) en ${Date.now() - startTime} ms`);
    return sortStreamsByLanguage(streams);
}
