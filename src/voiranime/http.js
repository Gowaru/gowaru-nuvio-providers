/**
 * HTTP Utilities for VoirAnime
 * Avec détection Cloudflare et retry avec backoff pour réduire les timeouts.
 */

import { safeFetch, createProviderRateLimiter, sleep, isAborted } from '../utils/resolvers.js';

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
};

const rateLimit = createProviderRateLimiter();

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const DOMAIN = 'voir-anime.to';

/** Délais de retry pour Cloudflare (backoff progressif) */
const RETRY_DELAYS = [1000, 2000, 4000];

/**
 * Détecte si une réponse est un blocage Cloudflare.
 * Les pages de challenge Cloudflare sont généralement petites (< 5KB) et
 * contiennent des mots-clés spécifiques.
 */
function isCloudflareBlock(text) {
  if (!text || text.length > 8000) return false; // Pages normales > challenge CF
  return (
    text.includes('Cloudflare') ||
    text.includes('cf-browser-verification') ||
    text.includes('challenge-form') ||
    text.includes('Attention Required') ||
    text.includes('Just a moment...') ||
    text.includes('jsd/main') ||
    text.includes('cdn-cgi/bm/cv/') ||
    /Ray ID: [a-f0-9-]{20,}/.test(text)
  )
}

/**
 * Fetch text content from a URL avec retry Cloudflare.
 * Les requêtes HEAD peuvent être bloquées par Cloudflare plus souvent que les GET.
 */
export async function fetchText(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: Request aborted');

    await rateLimit(DOMAIN);

    const { headers: customHeaders, method, timeout, ...rest } = options;
    const resolvedMethod = method || 'GET';
    const maxRetries = resolvedMethod === 'HEAD' ? 1 : options.retries ?? 2;
    const mergedHeaders = { ...HEADERS, ...(customHeaders || {}) };

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (isAborted(signal)) {
            lastError = new Error('AbortError: Request aborted');
            break;
        }

        if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1] || 4000;
            console.log(`[VoirAnime] Retry ${attempt}/${maxRetries} after ${delay}ms: ${url.slice(0, 80)}`);
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

            // Pas de réponse du tout → on retry
            if (!res) {
                lastError = new Error(`No response: ${url.slice(0, 80)}`);
                continue;
            }

            const status = typeof res.status === 'number' ? res.status : 0;

            // Cloudflare challenge (503/403) → retry avec backoff
            if (status === 503 || status === 403) {
                const text = await res.text();
                if (isCloudflareBlock(text)) {
                    console.log(`[VoirAnime] Cloudflare block (${status}), attempt ${attempt + 1}/${maxRetries + 1}`);
                    lastError = new Error(`Cloudflare block (${status})`);
                    continue;
                }
                if (status === 403) {
                    throw new Error(`HTTP 403 for ${url.slice(0, 80)}`);
                }
            }

            // Rate limiting (429) → attendre et retry
            if (status === 429) {
                const waitMs = 2000 * (attempt + 1);
                console.log(`[VoirAnime] Rate limited (429), waiting ${waitMs}ms`);
                await sleep(waitMs);
                continue;
            }

            if (!res.ok) {
                if (status === 404) return ''; // 404 = pas trouvé, pas la peine de retry
                throw new Error(`HTTP ${status} for ${url.slice(0, 80)}`);
            }

            return await res.text();
        } catch (e) {
            lastError = e;
            if (e.name === 'AbortError' || isAborted(signal)) throw e;
            // Retry sur les erreurs réseau/timeout (pas les 4xx sauf 429/Cloudflare)
            if (attempt < maxRetries && (
                e.message?.includes('fetch failed') ||
                e.message?.includes('NetworkError') ||
                e.message?.includes('timeout') ||
                e.message?.includes('no response') ||
                e.message?.includes('Cloudflare')
            )) {
                continue;
            }
            // HEAD: silencieux (c'est normal que certaines pages n'existent pas)
            if (resolvedMethod === 'HEAD') return '';
            throw e;
        }
    }

    throw lastError || new Error(`Failed after ${maxRetries + 1} attempts`);
}

/**
 * Fetch JSON content from a URL
 */
export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`[VoirAnime] Failed to parse JSON from ${url}`);
        throw e;
    }
}
