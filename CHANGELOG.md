# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.22] - 2026-02-26

### Fixed
- **Sibnet Player Fallback (Critical)**: Fixed an issue where dead Sibnet video links would cause the video player to crash on providers like Vostfree, Voiranime, and French-Anime. The generic stream resolver fallback regex was too broad and incorrectly matched a CSS file (`social-likes_classic.css`) on the Sibnet error page, treating it as a valid direct video stream. Added a filter to ignore non-video file extensions (`.css`, `.js`, `.html`, etc.) in the generic fallback resolver.

## [1.1.21] - 2026-02-26

### Fixed
- **Cheerio Import Syntax (Critical)**: Fixed the import syntax for `cheerio-without-node-native`. Changed `import * as cheerio from 'cheerio-without-node-native'` to `import cheerio from 'cheerio-without-node-native'`. The previous syntax caused esbuild to transpile the import in a way that failed to resolve the `.load()` method correctly in the Nuvio app's Hermes environment, resulting in silent crashes and 0 streams returned for all providers.

## [1.1.20] - 2026-02-26

### Fixed
- **Revert Cheerio Bundling (Critical)**: Reverted the changes from v1.1.19 that bundled `cheerio-without-node-native` into the providers. Bundling cheerio caused a total regression in the Nuvio app, likely due to incompatible syntax for the Hermes engine. The app natively provides `cheerio-without-node-native`, so it should remain in `EXTERNAL_MODULES`. The export syntax fix from v1.1.18 should be sufficient to resolve the original issue.

## [1.1.19] - 2026-02-26

### Fixed
- **Build System - Cheerio Bundling (Critical)**: Removed `cheerio-without-node-native` from `EXTERNAL_MODULES` in `build.js` and added `mainFields: ['browser', 'module', 'main']` to the esbuild configuration. This forces the library to be bundled directly into the providers. Previously, providers like VoirAnime, VostFree, AnimeVostfr, and French-Anime crashed instantly in the Nuvio app because they relied on `cheerio` for search, which the app environment did not provide. Anime-Sama only worked partially because it only used `cheerio` as a fallback.

## [1.1.18] - 2026-02-26

### Fixed
- **Provider Exports - Nuvio Compatibility (Critical)**: Standardized the export syntax across all providers (`voiranime`, `vostfree`, `animevostfr`, `french-anime`) to use `module.exports = { getStreams };` instead of ES6 `export async function`. The ES6 syntax was being transpiled by esbuild into an object with an `__esModule` flag, which the Nuvio app's plugin loader could not read, resulting in empty stream arrays despite successful scraping.

## [1.1.19] - 2026-02-26

### Fixed
- **Build System - Cheerio Bundling (Critical)**: Removed `cheerio-without-node-native` from `EXTERNAL_MODULES` in `build.js` and added `mainFields: ['browser', 'module', 'main']` to the esbuild configuration. This forces the library to be bundled directly into the providers. Previously, providers like VoirAnime, VostFree, AnimeVostfr, and French-Anime crashed instantly in the Nuvio app because they relied on `cheerio` for search, which the app environment did not provide. Anime-Sama only worked partially because it only used `cheerio` as a fallback.

## [1.1.18] - 2026-02-26

### Fixed
- **Provider Exports - Nuvio Compatibility (Critical)**: Standardized the export syntax across all providers (`voiranime`, `vostfree`, `animevostfr`, `french-anime`) to use `module.exports = { getStreams };` instead of ES6 `export async function`. The ES6 syntax was being transpiled by esbuild into an object with an `__esModule` flag, which the Nuvio app's plugin loader could not read, resulting in empty stream arrays despite successful scraping.

## [1.1.17] - 2026-02-27

### Fixed
- **resolvers.js – safeFetch missing timeout (critical)**: `safeFetch` had no `AbortController` / timeout, so any slow or hanging resolver host (Sibnet, MyVi, Vidmoly…) would stall the entire `resolveStream` call indefinitely. An `AbortController` with a 10-second deadline is now applied to every `safeFetch` call; timed-out requests are treated as `null` (stream skipped), which unblocks providers like Anime-Sama and French-Anime that were stuck at stream resolution.
- **VoirAnime – extractBaseSlug picks OVA/film pages (critical)**: `extractBaseSlug` was only stripping numeric/language suffixes; slugs like `shingeki-no-kyojin-chronicle` passed through unmodified, were probed first, returned HTTP 200, and caused the extractor to return the wrong page (an OVA/film) instead of the main series. A `SPECIAL_SLUG_RE` guard now returns `null` for slugs containing known special-content keywords (`chronicle`, `ova`, `oav`, `gaiden`, `film`, `movie`, `lost-girls`, `kakusei`, `zenpen`, `kouhen`, `specials`, `hors-serie`, `memories`, `recap`, `compilation`), so those URLs are silently skipped during base-slug derivation and probing falls through to the correct main-series slug.

