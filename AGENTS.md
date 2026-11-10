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
- **`mediaType`** : `'movie'` ou `'tv'` sur NuvioMobile (normalisé) ; NuvioTV envoie **`'series'`** quand l'entrée du manifeste déclare `supportedTypes:["series"]` (`PluginMediaType.jsPluginMediaType`). Aucun provider actuel ne le déclare, mais toute logique série doit tester `mediaType !== 'movie'` — jamais `=== 'tv'`. Helper : `isTvMediaType()` de `src/utils/resolvers.js` (utilisé par `search-fallback`, `metadata`, `dle-extractor`, `vostfree`, `frenchstream`, `anime-ultime`, `waveanime`).
- **Stream object**: Only `url` is required (non-blank, no "object" strings)
  - Optional: `title`, `name`, `quality`, `headers`, `provider`, `type`, `size`, `language`, `infoHash`, `seeders`, `peers`
  - `subtitles`: `[{ url, language, name, headers }]` — **supporté par les DEUX apps** : NuvioTV le parse (`PluginRuntime.parseSubtitles` → `Stream.subtitles`, puis `applyStreamMetadata`) et applique les `headers` **par sous-titre** ; NuvioMobile suit le même contrat (headers appliqués par `SubtitleRequestHeaderDataSource`). ⚠ Limite Mobile : le **lecteur externe** télécharge les sous-titres sans ces headers (`SubtitleFileCache`), donc préférer des URLs autonomes quand c'est possible. `language` défaut `"Unknown"` si absent → toujours le renseigner (`fra`, `eng`, …).
