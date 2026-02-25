/**
 * Video Link Resolvers for common hosts
 * Highly optimized for Nuvio (Hermes/React Native)
 */

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

/**
 * Fallback for atob if not available in environment
 */
const _atob = (str) => {
    try {
        if (typeof atob === 'function') return atob(str);
        return Buffer.from(str, 'base64').toString('binary');
    } catch (e) {
        return str;
    }
};

/**
 * Robust fetcher optimized for Hermes/React Native
 */
async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: { ...HEADERS, ...options.headers },
        });
        
        if (!response.ok) return null;
        const html = await response.text();
        
        // Basic Cookie extraction (Hermes compatible)
        const setCookie = response.headers.get('set-cookie') || "";
        
        return { 
            text: () => Promise.resolve(html), 
            ok: true, 
            url: response.url,
            headers: { 'set-cookie': setCookie }
        };
    } catch (e) {
        return null;
    }
}

/**
 * Universal P.A.C.K.E.R. Unpacker
 */
export function unpack(code) {
    try {
        if (!code.includes('p,a,c,k,e,d')) return code;
        const packed = code.match(/}\s*\((.*)\)\s*$/);
        if (!packed) return code;
        const args = packed[1].match(/(".+"|\d+)/g);
        if (args.length < 4) return code;
        let [p, a, c, k] = [
            args[0].replace(/^"|"$/g, ''),
            parseInt(args[1]),
            parseInt(args[2]),
            args[3].replace(/^"|"$/g, '').split('|')
        ];
        const e = (c) => (c < a ? "" : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
        const dict = {};
        while (c--) dict[e(c)] = k[c] || e(c);
        return p.replace(/\b\w+\b/g, (w) => dict[w] || w);
    } catch (err) { return code; }
}

/**
 * Sibnet resolver
 */
export async function resolveSibnet(url) {
    try {
        const res = await safeFetch(url, { headers: { 'Referer': 'https://video.sibnet.ru/' } });
        if (!res) return { url };
        const html = await res.text();
        const match = html.match(/src\s*:\s*["']([^"']+\.mp4)["']/) || html.match(/"url"\s*:\s*"([^"]+\.mp4)"/);
        if (match) {
            let videoUrl = match[1];
            if (videoUrl.startsWith('//')) videoUrl = "https:" + videoUrl;
            return { url: videoUrl, headers: { "Referer": "https://video.sibnet.ru/" } };
        }
    } catch (e) {}
    return { url };
}

/**
 * Vidmoly resolver
 */
export async function resolveVidmoly(url) {
    try {
        const res = await safeFetch(url, { headers: { 'Referer': 'https://vidmoly.to/' } });
        if (!res) return { url };
        let html = await res.text();
        if (html.includes('eval(function(p,a,c,k,e,d)')) html = unpack(html);
        const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/);
        if (match) return { url: match[1], headers: { "Referer": "https://vidmoly.to/" } };
    } catch (e) {}
    return { url };
}

/**
 * VOE resolver
 */
export async function resolveVoe(url) {
    try {
        const res = await safeFetch(url);
        if (!res) return { url };
        const html = await res.text();
        const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (redirect) return resolveVoe(redirect[1]);
        const match = html.match(/'hls'\s*:\s*'([^']+)'/) || html.match(/file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/);
        if (match) {
            let videoUrl = match[1];
            if (videoUrl.includes('base64')) videoUrl = _atob(videoUrl.split(',')[1] || videoUrl);
            return { url: videoUrl };
        }
    } catch (e) {}
    return { url };
}

/**
 * Streamtape resolver
 */
export async function resolveStreamtape(url) {
    try {
        const res = await safeFetch(url);
        if (!res) return { url };
        const html = await res.text();
        const match = html.match(/document\.getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:['"]([^'"]+)['"]|['"]([^'"]+)['"]\.substring\(\d+\))/);
        if (match) {
            const part1 = match[1];
            let part2 = match[2] || "";
            if (match[3]) {
                const sub = html.match(/substring\((\d+)\)/);
                part2 = match[3].substring(sub ? parseInt(sub[1]) : 0);
            }
            return { url: "https:" + part1 + part2 };
        }
    } catch (e) {}
    return { url };
}

/**
 * Doodstream resolver
 */
export async function resolveDood(url) {
    try {
        const domain = url.match(/https?:\/\/([^\/]+)/)?.[1];
        const res = await safeFetch(url);
        if (!res || !domain) return { url };
        let html = await res.text();
        if (html.includes('eval(function(p,a,c,k,e,d)')) html = unpack(html);
        const passMatch = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
        if (passMatch) {
            const token = passMatch[1];
            const passRes = await fetch(`https://${domain}/pass_md5/${token}`, { headers: { "Referer": url } });
            if (passRes.ok) {
                const content = await passRes.text();
                return { url: content + "z762vpz?token=" + token + "&expiry=" + Date.now() };
            }
        }
    } catch (e) {}
    return { url };
}

/**
 * Main resolve function
 */
export async function resolveStream(stream) {
    const originalUrl = stream.url;
    const urlLower = originalUrl.toLowerCase();
    
    if (urlLower.match(/\.(mp4|m3u8|mkv|webm)(\?.*)?$/)) {
        return { ...stream, isDirect: true };
    }

    try {
        let result = { url: originalUrl };

        if (urlLower.includes('sibnet.ru')) result = await resolveSibnet(originalUrl);
        else if (urlLower.includes('vidmoly.')) result = await resolveVidmoly(originalUrl);
        else if (urlLower.includes('voe.')) result = await resolveVoe(originalUrl);
        else if (urlLower.includes('streamtape.com') || urlLower.includes('stape')) result = await resolveStreamtape(originalUrl);
        else if (urlLower.includes('dood') || urlLower.includes('ds2play')) result = await resolveDood(originalUrl);
        else {
            const res = await safeFetch(originalUrl);
            if (res) {
                const html = await res.text();
                const m3u8 = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) || html.match(/https?:\/\/[^"']+\.mp4[^"']*/);
                if (m3u8) result = { url: m3u8[0] };
            }
        }

        if (result.url !== originalUrl && result.url.startsWith('http')) {
            return { 
                ...stream, 
                url: result.url, 
                isDirect: true,
                headers: { ...stream.headers, ...(result.headers || {}) },
                originalUrl: originalUrl
            };
        }
    } catch (err) {}
    
    return { ...stream, isDirect: false };
}
