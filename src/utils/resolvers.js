/**
 * Video Link Resolvers for common hosts
 * Highly optimized for Nuvio (Hermes/React Native)
 */

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
};

const _atob = (str) => {
    try {
        if (typeof atob === 'function') return atob(str);
        return Buffer.from(str, 'base64').toString('binary');
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

async function safeFetch(url, options = {}) {
    let controller, timeout;
    try {
        controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, {
            ...options,
            headers: { ...HEADERS, ...options.headers },
            redirect: 'follow',
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) return null;
        const html = await response.text();
        return { 
            text: () => Promise.resolve(html), 
            ok: true, 
            url: response.url,
            headers: response.headers
        };
    } catch (e) { 
        if (timeout) clearTimeout(timeout);
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
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000); // Fast fail 4s
                
                const res = await fetch(tryUrl, {
                    headers: { ...HEADERS, 'Referer': baseRef },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (res && res.ok) {
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
            const passRes = await fetch(passUrl, { headers: { "Referer": url } });
            if (passRes.ok) {
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
