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

| Aspect | NuvioTV | NuvioMobile |
|---|---|---|
| Engine | QuickJS via `quickjs-kt` **1.0.5** (AAR `-nuvio`) | QuickJS via `quickjs-kt` **1.0.15** |
| Context lifecycle | Created per `executePlugin()` call, destroyed after completion (both) | same |
| Dispatcher | Inherits caller (low-priority pool, 10 threads); fallback `Dispatchers.IO` | `pluginDispatcher`, 10 threads, `THREAD_PRIORITY_BACKGROUND` |
| Sandboxing | No filesystem, no `require()` except `cheerio`/`crypto-js`, no `import` (both) | same |
| Plugin timeout | 60 s coroutine (`PLUGIN_TIMEOUT_MS`), **plus** scraper outer 120 s (`SCRAPER_TIMEOUT_MS`) | 60 s coroutine **+** `evaluationTimeoutMillis = 60 s` |
| **`fetch()` bridge** | **Synchronous / blocking** (`function("__native_fetch")`) → `Promise.all` runs **sequentially** | **Async** (`asyncFunction`) → real parallelism |
| Timers (`setTimeout`/`setInterval`) | **Absent** | Polyfilled via `__plugin_sleep` (coroutine delay, capped 60 s) |
| `TextEncoder`/`TextDecoder`, `crypto.subtle` | **Absent** | Polyfilled (native crypto bridge) |
| Response body limit | 1 MB **bytes** (suffix only when > 1 M chars) | 1 MB bytes + suffix `\n...[truncated]` |
| HTML parser | cheerio polyfill → **jsoup**, 8 docs cached | cheerio polyfill → **Ksoup**, 8 docs cached |
| Result capture | `__capture_result(jsonString)` stores result in local variable | same |
| Default User-Agent (injected if absent) | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36` (short — often rejected by Cloudflare → always set your own) | same |

> **⚠️ Conséquence n°1 : sur NuvioTV il n'y a AUCUNE parallélisation réseau.**
> Le bridge `__native_fetch` bloque la pile JS : `Promise.all`, `fetchBatch()`,
> `Promise.allSettled()` s'exécutent **en série**, et les `sleep()` attendent en
> busy-wait microtask (CPU brûlé). Le budget se calcule donc en **somme des RTT**,
> pas en RTT max. C'est le principal levier d'optimisation des providers.

### 1.3 Flavors

| Flavor | Plugin Support | Package ID | OkHttp timeout | Response raw limit |
|---|---|---|---|---|
| `full` (NuvioTV) | Enabled | `com.nuvio.tv` | **30s** | **1 MB** (byte-capped) |
| `full` (NuvioMobile) | Enabled | `com.nuvio.app` | **60s** | **1 MB** |
| `playstore` (NuvioMobile) | Disabled (no-op stubs) | `com.nuvio.app` | N/A | N/A |

**⚠️ Critical Difference:** NuvioTV has OkHttp timeouts **2x shorter** than NuvioMobile (30s vs. 60s), **no JS timers** (so a plugin-side `withTimeout()`/`safeFetch({ timeout })` cannot bound a request) and a **blocking fetch bridge**. A request that hangs up to 30s will succeed on Mobile (bounded by our own race) but will silently consume 30s of the 60s plugin budget on TV. Providers must be designed for the TV window (30s per request, ~10s to be usable in auto-play, 60s total plugin).

---

## 2. Environment & Available APIs

### 2.1 Injected Globals

| API / Global | Source |
|---|---|
| `console.log / warn / error / info / debug` | Native bridge → `Log.d/e/w/i("Plugin:<scraperId>", ...)` |
| `fetch(url, options)` | JS polyfill → `__native_fetch` bridge → OkHttp |
| `URL(url, base)` | JS polyfill → `__parse_url` bridge |
| `URLSearchParams(init)` | JS polyfill **partiel** : `append()` écrase, `getAll()` mono-valeur, `get()` → `null`, et `set()` ne met pas à jour `url.href` |
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
| `TextDecoder / TextEncoder` | **TV: Not available** · **Mobile: polyfilled** |
| `setTimeout / setInterval / clearTimeout` | **TV: Not available** · **Mobile: polyfilled** (coroutine delay, cap 60 s) |
| `crypto.subtle` (WebCrypto) | **TV: Not available** · **Mobile: available** |
| `Buffer`, `process` | **Not available** (both) |

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
// NuvioTV — SYNCHRONE : l'appel natif bloque le thread JS jusqu'à la réponse
var fetch = async function(url, options) {
  var result = __native_fetch(url, method, JSON.stringify(headers), body.kind, body.value, followRedirects);
  var parsed = JSON.parse(result);
  return {
    ok: parsed.ok,
    status: parsed.status,   // 0 si échec réseau (jamais de throw)
    statusText: parsed.statusText,
    url: parsed.url,         // URL finale après redirections
    headers: { get: function(name) { return parsed.headers[name.toLowerCase()] || null; } },
    arrayBuffer: ...,
    text: function() { return Promise.resolve(parsed.body); },
    json: function() {
      try { return Promise.resolve(JSON.parse(parsed.body)); }
      catch (e) { return Promise.resolve(null); }   // renvoie null, ne rejette pas
    }
  };
};

// NuvioMobile — ASYNCHRONE : les requêtes se chevauchent réellement
var result = await __native_fetch(url, method, /* … */);
```

