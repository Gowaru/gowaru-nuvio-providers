/**
 * Video Link Resolvers for common hosts
 */

/**
 * Common headers for fetching embed pages
 */
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
};

/**
 * Helper to fetch with timeout and error handling
 */
async function safeFetch(url, options = {}) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
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
    const match = html.match(/"url"\s*:\s*"([^"]+\.mp4)"/);
    if (match) {
        let videoUrl = match[1];
        if (videoUrl.startsWith('/')) videoUrl = `https://video.sibnet.ru${videoUrl}`;
        return videoUrl;
    }
    return url;
}

/**
 * Vidmoly resolver
 */
export async function resolveVidmoly(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/file\s*:\s*"([^"]+)"/);
    if (match) return match[1];
    return url;
}

/**
 * Uqload resolver
 */
export async function resolveUqload(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/sources\s*:\s*\["([^"]+)"\]/);
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
    const match = html.match(/'hls'\s*:\s*'([^']+)'/) || html.match(/"hls"\s*:\s*"([^"]+)"/);
    if (match) return match[1];
    return url;
}

/**
 * Sendvid resolver
 */
export async function resolveSendvid(url) {
    const response = await safeFetch(url);
    if (!response) return url;
    const html = await response.text();
    const match = html.match(/source\s+src="([^"]+\.mp4)"/i);
    if (match) return match[1];
    return url;
}

/**
 * Doodstream resolver (Note: often requires specific headers or has complex protections)
 */
export async function resolveDood(url) {
    const response = await safeFetch(url.replace('/e/', '/d/'));
    if (!response) return url;
    const html = await response.text();
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
    
    try {
        let resolvedUrl = originalUrl;

        if (urlLower.includes('sibnet.ru')) {
            resolvedUrl = await resolveSibnet(originalUrl);
        } else if (urlLower.includes('vidmoly.')) {
            resolvedUrl = await resolveVidmoly(originalUrl);
        } else if (urlLower.includes('uqload.')) {
            resolvedUrl = await resolveUqload(originalUrl);
        } else if (urlLower.includes('voe.sx') || urlLower.includes('christopheruntilpoint')) {
            resolvedUrl = await resolveVoe(originalUrl);
        } else if (urlLower.includes('sendvid.com')) {
            resolvedUrl = await resolveSendvid(originalUrl);
        } else if (urlLower.includes('dood') || urlLower.includes('ds2play') || urlLower.includes('viddood')) {
            resolvedUrl = await resolveDood(originalUrl);
        }

        if (resolvedUrl !== originalUrl) {
            console.log(`[Resolver] Success: ${originalUrl.substring(0, 30)}... -> ${resolvedUrl.substring(0, 30)}...`);
            return { 
                ...stream, 
                url: resolvedUrl, 
                isDirect: true,
                originalUrl: originalUrl // Keep for fallback or debugging
            };
        }
    } catch (err) {
        console.error(`[Resolver] Failed for ${originalUrl}:`, err);
    }
    
    return stream;
}

