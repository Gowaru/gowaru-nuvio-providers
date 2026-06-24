/**
 * Video Link Resolvers for common hosts
 * Optimized for QuickJS (Nuvio runtime)
 */

// ─── Shared Budget & Helpers ────────────────────────────────────────────────

/**
 * Budget standard pour tous les providers.
 * NuvioTV a 30s OkHttp + 60s plugin total.
 * On garde 45s pour laisser 15s de marge.
 */
export const PROVIDER_BUDGET_MS = 45000;

/**
 * Delais de retry standards (ms)
 */
const RETRY_DELAYS = [1000, 3000, 5000];

/**
 * Busy-wait sleep pour QuickJS (pas de setTimeout).
 * À utiliser dans tous les providers plutôt que de dupliquer.
 */
export function sleep(ms) {
  const target = Date.now() + ms;
  return new Promise(resolve => {
    const check = () => Date.now() >= target ? resolve() : Promise.resolve().then(check);
    check();
  });
}

/**
 * Rate limiter configurable par domaine.
 * Ajoute un délai minimum entre deux requêtes vers le même domaine,
 * avec du jitter aléatoire pour éviter les patterns synchronisés.
 *
 * Usage:
 *   const limitAnimoFlix = createRateLimiter();
 *   await limitAnimoFlix('animoflix.to'); // Attend si nécessaire
 *   const res = await safeFetch(url, opts);
 *
 * @param {number} [baseDelay=1000] - Délai de base en ms entre deux requêtes
 * @param {number} [jitterPercent=0.3] - Jitter aléatoire (+/- % du delay)
 * @returns {Function} rateLimit(domain) → Promise qui résout quand on peut envoyer
 */
export function createRateLimiter(baseDelay = 1000, jitterPercent = 0.3) {
  const lastRequest = new Map();

  return async function rateLimit(domain) {
    const now = Date.now();
    const last = lastRequest.get(domain) || 0;
    const elapsed = now - last;
    const jitter = baseDelay * jitterPercent * (Math.random() * 2 - 1); // +/- jitterPercent
    const delay = Math.max(0, baseDelay + jitter - elapsed);

    if (delay > 0) {
      await sleep(delay);
    }

    lastRequest.set(domain, Date.now());
  };
}

/**
 * Convenience wrapper: crée un rate limiter avec les valeurs par défaut
 * standard pour les providers HTTP (200ms base, 40% jitter).
 * Remplace le pattern dupliqué `createRateLimiter(200, 0.4)` dans les http.js.
 *
 * Usage:
 *   const rateLimit = createProviderRateLimiter();          // 200ms + 40%
 *   const rateLimit = createProviderRateLimiter(400, 0.4);  // custom
 *
 * @param {number} [baseDelay=200] - Délai de base en ms
 * @param {number} [jitterPercent=0.4] - Jitter aléatoire (+/- % du delay)
 * @returns {Function} rateLimit(domain) → Promise
 */
export function createProviderRateLimiter(baseDelay = 200, jitterPercent = 0.4) {
  return createRateLimiter(baseDelay, jitterPercent);
}

/**
 * Fetch avec retry et backoff.
 * @param {Function} fetchFn - Fonction de fetch à appeler (ex: () => fetchText(url))
 * @param {object} [opts]
 * @param {number} [opts.retries=2] - Nombre de tentatives
 * @param {number[]} [opts.delays] - Délais entre tentatives
 * @returns {Promise<string>} Résultat du fetch
 */
export async function fetchWithRetry(fetchFn, opts = {}) {
  const retries = opts.retries ?? 2;
  const delays = opts.delays ?? RETRY_DELAYS;
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchFn();
    } catch (err) {
      lastError = err;
      // Ne pas retry les 4xx sauf 429
      if (err.message && /HTTP error 4(?:0[0-9]|1[0-79]|29)/.test(err.message)) throw err;
      if (i === retries) throw err;
      if (delays[i]) await sleep(delays[i]);
    }
  }
  throw lastError;
}

/**
 * Trie les streams pour mettre VF en premier, puis VOSTFR.
 * @param {Array} streams
 * @returns {Array}
 */
export function sortStreamsByLanguage(streams) {
  if (!Array.isArray(streams)) return [];
  return [...streams].sort((a, b) => {
    const getPref = (s) => {
      const text = ((s.name || '') + ' ' + (s.title || '') + ' ' + (s.language || '')).toUpperCase();
      if (text.includes('VF') || text.includes('FRENCH') || text.includes('VFF') || text.includes('VFQ')) return 0;
      if (text.includes('VOSTFR') || text.includes('VOST') || text.includes('MULTI')) return 1;
      if (text.includes('VO')) return 2;
      return 3;
    };
    return getPref(a) - getPref(b);
  });
}

/**
 * Guard pour response.json() qui retourne null en QuickJS au lieu de throw.
 * Voir DOCUMENTATION.md : "response.json() returns null (not rejected) on parse failure"
 */
export function safeJson(data) {
  return data != null ? data : [];
}

/**
 * Crée un provider standardisé avec timeout, error handling et expandStreamQualities.
 * Élimine la duplication de boilerplate dans tous les index.js.
 *
 * @param {string} name - Nom du provider (ex: "VoirAnime")
 * @param {Function} extractFn - Fonction d'extraction (extractStreams)
 * @param {object} [opts]
 * @param {number} [opts.timeout=45000] - Timeout en ms
 * @param {object} [opts.quality] - Options pour expandStreamQualities
 * @returns {Function} getStreams(tmdbId, mediaType, season, episode) → Promise<Array>
 */
export function createProvider(name, extractFn, opts = {}) {
  const PROVIDER_TIMEOUT = safeConfig(`NUVIO_TIMEOUT_${name.toUpperCase().replace(/[^a-z0-9]/g, '_')}`, opts.timeout || PROVIDER_BUDGET_MS);
  const qualityOpts = opts.quality || { includeCodec: true, includeFps: false };

  return async function getStreams(tmdbId, mediaType, season, episode) {
    const se = mediaType === 'movie' ? '' : ` S${season}E${episode}`;
    const label = `${name} ${mediaType} ${tmdbId}${se}`;
    console.log(`[${name}] Request: ${label}`);

    try {
      const streams = await withTimeout(
        extractFn(tmdbId, mediaType, season, episode),
        PROVIDER_TIMEOUT,
        label
      );
      return await expandStreamQualities(streams, qualityOpts);
    } catch (error) {
      if (error.message && error.message.includes('[Timeout]')) {
        console.warn(`[${name}] ${error.message}`);
      } else {
        console.error(`[${name}] Error:`, error && error.message || error);
      }
      return [];
    }
  };
}

// ─── Existing Code ──────────────────────────────────────────────────────────

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Accept-Encoding": "identity",
};

const _atob = (str) => {
    try { return atob(str); }
    catch (e) { return str; }
};

const CODEC_PREFERENCE = ['AV1', 'H.265', 'H.264', 'VP9'];

/**
 * Sanitize a search query for site search APIs.
 * Replaces hyphens, apostrophes, and common punctuation that can break
 * full-text search matching (e.g. TMDB returns "One-Punch Man" but sites
 * have "One Punch Man").
 *
 * @param {string} query - The raw search query
 * @returns {string} - Sanitized query safe for site search APIs
 */