**Limitations (les deux apps) :**
- Body tronqué à **1 MB** (octets) ; Mobile ajoute toujours le suffixe `\n...[truncated]`, TV seulement si le texte dépasse 1 M de caractères (corps multi-octets tronqué **sans** suffixe)
- **Les en-têtes de réponse n'exposent QUE `headers.get(name)`** — `res.headers['content-type']` est **toujours `undefined`** (utiliser `getResponseHeader()` de `resolvers.js`)
- Header values truncated at **8 KB** ; clés en minuscules sur les deux apps
- **Erreur réseau ≠ throw** : `ok:false`, `status:0`, body vide → traiter `status === 0` comme un échec
- No `response.body.getReader()`, `response.clone()`, `response.headers.entries()`
- **`AbortSignal.timeout()` est absent** (les deux apps) et le polyfill `AbortController` n'annule **pas** la requête en vol : le `timeout` de `safeFetch()` n'a d'effet que si le runtime a des **timers**
  - **Mobile** : `setTimeout` existe → notre `Promise.race` (withTimeout) borne réellement
  - **TV** : aucun timer → aucun timeout JS ; seul OkHttp (30 s) coupe. Un host muet peut donc consommer 30 s du budget
- `response.json()` returns `null` (not rejected promise) on parse error

### 2.4 `cheerio` API

API **proche** de cheerio, implémentée au-dessus de Jsoup (le pont natif) — pas la vraie cheerio : voir les lacunes ci-dessous. `require('cheerio')`, `require('cheerio-without-node-native')` et `require('react-native-cheerio')` renvoient le même objet. Les bundles déployés **inlinent la vraie cheerio**, donc les lacunes ne s'appliquent qu'au chemin de secours (require dynamique).

```javascript
const $ = cheerio.load('<html>...</html>');
$('selector').text() / .html() / .attr('name') / .find('sub')
$('selector').each((i, el) => {}) / .first() / .last() / .eq(i)
$('selector').next() / .prev() / .children() / .parent()
$('selector').map((i, el) => result) / .filter(fn) / .toArray()
$.html() / $.html(element)
```

