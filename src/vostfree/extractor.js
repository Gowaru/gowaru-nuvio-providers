/**
 * Extractor Logic for Vostfree
 */

import { fetchText, setCurrentSignal } from './http.js';
import cheerio from 'cheerio-without-node-native';
import { resolveStream, withTimeout, isBudgetExhausted, sortStreamsByLanguage, isAborted } from '../utils/resolvers.js';
import { resolveTargetEpisodes } from '../utils/dle-extractor.js';
import { getTmdbTitles } from '../utils/metadata.js';

const BASE_URL = "https://ipv4.vostfree.ws";
const MAX_SEARCH_TITLES = 9;
const MIN_QUERY_LENGTH = 5;

const KNOWN_HOSTS = ['sibnet', 'uqload', 'oneupload', 'sendvid', 'voe', 'dood', 'stape', 'streamtape', 'myvi', 'mytv', 'vidmoly', 'fsvid', 'vidzy'];

// Hosts whose embed pages use React SPA / AES-GCM fingerprinting
// and cannot be resolved to direct URLs without a browser.
const UNRESOLVABLE_HOSTS = ['voe', 'streamtape', 'stape', 'dood', 'ds2play', 'bigwar5'];
const PLAYER_TIMEOUT_MS = 8000;
const BUDGET_MS = 45000;