export function sanitizeSearchQuery(query) {
  return (query || '')
    .replace(/[–—]/g, ' ')            // long dashes to spaces (preserve regular hyphens)
    .replace(/[''`]/g, "'")           // normalize smart/curly quotes to straight apostrophe
    .replace(/[()\[\]{}:;,!?]/g, ' ') // common punctuation to spaces
    .replace(/\s+/g, ' ')             // collapse multiple spaces
    .trim();
}

/**
 * TV timeout budget: NuvioTV has 30s OkHttp + 60s plugin total
 * We use 50s as a safe wall-clock budget to leave headroom.
 */
export const TV_BUDGET_MS = 50000;

/**
 * Check if a budget (wall-clock) has been exceeded.
 * Providers that import this can bail out early instead of starting
 * new expensive requests when running on NuvioTV.
 */
export function isBudgetExhausted(startTime, budgetMs) {
    const elapsed = Date.now() - (startTime || 0);
    return elapsed > (budgetMs || TV_BUDGET_MS);
}

/**
 * Safely reads a numeric config value from process.env (Node.js)
 * or returns the default (QuickJS where process is undefined).
 */
export function safeConfig(key, defaultVal) {
    try {
        if (typeof process !== 'undefined' && process.env && process.env[key]) {
            const val = parseInt(process.env[key], 10);
            return isNaN(val) ? defaultVal : val;
        }
    } catch (_) {}
    return defaultVal;
}

/**
 * Wraps a promise with a hard timeout (Node.js only).
 * In QuickJS (no setTimeout), simply returns the promise — the app's own 60s
 * context timeout handles it.
 */
export async function withTimeout(promise, ms, label = 'Operation') {
    if (!ms || ms <= 0 || typeof setTimeout === 'undefined') return promise;
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

function isKnownFakeDirectUrl(url) {
    if (!url || typeof url !== 'string') return true;
    const u = url.toLowerCase();
    return (
        u.includes('test-videos.co.uk') ||
        u.includes('big_buck_bunny') ||
        u.includes('bigbuckbunny') ||
        u.includes('sample-videos.com') ||
        u.includes('example.com') ||
        u.includes('localhost')
    );
}

function isPlayableMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    if (isKnownFakeDirectUrl(u)) return false;
    return /\.(mp4|m3u8|mkv|webm)(\?.*)?$/.test(u) || u.includes('/hls2/') || u.includes('/master.m3u8');
}

const STRICT_QUALITY_TIERS = [2160, 1080, 720, 480, 360, 240];
const DEFAULT_QUALITY_TIER = 720;

function nearestQualityTier(height) {
    if (!Number.isFinite(height) || height <= 0) return DEFAULT_QUALITY_TIER;
    let nearest = STRICT_QUALITY_TIERS[0];
    let minDiff = Math.abs(height - nearest);
    for (const tier of STRICT_QUALITY_TIERS) {
        const diff = Math.abs(height - tier);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = tier;
        }
    }
    return nearest;
}

function normalizeQualityLabel(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return `${DEFAULT_QUALITY_TIER}p`;

    if (raw === '4k' || raw === 'uhd' || raw.includes('2160')) return '2160p';
    if (raw.includes('fhd') || raw.includes('fullhd') || raw.includes('1080')) return '1080p';
    if (raw.includes('hd') || raw.includes('720')) return '720p';

    const numericMatch = raw.match(/(\d{3,4})\s*p?/i);
    if (numericMatch) {
        const tier = nearestQualityTier(Number(numericMatch[1]));
        return `${tier}p`;
    }

    return `${DEFAULT_QUALITY_TIER}p`;
}

const CODEC_PRIORITY = {
    'avc1': 'H.264',
    'h264': 'H.264',
    'hev1': 'H.265',
    'hvc1': 'H.265',
    'h265': 'H.265',
    'av01': 'AV1',
    'av1': 'AV1',
    'vp9': 'VP9',
    'vp09': 'VP9',
    'mp4a': 'AAC',
    'ac-3': 'AC3',
    'ec-3': 'EAC3',
    'opus': 'Opus',
};

function parseCodecs(codecsStr) {
    if (!codecsStr || typeof codecsStr !== 'string') return { video: null, audio: null };
    const parts = codecsStr.split(',').map(s => s.trim());
    let video = null, audio = null;
    for (const codec of parts) {
        const base = codec.split('.')[0].toLowerCase();
        const known = CODEC_PRIORITY[base];
        if (!known) continue;
        if (['H.264', 'H.265', 'AV1', 'VP9'].includes(known)) {
            if (!video) video = { codec: known, raw: codec };
        } else if (['AAC', 'AC3', 'EAC3', 'Opus'].includes(known)) {
            if (!audio) audio = { codec: known, raw: codec };
        }
    }
    return { video, audio };
}

const manifestCache = new Map();
const MANIFEST_CACHE_TTL = 120_000;

function getCachedManifest(key) {
    const entry = manifestCache.get(key);
    if (entry && Date.now() - entry.ts < MANIFEST_CACHE_TTL) return entry.data;
    return null;
}

function setCachedManifest(key, data) {
    manifestCache.set(key, { data, ts: Date.now() });
}

// ─── Global Fetch Cache ─────────────────────────────────────────────────────
// Évite les appels réseau dupliqués entre providers (TMDB API, ArmSync, etc.)

/**
 * Cache mémoire global pour safeFetch.
 * Clé = méthode|url (ex: "GET|https://api.tmdb.org/3/tv/123")
 * TTL de 30s pour partager les résultats TMDB/ArmSync entre tous les
 * providers qui s'exécutent dans la même chaîne (ex: VoirAnime + Vostfree
 * pour le même titre). Évite ~60 appels API dupliqués sur une requête typique.
 */
let FETCH_CACHE_TTL = 30000;

/**
 * Permet de configurer le TTL du cache depuis l'extérieur.
 * @param {number} ms - Nouveau TTL en millisecondes
 */
export function setFetchCacheTtl(ms) {
    FETCH_CACHE_TTL = ms > 0 ? ms : 30000;
}

const fetchCache = new Map();

function getCachedFetch(key) {
    const entry = fetchCache.get(key);
    if (entry && Date.now() - entry.ts < FETCH_CACHE_TTL) return entry.data;
    return null;
}

function setCachedFetch(key, data) {
    // Nettoyage simple : si le cache dépasse 200 entrées, on vide tout
    if (fetchCache.size >= 200) fetchCache.clear();
    fetchCache.set(key, { data, ts: Date.now() });
}

function qualityRank(value) {
    const q = normalizeQualityLabel(value).toLowerCase();
    const match = q.match(/(\d{3,4})p/);
    const height = match ? Number(match[1]) : DEFAULT_QUALITY_TIER;
    const tier = nearestQualityTier(height);
    return STRICT_QUALITY_TIERS.length - 1 - STRICT_QUALITY_TIERS.indexOf(tier);
}

function appendQualityToTitle(title, quality, codec, fps) {
    const parts = [];
    const q = normalizeQualityLabel(quality);
    if (q && !(title || '').includes(q)) parts.push(q);
    if (codec && codec !== 'H.264') parts.push(codec);
    if (fps && fps > 30) parts.push(`${fps}fps`);
    if (parts.length === 0) return title;
    return `${title} [${parts.join(' ')}]`;
}

function inferType(url) {
    if (!url || typeof url !== 'string') return null;
    const u = url.toLowerCase();
    if (u.includes('.m3u8') || u.includes('/hls/') || u.includes('/hls2/') || u.includes('master.m3u8')) return 'hls';
    if (u.includes('.mp4')) return 'mp4';
    if (u.includes('.mkv')) return 'mkv';
    if (u.includes('.webm')) return 'webm';
    return null;
}

function inferLanguage(stream) {
    if (stream.language) return stream.language;
    const name = stream.name || '';
    const match = name.match(/\((\w+)\)/);
    if (match) {
        const lang = match[1].toUpperCase();
        if (['VF', 'VOSTFR', 'VO', 'VOSTF', 'VOA', 'VOST'].includes(lang)) return lang;
    }
    return null;
}

async function expandSingleStreamQualities(stream, options = {}) {
    if (!stream || !stream.url || typeof stream.url !== 'string') return [];
    const url = stream.url;
    const lower = url.toLowerCase();

    if (!lower.includes('.m3u8') && !lower.includes('/hls/')) {
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD'), type: inferType(url) }];
    }

    const cacheKey = url;
    if (!options.forceRefresh) {
        const cached = getCachedManifest(cacheKey);
        if (cached) return cached;
    }

    const res = await safeFetch(url, { headers: stream.headers || {} });
    if (!res) {
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD'), type: 'hls' }];
    }

    const manifest = await res.text();
    if (!/#EXT-X-STREAM-INF/i.test(manifest)) {
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD'), type: 'hls' }];
    }

    const lines = manifest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const variants = [];

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

        const nextLine = lines[index + 1];
        if (!nextLine || nextLine.startsWith('#')) continue;

        const resolution = line.match(/RESOLUTION=\d+x(\d+)/i)?.[1];
        const frameRate = line.match(/FRAME-RATE=([0-9.]+)/i)?.[1];
        const bandwidth = line.match(/BANDWIDTH=(\d+)/i)?.[1];
        const codecs = line.match(/CODECS="([^"]+)"/i)?.[1];

        let quality = resolution ? `${resolution}p` : null;
        if (!quality && bandwidth) {
            const bw = Number(bandwidth);
            if (bw >= 8_000_000) quality = '2160p';
            else if (bw >= 5_000_000) quality = '1080p';
            else if (bw >= 2_500_000) quality = '720p';
            else if (bw >= 1_200_000) quality = '480p';
            else quality = '360p';
        }
        if (!quality && frameRate) quality = `${normalizeQualityLabel(stream.quality || 'HD')}`;

        const parsedCodec = parseCodecs(codecs);
        const fps = frameRate ? Math.round(parseFloat(frameRate)) : null;

        let variantUrl = nextLine;
        try {
            variantUrl = new URL(nextLine, url).toString();
        } catch (e) {}

        variants.push({
            ...stream,
            url: variantUrl,
            quality: normalizeQualityLabel(quality || stream.quality || 'HD'),
            type: 'hls',
            codec: parsedCodec.video?.codec || null,
            audioCodec: parsedCodec.audio?.codec || null,
            fps,
            bandwidth: bandwidth ? parseInt(bandwidth) : null,
            title: appendQualityToTitle(
                stream.title || stream.name || 'Stream',
                quality || stream.quality || 'HD',
                options.includeCodec !== false ? parsedCodec.video?.codec : null,
                options.includeFps !== false ? fps : null
            )
        });
    }

    if (variants.length === 0) {
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD'), type: 'hls' }];
    }

    const unique = [];
    const seen = new Set();
    for (const variant of variants) {
        if (seen.has(variant.url)) continue;
        seen.add(variant.url);
        unique.push(variant);
    }

    unique.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

    const maxV = options.maxVariants || unique.length;
    const trimmed = unique.slice(0, maxV);

    setCachedManifest(cacheKey, trimmed);
    return trimmed;
}

function filterByPreferredCodec(streams, preferred) {
    if (!preferred || !streams.length) return streams;
    const pref = preferred.toUpperCase();
    const hasPreferred = streams.some(s => s.codec?.toUpperCase() === pref);
    if (!hasPreferred) return streams;
    return streams.filter(s => s.codec?.toUpperCase() === pref);
}

function sortStreams(streams) {
    return [...streams].sort((a, b) => {
        const qDiff = qualityRank(b.quality) - qualityRank(a.quality);
        if (qDiff !== 0) return qDiff;
        if (a.codec && b.codec) {
            const getOrder = (c) => CODEC_PREFERENCE.indexOf(c) >= 0 ? CODEC_PREFERENCE.indexOf(c) : 99;
            return getOrder(a.codec) - getOrder(b.codec);
        }
        return 0;
    });
}

export async function expandStreamQualities(streams, options = {}) {
    const input = Array.isArray(streams) ? streams : [];
    const expanded = [];

    const results = await Promise.allSettled(
        input.map(stream => expandSingleStreamQualities(stream, options))
    );
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const stream = input[i];
        if (r.status === 'fulfilled') {
            for (const variant of r.value) {
                expanded.push(variant);
            }
        } else if (stream) {
            expanded.push({ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD'), type: inferType(stream.url) });
        }
    }

    const deduped = [];
    const seen = new Set();
    for (const stream of expanded) {
        if (!stream?.url) continue;
        if (isKnownFakeDirectUrl(stream.url)) continue;
        if (seen.has(stream.url)) continue;
        seen.add(stream.url);
        deduped.push(stream);
    }

    let sorted = sortStreams(deduped);

    sorted = sorted.map(s => ({
        ...s,
        type: s.type || inferType(s.url),
        language: inferLanguage(s) || s.language || null,
    }));

    if (options.preferredCodec) {
        return filterByPreferredCodec(sorted, options.preferredCodec);
    }

    return sorted;
}

export async function safeFetch(url, options = {}) {
    const start = Date.now();
    const SLOW_THRESHOLD = 15000;

    // Cache lookup pour les requêtes GET (élimine les doublons TMDB/ArmSync)
    const method = (options.method || 'GET').toUpperCase();
    const cacheKey = method + '|' + url;
    if (method === 'GET') {
        const cached = getCachedFetch(cacheKey);
        if (cached) {
            return {
                text: () => Promise.resolve(cached.bodyText),
                json: async () => {
                    try { return JSON.parse(cached.bodyText); } catch (e) { throw e; }
                },
                ok: cached.ok,
                status: cached.status,
                url: cached.finalUrl || url,
                headers: cached.headers || {}
            };
        }
    }

    try {
        const { timeout, ...rest } = options;
        const fetchOpts = {
            ...rest,
            headers: { ...HEADERS, ...rest.headers },
            redirect: 'follow'
        };
        if (timeout > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'undefined') {
            fetchOpts.signal = AbortSignal.timeout(timeout);
        }
        const response = await fetch(url, fetchOpts);
        const elapsed = Date.now() - start;
        if (elapsed > SLOW_THRESHOLD) {
            console.warn(`[safeFetch] Slow request (${elapsed}ms): ${(url || '').slice(0, 120)}`);
        }
        if (!response) return null;

        const status = response.status;
        let bodyText = '';
        try {
            bodyText = await response.text();
        } catch (e) {
            bodyText = '';
        }

        // Cache les réponses GET réussies (status 2xx) pour éviter les doublons
        if (method === 'GET' && status >= 200 && status < 300) {
            setCachedFetch(cacheKey, {
                bodyText,
                ok: true,
                status,
                finalUrl: response.url,
                headers: response.headers
            });
        }

        return {
            text: () => Promise.resolve(bodyText),
            json: async () => {
                try { return JSON.parse(bodyText); } catch (e) { throw e; }
            },
            ok: response.ok,
            status,
            url: response.url,
            headers: response.headers
        };
    } catch (e) {
        const elapsed = Date.now() - start;
        if (elapsed > SLOW_THRESHOLD) {
            console.warn(`[safeFetch] Slow request failed (${elapsed}ms): ${(url || '').slice(0, 120)}`);
        }
        return null;
    }
}

export function unpack(code) {
    try {
        if (!code.includes('p,a,c,k,e,d')) return code;

        const extractEvalBlocks = (input) => {
            const blocks = [];
            let pos = 0;
            while (true) {
                const start = input.indexOf('eval(function(p,a,c,k,e,d)', pos);
                if (start === -1) break;

                let i = start;
                let depth = 0;
                let inSingle = false;
                let inDouble = false;
                let escaped = false;

                for (; i < input.length; i++) {
                    const ch = input[i];
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (!inDouble && ch === "'") inSingle = !inSingle;
                    else if (!inSingle && ch === '"') inDouble = !inDouble;
                    if (inSingle || inDouble) continue;

                    if (ch === '(') depth++;
                    else if (ch === ')') {
                        depth--;
                        if (depth === 0) {
                            i++;
                            break;
                        }
                    }
                }

                if (i > start) blocks.push(input.slice(start, i));
                pos = i;
            }
            return blocks;
        };

        const decodeBlock = (block) => {
            const parseString = (src, start) => {
                const quote = src[start];
                if (quote !== "'" && quote !== '"') return null;
                let i = start + 1;
                let out = '';
                let escaped = false;
                for (; i < src.length; i++) {
                    const ch = src[i];
                    if (escaped) {
                        out += ch;
                        escaped = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (ch === quote) return { value: out, end: i + 1 };
                    out += ch;
                }
                return null;
            };

            const skipWs = (src, i) => {
                while (i < src.length && /\s/.test(src[i])) i++;
                return i;
            };

            const parseIntAt = (src, i) => {
                i = skipWs(src, i);
                const m = src.slice(i).match(/^\d+/);
                if (!m) return null;
                return { value: parseInt(m[0], 10), end: i + m[0].length };
            };

            const callStart = block.indexOf('}(');
            if (callStart === -1) return null;
            let i = callStart + 2;
            i = skipWs(block, i);

            const pStr = parseString(block, i);
            if (!pStr) return null;
            let p = pStr.value;
            i = skipWs(block, pStr.end);
            if (block[i] !== ',') return null;

            const aNum = parseIntAt(block, i + 1);
            if (!aNum) return null;
            const a = aNum.value;
            i = skipWs(block, aNum.end);
            if (block[i] !== ',') return null;

            const cNum = parseIntAt(block, i + 1);
            if (!cNum) return null;
            let c = cNum.value;
            i = skipWs(block, cNum.end);
            if (block[i] !== ',') return null;

            const kStr = parseString(block, skipWs(block, i + 1));
            if (!kStr) return null;
            const splitPart = block.slice(kStr.end, kStr.end + 20);
            if (!/\.split\(\s*['"]\|['"]\s*\)/.test(splitPart)) return null;
            const k = kStr.value.split('|');

            const e = (x) => (x < a ? '' : e(parseInt(x / a, 10))) + ((x = x % a) > 35 ? String.fromCharCode(x + 29) : x.toString(36));
            const dict = {};
            while (c--) dict[e(c)] = k[c] || e(c);

            return p.replace(/\b\w+\b/g, (w) => dict[w] || w);
        };

        let result = code;
        const blocks = extractEvalBlocks(code);
        for (const block of blocks) {
            try {
                const decoded = decodeBlock(block);
                if (decoded) result = result.replace(block, decoded);
            } catch (e) {}
        }

        return result;
    } catch (err) { return code; }
}

export async function resolveSibnet(url) {
    try {
        const res = await safeFetch(url, { headers: { 'Referer': 'https://video.sibnet.ru/' } });
        if (!res) return { url };
        const html = await res.text();
        // JWPlayer uses `file:` key; URL may have query params like ?mt=...&sig=...
        const match =
            html.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i) ||
            html.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i) ||
            html.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)["']/i);
        if (match) {
            let videoUrl = match[1];
            if (videoUrl.startsWith('//')) videoUrl = "https:" + videoUrl;
            else if (videoUrl.startsWith('/')) videoUrl = "https://video.sibnet.ru" + videoUrl;
            return { url: videoUrl, headers: { "Referer": "https://video.sibnet.ru/" } };
        }
    } catch (e) {}
    return { url };
}

export async function resolveVidmoly(url) {
    try {
        // Support all known vidmoly TLDs: .net, .to, .ru, .is, .biz, .me
        // Try original URL FIRST (avoids dead .me which returns 404+ads)
        const originalDomain = url.match(/^https?:\/\/([^/]+)/)?.[1] || '';
        const originalReferer = originalDomain ? `https://${originalDomain}/` : 'https://vidmoly.me/';

        // Try all possible domains: original first, then alternative TLDs
        const tldVariants = ['biz', 'me', 'net', 'to', 'ru', 'is'];
        const domains = [url]; // Original domain first
        for (const tld of tldVariants) {
            const altUrl = url.replace(/vidmoly\.(net|to|ru|is|biz|me)/, `vidmoly.${tld}`);
            if (altUrl !== url) domains.push(altUrl);
        }
        const uniqueDomains = [...new Set(domains)].slice(0, 4); // Max 4 attempts

        for (const fetchUrl of uniqueDomains) {
            try {
                const fetchDomain = fetchUrl.match(/^https?:\/\/([^/]+)/)?.[1] || '';
                const ref = fetchDomain ? `https://${fetchDomain}/` : originalReferer;
                let res = await safeFetch(fetchUrl, { headers: { 'Referer': ref, 'Origin': ref } });
                if (!res || !res.ok) continue;
                let html = await res.text();
                // Skip if response is ad/404 page (short or contains ad scripts)
                if (html.length < 500 || html.includes('finisheddaysflamboyant')) continue;
                
                if (html.includes('p,a,c,k,e,d') || html.includes('eval(function')) html = unpack(html);

                const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                              html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                              html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                if (match) return { url: match[1], headers: { "Referer": ref, "Origin": ref } };

                const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) ||
                                   html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
                if (jsRedirect && jsRedirect[1] !== fetchUrl) {
                    res = await safeFetch(jsRedirect[1], { headers: { 'Referer': ref, 'Origin': ref } });
                    if (res) {
                        html = await res.text();
                        if (html.includes('p,a,c,k,e,d') || html.includes('eval(function')) html = unpack(html);
                        const match2 = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                                       html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                                       html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                        if (match2) return { url: match2[1], headers: { "Referer": ref, "Origin": ref } };
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}
    return { url };
}

export async function resolveUqload(url) {
    const normalizedPath = url.replace(/^https?:\/\/[^/]+/, '');
    const originalDomain = url.match(/^https?:\/\/([^/]+)/)?.[1] || 'uqload.co';
    // Try original domain + fallbacks for dead domains (uqload.bz is dead, .co is alive)
    const fallbackDomains = [originalDomain];
    if (originalDomain.endsWith('.bz')) fallbackDomains.push('uqload.co', 'uqload.to');
    if (originalDomain.endsWith('.to')) fallbackDomains.push('uqload.co');
    const uniqueDomains = [...new Set(fallbackDomains)];

    return new Promise((resolve) => {
        let failures = 0;
        let resolved = false;

        const checkDomain = async (domain) => {
            try {
                const tryUrl = `https://${domain}${normalizedPath}`;
                const ref = `https://${domain}/`;
                const res = await safeFetch(tryUrl, { headers: { ...HEADERS, 'Referer': ref } });
                if (res) {
                    const html = await res.text();
                    const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) ||
                                  html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/);
                    if (match && !resolved) {
                        resolved = true;
                        resolve({ url: match[1], headers: { "Referer": ref } });
                        return;
                    }
                }
            } catch (e) {}
            
            failures++;
            if (failures === uniqueDomains.length && !resolved) {
                resolve({ url });
            }
        };

        uniqueDomains.forEach(checkDomain);
    });
}

export async function resolveVoe(url) {
    try {
        const res = await safeFetch(url);
        if (!res) return { url };
        let html = await res.text();

        let fetchUrl = url;
        const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (redirect) {
            fetchUrl = redirect[1];
            const res2 = await safeFetch(fetchUrl);
            if (res2) html = await res2.text();
        }

        if (html.includes('p,a,c,k,e,d') || html.includes('eval(function')) html = unpack(html);

        const match = html.match(/'hls'\s*:\s*'([^']+)'/) || 
                      html.match(/"hls"\s*:\s*"([^"]+)"/) ||
                      html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                      html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
        if (match) {
            let videoUrl = match[1] || match[0];
            if (videoUrl.includes('base64')) videoUrl = _atob(videoUrl.split(',')[1] || videoUrl);
            if (isKnownFakeDirectUrl(videoUrl)) return { url };
            return { url: videoUrl, headers: { "Referer": fetchUrl } };
        }
    } catch (e) {}
    return { url };
}