**Limitations (les deux apps — mêmes lacunes) :**
- No DOM manipulation (`append`, `remove`, `addClass`, etc.)
- `.parent()` always returns empty collection
- **`.closest()`, `.hasClass()`, `.siblings()`, `.parents()`, `.nextAll()`, `.prevAll()`, `.is()`, `.not()`, `.add()` n'existent pas** → `TypeError`. Feature-détecter : `typeof $(el).closest === 'function'`
- **`.filter('selector')` ne filtre RIEN** : seule la forme `.filter(function)` fonctionne (sinon la collection est renvoyée telle quelle — bug silencieux)
- `.children()` = **`find('*')`** → tous les descendants, pas seulement les enfants directs
- `.text()` sur plusieurs éléments les joint par un **espace** (cheerio natif : sans séparateur)
- `.map()` renvoie un objet `{ length, get(i), toArray() }` (pas un tableau)
- `$('<div>…</div>')` (fragment HTML) renvoie **`[]`** — parser la chaîne complète puis sélectionner
- Cache de documents limité à **8** : un 9ᵉ `cheerio.load()` invalide les wrappers du 1er (extractions vides, sans erreur) → extraire les chaînes avant de charger une nouvelle page
- `:contains("text")` selectors work (quotes are transpiled for Jsoup) — **insensible à la casse** côté jsoup, contrairement à cheerio

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
 * @param {string}  tmdbId     - TMDB ID (e.g. "550"). Voir « formats d'ID » ci-dessous.
 * @param {string}  mediaType  - "movie" ou "tv" (Mobile normalise toujours). TV peut envoyer "series" (voir ci-dessous).
 * @param {number}  [season]   - 1-based ; **null pour un épisode ABSOLU** (anime)
 * @param {number}  [episode]  - 1-based, null/undefined pour un film
 * @returns {Promise<Array>}   - Array of stream objects
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  // ... your logic ...
}
```

#### Formats d'ID réellement reçus

| Entrée | Fréquence | Traitement |
|---|---|---|
| `"550"` (TMDB numérique) | cas normal | — |
| `"kitsu:6448"` / `"kitsu:6448:68"` | anime sans ID TMDB | résolu via l'API Kitsu (`getTmdbTitles`) |
| `"mal:40748"`, `"anilist:113415"` | anime (trackers) | résolu via AniList → TMDB (UA non-navigateur requis, cf. §9) |
| `"anidb:…"`, `"tvdb:…"` | rare | **non résolvable → échec rapide** (aucune requête TMDB) |
| `"tt0245429"` | IMDb non convertible par l'app | résolu via TMDB `/find?external_source=imdb_id` |
| `"tmdb:129"`, `"movie:129"` | préfixé (défensif) | préfixe retiré |

#### `mediaType = "series"` (NuvioTV seulement, vérifié)

`PluginManager.executeJsScraper()` passe `jsPluginMediaType(mediaType, supportedTypes, season, episode)` :
si la requête est une série **et** que l'entrée du manifeste déclare `series` dans `supportedTypes`,
le plugin reçoit **`"series"`** au lieu de `"tv"`. NuvioMobile normalise toujours en `tv`/`movie`
(`normalizePluginType`).

- Aucun provider de ce dépôt ne déclare `series` → le cas ne se produit pas aujourd'hui.
- Si on en ajoute un, toute logique série doit tester **`mediaType !== 'movie'`** (helper `isTvMediaType()`
  de `resolvers.js`), jamais `=== 'tv'` — sinon le provider bascule en mode film.
- `resolveTargetEpisodes()` (`dle-extractor.js`) accepte désormais `tv` **et** `series`.

**Épisodes absolus :** pour un ID traceur (`kitsu:`/`mal:`/…), NuvioTV envoie
`season = null` et le numéro d'épisode absolu (`kitsu:6448:68` → `episode = 68`)
— gérer explicitement `season == null` (listes d'épisodes à plat, une seule saison).

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
  "infoHash": "abc...",            // For BitTorrent
  "subtitles": [                   // Lu par les DEUX apps (voir ci-dessous)
    {
      "url": "https://cdn.example.com/fr.vtt",
      "language": "fra",
      "name": "Français",
      "headers": { "Referer": "https://source.com/" }
    }
  ]
}
```

**Required:** `url` only (non-blank, must not contain "[object").

#### `size` — le parseur réel de l'app (vérifié dans le code source)

**NuvioTV lit le champ `size` depuis le texte, pas depuis un champ structuré.** Le
chemin réel (code app vérifié) :

1. `PluginRuntime.parseJsonResults()` lit `item.size` **en chaîne** (`LocalScraperResult.size: String?`) — aucun champ numérique n'est lu côté plugin.
2. `StreamRepositoryImpl.buildDescription()` construit le `description` du stream : `size • language` (la `quality` va dans le **nom** du stream, pas dans la description).
3. `StreamTextSizeParser.effectiveSizeBytes(stream)` résout la taille par cette chaîne de priorité :
   `clientResolve.stream.raw.size` → `behaviorHints.videoSize` → `debridCacheStatus.cachedSize` → **texte de `description`, puis `title`, puis `name`**.
   Pour un stream de plugin, seul le 4ᵉ maillon est atteint → c'est notre chaîne `"size • language"` qui est parsée.
4. Le parseur (Kotlin) est :

   ```kotlin
   // NuvioTV — core/debrid/StreamTextSizeParser.kt
   private val SIZE_REGEX = Regex(
       """(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB)\b""",
       RegexOption.IGNORE_CASE
   )
   ```

   Équivalent JS : `/(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB)\b/i` — **sans ancrage**, comme `Regex.find()` en
   Kotlin : `text.match(re)` renvoie le **premier match** où qu'il apparaisse. La valeur est alors multipliée
   par `1024^4|3|2|1` (TB/GB/MB/KB, base **1024**, pas 1000), convertie en `Long`, et **rejetée si `<= 0`**
   (ex. `formatSizeBytes(1)` → `"0 KB"` → parsé à 0 → taille ignorée).

**Conséquences pratiques :**

