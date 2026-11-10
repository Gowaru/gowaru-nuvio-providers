# Audit runtime NuvioTV / NuvioMobile → optimisations applicables aux plugins

Analyse du code source des deux applications (`zonetest/`, lecture seule, rien modifié) :
~1 400 fichiers Kotlin par app, en se concentrant sur la chaîne « plugin ».

## Résumé exécutif

1. **Sur NuvioTV, `fetch` est bloquant** : tous les appels réseau d'un plugin sont sérialisés.
   `Promise.all` ne parallélise rien → raisonner en nombre de requêtes, pas en lots.
2. **La troncature 1 MB de TV est silencieuse quand la coupure est en octets** : `isTruncatedBody()`
   ne voit rien et `safeFetch` parse un HTML partiel. C'est le risque le plus concret aujourd'hui.
3. **`type` est ignoré sur TV** (et la qualité n'est triée que si `quality` contient 360/480/720/
   800/1080/2160) ; **TV déduplique par URL et plafonne à 150 résultats** au total.
4. **Les sous-titres sont supportés par les deux apps** (headers par sous-titre inclus en lecture
   in-app) : la note « NuvioTV ignore les sous-titres » est obsolète.
5. Les polyfills cheerio ont trois pièges muets : `.filter('.sel')` no-op, `.children(sel)` =
   descendants, `$(htmlString)` vide. Aucun n'est utilisé chez nous aujourd'hui : à maintenir ainsi.

Fichiers de référence :

| Sujet | NuvioTV | NuvioMobile |
|---|---|---|
| Exécution JS | `app/src/full/.../core/plugin/PluginRuntime.kt` | `composeApp/src/fullCommonMain/.../plugins/runtime/PluginRuntime.kt` |
| Polyfills | `PluginRuntime.kt` (`getStaticPolyfillCode`) | `runtime/js/JsBindings.kt` |
| Fetch natif | `PluginRuntime.performNativeFetch` | `runtime/network/FetchBridge.kt` + `features/addons/AddonPlatform.android.kt` |
| HTML | jsoup 1:1 dans `PluginRuntime` | `runtime/dom/DomBridge.kt` (Ksoup) |
| Orchestration | `core/plugin/PluginManager.kt` | `features/plugins/PluginRepository.kt` |
| Résultats → UI | `data/repository/StreamRepositoryImpl.kt` | `features/streams/StreamFetchSupport.kt` |
| Lecture | `ui/screens/player/PlayerPlaybackNetworking.kt` | `features/player/PlayerEngine.android.kt` |
| Manifest | `domain/model/Plugin.kt` | `features/plugins/PluginModels.kt` |

---

## 1. Le point le plus important : sur TV, `fetch` est **synchrone**

- TV : `function("__native_fetch") { … }` (binding **bloquant**) appelé sans `await` dans le polyfill.
- Mobile : `runtime.asyncFunction("__native_fetch")` (suspend, vraie concurrence).

