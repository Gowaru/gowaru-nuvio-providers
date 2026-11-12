/**
 * Solveur Cloudflare Turnstile — optionnel, DÉSACTIVÉ par défaut.
 *
 * Contexte (diag 2026-11) : la famille DoodStream (`dood.to`, `playmogo.com`,
 * `ds2play.com`…) protège ses pages embed par un challenge managé Cloudflare
 * puis par Turnstile. Le HTML ne contient alors aucune URL de flux : le token
 * `/pass_md5/…` n'existe qu'après `GET /dood?op=validate&gc_response=<token>`,
 * et ce token n'est délivré que par un navigateur (ou un service de résolution).
 *
 * Ce module encapsule l'appel au service tiers choisi par l'utilisateur
 * (CapSolver / 2Captcha). Aucune clé n'est embarquée : sans clé saisie dans les
 * réglages du provider, `isTurnstileSolverEnabled()` renvoie false et rien ne
 * change (le flux est simplement écarté, comme avant).
 *
 * Contraintes runtime respectées :
 *  - pas de `setTimeout` garanti (NuvioTV) → `delay()` se dégrade en microtask ;
 *  - pas d'import de `resolvers.js` (évite un cycle d'import) ;
 *  - budget interne borné : si le service ne répond pas à temps, on renvoie
 *    null sans jeter (le provider essaie un autre lecteur).
 */

/** Budget total d'une résolution (création de tâche + polling). */
export const SOLVE_BUDGET_MS = 12000;

const POLL_INTERVAL_MS = 2500;
const HAS_TIMERS = typeof setTimeout === 'function';

function delay(ms) {
    const d = Number(ms) > 0 ? Number(ms) : 0;
    if (HAS_TIMERS) return new Promise((resolve) => setTimeout(resolve, d));
    const target = Date.now() + d;
    return new Promise((resolve) => {
        const check = () => (Date.now() >= target ? resolve() : Promise.resolve().then(check));
        check();
    });
}

/** Réglages injectés par l'app (NuvioMobile/NuvioTV) — lecture défensive. */
function readSettings() {
    try {
        if (typeof globalThis !== 'undefined' && globalThis.SCRAPER_SETTINGS &&
            typeof globalThis.SCRAPER_SETTINGS === 'object') {
            return globalThis.SCRAPER_SETTINGS;
        }
    } catch (e) { /* ignore */ }
    return {};
}

/** Configuration effective du solveur. */
export function getTurnstileSolverConfig() {
    const s = readSettings();
    const apiKey = typeof s.turnstileApiKey === 'string' ? s.turnstileApiKey.trim() : '';
    const service = (typeof s.turnstileService === 'string' ? s.turnstileService : 'capsolver').toLowerCase();
    // Double opt-in : toggle explicite ET clé renseignée.
    const enabled = s.turnstileEnabled === true || s.turnstileEnabled === 'true';
    return { enabled: enabled && apiKey.length > 0, service, apiKey };
}

export function isTurnstileSolverEnabled() {
    return getTurnstileSolverConfig().enabled;
}

/** Extrait la sitekey Turnstile d'une page (attribut ou appel JS). */
export function extractTurnstileSitekey(html) {
    const text = String(html || '');
    const patterns = [
        /data-sitekey=["']([^"']+)["']/,
        /turnstile\.render\([^)]*?sitekey\s*:\s*["']([^"']+)["']/,
        /sitekey\s*:\s*["']([^"']+)["']/,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1]) return m[1];
    }
    return null;
}

async function postJson(url, body, timeoutMs) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
                ? AbortSignal.timeout(timeoutMs)
                : undefined,
        });
        if (!res) return null;
        // CapSolver répond 400 avec un corps JSON utile (errorCode/errorId) :
        // on parse même quand `ok` est faux pour pouvoir loguer la cause.
        const json = await res.json().catch(() => null);
        return json && typeof json === 'object' ? json : null;
    } catch (e) {
        return null;
    }
}

