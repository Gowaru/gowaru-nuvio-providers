# AGENTS.md

## Overview
Nuvio French streaming provider bundle (FR anime/movie/series providers). Providers are compiled from `src/` to `providers/` via esbuild. Runtime is **QuickJS** (via `quickjs-kt`), not Hermes or Node.js.

## RESPONSES
Keep responses concise and to the point in French - unless the user asks otherwise.

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
- `src/utils/`: Shared helpers (`resolvers.js`, `logger.js`, `metadata.js`, `dle-extractor.js`, `armsync.js`)

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
- **`mediaType`**: `'movie'` or `'tv'` on NuvioMobile (normalized); NuvioTV sends **`'series'`** when the manifest entry declares `supportedTypes:["series"]` (`PluginMediaType.jsPluginMediaType`). No provider currently declares it, but any series logic must test `mediaType !== 'movie'` — never `=== 'tv'`. Helper: `isTvMediaType()` from `src/utils/resolvers.js` (used by `search-fallback`, `metadata`, `dle-extractor`, `vostfree`, `frenchstream`, `anime-ultime`, `waveanime`).
- **Stream object**: Only `url` is required (non-blank, no "object" strings)
  - Optional: `title`, `name`, `quality`, `headers`, `provider`, `type`, `size`, `language`, `infoHash`, `seeders`, `peers`
  - `subtitles`: `[{ url, language, name, headers }]` — **supported by BOTH apps**: NuvioTV parses it (`PluginRuntime.parseSubtitles` → `Stream.subtitles`, then `applyStreamMetadata`) and applies `headers` **per subtitle**; NuvioMobile follows the same contract (headers applied by `SubtitleRequestHeaderDataSource`). ⚠ Mobile limitation: the **external player** downloads subtitles without those headers (`SubtitleFileCache`), so prefer self-contained URLs when possible. `language` defaults to `"Unknown"` when absent → always set it (`fra`, `eng`, …).
- **Headers**: Applied via the app playback proxy — `behaviorHints.proxyHeaders` (both apps) + `notWebReady=true` (NuvioMobile only); `Range` and `Accept-Encoding` are stripped by the runtime — do not rely on them.
- **Language**: **neither app filters or sorts on `language`** — the field is used for display (`description = "size • language"` on TV, subtitle on Mobile) and for `bingeGroup` tokens. Still normalize it with `normalizeLanguageCode()` from `src/utils/resolvers.js` (done automatically in `resolveStream`/`toStream`) for consistent display, and keep VF/VOSTFR in the `title`.
- **Size**: parsable format required for the apps' filters/sorting — regex `\d+(,\d+)?\s*(TB|GB|MB|KB)`, e.g. `"1.4 GB"`.
- **`quality`**: NuvioTV only computes a sortable value when the string contains `4k`/`2160`, `1080`, `800`, `720`, `480` or `360` (`parseQualityValue`) — `"FHD"`/`"HD"` yield `-1` (no quality sorting). Use `1080p`, `720p`, `480p`… (done by `resolveStream`).
- **Caps / dedupe (verified)**: NuvioTV does `distinctBy { url }` across **all providers** then `take(150)` globally → a URL emitted twice disappears (provider order decides); NuvioMobile **does not dedupe** (duplicates are visible). Hence `dedupeStreams()` (`URL|LANGUAGE`, rejects empty/`[object` urls) applied by `createProvider` and by the 3 providers that bypass it (`animesite`, `animevost-fr`, `voiranime-one`).
- **Silently rejected fields**: any value containing `[object` (title, url, quality...) is filtered by `parseJsonResults` on NuvioTV.
- **`type`**: **no effect on NuvioTV** — the field is parsed (`LocalScraperResult.type`) but not used for playback: the type is inferred from the URL/player (a `.m3u8` still plays as HLS without `type`). **NuvioMobile uses it** (`PlaybackMediaItems.android.kt`): `'hls'`/`'m3u8'` → HLS, `'dash'`/`'mpd'` → DASH, `'mp4'`/`'mkv'` → progressive — setting it correctly is therefore still useful (Mobile), but never rely on it for TV.
- **`bingeGroup`: cannot be supplied by a plugin** — the field is ignored if emitted.
  - **NuvioTV derives it itself** (`pluginBingeGroup(scraperId, url, name, title, language, quality)` in `domain/model/Plugin.kt`): `url` is ignored, the group is built from `name`/`title` (canonicalized tokens, `1080p` → `1080`) + `language` + `quality`. Consequence: two streams of the "same episode, same provider" are only grouped when `name`/`title`/`language`/`quality` are **stable and normalized** across runs.
  - **NuvioMobile never sets `bingeGroup`** for plugins (`toStreamItem` in `StreamFetchSupport.kt`) → no grouping on Mobile.
