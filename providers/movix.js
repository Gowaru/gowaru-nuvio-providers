/**
 * movix - Built from src/movix/
 * Engine: quickjs
 * Generated: 2026-05-07T11:18:22.340Z
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

var __provider=(()=>{var O=(e,t)=>()=>(e&&(t=e(e=0)),t);var ge=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports);function k(e){if(!e||typeof e!="string")return!0;let t=e.toLowerCase();return t.includes("test-videos.co.uk")||t.includes("big_buck_bunny")||t.includes("bigbuckbunny")||t.includes("sample-videos.com")||t.includes("example.com")||t.includes("localhost")}function ye(e){if(!e||typeof e!="string")return!1;let t=e.toLowerCase();return k(t)?!1:/\.(mp4|m3u8|mkv|webm)(\?.*)?$/.test(t)||t.includes("/hls2/")||t.includes("/master.m3u8")}function re(e){if(!Number.isFinite(e)||e<=0)return H;let t=P[0],n=Math.abs(e-t);for(let r of P){let i=Math.abs(e-r);i<n&&(n=i,t=r)}return t}function $(e){let t=String(e||"").trim().toLowerCase();if(!t)return`${H}p`;if(t==="4k"||t==="uhd"||t.includes("2160"))return"2160p";if(t.includes("fhd")||t.includes("fullhd")||t.includes("1080"))return"1080p";if(t.includes("hd")||t.includes("720"))return"720p";let n=t.match(/(\d{3,4})\s*p?/i);return n?`${re(Number(n[1]))}p`:`${H}p`}function N(e){let n=$(e).toLowerCase().match(/(\d{3,4})p/),r=n?Number(n[1]):H,i=re(r);return P.length-1-P.indexOf(i)}function ve(e,t){let n=$(t);return!n||(e||"").includes(n)?e:`${e} [${n}]`}function Y(e){if(!e||typeof e!="string")return null;let t=e.match(/^(https?:\/\/[^\/]+)/);return t?t[1]:null}function X(e){if(!e||typeof e!="string")return"";try{return(e.match(/^https?:\/\/([^\/]+)/i)?.[1]||"").toLowerCase()}catch{return""}}function we(e,t){let n=`${X(e)} ${X(t)}`;return/vidmoly|uqload|oneupload|dood|voe|streamtape|filemoon|moonplayer|sendvid|myvi|mytv|lulu|lulustream|luluvdo|wishonly|veev|fsvid|vidzy/.test(n)}function Z(e,t,n,r){let i=Y(n),s={"User-Agent":S,...e,...t||{}},o=we(n,r),a=s.Referer||s.referer||"",l=Y(a);return o?a&&l?s.Referer=a:i&&(s.Referer=`${i}/`):i&&(s.Referer=`${i}/`),delete s.Origin,delete s.origin,s.origin&&delete s.origin,s.referer&&delete s.referer,s}async function xe(e){if(!e||!e.url||typeof e.url!="string")return[];let t=e.url,n=t.toLowerCase();if(!n.includes(".m3u8")&&!n.includes("/hls/"))return[{...e,quality:$(e.quality||"HD")}];let r=await g(t,{headers:e.headers||{}});if(!r)return[{...e,quality:$(e.quality||"HD")}];let i=await r.text();if(!/#EXT-X-STREAM-INF/i.test(i))return[{...e,quality:$(e.quality||"HD")}];let s=i.split(/\r?\n/).map(c=>c.trim()).filter(Boolean),o=[];for(let c=0;c<s.length;c++){let u=s[c];if(!u.startsWith("#EXT-X-STREAM-INF:"))continue;let d=s[c+1];if(!d||d.startsWith("#"))continue;let f=u.match(/RESOLUTION=\d+x(\d+)/i)?.[1],h=u.match(/FRAME-RATE=([0-9.]+)/i)?.[1],m=u.match(/BANDWIDTH=(\d+)/i)?.[1],p=f?`${f}p`:null;if(!p&&m){let b=Number(m);b>=8e6?p="2160p":b>=4e6?p="1080p":b>=2e6?p="720p":b>=1e6?p="480p":p="360p"}!p&&h&&(p=`${$(e.quality||"HD")}`);let w=d;try{if(d.startsWith("http"))w=d;else if(d.startsWith("//"))w=(t.startsWith("https")?"https:":"http:")+d;else{let b=t.match(/^https?:\/\/[^\/]+/)?.[0]||"";d.startsWith("/")?w=b+d:w=t.substring(0,t.lastIndexOf("/")+1)+d}}catch{}o.push({...e,url:w,quality:$(p||e.quality||"HD"),isDirect:!0,headers:{"User-Agent":S,...e.headers||{}},title:ve(e.title||e.name||"Stream",p||e.quality||"HD")})}if(o.length===0)return[{...e,quality:$(e.quality||"HD")}];let a=[],l=new Set;for(let c of o)l.has(c.url)||(l.add(c.url),a.push(c));return a.sort((c,u)=>N(u.quality)-N(c.quality)),a}async function ie(e){let t=Array.isArray(e)?e:[],n=[];for(let s of t)try{let o=await xe(s);for(let a of o)n.push(a)}catch{s&&n.push({...s,quality:$(s.quality||"HD")})}let r=[],i=new Set;for(let s of n)s?.url&&(k(s.url)||i.has(s.url)||(i.add(s.url),r.push(s)));return r.sort((s,o)=>N(o.quality)-N(s.quality)),r}async function g(e,t={}){let{__debug:n,timeoutMs:r,...i}=t||{},s=!!n,o=Number.isFinite(Number(r))&&Number(r)>0?Number(r):1e4,a,l;try{a=typeof AbortController<"u"?new AbortController:null;let u={...i,headers:{...te,...i.headers||{}},redirect:"follow",signal:a?a.signal:void 0},d=fetch(e,u),f;if(a?(l=setTimeout(()=>a.abort(),o),f=await d):f=await Promise.race([d,new Promise((p,w)=>{l=setTimeout(()=>w(new Error("timeout")),o)})]),l&&clearTimeout(l),!f)return null;let h=f.status,m="";try{m=await f.text()}catch{m=""}return{text:()=>Promise.resolve(m),json:async()=>{try{return JSON.parse(m)}catch(p){throw p}},ok:f.ok,status:h,url:f.url,headers:f.headers}}catch(c){if(l&&clearTimeout(l),s){let u=c&&c.message?c.message:String(c);console.warn(`[safeFetch] ${e} failed: ${u}`)}return null}}function A(e){try{if(!e.includes("p,a,c,k,e,d"))return e;let t=s=>{let o=[],a=0;for(;;){let l=s.indexOf("eval(function(p,a,c,k,e,d)",a);if(l===-1)break;let c=l,u=0,d=!1,f=!1,h=!1;for(;c<s.length;c++){let m=s[c];if(h){h=!1;continue}if(m==="\\"){h=!0;continue}if(!f&&m==="'"?d=!d:!d&&m==='"'&&(f=!f),!(d||f)){if(m==="(")u++;else if(m===")"&&(u--,u===0)){c++;break}}}c>l&&o.push(s.slice(l,c)),a=c}return o},n=s=>{let o=(v,x)=>{let M=v[x];if(M!=="'"&&M!=='"')return null;let C=x+1,B="",z=!1;for(;C<v.length;C++){let L=v[C];if(z){B+=L,z=!1;continue}if(L==="\\"){z=!0;continue}if(L===M)return{value:B,end:C+1};B+=L}return null},a=(v,x)=>{for(;x<v.length&&/\s/.test(v[x]);)x++;return x},l=(v,x)=>{x=a(v,x);let M=v.slice(x).match(/^\d+/);return M?{value:parseInt(M[0],10),end:x+M[0].length}:null},c=s.indexOf("}(");if(c===-1)return null;let u=c+2;u=a(s,u);let d=o(s,u);if(!d)return null;let f=d.value;if(u=a(s,d.end),s[u]!==",")return null;let h=l(s,u+1);if(!h)return null;let m=h.value;if(u=a(s,h.end),s[u]!==",")return null;let p=l(s,u+1);if(!p)return null;let w=p.value;if(u=a(s,p.end),s[u]!==",")return null;let b=o(s,a(s,u+1));if(!b)return null;let E=s.slice(b.end,b.end+20);if(!/\.split\(\s*['"]\|['"]\s*\)/.test(E))return null;let U=b.value.split("|"),R=v=>(v<m?"":R(parseInt(v/m,10)))+((v=v%m)>35?String.fromCharCode(v+29):v.toString(36)),y={};for(;w--;)y[R(w)]=U[w]||R(w);return f.replace(/\b\w+\b/g,v=>y[v]||v)},r=e,i=t(e);for(let s of i)try{let o=n(s);o&&(r=r.replace(s,o))}catch{}return r}catch{return e}}async function be(e){try{let t=await g(e,{headers:{Referer:"https://video.sibnet.ru/"}});if(!t)return{url:e};let n=await t.text(),r=n.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i)||n.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i)||n.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)["']/i);if(r){let i=r[1];return i.startsWith("//")?i="https:"+i:i.startsWith("/")&&(i="https://video.sibnet.ru"+i),{url:i,headers:{Referer:"https://video.sibnet.ru/"}}}}catch{}return{url:e}}async function $e(e){try{let t=e.replace(/vidmoly\.(net|to|ru|is)/,"vidmoly.me"),n={Referer:"https://vidmoly.me/",Origin:"https://vidmoly.me"},r=await g(t,{headers:n});if(!r)return{url:e};let i=await r.text(),s=i.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/)||i.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);s&&s[1]!==t&&(r=await g(s[1],{headers:n}),r&&(i=await r.text())),i.includes("eval(function(p,a,c,k,e,d)")&&(i=A(i));let o=i.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i)||i.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);if(o)return{url:o[1],headers:{Referer:"https://vidmoly.me/"}}}catch{}return{url:e}}async function Se(e){let t=e.replace(/^https?:\/\/[^/]+/,""),n=e.match(/^https?:\/\/([^/]+)/)?.[1]||"uqload.co",r=[...new Set([n,"uqload.co","oneupload.to"])],i="https://uqload.co/";return new Promise(s=>{let o=0,a=!1,l=async c=>{try{let u=`https://${c}${t}`,f=typeof AbortController<"u"?new AbortController:null,h=f?setTimeout(()=>f.abort(),4e3):null,m=await g(u,{headers:{...te,Referer:i}});if(m){let p=await m.text(),w=p.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8))["']\]/)||p.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8))["']/);if(w&&!a){a=!0,s({url:w[1],headers:{Referer:i}});return}}}catch{}o++,o===r.length&&!a&&s({url:e})};r.forEach(l)})}async function Ae(e){try{let t=await g(e);if(!t)return{url:e};let n=await t.text(),r=n.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);if(r){let s=await g(r[1]);s&&(n=await s.text())}let i=n.match(/'hls'\s*:\s*'([^']+)'/)||n.match(/"hls"\s*:\s*"([^"]+)"/)||n.match(/https?:\/\/[^"']+\.m3u8[^"']*/);if(i){let s=i[1]||i[0];return s.includes("base64")&&(s=ne(s.split(",")[1]||s)),k(s)?{url:e}:{url:s,headers:{Referer:e}}}}catch{}return{url:e}}async function Me(e){try{let t=await g(e);if(!t)return{url:e};let n=await t.text();n.includes("p,a,c,k,e,d")&&(n=A(n));let r=n.match(/robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*([^;]+)/);if(r){let i="https:"+r[1],s=r[2].split("+");for(let o of s){let a=o.match(/['"]([^'"]+)['"]/);if(a){let l=a[1],c=o.match(/substring\((\d+)\)/);c&&(l=l.substring(parseInt(c[1]))),i+=l}}return{url:i,headers:{Referer:"https://streamtape.com/"}}}}catch{}return{url:e}}async function Te(e){try{let t=e.includes("/embed/")?e:e.replace(/sendvid\.com\/([a-z0-9]+)/i,"sendvid.com/embed/$1"),n=await g(t,{headers:{Referer:"https://sendvid.com/"}});if(!n)return{url:e};let r=await n.text(),i=r.match(/video_source\s*:\s*["']([^"']+\.mp4[^"']*)["|']/)||r.match(/source\s+src=["']([^"']+\.mp4[^"']*)["|']/)||r.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/)||r.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/)||r.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);if(i)return{url:i[1],headers:{Referer:"https://sendvid.com/"}}}catch{}return{url:e}}async function Re(e){try{let t=await g(e);if(!t)return{url:e};let n=await t.text();n.includes("p,a,c,k,e,d")&&(n=A(n));let r=n.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/)||n.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/);if(r){let i=r[1];return i.includes("base64")&&(i=ne(i.split(",")[1]||i)),{url:i,headers:{Referer:e}}}}catch{}return{url:e}}async function ke(e){try{let t=await g(e);if(!t)return{url:e};let r=(await t.text()).match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);if(r)return{url:r[1],headers:{Referer:e}}}catch{}return{url:e}}async function _e(e){try{let t=e.match(/https?:\/\/([^\/]+)/)?.[1]||"dood.to",n=await g(e);if(!n)return{url:e};let r=await n.text();r.includes("eval(function(p,a,c,k,e,d)")&&(r=A(r));let i=r.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);if(i){let s=i[1],o=`https://${t}/pass_md5/${s}`,a=await g(o,{headers:{Referer:e}});if(a&&a.ok){let l=await a.text(),c=Math.random().toString(36).substring(2,12);return{url:l+c+"?token="+s+"&expiry="+Date.now(),headers:{Referer:`https://${t}/`}}}}}catch{}return{url:e}}async function Ue(e){try{let t=await g(e,{headers:{Referer:"https://www.myvi.ru/"}});if(!t)return{url:e};let n=await t.text();n.includes("eval(function(p,a,c,k,e,d)")&&(n=A(n));let r=n.match(/["'](?:file|src|url|stream_url)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/)||n.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/)||n.match(/source\s+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)/);if(r)return{url:r[1],headers:{Referer:"https://www.myvi.ru/"}};let i=e.match(/\/(?:embed\/|watch\/|video\/)([a-zA-Z0-9_-]+)/);if(i){let s=`https://www.myvi.ru/api/video/${i[1]}`,o=await g(s,{headers:{Referer:e}});if(o){let l=(await o.text()).match(/["'](?:url|src|file)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);if(l)return{url:l[1],headers:{Referer:"https://www.myvi.ru/"}}}}}catch{}return{url:e}}async function De(e){try{let t=await g(e);if(!t)return{url:e};let n=await t.text();n.includes("p,a,c,k,e,d")&&(n=A(n));let r=n.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);if(r)return{url:r[1],headers:{Referer:e}}}catch{}return{url:e}}async function ee(e){try{let t=e.match(/^https?:\/\/[^/]+/)?.[0]||e,n=await g(e,{headers:{Referer:t+"/"}});if(!n)return{url:e};let r=await n.text();(r.includes("p,a,c,k,e,d")||r.includes("eval(function"))&&(r=A(r));let i=r.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i)||r.match(/sources\s*:\s*\[[^\]]*?["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i)||r.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);if(i)return{url:i[1],headers:{Referer:t+"/"}}}catch{}return{url:e}}async function J(e,t=0){if(t>3)return{...e,isDirect:!1};let n=e.url,r=n.toLowerCase();if(!n||n.includes("google-analytics")||n.includes("doubleclick"))return null;if(ye(n))return{...e,isDirect:!0};try{let i=null;if(r.includes("sibnet.ru")?i=await be(n):r.includes("vidmoly.")?i=await $e(n):r.includes("uqload.")||r.includes("oneupload.")?i=await Se(n):r.includes("voe")||r.includes("charlestoughrace")||r.includes("sandratableother")?i=await Ae(n):r.includes("streamtape.com")||r.includes("stape")?i=await Me(n):r.includes("dood")||r.includes("ds2play")||r.includes("bigwar5")?i=await _e(n):r.includes("moonplayer")||r.includes("filemoon")?i=await De(n):r.includes("sendvid.")?i=await Te(n):r.includes("myvi.")||r.includes("mytv.")?i=await Ue(n):r.includes("fsvid.lol")||r.includes("vidzy.live")?i=await ee(n):r.includes("luluvid.")||r.includes("lulustream.")||r.includes("luluvdo.")||r.includes("wishonly.")||r.includes("veev.")?i=await ee(n):r.includes("lulu.")?i=await Re(n):(r.includes("hgcloud.")||r.includes("savefiles."))&&(i=await ke(n)),i&&i.url!==n&&!k(i.url)){let s=Z(e.headers,i.headers,i.url,n);return{...e,url:i.url,headers:s,isDirect:!0,originalUrl:n}}if(!i||i.url===n){let s=await g(n,{headers:e.headers});if(s){let o=await s.text();o.includes("p,a,c,k,e,d")&&(o=A(o));let a=o.match(/https?:\/\/[^"']+\.m3u8[^"']*/)||o.match(/https?:\/\/[^"']+\.mp4[^"']*/)||o.match(/file\s*:\s*["']([^"']+)["']/);if(a){let l=a[1]||a[0];l.startsWith("//")&&(l="https:"+l);let c=l.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);l.startsWith("http")&&!l.includes(qe)&&!c&&!k(l)&&(i={url:l})}if(!i){let l=o.match(/<iframe\s+[^>]*src=["']([^"']+)["']/i);if(l){let c=l[1];if(c.startsWith("//")&&(c="https:"+c),c.startsWith("/")){let u=n.match(/^https?:\/\/[^\/]+/)?.[0];u&&(c=u+c)}if(c.startsWith("http")&&c!==n)return console.log(`[Resolver] Peeling: Found nested iframe -> ${c}`),await J({...e,url:c},t+1)}}}}if(i&&i.url!==n&&i.url.startsWith("http")&&!k(i.url)){let s=Z(e.headers,i.headers,i.url,n);return{...e,url:i.url,headers:s,isDirect:!0,originalUrl:n}}}catch{}return{...e,isDirect:!1}}var S,te,ne,P,H,qe,D=O(()=>{typeof Promise<"u"&&!Promise.allSettled&&(Promise.allSettled=function(e){return Promise.all(e.map(t=>Promise.resolve(t).then(n=>({status:"fulfilled",value:n}),n=>({status:"rejected",reason:n}))))});S="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",te={"User-Agent":S},ne=e=>{try{if(typeof atob=="function")return atob(e);let t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="",r=0;for(e=String(e||"").replace(/[^A-Za-z0-9+/=]/g,"");r<e.length;){let i=t.indexOf(e.charAt(r++)),s=t.indexOf(e.charAt(r++)),o=t.indexOf(e.charAt(r++)),a=t.indexOf(e.charAt(r++)),l=i<<2|s>>4,c=(s&15)<<4|o>>2,u=(o&3)<<6|a;n+=String.fromCharCode(l),o!==64&&(n+=String.fromCharCode(c)),a!==64&&(n+=String.fromCharCode(u))}return n}catch{return e}};P=[2160,1080,720,480,360,240],H=360;qe="googletagmanager"});async function se(){if(T)return console.log("[Movix] Using cached domain: "+T),T;console.log("[Movix] Detecting current domain...");for(let e of Fe)try{let t=await g(e,{timeoutMs:8e3,headers:{"User-Agent":S,Accept:"application/json"}});if(t&&t.ok){let r=(await t.json())?.movix;if(r)return console.log("[Movix] Domain from GitHub: movix."+r),W=r,T="https://api.movix."+r,T}}catch{console.log("[Movix] Failed to fetch domains from: "+e)}return console.log("[Movix] Falling back to default domain"),W="cash",T="https://api.movix.cash",T}function Q(){return W?"https://movix."+W:"https://movix.cash"}async function Ee(){let e=Q();return{"User-Agent":S,Accept:"application/json, text/plain, */*","Accept-Language":"fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",Connection:"keep-alive",DNT:"1",Referer:e+"/",Origin:e}}async function oe(e,t={}){console.log(`[Movix] Fetching: ${e}`);let n=await Ee();try{let{headers:r,...i}=t||{},s=await g(e,{...i,headers:{...n,...r||{}}});if(!s||!s.ok){let o=s&&typeof s.status=="number"?s.status:"no-response";return console.log(`[Movix] HTTP ${o} for ${e}`),null}try{return await s.json()}catch{let a=await s.text();return console.log(`[Movix] JSON parse error for ${e}. Content length: ${String(a&&a.length)}`),null}}catch(r){return console.log(`[Movix] Fetch error for ${e}: ${r.message}`),null}}var Fe,W,T,ae=O(()=>{D();Fe=["https://raw.githubusercontent.com/yoruix/nuvio-providers/main/domains.json","https://raw.githubusercontent.com/phisher98/phisher-nuvio-providers/main/domains.json"],W=null,T=null});function q(e,t){let n=typeof t=="string"?t.trim():"";n&&(e.some(r=>r.toLowerCase()===n.toLowerCase())||e.push(n))}function Le(e){if(!e||typeof e!="string")return!1;let t=e.trim();return t.startsWith("{")||t.startsWith("[")}async function j(e,t={}){try{let n=await g(e,t);if(!n||typeof n.status=="number"&&n.status>=400)return null;let r=await n.text();return Le(r)?JSON.parse(r):null}catch{return null}}function Oe(e){if(!e||typeof e!="string")return"";let t=e.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];if(t){let i=t.replace(/\s*\(\d{4}\)\s*[-|].*$/i,"").trim();if(i)return i}return(e.match(/<title>([^<]+)<\/title>/i)?.[1]||"").replace(/\s*\(\d{4}\)\s*[-|].*$/i,"").trim()}async function Pe(e,t){let r=`${Ce}/meta/${t==="movie"?"movie":"series"}/tmdb:${e}.json`;try{return(await j(r,{timeoutMs:12e3}))?.meta?.name||""}catch{return""}}async function ce(e,t){let n=t==="movie"?"movie":"tv",r=[],i=o=>/^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()]+$/.test(o||"");try{let o=`${V}/${n}/${e}?api_key=${G}&language=en-US`,a=await j(o);if(a){let f=(n==="movie"?a.title:a.name)?.trim(),h=(n==="movie"?a.original_title:a.original_name)?.trim();q(r,f),h&&h!==f&&i(h)&&q(r,h)}let l=`${V}/${n}/${e}/translations?api_key=${G}`,c=await j(l);if(c){let f=(c.translations||[]).find(m=>m.iso_639_1==="fr"),h=f?.data?.name?.trim()||f?.data?.title?.trim();q(r,h)}let u=`${V}/${n}/${e}/alternative_titles?api_key=${G}`,d=await j(u);if(d){let f=n==="movie"?d.titles:d.results;f&&Array.isArray(f)&&f.forEach(h=>{let m=h.title?.trim();m&&!r.some(p=>p.toLowerCase()===m.toLowerCase())&&i(m)&&(h.type==="Romaji"||h.iso_3166_1==="US"||h.iso_3166_1==="FR"?r.splice(1,0,m):r.push(m))})}if(r.length===0){let f=`https://www.themoviedb.org/${n}/${e}`,h=await g(f,{timeoutMs:12e3,headers:{Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}});if(h&&h.ok){let m=await h.text(),p=Oe(m);p&&q(r,p)}}if(r.length===0){let f=await Pe(e,t);q(r,f)}}catch(o){console.error(`[Metadata] TMDB API error: ${o.message}`)}let s=[...new Set(r)];return console.log(`[Metadata] Titles for ${e}: ${s.join(" | ")}`),s}var G,V,Ce,le=O(()=>{D();G="8265bd1679663a7ea12ac168da84d2e8",V="https://api.themoviedb.org/3",Ce="https://v3-cinemeta.strem.io"});function ue(e){return(e||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}function I(e){if(!e||typeof e!="string")return"https://movix.cash";let t=e.match(/^(https?:\/\/[^\/]+)/);return t?t[1]:"https://movix.cash"}function me(e,t={}){let n=I(e),r={...t};return!r["User-Agent"]&&!r["user-agent"]&&(r["User-Agent"]=S),!r.Accept&&!r.accept&&(r.Accept="*/*"),!r.Referer&&!r.referer&&(r.Referer=`${n}/`),delete r.Origin,delete r.origin,delete r.RefererOrigin,delete r["Sec-Fetch-Dest"],delete r["Sec-Fetch-Mode"],delete r["Sec-Fetch-Site"],r}async function Ne(e,t={}){try{return(await g(e,{method:"HEAD",headers:me(e,t),redirect:"follow"}))?.ok?!0:_(e)}catch{return _(e)}}function We(e,t){if(!Array.isArray(e)||e.length===0||!Array.isArray(t)||t.length===0)return!0;let n=e.map(ue).filter(Boolean),r=t.map(ue).filter(Boolean);return n.some(i=>r.some(s=>i===s||i.includes(s)||s.includes(i)))}function je(e){let t=[],n=r=>{if(typeof r!="string")return;let i=r.trim();i&&t.push(i)};return n(e?.title),n(e?.original_title),n(e?.name_no_lang),n(e?.tmdb?.title),n(e?.tmdb?.original_title),n(e?.tmdb?.name_no_lang),n(e?.search?.bestMatch?.title),n(e?.search?.bestMatch?.originalTitle),[...new Set(t)]}function Ie(e){let t=(e||"").toLowerCase();return t==="vff"||t==="vfq"||t==="vf"||t.includes("french")?"VF":t==="vostfr"||t==="vost"||t.includes("vostfr")?"VOSTFR":t==="default"||t==="multi"?"MULTI":(e||"VF").toUpperCase()}function F(e,t,n,r,i,s){if(!i||typeof i!="string")return;let o=I(i);e.push({name:"Movix",title:`[${Ie(r)}] ${t} - ${n||"Player"}`,server:`${t} - ${n||"Player"}`,url:i,quality:s||"HD",headers:{Referer:`${o}/`,"User-Agent":S}})}function _(e){if(!e||typeof e!="string")return!1;let t=e.toLowerCase();return t.includes("test-videos.co.uk")||t.includes("sample-videos.com")||t.includes("big_buck_bunny")||t.includes("/embed")||t.includes("/e/")||t.includes("iframe")||t.includes("index.php")?!1:!!(t.includes(".m3u8")||t.includes(".mp4")||t.includes(".mkv")||t.includes(".webm")||t.includes(".ts")||t.includes("manifest")||t.includes("playlist")||t.includes("/hls/"))}function Be(e){return new Promise(t=>setTimeout(t,e))}async function ze(e){for(let t=0;t<K.length;t++){let n=K[t];n>0&&await Be(n);let r=await oe(e.url,{timeoutMs:e.timeoutMs||He});if(!r)continue;if((r.pending===!0||/reessayez|reessay/i.test(String(r.message||"")))&&t<K.length-1){console.log(`[Movix] ${e.label} pending (attempt ${t+1}), retrying...`);continue}return r}return null}function Je(e,t,n,r,i,s){return t?[{label:`fstream-movie@${e}`,url:`${e}/api/fstream/movie/${n}`,timeoutMs:16e3,collect:o=>Ge(s,o)},{label:`wiflix-movie@${e}`,url:`${e}/api/wiflix/movie/${n}`,timeoutMs:11e3,collect:o=>Ke(s,o)},{label:`cpasmal-movie@${e}`,url:`${e}/api/cpasmal/movie/${n}`,timeoutMs:11e3,collect:o=>fe(s,o)}]:[{label:`fstream-tv@${e}`,url:`${e}/api/fstream/tv/${n}/season/${r}`,timeoutMs:16e3,collect:o=>Ve(s,o,i)},{label:`wiflix-tv@${e}`,url:`${e}/api/wiflix/tv/${n}/${r}`,timeoutMs:11e3,collect:o=>Ye(s,o,i)},{label:`cpasmal-tv@${e}`,url:`${e}/api/cpasmal/tv/${n}/${r}/${i}`,timeoutMs:11e3,collect:o=>fe(s,o)}]}async function Qe(e){let t=null;for(let s=1;s<=2;s++)try{t=await Promise.race([J(e),new Promise((o,a)=>setTimeout(()=>a(new Error("timeout")),5e3))]);break}catch{if(s===2)if(_(e.url))t={...e,isDirect:!0};else return null}if(!t||!t.url||!t.isDirect&&!_(t.url))return null;let n=me(t.url,t.headers||e.headers),r=[n,{...n,Referer:`${I(e.url)}/`},{...n,Referer:`${I(t.url)}/`}],i=null;for(let s of r)if(await Ne(t.url,s)){i=s;break}if(!i){if(!_(t.url))return null;i=n}return _(t.url)?{...t,headers:i}:null}function Ge(e,t){let n=t?.players;if(!(!n||typeof n!="object"))for(let r of Object.keys(n)){let i=n[r];if(Array.isArray(i))for(let s of i)F(e,"FStream",s?.player,r,s?.url,s?.quality)}}function Ve(e,t,n){let i=(t?.episodes?.[String(n)]||t?.episodes?.[n])?.languages;if(!(!i||typeof i!="object"))for(let s of Object.keys(i)){let o=i[s];if(Array.isArray(o))for(let a of o)F(e,"FStream",a?.player,s,a?.url,a?.quality)}}function Ke(e,t){let n=t?.links;if(!(!n||typeof n!="object"))for(let r of Object.keys(n)){let i=n[r];if(Array.isArray(i))for(let s of i)F(e,"Wiflix",s?.name||s?.player,r,s?.url,s?.quality)}}function Ye(e,t,n){let r=t?.episodes?.[String(n)]||t?.episodes?.[n];if(!(!r||typeof r!="object"))for(let i of Object.keys(r)){let s=r[i];if(Array.isArray(s))for(let o of s)F(e,"Wiflix",o?.name||o?.player,i,o?.url,o?.quality)}}function fe(e,t){let n=t?.links;if(!(!n||typeof n!="object"))for(let r of Object.keys(n)){let i=n[r];if(Array.isArray(i))for(let s of i)F(e,"Cpasmal",s?.server||s?.name,r,s?.url,s?.quality||"HD")}}async function he(e,t,n,r){let i=[];if(!e)return console.log("[Movix] Missing tmdbId"),i;let s=t==="movie",o=Number(n)||1,a=Number(r)||1,l=[];try{l=await ce(e,t)}catch(y){console.log(`[Movix] Failed to load TMDB titles for ${e}: ${y.message}`)}let c=await se(),u=Q(),d=i.length,f=Je(c,s,e,o,a,i),h=await Promise.allSettled(f.map(async y=>{let v=await ze(y);if(!v)return;if(v.success===!1){console.log(`[Movix] ${y.label} unavailable: ${v.error||"unknown error"}`);return}let x=je(v);if(!We(x,l)){console.log(`[Movix] ${y.label} skipped: source title mismatch (${x.join(" | ")||"no title"})`);return}y.collect(v)}));for(let y of h)y.status==="rejected"&&console.log(`[Movix] source fetch failed: ${y.reason?.message||y.reason}`);let m=i.length-d;m>0&&console.log(`[Movix] Added ${m} candidate streams from ${c}`);let p=new Set,w=[];for(let y of i)p.has(y.url)||(p.add(y.url),w.push(y));let b=w.slice(0,20),E=await Promise.allSettled(b.map(y=>Qe(y))),U=[],R=new Set;for(let y of E)y.status!=="fulfilled"||!y.value||R.has(y.value.url)||(R.add(y.value.url),U.push(y.value));return console.log(`[Movix] Total streams found: ${w.length}, Exo-playable: ${U.length}`),U}var K,He,de=O(()=>{ae();D();le();K=[0,1400,2600],He=14e3});var Ze=ge((ht,pe)=>{de();D();function Xe(e,t,n,r){return console.log("[Movix] Request: "+t+" "+e+" S"+n+"E"+r),he(e,t,n,r).then(function(i){return ie(i)}).then(function(i){return console.log("[Movix] Found "+i.length+" streams"),i}).catch(function(i){return console.error("[Movix] Error: "+(i?i.message:"unknown")),[]})}pe.exports={getStreams:Xe}});return Ze();})();

(function(api) {
    if (!api) return;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof exports !== 'undefined') exports.getStreams = api.getStreams;
    
    var g = (typeof globalThis !== 'undefined') ? globalThis : 
            (typeof global !== 'undefined') ? global : 
            (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : {};
            
    if (api.getStreams) g.getStreams = api.getStreams;
})(__provider);
