import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

const rateLimit = createProviderRateLimiter();

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'animes-sama.su';
const RETRY_DELAYS = [1000, 3000];

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError');

    await rateLimit(DOMAIN);

    const { headers: customHeaders, retries = 1, ...rest } = options;
    const mergedOpts = {
        headers: { ...HEADERS, ...(customHeaders || {}) },
        timeout: 15000,
        ...rest,
    };

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (isAborted(signal)) { lastError = new Error('AbortError'); break; }
        if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1] || 3000;
            await sleep(delay);
            if (isAborted(signal)) { lastError = new Error('AbortError'); break; }
        }

        try {
            const res = await safeFetch(url, { ...mergedOpts, signal });
            if (!res) { lastError = new Error('No response'); continue; }
            if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
            return await res.text();
        } catch (e) {
            if (e.name === 'AbortError' || isAborted(signal)) throw e;
            lastError = e;
            if (attempt < retries) continue;
        }
    }
    throw lastError || new Error(`Failed: ${url}`);
}
