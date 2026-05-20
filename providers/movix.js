/**
 * movix - Built from src/movix/
 * Generated: 2026-05-20T16:17:04.82582476Z
 */
var __provider=(()=>{var c=(o,t)=>()=>(t||o((t={exports:{}}).exports,t),t.exports);var $=(o,t,e)=>new Promise((r,u)=>{var x=n=>{try{s(e.next(n))}catch(i){u(i)}},a=n=>{try{s(e.throw(n))}catch(i){u(i)}},s=n=>n.done?r(n.value):Promise.resolve(n.value).then(x,a);s((e=e.apply(o,t)).next())});var z=c((f,l)=>{function g(){}function m(o,t,e,r){return $(this,null,function*(){return console.log(`[Movix] Test: ${t} ${o} S${e}E${r}`),[{name:"Test",title:`[TEST] ${t==="movie"?"Movie":"TV"} - ${o} S${e}E${r}`,url:"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",quality:"1080p",headers:{"User-Agent":"Mozilla/5.0"}}]})}l.exports={getStreams:m,configureStreamConfig:g}});return z();})();

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
