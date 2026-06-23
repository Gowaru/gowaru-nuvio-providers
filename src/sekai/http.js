import { safeFetch, createProviderRateLimiter } from '../utils/resolvers.js';

const rateLimit = createProviderRateLimiter();
const DOMAIN = 'sekai.one';

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export async function fetchText(url, options = {}) {
    await rateLimit(DOMAIN);
    console.log(`[Sekai] Fetching: ${url}`);
    const { headers: customHeaders, ...rest } = options;
    const mergedOpts = {
        headers: { ...HEADERS, ...(customHeaders || {}) },
        timeout: 10000,
        ...rest,
    };
    const res = await safeFetch(url, mergedOpts);
    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        throw new Error(`HTTP ${status} for ${url}`);
    }
    return await res.text();
}
