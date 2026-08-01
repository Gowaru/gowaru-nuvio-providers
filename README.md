# 🚀 Nuvio French Providers Bundle

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.2.0-green.svg)](manifest.json)
[![Safety](https://img.shields.io/badge/vulnerabilities-0-brightgreen.svg)](package.json)

An optimized collection of French streaming plugins for the **Nuvio** application. This repository bundles the best anime sources (VF/VOSTFR) with a direct link resolution system for smooth mobile playback.

---

## 📱 Quick Installation

To use these providers in your Nuvio app:

1. Open **Nuvio** > **Settings** > **Content & Discovery** > **Plugins**.
2. Add the following URL in the "Repository" section:
   ```text
   https://raw.githubusercontent.com/Gowaru/gowaru-nuvio-providers/refs/heads/main/
   ```
3. Refresh and enable the desired plugins.

---

## 🇫🇷 Included Providers

This bundle integrates **23 providers** covering the French streaming landscape — from anime to movies & series, in VF and VOSTFR.

### 📊 Provider Overview

| # | Provider | 🎬 Content | 🌐 Lang | 💾 Formats | 📱 App | 📺 TV | 🏷️ Ver. |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :-: |
| | **🎌 Anime** | | | | | | |
| 1 | **Sekai** ³ | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ⚠️ | 1.0.21 |
| 2 | **Anime-Sama** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.1.49 |
| 3 | **AnimeSama.co** _DLE_ | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.7 |
| 4 | **AnimesUltra** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.0.31 |
| 5 | **Anime-Ultime** ¹ | 🎬📺 | VF / VOSTFR | MP4 | ✅ | ✅ | 1.0.0 |
| 6 | **AnimeVOSTFR** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.1.45 |
| 7 | **AnimoFlix** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.0.13 |
| 8 | **French-Manga** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.7 |
| 9 | **Mugiwara** | 🎬📺 | VF / VOSTFR | MP4, MKV, M3U8 | ✅ | ✅ | 1.0.13 |
| 10 | **VoirAnime** ⁴ | 🎬📺 | VF / VOSTFR | MP4, MKV, M3U8 | ✅ | ⚠️ | 1.2.18 |
| 11 | **VoirAnime.rip** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.9 |
| 12 | **VoirAnime.homes** _DLE_ | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.0 |
| 13 | **Vostfree** | 🎬📺 | VF / VOSTFR | MP4, MKV | ✅ | ✅ | 1.1.49 |
| 14 | **WaveAnime** ² | 🎬📺 | VF / VOSTFR | DASH | ✅ | ✅ | 0.0.2 |
| | **🎬 Movies & Series** | | | | | | |
| 15 | **Coflix** ⁵ | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ⚠️ | 1.0.8 |
| 16 | **DuLourd** | 📺 _only_ | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.11 |
| 17 | **Flemmix** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.8 |
| 18 | **Frenchstream** | 🎬📺 | VF / VOSTFR | MP4, MKV, M3U8 | ✅ | ✅ | 2.0.12 |
| 19 | **Movix** | 🎬📺 | VF / VOSTFR | MP4, MKV, M3U8 | ✅ | ✅ | 1.0.35 |
| 20 | **Nakios** | 🎬📺 | FR / EN | MP4 | ✅ | ✅ | 1.0.1 |
| 21 | **Papadustream** | 📺 _only_ | FR / EN | M3U8 | ✅ | ✅ | 1.0.1 |
| 22 | **StreamZo** | 🎬📺 | VF / VOSTFR | M3U8 | ✅ | ✅ | 1.0.1 |
| 23 | **Wookafr** | 🎬📺 | VF / VOSTFR | MP4, M3U8 | ✅ | ✅ | 1.0.8 |

> **Legend:**
> - 🎬📺 = Movies & Series  |  📺 _only_ = Series only
> - ✅ = Fully functional  |  ⚠️ = Known limitations
> - 📱 App = NuvioApp compatibility  |  📺 TV = NuvioTV compatibility
>
> **Notes:**
> - ¹ **Anime-Ultime**: licensed series are excluded by the site (catalog limited to unlicensed anime).
> - ² **WaveAnime**: DASH (MPD) playback — native via ExoPlayer/Media3 on NuvioMobile (Android) **and NuvioTV** (ExoPlayer, not AVPlayer). iOS: player MPV (MPVKit) — support DASH à confirmer sur appareil réel. Sous-titres ASS externes : supportés sur NuvioMobile uniquement (NuvioTV ignore le champ `subtitles`).
> - ³ **Sekai**: direct MP4 (1080p/720p/360p) — multi-saga probing with rate limiting may exceed NuvioTV's 30s request window on large titles.
> - ⁴ **VoirAnime**: multi-host resolution (Sibnet, Uqload, Voe, Dood, Vidzy…) — slowest titles may exceed NuvioTV's 30s request window.
> - ⁵ **Coflix**: multi-domain probing + `lecteurvideo` embeds — falls back to embed links (not natively playable) when direct resolution fails.

---

## 🛠️ Technical Features

- **Universal Resolver**: Includes an automatic resolution engine for popular hosts (**Sibnet, Vidmoly, Uqload, Voe, Sendvid, VidCDN...**). No more `ExoPlaybackException` errors!
- **Fake-Direct Filtering**: Rejects sample links such as Big Buck Bunny and other known test URLs before they reach the player.
- **HLS Quality Extraction**: Master HLS manifests are expanded into multiple selectable resolutions when available, with normalized labels such as `2160p`, `1080p`, `720p`, `480p`, and `360p`.
- **Direct-Only Playback Safety**: Stream output keeps strict direct-link filtering (`.m3u8`, `.mp4`, etc.) to reduce ExoPlayer HTTP/playback errors.
- **Mobile Optimized**: "Embed" (HTML) links are transformed into direct video links (`.mp4`, `.m3u8`) for native compatibility with Android/iOS players.
- **Security Check**: Regular dependency audits to ensure vulnerability-free code.

### 🔧 Environment Variables

Some providers support runtime configuration via environment variables. These can be set in your Nuvio environment or passed to the build/execution context.

| Variable | Provider | Default | Description |
| :--- | :--- | :-: | :--- |
| `NUVIO_NAKIOS_EXCLUDE_PREMIUM` | Nakios | `0` | Set to `1` to exclude premium-only sources. When enabled, only free (non-premium) streams are returned. If no free source is available, the provider returns 0 streams. |

---

### 📱 User Configuration

For NuvioApp/NuvioTV users, these variables can be configured via the app's plugin settings (refer to your app's documentation). For local testing:

```bash
# Example: Exclude premium Nakios sources
NUVIO_NAKIOS_EXCLUDE_PREMIUM=1 node -e "const {getStreams} = require('./providers/nakios.js'); getStreams('114410', 'tv', 1, 1).then(s => console.log(s.length, 'stream(s)'));"
```

---

## 👨‍💻 For Contributors

### Project Structure

```text
nuvio-providers/
├── src/                    # Source code (one folder per provider)
│   ├── utils/              # Shared logic (Resolvers, HTTP helpers)
│   └── [provider]/
│       ├── index.js        # Entry point (exports getStreams)
│       └── extractor.js    # HTML/API extraction logic
├── providers/              # Compiled and minified files (do not edit directly)
├── manifest.json           # Plugin registry
└── build.js                # Bundling script (based on esbuild)
```

### Development Setup

1. **Installation**:
   ```bash
   npm install
   ```

2. **Create a new provider**:
   Create a folder in `src/` inspired by existing providers. Ensure you export a function `getStreams(tmdbId, mediaType, season, episode)`.

3. **Build**:
   ```bash
   # Build and minify all plugins
   npm run build

   # Build in watch mode (development)
   npm run build:watch
   ```

### Code Conventions
- Use `cheerio` (imported as `cheerio-without-node-native`) for HTML parsing.
- Import `resolveStream` from `../utils/resolvers.js` to process your final URLs.
- Always use `fetchText` or `fetchJson` wrappers located in standard `http.js` utilities to inject correct headers and avoid Cloudflare blocks.
- Prefer `fetch` (Hermes compatible) over heavy external libraries.

---

## 📜 License

This project is distributed under the **GPL-3.0** license. See the [LICENSE](LICENSE) file for more details.

---
*Maintained by Gowaru.*