export async function resolveStreamtape(url) {
    try {
        const res = await safeFetch(url);
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('p,a,c,k,e,d')) html = unpack(html);

        const match = html.match(/robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*([^;]+)/);
        if (match) {
            let videoUrl = "https:" + match[1];
            const parts = match[2].split('+');
            for (const p of parts) {
                const innerMatch = p.match(/['"]([^'"]+)['"]/);
                if (innerMatch) {
                    let val = innerMatch[1];
                    const sub = p.match(/substring\((\d+)\)/);
                    if (sub) val = val.substring(parseInt(sub[1]));
                    videoUrl += val;
                }
            }
            return { url: videoUrl, headers: { "Referer": "https://streamtape.com/" } };
        }
    } catch (e) {}
    return { url };
}

export async function resolveSendvid(url) {
    try {
        // Handle daisukianime.xyz wrapper URLs
        if (url.includes('daisukianime')) {
            const idMatch = url.match(/[?&]id=([a-z0-9]+)/i);
            if (idMatch) url = `https://sendvid.com/embed/${idMatch[1]}`;
        }
        // Normalize: use embed URL for sendvid
        const embedUrl = url.includes('/embed/') ? url : url.replace(/sendvid\.com\/([a-z0-9]+)/i, 'sendvid.com/embed/$1');
        const res = await safeFetch(embedUrl, { headers: { 'Referer': 'https://sendvid.com/' } });
        if (!res) return { url };
        const html = await res.text();
        // Try multiple extraction patterns
        const match = html.match(/video_source\s*:\s*["']([^"']+\.mp4[^"']*)["|']/) ||
                      html.match(/source\s+src=["']([^"']+\.mp4[^"']*)["|']/) ||
                      html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/) ||
                      html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/) ||
                      html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
        if (match) return { url: match[1], headers: { 'Referer': 'https://sendvid.com/' } };
    } catch (e) {}
    return { url };
}

