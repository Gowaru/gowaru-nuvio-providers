import { safeFetch, sleep, isAborted } from '../utils/resolvers.js';
import { CONFIG } from './config.js';

let _currentSignal = null;
export function setCurrentSignal(signal) { _currentSignal = signal; }

const RETRY_DELAYS = [1000, 2000, 4000];

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${CONFIG.BASE_URL}/`,
};

function isCloudflareBlock(text) {
  if (!text) return false;
  return text.includes('error code: 1010') ||
         text.includes('cf-browser-verification') ||
         text.includes('Just a moment') ||
         text.includes('Checking your browser');
}

async function fetchFromDomain(domain, path, options = {}) {
  const signal = options.signal || _currentSignal;
  if (isAborted(signal)) return null;

  const url = (path && (path.startsWith('http://') || path.startsWith('https://')))
    ? path
    : `${domain}${path}`;
  const { headers: customHeaders, ...rest } = options;
  const retries = options.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (isAborted(signal)) return null;
    try {
      const res = await safeFetch(url, {
        headers: { ...HEADERS, ...(customHeaders || {}) },
        timeout: options.timeout ?? CONFIG.TIMEOUTS.PAGE,
        signal,
        ...rest,
      });

      if (!res) {
        console.log(`[DuLourd] No response from ${domain} (attempt ${attempt + 1})`);
        if (attempt < retries) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      const text = await res.text();

      if (isCloudflareBlock(text)) {
        console.log(`[DuLourd] Cloudflare block on ${domain} (attempt ${attempt + 1})`);
        if (attempt < retries) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      if (!res.ok) {
        const status = typeof res.status === 'number' ? res.status : 'no-response';
        if (status === 404) return '';
        console.log(`[DuLourd] HTTP ${status} on ${domain}`);
        if (attempt < retries) await sleep(RETRY_DELAYS[attempt] || 2000);
        continue;
      }

      return text;
    } catch (e) {
      console.log(`[DuLourd] Error on ${domain} (attempt ${attempt + 1}): ${e.message}`);
      if (attempt < retries) await sleep(RETRY_DELAYS[attempt] || 2000);
    }
  }
  return null;
}

export async function fetchText(urlOrPath, options = {}) {
  const domains = [CONFIG.BASE_URL, ...(CONFIG.DOMAINS || [])];
  for (const domain of domains) {
    const result = await fetchFromDomain(domain, urlOrPath, options);
    if (result) return result;
  }
  throw new Error(`[DuLourd] All domains failed for ${urlOrPath}`);
}

export async function fetchApi(id, xfield, options = {}) {
  const signal = options.signal || _currentSignal;
  if (isAborted(signal)) return null;

  const body = `id=${id}&xfield=${xfield}&action=playEpisode`;
  for (const domain of [CONFIG.BASE_URL, ...(CONFIG.DOMAINS || [])]) {
    if (isAborted(signal)) return null;

    const url = `${domain}${CONFIG.ENDPOINTS.seasonApi}`;
    try {
      const res = await safeFetch(url, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        timeout: options.timeout ?? CONFIG.TIMEOUTS.API,
        signal,
      });
      if (!res || !res.ok) continue;
      const text = await res.text();
      if (text && !isCloudflareBlock(text)) return text;
    } catch (e) {
      console.log(`[DuLourd] API error on ${domain}: ${e.message}`);
    }
  }
  return null;
}
