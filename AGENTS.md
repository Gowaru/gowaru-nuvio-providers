# AGENTS.md

## Overview
Nuvio French streaming provider bundle (FR anime/movie/series providers). Providers are compiled from `src/` to `providers/` via esbuild. Runtime is **QuickJS** (via `quickjs-kt`), not Hermes or Node.js.

## RESPONSES
Keep responses concise and to the point in French - unless the user asks otherwise

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
- `src/utils/`: Shared helpers (`resolvers.js`, `logger.js`, `metadata.js`, `armsync.js`)

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
- **Stream object**: Only `url` is required (non-blank, no "object" strings)
  - Optional: `title`, `quality`, `headers`, `provider`, `type`, `size`, `language`
- **Headers**: Applied to native player (ExoPlayer/AVPlayer); `Accept-Encoding` stripped by runtime

## Runtime Constraints (QuickJS)
- **Unavailable**: `setTimeout`, `setInterval`, `TextDecoder`, `TextEncoder`, `Buffer`, `process`
- **Require()**: Only `cheerio` and `crypto-js`; all other deps must be bundled via esbuild
- **Fetch limits**: 
  - Response body truncated at **256 KB**
  - Headers truncated at **8 KB**
  - `response.json()` returns `null` (not rejected) on parse failure → always guard
- **Plugin timeout**: 60 seconds
- **Provider size limit**: 5 MB download limit

## Code Conventions
- Use `cheerio-without-node-native` (or `require('cheerio')`) for HTML parsing
  - No DOM manipulation (`.parent()` returns empty collection)
- Use per-provider `http.js` wrappers instead of raw `fetch` (adds required headers)
- Use `resolveStream` from `src/utils/resolvers.js` to process final URLs
- Build targets **ES2020** (QuickJS supports async/await natively)
- Update `manifest.json` when adding/removing providers (references `providers/<provider>.js`)

## Testing
- **Test script**: `node test_providers.js [provider1 provider2 ...]` (tests all if none specified)
- Use any testing tools, libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- If the project does not have any testing tools, scripts, MCP tools, skills, etc. available for testing, ask the user whether testing should be skipped.

