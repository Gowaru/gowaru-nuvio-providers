# Nuvio Provider Development Guide

Comprehensive guide for building, testing, and publishing JavaScript streaming providers for the Nuvio app.

**Runtime:** QuickJS (via `quickjs-kt` bridge) — NOT Hermes, NOT React Native JSI.

---

## Table of Contents

1. [Architecture & Runtime](#1-architecture--runtime)
2. [Environment & Available APIs](#2-environment--available-apis)
3. [Provider API](#3-provider-api)
4. [Plugin Manifest](#4-plugin-manifest)
5. [Development Workflows](#5-development-workflows)
6. [Testing & Debugging](#6-testing--debugging)
7. [Security & Constraints](#7-security--constraints)
8. [Provider Templates](#8-provider-templates)
9. [Common Pitfalls](#9-common-pitfalls)
10. [Publishing](#10-publishing)

---

## 1. Architecture & Runtime

### 1.1 Execution Flow

```
User taps content → PluginManager.executeScrapers()
  → Filters enabled scrapers by mediaType
  → Launches concurrent JS + DEX scrapers (max 10)
  → PluginRuntime.executePlugin(code, tmdbId, mediaType, season, episode, scraperId, settings)
    → Creates QuickJS context (quickJs(parentDispatcher) { ... })
    → Injects polyfills (console, fetch, URL, cheerio, AbortController, atob/btoa)
    → Loads crypto-js@4.2.0 from WebJars
    → Wraps provider code in IIFE: (function() { ...code... })()
    → Calls getStreams(tmdbId, mediaType, season, episode)
    → Captures result via JSON.stringify → __capture_result()
  → Parses JSON → List<LocalScraperResult>
  → Returns to UI → Media3 ExoPlayer / AVPlayer playback
```

### 1.2 Runtime Details

| Aspect | Implementation |
|---|---|
| Engine | QuickJS via `com.dokar.quickjs:quickjs-kt` v1.0.5 |
| Context lifecycle | Created per `executePlugin()` call, destroyed after completion |
| Dispatcher | Inherits from caller (low-priority); fallback `Dispatchers.IO` |
| Sandboxing | No filesystem, no `require()` except `cheerio`/`crypto-js`, no `import` |
| Plugin timeout | 60 seconds (`PLUGIN_TIMEOUT_MS`) |
| Scraper outer timeout | 120 seconds (`SCRAPER_TIMEOUT_MS`) |
| Result capture | `__capture_result(jsonString)` stores result in local variable |
| Default User-Agent | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36` |

### 1.3 Flavors

| Flavor | Plugin Support | Package ID |
|---|---|---|
| `full` | Enabled | `com.nuvio.tv` |
| `playstore` | Disabled (no-op stubs) | `com.nuvio.app` |

---

## 2. Environment & Available APIs

### 2.1 Injected Globals

| API / Global | Source |
|---|---|
| `console.log / warn / error / info / debug` | Native bridge → `Log.d/e/w/i("Plugin:<scraperId>", ...)` |
| `fetch(url, options)` | JS polyfill → `__native_fetch` bridge → OkHttp |
| `URL(url, base)` | JS polyfill → `__parse_url` bridge |
| `URLSearchParams(init)` | JS polyfill (full implementation) |
| `AbortSignal / AbortController` | JS polyfill (minimal — `signal.aborted`, `addEventListener`, `abort()`) |
| `atob / btoa` | JS polyfill |
| `CryptoJS` (MD5, SHA1, SHA256, SHA512, HMAC\*, AES) | Real `crypto-js@4.2.0` from WebJars |
| `cheerio` | JS polyfill → Jsoup native parser |
| `Array.prototype.flat / flatMap` | JS polyfill |
| `Object.entries / fromEntries` | JS polyfill |
| `String.prototype.replaceAll` | JS polyfill |
| `globalThis.SCRAPER_ID` | String — current scraper identifier |
| `globalThis.SCRAPER_SETTINGS` | JSON object — user-defined settings |
| `globalThis.TMDB_API_KEY` | String — from BuildConfig |
| `globalThis.global / window / self` | Aliases to `globalThis` |
| `RegExp`, `JSON`, `Math`, `Date`, `Promise`, `async/await` | Native QuickJS |
| `TextDecoder / TextEncoder` | **Not available** |
| `setTimeout / setInterval` | **Not available** |
| `Buffer`, `process` | **Not available** |

### 2.2 Native Bridge Functions

These are called by polyfills, not directly by provider code:

| Function | Purpose |
|---|---|
| `__native_fetch(url, method, headersJson, body)` | Executes HTTP request via OkHttp |
| `__parse_url(urlString)` | URL parsing via Java `URL` |
| `__cheerio_load(html)` → docId | Parse HTML with Jsoup |
| `__cheerio_select(docId, selector)` → JSON array of element IDs | CSS selection |
| `__cheerio_find(docId, elementId, selector)` → JSON array | Selection within element |
| `__cheerio_text(docId, elementIds)` → string | Element text content |
| `__cheerio_html(docId, elementId)` → string | Element HTML |
| `__cheerio_attr(docId, elementId, attrName)` → string or `__UNDEFINED__` | Attribute value |
| `__cheerio_next(docId, elementId)` → elementId or `__NONE__` | Next sibling |
| `__cheerio_prev(docId, elementId)` → elementId or `__NONE__` | Previous sibling |
| `__capture_result(jsonString)` | Captures final result |

### 2.3 `fetch()` Polyfill

```javascript
async function fetch(url, options) {
  var result = __native_fetch(url, method, JSON.stringify(headers), body);
  var parsed = JSON.parse(result);
  return {
    ok: parsed.ok,
    status: parsed.status,   // 0 if failed
    statusText: parsed.statusText,
    headers: { get: function(name) { return parsed.headers[name.toLowerCase()] || null; } },
    text: function() { return Promise.resolve(parsed.body); },
    json: function() {
      try { return Promise.resolve(JSON.parse(parsed.body)); }
      catch (e) { return Promise.resolve(null); }   // returns null on parse failure!
    }
  };
}
```

**Limitations:**
- Response body truncated at **256 KB** (bytes and chars)
- Header values truncated at **8 KB**
- No `response.body.getReader()`, `response.clone()`, `response.headers.entries()`
- No `AbortSignal.timeout()`
- `response.json()` returns `null` (not rejected promise) on parse error

### 2.4 `cheerio` API

Full cheerio-compatible API via Jsoup. `require('cheerio')`, `require('cheerio-without-node-native')`, and `require('react-native-cheerio')` all return the same object.

```javascript
const $ = cheerio.load('<html>...</html>');
$('selector').text() / .html() / .attr('name') / .find('sub')
$('selector').each((i, el) => {}) / .first() / .last() / .eq(i)
$('selector').next() / .prev() / .children() / .parent()
$('selector').map((i, el) => result) / .filter(fn) / .toArray()
$.html() / $.html(element)
```

**Limitations:**
- No DOM manipulation (`append`, `remove`, `addClass`, etc.)
- `.parent()` always returns empty collection
- `:contains("text")` selectors work (quotes are transpiled for Jsoup)

### 2.5 Available `require()` Modules

| Module | Result |
|---|---|
| `require('cheerio')` and aliases | Returns cheerio object |
| `require('crypto-js')` | Returns CryptoJS object (throws if WebJars failed to load) |
| Anything else | Throws `Error("Module '...' is not available")` |

---

## 3. Provider API

### 3.1 `getStreams` Function Signature

```javascript
/**
 * @param {string}  tmdbId     - TMDB ID (e.g. "550"). IMDb IDs are auto-resolved.
 * @param {string}  mediaType  - "movie" or "tv". "series"/"show" normalized to "tv".
 * @param {number}  [season]   - 1-based, null/undefined for movies
 * @param {number}  [episode]  - 1-based, null/undefined for movies
 * @returns {Promise<Array>}   - Array of stream objects
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  // ... your logic ...
}
```

May be exported as `module.exports.getStreams` (CommonJS) or defined as a global function `function getStreams(...)`. Both are detected at runtime.

### 3.2 Stream Object

```javascript
{
  "name": "MyProvider",            // Short identifier
  "title": "1080p Stream",         // Display name (required, fallback to name)
  "url": "https://server.com/...", // Playable URL (required)
  "quality": "1080p",              // 4K, 1080p, 720p, CAM, etc.
  "headers": {                     // Applied to player HTTP requests
    "User-Agent": "Mozilla/5.0 ...",
    "Referer": "https://source.com/",
    "Cookie": "session=abc123",
    "Authorization": "Bearer ..."
  },
  "size": "2.5GB",                 // Display file size
  "language": "en",                // Audio language
  "provider": "source_name",       // Source label
  "type": "hls",                   // "hls", "mp4", "mkv", etc.
  "seeders": 42, "peers": 10,      // For P2P
  "infoHash": "abc..."             // For BitTorrent
}
```

**Required:** `url` only (non-blank, must not contain "[object").

### 3.3 Headers Handling

Headers returned in the stream object are forwarded to the native player (ExoPlayer/AVPlayer) via `ProxyHeaders`. `Accept-Encoding` is always stripped by the native layer. A default `User-Agent` is added if absent.

---

## 4. Plugin Manifest

```json
{
  "name": "My Repository",
  "version": "1.0.0",
  "description": "A collection of providers",
  "author": "Dev Name",
  "scrapers": [
    {
      "id": "myprovider",
      "name": "MyProvider",
      "filename": "myprovider.js",
      "supportedTypes": ["movie", "tv"],
      "enabled": true,
      "logo": "https://example.com/logo.png",
      "contentLanguage": ["en", "fr"],
      "supportedFormats": ["hls", "mp4"],
      "supportsExternalPlayer": false,
      "limited": false
    }
  ]
}
```

### 4.1 Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | — | Unique identifier (alphanumeric) |
| `name` | string | — | Display name |
| `filename` | string | — | Relative path or absolute URL |
| `supportedTypes` | string[] | `["movie", "tv"]` | Media types supported |
| `enabled` | bool | `true` | Enabled by default |
| `version` | string | — | Semantic version |
| `supportedPlatforms` | string[] | null | Parsed but **not currently filtered** by runtime |
| `disabledPlatforms` | string[] | null | Parsed but **not currently filtered** by runtime |
| `formats` / `supportedFormats` | string[] | null | Stream formats |
| `supportsExternalPlayer` | bool | null | External player support |
| `limited` | bool | null | Limitation marker |
| `logo` | string | null | Provider logo URL |
| `contentLanguage` | string[] | null | Supported languages |

### 4.2 Filename Resolution

- Relative filename (`"myprovider.js"`) → `{baseUrl}/myprovider.js`
- Absolute URL (`"https://..."`) → used as-is
- `baseUrl` = `manifestUrl.substringBeforeLast("/")`

### 4.3 Scraper ID

Format: `{repoId}:{scraper.id}` (e.g. `https:__example.com_repo:myprovider`)

---

## 5. Development Workflows

### 5.1 Multi-File Workflow (Recommended)

For complex providers with multiple modules. Requires the **separate** `nuvio-providers` repository.

1. Develop in `src/myprovider/`:
   ```javascript
   // src/myprovider/index.js
   import { extractStreams } from './extractor.js';
   async function getStreams(tmdbId, mediaType, season, episode) {
     return await extractStreams(tmdbId, mediaType);
   }
   export { getStreams };
   ```

2. Build with esbuild:
   ```bash
   node build.js myprovider
   ```
   Output: `providers/myprovider.js` (bundled)

### 5.2 Single-File Workflow

Write directly to `providers/myprovider.js`. No build step needed.

### 5.3 Repository Structure

```
my-provider-repo/
├── manifest.json
├── providers/
│   └── myprovider.js
├── src/                     # (Optional) Multi-file sources
│   └── myprovider/
│       ├── index.js
│       └── extractor.js
├── build.js                 # Build script (external repo)
└── package.json
```

### 5.4 Build System

`build.js` is maintained in the **separate** `nuvio-providers` repository. NuvioTV contains no build scripts.

**Commands:**
| Command | Description |
|---|---|
| `node build.js` | Build all providers from `src/` |
| `node build.js myprovider` | Build specific provider |
| `node build.js --minify myprovider` | Build with minification |
| `npm run build:watch` | Watch mode |

**Typical esbuild config:**
```javascript
require('esbuild').build({
  entryPoints: [`src/${name}/index.js`],
  bundle: true,
  format: 'iife',
  platform: 'neutral',
  target: 'es2020',        // preserves async/await
  globalName: 'module',
  outfile: `providers/${name}.js`,
  minify: options.minify,
});
```

QuickJS supports `async/await` natively. Use `target: 'es2016'` only if targeting older runtimes (transpiles to generators).

### 5.5 Size Limits

| Limit | Value |
|---|---|
| Response body (fetch) | 256 KB (truncated) |
| Header value | 8 KB (truncated) |
| Provider code download | 5 MB (rejected if larger) |

---

## 6. Testing & Debugging

### 6.1 Local Testing (Node.js)

```bash
node -e "const {getStreams}=require('./providers/myprovider.js'); getStreams('550','movie').then(s=>console.log(JSON.stringify(s,null,2)))"
```

**Caveat:** V8 and QuickJS differ in regex, string encoding, error stack format. Always test in-app.

### 6.2 In-App Testing (Plugin Tester)

1. Build the `full` flavor: `./gradlew assembleFullDebug`
2. Serve your repo: `npm start` (default port 3000)
3. Open Nuvio → **Settings** → **Plugin Tester**
4. Enter your manifest URL: `http://192.168.1.5:3000/manifest.json`

**Debug features:**
- **Logs tab:** All `console.log/warn/error` tagged with `Plugin:<scraperId>`
- **Results tab:** Parsed stream objects
- **Playback button:** Direct playback with your headers
- **No hot reload:** Rebuild + reload required

### 6.3 Console Logging

| Console method | Android Log | Tag |
|---|---|---|
| `console.log / debug` | `Log.d` | `Plugin:<scraperId>` |
| `console.info` | `Log.i` | `Plugin:<scraperId>` |
| `console.warn` | `Log.w` | `Plugin:<scraperId>` |
| `console.error` | `Log.e` | `Plugin:<scraperId>` |

Logcat filter: `adb logcat -s "Plugin:*"`

---

## 7. Security & Constraints

### 6.1 Timeouts

| Limit | Value | Source |
|---|---|---|
| JS plugin execution | 60s | `PluginRuntime.kt` |
| Full scraper lifecycle | 120s | `PluginManager.kt` |
| HTTP connect / read / write | 30s each | `PluginRuntime.kt` |

### 6.2 Network

- **Proxy:** `NO_PROXY` configured
- **DNS:** IPv4-first custom resolver
- **Redirects:** Followed by default (HTTP + SSL)
- **Accept-Encoding:** Always stripped (OkHttp handles decompression natively)
- **Cookies:** No automatic storage — must be set manually
- **CORS:** Not applicable (native HTTP client)
- **Content-Type:** Uses `ByteArray.toRequestBody()` to prevent OkHttp from appending `; charset=utf-8` (important for HMAC-signed requests)

### 6.3 Sandboxing

- No filesystem access
- No network access except through `fetch()` polyfill
- `eval()` supported but discouraged
- No access to React Native / JSI / native modules
- Runs on low-priority background dispatcher

### 6.4 VideoEasy Blocking

Scrapers whose id, name, or filename contains "VideoEasy" (case-insensitive) are automatically blocked.

---

## 8. Provider Templates

### Minimal

```javascript
async function getStreams(tmdbId, mediaType, season, episode) {
  const streams = [];
  try {
    const resp = await fetch(`https://api.example.com/stream?tmdb=${tmdbId}&type=${mediaType}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!resp.ok) return streams;
    const data = await resp.json();
    for (const item of data.sources || []) {
      streams.push({
        name: 'Example',
        title: `${item.quality} • example.com`,
        url: item.url,
        quality: item.quality,
        headers: { 'Referer': 'https://example.com/', 'User-Agent': 'Mozilla/5.0' }
      });
    }
  } catch (e) { console.error('Error:', e.message); }
  return streams;
}
```

### With cheerio

```javascript
async function getStreams(tmdbId, mediaType, season, episode) {
  const streams = [];
  const resp = await fetch(`https://example.com/${mediaType}/${tmdbId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!resp.ok) return streams;
  const $ = cheerio.load(await resp.text());
  $('.source-item').each((i, el) => {
    const link = $(el).find('a').attr('href');
    const quality = $(el).find('.quality').text();
    if (link && quality) {
      streams.push({
        name: 'Example', title: `${quality}`,
        url: link.startsWith('http') ? link : `https://example.com${link}`,
        quality, headers: { 'Referer': 'https://example.com/' }
      });
    }
  });
  return streams;
}
```

### With CryptoJS

```javascript
async function getStreams(tmdbId, mediaType, season, episode) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const hash = CryptoJS.SHA256(tmdbId + ts + 'secret-key').toString(CryptoJS.enc.Hex);
  const resp = await fetch('https://api.example.com/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: tmdbId, type: mediaType, ts, hash })
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.sources.map(s => ({
    name: 'Example', title: s.quality, url: s.url,
    quality: s.quality, headers: { 'Authorization': `Bearer ${s.token}` }
  }));
}
```

### Parallel fetch

```javascript
async function getStreams(tmdbId, mediaType, season, episode) {
  const results = await Promise.allSettled(
    ['https://api1.example.com', 'https://api2.example.com'].map(async (base) => {
      const resp = await fetch(`${base}/stream/${tmdbId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!resp.ok) return [];
      return (await resp.json()).sources || [];
    })
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}
```

### With settings access

```javascript
async function getStreams(tmdbId, mediaType, season, episode) {
  const settings = globalThis.SCRAPER_SETTINGS || {};
  const domain = settings.domain || 'https://default.example.com';
  console.log('Scraper:', globalThis.SCRAPER_ID, 'Domain:', domain);
  // TMDB_API_KEY is available as: globalThis.TMDB_API_KEY
  // ...
}
```

---

## 9. Common Pitfalls

**`setTimeout` / `setInterval` not available.** Use a busy-wait Promise-based delay (blocks the JS thread):
```javascript
const delay = ms => new Promise(resolve => {
  const start = Date.now();
  (function check() { if (Date.now() - start >= ms) resolve(); else check(); })();
});
```

**`response.json()` returns `null` on failed parse** instead of rejecting. Always guard:
```javascript
const data = await resp.json();
if (!data) return [];
```

**fetch body truncated at 256 KB.** The response is silently truncated with `...[truncated]`. cheerio receives the already-truncated string.

**`require('unknown-module')` throws.** Bundle all dependencies with esbuild `bundle: true`. Only `cheerio` and `crypto-js` are available at runtime.

**Headers in stream object vs fetch call.** Only stream-level `headers` are sent to the video player. `fetch()` headers apply only to the provider's own requests.

**V8 vs QuickJS differences:**
- `TextDecoder`/`TextEncoder` unavailable
- `RegExp` lookbehind may differ
- No `Buffer`, `process`, `setImmediate`
- `Error.stack` format differs
- Always test in-app

---

## 10. Publishing

### Checklist

- [ ] `manifest.json` is valid JSON with all required fields
- [ ] All referenced provider files exist
- [ ] `supportedTypes` matches actual media types
- [ ] `filename` paths are correct (relative or absolute)
- [ ] Tested in Plugin Tester (not just Node.js)
- [ ] Console.log statements minimized for production
- [ ] Provider code size under 5 MB

### Versioning

Update `version` in `manifest.json` when providers change. The app refreshes on restart and pull-to-refresh. Cached provider code is stored per-profile in `plugin_code` (primary) or `plugin_code_p{id}` directories.
