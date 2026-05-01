/**
 * Video Link Resolvers for common hosts
 * Highly optimized for Nuvio (Hermes/React Native)
 */

const _global = (typeof globalThis !== 'undefined') ? globalThis : 
               (typeof global !== 'undefined') ? global : 
               (typeof self !== 'undefined') ? self : {};

if (typeof Promise !== 'undefined' && !Promise.allSettled) {
    Promise.allSettled = function(promises) {
        return Promise.all(promises.map(p => Promise.resolve(p).then(
            value => ({ status: 'fulfilled', value }),
            reason => ({ status: 'rejected', reason })
        )));
    };
}

export const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS = {
    "User-Agent": USER_AGENT,
};

const _atob = (str) => {
    try {
        if (typeof atob === 'function') return atob(str);
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let output = '';
        let index = 0;

        str = String(str || '').replace(/[^A-Za-z0-9+/=]/g, '');
        while (index < str.length) {
            const enc1 = alphabet.indexOf(str.charAt(index++));
            const enc2 = alphabet.indexOf(str.charAt(index++));
            const enc3 = alphabet.indexOf(str.charAt(index++));
            const enc4 = alphabet.indexOf(str.charAt(index++));

            const chr1 = (enc1 << 2) | (enc2 >> 4);
            const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            const chr3 = ((enc3 & 3) << 6) | enc4;

            output += String.fromCharCode(chr1);
            if (enc3 !== 64) output += String.fromCharCode(chr2);
            if (enc4 !== 64) output += String.fromCharCode(chr3);
        }

        return output;
    } catch (e) { return str; }
};

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

function qualityRank(value) {
    const q = normalizeQualityLabel(value).toLowerCase();
    const match = q.match(/(\d{3,4})p/);
    const height = match ? Number(match[1]) : DEFAULT_QUALITY_TIER;
    const tier = nearestQualityTier(height);
    return STRICT_QUALITY_TIERS.length - 1 - STRICT_QUALITY_TIERS.indexOf(tier);
}

function appendQualityToTitle(title, quality) {
    const q = normalizeQualityLabel(quality);
    if (!q) return title;
    if ((title || '').includes(q)) return title;
    return `${title} [${q}]`;
}

function getSafeOrigin(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/^(https?:\/\/[^\/]+)/);
    return match ? match[1] : null;
}

function hostFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
        const host = url.match(/^https?:\/\/([^\/]+)/i)?.[1] || '';
        return host.toLowerCase();
    } catch (e) {
        return '';
    }
}

function shouldPreserveEmbedReferer(finalUrl, originalUrl) {
    const host = `${hostFromUrl(finalUrl)} ${hostFromUrl(originalUrl)}`;
    return /vidmoly|uqload|oneupload|dood|voe|streamtape|filemoon|moonplayer|sendvid|myvi|mytv|lulu|lulustream|luluvdo|wishonly|veev|fsvid|vidzy/.test(host);
}

function mergeFinalHeaders(streamHeaders, resolverHeaders, finalUrl, originalUrl) {
    const videoOrigin = getSafeOrigin(finalUrl);
    const mergedHeaders = { 'User-Agent': USER_AGENT, ...streamHeaders, ...(resolverHeaders || {}) };
    const keepEmbedReferer = shouldPreserveEmbedReferer(finalUrl, originalUrl);
    const existingReferer = mergedHeaders.Referer || mergedHeaders.referer || '';
    const refererOrigin = getSafeOrigin(existingReferer);

    if (keepEmbedReferer) {
        if (existingReferer && refererOrigin) {
            mergedHeaders.Referer = existingReferer;
            mergedHeaders.Origin = refererOrigin;
        } else if (videoOrigin) {
            mergedHeaders.Referer = `${videoOrigin}/`;
            mergedHeaders.Origin = videoOrigin;
        }
    } else if (mergedHeaders.Origin || mergedHeaders.origin) {
        mergedHeaders.Origin = videoOrigin;
        mergedHeaders.Referer = videoOrigin ? `${videoOrigin}/` : mergedHeaders.Referer;
    }

    if (mergedHeaders.origin) delete mergedHeaders.origin;
    if (mergedHeaders.referer) delete mergedHeaders.referer;
    return mergedHeaders;
}