## [1.1.16] - 2026-02-26

### Fixed
- **VoirAnime – Season-aware slug prediction**: `searchAnime` now accepts a `season` parameter. For S1 it probes the bare slug (`shingeki-no-kyojin`); for later seasons it tries `{slug}-{N}`, `{slug}-{N}-vostfr`, `{slug}-{N}-vf`, `{slug}-saison-{N}`, etc. This resolves a systematic failure where S1 pages were never found because the site's keyword search omits them from results.
- **VoirAnime – Base-slug derivation from search results**: When keyword search returns season-specific pages (e.g. `shingeki-no-kyojin-3-vf`), the extractor now strips the season/language suffix to obtain the base slug, then probes season-specific variants directly. This allows S1 to be found even when it never appears in search results.
- **VoirAnime – Season scoring on search results**: Search result URLs are now scored by season relevance (e.g. a URL without any season suffix scores higher when looking for S1; a URL with `-N-` in it scores higher for SN). Wrong-season pages are deprioritised.
- **AnimeVOSTFR – Episode URL pattern mismatch (critical)**: `findEpisodeUrl` was only looking for `-saison-{N}-episode-{EP}` patterns, but the site's real URL structure uses `-{N}-episode-{EP}` (no "saison" word). The correct pattern is now tried first; the old "saison" pattern is kept as a legacy fallback.
- **AnimeVOSTFR – Title language ordering**: Added FR-first `titlesOrdered` sorting. The site's search engine returns the login/home page (16 KB) for English queries; searching with the French title (e.g. "L'Attaque des Titans") reliably returns the correct anime pages.

## [1.1.15] - 2026-02-26

### Fixed
- **Vostfree – Episode matching (3-digit padding)**: Fixed a regex comparison bug where episodes ≥ 10 were never matched because the site formats them as `Episode 010` (zero-padded to 3 digits). The extractor now uses `parseInt` to compare the numeric value directly.
- **Anime-Sama – varRegex multiline**: Fixed a regex that used a lazy `.*?` match inside a large JS array, causing it to silently fail on multi-line variable declarations. Replaced with `[\s\S]*?` and added a semicolon anchor to correctly capture the full array.
- **VoirAnime – iframe fallback**: Broadened the iframe detection logic to catch any external iframe (not just `voiranime.com`), and made the host-page iframe regex more flexible to handle varied quote styles and attribute order.
- **French-Anime – Search selector cascade**: Fixed the search scraper which returned 0 results due to the site removing the `a.mov-t` CSS class. The extractor now cascades through `a.mov-t`, `.mov-t a`, `.title a`, `h2 a`, `h3 a`, and finally any `<a>` pointing to a French-Anime URL.

