/**
 * Extractor Logic for AnimeVOSTFR
 * Site: animevostfr.org (WordPress + ToroPlay theme)
 */

import { stripSeasonSuffix, resolveTargetEpisodes, countExtraWords, hasForeignLeadingTokens } from '../utils/dle-extractor.js';
import { fetchText, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, sortStreamsByLanguage, isAborted } from '../utils/resolvers.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://animevostfr.org";
const MAX_SEARCH_TITLES = 8;
const SEARCH_TIMEOUT = 10000;

const normalizeTitle = (s) => (s || '').toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2018\u2019:!.,?"]/g, '').replace(/\b(?:the|an?)\s+/g, '').replace(/\s+/g, ' ').trim();

/**
 * Score un titre candidat contre un titre requête (même logique que le tri
 * de searchAnime). Utilisé aussi par la garde anti-faux-match sur le h1
 * des fiches. Comportement inchangé : voir commentaires dans searchAnime.
 */
function scoreAgainstQuery(candidateTitle, queryTitle) {
    const n = normalizeTitle(candidateTitle);
    const simplifiedTitle = normalizeTitle(queryTitle);
    const titleWords = simplifiedTitle.split(/\s+/).filter(w => w.length > 2);
    let score = 0;
    if (n === simplifiedTitle) {
        score = 200;
    } else if (simplifiedTitle.length >= 5 && n.includes(simplifiedTitle)) {
        score = 100;
        const extra = countExtraWords(n, simplifiedTitle);
        if (extra > 0) score -= Math.min(extra * 25, 60);
    } else {
        for (const w of titleWords) {
            if (n.includes(w)) score += 20;
        }
        const lenRatio = Math.min(n.length, simplifiedTitle.length) / Math.max(n.length, simplifiedTitle.length);
        score = Math.round(score * lenRatio);
    }
    return score;
}

// Fiches "édition" (compilations, films dérivés, versions Netflix...) :
// tokens de slug qui signalent une variante quand une fiche exacte existe.
const EDITION_SLUG_TOKENS = ['netflix', 'gyojin', 'requiem', 'live-action', 'fishman', 'fish-man', 'stampede', 'strong-world'];

// Cache mémoire intra-exécution (une instance QuickJS fraîche par getStreams) :
// la garde anti-faux-match et findEpisodeUrl lisent la même page fiche.
const _pageCache = new Map();
async function fetchPageCached(url) {
    if (_pageCache.has(url)) return _pageCache.get(url);
    const html = await fetchText(url, { timeout: SEARCH_TIMEOUT });
    _pageCache.set(url, html || '');
    return html || '';
}

/**
 * Search for anime on AnimeVOSTFR
 */
