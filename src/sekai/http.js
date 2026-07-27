import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

const rateLimit = createProviderRateLimiter();

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'sekai.one';
const RETRY_DELAYS = [1000, 3000, 5000];

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

function isCloudflareBlock(text) {
    return text && (
        text.includes('Cloudflare') ||
        text.includes('cf-browser-verification') ||
        text.includes('challenge-form') ||
        text.includes('Attention Required') ||
        text.includes('Just a moment...') ||
        text.length < 200
    );
}

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    await rateLimit(DOMAIN);

    const { headers: customHeaders, retries = 2, ...rest } = options;
    const mergedOpts = {
        headers: { ...HEADERS, ...(customHeaders || {}) },
        timeout: 15000,
        ...rest,
    };

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (isAborted(signal)) {
            lastError = new Error('AbortError: Request aborted');
            break;
        }
        if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1] || 5000;
            console.log(`[Sekai] Retry ${attempt}/${retries} in ${delay}ms: ${url}`);
            await sleep(delay);
            if (isAborted(signal)) {
                lastError = new Error('AbortError: Request aborted');
                break;
            }
        }

        try {
            const res = await safeFetch(url, { ...mergedOpts, signal });
            if (!res) {
                lastError = new Error(`No response for ${url}`);
                continue;
            }

            const status = typeof res.status === 'number' ? res.status : 0;

            // Cloudflare block → retry (peut être temporaire)
            if (status === 403 || status === 503 || status === 429) {
                const text = await res.text();
                if (isCloudflareBlock(text)) {
                    console.log(`[Sekai] Cloudflare block (attempt ${attempt + 1}), retrying...`);
                    lastError = new Error(`Cloudflare block (${status})`);
                    continue;
                }
                // Si 429 (rate limit), on attend plus longtemps
                if (status === 429) {
                    const waitMs = 3000 * (attempt + 1);
                    console.log(`[Sekai] Rate limited (429), waiting ${waitMs}ms...`);
                    await sleep(waitMs);
                    continue;
                }
                // Autre 403 (vrai interdit) → ne pas retry
                throw new Error(`HTTP ${status} for ${url}`);
            }

            if (!res.ok) {
                throw new Error(`HTTP ${status} for ${url}`);
            }

            return await res.text();
        } catch (e) {
            if (e.name === 'AbortError' || isAborted(signal)) throw e;
            lastError = e;
            if (attempt < retries && (
                e.message?.includes('fetch failed') ||
                e.message?.includes('NetworkError') ||
                e.message?.includes('timeout') ||
                e.message?.includes('no response') ||
                e.message?.includes('Cloudflare') ||
                e.message?.includes('429')
            )) {
                console.log(`[Sekai] Transient error (attempt ${attempt + 1}): ${e.message}`);
                continue;
            }
            // Si c'est une erreur définitive, ne pas retry
            throw e;
        }
    }

    throw lastError || new Error(`Failed after ${retries + 1} attempts: ${url}`);
}
