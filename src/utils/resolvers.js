/**
 * Video Link Resolvers for common hosts
 * Highly optimized for Nuvio (Hermes/React Native)
 */

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
};

/**
 * Robust fetcher that follows JS redirections if needed
 */
async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: { ...HEADERS, ...options.headers },
            redirect: 'follow'
        });
        if (!response.ok) return null;
        
        const html = await response.text();
        
        // Handle JS Redirection (Common on Vidmoly, Uqload, etc.)
        const jsRedirect = html.match(/window\.location\.(?:replace|href)\s*\(['"]([^'"]+)['"]\)/i);
        if (jsRedirect) {
            let nextUrl = jsRedirect[1];
            if (nextUrl.startsWith('/')) {
                const domain = url.match(/https?:\/\/[^\/]+/)[0];
                nextUrl = domain + nextUrl;
            }
            const secondRes = await fetch(nextUrl, {
                ...options,
                headers: { ...HEADERS, "Referer": url, ...options.headers }
            });
            if (secondRes.ok) {
                const secondHtml = await secondRes.text();
                return { text: () => Promise.resolve(secondHtml), ok: true, url: secondRes.url };
            }
        }
        
        return { text: () => Promise.resolve(html), ok: true, url: response.url };
    } catch (e) {
        return null;
    }
}

/**
 * Sibnet resolver
 */
export async function resolveSibnet(url) {
    const response = await safeFetch(url, { headers: { 'Referer': 'https://video.sibnet.ru/' } });
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/src\s*:\s*["']([^"']+\.mp4)["']/) || 
                  html.match(/"url"\s*:\s*"([^"]+\.mp4)"/) ||
                  html.match(/video_url\s*:\s*'([^']+)'/);
    if (match) {
        let videoUrl = match[1];
        if (videoUrl.startsWith('//')) videoUrl = "https:" + videoUrl;
        else if (videoUrl.startsWith('/')) videoUrl = "https://video.sibnet.ru" + videoUrl;
        return videoUrl;
    }
    return url;
}

/**
 * Vidmoly resolver
 */
export async function resolveVidmoly(url) {
    const response = await safeFetch(url, { headers: { 'Referer': 'https://vidmoly.to/' } });
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/) || 
                  html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/) ||
                  html.match(/["']?file["']?\s*:\s*["']([^"']+)["']/);
    if (match) return match[1];
    return url;
}

/**
 * Uqload / Oneupload resolver
 */
export async function resolveUqload(url) {
    const response = await safeFetch(url, { headers: { 'Referer': 'https://uqload.com/' } });
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) || 
                  html.match(/src\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/) ||
                  html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/);
    if (match) return match[1];
    return url;
}

/**
 * VOE resolver
 */
export async function resolveVoe(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/'hls'\s*:\s*'([^']+)'/) || 
                  html.match(/"hls"\s*:\s*"([^"]+)"/);
    if (match) {
        let videoUrl = match[1];
        if (videoUrl.includes('base64')) {
            try {
                const b64 = videoUrl.split(',')[1] || videoUrl;
                videoUrl = atob(b64);
            } catch (e) {}
        }
        return videoUrl;
    }
    const m3u8Match = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
    return m3u8Match ? m3u8Match[0] : url;
}

/**
 * Streamtape resolver
 */
export async function resolveStreamtape(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    // Streamtape uses a bot protection: it concatenates strings in JS
    const match = html.match(/document\.getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:['"]([^'"]+)['"]|(\w+))/);
    if (match) {
        let part1 = match[1];
        let part2 = match[2] || "";
        // If part2 is a variable, we can't easily resolve it here without a JS engine, 
        // but often it's just strings.
        return "https:" + part1 + part2;
    }
    // Fallback regex
    const fallback = html.match(/id=['"]robotlink['"]>([^<]+)/);
    return fallback ? "https:" + fallback[1] : url;
}

/**
 * Doodstream resolver
 */
export async function resolveDood(url) {
    try {
        const domain = url.match(/https?:\/\/([^\/]+)/)[1];
        const response = await safeFetch(url);
        if (!response) return url;
        const html = await response.text();
        
        const passMatch = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
        if (passMatch) {
            const passUrl = `https://${domain}/pass_md5/${passMatch[1]}`;
            const passRes = await fetch(passUrl, { headers: { "Referer": url } });
            if (passRes.ok) {
                const content = await passRes.text();
                // Doodstream adds a random string + expiry
                return content + "z762vpz?token=" + passMatch[1] + "&expiry=" + Date.now();
            }
        }
    } catch (e) {}
    return url;
}

/**
 * Sendvid resolver
 */
export async function resolveSendvid(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/source\s*src=['"]([^'"]+\.mp4)['"]/) || 
                  html.match(/content=['"]([^'"]+\.mp4)['"]/);
    return match ? match[1] : url;
}

/**
 * MyVi / MyTV resolver
 */
export async function resolveMyVi(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/vurl=["']([^"']+)["']/) || 
                  html.match(/file\s*:\s*["']([^"']+)["']/);
    if (match) {
        let vurl = match[1];
        if (vurl.startsWith('//')) vurl = "https:" + vurl;
        return vurl;
    }
    return url;
}

/**
 * Moon resolver (Moonplayer)
 */
export async function resolveMoon(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/sources\s*:\s*\[\s*{\s*file\s*:\s*["']([^"']+)["']/);
    return match ? match[1] : url;
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
        let resolvedUrl = originalUrl;
        let newHeaders = { ...stream.headers };

        if (urlLower.includes('sibnet.ru')) {
            resolvedUrl = await resolveSibnet(originalUrl);
            newHeaders['Referer'] = 'https://video.sibnet.ru/';
        } else if (urlLower.includes('vidmoly.')) {
            resolvedUrl = await resolveVidmoly(originalUrl);
            newHeaders['Referer'] = 'https://vidmoly.to/';
        } else if (urlLower.includes('uqload.') || urlLower.includes('oneupload.')) {
            resolvedUrl = await resolveUqload(originalUrl);
            newHeaders['Referer'] = 'https://uqload.com/';
        } else if (urlLower.includes('voe.')) {
            resolvedUrl = await resolveVoe(originalUrl);
        } else if (urlLower.includes('streamtape.com') || urlLower.includes('stape')) {
            resolvedUrl = await resolveStreamtape(originalUrl);
        } else if (urlLower.includes('dood') || urlLower.includes('ds2play')) {
            resolvedUrl = await resolveDood(originalUrl);
        } else if (urlLower.includes('sendvid.com')) {
            resolvedUrl = await resolveSendvid(originalUrl);
        } else if (urlLower.includes('myvi.') || urlLower.includes('mytv')) {
            resolvedUrl = await resolveMyVi(originalUrl);
        } else if (urlLower.includes('moonplayer') || urlLower.includes('moon.')) {
            resolvedUrl = await resolveMoon(originalUrl);
        }

        if (resolvedUrl !== originalUrl && resolvedUrl.startsWith('http')) {
            return { 
                ...stream, 
                url: resolvedUrl, 
                isDirect: true,
                headers: newHeaders
            };
        }
    } catch (err) {}
    
    return { ...stream, isDirect: false };
}