async function searchAnime(title) {
    try {
        const html = await fetchText(`${BASE_URL}/?s=${encodeURIComponent(title)}`, { timeout: SEARCH_TIMEOUT });
        const $ = cheerio.load(html);
        const results = [];

        // Only extract links from search result items, not from sidebar/menus/footer
        // FIX films : les films sont servis sous /film/ (pas /animes/) — exclure
        // les films faisait échouer tout le chemin movie (0 stream sur les films).
        $('.post-title a, .TPost a, .TPostMv a, article a[href*="/animes/"], article a[href*="/film/"]').each((i, el) => {
            const h = $(el).attr('href') || '';
            const t = $(el).text().trim();
            if (h.includes('/animes/') || h.includes('/film/')) {
                // Use image alt as title if available (more accurate than link text)
                // TV-safe : .closest() n'existe pas dans le runtime cheerio de NuvioTV
                const imgAlt = (typeof $(el).closest === 'function')
                    ? $(el).closest('.TPost, .TPostMv, article').find('img').first().attr('alt')
                    : null;
                results.push({ title: imgAlt || t || h.split('/').pop().replace(/-/g, ' '), url: h, rawText: t });
            }
        });

        // Fallback: if no structured results, look for any /animes/ or /film/ link in likely content areas
        if (results.length === 0) {
            $('.content, #main, main, .result-item, li > a[href*="/animes/"], li > a[href*="/film/"]').each((i, el) => {
                const h = $(el).attr('href') || '';
                const t = $(el).text().trim();
                if ((h.includes('/animes/') || h.includes('/film/')) && t.length > 2) {
                    const imgAlt = (typeof $(el).closest === 'function')
                        ? $(el).closest('li, div').find('img').first().attr('alt')
                        : null;
                    results.push({ title: imgAlt || t, url: h, rawText: t });
                }
            });
        }

        // Last resort: grab /animes/ + /film/ links from the whole page
        if (results.length === 0) {
            $('a[href*="/animes/"], a[href*="/film/"]').each((i, el) => {
                const h = $(el).attr('href') || '';
                const t = $(el).text().trim();
                if ((h.includes('/animes/') || h.includes('/film/')) && t.length > 2) {
                    results.push({ title: t, url: h, rawText: t });
                }
            });
        }

        // Deduplicate
        const seen = new Set();
        const unique = results.filter(r => {
            if (seen.has(r.url)) return false;
            seen.add(r.url);
            return true;
        });

        console.log(`[AnimeVOSTFR] Search results for "${title}": ${unique.length}`);

        // Score via le scorer partagé (même fonction que la garde
        // anti-faux-match sur les h1 de fiches).

        // Score each result by how many title words it matches.
        // ATTENTION : l'égalité exacte doit être testée AVANT l'includes,
        // sinon "Naruto" (exact) et "Naruto Shippuden" (contient "naruto")
        // sont ex æquo à 100 et le tri stable garde l'ordre du site → la
        // mauvaise série (suite/fan-edit) est extraite pour la S1.
        const scored = unique.map(r => ({ ...r, score: scoreAgainstQuery(r.title, title) }));

        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        const bestScore = best ? best.score : 0;

        // Fiches édition : quand une fiche EXACTE (200) existe, les variantes
        // d'édition (slug netflix-/gyojin-/requiem-...) sont rétrogradées —
        // elles restent en fallback si l'exacte échoue, mais ne passent plus
        // devant (ex netflix-one-piece vs one-piece-vostfr).
        if (bestScore >= 200) {
            for (const r of scored) {
                const slug = (r.url || '').toLowerCase();
                if (EDITION_SLUG_TOKENS.some(t => slug.includes(t))) r.score -= 80;
            }
            scored.sort((a, b) => b.score - a.score);
        }

        let matches;
        if (best && bestScore >= 25) {
            // Keep only results with score at least 50% of best score
            const threshold = Math.max(20, bestScore * 0.5);
            matches = scored.filter(r => r.score >= threshold);
        } else {
            // No good match - return empty rather than garbage
            matches = [];
        }

        console.log(`[AnimeVOSTFR] Best match: "${best?.title}" (score ${bestScore}) -> ${matches.length} results kept`);
        return matches.map(r => ({ title: r.title, url: r.url }));
    } catch (e) {
        console.error(`[AnimeVOSTFR] Search error: ${e.message}`);
        return [];
    }
}

/**
 * Find the episode URL from the series page
 */