Conséquence : **sur NuvioTV, tous les `fetch` d'une même exécution sont sérialisés.**
`Promise.all`/`Promise.allSettled` n'apportent aucun parallélisme réseau : le temps total est la
**somme** des latences, et chaque requête bloque le thread QuickJS (donc pas de timers, pas de
progression pendant l'I/O).

Ce que ça change pour nous :

1. Nos budgets doivent être calculés en « nombre de requêtes × latence », pas en « lot parallèle ».
   `batchProbe(..., 5)` (anime-sama, voiranime) est en réalité séquentiel sur TV.
2. Privilégier **une** requête qui rend beaucoup (catalogue JSON, `episodes.js`) plutôt que N pages.
3. Les `HEAD` de sondage restent les moins chers, mais 16 HEAD ≈ 16 RTT : à plafonner par budget
   de temps réel (`Date.now()`), pas par nombre.
4. Les timeouts HTTP sont de 30 s (TV) / 60 s (Mobile) **par requête** ; un provider qui enchaîne
   10 requêtes lentes explose le budget global de 60 s avant même la résolution des lecteurs.
5. Test Node = fetch concurrent (undici) → **les temps mesurés en local ne représentent pas TV**.

## 2. Différences TV / Mobile qui touchent directement les plugins

| Sujet | NuvioTV | NuvioMobile |
|---|---|---|
| `season` / `episode` nuls | `null` | `undefined` (via `JsonNull` → `undefined` dans `staticCallCode`) |
| `mediaType` | `tv` / `movie`, **ou `series`** si le manifeste déclare `series` (`PluginMediaType.kt`) | toujours `tv` / `movie` (`normalizePluginType`) |
| `type` du stream | **ignoré** (`toPluginStream` ne le lit pas) | utilisé pour le mime (`hls`/`m3u8` → M3U8, `dash`/`mpd` → MPD) |
| `provider` | écrasé par le nom du scraper | ignoré |
| `behaviorHints.audioDelayMs/Language` | lu et appliqué | ignoré |
| `subtitles` | lu, `language` **ou** `lang`, headers par sous-titre appliqués | lu, `language` seulement ; headers appliqués **en lecture in-app** |
| Sous-titres en lecteur externe | headers gérés | `SubtitleFileCache` télécharge **sans** les headers du sous-titre |
| `hasSettings` / `onSettings` | champ absent du modèle, jamais appelé | requis pour afficher l'UI (`hasSettings` + `onSettings`) |
| `supportedPlatforms` / `disabledPlatforms` | parsés, **jamais appliqués** | appliqués à l'installation/refresh (`android`/`ios`) |
| `formats` / `limited` / `supportsExternalPlayer` | parsés, inutilisés | parsés, inutilisés |
| Cache HTTP inter-appels | **aucun** (client OkHttp sans `Cache`) | cache disque **50 MB** (`AddonHttpClientProvider`) |
| Troncature body | 1 MB en octets **silencieuse** + 1 M caractères avec suffixe | 1 MB en octets **avec suffixe** `\n...[truncated]` |
| Concurrence | 10 scrapers, décalage 60 ms, ordre par historique de lecture | sémaphore 10, pool de 10 threads |
| Timeout plugin | 60 s interne + 120 s externe, annulation des appels OkHttp en vol | 60 s (`withTimeout` + `evaluationTimeoutMillis`) |
| Plafond résultats | `take(150)` **global** après `distinctBy { url }` | pas de plafond global |
| Taille max du code | 5 MB (`MAX_RESPONSE_SIZE`) | pas de contrôle |
| Documents HTML en cache | 8 (`documentCache`) | 8 (`DomBridge.MAX_CACHED_DOCUMENTS`) |

## 3. API JS réellement disponible (pièges vérifiés)

### cheerio (polyfill sur jsoup/Ksoup, identique dans les deux apps)

Présent : `load`, `$`, `find`, `text`, `html`, `attr`, `first`, `last`, `next`, `prev`, `eq`, `get`,
`map`, `filter(fn)`, `each`, `toArray`, `$(sel, contexte)`.

Pièges **silencieux** (pas d'exception, résultat faux) :

- **`.filter('.classe')` est un no-op** → renvoie la collection entière. Seul `filter(fn)` marche.
- **`.children(sel)` = `.find(sel)`** → renvoie tous les **descendants**, pas les enfants directs
  (et `.children()` sans argument renvoie tout le sous-arbre).
- **`.parent()` renvoie toujours vide**, `.closest()`, `.hasClass()`, `.siblings()`, `.parents()`,
  `.nextAll()`, `.prevAll()`, `.is()`, `.not()`, `.has()`, `.index()`, `.data()`, `.css()`, `.val()`
  n'existent pas.
- **`.text()` sur plusieurs nœuds joint avec `" "`** (cheerio réel concatène sans séparateur).
  Cibler un seul nœud (`.first().text()`) dès qu'on compare une chaîne.
- `$( '<div>…</div>' )` (fragment HTML) **n'est pas supporté** → renvoie `[]`.
- `:contains("x")` est traduit en `:contains(x)` (jsoup) : **insensible à la casse**, alors que
  cheerio est sensible. Ne pas s'appuyer sur `:contains` pour distinguer deux libellés.
- Le cache de documents est limité à 8 : parser une 9e page **invalide les wrappers** de la 1re.
  Toujours extraire les chaînes avant de charger une nouvelle page, ne pas stocker des wrappers
  au-delà de quelques pages.
- `elementCache` n'est jamais purgé pendant l'exécution : `$('*')` sur une grosse page = milliers
  d'entrées en mémoire QuickJS.

Cheerio complet (le vrai module npm) est **inliné** dans nos bundles : `.closest()` etc. marchent,
mais uniquement parce que c'est la lib JS, pas le pont natif. Garder les feature-detects existants.

### `URL` / `URLSearchParams`

- `new URL(url, base)` : résolution relative naïve (`b.replace(/\/[^\/]*$/, '/') + url`), fausse
  pour `../` et pour une base sans slash final. Construire les URLs à la main.
- `url.searchParams.set(...)` **ne modifie pas** `url.href`/`toString()` (le polyfill garde la
  chaîne d'origine). Utiliser `URLSearchParams` seul, puis concaténer.
- `append()` **écrase** au lieu d'ajouter ; `getAll()` ne renvoie qu'une valeur ; `get()` renvoie
  `null` (pas `''`). Éviter les query à clés répétées.

### `fetch`

- `res.headers.get('x')` : clés **minuscules** obligatoires, valeurs multiples jointes par `,`,
  valeur tronquée à 8 KB (suffixe `...[truncated]`). `Range` et `Accept-Encoding` sont retirés
  par le runtime → ne pas s'en servir.
- `res.url` = URL **finale** après redirections (utile aux résolveurs), `res.status === 0` en cas
  d'échec réseau (jamais de throw), `res.json()` renvoie `null` si le parse échoue.
- UA par défaut : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36` (sans version
  Chrome) → toujours passer notre UA complet, avec la **casse exacte `User-Agent`** (TV compare la
  clé de façon sensible à la casse et ajoute le sien en doublon sinon).
- `Content-Type` : défaut `application/x-www-form-urlencoded` en POST (TV et Mobile), lu lui aussi
  avec la casse exacte `Content-Type`.
- `redirect: 'manual'` : TV construit un **nouvel OkHttpClient** à chaque appel → coûteux, à
  réserver aux cas où la redirection doit être lue (`animesite/http.js`).
- `bodyBase64` est **toujours** renvoyé en plus de `body` (~2,4× la taille en mémoire) : ne pas
  fetcher de gros binaires.
- `AbortController` : le signal n'interrompt pas la requête en vol ; seuls les contrôles
  avant/après existent. Sur TV, l'annulation du job annule bien les appels OkHttp en cours.

### Troncature : la vraie limite à connaître

| Cas | TV | Mobile |
|---|---|---|
| > 1 MB d'octets | coupé **sans marqueur**, flag `truncated` non exposé au JS | coupé + `\n...[truncated]` |
| > 1 M caractères | coupé + suffixe | (déjà couvert par les octets) |

Donc sur TV, `isTruncatedBody()` est aveugle au cas le plus fréquent (HTML UTF-8 > 1 MB coupé au
milieu d'une balise). `safeFetch` détecte aujourd'hui `length >= 1 MB` en **caractères** : un HTML
de 1 MB d'octets avec des accents fait ~950 k caractères → passe le garde-fou et se fait parser
partiel.

### Timers / crypto / texte

- Timers : **Mobile seulement** (plafond 60 s), absents sur TV. Continuer à ne pas en dépendre.
- `TextEncoder`/`TextDecoder` : Mobile seulement (polyfill JS), absents sur TV.
- `CryptoJS` : vrai `crypto-js` 4.2.0 sur TV, **réimplémentation native** sur Mobile (MD5/SHA-1/256/
  384/512, HMAC, PBKDF2, AES-CBC/GCM/ECB, enc Hex/Latin1/Utf8/Base64/Base64url). Sur Mobile,
  `CryptoJS.mode.CBC` est une **chaîne** et `CryptoJS.lib.WordArray` est partiel : rester à l'API
  haut niveau `CryptoJS.AES.encrypt/decrypt`, `CryptoJS.enc.*`, `CryptoJS.HmacSHA256`.
- `crypto.subtle` : Mobile uniquement, AES-CBC/GCM sans `additionalData`, HMAC, PBKDF2, digests,
  signature RSA/ECDSA. Sur TV : absent.
- `WebAssembly` : placeholder vide sur Mobile, absent sur TV → aucun provider WASM possible.

## 4. Format des résultats

- **Champs texte uniquement** : un nombre dans `quality`/`size` devient `"1080"` (Gson/serialization
  `toString`), mais tout objet donne `[object Object]` → **rejeté silencieusement** (TV filtre tout
  champ contenant `[object`, Mobile filtre `title/name/quality/...`).
- `url` : TV rejette aussi les `url` contenant `[object` ; Mobile ne vérifie que non vide.
- `title` est **obligatoire** côté Mobile (`?: "Unknown"` sinon, via resource).
- TV calcule `qualityValue` par `contains` : `4k`/`2160`, `1080`, `800`, `720`, `480`, `360`.
  Un `quality` textuel exotique (`"FHD"`, `"HD"`) donne `-1` (pas de tri par qualité). Utiliser
  `"1080p"`, `"720p"`, `"480p"`… (déjà le cas dans `resolveStream`).
- TV : `description = size • language`, `name = name ?? title + " - quality"` → `language` et `size`
  sont visibles même si le titre est chargé.
- Mobile : `name = name ?? title`, `description = quality • size • language`.
- **TV déduplique par `url` sur l'ensemble des providers** et plafonne à 150 résultats : deux
  entrées pointant sur la même URL (même titre différent) disparaissent ; l'ordre des providers
  décide laquelle survit. Mobile n'a **aucune** déduplication → doublons visibles.
- `subtitles[].headers` : honorés sur **les deux** apps en lecture in-app (contrairement à la note
  « NuvioTV ignore les sous-titres »). Sur Mobile, le lecteur **externe** les ignore.

## 5. Optimisations classées

### P0 — risques de bug silencieux (à traiter en premier)

1. **Troncature TV** : compléter le garde-fou pour le cas « octets coupés sans suffixe » :
   si `truncated === false` mais que le corps est HTML, long (> ~700 k) et sans `</html>`/`</body>`
   final → traiter comme tronqué (retour `null`). Sinon on parse un préfixe (sélecteurs faux,
   `closest` cassé, faux négatifs silencieux).
2. **`mediaType === 'tv'`** : `src/utils/search-fallback.js:33,62` et `src/utils/metadata.js`
   comparent strictement à `'tv'`. Aujourd'hui sans effet (aucun provider ne déclare `series`),
   mais si on ajoute `series` à un manifeste, TV enverra `'series'` et le provider basculera en
   mode film. Normaliser une fois en entrée : `const isTv = mediaType !== 'movie'`.
3. **Interdiction de `.filter(selector)` / `.children(sel)` / `$(htmlString)`** : no-op ou faux,
   jamais d'erreur. Ajouter ces trois motifs à la checklist de revue (aucune occurrence
   actuellement, donc rien à corriger, juste à ne pas introduire).
4. **Casse des en-têtes** : n'envoyer que `User-Agent`, `Content-Type`, `Referer`, `Origin` en
   casse exacte (sinon doublon d'UA / Content-Type par défaut).

### P1 — gains de fiabilité/rapidité

5. **Budget adapté à la sérialisation TV** : compter les requêtes, pas les lots. Pour le sondage
   de slugs (anime-sama `MAX_VERIFIED_SLUGS`, voiranime `pairUrls`), borner par
   `Date.now() > deadline` et couper dès 2-3 slugs validés (déjà partiellement fait).
6. **Plafond 150 + dedupe TV** : vérifier qu'un même flux n'est pas émis deux fois (VF/VOSTFR avec
   la même URL, ou plusieurs qualités du même manifest). Dédupliquer par URL avant de renvoyer.
7. **`type` pour Mobile, extension pour TV** : renseigner `type: 'hls'|'dash'|'mp4'` aide Mobile à
   choisir le mime, mais TV l'ignore et peut lancer un `HEAD`+`GET Range` pour deviner — jusqu'à
   deux requêtes supplémentaires sur une URL signée. Garder `master.m3u8`/`.mp4` visible dans le
   chemin ou un `format=m3u8` en query.
8. **Sous-titres** : puisqu'ils sont honorés des deux côtés, généraliser `headers` par sous-titre
   quand le CDN l'exige ; en parallèle, préférer des URLs autonomes (le lecteur externe Mobile ne
   propage pas les headers).
9. **Logs** : chaque `console.log` traverse le pont (Logcat/Kermit). Nos providers en émettent
   10-40 par exécution ; garder 1 ligne par étape et supprimer les logs par élément de boucle.

### P2 — confort et qualité d'affichage

10. **`language`** : TV mappe les codes ISO via `Locale` (`fr` → « French ») ; tout jeton inconnu
    (`VOSTFR`, `VF`) s'affiche tel quel en majuscules. `normalizeLanguageCode()` reste la bonne
    approche (garder VF/VOSTFR dans `title`).
11. **`behaviorHints.audioDelayMs`** (TV only) : pour les VF dont la piste audio est décalée, on
    peut l'exposer sans risque (ignoré ailleurs).
12. **`bingeGroup`** : calculé par TV à partir de `name/title/language/quality` (les numéros
    d'épisode sont neutralisés). Mobile **n'en génère pas** pour les streams plugin → l'auto-next
    ne réutilise pas le provider ; rien à faire côté plugin, à documenter comme limite.
13. **Cache** : seul Mobile a un cache disque (50 MB, GET uniquement, réponses cacheables). Aucun
    état JS ne survit entre deux exécutions (confirmé : `quickJs{}`/`JsRuntime()` par appel) →
    nos caches mémoire restent intra-exécution, comme documenté.
14. **`documentCache` = 8** : nos extracteurs qui parsent plusieurs pages d'affilée doivent finir
    l'extraction de chaque page avant de charger la suivante (déjà le cas, à préserver).

## 6. Ce qu'il ne faut pas faire

- Compter sur `Promise.all` pour paralléliser sur TV.
- Utiliser `filter('.x')`, `children(sel)`, `$(html)`, `parent()`, `hasClass()`.
- Construire une URL via `searchParams.set()` puis `url.href`.
- S'appuyer sur `formats`, `limited`, `supportsExternalPlayer`, `supportedPlatforms` (TV), `type`
  (TV), `provider`, `audioDelay*` (Mobile).
- Envoyer un `quality` non numérique (`"FHD"`, `"HD"`) si on veut le tri par qualité TV.
- Émettre plusieurs fois la même URL (perte silencieuse sur TV, doublon sur Mobile).
- Déclarer `supportedTypes: ["series"]` sans normaliser `mediaType !== 'movie'` partout.

## 7. Vérifications restantes (à faire sur device)

- Confirmer la sérialisation réseau TV sur un provider à N requêtes (ex. voiranime S2) en comparant
  les durées device vs Node.
- Mesurer l'impact du garde-fou de troncature sur une page > 1 MB (ex. catalogue anime-sama).
- Vérifier sur TV que les sous-titres avec `headers` se chargent bien (la note AGENTS est obsolète).
