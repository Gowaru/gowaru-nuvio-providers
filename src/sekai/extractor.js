/**
 * Extractor Logic for Sekai (sekai.one)
 *
 * Refonte complète — le site a changé d'architecture et l'ancien parseur
 * ne couvrait plus qu'un seul de ses (nombreux) formats :
 *
 *  1. `var muXX = atob("...")` + boucle `for (var num = 1; num <= lastX; num++)`
 *     → `episode[num] = muXX + "prefix/name-" + num + ".mp4"`   (Dr. Stone, Frieren…)
 *  2. assignations explicites `episodeHD[N] = muNN + "op/saga-N/hd/op-NN.mp4"`
 *     → découpage en sagas sur la page /piece                        (One Piece 1-11)
 *  3. IDs sibnet : `var mugiwara = atob("…sibnet…")` + `episode[N] = "4706669"`
 *     (Naruto, Bleach, Solo Leveling)
 *  4. player JS complet en page (saga-12, Demon Slayer) : `AVAILABLE_EPISODES`
 *     + `buildStreamUrl()` → URL déterministe
 *  5. sous-pages d'arcs (`/bleach-streaming/arc-1`) et scripts annexes
 *     (`lastX.js`, `script/maj.js`)
 *
 * Le slug est désormais résolu depuis le sitemap du site (autorité) : l'ancien
 * tableau SLUG_OVERRIDES pointait vers des slugs inexistants (`rezero`,
 * `drstone`, `jojo` → 404) et le fallback « brute force » retournait la page
 * d'une AUTRE série (d'où les épisodes qui ne correspondaient pas).
 */

