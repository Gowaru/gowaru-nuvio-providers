#!/usr/bin/env node

/**
 * Local provider success-rate runner.
 * Usage examples:
 *   node scripts/provider-success-runner.js --provider movix --type movie --ids 550,603,13
 *   node scripts/provider-success-runner.js --provider frenchstream --type movie
 *   node scripts/provider-success-runner.js --provider frenchstream --type movie --profile tv --android-tv13
 *   node scripts/provider-success-runner.js --provider frenchstream --type movie --profile both
 *   node scripts/provider-success-runner.js ... --fail-below-pct 50    # exit 1 if any profile below 50%
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

function applyRuntimeProfile(profile, forceAndroidTv13Ua) {
    const isTv = profile === 'tv';
    globalThis.__NUVIO_RUNTIME_PROFILE = isTv ? 'tv' : 'default';
    globalThis.__NUVIO_IS_TV = isTv;
    globalThis.__IS_ANDROID_TV = isTv;

    if (!forceAndroidTv13Ua) return;

    const tv13UA = 'Mozilla/5.0 (Linux; Android 13; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    try {
        globalThis.navigator = {
            userAgent: tv13UA,
            platform: 'Android TV'
        };
    } catch (e) {
        // Fallback for readonly navigator in some runtimes.
        if (!globalThis.navigator) {
            globalThis.navigator = {};
        }
        globalThis.navigator.userAgent = tv13UA;
        globalThis.navigator.platform = 'Android TV';
    }
}

async function runOneProfile(mod, options) {
    const {
        profile,
        tmdbIds,
        mediaType,
        season,
        episode,
        timeoutMs,
        forceAndroidTv13Ua
    } = options;

    applyRuntimeProfile(profile, forceAndroidTv13Ua);
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
    return rows;
}

async function main() {
    const args = parseArgs(process.argv);
    const providerName = String(args.provider || 'frenchstream').trim();
    const mediaType = String(args.type || 'movie').trim();
    const season = Number(args.season || 1);
    const episode = Number(args.episode || 1);
    const profileArg = String(args.profile || 'default').trim().toLowerCase();
    const profiles = profileArg === 'both' ? ['default', 'tv'] : [profileArg === 'tv' ? 'tv' : 'default'];
    const forceAndroidTv13Ua = Boolean(args['android-tv13']);

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
    const checkMovixApi = Boolean(args['check-movix-api']);
    const failBelowPctRaw = args['fail-below-pct'];
    const gatePercent = Number(failBelowPctRaw);
    const enforceGate = failBelowPctRaw !== undefined && failBelowPctRaw !== '' && Number.isFinite(gatePercent);

    /** @type {{ profile: string, okCount: number, total: number, rate: number }[]} */
    const profileSummaries = [];

    if (checkMovixApi) {
        const probes = [
            'https://api.movix.cash/api/fstream/movie/550',
            'https://movix.cash/api/fstream/movie/550'
        ];
        for (const probe of probes) {
            const started = Date.now();
            try {
                const res = await fetch(probe, { method: 'GET' });
                const body = await res.text();
                console.log(`[runner] probe=${probe} status=${res.status} ms=${Date.now() - started} body_len=${body.length}`);
            } catch (e) {
                console.log(`[runner] probe=${probe} status=ERR ms=${Date.now() - started} err=${e && e.message ? e.message : String(e)}`);
            }
        }
    }
    for (const profile of profiles) {
        const rows = await runOneProfile(mod, {
            profile,
            tmdbIds,
            mediaType,
            season,
            episode,
            timeoutMs,
            forceAndroidTv13Ua
        });
        const okCount = rows.filter((r) => r.ok).length;
        const total = rows.length;
        const rate = total === 0 ? 0 : Math.round((okCount / total) * 100);

        console.log(`\n[runner] Provider=${providerName} Type=${mediaType} Profile=${profile} IDs=${total}`);
        for (const r of rows) {
            const status = r.ok ? 'OK' : 'FAIL';
            const err = r.error ? ` err=${r.error}` : '';
            console.log(`[runner] ${status} tmdb=${r.tmdbId} streams=${r.count} time=${r.ms}ms${err}`);
        }
        console.log(`[runner] Success rate (${profile}): ${okCount}/${total} (${rate}%)\n`);
        profileSummaries.push({ profile, okCount, total, rate });
    }

    let exitCode = 0;
    if (enforceGate) {
        for (const s of profileSummaries) {
            if (s.total === 0) {
                console.error(`[runner] Gates failed: profile=${s.profile} (no IDs to test)`);
                exitCode = 1;
            } else if (s.rate < gatePercent) {
                console.error(`[runner] Gates failed: profile=${s.profile} rate=${s.rate}% < required ${gatePercent}%`);
                exitCode = 1;
            }
        }
        if (!exitCode) {
            console.log(`[runner] Gate OK: every profile meets >= ${gatePercent}% (${providerName})\n`);
        }
    }

    // Force clean exit so pending network activity from timed-out provider calls doesn't keep the process alive.
    process.exit(exitCode);
}

main().catch((e) => {
    console.error(`[runner] Fatal: ${e && e.message ? e.message : String(e)}`);
    process.exit(1);
});
