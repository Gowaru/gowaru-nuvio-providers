#!/usr/bin/env node

/**
 * Build script for nuvio-providers
 * 
 * Bundles each provider from src/<provider>/ into a single file at providers/<provider>.js
 * 
 * Usage:
 *   node build.js              # Build all providers
 *   node build.js vixsrc       # Build only vixsrc
 *   node build.js --watch      # Watch mode (requires nodemon)
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'providers');

// Get provider names from command line or discover all
function getProvidersToBuild() {
    const args = process.argv.slice(2).filter(arg => !arg.startsWith('-'));

    if (args.length > 0) {
        return args;
    }

    // Discover all provider folders in src/
    if (!fs.existsSync(srcDir)) {
        console.error('❌ src/ directory not found. Create provider folders in src/<provider>/');
        process.exit(1);
    }

    return fs.readdirSync(srcDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'utils')
        .map(d => d.name);
}

async function buildProvider(providerName, minify = false) {
    const providerDir = path.join(srcDir, providerName);
    const entryPoint = path.join(providerDir, 'index.js');
    const outFile = path.join(outDir, `${providerName}.js`);

    if (!fs.existsSync(entryPoint)) {
        console.warn(`⚠️  Skipping ${providerName}: no src/${providerName}/index.js found`);
        return false;
    }

    try {
        const result = await esbuild.build({
            entryPoints: [entryPoint],
            bundle: true,
            outfile: outFile,
            format: 'iife',             // Sandbox-friendly script output
            platform: 'browser',        // Avoid require/module assumptions in TV runtimes
            target: 'es2015',           // More compatible than es2016 for older TV engines
            minify: minify,             // Minify bundle
            sourcemap: false,
            globalName: '__provider',
            banner: {
                js: `/**\n * ${providerName} - Built from src/${providerName}/\n * Generated: ${new Date().toISOString()}\n */`
            },
            footer: {
                js: `
(function(api) {
    if (!api) return;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof exports !== 'undefined') exports.getStreams = api.getStreams;
    
    var g = (typeof globalThis !== 'undefined') ? globalThis : 
            (typeof global !== 'undefined') ? global : 
            (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : {};
            
    if (api.getStreams) g.getStreams = api.getStreams;
})(__provider);`
            },
            logLevel: 'warning'
        });

        const stats = fs.statSync(outFile);
        const sizeKB = (stats.size / 1024).toFixed(1);
        console.log(`✅ ${providerName}.js (${sizeKB} KB)`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to build ${providerName}:`, err.message);
        return false;
    }
}

// Transpile a single file in providers/ (for developers writing single-file providers with async)
async function transpileSingleFile(filename) {
    const inputPath = path.join(outDir, filename);

    if (!fs.existsSync(inputPath)) {
        console.warn(`⚠️  File not found: providers/${filename}`);
        return false;
    }

    // Read original file
    const originalContent = fs.readFileSync(inputPath, 'utf-8');

    // Check if it needs transpilation (has async/await)
    if (!originalContent.includes('async ') && !originalContent.includes('await ')) {
        console.log(`⏭️  ${filename} - no async/await, skipping`);
        return true;
    }

    try {
        const result = await esbuild.build({
            stdin: {
                contents: originalContent,
                loader: 'js',
                sourcefile: filename,
                resolveDir: outDir,
            },
            bundle: false,
            write: false,
            format: 'iife',
            platform: 'browser',
            target: 'es2015',           // More compatible
            sourcemap: false,
            banner: {
                js: `var module = (typeof module !== 'undefined') ? module : { exports: {} }; var exports = (typeof exports !== 'undefined') ? exports : module.exports;`
            },
            footer: {
                js: `\n(function(){\n  var api = null;\n  if (typeof getStreams === 'function') api = { getStreams: getStreams };\n  else if (module && module.exports && typeof module.exports.getStreams === 'function') api = module.exports;\n  if (api) {\n    if (typeof module !== 'undefined' && module.exports) module.exports = api;\n    if (typeof globalThis !== 'undefined') globalThis.getStreams = api.getStreams;\n    if (typeof global !== 'undefined') global.getStreams = api.getStreams;\n    if (typeof self !== 'undefined') self.getStreams = api.getStreams;\n  }\n})();`
            },
            logLevel: 'warning'
        });

        // Write transpiled content back
        const transpiledCode = result.outputFiles[0].text;
        fs.writeFileSync(inputPath, transpiledCode);

        const stats = fs.statSync(inputPath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        console.log(`✅ ${filename} transpiled (${sizeKB} KB)`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to transpile ${filename}:`, err.message);
        return false;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const isMinify = args.includes('--minify');

    // Handle --transpile flag for single-file providers
    if (args.includes('--transpile')) {
        const files = args.filter(a => a !== '--transpile' && a !== '--minify' && !a.startsWith('-'));

        if (files.length === 0) {
            // Transpile all .js files in providers/ that aren't from src/
            const srcProviders = fs.existsSync(srcDir)
                ? fs.readdirSync(srcDir, { withFileTypes: true })
                    .filter(d => d.isDirectory())
                    .map(d => d.name + '.js')
                : [];

            const allProviderFiles = fs.readdirSync(outDir)
                .filter(f => f.endsWith('.js') && !srcProviders.includes(f));

            console.log(`\n🔄 Transpiling ${allProviderFiles.length} single-file provider(s)...\n`);

            for (const file of allProviderFiles) {
                await transpileSingleFile(file);
            }
        } else {
            console.log(`\n🔄 Transpiling ${files.length} file(s)...\n`);
            for (const file of files) {
                const filename = file.endsWith('.js') ? file : file + '.js';
                await transpileSingleFile(filename);
            }
        }
        return;
    }

    const providers = getProvidersToBuild();

    if (providers.length === 0) {
        console.log('No providers found in src/ directory.');
        console.log('Create a provider: mkdir -p src/myprovider && touch src/myprovider/index.js');
        return;
    }

    console.log(`\n📦 Building ${providers.length} provider(s)${isMinify ? ' (Minified)' : ''}...\n`);

    // Ensure output directory exists
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    let success = 0;
    let failed = 0;

    for (const provider of providers) {
        const result = await buildProvider(provider, isMinify);
        if (result) success++;
        else failed++;
    }

    console.log(`\n✨ Done! ${success} built, ${failed} skipped/failed\n`);
}

main().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});