async function findEpisodeUrl(seriesUrl, season, episode, isAbsolute = false) {
    try {
        const html = await fetchPageCached(seriesUrl);
        const $ = cheerio.load(html);
        const episodeLinks = [];

        // Collect all episode links
        $('a[href*="/episode/"]').each((i, el) => {
            const h = $(el).attr('href') || '';
            const t = $(el).text().trim();
            episodeLinks.push({ url: h, text: t });
        });

        console.log(`[AnimeVOSTFR] Found ${episodeLinks.length} episode links`);

        // Si la FICHE n'a aucun token de saison (single-season / pas de
        // "saison N" ni "-N-episode-"), la garde saison reste ACTIVE même
        // pour les épisodes absolus : sinon en S2+ n'importe quelle fiche
        // "-episode-N" peut matcher (contenu cross-saison).
        const ficheHasSeasonToken = /saison[\s_-]*\d+|season[\s_-]*\d+|-\d+-episode-/i.test(seriesUrl || '');
        const seasonGuardOn = !isAbsolute || !ficheHasSeasonToken;

        // If this is a movie (no season/episode), use the first episode URL found
        if (season == null || episode == null) {
            if (episodeLinks.length > 0) {
                console.log(`[AnimeVOSTFR] Movie mode: using episode URL ${episodeLinks[0].url}`);
                return episodeLinks[0].url;
            }
            // Maybe it's a direct page with embedded player, try the series URL itself
            return seriesUrl;
        }

        const epStr = String(episode);
        const epPadded = epStr.padStart(2, '0');
        
        // 1. Try to find match in URL first (more reliable)
        // AnimeVOSTFR URL format: {slug}-{season_num}-episode-{ep_num}  (no "saison" word)
        // Also support legacy pattern with "saison" word
        const seasonPattern = season ? String(season) : '';
        const sortedUrlPatterns = [
            // Primary: no "saison" word (real URL format: -1-episode-1)
            new RegExp(`-${seasonPattern}-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-${seasonPattern}-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            // Legacy: with "saison" word
            new RegExp(`-saison-${seasonPattern}-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-saison-${seasonPattern}-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            // No season number in URL (single-season animes)
            new RegExp(`-episode-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-episode-${epPadded}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-ep-${epStr}(?:-vostfr|-vf|/|$)`, 'i'),
            new RegExp(`-ep-${epPadded}(?:-vostfr|-vf|/|$)`, 'i')
        ];

        const matchEpisode = (links, pattern) => {
            return links.find(l => {
                if (!pattern.test(l.url)) return false;
                // FIX (saison-probe) : pour l'épisode PRIMAIRE en S2+, exiger un
                // token de saison explicite dans l'URL. Les patterns sans saison
                // ("-episode-1") matchent sinon les pages S1/single-season et
                // servent du contenu cross-saison. (Pour S1 on garde le tolérant.)
                // Garde conservée pour les épisodes ABSOLUS quand la fiche n'a
                // aucun token de saison (fiche générique → match aveugle interdit).
                if (seasonGuardOn && season != null && Number(season) > 1) {
                    const seasonMatch = l.url.match(/-(?:saison-)?(\d+)-episode-/i);
                    if (!seasonMatch || parseInt(seasonMatch[1]) !== Number(season)) {
                        return false;
                    }
                }
                return true;
            });
        };

        // Try forward search (newest-first order)
        for (const pattern of sortedUrlPatterns) {
            const match = matchEpisode(episodeLinks, pattern);
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in URL: ${match.url}`);
                return match.url;
            }
        }

        const reversedLinks = [...episodeLinks].reverse();

        // Fallback: try reverse order (oldest-first)
        for (const pattern of sortedUrlPatterns) {
            const match = matchEpisode(reversedLinks, pattern);
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in URL (reversed fallback): ${match.url}`);
                return match.url;
            }
        }

        const textPatterns = [
            new RegExp(`^\\s*Episode\\s+${epStr}\\s*$`, 'i'),
            new RegExp(`^\\s*Ep\\s*${epStr}\\s*$`, 'i'),
            new RegExp(`(?:^|[^0-9])${epStr}(?:$|[^0-9])`)
        ];

        const matchByText = (links, pattern) => {
            return links.find(l => {
                if (!pattern.test(l.text)) return false;
                // Même garde que matchEpisode : S2+ exige un token de saison
                // (y compris épisodes absolus sur fiche sans token de saison).
                if (seasonGuardOn && season != null && Number(season) > 1) {
                    const seasonMatch = l.url.match(/-(?:saison-)?(\d+)-episode-/i);
                    if (!seasonMatch || parseInt(seasonMatch[1]) !== Number(season)) {
                        return false;
                    }
                }
                return true;
            });
        };

        // 2. Try to find match in link text (forward)
        for (const pattern of textPatterns) {
            const match = matchByText(episodeLinks, pattern);
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in text: ${match.url}`);
                return match.url;
            }
        }

        // Fallback: try reverse order (oldest-first)
        for (const pattern of textPatterns) {
            const match = matchByText(reversedLinks, pattern);
            if (match) {
                console.log(`[AnimeVOSTFR] Found episode in text (reversed fallback): ${match.url}`);
                return match.url;
            }
        }

        return null;
    } catch (e) {
        console.error(`[AnimeVOSTFR] Error finding episode: ${e.message}`);
        return null;
    }
}

/**
 * Décode les entités HTML d'un fragment échappé en texte
 * (onglet film : &lt;iframe ... src=&quot;...?trembed...&quot;&gt;).
 * Ordre important : &amp; d'abord (&amp;#038; → &#038; → &).
 */
function decodeEscapedHtml(s) {
    return (s || '')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/gi, "'")
        .replace(/&amp;/gi, '&')
        .replace(/&#0?38;/gi, '&');
}

/**
 * Extract player URLs from an episode page via trembed redirects
 */
async function extractPlayersFromEpisode(episodeUrl) {
    const streams = [];
    try {
        const html = await fetchText(episodeUrl, { timeout: SEARCH_TIMEOUT });
        const $ = cheerio.load(html);

        // Get server names and their tab IDs from TPlayerNv
        const serverNames = {};
        $('.TPlayerNv li').each((i, el) => {
            const tabId = $(el).attr('data-tplayernv') || $(el).attr('id') || `Opt${i+1}`;
            serverNames[tabId] = $(el).text().trim() || `Lecteur ${i + 1}`;
        });

        // Collect trembed/iframe URLs from each TPlayerTb
        // Structure: <div class="TPlayerTb" id="OptN">
        //              <iframe src="?trembed=0&trid=TERM_ID&trtype=2" .../>
        //              OR <div class="lazy-player" data-src="?trembed=..."/>
        const trembedEntries = [];
        $('.TPlayerTb, .TPlayer .TPlayerTb').each((i, el) => {
            const tabId = $(el).attr('id') || `Opt${i+1}`;
            const serverName = serverNames[tabId] || `Lecteur ${i + 1}`;

            const iframe = $(el).find('iframe');
            const lazyDiv = $(el).find('.lazy-player, [data-src]');

            let src = null;
            if (iframe.length && iframe.attr('src')) {
                src = iframe.attr('src');
            } else if (lazyDiv.length && lazyDiv.attr('data-src')) {
                src = lazyDiv.attr('data-src');
            }
            if (!src) {
                // 3e source (pages /film/) : l'onglet 2 est un iframe ÉCHAPPÉ
                // EN TEXTE dans le div (pas de <iframe> ni de .lazy-player).
                // On décode les entités puis on cherche une URL ?trembed=.
                const rawInner = $(el).html() || $(el).text() || '';
                if (rawInner.indexOf('trembed') !== -1) {
                    const decoded = decodeEscapedHtml(rawInner);
                    const m = decoded.match(/https?:\/\/[^"'\s<>]*trembed[^"'\s<>]*/i);
                    if (m) {
                        src = m[0];
                        console.log(`[AnimeVOSTFR] Escaped trembed iframe decoded in tab "${serverName}"`);
                    }
                }
            }
            if (src) trembedEntries.push({ src, serverName });
        });

        // If no TPlayerTb found, try any iframe with trembed param directly
        if (trembedEntries.length === 0) {
            $('iframe[src*="trembed"]').each((i, el) => {
                const src = $(el).attr('src');
                if (src) trembedEntries.push({ src, serverName: `Lecteur ${i + 1}` });
            });
        }

        console.log(`[AnimeVOSTFR] Found ${trembedEntries.length} player tabs`);

        // Resolve each trembed URL to get the real player iframe (séquentiel + early-exit)
        const DIRECT_HOSTS = ['sibnet', 'luluvid', 'uqload', 'myvi', 'mytv', 'dood', 'ds2play', 'hgcloud', 'stape', 'streamtape'];
        let directCount = 0;
        for (const entry of trembedEntries) {
            try {
                let trembedUrl = entry.src;
                if (trembedUrl.startsWith('/')) trembedUrl = BASE_URL + trembedUrl;
                else if (trembedUrl.startsWith('?')) trembedUrl = BASE_URL + trembedUrl;
                if (!trembedUrl.startsWith('http')) continue;

                const embedHtml = await fetchText(trembedUrl, { timeout: SEARCH_TIMEOUT, headers: { 'Referer': episodeUrl } });
                const $embed = cheerio.load(embedHtml);

                // Find the real player iframe src
                let playerSrc = $embed('iframe').first().attr('src') ||
                                $embed('[data-src]').first().attr('data-src');

                if (!playerSrc) {
                    // fallback: look for any external http URL in embed HTML
                    const extMatch = embedHtml.match(/(?:src|href)=["'](https?:\/\/(?!animevostfr)[^"']+)["']/i);
                    if (extMatch) playerSrc = extMatch[1];
                }

                if (playerSrc && playerSrc.startsWith('http')) {
                    const playerName = getPlayerName(playerSrc);
                    // Skip early les hosts morts/lents (gain ~8-15s par lecteur mort).
                    // sibnet PAS skippé : 403 datacenter mais OK en résidentiel FR.
                    // vidmoly = challenge JS sans flux en HTML ; upstream.to =
                    // injoignable sans resolver dédié (comme sendvid).
                    const pLower = playerSrc.toLowerCase();
                    if (pLower.includes('sendvid.com') || pLower.includes('vidstream.pro') ||
                        pLower.includes('vidmoly') || pLower.includes('upstream')) {
                        console.log(`[AnimeVOSTFR] Skip host mort (${playerName}): ${playerSrc.slice(0, 60)}`);
                        continue;
                    }
                    const stream = await resolveStream({
                        name: `AnimeVOSTFR`,
                        title: `${playerName} (${entry.serverName})`,
                        url: playerSrc,
                        quality: "HD",
                        headers: { "Referer": BASE_URL }
                    });
                if (stream && stream.isDirect !== false) {
                    const { originalUrl, ...clean } = stream;
                    clean.name = `AnimeVOSTFR`;
                    clean.title = `${playerName} (${entry.serverName})`;
                    // isDirect est CONSERVÉ : le filtre final du provider
                    // (directStreams = deduped.filter(s => s.isDirect)) en dépend.
                    clean.isDirect = true;
                    // FIX langue : le NOM DU TAB est l'indicateur autoritaire
                    // ("Lecteur VF" / "Player VF" / "Lecteur VOSTFR") — l'URL de la
                    // série contient souvent "-vf-vostfr" et ne permet pas de trancher.
                    if (/vostfr/i.test(entry.serverName)) clean.language = 'ja';
                    else if (/\bvf\b/i.test(entry.serverName)) clean.language = 'fr';
                    streams.push(clean);
                    if (DIRECT_HOSTS.some(h => playerSrc.toLowerCase().includes(h))) directCount++;
                    if (directCount >= 2) break;
                } else if (stream) {
                    console.log(`[AnimeVOSTFR] ${playerSrc.slice(0, 60)} unresolved (embed mort) — rejeté`);
                }
                }
            } catch (err) {
                console.error(`[AnimeVOSTFR] Failed to resolve player "${entry.serverName}": ${err.message}`);
            }
        }
    } catch (e) {
        console.error(`[AnimeVOSTFR] Error extracting players: ${e.message}`);
    }
    return streams;
}

/**
 * Get player name from URL domain
 */
/**
 * Détecte VF/VOSTFR/VO depuis le slug de la fiche et le titre du match.
 * Retourne null quand NON DISCRIMINANT (slug "-vf-vostfr", ambigu ou
 * absent) : pas de suffixe de titre dans ce cas, la `language` du tab
 * (Lecteur VF / VOSTFR) fait foi. Ne tester -vostfr qu'après avoir écarté
 * les slugs mixtes — l'ancien test "-vostfr en premier" retournait toujours
 * VOSTFR sur "-vf-vostfr" (titres "- VOSTFR" même pour du VF).
 */
function detectLang(url, title) {
    const u = (url || '').toLowerCase();
    const slugMatch = u.match(/\/(?:animes|film)\/([^/?#]+)/);
    const slug = slugMatch ? slugMatch[1] : '';
    const hasVf = /(?:^|-)vf(?:-|$)/.test(slug);
    const hasVostfr = /(?:^|-)vostfr(?:-|$)/.test(slug);
    // Slug discriminant (un seul des deux) → fait foi
    if (hasVostfr && !hasVf) return 'VOSTFR';
    if (hasVf && !hasVostfr) return 'VF';
    // Slug ambigu (-vf-vostfr) ou absent → titre du match
    const t = (title || '').toLowerCase();
    if (/\bvostfr\b/.test(t)) return 'VOSTFR';
    if (/\bvf\b/.test(t)) return 'VF';
    const hasVoSlug = /(?:^|-)vo(?:-|$)/.test(slug);
    if (hasVoSlug && !hasVf && !hasVostfr) return 'VO';
    if (/\bvo\b/.test(t)) return 'VO';
    return null;
}

function getPlayerName(url) {
    if (url.includes('sibnet')) return 'Sibnet';
    if (url.includes('vidmoly')) return 'Vidmoly';
    if (url.includes('christopheruntilpoint') || url.includes('voe')) return 'Voe';
    if (url.includes('luluvid')) return 'Luluvid';
    if (url.includes('savefiles')) return 'Savefiles';
    if (url.includes('uqload') || url.includes('oneupload')) return 'Uqload';
    if (url.includes('hgcloud')) return 'HGCloud';
    if (url.includes('dood') || url.includes('ds2play')) return 'Doodstream';
    if (url.includes('myvi') || url.includes('mytv')) return 'MyVi';
    if (url.includes('sendvid')) return 'Sendvid';
    if (url.includes('upstream')) return 'Upstream';
    if (url.includes('stape') || url.includes('streamtape')) return 'Streamtape';
    if (url.includes('moon')) return 'Moon';
    return 'Player';
}

// Seuil STRICT de la garde anti-faux-match : accepte les fiches exactes
// (200) et les includes à ≤1 mot extra (75), rejette les dérivés à 2+ mots
// extra (≤50 : "Demon Slayer: Sibling's Bond", "Goldorak contre Great
// Mazinger", "Tojima Wants to Be a Kamen Rider"). Complété par
// hasForeignLeadingTokens (homonymes à fort score : "Steins;Gate" pour
// "Gate"). Calibré avec le scorer de searchAnime (même fonction).
const SHEET_GUARD_THRESHOLD = 75;

/**
 * Vérifie que le titre réel de la fiche (h1, fallback <title>) correspond
 * à l'œuvre demandée (titres TMDB). Si échec → slug rejeté, suite de la
 * boucle. Best-effort : page illisible (fetch vide, pas de h1) → on ne
 * rejette PAS (la chaîne garde sa chance, 0 propre si rien ne résout).
 */
async function verifySheetTitle(sheetUrl, tmdbTitles) {
    let html = '';
    try {
        html = await fetchPageCached(sheetUrl);
    } catch (e) {
        console.log(`[AnimeVOSTFR] Guard: fiche illisible (${e.message}) — gardée par prudence`);
        return true;
    }
    if (!html) {
        console.log(`[AnimeVOSTFR] Guard: fiche vide — gardée par prudence`);
        return true;
    }
    let sheetTitle = '';
    try {
        const $ = cheerio.load(html);
        sheetTitle = $('h1').first().text().trim() || $('title').first().text().trim() || '';
    } catch (e) {
        return true;
    }
    if (!sheetTitle) {
        console.log(`[AnimeVOSTFR] Guard: pas de titre de fiche — gardée par prudence`);
        return true;
    }
    let best = 0;
    let pass = false;
    for (const q of tmdbTitles) {
        const s = scoreAgainstQuery(sheetTitle, q);
        if (s > best) best = s;
        // Un homonyme sur UNE variante ne rejette pas un exact-match sur une
        // autre : le pass est par-titre (score strict ET pas de leading étranger).
        if (s >= SHEET_GUARD_THRESHOLD && !hasForeignLeadingTokens(sheetTitle, q)) pass = true;
    }
    if (!pass) {
        console.log(`[AnimeVOSTFR] Guard: fiche rejetée "${sheetTitle}" (meilleur score ${best}) — ${sheetUrl}`);
        return false;
    }
    console.log(`[AnimeVOSTFR] Guard: fiche acceptée "${sheetTitle}" (score ${best})`);
    return true;
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
    const signal = options?.signal || null;
    if (isAborted(signal)) return [];
    setCurrentSignal(signal);

    const titles = await getTmdbTitles(tmdbId, mediaType, { season });
    if (titles.length === 0) return [];

    const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;

    // Sort titles: French titles first (AnimeVOSTFR is French-language, search works better with FR)
    const isFrenchTitle = (t) => /[àâéèêëîïôùûüçœæ']/i.test(t);
    const titlesOrdered = [
        ...titles.filter(isFrenchTitle),
        ...titles.filter(t => !isFrenchTitle(t))
    ];

    // --- ArmSync: resolve absolute episode for TV series ---
    // ('series' = convention app, 'tv' = attendu par l'outil partagé)
    const targetEpisodes = await resolveTargetEpisodes(tmdbId, mediaType === 'series' ? 'tv' : mediaType, season, episode);

    // For movies, use season=1, episode=1 to search episode pages
    // (mais season/episode restent null dans findEpisodeUrl → mode movie : le
    // lecteur est DANS la page /film/<slug>/ elle-même, pas dans /episode/)
    const searchSeason = (mediaType === 'movie' && season == null) ? 1 : Number(effectiveSeason);
    const searchEpisode = (mediaType === 'movie' && episode == null) ? 1 : Number(episode);
    const isMoviePath = mediaType === 'movie' && season == null && episode == null;

    // Films : ~6 titres de base (les seules variantes FR exotiques — ex Your
    // Name → "Comment Tu T'Appelles?", "Tvé jméno" — manquent
    // /film/your-name/ puis abandonnent). TOUJOURS inclure le titre original
    // anglais (titles[0] = EN côté metadata.js) + le titre principal
    // débarrassé de son suffixe de saison, avant abandon. Séries : 3 titres
    // (budget total <45s, recherches séquentielles avec early-exit).
    const baseTitles = titlesOrdered.slice(0, isMoviePath ? 6 : 3);
    const mustTry = [];
    const englishTitle = (titles[0] || '').trim();
    if (englishTitle) mustTry.push(englishTitle);
    const strippedMain = stripSeasonSuffix(titlesOrdered[0] || '');
    if (strippedMain && strippedMain !== titlesOrdered[0]) mustTry.push(strippedMain);
    for (const m of mustTry) {
        const key = m.toLowerCase().trim();
        if (!baseTitles.some(b => (b || '').toLowerCase().trim() === key)) baseTitles.push(m);
    }
    console.log(`[AnimeVOSTFR] Titres essayés (${baseTitles.length}): ${baseTitles.join(' | ')}`);
    const shortTitles = [];
    for (const t of baseTitles) {
        const cleanT = stripSeasonSuffix(t);
        shortTitles.push(cleanT);
        // Juste 1 variante courte (split sur ":" ou "-")
        const parts = cleanT.split(/[:\–\-]+/).map(s => s.trim()).filter(s => s.length > 5);
        if (parts.length > 0 && parts[0] !== cleanT) shortTitles.push(parts[0]);
    }

    const seenKeys = new Set();
    const uniqueTitles = shortTitles.filter(t => {
        const key = t.toLowerCase().trim();
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });

    // OPTIMISATION: Recherche séquentielle avec early-exit "utile".
    // On accumule (dédup par URL) et on s'arrête dès qu'un match EXPLOITABLE
    // existe : une fiche /animes/ pour les séries, une fiche /film/ pour les
    // films. Sans ça, le premier titre qui ramène n'importe quoi (ex Demon
    // Slayer → seul le film "Sibling's Bond", écarté ensuite car /film/)
    // bloque les titres suivants qui auraient trouvé la vraie fiche série
    // ("Demon Slayer" court → demon-slayer-vostfr). Garde-budget : 6 matchs.
    let matches = [];
    const seenMatchUrlsAcrossTitles = new Set();
    for (const title of uniqueTitles) {
        const results = await searchAnime(title);
        if (results && results.length > 0) {
            for (const r of results) {
                if (!seenMatchUrlsAcrossTitles.has(r.url)) {
                    seenMatchUrlsAcrossTitles.add(r.url);
                    matches.push(r);
                }
            }
            const usable = isMoviePath
                ? matches.some(m => (m.url || '').includes('/film/'))
                : matches.some(m => !(m.url || '').includes('/film/'));
            if (usable || matches.length >= 6) break;
        }
    }
    if (!matches || matches.length === 0) return [];

    // Prioritize results that match the season if explicitly mentioned
    const seasonStr = searchSeason ? String(searchSeason) : '';
    matches = matches.sort((a, b) => {
        const aT = a.title.toLowerCase();
        const bT = b.title.toLowerCase();
        const sMatch = `saison ${seasonStr}`;
        const hasA = aT.includes(sMatch);
        const hasB = bT.includes(sMatch);
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        return 0;
    });

    const streams = [];
    const checkedEpisodeUrls = new Set();
    const mainTitle = titlesOrdered[0]?.toLowerCase() || '';
    const mainWords = mainTitle.split(/\s+/).filter(w => w.length > 3);

    const uniqueMatches = [];
    const seenMatchUrls = new Set();
    for (const m of matches) {
        if (!seenMatchUrls.has(m.url)) {
            seenMatchUrls.add(m.url);
            uniqueMatches.push(m);
        }
    }

    // Films : /film/ d'abord (lecteur direct dans la page fiche), jusqu'à 3
    // fiches pour laisser la garde anti-faux-match rejeter + continuer.
    // Séries : les matchs /film/ sont écartés (aucun lien /episode/, que du
    // bruit traité pour rien).
    let matchesToProcess;
    if (isMoviePath) {
        matchesToProcess = [...uniqueMatches].sort((a, b) => {
            const aFilm = (a.url || '').includes('/film/') ? 0 : 1;
            const bFilm = (b.url || '').includes('/film/') ? 0 : 1;
            return aFilm - bFilm;
        }).slice(0, 3);
    } else {
        matchesToProcess = uniqueMatches.filter(m => !(m.url || '').includes('/film/'));
        if (matchesToProcess.length !== uniqueMatches.length) {
            console.log(`[AnimeVOSTFR] Séries : ${uniqueMatches.length - matchesToProcess.length} match(s) /film/ écarté(s)`);
        }
    }

    // Résolution séquentielle avec early-exit (target 2 streams directs)
    let directStreamCount = 0;
    for (const match of matchesToProcess) {
        if (directStreamCount >= 2) break;

        const langSuffix = detectLang(match.url, match.title);
        const matchLower = (match.title + ' ' + match.url).toLowerCase();

        const spinoffKeywords = ['vigilantes', 'prelude', 'special', 'ova', 'ona'];
        const isSpinoff = spinoffKeywords.some(k => matchLower.includes(k))
            && !mainWords.some(w => matchLower.includes(w));
        if (isSpinoff && uniqueMatches.length > 1) {
            console.log(`[AnimeVOSTFR] Skipping spinoff match: ${match.title}`);
            continue;
        }

        const seasonMatchText = matchLower.match(/saison\s*(\d+)/);
        if (seasonMatchText && parseInt(seasonMatchText[1]) !== Number(searchSeason) && targetEpisodes.length === 1) {
            continue;
        }

        // Garde anti-faux-match : le titre réel de la fiche (h1) doit
        // correspondre à l'œuvre (Demon Slayer ≠ film "Sibling's Bond",
        // Great Mazinger ≠ "Goldorak contre Great Mazinger", Kamen Rider ≠
        // "Tojima Wants to Be a Kamen Rider"). Échec → slug rejeté, suite.
        const sheetOk = await verifySheetTitle(match.url, titles);
        if (!sheetOk) continue;

        const epResults = [];
        if (isMoviePath) {
            // FIX films : la page /film/<slug>/ contient le lecteur DIRECTEMENT
            // (TPlayerTb avec trembed trtype=1) — pas de page /episode/. On passe
            // la page film elle-même à extractPlayersFromEpisode.
            if (!checkedEpisodeUrls.has(match.url)) {
                checkedEpisodeUrls.add(match.url);
                const playerStreams = await extractPlayersFromEpisode(match.url);
                epResults.push({ ep: searchEpisode, playerStreams });
            }
        } else {
            for (const ep of targetEpisodes) {
                // Coercion Number() : l'app passe season/episode en string —
                // `ep !== searchEpisode` était toujours true (number vs string)
                // et marquait l'épisode PRIMAIRE comme absolu (garde saison
                // désactivée + label "(Abs N)" faux).
                const isAbsolute = Number(ep) !== searchEpisode;
                const episodeUrl = await findEpisodeUrl(match.url, searchSeason, Number(ep), isAbsolute);
                if (episodeUrl && !checkedEpisodeUrls.has(episodeUrl)) {
                    checkedEpisodeUrls.add(episodeUrl);
                    const playerStreams = await extractPlayersFromEpisode(episodeUrl);
                    epResults.push({ ep, playerStreams });
                }
            }
        }

        for (const { ep, playerStreams } of epResults) {
            const epType = Number(ep) === searchEpisode ? "" : ` (Abs ${ep})`;
            playerStreams.forEach(s => {
                // Suffixe de titre SEULEMENT si detectLang discriminant
                // (slug avec -vf OU -vostfr seul, ou titre du match). Sinon
                // (slug "-vf-vostfr" ambigu) : titre sans suffixe, la
                // `language` du tab (Lecteur VF/VOSTFR) fait foi — fini les
                // titres "- VOSTFR" sur du contenu VF.
                if (!s.name.includes('(')) {
                    s.name = langSuffix ? `AnimeVOSTFR (${langSuffix})` : 'AnimeVOSTFR';
                }
                if (langSuffix && !s.title.includes(langSuffix)) {
                    s.title = `${s.title}${epType} - ${langSuffix}`;
                } else {
                    s.title = `${s.title}${epType}`;
                }
                // FIX : code langue normalisé (fr/ja) pour les filtres/tri NuvioTV.
                // La langue par tab (déjà posée dans extractPlayersFromEpisode depuis
                // le nom du tab) est prioritaire — on ne complète que si absente.
                if (!s.language) s.language = langSuffix === 'VF' ? 'fr' : 'ja';
            });
            streams.push(...playerStreams);
            if (playerStreams.some(s => s.isDirect)) directStreamCount++;
        }
    }

    if (streams.length === 0) {
        if (isMoviePath) console.warn(`[AnimeVOSTFR] Film introuvable (aucune fiche / streams)`);
        else console.warn(`[AnimeVOSTFR] Episode S${searchSeason}E${searchEpisode} not found (targets: ${targetEpisodes.join(', ')})`);
    }

    // Dédupliquer les streams par URL ( VF/VOSTFR peuvent servir les mêmes sources)
    const seenUrls = new Set();
    const deduped = [];
    for (const s of streams) {
        if (!s || !s.url) continue;
        const baseUrl = s.url.split('?')[0];
        if (seenUrls.has(baseUrl)) continue;
        seenUrls.add(baseUrl);
        deduped.push(s);
    }

    const directStreams = deduped.filter(s => s && s.isDirect);
    const embedStreams = deduped.filter(s => s && !s.isDirect && s.url);

    // FIX : plus AUCUN fallback embed — un lecteur non résolu est une page HTML
    // que l'app ne peut pas lire ("ne se lance jamais"). Convention repo
    // (wookafr/fluneo/coflix/frenchstream/animesama-co) : 0 stream propre > faux stream.
    const validStreams = directStreams;
    console.log(`[AnimeVOSTFR] Total streams: ${validStreams.length} direct(s)`);
    
    return sortStreamsByLanguage(validStreams);
}