- **Manifest `disabledPlatforms`/`supportedPlatforms`**: NuvioTV parses these fields but **never applies them**. NuvioMobile **does apply** the filter (platform `"android"`/`"ios"`): our current entries `disabledPlatforms:["tv"]` therefore remain active on Mobile, but **never write `supportedPlatforms:["tv"]` or `disabledPlatforms:["android"|"ios"]`** (it would hide the provider on Mobile).
- **`hasSettings` + `onSettings`**: field **required in `manifest.json`** for NuvioMobile to show a provider's settings UI when it exports `onSettings` (`createSettingsLayout()` helper + `getScraperSettings()` in `src/utils/resolvers.js`; layout: header/info/text/select/toggle). Pilots: **movix** and **frenchstream**. NuvioTV ignores the field (Gson) but injects `SCRAPER_SETTINGS` when defined.
- **Cache model (important)**: every `getStreams` runs in a **fresh QuickJS instance** (TV: `quickJs{}` per run; Mobile: `JsRuntime()` per run — only polyfill bytecode is shared on the Kotlin side) → **no JS state survives between two calls**. In-memory caches (`createCache`, `safeFetch`'s 5-minute GET cache, `_episodesCache`…) only help **within one run** (duplicate-request dedupe, key normalization across title variants). No storage API is exposed to plugins. Cross-call levers: the OkHttp disk cache (50 MB) of NuvioMobile Android for cacheable GETs with HTTP headers, and NuvioTV's single-flight (key `scraperId:tmdbId:type:s:e`).

## Provider Notes

### anime-sama (`animes-sama.fr`, diag 2026-11)
- **The old `anime-sama.to` front is dead for episodes**: `…/{season}/{lang}/episodes.js` returns 404 across the whole catalog (One Piece included) → 0 streams everywhere. New front: `animes-sama.fr` (same slugs, different architecture).
- **Full chain**:
  1. `POST /ajax/search.php` (`query=…`) → `<a href="/catalogue/{slug}">` + `.asn-search-result-title` / `-subtitle` (the subtitle lists FR/EN/romaji aliases: it is what catches `Attack on Titan` → `shingeki-no-kyojin`).
  2. `GET /catalogue/{slug}` → links `/catalogue/{slug}/{saisonN|film|oav}/{lang}`. `<title>` = anti-false-match guard (rejects spin-offs, e.g. `shingeki-kyojin-chuugakkou`).
  3. `GET /catalogue/{slug}/{path}/{lang}` → inline `window.__EPISODE_NUMBERS`, `var epsN = ["1","",…]` (**availability only**, no URL) and `window.__PROFILE.csrf`.
  4. `POST /api/player/sign/{slug}/{path}/{lang}` `{ep, lecteur}` + `X-CSRF-Token` + **mandatory PHPSESSID cookie** (otherwise `419 {"error":"csrf"}`) → signed `/player/…` URL.
  5. Signed URL → 302 `/player/embed?t=…` → 302 **host embed** (sibnet, ansembed, oneupload, sendvid…) → `resolveStream`.
- **Home-grown player**: if the signed URL returns 200 (the "Lecteur Anime-Sama" page), the real embed is in `data-fallback-url`. Do NOT serve its HLS `/player/media?t=…`: it requires the cookie on every segment.
- **`safeFetch` forces `redirect: 'follow'`** → any 302 chain must go through raw `fetch` (like `animesite`).
- **Movie guard**: `/film` pages never state the movie name (One Piece `/film` actually serves "One Piece S01E01"). `fetchEmbedTitle()` reads the host's `og:title`/`<title>` and the stream is dropped when the title covers < 80% of the requested movie's significant words (noise words removed: `vostfr/vf/film/le/des/episode`…). Unidentifiable title (sibnet) → dropped: 0 streams rather than a wrong movie.
- **Languages**: most pages on the new front only expose `vostfr`; `vf`, `vf1`, `vf2`, `vqc`, `va`, `var`, `vkr`, `vcn` are handled automatically if they appear in the page links.
- **Budgets**: stop at 3 streams and at most 2 languages (`vostfr` then `vf`), 10–22 s per run in practice, hard budget 40 s.

### neko-sama (`animes-sama.su`, diag 2026-11)
- **Catalog = WordPress sitemap**: `GET /wp-sitemap-posts-anime-1.xml` (177 KB, ~1440 pages = 696 series) gives ALL pages + `-saison-N` / `-saga-N-…` pages. A single GET replaces the HTML search (whose "0 results" page returns other series' sidebar) and the ~40 guessed slugs: a missing title goes from 43 s to ~2 s.
- **Strict slug-token matching**: the old `sn.includes(norm) || norm.includes(sn)` accepted `GoT` ⊂ `omaegotoki` → **another series' episode served** for Game of Thrones. Now: whole tokens + ≥ 60% coverage + penalty for uncovered words + movie/OAV guard (`-film-`, `-fan-letter`…).
- **Hierarchies**: `-saison-N` and `-saga-N-…` (One Piece) feed the same season guard. A hub whose `eplister` is empty is penalized: the requested season/saga page wins.
- **Absolute numbering of sagas**: `one-piece-saga-2-alabasta` lists `62..143` while TMDB restarts at 1 → remap `abs = min + ep - 1` when the range is contiguous and `min ≥ 2` (otherwise S2E1 returned 0 streams; S1E1 keeps targeting the raw number).
- **Server groups**: split on `<div class="server-group">` + first `<label>` (`SUB:` → VOSTFR, `VF:` → VF), fallback on button labels (`VO-1`, `VF-1`). The old lookahead `</div></div><div class="server-divider"` merged/lost groups (VF disappeared).
- **Multi-host**: at most 2 distinct hosts per language, at most 4 buttons tried → if vidmoly dies, sendvid takes over (the old code stopped at the first success, so one dead CDN = 0 playable streams).
- **No VF on this site** as of 11/2026: episode pages only show one `SUB:` group (`VO-n` buttons); the `<!-- VF SERVERS -->` comments stay empty. A missing VF is not a parsing bug.
- **Cost**: 7–12 s per run (sitemap + season page + 1–2 resolutions), hard budget 38 s.

### Providers at 0 streams: actual state (diag 2026-11)
- **animesama-co → disabled**: `/saison-*/` and `/episode-*/` pages return a defacement image (`<title>pwned</title>`, 168 B); the home page and anime pages are intact, so this is not a parsing bug. `enabled:false` in the manifest, to re-enable when the site is restored.
- **anime-ultime**: `v5.anime-ultime.net` **and** `anime-ultime.net` return **Cloudflare 403** from a datacenter (all UA/Referer). Not fixable in code: depends on a residential IP.
- **french-anime**: the direct `french-anime.com` channel is behind a CF challenge (datacenter 403); the `coflix.gold` fallback works but its catalog lost many series (`jujutsu-kaisen` is missing). Proof the pipeline is healthy: `coflix 37854 S2E1` → 3 streams (Vidzy + Uqload).
- **animesama-co / coflix**: a `0 streams` for a title missing from the catalog is not a regression — check the catalog before touching the matching.

### voiranime-one → **Anisama `anisama.fr`** (v0.2.0, diag 2026-11)
- **The engine moved**: the Next.js domains `voiranime.one` / `anisama.org` / `anisama.net` have a broken DNS delegation (`No Reachable Authority at delegation`). The engine now runs as **Laravel on `anisama.fr`** (title "Anisama — Streaming anime & lecture de scans"); `voiranime.lol`/`.in`/`.cx` are the VoirAnime WordPress (already covered by `voiranime`), not this engine.
- **`resolveBase()` (http.js)**: probes `CANDIDATE_HOSTS` in parallel on `/recherche/?q=a` (HTML must contain `/catalogue/` or `Anisama`, 2 attempts), remembers the first live domain. No live domain → 0 streams in ~2 s. Adding a mirror = one line in `CANDIDATE_HOSTS`.
- **Search**: `GET /recherche/?q={title}` (⚠ the **trailing slash** avoids a 301; `?q=` without the slash returns 0 results). Cards `<a class="card … card--anime-id" href="/catalogue/{slug}/" title="…">` — `card--scan-id` (scans) must be excluded. TMDB title punctuation ("Your Name.", "Hatena☆Illusion") makes the search return 0 results → `cleanQuery()` strips it before the request.
- **Tree**: page `/catalogue/{slug}/` → series `/saison-{N}/`; One Piece and a few long series use **sagas** `/saga-3-…-episode-144-a-206/` (or `kai-saga-…`) with **absolute** numbering → the absolute episode is computed by `getAbsoluteEpisodeFromTmdb()` (`utils/dle-extractor.js`), then the saga whose `episode-A-a-B` range contains that number is selected; an open-ended range (`episode-1156-a`) = last saga. Movies: `/catalogue/{slug}/film/episode-1/{vf|vostfr}/` (`/catalogue/{slug}/films/` = list of movies in a franchise, unused).
- **Players**: inside `<option value="URL" data-key="vf_…|vostfr_…">` of the episode page. Only `ansembed.net` (uqload clone: `file_code`, `sources:[{file:…/hls2/…/master.m3u8?t=…}]`, readable signed master) yields a stream — `resolveStream` already routes it to `resolveVidmoly`. `jeremyparticipantanything` (dood redirect), `arianathankspecial` (demo video) and `Smoothpre` (EarnVids, empty page) are **decoys**: filtered by `JUNK_EMBED_HOSTS`. Any embed that comes back unchanged from `resolveStream` is dropped (an HTML page is not a stream).
- **Guards**: season missing from the page → 0 streams (never another season's episode); page without season/saga (movie) → never served for a TV request; VF and VOSTFR are always both tried (one of them may be missing upstream).
- **Cost**: 3–8 s per run (probe + 1–3 searches + page + 2 episode pages), hard budget 40 s.

### voiranime-homes (`voiranime.homes`, DLE engine)
- **Site throttle**: ~6 requests per ~30 s window, then `429` (and the block lengthens if you keep going). Two guards in `http.js`: `_siteRequests` counter (`siteRequestsLeft()`, `MAX_SITE_REQUESTS = 5` per run, 2 requests reserved for the episodes API) and an `isThrottled()` circuit breaker — a `429` **stops the run immediately** (no retry: the old 7 s retry failed and cost 2 requests + 14 s). Goal: 2 requests per run.
- **Search = 1 targeted request**: the catalog is FR, so the localized TMDB title (`fetchLocalizedTitles`, cached) comes before the EN title, and the query is `BASE Saison N` with `BASE` = the shortest variant that prefixes the main title ("Frieren" for "Frieren: Beyond Journey's End"). It selects the right page in one search and prevents a derived movie ("One Piece Film - Red") from outranking the series. Query order is `BASE Saison N` then `BASE`, for the FR base then the short prefix base, capped by `MAX_SEARCH_TITLES = 2`. Fallbacks (per-page deep fallback, FR backup titles) only exist if the budget allows: `siteRequestsLeft() >= 3` and the site is not throttled.
- **Link to the page**: `POST engine/ajax/search.php` (`query`, `page`) → `div.search-item` cards (title/version), then `GET engine/ajax/manga_episodes_api.php?id={newsid}` → `{vf, vostfr, info, alt_titles}` where `vf`/`vostfr` are **objects keyed by episode number** (`{vidzy, luluvid…}`), not arrays.
- **Languages and dedupe**: VOSTFR = `ja`, VF = `fr` (`applyLanguageLabel`), dedupe on `url|label` — not on `language` — because the site often serves the same URL under both VF and VOSTFR.
- **Dead CDNs**: `vidhsareup.*` dropped before resolution (no DNS anymore); `luluvid`/`luluvdo` end up on `*.tnmr.org`, which returns a **nginx 403** for any tokenized URL (tested with/without Referer and Origin) → filtered after resolution (`BLOCKED_CDN_TOKENS`, exception `cdn-tnmr.org`). These players may still work on a residential network: the Mobile setting **`allowBlockedCdns`** (`hasSettings` in the manifest, `onSettings` toggle) re-enables them; off by default.
- **Frequent missing content**: some pages exist only in VF (e.g. Gloutons & Dragons, AOT season 1: `vostfr = {}` for the whole season) — this is not a matching bug, do not "fix" it by relaxing the season guard.

### voiranime-rip (`voiranime.rip`, diag 2026-11)
- **Source of truth for players**: the inline JS object `const readers = {"vostfr":[…],"vf":[…]}` on each episode page (all languages, all CDNs). The old single-URL regex missed VF and half the mirrors.
- **Sagas**: some series are split into `/{slug}/saga-N-…-episode-78-a-143/episode-78/` instead of `saison-N`. Navigation through the page (`parseFicheSections`/`ficheCandidateUrls`, cap 5) + `episodePageMatches()` on `<title>` to reject another episode's page.
- **Search**: `POST /template-php/defaut/fetch.php`. FR titles with an apostrophe (`L'Attaque des Titans`) do not match → "slug" fallback: probe `/{normalized-slug}/` (e.g. `/lattaque-des-titans/`) then compacted variants, validating the page (`saison-`/`saga-`) against the WordPress soft-404.
- **Anti-wrong-content guard** (`validateFallbackMatch`): every word of a multi-word title must be present, or the glued form (`lattaquedestitans`), or — for a single-word title — no word foreign to the union of TMDB titles. Without it, `Godzilla` validated `Godzilla : La planète des monstres` for `Godzilla Minus One`.
- **Movies with no player on the page** (`/suzume/`, `/your-name-1/`): sources are on the pseudo-season page `/<slug>/film/episode-1/<vostfr|vf>/` (same `readers` object with **both** VF and VOSTFR). `extractMoviePageStreams` switches to it automatically when the page contains no player (Suzume: 0 → 4 streams, Your Name: 0 → 4).
- **Legitimate 0 streams**: sibnet is geo-blocked (403) from a datacenter; some movies stay at 0 even after the fallback (dead hosts or page missing from the site).

### papadustream (`papadustream.club`, diag 2026-11)
- **HLS master**: `/hls/p/{ts}/{token}/s4/(serial|movie)/tt…/{S}/{E}/playlist.m3u8` with `#EXT-X-MEDIA:TYPE=AUDIO … LANGUAGE="fr"|"en"|"ja"` tracks. VF and VO/VOSTFR come out on the **same URL** (track selection on the player side).
- **Anime VOSTFR**: the master only exposes a `ja` track → `buildStreams` now emits a `[VOSTFR]` stream (`language: ja`) instead of 0.
- **Missing page**: `/series/{tt}` redirects to the home page when the IMDb id is not hosted → fallback to title search, validated by the presence of the `EPISODES=[…]` table.

### jetanimes (`on.jetanimes.com`, diag 2026-11)
- **Search**: REST `wp-json/wp/v2/tvshows?search=…` first (~3 s, structured), gateway `https://jetanimes.com/?s=…` as backup → `.result-item` cards. The "no results" page contains menu links `/serie/…`: parse only `.result-item`, otherwise homonyms are kept and then 0 streams. **Stop at the first variant that returns pages** (remaining variants only feed scoring).
- **Episodes**: the `episodes` CPT is exposed via `/wp-json/wp/v2/episodes?search=…` (actual slugs diverge from the page, e.g. `sousou-no-frieren-frieren-saison-2-episode-8`). REST search is a multi-word LIKE, so degrade the query (full slug → last 3 tokens → longest token).
- **Bilingual slugs**: `lattaque-des-titans-shingeki-no-kyojin-hd` (page, with `-hd`) vs `lattaque-des-titans-shingeki-no-kyojin-saison-1-episode-1` (episodes) → prefix tolerance for queries ≥ 2 tokens (never for a single token: `naruto` ≠ `naruto-shippuden`).
- **Player**: `doo_player_ajax` (nume 1..2, `type=tv`) → `secured.lol/xxx` → **rotating domain** (`hdsplay*.tld`, `sentinel*.online`): accept any `/(e|v)/{code}` host, then p.a.c.k.e.r (VidHide) or API `/api/videos/{code}` + AES-GCM (legacy).
- **Time budget**: the `nonce` can be empty (verified live) → call `doo_player_ajax` directly with the episode's REST `id` (`resolveEpisodePage(…, postId)`), which avoids the page fetch (8 s TTFB). REST `episodes?slug=…&_fields=slug,link,id` first, page only if REST is empty; built-URL probes limited to 2. Player timeouts 8/10 s. Measured: 32-35 s → 23-28 s (the rest is site latency).
- **Language**: the Byse API `title` carries `(VF)`/`(VOSTFR)` — the only reliable source (the page always shows "VF et VOSTFR"). VF = `fr`, VOSTFR = `ja`.

### nakios (`nakios.live`, Laravel + Livewire, diag 2026-11)
- **Old backend dead**: `api.nakios.store` returns 525, `nakios.cyou` has no DNS anymore. Everything goes through the (SSR) front: no REST API to consume.
- **URLs**: `/movie/{slug}`, `/tv-show/{slug}`, `/episode/{slug}/{S}-{E}` (**title** slug, not episode). `GET /search/{query}` is enough to find a page; Livewire is only needed to read the page.
- **Sources**: servers live in the `wire:snapshot` HTML attribute of the `watch-component` (encoded JSON, `availableVersions` = `[['VF','VOSTFR']]`, `Server #1..4`, `Premium 1/2`). Parse the attribute with `JSON.parse` after decoding entities — **do not** run Livewire or a `livewire/update` request.
- **Limited catalog**: the site keeps only the **last season** of each series (The Boys = S5 only) and "One Piece" = the 2023 **live-action** series. If the requested season is missing, **explicitly** fall back to the available season (`loadWatchPage` → `servedSeason`), with the season number injected into the `title` (`Saison 5 (S1 absente du site)`); never a silent fallback, and no fallback if the episode exceeds the listed episode count.
- **Hosts**: vidzy (`.live`/`.org`) and uqload (`.is`→`.vc`) OK; kakaflix.lol, getvid.club, tnmr.org unreachable; dood/playmogo = Turnstile; **bysebuho.com = AES-256-GCM via WebCrypto (missing on NuvioTV) → excluded**.

### vostfree (`vostfree`, DLE engine, diag 2026-11)
- **`POST index.php?do=search` search is incomplete** (partial results, homonyms): **`sitemap.xml`** (~218 KB, ~1208 pages) is the catalog authority. Load it once per run, score titles, then probe pages.
- **Episodes**: page options `<button class="buttons_747">Episode 0747</button>` — the number is **in the text**, the `buttons_N` suffix is **not** sequential. For S2+, a page without a season marker requires the **absolute** episode in the strict pass (`MAX_PAGES`); a multi-episode page is rejected for a movie request. If the strict pass yields no streams, a **second pass** (`MAX_FALLBACK_PAGES`) serves the season actually available (page-local numbering) and writes it in the `title`: `· Saison 2 (S1 absente du site)`. The displayed season comes from the slug (`-saison-N-`), otherwise the DLE header `<li>… Saison:&nbsp;<b>01</b></li>` (`pageSeason()`), otherwise the h1/title; last resort only: `· Saison du site (S2 absente)`. Never a silent substitution.
- **Frozen catalog**: few series, partial seasons (Demon Slayer = S1 + "train de l'infini" arc, JJK = S1, One Piece VOSTFR starts at 747) → 0 streams is often the correct behavior.
- **Players**: the site only stores each embed's **ID**; iframe templates are in `templates/Animix/js/anime.js` (authority, mirrored in `playerUrl`). Live state 2026-11 on 120 sampled pages:
  - `sibnet` 120/120 — most common, **403 from a datacenter** (OK residential);
  - `uqload` 92/120 — **the only host reliable everywhere** (`.is`→`.co`);
  - `mail2` 10/120 — `my.mail.ru/video/embed/{id}`: **6/12 embeds return a direct signed MP4** (`cdn*.my.mail.ru/v/….mp4?slave[]=…`) → second usable host, `HOST_PRIORITY` right after uqload;
  - dead/verified unusable: `vip` 63 (getvid.club DNS dead, upvid/vudeo), `myvi` 49 (`myvi.ru` = domain **for sale**, `myvi.tv` unreachable), `ok` 27 (resolvable via `resolveOkRu`, but **0/28 catalog IDs still online** — `data-movie-id="null"`), `fembed` 13 (DNS dead), `moevideo` 13 (ninjastream), `gtv` 10 (`iframedream.com` = ad page), `kaztube` 7 (DNS dead), `rutube` 7 (platform alive but all catalog IDs deleted), `mp4` 3 (mail.ru flash, unresolvable content) → all filtered by `UNRESOLVABLE_HOSTS` (except `rutube`, `mail2`, `ok`).
- **`vip` slots (2,712 players / 200 pages)**: the site puts **full URLs** of a myriad of hosts there, none resolvable as of 2026-11 — live inventory: StreamSB family (`sbanh`, `sbfast`, `sbthe`, `sbhight`, `sblona`, `sbface`, `sblanh`, `sbspeed`, `sbrity`, `sbchill`, `sbbrisk`, `sblongvu`, `sbfull`, `viewsb`, `likessb`), `mixdrop.sx/.to` (page alive but resolution behind **reCAPTCHA v3**: POST with `token`+`csrf`+`vfile`+`vserver`), `vudeo.ws/.net/.io` (302 to `ww16/ww17` = parked domains), `ninjastream.to` (parked), `upvid.co`, `getvid.club`/`gvstream.xyz:8181`/`px62.gvlod.com` (DNS or ports dead), `streamtape`/`dood.so` (dead files, dood = Turnstile), `jetload`, `rapids`, `vidfast`, `vidspot`, `openload` (mail.ru flash or dead). All filtered by `UNRESOLVABLE_HOSTS`: on a `sibnet,myvi,ok,vip` page, resolution drops from ~20 s to ~11 s without losing streams.
  **Coverage by other providers**: 0-stream pages (deleted uqload files / sibnet-only) are already covered by the bundle — 2026-11 measurement on 11 Vostfree 0-stream pages (sitemap sample): `aniverse` 11/11, `voiranime` 10/11, `mugiwarastream` 6/11, `animoflix` 6/11, `fullanime` 5/11, `anime-sama` 4/11. Do not look for a new host for these cases: nothing to add on the Vostfree side.
  No other fallback host exists on the site: when uqload, sibnet and mail2 are dead for an episode, the 0 streams is real. Datacenter measurement (sibnet 403): 6/13 pages resolved via uqload; the remaining 0 are sibnet-only (OK residential) or deleted uqload files.

## Platforms — facts verified in the app source (2026-11)
Differences worth knowing before optimizing a provider (sources: `zonetest/NuvioTV`, `zonetest/NuvioMobile`):

- **Plugin timeouts**: cap **60 s** on NuvioMobile (`PluginRuntime.PLUGIN_TIMEOUT_MS`), **120 s** on NuvioTV (`PluginManager.SCRAPER_TIMEOUT_MS`). On expiry the result is **discarded** (partial included) → aim for a ≤ 45 s internal budget, valid on both.
- **Per-request HTTP**: 30 s on TV (blocking fetch), 60 s connect/read/write on Mobile → a provider that chains requests can exceed the Mobile cap while passing on TV.
- **Disk cache — Mobile Android only**: `OkHttp` `Cache(50 MB)` named `addon_http` (`AddonHttpClientProvider`) for cacheable GETs with HTTP headers. No equivalent on TV (only a single-flight `scraperId:tmdbId:type:s:e`). It is the only **cross-call** lever: sending proper `Cache-Control`/`ETag`/`Last-Modified` headers upstream benefits Mobile.
- **Result cap — TV**: `MAX_RESULT_ITEMS = 150` items **globally**, after `distinctBy { url }` across all scrapers; Mobile neither caps nor dedupes. `MAX_CONCURRENT_SCRAPERS = 10` on TV (extra scrapers are queued).
- **Cheerio documents — Mobile**: `DomBridge.MAX_CACHED_DOCUMENTS = 8` (LRU). Parsing a 9th page evicts the 1st → invalidated handles and empty selections. Extract strings before loading a new document in multi-page loops.
- **`bingeGroup`**: derived by TV (never supplied by the plugin), never set by Mobile — see the Provider API section.
- **Sorting/display — Mobile**: `sortedForGroupedDisplay` re-sorts a scraper's streams **alphabetically** (sourceName/name/description) → the provider's emission order is not the displayed order.
- **Cancellation — Mobile**: leaving the streams screen cancels the plugin run (partial result lost) → return early with already-resolved streams rather than waiting for full resolution.

## Runtime Constraints (QuickJS)
- **Unavailable**: `Buffer`, `process` (both apps); `setTimeout`/`setInterval` **on NuvioTV only** (polyfilled on Mobile, see below)
- **TextEncoder/TextDecoder**: Polyfilled **in pure JS** on NuvioMobile (`JsBindings`, not a native bridge) — **absent on NuvioTV**. Guard with `typeof TextEncoder !== 'undefined'` or avoid them entirely (string ops, `encodeURIComponent`, `atob`/`btoa` are polyfilled on both)
- **setTimeout/setInterval**: **polyfilled on NuvioMobile** (backed by coroutines, **capped at 60,000 ms**) — **absent on NuvioTV** → portable code must never depend on them (use home-grown budget/time guards)
- **AbortController/AbortSignal**: Polyfilled on both, but does **not** cancel the in-flight native fetch — NuvioMobile ignores `signal` entirely, NuvioTV only checks `aborted` before/after. Use budget/time guards instead
- **Crypto**: `CryptoJS` via `require('crypto-js')` on both runtimes; `crypto.subtle` (WebCrypto: AES-GCM/CBC/ECB, HMAC, PBKDF2, SHA-1/256/384/512, RSA/ECDSA sign/verify) **additionally on NuvioMobile only**
- **`TMDB_API_KEY`**: Exposed as `globalThis.TMDB_API_KEY` on **NuvioTV** (BuildConfig) **and on NuvioMobile** (`TmdbSettingsRepository.effectiveApiKey()` = user key if set, otherwise the bundled key) — keep the `typeof` fallback + bundled key in `src/utils/metadata.js`
- **Require()**: runtime `require()` only accepts `cheerio` / `cheerio-without-node-native` / `react-native-cheerio` (→ **home-grown JS polyfill on the app's jsoup**) and `crypto-js` (precompiled bytecode, global `CryptoJS`); any other module **throws**. ⚠ **Cheerio status (2026-10)**: deployed bundles **inline the real cheerio** (build.js without `external` since dc6e5d5, 04/29) — the polyfill is only a net for residual dynamic `require()`s. The **real cheerio** (Node test without `Buffer`/`TextDecoder`/`process`) supports `closest()`, `hasClass()`, `parent()`, `filter('.x')`. The "TV-safe" guards in the code stay in place (cost-free); re-validate on device before removing the "jsoup polyfill" notes.
- **Cheerio polyfill pitfalls (if `require()` falls back to it)**: `.filter('.sel')` is a **no-op** (only `.filter(fn)` filters), `.children(sel)` = `find(sel)` (descendants, not direct children), `$( '<div>…</div>' )` returns `[]`, `.text()` on multiple nodes joins with `" "`. The document cache is limited to **8**: extract strings before parsing a 9th page. These patterns do not exist in our providers: do not introduce them.
- **Cheerio polyfill on NuvioTV — MISSING methods** (TypeError if used): `.closest()`, `.hasClass()`, `.siblings()`, `.parents()`, `.nextAll()`, `.prevAll()`; `.parent()` always returns empty. Feature-detect (`typeof $(el).closest === 'function'`) or avoid
- **Fetch limits**:
  - Response body truncated at **1 MB of bytes**. Mobile **always** appends the `"\n...[truncated]"` suffix; **TV only appends it for the second cut, in characters (1 M)** — a UTF-8 page of 1 MB bytes cut at ~950k characters arrives **without a marker**. `safeFetch` detects the suffix **plus** the TV heuristic (HTML ≥ 700k chars that opens `<html>` without `</html>`), **refuses truncated HTML bodies (returns null)** and **never** caches a truncated response. Exported helpers: `isTruncatedBody()` / `RUNTIME_TRUNCATION_SUFFIX`. Truncated JSON is still delivered (dedicated guards: `json()` throws → null; `parseMaybeTruncatedJson` in `dle-extractor.js`). A truncated HLS manifest → `expandStreamQualities` serves the original URL without crashing.
  - Headers truncated at **8 KB per value**, keys lowercased **on both apps**, values joined with `,`
  - `response.json()` returns `null` (not rejected) on parse failure → always guard
- **Timeouts**: **hard cap** of 60 s per `getStreams` on NuvioMobile, 120 s on NuvioTV (on expiry the result is **discarded**, partial included); HTTP **30 s** (NuvioTV) / **60 s** (NuvioMobile) per request. Internal budgets to target: `PROVIDER_BUDGET_MS` = 45 s, `TV_BUDGET_MS` = 50 s — exit with partial results before the cap. On TV the fetch is blocking: total time is the **sum** of RTTs (`Promise.allSettled` parallelizes nothing)
- **User-Agent**: a short UA without a Chrome version is injected when absent → often rejected by Cloudflare. Always use the full Chrome UA (`USER_AGENT` from `src/utils/resolvers.js`)
- **Accept-Encoding** is stripped by the runtime → OkHttp decompresses gzip automatically (do not set it)
- **Partial `URLSearchParams`**: `append()` overwrites instead of appending, `getAll()` returns only one value, `get()` returns `null`, and `url.searchParams.set(...)` **does not update `url.href`** — build the query string by hand
- **Request header casing**: TV/Mobile add their default UA when the key is not exactly `User-Agent` (case-sensitive comparison) and use the default `Content-Type` otherwise → always use `User-Agent`, `Content-Type`, `Referer`, `Origin`
- **POST**: runtime default Content-Type = `application/x-www-form-urlencoded` → always set it explicitly
- **Plugin timeout**: 60 s per scraper on NuvioMobile, 120 s on NuvioTV (scrapers run in parallel, each in its own QuickJS instance) — see "Platforms — facts verified" for the other differences
- **Provider size limit**: 5 MB download limit

## Code Conventions
- Use `cheerio-without-node-native` (or `require('cheerio')`) for HTML parsing
  - No DOM manipulation (`.parent()` returns an empty collection)
- Use per-provider `http.js` wrappers instead of raw `fetch` (adds required headers)
- Use `resolveStream` from `src/utils/resolvers.js` to process final URLs
- Build targets **ES2020** (QuickJS supports async/await natively)
- Update `manifest.json` when adding/removing providers (references `providers/<provider>.js`)
- **Version bump = 2 files**: any `version` change in `manifest.json` must be mirrored in `README.md` (the `🏷️ Ver.` column of the provider table) — otherwise the docs advertise a version that is not shipped

## Provider Pitfalls (11/2026 diagnostics)
- **Always `parseInt`** `season`/`episode`: the app may pass **strings** (`"1"`), and `e.num === episode` fails silently → "episode not found" then 0 streams (fullanime bug).
- **Numbering**: the app's season comes from TMDB, while the site's numbering is often **absolute** (Naruto 220 eps) or **local per arc** (One Piece `saga-N` restarts at 1). `getAbsoluteEpisodeFromTmdb(tmdbId, season, episode)` (⚠️ **without** `mediaType`) is the authority; then convert using the cumulative episode counts of the arc pages. Never map `TMDB season → site saga` by equality (One Piece S4 ≠ `saga-4`).
- **Decoy pages**: some slugs (`one-piece-vostfr`, `naruto-vostfr`) contain only one episode — prefer the most complete page **whose slug contains no words foreign to the title** (otherwise `naruto-shippuden`'s 483 eps wins over `naruto`'s 220).
- **Disguised 404s**: a FullAnime 404 returns the home page with 200 and other series' latest episodes → **scope `/episode/N` link parsing to the requested slug**.
- **VF**: `fullanime` and `sekai` are **VOSTFR only** (no `-vf` page, no VF in the sitemap). Do not promise VF in the manifest/README; keep the label in `title`, `language: 'ja'`.
- **Hosts**: resolve **all** embeds (no `break` at 2 streams) — sibnet is geo-blocked (403) and vidmoly can go down.
- **ok.ru** (`resolveOkRu`): the old `dk?cmd=videoPlayerMetadata&mid=…` API now returns a login page. The manifest is in the `data-options` attribute of `https://ok.ru/videoembed/{id}` (JSON escaped as entities): `flashvars.metadata.hlsManifestUrl` (master `ok*.vkuser.net`) or `metadata.videos[]` (MP4 mobile/lowest/low/sd/hd/full). URLs are signed **per IP** — valid for the caller; `data-movie-id="null"` = deleted video.

## Testing
- **Test script**: `node test_providers.js [provider1 provider2 ...]` (tests all if none specified)
- Use any testing tools, libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- If the project does not have any testing tools, scripts, MCP tools, skills, etc. available for testing, ask the user whether testing should be skipped.
