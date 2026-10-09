import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

const BASE_URL = "https://www.mugiwara-no-streaming.com";

export const BASE = BASE_URL;
export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

const rateLimit = createProviderRateLimiter();

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'mugiwara-no-streaming.com';
const RETRY_DELAYS = [1000, 3000, 5000];

// ─── Circuit breaker Cloudflare ─────────────────────────────────────────────
// Un blocage Cloudflare confirmé (403 + challenge détecté) est COURT TERME
// pour tout le domaine : réessayer ×3 pour CHAQUE requête de recherche
// (un provider peut en faire 20+) gaspille tout le budget 45 s sur des
// réponses 403 identiques. Après le premier blocage confirmé, on échoue
// directement pendant CIRCUIT_COOLDOWN ms.
const CIRCUIT_COOLDOWN_MS = 60000;
let _circuitOpenUntil = 0;

function isCircuitOpen() {
    return Date.now() < _circuitOpenUntil;
}

/**
 * Détecte si une réponse est un blocage Cloudflare.
 */
function isCloudflareBlock(text) {
    if (!text || text.length > 8000) return false;
    return (
        text.includes('Cloudflare') ||
        text.includes('cf-browser-verification') ||
        text.includes('challenge-form') ||
        text.includes('Attention Required') ||
        text.includes('Just a moment...') ||
        text.includes('jsd/main') ||
        /Ray ID: [a-f0-9-]{20,}/.test(text)
    )
}

/**
 * Fetch text content from a URL avec retry Cloudflare et rate limiting.
 */
export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    // Circuit ouvert : le domaine est bloqué côté CF — pas de retry inutile.
    if (isCircuitOpen()) {
        throw new Error(`Cloudflare circuit open (domain blocked for ${Math.ceil((_circuitOpenUntil - Date.now()) / 1000)}s)`);
    }

    const { headers: customHeaders, method, timeout, retries, ...rest } = options;
    const resolvedMethod = method || 'GET';
    const maxRetries = retries ?? 2;
    const mergedHeaders = { ...HEADERS, ...(customHeaders || {}) };

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (isAborted(signal)) {
            lastError = new Error('AbortError: Request aborted');
            break;
        }
        await rateLimit(DOMAIN);

        if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1] || 5000;
            console.log(`[Mugiwara] Retry ${attempt}/${maxRetries} after ${delay}ms: ${url.slice(0, 80)}`);
            await sleep(delay);
            if (isAborted(signal)) {
                lastError = new Error('AbortError: Request aborted');
                break;
            }
        }

        try {
            const res = await safeFetch(url, {
                headers: mergedHeaders,
                method: resolvedMethod,
                timeout,
                signal,
                ...rest
            });

            if (!res) {
                lastError = new Error(`No response: ${url.slice(0, 80)}`);
                continue;
            }

            const status = typeof res.status === 'number' ? res.status : 0;

            // Cloudflare challenge → retry avec backoff
            if (status === 503 || status === 403) {
                const text = await res.text();
                if (isCloudflareBlock(text)) {
                    console.log(`[Mugiwara] Cloudflare block (${status}), attempt ${attempt + 1}/${maxRetries + 1}`);
                    // Blocage confirmé → ouvrir le circuit pour tout le domaine
                    // : les requêtes suivantes échoueront sans retry.
                    if (attempt === maxRetries || status === 403) {
                        _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
                        console.log(`[Mugiwara] Circuit breaker OPEN (${CIRCUIT_COOLDOWN_MS / 1000}s) — domaine bloqué CF`);
                    }
                    lastError = new Error(`Cloudflare block (${status})`);
                    continue;
                }
                if (status === 403) {
                    throw new Error(`HTTP 403 for ${url.slice(0, 80)}`);
                }
            }

            // Rate limiting → backoff et retry
            if (status === 429) {
                const waitMs = (RETRY_DELAYS[attempt] || 5000);
                console.log(`[Mugiwara] Rate limited (429), waiting ${waitMs}ms`);
                lastError = new Error(`Rate limited (429)`);
                await sleep(waitMs);
                continue;
            }

            if (!res.ok) {
                if (status === 404) return '';
                throw new Error(`HTTP ${status} for ${url.slice(0, 80)}`);
            }

            return await res.text();
        } catch (e) {
            if (e.name === 'AbortError' || isAborted(signal)) throw e;
            lastError = e;
            if (attempt < maxRetries && (
                e.message?.includes('fetch failed') ||
                e.message?.includes('NetworkError') ||
                e.message?.includes('timeout') ||
                e.message?.includes('no response') ||
                e.message?.includes('Cloudflare') ||
                e.message?.includes('429') ||
                e.message?.includes('Rate limited')
            )) {
                continue;
            }
            throw e;
        }
    }

    throw lastError || new Error(`Failed after ${maxRetries + 1} attempts`);
}
