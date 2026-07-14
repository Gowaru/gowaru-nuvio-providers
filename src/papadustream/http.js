/**
 * HTTP Utilities for Papadustream
 * - Multi-domain fallback (papadustream.club → papadustream.fr → papadustream.net)
 * - Rate limiting intégré
 */

import { safeFetch, createProviderRateLimiter, sleep } from '../utils/resolvers.js';

const rateLimit = createProviderRateLimiter();

// Domaines Papadustream actifs (ordonnés par fiabilité)
const DOMAINS = ['papadustream.club', 'papadustream.fr', 'papadustream.net'];

export const BASE_URL = 'https://papadustream.club';
export const BASE_URL_WWW = 'https://www.papadustream.club';
export const GLOBAL_TIMEOUT_MS = 15000;

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive'
};

// Délais de retry (ms)
const RETRY_DELAYS = [1000, 2000];

/**
 * Extrait le chemin d'une URL complète (supprime le domaine)
 */
function extractPath(url) {
    try {
        const u = new URL(url);
        return u.pathname + u.search + u.hash;
    } catch (e) {
        return url;
    }
}

/**
 * Construit une URL pour un domaine donné à partir de l'URL originale.
 * Si l'URL originale contient déjà le domaine, remplace par le nouveau domaine.
 */
function buildUrl(domain, originalUrl) {
    const path = extractPath(originalUrl);
    return `https://${domain}${path}`;
}

/**
 * Tente de récupérer du contenu sur un domaine spécifique.
 */
async function fetchFromDomain(domain, originalUrl, options = {}) {
    const url = buildUrl(domain, originalUrl);
    const timeout = options.timeout || GLOBAL_TIMEOUT_MS;
    const mergedHeaders = {
        ...HEADERS,
        Referer: `https://${domain}/`,
        Origin: `https://${domain}`,
        ...(options.headers || {})
    };

    await rateLimit(domain);

    for (let attempt = 0; attempt <= (options.retries ?? 1); attempt++) {
        try {
            const res = await safeFetch(url, { headers: mergedHeaders, timeout });

            if (!res) {
                console.log(`[Papadustream] No response from ${domain} (attempt ${attempt + 1})`);
                if (attempt < (options.retries ?? 1)) await sleep(RETRY_DELAYS[attempt] || 1000);
                continue;
            }

            if (!res.ok) {
                if (res.status === 404) return null;
                console.log(`[Papadustream] HTTP ${res.status} on ${domain}`);
                if (attempt < (options.retries ?? 1)) await sleep(RETRY_DELAYS[attempt] || 1000);
                continue;
            }

            return await res.text();

        } catch (e) {
            console.log(`[Papadustream] Error on ${domain} (attempt ${attempt + 1}): ${e.message}`);
            if (attempt < (options.retries ?? 1)) await sleep(RETRY_DELAYS[attempt] || 1000);
        }
    }

    return null;
}

/**
 * Récupère du contenu HTML en essayant chaque domaine Papadustream.
 * Retourne dès qu'un domaine répond (avec données valides).
 */
export async function fetchText(url, options = {}) {
    for (const domain of DOMAINS) {
        console.log(`[Papadustream] Trying ${domain}...`);
        const result = await fetchFromDomain(domain, url, options);
        if (result) return result;
    }
    console.warn(`[Papadustream] All domains failed for ${url}`);
    return null;
}

export { DOMAINS };
