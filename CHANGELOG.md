# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
