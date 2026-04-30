#!/usr/bin/env node

/**
 * Local provider success-rate runner.
 * Usage examples:
 *   node scripts/provider-success-runner.js --provider movix --type movie --ids 550,603,13
 *   node scripts/provider-success-runner.js --provider frenchstream --type movie
 */

const path = require('path');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            out[key] = true;
            continue;
        }
        out[key] = next;
        i++;
    }
    return out;
}

async function main() {
    const args = parseArgs(process.argv);
    const providerName = String(args.provider || 'frenchstream').trim();
    const mediaType = String(args.type || 'movie').trim();
    const season = Number(args.season || 1);
    const episode = Number(args.episode || 1);

    const defaultMovieIds = ['550', '603', '13', '680'];
    const defaultTvIds = ['1399', '94605', '1434'];
    const ids = String(args.ids || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    const tmdbIds = ids.length > 0 ? ids : (mediaType === 'tv' ? defaultTvIds : defaultMovieIds);

    const providerPath = path.join(process.cwd(), 'providers', `${providerName}.js`);
    let mod;
    try {
        mod = require(providerPath);
    } catch (e) {
        console.error(`[runner] Cannot load provider ${providerName}: ${e.message}`);
        process.exit(1);
    }

    if (!mod || typeof mod.getStreams !== 'function') {
        console.error(`[runner] Provider ${providerName} does not export getStreams`);
        process.exit(1);
    }

    const timeoutMs = Number(args.timeout || 30000);

    const rows = [];
    for (const tmdbId of tmdbIds) {
        const started = Date.now();
        try {
            const result = await Promise.race([
                mod.getStreams(tmdbId, mediaType, mediaType === 'tv' ? season : null, mediaType === 'tv' ? episode : null),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
            ]);

            const streams = Array.isArray(result) ? result : [];
            rows.push({
                tmdbId,
                ok: streams.length > 0,
                count: streams.length,
                ms: Date.now() - started,
            });
        } catch (e) {
            rows.push({
                tmdbId,
                ok: false,
                count: 0,
                ms: Date.now() - started,
                error: e && e.message ? e.message : String(e),
            });
        }
    }

    const okCount = rows.filter((r) => r.ok).length;
    const total = rows.length;
    const rate = total === 0 ? 0 : Math.round((okCount / total) * 100);

    console.log(`\n[runner] Provider=${providerName} Type=${mediaType} IDs=${total}`);
    for (const r of rows) {
        const status = r.ok ? 'OK' : 'FAIL';
        const err = r.error ? ` err=${r.error}` : '';
        console.log(`[runner] ${status} tmdb=${r.tmdbId} streams=${r.count} time=${r.ms}ms${err}`);
    }
    console.log(`[runner] Success rate: ${okCount}/${total} (${rate}%)\n`);

    // Force clean exit so pending network activity from timed-out provider calls doesn't keep the process alive.
    process.exit(0);
}

main().catch((e) => {
    console.error(`[runner] Fatal: ${e && e.message ? e.message : String(e)}`);
    process.exit(1);
});
