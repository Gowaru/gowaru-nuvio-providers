# AGENTS.md

## Overview
Nuvio French streaming provider bundle (FR anime/movie/series providers). Providers are compiled from `src/` to `providers/` via esbuild. Runtime is **QuickJS** (via `quickjs-kt`), not Hermes or Node.js.

## RESPONSES
Keep responses concise and to the point in French - unless the user asks otherwise

## PLANNING MODE
- Always ask clarifying questions
- Never assume design, tech stack or features
- Use deep-dive sub-agents to assist with research
- Use deep-dive sub-agents to review the different aspects of your plan before presenting to the user

## CHANGE / EDIT MODE
- Never implement features yourself when possible - use sub-agents!
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently
- When using sub-agents to implement features, act as a coordinator only
- Use the best model for the task - premium models for complex tasks (like coding) and mid-tier models for simpler tasks, like documentation
- After completing features (large or small), always run commands like lint, type check and next build to check code quality

## Project Structure
- `src/<provider>/`: Source per provider
  - `index.js`: Must export `getStreams(tmdbId, mediaType, season, episode)`
  - `extractor.js`: HTML/API extraction logic
  - `http.js`: Per-provider `fetchText`/`fetchJson` wrappers (inject headers to avoid Cloudflare)
- `providers/`: **Compiled output — DO NOT EDIT** (bundled IIFE format)
- `src/utils/`: Shared helpers (`resolvers.js`, `logger.js`, `metadata.js`, `armsync.js`)

## Development Workflow
1. **Create provider**: Add folder in `src/` with `index.js` exporting `getStreams`
2. **Build**: 
   - `npm run build` (all providers)
   - `npm run build:minify` (CI uses this)
   - `node build.js <provider-id>` (single provider)
   - `node build.js --minify <provider-id>` (minified single)
3. **Test locally**:
   - `node -e "const {getStreams}=require('./providers/myprovider.js'); getStreams('550','movie').then(s=>console.log(JSON.stringify(s,null,2)))"`
4. **Dev server**: `npm run serve` (serves manifest/providers at `http://<local-ip>:3000`)

## Provider API
- `getStreams(tmdbId, mediaType, season, episode)` → `Promise<Array<Stream>>`
- **Stream object**: Only `url` is required (non-blank, no "object" strings)
  - Optional: `title`, `name`, `quality`, `headers`, `provider`, `type`, `size`, `language`, `infoHash`, `seeders`, `peers`
  - `subtitles`: `[{ url, language, name, headers }]` — **NuvioMobile only** (NuvioTV ignores the field entirely). `language` defaults to `"Unknown"` when absent → always set it (`fra`, `eng`, …). `headers` are applied per-subtitle by the app player.
- **Headers**: Applied via the app playback proxy — `behaviorHints.proxyHeaders` (both apps) + `notWebReady=true` (NuvioMobile only); `Range` and `Accept-Encoding` are stripped by the runtime — do not rely on them
- **Language** : NuvioTV compare `language` aux codes app (`fr`, `en`, `multi`, `ja`) — des valeurs comme `"VOSTFR"`/`"VF"` sont classées "Unknown" dans les filtres/tri. Toujours normaliser via `normalizeLanguageCode()` de `src/utils/resolvers.js` (fait automatiquement dans `resolveStream`) ; garder VF/VOSTFR dans le `title` pour l'affichage
- **Size** : format parsable requis pour filtres/tri app — regex `\d+(,\d+)?\s*(TB|GB|MB|KB)`, ex. `"1.4 GB"`
- **Champs rejetés silencieusement** : toute valeur contenant `[object` (title, url, quality...) est filtrée par `parseJsonResults` côté NuvioTV
- **`type` values**: `'dash'`/`'mpd'` → DASH (natively supported by ExoPlayer/Media3 on NuvioMobile Android **and** NuvioTV), `'hls'`/`'m3u8'` → HLS, `'mp4'`/`'mkv'` → progressive
- **Manifest `disabledPlatforms`/`supportedPlatforms`**: currently **inert** — NuvioMobile hardcodes its platform to `android`/`ios` (never matches `tv`), NuvioTV parses the fields but never applies them. Keep as documentation/future-proofing only.

