# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.8] - 2026-02-25

### Added
- **Smart-Peel Resolver**: New universal extraction engine in `src/utils/resolvers.js` with recursive iframe detection (depth 3).
- Added support for video hosts: **Sendvid**, **Luluvid**, and **HGCloud**.
- Automatic **P.A.C.K.E.R** unpacking at every level of the recursive resolution.

### Changed
- **AnimeVOSTFR Hardening**: Refactored episode discovery to use strict Regex boundaries (`(?:^|[^0-9])`) to prevent incorrect episode matching (e.g., ep 1 matching ep 10).
- **ArmSync Optimization**: Search results are now prioritized based on the target season to ensure better metadata accuracy.
- Updated all providers to version 1.1.8 in `manifest.json`.

### Fixed
- Fixed iframe nesting issues in **AnimeVOSTFR** (`trembed`) and **French-Anime** (`vido`).

## [1.1.7] - 2026-02-24

### Added
- Internal release with initial ArmSync support.

## [1.1.0] - 2026-02-20

### Added
- Initial implementation of the 6 main providers (Anime-Sama, VoirAnime, Vostfree, FRAnime, French-Anime, AnimeVOSTFR).
- Base build system using `esbuild`.