| Règle | Détail |
|---|---|
| Décimales acceptées | `.` **et** `,` — `"3.55 GB"`, `"2,4 GB"` et `"1.81GB"` (sans espace) marchent |
| Casse | indifférente (`gb`, `Gb`, `GB`) |
| Espaces | optionnels : `"512KB"` = `"512 KB"` |
| Unités limitées | `TB\|GB\|MB\|KB` uniquement : `"256 MB"` ok, `"0.3 GB"` ok, mais `"256 MiB"`, `"256 Mo"`, `"1 Go"` → **non parsable** |
| `\b` après l'unité | le texte doit s'arrêter juste après l'unité : `"320kbps"` (kb suivi de ps), `"2160p"`, `"x265.10bit"` **ne matchent pas** |
| **Premier match gagne** | si un autre nombre+unité apparaît **avant** la taille dans `description`/`title`/`name`, c'est lui qui est lu |
| `quality` n'est jamais parsée | la `quality` va dans le **nom** du stream sur TV ; seul `description`→`title`→`name` l'est |

Cas des tests officiels de l'app (`StreamTextSizeParserTest.kt`) : `"👤 12 💾 1.81 GB ⚙️ TPB"` → 1.81 GiB,
`"💾 2,4 GB"` → 2.4 GiB, `"512KB"` → 512 KiB, `"1.5 TB"` → 1.5 TiB ; rejetés : `"Movie.2024.2160p.x265.10bit"`, `"audio 320kbps AAC"`.

**NuvioMobile ne parse PAS `size`** : `PluginRuntimeResult.toStreamItem()` le place tel quel
au sous-titre (`description = "quality • size • language"`), et le badge de taille
(`StreamFileSizeBadge`, réglable) n'affiche que `behaviorHints.videoSize` **en octets**,
qu'un plugin ne peut pas fournir. Donc `size` sert à l'affichage Mobile **et au tri/filtre TV** —
un format parsable n'est pas cosmétique, c'est la condition pour que le tri par taille de
NuvioTV fonctionne. Le helper `formatSizeBytes(bytes)` de `resolvers.js` (appelé par
`fetchVideoSize()`) produit déjà ce format (`"1.4 GB"`, décimale `.`) ; voir §9 (audit `size`).

> **💡 `toStream()` injecte `name` automatiquement**
>
> La fabrique partagée `toStream(url, language, providerName, siteUrl, opts)`
> (src/utils/dle-extractor.js) définit d'office `name: ${providerName} (${language})`
> (ex: `"Coflix (VF)"`), en plus de `title`, `quality` (défaut `"HD"`), `language`
> et des `headers` Referer/Origin/User-Agent. `resolveStream()` (src/utils/resolvers.js)
> préserve `name` dans tous ses chemins de retour (spreads `{ ...stream }`).
>
> **Convention : préférer `toStream()` à toute construction d'objet stream manuelle** —
> un provider qui passe par cette fabrique a donc `name` même si aucun `name:` n'apparaît
> dans son extracteur (voir aussi §9).

#### `subtitles`, `language`, `type` — contrat réel (vérifié dans les sources des apps)

| Champ | NuvioTV | NuvioMobile |
|---|---|---|
| `subtitles` | **Lu** : `PluginRuntime.parseSubtitles()` → `Stream.subtitles`, puis `applyStreamMetadata()` ; les `headers` sont appliqués **par sous-titre** | **Lu** : même contrat |
| `language` | **Jamais filtré ni trié** : affiché (`description = "size • language"`) et utilisé pour les tokens `bingeGroup` | Idem (affichage + sous-titre de la ligne) |
| `type` | **Sans effet** : le champ est parsé (`LocalScraperResult.type`) mais n'intervient pas dans la lecture — le type est déduit de l'URL par le player (un `.m3u8` reste lu en HLS) | **Utilisé** : `PlaybackMediaItems.android.kt` mappe `hls`/`m3u8` → HLS, `dash`/`mpd` → DASH, le reste → progressif |

**Conséquences :**

- `subtitles: [{ url, language, name, headers }]` est utile sur **les deux** apps : ne pas réserver la fonctionnalité à Mobile. Sans `language`, l'app affiche `"Unknown"` → toujours mettre un code (`fra`, `eng`, `jpn`).
- `normalizeLanguageCode()` reste recommandé (affichage lisible, clé `bingeGroup`), mais **aucun filtre FR ne dépend de ce champ** : un `"VOSTFR"` brut ne casse pas le filtrage, il s'affiche simplement mal. Garder `VF`/`VOSTFR` dans le `title`.
- `type` n'a d'effet **que sur Mobile** : le renseigner correctement (`hls`/`m3u8`, `dash`/`mpd`, `mp4`/`mkv`) ; sur TV, c'est l'URL qui décide — ne jamais compter sur `type` pour forcer un mode de lecture côté TV. Si l'URL ne porte aucune extension ni `format=`, TV peut faire un `HEAD` puis un `GET Range: bytes=0-2048` pour deviner le mime (2 requêtes de plus).
- Sous-titres **en lecteur externe sur Mobile** : `SubtitleFileCache` télécharge l'URL **sans** les `headers` du sous-titre → préférer des URLs autonomes ; en lecture in-app, les headers sont bien appliqués.