export async function resolveLuluvid(url) {
    try {
        const res = await safeFetch(url);
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('p,a,c,k,e,d')) html = unpack(html);

        const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/) ||
                      html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/);
        if (match) {
            let videoUrl = match[1];
            if (videoUrl.includes('base64')) videoUrl = _atob(videoUrl.split(',')[1] || videoUrl);
            return { url: videoUrl, headers: { "Referer": url } };
        }
    } catch (e) {}
    return { url };
}

export async function resolveHGCloud(url) {
    try {
        const res = await safeFetch(url);
        if (!res) return { url };
        const html = await res.text();
        // HGCloud often uses a direct m3u8 in a script or player config
        const match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
        if (match) return { url: match[1], headers: { "Referer": url } };
    } catch (e) {}
    return { url };
}

export async function resolveDood(url) {
    try {
        const domain = url.match(/https?:\/\/([^\/]+)/)?.[1] || "dood.to";
        const res = await safeFetch(url);
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('eval(function(p,a,c,k,e,d)')) html = unpack(html);
        const passMatch = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
            if (passMatch) {
            const token = passMatch[1];
            const passUrl = `https://${domain}/pass_md5/${token}`;
            const passRes = await safeFetch(passUrl, { headers: { "Referer": url } });
            if (passRes && passRes.ok) {
                const content = await passRes.text();
                const randomStr = Math.random().toString(36).substring(2, 12);
                return { 
                    url: content + randomStr + "?token=" + token + "&expiry=" + Date.now(),
                    headers: { "Referer": `https://${domain}/` }
                };
            }
        }
    } catch (e) {}
    return { url };
}

