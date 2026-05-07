#!/usr/bin/env node

/**
 * Local test script for movix provider
 * Tests the provider against the real Movix API
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const BUNDLE_PATH = path.join(ROOT_DIR, 'providers', 'movix.js');

// Load polyfills
const polyfillsCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'utils', 'polyfills.js'), 'utf-8');

// Load the provider bundle
const providerCode = fs.readFileSync(BUNDLE_PATH, 'utf-8');

// Create a context with real fetch (Node.js)
const vm = require('vm');
const https = require('https');
const http = require('http');

// Custom fetch using Node's http/https
async function nodeFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const req = client.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    url: url,
                    headers: res.headers,
                    text: () => Promise.resolve(body),
                    json: () => Promise.resolve(JSON.parse(body)),
                    blob: () => Promise.resolve(Buffer.from(body))
                });
            });
        });
        
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

// Create sandbox context
const sandbox = {
    // Polyfills
    globalThis: {},
    console: console,
    Promise: Promise,
    URL: URL,
    URLSearchParams: URLSearchParams,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    AbortController: AbortController,
    crypto: { 
        getRandomValues: (arr) => {
            for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
            return arr;
        },
        subtle: {
            digest: async () => new Uint8Array(32)
        }
    },
    
    // setTimeout/setInterval (Node.js)
    setTimeout: setTimeout,
    setInterval: setInterval,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    
    // Real fetch
    fetch: nodeFetch,
    
    // Module system
    module: { exports: {} },
    exports: {},
    require: require,
    
    // Buffer (Node.js specific)
    Buffer: Buffer
};

// Make sandbox properties available on globalThis
sandbox.globalThis = sandbox;

// Run polyfills first
vm.createScript(polyfillsCode).runInNewContext(sandbox);

// Run provider code
const script = new vm.Script(providerCode);
script.runInNewContext(sandbox);

// Get the getStreams function
const getStreams = sandbox.module.exports.getStreams || sandbox.getStreams;

async function test() {
    const tmdbId = process.argv[2] || '550'; // Fight Club default
    const mediaType = process.argv[3] || 'movie';
    const season = process.argv[4];
    const episode = process.argv[5];
    
    console.log(`\n🧪 Testing movix provider...`);
    console.log(`   TMDB ID: ${tmdbId}`);
    console.log(`   Media Type: ${mediaType}`);
    if (mediaType === 'tv') {
        console.log(`   Season: ${season}, Episode: ${episode}`);
    }
    console.log('');
    
    try {
        const startTime = Date.now();
        const streams = await getStreams(tmdbId, mediaType, season, episode);
        const duration = Date.now() - startTime;
        
        console.log(`📊 Results: ${streams.length} stream(s) found in ${duration}ms\n`);
        
        if (streams.length === 0) {
            console.log('❌ No streams found');
            return;
        }
        
        // Show first 5 streams
        console.log('📺 Sample streams:');
        streams.slice(0, 5).forEach((s, i) => {
            console.log(`\n${i + 1}. ${s.title || s.name || 'Stream'}`);
            console.log(`   URL: ${s.url.substring(0, 80)}...`);
            console.log(`   Quality: ${s.quality || 'unknown'}`);
            console.log(`   Type: ${s.type || 'unknown'}`);
        });
        
        console.log(`\n✅ Test completed successfully!`);
        
    } catch (e) {
        console.error('❌ Test failed:', e.message);
        console.error(e.stack);
    }
}

test();