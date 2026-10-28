# 🚀 Nuvio French Providers Bundle

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.2.4-green.svg)](manifest.json)
[![Providers](https://img.shields.io/badge/providers-37-brightgreen.svg)](manifest.json)
[![Runtime](https://img.shields.io/badge/runtime-QuickJS-orange.svg)](#-quickjs-runtime)

An optimized collection of French streaming plugins for the **Nuvio** app. This bundle covers anime (VF/VOSTFR), movies and series with a direct-link resolution system for smooth playback on mobile **and TV**.

> Versions and formats in this document are synchronized with [`manifest.json`](manifest.json) (repo **1.2.4**).

---

## 📱 Quick install

1. Open **Nuvio** > **Settings** > **Content & Discovery** > **Plugins**.
2. Add the repository URL in the "Repository" section:
   ```text
   https://raw.githubusercontent.com/Gowaru/gowaru-nuvio-providers/refs/heads/main/
   ```
3. Refresh, then enable the plugins you want.

---

## 🇫🇷 Included providers (37)

This bundle ships **37 providers** covering the French streaming landscape — anime, movies & series, in VF and VOSTFR.

### 📊 Anime (26)

| # | Provider | 🎬 Content | 🌐 Lang | 💾 Formats | 📱 App | 📺 TV | 🏷️ Ver. |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :-: |
| 1 | **ADKami** | 🎬📺 | FR / JA | — | ✅ | ✅ | 0.1.2 |
| 2 | **Anime-Sama** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.1.59 |
| 3 | **AnimeSite** | 🎬📺 | FR / JA | — | ✅ | ✅ | 0.1.3 |
| 4 | **Anime-Ultime** ¹ | 🎬📺 | VF / VOSTFR | MP4 | ✅ | ✅ | 0.0.5 |
| 5 | **AnimeVOST.fr** | 📺 _only_ | VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.1.2 |
| 6 | **AnimeVOSTFR** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.1.54 |
| 7 | **AnimesUltra** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.0.39 |
| 8 | **AnimeSama.co (DLE Mirror)** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.14 |
| 9 | **AnimoFlix** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.0.19 |
| 10 | **Aniverse** | 🎬📺 | FR / JA | M3U8 | ✅ | ✅ | 0.2.2 |
| 11 | **Franime** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.0.3 |
| 12 | **FullAnime** | 🎬📺 | VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.0.5 |
| 13 | **French-Anime** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.1.3 |
| 14 | **French-Manga** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.15 |
| 15 | **Jetanimes** | 📺 _only_ | VOSTFR | — | ✅ | ✅ | 0.1.3 |
| 16 | **Mugiwara-no-Streaming** | 🎬📺 | VF / VOSTFR | MP4, MKV, M3U8 | ✅ | ✅ | 1.0.20 |
| 17 | **Neko-Sama** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.0.4 |
| 18 | **SenAnimes** | 🎬📺 | FR / JA | — | ✅ | ✅ | 0.1.2 |
| 19 | **Sekai** ² | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ⚠️ | 1.0.26 |
| 20 | **VoirAnime** ³ | 🎬📺 | VF / VOSTFR | MP4, MKV, M3U8 | ✅ | ⚠️ | 1.2.25 |
| 21 | **VoirAnime.homes** _DLE_ | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.1.3 |
| 22 | **VoirAnime.one** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.1.2 |
| 23 | **VoirAnime.rip** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.16 |
| 24 | **VoiranimeBE** | 🎬📺 | VOSTFR / JA | — | ✅ | ✅ | 0.1.2 |
| 25 | **Vostfree** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.1.56 |
| 26 | **WaveAnime** ⁴ | 🎬📺 | VF / VOSTFR | DASH | ✅ | ✅ | 0.0.9 |

### 🎬 Movies & Series (11)

| # | Provider | 🎬 Content | 🌐 Lang | 💾 Formats | 📱 App | 📺 TV | 🏷️ Ver. |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :-: |
| 27 | **Coflix** ⁵ | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ⚠️ | 2.0.4 |
| 28 | **DuLourd** | 📺 _only_ | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.14 |
| 29 | **Flemmix** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.13 |
| 30 | **Frenchstream** ⚙️ | 🎬📺 | VF / VOSTFR | MP4, MKV, M3U8 | ✅ | ✅ | 2.0.23 |
| 31 | **Movix** ⚙️ | 🎬📺 | VF / VOSTFR | MP4, MKV, M3U8 | ✅ | ✅ | 0.1.4 |
| 32 | **Nakios** | 🎬📺 | FR / EN | MP4 | ✅ | ✅ | 1.0.4 |
| 33 | **Papadustream** | 🎬📺 | FR / EN | M3U8 | ✅ | ✅ | 1.1.1 |
| 34 | **StreamZo** | 🎬📺 | VF / VOSTFR | M3U8 | ✅ | ✅ | 1.0.7 |
| 35 | **Voirdrama** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.0.4 |
| 36 | **Webflix** ⚙️ | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 0.1.4 |
| 37 | **Wookafr** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.15 |

> **Legend:**
> - 🎬📺 = Movies & Series | 📺 _only_ = Series only
> - ✅ = Working | ⚠️ = Known limitations (see notes)
> - 📱 App = NuvioMobile (Android/iOS) | 📺 TV = NuvioTV
> - ⚙️ = Provider with a built-in settings UI (`hasSettings`)
> - Formats "—": formats not declared in the manifest (multi-quality players via resolver)
>
> **Notes:**
> - ¹ **Anime-Ultime**: licensed series are excluded by the site (catalog limited to unlicensed animes).
> - ² **Sekai**: direct MP4s (1080p/720p/360p) — multi-variant probing with rate limiting can exceed NuvioTV's 30 s window on large titles; disabled on TV (`disabledPlatforms: ["tv"]`).
> - ³ **VoirAnime**: multi-host resolution (Sibnet, Uqload, Voe, Dood, Vidzy…) — the slowest titles can exceed NuvioTV's 30 s window; disabled on TV.
> - ⁴ **WaveAnime**: native DASH (MPD) playback via ExoPlayer/Media3 on NuvioMobile (Android) **and NuvioTV**. External ASS subtitles: NuvioMobile only (NuvioTV ignores the `subtitles` field).
> - ⁵ **Coflix**: multi-domain probing + `lecteurvideo` embeds — falls back to embed links (not natively playable) when direct resolution fails.

---

## 🛠️ Technical features

- **Universal resolver**: automatic resolution engine for popular hosts (**Sibnet, Vidmoly, Uqload, VOE, XtremeStream, Sendvid, VidCDN, FSVID/Vidzy…**). No more `ExoPlaybackException` errors!
  - **VOE**: classic player decoding (encoded payload ROT13 → base64 → shift → reverse → base64), multi-redirections of rotating domains, anti-decoy "Big Buck Bunny".
  - **XtremeStream**: `video_id` extraction + `xs1.php` loader → signed m3u8 master (main player of the `lecteurvideo` embed).
- **Fake-Direct filtering**: rejects sample links (Big Buck Bunny, known test URLs) before they reach the player.
- **HLS quality expansion**: HLS masters are expanded into selectable resolutions (`2160p`, `1080p`, `720p`, `480p`, `360p`).
- **Direct-Only Safety**: strictly outputs direct links (`.m3u8`, `.mp4`…) to reduce ExoPlayer errors; unresolved HTML embeds (`isDirect:false`) are **never** returned.
- **Episode-mismatch guard**: strict season/episode validation (no silent fallback to another season), ArmSync for absolute numbering, anti-fan-edit and anti-homonym safeguards (title scoring).
- **Per-provider settings**: in-app UI (header/info/text/select/toggle) via `SCRAPER_SETTINGS` — driving providers: Frenchstream, Movix, Webflix.
- **QuickJS-optimized**: string ops + `atob`/`btoa` polyfills, no `Buffer`/`setTimeout`/`process`, in-house time budgets (60 s plugin).

### 🔧 Environment variables

| Variable | Provider | Default | Description |
| :--- | :--- | :-: | :--- |
| `NUVIO_NAKIOS_EXCLUDE_PREMIUM` | Nakios | `0` | `1` = excludes premium sources. If no free source is available, the provider returns 0 streams. |

---

## 👨‍💻 For contributors

### Project structure

```text
gowaru-nuvio-providers/
├── src/                      # Source code (one folder per provider)
│   ├── utils/                # Shared logic (resolvers, http, cache, metadata…)
│   └── <provider>/
│       ├── index.js          # Entry point (exports getStreams + onSettings)
│       ├── extractor.js      # HTML/API extraction
│       ├── http.js           # fetchText/fetchJson wrappers (anti-Cloudflare headers)
│       └── config.js         # Constants (optional)
├── providers/                # Compiled files — DO NOT EDIT (esbuild IIFE build)
├── manifest.json             # Plugin registry (versions, formats, platforms)
├── build.js                  # Bundling script (esbuild)
└── test_providers.js         # Integration tests (node test_providers.js [provider…])
```

### Provider API

```js
// Mandatory signature
getStreams(tmdbId, mediaType, season, episode) → Promise<Array<Stream>>
// Stream: { url (required), title, name, quality, headers, language, size, subtitles… }
```

### Setup

```bash
npm install

# Build all providers (dev, non-minified)
npm run build

# Minified build (used by CI)
npm run build:minify

# Single provider
node build.js frenchstream

# Watch mode (development)
npm run build:watch

# Local server (manifest + providers at http://<local-ip>:3000)
npm run serve

# Integration tests
node test_providers.js frenchstream wookafr
```

### Code conventions

- HTML parsing with `cheerio-without-node-native` (no DOM manipulation: empty `.parent()`).
- Use per-provider `http.js` wrappers (required headers, no raw `fetch`).
- Process final URLs through `resolveStream` / `toStream` from `src/utils/resolvers.js`.
- **QuickJS runtime**: no `Buffer`, `setTimeout`, `process`, `crypto.subtle` (TV); atob/btoa OK; time budgets rather than timeouts.
- Targets **ES2020** (native async/await).
- Update `manifest.json` (patch version) when adding/removing/modifying a provider.
- Never write `supportedPlatforms:["tv"]` nor `disabledPlatforms:["android"|"ios"]` (would hide the provider on Mobile).

---

## 📜 License

Distributed under the **GPL-3.0** license — see the [LICENSE](LICENSE) file.

---
*Maintained by Gowaru.*