#### Plafonds, déduplication et qualité (vérifiés dans les sources)

| Comportement | NuvioTV | NuvioMobile |
|---|---|---|
| Déduplication des streams | `distinctBy { url }` sur **tous les providers** réunis | **aucune** |
| Plafond de résultats | `take(150)` **global** après dédup | aucun |
| `quality` | `parseQualityValue()` ne reconnaît que `4k`/`2160`, `1080`, `800`, `720`, `480`, `360` — sinon `-1` | affichage brut dans `description` |

Conséquences : une URL émise deux fois est **perdue** sur TV (seul le premier provider la garde) et **affichée en double** sur Mobile ; `"FHD"`/`"HD"` ne participent pas au tri par qualité. Côté plugins : `dedupeStreams()` (clé `URL|LANGUE`, rejet des URL vides/`[object`) est appliqué par `createProvider()` et par les 3 providers qui le contournent (`animesite`, `animevost-fr`, `voiranime-one`).

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

| Limit | NuvioTV (full) | NuvioMobile (full) | Source |
|---|---|---|---|
| JS plugin execution | **60s** | **60s** (+ `evaluationTimeoutMillis`) | `PluginRuntime.kt` |
| Full scraper lifecycle | **120s** | N/A | `PluginManager.kt` |
| HTTP connect / read / write | **30s each** | **60s each** | `PluginRuntime.kt` / `AddonPlatform` |
| Auto-play (default) | **10s** → au-delà, provider invisible en lecture auto | dépend du réglage utilisateur | `PlayerSettingsDataStore.kt` |

> **Le cap 60 s est un mur dur, pas une cible.** `PLUGIN_TIMEOUT_MS` (TV) et
> `evaluationTimeoutMillis` (Mobile) tuent l'exécution à 60 s **et jettent le résultat**,
> partiel compris : un provider qui atteint 60 s ne renvoie **rien**. Les budgets internes
> doivent donc rester en dessous — `PROVIDER_BUDGET_MS = 45 s` (défaut `createProvider`)
> et `TV_BUDGET_MS = 50 s` pour les guards explicites (`isBudgetExhausted`). Le temps
> passé en HTTP compte dans ce cap (30 s par requête côté TV).

**Consequence:** NuvioTV a **30 s max par requête** (vs 60 s sur mobile), **aucun timer JS**
(donc aucun timeout côté plugin : ni `safeFetch({timeout})` ni `withTimeout()`),
et un **bridge fetch bloquant** (donc aucune parallélisation). Pour rester sous les
60 s de `PLUGIN_TIMEOUT_MS` — sachant qu'à l'expiration le résultat est **jeté** — il faut :
- **Minimiser le nombre de requêtes** (le temps total = somme des RTT sur TV) — c'est le seul vrai levier
- Sortir **tôt avec du partiel** dès qu'on a des streams (`isBudgetExhausted(startTime, TV_BUDGET_MS)` avant chaque étape réseau)
- Éviter les enrichissements optionnels quand le budget est entamé (`expandStreamQualities` reçoit `budgetDeadline` et cesse alors toute requête non essentielle : expansion HLS, sondes de taille)
- Éviter les sondes HEAD (une sonde non bornée peut coûter 30 s pour une étiquette de taille : `fetchVideoSize()` retourne `null` sans timers)
- `fetchBatch()` / `Promise.allSettled()` **n'apportent aucune parallélisation sur TV** (utile côté Mobile uniquement)

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
  // ⚠️ Sur NuvioTV ce code est SÉQUENTIEL (bridge fetch bloquant) : le résultat
  // est correct mais le temps = somme des RTT. Garder le nombre de requêtes bas.
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

Pour un vrai contrôle de débit/anti-burst, préférer `fetchBatch()` (concurrency,
`stopOnFirst`, `staggerMs`) — gain réel sur Mobile, neutre (mais inoffensif) sur TV.

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

### Settings UI + utilities (recommandé)

Le provider pilote est `src/movix/`. Pattern complet :

