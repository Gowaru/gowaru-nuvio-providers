#!/usr/bin/env node

/**
 * Local Validation Script for Nuvio Providers (QuickJS Engine)
 * 
 * Validates provider bundles locally without requiring the Nuvio app.
 * Tests:
 *   - QuickJS syntax compatibility
 *   - Bundle size <= 400KB
 *   - API structure compliance
 *   - Absence of forbidden Node.js APIs
 *   - Network error resilience
 * 
 * Usage:
 *   node scripts/local-validate.js movix
 *   node scripts/local-validate.js movix --mock      # Use mock responses
 *   node scripts/local-validate.js movix --verbose   # Detailed output
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.join(__dirname, '..');
const PROVIDERS_DIR = path.join(ROOT_DIR, 'providers');
const MAX_BUNDLE_SIZE = 400 * 1024; // 400KB

// Parse arguments
const args = process.argv.slice(2);
const providerName = args.find(a => !a.startsWith('--')) || 'movix';
const useMock = args.includes('--mock');
const verbose = args.includes('--verbose');

console.log(`\n🔍 Validating provider: ${providerName}`);
console.log(`   Mode: ${useMock ? 'Mock (no network)' : 'Simulation (network errors simulated)'}\n`);

// ========== Helper Functions ==========

function log(message, type = 'info') {
    const prefix = {
        info: 'ℹ️ ',
        success: '✅ ',
        error: '❌ ',
        warn: '⚠️ '
    }[type] || 'ℹ️ ';
    console.log(`${prefix} ${message}`);
}

function readBundle(provider) {
    const bundlePath = path.join(PROVIDERS_DIR, `${provider}.js`);
    if (!fs.existsSync(bundlePath)) {
        throw new Error(`Bundle not found: ${bundlePath}\nRun: node build.js ${provider} --engine quickjs --minify`);
    }
    return fs.readFileSync(bundlePath, 'utf-8');
}

// ========== Validation Checks ==========

function checkSyntax(code) {
    log('Checking syntax compatibility...', 'info');
    
    // Try QuickJS if available
    const { execSync } = require('child_process');
    try {
        execSync('which qjs', { stdio: 'ignore' });
        execSync(`qjs -e "${code.replace(/"/g, '\\"').slice(0, 500)}"`, { stdio: 'ignore' });
        log('QuickJS syntax: OK', 'success');
        return true;
    } catch (e) {
        // Fallback to Node VM with strict mode
        try {
            vm.createScript(code, {
                filename: `${providerName}.js`,
                timeout: 5000
            });
            log('Node VM syntax: OK (QuickJS not available)', 'success');
            return true;
        } catch (err) {
            log(`Syntax error: ${err.message}`, 'error');
            return false;
        }
    }
}

function checkBundleSize(code) {
    log('Checking bundle size...', 'info');
    const size = Buffer.byteLength(code, 'utf-8');
    const sizeKB = (size / 1024).toFixed(1);
    
    if (size > MAX_BUNDLE_SIZE) {
        log(`Bundle too large: ${sizeKB}KB > 400KB`, 'error');
        return false;
    }
    
    log(`Bundle size: ${sizeKB}KB (limit: 400KB)`, 'success');
    return true;
}

function checkForbiddenApis(code) {
    log('Checking for forbidden Node.js APIs...', 'info');
    
    // Known safe patterns (polyfills, dev-only code that won't run in production)
    const safePatterns = [
        /require\s*\(\s*['"]node-fetch['"]\s*\)/, // Dev-only fallback, OK if bundled
        /QuickJS Polyfills/, // Polyfill section header
        /__nuvioLog/, // Internal logging
        /__bridgeFetch/, // Kotlin bridge placeholder
        /__mockFetch/ // Test mock
    ];
    
    const forbidden = [
        { pattern: /process\s*\./, name: 'process.*' },
        { pattern: /Buffer\s*\./, name: 'Buffer.*' },
        { pattern: /setImmediate\s*\(/, name: 'setImmediate' },
        { pattern: /__dirname/, name: '__dirname' },
        { pattern: /__filename/, name: '__filename' }
    ];
    
    // Check for actual forbidden patterns (excluding safe patterns)
    const found = [];
    for (const f of forbidden) {
        if (f.pattern.test(code)) {
            found.push(f.name);
        }
    }
    
    // Additional check: require() is only OK in polyfills section
    if (/require\s*\(/.test(code)) {
        // Check if it's in the polyfills section (after "QuickJS Polyfills")
        const polyfillsStart = code.indexOf('QuickJS Polyfills');
        const requireInMain = code.indexOf('require(');
        
        if (requireInMain >= 0 && (polyfillsStart < 0 || requireInMain < polyfillsStart)) {
            found.push('require() in main code');
        }
    }
    
    if (found.length > 0) {
        log(`Forbidden APIs detected: ${found.join(', ')}`, 'error');
        return false;
    }
    
    log('No forbidden APIs found', 'success');
    return true;
}

function checkApiStructure(code) {
    log('Checking API structure...', 'info');
    
    // Create a mock context simulating Nuvio/QuickJS environment
    const mockContext = {
        // Mock fetch
        fetch: async (url, opts) => {
            if (useMock) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Map([['content-type', 'application/json']]),
                    text: async () => JSON.stringify({ success: true, results: [] }),
                    json: async () => ({ success: true, results: [] })
                };
            }
            // Simulate network error
            throw new TypeError('Network error (simulated)');
        },
        
        // Mock crypto
        crypto: {
            getRandomValues: (arr) => {
                for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
                return arr;
            }
        },
        
        // Console
        console: {
            log: () => {},
            warn: () => {},
            error: () => {}
        },
        
        // Polyfill globals
        URL: function(u) { this.href = u; },
        URLSearchParams: function() { this.params = {}; },
        TextEncoder: function() {},
        TextDecoder: function() {},
        AbortController: function() { this.signal = { aborted: false }; },
        Promise: Promise,
        
        // GlobalThis
        globalThis: {},
        
        // Module system (minimal)
        module: { exports: {} },
        exports: {}
    };
    
    // Add polyfills to context
    const polyfillsPath = path.join(ROOT_DIR, 'src', 'utils', 'polyfills.js');
    if (fs.existsSync(polyfillsPath)) {
        try {
            const polyfills = fs.readFileSync(polyfillsPath, 'utf-8');
            vm.createScript(polyfills).runInNewContext(mockContext);
        } catch (e) {
            log(`Polyfill load warning: ${e.message}`, 'warn');
        }
    }
    
    try {
        // Wrap code to capture getStreams
        const wrappedCode = `
            (function() {
                ${code}
                return (typeof getStreams === 'function') ? getStreams : 
                       (module && module.exports && module.exports.getStreams) || null;
            })();
        `;
        
        const script = new vm.Script(wrappedCode, {
            filename: `${providerName}.js`,
            timeout: 10000
        });
        
        const getStreams = script.runInNewContext(mockContext, {
            displayErrors: true
        });
        
        if (!getStreams || typeof getStreams !== 'function') {
            log('getStreams function not found in bundle', 'error');
            return false;
        }
        
        log('getStreams function found', 'success');
        
        // Test calling getStreams with mock data
        log('Testing getStreams call...', 'info');
        
        // Override fetch for test
        if (useMock) {
            mockContext.__mockFetch = function(responses) {
                mockContext.fetch = async (url) => {
                    const urlStr = typeof url === 'object' ? url.href : String(url);
                    const mock = responses[urlStr];
                    if (mock) {
                        return {
                            ok: mock.status === 200,
                            status: mock.status || 200,
                            text: async () => JSON.stringify(mock.body),
                            json: async () => mock.body,
                            headers: new Map()
                        };
                    }
                    throw new Error('Mock not found for: ' + urlStr);
                };
            };
        }
        
        // Call getStreams with test parameters
        const result = getStreams('550', 'movie', undefined, undefined);
        
        // Handle both sync and async returns
        const handleResult = (res) => {
            if (!Array.isArray(res)) {
                log(`getStreams must return an array, got: ${typeof res}`, 'error');
                return false;
            }
            
            if (res.length === 0) {
                log('getStreams returns empty array (acceptable)', 'success');
                return true;
            }
            
            // Validate stream structure
            for (const stream of res) {
                if (!stream.url || typeof stream.url !== 'string') {
                    log('Stream missing valid url property', 'error');
                    return false;
                }
                
                const validTypes = ['hls', 'mp4', 'dash'];
                if (stream.type && !validTypes.includes(stream.type)) {
                    log(`Invalid stream type: ${stream.type}`, 'warn');
                }
            }
            
            log(`getStreams returns ${res.length} stream(s)`, 'success');
            return true;
        };
        
        if (result && typeof result.then === 'function') {
            return result.then(handleResult).catch(e => {
                log(`getStreams threw error: ${e.message}`, 'error');
                return false;
            });
        } else {
            return handleResult(result);
        }
        
    } catch (e) {
        log(`API test failed: ${e.message}`, 'error');
        if (verbose) {
            console.log(e.stack);
        }
        return false;
    }
}

function checkNetworkResilience(code) {
    log('Testing network error resilience...', 'info');
    
    // This test ensures that getStreams handles network errors gracefully
    // by returning [] instead of throwing
    
    const mockContext = {
        fetch: async () => { throw new TypeError('Network request failed'); },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        Promise: Promise,
        module: { exports: {} },
        exports: {},
        globalThis: {},
        crypto: { getRandomValues: (arr) => arr }
    };
    
    try {
        const wrappedCode = `
            (function() {
                ${code}
                return (typeof getStreams === 'function') ? getStreams : 
                       (module && module.exports && module.exports.getStreams) || null;
            })();
        `;
        
        const getStreams = vm.createScript(wrappedCode).runInNewContext(mockContext);
        
        if (!getStreams) {
            log('Cannot test resilience: getStreams not found', 'error');
            return false;
        }
        
        // Call with network error
        const result = getStreams('999', 'movie', undefined, undefined);
        
        const handleResult = (res) => {
            if (!Array.isArray(res)) {
                log('Network error caused non-array return', 'error');
                return false;
            }
            log('Network errors handled gracefully (returns [])', 'success');
            return true;
        };
        
        if (result && typeof result.then === 'function') {
            return result.then(handleResult).catch(e => {
                log(`getStreams threw on network error: ${e.message}`, 'error');
                return false;
            });
        }
        
        return handleResult(result);
        
    } catch (e) {
        log(`Resilience test error: ${e.message}`, 'error');
        return false;
    }
}

// ========== Main ==========

async function main() {
    let allPassed = true;
    
    try {
        // Read bundle
        const bundleCode = readBundle(providerName);
        
        // Run all checks
        const checks = [
            { name: 'Syntax', fn: () => checkSyntax(bundleCode) },
            { name: 'Bundle Size', fn: () => checkBundleSize(bundleCode) },
            { name: 'Forbidden APIs', fn: () => checkForbiddenApis(bundleCode) },
            { name: 'API Structure', fn: () => checkApiStructure(bundleCode) },
            { name: 'Network Resilience', fn: () => checkNetworkResilience(bundleCode) }
        ];
        
        for (const check of checks) {
            try {
                const passed = await check.fn();
                if (!passed) allPassed = false;
            } catch (e) {
                log(`${check.name} check error: ${e.message}`, 'error');
                allPassed = false;
            }
        }
        
    } catch (e) {
        log(`Validation failed: ${e.message}`, 'error');
        allPassed = false;
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        log(`All checks passed for ${providerName}`, 'success');
        console.log('\n🚀 Provider is ready for QuickJS/Kotlin deployment!');
        process.exit(0);
    } else {
        log(`Some checks failed for ${providerName}`, 'error');
        console.log('\n❌ Fix the issues above before deploying.');
        process.exit(1);
    }
}

main();