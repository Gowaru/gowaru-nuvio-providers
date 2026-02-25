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
 * Now captures and returns headers for session management (cookies)
 */
async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: { ...HEADERS, ...options.headers },
            redirect: 'follow'
        });
        if (!response.ok) return null;
        
        let html = await response.text();
        const responseHeaders = {};
        
        // Extract relevant headers (multi-platform compatibility)
        if (response.headers) {
            response.headers.forEach((value, key) => {
                responseHeaders[key.toLowerCase()] = value;
            });
        }

        // Handle JS Redirection (Common on Vidmoly, Uqload, etc.)
        const jsRedirect = html.match(/window\.location\.(?:replace|href)\s*\(['"]([^'"]+)['"]\)/i);
        if (jsRedirect) {
            let nextUrl = jsRedirect[1];
            if (nextUrl.startsWith('/')) {
                const domain = url.match(/https?:\/\/[^\/]+/)[0];
                nextUrl = domain + nextUrl;
            }
            // Propagate cookies to next request
            const cookies = responseHeaders['set-cookie'] || "";
            const secondRes = await fetch(nextUrl, {
                ...options,
                headers: { 
                    ...HEADERS, 
                    "Referer": url, 
                    "Cookie": cookies,
                    ...options.headers 
                }
            });
            if (secondRes.ok) {
                const secondHtml = await secondRes.text();
                const secondHeaders = {};
                if (secondRes.headers) {
                    secondRes.headers.forEach((v, k) => secondHeaders[k.toLowerCase()] = v);
                }
                return { 
                    text: () => Promise.resolve(secondHtml), 
                    ok: true, 
                    url: secondRes.url,
                    headers: { ...responseHeaders, ...secondHeaders } 
                };
            }
        }
        
        return { 
            text: () => Promise.resolve(html), 
            ok: true, 
            url: response.url,
            headers: responseHeaders
        };
    } catch (e) {
        return null;
    }
}

/**
 * Extracts and formats cookies from response headers
 */
function extractCookies(headers) {
    if (!headers) return "";
    const setCookie = headers['set-cookie'];
    if (!setCookie) return "";
    
    // Set-Cookie can be an array or a single string
    if (Array.isArray(setCookie)) {
        return setCookie.map(c => c.split(';')[0]).join('; ');
    }
    return setCookie.split(';')[0];
}

/**
 * Universal P.A.C.K.E.R. Unpacker
 * Decodes obfuscated code used by many video hosts
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
    } catch (err) {
        return code;
    }
}

/**
 * Verifies if a stream is actually playable (Pre-flight check)
 * Uses a small range request to minimize data usage
 */
export async function isStreamValid(url, headers = {}) {
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { ...headers, "Range": "bytes=0-1" }
        });
        
        // A valid stream should return 206 (Partial Content) or 200
        if (res.status === 200 || res.status === 206) {
            const type = res.headers.get('content-type') || "";
            return type.includes('video') || type.includes('mpegurl') || type.includes('application/octet-stream');
        }
        return false;
    } catch (e) {
        return false;
    }
}

/**
 * Sibnet resolver
 */
export async function resolveSibnet(url) {
    try {
        const response = await safeFetch(url, { headers: { 'Referer': 'https://video.sibnet.ru/' } });
        if (!response) return { url };
        const html = await response.text();
        const cookies = extractCookies(response.headers);
        const match = html.match(/src\s*:\s*["']([^"']+\.mp4)["']/) || 
                      html.match(/"url"\s*:\s*"([^"]+\.mp4)"/) ||
                      html.match(/video_url\s*:\s*'([^']+)'/);
        if (match) {
            let videoUrl = match[1];
            if (videoUrl.startsWith('//')) videoUrl = "https:" + videoUrl;
            else if (videoUrl.startsWith('/')) videoUrl = "https://video.sibnet.ru" + videoUrl;
            return { url: videoUrl, headers: { "Cookie": cookies } };
        }
    } catch (e) {}
    return { url };
}

/**
 * Vidmoly resolver
 */
