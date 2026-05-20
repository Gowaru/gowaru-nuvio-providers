/**
 * Video Link Resolvers for common hosts
 * Highly optimized for Nuvio (Hermes/React Native)
 */

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
const DEFAULT_QUALITY_TIER = 360;

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

async function expandSingleStreamQualities(stream, options = {}) {
    if (!stream || !stream.url || typeof stream.url !== 'string') return [];
    const url = stream.url;
    const lower = url.toLowerCase();

    if (!lower.includes('.m3u8') && !lower.includes('/hls/')) {
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD') }];
    }

    const cacheKey = url;
    if (!options.forceRefresh) {
        const cached = getCachedManifest(cacheKey);
        if (cached) return cached;
    }

    const res = await safeFetch(url, { headers: stream.headers || {} });
    if (!res) {
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD') }];
    }

    const manifest = await res.text();
    if (!/#EXT-X-STREAM-INF/i.test(manifest)) {
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD') }];
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
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD') }];
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

    for (const stream of input) {
        try {
            const variants = await expandSingleStreamQualities(stream, options);
            for (const variant of variants) {
                expanded.push(variant);
            }
        } catch (e) {
            if (stream) expanded.push({ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD') });
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

    const sorted = sortStreams(deduped);

    if (options.preferredCodec) {
        return filterByPreferredCodec(sorted, options.preferredCodec);
    }

    return sorted;
}

export async function safeFetch(url, options = {}) {
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
        if (!response) return null;

        const status = response.status;
        let bodyText = '';
        try {
            bodyText = await response.text();
        } catch (e) {
            bodyText = '';
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
        const domains = [
            url.replace(/vidmoly\.(net|to|ru|is)/, 'vidmoly.me'),
            url.replace(/vidmoly\.(net|to|ru|is)/, 'vidmoly.biz'),
            url.replace(/vidmoly\.(net|to|ru|is)/, 'vidmoly.bz')
        ];
        const uniqueDomains = [...new Set(domains)];
        const headers = { 'Referer': 'https://vidmoly.me/', 'Origin': 'https://vidmoly.me' };

        for (const fetchUrl of uniqueDomains) {
            try {
                let res = await safeFetch(fetchUrl, { headers });
                if (!res) continue;
                let html = await res.text();
                if (html.includes('p,a,c,k,e,d') || html.includes('eval(function')) html = unpack(html);

                const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                              html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                              html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                if (match) return { url: match[1], headers: { "Referer": "https://vidmoly.me/" } };

                const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) ||
                                   html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
                if (jsRedirect && jsRedirect[1] !== fetchUrl) {
                    res = await safeFetch(jsRedirect[1], { headers });
                    if (res) {
                        html = await res.text();
                        if (html.includes('p,a,c,k,e,d') || html.includes('eval(function')) html = unpack(html);
                        const match2 = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                                       html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                                       html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
                        if (match2) return { url: match2[1], headers: { "Referer": "https://vidmoly.me/" } };
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
    const uniqueDomains = [...new Set([originalDomain, 'uqload.co', 'oneupload.to'])];
    const baseRef = `https://${originalDomain}/`;

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

export async function resolveStream(stream, depth = 0) {
    if (depth > 3) return { ...stream, isDirect: false }; // Prevent infinite loops

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
        else if (urlLower.includes('fsvid.lol') || urlLower.includes('vidzy.live') || urlLower.includes('vidstream.pro') || urlLower.includes('vidcdn.')) result = await resolvePackedPlayer(originalUrl);
        else if (
            urlLower.includes('luluvid.') ||
            urlLower.includes('lulustream.') ||
            urlLower.includes('luluvdo.') ||
            urlLower.includes('wishonly.') ||
            urlLower.includes('veev.')
        ) result = await resolvePackedPlayer(originalUrl);
        else if (urlLower.includes('lulu.')) result = await resolveLuluvid(originalUrl);
        else if (urlLower.includes('hgcloud.') || urlLower.includes('savefiles.')) result = await resolveHGCloud(originalUrl);
        
        // If a specific resolver found a different URL, it's the final direct link
        if (result && result.url !== originalUrl && !isKnownFakeDirectUrl(result.url)) {
            return {
                ...stream,
                url: result.url,
                headers: { ...stream.headers, ...(result.headers || {}) },
                isDirect: true,
                originalUrl: originalUrl
            };
        }

        // 3. Generic Fallback & Recursive Peeling
        if (!result || result.url === originalUrl) {
            const res = await safeFetch(originalUrl, { headers: stream.headers });
            if (res) {
                let html = await res.text();
                if (html.includes('p,a,c,k,e,d')) html = unpack(html);

                // Follow JS window.location redirects
                const jsRedirect = html.match(/window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/);
                if (jsRedirect && jsRedirect[1] !== originalUrl) {
                    const res2 = await safeFetch(jsRedirect[1], { headers: stream.headers });
                    if (res2) {
                        html = await res2.text();
                        if (html.includes('p,a,c,k,e,d')) html = unpack(html);
                    }
                }

                const directUrl = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) ||
                                 html.match(/https?:\/\/[^"']+\.mp4[^"']*/) ||
                                 html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                                 html.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
                                 html.match(/'hls'\s*:\s*'([^']+)'/) ||
                                 html.match(/"hls"\s*:\s*"([^"]+)"/);

                if (directUrl) {
                    let extractedUrl = directUrl[1] || directUrl[0];
                    if (extractedUrl.startsWith('//')) extractedUrl = "https:" + extractedUrl;
                    
                    const isInvalidExtension = extractedUrl.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);
                    
                    if (extractedUrl.startsWith('http') && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN) && !isInvalidExtension && !isKnownFakeDirectUrl(extractedUrl)) {
                        result = { url: extractedUrl };
                    }
                }

                if (!result) {
                    const iframeMatch = html.match(/<iframe\s+[^>]*src=["']([^"']+)["']/i);
                    if (iframeMatch) {
                        let iframeUrl = iframeMatch[1];
                        if (iframeUrl.startsWith('//')) iframeUrl = "https:" + iframeUrl;
                        if (iframeUrl.startsWith('/')) {
                            const origin = originalUrl.match(/^https?:\/\/[^\/]+/)?.[0];
                            if (origin) iframeUrl = origin + iframeUrl;
                        }
                        
                        if (iframeUrl.startsWith('http') && iframeUrl !== originalUrl) {
                            console.log(`[Resolver] Peeling: Found nested iframe -> ${iframeUrl}`);
                            return await resolveStream({ ...stream, url: iframeUrl }, depth + 1);
                        }
                    }
                }
            }
        }

        if (result && result.url !== originalUrl && result.url.startsWith('http') && !isKnownFakeDirectUrl(result.url)) {
            return {
                ...stream,
                url: result.url,
                headers: { ...stream.headers, ...(result.headers || {}) },
                isDirect: true,
                originalUrl: originalUrl
            };
        }
    } catch (err) {}
    
    return { ...stream, isDirect: false };
}

const BASE_URL_FORBIDDEN_PATTERN = "googletagmanager";