async function getJson(url, timeoutMs) {
    try {
        const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
                ? AbortSignal.timeout(timeoutMs)
                : undefined,
        });
        if (!res) return null;
        const json = await res.json().catch(() => null);
        return json && typeof json === 'object' ? json : null;
    } catch (e) {
        return null;
    }
}

/** CapSolver : createTask → getTaskResult jusqu'à `solution.token`. */
async function solveWithCapSolver(apiKey, pageUrl, sitekey, deadline) {
    const created = await postJson('https://api.capsolver.com/createTask', {
        clientKey: apiKey,
        task: { type: 'AntiTurnstileTaskProxyLess', websiteURL: pageUrl, websiteKey: sitekey },
    }, 8000);
    if (!created || created.errorId || !created.taskId) {
        if (created && created.errorCode) console.warn(`[Turnstile] CapSolver refus: ${created.errorCode}`);
        return null;
    }
    while (Date.now() < deadline) {
        await delay(POLL_INTERVAL_MS);
        const res = await postJson('https://api.capsolver.com/getTaskResult', {
            clientKey: apiKey, taskId: created.taskId,
        }, 8000);
        if (!res) continue;
        if (res.status === 'ready' && res.solution && res.solution.token) return res.solution.token;
        if (res.errorId) {
            if (res.errorCode) console.warn(`[Turnstile] CapSolver erreur: ${res.errorCode}`);
            return null;
        }
    }
    return null;
}

/** 2Captcha : in.php (method=turnstile) → res.php jusqu'au token. */
async function solveWith2Captcha(apiKey, pageUrl, sitekey, deadline) {
    // 2Captcha attend un GET/POST form-urlencoded (pas de JSON).
    const form = `key=${encodeURIComponent(apiKey)}&method=turnstile&sitekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;
    const created = await getJson(`https://2captcha.com/in.php?${form}`, 8000);
    if (!created || created.status !== 1 || !created.request) {
        if (created && created.request) console.warn(`[Turnstile] 2Captcha refus: ${created.request}`);
        return null;
    }
    while (Date.now() < deadline) {
        await delay(POLL_INTERVAL_MS);
        const res = await getJson(
            `https://2captcha.com/res.php?key=${encodeURIComponent(apiKey)}&action=get&id=${encodeURIComponent(created.request)}&json=1`,
            8000
        );
        if (!res) continue;
        if (res.status === 1 && typeof res.request === 'string') return res.request;
        if (res.request && res.request !== 'CAPCHA_NOT_READY') {
            console.warn(`[Turnstile] 2Captcha erreur: ${res.request}`);
            return null;
        }
    }
    return null;
}

/**
 * Résout un challenge Turnstile et renvoie le token, ou null.
 * Jamais d'exception : toute erreur = null (le provider continue).
 * @param {{ pageUrl: string, sitekey?: string, html?: string, budgetMs?: number }} params
 * @returns {Promise<string|null>}
 */
export async function solveTurnstile({ pageUrl, sitekey, html, budgetMs } = {}) {
    const cfg = getTurnstileSolverConfig();
    if (!cfg.enabled) return null;
    if (!pageUrl || typeof pageUrl !== 'string') return null;
    const key = sitekey || extractTurnstileSitekey(html);
    if (!key) {
        console.warn('[Turnstile] Sitekey introuvable dans la page embed');
        return null;
    }
    const budget = Number(budgetMs) > 0 ? Number(budgetMs) : SOLVE_BUDGET_MS;
    const deadline = Date.now() + budget;
    try {
        const token = cfg.service === '2captcha'
            ? await solveWith2Captcha(cfg.apiKey, pageUrl, key, deadline)
            : await solveWithCapSolver(cfg.apiKey, pageUrl, key, deadline);
        if (token) console.log('[Turnstile] Challenge résolu par le solveur configuré');
        else console.warn('[Turnstile] Solveur: pas de token dans le budget imparti');
        return token || null;
    } catch (e) {
        return null;
    }
}
