/**
 * HTTP Utilities for Movix
 * - Retry avec backoff pour gérer l'instabilité Cloudflare
 * - Timeout adapté (20s)
 */
import { safeFetch, sleep, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    // Le middleware domainRestriction de l'API vérifie Origin/Referer →
    // il faut le domaine du site actuel (movix.fun), pas les anciens movix.cash/cloud
    "Origin": "https://movix.fun",
    "Referer": "https://movix.fun/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "DNT": "1"
};

/**
 * Délais de retry pour Cloudflare (ms)
 * Cloudflare peut bloquer temporairement → on attend 1s, 2s, 4s
 */
const RETRY_DELAYS = [1000, 2000, 4000];

/**
 * Vérifie si la réponse est un blocage Cloudflare ou une erreur
 */
function isCloudflareBlock(data) {
    if (!data) return false;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return text.includes('error code: 1010') ||
           text.includes('cf-browser-verification') ||
           text.includes('Just a moment') ||
           text.includes('Checking your browser');
}

/**
 * Vérifie si la réponse est du HTML SPA (retournée quand l'API est inaccessible)
 */
function isHtmlResponse(data) {
    if (!data || typeof data !== 'object') return false;
    const text = JSON.stringify(data);
    return text.length > 500 && (text.includes('<!doctype html>') || text.includes('<html'));
}

export async function fetchJson(url, options = {}) {
    console.log(`[Movix] Fetching: ${url}`);

    const { headers: customHeaders, retries = 2, ...rest } = options;

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await attemptFetch(url, customHeaders, rest);
            if (result) return result;
            lastError = new Error(`Empty response (attempt ${attempt + 1})`);
        } catch (e) {
            lastError = e;
            console.log(`[Movix] Attempt ${attempt + 1} failed: ${e.message}`);
        }

        // Attendre avant de réessayer (sauf dernier essai)
        if (attempt < retries) {
            const delay = RETRY_DELAYS[attempt] || 4000;
            console.log(`[Movix] Retry in ${delay}ms...`);
            await sleep(delay);
        }
    }

    console.log(`[Movix] All ${retries + 1} attempts failed for ${url}: ${lastError?.message}`);
    return null;
}

async function attemptFetch(url, customHeaders, rest) {
    const signal = rest?.signal || _currentSignal;
    if (isAborted(signal)) return null;

    const res = await safeFetch(url, {
        timeout: 20000,
        headers: { ...HEADERS, ...(customHeaders || {}) },
        signal,
        ...rest
    });

    if (!res) {
        console.log(`[Movix] No response (null) for ${url}`);
        return null;
    }

    const status = typeof res.status === 'number' ? res.status : 0;

    if (!res.ok && status !== 200) {
        console.log(`[Movix] HTTP ${status} for ${url}`);
        if (status === 403 || status === 503) {
            throw new Error(`Cloudflare block (HTTP ${status})`);
        }
        return null;
    }

    // Parse JSON
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        // QuickJS: response.json() peut retourner null en cas d'échec
        // On essaie text() comme fallback
        try {
            const text = await res.text();
            if (text && text.trim().startsWith('{')) {
                data = JSON.parse(text);
            } else {
                console.log(`[Movix] Non-JSON response for ${url}. Length: ${text.length}`);
                if (text.length > 100) {
                    throw new Error('HTML response (Cloudflare/SPA)');
                }
                return null;
            }
        } catch (e2) {
            console.log(`[Movix] Response parse error for ${url}: ${e2.message}`);
            return null;
        }
    }

    // Vérifier si la réponse est un blocage Cloudflare
    if (isCloudflareBlock(data)) {
        throw new Error('Cloudflare block (error 1010)');
    }

    // Vérifier si la réponse est du HTML (API inaccessible)
    if (isHtmlResponse(data)) {
        throw new Error('HTML response (API unavailable)');
    }

    return data != null ? data : null;
}