## Runtime Constraints (QuickJS)
- **Unavailable**: `setTimeout`, `setInterval`, `Buffer`, `process`
- **TextEncoder/TextDecoder**: Polyfilled on **NuvioMobile** (native bridge) — **NOT available on NuvioTV**. Guard with `typeof TextEncoder !== 'undefined'` or avoid them entirely (string ops, `encodeURIComponent`, `atob`/`btoa` are polyfilled on both)
- **AbortController/AbortSignal**: Polyfilled on both, but does **not** cancel the in-flight native fetch — NuvioMobile ignores `signal` entirely, NuvioTV only checks `aborted` before/after. Use budget/time-guards instead
- **Crypto**: `CryptoJS` via `require('crypto-js')` on both runtimes; `crypto.subtle` (WebCrypto: AES-GCM/CBC/ECB, HMAC, PBKDF2, SHA-1/256/384/512, RSA/ECDSA sign/verify) **additionally on NuvioMobile only**
- **`TMDB_API_KEY`**: Exposed as `globalThis.TMDB_API_KEY` on **NuvioTV only** (not on Mobile) — use with `typeof` fallback
- **Require()**: `cheerio` = sur NuvioTV c'est un **polyfill JS maison sur jsoup**, pas la vraie cheerio; `crypto-js` (bytecode précompilé, global `CryptoJS`); tous les autres deps doivent être bundlés via esbuild
- **Polyfill cheerio NuvioTV — méthodes ABSENTES** (TypeError si utilisées) : `.closest()`, `.hasClass()`, `.siblings()`, `.parents()`, `.nextAll()`, `.prevAll()` ; `.parent()` retourne toujours vide. Feature-détecter (`typeof $(el).closest === 'function'`) ou éviter
- **Fetch limits**: 
  - Response body truncated at **1 MB** (both apps; 256 KB in older runtimes)
  - Headers truncated at **8 KB**, clés en minuscules sur Mobile, valeurs jointes par `,`
  - `response.json()` returns `null` (not rejected) on parse failure → always guard
- **Timeouts** : plugin **60 s** total, HTTP **30 s** connect/read/write → viser < 45 s par provider, paralléliser avec `Promise.allSettled`
- **User-Agent** : un UA court sans version Chrome est injecté si absent → souvent rejeté par Cloudflare. Toujours utiliser le UA Chrome complet (`USER_AGENT` de `src/utils/resolvers.js`)
- **Accept-Encoding** strippé par le runtime → OkHttp décompresse le gzip automatiquement (ne pas le définir)
- **POST** : Content-Type défaut runtime = `application/x-www-form-urlencoded` → toujours définir explicitement
- **Plugin timeout**: 60 seconds per scraper (scrapers run in parallel, each in its own isolated QuickJS instance)
- **Provider size limit**: 5 MB download limit

## Code Conventions
- Use `cheerio-without-node-native` (or `require('cheerio')`) for HTML parsing
  - No DOM manipulation (`.parent()` returns empty collection)
- Use per-provider `http.js` wrappers instead of raw `fetch` (adds required headers)
- Use `resolveStream` from `src/utils/resolvers.js` to process final URLs
- Build targets **ES2020** (QuickJS supports async/await natively)
- Update `manifest.json` when adding/removing providers (references `providers/<provider>.js`)

## Testing
- **Test script**: `node test_providers.js [provider1 provider2 ...]` (tests all if none specified)
- Use any testing tools, libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- If the project does not have any testing tools, scripts, MCP tools, skills, etc. available for testing, ask the user whether testing should be skipped.

