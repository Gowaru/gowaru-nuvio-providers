/**
 * movix - Built from src/movix/
 * Generated: 2026-05-20T17:05:34.88573488Z
 */
var __provider=(()=>{var s=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports);var $=s((x,r)=>{function i(){}async function u(e,t,n,o){return console.log(`[Movix] Test: ${t} ${e} S${n}E${o}`),[{name:"Test",title:`[TEST] ${t==="movie"?"Movie":"TV"} - ${e} S${n}E${o}`,url:"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",quality:"1080p",headers:{"User-Agent":"Mozilla/5.0"}}]}r.exports={getStreams:u,configureStreamConfig:i}});return $();})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = __provider;
}
if (__provider && __provider.getStreams) {
    if (typeof globalThis !== 'undefined') {
        globalThis.getStreams = __provider.getStreams;
    }
    if (typeof global !== 'undefined') {
        global.getStreams = __provider.getStreams;
    }
    if (typeof self !== 'undefined') {
        self.getStreams = __provider.getStreams;
    }
}
