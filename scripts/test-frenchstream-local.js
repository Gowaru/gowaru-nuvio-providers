#!/usr/bin/env node

/**
 * Local test script for frenchstream provider
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const BUNDLE_PATH = path.join(ROOT_DIR, 'providers', 'frenchstream.js');

const polyfillsCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'utils', 'polyfills.js'), 'utf-8');
const providerCode = fs.readFileSync(BUNDLE_PATH, 'utf-8');

const vm = require('vm');
const https = require('https');
const http = require('http');

async function nodeFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const reqOptions = {
            method: options.method || 'GET',
            headers: options.headers || {}
        };
        
        if (options.body) {
            reqOptions.body = options.body;
        }
        
        const req = client.request(url, reqOptions, (res) => {
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

const sandbox = {
    globalThis: {},
    console: console,
    Promise: Promise,
    URL: URL,
    URLSearchParams: URLSearchParams,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    AbortController: AbortController,
    setTimeout: setTimeout,
    setInterval: setInterval,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    crypto: { 
        getRandomValues: (arr) => {
            for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
            return arr;
        },
        subtle: { digest: async () => new Uint8Array(32) }
    },
    fetch: nodeFetch,
    module: { exports: {} },
    exports: {},
    require: require,
    Buffer: Buffer
};

sandbox.globalThis = sandbox;

vm.createScript(polyfillsCode).runInNewContext(sandbox);
const script = new vm.Script(providerCode);
script.runInNewContext(sandbox);

const getStreams = sandbox.module.exports.getStreams || sandbox.getStreams;

async function test() {
    const tmdbId = process.argv[2] || '550';
    const mediaType = process.argv[3] || 'movie';
    const season = process.argv[4];
    const episode = process.argv[5];
    
    console.log(`\n🧪 Testing frenchstream provider...`);
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
        
        streams.slice(0, 5).forEach((s, i) => {
            console.log(`${i + 1}. ${s.title || s.name || 'Stream'}`);
            console.log(`   URL: ${(s.url || '').substring(0, 60)}...`);
            console.log(`   Quality: ${s.quality || 'unknown'}`);
            console.log(`   Type: ${s.type || 'unknown'}`);
            console.log('');
        });
        
        console.log('✅ Test completed successfully!');
        
    } catch (e) {
        console.error('❌ Test failed:', e.message);
    }
}

test();