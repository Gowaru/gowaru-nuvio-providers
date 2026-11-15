/**
 * HTTP Utilities for Nakios
 *
 * ⚠️ Historique des domaines (le site tourne tous les 6-12 mois) :
 *   nakios.store → nakios.cyou (DNS mort) → **nakios.live** (vérifié 2026-11)
 * L'ancien backend `api.nakios.store/api/sources/...` est mort (Cloudflare 525)
 * et la nouvelle plateforme (Laravel + Livewire) n'expose plus d'API JSON pour
 * les sources : tout est rendu dans le HTML (`wire:snapshot`). L'URL de base
 * reste surchargeable sans rebuild le jour où le domaine bouge encore.
 */

import { safeFetch, createProviderRateLimiter, isAborted, safeConfig, USER_AGENT } from '../utils/resolvers.js';

const rateLimit = createProviderRateLimiter();
const DOMAIN = 'nakios.live';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const BASE_URL = safeConfig('NUVIO_NAKIOS_SITE_URL', 'https://nakios.live');
export const GLOBAL_TIMEOUT_MS = 15000;

export const HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Upgrade-Insecure-Requests': '1',
};

/**
 * GET HTML sur le site. Renvoie le texte, ou null si erreur/404.
 * (Un 404 est une information utile : « cet épisode n'existe pas ».)
 */
export async function fetchPage(url, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) return null;

    const absolute = /^https?:/i.test(url) ? url : `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    await rateLimit(DOMAIN);
    if (isAborted(signal)) return null;

    const res = await safeFetch(absolute, {
        headers: { ...HEADERS, ...(options.headers || {}) },
        timeout: options.timeout || GLOBAL_TIMEOUT_MS,
        signal,
    });

    if (!res || !res.ok) {
        const status = res && typeof res.status === 'number' ? res.status : 'no-response';
        if (status !== 404) console.warn(`[Nakios] HTTP ${status} for ${absolute}`);
        return null;
    }
    try {
        return await res.text();
    } catch (e) {
        return null;
    }
}