import { fetchText, setCurrentSignal } from './http.js';
import { isBudgetExhausted, isAborted, resolveStream, fetchBatch } from '../utils/resolvers.js';
import { resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { getTmdbTitles } from '../utils/metadata.js';
import { createCache } from '../utils/cache.js';

const BASE_URL = 'https://sekai.one';
const BUDGET_MS = 40000;

// Budgets internes
const MAX_SUBPAGES = 14;      // sagas/arcs + scripts annexes
const MAX_EMBED_RESOLVES = 3; // résolutions d'embeds par requête

const withCache = createCache('sk', 'Sekai', { successTtl: 10 * 60_000, failureTtl: 30_000, maxSize: 200 });

/** Hôtes d'embed connus comme morts : aucune tentative (gain de budget). */
const DEAD_HOSTS = ['mugiwara.xyz', 'upvid.co', 'opvid.org', 'jetload'];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

// ─── Helpers texte ──────────────────────────────────────────────────────────

function normalizeText(value) {
    if (!value) return '';
    return String(value)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function words(value) {
    return normalizeText(value).split(' ').filter(Boolean);
}

/**
 * Similarité entre un titre TMDB et un slug du site.
 * Les préfixes de titre sont testés : « Re:Zero kara Hajimeru Isekai Seikatsu »
 * doit matcher le slug `re-zero`.
 */
function titleScore(wanted, slugWords) {
    const a = normalizeText(wanted);
    const b = slugWords;
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.length >= 5 && (b.includes(a) || a.includes(b))) return 70;

    const ta = words(a);
    const tb = b.split(' ').filter(Boolean);
    if (!ta.length || !tb.length) return 0;

    // Préfixes de 1 à 4 mots : couvre les titres longs tronqués côté site
    let best = 0;
    for (const variant of [a, ...ta.slice(0, 4).map((_, i) => ta.slice(0, i + 1).join(' '))]) {
        const va = variant.split(' ').filter(Boolean);
        if (va.join('').length < 3) continue;
        if (variant === b) { best = Math.max(best, 100); continue; }
        let common = 0;
        for (const t of va) if (tb.includes(t)) common++;
        const ratio = common / Math.max(va.length, tb.length);
        if (ratio >= 0.6) best = Math.max(best, Math.round(45 + ratio * 30));
    }
    return best;
}

function isAbortError(e) {
    return !!(e && (e.name === 'AbortError' || String(e.message || '').includes('AbortError')));
}

// ─── Résolution du slug via sitemap ─────────────────────────────────────────

/**
 * Liste des slugs réels du site (sitemap.xml), mise en cache 10 min.
 * Le sitemap est la source d'autorité : plus de slug deviné.
 */
async function getSitemapSlugs() {
    return withCache('sitemap_slugs', async () => {
        try {
            const xml = await fetchText(`${BASE_URL}/sitemap.xml`, { retries: 0 });
            const slugs = [];
            const re = /<loc>([^<]+)<\/loc>/gi;
            let m;
            while ((m = re.exec(xml)) !== null) {
                let path = m[1].trim().replace(/^https?:\/\/[^/]+/i, '').split('?')[0];
                path = path.replace(/^\/+|\/+$/g, '');
                if (!path || path === 'android' || path.includes('.')) continue;
                if (!slugs.includes(path)) slugs.push(path);
            }
            console.log(`[Sekai] Sitemap: ${slugs.length} séries`);
            return slugs;
        } catch (e) {
            console.warn(`[Sekai] Sitemap indisponible: ${e.message}`);
            return [];
        }
    });
}

/** Meilleur slug du sitemap pour les titres TMDB (score >= seuil). */
function findSlugCandidates(slugs, titles, minScore = 45) {
    const scored = [];
    for (const slug of slugs) {
        const slugWords = slug.replace(/-/g, ' ');
        let best = 0;
        for (const t of titles) {
            if (!t || typeof t !== 'string') continue;
            const s = titleScore(t, slugWords);
            if (s > best) best = s;
        }
        if (best >= minScore) scored.push({ slug, score: best });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
}

// ─── Mini-lexer JS ──────────────────────────────────────────────────────────

/**
 * Supprime commentaires `//` et `/* *​/` en respectant les chaînes.
 * Indispensable : le site commente les blocs obsolètes (`// episodeHD[num] = …`)
 * et les parser reviendrait à annoncer des flux inexistants.
 */
function stripJsComments(code) {
    let out = '';
    let i = 0;
    let inStr = null;
    while (i < code.length) {
        const c = code[i];
        const next = code[i + 1];
        if (inStr) {
            if (c === '\\') { out += code.slice(i, i + 2); i += 2; continue; }
            if (c === inStr) inStr = null;
            out += c; i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; i++; continue; }
        if (c === '/' && next === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
        if (c === '/' && next === '*') {
            i += 2;
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        out += c; i++;
    }
    return out;
}

/** Index du `}` fermant la `{` située à openIndex (-1 si introuvable). */
function matchBrace(code, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < code.length; i++) {
        const c = code[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

/** Découpe une expression sur les `+` de premier niveau (chaînes respectées). */
function splitTopLevelPlus(expr) {
    const parts = [];
    let current = '';
    let depth = 0;
    let inStr = null;
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (inStr) {
            current += c;
            if (c === '\\') { current += expr[i + 1] || ''; i++; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'") { inStr = c; current += c; continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        if (c === ')' || c === ']' || c === '}') depth--;
        if (c === '+' && depth === 0) { parts.push(current); current = ''; continue; }
        current += c;
    }
    parts.push(current);
    return parts;
}

/**
 * Évalue une expression de concaténation (`mu4 + "op/saga-1/hd/op-01.mp4"`).
 * Retourne null dès qu'une construction non supportée apparaît (ternaire,
 * appel de fonction, variable inconnue) : on préfère ignorer que produire une
 * URL inventée.
 */
function evalConcatExpr(expr, constants, loopVar, loopValue) {
    const parts = splitTopLevelPlus(expr);
    let out = '';
    for (const raw of parts) {
        const p = raw.trim();
        if (!p) continue;
        const str = p.match(/^"([\s\S]*)"$/) || p.match(/^'([\s\S]*)'$/);
        if (str) { out += str[1]; continue; }
        if (/^\d+$/.test(p)) { out += p; continue; }
        if (/^[A-Za-z_$][\w$]*$/.test(p)) {
            if (constants.has(p)) { out += constants.get(p); continue; }
            if (loopVar && (p === loopVar || p === 'num')) { out += String(loopValue); continue; }
            return null;
        }
        return null;
    }
    return out || null;
}

/** Constantes `var X = atob("…")` et `var X = "https://…"`. */
function extractConstants(code) {
    const constants = new Map();
    const atobRe = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*atob\(\s*["']([^"']+)["']\s*\)/g;
    let m;
    while ((m = atobRe.exec(code)) !== null) {
        try { constants.set(m[1], atob(m[2])); } catch (e) { /* base64 invalide */ }
    }
    const strRe = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*["'](https?:\/\/[^"']+)["']/g;
    while ((m = strRe.exec(code)) !== null) {
        if (!constants.has(m[1])) constants.set(m[1], m[2]);
    }
    return constants;
}

/**
 * Objets de données embarqués exposant `"lastEpisode":N`
 * (`var drstoneData = {"lastEpisode":94,…}`) → Map(nomVar, N).
 */
function extractEmbeddedLastEpisode(code) {
    const map = new Map();
    const re = /"lastEpisode"\s*:\s*(\d+)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        const before = code.slice(Math.max(0, m.index - 400), m.index);
        const v = before.match(/([A-Za-z_$][\w$]*)\s*=\s*\(?\s*\{[^{}]*$/);
        if (v) map.set(v[1], parseInt(m[1], 10));
    }
    return map;
}

/**
 * `var lastX = N` — ou `var lastDrStone = Number(drstoneData.lastEpisode || 87)`
 * (le compteur vient alors d'un objet JSON embarqué).
 */
function extractLastCounters(code, dataObjects) {
    const lasts = new Map();
    const re = /(?:var|let|const)\s+(last[A-Za-z0-9_$]*)\s*=\s*(\d+)/g;
    let m;
    while ((m = re.exec(code)) !== null) lasts.set(m[1], parseInt(m[2], 10));

    const refRe = /(?:var|let|const)\s+(last[A-Za-z0-9_$]*)\s*=\s*(?:Number\s*\(\s*)?([A-Za-z_$][\w$]*)\s*\.\s*lastEpisode\s*(?:\|\|\s*(\d+)\s*)?\)?/g;
    while ((m = refRe.exec(code)) !== null) {
        const value = dataObjects.get(m[2]) ?? (m[3] != null ? parseInt(m[3], 10) : null);
        if (value != null) lasts.set(m[1], value);
    }
    return lasts;
}

/** Boucles `for (var num = a; num <= b; num++) { … }` avec bornes matérialisées. */
function extractLoops(code, lasts) {
    const loops = [];
    const re = /for\s*\(\s*(?:var\s+|let\s+)?([A-Za-z_$][\w$]*)\s*=\s*(\d+)\s*;\s*\1\s*<=\s*([A-Za-z_$][\w$]*|\d+)\s*;\s*\1(?:\+\+|\s*\+=\s*1)\s*\)\s*\{/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        const openBrace = code.indexOf('{', m.index + 3);
        const end = openBrace === -1 ? -1 : matchBrace(code, openBrace);
        if (end === -1) continue;
        const toRaw = m[3];
        const to = /^\d+$/.test(toRaw) ? parseInt(toRaw, 10) : lasts.get(toRaw);
        if (to == null) continue;
        loops.push({
            varName: m[1],
            from: parseInt(m[2], 10),
            to,
            bodyStart: openBrace,
            bodyEnd: end,
        });
        re.lastIndex = end + 1;
    }
    return loops;
}

/**
 * Parse une page (JS inline ou script annexe) et retourne les familles
 * d'épisodes résolues pour les numéros ciblés.
 *
 * @returns {{ families: Map<string, Map<string, string>>, numbers: Map<string, number>, sibnetBase: string|null }}
 */
function parseEpisodeData(code, targetKeys) {
    const cleaned = stripJsComments(code);
    const constants = extractConstants(cleaned);
    const lasts = extractLastCounters(cleaned, extractEmbeddedLastEpisode(cleaned));
    const loops = extractLoops(cleaned, lasts);

    let sibnetBase = null;
    for (const [, value] of constants) {
        if (value.includes('sibnet') && value.includes('php')) { sibnetBase = value; break; }
    }

    const families = new Map();
    const numbers = new Map(); // numOriginale : clé locale → numéro absolu
    const statements = [];

    // Passe 1 : collecte des instructions (indispensable pour connaître le
    // numOriginale AVANT de filtrer les épisodes — sur les sagas One Piece la
    // clé locale (1..N) diffère du numéro absolu).
    const assignmentRe = /([A-Za-z_$][\w$]*)\s*\[\s*([^\]]{1,24}?)\s*\]\s*=\s*([^;]{1,500}?)\s*;/g;
    let m;
    while ((m = assignmentRe.exec(cleaned)) !== null) {
        statements.push({ name: m[1], rawKey: m[2].trim(), expr: m[3], pos: m.index });
    }

    for (const st of statements) {
        if (st.name !== 'numOriginale') continue;
        const key = st.rawKey.replace(/^["']|["']$/g, '');
        const num = parseFloat(evalConcatExpr(st.expr, constants, null, null));
        if (isFinite(num)) numbers.set(key, num);
    }

    // Clés locales à rechercher pour les numéros cibles
    const localKeys = new Set();
    for (const target of targetKeys) {
        for (const [localKey, absNum] of numbers) {
            if (absNum === target) localKeys.add(localKey);
        }
        localKeys.add(String(target));
    }
    const numericLocalKeys = [...localKeys].filter(k => /^\d+$/.test(k)).map(Number);

    // Passe 2 : familles d'épisodes
    for (const st of statements) {
        if (!/^episode/i.test(st.name)) continue;

        let key = st.rawKey.replace(/^["']|["']$/g, '');
        let loopVar = null;

        if (!/^\d+$/.test(key)) {
            // Index non numérique → variable d'une boucle englobante
            const loop = loops.find(l => l.varName === key && st.pos > l.bodyStart && st.pos < l.bodyEnd);
            if (!loop) continue;
            const hit = numericLocalKeys.find(k => k >= loop.from && k <= loop.to);
            if (hit == null) continue;
            loopVar = loop.varName;
            key = String(hit);
        } else if (!localKeys.has(key)) {
            continue;
        }

        const value = evalConcatExpr(st.expr, constants, loopVar, key);
        if (!value) continue;

        if (!families.has(st.name)) families.set(st.name, new Map());
        families.get(st.name).set(key, value);
    }

    return { families, numbers, localKeys, sibnetBase };
}

/**
 * Player JS en page (saga-12 One Piece, Demon Slayer) :
 *   AVAILABLE_EPISODES = [{number:1156,title:"…"}, …]
 *   STREAM_MAIN_BASE_URL = "https://1.mugiwara.one/op"
 *   buildStreamUrl → `${base}/${prefix}-${n}.mp4` (+ /low, + /v1 pour le dernier)
 */
function parseJsPlayerFamily(code, targetKeys) {
    const out = [];
    const cleaned = stripJsComments(code);
    const episodesMatch = cleaned.match(/AVAILABLE_EPISODES\s*=\s*Object\.freeze\(\s*(\[[\s\S]*?\])\s*\)/) ||
        cleaned.match(/AVAILABLE_EPISODES\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!episodesMatch) return out;

    let episodes = [];
    try { episodes = JSON.parse(episodesMatch[1]); } catch (e) { return out; }
    if (!Array.isArray(episodes)) return out;

    const constants = extractConstants(cleaned);
    const origin = constants.get('STREAM_MAIN_BASE_URL') || constants.get('STREAM_ORIGIN');
    if (!origin) return out;

    // Sous-dossier (ex. /kimetsu) déduit du template de preview quand l'origine
    // ne le contient pas déjà (« https://24.mugiwara.one » + /kimetsu).
    const previewMatch = cleaned.match(/PREVIEW_REMOTE_BASE_URL\s*=\s*`\$\{[A-Za-z_$][\w$]*\}\/([^`]*?)\/preview`/);
    const previewFolder = previewMatch ? previewMatch[1] : '';
    let base = origin.replace(/\/$/, '');
    if (previewFolder && !base.endsWith(`/${previewFolder}`)) base = `${base}/${previewFolder}`;

    // Préfixe de fichier quand AVAILABLE_EPISODES ne fournit pas « file »
    const prefixMatch = cleaned.match(/([A-Za-z0-9_-]+)-\$\{episodeNumber\}\.mp4/);
    const fallbackPrefix = prefixMatch ? prefixMatch[1] : null;

    const filmOrigin = (constants.get('FILM_STREAM_ORIGIN') || '').replace(/\/$/, '');
    const numbers = episodes
        .map(e => parseInt(e && e.number, 10))
        .filter(n => isFinite(n));
    if (!numbers.length) return out;
    const lastNumber = Math.max(...numbers);
    const latest = cleaned.match(/v1:\s*["']([^"']+)["']/);

    for (const key of targetKeys) {
        const entry = episodes.find(e => parseInt(e && e.number, 10) === key);
        if (!entry) continue;

        const file = entry.file || (fallbackPrefix ? `${fallbackPrefix}-${key}` : null);
        if (!file) continue;

        // Épisodes « film » servis depuis un autre shard
        if (entry.kind === 'film' && filmOrigin) {
            const filmBase = previewFolder ? `${filmOrigin}/${previewFolder}` : filmOrigin;
            out.push({ url: `${filmBase}/${file}.mp4`, quality: '1080p', rank: 0 });
            continue;
        }

        out.push({ url: `${base}/${file}.mp4`, quality: '1080p', rank: 0 });
        out.push({ url: `${base}/low/${file}.mp4`, quality: '480p', rank: 2 });
        // Dernier épisode : servi depuis un shard dédié (v1/v2)
        if (key === lastNumber && latest) {
            out.push({ url: `${latest[1].replace(/\/$/, '')}/${file}.mp4`, quality: '1080p', rank: 0 });
        }
    }
    return out;
}

// ─── Pages ──────────────────────────────────────────────────────────────────

function inlineScripts(html) {
    const out = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return out;
}

function absoluteUrl(href, slug) {
    if (!href) return null;
    if (/^https?:\/\//i.test(href)) {
        return href.startsWith(BASE_URL) ? href : null;
    }
    return `${BASE_URL}/${href.replace(/^\/+/, '')}`;
}

/**
 * Sous-pages de contenu (sagas, arcs, films) et scripts annexes porteurs
 * d'épisodes (`lastX.js`, `script/maj.js`).
 */
function discoverSubPages(html, slug) {
    const pages = new Map();
    const slugPrefixes = [slug, `${slug}-streaming`, `${slug}-saison`];
    const skipExt = /\.(css|js|png|jpe?g|webp|gif|svg|ico|webmanifest|woff2?|ttf|mp4|webm|icon)$/i;
    const blocked = /^(contact|connexion|android|donate|mentions|privacy|dmca)/i;

    const hrefRe = /href=["']([^"']+)["']/gi;
    let m;
    while ((m = hrefRe.exec(html)) !== null) {
        const raw = m[1].split('?')[0].trim();
        if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('http')) continue;
        if (skipExt.test(raw)) continue;
        const path = raw.replace(/^\/+/, '');
        const first = path.split('/')[0];
        if (!slugPrefixes.some(p => first === p || first.startsWith(`${p}-`))) continue;
        if (blocked.test(first)) continue;
        const url = `${BASE_URL}/${path}`;
        const detected = extractSagaIndexFromUrl(path);
        if (!pages.has(url) || (detected !== null && (pages.get(url)?.index == null))) pages.set(url, { index: detected });
    }

    // Sous-pages liées depuis les blocs actifs (liens jQuery déclenchant les
    // conteneurs saga/soul-society) — plus fiables que l'ordre du DOM.
    const jqAnchorRe = /jQuery\(["']([^"']*?saga-?(\d+)[^"']*?|arc-?(\d+))["']/gi;
    while ((m = jqAnchorRe.exec(html)) !== null) {
        const first = m[1].split('/').pop().replace(/^#/,'');
        if (!first.includes('/')) continue;
        const sagaNum = m[2] ? parseInt(m[2], 10) : (m[3] ? parseInt(m[3], 10) : null);
        const href = m[1].startsWith('/') ? `${BASE_URL}${m[1]}` : `${BASE_URL}/${m[1].startsWith('/') ? m[1] : m[1]}`;
        const norm = href.split('?')[0];
        const detected = sagaNum !== null ? sagaNum : extractSagaIndexFromUrl(norm);
        if (!pages.has(norm) || (detected !== null && (pages.get(norm)?.index == null))) pages.set(norm, { index: detected });
    }

    const found = [...pages.keys()];
    if (!found.length) {
        console.warn(`[Sekai] Sub-pages: aucune sous-page /${slug}/ ou jq liée détectée`);
    }
    return found.map(url => url);
}

/** Extraira un index de numéro à partir de `saga-$\d+` / `arc-\d+` dans un chemin ; null sinon. */
function extractSagaIndexFromUrl(path) {
    const segs = path.split('/').filter(Boolean);
    let last = segs[segs.length - 1] || '';
    const m = last.match(/^(saga|arc)-(\d+)/i);
    if (m) return parseInt(m[2], 10);
    const last2 = segs[segs.length - 2];
    const m2 = last2 && last2.match(/^(saga|arc)-(\d+)/i);
    if (m2) return parseInt(m2[2], 10);
    return null;
}

/** Réordonne les sagas/arcs : les plus proches de l'épisode cible d'abord. */
function orderByIndexHint(pages, targetEp) {
    const withIndex = pages.map(p => {
        const m = p.match(/-(?:saga|arc|saison)-?(\d+)/i) || p.match(/\/(?:saga|arc)-(\d+)/i);
        return { page: p, index: m ? parseInt(m[1], 10) : null };
    });
    if (!withIndex.some(x => x.index != null)) return pages;
    const known = withIndex.filter(x => x.index != null);
    const unknown = withIndex.filter(x => x.index == null).map(x => x.page);
    known.sort((a, b) => Math.abs((targetEp || 1) - a.index * 30) - Math.abs((targetEp || 1) - b.index * 30));
    return [...known.map(x => x.page), ...unknown];
}

// ─── Construction des flux ──────────────────────────────────────────────────

const FAMILY_QUALITY = [
    { test: /HD$|HD\d/i, quality: '1080p', rank: 0 },
    { test: /Low$|Low\d/i, quality: '480p', rank: 2 },
];

function qualityForFamily(name, families) {
    for (const f of FAMILY_QUALITY) if (f.test.test(name)) return f;

    // KAI (remastered) d'une saga à encore paroi : on privilégie les HD-KAI
    // si elles existent, sinon 720p
    const hasKai = /KAI/i.test(name);
    const hasHiDens = /HiDens/i.test(name);
    const out = { quality: hasKai || hasHiDens ? '1080p' : '720p', rank: hasKai ? 0 : 1 };

    if (hasKai) {
        const counterparts = [
            `${name.replace(/KAI\d*$/i,'')}HD`,
        ];
        for (const fam of families) {
            for (const c of counterparts) {
                if (/HIEDN?S?/i.test(fam) && fam !== name) return { quality: '1080p', rank: 0 };
            }
        }
    }
    return out;
}

function isDirectMedia(url) {
    return /\.(mp4|m3u8|mkv|webm|mpd)(\?|$)/i.test(url);
}

/**
 * Transforme les candidats (famille → URL) en streams Nuvio.
 * Les embeds sont résolus via resolveStream ; tout ce qui n'aboutit pas est
 * écarté (convention : ne jamais retourner une source non jouable).
 */
async function buildStreams(candidates, signal, startTime) {
    const ordered = candidates.slice().sort((a, b) => a.rank - b.rank);
    const streams = [];
    let resolveBudget = MAX_EMBED_RESOLVES;

    for (const cand of ordered) {
        if (isAborted(signal)) break;
        const stream = {
            name: `Sekai (VOSTFR)`,
            title: `Sekai ${cand.quality} - VOSTFR`,
            url: cand.url,
            quality: cand.quality,
            language: 'VOSTFR',
            type: isDirectMedia(cand.url) ? (/\.m3u8/i.test(cand.url) ? 'hls' : 'mp4') : undefined,
            headers: { Referer: `${BASE_URL}/`, 'User-Agent': USER_AGENT },
        };

        if (isDirectMedia(cand.url) && !/\.m3u8/i.test(cand.url)) {
            stream.isDirect = true;
            streams.push(stream);
            continue;
        }

        if (resolveBudget <= 0 || isBudgetExhausted(startTime, BUDGET_MS)) continue;
        resolveBudget--;
        try {
            const resolved = await resolveStream(stream);
            if (resolved && resolved.url && resolved.isDirect) {
                streams.push({ ...stream, ...resolved, quality: stream.quality, language: stream.language });
            }
        } catch (e) {
            if (isAbortError(e)) break;
        }
    }

    return streams;
}

// ─── Entrée ─────────────────────────────────────────────────────────────────

export async function extractStreams(tmdbId, mediaType, season, episodeNum, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const startTime = Date.now();
    const isTv = mediaType === 'tv' || mediaType === 'series';

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (!titles || titles.length === 0) return [];

    const [ep, absoluteEp] = await resolveTargetEpisodes(tmdbId, isTv ? 'tv' : mediaType, season, episodeNum, { startTime, budgetMs: BUDGET_MS });
    const targetEpisode = absoluteEp || ep;
    console.log(`[Sekai] ${mediaType} S${season}E${episodeNum} → épisode site ${targetEpisode}`);

    // Le site indexe ses épisodes en numérotation absolue ; on cible les deux
    // formes (relative et absolue) pour absorber les écarts d'ArmSync.
    const targetKeys = [targetEpisode, ep].filter((v, i, arr) => v != null && arr.indexOf(v) === i);

    // 1. Slugs candidats depuis le sitemap
    const slugs = await getSitemapSlugs();
    const candidates = findSlugCandidates(slugs, titles);
    if (!candidates.length) {
        console.log(`[Sekai] Aucun slug du sitemap ne correspond à "${titles[0]}"`);
        return [];
    }
    console.log(`[Sekai] Slugs candidats: ${candidates.slice(0, 3).map(c => `${c.slug}(${c.score})`).join(', ')}`);

    // 2. Page série → sous-pages (sagas/arcs) + scripts annexes
    for (const candidate of candidates.slice(0, 3)) {
        if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;

        const seriesUrl = `${BASE_URL}/${candidate.slug}`;
        let html = '';
        try {
            html = await fetchText(seriesUrl, { retries: 1 });
        } catch (e) {
            if (isAbortError(e)) return [];
            continue;
        }
        if (!html || html.length < 1000) continue;

        const subPages = discoverSubPages(html, candidate.slug);
        console.log(`[Sekai] ${candidate.slug}: ${subPages.length} sous-page(s)`);

        const pages = [seriesUrl, ...orderByIndexHint(subPages, targetEpisode)].slice(0, 30);

        // 3. Parse en parallèle, arrêt dès qu'un épisode cible est trouvé
        const requests = pages.map((url, i) => ({ url, opts: { isFirst: i === 0 } }));
        let hits = null;

        await fetchBatch(requests, async (url, opts) => {
            if (isAborted(signal)) return null;
            let content = html;
            if (!opts?.isFirst) {
                try {
                    content = await fetchText(url, { retries: 0 });
                } catch (e) { return null; }
            }
            if (!content || content.length < 200) return null;

            const found = collectEpisodeSources(content, targetKeys);
            if (found.length) {
                hits = found;
                return found;
            }
            return null;
        }, { concurrency: 5, staggerMs: 60, stopOnFirst: true });

        if (hits && hits.length) {
            console.log(`[Sekai] Épisode ${targetEpisode} trouvé (${hits.length} source(s))`);
            const streams = await buildStreams(hits, signal, startTime);
            if (streams.length) return streams;
        }
        console.log(`[Sekai] Épisode ${targetEpisode} introuvable pour ${candidate.slug}`);
    }

    return [];
}

/**
 * Analyse une page et retourne les sources candidates pour les numéros ciblés,
 * classées par qualité.
 */
function collectEpisodeSources(html, targetKeys) {
    const blocks = html.includes('<script') ? inlineScripts(html) : [html];
    const families = new Map();
    const numbers = new Map();
    const playerEntries = [];
    const localKeys = new Set();
    let sibnetBase = null;

    for (const block of blocks) {
        if (!block || block.length < 50) continue;
        const parsed = parseEpisodeData(block, targetKeys);
        if (parsed.sibnetBase && !sibnetBase) sibnetBase = parsed.sibnetBase;
        for (const [key, value] of parsed.numbers) if (!numbers.has(key)) numbers.set(key, value);
        for (const key of parsed.localKeys) localKeys.add(key);
        for (const [family, entries] of parsed.families) {
            const existing = families.get(family);
            if (existing) {
                for (const [key, url] of entries) if (!existing.has(key)) existing.set(key, url);
            } else {
                families.set(family, new Map(entries));
            }
        }
    }

    // Player JS complet (saga-12 / Demon Slayer) : URL calculée, pas listée
    for (const block of blocks) {
        if (!block || !block.includes('AVAILABLE_EPISODES')) continue;
        for (const entry of parseJsPlayerFamily(block, targetKeys)) playerEntries.push(entry);
    }

    if (!families.size && !playerEntries.length) return [];

    // Clés locales : numOriginale (local → absolu) puis correspondance directe
    const lookupKeys = new Set(localKeys);
    for (const target of targetKeys) {
        for (const [localKey, absNum] of numbers) {
            if (absNum === target) lookupKeys.add(localKey);
        }
        lookupKeys.add(String(target));
    }

    const out = [];
    const seen = new Set();

    const push = (url, quality, rank) => {
        if (!url || seen.has(url)) return;
        if (!/^https?:\/\//i.test(url)) {
            // IDs sibnet : l'URL est construite depuis la base extraite par atob()
            if (/^\d+$/.test(url) && sibnetBase) url = `${sibnetBase}${url}`;
            else return;
        }
        if (DEAD_HOSTS.some(h => url.includes(h))) return;
        seen.add(url);
        out.push({ url, quality, rank });
    };

    for (const entry of playerEntries) {
        const q = qualityForFamily(null, null);
        push(entry.url, q.quality, entry.rank);
    }

    for (const [family, entries] of families) {
        const q = qualityForFamily(family, families.keys());
        for (const key of lookupKeys) {
            push(entries.get(key), q.quality, q.rank);
        }
    }

    // Priorité aux KAI sur les anime remasterisés encore (re-run ci-dessus avec
    // qualité « 1080p » consolidée — on n'édite pas la liste des URLs en place ici).
    for (let i = out.length - 1; i >= 0; i--) {
        const o = out[i];
        for (const fam of families.keys()) {
            const q = qualityForFamily(fam, families.keys());
            if (q.quality === '1080p' && q.rank === 0) { o.rank = -1; break; }
        }
    }
    return out;
}
