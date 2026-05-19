import { safeFetch } from '../utils/resolvers.js';
import { CONFIG } from './config.js';

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'X-Requested-With': 'XMLHttpRequest',
};

export async function fetchText(url, options = {}) {
  console.log(`[DuLourd] Fetching: ${url}`);
  const res = await safeFetch(url, {
    headers: { ...HEADERS, ...(options.headers || {}) },
    ...options,
  });
  if (!res || !res.ok) {
    const status = res && typeof res.status === 'number' ? res.status : 'no-response';
    throw new Error(`HTTP error ${status} for ${url}`);
  }
  return await res.text();
}

export async function fetchApi(id, xfield) {
  const url = CONFIG.BASE_URL + CONFIG.ENDPOINTS.seasonApi;
  console.log(`[DuLourd] API call: id=${id} xfield=${xfield}`);
  const res = await safeFetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `id=${id}&xfield=${xfield}&action=playEpisode`,
    timeout: CONFIG.TIMEOUTS.API,
  });
  if (!res || !res.ok) return null;
  return await res.text();
}
