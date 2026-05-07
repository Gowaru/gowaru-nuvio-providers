/**
 * QuickJS Polyfills for Nuvio Kotlin Bridge
 * 
 * Injected at the top of every provider bundle when building with --engine quickjs
 * Simulates the future Kotlin bridge APIs (fetch, crypto, URL, etc.)
 * 
 * These polyfills are used for LOCAL TESTING ONLY.
 * In production, the Kotlin host provides these via globalThis.
 */

(function() {
    'use strict';

    // Store original console for logging
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
    };

    // Mock console that can be redirected
    globalThis.__nuvioLog = function(level, ...args) {
        const prefix = `[Nuvio/QuickJS]`;
        if (originalConsole[level]) {
            originalConsole[level].apply(console, [prefix, ...args]);
        }
    };

    // Wrap console methods
    if (typeof console !== 'undefined') {
        console.log = function(...args) { originalConsole.log.apply(console, args); };
        console.warn = function(...args) { originalConsole.warn.apply(console, args); };
        console.error = function(...args) { originalConsole.error.apply(console, args); };
    }

    // ========== fetch polyfill ==========
    if (typeof globalThis.fetch !== 'function') {
        // Use node-fetch if available (dev), otherwise mock
        // Note: require() is polyfilled by bundler or will be provided by Kotlin bridge
        var originalFetch = null;
        try { 
            // This will fail in strict QuickJS but that's OK - we have the mock
            originalFetch = require('node-fetch'); 
        } catch (e) {
            // Fallback: use __bridgeFetch which will be provided by Kotlin
        }
        
        globalThis.fetch = async function fetchPolyfill(url, options = {}) {
            const opts = {
                method: (options && options.method) || 'GET',
                headers: (options && options.headers) || {},
                body: (options && options.body) || undefined,
                signal: (options && options.signal) || undefined,
                redirect: (options && options.redirect) || 'follow'
            };

            try {
                let response;
                if (originalFetch) {
                    response = await originalFetch(url, opts);
                } else if (typeof globalThis.__bridgeFetch === 'function') {
                    // Kotlin bridge will be injected here in production
                    response = await globalThis.__bridgeFetch(url, opts);
                } else {
                    // Fallback: simulate network error for local testing
                    throw new Error('fetch not available - use --test-mock or Kotlin bridge');
                }

                return {
                    ok: response.ok,
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    headers: response.headers,
                    text: async () => {
                        if (originalFetch) return response.text();
                        return await response.text();
                    },
                    json: async () => {
                        if (originalFetch) return response.json();
                        return await response.json();
                    },
                    blob: async () => {
                        if (originalFetch) return response.blob();
                        return await response.blob();
                    }
                };
            } catch (e) {
                // Network error simulation
                throw new TypeError(`Failed to fetch: ${e.message}`);
            }
        };
    }

    // ========== crypto.polyfill (minimal SHA256 for auth) ==========
    if (typeof globalThis.crypto === 'undefined') {
        globalThis.crypto = {
            getRandomValues: function(array) {
                // Simple fallback for random values
                for (let i = 0; i < array.length; i++) {
                    array[i] = Math.floor(Math.random() * 256);
                }
                return array;
            },
            subtle: {
                digest: async function(algorithm, data) {
                    // Minimal SHA256 simulation (not real crypto)
                    // Returns dummy hash for compatibility
                    const str = typeof data === 'string' ? data : 'mock';
                    const hash = btoa(str).slice(0, 32);
                    const buf = new Uint8Array(hash.length);
                    for (let i = 0; i < hash.length; i++) buf[i] = hash.charCodeAt(i);
                    return buf;
                }
            }
        };
    }

    // ========== URL polyfill ==========
    if (typeof globalThis.URL === 'undefined') {
        globalThis.URL = function URLPolyfill(url, base) {
            this.href = base ? new URL(url, base).href : url;
        };
        globalThis.URL.prototype = {
            get href() { return this._href; },
            set href(v) { this._href = v; },
            get protocol() { return this._href.split('://')[0] + ':'; },
            get host() { return this._href.split('/')[2] || ''; },
            get hostname() { return this._href.split('/')[2].split(':')[0] || ''; },
            get port() { 
                const h = this._href.split('/')[2] || '';
                return h.split(':')[1] || '';
            },
            get pathname() { 
                const parts = this._href.split('/');
                return '/' + (parts.slice(3).join('/') || ''); 
            },
            get search() { 
                const q = this._href.split('?')[1] || '';
                return q ? '?' + q : '';
            },
            get searchParams() {
                const self = this;
                return new URLSearchParams(this.search);
            },
            toString: function() { return this._href; }
        };
    }

    // ========== URLSearchParams polyfill ==========
    if (typeof globalThis.URLSearchParams === 'undefined') {
        globalThis.URLSearchParams = function URLSearchParamsPolyfill(init) {
            this._params = {};
            if (typeof init === 'string') {
                const pairs = init.split('&');
                for (let i = 0; i < pairs.length; i++) {
                    const [key, val] = pairs[i].split('=');
                    if (key) this._params[decodeURIComponent(key)] = decodeURIComponent(val || '');
                }
            } else if (init && typeof init === 'object') {
                for (const key in init) {
                    this._params[key] = String(init[key]);
                }
            }
        };
        globalThis.URLSearchParams.prototype = {
            get: function(key) { return this._params[key] || null; },
            set: function(key, val) { this._params[key] = val; },
            has: function(key) { return key in this._params; },
            delete: function(key) { delete this._params[key]; },
            append: function(key, val) { this._params[key] = val; },
            toString: function() {
                return Object.keys(this._params)
                    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(this._params[k]))
                    .join('&');
            },
            entries: function() {
                const self = this;
                return {
                    next: function() {
                        const keys = Object.keys(self._params);
                        return { done: false, value: [keys[0], self._params[keys[0]]] };
                    }
                };
            }
        };
    }

    // ========== AbortController/AbortSignal ==========
    if (typeof globalThis.AbortController === 'undefined') {
        globalThis.AbortController = function AbortController() {
            this.signal = {
                aborted: false,
                onabort: null,
                _abort: function() {
                    this.aborted = true;
                    if (this.onabort) this.onabort();
                }
            };
        };
        globalThis.AbortController.prototype = {
            abort: function() { this.signal._abort(); }
        };
    }

    // ========== TextEncoder/TextDecoder ==========
    if (typeof globalThis.TextEncoder === 'undefined') {
        globalThis.TextEncoder = function TextEncoder() {};
        globalThis.TextEncoder.prototype = {
            encode: function(str) {
                const utf8 = [];
                for (let i = 0; i < str.length; i++) {
                    let c = str.charCodeAt(i);
                    if (c < 0x80) utf8.push(c);
                    else if (c < 0x800) {
                        utf8.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
                    } else if (c < 0x10000) {
                        utf8.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
                    }
                }
                return new Uint8Array(utf8);
            },
            encodeInto: function(src, dest) {
                const encoded = this.encode(src);
                dest.set(encoded);
                return { read: src.length, written: encoded.length };
            }
        };
    }

    if (typeof globalThis.TextDecoder === 'undefined') {
        globalThis.TextDecoder = function TextDecoder(encoding) {
            this.encoding = encoding || 'utf-8';
        };
        globalThis.TextDecoder.prototype = {
            decode: function(buffer) {
                if (!buffer) return '';
                const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
                let str = '';
                let i = 0;
                while (i < bytes.length) {
                    const b = bytes[i];
                    if (b < 0x80) {
                        str += String.fromCharCode(b);
                        i++;
                    } else if ((b & 0xE0) === 0xC0) {
                        const b2 = bytes[i + 1];
                        str += String.fromCharCode(((b & 0x1F) << 6) | (b2 & 0x3F));
                        i += 2;
                    } else if ((b & 0xF0) === 0xE0) {
                        const b2 = bytes[i + 1], b3 = bytes[i + 2];
                        str += String.fromCharCode(((b & 0x0F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F));
                        i += 3;
                    } else {
                        i++;
                    }
                }
                return str;
            }
        };
    }

    // ========== Promise.allSettled polyfill ==========
    if (typeof Promise !== 'undefined' && !Promise.allSettled) {
        Promise.allSettled = function(promises) {
            return Promise.all(promises.map(p => 
                Promise.resolve(p).then(
                    value => ({ status: 'fulfilled', value }),
                    reason => ({ status: 'rejected', reason })
                )
            ));
        };
    }

    // ========== Test mode: inject mock responses ==========
    globalThis.__mockFetch = function(mockResponses) {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async function(url, options) {
            const urlStr = typeof url === 'object' ? url.href : String(url);
            const mock = mockResponses[urlStr];
            if (mock) {
                return {
                    ok: mock.status === 200,
                    status: mock.status || 200,
                    statusText: mock.statusText || 'OK',
                    url: urlStr,
                    headers: mock.headers || {},
                    text: async () => JSON.stringify(mock.body),
                    json: async () => mock.body,
                    blob: async () => new Blob([JSON.stringify(mock.body)])
                };
            }
            return originalFetch(url, options);
        };
    };

})();