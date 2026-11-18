/**
 * Configuration Fluneo (myfluneo.eu)
 *
 * Diagnostic live 2026-11 (HTML réel récupéré via un navigateur) :
 *  - Site Next.js App Router, une seule saison par slug.
 *  - Slugs : `dandadan` (VOSTFR), `dandadan-vf` (VF), `dandadan-2` (S2),
 *    `dandadan-2-vf` (S2 VF). Chaque page anime ne liste QUE sa saison.
 *  - Épisodes  : /anime/{slug}/saison-{S}/episode-{E}
 *    Les longues séries gardent une saison 1 « absolue » (One Piece :
 *    /anime/one-piece/saison-1/episode-1000).
 *  - Pas d'API de recherche : le header cherche en client-side sur un
 *    catalogue statique. /api/* est bloqué par une règle WAF.
 *  - Le lecteur n'est PAS nécessaire : le payload RSC de la page contient
 *    `embeds_json` = {"LECTEUR myTV": vidmoly, "LECTEUR VOE": voe.sx,
 *    "LECTEUR Stape": streamtape} pour chaque épisode. Un iframe
 *    `/embed-player?v=<base64>` sert de repli quand il est rendu.
 *  - Cloudflare : challenge managé (cf-mitigated: challenge) sur TOUT le
 *    domaine, y compris robots.txt/sitemap, pour tout client non-navigateur.
 *    Un cookie `cf_clearance` (copié du navigateur, même IP + même UA) est
 *    le seul moyen d'accès pour un client HTTP.
 */

export const SITE = {
  BASE_URL: 'https://myfluneo.eu',
  DOMAIN: 'myfluneo.eu',
};

export const TIMEOUTS = {
  PAGE: 12000,          // page anime / épisode
  STREAM: 7000,         // résolution d'un lecteur (Mobile/Node ; TV = OkHttp 30 s)
  RESOLVE_BUDGET: 15000, // borne du lot de résolution, vérifiée job par job sur TV
  BUDGET: 42000,        // budget global (plugin 60 s Mobile / 120 s TV)
};

export const LIMITS = {
  MAX_SLUG_ATTEMPTS: 12, // pages testées pour trouver le bon slug
  MAX_STREAMS: 12,
  MAX_RESOLVE: 4,    // résolutions simultanées : 2 lecteurs × 2 langues (Mobile)
  MAX_RESOLVE_TV: 2, // TV : fetch bloquant (30 s/requête) → 1 lecteur par langue
  MAX_PAGE_CACHE: 40,
};

// Ordre = latence mesurée sur le site (2026-11) : vidmoly ~0,8 s,
// streamtape ~0,6 s, VOE ~3,3 s. Les deux plus rapides d'abord → le quota
// « 1 flux par langue » est atteint en ~1 s ; VOE reste en repli.
export const PLAYER_ORDER = [
  'mytv', 'vidmoly', 'stape', 'streamtape', 'voe', 'sibnet', 'sendvid',
  'filemoon', 'uqload', 'dood', 'oneupload', 'mp4upload', 'ansembed', 'lecteurvideo',
];

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