```javascript
// index.js
import { extractStreams } from './extractor.js';
import { createProvider, createSettingsLayout } from '../utils/resolvers.js';

module.exports = {
  getStreams: createProvider('Example', extractStreams),
  // UI NuvioMobile uniquement (NuvioTV ignore le hook mais injecte quand même
  // SCRAPER_SETTINGS). Types supportés : header, info, text (isPassword,
  // placeholder), select (options[{label,value}], defaultValue), toggle.
  onSettings: createSettingsLayout([
    { type: 'header', label: 'Préférences' },
    { type: 'select', key: 'language', label: 'Langue préférée', defaultValue: 'all',
      options: [{ label: 'Tout', value: 'all' }, { label: 'VF', value: 'vf' }] },
    { type: 'toggle', key: 'skipSlowHosts', label: 'Ignorer les hosts lents', defaultValue: false },
  ]),
};

// extractor.js — lire les réglages (fallback sûr si absents)
import { getScraperSettings } from '../utils/resolvers.js';
const s = getScraperSettings(); // {} si l'app n'en injecte pas
```

Helpers disponibles dans `src/utils/resolvers.js` :

| Helper | Description |
|---|---|
| `getScraperSettings()` | Réglages injectés par l'app (`globalThis.SCRAPER_SETTINGS`, `{}` par défaut) |
| `createSettingsLayout(items)` | Déclare le hook `onSettings()` (UI NuvioMobile) |
| `fetchBatch(requests, fetchFn, { concurrency, stopOnFirst, staggerMs })` | Fetch parallèle borné (parallèle = NuvioMobile seulement) ; `staggerMs` espace les départs de requêtes (anti-burst Cloudflare) |
| `sleep(ms)` / `HAS_NATIVE_TIMERS` | Délai portable (timers Mobile, busy-wait TV) — `HAS_NATIVE_TIMERS` permet de savoir si on peut borner une requête |
| `fetchVideoSize(url, headers)` | Taille via HEAD — **retourne `null` sans timers** (TV) pour ne pas risquer 30 s sur une étiquette cosmétique |
| `isBudgetExhausted(startTime, budgetMs)` / `TV_BUDGET_MS` | Garde-fou budget : sortir avec du partiel plutôt que de risquer le 60 s qui jette tout |
| `getResponseHeader(headers, name)` | Lit un en-tête quel que soit le conteneur (`Headers.get()` ou objet du cache) |
| `normalizeLanguageCode(raw)` | Code langue normalisé (`fr`/`en`/`ja`/`multi`) pour l'affichage et la clé `bingeGroup` — **aucune app ne filtre sur `language`** |
| `expandStreamQualities(streams, opts)` | Dédup URL+langue, type déduit, variants HLS. Options : `budgetDeadline`, `maxManifestFetches`, `skipManifestExpansion`, `sizeProbe`, `preferredCodec` |
| `createProvider(name, extractFn, { maxStreams, timeout, quality })` | Wrapper standard : timeout, dédup URL+langue, filtre `[object`, cap `MAX_STREAMS_PER_PROVIDER` (80), expansion qualité |
| `BUILD_ID` | Hash court injecté à la build (visible en logs : `[Name] Request: … (build abc12345)`) |

---

## 9. Common Pitfalls

**`setTimeout` / `setInterval` not available (NuvioTV only).** Utiliser `sleep(ms)` de
`resolvers.js`, qui choisit automatiquement : `setTimeout` si le runtime en a
(**NuvioMobile** → délai réel, zéro CPU), sinon busy-wait microtask (**NuvioTV** —
seule option, mais il brûle du CPU pendant toute la durée → à éviter absolument sur
le chemin critique : un backoff de 5 s = 5 s de spin).
```javascript
import { sleep, HAS_NATIVE_TIMERS } from '../utils/resolvers.js';
await sleep(800); // portable
```

**Accès aux en-têtes de réponse.** La réponse ne fournit que `headers.get(name)` :
```javascript
const ctype = res.headers.get('content-type');        // ✅
const bad = res.headers['content-type'];              // ❌ toujours undefined
```
Pour le cache interne (objet plain) et les deux formes, utiliser `getResponseHeader(res.headers, name)`
(exporté par `resolvers.js`).

**Échec réseau ≠ exception.** `fetch()` résout toujours : tester `res.ok` **et**
`res.status === 0` (échec réseau renvoyé par le bridge). `safeFetch()` normalise
`status === 0` en `null` — garder les `if (!res) return ...`.