### Improved
- **resolveVidmoly – Anti-bot JS redirect**: The resolver now detects `window.location.replace()` and `window.location.href` JS redirects (Vidmoly's JWT-based bot protection) and re-fetches the redirect target with proper `Referer`/`Origin` headers. Also broadened the video URL pattern to match both `file:` keys and raw `http` URLs.
- **resolveVoe – Obfuscation handling**: Fixed a broken redirect regex (`['\"]+` typo). Added multi-pass `atob` scanning to decode VOE's XOR/base64-obfuscated HLS URLs. Added fallback to raw `m3u8` URL pattern. Added `Referer` header throughout.
- **resolveSendvid – HTML5 source extraction**: Normalizes the URL to the `/embed/hash` form, adds `<source src=>` HTML5 video element pattern and `file:` key pattern alongside the original patterns. Added `Referer` header.
- **resolveUqload – Dead domain fallback**: The original `uqload.com` domain is defunct. The resolver now iterates through 5 known domains (`uqload.co`, `.com`, `.io`, `uqloads.xyz`, `.to`) and returns the first successful extraction.

### Added
- **resolveMyTV**: New resolver for `myvi.ru` / `mytv` embeds. Tries embed-page extraction with P.A.C.K.E.R unpacking, then falls back to the `/api/video/{id}` JSON endpoint. Dispatched automatically in `resolveStream` for any URL containing `myvi.` or `mytv.`.

## [1.1.14] - 2026-02-25

### Fixed
- **Critical: cheerio module not available in app (root cause of "no stream available")**: Identified that at version 1.0.1 the build script correctly listed `cheerio-without-node-native` as an external module (provided by the Nuvio runtime). During refactoring, all `import cheerio from 'cheerio-without-node-native'` were changed to `import * as cheerio from 'cheerio'`, but `cheerio` was never provided by the Nuvio app. This caused a silent `require('cheerio')` crash on every provider, returning 0 streams.
- **Fix**: Reverted all extractor cheerio imports back to `cheerio-without-node-native` (the module Nuvio actually provides) and restored it to `EXTERNAL_MODULES` in `build.js`.

## [1.1.13] - 2026-02-25

### Fixed
- **Critical: TMDB Title Resolution in App**: Replaced HTML scraping of the TMDB website with direct calls to the **TMDB JSON API** (`api.themoviedb.org/3`). The website scraping was returning empty results inside Nuvio (React Native / Hermes engine), causing all providers to return 0 streams. The JSON API is stable, fast, and returns structured data.
- **New Shared Utility**: Created `src/utils/metadata.js` with a single `getTmdbTitles()` function used by all providers. This eliminates code duplication and improves maintainability.
- **Richer Title Data**: The utility now fetches the English title, French translation, and original title (romaji if Latin-script) from TMDB in 2 API calls, giving providers 2-3 title variations to search with.

## [1.1.12] - 2026-02-25

### Fixed
- **Global Search & Localization**: Fixed a major issue where popular animes (like "Attack on Titan") returned "no stream available" due to strict English title matching.
- **Vostfree, French-Anime, Voiranime**: Updated TMDB fetching logic to retrieve both English (`en-US`) and French (`fr-FR`) titles. The scrapers now fallback to searching the French title if the English one yields no results.
- **AnimeVOSTFR & Voiranime**: Added a search fallback mechanism. If the strict title filter eliminates all results but the site's search engine found matches (e.g., returning "Shingeki no Kyojin" for "Attack on Titan"), the scraper now trusts the search engine.
- **Anime-Sama**: Fixed the search functionality which was broken due to site changes. The scraper now correctly uses their AJAX endpoint (`/template-php/defaut/fetch.php`) via POST request to retrieve anime slugs.
- **French-Anime**: Fixed a regex bug in `parseEpisodeData` that prevented the detection of video links starting with `//` instead of `http://`.
- **Global**: Fixed Node.js ESM compatibility issues by updating `cheerio` imports (`import * as cheerio from 'cheerio'`) across all providers.

## [1.1.11] - 2026-02-25

### Fixed
- **AnimeVOSTFR ArmSync**: Improved episode matching logic to correctly handle complex URL structures (e.g., `jujutsu-kaisen-2-saison-2-episode-10`). The scraper now strictly verifies that the season number in the URL matches the requested season when searching for relative episodes, preventing false positives from other seasons.

## [1.1.10] - 2026-02-25

### Fixed
- **AnimeVOSTFR ArmSync**: Fixed a critical regex bug where the episode matcher would incorrectly match the season number or other numbers in the URL slug, causing ArmSync to fail.
- **ExoPlaybackException Fix**: Added a strict filter across all providers (`animevostfr`, `anime-sama`, `vostfree`, `voiranime`, `french-anime`) to only return streams that are successfully resolved to direct video links (`isDirect: true`). This prevents Nuvio from passing HTML iframe pages to ExoPlayer, which caused `ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED 23003` crashes.

## [1.1.9] - 2026-02-25

### Changed
- **FRAnime**: Temporarily disabled the provider due to aggressive Cloudflare protection and Next.js architecture changes.
- Updated all providers to version 1.1.9 in `manifest.json`.

## [1.1.8] - 2026-02-25

### Added
- **Smart-Peel Resolver**: New universal extraction engine in `src/utils/resolvers.js` with recursive iframe detection (depth 3).
- Added support for video hosts: **Sendvid**, **Luluvid**, and **HGCloud**.
- Automatic **P.A.C.K.E.R** unpacking at every level of the recursive resolution.

### Changed
- **ArmSync Global Hardening**: Applied strict season prioritization and exact episode regex matching across **all** providers (`voiranime`, `vostfree`, `french-anime`, `anime-sama`).
- **AnimeVOSTFR Hardening**: Refactored episode discovery to use strict Regex boundaries (`(?:^|[^0-9])`) to prevent incorrect episode matching (e.g., ep 1 matching ep 10).
- **ArmSync Optimization**: Search results are now prioritized based on the target season to ensure better metadata accuracy.
- Updated all providers to version 1.1.8 in `manifest.json`.

### Fixed
- **Critical Resolver Fixes**: 
  - Fixed the `unpack` function which was failing to decode P.A.C.K.E.R scripts when passed an entire HTML document. This restores functionality for **Vidmoly**, **Streamtape**, **Luluvid**, and **Doodstream**.
  - Fixed a bug in `resolveStream` where it would recursively fetch the final video stream as HTML, causing timeouts and failures for non-standard URLs (like Doodstream).
  - Added missing `Referer` headers for **Luluvid**, **Voe**, **HGCloud**, and **Moon** to bypass hotlink protection.
- Fixed iframe nesting issues in **AnimeVOSTFR** (`trembed`) and **French-Anime** (`vido`).

## [1.1.7] - 2026-02-24

### Added
- Internal release with initial ArmSync support.

## [1.1.0] - 2026-02-20

### Added
- Initial implementation of the 6 main providers (Anime-Sama, VoirAnime, Vostfree, FRAnime, French-Anime, AnimeVOSTFR).
- Base build system using `esbuild`.