async function expandSingleStreamQualities(stream) {
    if (!stream || !stream.url || typeof stream.url !== 'string') return [];
    const url = stream.url;
    const lower = url.toLowerCase();

    if (!lower.includes('.m3u8') && !lower.includes('/hls/')) {
        return [{ ...stream, quality: normalizeQualityLabel(stream.quality || 'HD') }];
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

        let quality = resolution ? `${resolution}p` : null;
        if (!quality && bandwidth) {
            const bw = Number(bandwidth);
            if (bw >= 8000000) quality = '2160p';
            else if (bw >= 4000000) quality = '1080p';
            else if (bw >= 2000000) quality = '720p';
            else if (bw >= 1000000) quality = '480p';
            else quality = '360p';
        }
        if (!quality && frameRate) quality = `${normalizeQualityLabel(stream.quality || 'HD')}`;

        let variantUrl = nextLine;
        try {
            if (nextLine.startsWith('http')) {
                variantUrl = nextLine;
            } else if (nextLine.startsWith('//')) {
                variantUrl = (url.startsWith('https') ? 'https:' : 'http:') + nextLine;
            } else {
                const origin = url.match(/^https?:\/\/[^\/]+/)?.[0] || '';
                if (nextLine.startsWith('/')) {
                    variantUrl = origin + nextLine;
                } else {
                    const base = url.substring(0, url.lastIndexOf('/') + 1);
                    variantUrl = base + nextLine;
                }
            }
        } catch (e) {}

        variants.push({
            ...stream,
            url: variantUrl,
            quality: normalizeQualityLabel(quality || stream.quality || 'HD'),
            isDirect: true,
            headers: { 'User-Agent': USER_AGENT, ...(stream.headers || {}) },
            title: appendQualityToTitle(stream.title || stream.name || 'Stream', quality || stream.quality || 'HD')
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
    return unique;
}

export async function expandStreamQualities(streams) {
    const input = Array.isArray(streams) ? streams : [];
    const expanded = [];

    for (const stream of input) {
        try {
            const variants = await expandSingleStreamQualities(stream);
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

    deduped.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
    return deduped;
}

export async function safeFetch(url, options = {}) {
    const { __debug, timeoutMs, ...fetchOptions } = options || {};
    const debug = Boolean(__debug);
    const timeoutDuration = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
        ? Number(timeoutMs)
        : 10000;
    let controller, timeout;
    try {
        const canAbort = typeof AbortController !== 'undefined';
        controller = canAbort ? new AbortController() : null;

        const requestOptions = {
            ...fetchOptions,
            headers: { ...HEADERS, ...(fetchOptions.headers || {}) },
            redirect: 'follow',
            signal: controller ? controller.signal : undefined
        };

        const fetchPromise = fetch(url, requestOptions);
        let response;

        if (controller) {
            timeout = setTimeout(() => controller.abort(), timeoutDuration);
            response = await fetchPromise;
        } else {
            response = await Promise.race([
                fetchPromise,
                new Promise((_, reject) => {
                    timeout = setTimeout(() => reject(new Error('timeout')), timeoutDuration);
                })
            ]);
        }

        if (timeout) clearTimeout(timeout);
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
        if (timeout) clearTimeout(timeout);
        if (debug) {
            const message = e && e.message ? e.message : String(e);
            console.warn(`[safeFetch] ${url} failed: ${message}`);
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
        // Vidmoly.net often has Cloudflare Turnstile, use vidmoly.me instead
        const fetchUrl = url.replace(/vidmoly\.(net|to|ru|is)/, 'vidmoly.me');
        const headers = { 'Referer': 'https://vidmoly.me/', 'Origin': 'https://vidmoly.me' };
        let res = await safeFetch(fetchUrl, { headers });
        if (!res) return { url };
        let html = await res.text();
        // Follow JS window.location.replace() anti-bot redirect
        const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) ||
                           html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (jsRedirect && jsRedirect[1] !== fetchUrl) {
            res = await safeFetch(jsRedirect[1], { headers });
            if (res) html = await res.text();
        }
        if (html.includes('eval(function(p,a,c,k,e,d)')) html = unpack(html);
        const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (match) return { url: match[1], headers: { "Referer": "https://vidmoly.me/" } };
    } catch (e) {}
    return { url };
}

export async function resolveUqload(url) {
    const normalizedPath = url.replace(/^https?:\/\/[^/]+/, '');
    const originalDomain = url.match(/^https?:\/\/([^/]+)/)?.[1] || 'uqload.co';
    const uniqueDomains = [...new Set([originalDomain, 'uqload.co', 'oneupload.to'])];
    const baseRef = 'https://uqload.co/';
    
    // Check domains concurrently to avoid long serial timeouts
    return new Promise((resolve) => {
        let failures = 0;
        let resolved = false;

        const checkDomain = async (domain) => {
            try {
                const tryUrl = `https://${domain}${normalizedPath}`;
                const canAbort = typeof AbortController !== 'undefined';
                const controller = canAbort ? new AbortController() : null;
                const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null; // Fast fail 4s
                
                const res = await safeFetch(tryUrl, { headers: { ...HEADERS, 'Referer': baseRef } });
                if (res) {
                    const html = await res.text();
                    const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) ||
                                  html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/);
                    if (match && !resolved) {
                        resolved = true;
                        resolve({ url: match[1], headers: { "Referer": baseRef } });
                        return;
                    }
                }
            } catch (e) {}
            
            failures++;
            if (failures === uniqueDomains.length && !resolved) {
                resolve({ url }); // All failed
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
        const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (redirect) {
            const res2 = await safeFetch(redirect[1]);
            if (res2) html = await res2.text();
        }
        const match = html.match(/'hls'\s*:\s*'([^']+)'/) || 
                      html.match(/"hls"\s*:\s*"([^"]+)"/) ||
                      html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
        if (match) {
            let videoUrl = match[1] || match[0];
            if (videoUrl.includes('base64')) videoUrl = _atob(videoUrl.split(',')[1] || videoUrl);
            if (isKnownFakeDirectUrl(videoUrl)) return { url };
            return { url: videoUrl, headers: { "Referer": url } };
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
        else if (urlLower.includes('voe') || urlLower.includes('charlestoughrace') || urlLower.includes('sandratableother')) result = await resolveVoe(originalUrl);
        else if (urlLower.includes('streamtape.com') || urlLower.includes('stape')) result = await resolveStreamtape(originalUrl);
        else if (urlLower.includes('dood') || urlLower.includes('ds2play') || urlLower.includes('bigwar5')) result = await resolveDood(originalUrl);
        else if (urlLower.includes('moonplayer') || urlLower.includes('filemoon')) result = await resolveMoon(originalUrl);
        else if (urlLower.includes('sendvid.')) result = await resolveSendvid(originalUrl);
        else if (urlLower.includes('myvi.') || urlLower.includes('mytv.')) result = await resolveMyTV(originalUrl);
        else if (urlLower.includes('fsvid.lol') || urlLower.includes('vidzy.live')) result = await resolvePackedPlayer(originalUrl);
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
            const mergedHeaders = mergeFinalHeaders(stream.headers, result.headers, result.url, originalUrl);

            return {
                ...stream,
                url: result.url,
                headers: mergedHeaders,
                isDirect: true,
                originalUrl: originalUrl
            };
        }

        // 3. Generic Fallback & Recursive Peeling
        if (!result || result.url === originalUrl) {
            const res = await safeFetch(originalUrl, { headers: stream.headers });
            if (res) {
                let html = await res.text();
                // Check for P.A.C.K.E.R encoding
                if (html.includes('p,a,c,k,e,d')) html = unpack(html);

                // Look for direct media links in HTML
                const m3u8 = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) || 
                             html.match(/https?:\/\/[^"']+\.mp4[^"']*/) ||
                             html.match(/file\s*:\s*["']([^"']+)["']/);

                if (m3u8) {
                    let extractedUrl = m3u8[1] || m3u8[0];
                    if (extractedUrl.startsWith('//')) extractedUrl = "https:" + extractedUrl;
                    
                    // Filter out non-video extensions that might be caught by the generic 'file:' regex
                    const isInvalidExtension = extractedUrl.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);
                    
                    if (extractedUrl.startsWith('http') && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN) && !isInvalidExtension && !isKnownFakeDirectUrl(extractedUrl)) {
                        result = { url: extractedUrl };
                    }
                }

                // Look for nested iframes (Peeling)
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
            const mergedHeaders = mergeFinalHeaders(stream.headers, result.headers, result.url, originalUrl);

            return {
                ...stream,
                url: result.url,
                headers: mergedHeaders,
                isDirect: true,
                originalUrl: originalUrl
            };
        }
    } catch (err) {}
    
    return { ...stream, isDirect: false };
}

const BASE_URL_FORBIDDEN_PATTERN = "googletagmanager";
