/**
 * HTTP Utilities for VoirAnime.one — rebranché 2026-11 sur le moteur **Anisama**
 * (`anisama.fr`).
 *
 * ⚠ Diagnostic live 2026-11 : les anciens domaines du moteur Next.js
 * (`voiranime.one`, `anisama.org`, `anisama.net`) ont une délégation DNS cassée
 * (« No Reachable Authority ») → plus aucune requête. Le moteur tourne
 * désormais en **Laravel** sur `anisama.fr` (titre « Anisama — Streaming anime
 * & lecture de scans ») avec une arborescence différente :
 *
 *   recherche  → GET /recherche?q={q}            → cartes /catalogue/{slug}/
 *   fiche      → GET /catalogue/{slug}/          → /saison-N/, /saga-…/, /film/
 *   épisode    → GET /{fiche}/episode-{n}/{vf|vostfr}/ → <option value="embed">
 *
 * `CANDIDATE_HOSTS` reste une liste ordonnée : ajouter un miroir ici suffit.
 */

import { safeFetch, createProviderRateLimiter, isAborted } from '../utils/resolvers.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

export const CANDIDATE_HOSTS = [
    'anisama.fr',
];

export const BASE = `https://${CANDIDATE_HOSTS[0]}`;
const DOMAIN = CANDIDATE_HOSTS[0];

const rateLimit = createProviderRateLimiter();

export const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    Referer: `${BASE}/`,
};

let _basePromise = null;
let _resolvedBase = null;

/** Hôte réellement utilisable (ou le domaine historique par défaut). */
export function getBase() {
    return _resolvedBase || BASE;
}

/** Vrai si un domaine du moteur a répondu à la sonde. */
export function isBaseAlive() {
    return !!_resolvedBase;
}

async function probeHost(host, signal) {
    // 2 tentatives : une 403/429 transitoire du moteur ne doit pas condamner
    // tout le run (la résolution du domaine est mémoïsée).
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await safeFetch(`https://${host}/recherche/?q=a`, {
                headers: { ...HEADERS, Referer: `https://${host}/` },
                timeout: 8000,
                redirect: 'follow',
                signal,
            });
            if (!res || !res.ok) continue;
            const text = await res.text();
            // Le moteur doit servir sa page de recherche (cartes /catalogue/).
            if (!text || (!text.includes('/catalogue/') && !text.includes('Anisama'))) continue;
            return `https://${host}`;
        } catch (e) {
            if (e && String(e.message || e).includes('AbortError')) throw e;
        }
    }
    return null;
}

/**
 * Résout le domaine vivant du moteur (mémoïsé pour le run).
 * Les sondes partent en parallèle ; le premier succès dans l'ordre de
 * CANDIDATE_HOSTS gagne. Retourne null si aucun domaine ne répond.
 */
export function resolveBase(signal = _currentSignal) {
    if (_resolvedBase) return Promise.resolve(_resolvedBase);
    if (_basePromise) return _basePromise;
    _basePromise = (async () => {
        if (isAborted(signal)) return null;
        const results = await Promise.allSettled(
            CANDIDATE_HOSTS.map(host => probeHost(host, signal)),
        );
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
                _resolvedBase = r.value;
                console.log(`[VoirAnimeOne] domaine actif : ${r.value}`);
                return _resolvedBase;
            }
        }
        console.warn(`[VoirAnimeOne] aucun domaine du moteur ne répond (${CANDIDATE_HOSTS.join(', ')})`);
        return null;
    })();
    return _basePromise;
}

/**
 * GET HTML générique sur le moteur. Retourne le texte, ou null si
 * non-OK/erreur/timeout.
 */
export async function fetchHtml(pathOrUrl, options = {}) {
    const signal = options.signal || _currentSignal;
    if (isAborted(signal)) throw new Error('AbortError: aborted');

    const base = getBase();
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${base}${pathOrUrl}`;
    await rateLimit(DOMAIN);
    try {
        const res = await safeFetch(url, {
            headers: { ...HEADERS, Referer: `${base}/`, ...(options.headers || {}) },
            timeout: options.timeout ?? 12000,
            signal,
            redirect: 'follow',
        });
        if (!res || !res.ok) return null;
        const text = await res.text();
        return text || null;
    } catch (e) {
        if (e && String(e.message || e).includes('AbortError')) throw e;
        return null;
    }
}

export const fetchText = fetchHtml;
