#!/usr/bin/env node

/**
 * Pre-publish gate: build all providers then run compiled movie probes (default + simulated Android TV).
 * Exits non-zero when any gated run fails (--fail-below-pct on provider-success-runner).
 *
 * Usage:
 *   npm run release-check
 *   node scripts/release-check.js --skip-build --gate-percent 40
 */

const path = require('path');
const { spawnSync } = require('child_process');

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

function resolveCmd(binary) {
    return process.platform === 'win32'
        ? (binary === 'node' ? 'node' : `${binary}.cmd`)
        : binary;
}

function runNode(scriptRel, scriptArgs, inheritStdio = true) {
    const script = path.join(__dirname, scriptRel);
    const r = spawnSync(resolveCmd('node'), [script, ...scriptArgs], {
        cwd: path.join(__dirname, '..'),
        stdio: inheritStdio ? 'inherit' : 'pipe'
    });
    return r.status === null ? 1 : r.status;
}

function main() {
    const args = parseArgs(process.argv);
    const skipBuild = Boolean(args['skip-build']);
    const gatePercent = Number(args['gate-percent'] || '50');
    const movieIds = String(args.ids || '550,603,13');
    const timeoutMs = Number(args.timeout || '45000');
    const probeApi = Boolean(args['probe-api']);
    const providers = String(args.providers || 'movix,frenchstream')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    if (!Number.isFinite(gatePercent) || gatePercent < 0 || gatePercent > 100) {
        console.error('[release-check] Invalid --gate-percent (use 0-100)');
        process.exit(1);
    }

    console.log('[release-check] Gate: movie success rate per profile >= ' + gatePercent + '%');
    console.log('[release-check] Providers: ' + providers.join(', '));

    if (!skipBuild) {
        console.log('\n[release-check] npm run build\n');
        const b = spawnSync(resolveCmd('npm'), ['run', 'build'], {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit',
            env: process.env
        });
        const buildExit = b.status === null ? 1 : b.status;
        if (buildExit !== 0) {
            console.error('[release-check] Build failed.');
            process.exit(buildExit || 1);
        }
    } else {
        console.log('[release-check] Skipping build (--skip-build)\n');
    }

    const runnerExtras = probeApi ? ['--check-movix-api'] : [];
    for (const providerName of providers) {
        console.log('\n[release-check] --- ' + providerName + ' (default + tv, Android TV 13 UA) ---\n');
        const code = runNode('provider-success-runner.js', [
            '--provider',
            providerName,
            '--type',
            'movie',
            '--profile',
            'both',
            '--android-tv13',
            '--ids',
            movieIds,
            '--timeout',
            String(timeoutMs),
            '--fail-below-pct',
            String(gatePercent),
            ...runnerExtras
        ]);

        if (code !== 0) {
            console.error('[release-check] FAILED: ' + providerName + ' (exit ' + code + ')');
            process.exit(code || 1);
        }
    }

    console.log('\n[release-check] All gates passed.');
    process.exit(0);
}

main();