- **Headers**: Applied via the app playback proxy — `behaviorHints.proxyHeaders` (both apps) + `notWebReady=true` (NuvioMobile only); `Range` and `Accept-Encoding` are stripped by the runtime — do not rely on them
- **Language** : **aucune app ne filtre ni ne trie sur `language`** — le champ sert à l'affichage (`description = "size • language"` sur TV, sous-titre sur Mobile) et aux tokens `bingeGroup`. Normaliser quand même via `normalizeLanguageCode()` de `src/utils/resolvers.js` (fait automatiquement dans `resolveStream`/`toStream`) pour un affichage cohérent, et garder VF/VOSTFR dans le `title`
- **Size** : format parsable requis pour filtres/tri app — regex `\d+(,\d+)?\s*(TB|GB|MB|KB)`, ex. `"1.4 GB"`
- **`quality`** : NuvioTV ne calcule une valeur de tri que si la chaîne contient `4k`/`2160`, `1080`, `800`, `720`, `480` ou `360` (`parseQualityValue`) — `"FHD"`/`"HD"` donnent `-1` (pas de tri par qualité). Utiliser `1080p`, `720p`, `480p`… (fait par `resolveStream`)
- **Plafonds / dédup (vérifiés)** : NuvioTV fait `distinctBy { url }` sur **tous les providers** puis `take(150)` global → une URL émise deux fois disparaît (l'ordre des providers décide) ; NuvioMobile **ne déduplique pas** (doublons visibles). D'où `dedupeStreams()` (`URL|LANGUE`, rejette url vides/`[object`) appliqué par `createProvider` et par les 3 providers qui le contournent (`animesite`, `animevost-fr`, `voiranime-one`).
- **Champs rejetés silencieusement** : toute valeur contenant `[object` (title, url, quality...) est filtrée par `parseJsonResults` côté NuvioTV
- **`type`** : **sans effet sur NuvioTV** — le champ est bien parsé (`LocalScraperResult.type`) mais n'intervient pas dans la lecture : le type est déduit de l'URL/du player (un `.m3u8` reste lu en HLS sans `type`). **NuvioMobile l'utilise** (`PlaybackMediaItems.android.kt`) : `'hls'`/`'m3u8'` → HLS, `'dash'`/`'mpd'` → DASH, `'mp4'`/`'mkv'` → progressif — renseigner correctement reste donc utile (Mobile), sans jamais en dépendre pour TV
- **Manifest `disabledPlatforms`/`supportedPlatforms`**: NuvioTV parse les champs mais **ne les applique jamais**. NuvioMobile **applique réellement** le filtre (plateforme `"android"`/`"ios"`) : nos entrées actuelles `disabledPlatforms:["tv"]` restent donc actives sur Mobile, mais **ne jamais écrire `supportedPlatforms:["tv"]` ni `disabledPlatforms:["android"|"ios"]`** (masquerait le provider sur Mobile).
- **`hasSettings` + `onSettings`**: champ **requis dans `manifest.json`** pour que NuvioMobile affiche l'UI de réglages d'un provider exportant `onSettings` (helper `createSettingsLayout()` + lecture `getScraperSettings()` dans `src/utils/resolvers.js` ; layout : header/info/text/select/toggle). Pilotes : **movix** et **frenchstream**. NuvioTV ignore le champ (Gson) mais injecte `SCRAPER_SETTINGS` si défini.
- **Modèle de cache (important)** : chaque `getStreams` tourne dans une **instance QuickJS fraîche** (TV : `quickJs{}` par exécution ; Mobile : `JsRuntime()` par exécution — seul le bytecode des polyfills est partagé côté Kotlin) → **aucun état JS ne survit entre deux appels**. Les caches mémoire (`createCache`, cache GET 5 min de `safeFetch`, `_episodesCache`…) ne servent qu'**à l'intérieur d'une exécution** (dédup de requêtes identiques, normalisation de clé entre variantes de titres). Pas d'API de stockage exposée aux plugins. Leviers inter-appels : cache disque OkHttp (50 MB) de NuvioMobile Android pour les GET avec en-têtes HTTP cacheables, et single-flight côté NuvioTV (clé `scraperId:tmdbId:type:s:e`).

## Runtime Constraints (QuickJS)
- **Unavailable**: `Buffer`, `process` (les deux apps) ; `setTimeout`/`setInterval` **sur NuvioTV seulement** (polyfillés sur Mobile, cf. ci-dessous)
- **TextEncoder/TextDecoder**: Polyfilled **en JS pur** sur NuvioMobile (`JsBindings`, pas un bridge natif) — **absents de NuvioTV**. Guard avec `typeof TextEncoder !== 'undefined'` or avoid them entirely (string ops, `encodeURIComponent`, `atob`/`btoa` are polyfilled on both)
- **setTimeout/setInterval**: **polyfillés sur NuvioMobile** (dossés par coroutine, **plafonnés à 60 000 ms**) — **absents de NuvioTV** → code portable = ne jamais en dépendre (budget/time-guards maison)
- **AbortController/AbortSignal**: Polyfilled on both, but does **not** cancel the in-flight native fetch — NuvioMobile ignores `signal` entirely, NuvioTV only checks `aborted` before/after. Use budget/time-guards instead
- **Crypto**: `CryptoJS` via `require('crypto-js')` on both runtimes; `crypto.subtle` (WebCrypto: AES-GCM/CBC/ECB, HMAC, PBKDF2, SHA-1/256/384/512, RSA/ECDSA sign/verify) **additionally on NuvioMobile only**
- **`TMDB_API_KEY`**: Exposed as `globalThis.TMDB_API_KEY` sur **NuvioTV** (BuildConfig) **et sur NuvioMobile** (`TmdbSettingsRepository.effectiveApiKey()` = clé utilisateur si définie, sinon clé intégrée) — garder le fallback `typeof` + clé bundled dans `src/utils/metadata.js`
- **Require()**: `require()` runtime n'accepte que `cheerio` / `cheerio-without-node-native` / `react-native-cheerio` (→ **polyfill JS maison sur jsoup** de l'app) et `crypto-js` (bytecode précompilé, global `CryptoJS`) ; tout autre module **throw**. ⚠ **Statut cheerio (2026-10)** : les bundles déployés **inlinent la vraie cheerio** (build.js sans `external` depuis dc6e5d5, 29/04) — le polyfill n'est qu'un filet pour les `require()` dynamiques résiduels. La **vraie cheerio** (test Node sans `Buffer`/`TextDecoder`/`process`) gère `closest()`, `hasClass()`, `parent()`, `filter('.x')`. Les garde-fous "TV-safe" du code restent prudents (sans coût) ; revalider sur device avant de retirer les notes "polyfill jsoup".
- **Pièges du polyfill cheerio (si `require()` retombe dessus)** : `.filter('.sel')` est un **no-op** (seul `.filter(fn)` filtre), `.children(sel)` = `find(sel)` (descendants, pas enfants directs), `$( '<div>…</div>' )` renvoie `[]`, `.text()` sur plusieurs nœuds joint avec `" "`. Cache de documents limité à **8** : extraire les chaînes avant de parser une 9ᵉ page. Ces motifs n'existent pas dans nos providers : ne pas en introduire.
- **Polyfill cheerio NuvioTV — méthodes ABSENTES** (TypeError si utilisées) : `.closest()`, `.hasClass()`, `.siblings()`, `.parents()`, `.nextAll()`, `.prevAll()` ; `.parent()` retourne toujours vide. Feature-détecter (`typeof $(el).closest === 'function'`) ou éviter
- **Fetch limits**: 
  - Response body truncated at **1 MB d'octets**. Mobile ajoute **toujours** le suffixe `"\n...[truncated]"` ; **TV ne l'ajoute que pour la seconde coupure, en caractères (1 M)** — une page UTF-8 de 1 MB d'octets coupée à ~950 k caractères arrive **sans marqueur**. `safeFetch` détecte le suffixe, **plus** l'heuristique TV (HTML ≥ 700 k caractères qui ouvre `<html>` sans `</html>`), **refuse les corps HTML tronqués (return null)** et ne met **jamais** une réponse tronquée en cache. Helpers exportés : `isTruncatedBody()` / `RUNTIME_TRUNCATION_SUFFIX`. Les JSON tronqués restent livrés (garde-fous dédiés : `json()` throw → null ; `parseMaybeTruncatedJson` dans `dle-extractor.js`). Un manifest HLS tronqué → `expandStreamQualities` sert l'URL originale sans exploser.
  - Headers tronqués à **8 KB par valeur**, clés en minuscules **sur les deux apps**, valeurs jointes par `,`
  - `response.json()` returns `null` (not rejected) on parse failure → always guard