export async function resolveMyTV(url) {
    try {
        // myvi.ru / mytv: try the embed page then look for mp4/m3u8
        const res = await safeFetch(url, { headers: { 'Referer': 'https://www.myvi.ru/' } });
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('eval(function(p,a,c,k,e,d)')) html = unpack(html);
        // Try JSON player config
        const match = html.match(/["'](?:file|src|url|stream_url)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/) ||
                      html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/) ||
                      html.match(/source\s+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)/);
        if (match) return { url: match[1], headers: { 'Referer': 'https://www.myvi.ru/' } };
        // Try API endpoint for myvi
        const idMatch = url.match(/\/(?:embed\/|watch\/|video\/)([a-zA-Z0-9_-]+)/);
        if (idMatch) {
            const apiUrl = `https://www.myvi.ru/api/video/${idMatch[1]}`;
            const apiRes = await safeFetch(apiUrl, { headers: { 'Referer': url } });
            if (apiRes) {
                const data = await apiRes.text();
                const apiMatch = data.match(/["'](?:url|src|file)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
                if (apiMatch) return { url: apiMatch[1], headers: { 'Referer': 'https://www.myvi.ru/' } };
            }
        }
    } catch (e) {}
    return { url };
}

export async function resolveYounetu(url) {
    try {
        const origin = url.match(/^https?:\/\/[^/]+/)?.[0] || 'https://younetu.org';
        const res = await safeFetch(url, { headers: { 'Referer': origin + '/' } });
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('p,a,c,k,e,d') || html.includes('eval(function')) html = unpack(html);

        const match = html.match(/src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                      html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (match) {
            return { url: match[1], headers: { 'Referer': origin + '/' } };
        }
    } catch (e) {}
    return { url };
}

export async function resolveVidoza(url) {
    try {
        const res = await safeFetch(url, { headers: { 'Referer': 'https://vidoza.net/' } });
        if (!res) return { url };
        const html = await res.text();

        const match = html.match(/src\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) ||
                      html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) ||
                      html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
        if (match) {
            return { url: match[1], headers: { 'Referer': 'https://vidoza.net/' } };
        }
    } catch (e) {}
    return { url };
}

export async function resolveMoon(url) {
    try {
        const res = await safeFetch(url);
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('p,a,c,k,e,d')) html = unpack(html);
        const match = html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
        if (match) return { url: match[1], headers: { "Referer": url } };
    } catch (e) {}
    return { url };
}

export async function resolvePackedPlayer(url) {
    try {
        const origin = url.match(/^https?:\/\/[^/]+/)?.[0] || url;
        const res = await safeFetch(url, { headers: { 'Referer': origin + '/' } });
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('p,a,c,k,e,d') || html.includes('eval(function')) html = unpack(html);

        const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/sources\s*:\s*\[[^\]]*?["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);

        if (match) {
            return { url: match[1], headers: { 'Referer': origin + '/' } };
        }
    } catch (e) {}
    return { url };
}