**Cloudflare vs UA navigateur.** Un UA Chrome complet est rejeté (403 « Just a
moment… ») par certains endpoints protégés — vérifié sur `https://graphql.anilist.co`,
qui répond **200 avec un UA court** (`Nuvio-Providers/1.0`, `okhttp/…`, même
`Mozilla/5.0`). Toujours surcharger le UA par requête dans ce cas
(`safeFetch` fusionne `BASE_HEADERS` avant `rest.headers`, donc l'override gagne).

**Rate-limit Cloudflare (429/503) : couper au lieu de réessayer.** Sur les sites qui
limitent par IP (VoirAnime : ~4 à 10 HEAD de sondage + 1 recherche WP déclenchent
le blocage en ~2 min ; l'oracle de slug ci-dessous a divisé le sondage par 4), les retries transforment un échec en ~45 s de budget
brûlé pour 0 stream. Mémoriser l'état et court-circuiter les requêtes suivantes de la
**même exécution** :
```javascript
let _rateLimitedUntil = 0;
export function isRateLimited() { return Date.now() < _rateLimitedUntil; }
export function markRateLimited(ms = 25000) { _rateLimitedUntil = Date.now() + ms; }
// dans fetchText(), AVANT l'attente du rate limiter :
if (isRateLimited()) throw new Error(`Rate limited (Cloudflare) for ${url.slice(0, 60)}`);
```
Le flag vit dans l'instance QuickJS courante (une par `getStreams`) : le blocage reste
local à **une** tentative et l'appel suivant repart à neuf. Le réinitialiser en tête
d'`extractStreams` (`resetRateLimit()`) si le provider enchaîne plusieurs passes.

**Sondage de slugs : utiliser la recherche du site comme oracle.** Sur NuvioTV le
réseau est **sérialisé** : chaque HEAD coûte un aller-retour, donc un sondage
aveugle de 40 URLs coûte ~15 s. Une seule page de résultats WordPress
(`/?s=<titre>`) donne les **titres réels** des fiches — souvent en romaji
(`shingeki-no-kyojin`) quand le slug TMDB est anglais (`attack-on-titan`).
Dériver le slug de base de ces titres (retirer `(VF)`, `Saison N`, `Final
Season`, numéro final), classer par fréquence, puis sonder `{base}` et
`{base}-{N}` : 1 GET + 2 à 6 HEAD au lieu de 40 HEAD (mesuré : AOT S1 16 → 6,
S4 16 → 4). Toujours garder 2 slugs sondés **avant** l'oracle (slug exact
gratuit) et un repli aveugle borné si la recherche est bloquée. Ne jamais
servir une fiche dérivée pour la mauvaise saison : exiger le numéro dans l'URL
**ou** dans le titre, et pour S1 refuser tout titre portant saison/OAV/`Final
Season`.

**Portail « vérification humaine » (Turnstile) : arrêter net.** Certains sites exigent
un jeton Turnstile validé **côté serveur** avant de servir une source (SenAnimes :
`GET /api/episode/source` → `403 {"error":"verification-humaine"}`, sitekey
`0x4AAAAAAFS9VBp2M62FSgY3`, POST `/api/humain`). Aucun en-tête ni cookie n'est
forgeable — vérifié live : `Referer` + `Origin` + `Sec-Fetch-*` corrects → 403 quand
même, pour tous les slugs du catalogue. Un plugin ne peut donc **pas** résoudre ces
streams : détecter la valeur d'erreur dès la première réponse API et abandonner, au
lieu d'enchaîner retries + page watch (~6 s et 200 Ko pour rien) :
```javascript
export const HUMAN_GATE = 'verification-humaine';
let _humanGate = false;
// dans fetchApi() : if (json.error === HUMAN_GATE) _humanGate = true;
// dans l'extracteur  : if (isHumanGateActive()) return null;   // plus de fallback
```
Journaliser une fois côté extracteur (`Portail « verification-humaine » : …`) : le
diagnostic est actionnable, alors qu'un 0 stream silencieux ressemble à une panne.

**Ne jamais manipuler un objet `URL` avant de fetcher.** `new URL(u).searchParams.set(...)`
ne met **pas** à jour `.href` dans le polyfill, et passer un objet à `fetch()` dépend
du `toString()` du bridge. Construire la chaîne finale explicitement.

**`response.json()` returns `null` on failed parse** instead of rejecting. Always guard:
```javascript
const data = await resp.json();
if (!data) return [];
```

**Body truncated at 1 MB.** Le runtime coupe à 1 MB d'octets. Mobile ajoute **toujours**
le suffixe `\n...[truncated]` (détecté par `isTruncatedBody()`), **TV ne l'ajoute que si le
texte dépasse 1 M de caractères** : un HTML UTF-8 coupé à 1 MB d'octets arrive à ~950 k
caractères, **sans marqueur**. `safeFetch()` couvre les deux cas (suffixe **et** heuristique
« HTML ≥ 700 k caractères ouvrant `<html>` sans `</html>` ») et refuse un HTML tronqué
(return `null`) plutôt que de parser un préfixe ; ne jamais parser un body tronqué avec cheerio.

**`require('unknown-module')` throws.** Bundle all dependencies with esbuild `bundle: true`. Only `cheerio` and `crypto-js` are available at runtime.

**Headers in stream object vs fetch call.** Only stream-level `headers` are sent to the video player. `fetch()` headers apply only to the provider's own requests.

**Audit `name`/`size` : ne pas se limiter aux extracteurs.** Le champ `name` est injecté
par `toStream()` dans `src/utils/dle-extractor.js`. Un grep `name:` restreint à
`src/*/extractor.js` classe à tort les providers qui passent par cette fabrique comme
« manquants » (faux positif). Avant de conclure qu'un provider n'envoie pas `name`,
vérifier aussi `src/utils/dle-extractor.js` (fonction `toStream`) et `resolveStream()`
(resolvers.js) qui préserve `name` par spreads `{ ...stream }`. À l'inverse, `size` n'est
jamais injecté par `toStream()` : si un site ne l'expose pas, l'omettre plutôt que de
faire un HEAD request par stream (coût/budget). Voir §3.2 (« `size` — le parseur réel de l'app »)
pour la regex exacte lue par NuvioTV : décimales `.`/`,` acceptées, base 1024, **premier match**
dans `description` puis `title` puis `name` — un `"2 Go"` ou un `"320kbps"` positionné avant
la taille dans le même texte le fait échouer silencieusement (taille absente du tri/filtre).

**V8 vs QuickJS differences:**
- `TextDecoder`/`TextEncoder` unavailable **on TV** (available on Mobile)
- `RegExp` lookbehind may differ
- No `Buffer`, `process`, `setImmediate` (sur les deux)
- Pas de `Array.prototype.at`, `findLast`, `Object.groupBy`, `structuredClone` (polyfills fournis : `flat`, `flatMap`, `Object.entries`, `Object.fromEntries`, `String.replaceAll`)
- `Error.stack` format differs
- Always test in-app

### 9.5 Blocages spécifiques aux sites FR (diagnostics live 2026-11)

| Site | Symptôme | Cause réelle | Traitement dans le provider |
|---|---|---|---|
| Anime-Sama | 0 stream sur tout le catalogue | `/catalogue/{slug}/{saison}/{lang}/episodes.js` renvoie **403 Cloudflare** sans en-tête `Referer` (la fiche, elle, répond 200 sans Referer) | `http.js` envoie `Referer`/`Origin` sur **toutes** les requêtes ; la recherche se fait aussi sur le `subtitle` des résultats (titres alternatifs FR/EN/romaji) |
| Anime-Sama | mauvais épisode / épisode absent | le slug du site est romaji (`shingeki-no-kyojin`) et absent des premiers titres TMDB (EN/FR) | recherche `fetch.php` + garde `h1` + passe `toSlug()` de tous les titres, puis mapping absolu (sagas) |
| VoirAnime | épisode d'une autre saison / OAV servi | la recherche WP classe au titre : `shingeki-no-kyojin-lost-girls` sortait 1er pour « Attack on Titan S4 » ; une fiche sans marqueur de saison (`shingeki-no-kyojin`) servait la S1 pour une demande S2+ | garde œuvre dérivée (OAV/recap/spinoff), garde de volume d'épisodes vs `seasonEpisodeCounts` TMDB, exclusion des fiches portant une autre saison |
| VoirAnime | VF absente | fiches VF plus rares + budget lecteurs consommé par la VOSTFR d'abord ; `voe.sx` était classé « non résolvable » alors que `resolveVoe()` le résout (SPA Byse) | VF traitée en premier dans `pickBalanced`, `voe` réintégré aux lecteurs résolvables, `MAX_HOSTS = 4` |
| SenAnimes | 0 stream | portail **Cloudflare Turnstile vérifié côté serveur** : `/api/episode/source` renvoie `403 {"error":"verification-humaine"}` sans jeton résolu dans un navigateur. Ni cookie (`sa_humain_vu=1`), ni Referer, ni UA navigateur ne passent ; `/api/humain` refuse tout jeton invalide | détection immédiate (`isHumanGateActive`) et sortie rapide ; **aucun contournement possible depuis QuickJS** — le provider reste présent pour le jour où le portail sera retiré |

> **Anime (NuvioTV) :** les videoId `kitsu:`/`mal:`/`anilist:`/`anidb:` arrivent avec `season = null`
> et un numéro **absolu**. `anime-sama` et `voiranime` appellent désormais
> `resolveSeasonEpisodeInputs()` (dle-extractor.js) en entrée : sans ce reverse-map,
> `effectiveSeason` restait `null` → `saisonnull` / fiches S1 → 0 stream ou mauvais épisode.

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