- **Timeouts** : **cap dur 60 s** par `getStreams` (à l'expiration le résultat est **jeté**, partiel compris) ; HTTP **30 s** (NuvioTV) / **60 s** (NuvioMobile) par requête. Budgets internes à viser : `PROVIDER_BUDGET_MS` = 45 s, `TV_BUDGET_MS` = 50 s — sortir avec du partiel avant le cap. Sur TV le fetch est bloquant : le temps total est la **somme** des RTT (`Promise.allSettled` ne parallélise rien)
- **User-Agent** : un UA court sans version Chrome est injecté si absent → souvent rejeté par Cloudflare. Toujours utiliser le UA Chrome complet (`USER_AGENT` de `src/utils/resolvers.js`)
- **Accept-Encoding** strippé par le runtime → OkHttp décompresse le gzip automatiquement (ne pas le définir)
- **`URLSearchParams` partiel** : `append()` écrase au lieu d'ajouter, `getAll()` ne renvoie qu'une valeur, `get()` renvoie `null`, et `url.searchParams.set(...)` **ne met pas à jour `url.href`** — construire la query à la main
- **Casse des en-têtes de requête** : TV/Mobile ajoutent leur UA par défaut si la clé n'est pas exactement `User-Agent` (comparaison sensible à la casse) et utilisent `Content-Type` par défaut sinon → toujours `User-Agent`, `Content-Type`, `Referer`, `Origin`
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

