# 🚀 Nuvio French Providers Bundle

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.52-green.svg)](manifest.json)
[![Safety](https://img.shields.io/badge/vulnerabilities-0-brightgreen.svg)](package.json)

An optimized collection of French streaming plugins for the **Nuvio** application. This repository bundles the best anime sources (VF/VOSTFR) with a direct link resolution system for smooth mobile playback.

---

## 📱 Quick Installation

To use these providers in your Nuvio app:

1. Open **Nuvio** > **Settings** > **Plugins**.
2. Add the following URL in the "Repository" section:
   ```text
   https://raw.githubusercontent.com/Gowaru/gowaru-nuvio-providers/refs/heads/main/
   ```
3. Refresh and enable the desired plugins.

---

## 🇫🇷 Included Providers

This bundle integrates 11 pillars of the French streaming scene:

| Provider | Description | Languages | Status |
| :--- | :--- | :--- | :---: |
| **Sekai** | Specialized in big anime series. Ultra-fast direct streams. | VF / VOSTFR | ⚠️ |
| **Anime-Sama** | Massive catalog, daily updates. | VF / VOSTFR | ✅ |
| **AnimesUltra** | Complete catalog based on DataLife Engine. | VF / VOSTFR | ✅ |
| **FRAnime** | Modern interface, fast API. | VF / VOSTFR | ❌ |
| **VoirAnime** | Comprehensive historical archive. | VF / VOSTFR | ✅ |
| **Vostfree** | Specialist in streaming & downloads. | VF / VOSTFR | ✅ |
| **French-Anime** | Large choice of alternative servers. | VF / VOSTFR | ✅ |
| **AnimeVOSTFR** | High-quality alternative source. | VF / VOSTFR | ✅ |
| **JetAnimes** | Dooplay-based alternative tracker. | VF / VOSTFR | ❌  |
| **Movix** | Movies and TV series in French and with French subtitles. | VF / VOSTFR | ✅ |
| **Frenchstream** | French movies and series with direct HLS resolution on supported hosts. | VF / VOSTFR | ✅ |

*(Note: JetAnimes is currently marked with a warning as it heavily utilizes gatekeeping link redirectors like secured.lol)*

**⚠️ Provider Status Legend:**
- ✅ = Fully functional
- ⚠️ = Operational but with known issues/limitations  
- ❌ = Offline/Unavailable

---

## 🛠️ Technical Features

- **Universal Resolver**: Includes an automatic resolution engine for popular hosts (**Sibnet, Vidmoly, Uqload, Voe, Sendvid, VidCDN...**). No more `ExoPlaybackException` errors!
- **Fake-Direct Filtering**: Rejects sample links such as Big Buck Bunny and other known test URLs before they reach the player.
- **HLS Quality Extraction**: Master HLS manifests are expanded into multiple selectable resolutions when available, with normalized labels such as `2160p`, `1080p`, `720p`, `480p`, and `360p`.
- **Direct-Only Playback Safety**: Stream output keeps strict direct-link filtering (`.m3u8`, `.mp4`, etc.) to reduce ExoPlayer HTTP/playback errors.
- **Mobile Optimized**: "Embed" (HTML) links are transformed into direct video links (`.mp4`, `.m3u8`) for native compatibility with Android/iOS players.
- **ESM -> CJS Transpilation & Minification**: Modern source code (ES6+) automatically converted, optimized and minified for the **Hermes** JavaScript engine.
- **Security Check**: Regular dependency audits to ensure vulnerability-free code.

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

### NuvioTV Release Workflow
- Develop providers in `src/` when the logic is complex.
- Always ship the final artifact as a single-file bundle under `providers/`.
- Test the compiled file in the Nuvio Plugin Tester before publishing.
- Keep top-level code minimal so the provider can load cleanly inside Hermes.
- Prefer lightweight parsing and avoid Node-only helpers such as `Buffer`, `fs`, or dynamic `require` in runtime code.

### Local Android TV 13 test (no publish needed)

Run local checks directly against compiled providers before pushing:

```bash
# 1) Rebuild providers locally
npm run build

# 2) Quick Android TV 13 simulation for Frenchstream
npm run test:androidtv13 -- --provider frenchstream --type movie --ids 550,603,13 --timeout 45000

# 3) Compare default profile vs TV profile on same IDs
npm run test:provider:both -- --provider frenchstream --type tv --season 1 --episode 1 --ids 1399,94605 --timeout 45000
```

Pre-publish gate (build + movie tests default + simulated Android TV, exit code 1 if below threshold):

```bash
npm run release-check

# Relax gate (e.g. flaky network)
npm run release-check -- --gate-percent 25

# Already built + log Movix API probes
npm run release-check -- --skip-build --probe-api
```

Useful flags:
- `--profile default|tv|both` to choose runtime profile.
- `--android-tv13` to force an Android TV 13 user-agent + TV globals.
- `--timeout 45000` to increase max wait per item during heavy host resolution.

---

## 📜 License

This project is distributed under the **GPL-3.0** license. See the [LICENSE](LICENSE) file for more details.

---
*Maintained by Gowaru.*
