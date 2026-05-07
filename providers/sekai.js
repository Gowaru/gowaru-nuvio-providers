/**
 * sekai - Built from src/sekai/
 * Engine: quickjs
 * Generated: 2026-05-07T11:18:22.346Z
 */
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

var __provider=(()=>{var D=Object.defineProperty;var z=Object.getOwnPropertyDescriptor;var B=Object.getOwnPropertyNames;var Z=Object.prototype.hasOwnProperty;var V=(t,e)=>{for(var s in e)D(t,s,{get:e[s],enumerable:!0})},Q=(t,e,s,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of B(e))!Z.call(t,r)&&r!==s&&D(t,r,{get:()=>e[r],enumerable:!(n=z(e,r))||n.enumerable});return t};var K=t=>Q(D({},"__esModule",{value:!0}),t);var dt={};V(dt,{getStreams:()=>ft});typeof Promise<"u"&&!Promise.allSettled&&(Promise.allSettled=function(t){return Promise.all(t.map(e=>Promise.resolve(e).then(s=>({status:"fulfilled",value:s}),s=>({status:"rejected",reason:s}))))});var U="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",J={"User-Agent":U};function G(t){if(!t||typeof t!="string")return!0;let e=t.toLowerCase();return e.includes("test-videos.co.uk")||e.includes("big_buck_bunny")||e.includes("bigbuckbunny")||e.includes("sample-videos.com")||e.includes("example.com")||e.includes("localhost")}var A=[2160,1080,720,480,360,240],$=360;function C(t){if(!Number.isFinite(t)||t<=0)return $;let e=A[0],s=Math.abs(t-e);for(let n of A){let r=Math.abs(t-n);r<s&&(s=r,e=n)}return e}function v(t){let e=String(t||"").trim().toLowerCase();if(!e)return`${$}p`;if(e==="4k"||e==="uhd"||e.includes("2160"))return"2160p";if(e.includes("fhd")||e.includes("fullhd")||e.includes("1080"))return"1080p";if(e.includes("hd")||e.includes("720"))return"720p";let s=e.match(/(\d{3,4})\s*p?/i);return s?`${C(Number(s[1]))}p`:`${$}p`}function R(t){let s=v(t).toLowerCase().match(/(\d{3,4})p/),n=s?Number(s[1]):$,r=C(n);return A.length-1-A.indexOf(r)}function X(t,e){let s=v(e);return!s||(t||"").includes(s)?t:`${t} [${s}]`}async function Y(t){if(!t||!t.url||typeof t.url!="string")return[];let e=t.url,s=e.toLowerCase();if(!s.includes(".m3u8")&&!s.includes("/hls/"))return[{...t,quality:v(t.quality||"HD")}];let n=await b(e,{headers:t.headers||{}});if(!n)return[{...t,quality:v(t.quality||"HD")}];let r=await n.text();if(!/#EXT-X-STREAM-INF/i.test(r))return[{...t,quality:v(t.quality||"HD")}];let i=r.split(/\r?\n/).map(o=>o.trim()).filter(Boolean),c=[];for(let o=0;o<i.length;o++){let h=i[o];if(!h.startsWith("#EXT-X-STREAM-INF:"))continue;let a=i[o+1];if(!a||a.startsWith("#"))continue;let f=h.match(/RESOLUTION=\d+x(\d+)/i)?.[1],l=h.match(/FRAME-RATE=([0-9.]+)/i)?.[1],d=h.match(/BANDWIDTH=(\d+)/i)?.[1],m=f?`${f}p`:null;if(!m&&d){let g=Number(d);g>=8e6?m="2160p":g>=4e6?m="1080p":g>=2e6?m="720p":g>=1e6?m="480p":m="360p"}!m&&l&&(m=`${v(t.quality||"HD")}`);let w=a;try{if(a.startsWith("http"))w=a;else if(a.startsWith("//"))w=(e.startsWith("https")?"https:":"http:")+a;else{let g=e.match(/^https?:\/\/[^\/]+/)?.[0]||"";a.startsWith("/")?w=g+a:w=e.substring(0,e.lastIndexOf("/")+1)+a}}catch{}c.push({...t,url:w,quality:v(m||t.quality||"HD"),isDirect:!0,headers:{"User-Agent":U,...t.headers||{}},title:X(t.title||t.name||"Stream",m||t.quality||"HD")})}if(c.length===0)return[{...t,quality:v(t.quality||"HD")}];let u=[],p=new Set;for(let o of c)p.has(o.url)||(p.add(o.url),u.push(o));return u.sort((o,h)=>R(h.quality)-R(o.quality)),u}async function F(t){let e=Array.isArray(t)?t:[],s=[];for(let i of e)try{let c=await Y(i);for(let u of c)s.push(u)}catch{i&&s.push({...i,quality:v(i.quality||"HD")})}let n=[],r=new Set;for(let i of s)i?.url&&(G(i.url)||r.has(i.url)||(r.add(i.url),n.push(i)));return n.sort((i,c)=>R(c.quality)-R(i.quality)),n}async function b(t,e={}){let{__debug:s,timeoutMs:n,...r}=e||{},i=!!s,c=Number.isFinite(Number(n))&&Number(n)>0?Number(n):1e4,u,p;try{u=typeof AbortController<"u"?new AbortController:null;let h={...r,headers:{...J,...r.headers||{}},redirect:"follow",signal:u?u.signal:void 0},a=fetch(t,h),f;if(u?(p=setTimeout(()=>u.abort(),c),f=await a):f=await Promise.race([a,new Promise((m,w)=>{p=setTimeout(()=>w(new Error("timeout")),c)})]),p&&clearTimeout(p),!f)return null;let l=f.status,d="";try{d=await f.text()}catch{d=""}return{text:()=>Promise.resolve(d),json:async()=>{try{return JSON.parse(d)}catch(m){throw m}},ok:f.ok,status:l,url:f.url,headers:f.headers}}catch(o){if(p&&clearTimeout(p),i){let h=o&&o.message?o.message:String(o);console.warn(`[safeFetch] ${t} failed: ${h}`)}return null}}var tt={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8","Accept-Language":"fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"};async function T(t,e={}){console.log(`[Sekai] Fetching: ${t}`);let s=e.timeoutMs||8e3,n=await b(t,{headers:{...tt,...e.headers||{}},timeoutMs:s,...e});if(!n||!n.ok){let r=n&&typeof n.status=="number"?n.status:"no-response";throw new Error(`HTTP ${r} for ${t}`)}return await n.text()}var et="https://v3-cinemeta.strem.io";async function st(t,e={}){try{return await b(t,e)}catch(s){return console.error(`[ArmSync] Fetch failed: ${t}`,s.message),null}}async function L(t,e,s){if(!t||e===0)return null;let n=await st(`${et}/meta/series/${t}.json`);if(!n)return null;let r=await n.json();if(!r?.meta?.videos)return null;let i=r.meta.videos.filter(o=>o.season>0&&o.episode>0).sort((o,h)=>o.season-h.season||o.episode-h.episode),c=[],u=new Set;for(let o of i){let h=`${o.season}-${o.episode}`;u.has(h)||(u.add(h),c.push(o))}let p=c.findIndex(o=>o.season==e&&o.episode==s);if(p!==-1){let o=p+1;return console.log(`[ArmSync] Resolved: S${e}E${s} -> Absolute ${o}`),o}return null}var E="8265bd1679663a7ea12ac168da84d2e8",_="https://api.themoviedb.org/3",nt="https://v3-cinemeta.strem.io";function S(t,e){let s=typeof e=="string"?e.trim():"";s&&(t.some(n=>n.toLowerCase()===s.toLowerCase())||t.push(s))}function rt(t){if(!t||typeof t!="string")return!1;let e=t.trim();return e.startsWith("{")||e.startsWith("[")}async function k(t,e={}){try{let s=await b(t,e);if(!s||typeof s.status=="number"&&s.status>=400)return null;let n=await s.text();return rt(n)?JSON.parse(n):null}catch{return null}}function it(t){if(!t||typeof t!="string")return"";let e=t.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];if(e){let r=e.replace(/\s*\(\d{4}\)\s*[-|].*$/i,"").trim();if(r)return r}return(t.match(/<title>([^<]+)<\/title>/i)?.[1]||"").replace(/\s*\(\d{4}\)\s*[-|].*$/i,"").trim()}async function at(t,e){let n=`${nt}/meta/${e==="movie"?"movie":"series"}/tmdb:${t}.json`;try{return(await k(n,{timeoutMs:12e3}))?.meta?.name||""}catch{return""}}async function O(t,e){let s=e==="movie"?"movie":"tv",n=[],r=c=>/^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()]+$/.test(c||"");try{let c=`${_}/${s}/${t}?api_key=${E}&language=en-US`,u=await k(c);if(u){let f=(s==="movie"?u.title:u.name)?.trim(),l=(s==="movie"?u.original_title:u.original_name)?.trim();S(n,f),l&&l!==f&&r(l)&&S(n,l)}let p=`${_}/${s}/${t}/translations?api_key=${E}`,o=await k(p);if(o){let f=(o.translations||[]).find(d=>d.iso_639_1==="fr"),l=f?.data?.name?.trim()||f?.data?.title?.trim();S(n,l)}let h=`${_}/${s}/${t}/alternative_titles?api_key=${E}`,a=await k(h);if(a){let f=s==="movie"?a.titles:a.results;f&&Array.isArray(f)&&f.forEach(l=>{let d=l.title?.trim();d&&!n.some(m=>m.toLowerCase()===d.toLowerCase())&&r(d)&&(l.type==="Romaji"||l.iso_3166_1==="US"||l.iso_3166_1==="FR"?n.splice(1,0,d):n.push(d))})}if(n.length===0){let f=`https://www.themoviedb.org/${s}/${t}`,l=await b(f,{timeoutMs:12e3,headers:{Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}});if(l&&l.ok){let d=await l.text(),m=it(d);m&&S(n,m)}}if(n.length===0){let f=await at(t,e);S(n,f)}}catch(c){console.error(`[Metadata] TMDB API error: ${c.message}`)}let i=[...new Set(n)];return console.log(`[Metadata] Titles for ${t}: ${i.join(" | ")}`),i}var x="https://sekai.one";async function ot(t,e=6){let s=[];for(let n=0;n<t.length;n+=e){let r=t.slice(n,n+e);(await Promise.allSettled(r.map(c=>T(c)))).forEach(c=>{s.push(c.status==="fulfilled"?c.value:"")})}return s}function ct(t){let e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",s="",n=0,r=String(t||"").replace(/[^A-Za-z0-9+/=]/g,"");for(;n<r.length;){let i=e.indexOf(r.charAt(n++)),c=e.indexOf(r.charAt(n++)),u=e.indexOf(r.charAt(n++)),p=e.indexOf(r.charAt(n++)),o=i<<2|c>>4,h=(c&15)<<4|u>>2,a=(u&3)<<6|p;s+=String.fromCharCode(o),u!==64&&(s+=String.fromCharCode(h)),p!==64&&(s+=String.fromCharCode(a))}return s}function q(t){return t?t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[':!.,?]/g,"").replace(/\b(the|season|part|cour|cour)\b/ig,"").replace(/\s+/g," ").trim():""}async function lt(){let t=await T(`${x}/`),e="var seriesData = [",s=t.indexOf(e);if(s===-1)return[];let n=1,r=s+e.length;for(;r<t.length&&n>0;)t[r]==="["?n++:t[r]==="]"&&n--,r++;let i=t.substring(s+e.length-1,r),c=[];try{let u=[...i.matchAll(/\{\s*label:\s*"([^"]+)",\s*image:(?:[^,]+),\s*url:\s*"([^"]+)"(?:,\s*aliases:\s*\[([^\]]+)\])?/g)];for(let p of u){let o=p[1],h=p[2],f=[...(p[3]||"").matchAll(/"([^"]+)"/g)].map(l=>l[1]);c.push({title:o,url:`${x}/${h}`,aliases:f})}}catch(u){console.error("[Sekai] Regex parsing error on seriesData",u)}return c}function H(t){let e={},s=/var\s+([a-zA-Z0-9_]+)\s*=\s*atob\("([^"]+)"\)/g,n={};for(let a of t.matchAll(s))typeof atob=="function"?n[a[1]]=atob(a[2]):n[a[1]]=ct(a[2]);let r=t.match(/<script>\s*(?:var\s+[a-zA-Z0-9_]+\s*=\s*[0-9]+;|var\s+[a-zA-Z0-9_]+\s*=\s*atob)[\s\S]*?<\/script>/);if(!r)return e;let i=r[0],c=/(episode(?:HD|Low)?)\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*\+?\s*(\d+)?\s*\+\s*['"](\.mp4)['"]/g;for(let a of i.matchAll(c)){let f=a[1],l=parseInt(a[2]),d=n[a[3]]||"",m=a[4],w=a[5]?a[5]:"",g=a[6];e[l]||(e[l]={}),e[l][f]=d+m+w+g}let u=/(episode(?:HD|Low)?)\s*\[\s*(\d+)\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*;/g;for(let a of i.matchAll(u)){let f=a[1],l=parseInt(a[2]),d=n[a[3]]||"",m=a[4];e[l]||(e[l]={}),!e[l][f]&&m.endsWith(".mp4")&&(e[l][f]=d+m)}let p=/for\s*\(\s*var\s+num\s*=\s*(\d+);\s*num\s*<=\s*([0-9a-zA-Z_]+);\s*num\+\+\s*\)\s*\{([^}]+)\}/g,o=/var\s+([a-zA-Z0-9_]+)\s*=\s*(\d+);/g,h={};for(let a of i.matchAll(o))h[a[1]]=parseInt(a[2]);for(let a of i.matchAll(p)){let f=parseInt(a[1]),l=a[2],d=isNaN(parseInt(l))?h[l]||1e3:parseInt(l),m=a[3],w=/(episode(?:HD|Low)?)\s*\[\s*num\s*\]\s*=\s*([a-zA-Z0-9_]+)\s*\+\s*['"]([^'"]+)['"]\s*\+\s*(?:num)\s*\+\s*['"](\.mp4)['"](;)/g;for(let g=f;g<=d;g++){e[g]||(e[g]={});for(let y of m.matchAll(w)){let M=y[1],W=n[y[2]]||"",I=y[3],j=y[4];e[g][M]||(e[g][M]=W+I+g+j)}}}return e}function ut(t,e){let s=[],n=/<a\s+href="([^"]+)">\s*<div\s+class="hover-arc">/g;for(let r of t.matchAll(n)){let i=r[1];!i.includes("?")&&!i.startsWith("http")&&s.push((e.replace(/\?.*$/,"")+"/"+i).replace(/([^:]\/)\/+/g,"$1"))}if(s.length===0){let r=/redirectTo\(['"]([^'"]+)['"]\)/g;for(let i of t.matchAll(r)){let c=i[1];c.includes("arc-")&&!c.includes("?")&&s.push((x+"/"+c).replace(/([^:]\/)\/+/g,"$1"))}}return[...new Set(s)]}async function P(t,e,s,n){e==="movie"&&console.log("[Sekai] movie is not yet perfectly mapped");let r=await O(t,e);if(!r||r.length===0)return[];let i=await L(t,e,s,n);console.log(`[Sekai] Checking S${s} E${n} -> Absolute: ${i}`);let c=await lt();if(c.length===0)return[];let u=null,p=-1;for(let l of r){if(!l)continue;let d=q(l);for(let m of c){let w=q(m.title);if(d===w||w.includes(d)||d.includes(w)){u=m,p=100;break}for(let g of m.aliases){let y=q(g);if(d===y||y.includes(d)||d.includes(y)){u=m,p=90;break}}}if(u)break}if(!u)return console.log(`[Sekai] No series match found for tmdbId ${t}`),[];console.log(`[Sekai] Matched Series: ${u.title} (${u.url})`);let o=await T(u.url),h=H(o);if(h[i]&&Object.keys(h[i]).length>0)return N(h[i]);let a=ut(o,u.url);console.log(`[Sekai] Found ${a.length} arcs. Fetching...`);let f=await ot(a);for(let l of f){if(!l)continue;let d=H(l);if(d[i]&&Object.keys(d[i]).length>0){h=d;break}}return h[i]&&Object.keys(h[i]).length>0?N(h[i]):(console.log(`[Sekai] Episode ${i} not found in parsed maps.`),[])}function N(t){let e=[];return t.episodeHD&&e.push({name:"Sekai (VOSTFR)",title:"Sekai-HD - VOSTFR",url:t.episodeHD,quality:"1080p",isDirect:!0,headers:{Referer:x}}),t.episode&&e.push({name:"Sekai (VOSTFR)",title:"Sekai-SD - VOSTFR",url:t.episode,quality:"720p",isDirect:!0,headers:{Referer:x}}),t.episodeLow&&e.push({name:"Sekai (VOSTFR)",title:"Sekai-LOW - VOSTFR",url:t.episodeLow,quality:"360p",isDirect:!0,headers:{Referer:x}}),e}async function ft(t,e,s,n){console.log(`[Sekai] Request: ${e} ${t} S${s}E${n}`);try{let r=await P(t,e,s,n);return await F(r)}catch(r){return console.error(`[Sekai] Extraction error for ${t}:`,r),[]}}return K(dt);})();

(function(api) {
    if (!api) return;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof exports !== 'undefined') exports.getStreams = api.getStreams;
    
    var g = (typeof globalThis !== 'undefined') ? globalThis : 
            (typeof global !== 'undefined') ? global : 
            (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : {};
            
    if (api.getStreams) g.getStreams = api.getStreams;
})(__provider);