export async function resolveLecteurVideo(url) {
    // lecteurvideo.com: embed player WordPress/WP theme.
    // Format: /embed.php?id={id}&tp={type}&url={referrer}
    // Le paramètre `url` est le nom du site référant (ex: wookafr.tel).
    // La page contient généralement un player JS avec l'URL vidéo encodée.
    try {
        const origin = url.match(/^https?:\/\/[^/]+/)?.[0] || 'https://lecteurvideo.com';
        const res = await safeFetch(url, { headers: { 'Referer': origin + '/', 'Origin': origin } });
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('p,a,c,k,e,d') || html.includes('eval(function')) html = unpack(html);

        // Recherche dans l'ordre : file:, sources:, src:, puis URLs directes m3u8/mp4
        const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                      html.match(/src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/data-src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/['"]?url['"]?\s*[:=]\s*['"]([^"']+\/videos\/[^"']+\.[^"']+)['"]/i) ||
                      html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);

        if (match) {
            let videoUrl = match[1] || match[0];
            if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;
            if (!isKnownFakeDirectUrl(videoUrl)) {
                return { url: videoUrl, headers: { 'Referer': origin + '/' } };
            }
        }

        // Chercher un iframe vers un autre hébergeur (sibnet, sendvid, etc.)
        const iframeMatch = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
        if (iframeMatch) {
            const iframeSrc = iframeMatch[1];
            if (!iframeSrc.includes('lecteurvideo.com') && !iframeSrc.includes('youtube.com') && !iframeSrc.includes('googlevideo.com')) {
                return { url: iframeSrc, headers: { 'Referer': origin + '/' } };
            }
        }
    } catch (e) {}
    return { url };
}

export async function resolveDownParadise(url) {
    // down-paradise.com: Parked domain with multi-level anti-bot redirect chain
    // (parklogic -> ww1.down-paradise -> tratobid.com). Unresolvable without a browser.
    // Return same URL immediately — let the knownSlowHost check handle it fast.
    return { url };
}

export async function resolveUp4fun(url) {
    // up4fun.top is notoriously slow (60s+). Single lightweight fetch attempt, then bail.
    try {
        const res = await safeFetch(url, { headers: { 'Referer': 'https://up4fun.top/' } });
        if (!res) return null;
        const html = await res.text();
        // Look for direct video URLs or embedded iframes with video
        const videoMatch = html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                           html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (videoMatch) return { url: videoMatch[1], headers: { 'Referer': 'https://up4fun.top/' } };
    } catch (e) {}
    return null; // null = don't retry in generic fallback
}

// ─── Deformed Domain Correction ──────────────────────────────────────────────
// Certains sites (notamment VoirAnime) déforment délibérément les noms de
// domaine des hébergeurs vidéo dans les iframes retournés par leur player PHP,
// afin de contourner les bloqueurs de pub / adblock.
//
// Exemples observés :
//   streamtape.com  → stredamtape.com, streamtapde.com, streamtape.cdom
//   get_video       → get_viddeo
//
// Le principe de détection : pour chaque hôte connu, on vérifie si les
// caractères du nom de base (sans TLD) apparaissent dans le même ordre dans
// le domaine déformé (séquence croissante). Si le ratio de correspondance
// dépasse 75 % et que la longueur est proche, on considère que c'est une
// déformation et on remplace par le domaine correct.

const KNOWN_HOST_NAMES = [
    { name: 'streamtape', domain: 'streamtape.com' },
    { name: 'sibnet', domain: 'sibnet.ru' },
    { name: 'vidmoly', domain: 'vidmoly.biz' },
    { name: 'uqload', domain: 'uqload.co' },
    { name: 'voe', domain: 'voe.sx' },
    { name: 'dood', domain: 'dood.to' },
    { name: 'younetu', domain: 'younetu.org' },
    { name: 'netu', domain: 'netu.tv' },
    { name: 'vidoza', domain: 'vidoza.net' },
    { name: 'sendvid', domain: 'sendvid.com' },
    { name: 'myvi', domain: 'myvi.ru' },
    { name: 'moon', domain: 'filemoon.sx' },
    { name: 'luluvid', domain: 'luluvid.com' },
    { name: 'fsvid', domain: 'fsvid.lol' },
    { name: 'vidzy', domain: 'vidzy.live' },
    { name: 'lecteurvideo', domain: 'lecteurvideo.com' },
    { name: 'vidhsareup', domain: 'vidhsareup.fun' },
    { name: 'hgcloud', domain: 'hgcloud.xyz' },
    { name: 'up4fun', domain: 'up4fun.top' },
    { name: 'lulu', domain: 'luluvdo.com' },
];

/**
 * Corrige les domaines déformés dans une URL.
 * Détecte les déformations par séquence de caractères et patterns connus.
 *
 * @param {string} url - URL potentiellement déformée
 * @returns {string} URL corrigée (inchangée si aucune déformation détectée)
 */
function correctDeformedVideoUrl(url) {
    if (!url || typeof url !== 'string') return url;

    const urlMatch = url.match(/^https?:\/\/([^\/]+)(.*)/);
    if (!urlMatch) return url;

    const fullDeformedDomain = urlMatch[1].toLowerCase();

    // Extraire le nom d'hôte principal (ex: "stredamtape" depuis "cdn.stredamtape.com")
    // On prend l'avant-dernière partie du domaine séparé par points
    const domainParts = fullDeformedDomain.split('.');
    const deformedBase = domainParts.length >= 2
        ? domainParts[domainParts.length - 2]
        : domainParts[0];

    // Vérifier si le domaine est déjà un sous-domaine valide d'un hôte connu
    // Ex: "cdn.streamtape.com" → ne PAS corriger le domaine (préserver le sous-domaine)
    const isKnownSubdomain = KNOWN_HOST_NAMES.some(h =>
        fullDeformedDomain.endsWith('.' + h.domain)
    );

    let correctedUrl = url;
    let domainCorrected = isKnownSubdomain; // skip domain correction if already valid subdomain

    // 1. Vérifier si le nom de base (sans TLD) est déjà présent en substring
    // Ex: "streamtape.cdom" → deformedBase="streamtape", qui contient "streamtape"
    if (!domainCorrected) {
        for (const host of KNOWN_HOST_NAMES) {
            if (deformedBase.includes(host.name)) {
                const lenDiff = Math.abs(deformedBase.length - host.name.length);
                if (lenDiff <= 4) {
                    console.log(`[Resolver] Domain corrected (direct): ${fullDeformedDomain} → ${host.domain}`);
                    correctedUrl = correctedUrl.replace(fullDeformedDomain, host.domain);
                    domainCorrected = true;
                    break;
                }
            }
        }
    }

    // 2. Vérifier par séquence de caractères (match fuzzy)
    // Parcourt chaque caractère du nom connu dans l'ordre, et le cherche
    // dans le domaine déformé en avançant. Permet de détecter les
    // insertions/substitutions comme stredamtape → streamtape.
    if (!domainCorrected) {
        for (const host of KNOWN_HOST_NAMES) {
            const knownBase = host.name;
            if (knownBase.length < 5) continue;

            let matches = 0;
            let j = 0;
            for (let i = 0; i < knownBase.length; i++) {
                const target = knownBase[i];
                while (j < deformedBase.length && deformedBase[j] !== target) {
                    j++;
                }
                if (j < deformedBase.length) {
                    matches++;
                    j++;
                } else {
                    break;
                }
            }

            const ratio = matches / knownBase.length;
            if (ratio >= 0.75) {
                const lenDiff = Math.abs(deformedBase.length - knownBase.length);
                if (lenDiff <= 4) {
                    console.log(`[Resolver] Domain corrected (fuzzy ${Math.round(ratio * 100)}%): ${fullDeformedDomain} → ${host.domain}`);
                    correctedUrl = correctedUrl.replace(fullDeformedDomain, host.domain);
                    domainCorrected = true;
                    break;
                }
            }
        }
    }

    // 3. TOUJOURS corriger les patterns de chemin connus (ex: get_viddeo → get_video)
    // Indépendamment de la correction domaine, car même avec le bon domaine,
    // le chemin peut être déformé (ex: /gdet_video/, /get_viddeo/).
    const PATH_CORRECTIONS = [
        [/get_viddeo/gi, 'get_video'],
        [/get_videeo/gi, 'get_video'],
        [/getv_video/gi, 'get_video'],
        [/gdet_video/gi, 'get_video'],
        [/gett_video/gi, 'get_video'],
        [/get_vvdo/gi, 'get_video'],
        [/get_vide0/gi, 'get_video'],
    ];

    const beforePath = correctedUrl;
    for (const [pattern, replacement] of PATH_CORRECTIONS) {
        correctedUrl = correctedUrl.replace(pattern, replacement);
    }

    if (domainCorrected) {
        console.log(`[Resolver] Result: ${url.slice(0, 80)} → ${correctedUrl.slice(0, 80)}`);
    } else if (correctedUrl !== url) {
        console.log(`[Resolver] Path corrected: ${url.slice(0, 60)}`);
    }

    return correctedUrl;
}

