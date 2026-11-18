/**
 * Configuration Moviebox (moviebox01.com).
 *
 * Le site est un SPA Nuxt adossé à deux backends :
 *  - l'API mobile signée (`api3..api6.aoneroom.com/wefeed-mobile-bff/...`) qui
 *    est la SEULE à savoir chercher un titre (le POST `subject/search` du BFF
 *    web répond systématiquement `invalid token`) ;
 *  - le BFF web (`h5-api.aoneroom.com/wefeed-h5api-bff/...`) qui expose le
 *    détail, les pistes audio (`dubs`, dont la VF) et la lecture.
 *
 * ⚠ Toute requête mobile exige un token Bearer + une double signature :
 *   - `X-Client-Token: <ts_ms>,<md5(ts_ms inversé)>`
 *   - `x-tr-signature: <ts_ms>|2|<base64(hmac-md5(secret, canonical))>`
 * Sans elles, l'API répond `407 Signature invalid` — c'est la cause n°1 des
 * « flux indisponibles » constatés avec un simple scraping HTTP.
 */

export const PROVIDER_NAME = 'MovieBox';

/** Pool d'hôtes de l'API mobile (bascule automatique en cas d'échec). */
export const MOBILE_HOSTS = [
    'https://api6.aoneroom.com',
    'https://api5.aoneroom.com',
    'https://api4.aoneroom.com',
    'https://api3.aoneroom.com',
];

/** BFF web (détail, pistes audio, lecture). */
export const H5_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';

/** Site cible (utilisé pour le paramètre `host` et les Referer). */
export const SITE_HOST = 'moviebox01.com';
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** Clé HMAC-MD5 de l'API mobile (base64). */
export const MOBILE_SECRET_B64 = '76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O';

/** User-Agent de l'application Android, exigé par l'API mobile. */
export const MOBILE_UA = 'com.community.oneroom/50020044 (Linux; U; Android 13; en_US; 23078RKD5C; Build/TQ2A.230405.003; Cronet/135.0.7012.3)';

export const MOBILE_VERSION_NAME = '3.0.03.0529.03';
export const MOBILE_VERSION_CODE = 50020044;

/** UA navigateur pour le BFF web. */
export const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

/** Budget interne (le runtime coupe le plugin à 60 s). */
export const BUDGET_MS = 40000;

/** Nombre max de titres TMDB testés en recherche. */
export const MAX_SEARCH_QUERIES = 3;

/** Nombre max de pistes audio résolues par épisode (VF, VO, VA). */
export const MAX_AUDIO_TRACKS = 3;

/** Langues demandées au BFF web. */
export const REQUEST_LANG = 'fr';

export const JSON_ACCEPT = 'application/json';
export const JSON_CT = 'application/json';
export const JSON_CT_CHARSET = 'application/json; charset=utf-8';
