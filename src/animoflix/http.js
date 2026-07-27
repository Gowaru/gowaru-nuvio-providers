import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

const rateLimit = createProviderRateLimiter(1200, 0.3);

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'animoflix.to';

// Délais de retry pour 429 (rate limiting) et erreurs réseau
const RETRY_DELAYS = [1500, 3000, 5000];

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://animoflix.to/",
};

/**
 * Fetch text content from a URL avec retry pour 429 (rate limiting).
 * Le site animoflix.to est très agressif sur les rate limits — on backoff
 * progressivement pour éviter les blocages permanents.
 */
export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal
    if (isAborted(signal)) throw new Error('AbortError: Request aborted')

    const timeout = options.timeout
    const method = options.method || 'GET'
    const maxRetries = options.retries ?? 2
    const { headers: customHeaders, ...rest } = options
    const mergedHeaders = { ...HEADERS, ...(customHeaders || {}) }

    let lastError = null
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (isAborted(signal)) {
            lastError = new Error('AbortError: Request aborted')
            break
        }
        if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1] || 5000
            console.log(`[AnimoFlix] Retry ${attempt}/${maxRetries} after ${delay}ms`)
            await sleep(delay)
            if (isAborted(signal)) {
                lastError = new Error('AbortError: Request aborted')
                break
            }
        }

        await rateLimit(DOMAIN)

        try {
            const res = await safeFetch(url, {
                headers: mergedHeaders,
                method,
                timeout,
                signal,
                ...rest
            })

            if (!res) {
                lastError = new Error(`No response: ${url.slice(0, 80)}`)
                continue
            }

            const status = typeof res.status === 'number' ? res.status : 0

            // Rate limiting (429) → backoff et retry
            if (status === 429) {
                const waitMs = (RETRY_DELAYS[attempt] || 5000)
                console.log(`[AnimoFlix] Rate limited (429), attempt ${attempt + 1}, waiting ${waitMs}ms`)
                lastError = new Error(`Rate limited (429)`)
                await sleep(waitMs)
                continue
            }

            if (!res.ok) {
                if (status === 404) return ''
                throw new Error(`HTTP error ${status} for ${url.slice(0, 80)}`)
            }

            return await res.text()
        } catch (e) {
            if (e.name === 'AbortError' || isAborted(signal)) throw e
            lastError = e
            if (attempt < maxRetries && (
                e.message?.includes('fetch failed') ||
                e.message?.includes('NetworkError') ||
                e.message?.includes('timeout') ||
                e.message?.includes('no response') ||
                e.message?.includes('429') ||
                e.message?.includes('Rate limited')
            )) {
                continue
            }
            throw e
        }
    }

    throw lastError || new Error(`Failed after ${maxRetries + 1} attempts`)
}

export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`[AnimoFlix] Failed to parse JSON from ${url}`);
        throw e;
    }
}