// ─── resolveStream optimizations ────────────────────────────────────────────

/**
 * Cache partagé entre tous les appels resolveStream d'une même exécution.
 * Évite de re-peeler le même iframe 10× quand 10 streams pointent vers la même URL.
 */
const peeledUrls = new Set();

/**
 * Domaines d'iframe connus pour être des pubs/analytics/trackers.
 * On les ignore lors de la sélection de l'iframe à peeler.
 */
const AD_IFRAME_PATTERNS = [
    'googleads', 'doubleclick', 'googlesyndication', 'googletagmanager',
    'facebook.com/plugins', 'twitter.com/share',
    'disqus.com', 'hotjar.com',
    'analytics', 'tracking', 'pixel', 'gtag',
    'adservice', 'adserver', 'ad.doubleclick',
    'amazon-adsystem', 'criteo', 'taboola', 'outbrain',
];

/**
 * Score de priorité pour les iframes vidéo.
 * Plus le score est élevé, plus l'iframe a de chances d'être un lecteur vidéo.
 */
const VIDEO_IFRAME_SCORE = {
    'sibnet': 3, 'vidmoly': 3, 'uqload': 3,
    'voe': 3, 'dood': 3, 'streamtape': 3,
    'sendvid': 2, 'younetu': 2, 'netu': 2,
    'moonplayer': 2, 'filemoon': 2, 'vidoza': 2,
    'myvi': 2, 'luluvid': 2, 'lulu': 2,
    'embed': 2, 'player': 2, 'video': 2,
    'cdn': 1, 'hls': 3, 'mp4': 3, 'm3u8': 3,
};

/**
 * Extrait et sélectionne le meilleur iframe vidéo du HTML.
 * - Ignore les iframes de pub/analytics
 * - Priorise les iframes vers des hébergeurs vidéo connus
 * - Évite de re-peeler des URLs déjà visitées
 *
 * @param {string} html - Contenu HTML de la page
 * @param {string} pageUrl - URL de la page (pour résoudre les URLs relatives)
 * @returns {string|null} URL du meilleur iframe, ou null si aucun trouvé
 */
function findBestVideoIframe(html, pageUrl) {
    const iframeRegex = /<iframe\s+[^>]*src=["']([^"']+)["']/gi;
    const candidates = [];
    let match;

    while ((match = iframeRegex.exec(html)) !== null) {
        let iframeUrl = match[1];

        // Résoudre les URLs relatives
        if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
        if (iframeUrl.startsWith('/')) {
            const origin = pageUrl.match(/^https?:\/\/[^\/]+/)?.[0];
            if (origin) iframeUrl = origin + iframeUrl;
        }

        if (!iframeUrl.startsWith('http')) continue;
        if (iframeUrl === pageUrl) continue;

        const lower = iframeUrl.toLowerCase();

        // Ignorer les iframes de pub/analytics
        const isAd = AD_IFRAME_PATTERNS.some(p => lower.includes(p));
        if (isAd) continue;

        // Calculer le score vidéo
        let score = 0;
        for (const [keyword, pts] of Object.entries(VIDEO_IFRAME_SCORE)) {
            if (lower.includes(keyword)) score += pts;
        }

        candidates.push({ url: iframeUrl, score });
    }

    if (candidates.length === 0) return null;

    // Trier par score décroissant, prendre le meilleur
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].url;
}

