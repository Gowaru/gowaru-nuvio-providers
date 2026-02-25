/**
 * Video Link Resolvers for common hosts
 */

/**
 * Common headers for fetching embed pages
 */
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

/**
 * Helper to fetch with timeout and error handling
 */
async function safeFetch(url, options = {}) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(url, {
            ...options,
            headers: { ...HEADERS, ...options.headers },
            signal: controller.signal
        });
        clearTimeout(timeout);
        return response;
    } catch (e) {
        console.error(`[Resolver] Fetch failed for ${url}: ${e.message}`);
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
    // Try multiple patterns for Sibnet
    const match = html.match(/"url"\s*:\s*"([^"]+\.mp4)"/) || 
                  html.match(/src\s*:\s*"([^"]+\.mp4)"/) ||
                  html.match(/player\.setVideo\(\s*\{\s*"url"\s*:\s*"([^"]+)"/);
    if (match) {
        let videoUrl = match[1];
        if (videoUrl.startsWith('//')) videoUrl = `https:${videoUrl}`;
        else if (videoUrl.startsWith('/')) videoUrl = `https://video.sibnet.ru${videoUrl}`;
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
    const match = html.match(/file\s*:\s*"([^"]+\.m3u8)"/) || 
                  html.match(/file\s*:\s*"([^"]+\.mp4)"/) ||
                  html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/);
    if (match) return match[1];
    return url;
}

/**
 * Uqload resolver
 */
export async function resolveUqload(url) {
    const response = await safeFetch(url, { headers: { 'Referer': 'https://uqload.com/' } });
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/sources\s*:\s*\["([^"]+\.(?:mp4|m3u8))"\]/) || 
                  html.match(/src\s*:\s*"([^"]+\.(?:mp4|m3u8))"/) ||
                  html.match(/file\s*:\s*"([^"]+\.(?:mp4|m3u8))"/);
    if (match) return match[1];
    return url;
}

/**
 * Voe resolver
 */
export async function resolveVoe(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    // Voe often uses base64 or direct HLS links
    const match = html.match(/'hls'\s*:\s*'([^']+)'/) || 
                  html.match(/"hls"\s*:\s*"([^"]+)"/) ||
                  html.match(/window\.location\.href\s*=\s*'([^']+)'/);
    
    if (match) {
        let videoUrl = match[1];
        if (videoUrl.includes('base64')) {
            try {
                // simple base64 decode if env supports it
                const b64 = videoUrl.split(',')[1] || videoUrl;
                if (typeof atob === 'function') videoUrl = atob(b64);
            } catch (e) {}
        }
        return videoUrl;
    }
    return url;
}

/**
 * Moon resolver
 */
export async function resolveMoon(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/sources\s*:\s*\[\s*\{\s*"file"\s*:\s*"([^"]+)"/i) || 
                  html.match(/file\s*:\s*"([^"]+)"/i) ||
                  html.match(/src\s*:\s*"([^"]+\.m3u8)"/i);
    if (match) return match[1];
    return url;
}

/**
 * MyCloud / MyTv resolver
 */
export async function resolveMyCloud(url) {
    // MyCloud often uses mclls.net or mycloud.cc
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/file\s*:\s*"([^"]+)"/i) || 
                  html.match(/source\s*:\s*"([^"]+)"/i) ||
                  html.match(/video\s+src="([^"]+)"/i);
    if (match) return match[1];
    return url;
}

/**
 * FHD / Generic Player resolver
 */
export async function resolveFhd(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/file\s*:\s*"([^"]+)"/i) || 
                  html.match(/src\s*:\s*"([^"]+\.(?:mp4|m3u8|mkv))"/i);
    if (match) return match[1];
    return url;
}

/**
 * Upstream resolver
 */
export async function resolveUpstream(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/file\s*:\s*"([^"]+)"/);
    if (match) return match[1];
    return url;
}

/**
 * Vido / Vidlo resolver
 */
export async function resolveVido(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/file\s*:\s*"([^"]+)"/);
    if (match) return match[1];
    return url;
}

/**
 * Streamtape resolver
 */