export async function resolveVidmoly(url) {
    try {
        const response = await safeFetch(url, { headers: { 'Referer': 'https://vidmoly.to/' } });
        if (!response) return { url };
        let html = await response.text();
        const cookies = extractCookies(response.headers);

        // Check for packed scripts (Common on Vidmoly)
        if (html.includes('eval(function(p,a,c,k,e,d)')) {
            html = unpack(html);
        }

        const match = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/) || 
                      html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/) ||
                      html.match(/["']?file["']?\s*:\s*["']([^"']+)["']/);
        if (match) return { url: match[1], headers: { "Cookie": cookies } };
    } catch (e) {}
    return { url };
}

/**
 * Uqload / Oneupload resolver
 */
export async function resolveUqload(url) {
    try {
        const response = await safeFetch(url, { headers: { 'Referer': 'https://uqload.com/' } });
        if (!response) return { url };
        const html = await response.text();
        const cookies = extractCookies(response.headers);
        const match = html.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/) || 
                      html.match(/src\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/) ||
                      html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/) ||
                      html.match(/vurl\s*=\s*["']([^"']+)["']/);
        if (match) return { url: match[1], headers: { "Cookie": cookies } };
    } catch (e) {}
    return { url };
}

/**
 * VOE resolver
 */
export async function resolveVoe(url) {
    try {
        const response = await safeFetch(url);
        if (!response) return { url };
        const html = await response.text();
        const cookies = extractCookies(response.headers);
        
        // VOE often has a redirection script
        const redirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (redirect) {
            return resolveVoe(redirect[1]);
        }

        const match = html.match(/'hls'\s*:\s*'([^']+)'/) || 
                      html.match(/"hls"\s*:\s*"([^"]+)"/) ||
                      html.match(/file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/);
        if (match) {
            let videoUrl = match[1];
            if (videoUrl.includes('base64')) {
                try {
                    const b64 = videoUrl.split(',')[1] || videoUrl;
                    videoUrl = atob(b64);
                } catch (e) {}
            }
            return { url: videoUrl, headers: { "Cookie": cookies } };
        }
        const m3u8Match = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
        if (m3u8Match) return { url: m3u8Match[0], headers: { "Cookie": cookies } };
    } catch (e) {}
    return { url };
}

/**
 * Streamtape resolver
 */