function normalize(s) {
    if (!s) return '';
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '').replace(/[':!.,?]/g, '').replace(/\bthe\s+/g, '').replace(/\s+/g, ' ').trim();
}

function getSeasonNumber(text) {
    const combined = text.toLowerCase().replace(/-/g, ' ');
    // Pattern 1: explicit "saison N"
    let m = combined.match(/\bsaison\s*(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    // Pattern 2: URL-style "s N" or title "N VOSTFR/VF/FRENCH"
    m = combined.match(/\bs\s*(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    // Pattern 3: bare number before language/type keywords (in title)
    m = combined.match(/\b(\d+)\s*(?:vostfr|vf|french|ddl|streaming)\b/);
    if (m) return parseInt(m[1], 10);
    return null;
}

function titleMatches(resultTitle, searchTitle) {
    const nResult = normalize(resultTitle);
    const nSearch = normalize(searchTitle);
    if (!nResult || !nSearch) return false;
    if (nResult.includes(nSearch)) return true;
    const searchWords = nSearch.split(/\s+/).filter(w => w.length > 2);
    if (searchWords.length === 0) return false;
    const matched = searchWords.filter(w => nResult.includes(w));
    return matched.length >= Math.min(searchWords.length, 2);
}

/**
 * Search for the anime on Vostfree
 * Returns array of { title, url, genre? }
 * @param {string} title
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal] - Signal d'annulation
 */
async function searchAnime(title, opts = {}) {
    const signal = opts.signal || null;
    if (isAborted(signal)) {
        console.log(`[Vostfree] Aborted before search: "${title}"`);
        return [];
    }
    try {
        const results = [];
        const seen = new Set();

        const add = (h, t, genre) => {
            if (h && h.length > 10 && t && t.length > 2 && !seen.has(h)) {
                seen.add(h);
                const r = { title: t, url: h.startsWith('http') ? h : BASE_URL + h };
                if (genre) r.genre = genre;
                results.push(r);
            }
        };

        // --- Method 1: POST search (returns targeted results) ---
        try {
            const postHtml = await fetchText(`${BASE_URL}/index.php?do=search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': BASE_URL,
                    'Origin': BASE_URL,
                },
                body: `do=search&subaction=search&story=${encodeURIComponent(title)}`,
                signal
            });
            const $ = cheerio.load(postHtml);
            $('.search-result').each((i, block) => {
                const link = $(block).find('.title a');
                const h = link.attr('href') || '';
                const t = link.text().trim() || link.attr('title') || '';
                const genre = $(block).find('.genre').text().trim().toUpperCase();
                if (h && t && (h.includes(BASE_URL) || h.startsWith('/')) && t.length > 2) {
                    add(h, t, genre || undefined);
                }
            });
        } catch (e) { /* POST failed, fall through to GET */ }

        // --- Method 2: GET /?s= (broader search, disabled for performance) ---
        // if (results.length === 0) { ... }

        console.log(`[Vostfree] Results found: ${results.length}`);
        for (const r of results) {
            console.log(`[Vostfree]   result: "${r.title}" | ${r.url}`);
        }

        const matches = results.filter(r => titleMatches(r.title, title));

        if (matches.length > 0) {
            console.log(`[Vostfree] Found ${matches.length} matches for "${title}"`);
        }
        return matches;
    } catch (e) {
        console.error(`[Vostfree] Search error: ${e.message}`);
        return [];
    }
}

export async function extractStreams(tmdbId, mediaType, season, episode, options = {}) {
  const signal = options?.signal || null;
  if (isAborted(signal)) return [];
  setCurrentSignal(signal);

  const titles = await getTmdbTitles(tmdbId, mediaType, { season });
  if (!titles || titles.length === 0) return [];

  const effectiveSeason = titles.effectiveSeason != null ? titles.effectiveSeason : season;
  const startTime = Date.now();

  // Trier les titres : français d'abord (Vostfree est FR)
  const isFrenchTitle = (t) => /[àâéèêëîïôùûüçœæ']/i.test(t);
  const titlesOrdered = [
      ...titles.filter(isFrenchTitle),
      ...titles.filter(t => !isFrenchTitle(t))
  ];

  // Résoudre les épisodes cibles via ArmSync
  const targetEpisodes = await resolveTargetEpisodes(tmdbId, mediaType, season, episode, { startTime, budgetMs: BUDGET_MS });
  const episodeStrs = targetEpisodes.map(String);

  let allMatches = [];
  const seenUrls = new Set();

  const searchables = [];
  for (const title of titlesOrdered.slice(0, MAX_SEARCH_TITLES)) {
      if (title.length > 60 || title.length < MIN_QUERY_LENGTH) continue;
      const n = normalize(title);
      if (!n) continue;
      searchables.push(title);
  }
  
  for (let i = 0; i < searchables.length && !isBudgetExhausted(startTime, BUDGET_MS) && !isAborted(signal); i += 3) {
      const batch = searchables.slice(i, i + 3);
      const batchResults = await Promise.allSettled(
          batch.map(title => searchAnime(title, { signal }).then(r => r || []))
      );
      for (const r of batchResults) {
          if (r.status !== 'fulfilled' || r.value.length === 0) continue;
          for (const m of r.value) {
              if (!seenUrls.has(m.url)) {
                  seenUrls.add(m.url);
                  allMatches.push(m);
              }
          }
      }
      // Early exit: si on a déjà des résultats, arrêter les recherches
      if (allMatches.length > 0) {
          console.log(`[Vostfree] Found ${allMatches.length} matches after ${i + batch.length}/${searchables.length} searches, stopping early`);
          break;
      }
  }
  
  // Fix #2: Fallback saison optimisé — 1 seule requête stratégique au lieu de 9+
  if (!isAborted(signal) && mediaType === 'tv' && effectiveSeason !== undefined && effectiveSeason !== null && !isBudgetExhausted(startTime, BUDGET_MS)) {
      const hasExplicitSeasonMatch = allMatches.some(m => getSeasonNumber(m.title + ' ' + m.url) === effectiveSeason);
      
      if (!hasExplicitSeasonMatch) {
          // Trouver le meilleur titre pour la recherche : 1er titre purement ASCII (ex: anglais/français)
          const mainTitle = titlesOrdered.find(t => !/[^\x00-\x7F]/.test(t) && t.length >= MIN_QUERY_LENGTH) || 
                            titlesOrdered.find(t => t.length >= MIN_QUERY_LENGTH) || 
                            titlesOrdered[0];
          if (mainTitle && mainTitle.length >= MIN_QUERY_LENGTH) {
              const seasonQuery = `${mainTitle} Saison ${effectiveSeason}`;
              console.log(`[Vostfree] Season fallback: "${seasonQuery}"`);
              const batch = await searchAnime(seasonQuery, { signal });
              if (batch && batch.length > 0) {
                  for (const m of batch) {
                      if (!seenUrls.has(m.url)) {
                          seenUrls.add(m.url);
                          const mSn = getSeasonNumber(m.title + ' ' + m.url);
                          if (mSn === null || mSn === effectiveSeason) {
                              allMatches.push(m);
                          }
                      }
                  }
              }
          }
      }
  }
  
  if (allMatches.length === 0) return [];

  // Prioritize results that match the season if explicitly mentioned
  if (mediaType === 'tv' && effectiveSeason !== undefined && effectiveSeason !== null) {
      allMatches = allMatches.sort((a, b) => {
          const aSn = getSeasonNumber(a.title + ' ' + a.url);
          const bSn = getSeasonNumber(b.title + ' ' + b.url);
          const hasA = aSn === effectiveSeason;
          const hasB = bSn === effectiveSeason;
          if (hasA && !hasB) return -1;
          if (!hasA && hasB) return 1;
          return 0;
      });
  }

  const streams = [];
  const checkedUrls = new Set();
  const MAX_MATCHES_TO_PROCESS = 2;
  let processedCount = 0;

  for (const match of allMatches) {
      if (isAborted(signal) || isBudgetExhausted(startTime, BUDGET_MS)) break;
      if (checkedUrls.has(match.url)) continue;
      checkedUrls.add(match.url);
      if (processedCount >= MAX_MATCHES_TO_PROCESS) break;

      const matchLower = match.title.toLowerCase();
      const matchUrlLower = match.url.toLowerCase();
      const animeUrl = match.url;
      const lang = (match.title.toUpperCase().includes(' VF') || match.url.includes('/vf/')) ? 'VF' : 'VOSTFR';

      // Skip OAV/OVA/FILM/Movie/Special results for TV series (non-film entries)
      if (mediaType === 'tv') {
          const skipKeywords = /\b(oav|ova|film|movie)\b/;
          if (match.genre === 'FILM' || match.genre === 'OAV' ||
              skipKeywords.test(matchLower) || skipKeywords.test(matchUrlLower)) {
              continue;
          }
      }

      // Skip results explicitly for a different season, unless no match has the target season
      if (mediaType === 'tv' && effectiveSeason !== undefined && effectiveSeason !== null) {
          const matchSn = getSeasonNumber(match.title + ' ' + match.url);
          if (matchSn !== null && matchSn !== effectiveSeason) {
              const hasCorrectSeason = allMatches.some(m => {
                  const sn = getSeasonNumber(m.title + ' ' + m.url);
                  return sn !== null && sn === effectiveSeason;
              });
              if (hasCorrectSeason) continue;
          }
      }

      processedCount++;
      try {
          const html = await fetchText(animeUrl, { signal });
            const $ = cheerio.load(html);

            let buttonsId = null;

            // Movies: no episode selector, use default buttons_1
            if (mediaType === 'movie') {
                buttonsId = 'buttons_1';
            } else {
                // TV: find episode in selector (Fix #1: utiliser episodeStrs avec l'absolu en priorité)
                $('select.new_player_selector option').each((i, el) => {
                    const text = $(el).text().trim();
                    for (const ep of episodeStrs) {
                        const epNum = parseInt(ep, 10);
                        const numMatch = text.match(/[Ee]pisode\s*(0*)(\d+)/i);
                        if (numMatch) {
                            const parsedEp = parseInt(numMatch[1] + numMatch[2], 10);
                            if (parsedEp === epNum) {
                                buttonsId = $(el).val();
                                return false;
                            }
                        }
                    }
                });

                // Fallback: if selector exists but empty (single-episode page), use buttons_1
                if (!buttonsId) {
                    const hasSelector = $('select.new_player_selector').length > 0;
                    if (hasSelector) {
                        console.warn(`[Vostfree] Episode ${episode} not found in selector on ${animeUrl}`);
                        continue;
                    }
                }
            }

            if (!buttonsId) {
                buttonsId = 'buttons_1';
            }

            console.log(`[Vostfree] Using buttons ID: ${buttonsId} for ${lang}`);
            const playerElements = $(`#${buttonsId} div[id^="player_"]`).toArray();

            const filteredPlayers = playerElements.filter(el => {
                const elClass = ($(el).attr('class') || '').toLowerCase();
                const pName = $(el).text().trim().toLowerCase();
                const combined = elClass + ' ' + pName;
                return KNOWN_HOSTS.some(h => combined.includes(h.toLowerCase()));
            });

            const playerPromises = filteredPlayers.map(async (el) => {
                const playerId = $(el).attr('id').replace('player_', '');
                const playerName = $(el).text().trim() || "Player";
                const elClass = ($(el).attr('class') || '').toLowerCase();

                const contentDivId = `content_player_${playerId}`;
                const content = $(`#${contentDivId}`).text().trim();

                if (content) {
                    let url = content;
                    if (!url.startsWith('http')) {
                        if (elClass.includes('sibnet') || playerName.toLowerCase().includes('sibnet')) {
                            url = `https://video.sibnet.ru/shell.php?videoid=${content}`;
                        } else if (elClass.includes('vidmoly') || playerName.toLowerCase().includes('vidmoly')) {
                            url = `https://vidmoly.to/embed-${content}.html`;
                        } else if (elClass.includes('uqload') || elClass.includes('oneupload') || playerName.toLowerCase().includes('uqload') || playerName.toLowerCase().includes('oneupload')) {
                            url = `https://uqload.com/embed-${content}.html`;
                        } else if (elClass.includes('sendvid') || playerName.toLowerCase().includes('sendvid')) {
                            url = `https://sendvid.com/embed/${content}`;
                        } else if (elClass.includes('voe') || playerName.toLowerCase().includes('voe')) {
                            url = `https://voe.sx/e/${content}`;
                        } else if (elClass.includes('dood') || playerName.toLowerCase().includes('dood')) {
                            url = `https://dood.to/e/${content}`;
                        } else if (elClass.includes('stape') || elClass.includes('streamtape') || playerName.toLowerCase().includes('stape') || playerName.toLowerCase().includes('streamtape')) {
                            url = `https://streamtape.com/e/${content}`;
                        } else if (elClass.includes('myvi') || elClass.includes('mytv') || playerName.toLowerCase().includes('myvi') || playerName.toLowerCase().includes('mytv')) {
                            url = `https://www.myvi.ru/embed/${content}`;
                        } else if (elClass.includes('vip')) {
                            if (content.includes('voe.sx') || content.includes('vudeo')) {
                                url = content;
                            }
                        } else if (elClass.includes('mail') || elClass.includes('ok')) {
                        }
                    }

                    if (url.startsWith('http')) {
                        const urlLower = url.toLowerCase();
                        const isUnresolvable = UNRESOLVABLE_HOSTS.some(h => urlLower.includes(h));
                        if (isUnresolvable) {
                            // Voe/Streamtape/Dood use React SPA or AES-GCM fingerprinting.
                            // Return the embed URL directly — the native player may handle it.
                            return {
                                name: `Vostfree (${lang})`,
                                title: `${playerName} - ${lang}`,
                                url: url,
                                quality: "HD",
                                headers: { "Referer": BASE_URL },
                                isDirect: false,
                            };
                        }
                        try {
                            const stream = await withTimeout(
                                resolveStream({
                                    name: `Vostfree (${lang})`,
                                    title: `${playerName} - ${lang}`,
                                    url: url,
                                    quality: "HD",
                                    headers: { "Referer": BASE_URL }
                                }),
                                PLAYER_TIMEOUT_MS,
                                `Vostfree player ${playerName}`
                            );
                            return stream;
                        } catch(e) { return null; }
                    }
                }
                return null;
            });

            const results = await Promise.allSettled(playerPromises);
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) streams.push(r.value);
            }
            const directStreams = streams.filter(s => s && s.isDirect);
            if (directStreams.length > 0) {
                const matchSn = getSeasonNumber(match.title + ' ' + match.url);
                const isExplicitlyWrong = matchSn !== null && matchSn !== effectiveSeason;
                if (!isExplicitlyWrong) {
                    console.log(`[Vostfree] Found ${directStreams.length} direct streams from ${animeUrl}, stopping early`);
                    break;
                } else {
                    console.log(`[Vostfree] Found ${directStreams.length} direct streams but match season ${matchSn} != target ${effectiveSeason}, continuing search`);
                }
            }
        } catch (e) {
            console.error(`[Vostfree] Match handle error: ${e.message}`);
        }
    }

    const directStreams = streams.filter(s => s && s.isDirect);
    const embedStreams = streams.filter(s => s && !s.isDirect && s.url);

    // Prefer direct streams. If none found, include embed URLs as fallback.
    const validStreams = directStreams.length > 0 ? directStreams : embedStreams;
    if (directStreams.length === 0 && embedStreams.length > 0) {
        console.log(`[Vostfree] No direct streams, using ${embedStreams.length} embed URL(s) as fallback`);
    }
    console.log(`[Vostfree] Total streams found: ${validStreams.length} (${directStreams.length} direct, ${embedStreams.length} embed)`);

    const cleaned = validStreams.map(s => ({
        name: s.name || 'Vostfree',
        title: s.title || 'Stream',
        url: s.url || '',
        quality: s.quality || 'HD',
        language: s.language || null,
        isDirect: !!s.isDirect,
        headers: s.headers || {}
    }));
    
    return sortStreamsByLanguage(cleaned);
}
