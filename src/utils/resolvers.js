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
        
        const packedRegex = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\).*?\}\s*\((.*?)\)\s*\)/gs;
        let result = code;
        let match;
        
        while ((match = packedRegex.exec(code)) !== null) {
            try {
                const argsStr = match[1];
                const pMatch = argsStr.match(/^'(.*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)/s);
                if (!pMatch) continue;
                
                let p = pMatch[1].replace(/\\'/g, "'");
                let a = parseInt(pMatch[2]);
                let c = parseInt(pMatch[3]);
                let k = pMatch[4].split('|');
                
                const e = (c) => (c < a ? "" : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
                const dict = {};
                while (c--) dict[e(c)] = k[c] || e(c);
                
                const unpacked = p.replace(/\b\w+\b/g, (w) => dict[w] || w);
                result = result.replace(match[0], unpacked);
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
        const headers = { 'Referer': 'https://vidmoly.to/', 'Origin': 'https://vidmoly.to' };
        let res = await safeFetch(url, { headers });
        if (!res) return { url };
        let html = await res.text();
        // Follow JS window.location.replace() anti-bot redirect
        const jsRedirect = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) ||
                           html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (jsRedirect && jsRedirect[1] !== url) {
            res = await safeFetch(jsRedirect[1], { headers });
            if (res) html = await res.text();
        }
        if (html.includes('eval(function(p,a,c,k,e,d)')) html = unpack(html);
        const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                      html.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (match) return { url: match[1], headers: { "Referer": "https://vidmoly.to/" } };
    } catch (e) {}
    return { url };
}

export async function resolveUqload(url) {
    // Normalize URL to try all known active domains
    const normalizedPath = url.replace(/^https?:\/\/[^/]+/, '');
    const domains = ['uqload.co', 'uqload.com', 'uqload.io', 'uqloads.xyz', 'uqload.to'];
    const baseRef = 'https://uqload.co/';
    for (const domain of domains) {
        try {
            const tryUrl = `https://${domain}${normalizedPath}`;
            const res = await safeFetch(tryUrl, { headers: { 'Referer': baseRef } });
            if (!res) continue;
            const html = await res.text();
            const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) ||
                          html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/) ||
                          html.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
            if (match) return { url: match[1], headers: { "Referer": baseRef } };
        } catch (e) {}
    }
    return { url };
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
        const html = await res.text();
        const match = html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
        if (match) return { url: match[1], headers: { "Referer": url } };
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
    if (urlLower.match(/\.(mp4|m3u8|mkv|webm)(\?.*)?$/) && !urlLower.includes('html')) {
        return { ...stream, isDirect: true };
    }

    try {
        let result = null;

        // 2. Specific Host Resolvers
        if (urlLower.includes('sibnet.ru')) result = await resolveSibnet(originalUrl);
        else if (urlLower.includes('vidmoly.')) result = await resolveVidmoly(originalUrl);
        else if (urlLower.includes('uqload.') || urlLower.includes('oneupload.')) result = await resolveUqload(originalUrl);
        else if (urlLower.includes('voe.')) result = await resolveVoe(originalUrl);
        else if (urlLower.includes('streamtape.com') || urlLower.includes('stape')) result = await resolveStreamtape(originalUrl);
        else if (urlLower.includes('dood') || urlLower.includes('ds2play')) result = await resolveDood(originalUrl);
        else if (urlLower.includes('moonplayer') || urlLower.includes('moon.')) result = await resolveMoon(originalUrl);
        else if (urlLower.includes('sendvid.')) result = await resolveSendvid(originalUrl);
        else if (urlLower.includes('myvi.') || urlLower.includes('mytv.')) result = await resolveMyTV(originalUrl);
        else if (urlLower.includes('luluvid.') || urlLower.includes('lulu.')) result = await resolveLuluvid(originalUrl);
        else if (urlLower.includes('hgcloud.') || urlLower.includes('savefiles.')) result = await resolveHGCloud(originalUrl);
        
        // If a specific resolver found a different URL, it's the final direct link
        if (result && result.url !== originalUrl) {
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
                    if (extractedUrl.startsWith('http') && !extractedUrl.includes(BASE_URL_FORBIDDEN_PATTERN)) {
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

        if (result && result.url !== originalUrl && result.url.startsWith('http')) {
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