export async function resolveStream(stream, depth = 0) {
    if (depth > 1) return { ...stream, isDirect: false }; // Max 1 recursive peel for TV timeouts
    if (depth === 0) peeledUrls.clear(); // Fresh cache per top-level call

    // Corriger les domaines déformés AVANT le routage vers les résolveurs
    // Certains sites (VoirAnime, French-Manga) déforment les noms de domaine
    // pour contourner les bloqueurs. Voir correctDeformedVideoUrl() ci-dessus.
    // On remplace stream.url par la version corrigée pour que tout le routage
    // utilise le bon domaine.
    stream.url = correctDeformedVideoUrl(stream.url);
    const originalUrl = stream.url;
    const urlLower = originalUrl.toLowerCase();
    
    // 0. Skip known ad domains or empty URLs
    if (!originalUrl || originalUrl.includes('google-analytics') || originalUrl.includes('doubleclick')) return null;

    // 1. Check if it's already a direct video link
    if (isPlayableMediaUrl(originalUrl)) {
        return { ...stream, isDirect: true };
    }

    try {
        let result = null;

        // 2. Specific Host Resolvers
        if (urlLower.includes('sibnet.ru')) result = await resolveSibnet(originalUrl);
        else if (urlLower.includes('vidmoly.')) result = await resolveVidmoly(originalUrl);
        else if (urlLower.includes('uqload.') || urlLower.includes('oneupload.')) result = await resolveUqload(originalUrl);
        else if (urlLower.includes('voe') || urlLower.includes('weneverbeenfree') || urlLower.includes('maryspecialwatch') || urlLower.includes('charlestoughrace') || urlLower.includes('sandratableother')) result = await resolveVoe(originalUrl);
        else if (urlLower.includes('streamtape.com') || urlLower.includes('stape')) result = await resolveStreamtape(originalUrl);
        else if (urlLower.includes('dood') || urlLower.includes('ds2play') || urlLower.includes('bigwar5')) result = await resolveDood(originalUrl);
        else if (urlLower.includes('moonplayer') || urlLower.includes('filemoon')) result = await resolveMoon(originalUrl);
        else if (urlLower.includes('younetu.') || urlLower.includes('netu.')) result = await resolveYounetu(originalUrl);
        else if (urlLower.includes('vidoza.')) result = await resolveVidoza(originalUrl);
        else if (urlLower.includes('sendvid.') || urlLower.includes('daisukianime')) result = await resolveSendvid(originalUrl);
        else if (urlLower.includes('myvi.') || urlLower.includes('mytv.')) result = await resolveMyTV(originalUrl);
        else if (urlLower.includes('fsvid.lol') || urlLower.includes('vidzy.live') || urlLower.includes('vidstream.pro') || urlLower.includes('vidcdn.') || urlLower.includes('kakaflix.') || urlLower.includes('vidhsareup.')) result = await resolvePackedPlayer(originalUrl);
        else if (
            urlLower.includes('luluvid.') ||
            urlLower.includes('lulustream.') ||
            urlLower.includes('luluvdo.') ||
            urlLower.includes('wishonly.') ||
            urlLower.includes('veev.')
        ) result = await resolvePackedPlayer(originalUrl);
        else if (urlLower.includes('lulu.')) result = await resolveLuluvid(originalUrl);
        else if (urlLower.includes('lecteurvideo.')) result = await resolveLecteurVideo(originalUrl);
        else if (urlLower.includes('hgcloud.') || urlLower.includes('savefiles.')) result = await resolveHGCloud(originalUrl);
        else if (urlLower.includes('down-paradise.') || urlLower.includes('ww1.down-paradise.')) result = await resolveDownParadise(originalUrl);
        else if (urlLower.includes('up4fun.')) result = await resolveUp4fun(originalUrl);
        
        // If a specific resolver found a different URL, it's the final direct link
        if (result && result.url !== originalUrl && !isKnownFakeDirectUrl(result.url)) {
            // Appliquer aussi la correction de domaine à l'URL de sortie du résolveur
            // Car même avec le bon domaine d'entrée, la page peut servir la vidéo
            // depuis un domaine déformé (ex: streamtape.com → streamtape.dcom)
            const finalUrl = correctDeformedVideoUrl(result.url);
            if (finalUrl !== result.url) {
                console.log(`[Resolver] Resolver output corrected: ${result.url.slice(0, 60)} → ${finalUrl.slice(0, 60)}`);
            }
            return {
                ...stream,
                url: finalUrl,
                headers: { ...stream.headers, ...(result.headers || {}) },
                isDirect: true,
                originalUrl: originalUrl
            };
        }

        // 3. Generic Fallback & Recursive Peeling
        // Skip generic fallback for known slow or dead hosts (already tried in specific resolver)
        const knownSlowHost = urlLower.includes('up4fun.') || urlLower.includes('down-paradise.') || urlLower.includes('getvid.club') || urlLower.includes('vidhsareup.');
        if (!result || result.url === originalUrl) {
            if (knownSlowHost) {
                return { ...stream, isDirect: false };
            }

            // Si un résolveur spécifique a déjà traité cette URL (depth 0) et a échoué,
            // on saute la recherche de direct URL (déjà faite par le résolveur) et on va
            // directement à la détection d'iframe. Évite un safeFetch + unpack + 6 regex.
            const skipDirectScan = (result && result.url === originalUrl && depth === 0);

            const res = await safeFetch(originalUrl, { headers: stream.headers });
            if (res) {
                let html = await res.text();
                if (html.includes('p,a,c,k,e,d')) html = unpack(html);

                // Suivre les redirections JS window.location
                if (!skipDirectScan) {
                    const jsRedirect = html.match(/window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/);
                    if (jsRedirect && jsRedirect[1] !== originalUrl) {
                        const res2 = await safeFetch(jsRedirect[1], { headers: stream.headers });
                        if (res2) {
                            html = await res2.text();
                            if (html.includes('p,a,c,k,e,d')) html = unpack(html);
                        }
                    }
                }

                // ÉTAPE 1: Toujours essayer le peeling d'iframe en premier (plus fiable)
                // Les iframes vidéo sont plus fiables que les regex qui peuvent matcher
                // des URLs dans des pubs, analytics, ou JSON configs non-liés à la vidéo.
                // On ne revient du peeling que si l'iframe a été résolu ou qu'on a depth > 1.
                // Dans ce dernier cas, on continue vers les regex strictes qui peuvent
                // parfois extraire l'URL directe manquée par le peeling.
                const iframeUrl = findBestVideoIframe(html, originalUrl);

                if (iframeUrl && !peeledUrls.has(iframeUrl)) {
                    peeledUrls.add(iframeUrl);
                    console.log(`[Resolver] Peeling: Found nested iframe -> ${iframeUrl}`);
                    const peeledResult = await resolveStream({ ...stream, url: iframeUrl }, depth + 1);
                    // Si le peeling a réussi (isDirect: true) ou si on a depth=1,
                    // on retourne le résultat. Si depth>1 et isDirect: false, on continue
                    // vers les regex comme fallback.
                    if (peeledResult && peeledResult.isDirect) return peeledResult;
                    if (depth > 0) return peeledResult;
                    // depth=0 et peeling a échoué → continuer vers les regex
                }

                // ÉTAPE 2: Patterns stricts avec contexte vidéo (file:, sources:, hls:)
                // Ces patterns ne matchent que quand l'URL est dans un contexte vidéo,
                // pas de faux positifs avec pubs/analytics.
                if (!skipDirectScan) {
                    const strictUrl = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                                     html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                                     html.match(/'hls'\s*:\s*'([^']+)'/) ||
                                     html.match(/"hls"\s*:\s*"([^"]+)"/);

                    if (strictUrl) {
                        let extractedUrl = strictUrl[1] || strictUrl[0];
                        if (extractedUrl.startsWith('//')) extractedUrl = "https:" + extractedUrl;

                        const isInvalidExtension = extractedUrl.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);

                        if (extractedUrl.startsWith('http') && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN) && !isInvalidExtension && !isKnownFakeDirectUrl(extractedUrl)) {
                            result = { url: extractedUrl };
                        }
                    }
                }

                // ÉTAPE 3: Dernier recours — regex larges .m3u8/.mp4
                // Uniquement si les étapes 1 et 2 n'ont rien trouvé.
                // Ces patterns sont dangereux car ils matchent N'IMPORTE QUELLE URL
                // contenant .m3u8 ou .mp4, y compris dans les pubs/analytics.
                if (!result && !skipDirectScan) {
                    const looseUrl = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) ||
                                    html.match(/https?:\/\/[^"']+\.mp4[^"']*/);

                    if (looseUrl) {
                        let extractedUrl = looseUrl[0];
                        if (extractedUrl.startsWith('//')) extractedUrl = "https:" + extractedUrl;

                        const isInvalidExtension = extractedUrl.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);

                        if (extractedUrl.startsWith('http') && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN) && !isInvalidExtension && !isKnownFakeDirectUrl(extractedUrl)) {
                            console.log(`[Resolver] Loose URL match (last resort): ${extractedUrl.slice(0, 80)}`);
                            result = { url: extractedUrl };
                        }
                    }
                }
            }
        }

        if (result && result.url !== originalUrl && result.url.startsWith('http') && !isKnownFakeDirectUrl(result.url)) {
            // Appliquer aussi la correction de domaine à l'URL de sortie du fallback
            const finalUrl = correctDeformedVideoUrl(result.url);
            if (finalUrl !== result.url) {
                console.log(`[Resolver] Generic fallback output corrected: ${result.url.slice(0, 60)} → ${finalUrl.slice(0, 60)}`);
            }
            return {
                ...stream,
                url: finalUrl,
                headers: { ...stream.headers, ...(result.headers || {}) },
                isDirect: true,
                originalUrl: originalUrl
            };
        }
    } catch (err) {}
    
    return { ...stream, isDirect: false };
}

const BASE_URL_FORBIDDEN_PATTERN = "googletagmanager";