export async function resolveStreamtape(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    // Streamtape uses a complex multi-part obfuscation for its links
    const match = html.match(/robotlink\.innerHTML\s*=\s*'([^']+)'\s*\+\s*'([^']+)'/);
    if (match) {
        let link = `https:${match[1]}${match[2].substring(3)}`;
        return link;
    }
    const matchAlt = html.match(/id="robotlink">([^<]+)/);
    if (matchAlt) return `https:${matchAlt[1]}`;
    
    return url;
}

/**
 * Sendvid resolver
 */
export async function resolveSendvid(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/source\s+src="([^"]+\.mp4)"/i) || html.match(/video_source\s*:\s*"([^"]+)"/);
    if (match) return match[1];
    return url;
}

/**
 * Doodstream resolver
 */
export async function resolveDood(url) {
    const baseUrl = "https://dood.to";
    const response = await safeFetch(url, { headers: { 'Referer': baseUrl } });
    if (!response) return url;
    const html = await response.text();
    
    const passMatch = html.match(/\$.get\('\/pass_md5\/([^']+)'/);
    if (passMatch) {
        const passUrl = `${baseUrl}/pass_md5/${passMatch[1]}`;
        const passRes = await safeFetch(passUrl, { headers: { 'Referer': url } });
        if (passRes) {
            const finalPart = await passRes.text();
            return `${finalPart}z72899?token=${passMatch[1]}&expiry=${Date.now()}`;
        }
    }
    
    const match = html.match(/window\.open\('([^']+)'\)/);
    if (match) return match[1];
    return url;
}

/**
 * Main resolve function - robust and extensible
 */
export async function resolveStream(stream) {
    const originalUrl = stream.url;
    const urlLower = originalUrl.toLowerCase();
    
    // If it already looks like a direct link, keep it but mark as direct
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
        } else if (urlLower.includes('uqload.')) {
            resolvedUrl = await resolveUqload(originalUrl);
            newHeaders['Referer'] = 'https://uqload.com/';
        } else if (urlLower.includes('voe.sx') || urlLower.includes('christopheruntilpoint')) {
            resolvedUrl = await resolveVoe(originalUrl);
        } else if (urlLower.includes('moonplayer') || urlLower.includes('moonembed')) {
            resolvedUrl = await resolveMoon(originalUrl);
        } else if (urlLower.includes('mytv') || urlLower.includes('mycloud') || urlLower.includes('mclls.net')) {
            resolvedUrl = await resolveMyCloud(originalUrl);
            newHeaders['Referer'] = 'https://mycloud.cc/';
        } else if (urlLower.includes('fhd') || urlLower.includes('fhd1')) {
            resolvedUrl = await resolveFhd(originalUrl);
        } else if (urlLower.includes('upstream.')) {
            resolvedUrl = await resolveVidmoly(originalUrl); 
        } else if (urlLower.includes('vido.') || urlLower.includes('vidlo.')) {
            resolvedUrl = await resolveVidmoly(originalUrl); 
        } else if (urlLower.includes('streamtape.com')) {
            resolvedUrl = await resolveStreamtape(originalUrl);
        } else if (urlLower.includes('sendvid.com')) {
            resolvedUrl = await resolveSendvid(originalUrl);
        } else if (urlLower.includes('dood') || urlLower.includes('ds2play') || urlLower.includes('viddood')) {
            resolvedUrl = await resolveDood(originalUrl);
        }

        // If we found a direct link or something different
        if (resolvedUrl !== originalUrl && resolvedUrl.startsWith('http')) {
            console.log(`[Resolver] Success: ${originalUrl.substring(0, 30)}... -> ${resolvedUrl.substring(0, 30)}...`);
            return { 
                ...stream, 
                url: resolvedUrl, 
                isDirect: true,
                headers: newHeaders,
                originalUrl: originalUrl
            };
        }
    } catch (err) {
        console.error(`[Resolver] Failed for ${originalUrl}:`, err);
    }
    
    // IMPORTANT: If we didn't resolve it, and it's clearly an HTML link, 
    // we should probably NOT return it to prevent 23003 error.
    return { ...stream, isDirect: false };
}



