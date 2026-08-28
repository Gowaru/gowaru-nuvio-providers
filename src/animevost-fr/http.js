const BASE = 'https://animevost.fr';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

async function fetchJson(path) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return null;
        const text = await res.text();
        try { return JSON.parse(text); } catch { return null; }
    } catch { return null; }
}

async function fetchText(path) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return null;
        return await res.text();
    } catch { return null; }
}

module.exports = { BASE, HEADERS, fetchJson, fetchText };