export async function resolveStreamtape(url) {
    try {
        const response = await safeFetch(url);
        if (!response) return { url };
        const html = await response.text();
        const cookies = extractCookies(response.headers);
        
        // Streamtape bot protection
        const match = html.match(/document\.getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:['"]([^'"]+)['"]|['"]([^'"]+)['"]\.substring\(\d+\))/);
        if (match) {
            let part1 = match[1];
            let part2 = match[2] || "";
            if (match[3]) {
                const subStart = html.match(/substring\((\d+)\)/);
                const start = subStart ? parseInt(subStart[1]) : 0;
                part2 = match[3].substring(start);
            }
            return { url: "https:" + part1 + part2, headers: { "Cookie": cookies } };
        }

        const fallback = html.match(/id=['"]robotlink['"]>([^<]+)/);
        if (fallback) return { url: "https:" + fallback[1], headers: { "Cookie": cookies } };
        
        const genericMatch = html.match(/get_video\?id=[^&'"]+/);
        if (genericMatch) return { url: "https://streamtape.com/" + genericMatch[0], headers: { "Cookie": cookies } };
    } catch (e) {}
    return { url };
}

/**
 * Doodstream resolver
 */
export async function resolveDood(url) {
    try {
        const domainMatch = url.match(/https?:\/\/([^\/]+)/);
        if (!domainMatch) return { url };
        const domain = domainMatch[1];
        
        const response = await safeFetch(url);
        if (!response) return { url };
        let html = await response.text();
        const cookies = extractCookies(response.headers);

        // Check for packed scripts (Dood often uses it)
        if (html.includes('eval(function(p,a,c,k,e,d)')) {
            html = unpack(html);
        }
        
        const passMatch = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
        if (passMatch) {
            const token = passMatch[1];
            const passUrl = `https://${domain}/pass_md5/${token}`;
            const passRes = await fetch(passUrl, { headers: { "Referer": url, "Cookie": cookies } });
            if (passRes.ok) {
                const content = await passRes.text();
                // Accumulate cookies from pass_md5 call if any
                const passCookies = extractCookies({ 'set-cookie': passRes.headers.get('set-cookie') });
                const finalCookies = [cookies, passCookies].filter(Boolean).join('; ');
                // Doodstream tokenization
                return { 
                    url: content + "z762vpz?token=" + token + "&expiry=" + Date.now(),
                    headers: { "Cookie": finalCookies }
                };
            }
        }
    } catch (e) {}
    return { url };
}

/**
 * Sendvid resolver
 */
export async function resolveSendvid(url) {
    try {
        const response = await safeFetch(url);
        if (!response) return { url };
        const html = await response.text();
        const cookies = extractCookies(response.headers);
        const match = html.match(/source\s*src=['"]([^'"]+\.mp4)['"]/) || 
                      html.match(/content=['"]([^'"]+\.mp4)['"]/) ||
                      html.match(/video_url\s*:\s*['"]([^'"]+)['"]/);
        if (match) return { url: match[1], headers: { "Cookie": cookies } };
    } catch (e) {}
    return { url };
}

/**
 * MyVi / MyTV resolver
 */
export async function resolveMyVi(url) {
    try {
        const response = await safeFetch(url);
        if (!response) return { url };
        const html = await response.text();
        const cookies = extractCookies(response.headers);
        const match = html.match(/vurl=["']([^"']+)["']/) || 
                      html.match(/file\s*:\s*["']([^"']+)["']/) ||
                      html.match(/["']?url["']?\s*:\s*["']([^"']+)["']/);
        if (match) {
            let vurl = match[1];
            if (vurl.startsWith('//')) vurl = "https:" + vurl;
            return { url: vurl, headers: { "Cookie": cookies } };
        }
    } catch (e) {}
    return { url };
}

/**
 * Moon resolver (Moonplayer)
 */
export async function resolveMoon(url) {
    try {
        const response = await safeFetch(url);
        if (!response) return { url };
        const html = await response.text();
        const cookies = extractCookies(response.headers);
        const match = html.match(/sources\s*:\s*\[\s*{\s*file\s*:\s*["']([^"']+)["']/) ||
                      html.match(/file\s*:\s*["']([^"']+\.mp4[^"']*)["']/);
        if (match) return { url: match[1], headers: { "Cookie": cookies } };
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
        let result = { url: originalUrl, headers: { ...stream.headers } };

        if (urlLower.includes('sibnet.ru')) {
            result = await resolveSibnet(originalUrl);
            result.headers = { ...result.headers, 'Referer': 'https://video.sibnet.ru/' };
        } else if (urlLower.includes('vidmoly.')) {
            result = await resolveVidmoly(originalUrl);
            result.headers = { ...result.headers, 'Referer': 'https://vidmoly.to/' };
        } else if (urlLower.includes('uqload.') || urlLower.includes('oneupload.')) {
            result = await resolveUqload(originalUrl);
            result.headers = { ...result.headers, 'Referer': 'https://uqload.com/' };
        } else if (urlLower.includes('voe.')) {
            result = await resolveVoe(originalUrl);
        } else if (urlLower.includes('streamtape.com') || urlLower.includes('stape')) {
            result = await resolveStreamtape(originalUrl);
        } else if (urlLower.includes('dood') || urlLower.includes('ds2play')) {
            result = await resolveDood(originalUrl);
        } else if (urlLower.includes('sendvid.com')) {
            result = await resolveSendvid(originalUrl);
        } else if (urlLower.includes('myvi.') || urlLower.includes('mytv')) {
            result = await resolveMyVi(originalUrl);
        } else if (urlLower.includes('moonplayer') || urlLower.includes('moon.')) {
            result = await resolveMoon(originalUrl);
        } else {
            // Generic Fallback
            const genericRes = await safeFetch(originalUrl);
            if (genericRes) {
                const html = await genericRes.text();
                const cookies = extractCookies(genericRes.headers);
                const m3u8Match = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/) || 
                                  html.match(/https?:\/\/[^"']+\.mp4[^"']*/);
                if (m3u8Match) {
                    result = { url: m3u8Match[0], headers: { "Cookie": cookies } };
                }
            }
        }

        if (result.url !== originalUrl && result.url.startsWith('http')) {
            console.log("[Resolver] Successfully resolved: " + originalUrl.substring(0, 30) + "...");
            
            // Optional: Pre-flight check before returning to player
            const valid = await isStreamValid(result.url, { ...stream.headers, ...result.headers });
            if (!valid) {
                 console.log("[Resolver] Stream validation failed for: " + result.url.substring(0, 30));
                 // If validation fails, we don't return the URL to avoid 23003
                 return { ...stream, isDirect: false, error: "Link expired or invalid" };
            }

            return { 
                ...stream, 
                url: result.url, 
                isDirect: true,
                headers: { ...stream.headers, ...result.headers },
                originalUrl: originalUrl
            };
        }
    } catch (err) {
        console.error("[Resolver] Failed for " + originalUrl + ":", err.message);
    }
    
    return { ...stream, isDirect: false };
}
