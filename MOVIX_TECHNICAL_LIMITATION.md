# Movix Provider - Technical Limitations

## Problem Summary
The Movix provider exhibits **zero playable streams** for most titles due to a fundamental architectural incompatibility between:
1. Movix's API architecture (returns HTML embed URLs)
2. Nuvio app requirements (direct MP4/M3U8 URLs for ExoPlayer)
3. JavaScript limitations in Hermes (no dynamic URL generation)

## Root Cause Analysis

### What Movix Returns
Movix API endpoints return embed URLs from:
- **Lulustream** → HTML page with packed/obfuscated JavaScript
- **FileMoon** → HTML page requiring client-side rendering
- **Veev** → HTML page with dynamic iframe injection
- **Cpasmal** → Mix of embeds and direct links (mostly embeds)

### Why Resolution Fails
These embeds generate m3u8 URLs **dynamically via client-side JavaScript**:
- Lulustream: Unpacked HTML contains 0 static m3u8 URLs (53KB of JS with dynamic loading)
- FileMoon: Uses fetch() calls post-page-load to fetch stream URLs
- Veev: Loads streams via JavaScript callbacks

**Proof**: Regex search for m3u8 patterns returns 0 matches in both raw and unpacked HTML.

### Why We Cannot Fix It
| Approach | Why It Doesn't Work |
|----------|-------------------|
| **Headless Browser** | Not available in React Native/Hermes |
| **JavaScript Execution** | Hermes doesn't execute client-side JS from plugins |
| **HTML Parsing + Extraction** | The URLs don't exist in static HTML |
| **Alternative Movix Endpoints** | TMDB endpoint also returns same embed URLs |

## What Was Attempted (Session Work)

### ✅ Completed Improvements
1. **Removed broken external extractors** (`proxiesembed.movix.cash` → HTTP 403/404)
2. **Direct API aggregation** - Now queries FStream/Wiflix/Cpasmal in parallel
3. **ExoPlayer crash fix** - Added `isExoPlayableUrl()` filter to reject HTML pages
4. **PackedPlayer resolver** - Unpacks obfuscated JS and attempts m3u8 extraction
5. **Retry logic** - Attempts resolution twice with timeout protection

### Results
- AOT: 24 raw streams found → **0 playable** (all embeds)
- The Boys: 27 raw streams found → **0 playable** (all embeds)
- Super Mario: 26 raw streams found → **0 playable** (all embeds)
- The Pill: 0 raw streams (API errors)

## Recommendations

### For Users
- **Expect Movix to return 0-1 streams for most titles**
- Use other providers (Anime-Sama, VoirAnime, Vostfree) which don't rely on dynamic embeds
- Movix may work for titles with direct Cpasmal links

### For Maintainers
1. **Mark Movix as "⚠️ Limited Availability"** in README
2. **Document the limitation** for users
3. **Consider deprioritizing** Movix in provider order (move to end)
4. **Monitor Movix API** for future changes that might add direct stream support

### For Future Solutions
This limitation **cannot be fixed without one of**:
- ✗ Movix API returning direct MP4/M3U8 URLs instead of embeds
- ✗ Nuvio app implementing WebView support for embed-only streams
- ✗ Hermes engine supporting JavaScript execution in plugins (not planned)

## Build & Test

All provider improvements remain in production:
```bash
npm run build  # Includes working resolver chain for other providers
```

Test Movix:
```bash
node providers/movix.js  # Returns 0-1 streams (embeds filtered out)
```
