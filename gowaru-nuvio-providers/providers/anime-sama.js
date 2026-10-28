/**
 * anime-sama - Built from src/anime-sama/
 * Generated: 2026-10-28T04:19:12.342152315Z
 */
var __provider = (() => {
  var gb = Object.create;
  var Ha = Object.defineProperty,
    mb = Object.defineProperties,
    _b = Object.getOwnPropertyDescriptor,
    vb = Object.getOwnPropertyDescriptors,
    yb = Object.getOwnPropertyNames,
    Du = Object.getOwnPropertySymbols,
    Ab = Object.getPrototypeOf,
    Ga = Object.prototype.hasOwnProperty,
    Jf = Object.prototype.propertyIsEnumerable;
  var jf = (t, r, i) =>
      r in t
        ? Ha(t, r, { enumerable: !0, configurable: !0, writable: !0, value: i })
        : (t[r] = i),
    tt = (t, r) => {
      for (var i in r || (r = {})) Ga.call(r, i) && jf(t, i, r[i]);
      if (Du) for (var i of Du(r)) Jf.call(r, i) && jf(t, i, r[i]);
      return t;
    },
    wt = (t, r) => mb(t, vb(r));
  var bb = ((t) =>
    typeof require != "undefined"
      ? require
      : typeof Proxy != "undefined"
        ? new Proxy(t, {
            get: (r, i) => (typeof require != "undefined" ? require : r)[i],
          })
        : t)(function (t) {
    if (typeof require != "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + t + '" is not supported');
  });
  var Eu = (t, r) => {
    var i = {};
    for (var u in t) Ga.call(t, u) && r.indexOf(u) < 0 && (i[u] = t[u]);
    if (t != null && Du)
      for (var u of Du(t)) r.indexOf(u) < 0 && Jf.call(t, u) && (i[u] = t[u]);
    return i;
  };
  var Yn = (t, r) => () => (t && (r = t((t = 0))), r);
  var U = (t, r) => () => (r || t((r = { exports: {} }).exports, r), r.exports);
  var wb = (t, r, i, u) => {
    if ((r && typeof r == "object") || typeof r == "function")
      for (let a of yb(r))
        !Ga.call(t, a) &&
          a !== i &&
          Ha(t, a, {
            get: () => r[a],
            enumerable: !(u = _b(r, a)) || u.enumerable,
          });
    return t;
  };
  var Kf = (t, r, i) => (
    (i = t != null ? gb(Ab(t)) : {}),
    wb(
      r || !t || !t.__esModule
        ? Ha(i, "default", { value: t, enumerable: !0 })
        : i,
      t,
    )
  );
  var V = (t, r, i) =>
    new Promise((u, a) => {
      var c = (h) => {
          try {
            p(i.next(h));
          } catch (g) {
            a(g);
          }
        },
        l = (h) => {
          try {
            p(i.throw(h));
          } catch (g) {
            a(g);
          }
        },
        p = (h) => (h.done ? u(h.value) : Promise.resolve(h.value).then(c, l));
      p((i = i.apply(t, r)).next());
    });
  function Db(t) {
    return typeof t == "string" && t.endsWith(nh);
  }
  function Eb(t, r) {
    let i = "";
    try {
      i =
        (t &&
          t.headers &&
          typeof t.headers.get == "function" &&
          t.headers.get("content-type")) ||
        "";
    } catch (a) {
      i = "";
    }
    return /html/i.test(i)
      ? !0
      : !i || /text\/plain/i.test(i)
        ? /^\s*<(!doctype|html|\?xml|head|body)/i.test(r || "")
        : !1;
  }
  function Ka(t) {
    let r = Number(t) > 0 ? Number(t) : 0;
    if (Ja)
      return new Promise((u) => {
        setTimeout(u, r);
      });
    let i = Date.now() + r;
    return new Promise((u) => {
      let a = () => (Date.now() >= i ? u() : Promise.resolve().then(a));
      a();
    });
  }
  function Sb(t = 1e3, r = 0.3) {
    let i = new Map();
    return function (a) {
      return V(this, null, function* () {
        let c = Date.now(),
          l = i.get(a) || 0,
          p = c - l,
          h = t * r * (Math.random() * 2 - 1),
          g = Math.max(0, t + h - p);
        (g > 0 && (yield Ka(g)), i.set(a, Date.now()));
      });
    };
  }
  function ih(t = 200, r = 0.4) {
    return Sb(t, r);
  }
  function uh(t) {
    return Array.isArray(t)
      ? [...t].sort((r, i) => {
          let u = (a) => {
            let c = (
              (a.name || "") +
              " " +
              (a.title || "") +
              " " +
              (a.language || "")
            ).toUpperCase();
            return c.includes("VF") ||
              c.includes("FRENCH") ||
              c.includes("VFF") ||
              c.includes("VFQ")
              ? 0
              : c.includes("VOSTFR") ||
                  c.includes("VOST") ||
                  c.includes("MULTI")
                ? 1
                : c.includes("VO")
                  ? 2
                  : 3;
          };
          return u(r) - u(i);
        })
      : [];
  }
  function sh(t, r, i = {}) {
    let u = Fb(
        `NUVIO_TIMEOUT_${t.toUpperCase().replace(/[^a-z0-9]/g, "_")}`,
        i.timeout || 45e3,
      ),
      a = i.quality || { includeCodec: !0, includeFps: !1 },
      c = i.maxStreams || 80;
    return function (b, w, x, C) {
      return V(this, arguments, function* (p, h, g, _, v = {}) {
        let R = h === "movie" ? "" : ` S${g}E${_}`,
          T = `${t} ${h} ${p}${R}`,
          I = v && v.signal ? v.signal : null,
          { signal: G } = Tb(I);
        if (Xt(G)) return [];
        let M = Date.now();
        console.log(`[${t}] Request: ${T} (build ${Cb})`);
        try {
          let P = yield fn(r(p, h, g, _, { signal: G }), u, T),
            H = Array.isArray(P) ? P : [],
            O = M + Math.max(5e3, u - 5e3),
            ut = new Set(),
            lt = [];
          for (let ht of H) {
            if (!ht) continue;
            let _t = ht.url;
            if (typeof _t == "string") {
              if (!_t || _t.includes("[object")) continue;
              let Dt = `${_t}|${String(ht.language || "").toUpperCase()}`;
              if (ut.has(Dt)) continue;
              ut.add(Dt);
            }
            lt.push(ht);
          }
          let At = lt.slice(0, c * 2),
            Ft = yield Kb(At, wt(tt({}, a), { budgetDeadline: O })),
            gt = Date.now() - M;
          return (
            console.log(`[${t}] Done: ${Ft.length} streams in ${gt}ms`),
            Ft.slice(0, c)
          );
        } catch (P) {
          return (
            P && P.message && P.message.includes("[Timeout]")
              ? console.warn(`[${t}] ${P.message}`)
              : P && P.name === "AbortError"
                ? console.warn(`[${t}] Request aborted: ${T}`)
                : console.error(`[${t}] Error:`, (P && P.message) || P),
            []
          );
        }
      });
    };
  }
  function Tb(t) {
    let r = ah(),
      i = r ? r.signal : t;
    if (r && t && !t.aborted)
      try {
        typeof t.addEventListener == "function" &&
          t.addEventListener("abort", function () {
            try {
              r.abort();
            } catch (u) {}
          });
      } catch (u) {}
    return { signal: i, controller: r };
  }
  function Lb(t) {
    if (!t || t <= 0) return null;
    let r = t / (1024 * 1024 * 1024);
    if (r >= 1) return `${Math.round(r * 10) / 10} GB`;
    let i = t / (1024 * 1024);
    if (i >= 1) return `${Math.round(i * 10) / 10} MB`;
    let u = t / 1024;
    return `${Math.round(u)} KB`;
  }
  function qb(i) {
    return V(this, arguments, function* (t, r = {}) {
      if (!t || !Ja) return null;
      try {
        let u = yield nt(t, { method: "HEAD", headers: r, timeout: 5e3 });
        if (!u || !u.ok) return null;
        let a = _w(u.headers, "content-length");
        if (!a) return null;
        let c = Number(a);
        return !Number.isFinite(c) || c <= 0 ? null : Lb(c);
      } catch (u) {
        return null;
      }
    });
  }
  function ee(t, r) {
    return Date.now() - (t || 0) > (r || Bb);
  }
  function ah() {
    try {
      if (typeof AbortController != "undefined") return new AbortController();
    } catch (t) {}
    return null;
  }
  function Xt(t) {
    return t && (typeof t.aborted == "boolean" ? t.aborted : !1);
  }
  function Fb(t, r) {
    try {
      if (typeof process != "undefined" && process.env && process.env[t]) {
        let i = parseInt(process.env[t], 10);
        return isNaN(i) ? r : i;
      }
    } catch (i) {}
    return r;
  }
  function fn(t, r, i = "Operation") {
    return V(this, null, function* () {
      if (!r || r <= 0 || !Ja) return t;
      let u,
        a = new Promise((c, l) => {
          u = setTimeout(
            () => l(new Error(`[Timeout] ${i} exceeded ${r}ms`)),
            r,
          );
        });
      try {
        return yield Promise.race([t, a]);
      } finally {
        clearTimeout(u);
      }
    });
  }
  function Ce(t) {
    if (!t || typeof t != "string") return !0;
    let r = t.toLowerCase();
    return (
      r.includes("test-videos.co.uk") ||
      r.includes("big_buck_bunny") ||
      r.includes("bigbuckbunny") ||
      r.includes("sample-videos.com") ||
      r.includes("example.com") ||
      r.includes("localhost") ||
      r.includes("/troll/master.m3u8")
    );
  }
  function Rb(t) {
    if (!t || typeof t != "string") return !1;
    let r = t.toLowerCase();
    return Ce(r)
      ? !1
      : /\.(mp4|m3u8|mkv|webm|mpd)(\?.*)?$/.test(r) ||
          r.includes("/hls2/") ||
          r.includes("/master.m3u8");
  }
  function oh(t) {
    if (!Number.isFinite(t) || t <= 0) return Su;
    let r = xu[0],
      i = Math.abs(t - r);
    for (let u of xu) {
      let a = Math.abs(t - u);
      a < i && ((i = a), (r = u));
    }
    return r;
  }
  function Ee(t) {
    let r = String(t || "")
      .trim()
      .toLowerCase();
    if (!r) return `${Su}p`;
    if (r === "4k" || r === "uhd" || r.includes("2160")) return "2160p";
    if (r.includes("fhd") || r.includes("fullhd") || r.includes("1080"))
      return "1080p";
    if (r.includes("hd") || r.includes("720")) return "720p";
    let i = r.match(/(\d{3,4})\s*p?/i);
    return i ? `${oh(Number(i[1]))}p` : `${Su}p`;
  }
  function Ob(t) {
    if (!t || typeof t != "string") return { video: null, audio: null };
    let r = t.split(",").map((a) => a.trim()),
      i = null,
      u = null;
    for (let a of r) {
      let c = a.split(".")[0].toLowerCase(),
        l = Ib[c];
      l &&
        (["H.264", "H.265", "AV1", "VP9"].includes(l)
          ? i || (i = { codec: l, raw: a })
          : ["AAC", "AC3", "EAC3", "Opus"].includes(l) &&
            (u || (u = { codec: l, raw: a })));
    }
    return { video: i, audio: u };
  }
  function Nb(t) {
    let r = ch.get(t);
    return r && Date.now() - r.ts < Mb ? r.data : null;
  }
  function kb(t, r) {
    ch.set(t, { data: r, ts: Date.now() });
  }
  function Pb(t) {
    let r = Zn.get(t);
    return r && Date.now() - r.ts < Ub ? r.data : null;
  }
  function $b(t, r) {
    if (Zn.size >= 300) {
      let i = Math.ceil(60),
        u = [...Zn.entries()].sort((a, c) => a[1].ts - c[1].ts).slice(0, i);
      for (let [a] of u) Zn.delete(a);
    }
    Zn.set(t, { data: r, ts: Date.now() });
  }
  function Tu(t) {
    let i = Ee(t)
        .toLowerCase()
        .match(/(\d{3,4})p/),
      u = i ? Number(i[1]) : Su,
      a = oh(u);
    return xu.length - 1 - xu.indexOf(a);
  }
  function Hb(t, r, i, u) {
    let a = [],
      c = Ee(r);
    return (
      c && !(t || "").includes(c) && a.push(c),
      i && i !== "H.264" && a.push(i),
      u && u > 30 && a.push(`${u}fps`),
      a.length === 0 ? t : `${t} [${a.join(" ")}]`
    );
  }
  function ja(t) {
    if (!t || typeof t != "string") return null;
    let r = t.toLowerCase();
    return r.includes(".m3u8") ||
      r.includes("/hls/") ||
      r.includes("/hls2/") ||
      r.includes("master.m3u8") ||
      r.includes("playlist.m3u8")
      ? "hls"
      : r.includes(".mpd")
        ? "dash"
        : /[?&]format=hls\b/.test(r) || /\/v1\/(anime|tv|movie)\?/.test(r)
          ? "hls"
          : r.includes(".mp4")
            ? "mp4"
            : r.includes(".mkv")
              ? "mkv"
              : r.includes(".webm")
                ? "webm"
                : r.includes(".ts") &&
                    !r.includes("test") &&
                    !r.includes("textures")
                  ? "hls"
                  : null;
  }
  function Gb(t) {
    let r = Ee(t.quality || "HD"),
      i = [r];
    if (t.codec) {
      let u = String(t.codec).toUpperCase();
      u && !r.toUpperCase().includes(u) && i.push(u);
    }
    if (t.audioCodec) {
      let u = String(t.audioCodec).toUpperCase();
      u && !i.some((a) => a.toUpperCase() === u) && i.push(u);
    }
    return i.join(" ");
  }
  function Vb(t, r) {
    if (!t) return t;
    let i = [];
    return (
      r.codec && i.push(String(r.codec).toUpperCase()),
      r.audioCodec && i.push(String(r.audioCodec).toUpperCase()),
      i.length === 0 ? t : `${t} ${i.join(" ")}`
    );
  }
  function lh(t) {
    if (!t) return null;
    let r = String(t).trim().toUpperCase();
    return r ? (Yf[r] ? Yf[r] : r.toLowerCase()) : null;
  }
  function Zf(t) {
    if (t.language) return t.language;
    let i = (t.name || "").match(/\((\w+)\)/);
    if (i) {
      let u = i[1].toUpperCase();
      if (["VF", "VOSTFR", "VO", "VOSTF", "VOA", "VOST"].includes(u)) return u;
    }
    return null;
  }
  function Qf(i) {
    return V(this, arguments, function* (t, r = {}) {
      var x, C, R, T, I, G, M;
      if (!t || !t.url || typeof t.url != "string") return [];
      let u = t.url,
        a = u.toLowerCase();
      if (!a.includes(".m3u8") && !a.includes("/hls/"))
        return [wt(tt({}, t), { quality: Ee(t.quality || "HD"), type: ja(u) })];
      let c = u;
      if (!r.forceRefresh) {
        let P = Nb(c);
        if (P) return P;
      }
      let l = null;
      try {
        l = yield fn(
          nt(u, {
            headers: t.headers || {},
            timeout: r.manifestTimeout || 12e3,
          }),
          r.manifestTimeout || 12e3,
          "manifest-parse",
        );
      } catch (P) {
        l = null;
      }
      if (!l)
        return [wt(tt({}, t), { quality: Ee(t.quality || "HD"), type: "hls" })];
      let p = yield l.text();
      if (l.truncated || Db(p))
        return [wt(tt({}, t), { quality: Ee(t.quality || "HD"), type: "hls" })];
      if (!/#EXT-X-STREAM-INF/i.test(p))
        return [wt(tt({}, t), { quality: Ee(t.quality || "HD"), type: "hls" })];
      let h = p
          .split(/\r?\n/)
          .map((P) => P.trim())
          .filter(Boolean),
        g = [];
      for (let P = 0; P < h.length; P++) {
        let H = h[P];
        if (!H.startsWith("#EXT-X-STREAM-INF:")) continue;
        let O = h[P + 1];
        if (!O || O.startsWith("#")) continue;
        let ut = (x = H.match(/RESOLUTION=\d+x(\d+)/i)) == null ? void 0 : x[1],
          lt = (C = H.match(/FRAME-RATE=([0-9.]+)/i)) == null ? void 0 : C[1],
          At = (R = H.match(/BANDWIDTH=(\d+)/i)) == null ? void 0 : R[1],
          Ft = (T = H.match(/CODECS="([^"]+)"/i)) == null ? void 0 : T[1],
          gt = ut ? `${ut}p` : null;
        if (!gt && At) {
          let ot = Number(At);
          ot >= 8e6
            ? (gt = "2160p")
            : ot >= 5e6
              ? (gt = "1080p")
              : ot >= 25e5
                ? (gt = "720p")
                : ot >= 12e5
                  ? (gt = "480p")
                  : (gt = "360p");
        }
        !gt && lt && (gt = `${Ee(t.quality || "HD")}`);
        let ht = Ob(Ft),
          _t = lt ? Math.round(parseFloat(lt)) : null,
          Dt = O;
        try {
          Dt = new URL(O, u).toString();
        } catch (ot) {}
        g.push(
          wt(tt({}, t), {
            url: Dt,
            quality: Ee(gt || t.quality || "HD"),
            type: "hls",
            codec: ((I = ht.video) == null ? void 0 : I.codec) || null,
            audioCodec: ((G = ht.audio) == null ? void 0 : G.codec) || null,
            fps: _t,
            bandwidth: At ? parseInt(At) : null,
            title: Hb(
              t.title || t.name || "Stream",
              gt || t.quality || "HD",
              r.includeCodec !== !1
                ? (M = ht.video) == null
                  ? void 0
                  : M.codec
                : null,
              r.includeFps !== !1 ? _t : null,
            ),
          }),
        );
      }
      if (g.length === 0)
        return [wt(tt({}, t), { quality: Ee(t.quality || "HD"), type: "hls" })];
      let _ = [],
        v = new Set();
      for (let P of g) v.has(P.url) || (v.add(P.url), _.push(P));
      _.sort((P, H) => Tu(H.quality) - Tu(P.quality));
      let b = r.maxVariants || _.length,
        w = _.slice(0, b);
      return (kb(c, w), w);
    });
  }
  function Wb(t, r) {
    if (!r || !t.length) return t;
    let i = r.toUpperCase();
    return t.some((a) => {
      var c;
      return ((c = a.codec) == null ? void 0 : c.toUpperCase()) === i;
    })
      ? t.filter((a) => {
          var c;
          return ((c = a.codec) == null ? void 0 : c.toUpperCase()) === i;
        })
      : t;
  }
  function zb(t) {
    return [...t].sort((r, i) => {
      let u = Tu(i.quality) - Tu(r.quality);
      if (u !== 0) return u;
      if (r.codec && i.codec) {
        let a = (c) => (Xf.indexOf(c) >= 0 ? Xf.indexOf(c) : 99);
        return a(r.codec) - a(i.codec);
      }
      return 0;
    });
  }
  function th(t) {
    let r = Number(t && t.budgetDeadline);
    return r > 0 && Date.now() > r;
  }
  function Kb(i) {
    return V(this, arguments, function* (t, r = {}) {
      let u = Array.isArray(t) ? t : [],
        a = [],
        c =
          Number(r.maxManifestFetches) > 0 ? Number(r.maxManifestFetches) : jb,
        l = r.skipManifestExpansion === !0,
        p = 0,
        h = yield Promise.allSettled(
          u.map((C) => {
            let T = (C && typeof C.url == "string" ? C.url : "").toLowerCase();
            return T.includes(".m3u8") || T.includes("/hls/")
              ? l || th(r) || p >= c
                ? Promise.resolve([
                    wt(tt({}, C), {
                      quality: Ee((C && C.quality) || "HD"),
                      type: "hls",
                    }),
                  ])
                : (p++, Qf(C, r))
              : Qf(C, r);
          }),
        );
      for (let C = 0; C < h.length; C++) {
        let R = h[C],
          T = u[C];
        if (R.status === "fulfilled") for (let I of R.value) a.push(I);
        else
          T &&
            a.push(
              wt(tt({}, T), {
                quality: Ee(T.quality || "HD"),
                type: ja(T.url),
              }),
            );
      }
      let g = [],
        _ = new Set();
      for (let C of a) {
        if (!(C != null && C.url) || Ce(C.url)) continue;
        let R = C.language || Zf(C) || "",
          T = `${C.url}|${String(R).toUpperCase()}`;
        _.has(T) || (_.add(T), g.push(C));
      }
      let v = zb(g);
      v = v.map((C) => {
        let R = Zf(C) || C.language || null,
          T = lh(R),
          I = C.title || C.name,
          G = C.title;
        R &&
          T &&
          I &&
          String(R).toUpperCase() !== T.toUpperCase() &&
          !I.toUpperCase().includes(String(R).toUpperCase()) &&
          (G = `${I} [${String(R).toUpperCase()}]`);
        let M = Gb(C);
        return wt(
          tt(
            tt(tt({}, C), G !== C.title ? { title: G } : {}),
            M !== C.quality ? { quality: M } : {},
          ),
          { type: C.type || ja(C.url), language: T },
        );
      });
      let b = /\.(mp4|mkv|webm)(\?.*)?$/i,
        x =
          r.sizeProbe !== !1 && !th(r)
            ? v.filter((C) => !C.size && C.url && b.test(C.url)).slice(0, Jb)
            : [];
      if (x.length > 0) {
        let C = yield Promise.allSettled(x.map((R) => qb(R.url, R.headers)));
        for (let R = 0; R < x.length; R++) {
          let T = C[R].status === "fulfilled" ? C[R].value : null;
          T && (x[R].size = Vb(T, x[R]));
        }
      }
      return r.preferredCodec ? Wb(v, r.preferredCodec) : v;
    });
  }
  function nt(i) {
    return V(this, arguments, function* (t, r = {}) {
      let u = Date.now(),
        a = 15e3,
        c = (r.method || "GET").toUpperCase(),
        l = "";
      if (r.headers && typeof r.headers == "object") {
        let g = Object.keys(r.headers).sort();
        g.length &&
          (l =
            "|" +
            g
              .map(
                (_) =>
                  `${_.toLowerCase()}=${String(r.headers[_]).slice(0, 80)}`,
              )
              .join("&"));
      }
      let p = c + "|" + t + l;
      if (c === "GET") {
        let g = Pb(p);
        if (g)
          return {
            text: () => Promise.resolve(g.bodyText),
            json: () =>
              V(null, null, function* () {
                try {
                  return JSON.parse(g.bodyText);
                } catch (_) {
                  throw _;
                }
              }),
            ok: g.ok,
            status: g.status,
            url: g.finalUrl || t,
            headers: g.headers || {},
            truncated: !1,
          };
      }
      try {
        let h = r,
          { timeout: g, signal: _ } = h,
          v = Eu(h, ["timeout", "signal"]),
          b = g > 0 ? g : Xb;
        if (Xt(_)) return null;
        let w = wt(tt({}, v), {
            headers: tt(tt({}, Lu), v.headers),
            redirect: "follow",
          }),
          x =
            typeof AbortSignal != "undefined" &&
            typeof AbortSignal.timeout != "undefined";
        if (b > 0 && x) {
          let M = AbortSignal.timeout(b);
          if (_) {
            let P = ah();
            if (P) {
              w.signal = P.signal;
              let H = () => {
                P.abort();
              };
              try {
                _.addEventListener("abort", H);
              } catch (O) {}
              try {
                M.addEventListener("abort", H);
              } catch (O) {}
            } else w.signal = _;
          } else w.signal = M;
        } else _ && (w.signal = _);
        let C = yield fetch(t, w),
          R = Date.now() - u;
        if (
          (R > a &&
            console.warn(
              `[safeFetch] Slow request (${R}ms): ${(t || "").slice(0, 120)}`,
            ),
          !C)
        )
          return null;
        let T = C.status;
        if (T === 0) return null;
        let I = "",
          G = !1;
        try {
          let M = yield C.text();
          M && M.endsWith(nh)
            ? ((G = !0), (I = M))
            : M && M.length >= 1048576
              ? ((G = !0),
                console.warn(
                  `[safeFetch] Response truncated (${M.length} bytes > 1048576): ${(t || "").slice(0, 100)}`,
                ),
                (I = M.slice(0, 1048576)))
              : (I = M || "");
        } catch (M) {
          I = "";
        }
        return G && Eb(C, I)
          ? (console.warn(
              `[safeFetch] HTML body truncated \u2192 refusing partial parse: ${(t || "").slice(0, 100)}`,
            ),
            null)
          : (c === "GET" &&
              T >= 200 &&
              T < 300 &&
              !G &&
              $b(p, {
                bodyText: I,
                ok: !0,
                status: T,
                finalUrl: C.url,
                headers: C.headers,
              }),
            {
              text: () => Promise.resolve(I),
              json: () =>
                V(null, null, function* () {
                  try {
                    return JSON.parse(I);
                  } catch (M) {
                    throw M;
                  }
                }),
              ok: C.ok,
              status: T,
              url: C.url,
              headers: C.headers,
              truncated: G,
            });
      } catch (g) {
        let _ = Date.now() - u;
        return (
          _ > a &&
            console.warn(
              `[safeFetch] Slow request failed (${_}ms): ${(t || "").slice(0, 120)}`,
            ),
          null
        );
      }
    });
  }
  function Kt(t) {
    try {
      if (!t.includes("p,a,c,k,e,d")) return t;
      let r = (c) => {
          let l = [],
            p = 0;
          for (;;) {
            let h = c.indexOf("eval(function(p,a,c,k,e,d)", p);
            if (h === -1) break;
            let g = h,
              _ = 0,
              v = !1,
              b = !1,
              w = !1;
            for (; g < c.length; g++) {
              let x = c[g];
              if (w) {
                w = !1;
                continue;
              }
              if (x === "\\") {
                w = !0;
                continue;
              }
              if (
                (!b && x === "'" ? (v = !v) : !v && x === '"' && (b = !b),
                !(v || b))
              ) {
                if (x === "(") _++;
                else if (x === ")" && (_--, _ === 0)) {
                  g++;
                  break;
                }
              }
            }
            (g > h && l.push(c.slice(h, g)), (p = g));
          }
          return l;
        },
        i = (c) => {
          let l = (H, O) => {
              let ut = H[O];
              if (ut !== "'" && ut !== '"') return null;
              let lt = O + 1,
                At = "",
                Ft = !1;
              for (; lt < H.length; lt++) {
                let gt = H[lt];
                if (Ft) {
                  ((At += gt), (Ft = !1));
                  continue;
                }
                if (gt === "\\") {
                  Ft = !0;
                  continue;
                }
                if (gt === ut) return { value: At, end: lt + 1 };
                At += gt;
              }
              return null;
            },
            p = (H, O) => {
              for (; O < H.length && /\s/.test(H[O]);) O++;
              return O;
            },
            h = (H, O) => {
              O = p(H, O);
              let ut = H.slice(O).match(/^\d+/);
              return ut
                ? { value: parseInt(ut[0], 10), end: O + ut[0].length }
                : null;
            },
            g = c.indexOf("}(");
          if (g === -1) return null;
          let _ = g + 2;
          _ = p(c, _);
          let v = l(c, _);
          if (!v) return null;
          let b = v.value;
          if (((_ = p(c, v.end)), c[_] !== ",")) return null;
          let w = h(c, _ + 1);
          if (!w) return null;
          let x = w.value;
          if (((_ = p(c, w.end)), c[_] !== ",")) return null;
          let C = h(c, _ + 1);
          if (!C) return null;
          let R = C.value;
          if (((_ = p(c, C.end)), c[_] !== ",")) return null;
          let T = l(c, p(c, _ + 1));
          if (!T) return null;
          let I = c.slice(T.end, T.end + 20);
          if (!/\.split\(\s*['"]\|['"]\s*\)/.test(I)) return null;
          let G = T.value.split("|"),
            M = (H) =>
              (H < x ? "" : M(parseInt(H / x, 10))) +
              ((H = H % x) > 35 ? String.fromCharCode(H + 29) : H.toString(36)),
            P = {};
          for (; R--;) P[M(R)] = G[R] || M(R);
          return b.replace(/\b\w+\b/g, (H) => P[H] || H);
        },
        u = t,
        a = r(t);
      for (let c of a)
        try {
          let l = i(c);
          l && (u = u.replace(c, l));
        } catch (l) {}
      return u;
    } catch (r) {
      return t;
    }
  }
  function Yb(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t, {
          headers: { Referer: "https://video.sibnet.ru/" },
        });
        if (!r) return { url: t };
        let i = yield r.text(),
          u = null,
          a = i.match(/file\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i);
        if ((a && (u = a[1]), !u)) {
          let c = i.match(/src\s*:\s*["']([^"']*\.mp4[^"']*)['"]/i);
          c && (u = c[1]);
        }
        if (!u) {
          let c = i.match(
            /player\.src\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+\.mp4[^"']*)['"]/i,
          );
          c && (u = c[1]);
        }
        if (!u) {
          let c = i.match(/["']((?:https?:)?\/\/[^"'\s]+\.mp4[^"'\s]*)["']/i);
          c && (u = c[1]);
        }
        if (!u) return { url: t };
        u.startsWith("//")
          ? (u = "https:" + u)
          : u.startsWith("/") && (u = "https://video.sibnet.ru" + u);
        try {
          let c = yield nt(u, {
            method: "HEAD",
            headers: { Referer: "https://video.sibnet.ru/" },
            timeout: 5e3,
          });
          c && c.url && c.url !== u && c.url.includes(".mp4") && (u = c.url);
        } catch (c) {}
        return { url: u, headers: { Referer: "https://video.sibnet.ru/" } };
      } catch (r) {}
      return { url: t };
    });
  }
  function Zb(t) {
    return V(this, null, function* () {
      var r, i;
      try {
        let u =
            ((r = t.match(/^https?:\/\/([^/]+)/)) == null ? void 0 : r[1]) ||
            "",
          a = u ? `https://${u}/` : "https://vidmoly.biz/",
          c = ["biz", "net", "ru", "is", "to"],
          l = [t];
        for (let h of c) {
          let g = t.replace(/vidmoly\.(net|to|ru|is|biz|me)/, `vidmoly.${h}`);
          g !== t && l.push(g);
        }
        let p = [...new Set(l)].slice(0, 4);
        for (let h of p)
          try {
            let g =
                ((i = h.match(/^https?:\/\/([^/]+)/)) == null
                  ? void 0
                  : i[1]) || "",
              _ = g ? `https://${g}/` : a,
              v = yield nt(h, { headers: { Referer: _, Origin: _ } });
            if (!v || !v.ok) continue;
            let b = (T, I) => {
                var M;
                let G =
                  (T &&
                    T.url &&
                    ((M = T.url.match(/^https?:\/\/([^/]+)/)) == null
                      ? void 0
                      : M[1])) ||
                  "";
                return G ? `https://${G}/` : I;
              },
              w = yield v.text(),
              x = /window\.location\.replace/.test(w);
            if ((w.length < 500 && !x) || w.includes("finisheddaysflamboyant"))
              continue;
            (w.includes("p,a,c,k,e,d") || w.includes("eval(function")) &&
              (w = Kt(w));
            let C =
              w.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
              w.match(
                /sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i,
              ) ||
              w.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
            if (C) {
              let T = b(v, _);
              return { url: C[1], headers: { Referer: T, Origin: T } };
            }
            let R =
              w.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/) ||
              w.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
            if (
              R &&
              R[1] !== h &&
              ((v = yield nt(R[1], { headers: { Referer: _, Origin: _ } })), v)
            ) {
              ((w = yield v.text()),
                (w.includes("p,a,c,k,e,d") || w.includes("eval(function")) &&
                  (w = Kt(w)));
              let T =
                w.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                w.match(
                  /sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i,
                ) ||
                w.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
              if (T) {
                let I = b(v, _);
                return { url: T[1], headers: { Referer: I, Origin: I } };
              }
            }
          } catch (g) {}
      } catch (u) {}
      return { url: t };
    });
  }
  function Qb(t) {
    return V(this, null, function* () {
      var r;
      try {
        let i = (r = t.match(/\/video\/embed\/(\d+)/)) == null ? void 0 : r[1];
        if (!i) return { url: t };
        let u = `https://my.mail.ru/+/video/meta/${i}`,
          a = yield nt(u, {
            headers: { Referer: t, Accept: "application/json" },
          });
        if (!a || !a.ok) return { url: t };
        let c = null;
        try {
          c = JSON.parse(yield a.text());
        } catch (_) {
          return { url: t };
        }
        let h = [
          ...(Array.isArray(c == null ? void 0 : c.videos) ? c.videos : []),
        ]
          .sort(
            (_, v) => (parseInt(v.key, 10) || 0) - (parseInt(_.key, 10) || 0),
          )
          .find((_) => _ && _.url);
        return h
          ? {
              url: h.url.startsWith("//") ? "https:" + h.url : h.url,
              headers: { Referer: "https://my.mail.ru/" },
              quality: h.key || void 0,
            }
          : { url: t };
      } catch (i) {}
      return { url: t };
    });
  }
  function tw(t) {
    return V(this, null, function* () {
      var b;
      let r = t.replace(/^https?:\/\/[^/]+/, ""),
        i =
          ((b = t.match(/^https?:\/\/([^/]+)/)) == null ? void 0 : b[1]) ||
          "uqload.co",
        u = [i];
      (i.endsWith(".bz") && u.push("uqload.co", "uqload.to"),
        i.endsWith(".to") && u.push("uqload.co"),
        i.endsWith(".cx") && u.push("uqload.co", "uqload.vc"));
      let a = [...new Set(u)],
        c = [
          "file is no longer available",
          "expired or has been deleted",
          "file no longer exists",
        ],
        l = (w) => {
          let x = w.toLowerCase();
          return c.some((C) => x.includes(C));
        },
        p = (w) => w.length < 200 && /restricted for this domain/i.test(w),
        h = 0,
        g = 0,
        _ = [`https://${a[0]}/`, "https://lecteurvideo.com/", ""],
        v = (w) =>
          w.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) ||
          w.match(
            /sources\s*:\s*\[[^\]]*?\{[^}]*?file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
          ) ||
          w.match(/sources\s*:\s*\[["']([^"']+\.(?:mp4|m3u8)[^"']*)["']\]/i) ||
          w.match(/["'](https?:\/\/[^"']*\/hls\d?\/[^"']*\.m3u8[^"']*)["']/i) ||
          w.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
      for (let w of a) {
        let x = `https://${w}${r}`;
        for (let C of _)
          try {
            let R = tt({}, Lu);
            C && (R.Referer = C);
            let T = yield nt(x, { headers: R });
            if (!T) continue;
            let I = yield T.text();
            if (l(I))
              return (
                console.warn(
                  `[Resolver] uqload embed dead (expired/deleted): ${t.slice(0, 80)}`,
                ),
                { url: t, isDead: !0 }
              );
            if ((h++, p(I))) {
              g++;
              continue;
            }
            if (
              !I.includes("p,a,c,k,e,d") &&
              !I.includes("eval(function") &&
              !v(I)
            )
              continue;
            (I.includes("p,a,c,k,e,d") || I.includes("eval(function")) &&
              (I = Kt(I));
            let G = v(I);
            if (G) {
              let M = { Referer: `https://${w}/` };
              return { url: G[1], headers: M };
            }
          } catch (R) {}
      }
      return h > 0 && g === h
        ? (console.warn(
            `[Resolver] uqload embed dead (restricted on all referers): ${t.slice(0, 80)}`,
          ),
          { url: t, isDead: !0 })
        : { url: t };
    });
  }
  function ew(t) {
    if (!t || t.indexOf("application/json") < 0) return null;
    let r = t.match(
      /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/,
    );
    if (!r) return null;
    let i = null;
    try {
      let c = JSON.parse(r[1]);
      Array.isArray(c) && typeof c[0] == "string"
        ? (i = c[0])
        : typeof c == "string" && (i = c);
    } catch (c) {
      return null;
    }
    if (!i) return null;
    let u = (c) => {
        let l = String(c || "").replace(/[^A-Za-z0-9+/=]/g, ""),
          p = l.length % 4,
          h = p ? l + "=".repeat(4 - p) : l;
        return Xa(h);
      },
      a = (c) =>
        c.replace(/[a-zA-Z]/g, (l) => {
          let p = l <= "Z" ? 65 : 97;
          return String.fromCharCode(((l.charCodeAt(0) - p + 13) % 26) + p);
        });
    try {
      let c = a(i);
      c = u(c);
      let l = "";
      for (let _ = 0; _ < c.length; _++)
        l += String.fromCharCode(c.charCodeAt(_) - 3);
      let p = l.split("").reverse().join(""),
        h = u(p),
        g = JSON.parse(h);
      if (
        g &&
        typeof g == "object" &&
        typeof g.source == "string" &&
        /^https?:\/\//.test(g.source)
      )
        return g;
    } catch (c) {}
    return null;
  }
  function eh(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t);
        if (!r) return { url: t };
        let i = yield r.text();
        if (i.includes('<div id="root">') && i.includes("/assets/index-"))
          return { url: t };
        let u = t;
        for (let l = 0; l < 3; l++) {
          let p = i.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
          if (!p || p[1] === u) break;
          u = p[1];
          let h = yield nt(u);
          if (!h) break;
          i = yield h.text();
        }
        let a = ew(i);
        if (a) {
          let l = String(a.direct_access_url || ""),
            h = String(a.source || "") || l;
          if (h && !Ce(h)) return { url: h, headers: { Referer: u + "/" } };
          if (l && !Ce(l)) return { url: l, headers: { Referer: u + "/" } };
        }
        (i.includes("p,a,c,k,e,d") || i.includes("eval(function")) &&
          (i = Kt(i));
        let c =
          i.match(/'hls'\s*:\s*'([^']+)'/) ||
          i.match(/"hls"\s*:\s*"([^"]+)"/) ||
          i.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
          i.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
          i.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
        if (c) {
          let l = c[1] || c[0];
          return (
            l.includes("base64") && (l = Xa(l.split(",")[1] || l)),
            l.includes("test-videos.co.uk") || Ce(l)
              ? { url: t }
              : { url: l, headers: { Referer: u } }
          );
        }
      } catch (r) {}
      return { url: t };
    });
  }
  function rw(t) {
    return V(this, null, function* () {
      try {
        let r = (t.match(/^https?:\/\/([^/]+)/) || [])[1] || "",
          i = r ? `https://${r}/` : "https://fsvid.lol/",
          u = yield nt(t, { headers: { Referer: i } });
        if (!u) return { url: t };
        let a = yield u.text();
        (a.includes("p,a,c,k,e,d") || a.includes("eval(function")) &&
          (a = Kt(a));
        let c = null,
          l = r ? r.split("/")[0] : (i.split("//")[1] || "").replace(/\//g, ""),
          p = a.match(/\}\)\(["']([A-Za-z0-9+/=_-]{50,})["']\)/);
        if (p && a.includes("reverse().join")) {
          let g = p[1].replace(/-/g, "+").replace(/_/g, "/"),
            _ = "";
          try {
            _ = atob(g);
          } catch (v) {}
          if (_) {
            let v = 0;
            for (let w = 0; w < l.length; w++) v = (v + l.charCodeAt(w)) & 255;
            let b = _.split("").reverse().join("");
            for (let w = 0; w < 256; w++) {
              let x = "";
              for (let C = 0; C < b.length; C++) {
                let R = (61 + C * 89 + v + w) & 255;
                x += String.fromCharCode(b.charCodeAt(C) ^ R);
              }
              if (
                /^https?:\/\//.test(x) &&
                x.includes(".m3u8") &&
                !x.includes("/troll/")
              ) {
                c = x;
                break;
              }
            }
          }
        }
        if (!c) {
          let g =
              /(?:var|let|const)\s*k=\[([0-9,\s]+)\],b=atob\(s\)[\s\S]*?return\s+\w+\}\)\(["']([A-Za-z0-9+/=_-]+)["']\)/g,
            _;
          for (; (_ = g.exec(a)) !== null;) {
            let v = _[1].split(",").map((C) => parseInt(C, 10)),
              b = _[2].replace(/-/g, "+").replace(/_/g, "/"),
              w = "";
            try {
              w = atob(b);
            } catch (C) {
              continue;
            }
            let x = "";
            for (let C = 0; C < w.length; C++)
              x += String.fromCharCode(w.charCodeAt(C) ^ v[C % v.length]);
            if (
              x.startsWith("http") &&
              x.includes(".m3u8") &&
              !x.includes("/troll/")
            ) {
              c = x;
              break;
            }
          }
        }
        if (!c) return { url: t };
        let h = t.includes("vidzy")
          ? "https://vidzy.live/"
          : "https://fsvid.lol/";
        return { url: c, headers: { Referer: h } };
      } catch (r) {}
      return { url: t };
    });
  }
  function nw(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t);
        if (!r) return { url: t };
        let i = yield r.text();
        i.includes("p,a,c,k,e,d") && (i = Kt(i));
        let u = i.match(
          /robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*([^;]+)/,
        );
        if (u) {
          let a = "https:" + u[1],
            c = u[2].split("+");
          for (let l of c) {
            let p = l.match(/['"]([^'"]+)['"]/);
            if (p) {
              let h = p[1],
                g = l.match(/substring\((\d+)\)/);
              (g && (h = h.substring(parseInt(g[1]))), (a += h));
            }
          }
          return { url: a, headers: { Referer: "https://streamtape.com/" } };
        }
      } catch (r) {}
      return { url: t };
    });
  }
  function iw(t) {
    return V(this, null, function* () {
      try {
        if (t.includes("daisukianime")) {
          let c = t.match(/[?&]id=([a-z0-9]+)/i);
          c && (t = `https://sendvid.com/embed/${c[1]}`);
        }
        let r = t.includes("/embed/")
            ? t
            : t.replace(/sendvid\.com\/([a-z0-9]+)/i, "sendvid.com/embed/$1"),
          i = yield nt(r, { headers: { Referer: "https://sendvid.com/" } });
        if (!i) return { url: t };
        if (i.status === 502 || i.status === 503)
          return (
            console.warn(
              `[Sendvid] Service temporarily unavailable (${i.status}): ${r.slice(0, 60)}`,
            ),
            { url: r, isDirect: !1 }
          );
        let u = yield i.text(),
          a =
            u.match(/video_source\s*:\s*["']([^"']+\.mp4[^"']*)["|']/) ||
            u.match(/source\s+src=["']([^"']+\.mp4[^"']*)["|']/) ||
            u.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/) ||
            u.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["|']/) ||
            u.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
        if (a)
          return { url: a[1], headers: { Referer: "https://sendvid.com/" } };
      } catch (r) {}
      return { url: t };
    });
  }
  function uw(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t);
        if (!r) return { url: t };
        let i = yield r.text();
        i.includes("p,a,c,k,e,d") && (i = Kt(i));
        let u =
          i.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/) ||
          i.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/);
        if (u) {
          let a = u[1];
          return (
            a.includes("base64") && (a = Xa(a.split(",")[1] || a)),
            { url: a, headers: { Referer: t } }
          );
        }
      } catch (r) {}
      return { url: t };
    });
  }
  function sw(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t);
        if (!r) return { url: t };
        let u = (yield r.text()).match(
          /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/,
        );
        if (u) return { url: u[1], headers: { Referer: t } };
      } catch (r) {}
      return { url: t };
    });
  }
  function aw(t) {
    return V(this, null, function* () {
      var r, i;
      try {
        let u =
            ((r = t.match(/https?:\/\/([^\/]+)/)) == null ? void 0 : r[1]) ||
            "dood.to",
          a = t,
          c = yield nt(a);
        if (!c) return { url: t };
        let l = c.url || a,
          p =
            ((i = l.match(/https?:\/\/([^\/]+)/)) == null ? void 0 : i[1]) || u,
          h = yield c.text();
        (p !== u && (a = l),
          (c = null),
          h.includes("eval(function(p,a,c,k,e,d)") && (h = Kt(h)));
        let g =
          h.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/) ||
          h.match(/pass_md5\/([^'"\s]+)['"]/);
        if (g) {
          let _ = g[1],
            v = `https://${p}/pass_md5/${_}`,
            b = yield nt(v, { headers: { Referer: a } });
          if (b && b.ok) {
            let w = yield b.text(),
              x = Math.random().toString(36).substring(2, 12);
            return {
              url: w + x + "?token=" + _ + "&expiry=" + Date.now(),
              headers: { Referer: `https://${p}/` },
            };
          }
        }
      } catch (u) {}
      return { url: t };
    });
  }
  function ow(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t, { headers: { Referer: "https://www.myvi.ru/" } });
        if (!r) return { url: t };
        let i = yield r.text();
        i.includes("eval(function(p,a,c,k,e,d)") && (i = Kt(i));
        let u =
          i.match(
            /["'](?:file|src|url|stream_url)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/,
          ) ||
          i.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/) ||
          i.match(/source\s+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)/);
        if (u)
          return { url: u[1], headers: { Referer: "https://www.myvi.ru/" } };
        let a = t.match(/\/(?:embed\/|watch\/|video\/)([a-zA-Z0-9_-]+)/);
        if (a) {
          let c = `https://www.myvi.ru/api/video/${a[1]}`,
            l = yield nt(c, { headers: { Referer: t } });
          if (l) {
            let h = (yield l.text()).match(
              /["'](?:url|src|file)["']\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/,
            );
            if (h)
              return {
                url: h[1],
                headers: { Referer: "https://www.myvi.ru/" },
              };
          }
        }
      } catch (r) {}
      return { url: t };
    });
  }
  function cw(t) {
    return V(this, null, function* () {
      var r;
      try {
        let i =
            ((r = t.match(/^https?:\/\/[^/]+/)) == null ? void 0 : r[0]) ||
            "https://younetu.org",
          u = yield nt(t, { headers: { Referer: i + "/" } });
        if (!u) return { url: t };
        let a = yield u.text();
        (a.includes("p,a,c,k,e,d") || a.includes("eval(function")) &&
          (a = Kt(a));
        let c =
          a.match(/src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
          a.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
          a.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
          a.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (c) return { url: c[1], headers: { Referer: i + "/" } };
      } catch (i) {}
      return { url: t };
    });
  }
  function lw(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t, { headers: { Referer: "https://vidoza.net/" } });
        if (!r) return { url: t };
        let i = yield r.text(),
          u =
            i.match(/src\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) ||
            i.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i) ||
            i.match(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
        if (u)
          return { url: u[1], headers: { Referer: "https://vidoza.net/" } };
      } catch (r) {}
      return { url: t };
    });
  }
  function fw(t) {
    return V(this, null, function* () {
      var r, i, u;
      try {
        let a =
            ((r = t.match(/^https?:\/\/[^/]+/)) == null ? void 0 : r[0]) ||
            "https://lecteur2.xtremestream.xyz",
          c = yield nt(t, {
            headers: { Referer: "https://lecteurvideo.com/" },
            timeout: 12e3,
          });
        if (!c) return { url: t };
        let l = yield c.text();
        if (!l || l.length < 100) return { url: t };
        let p =
            (i = l.match(/var\s+video_id\s*=\s*[`"']([A-Za-z0-9_-]+)[`"']/)) ==
            null
              ? void 0
              : i[1],
          h =
            (u = l.match(/var\s+m3u8_loader_url\s*=\s*[`"']([^`"']+)[`"']/)) ==
            null
              ? void 0
              : u[1];
        if (!p || !h) return { url: t };
        let g = h + p,
          _ = yield nt(g, { headers: { Referer: a + "/" }, timeout: 12e3 });
        if (!_) return { url: t };
        let v = yield _.text();
        return !v || !v.includes("#EXTM3U")
          ? { url: t }
          : { url: g, headers: { Referer: a + "/" } };
      } catch (a) {}
      return { url: t };
    });
  }
  function hw(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t);
        if (!r) return { url: t };
        let i = yield r.text();
        i.includes("p,a,c,k,e,d") && (i = Kt(i));
        let u = i.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/);
        if (u) return { url: u[1], headers: { Referer: t } };
      } catch (r) {}
      return { url: t };
    });
  }
  function Va(t) {
    return V(this, null, function* () {
      var r;
      try {
        let i =
            ((r = t.match(/^https?:\/\/[^/]+/)) == null ? void 0 : r[0]) || t,
          u = yield nt(t, { headers: { Referer: i + "/" } });
        if (!u) return { url: t };
        let a = yield u.text();
        (a.includes("p,a,c,k,e,d") || a.includes("eval(function")) &&
          (a = Kt(a));
        let c =
          a.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
          a.match(
            /sources\s*:\s*\[[^\]]*?["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
          ) ||
          a.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (c) return { url: c[1], headers: { Referer: i + "/" } };
      } catch (i) {}
      return { url: t };
    });
  }
  function pw(t) {
    return V(this, null, function* () {
      var r, i;
      try {
        let u =
            ((r = t.match(/^https?:\/\/[^/]+/)) == null ? void 0 : r[0]) ||
            "https://lecteurvideo.com",
          a = ((i = t.match(/[?&]url=([^&]+)/)) == null ? void 0 : i[1]) || "",
          l =
            {
              "wookafr.tel": "https://wookafr.center",
              "wookafr.to": "https://wookafr.center",
              "wookafr.app": "https://wookafr.center",
              "wookafr.fyi": "https://wookafr.center",
            }[a] ||
            `https://${a}` ||
            u + "/",
          p = yield nt(t, {
            headers: { Referer: l, Origin: l.replace(/\/$/, "") },
            timeout: 12e3,
          });
        if (!p) return { url: t };
        let h = yield p.text();
        (h.includes("p,a,c,k,e,d") || h.includes("eval(function")) &&
          (h = Kt(h));
        let g =
          h.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
          h.match(/sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i) ||
          h.match(/src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
          h.match(/data-src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (g) {
          let T = g[1];
          if ((T.startsWith("//") && (T = "https:" + T), !Ce(T)))
            return { url: T, headers: { Referer: u + "/" } };
        }
        let _ = [...h.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)]
            .map((T) => T[1])
            .concat(
              [...h.matchAll(/["'](https?:\/\/[^"']+)["']/gi)].map((T) => T[1]),
            )
            .filter(
              (T) =>
                !T.includes("lecteurvideo.com") &&
                !T.includes("youtube.com") &&
                !T.includes("googlevideo.com") &&
                !T.includes("fonts.googleapis.com") &&
                !T.includes("jsdelivr.net") &&
                !T.includes("cloudflareinsights.com") &&
                !T.includes("themoviedb.org") &&
                !T.includes("imagizer.imageshack.com") &&
                !T.includes("cloudflare") &&
                !T.includes("plyr."),
            ),
          v = /^https?:\/\/[^"']+\.(?:m3u8|mp4|mkv|webm)(?:\?[^"']*)?$/i,
          b = _.find((T) => v.test(T) && !Ce(T));
        if (b) return { url: b, headers: { Referer: u + "/" } };
        let w = ["megaup.net", "1fichier.com"];
        for (let T of w) {
          let I = _.find((G) => G.includes(T));
          if (I) return { url: I, headers: { Referer: u + "/" } };
        }
        let x = [
          "sibnet.ru",
          "sendvid.com",
          "dood.to",
          "listeamed.net",
          "voe.sx",
          "veev.to",
          "filemoon.sx",
        ];
        for (let T of x) {
          let I = _.find((G) => G.includes(T));
          if (I) return { url: I, headers: { Referer: u + "/" } };
        }
        let C = h.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
        if (C) {
          let T = C[1];
          if (!T.includes("lecteurvideo.com") && !T.includes("youtube.com"))
            return { url: T, headers: { Referer: u + "/" } };
        }
        let R = _.find(
          (T) =>
            T.includes("1fichier.com") ||
            T.includes("megaup.net") ||
            T.includes("filemoon") ||
            T.includes("voe.sx") ||
            T.includes("veev.to") ||
            T.includes("listeamed.net"),
        );
        if (R) return { url: R, headers: { Referer: u + "/" } };
      } catch (u) {}
      return { url: t };
    });
  }
  function dw(t) {
    return V(this, null, function* () {
      return { url: t };
    });
  }
  function gw(t) {
    return V(this, null, function* () {
      try {
        let r = yield nt(t, { headers: { Referer: "https://up4fun.top/" } });
        if (!r) return null;
        let i = yield r.text(),
          u =
            i.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
            i.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        if (u)
          return { url: u[1], headers: { Referer: "https://up4fun.top/" } };
      } catch (r) {}
      return null;
    });
  }
  function Cu(t) {
    if (!t || typeof t != "string") return t;
    let r = t.match(/^https?:\/\/([^\/]+)(.*)/);
    if (!r) return t;
    let i = r[1].toLowerCase();
    if (mw.some((b) => i === b || i.endsWith("." + b))) return t;
    let u = r[1].toLowerCase(),
      a = u.split("."),
      c = a.length >= 2 ? a[a.length - 2] : a[0],
      l = Wa.some((b) => u.endsWith("." + b.domain)),
      p = a.length > 2,
      h = t,
      g = l;
    if (!g) {
      for (let b of Wa)
        if (c.includes(b.name) && Math.abs(c.length - b.name.length) <= 4) {
          if (p) {
            if (c === b.name) continue;
            let x = a[a.length - 3];
            if (/^[a-z0-9]{1,6}$/i.test(x)) {
              console.log(
                `[Resolver] Subdomain skip (CDN prefix "${x}"): ${u} \u2192 NOT corrected`,
              );
              continue;
            }
          }
          (console.log(
            `[Resolver] Domain corrected (direct): ${u} \u2192 ${b.domain}`,
          ),
            (h = h.replace(u, b.domain)),
            (g = !0));
          break;
        }
    }
    if (!g && !p)
      for (let b of Wa) {
        let w = b.name;
        if (w.length < 5) continue;
        let x = 0,
          C = 0;
        for (let T = 0; T < w.length; T++) {
          let I = w[T];
          for (; C < c.length && c[C] !== I;) C++;
          if (C < c.length) (x++, C++);
          else break;
        }
        let R = x / w.length;
        if (R >= 0.75 && Math.abs(c.length - w.length) <= 4) {
          (console.log(
            `[Resolver] Domain corrected (fuzzy ${Math.round(R * 100)}%): ${u} \u2192 ${b.domain}`,
          ),
            (h = h.replace(u, b.domain)),
            (g = !0));
          break;
        }
      }
    let _ = [
        [/get_viddeo/gi, "get_video"],
        [/get_videeo/gi, "get_video"],
        [/getv_video/gi, "get_video"],
        [/gdet_video/gi, "get_video"],
        [/gett_video/gi, "get_video"],
        [/get_vvdo/gi, "get_video"],
        [/get_vide0/gi, "get_video"],
      ],
      v = h;
    for (let [b, w] of _) h = h.replace(b, w);
    return (
      g
        ? console.log(
            `[Resolver] Result: ${t.slice(0, 80)} \u2192 ${h.slice(0, 80)}`,
          )
        : h !== t &&
          console.log(`[Resolver] Path corrected: ${t.slice(0, 60)}`),
      h
    );
  }
  function _w(t, r) {
    try {
      if (!t) return "";
      if (typeof t.get == "function")
        return t.get(r) || t.get(String(r).toLowerCase()) || "";
      let i = String(r).toLowerCase(),
        u = Object.keys(t);
      for (let a = 0; a < u.length; a++)
        if (u[a].toLowerCase() === i) return String(t[u[a]] || "");
    } catch (i) {}
    return "";
  }
  function Aw(t, r) {
    var c;
    let i = /<iframe\s+[^>]*src=["']([^"']+)["']/gi,
      u = [],
      a;
    for (; (a = i.exec(t)) !== null;) {
      let l = a[1];
      if ((l.startsWith("//") && (l = "https:" + l), l.startsWith("/"))) {
        let _ = (c = r.match(/^https?:\/\/[^\/]+/)) == null ? void 0 : c[0];
        _ && (l = _ + l);
      }
      if (!l.startsWith("http") || l === r) continue;
      let p = l.toLowerCase();
      if (vw.some((_) => p.includes(_))) continue;
      let g = 0;
      for (let [_, v] of Object.entries(yw)) p.includes(_) && (g += v);
      u.push({ url: l, score: g });
    }
    return u.length === 0
      ? null
      : (u.sort((l, p) => p.score - l.score), u[0].url);
  }
  function qu(t, r = 0) {
    return V(this, null, function* () {
      if (r > 1) return wt(tt({}, t), { isDirect: !1 });
      (r === 0 && za.clear(), (t.url = Cu(t.url)));
      let i = t.url,
        u = i.toLowerCase();
      if (!i || i.includes("google-analytics") || i.includes("doubleclick"))
        return null;
      if (Rb(i)) return wt(tt({}, t), { isDirect: !0 });
      try {
        let a = null;
        if (
          (u.includes("sibnet.ru")
            ? (a = yield Yb(i))
            : u.includes("vidmoly.") ||
                u.includes("voembed.") ||
                u.includes("ansembed.")
              ? (a = yield Zb(i))
              : u.includes(".mail.ru")
                ? (a = yield Qb(i))
                : u.includes("uqload.") || u.includes("oneupload.")
                  ? (a = yield tw(i))
                  : u.includes("voe") ||
                      u.includes("weneverbeenfree") ||
                      u.includes("maryspecialwatch") ||
                      u.includes("charlestoughrace") ||
                      u.includes("sandratableother") ||
                      u.includes("jeremyparticipantanything") ||
                      u.includes("teresapoliticallearn") ||
                      u.includes("megankiddifference") ||
                      u.includes("jamesbornmain") ||
                      u.includes("claireguessthousand") ||
                      u.includes("derricknationtop")
                    ? (a = yield eh(i))
                    : u.includes("streamtape.com") || u.includes("stape")
                      ? (a = yield nw(i))
                      : u.includes("dood") ||
                          u.includes("ds2play") ||
                          u.includes("bigwar5")
                        ? (a = yield aw(i))
                        : u.includes("moonplayer") || u.includes("filemoon")
                          ? (a = yield hw(i))
                          : u.includes("younetu.") || u.includes("netu.")
                            ? (a = yield cw(i))
                            : u.includes("vidoza.")
                              ? (a = yield lw(i))
                              : u.includes("xtremestream.")
                                ? (a = yield fw(i))
                                : u.includes("sendvid.") ||
                                    u.includes("daisukianime")
                                  ? (a = yield iw(i))
                                  : u.includes("myvi.") || u.includes("mytv.")
                                    ? (a = yield ow(i))
                                    : u.includes("fsvid.") ||
                                        u.includes("vidzy.")
                                      ? (a = yield rw(i))
                                      : u.includes("vidstream.pro") ||
                                          u.includes("vidcdn.") ||
                                          u.includes("kakaflix.") ||
                                          u.includes("vidhsareup.")
                                        ? (a = yield Va(i))
                                        : u.includes("smoothpre.") ||
                                            u.includes("morencius.") ||
                                            u.includes("movearnpre.") ||
                                            u.includes("earnvids.") ||
                                            u.includes("minochinos.")
                                          ? (a = yield Va(i))
                                          : u.includes("luluvid.") ||
                                              u.includes("lulust.") ||
                                              u.includes("lulustream.") ||
                                              u.includes("luluvdo.") ||
                                              u.includes("livavid.") ||
                                              u.includes("lulavid.") ||
                                              u.includes("livastream.") ||
                                              u.includes("wishonly.") ||
                                              u.includes("veev.")
                                            ? (a = yield Va(i))
                                            : u.includes("lulu.")
                                              ? (a = yield uw(i))
                                              : u.includes("lecteurvideo.")
                                                ? (a = yield pw(i))
                                                : u.includes("hgcloud.") ||
                                                    u.includes("savefiles.")
                                                  ? (a = yield sw(i))
                                                  : u.includes(
                                                        "down-paradise.",
                                                      ) ||
                                                      u.includes(
                                                        "ww1.down-paradise.",
                                                      )
                                                    ? (a = yield dw(i))
                                                    : u.includes("up4fun.") &&
                                                      (a = yield gw(i)),
          a && a.url !== i && !Ce(a.url))
        ) {
          let p = Cu(a.url);
          return (
            p !== a.url &&
              console.log(
                `[Resolver] Resolver output corrected: ${a.url.slice(0, 60)} \u2192 ${p.slice(0, 60)}`,
              ),
            wt(tt({}, t), {
              url: p,
              headers: tt(tt({}, t.headers), a.headers || {}),
              quality: a.quality || t.quality,
              isDirect: !0,
              originalUrl: i,
            })
          );
        }
        let c =
            u.includes("up4fun.") ||
            u.includes("down-paradise.") ||
            u.includes("getvid.club") ||
            u.includes("vidhsareup."),
          l = a && a.isDead === !0;
        if (!a || a.url === i) {
          if (c || l) return wt(tt({}, t), { isDirect: !1 });
          let p = a && a.url === i && r === 0,
            h = yield nt(i, { headers: t.headers });
          if (h) {
            let g = yield h.text();
            if ((g.includes("p,a,c,k,e,d") && (g = Kt(g)), !p)) {
              let v = g.match(
                /window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/,
              );
              if (v && v[1] !== i) {
                let b = yield nt(v[1], { headers: t.headers });
                b &&
                  ((g = yield b.text()),
                  g.includes("p,a,c,k,e,d") && (g = Kt(g)));
              }
            }
            if (/<title>\s*watch/i.test(g) && g.includes("VOE")) {
              let v = yield eh(i);
              if (v && v.url !== i && v.url.startsWith("http") && !Ce(v.url)) {
                let b = Cu(v.url);
                return wt(tt({}, t), {
                  url: b,
                  headers: tt(tt({}, t.headers), v.headers || {}),
                  quality: v.quality || t.quality,
                  isDirect: !0,
                  originalUrl: i,
                });
              }
            }
            let _ = Aw(g, i);
            if (_ && !za.has(_)) {
              (za.add(_),
                console.log(`[Resolver] Peeling: Found nested iframe -> ${_}`));
              let v = yield qu(wt(tt({}, t), { url: _ }), r + 1);
              if (v && v.isDirect) return v;
              r > 0 && (p = !1);
            }
            if (!p) {
              let v =
                g.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                g.match(
                  /sources\s*:\s*\[["']([^"']+\.(?:m3u8|mp4)[^"']*)["']\]/i,
                ) ||
                g.match(/'hls'\s*:\s*'([^']+)'/) ||
                g.match(/"hls"\s*:\s*"([^"]+)"/) ||
                g.match(/"hls2"\s*:\s*"(https?[^"]*?\.m3u8[^"]*)"/) ||
                g.match(/'hls2'\s*:\s*'([^']*?\.m3u8[^']*)'/);
              if (v) {
                let b = v[1] || v[0];
                (b.startsWith("//") && (b = "https:" + b),
                  b.includes("\\") &&
                    (b = b.split("\\/").join("/").split("\\u002F").join("/")));
                let w = b.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);
                b.startsWith("http") &&
                  !b.includes(rh) &&
                  !w &&
                  !Ce(b) &&
                  (a = { url: b });
              }
            }
            if (!a && !p) {
              let v =
                g.match(/https?:\/\/[^"']+\.m3u8[^"']*/) ||
                g.match(/https?:\/\/[^"']+\.mp4[^"']*/);
              if (v) {
                let b = v[0];
                (b.startsWith("//") && (b = "https:" + b),
                  b.includes("\\") &&
                    (b = b.split("\\/").join("/").split("\\u002F").join("/")));
                let w = b.match(/\.(css|js|html|php|jpg|png|gif|svg)(\?.*)?$/i);
                b.startsWith("http") &&
                  !b.includes(rh) &&
                  !w &&
                  !Ce(b) &&
                  (console.log(
                    `[Resolver] Loose URL match (last resort): ${b.slice(0, 80)}`,
                  ),
                  (a = { url: b }));
              }
            }
          }
        }
        if (a && a.url !== i && a.url.startsWith("http") && !Ce(a.url)) {
          let p = Cu(a.url);
          return (
            p !== a.url &&
              console.log(
                `[Resolver] Generic fallback output corrected: ${a.url.slice(0, 60)} \u2192 ${p.slice(0, 60)}`,
              ),
            wt(tt({}, t), {
              url: p,
              headers: tt(tt({}, t.headers), a.headers || {}),
              quality: a.quality || t.quality,
              isDirect: !0,
              originalUrl: i,
            })
          );
        }
      } catch (a) {}
      return wt(tt({}, t), { isDirect: !1 });
    });
  }
  var nh,
    Cb,
    ex,
    xb,
    Ja,
    Lu,
    rx,
    nx,
    Xa,
    Xf,
    Bb,
    xu,
    Su,
    Ib,
    ch,
    Mb,
    Ub,
    Zn,
    Yf,
    jb,
    Jb,
    Xb,
    Wa,
    mw,
    za,
    vw,
    yw,
    rh,
    hn = Yn(() => {
      nh = `
...[truncated]`;
      ((Cb = "eb199b2e"),
        (ex =
          typeof crypto != "undefined" &&
          typeof crypto.subtle != "undefined" &&
          typeof TextEncoder != "undefined" &&
          typeof TextDecoder != "undefined"),
        (xb = null));
      try {
        xb = bb("crypto");
      } catch (t) {}
      Ja = typeof setTimeout == "function";
      ((Lu = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      }),
        (rx = Lu["User-Agent"]),
        (nx = tt({}, Lu)),
        (Xa = (t) => {
          try {
            return atob(t);
          } catch (r) {
            return t;
          }
        }));
      ((Xf = ["AV1", "H.265", "H.264", "VP9"]), (Bb = 5e4));
      ((xu = [2160, 1080, 720, 480, 360, 240]), (Su = 720));
      Ib = {
        avc1: "H.264",
        h264: "H.264",
        hev1: "H.265",
        hvc1: "H.265",
        h265: "H.265",
        av01: "AV1",
        av1: "AV1",
        vp9: "VP9",
        vp09: "VP9",
        mp4a: "AAC",
        "ac-3": "AC3",
        "ec-3": "EAC3",
        opus: "Opus",
      };
      ((ch = new Map()), (Mb = 12e4));
      ((Ub = 3e5), (Zn = new Map()));
      Yf = {
        VF: "fr",
        VFQ: "fr",
        VFF: "fr",
        VFI: "fr",
        VFK: "fr",
        FRA: "fr",
        FR: "fr",
        FRENCH: "fr",
        FRANÇAIS: "fr",
        VOSTFR: "fr",
        VOSTF: "fr",
        VOST: "fr",
        SUBF: "fr",
        MULTI: "multi",
        FAN: "multi",
        EN: "en",
        ENG: "en",
        ENGLISH: "en",
        VOA: "en",
        VO: "ja",
        JA: "ja",
        JP: "ja",
        JAP: "ja",
        JAPANESE: "ja",
        VOSTA: "ja",
      };
      ((jb = 6), (Jb = 3));
      Xb = 15e3;
      ((Wa = [
        { name: "streamtape", domain: "streamtape.com" },
        { name: "sibnet", domain: "sibnet.ru" },
        { name: "vidmoly", domain: "vidmoly.to" },
        { name: "uqload", domain: "uqload.co" },
        { name: "voe", domain: "voe.sx" },
        { name: "dood", domain: "dood.to" },
        { name: "younetu", domain: "younetu.org" },
        { name: "netu", domain: "netu.tv" },
        { name: "vidoza", domain: "vidoza.net" },
        { name: "sendvid", domain: "sendvid.com" },
        { name: "myvi", domain: "myvi.ru" },
        { name: "moon", domain: "filemoon.sx" },
        { name: "luluvid", domain: "luluvid.com" },
        { name: "fsvid", domain: "fsvid.lol" },
        { name: "vidzy", domain: "vidzy.live" },
        { name: "lecteurvideo", domain: "lecteurvideo.com" },
        { name: "vidhsareup", domain: "vidhsareup.fun" },
        { name: "hgcloud", domain: "hgcloud.xyz" },
        { name: "up4fun", domain: "up4fun.top" },
        { name: "lulu", domain: "luluvdo.com" },
      ]),
        (mw = [
          "voembed.net",
          "vidmoly.biz",
          "vidmoly.net",
          "gn1r5n.org",
          "streamhide.to",
        ]));
      ((za = new Set()),
        (vw = [
          "googleads",
          "doubleclick",
          "googlesyndication",
          "googletagmanager",
          "facebook.com/plugins",
          "twitter.com/share",
          "disqus.com",
          "hotjar.com",
          "analytics",
          "tracking",
          "pixel",
          "gtag",
          "adservice",
          "adserver",
          "ad.doubleclick",
          "amazon-adsystem",
          "criteo",
          "taboola",
          "outbrain",
        ]),
        (yw = {
          sibnet: 3,
          vidmoly: 3,
          uqload: 3,
          voe: 3,
          dood: 3,
          streamtape: 3,
          sendvid: 2,
          younetu: 2,
          netu: 2,
          moonplayer: 2,
          filemoon: 2,
          vidoza: 2,
          myvi: 2,
          luluvid: 2,
          lulu: 2,
          embed: 2,
          player: 2,
          video: 2,
          cdn: 1,
          hls: 3,
          mp4: 3,
          m3u8: 3,
        }));
      rh = "googletagmanager";
    });
  function hh(t) {
    fh = t;
  }
  function Bu(i) {
    return V(this, arguments, function* (t, r = {}) {
      let u = r.signal || fh;
      if (Xt(u)) throw new Error("AbortError: Request aborted");
      console.log(`[Anime-Sama] Fetching: ${t}`);
      let p = r,
        { headers: a } = p,
        c = Eu(p, ["headers"]);
      yield ww(bw);
      let l = yield nt(
        t,
        wt(tt({ headers: tt(tt({}, Dw), a || {}) }, c), { signal: u }),
      );
      if (!l || !l.ok) {
        let h = l && typeof l.status == "number" ? l.status : "no-response";
        if (l && (h === 403 || h === 503)) {
          let g = "";
          try {
            g = yield l.text();
          } catch (_) {}
          if (
            /you have been blocked|attention required|cf-error-details|just a moment/i.test(
              g || "",
            )
          )
            throw (
              console.warn(
                `[Anime-Sama] Bloqu\xE9 par Cloudflare (${h}) : ${t}`,
              ),
              new Error(`Cloudflare block ${h} for ${t}`)
            );
        }
        throw new Error(`HTTP error ${h} for ${t}`);
      }
      return yield l.text();
    });
  }
  var fh,
    bw,
    ww,
    Dw,
    ph = Yn(() => {
      hn();
      fh = null;
      ((bw = "anime-sama.to"),
        (ww = ih()),
        (Dw = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "max-age=0",
          "Sec-Ch-Ua":
            '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        }));
    });
  var dh = U((cx, Ew) => {
    Ew.exports = {
      0: 65533,
      128: 8364,
      130: 8218,
      131: 402,
      132: 8222,
      133: 8230,
      134: 8224,
      135: 8225,
      136: 710,
      137: 8240,
      138: 352,
      139: 8249,
      140: 338,
      142: 381,
      145: 8216,
      146: 8217,
      147: 8220,
      148: 8221,
      149: 8226,
      150: 8211,
      151: 8212,
      152: 732,
      153: 8482,
      154: 353,
      155: 8250,
      156: 339,
      158: 382,
      159: 376,
    };
  });
  var Ya = U((lx, mh) => {
    var gh = dh();
    mh.exports = Cw;
    function Cw(t) {
      if ((t >= 55296 && t <= 57343) || t > 1114111) return "\uFFFD";
      t in gh && (t = gh[t]);
      var r = "";
      return (
        t > 65535 &&
          ((t -= 65536),
          (r += String.fromCharCode(((t >>> 10) & 1023) | 55296)),
          (t = 56320 | (t & 1023))),
        (r += String.fromCharCode(t)),
        r
      );
    }
  });
  var Fu = U((fx, xw) => {
    xw.exports = {
      Aacute: "\xC1",
      aacute: "\xE1",
      Abreve: "\u0102",
      abreve: "\u0103",
      ac: "\u223E",
      acd: "\u223F",
      acE: "\u223E\u0333",
      Acirc: "\xC2",
      acirc: "\xE2",
      acute: "\xB4",
      Acy: "\u0410",
      acy: "\u0430",
      AElig: "\xC6",
      aelig: "\xE6",
      af: "\u2061",
      Afr: "\u{1D504}",
      afr: "\u{1D51E}",
      Agrave: "\xC0",
      agrave: "\xE0",
      alefsym: "\u2135",
      aleph: "\u2135",
      Alpha: "\u0391",
      alpha: "\u03B1",
      Amacr: "\u0100",
      amacr: "\u0101",
      amalg: "\u2A3F",
      amp: "&",
      AMP: "&",
      andand: "\u2A55",
      And: "\u2A53",
      and: "\u2227",
      andd: "\u2A5C",
      andslope: "\u2A58",
      andv: "\u2A5A",
      ang: "\u2220",
      ange: "\u29A4",
      angle: "\u2220",
      angmsdaa: "\u29A8",
      angmsdab: "\u29A9",
      angmsdac: "\u29AA",
      angmsdad: "\u29AB",
      angmsdae: "\u29AC",
      angmsdaf: "\u29AD",
      angmsdag: "\u29AE",
      angmsdah: "\u29AF",
      angmsd: "\u2221",
      angrt: "\u221F",
      angrtvb: "\u22BE",
      angrtvbd: "\u299D",
      angsph: "\u2222",
      angst: "\xC5",
      angzarr: "\u237C",
      Aogon: "\u0104",
      aogon: "\u0105",
      Aopf: "\u{1D538}",
      aopf: "\u{1D552}",
      apacir: "\u2A6F",
      ap: "\u2248",
      apE: "\u2A70",
      ape: "\u224A",
      apid: "\u224B",
      apos: "'",
      ApplyFunction: "\u2061",
      approx: "\u2248",
      approxeq: "\u224A",
      Aring: "\xC5",
      aring: "\xE5",
      Ascr: "\u{1D49C}",
      ascr: "\u{1D4B6}",
      Assign: "\u2254",
      ast: "*",
      asymp: "\u2248",
      asympeq: "\u224D",
      Atilde: "\xC3",
      atilde: "\xE3",
      Auml: "\xC4",
      auml: "\xE4",
      awconint: "\u2233",
      awint: "\u2A11",
      backcong: "\u224C",
      backepsilon: "\u03F6",
      backprime: "\u2035",
      backsim: "\u223D",
      backsimeq: "\u22CD",
      Backslash: "\u2216",
      Barv: "\u2AE7",
      barvee: "\u22BD",
      barwed: "\u2305",
      Barwed: "\u2306",
      barwedge: "\u2305",
      bbrk: "\u23B5",
      bbrktbrk: "\u23B6",
      bcong: "\u224C",
      Bcy: "\u0411",
      bcy: "\u0431",
      bdquo: "\u201E",
      becaus: "\u2235",
      because: "\u2235",
      Because: "\u2235",
      bemptyv: "\u29B0",
      bepsi: "\u03F6",
      bernou: "\u212C",
      Bernoullis: "\u212C",
      Beta: "\u0392",
      beta: "\u03B2",
      beth: "\u2136",
      between: "\u226C",
      Bfr: "\u{1D505}",
      bfr: "\u{1D51F}",
      bigcap: "\u22C2",
      bigcirc: "\u25EF",
      bigcup: "\u22C3",
      bigodot: "\u2A00",
      bigoplus: "\u2A01",
      bigotimes: "\u2A02",
      bigsqcup: "\u2A06",
      bigstar: "\u2605",
      bigtriangledown: "\u25BD",
      bigtriangleup: "\u25B3",
      biguplus: "\u2A04",
      bigvee: "\u22C1",
      bigwedge: "\u22C0",
      bkarow: "\u290D",
      blacklozenge: "\u29EB",
      blacksquare: "\u25AA",
      blacktriangle: "\u25B4",
      blacktriangledown: "\u25BE",
      blacktriangleleft: "\u25C2",
      blacktriangleright: "\u25B8",
      blank: "\u2423",
      blk12: "\u2592",
      blk14: "\u2591",
      blk34: "\u2593",
      block: "\u2588",
      bne: "=\u20E5",
      bnequiv: "\u2261\u20E5",
      bNot: "\u2AED",
      bnot: "\u2310",
      Bopf: "\u{1D539}",
      bopf: "\u{1D553}",
      bot: "\u22A5",
      bottom: "\u22A5",
      bowtie: "\u22C8",
      boxbox: "\u29C9",
      boxdl: "\u2510",
      boxdL: "\u2555",
      boxDl: "\u2556",
      boxDL: "\u2557",
      boxdr: "\u250C",
      boxdR: "\u2552",
      boxDr: "\u2553",
      boxDR: "\u2554",
      boxh: "\u2500",
      boxH: "\u2550",
      boxhd: "\u252C",
      boxHd: "\u2564",
      boxhD: "\u2565",
      boxHD: "\u2566",
      boxhu: "\u2534",
      boxHu: "\u2567",
      boxhU: "\u2568",
      boxHU: "\u2569",
      boxminus: "\u229F",
      boxplus: "\u229E",
      boxtimes: "\u22A0",
      boxul: "\u2518",
      boxuL: "\u255B",
      boxUl: "\u255C",
      boxUL: "\u255D",
      boxur: "\u2514",
      boxuR: "\u2558",
      boxUr: "\u2559",
      boxUR: "\u255A",
      boxv: "\u2502",
      boxV: "\u2551",
      boxvh: "\u253C",
      boxvH: "\u256A",
      boxVh: "\u256B",
      boxVH: "\u256C",
      boxvl: "\u2524",
      boxvL: "\u2561",
      boxVl: "\u2562",
      boxVL: "\u2563",
      boxvr: "\u251C",
      boxvR: "\u255E",
      boxVr: "\u255F",
      boxVR: "\u2560",
      bprime: "\u2035",
      breve: "\u02D8",
      Breve: "\u02D8",
      brvbar: "\xA6",
      bscr: "\u{1D4B7}",
      Bscr: "\u212C",
      bsemi: "\u204F",
      bsim: "\u223D",
      bsime: "\u22CD",
      bsolb: "\u29C5",
      bsol: "\\",
      bsolhsub: "\u27C8",
      bull: "\u2022",
      bullet: "\u2022",
      bump: "\u224E",
      bumpE: "\u2AAE",
      bumpe: "\u224F",
      Bumpeq: "\u224E",
      bumpeq: "\u224F",
      Cacute: "\u0106",
      cacute: "\u0107",
      capand: "\u2A44",
      capbrcup: "\u2A49",
      capcap: "\u2A4B",
      cap: "\u2229",
      Cap: "\u22D2",
      capcup: "\u2A47",
      capdot: "\u2A40",
      CapitalDifferentialD: "\u2145",
      caps: "\u2229\uFE00",
      caret: "\u2041",
      caron: "\u02C7",
      Cayleys: "\u212D",
      ccaps: "\u2A4D",
      Ccaron: "\u010C",
      ccaron: "\u010D",
      Ccedil: "\xC7",
      ccedil: "\xE7",
      Ccirc: "\u0108",
      ccirc: "\u0109",
      Cconint: "\u2230",
      ccups: "\u2A4C",
      ccupssm: "\u2A50",
      Cdot: "\u010A",
      cdot: "\u010B",
      cedil: "\xB8",
      Cedilla: "\xB8",
      cemptyv: "\u29B2",
      cent: "\xA2",
      centerdot: "\xB7",
      CenterDot: "\xB7",
      cfr: "\u{1D520}",
      Cfr: "\u212D",
      CHcy: "\u0427",
      chcy: "\u0447",
      check: "\u2713",
      checkmark: "\u2713",
      Chi: "\u03A7",
      chi: "\u03C7",
      circ: "\u02C6",
      circeq: "\u2257",
      circlearrowleft: "\u21BA",
      circlearrowright: "\u21BB",
      circledast: "\u229B",
      circledcirc: "\u229A",
      circleddash: "\u229D",
      CircleDot: "\u2299",
      circledR: "\xAE",
      circledS: "\u24C8",
      CircleMinus: "\u2296",
      CirclePlus: "\u2295",
      CircleTimes: "\u2297",
      cir: "\u25CB",
      cirE: "\u29C3",
      cire: "\u2257",
      cirfnint: "\u2A10",
      cirmid: "\u2AEF",
      cirscir: "\u29C2",
      ClockwiseContourIntegral: "\u2232",
      CloseCurlyDoubleQuote: "\u201D",
      CloseCurlyQuote: "\u2019",
      clubs: "\u2663",
      clubsuit: "\u2663",
      colon: ":",
      Colon: "\u2237",
      Colone: "\u2A74",
      colone: "\u2254",
      coloneq: "\u2254",
      comma: ",",
      commat: "@",
      comp: "\u2201",
      compfn: "\u2218",
      complement: "\u2201",
      complexes: "\u2102",
      cong: "\u2245",
      congdot: "\u2A6D",
      Congruent: "\u2261",
      conint: "\u222E",
      Conint: "\u222F",
      ContourIntegral: "\u222E",
      copf: "\u{1D554}",
      Copf: "\u2102",
      coprod: "\u2210",
      Coproduct: "\u2210",
      copy: "\xA9",
      COPY: "\xA9",
      copysr: "\u2117",
      CounterClockwiseContourIntegral: "\u2233",
      crarr: "\u21B5",
      cross: "\u2717",
      Cross: "\u2A2F",
      Cscr: "\u{1D49E}",
      cscr: "\u{1D4B8}",
      csub: "\u2ACF",
      csube: "\u2AD1",
      csup: "\u2AD0",
      csupe: "\u2AD2",
      ctdot: "\u22EF",
      cudarrl: "\u2938",
      cudarrr: "\u2935",
      cuepr: "\u22DE",
      cuesc: "\u22DF",
      cularr: "\u21B6",
      cularrp: "\u293D",
      cupbrcap: "\u2A48",
      cupcap: "\u2A46",
      CupCap: "\u224D",
      cup: "\u222A",
      Cup: "\u22D3",
      cupcup: "\u2A4A",
      cupdot: "\u228D",
      cupor: "\u2A45",
      cups: "\u222A\uFE00",
      curarr: "\u21B7",
      curarrm: "\u293C",
      curlyeqprec: "\u22DE",
      curlyeqsucc: "\u22DF",
      curlyvee: "\u22CE",
      curlywedge: "\u22CF",
      curren: "\xA4",
      curvearrowleft: "\u21B6",
      curvearrowright: "\u21B7",
      cuvee: "\u22CE",
      cuwed: "\u22CF",
      cwconint: "\u2232",
      cwint: "\u2231",
      cylcty: "\u232D",
      dagger: "\u2020",
      Dagger: "\u2021",
      daleth: "\u2138",
      darr: "\u2193",
      Darr: "\u21A1",
      dArr: "\u21D3",
      dash: "\u2010",
      Dashv: "\u2AE4",
      dashv: "\u22A3",
      dbkarow: "\u290F",
      dblac: "\u02DD",
      Dcaron: "\u010E",
      dcaron: "\u010F",
      Dcy: "\u0414",
      dcy: "\u0434",
      ddagger: "\u2021",
      ddarr: "\u21CA",
      DD: "\u2145",
      dd: "\u2146",
      DDotrahd: "\u2911",
      ddotseq: "\u2A77",
      deg: "\xB0",
      Del: "\u2207",
      Delta: "\u0394",
      delta: "\u03B4",
      demptyv: "\u29B1",
      dfisht: "\u297F",
      Dfr: "\u{1D507}",
      dfr: "\u{1D521}",
      dHar: "\u2965",
      dharl: "\u21C3",
      dharr: "\u21C2",
      DiacriticalAcute: "\xB4",
      DiacriticalDot: "\u02D9",
      DiacriticalDoubleAcute: "\u02DD",
      DiacriticalGrave: "`",
      DiacriticalTilde: "\u02DC",
      diam: "\u22C4",
      diamond: "\u22C4",
      Diamond: "\u22C4",
      diamondsuit: "\u2666",
      diams: "\u2666",
      die: "\xA8",
      DifferentialD: "\u2146",
      digamma: "\u03DD",
      disin: "\u22F2",
      div: "\xF7",
      divide: "\xF7",
      divideontimes: "\u22C7",
      divonx: "\u22C7",
      DJcy: "\u0402",
      djcy: "\u0452",
      dlcorn: "\u231E",
      dlcrop: "\u230D",
      dollar: "$",
      Dopf: "\u{1D53B}",
      dopf: "\u{1D555}",
      Dot: "\xA8",
      dot: "\u02D9",
      DotDot: "\u20DC",
      doteq: "\u2250",
      doteqdot: "\u2251",
      DotEqual: "\u2250",
      dotminus: "\u2238",
      dotplus: "\u2214",
      dotsquare: "\u22A1",
      doublebarwedge: "\u2306",
      DoubleContourIntegral: "\u222F",
      DoubleDot: "\xA8",
      DoubleDownArrow: "\u21D3",
      DoubleLeftArrow: "\u21D0",
      DoubleLeftRightArrow: "\u21D4",
      DoubleLeftTee: "\u2AE4",
      DoubleLongLeftArrow: "\u27F8",
      DoubleLongLeftRightArrow: "\u27FA",
      DoubleLongRightArrow: "\u27F9",
      DoubleRightArrow: "\u21D2",
      DoubleRightTee: "\u22A8",
      DoubleUpArrow: "\u21D1",
      DoubleUpDownArrow: "\u21D5",
      DoubleVerticalBar: "\u2225",
      DownArrowBar: "\u2913",
      downarrow: "\u2193",
      DownArrow: "\u2193",
      Downarrow: "\u21D3",
      DownArrowUpArrow: "\u21F5",
      DownBreve: "\u0311",
      downdownarrows: "\u21CA",
      downharpoonleft: "\u21C3",
      downharpoonright: "\u21C2",
      DownLeftRightVector: "\u2950",
      DownLeftTeeVector: "\u295E",
      DownLeftVectorBar: "\u2956",
      DownLeftVector: "\u21BD",
      DownRightTeeVector: "\u295F",
      DownRightVectorBar: "\u2957",
      DownRightVector: "\u21C1",
      DownTeeArrow: "\u21A7",
      DownTee: "\u22A4",
      drbkarow: "\u2910",
      drcorn: "\u231F",
      drcrop: "\u230C",
      Dscr: "\u{1D49F}",
      dscr: "\u{1D4B9}",
      DScy: "\u0405",
      dscy: "\u0455",
      dsol: "\u29F6",
      Dstrok: "\u0110",
      dstrok: "\u0111",
      dtdot: "\u22F1",
      dtri: "\u25BF",
      dtrif: "\u25BE",
      duarr: "\u21F5",
      duhar: "\u296F",
      dwangle: "\u29A6",
      DZcy: "\u040F",
      dzcy: "\u045F",
      dzigrarr: "\u27FF",
      Eacute: "\xC9",
      eacute: "\xE9",
      easter: "\u2A6E",
      Ecaron: "\u011A",
      ecaron: "\u011B",
      Ecirc: "\xCA",
      ecirc: "\xEA",
      ecir: "\u2256",
      ecolon: "\u2255",
      Ecy: "\u042D",
      ecy: "\u044D",
      eDDot: "\u2A77",
      Edot: "\u0116",
      edot: "\u0117",
      eDot: "\u2251",
      ee: "\u2147",
      efDot: "\u2252",
      Efr: "\u{1D508}",
      efr: "\u{1D522}",
      eg: "\u2A9A",
      Egrave: "\xC8",
      egrave: "\xE8",
      egs: "\u2A96",
      egsdot: "\u2A98",
      el: "\u2A99",
      Element: "\u2208",
      elinters: "\u23E7",
      ell: "\u2113",
      els: "\u2A95",
      elsdot: "\u2A97",
      Emacr: "\u0112",
      emacr: "\u0113",
      empty: "\u2205",
      emptyset: "\u2205",
      EmptySmallSquare: "\u25FB",
      emptyv: "\u2205",
      EmptyVerySmallSquare: "\u25AB",
      emsp13: "\u2004",
      emsp14: "\u2005",
      emsp: "\u2003",
      ENG: "\u014A",
      eng: "\u014B",
      ensp: "\u2002",
      Eogon: "\u0118",
      eogon: "\u0119",
      Eopf: "\u{1D53C}",
      eopf: "\u{1D556}",
      epar: "\u22D5",
      eparsl: "\u29E3",
      eplus: "\u2A71",
      epsi: "\u03B5",
      Epsilon: "\u0395",
      epsilon: "\u03B5",
      epsiv: "\u03F5",
      eqcirc: "\u2256",
      eqcolon: "\u2255",
      eqsim: "\u2242",
      eqslantgtr: "\u2A96",
      eqslantless: "\u2A95",
      Equal: "\u2A75",
      equals: "=",
      EqualTilde: "\u2242",
      equest: "\u225F",
      Equilibrium: "\u21CC",
      equiv: "\u2261",
      equivDD: "\u2A78",
      eqvparsl: "\u29E5",
      erarr: "\u2971",
      erDot: "\u2253",
      escr: "\u212F",
      Escr: "\u2130",
      esdot: "\u2250",
      Esim: "\u2A73",
      esim: "\u2242",
      Eta: "\u0397",
      eta: "\u03B7",
      ETH: "\xD0",
      eth: "\xF0",
      Euml: "\xCB",
      euml: "\xEB",
      euro: "\u20AC",
      excl: "!",
      exist: "\u2203",
      Exists: "\u2203",
      expectation: "\u2130",
      exponentiale: "\u2147",
      ExponentialE: "\u2147",
      fallingdotseq: "\u2252",
      Fcy: "\u0424",
      fcy: "\u0444",
      female: "\u2640",
      ffilig: "\uFB03",
      fflig: "\uFB00",
      ffllig: "\uFB04",
      Ffr: "\u{1D509}",
      ffr: "\u{1D523}",
      filig: "\uFB01",
      FilledSmallSquare: "\u25FC",
      FilledVerySmallSquare: "\u25AA",
      fjlig: "fj",
      flat: "\u266D",
      fllig: "\uFB02",
      fltns: "\u25B1",
      fnof: "\u0192",
      Fopf: "\u{1D53D}",
      fopf: "\u{1D557}",
      forall: "\u2200",
      ForAll: "\u2200",
      fork: "\u22D4",
      forkv: "\u2AD9",
      Fouriertrf: "\u2131",
      fpartint: "\u2A0D",
      frac12: "\xBD",
      frac13: "\u2153",
      frac14: "\xBC",
      frac15: "\u2155",
      frac16: "\u2159",
      frac18: "\u215B",
      frac23: "\u2154",
      frac25: "\u2156",
      frac34: "\xBE",
      frac35: "\u2157",
      frac38: "\u215C",
      frac45: "\u2158",
      frac56: "\u215A",
      frac58: "\u215D",
      frac78: "\u215E",
      frasl: "\u2044",
      frown: "\u2322",
      fscr: "\u{1D4BB}",
      Fscr: "\u2131",
      gacute: "\u01F5",
      Gamma: "\u0393",
      gamma: "\u03B3",
      Gammad: "\u03DC",
      gammad: "\u03DD",
      gap: "\u2A86",
      Gbreve: "\u011E",
      gbreve: "\u011F",
      Gcedil: "\u0122",
      Gcirc: "\u011C",
      gcirc: "\u011D",
      Gcy: "\u0413",
      gcy: "\u0433",
      Gdot: "\u0120",
      gdot: "\u0121",
      ge: "\u2265",
      gE: "\u2267",
      gEl: "\u2A8C",
      gel: "\u22DB",
      geq: "\u2265",
      geqq: "\u2267",
      geqslant: "\u2A7E",
      gescc: "\u2AA9",
      ges: "\u2A7E",
      gesdot: "\u2A80",
      gesdoto: "\u2A82",
      gesdotol: "\u2A84",
      gesl: "\u22DB\uFE00",
      gesles: "\u2A94",
      Gfr: "\u{1D50A}",
      gfr: "\u{1D524}",
      gg: "\u226B",
      Gg: "\u22D9",
      ggg: "\u22D9",
      gimel: "\u2137",
      GJcy: "\u0403",
      gjcy: "\u0453",
      gla: "\u2AA5",
      gl: "\u2277",
      glE: "\u2A92",
      glj: "\u2AA4",
      gnap: "\u2A8A",
      gnapprox: "\u2A8A",
      gne: "\u2A88",
      gnE: "\u2269",
      gneq: "\u2A88",
      gneqq: "\u2269",
      gnsim: "\u22E7",
      Gopf: "\u{1D53E}",
      gopf: "\u{1D558}",
      grave: "`",
      GreaterEqual: "\u2265",
      GreaterEqualLess: "\u22DB",
      GreaterFullEqual: "\u2267",
      GreaterGreater: "\u2AA2",
      GreaterLess: "\u2277",
      GreaterSlantEqual: "\u2A7E",
      GreaterTilde: "\u2273",
      Gscr: "\u{1D4A2}",
      gscr: "\u210A",
      gsim: "\u2273",
      gsime: "\u2A8E",
      gsiml: "\u2A90",
      gtcc: "\u2AA7",
      gtcir: "\u2A7A",
      gt: ">",
      GT: ">",
      Gt: "\u226B",
      gtdot: "\u22D7",
      gtlPar: "\u2995",
      gtquest: "\u2A7C",
      gtrapprox: "\u2A86",
      gtrarr: "\u2978",
      gtrdot: "\u22D7",
      gtreqless: "\u22DB",
      gtreqqless: "\u2A8C",
      gtrless: "\u2277",
      gtrsim: "\u2273",
      gvertneqq: "\u2269\uFE00",
      gvnE: "\u2269\uFE00",
      Hacek: "\u02C7",
      hairsp: "\u200A",
      half: "\xBD",
      hamilt: "\u210B",
      HARDcy: "\u042A",
      hardcy: "\u044A",
      harrcir: "\u2948",
      harr: "\u2194",
      hArr: "\u21D4",
      harrw: "\u21AD",
      Hat: "^",
      hbar: "\u210F",
      Hcirc: "\u0124",
      hcirc: "\u0125",
      hearts: "\u2665",
      heartsuit: "\u2665",
      hellip: "\u2026",
      hercon: "\u22B9",
      hfr: "\u{1D525}",
      Hfr: "\u210C",
      HilbertSpace: "\u210B",
      hksearow: "\u2925",
      hkswarow: "\u2926",
      hoarr: "\u21FF",
      homtht: "\u223B",
      hookleftarrow: "\u21A9",
      hookrightarrow: "\u21AA",
      hopf: "\u{1D559}",
      Hopf: "\u210D",
      horbar: "\u2015",
      HorizontalLine: "\u2500",
      hscr: "\u{1D4BD}",
      Hscr: "\u210B",
      hslash: "\u210F",
      Hstrok: "\u0126",
      hstrok: "\u0127",
      HumpDownHump: "\u224E",
      HumpEqual: "\u224F",
      hybull: "\u2043",
      hyphen: "\u2010",
      Iacute: "\xCD",
      iacute: "\xED",
      ic: "\u2063",
      Icirc: "\xCE",
      icirc: "\xEE",
      Icy: "\u0418",
      icy: "\u0438",
      Idot: "\u0130",
      IEcy: "\u0415",
      iecy: "\u0435",
      iexcl: "\xA1",
      iff: "\u21D4",
      ifr: "\u{1D526}",
      Ifr: "\u2111",
      Igrave: "\xCC",
      igrave: "\xEC",
      ii: "\u2148",
      iiiint: "\u2A0C",
      iiint: "\u222D",
      iinfin: "\u29DC",
      iiota: "\u2129",
      IJlig: "\u0132",
      ijlig: "\u0133",
      Imacr: "\u012A",
      imacr: "\u012B",
      image: "\u2111",
      ImaginaryI: "\u2148",
      imagline: "\u2110",
      imagpart: "\u2111",
      imath: "\u0131",
      Im: "\u2111",
      imof: "\u22B7",
      imped: "\u01B5",
      Implies: "\u21D2",
      incare: "\u2105",
      in: "\u2208",
      infin: "\u221E",
      infintie: "\u29DD",
      inodot: "\u0131",
      intcal: "\u22BA",
      int: "\u222B",
      Int: "\u222C",
      integers: "\u2124",
      Integral: "\u222B",
      intercal: "\u22BA",
      Intersection: "\u22C2",
      intlarhk: "\u2A17",
      intprod: "\u2A3C",
      InvisibleComma: "\u2063",
      InvisibleTimes: "\u2062",
      IOcy: "\u0401",
      iocy: "\u0451",
      Iogon: "\u012E",
      iogon: "\u012F",
      Iopf: "\u{1D540}",
      iopf: "\u{1D55A}",
      Iota: "\u0399",
      iota: "\u03B9",
      iprod: "\u2A3C",
      iquest: "\xBF",
      iscr: "\u{1D4BE}",
      Iscr: "\u2110",
      isin: "\u2208",
      isindot: "\u22F5",
      isinE: "\u22F9",
      isins: "\u22F4",
      isinsv: "\u22F3",
      isinv: "\u2208",
      it: "\u2062",
      Itilde: "\u0128",
      itilde: "\u0129",
      Iukcy: "\u0406",
      iukcy: "\u0456",
      Iuml: "\xCF",
      iuml: "\xEF",
      Jcirc: "\u0134",
      jcirc: "\u0135",
      Jcy: "\u0419",
      jcy: "\u0439",
      Jfr: "\u{1D50D}",
      jfr: "\u{1D527}",
      jmath: "\u0237",
      Jopf: "\u{1D541}",
      jopf: "\u{1D55B}",
      Jscr: "\u{1D4A5}",
      jscr: "\u{1D4BF}",
      Jsercy: "\u0408",
      jsercy: "\u0458",
      Jukcy: "\u0404",
      jukcy: "\u0454",
      Kappa: "\u039A",
      kappa: "\u03BA",
      kappav: "\u03F0",
      Kcedil: "\u0136",
      kcedil: "\u0137",
      Kcy: "\u041A",
      kcy: "\u043A",
      Kfr: "\u{1D50E}",
      kfr: "\u{1D528}",
      kgreen: "\u0138",
      KHcy: "\u0425",
      khcy: "\u0445",
      KJcy: "\u040C",
      kjcy: "\u045C",
      Kopf: "\u{1D542}",
      kopf: "\u{1D55C}",
      Kscr: "\u{1D4A6}",
      kscr: "\u{1D4C0}",
      lAarr: "\u21DA",
      Lacute: "\u0139",
      lacute: "\u013A",
      laemptyv: "\u29B4",
      lagran: "\u2112",
      Lambda: "\u039B",
      lambda: "\u03BB",
      lang: "\u27E8",
      Lang: "\u27EA",
      langd: "\u2991",
      langle: "\u27E8",
      lap: "\u2A85",
      Laplacetrf: "\u2112",
      laquo: "\xAB",
      larrb: "\u21E4",
      larrbfs: "\u291F",
      larr: "\u2190",
      Larr: "\u219E",
      lArr: "\u21D0",
      larrfs: "\u291D",
      larrhk: "\u21A9",
      larrlp: "\u21AB",
      larrpl: "\u2939",
      larrsim: "\u2973",
      larrtl: "\u21A2",
      latail: "\u2919",
      lAtail: "\u291B",
      lat: "\u2AAB",
      late: "\u2AAD",
      lates: "\u2AAD\uFE00",
      lbarr: "\u290C",
      lBarr: "\u290E",
      lbbrk: "\u2772",
      lbrace: "{",
      lbrack: "[",
      lbrke: "\u298B",
      lbrksld: "\u298F",
      lbrkslu: "\u298D",
      Lcaron: "\u013D",
      lcaron: "\u013E",
      Lcedil: "\u013B",
      lcedil: "\u013C",
      lceil: "\u2308",
      lcub: "{",
      Lcy: "\u041B",
      lcy: "\u043B",
      ldca: "\u2936",
      ldquo: "\u201C",
      ldquor: "\u201E",
      ldrdhar: "\u2967",
      ldrushar: "\u294B",
      ldsh: "\u21B2",
      le: "\u2264",
      lE: "\u2266",
      LeftAngleBracket: "\u27E8",
      LeftArrowBar: "\u21E4",
      leftarrow: "\u2190",
      LeftArrow: "\u2190",
      Leftarrow: "\u21D0",
      LeftArrowRightArrow: "\u21C6",
      leftarrowtail: "\u21A2",
      LeftCeiling: "\u2308",
      LeftDoubleBracket: "\u27E6",
      LeftDownTeeVector: "\u2961",
      LeftDownVectorBar: "\u2959",
      LeftDownVector: "\u21C3",
      LeftFloor: "\u230A",
      leftharpoondown: "\u21BD",
      leftharpoonup: "\u21BC",
      leftleftarrows: "\u21C7",
      leftrightarrow: "\u2194",
      LeftRightArrow: "\u2194",
      Leftrightarrow: "\u21D4",
      leftrightarrows: "\u21C6",
      leftrightharpoons: "\u21CB",
      leftrightsquigarrow: "\u21AD",
      LeftRightVector: "\u294E",
      LeftTeeArrow: "\u21A4",
      LeftTee: "\u22A3",
      LeftTeeVector: "\u295A",
      leftthreetimes: "\u22CB",
      LeftTriangleBar: "\u29CF",
      LeftTriangle: "\u22B2",
      LeftTriangleEqual: "\u22B4",
      LeftUpDownVector: "\u2951",
      LeftUpTeeVector: "\u2960",
      LeftUpVectorBar: "\u2958",
      LeftUpVector: "\u21BF",
      LeftVectorBar: "\u2952",
      LeftVector: "\u21BC",
      lEg: "\u2A8B",
      leg: "\u22DA",
      leq: "\u2264",
      leqq: "\u2266",
      leqslant: "\u2A7D",
      lescc: "\u2AA8",
      les: "\u2A7D",
      lesdot: "\u2A7F",
      lesdoto: "\u2A81",
      lesdotor: "\u2A83",
      lesg: "\u22DA\uFE00",
      lesges: "\u2A93",
      lessapprox: "\u2A85",
      lessdot: "\u22D6",
      lesseqgtr: "\u22DA",
      lesseqqgtr: "\u2A8B",
      LessEqualGreater: "\u22DA",
      LessFullEqual: "\u2266",
      LessGreater: "\u2276",
      lessgtr: "\u2276",
      LessLess: "\u2AA1",
      lesssim: "\u2272",
      LessSlantEqual: "\u2A7D",
      LessTilde: "\u2272",
      lfisht: "\u297C",
      lfloor: "\u230A",
      Lfr: "\u{1D50F}",
      lfr: "\u{1D529}",
      lg: "\u2276",
      lgE: "\u2A91",
      lHar: "\u2962",
      lhard: "\u21BD",
      lharu: "\u21BC",
      lharul: "\u296A",
      lhblk: "\u2584",
      LJcy: "\u0409",
      ljcy: "\u0459",
      llarr: "\u21C7",
      ll: "\u226A",
      Ll: "\u22D8",
      llcorner: "\u231E",
      Lleftarrow: "\u21DA",
      llhard: "\u296B",
      lltri: "\u25FA",
      Lmidot: "\u013F",
      lmidot: "\u0140",
      lmoustache: "\u23B0",
      lmoust: "\u23B0",
      lnap: "\u2A89",
      lnapprox: "\u2A89",
      lne: "\u2A87",
      lnE: "\u2268",
      lneq: "\u2A87",
      lneqq: "\u2268",
      lnsim: "\u22E6",
      loang: "\u27EC",
      loarr: "\u21FD",
      lobrk: "\u27E6",
      longleftarrow: "\u27F5",
      LongLeftArrow: "\u27F5",
      Longleftarrow: "\u27F8",
      longleftrightarrow: "\u27F7",
      LongLeftRightArrow: "\u27F7",
      Longleftrightarrow: "\u27FA",
      longmapsto: "\u27FC",
      longrightarrow: "\u27F6",
      LongRightArrow: "\u27F6",
      Longrightarrow: "\u27F9",
      looparrowleft: "\u21AB",
      looparrowright: "\u21AC",
      lopar: "\u2985",
      Lopf: "\u{1D543}",
      lopf: "\u{1D55D}",
      loplus: "\u2A2D",
      lotimes: "\u2A34",
      lowast: "\u2217",
      lowbar: "_",
      LowerLeftArrow: "\u2199",
      LowerRightArrow: "\u2198",
      loz: "\u25CA",
      lozenge: "\u25CA",
      lozf: "\u29EB",
      lpar: "(",
      lparlt: "\u2993",
      lrarr: "\u21C6",
      lrcorner: "\u231F",
      lrhar: "\u21CB",
      lrhard: "\u296D",
      lrm: "\u200E",
      lrtri: "\u22BF",
      lsaquo: "\u2039",
      lscr: "\u{1D4C1}",
      Lscr: "\u2112",
      lsh: "\u21B0",
      Lsh: "\u21B0",
      lsim: "\u2272",
      lsime: "\u2A8D",
      lsimg: "\u2A8F",
      lsqb: "[",
      lsquo: "\u2018",
      lsquor: "\u201A",
      Lstrok: "\u0141",
      lstrok: "\u0142",
      ltcc: "\u2AA6",
      ltcir: "\u2A79",
      lt: "<",
      LT: "<",
      Lt: "\u226A",
      ltdot: "\u22D6",
      lthree: "\u22CB",
      ltimes: "\u22C9",
      ltlarr: "\u2976",
      ltquest: "\u2A7B",
      ltri: "\u25C3",
      ltrie: "\u22B4",
      ltrif: "\u25C2",
      ltrPar: "\u2996",
      lurdshar: "\u294A",
      luruhar: "\u2966",
      lvertneqq: "\u2268\uFE00",
      lvnE: "\u2268\uFE00",
      macr: "\xAF",
      male: "\u2642",
      malt: "\u2720",
      maltese: "\u2720",
      Map: "\u2905",
      map: "\u21A6",
      mapsto: "\u21A6",
      mapstodown: "\u21A7",
      mapstoleft: "\u21A4",
      mapstoup: "\u21A5",
      marker: "\u25AE",
      mcomma: "\u2A29",
      Mcy: "\u041C",
      mcy: "\u043C",
      mdash: "\u2014",
      mDDot: "\u223A",
      measuredangle: "\u2221",
      MediumSpace: "\u205F",
      Mellintrf: "\u2133",
      Mfr: "\u{1D510}",
      mfr: "\u{1D52A}",
      mho: "\u2127",
      micro: "\xB5",
      midast: "*",
      midcir: "\u2AF0",
      mid: "\u2223",
      middot: "\xB7",
      minusb: "\u229F",
      minus: "\u2212",
      minusd: "\u2238",
      minusdu: "\u2A2A",
      MinusPlus: "\u2213",
      mlcp: "\u2ADB",
      mldr: "\u2026",
      mnplus: "\u2213",
      models: "\u22A7",
      Mopf: "\u{1D544}",
      mopf: "\u{1D55E}",
      mp: "\u2213",
      mscr: "\u{1D4C2}",
      Mscr: "\u2133",
      mstpos: "\u223E",
      Mu: "\u039C",
      mu: "\u03BC",
      multimap: "\u22B8",
      mumap: "\u22B8",
      nabla: "\u2207",
      Nacute: "\u0143",
      nacute: "\u0144",
      nang: "\u2220\u20D2",
      nap: "\u2249",
      napE: "\u2A70\u0338",
      napid: "\u224B\u0338",
      napos: "\u0149",
      napprox: "\u2249",
      natural: "\u266E",
      naturals: "\u2115",
      natur: "\u266E",
      nbsp: "\xA0",
      nbump: "\u224E\u0338",
      nbumpe: "\u224F\u0338",
      ncap: "\u2A43",
      Ncaron: "\u0147",
      ncaron: "\u0148",
      Ncedil: "\u0145",
      ncedil: "\u0146",
      ncong: "\u2247",
      ncongdot: "\u2A6D\u0338",
      ncup: "\u2A42",
      Ncy: "\u041D",
      ncy: "\u043D",
      ndash: "\u2013",
      nearhk: "\u2924",
      nearr: "\u2197",
      neArr: "\u21D7",
      nearrow: "\u2197",
      ne: "\u2260",
      nedot: "\u2250\u0338",
      NegativeMediumSpace: "\u200B",
      NegativeThickSpace: "\u200B",
      NegativeThinSpace: "\u200B",
      NegativeVeryThinSpace: "\u200B",
      nequiv: "\u2262",
      nesear: "\u2928",
      nesim: "\u2242\u0338",
      NestedGreaterGreater: "\u226B",
      NestedLessLess: "\u226A",
      NewLine: `
`,
      nexist: "\u2204",
      nexists: "\u2204",
      Nfr: "\u{1D511}",
      nfr: "\u{1D52B}",
      ngE: "\u2267\u0338",
      nge: "\u2271",
      ngeq: "\u2271",
      ngeqq: "\u2267\u0338",
      ngeqslant: "\u2A7E\u0338",
      nges: "\u2A7E\u0338",
      nGg: "\u22D9\u0338",
      ngsim: "\u2275",
      nGt: "\u226B\u20D2",
      ngt: "\u226F",
      ngtr: "\u226F",
      nGtv: "\u226B\u0338",
      nharr: "\u21AE",
      nhArr: "\u21CE",
      nhpar: "\u2AF2",
      ni: "\u220B",
      nis: "\u22FC",
      nisd: "\u22FA",
      niv: "\u220B",
      NJcy: "\u040A",
      njcy: "\u045A",
      nlarr: "\u219A",
      nlArr: "\u21CD",
      nldr: "\u2025",
      nlE: "\u2266\u0338",
      nle: "\u2270",
      nleftarrow: "\u219A",
      nLeftarrow: "\u21CD",
      nleftrightarrow: "\u21AE",
      nLeftrightarrow: "\u21CE",
      nleq: "\u2270",
      nleqq: "\u2266\u0338",
      nleqslant: "\u2A7D\u0338",
      nles: "\u2A7D\u0338",
      nless: "\u226E",
      nLl: "\u22D8\u0338",
      nlsim: "\u2274",
      nLt: "\u226A\u20D2",
      nlt: "\u226E",
      nltri: "\u22EA",
      nltrie: "\u22EC",
      nLtv: "\u226A\u0338",
      nmid: "\u2224",
      NoBreak: "\u2060",
      NonBreakingSpace: "\xA0",
      nopf: "\u{1D55F}",
      Nopf: "\u2115",
      Not: "\u2AEC",
      not: "\xAC",
      NotCongruent: "\u2262",
      NotCupCap: "\u226D",
      NotDoubleVerticalBar: "\u2226",
      NotElement: "\u2209",
      NotEqual: "\u2260",
      NotEqualTilde: "\u2242\u0338",
      NotExists: "\u2204",
      NotGreater: "\u226F",
      NotGreaterEqual: "\u2271",
      NotGreaterFullEqual: "\u2267\u0338",
      NotGreaterGreater: "\u226B\u0338",
      NotGreaterLess: "\u2279",
      NotGreaterSlantEqual: "\u2A7E\u0338",
      NotGreaterTilde: "\u2275",
      NotHumpDownHump: "\u224E\u0338",
      NotHumpEqual: "\u224F\u0338",
      notin: "\u2209",
      notindot: "\u22F5\u0338",
      notinE: "\u22F9\u0338",
      notinva: "\u2209",
      notinvb: "\u22F7",
      notinvc: "\u22F6",
      NotLeftTriangleBar: "\u29CF\u0338",
      NotLeftTriangle: "\u22EA",
      NotLeftTriangleEqual: "\u22EC",
      NotLess: "\u226E",
      NotLessEqual: "\u2270",
      NotLessGreater: "\u2278",
      NotLessLess: "\u226A\u0338",
      NotLessSlantEqual: "\u2A7D\u0338",
      NotLessTilde: "\u2274",
      NotNestedGreaterGreater: "\u2AA2\u0338",
      NotNestedLessLess: "\u2AA1\u0338",
      notni: "\u220C",
      notniva: "\u220C",
      notnivb: "\u22FE",
      notnivc: "\u22FD",
      NotPrecedes: "\u2280",
      NotPrecedesEqual: "\u2AAF\u0338",
      NotPrecedesSlantEqual: "\u22E0",
      NotReverseElement: "\u220C",
      NotRightTriangleBar: "\u29D0\u0338",
      NotRightTriangle: "\u22EB",
      NotRightTriangleEqual: "\u22ED",
      NotSquareSubset: "\u228F\u0338",
      NotSquareSubsetEqual: "\u22E2",
      NotSquareSuperset: "\u2290\u0338",
      NotSquareSupersetEqual: "\u22E3",
      NotSubset: "\u2282\u20D2",
      NotSubsetEqual: "\u2288",
      NotSucceeds: "\u2281",
      NotSucceedsEqual: "\u2AB0\u0338",
      NotSucceedsSlantEqual: "\u22E1",
      NotSucceedsTilde: "\u227F\u0338",
      NotSuperset: "\u2283\u20D2",
      NotSupersetEqual: "\u2289",
      NotTilde: "\u2241",
      NotTildeEqual: "\u2244",
      NotTildeFullEqual: "\u2247",
      NotTildeTilde: "\u2249",
      NotVerticalBar: "\u2224",
      nparallel: "\u2226",
      npar: "\u2226",
      nparsl: "\u2AFD\u20E5",
      npart: "\u2202\u0338",
      npolint: "\u2A14",
      npr: "\u2280",
      nprcue: "\u22E0",
      nprec: "\u2280",
      npreceq: "\u2AAF\u0338",
      npre: "\u2AAF\u0338",
      nrarrc: "\u2933\u0338",
      nrarr: "\u219B",
      nrArr: "\u21CF",
      nrarrw: "\u219D\u0338",
      nrightarrow: "\u219B",
      nRightarrow: "\u21CF",
      nrtri: "\u22EB",
      nrtrie: "\u22ED",
      nsc: "\u2281",
      nsccue: "\u22E1",
      nsce: "\u2AB0\u0338",
      Nscr: "\u{1D4A9}",
      nscr: "\u{1D4C3}",
      nshortmid: "\u2224",
      nshortparallel: "\u2226",
      nsim: "\u2241",
      nsime: "\u2244",
      nsimeq: "\u2244",
      nsmid: "\u2224",
      nspar: "\u2226",
      nsqsube: "\u22E2",
      nsqsupe: "\u22E3",
      nsub: "\u2284",
      nsubE: "\u2AC5\u0338",
      nsube: "\u2288",
      nsubset: "\u2282\u20D2",
      nsubseteq: "\u2288",
      nsubseteqq: "\u2AC5\u0338",
      nsucc: "\u2281",
      nsucceq: "\u2AB0\u0338",
      nsup: "\u2285",
      nsupE: "\u2AC6\u0338",
      nsupe: "\u2289",
      nsupset: "\u2283\u20D2",
      nsupseteq: "\u2289",
      nsupseteqq: "\u2AC6\u0338",
      ntgl: "\u2279",
      Ntilde: "\xD1",
      ntilde: "\xF1",
      ntlg: "\u2278",
      ntriangleleft: "\u22EA",
      ntrianglelefteq: "\u22EC",
      ntriangleright: "\u22EB",
      ntrianglerighteq: "\u22ED",
      Nu: "\u039D",
      nu: "\u03BD",
      num: "#",
      numero: "\u2116",
      numsp: "\u2007",
      nvap: "\u224D\u20D2",
      nvdash: "\u22AC",
      nvDash: "\u22AD",
      nVdash: "\u22AE",
      nVDash: "\u22AF",
      nvge: "\u2265\u20D2",
      nvgt: ">\u20D2",
      nvHarr: "\u2904",
      nvinfin: "\u29DE",
      nvlArr: "\u2902",
      nvle: "\u2264\u20D2",
      nvlt: "<\u20D2",
      nvltrie: "\u22B4\u20D2",
      nvrArr: "\u2903",
      nvrtrie: "\u22B5\u20D2",
      nvsim: "\u223C\u20D2",
      nwarhk: "\u2923",
      nwarr: "\u2196",
      nwArr: "\u21D6",
      nwarrow: "\u2196",
      nwnear: "\u2927",
      Oacute: "\xD3",
      oacute: "\xF3",
      oast: "\u229B",
      Ocirc: "\xD4",
      ocirc: "\xF4",
      ocir: "\u229A",
      Ocy: "\u041E",
      ocy: "\u043E",
      odash: "\u229D",
      Odblac: "\u0150",
      odblac: "\u0151",
      odiv: "\u2A38",
      odot: "\u2299",
      odsold: "\u29BC",
      OElig: "\u0152",
      oelig: "\u0153",
      ofcir: "\u29BF",
      Ofr: "\u{1D512}",
      ofr: "\u{1D52C}",
      ogon: "\u02DB",
      Ograve: "\xD2",
      ograve: "\xF2",
      ogt: "\u29C1",
      ohbar: "\u29B5",
      ohm: "\u03A9",
      oint: "\u222E",
      olarr: "\u21BA",
      olcir: "\u29BE",
      olcross: "\u29BB",
      oline: "\u203E",
      olt: "\u29C0",
      Omacr: "\u014C",
      omacr: "\u014D",
      Omega: "\u03A9",
      omega: "\u03C9",
      Omicron: "\u039F",
      omicron: "\u03BF",
      omid: "\u29B6",
      ominus: "\u2296",
      Oopf: "\u{1D546}",
      oopf: "\u{1D560}",
      opar: "\u29B7",
      OpenCurlyDoubleQuote: "\u201C",
      OpenCurlyQuote: "\u2018",
      operp: "\u29B9",
      oplus: "\u2295",
      orarr: "\u21BB",
      Or: "\u2A54",
      or: "\u2228",
      ord: "\u2A5D",
      order: "\u2134",
      orderof: "\u2134",
      ordf: "\xAA",
      ordm: "\xBA",
      origof: "\u22B6",
      oror: "\u2A56",
      orslope: "\u2A57",
      orv: "\u2A5B",
      oS: "\u24C8",
      Oscr: "\u{1D4AA}",
      oscr: "\u2134",
      Oslash: "\xD8",
      oslash: "\xF8",
      osol: "\u2298",
      Otilde: "\xD5",
      otilde: "\xF5",
      otimesas: "\u2A36",
      Otimes: "\u2A37",
      otimes: "\u2297",
      Ouml: "\xD6",
      ouml: "\xF6",
      ovbar: "\u233D",
      OverBar: "\u203E",
      OverBrace: "\u23DE",
      OverBracket: "\u23B4",
      OverParenthesis: "\u23DC",
      para: "\xB6",
      parallel: "\u2225",
      par: "\u2225",
      parsim: "\u2AF3",
      parsl: "\u2AFD",
      part: "\u2202",
      PartialD: "\u2202",
      Pcy: "\u041F",
      pcy: "\u043F",
      percnt: "%",
      period: ".",
      permil: "\u2030",
      perp: "\u22A5",
      pertenk: "\u2031",
      Pfr: "\u{1D513}",
      pfr: "\u{1D52D}",
      Phi: "\u03A6",
      phi: "\u03C6",
      phiv: "\u03D5",
      phmmat: "\u2133",
      phone: "\u260E",
      Pi: "\u03A0",
      pi: "\u03C0",
      pitchfork: "\u22D4",
      piv: "\u03D6",
      planck: "\u210F",
      planckh: "\u210E",
      plankv: "\u210F",
      plusacir: "\u2A23",
      plusb: "\u229E",
      pluscir: "\u2A22",
      plus: "+",
      plusdo: "\u2214",
      plusdu: "\u2A25",
      pluse: "\u2A72",
      PlusMinus: "\xB1",
      plusmn: "\xB1",
      plussim: "\u2A26",
      plustwo: "\u2A27",
      pm: "\xB1",
      Poincareplane: "\u210C",
      pointint: "\u2A15",
      popf: "\u{1D561}",
      Popf: "\u2119",
      pound: "\xA3",
      prap: "\u2AB7",
      Pr: "\u2ABB",
      pr: "\u227A",
      prcue: "\u227C",
      precapprox: "\u2AB7",
      prec: "\u227A",
      preccurlyeq: "\u227C",
      Precedes: "\u227A",
      PrecedesEqual: "\u2AAF",
      PrecedesSlantEqual: "\u227C",
      PrecedesTilde: "\u227E",
      preceq: "\u2AAF",
      precnapprox: "\u2AB9",
      precneqq: "\u2AB5",
      precnsim: "\u22E8",
      pre: "\u2AAF",
      prE: "\u2AB3",
      precsim: "\u227E",
      prime: "\u2032",
      Prime: "\u2033",
      primes: "\u2119",
      prnap: "\u2AB9",
      prnE: "\u2AB5",
      prnsim: "\u22E8",
      prod: "\u220F",
      Product: "\u220F",
      profalar: "\u232E",
      profline: "\u2312",
      profsurf: "\u2313",
      prop: "\u221D",
      Proportional: "\u221D",
      Proportion: "\u2237",
      propto: "\u221D",
      prsim: "\u227E",
      prurel: "\u22B0",
      Pscr: "\u{1D4AB}",
      pscr: "\u{1D4C5}",
      Psi: "\u03A8",
      psi: "\u03C8",
      puncsp: "\u2008",
      Qfr: "\u{1D514}",
      qfr: "\u{1D52E}",
      qint: "\u2A0C",
      qopf: "\u{1D562}",
      Qopf: "\u211A",
      qprime: "\u2057",
      Qscr: "\u{1D4AC}",
      qscr: "\u{1D4C6}",
      quaternions: "\u210D",
      quatint: "\u2A16",
      quest: "?",
      questeq: "\u225F",
      quot: '"',
      QUOT: '"',
      rAarr: "\u21DB",
      race: "\u223D\u0331",
      Racute: "\u0154",
      racute: "\u0155",
      radic: "\u221A",
      raemptyv: "\u29B3",
      rang: "\u27E9",
      Rang: "\u27EB",
      rangd: "\u2992",
      range: "\u29A5",
      rangle: "\u27E9",
      raquo: "\xBB",
      rarrap: "\u2975",
      rarrb: "\u21E5",
      rarrbfs: "\u2920",
      rarrc: "\u2933",
      rarr: "\u2192",
      Rarr: "\u21A0",
      rArr: "\u21D2",
      rarrfs: "\u291E",
      rarrhk: "\u21AA",
      rarrlp: "\u21AC",
      rarrpl: "\u2945",
      rarrsim: "\u2974",
      Rarrtl: "\u2916",
      rarrtl: "\u21A3",
      rarrw: "\u219D",
      ratail: "\u291A",
      rAtail: "\u291C",
      ratio: "\u2236",
      rationals: "\u211A",
      rbarr: "\u290D",
      rBarr: "\u290F",
      RBarr: "\u2910",
      rbbrk: "\u2773",
      rbrace: "}",
      rbrack: "]",
      rbrke: "\u298C",
      rbrksld: "\u298E",
      rbrkslu: "\u2990",
      Rcaron: "\u0158",
      rcaron: "\u0159",
      Rcedil: "\u0156",
      rcedil: "\u0157",
      rceil: "\u2309",
      rcub: "}",
      Rcy: "\u0420",
      rcy: "\u0440",
      rdca: "\u2937",
      rdldhar: "\u2969",
      rdquo: "\u201D",
      rdquor: "\u201D",
      rdsh: "\u21B3",
      real: "\u211C",
      realine: "\u211B",
      realpart: "\u211C",
      reals: "\u211D",
      Re: "\u211C",
      rect: "\u25AD",
      reg: "\xAE",
      REG: "\xAE",
      ReverseElement: "\u220B",
      ReverseEquilibrium: "\u21CB",
      ReverseUpEquilibrium: "\u296F",
      rfisht: "\u297D",
      rfloor: "\u230B",
      rfr: "\u{1D52F}",
      Rfr: "\u211C",
      rHar: "\u2964",
      rhard: "\u21C1",
      rharu: "\u21C0",
      rharul: "\u296C",
      Rho: "\u03A1",
      rho: "\u03C1",
      rhov: "\u03F1",
      RightAngleBracket: "\u27E9",
      RightArrowBar: "\u21E5",
      rightarrow: "\u2192",
      RightArrow: "\u2192",
      Rightarrow: "\u21D2",
      RightArrowLeftArrow: "\u21C4",
      rightarrowtail: "\u21A3",
      RightCeiling: "\u2309",
      RightDoubleBracket: "\u27E7",
      RightDownTeeVector: "\u295D",
      RightDownVectorBar: "\u2955",
      RightDownVector: "\u21C2",
      RightFloor: "\u230B",
      rightharpoondown: "\u21C1",
      rightharpoonup: "\u21C0",
      rightleftarrows: "\u21C4",
      rightleftharpoons: "\u21CC",
      rightrightarrows: "\u21C9",
      rightsquigarrow: "\u219D",
      RightTeeArrow: "\u21A6",
      RightTee: "\u22A2",
      RightTeeVector: "\u295B",
      rightthreetimes: "\u22CC",
      RightTriangleBar: "\u29D0",
      RightTriangle: "\u22B3",
      RightTriangleEqual: "\u22B5",
      RightUpDownVector: "\u294F",
      RightUpTeeVector: "\u295C",
      RightUpVectorBar: "\u2954",
      RightUpVector: "\u21BE",
      RightVectorBar: "\u2953",
      RightVector: "\u21C0",
      ring: "\u02DA",
      risingdotseq: "\u2253",
      rlarr: "\u21C4",
      rlhar: "\u21CC",
      rlm: "\u200F",
      rmoustache: "\u23B1",
      rmoust: "\u23B1",
      rnmid: "\u2AEE",
      roang: "\u27ED",
      roarr: "\u21FE",
      robrk: "\u27E7",
      ropar: "\u2986",
      ropf: "\u{1D563}",
      Ropf: "\u211D",
      roplus: "\u2A2E",
      rotimes: "\u2A35",
      RoundImplies: "\u2970",
      rpar: ")",
      rpargt: "\u2994",
      rppolint: "\u2A12",
      rrarr: "\u21C9",
      Rrightarrow: "\u21DB",
      rsaquo: "\u203A",
      rscr: "\u{1D4C7}",
      Rscr: "\u211B",
      rsh: "\u21B1",
      Rsh: "\u21B1",
      rsqb: "]",
      rsquo: "\u2019",
      rsquor: "\u2019",
      rthree: "\u22CC",
      rtimes: "\u22CA",
      rtri: "\u25B9",
      rtrie: "\u22B5",
      rtrif: "\u25B8",
      rtriltri: "\u29CE",
      RuleDelayed: "\u29F4",
      ruluhar: "\u2968",
      rx: "\u211E",
      Sacute: "\u015A",
      sacute: "\u015B",
      sbquo: "\u201A",
      scap: "\u2AB8",
      Scaron: "\u0160",
      scaron: "\u0161",
      Sc: "\u2ABC",
      sc: "\u227B",
      sccue: "\u227D",
      sce: "\u2AB0",
      scE: "\u2AB4",
      Scedil: "\u015E",
      scedil: "\u015F",
      Scirc: "\u015C",
      scirc: "\u015D",
      scnap: "\u2ABA",
      scnE: "\u2AB6",
      scnsim: "\u22E9",
      scpolint: "\u2A13",
      scsim: "\u227F",
      Scy: "\u0421",
      scy: "\u0441",
      sdotb: "\u22A1",
      sdot: "\u22C5",
      sdote: "\u2A66",
      searhk: "\u2925",
      searr: "\u2198",
      seArr: "\u21D8",
      searrow: "\u2198",
      sect: "\xA7",
      semi: ";",
      seswar: "\u2929",
      setminus: "\u2216",
      setmn: "\u2216",
      sext: "\u2736",
      Sfr: "\u{1D516}",
      sfr: "\u{1D530}",
      sfrown: "\u2322",
      sharp: "\u266F",
      SHCHcy: "\u0429",
      shchcy: "\u0449",
      SHcy: "\u0428",
      shcy: "\u0448",
      ShortDownArrow: "\u2193",
      ShortLeftArrow: "\u2190",
      shortmid: "\u2223",
      shortparallel: "\u2225",
      ShortRightArrow: "\u2192",
      ShortUpArrow: "\u2191",
      shy: "\xAD",
      Sigma: "\u03A3",
      sigma: "\u03C3",
      sigmaf: "\u03C2",
      sigmav: "\u03C2",
      sim: "\u223C",
      simdot: "\u2A6A",
      sime: "\u2243",
      simeq: "\u2243",
      simg: "\u2A9E",
      simgE: "\u2AA0",
      siml: "\u2A9D",
      simlE: "\u2A9F",
      simne: "\u2246",
      simplus: "\u2A24",
      simrarr: "\u2972",
      slarr: "\u2190",
      SmallCircle: "\u2218",
      smallsetminus: "\u2216",
      smashp: "\u2A33",
      smeparsl: "\u29E4",
      smid: "\u2223",
      smile: "\u2323",
      smt: "\u2AAA",
      smte: "\u2AAC",
      smtes: "\u2AAC\uFE00",
      SOFTcy: "\u042C",
      softcy: "\u044C",
      solbar: "\u233F",
      solb: "\u29C4",
      sol: "/",
      Sopf: "\u{1D54A}",
      sopf: "\u{1D564}",
      spades: "\u2660",
      spadesuit: "\u2660",
      spar: "\u2225",
      sqcap: "\u2293",
      sqcaps: "\u2293\uFE00",
      sqcup: "\u2294",
      sqcups: "\u2294\uFE00",
      Sqrt: "\u221A",
      sqsub: "\u228F",
      sqsube: "\u2291",
      sqsubset: "\u228F",
      sqsubseteq: "\u2291",
      sqsup: "\u2290",
      sqsupe: "\u2292",
      sqsupset: "\u2290",
      sqsupseteq: "\u2292",
      square: "\u25A1",
      Square: "\u25A1",
      SquareIntersection: "\u2293",
      SquareSubset: "\u228F",
      SquareSubsetEqual: "\u2291",
      SquareSuperset: "\u2290",
      SquareSupersetEqual: "\u2292",
      SquareUnion: "\u2294",
      squarf: "\u25AA",
      squ: "\u25A1",
      squf: "\u25AA",
      srarr: "\u2192",
      Sscr: "\u{1D4AE}",
      sscr: "\u{1D4C8}",
      ssetmn: "\u2216",
      ssmile: "\u2323",
      sstarf: "\u22C6",
      Star: "\u22C6",
      star: "\u2606",
      starf: "\u2605",
      straightepsilon: "\u03F5",
      straightphi: "\u03D5",
      strns: "\xAF",
      sub: "\u2282",
      Sub: "\u22D0",
      subdot: "\u2ABD",
      subE: "\u2AC5",
      sube: "\u2286",
      subedot: "\u2AC3",
      submult: "\u2AC1",
      subnE: "\u2ACB",
      subne: "\u228A",
      subplus: "\u2ABF",
      subrarr: "\u2979",
      subset: "\u2282",
      Subset: "\u22D0",
      subseteq: "\u2286",
      subseteqq: "\u2AC5",
      SubsetEqual: "\u2286",
      subsetneq: "\u228A",
      subsetneqq: "\u2ACB",
      subsim: "\u2AC7",
      subsub: "\u2AD5",
      subsup: "\u2AD3",
      succapprox: "\u2AB8",
      succ: "\u227B",
      succcurlyeq: "\u227D",
      Succeeds: "\u227B",
      SucceedsEqual: "\u2AB0",
      SucceedsSlantEqual: "\u227D",
      SucceedsTilde: "\u227F",
      succeq: "\u2AB0",
      succnapprox: "\u2ABA",
      succneqq: "\u2AB6",
      succnsim: "\u22E9",
      succsim: "\u227F",
      SuchThat: "\u220B",
      sum: "\u2211",
      Sum: "\u2211",
      sung: "\u266A",
      sup1: "\xB9",
      sup2: "\xB2",
      sup3: "\xB3",
      sup: "\u2283",
      Sup: "\u22D1",
      supdot: "\u2ABE",
      supdsub: "\u2AD8",
      supE: "\u2AC6",
      supe: "\u2287",
      supedot: "\u2AC4",
      Superset: "\u2283",
      SupersetEqual: "\u2287",
      suphsol: "\u27C9",
      suphsub: "\u2AD7",
      suplarr: "\u297B",
      supmult: "\u2AC2",
      supnE: "\u2ACC",
      supne: "\u228B",
      supplus: "\u2AC0",
      supset: "\u2283",
      Supset: "\u22D1",
      supseteq: "\u2287",
      supseteqq: "\u2AC6",
      supsetneq: "\u228B",
      supsetneqq: "\u2ACC",
      supsim: "\u2AC8",
      supsub: "\u2AD4",
      supsup: "\u2AD6",
      swarhk: "\u2926",
      swarr: "\u2199",
      swArr: "\u21D9",
      swarrow: "\u2199",
      swnwar: "\u292A",
      szlig: "\xDF",
      Tab: "	",
      target: "\u2316",
      Tau: "\u03A4",
      tau: "\u03C4",
      tbrk: "\u23B4",
      Tcaron: "\u0164",
      tcaron: "\u0165",
      Tcedil: "\u0162",
      tcedil: "\u0163",
      Tcy: "\u0422",
      tcy: "\u0442",
      tdot: "\u20DB",
      telrec: "\u2315",
      Tfr: "\u{1D517}",
      tfr: "\u{1D531}",
      there4: "\u2234",
      therefore: "\u2234",
      Therefore: "\u2234",
      Theta: "\u0398",
      theta: "\u03B8",
      thetasym: "\u03D1",
      thetav: "\u03D1",
      thickapprox: "\u2248",
      thicksim: "\u223C",
      ThickSpace: "\u205F\u200A",
      ThinSpace: "\u2009",
      thinsp: "\u2009",
      thkap: "\u2248",
      thksim: "\u223C",
      THORN: "\xDE",
      thorn: "\xFE",
      tilde: "\u02DC",
      Tilde: "\u223C",
      TildeEqual: "\u2243",
      TildeFullEqual: "\u2245",
      TildeTilde: "\u2248",
      timesbar: "\u2A31",
      timesb: "\u22A0",
      times: "\xD7",
      timesd: "\u2A30",
      tint: "\u222D",
      toea: "\u2928",
      topbot: "\u2336",
      topcir: "\u2AF1",
      top: "\u22A4",
      Topf: "\u{1D54B}",
      topf: "\u{1D565}",
      topfork: "\u2ADA",
      tosa: "\u2929",
      tprime: "\u2034",
      trade: "\u2122",
      TRADE: "\u2122",
      triangle: "\u25B5",
      triangledown: "\u25BF",
      triangleleft: "\u25C3",
      trianglelefteq: "\u22B4",
      triangleq: "\u225C",
      triangleright: "\u25B9",
      trianglerighteq: "\u22B5",
      tridot: "\u25EC",
      trie: "\u225C",
      triminus: "\u2A3A",
      TripleDot: "\u20DB",
      triplus: "\u2A39",
      trisb: "\u29CD",
      tritime: "\u2A3B",
      trpezium: "\u23E2",
      Tscr: "\u{1D4AF}",
      tscr: "\u{1D4C9}",
      TScy: "\u0426",
      tscy: "\u0446",
      TSHcy: "\u040B",
      tshcy: "\u045B",
      Tstrok: "\u0166",
      tstrok: "\u0167",
      twixt: "\u226C",
      twoheadleftarrow: "\u219E",
      twoheadrightarrow: "\u21A0",
      Uacute: "\xDA",
      uacute: "\xFA",
      uarr: "\u2191",
      Uarr: "\u219F",
      uArr: "\u21D1",
      Uarrocir: "\u2949",
      Ubrcy: "\u040E",
      ubrcy: "\u045E",
      Ubreve: "\u016C",
      ubreve: "\u016D",
      Ucirc: "\xDB",
      ucirc: "\xFB",
      Ucy: "\u0423",
      ucy: "\u0443",
      udarr: "\u21C5",
      Udblac: "\u0170",
      udblac: "\u0171",
      udhar: "\u296E",
      ufisht: "\u297E",
      Ufr: "\u{1D518}",
      ufr: "\u{1D532}",
      Ugrave: "\xD9",
      ugrave: "\xF9",
      uHar: "\u2963",
      uharl: "\u21BF",
      uharr: "\u21BE",
      uhblk: "\u2580",
      ulcorn: "\u231C",
      ulcorner: "\u231C",
      ulcrop: "\u230F",
      ultri: "\u25F8",
      Umacr: "\u016A",
      umacr: "\u016B",
      uml: "\xA8",
      UnderBar: "_",
      UnderBrace: "\u23DF",
      UnderBracket: "\u23B5",
      UnderParenthesis: "\u23DD",
      Union: "\u22C3",
      UnionPlus: "\u228E",
      Uogon: "\u0172",
      uogon: "\u0173",
      Uopf: "\u{1D54C}",
      uopf: "\u{1D566}",
      UpArrowBar: "\u2912",
      uparrow: "\u2191",
      UpArrow: "\u2191",
      Uparrow: "\u21D1",
      UpArrowDownArrow: "\u21C5",
      updownarrow: "\u2195",
      UpDownArrow: "\u2195",
      Updownarrow: "\u21D5",
      UpEquilibrium: "\u296E",
      upharpoonleft: "\u21BF",
      upharpoonright: "\u21BE",
      uplus: "\u228E",
      UpperLeftArrow: "\u2196",
      UpperRightArrow: "\u2197",
      upsi: "\u03C5",
      Upsi: "\u03D2",
      upsih: "\u03D2",
      Upsilon: "\u03A5",
      upsilon: "\u03C5",
      UpTeeArrow: "\u21A5",
      UpTee: "\u22A5",
      upuparrows: "\u21C8",
      urcorn: "\u231D",
      urcorner: "\u231D",
      urcrop: "\u230E",
      Uring: "\u016E",
      uring: "\u016F",
      urtri: "\u25F9",
      Uscr: "\u{1D4B0}",
      uscr: "\u{1D4CA}",
      utdot: "\u22F0",
      Utilde: "\u0168",
      utilde: "\u0169",
      utri: "\u25B5",
      utrif: "\u25B4",
      uuarr: "\u21C8",
      Uuml: "\xDC",
      uuml: "\xFC",
      uwangle: "\u29A7",
      vangrt: "\u299C",
      varepsilon: "\u03F5",
      varkappa: "\u03F0",
      varnothing: "\u2205",
      varphi: "\u03D5",
      varpi: "\u03D6",
      varpropto: "\u221D",
      varr: "\u2195",
      vArr: "\u21D5",
      varrho: "\u03F1",
      varsigma: "\u03C2",
      varsubsetneq: "\u228A\uFE00",
      varsubsetneqq: "\u2ACB\uFE00",
      varsupsetneq: "\u228B\uFE00",
      varsupsetneqq: "\u2ACC\uFE00",
      vartheta: "\u03D1",
      vartriangleleft: "\u22B2",
      vartriangleright: "\u22B3",
      vBar: "\u2AE8",
      Vbar: "\u2AEB",
      vBarv: "\u2AE9",
      Vcy: "\u0412",
      vcy: "\u0432",
      vdash: "\u22A2",
      vDash: "\u22A8",
      Vdash: "\u22A9",
      VDash: "\u22AB",
      Vdashl: "\u2AE6",
      veebar: "\u22BB",
      vee: "\u2228",
      Vee: "\u22C1",
      veeeq: "\u225A",
      vellip: "\u22EE",
      verbar: "|",
      Verbar: "\u2016",
      vert: "|",
      Vert: "\u2016",
      VerticalBar: "\u2223",
      VerticalLine: "|",
      VerticalSeparator: "\u2758",
      VerticalTilde: "\u2240",
      VeryThinSpace: "\u200A",
      Vfr: "\u{1D519}",
      vfr: "\u{1D533}",
      vltri: "\u22B2",
      vnsub: "\u2282\u20D2",
      vnsup: "\u2283\u20D2",
      Vopf: "\u{1D54D}",
      vopf: "\u{1D567}",
      vprop: "\u221D",
      vrtri: "\u22B3",
      Vscr: "\u{1D4B1}",
      vscr: "\u{1D4CB}",
      vsubnE: "\u2ACB\uFE00",
      vsubne: "\u228A\uFE00",
      vsupnE: "\u2ACC\uFE00",
      vsupne: "\u228B\uFE00",
      Vvdash: "\u22AA",
      vzigzag: "\u299A",
      Wcirc: "\u0174",
      wcirc: "\u0175",
      wedbar: "\u2A5F",
      wedge: "\u2227",
      Wedge: "\u22C0",
      wedgeq: "\u2259",
      weierp: "\u2118",
      Wfr: "\u{1D51A}",
      wfr: "\u{1D534}",
      Wopf: "\u{1D54E}",
      wopf: "\u{1D568}",
      wp: "\u2118",
      wr: "\u2240",
      wreath: "\u2240",
      Wscr: "\u{1D4B2}",
      wscr: "\u{1D4CC}",
      xcap: "\u22C2",
      xcirc: "\u25EF",
      xcup: "\u22C3",
      xdtri: "\u25BD",
      Xfr: "\u{1D51B}",
      xfr: "\u{1D535}",
      xharr: "\u27F7",
      xhArr: "\u27FA",
      Xi: "\u039E",
      xi: "\u03BE",
      xlarr: "\u27F5",
      xlArr: "\u27F8",
      xmap: "\u27FC",
      xnis: "\u22FB",
      xodot: "\u2A00",
      Xopf: "\u{1D54F}",
      xopf: "\u{1D569}",
      xoplus: "\u2A01",
      xotime: "\u2A02",
      xrarr: "\u27F6",
      xrArr: "\u27F9",
      Xscr: "\u{1D4B3}",
      xscr: "\u{1D4CD}",
      xsqcup: "\u2A06",
      xuplus: "\u2A04",
      xutri: "\u25B3",
      xvee: "\u22C1",
      xwedge: "\u22C0",
      Yacute: "\xDD",
      yacute: "\xFD",
      YAcy: "\u042F",
      yacy: "\u044F",
      Ycirc: "\u0176",
      ycirc: "\u0177",
      Ycy: "\u042B",
      ycy: "\u044B",
      yen: "\xA5",
      Yfr: "\u{1D51C}",
      yfr: "\u{1D536}",
      YIcy: "\u0407",
      yicy: "\u0457",
      Yopf: "\u{1D550}",
      yopf: "\u{1D56A}",
      Yscr: "\u{1D4B4}",
      yscr: "\u{1D4CE}",
      YUcy: "\u042E",
      yucy: "\u044E",
      yuml: "\xFF",
      Yuml: "\u0178",
      Zacute: "\u0179",
      zacute: "\u017A",
      Zcaron: "\u017D",
      zcaron: "\u017E",
      Zcy: "\u0417",
      zcy: "\u0437",
      Zdot: "\u017B",
      zdot: "\u017C",
      zeetrf: "\u2128",
      ZeroWidthSpace: "\u200B",
      Zeta: "\u0396",
      zeta: "\u03B6",
      zfr: "\u{1D537}",
      Zfr: "\u2128",
      ZHcy: "\u0416",
      zhcy: "\u0436",
      zigrarr: "\u21DD",
      zopf: "\u{1D56B}",
      Zopf: "\u2124",
      Zscr: "\u{1D4B5}",
      zscr: "\u{1D4CF}",
      zwj: "\u200D",
      zwnj: "\u200C",
    };
  });
  var Za = U((hx, Sw) => {
    Sw.exports = {
      Aacute: "\xC1",
      aacute: "\xE1",
      Acirc: "\xC2",
      acirc: "\xE2",
      acute: "\xB4",
      AElig: "\xC6",
      aelig: "\xE6",
      Agrave: "\xC0",
      agrave: "\xE0",
      amp: "&",
      AMP: "&",
      Aring: "\xC5",
      aring: "\xE5",
      Atilde: "\xC3",
      atilde: "\xE3",
      Auml: "\xC4",
      auml: "\xE4",
      brvbar: "\xA6",
      Ccedil: "\xC7",
      ccedil: "\xE7",
      cedil: "\xB8",
      cent: "\xA2",
      copy: "\xA9",
      COPY: "\xA9",
      curren: "\xA4",
      deg: "\xB0",
      divide: "\xF7",
      Eacute: "\xC9",
      eacute: "\xE9",
      Ecirc: "\xCA",
      ecirc: "\xEA",
      Egrave: "\xC8",
      egrave: "\xE8",
      ETH: "\xD0",
      eth: "\xF0",
      Euml: "\xCB",
      euml: "\xEB",
      frac12: "\xBD",
      frac14: "\xBC",
      frac34: "\xBE",
      gt: ">",
      GT: ">",
      Iacute: "\xCD",
      iacute: "\xED",
      Icirc: "\xCE",
      icirc: "\xEE",
      iexcl: "\xA1",
      Igrave: "\xCC",
      igrave: "\xEC",
      iquest: "\xBF",
      Iuml: "\xCF",
      iuml: "\xEF",
      laquo: "\xAB",
      lt: "<",
      LT: "<",
      macr: "\xAF",
      micro: "\xB5",
      middot: "\xB7",
      nbsp: "\xA0",
      not: "\xAC",
      Ntilde: "\xD1",
      ntilde: "\xF1",
      Oacute: "\xD3",
      oacute: "\xF3",
      Ocirc: "\xD4",
      ocirc: "\xF4",
      Ograve: "\xD2",
      ograve: "\xF2",
      ordf: "\xAA",
      ordm: "\xBA",
      Oslash: "\xD8",
      oslash: "\xF8",
      Otilde: "\xD5",
      otilde: "\xF5",
      Ouml: "\xD6",
      ouml: "\xF6",
      para: "\xB6",
      plusmn: "\xB1",
      pound: "\xA3",
      quot: '"',
      QUOT: '"',
      raquo: "\xBB",
      reg: "\xAE",
      REG: "\xAE",
      sect: "\xA7",
      shy: "\xAD",
      sup1: "\xB9",
      sup2: "\xB2",
      sup3: "\xB3",
      szlig: "\xDF",
      THORN: "\xDE",
      thorn: "\xFE",
      times: "\xD7",
      Uacute: "\xDA",
      uacute: "\xFA",
      Ucirc: "\xDB",
      ucirc: "\xFB",
      Ugrave: "\xD9",
      ugrave: "\xF9",
      uml: "\xA8",
      Uuml: "\xDC",
      uuml: "\xFC",
      Yacute: "\xDD",
      yacute: "\xFD",
      yen: "\xA5",
      yuml: "\xFF",
    };
  });
  var Ru = U((px, Tw) => {
    Tw.exports = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  });
  var ho = U((dx, tp) => {
    tp.exports = k;
    var Lw = Ya(),
      qw = Fu(),
      _h = Za(),
      Bw = Ru(),
      z = 0,
      yt = z++,
      vh = z++,
      Fr = z++,
      yh = z++,
      Ah = z++,
      Qn = z++,
      bh = z++,
      _r = z++,
      Iu = z++,
      Qa = z++,
      to = z++,
      eo = z++,
      ro = z++,
      no = z++,
      wh = z++,
      nr = z++,
      Dh = z++,
      Eh = z++,
      ti = z++,
      io = z++,
      uo = z++,
      Ch = z++,
      xh = z++,
      Sh = z++,
      Th = z++,
      Lh = z++,
      qh = z++,
      Ou = z++,
      so = z++,
      ao = z++,
      Bh = z++,
      Fh = z++,
      Rh = z++,
      Ih = z++,
      Oh = z++,
      Mh = z++,
      Nh = z++,
      kh = z++,
      Uh = z++,
      Ph = z++,
      $h = z++,
      Hh = z++,
      Gh = z++,
      Vh = z++,
      Wh = z++,
      zh = z++,
      jh = z++,
      Jh = z++,
      Kh = z++,
      Xh = z++,
      ei = z++,
      Yh = z++,
      oo = z++,
      co = z++,
      lo = z++,
      fo = 0,
      pn = fo++,
      Zh = fo++,
      Qh = fo++;
    function re(t) {
      return (
        t === " " ||
        t ===
          `
` ||
        t === "	" ||
        t === "\f" ||
        t === "\r"
      );
    }
    function Fw(t, r) {
      return function (i) {
        i === t && (this._state = r);
      };
    }
    function ne(t, r, i) {
      var u = t.toLowerCase();
      return t === u
        ? function (a) {
            a === u ? (this._state = r) : ((this._state = i), this._index--);
          }
        : function (a) {
            a === u || a === t
              ? (this._state = r)
              : ((this._state = i), this._index--);
          };
    }
    function Rr(t, r) {
      var i = t.toLowerCase();
      return function (u) {
        u === i || u === t
          ? (this._state = r)
          : ((this._state = Fr), this._index--);
      };
    }
    function k(t, r) {
      ((this._state = yt),
        (this._buffer = ""),
        (this._sectionStart = 0),
        (this._index = 0),
        (this._bufferOffset = 0),
        (this._baseState = yt),
        (this._special = pn),
        (this._cbs = r),
        (this._running = !0),
        (this._ended = !1),
        (this._xmlMode = !!(t && t.xmlMode)),
        (this._decodeEntities = !!(t && t.decodeEntities)));
    }
    k.prototype._stateText = function (t) {
      t === "<"
        ? (this._index > this._sectionStart &&
            this._cbs.ontext(this._getSection()),
          (this._state = vh),
          (this._sectionStart = this._index))
        : this._decodeEntities &&
          this._special === pn &&
          t === "&" &&
          (this._index > this._sectionStart &&
            this._cbs.ontext(this._getSection()),
          (this._baseState = yt),
          (this._state = ei),
          (this._sectionStart = this._index));
    };
    k.prototype._stateBeforeTagName = function (t) {
      t === "/"
        ? (this._state = Ah)
        : t === "<"
          ? (this._cbs.ontext(this._getSection()),
            (this._sectionStart = this._index))
          : t === ">" || this._special !== pn || re(t)
            ? (this._state = yt)
            : t === "!"
              ? ((this._state = wh), (this._sectionStart = this._index + 1))
              : t === "?"
                ? ((this._state = Dh), (this._sectionStart = this._index + 1))
                : ((this._state =
                    !this._xmlMode && (t === "s" || t === "S") ? Bh : Fr),
                  (this._sectionStart = this._index));
    };
    k.prototype._stateInTagName = function (t) {
      (t === "/" || t === ">" || re(t)) &&
        (this._emitToken("onopentagname"), (this._state = _r), this._index--);
    };
    k.prototype._stateBeforeCloseingTagName = function (t) {
      re(t) ||
        (t === ">"
          ? (this._state = yt)
          : this._special !== pn
            ? t === "s" || t === "S"
              ? (this._state = Fh)
              : ((this._state = yt), this._index--)
            : ((this._state = Qn), (this._sectionStart = this._index)));
    };
    k.prototype._stateInCloseingTagName = function (t) {
      (t === ">" || re(t)) &&
        (this._emitToken("onclosetag"), (this._state = bh), this._index--);
    };
    k.prototype._stateAfterCloseingTagName = function (t) {
      t === ">" && ((this._state = yt), (this._sectionStart = this._index + 1));
    };
    k.prototype._stateBeforeAttributeName = function (t) {
      t === ">"
        ? (this._cbs.onopentagend(),
          (this._state = yt),
          (this._sectionStart = this._index + 1))
        : t === "/"
          ? (this._state = yh)
          : re(t) || ((this._state = Iu), (this._sectionStart = this._index));
    };
    k.prototype._stateInSelfClosingTag = function (t) {
      t === ">"
        ? (this._cbs.onselfclosingtag(),
          (this._state = yt),
          (this._sectionStart = this._index + 1))
        : re(t) || ((this._state = _r), this._index--);
    };
    k.prototype._stateInAttributeName = function (t) {
      (t === "=" || t === "/" || t === ">" || re(t)) &&
        (this._cbs.onattribname(this._getSection()),
        (this._sectionStart = -1),
        (this._state = Qa),
        this._index--);
    };
    k.prototype._stateAfterAttributeName = function (t) {
      t === "="
        ? (this._state = to)
        : t === "/" || t === ">"
          ? (this._cbs.onattribend(), (this._state = _r), this._index--)
          : re(t) ||
            (this._cbs.onattribend(),
            (this._state = Iu),
            (this._sectionStart = this._index));
    };
    k.prototype._stateBeforeAttributeValue = function (t) {
      t === '"'
        ? ((this._state = eo), (this._sectionStart = this._index + 1))
        : t === "'"
          ? ((this._state = ro), (this._sectionStart = this._index + 1))
          : re(t) ||
            ((this._state = no),
            (this._sectionStart = this._index),
            this._index--);
    };
    k.prototype._stateInAttributeValueDoubleQuotes = function (t) {
      t === '"'
        ? (this._emitToken("onattribdata"),
          this._cbs.onattribend(),
          (this._state = _r))
        : this._decodeEntities &&
          t === "&" &&
          (this._emitToken("onattribdata"),
          (this._baseState = this._state),
          (this._state = ei),
          (this._sectionStart = this._index));
    };
    k.prototype._stateInAttributeValueSingleQuotes = function (t) {
      t === "'"
        ? (this._emitToken("onattribdata"),
          this._cbs.onattribend(),
          (this._state = _r))
        : this._decodeEntities &&
          t === "&" &&
          (this._emitToken("onattribdata"),
          (this._baseState = this._state),
          (this._state = ei),
          (this._sectionStart = this._index));
    };
    k.prototype._stateInAttributeValueNoQuotes = function (t) {
      re(t) || t === ">"
        ? (this._emitToken("onattribdata"),
          this._cbs.onattribend(),
          (this._state = _r),
          this._index--)
        : this._decodeEntities &&
          t === "&" &&
          (this._emitToken("onattribdata"),
          (this._baseState = this._state),
          (this._state = ei),
          (this._sectionStart = this._index));
    };
    k.prototype._stateBeforeDeclaration = function (t) {
      this._state = t === "[" ? Ch : t === "-" ? Eh : nr;
    };
    k.prototype._stateInDeclaration = function (t) {
      t === ">" &&
        (this._cbs.ondeclaration(this._getSection()),
        (this._state = yt),
        (this._sectionStart = this._index + 1));
    };
    k.prototype._stateInProcessingInstruction = function (t) {
      t === ">" &&
        (this._cbs.onprocessinginstruction(this._getSection()),
        (this._state = yt),
        (this._sectionStart = this._index + 1));
    };
    k.prototype._stateBeforeComment = function (t) {
      t === "-"
        ? ((this._state = ti), (this._sectionStart = this._index + 1))
        : (this._state = nr);
    };
    k.prototype._stateInComment = function (t) {
      t === "-" && (this._state = io);
    };
    k.prototype._stateAfterComment1 = function (t) {
      t === "-" ? (this._state = uo) : (this._state = ti);
    };
    k.prototype._stateAfterComment2 = function (t) {
      t === ">"
        ? (this._cbs.oncomment(
            this._buffer.substring(this._sectionStart, this._index - 2),
          ),
          (this._state = yt),
          (this._sectionStart = this._index + 1))
        : t !== "-" && (this._state = ti);
    };
    k.prototype._stateBeforeCdata1 = ne("C", xh, nr);
    k.prototype._stateBeforeCdata2 = ne("D", Sh, nr);
    k.prototype._stateBeforeCdata3 = ne("A", Th, nr);
    k.prototype._stateBeforeCdata4 = ne("T", Lh, nr);
    k.prototype._stateBeforeCdata5 = ne("A", qh, nr);
    k.prototype._stateBeforeCdata6 = function (t) {
      t === "["
        ? ((this._state = Ou), (this._sectionStart = this._index + 1))
        : ((this._state = nr), this._index--);
    };
    k.prototype._stateInCdata = function (t) {
      t === "]" && (this._state = so);
    };
    k.prototype._stateAfterCdata1 = Fw("]", ao);
    k.prototype._stateAfterCdata2 = function (t) {
      t === ">"
        ? (this._cbs.oncdata(
            this._buffer.substring(this._sectionStart, this._index - 2),
          ),
          (this._state = yt),
          (this._sectionStart = this._index + 1))
        : t !== "]" && (this._state = Ou);
    };
    k.prototype._stateBeforeSpecial = function (t) {
      t === "c" || t === "C"
        ? (this._state = Rh)
        : t === "t" || t === "T"
          ? (this._state = Gh)
          : ((this._state = Fr), this._index--);
    };
    k.prototype._stateBeforeSpecialEnd = function (t) {
      this._special === Zh && (t === "c" || t === "C")
        ? (this._state = kh)
        : this._special === Qh && (t === "t" || t === "T")
          ? (this._state = jh)
          : (this._state = yt);
    };
    k.prototype._stateBeforeScript1 = Rr("R", Ih);
    k.prototype._stateBeforeScript2 = Rr("I", Oh);
    k.prototype._stateBeforeScript3 = Rr("P", Mh);
    k.prototype._stateBeforeScript4 = Rr("T", Nh);
    k.prototype._stateBeforeScript5 = function (t) {
      ((t === "/" || t === ">" || re(t)) && (this._special = Zh),
        (this._state = Fr),
        this._index--);
    };
    k.prototype._stateAfterScript1 = ne("R", Uh, yt);
    k.prototype._stateAfterScript2 = ne("I", Ph, yt);
    k.prototype._stateAfterScript3 = ne("P", $h, yt);
    k.prototype._stateAfterScript4 = ne("T", Hh, yt);
    k.prototype._stateAfterScript5 = function (t) {
      t === ">" || re(t)
        ? ((this._special = pn),
          (this._state = Qn),
          (this._sectionStart = this._index - 6),
          this._index--)
        : (this._state = yt);
    };
    k.prototype._stateBeforeStyle1 = Rr("Y", Vh);
    k.prototype._stateBeforeStyle2 = Rr("L", Wh);
    k.prototype._stateBeforeStyle3 = Rr("E", zh);
    k.prototype._stateBeforeStyle4 = function (t) {
      ((t === "/" || t === ">" || re(t)) && (this._special = Qh),
        (this._state = Fr),
        this._index--);
    };
    k.prototype._stateAfterStyle1 = ne("Y", Jh, yt);
    k.prototype._stateAfterStyle2 = ne("L", Kh, yt);
    k.prototype._stateAfterStyle3 = ne("E", Xh, yt);
    k.prototype._stateAfterStyle4 = function (t) {
      t === ">" || re(t)
        ? ((this._special = pn),
          (this._state = Qn),
          (this._sectionStart = this._index - 5),
          this._index--)
        : (this._state = yt);
    };
    k.prototype._stateBeforeEntity = ne("#", Yh, oo);
    k.prototype._stateBeforeNumericEntity = ne("X", lo, co);
    k.prototype._parseNamedEntityStrict = function () {
      if (this._sectionStart + 1 < this._index) {
        var t = this._buffer.substring(this._sectionStart + 1, this._index),
          r = this._xmlMode ? Bw : qw;
        r.hasOwnProperty(t) &&
          (this._emitPartial(r[t]), (this._sectionStart = this._index + 1));
      }
    };
    k.prototype._parseLegacyEntity = function () {
      var t = this._sectionStart + 1,
        r = this._index - t;
      for (r > 6 && (r = 6); r >= 2;) {
        var i = this._buffer.substr(t, r);
        if (_h.hasOwnProperty(i)) {
          (this._emitPartial(_h[i]), (this._sectionStart += r + 1));
          return;
        } else r--;
      }
    };
    k.prototype._stateInNamedEntity = function (t) {
      t === ";"
        ? (this._parseNamedEntityStrict(),
          this._sectionStart + 1 < this._index &&
            !this._xmlMode &&
            this._parseLegacyEntity(),
          (this._state = this._baseState))
        : (t < "a" || t > "z") &&
          (t < "A" || t > "Z") &&
          (t < "0" || t > "9") &&
          (this._xmlMode ||
            this._sectionStart + 1 === this._index ||
            (this._baseState !== yt
              ? t !== "=" && this._parseNamedEntityStrict()
              : this._parseLegacyEntity()),
          (this._state = this._baseState),
          this._index--);
    };
    k.prototype._decodeNumericEntity = function (t, r) {
      var i = this._sectionStart + t;
      if (i !== this._index) {
        var u = this._buffer.substring(i, this._index),
          a = parseInt(u, r);
        (this._emitPartial(Lw(a)), (this._sectionStart = this._index));
      } else this._sectionStart--;
      this._state = this._baseState;
    };
    k.prototype._stateInNumericEntity = function (t) {
      t === ";"
        ? (this._decodeNumericEntity(2, 10), this._sectionStart++)
        : (t < "0" || t > "9") &&
          (this._xmlMode
            ? (this._state = this._baseState)
            : this._decodeNumericEntity(2, 10),
          this._index--);
    };
    k.prototype._stateInHexEntity = function (t) {
      t === ";"
        ? (this._decodeNumericEntity(3, 16), this._sectionStart++)
        : (t < "a" || t > "f") &&
          (t < "A" || t > "F") &&
          (t < "0" || t > "9") &&
          (this._xmlMode
            ? (this._state = this._baseState)
            : this._decodeNumericEntity(3, 16),
          this._index--);
    };
    k.prototype._cleanup = function () {
      this._sectionStart < 0
        ? ((this._buffer = ""),
          (this._bufferOffset += this._index),
          (this._index = 0))
        : this._running &&
          (this._state === yt
            ? (this._sectionStart !== this._index &&
                this._cbs.ontext(this._buffer.substr(this._sectionStart)),
              (this._buffer = ""),
              (this._bufferOffset += this._index),
              (this._index = 0))
            : this._sectionStart === this._index
              ? ((this._buffer = ""),
                (this._bufferOffset += this._index),
                (this._index = 0))
              : ((this._buffer = this._buffer.substr(this._sectionStart)),
                (this._index -= this._sectionStart),
                (this._bufferOffset += this._sectionStart)),
          (this._sectionStart = 0));
    };
    k.prototype.write = function (t) {
      (this._ended && this._cbs.onerror(Error(".write() after done!")),
        (this._buffer += t),
        this._parse());
    };
    k.prototype._parse = function () {
      for (; this._index < this._buffer.length && this._running;) {
        var t = this._buffer.charAt(this._index);
        (this._state === yt
          ? this._stateText(t)
          : this._state === vh
            ? this._stateBeforeTagName(t)
            : this._state === Fr
              ? this._stateInTagName(t)
              : this._state === Ah
                ? this._stateBeforeCloseingTagName(t)
                : this._state === Qn
                  ? this._stateInCloseingTagName(t)
                  : this._state === bh
                    ? this._stateAfterCloseingTagName(t)
                    : this._state === yh
                      ? this._stateInSelfClosingTag(t)
                      : this._state === _r
                        ? this._stateBeforeAttributeName(t)
                        : this._state === Iu
                          ? this._stateInAttributeName(t)
                          : this._state === Qa
                            ? this._stateAfterAttributeName(t)
                            : this._state === to
                              ? this._stateBeforeAttributeValue(t)
                              : this._state === eo
                                ? this._stateInAttributeValueDoubleQuotes(t)
                                : this._state === ro
                                  ? this._stateInAttributeValueSingleQuotes(t)
                                  : this._state === no
                                    ? this._stateInAttributeValueNoQuotes(t)
                                    : this._state === wh
                                      ? this._stateBeforeDeclaration(t)
                                      : this._state === nr
                                        ? this._stateInDeclaration(t)
                                        : this._state === Dh
                                          ? this._stateInProcessingInstruction(
                                              t,
                                            )
                                          : this._state === Eh
                                            ? this._stateBeforeComment(t)
                                            : this._state === ti
                                              ? this._stateInComment(t)
                                              : this._state === io
                                                ? this._stateAfterComment1(t)
                                                : this._state === uo
                                                  ? this._stateAfterComment2(t)
                                                  : this._state === Ch
                                                    ? this._stateBeforeCdata1(t)
                                                    : this._state === xh
                                                      ? this._stateBeforeCdata2(
                                                          t,
                                                        )
                                                      : this._state === Sh
                                                        ? this._stateBeforeCdata3(
                                                            t,
                                                          )
                                                        : this._state === Th
                                                          ? this._stateBeforeCdata4(
                                                              t,
                                                            )
                                                          : this._state === Lh
                                                            ? this._stateBeforeCdata5(
                                                                t,
                                                              )
                                                            : this._state === qh
                                                              ? this._stateBeforeCdata6(
                                                                  t,
                                                                )
                                                              : this._state ===
                                                                  Ou
                                                                ? this._stateInCdata(
                                                                    t,
                                                                  )
                                                                : this
                                                                      ._state ===
                                                                    so
                                                                  ? this._stateAfterCdata1(
                                                                      t,
                                                                    )
                                                                  : this
                                                                        ._state ===
                                                                      ao
                                                                    ? this._stateAfterCdata2(
                                                                        t,
                                                                      )
                                                                    : this
                                                                          ._state ===
                                                                        Bh
                                                                      ? this._stateBeforeSpecial(
                                                                          t,
                                                                        )
                                                                      : this
                                                                            ._state ===
                                                                          Fh
                                                                        ? this._stateBeforeSpecialEnd(
                                                                            t,
                                                                          )
                                                                        : this
                                                                              ._state ===
                                                                            Rh
                                                                          ? this._stateBeforeScript1(
                                                                              t,
                                                                            )
                                                                          : this
                                                                                ._state ===
                                                                              Ih
                                                                            ? this._stateBeforeScript2(
                                                                                t,
                                                                              )
                                                                            : this
                                                                                  ._state ===
                                                                                Oh
                                                                              ? this._stateBeforeScript3(
                                                                                  t,
                                                                                )
                                                                              : this
                                                                                    ._state ===
                                                                                  Mh
                                                                                ? this._stateBeforeScript4(
                                                                                    t,
                                                                                  )
                                                                                : this
                                                                                      ._state ===
                                                                                    Nh
                                                                                  ? this._stateBeforeScript5(
                                                                                      t,
                                                                                    )
                                                                                  : this
                                                                                        ._state ===
                                                                                      kh
                                                                                    ? this._stateAfterScript1(
                                                                                        t,
                                                                                      )
                                                                                    : this
                                                                                          ._state ===
                                                                                        Uh
                                                                                      ? this._stateAfterScript2(
                                                                                          t,
                                                                                        )
                                                                                      : this
                                                                                            ._state ===
                                                                                          Ph
                                                                                        ? this._stateAfterScript3(
                                                                                            t,
                                                                                          )
                                                                                        : this
                                                                                              ._state ===
                                                                                            $h
                                                                                          ? this._stateAfterScript4(
                                                                                              t,
                                                                                            )
                                                                                          : this
                                                                                                ._state ===
                                                                                              Hh
                                                                                            ? this._stateAfterScript5(
                                                                                                t,
                                                                                              )
                                                                                            : this
                                                                                                  ._state ===
                                                                                                Gh
                                                                                              ? this._stateBeforeStyle1(
                                                                                                  t,
                                                                                                )
                                                                                              : this
                                                                                                    ._state ===
                                                                                                  Vh
                                                                                                ? this._stateBeforeStyle2(
                                                                                                    t,
                                                                                                  )
                                                                                                : this
                                                                                                      ._state ===
                                                                                                    Wh
                                                                                                  ? this._stateBeforeStyle3(
                                                                                                      t,
                                                                                                    )
                                                                                                  : this
                                                                                                        ._state ===
                                                                                                      zh
                                                                                                    ? this._stateBeforeStyle4(
                                                                                                        t,
                                                                                                      )
                                                                                                    : this
                                                                                                          ._state ===
                                                                                                        jh
                                                                                                      ? this._stateAfterStyle1(
                                                                                                          t,
                                                                                                        )
                                                                                                      : this
                                                                                                            ._state ===
                                                                                                          Jh
                                                                                                        ? this._stateAfterStyle2(
                                                                                                            t,
                                                                                                          )
                                                                                                        : this
                                                                                                              ._state ===
                                                                                                            Kh
                                                                                                          ? this._stateAfterStyle3(
                                                                                                              t,
                                                                                                            )
                                                                                                          : this
                                                                                                                ._state ===
                                                                                                              Xh
                                                                                                            ? this._stateAfterStyle4(
                                                                                                                t,
                                                                                                              )
                                                                                                            : this
                                                                                                                  ._state ===
                                                                                                                ei
                                                                                                              ? this._stateBeforeEntity(
                                                                                                                  t,
                                                                                                                )
                                                                                                              : this
                                                                                                                    ._state ===
                                                                                                                  Yh
                                                                                                                ? this._stateBeforeNumericEntity(
                                                                                                                    t,
                                                                                                                  )
                                                                                                                : this
                                                                                                                      ._state ===
                                                                                                                    oo
                                                                                                                  ? this._stateInNamedEntity(
                                                                                                                      t,
                                                                                                                    )
                                                                                                                  : this
                                                                                                                        ._state ===
                                                                                                                      co
                                                                                                                    ? this._stateInNumericEntity(
                                                                                                                        t,
                                                                                                                      )
                                                                                                                    : this
                                                                                                                          ._state ===
                                                                                                                        lo
                                                                                                                      ? this._stateInHexEntity(
                                                                                                                          t,
                                                                                                                        )
                                                                                                                      : this._cbs.onerror(
                                                                                                                          Error(
                                                                                                                            "unknown _state",
                                                                                                                          ),
                                                                                                                          this
                                                                                                                            ._state,
                                                                                                                        ),
          this._index++);
      }
      this._cleanup();
    };
    k.prototype.pause = function () {
      this._running = !1;
    };
    k.prototype.resume = function () {
      ((this._running = !0),
        this._index < this._buffer.length && this._parse(),
        this._ended && this._finish());
    };
    k.prototype.end = function (t) {
      (this._ended && this._cbs.onerror(Error(".end() after done!")),
        t && this.write(t),
        (this._ended = !0),
        this._running && this._finish());
    };
    k.prototype._finish = function () {
      (this._sectionStart < this._index && this._handleTrailingData(),
        this._cbs.onend());
    };
    k.prototype._handleTrailingData = function () {
      var t = this._buffer.substr(this._sectionStart);
      this._state === Ou || this._state === so || this._state === ao
        ? this._cbs.oncdata(t)
        : this._state === ti || this._state === io || this._state === uo
          ? this._cbs.oncomment(t)
          : this._state === oo && !this._xmlMode
            ? (this._parseLegacyEntity(),
              this._sectionStart < this._index &&
                ((this._state = this._baseState), this._handleTrailingData()))
            : this._state === co && !this._xmlMode
              ? (this._decodeNumericEntity(2, 10),
                this._sectionStart < this._index &&
                  ((this._state = this._baseState), this._handleTrailingData()))
              : this._state === lo && !this._xmlMode
                ? (this._decodeNumericEntity(3, 16),
                  this._sectionStart < this._index &&
                    ((this._state = this._baseState),
                    this._handleTrailingData()))
                : this._state !== Fr &&
                  this._state !== _r &&
                  this._state !== to &&
                  this._state !== Qa &&
                  this._state !== Iu &&
                  this._state !== ro &&
                  this._state !== eo &&
                  this._state !== no &&
                  this._state !== Qn &&
                  this._cbs.ontext(t);
    };
    k.prototype.reset = function () {
      k.call(
        this,
        { xmlMode: this._xmlMode, decodeEntities: this._decodeEntities },
        this._cbs,
      );
    };
    k.prototype.getAbsoluteIndex = function () {
      return this._bufferOffset + this._index;
    };
    k.prototype._getSection = function () {
      return this._buffer.substring(this._sectionStart, this._index);
    };
    k.prototype._emitToken = function (t) {
      (this._cbs[t](this._getSection()), (this._sectionStart = -1));
    };
    k.prototype._emitPartial = function (t) {
      this._baseState !== yt ? this._cbs.onattribdata(t) : this._cbs.ontext(t);
    };
  });
  var go = U((gx, po) => {
    typeof Object.create == "function"
      ? (po.exports = function (r, i) {
          i &&
            ((r.super_ = i),
            (r.prototype = Object.create(i.prototype, {
              constructor: {
                value: r,
                enumerable: !1,
                writable: !0,
                configurable: !0,
              },
            })));
        })
      : (po.exports = function (r, i) {
          if (i) {
            r.super_ = i;
            var u = function () {};
            ((u.prototype = i.prototype),
              (r.prototype = new u()),
              (r.prototype.constructor = r));
          }
        });
  });
  var np = U((ep, rp) => {
    (function (t) {
      var r = Array.isArray
          ? Array.isArray
          : function (g) {
              return Object.prototype.toString.call(g) === "[object Array]";
            },
        i = 10;
      function u() {
        ((this._events = {}), this._conf && a.call(this, this._conf));
      }
      function a(h) {
        h &&
          ((this._conf = h),
          h.delimiter && (this.delimiter = h.delimiter),
          h.maxListeners && (this._events.maxListeners = h.maxListeners),
          h.wildcard && (this.wildcard = h.wildcard),
          h.newListener && (this.newListener = h.newListener),
          this.wildcard && (this.listenerTree = {}));
      }
      function c(h) {
        ((this._events = {}), (this.newListener = !1), a.call(this, h));
      }
      c.EventEmitter2 = c;
      function l(h, g, _, v) {
        if (!_) return [];
        var b = [],
          w,
          x,
          C,
          R,
          T,
          I,
          G,
          M = g.length,
          P = g[v],
          H = g[v + 1];
        if (v === M && _._listeners) {
          if (typeof _._listeners == "function")
            return (h && h.push(_._listeners), [_]);
          for (w = 0, x = _._listeners.length; w < x; w++)
            h && h.push(_._listeners[w]);
          return [_];
        }
        if (P === "*" || P === "**" || _[P]) {
          if (P === "*") {
            for (C in _)
              C !== "_listeners" &&
                _.hasOwnProperty(C) &&
                (b = b.concat(l(h, g, _[C], v + 1)));
            return b;
          } else if (P === "**") {
            ((G = v + 1 === M || (v + 2 === M && H === "*")),
              G && _._listeners && (b = b.concat(l(h, g, _, M))));
            for (C in _)
              C !== "_listeners" &&
                _.hasOwnProperty(C) &&
                (C === "*" || C === "**"
                  ? (_[C]._listeners && !G && (b = b.concat(l(h, g, _[C], M))),
                    (b = b.concat(l(h, g, _[C], v))))
                  : C === H
                    ? (b = b.concat(l(h, g, _[C], v + 2)))
                    : (b = b.concat(l(h, g, _[C], v))));
            return b;
          }
          b = b.concat(l(h, g, _[P], v + 1));
        }
        if (((R = _["*"]), R && l(h, g, R, v + 1), (T = _["**"]), T))
          if (v < M) {
            T._listeners && l(h, g, T, M);
            for (C in T)
              C !== "_listeners" &&
                T.hasOwnProperty(C) &&
                (C === H
                  ? l(h, g, T[C], v + 2)
                  : C === P
                    ? l(h, g, T[C], v + 1)
                    : ((I = {}), (I[C] = T[C]), l(h, g, { "**": I }, v + 1)));
          } else
            T._listeners
              ? l(h, g, T, M)
              : T["*"] && T["*"]._listeners && l(h, g, T["*"], M);
        return b;
      }
      function p(h, g) {
        h = typeof h == "string" ? h.split(this.delimiter) : h.slice();
        for (var _ = 0, v = h.length; _ + 1 < v; _++)
          if (h[_] === "**" && h[_ + 1] === "**") return;
        for (var b = this.listenerTree, w = h.shift(); w;) {
          if ((b[w] || (b[w] = {}), (b = b[w]), h.length === 0)) {
            if (!b._listeners) b._listeners = g;
            else if (typeof b._listeners == "function")
              b._listeners = [b._listeners, g];
            else if (
              r(b._listeners) &&
              (b._listeners.push(g), !b._listeners.warned)
            ) {
              var x = i;
              (typeof this._events.maxListeners != "undefined" &&
                (x = this._events.maxListeners),
                x > 0 &&
                  b._listeners.length > x &&
                  ((b._listeners.warned = !0),
                  console.error(
                    "(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.",
                    b._listeners.length,
                  ),
                  console.trace && console.trace()));
            }
            return !0;
          }
          w = h.shift();
        }
        return !0;
      }
      ((c.prototype.delimiter = "."),
        (c.prototype.setMaxListeners = function (h) {
          (this._events || u.call(this),
            (this._events.maxListeners = h),
            this._conf || (this._conf = {}),
            (this._conf.maxListeners = h));
        }),
        (c.prototype.event = ""),
        (c.prototype.once = function (h, g) {
          return (this.many(h, 1, g), this);
        }),
        (c.prototype.many = function (h, g, _) {
          var v = this;
          if (typeof _ != "function")
            throw new Error("many only accepts instances of Function");
          function b() {
            (--g === 0 && v.off(h, b), _.apply(this, arguments));
          }
          return ((b._origin = _), this.on(h, b), v);
        }),
        (c.prototype.emit = function () {
          this._events || u.call(this);
          var h = arguments[0];
          if (
            h === "newListener" &&
            !this.newListener &&
            !this._events.newListener
          )
            return !1;
          var g = arguments.length,
            _,
            v,
            b,
            w,
            x;
          if (this._all && this._all.length) {
            if (((x = this._all.slice()), g > 3))
              for (_ = new Array(g), w = 1; w < g; w++) _[w] = arguments[w];
            for (b = 0, v = x.length; b < v; b++)
              switch (((this.event = h), g)) {
                case 1:
                  x[b].call(this, h);
                  break;
                case 2:
                  x[b].call(this, h, arguments[1]);
                  break;
                case 3:
                  x[b].call(this, h, arguments[1], arguments[2]);
                  break;
                default:
                  x[b].apply(this, _);
              }
          }
          if (this.wildcard) {
            x = [];
            var C = typeof h == "string" ? h.split(this.delimiter) : h.slice();
            l.call(this, x, C, this.listenerTree, 0);
          } else if (((x = this._events[h]), typeof x == "function")) {
            switch (((this.event = h), g)) {
              case 1:
                x.call(this);
                break;
              case 2:
                x.call(this, arguments[1]);
                break;
              case 3:
                x.call(this, arguments[1], arguments[2]);
                break;
              default:
                for (_ = new Array(g - 1), w = 1; w < g; w++)
                  _[w - 1] = arguments[w];
                x.apply(this, _);
            }
            return !0;
          } else x && (x = x.slice());
          if (x && x.length) {
            if (g > 3)
              for (_ = new Array(g - 1), w = 1; w < g; w++)
                _[w - 1] = arguments[w];
            for (b = 0, v = x.length; b < v; b++)
              switch (((this.event = h), g)) {
                case 1:
                  x[b].call(this);
                  break;
                case 2:
                  x[b].call(this, arguments[1]);
                  break;
                case 3:
                  x[b].call(this, arguments[1], arguments[2]);
                  break;
                default:
                  x[b].apply(this, _);
              }
            return !0;
          } else if (!this._all && h === "error")
            throw arguments[1] instanceof Error
              ? arguments[1]
              : new Error("Uncaught, unspecified 'error' event.");
          return !!this._all;
        }),
        (c.prototype.emitAsync = function () {
          this._events || u.call(this);
          var h = arguments[0];
          if (
            h === "newListener" &&
            !this.newListener &&
            !this._events.newListener
          )
            return Promise.resolve([!1]);
          var g = [],
            _ = arguments.length,
            v,
            b,
            w,
            x,
            C;
          if (this._all) {
            if (_ > 3)
              for (v = new Array(_), x = 1; x < _; x++) v[x] = arguments[x];
            for (w = 0, b = this._all.length; w < b; w++)
              switch (((this.event = h), _)) {
                case 1:
                  g.push(this._all[w].call(this, h));
                  break;
                case 2:
                  g.push(this._all[w].call(this, h, arguments[1]));
                  break;
                case 3:
                  g.push(
                    this._all[w].call(this, h, arguments[1], arguments[2]),
                  );
                  break;
                default:
                  g.push(this._all[w].apply(this, v));
              }
          }
          if (this.wildcard) {
            C = [];
            var R = typeof h == "string" ? h.split(this.delimiter) : h.slice();
            l.call(this, C, R, this.listenerTree, 0);
          } else C = this._events[h];
          if (typeof C == "function")
            switch (((this.event = h), _)) {
              case 1:
                g.push(C.call(this));
                break;
              case 2:
                g.push(C.call(this, arguments[1]));
                break;
              case 3:
                g.push(C.call(this, arguments[1], arguments[2]));
                break;
              default:
                for (v = new Array(_ - 1), x = 1; x < _; x++)
                  v[x - 1] = arguments[x];
                g.push(C.apply(this, v));
            }
          else if (C && C.length) {
            if (_ > 3)
              for (v = new Array(_ - 1), x = 1; x < _; x++)
                v[x - 1] = arguments[x];
            for (w = 0, b = C.length; w < b; w++)
              switch (((this.event = h), _)) {
                case 1:
                  g.push(C[w].call(this));
                  break;
                case 2:
                  g.push(C[w].call(this, arguments[1]));
                  break;
                case 3:
                  g.push(C[w].call(this, arguments[1], arguments[2]));
                  break;
                default:
                  g.push(C[w].apply(this, v));
              }
          } else if (!this._all && h === "error")
            return arguments[1] instanceof Error
              ? Promise.reject(arguments[1])
              : Promise.reject("Uncaught, unspecified 'error' event.");
          return Promise.all(g);
        }),
        (c.prototype.on = function (h, g) {
          if (typeof h == "function") return (this.onAny(h), this);
          if (typeof g != "function")
            throw new Error("on only accepts instances of Function");
          if (
            (this._events || u.call(this),
            this.emit("newListener", h, g),
            this.wildcard)
          )
            return (p.call(this, h, g), this);
          if (!this._events[h]) this._events[h] = g;
          else if (typeof this._events[h] == "function")
            this._events[h] = [this._events[h], g];
          else if (
            r(this._events[h]) &&
            (this._events[h].push(g), !this._events[h].warned)
          ) {
            var _ = i;
            (typeof this._events.maxListeners != "undefined" &&
              (_ = this._events.maxListeners),
              _ > 0 &&
                this._events[h].length > _ &&
                ((this._events[h].warned = !0),
                console.error(
                  "(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.",
                  this._events[h].length,
                ),
                console.trace && console.trace()));
          }
          return this;
        }),
        (c.prototype.onAny = function (h) {
          if (typeof h != "function")
            throw new Error("onAny only accepts instances of Function");
          return (this._all || (this._all = []), this._all.push(h), this);
        }),
        (c.prototype.addListener = c.prototype.on),
        (c.prototype.off = function (h, g) {
          if (typeof g != "function")
            throw new Error("removeListener only takes instances of Function");
          var _,
            v = [];
          if (this.wildcard) {
            var b = typeof h == "string" ? h.split(this.delimiter) : h.slice();
            v = l.call(this, null, b, this.listenerTree, 0);
          } else {
            if (!this._events[h]) return this;
            ((_ = this._events[h]), v.push({ _listeners: _ }));
          }
          for (var w = 0; w < v.length; w++) {
            var x = v[w];
            if (((_ = x._listeners), r(_))) {
              for (var C = -1, R = 0, T = _.length; R < T; R++)
                if (
                  _[R] === g ||
                  (_[R].listener && _[R].listener === g) ||
                  (_[R]._origin && _[R]._origin === g)
                ) {
                  C = R;
                  break;
                }
              if (C < 0) continue;
              return (
                this.wildcard
                  ? x._listeners.splice(C, 1)
                  : this._events[h].splice(C, 1),
                _.length === 0 &&
                  (this.wildcard
                    ? delete x._listeners
                    : delete this._events[h]),
                this.emit("removeListener", h, g),
                this
              );
            } else
              (_ === g ||
                (_.listener && _.listener === g) ||
                (_._origin && _._origin === g)) &&
                (this.wildcard ? delete x._listeners : delete this._events[h],
                this.emit("removeListener", h, g));
          }
          function I(G) {
            if (G !== t) {
              var M = Object.keys(G);
              for (var P in M) {
                var H = M[P],
                  O = G[H];
                O instanceof Function ||
                  typeof O != "object" ||
                  (Object.keys(O).length > 0 && I(G[H]),
                  Object.keys(O).length === 0 && delete G[H]);
              }
            }
          }
          return (I(this.listenerTree), this);
        }),
        (c.prototype.offAny = function (h) {
          var g = 0,
            _ = 0,
            v;
          if (h && this._all && this._all.length > 0) {
            for (v = this._all, g = 0, _ = v.length; g < _; g++)
              if (h === v[g])
                return (
                  v.splice(g, 1),
                  this.emit("removeListenerAny", h),
                  this
                );
          } else {
            for (v = this._all, g = 0, _ = v.length; g < _; g++)
              this.emit("removeListenerAny", v[g]);
            this._all = [];
          }
          return this;
        }),
        (c.prototype.removeListener = c.prototype.off),
        (c.prototype.removeAllListeners = function (h) {
          if (arguments.length === 0)
            return (!this._events || u.call(this), this);
          if (this.wildcard)
            for (
              var g =
                  typeof h == "string" ? h.split(this.delimiter) : h.slice(),
                _ = l.call(this, null, g, this.listenerTree, 0),
                v = 0;
              v < _.length;
              v++
            ) {
              var b = _[v];
              b._listeners = null;
            }
          else {
            if (!this._events || !this._events[h]) return this;
            this._events[h] = null;
          }
          return this;
        }),
        (c.prototype.listeners = function (h) {
          if (this.wildcard) {
            var g = [],
              _ = typeof h == "string" ? h.split(this.delimiter) : h.slice();
            return (l.call(this, g, _, this.listenerTree, 0), g);
          }
          return (
            this._events || u.call(this),
            this._events[h] || (this._events[h] = []),
            r(this._events[h]) || (this._events[h] = [this._events[h]]),
            this._events[h]
          );
        }),
        (c.prototype.listenersAny = function () {
          return this._all ? this._all : [];
        }),
        typeof define == "function" && define.amd
          ? define(function () {
              return c;
            })
          : typeof ep == "object"
            ? (rp.exports = c)
            : (window.EventEmitter2 = c));
    })();
  });
  var sp = U((mx, up) => {
    var mo,
      dn = {
        input: !0,
        option: !0,
        optgroup: !0,
        select: !0,
        button: !0,
        datalist: !0,
        textarea: !0,
      },
      ip = {
        tr: { tr: !0, th: !0, td: !0 },
        th: { th: !0 },
        td: { thead: !0, th: !0, td: !0 },
        body: { head: !0, link: !0, script: !0 },
        li: { li: !0 },
        p: { p: !0 },
        h1: { p: !0 },
        h2: { p: !0 },
        h3: { p: !0 },
        h4: { p: !0 },
        h5: { p: !0 },
        h6: { p: !0 },
        select: dn,
        input: dn,
        output: dn,
        button: dn,
        datalist: dn,
        textarea: dn,
        option: { option: !0 },
        optgroup: { optgroup: !0 },
      },
      _o = {
        __proto__: null,
        area: !0,
        base: !0,
        basefont: !0,
        br: !0,
        col: !0,
        command: !0,
        embed: !0,
        frame: !0,
        hr: !0,
        img: !0,
        input: !0,
        isindex: !0,
        keygen: !0,
        link: !0,
        meta: !0,
        param: !0,
        source: !0,
        track: !0,
        wbr: !0,
        path: !0,
        circle: !0,
        ellipse: !0,
        line: !0,
        rect: !0,
        use: !0,
        stop: !0,
        polyline: !0,
        polygon: !0,
      },
      Rw = /\s|\//;
    function mt(t, r) {
      ((this._options = r || {}),
        (this._cbs = t || {}),
        (this._tagname = ""),
        (this._attribname = ""),
        (this._attribvalue = ""),
        (this._attribs = null),
        (this._stack = []),
        (this.startIndex = 0),
        (this.endIndex = null),
        (this._lowerCaseTagNames =
          "lowerCaseTags" in this._options
            ? !!this._options.lowerCaseTags
            : !this._options.xmlMode),
        (this._lowerCaseAttributeNames =
          "lowerCaseAttributeNames" in this._options
            ? !!this._options.lowerCaseAttributeNames
            : !this._options.xmlMode),
        this._options.Tokenizer ? (mo = this._options.Tokenizer) : (mo = ho()),
        (this._tokenizer = new mo(this._options, this)),
        this._cbs.onparserinit && this._cbs.onparserinit(this));
    }
    go()(mt, np());
    mt.prototype._updatePosition = function (t) {
      (this.endIndex === null
        ? this._tokenizer._sectionStart <= t
          ? (this.startIndex = 0)
          : (this.startIndex = this._tokenizer._sectionStart - t)
        : (this.startIndex = this.endIndex + 1),
        (this.endIndex = this._tokenizer.getAbsoluteIndex()));
    };
    mt.prototype.ontext = function (t) {
      (this._updatePosition(1),
        this.endIndex--,
        this._cbs.ontext && this._cbs.ontext(t));
    };
    mt.prototype.onopentagname = function (t) {
      if (
        (this._lowerCaseTagNames && (t = t.toLowerCase()),
        (this._tagname = t),
        !this._options.xmlMode && t in ip)
      )
        for (
          var r;
          (r = this._stack[this._stack.length - 1]) in ip[t];
          this.onclosetag(r)
        );
      ((this._options.xmlMode || !(t in _o)) && this._stack.push(t),
        this._cbs.onopentagname && this._cbs.onopentagname(t),
        this._cbs.onopentag && (this._attribs = {}));
    };
    mt.prototype.onopentagend = function () {
      (this._updatePosition(1),
        this._attribs &&
          (this._cbs.onopentag &&
            this._cbs.onopentag(this._tagname, this._attribs),
          (this._attribs = null)),
        !this._options.xmlMode &&
          this._cbs.onclosetag &&
          this._tagname in _o &&
          this._cbs.onclosetag(this._tagname),
        (this._tagname = ""));
    };
    mt.prototype.onclosetag = function (t) {
      if (
        (this._updatePosition(1),
        this._lowerCaseTagNames && (t = t.toLowerCase()),
        this._stack.length && (!(t in _o) || this._options.xmlMode))
      ) {
        var r = this._stack.lastIndexOf(t);
        if (r !== -1)
          if (this._cbs.onclosetag)
            for (r = this._stack.length - r; r--;)
              this._cbs.onclosetag(this._stack.pop());
          else this._stack.length = r;
        else
          t === "p" &&
            !this._options.xmlMode &&
            (this.onopentagname(t), this._closeCurrentTag());
      } else
        !this._options.xmlMode &&
          (t === "br" || t === "p") &&
          (this.onopentagname(t), this._closeCurrentTag());
    };
    mt.prototype.onselfclosingtag = function () {
      this._options.xmlMode || this._options.recognizeSelfClosing
        ? this._closeCurrentTag()
        : this.onopentagend();
    };
    mt.prototype._closeCurrentTag = function () {
      var t = this._tagname;
      (this.onopentagend(),
        this._stack[this._stack.length - 1] === t &&
          (this._cbs.onclosetag && this._cbs.onclosetag(t), this._stack.pop()));
    };
    mt.prototype.onattribname = function (t) {
      (this._lowerCaseAttributeNames && (t = t.toLowerCase()),
        (this._attribname = t));
    };
    mt.prototype.onattribdata = function (t) {
      this._attribvalue += t;
    };
    mt.prototype.onattribend = function () {
      (this._cbs.onattribute &&
        this._cbs.onattribute(this._attribname, this._attribvalue),
        this._attribs &&
          !Object.prototype.hasOwnProperty.call(
            this._attribs,
            this._attribname,
          ) &&
          (this._attribs[this._attribname] = this._attribvalue),
        (this._attribname = ""),
        (this._attribvalue = ""));
    };
    mt.prototype._getInstructionName = function (t) {
      var r = t.search(Rw),
        i = r < 0 ? t : t.substr(0, r);
      return (this._lowerCaseTagNames && (i = i.toLowerCase()), i);
    };
    mt.prototype.ondeclaration = function (t) {
      if (this._cbs.onprocessinginstruction) {
        var r = this._getInstructionName(t);
        this._cbs.onprocessinginstruction("!" + r, "!" + t);
      }
    };
    mt.prototype.onprocessinginstruction = function (t) {
      if (this._cbs.onprocessinginstruction) {
        var r = this._getInstructionName(t);
        this._cbs.onprocessinginstruction("?" + r, "?" + t);
      }
    };
    mt.prototype.oncomment = function (t) {
      (this._updatePosition(4),
        this._cbs.oncomment && this._cbs.oncomment(t),
        this._cbs.oncommentend && this._cbs.oncommentend());
    };
    mt.prototype.oncdata = function (t) {
      (this._updatePosition(1),
        this._options.xmlMode || this._options.recognizeCDATA
          ? (this._cbs.oncdatastart && this._cbs.oncdatastart(),
            this._cbs.ontext && this._cbs.ontext(t),
            this._cbs.oncdataend && this._cbs.oncdataend())
          : this.oncomment("[CDATA[" + t + "]]"));
    };
    mt.prototype.onerror = function (t) {
      this._cbs.onerror && this._cbs.onerror(t);
    };
    mt.prototype.onend = function () {
      if (this._cbs.onclosetag)
        for (
          var t = this._stack.length;
          t > 0;
          this._cbs.onclosetag(this._stack[--t])
        );
      this._cbs.onend && this._cbs.onend();
    };
    mt.prototype.reset = function () {
      (this._cbs.onreset && this._cbs.onreset(),
        this._tokenizer.reset(),
        (this._tagname = ""),
        (this._attribname = ""),
        (this._attribs = null),
        (this._stack = []),
        this._cbs.onparserinit && this._cbs.onparserinit(this));
    };
    mt.prototype.parseComplete = function (t) {
      (this.reset(), this.end(t));
    };
    mt.prototype.write = function (t) {
      this._tokenizer.write(t);
    };
    mt.prototype.end = function (t) {
      this._tokenizer.end(t);
    };
    mt.prototype.pause = function () {
      this._tokenizer.pause();
    };
    mt.prototype.resume = function () {
      this._tokenizer.resume();
    };
    mt.prototype.parseChunk = mt.prototype.write;
    mt.prototype.done = mt.prototype.end;
    up.exports = mt;
  });
  var gn = U((_x, ap) => {
    ap.exports = {
      Text: "text",
      Directive: "directive",
      Comment: "comment",
      Script: "script",
      Style: "style",
      Tag: "tag",
      CDATA: "cdata",
      Doctype: "doctype",
      isTag: function (t) {
        return t.type === "tag" || t.type === "script" || t.type === "style";
      },
    };
  });
  var vo = U((vx, lp) => {
    var Iw = (lp.exports = {
        get firstChild() {
          var t = this.children;
          return (t && t[0]) || null;
        },
        get lastChild() {
          var t = this.children;
          return (t && t[t.length - 1]) || null;
        },
        get nodeType() {
          return cp[this.type] || cp.element;
        },
      }),
      op = {
        tagName: "name",
        childNodes: "children",
        parentNode: "parent",
        previousSibling: "prev",
        nextSibling: "next",
        nodeValue: "data",
      },
      cp = { element: 1, text: 3, cdata: 4, comment: 8 };
    Object.keys(op).forEach(function (t) {
      var r = op[t];
      Object.defineProperty(Iw, t, {
        get: function () {
          return this[r] || null;
        },
        set: function (i) {
          return ((this[r] = i), i);
        },
      });
    });
  });
  var pp = U((yx, hp) => {
    var Ow = vo(),
      Mw = (hp.exports = Object.create(Ow)),
      fp = { tagName: "name" };
    Object.keys(fp).forEach(function (t) {
      var r = fp[t];
      Object.defineProperty(Mw, t, {
        get: function () {
          return this[r] || null;
        },
        set: function (i) {
          return ((this[r] = i), i);
        },
      });
    });
  });
  var mp = U((Ax, gp) => {
    var Ie = gn(),
      yo = /\s+/g,
      Nw = vo(),
      kw = pp();
    function Pt(t, r, i) {
      (typeof t == "object"
        ? ((i = r), (r = t), (t = null))
        : typeof r == "function" && ((i = r), (r = dp)),
        (this._callback = t),
        (this._options = r || dp),
        (this._elementCB = i),
        (this.dom = []),
        (this._done = !1),
        (this._tagStack = []),
        (this._parser = this._parser || null));
    }
    var dp = {
      normalizeWhitespace: !1,
      withStartIndices: !1,
      withEndIndices: !1,
    };
    Pt.prototype.onparserinit = function (t) {
      this._parser = t;
    };
    Pt.prototype.onreset = function () {
      Pt.call(this, this._callback, this._options, this._elementCB);
    };
    Pt.prototype.onend = function () {
      this._done ||
        ((this._done = !0), (this._parser = null), this._handleCallback(null));
    };
    Pt.prototype._handleCallback = Pt.prototype.onerror = function (t) {
      if (typeof this._callback == "function") this._callback(t, this.dom);
      else if (t) throw t;
    };
    Pt.prototype.onclosetag = function () {
      var t = this._tagStack.pop();
      (this._options.withEndIndices &&
        t &&
        (t.endIndex = this._parser.endIndex),
        this._elementCB && this._elementCB(t));
    };
    Pt.prototype._createDomElement = function (t) {
      if (!this._options.withDomLvl1) return t;
      var r;
      t.type === "tag" ? (r = Object.create(kw)) : (r = Object.create(Nw));
      for (var i in t) t.hasOwnProperty(i) && (r[i] = t[i]);
      return r;
    };
    Pt.prototype._addDomElement = function (t) {
      var r = this._tagStack[this._tagStack.length - 1],
        i = r ? r.children : this.dom,
        u = i[i.length - 1];
      ((t.next = null),
        this._options.withStartIndices &&
          (t.startIndex = this._parser.startIndex),
        this._options.withEndIndices && (t.endIndex = this._parser.endIndex),
        u ? ((t.prev = u), (u.next = t)) : (t.prev = null),
        i.push(t),
        (t.parent = r || null));
    };
    Pt.prototype.onopentag = function (t, r) {
      var i = {
          type: t === "script" ? Ie.Script : t === "style" ? Ie.Style : Ie.Tag,
          name: t,
          attribs: r,
          children: [],
        },
        u = this._createDomElement(i);
      (this._addDomElement(u), this._tagStack.push(u));
    };
    Pt.prototype.ontext = function (t) {
      var r =
          this._options.normalizeWhitespace || this._options.ignoreWhitespace,
        i;
      if (
        !this._tagStack.length &&
        this.dom.length &&
        (i = this.dom[this.dom.length - 1]).type === Ie.Text
      )
        r ? (i.data = (i.data + t).replace(yo, " ")) : (i.data += t);
      else if (
        this._tagStack.length &&
        (i = this._tagStack[this._tagStack.length - 1]) &&
        (i = i.children[i.children.length - 1]) &&
        i.type === Ie.Text
      )
        r ? (i.data = (i.data + t).replace(yo, " ")) : (i.data += t);
      else {
        r && (t = t.replace(yo, " "));
        var u = this._createDomElement({ data: t, type: Ie.Text });
        this._addDomElement(u);
      }
    };
    Pt.prototype.oncomment = function (t) {
      var r = this._tagStack[this._tagStack.length - 1];
      if (r && r.type === Ie.Comment) {
        r.data += t;
        return;
      }
      var i = { data: t, type: Ie.Comment },
        u = this._createDomElement(i);
      (this._addDomElement(u), this._tagStack.push(u));
    };
    Pt.prototype.oncdatastart = function () {
      var t = { children: [{ data: "", type: Ie.Text }], type: Ie.CDATA },
        r = this._createDomElement(t);
      (this._addDomElement(r), this._tagStack.push(r));
    };
    Pt.prototype.oncommentend = Pt.prototype.oncdataend = function () {
      this._tagStack.pop();
    };
    Pt.prototype.onprocessinginstruction = function (t, r) {
      var i = this._createDomElement({ name: t, data: r, type: Ie.Directive });
      this._addDomElement(i);
    };
    gp.exports = Pt;
  });
  var Ap = U((bx, yp) => {
    var vp = mn(),
      Ao = vp.DomHandler,
      Nu = vp.DomUtils;
    function ku(t, r) {
      this.init(t, r);
    }
    go()(ku, Ao);
    ku.prototype.init = Ao;
    function _p(t, r) {
      return Nu.getElementsByTagName(t, r, !0);
    }
    function Mu(t, r) {
      return Nu.getElementsByTagName(t, r, !0, 1)[0];
    }
    function Ir(t, r, i) {
      return Nu.getText(Nu.getElementsByTagName(t, r, i, 1)).trim();
    }
    function ie(t, r, i, u, a) {
      var c = Ir(i, u, a);
      c && (t[r] = c);
    }
    var Uw = function (t) {
      return t === "rss" || t === "feed" || t === "rdf:RDF";
    };
    ku.prototype.onend = function () {
      var t = {},
        r = Mu(Uw, this.dom),
        i,
        u;
      (r &&
        (r.name === "feed"
          ? ((u = r.children),
            (t.type = "atom"),
            ie(t, "id", "id", u),
            ie(t, "title", "title", u),
            (i = Mu("link", u)) &&
              (i = i.attribs) &&
              (i = i.href) &&
              (t.link = i),
            ie(t, "description", "subtitle", u),
            (i = Ir("updated", u)) && (t.updated = new Date(i)),
            ie(t, "author", "email", u, !0),
            (t.items = _p("entry", u).map(function (a) {
              var c = {},
                l;
              return (
                (a = a.children),
                ie(c, "id", "id", a),
                ie(c, "title", "title", a),
                (l = Mu("link", a)) &&
                  (l = l.attribs) &&
                  (l = l.href) &&
                  (c.link = l),
                (l = Ir("summary", a) || Ir("content", a)) &&
                  (c.description = l),
                (l = Ir("updated", a)) && (c.pubDate = new Date(l)),
                c
              );
            })))
          : ((u = Mu("channel", r.children).children),
            (t.type = r.name.substr(0, 3)),
            (t.id = ""),
            ie(t, "title", "title", u),
            ie(t, "link", "link", u),
            ie(t, "description", "description", u),
            (i = Ir("lastBuildDate", u)) && (t.updated = new Date(i)),
            ie(t, "author", "managingEditor", u, !0),
            (t.items = _p("item", r.children).map(function (a) {
              var c = {},
                l;
              return (
                (a = a.children),
                ie(c, "id", "guid", a),
                ie(c, "title", "title", a),
                ie(c, "link", "link", a),
                ie(c, "description", "description", a),
                (l = Ir("pubDate", a)) && (c.pubDate = new Date(l)),
                c
              );
            })))),
        (this.dom = t),
        Ao.prototype._handleCallback.call(
          this,
          r ? null : Error("couldn't find root of feed"),
        ));
    };
    yp.exports = ku;
  });
  var wp = U((wx, bp) => {
    bp.exports = Pu;
    function Pu(t) {
      this._cbs = t || {};
    }
    var Uu = mn().EVENTS;
    Object.keys(Uu).forEach(function (t) {
      if (Uu[t] === 0)
        ((t = "on" + t),
          (Pu.prototype[t] = function () {
            this._cbs[t] && this._cbs[t]();
          }));
      else if (Uu[t] === 1)
        ((t = "on" + t),
          (Pu.prototype[t] = function (r) {
            this._cbs[t] && this._cbs[t](r);
          }));
      else if (Uu[t] === 2)
        ((t = "on" + t),
          (Pu.prototype[t] = function (r, i) {
            this._cbs[t] && this._cbs[t](r, i);
          }));
      else throw Error("wrong number of arguments");
    });
  });
  var Dp = U((Ct) => {
    "use strict";
    Object.defineProperty(Ct, "__esModule", { value: !0 });
    Ct.Doctype =
      Ct.CDATA =
      Ct.Tag =
      Ct.Style =
      Ct.Script =
      Ct.Comment =
      Ct.Directive =
      Ct.Text =
      Ct.Root =
      Ct.isTag =
      Ct.ElementType =
        void 0;
    var me;
    (function (t) {
      ((t.Root = "root"),
        (t.Text = "text"),
        (t.Directive = "directive"),
        (t.Comment = "comment"),
        (t.Script = "script"),
        (t.Style = "style"),
        (t.Tag = "tag"),
        (t.CDATA = "cdata"),
        (t.Doctype = "doctype"));
    })((me = Ct.ElementType || (Ct.ElementType = {})));
    function Pw(t) {
      return t.type === me.Tag || t.type === me.Script || t.type === me.Style;
    }
    Ct.isTag = Pw;
    Ct.Root = me.Root;
    Ct.Text = me.Text;
    Ct.Directive = me.Directive;
    Ct.Comment = me.Comment;
    Ct.Script = me.Script;
    Ct.Style = me.Style;
    Ct.Tag = me.Tag;
    Ct.CDATA = me.CDATA;
    Ct.Doctype = me.Doctype;
  });
  var bo = U((Ex, $w) => {
    $w.exports = {
      Aacute: "\xC1",
      aacute: "\xE1",
      Abreve: "\u0102",
      abreve: "\u0103",
      ac: "\u223E",
      acd: "\u223F",
      acE: "\u223E\u0333",
      Acirc: "\xC2",
      acirc: "\xE2",
      acute: "\xB4",
      Acy: "\u0410",
      acy: "\u0430",
      AElig: "\xC6",
      aelig: "\xE6",
      af: "\u2061",
      Afr: "\u{1D504}",
      afr: "\u{1D51E}",
      Agrave: "\xC0",
      agrave: "\xE0",
      alefsym: "\u2135",
      aleph: "\u2135",
      Alpha: "\u0391",
      alpha: "\u03B1",
      Amacr: "\u0100",
      amacr: "\u0101",
      amalg: "\u2A3F",
      amp: "&",
      AMP: "&",
      andand: "\u2A55",
      And: "\u2A53",
      and: "\u2227",
      andd: "\u2A5C",
      andslope: "\u2A58",
      andv: "\u2A5A",
      ang: "\u2220",
      ange: "\u29A4",
      angle: "\u2220",
      angmsdaa: "\u29A8",
      angmsdab: "\u29A9",
      angmsdac: "\u29AA",
      angmsdad: "\u29AB",
      angmsdae: "\u29AC",
      angmsdaf: "\u29AD",
      angmsdag: "\u29AE",
      angmsdah: "\u29AF",
      angmsd: "\u2221",
      angrt: "\u221F",
      angrtvb: "\u22BE",
      angrtvbd: "\u299D",
      angsph: "\u2222",
      angst: "\xC5",
      angzarr: "\u237C",
      Aogon: "\u0104",
      aogon: "\u0105",
      Aopf: "\u{1D538}",
      aopf: "\u{1D552}",
      apacir: "\u2A6F",
      ap: "\u2248",
      apE: "\u2A70",
      ape: "\u224A",
      apid: "\u224B",
      apos: "'",
      ApplyFunction: "\u2061",
      approx: "\u2248",
      approxeq: "\u224A",
      Aring: "\xC5",
      aring: "\xE5",
      Ascr: "\u{1D49C}",
      ascr: "\u{1D4B6}",
      Assign: "\u2254",
      ast: "*",
      asymp: "\u2248",
      asympeq: "\u224D",
      Atilde: "\xC3",
      atilde: "\xE3",
      Auml: "\xC4",
      auml: "\xE4",
      awconint: "\u2233",
      awint: "\u2A11",
      backcong: "\u224C",
      backepsilon: "\u03F6",
      backprime: "\u2035",
      backsim: "\u223D",
      backsimeq: "\u22CD",
      Backslash: "\u2216",
      Barv: "\u2AE7",
      barvee: "\u22BD",
      barwed: "\u2305",
      Barwed: "\u2306",
      barwedge: "\u2305",
      bbrk: "\u23B5",
      bbrktbrk: "\u23B6",
      bcong: "\u224C",
      Bcy: "\u0411",
      bcy: "\u0431",
      bdquo: "\u201E",
      becaus: "\u2235",
      because: "\u2235",
      Because: "\u2235",
      bemptyv: "\u29B0",
      bepsi: "\u03F6",
      bernou: "\u212C",
      Bernoullis: "\u212C",
      Beta: "\u0392",
      beta: "\u03B2",
      beth: "\u2136",
      between: "\u226C",
      Bfr: "\u{1D505}",
      bfr: "\u{1D51F}",
      bigcap: "\u22C2",
      bigcirc: "\u25EF",
      bigcup: "\u22C3",
      bigodot: "\u2A00",
      bigoplus: "\u2A01",
      bigotimes: "\u2A02",
      bigsqcup: "\u2A06",
      bigstar: "\u2605",
      bigtriangledown: "\u25BD",
      bigtriangleup: "\u25B3",
      biguplus: "\u2A04",
      bigvee: "\u22C1",
      bigwedge: "\u22C0",
      bkarow: "\u290D",
      blacklozenge: "\u29EB",
      blacksquare: "\u25AA",
      blacktriangle: "\u25B4",
      blacktriangledown: "\u25BE",
      blacktriangleleft: "\u25C2",
      blacktriangleright: "\u25B8",
      blank: "\u2423",
      blk12: "\u2592",
      blk14: "\u2591",
      blk34: "\u2593",
      block: "\u2588",
      bne: "=\u20E5",
      bnequiv: "\u2261\u20E5",
      bNot: "\u2AED",
      bnot: "\u2310",
      Bopf: "\u{1D539}",
      bopf: "\u{1D553}",
      bot: "\u22A5",
      bottom: "\u22A5",
      bowtie: "\u22C8",
      boxbox: "\u29C9",
      boxdl: "\u2510",
      boxdL: "\u2555",
      boxDl: "\u2556",
      boxDL: "\u2557",
      boxdr: "\u250C",
      boxdR: "\u2552",
      boxDr: "\u2553",
      boxDR: "\u2554",
      boxh: "\u2500",
      boxH: "\u2550",
      boxhd: "\u252C",
      boxHd: "\u2564",
      boxhD: "\u2565",
      boxHD: "\u2566",
      boxhu: "\u2534",
      boxHu: "\u2567",
      boxhU: "\u2568",
      boxHU: "\u2569",
      boxminus: "\u229F",
      boxplus: "\u229E",
      boxtimes: "\u22A0",
      boxul: "\u2518",
      boxuL: "\u255B",
      boxUl: "\u255C",
      boxUL: "\u255D",
      boxur: "\u2514",
      boxuR: "\u2558",
      boxUr: "\u2559",
      boxUR: "\u255A",
      boxv: "\u2502",
      boxV: "\u2551",
      boxvh: "\u253C",
      boxvH: "\u256A",
      boxVh: "\u256B",
      boxVH: "\u256C",
      boxvl: "\u2524",
      boxvL: "\u2561",
      boxVl: "\u2562",
      boxVL: "\u2563",
      boxvr: "\u251C",
      boxvR: "\u255E",
      boxVr: "\u255F",
      boxVR: "\u2560",
      bprime: "\u2035",
      breve: "\u02D8",
      Breve: "\u02D8",
      brvbar: "\xA6",
      bscr: "\u{1D4B7}",
      Bscr: "\u212C",
      bsemi: "\u204F",
      bsim: "\u223D",
      bsime: "\u22CD",
      bsolb: "\u29C5",
      bsol: "\\",
      bsolhsub: "\u27C8",
      bull: "\u2022",
      bullet: "\u2022",
      bump: "\u224E",
      bumpE: "\u2AAE",
      bumpe: "\u224F",
      Bumpeq: "\u224E",
      bumpeq: "\u224F",
      Cacute: "\u0106",
      cacute: "\u0107",
      capand: "\u2A44",
      capbrcup: "\u2A49",
      capcap: "\u2A4B",
      cap: "\u2229",
      Cap: "\u22D2",
      capcup: "\u2A47",
      capdot: "\u2A40",
      CapitalDifferentialD: "\u2145",
      caps: "\u2229\uFE00",
      caret: "\u2041",
      caron: "\u02C7",
      Cayleys: "\u212D",
      ccaps: "\u2A4D",
      Ccaron: "\u010C",
      ccaron: "\u010D",
      Ccedil: "\xC7",
      ccedil: "\xE7",
      Ccirc: "\u0108",
      ccirc: "\u0109",
      Cconint: "\u2230",
      ccups: "\u2A4C",
      ccupssm: "\u2A50",
      Cdot: "\u010A",
      cdot: "\u010B",
      cedil: "\xB8",
      Cedilla: "\xB8",
      cemptyv: "\u29B2",
      cent: "\xA2",
      centerdot: "\xB7",
      CenterDot: "\xB7",
      cfr: "\u{1D520}",
      Cfr: "\u212D",
      CHcy: "\u0427",
      chcy: "\u0447",
      check: "\u2713",
      checkmark: "\u2713",
      Chi: "\u03A7",
      chi: "\u03C7",
      circ: "\u02C6",
      circeq: "\u2257",
      circlearrowleft: "\u21BA",
      circlearrowright: "\u21BB",
      circledast: "\u229B",
      circledcirc: "\u229A",
      circleddash: "\u229D",
      CircleDot: "\u2299",
      circledR: "\xAE",
      circledS: "\u24C8",
      CircleMinus: "\u2296",
      CirclePlus: "\u2295",
      CircleTimes: "\u2297",
      cir: "\u25CB",
      cirE: "\u29C3",
      cire: "\u2257",
      cirfnint: "\u2A10",
      cirmid: "\u2AEF",
      cirscir: "\u29C2",
      ClockwiseContourIntegral: "\u2232",
      CloseCurlyDoubleQuote: "\u201D",
      CloseCurlyQuote: "\u2019",
      clubs: "\u2663",
      clubsuit: "\u2663",
      colon: ":",
      Colon: "\u2237",
      Colone: "\u2A74",
      colone: "\u2254",
      coloneq: "\u2254",
      comma: ",",
      commat: "@",
      comp: "\u2201",
      compfn: "\u2218",
      complement: "\u2201",
      complexes: "\u2102",
      cong: "\u2245",
      congdot: "\u2A6D",
      Congruent: "\u2261",
      conint: "\u222E",
      Conint: "\u222F",
      ContourIntegral: "\u222E",
      copf: "\u{1D554}",
      Copf: "\u2102",
      coprod: "\u2210",
      Coproduct: "\u2210",
      copy: "\xA9",
      COPY: "\xA9",
      copysr: "\u2117",
      CounterClockwiseContourIntegral: "\u2233",
      crarr: "\u21B5",
      cross: "\u2717",
      Cross: "\u2A2F",
      Cscr: "\u{1D49E}",
      cscr: "\u{1D4B8}",
      csub: "\u2ACF",
      csube: "\u2AD1",
      csup: "\u2AD0",
      csupe: "\u2AD2",
      ctdot: "\u22EF",
      cudarrl: "\u2938",
      cudarrr: "\u2935",
      cuepr: "\u22DE",
      cuesc: "\u22DF",
      cularr: "\u21B6",
      cularrp: "\u293D",
      cupbrcap: "\u2A48",
      cupcap: "\u2A46",
      CupCap: "\u224D",
      cup: "\u222A",
      Cup: "\u22D3",
      cupcup: "\u2A4A",
      cupdot: "\u228D",
      cupor: "\u2A45",
      cups: "\u222A\uFE00",
      curarr: "\u21B7",
      curarrm: "\u293C",
      curlyeqprec: "\u22DE",
      curlyeqsucc: "\u22DF",
      curlyvee: "\u22CE",
      curlywedge: "\u22CF",
      curren: "\xA4",
      curvearrowleft: "\u21B6",
      curvearrowright: "\u21B7",
      cuvee: "\u22CE",
      cuwed: "\u22CF",
      cwconint: "\u2232",
      cwint: "\u2231",
      cylcty: "\u232D",
      dagger: "\u2020",
      Dagger: "\u2021",
      daleth: "\u2138",
      darr: "\u2193",
      Darr: "\u21A1",
      dArr: "\u21D3",
      dash: "\u2010",
      Dashv: "\u2AE4",
      dashv: "\u22A3",
      dbkarow: "\u290F",
      dblac: "\u02DD",
      Dcaron: "\u010E",
      dcaron: "\u010F",
      Dcy: "\u0414",
      dcy: "\u0434",
      ddagger: "\u2021",
      ddarr: "\u21CA",
      DD: "\u2145",
      dd: "\u2146",
      DDotrahd: "\u2911",
      ddotseq: "\u2A77",
      deg: "\xB0",
      Del: "\u2207",
      Delta: "\u0394",
      delta: "\u03B4",
      demptyv: "\u29B1",
      dfisht: "\u297F",
      Dfr: "\u{1D507}",
      dfr: "\u{1D521}",
      dHar: "\u2965",
      dharl: "\u21C3",
      dharr: "\u21C2",
      DiacriticalAcute: "\xB4",
      DiacriticalDot: "\u02D9",
      DiacriticalDoubleAcute: "\u02DD",
      DiacriticalGrave: "`",
      DiacriticalTilde: "\u02DC",
      diam: "\u22C4",
      diamond: "\u22C4",
      Diamond: "\u22C4",
      diamondsuit: "\u2666",
      diams: "\u2666",
      die: "\xA8",
      DifferentialD: "\u2146",
      digamma: "\u03DD",
      disin: "\u22F2",
      div: "\xF7",
      divide: "\xF7",
      divideontimes: "\u22C7",
      divonx: "\u22C7",
      DJcy: "\u0402",
      djcy: "\u0452",
      dlcorn: "\u231E",
      dlcrop: "\u230D",
      dollar: "$",
      Dopf: "\u{1D53B}",
      dopf: "\u{1D555}",
      Dot: "\xA8",
      dot: "\u02D9",
      DotDot: "\u20DC",
      doteq: "\u2250",
      doteqdot: "\u2251",
      DotEqual: "\u2250",
      dotminus: "\u2238",
      dotplus: "\u2214",
      dotsquare: "\u22A1",
      doublebarwedge: "\u2306",
      DoubleContourIntegral: "\u222F",
      DoubleDot: "\xA8",
      DoubleDownArrow: "\u21D3",
      DoubleLeftArrow: "\u21D0",
      DoubleLeftRightArrow: "\u21D4",
      DoubleLeftTee: "\u2AE4",
      DoubleLongLeftArrow: "\u27F8",
      DoubleLongLeftRightArrow: "\u27FA",
      DoubleLongRightArrow: "\u27F9",
      DoubleRightArrow: "\u21D2",
      DoubleRightTee: "\u22A8",
      DoubleUpArrow: "\u21D1",
      DoubleUpDownArrow: "\u21D5",
      DoubleVerticalBar: "\u2225",
      DownArrowBar: "\u2913",
      downarrow: "\u2193",
      DownArrow: "\u2193",
      Downarrow: "\u21D3",
      DownArrowUpArrow: "\u21F5",
      DownBreve: "\u0311",
      downdownarrows: "\u21CA",
      downharpoonleft: "\u21C3",
      downharpoonright: "\u21C2",
      DownLeftRightVector: "\u2950",
      DownLeftTeeVector: "\u295E",
      DownLeftVectorBar: "\u2956",
      DownLeftVector: "\u21BD",
      DownRightTeeVector: "\u295F",
      DownRightVectorBar: "\u2957",
      DownRightVector: "\u21C1",
      DownTeeArrow: "\u21A7",
      DownTee: "\u22A4",
      drbkarow: "\u2910",
      drcorn: "\u231F",
      drcrop: "\u230C",
      Dscr: "\u{1D49F}",
      dscr: "\u{1D4B9}",
      DScy: "\u0405",
      dscy: "\u0455",
      dsol: "\u29F6",
      Dstrok: "\u0110",
      dstrok: "\u0111",
      dtdot: "\u22F1",
      dtri: "\u25BF",
      dtrif: "\u25BE",
      duarr: "\u21F5",
      duhar: "\u296F",
      dwangle: "\u29A6",
      DZcy: "\u040F",
      dzcy: "\u045F",
      dzigrarr: "\u27FF",
      Eacute: "\xC9",
      eacute: "\xE9",
      easter: "\u2A6E",
      Ecaron: "\u011A",
      ecaron: "\u011B",
      Ecirc: "\xCA",
      ecirc: "\xEA",
      ecir: "\u2256",
      ecolon: "\u2255",
      Ecy: "\u042D",
      ecy: "\u044D",
      eDDot: "\u2A77",
      Edot: "\u0116",
      edot: "\u0117",
      eDot: "\u2251",
      ee: "\u2147",
      efDot: "\u2252",
      Efr: "\u{1D508}",
      efr: "\u{1D522}",
      eg: "\u2A9A",
      Egrave: "\xC8",
      egrave: "\xE8",
      egs: "\u2A96",
      egsdot: "\u2A98",
      el: "\u2A99",
      Element: "\u2208",
      elinters: "\u23E7",
      ell: "\u2113",
      els: "\u2A95",
      elsdot: "\u2A97",
      Emacr: "\u0112",
      emacr: "\u0113",
      empty: "\u2205",
      emptyset: "\u2205",
      EmptySmallSquare: "\u25FB",
      emptyv: "\u2205",
      EmptyVerySmallSquare: "\u25AB",
      emsp13: "\u2004",
      emsp14: "\u2005",
      emsp: "\u2003",
      ENG: "\u014A",
      eng: "\u014B",
      ensp: "\u2002",
      Eogon: "\u0118",
      eogon: "\u0119",
      Eopf: "\u{1D53C}",
      eopf: "\u{1D556}",
      epar: "\u22D5",
      eparsl: "\u29E3",
      eplus: "\u2A71",
      epsi: "\u03B5",
      Epsilon: "\u0395",
      epsilon: "\u03B5",
      epsiv: "\u03F5",
      eqcirc: "\u2256",
      eqcolon: "\u2255",
      eqsim: "\u2242",
      eqslantgtr: "\u2A96",
      eqslantless: "\u2A95",
      Equal: "\u2A75",
      equals: "=",
      EqualTilde: "\u2242",
      equest: "\u225F",
      Equilibrium: "\u21CC",
      equiv: "\u2261",
      equivDD: "\u2A78",
      eqvparsl: "\u29E5",
      erarr: "\u2971",
      erDot: "\u2253",
      escr: "\u212F",
      Escr: "\u2130",
      esdot: "\u2250",
      Esim: "\u2A73",
      esim: "\u2242",
      Eta: "\u0397",
      eta: "\u03B7",
      ETH: "\xD0",
      eth: "\xF0",
      Euml: "\xCB",
      euml: "\xEB",
      euro: "\u20AC",
      excl: "!",
      exist: "\u2203",
      Exists: "\u2203",
      expectation: "\u2130",
      exponentiale: "\u2147",
      ExponentialE: "\u2147",
      fallingdotseq: "\u2252",
      Fcy: "\u0424",
      fcy: "\u0444",
      female: "\u2640",
      ffilig: "\uFB03",
      fflig: "\uFB00",
      ffllig: "\uFB04",
      Ffr: "\u{1D509}",
      ffr: "\u{1D523}",
      filig: "\uFB01",
      FilledSmallSquare: "\u25FC",
      FilledVerySmallSquare: "\u25AA",
      fjlig: "fj",
      flat: "\u266D",
      fllig: "\uFB02",
      fltns: "\u25B1",
      fnof: "\u0192",
      Fopf: "\u{1D53D}",
      fopf: "\u{1D557}",
      forall: "\u2200",
      ForAll: "\u2200",
      fork: "\u22D4",
      forkv: "\u2AD9",
      Fouriertrf: "\u2131",
      fpartint: "\u2A0D",
      frac12: "\xBD",
      frac13: "\u2153",
      frac14: "\xBC",
      frac15: "\u2155",
      frac16: "\u2159",
      frac18: "\u215B",
      frac23: "\u2154",
      frac25: "\u2156",
      frac34: "\xBE",
      frac35: "\u2157",
      frac38: "\u215C",
      frac45: "\u2158",
      frac56: "\u215A",
      frac58: "\u215D",
      frac78: "\u215E",
      frasl: "\u2044",
      frown: "\u2322",
      fscr: "\u{1D4BB}",
      Fscr: "\u2131",
      gacute: "\u01F5",
      Gamma: "\u0393",
      gamma: "\u03B3",
      Gammad: "\u03DC",
      gammad: "\u03DD",
      gap: "\u2A86",
      Gbreve: "\u011E",
      gbreve: "\u011F",
      Gcedil: "\u0122",
      Gcirc: "\u011C",
      gcirc: "\u011D",
      Gcy: "\u0413",
      gcy: "\u0433",
      Gdot: "\u0120",
      gdot: "\u0121",
      ge: "\u2265",
      gE: "\u2267",
      gEl: "\u2A8C",
      gel: "\u22DB",
      geq: "\u2265",
      geqq: "\u2267",
      geqslant: "\u2A7E",
      gescc: "\u2AA9",
      ges: "\u2A7E",
      gesdot: "\u2A80",
      gesdoto: "\u2A82",
      gesdotol: "\u2A84",
      gesl: "\u22DB\uFE00",
      gesles: "\u2A94",
      Gfr: "\u{1D50A}",
      gfr: "\u{1D524}",
      gg: "\u226B",
      Gg: "\u22D9",
      ggg: "\u22D9",
      gimel: "\u2137",
      GJcy: "\u0403",
      gjcy: "\u0453",
      gla: "\u2AA5",
      gl: "\u2277",
      glE: "\u2A92",
      glj: "\u2AA4",
      gnap: "\u2A8A",
      gnapprox: "\u2A8A",
      gne: "\u2A88",
      gnE: "\u2269",
      gneq: "\u2A88",
      gneqq: "\u2269",
      gnsim: "\u22E7",
      Gopf: "\u{1D53E}",
      gopf: "\u{1D558}",
      grave: "`",
      GreaterEqual: "\u2265",
      GreaterEqualLess: "\u22DB",
      GreaterFullEqual: "\u2267",
      GreaterGreater: "\u2AA2",
      GreaterLess: "\u2277",
      GreaterSlantEqual: "\u2A7E",
      GreaterTilde: "\u2273",
      Gscr: "\u{1D4A2}",
      gscr: "\u210A",
      gsim: "\u2273",
      gsime: "\u2A8E",
      gsiml: "\u2A90",
      gtcc: "\u2AA7",
      gtcir: "\u2A7A",
      gt: ">",
      GT: ">",
      Gt: "\u226B",
      gtdot: "\u22D7",
      gtlPar: "\u2995",
      gtquest: "\u2A7C",
      gtrapprox: "\u2A86",
      gtrarr: "\u2978",
      gtrdot: "\u22D7",
      gtreqless: "\u22DB",
      gtreqqless: "\u2A8C",
      gtrless: "\u2277",
      gtrsim: "\u2273",
      gvertneqq: "\u2269\uFE00",
      gvnE: "\u2269\uFE00",
      Hacek: "\u02C7",
      hairsp: "\u200A",
      half: "\xBD",
      hamilt: "\u210B",
      HARDcy: "\u042A",
      hardcy: "\u044A",
      harrcir: "\u2948",
      harr: "\u2194",
      hArr: "\u21D4",
      harrw: "\u21AD",
      Hat: "^",
      hbar: "\u210F",
      Hcirc: "\u0124",
      hcirc: "\u0125",
      hearts: "\u2665",
      heartsuit: "\u2665",
      hellip: "\u2026",
      hercon: "\u22B9",
      hfr: "\u{1D525}",
      Hfr: "\u210C",
      HilbertSpace: "\u210B",
      hksearow: "\u2925",
      hkswarow: "\u2926",
      hoarr: "\u21FF",
      homtht: "\u223B",
      hookleftarrow: "\u21A9",
      hookrightarrow: "\u21AA",
      hopf: "\u{1D559}",
      Hopf: "\u210D",
      horbar: "\u2015",
      HorizontalLine: "\u2500",
      hscr: "\u{1D4BD}",
      Hscr: "\u210B",
      hslash: "\u210F",
      Hstrok: "\u0126",
      hstrok: "\u0127",
      HumpDownHump: "\u224E",
      HumpEqual: "\u224F",
      hybull: "\u2043",
      hyphen: "\u2010",
      Iacute: "\xCD",
      iacute: "\xED",
      ic: "\u2063",
      Icirc: "\xCE",
      icirc: "\xEE",
      Icy: "\u0418",
      icy: "\u0438",
      Idot: "\u0130",
      IEcy: "\u0415",
      iecy: "\u0435",
      iexcl: "\xA1",
      iff: "\u21D4",
      ifr: "\u{1D526}",
      Ifr: "\u2111",
      Igrave: "\xCC",
      igrave: "\xEC",
      ii: "\u2148",
      iiiint: "\u2A0C",
      iiint: "\u222D",
      iinfin: "\u29DC",
      iiota: "\u2129",
      IJlig: "\u0132",
      ijlig: "\u0133",
      Imacr: "\u012A",
      imacr: "\u012B",
      image: "\u2111",
      ImaginaryI: "\u2148",
      imagline: "\u2110",
      imagpart: "\u2111",
      imath: "\u0131",
      Im: "\u2111",
      imof: "\u22B7",
      imped: "\u01B5",
      Implies: "\u21D2",
      incare: "\u2105",
      in: "\u2208",
      infin: "\u221E",
      infintie: "\u29DD",
      inodot: "\u0131",
      intcal: "\u22BA",
      int: "\u222B",
      Int: "\u222C",
      integers: "\u2124",
      Integral: "\u222B",
      intercal: "\u22BA",
      Intersection: "\u22C2",
      intlarhk: "\u2A17",
      intprod: "\u2A3C",
      InvisibleComma: "\u2063",
      InvisibleTimes: "\u2062",
      IOcy: "\u0401",
      iocy: "\u0451",
      Iogon: "\u012E",
      iogon: "\u012F",
      Iopf: "\u{1D540}",
      iopf: "\u{1D55A}",
      Iota: "\u0399",
      iota: "\u03B9",
      iprod: "\u2A3C",
      iquest: "\xBF",
      iscr: "\u{1D4BE}",
      Iscr: "\u2110",
      isin: "\u2208",
      isindot: "\u22F5",
      isinE: "\u22F9",
      isins: "\u22F4",
      isinsv: "\u22F3",
      isinv: "\u2208",
      it: "\u2062",
      Itilde: "\u0128",
      itilde: "\u0129",
      Iukcy: "\u0406",
      iukcy: "\u0456",
      Iuml: "\xCF",
      iuml: "\xEF",
      Jcirc: "\u0134",
      jcirc: "\u0135",
      Jcy: "\u0419",
      jcy: "\u0439",
      Jfr: "\u{1D50D}",
      jfr: "\u{1D527}",
      jmath: "\u0237",
      Jopf: "\u{1D541}",
      jopf: "\u{1D55B}",
      Jscr: "\u{1D4A5}",
      jscr: "\u{1D4BF}",
      Jsercy: "\u0408",
      jsercy: "\u0458",
      Jukcy: "\u0404",
      jukcy: "\u0454",
      Kappa: "\u039A",
      kappa: "\u03BA",
      kappav: "\u03F0",
      Kcedil: "\u0136",
      kcedil: "\u0137",
      Kcy: "\u041A",
      kcy: "\u043A",
      Kfr: "\u{1D50E}",
      kfr: "\u{1D528}",
      kgreen: "\u0138",
      KHcy: "\u0425",
      khcy: "\u0445",
      KJcy: "\u040C",
      kjcy: "\u045C",
      Kopf: "\u{1D542}",
      kopf: "\u{1D55C}",
      Kscr: "\u{1D4A6}",
      kscr: "\u{1D4C0}",
      lAarr: "\u21DA",
      Lacute: "\u0139",
      lacute: "\u013A",
      laemptyv: "\u29B4",
      lagran: "\u2112",
      Lambda: "\u039B",
      lambda: "\u03BB",
      lang: "\u27E8",
      Lang: "\u27EA",
      langd: "\u2991",
      langle: "\u27E8",
      lap: "\u2A85",
      Laplacetrf: "\u2112",
      laquo: "\xAB",
      larrb: "\u21E4",
      larrbfs: "\u291F",
      larr: "\u2190",
      Larr: "\u219E",
      lArr: "\u21D0",
      larrfs: "\u291D",
      larrhk: "\u21A9",
      larrlp: "\u21AB",
      larrpl: "\u2939",
      larrsim: "\u2973",
      larrtl: "\u21A2",
      latail: "\u2919",
      lAtail: "\u291B",
      lat: "\u2AAB",
      late: "\u2AAD",
      lates: "\u2AAD\uFE00",
      lbarr: "\u290C",
      lBarr: "\u290E",
      lbbrk: "\u2772",
      lbrace: "{",
      lbrack: "[",
      lbrke: "\u298B",
      lbrksld: "\u298F",
      lbrkslu: "\u298D",
      Lcaron: "\u013D",
      lcaron: "\u013E",
      Lcedil: "\u013B",
      lcedil: "\u013C",
      lceil: "\u2308",
      lcub: "{",
      Lcy: "\u041B",
      lcy: "\u043B",
      ldca: "\u2936",
      ldquo: "\u201C",
      ldquor: "\u201E",
      ldrdhar: "\u2967",
      ldrushar: "\u294B",
      ldsh: "\u21B2",
      le: "\u2264",
      lE: "\u2266",
      LeftAngleBracket: "\u27E8",
      LeftArrowBar: "\u21E4",
      leftarrow: "\u2190",
      LeftArrow: "\u2190",
      Leftarrow: "\u21D0",
      LeftArrowRightArrow: "\u21C6",
      leftarrowtail: "\u21A2",
      LeftCeiling: "\u2308",
      LeftDoubleBracket: "\u27E6",
      LeftDownTeeVector: "\u2961",
      LeftDownVectorBar: "\u2959",
      LeftDownVector: "\u21C3",
      LeftFloor: "\u230A",
      leftharpoondown: "\u21BD",
      leftharpoonup: "\u21BC",
      leftleftarrows: "\u21C7",
      leftrightarrow: "\u2194",
      LeftRightArrow: "\u2194",
      Leftrightarrow: "\u21D4",
      leftrightarrows: "\u21C6",
      leftrightharpoons: "\u21CB",
      leftrightsquigarrow: "\u21AD",
      LeftRightVector: "\u294E",
      LeftTeeArrow: "\u21A4",
      LeftTee: "\u22A3",
      LeftTeeVector: "\u295A",
      leftthreetimes: "\u22CB",
      LeftTriangleBar: "\u29CF",
      LeftTriangle: "\u22B2",
      LeftTriangleEqual: "\u22B4",
      LeftUpDownVector: "\u2951",
      LeftUpTeeVector: "\u2960",
      LeftUpVectorBar: "\u2958",
      LeftUpVector: "\u21BF",
      LeftVectorBar: "\u2952",
      LeftVector: "\u21BC",
      lEg: "\u2A8B",
      leg: "\u22DA",
      leq: "\u2264",
      leqq: "\u2266",
      leqslant: "\u2A7D",
      lescc: "\u2AA8",
      les: "\u2A7D",
      lesdot: "\u2A7F",
      lesdoto: "\u2A81",
      lesdotor: "\u2A83",
      lesg: "\u22DA\uFE00",
      lesges: "\u2A93",
      lessapprox: "\u2A85",
      lessdot: "\u22D6",
      lesseqgtr: "\u22DA",
      lesseqqgtr: "\u2A8B",
      LessEqualGreater: "\u22DA",
      LessFullEqual: "\u2266",
      LessGreater: "\u2276",
      lessgtr: "\u2276",
      LessLess: "\u2AA1",
      lesssim: "\u2272",
      LessSlantEqual: "\u2A7D",
      LessTilde: "\u2272",
      lfisht: "\u297C",
      lfloor: "\u230A",
      Lfr: "\u{1D50F}",
      lfr: "\u{1D529}",
      lg: "\u2276",
      lgE: "\u2A91",
      lHar: "\u2962",
      lhard: "\u21BD",
      lharu: "\u21BC",
      lharul: "\u296A",
      lhblk: "\u2584",
      LJcy: "\u0409",
      ljcy: "\u0459",
      llarr: "\u21C7",
      ll: "\u226A",
      Ll: "\u22D8",
      llcorner: "\u231E",
      Lleftarrow: "\u21DA",
      llhard: "\u296B",
      lltri: "\u25FA",
      Lmidot: "\u013F",
      lmidot: "\u0140",
      lmoustache: "\u23B0",
      lmoust: "\u23B0",
      lnap: "\u2A89",
      lnapprox: "\u2A89",
      lne: "\u2A87",
      lnE: "\u2268",
      lneq: "\u2A87",
      lneqq: "\u2268",
      lnsim: "\u22E6",
      loang: "\u27EC",
      loarr: "\u21FD",
      lobrk: "\u27E6",
      longleftarrow: "\u27F5",
      LongLeftArrow: "\u27F5",
      Longleftarrow: "\u27F8",
      longleftrightarrow: "\u27F7",
      LongLeftRightArrow: "\u27F7",
      Longleftrightarrow: "\u27FA",
      longmapsto: "\u27FC",
      longrightarrow: "\u27F6",
      LongRightArrow: "\u27F6",
      Longrightarrow: "\u27F9",
      looparrowleft: "\u21AB",
      looparrowright: "\u21AC",
      lopar: "\u2985",
      Lopf: "\u{1D543}",
      lopf: "\u{1D55D}",
      loplus: "\u2A2D",
      lotimes: "\u2A34",
      lowast: "\u2217",
      lowbar: "_",
      LowerLeftArrow: "\u2199",
      LowerRightArrow: "\u2198",
      loz: "\u25CA",
      lozenge: "\u25CA",
      lozf: "\u29EB",
      lpar: "(",
      lparlt: "\u2993",
      lrarr: "\u21C6",
      lrcorner: "\u231F",
      lrhar: "\u21CB",
      lrhard: "\u296D",
      lrm: "\u200E",
      lrtri: "\u22BF",
      lsaquo: "\u2039",
      lscr: "\u{1D4C1}",
      Lscr: "\u2112",
      lsh: "\u21B0",
      Lsh: "\u21B0",
      lsim: "\u2272",
      lsime: "\u2A8D",
      lsimg: "\u2A8F",
      lsqb: "[",
      lsquo: "\u2018",
      lsquor: "\u201A",
      Lstrok: "\u0141",
      lstrok: "\u0142",
      ltcc: "\u2AA6",
      ltcir: "\u2A79",
      lt: "<",
      LT: "<",
      Lt: "\u226A",
      ltdot: "\u22D6",
      lthree: "\u22CB",
      ltimes: "\u22C9",
      ltlarr: "\u2976",
      ltquest: "\u2A7B",
      ltri: "\u25C3",
      ltrie: "\u22B4",
      ltrif: "\u25C2",
      ltrPar: "\u2996",
      lurdshar: "\u294A",
      luruhar: "\u2966",
      lvertneqq: "\u2268\uFE00",
      lvnE: "\u2268\uFE00",
      macr: "\xAF",
      male: "\u2642",
      malt: "\u2720",
      maltese: "\u2720",
      Map: "\u2905",
      map: "\u21A6",
      mapsto: "\u21A6",
      mapstodown: "\u21A7",
      mapstoleft: "\u21A4",
      mapstoup: "\u21A5",
      marker: "\u25AE",
      mcomma: "\u2A29",
      Mcy: "\u041C",
      mcy: "\u043C",
      mdash: "\u2014",
      mDDot: "\u223A",
      measuredangle: "\u2221",
      MediumSpace: "\u205F",
      Mellintrf: "\u2133",
      Mfr: "\u{1D510}",
      mfr: "\u{1D52A}",
      mho: "\u2127",
      micro: "\xB5",
      midast: "*",
      midcir: "\u2AF0",
      mid: "\u2223",
      middot: "\xB7",
      minusb: "\u229F",
      minus: "\u2212",
      minusd: "\u2238",
      minusdu: "\u2A2A",
      MinusPlus: "\u2213",
      mlcp: "\u2ADB",
      mldr: "\u2026",
      mnplus: "\u2213",
      models: "\u22A7",
      Mopf: "\u{1D544}",
      mopf: "\u{1D55E}",
      mp: "\u2213",
      mscr: "\u{1D4C2}",
      Mscr: "\u2133",
      mstpos: "\u223E",
      Mu: "\u039C",
      mu: "\u03BC",
      multimap: "\u22B8",
      mumap: "\u22B8",
      nabla: "\u2207",
      Nacute: "\u0143",
      nacute: "\u0144",
      nang: "\u2220\u20D2",
      nap: "\u2249",
      napE: "\u2A70\u0338",
      napid: "\u224B\u0338",
      napos: "\u0149",
      napprox: "\u2249",
      natural: "\u266E",
      naturals: "\u2115",
      natur: "\u266E",
      nbsp: "\xA0",
      nbump: "\u224E\u0338",
      nbumpe: "\u224F\u0338",
      ncap: "\u2A43",
      Ncaron: "\u0147",
      ncaron: "\u0148",
      Ncedil: "\u0145",
      ncedil: "\u0146",
      ncong: "\u2247",
      ncongdot: "\u2A6D\u0338",
      ncup: "\u2A42",
      Ncy: "\u041D",
      ncy: "\u043D",
      ndash: "\u2013",
      nearhk: "\u2924",
      nearr: "\u2197",
      neArr: "\u21D7",
      nearrow: "\u2197",
      ne: "\u2260",
      nedot: "\u2250\u0338",
      NegativeMediumSpace: "\u200B",
      NegativeThickSpace: "\u200B",
      NegativeThinSpace: "\u200B",
      NegativeVeryThinSpace: "\u200B",
      nequiv: "\u2262",
      nesear: "\u2928",
      nesim: "\u2242\u0338",
      NestedGreaterGreater: "\u226B",
      NestedLessLess: "\u226A",
      NewLine: `
`,
      nexist: "\u2204",
      nexists: "\u2204",
      Nfr: "\u{1D511}",
      nfr: "\u{1D52B}",
      ngE: "\u2267\u0338",
      nge: "\u2271",
      ngeq: "\u2271",
      ngeqq: "\u2267\u0338",
      ngeqslant: "\u2A7E\u0338",
      nges: "\u2A7E\u0338",
      nGg: "\u22D9\u0338",
      ngsim: "\u2275",
      nGt: "\u226B\u20D2",
      ngt: "\u226F",
      ngtr: "\u226F",
      nGtv: "\u226B\u0338",
      nharr: "\u21AE",
      nhArr: "\u21CE",
      nhpar: "\u2AF2",
      ni: "\u220B",
      nis: "\u22FC",
      nisd: "\u22FA",
      niv: "\u220B",
      NJcy: "\u040A",
      njcy: "\u045A",
      nlarr: "\u219A",
      nlArr: "\u21CD",
      nldr: "\u2025",
      nlE: "\u2266\u0338",
      nle: "\u2270",
      nleftarrow: "\u219A",
      nLeftarrow: "\u21CD",
      nleftrightarrow: "\u21AE",
      nLeftrightarrow: "\u21CE",
      nleq: "\u2270",
      nleqq: "\u2266\u0338",
      nleqslant: "\u2A7D\u0338",
      nles: "\u2A7D\u0338",
      nless: "\u226E",
      nLl: "\u22D8\u0338",
      nlsim: "\u2274",
      nLt: "\u226A\u20D2",
      nlt: "\u226E",
      nltri: "\u22EA",
      nltrie: "\u22EC",
      nLtv: "\u226A\u0338",
      nmid: "\u2224",
      NoBreak: "\u2060",
      NonBreakingSpace: "\xA0",
      nopf: "\u{1D55F}",
      Nopf: "\u2115",
      Not: "\u2AEC",
      not: "\xAC",
      NotCongruent: "\u2262",
      NotCupCap: "\u226D",
      NotDoubleVerticalBar: "\u2226",
      NotElement: "\u2209",
      NotEqual: "\u2260",
      NotEqualTilde: "\u2242\u0338",
      NotExists: "\u2204",
      NotGreater: "\u226F",
      NotGreaterEqual: "\u2271",
      NotGreaterFullEqual: "\u2267\u0338",
      NotGreaterGreater: "\u226B\u0338",
      NotGreaterLess: "\u2279",
      NotGreaterSlantEqual: "\u2A7E\u0338",
      NotGreaterTilde: "\u2275",
      NotHumpDownHump: "\u224E\u0338",
      NotHumpEqual: "\u224F\u0338",
      notin: "\u2209",
      notindot: "\u22F5\u0338",
      notinE: "\u22F9\u0338",
      notinva: "\u2209",
      notinvb: "\u22F7",
      notinvc: "\u22F6",
      NotLeftTriangleBar: "\u29CF\u0338",
      NotLeftTriangle: "\u22EA",
      NotLeftTriangleEqual: "\u22EC",
      NotLess: "\u226E",
      NotLessEqual: "\u2270",
      NotLessGreater: "\u2278",
      NotLessLess: "\u226A\u0338",
      NotLessSlantEqual: "\u2A7D\u0338",
      NotLessTilde: "\u2274",
      NotNestedGreaterGreater: "\u2AA2\u0338",
      NotNestedLessLess: "\u2AA1\u0338",
      notni: "\u220C",
      notniva: "\u220C",
      notnivb: "\u22FE",
      notnivc: "\u22FD",
      NotPrecedes: "\u2280",
      NotPrecedesEqual: "\u2AAF\u0338",
      NotPrecedesSlantEqual: "\u22E0",
      NotReverseElement: "\u220C",
      NotRightTriangleBar: "\u29D0\u0338",
      NotRightTriangle: "\u22EB",
      NotRightTriangleEqual: "\u22ED",
      NotSquareSubset: "\u228F\u0338",
      NotSquareSubsetEqual: "\u22E2",
      NotSquareSuperset: "\u2290\u0338",
      NotSquareSupersetEqual: "\u22E3",
      NotSubset: "\u2282\u20D2",
      NotSubsetEqual: "\u2288",
      NotSucceeds: "\u2281",
      NotSucceedsEqual: "\u2AB0\u0338",
      NotSucceedsSlantEqual: "\u22E1",
      NotSucceedsTilde: "\u227F\u0338",
      NotSuperset: "\u2283\u20D2",
      NotSupersetEqual: "\u2289",
      NotTilde: "\u2241",
      NotTildeEqual: "\u2244",
      NotTildeFullEqual: "\u2247",
      NotTildeTilde: "\u2249",
      NotVerticalBar: "\u2224",
      nparallel: "\u2226",
      npar: "\u2226",
      nparsl: "\u2AFD\u20E5",
      npart: "\u2202\u0338",
      npolint: "\u2A14",
      npr: "\u2280",
      nprcue: "\u22E0",
      nprec: "\u2280",
      npreceq: "\u2AAF\u0338",
      npre: "\u2AAF\u0338",
      nrarrc: "\u2933\u0338",
      nrarr: "\u219B",
      nrArr: "\u21CF",
      nrarrw: "\u219D\u0338",
      nrightarrow: "\u219B",
      nRightarrow: "\u21CF",
      nrtri: "\u22EB",
      nrtrie: "\u22ED",
      nsc: "\u2281",
      nsccue: "\u22E1",
      nsce: "\u2AB0\u0338",
      Nscr: "\u{1D4A9}",
      nscr: "\u{1D4C3}",
      nshortmid: "\u2224",
      nshortparallel: "\u2226",
      nsim: "\u2241",
      nsime: "\u2244",
      nsimeq: "\u2244",
      nsmid: "\u2224",
      nspar: "\u2226",
      nsqsube: "\u22E2",
      nsqsupe: "\u22E3",
      nsub: "\u2284",
      nsubE: "\u2AC5\u0338",
      nsube: "\u2288",
      nsubset: "\u2282\u20D2",
      nsubseteq: "\u2288",
      nsubseteqq: "\u2AC5\u0338",
      nsucc: "\u2281",
      nsucceq: "\u2AB0\u0338",
      nsup: "\u2285",
      nsupE: "\u2AC6\u0338",
      nsupe: "\u2289",
      nsupset: "\u2283\u20D2",
      nsupseteq: "\u2289",
      nsupseteqq: "\u2AC6\u0338",
      ntgl: "\u2279",
      Ntilde: "\xD1",
      ntilde: "\xF1",
      ntlg: "\u2278",
      ntriangleleft: "\u22EA",
      ntrianglelefteq: "\u22EC",
      ntriangleright: "\u22EB",
      ntrianglerighteq: "\u22ED",
      Nu: "\u039D",
      nu: "\u03BD",
      num: "#",
      numero: "\u2116",
      numsp: "\u2007",
      nvap: "\u224D\u20D2",
      nvdash: "\u22AC",
      nvDash: "\u22AD",
      nVdash: "\u22AE",
      nVDash: "\u22AF",
      nvge: "\u2265\u20D2",
      nvgt: ">\u20D2",
      nvHarr: "\u2904",
      nvinfin: "\u29DE",
      nvlArr: "\u2902",
      nvle: "\u2264\u20D2",
      nvlt: "<\u20D2",
      nvltrie: "\u22B4\u20D2",
      nvrArr: "\u2903",
      nvrtrie: "\u22B5\u20D2",
      nvsim: "\u223C\u20D2",
      nwarhk: "\u2923",
      nwarr: "\u2196",
      nwArr: "\u21D6",
      nwarrow: "\u2196",
      nwnear: "\u2927",
      Oacute: "\xD3",
      oacute: "\xF3",
      oast: "\u229B",
      Ocirc: "\xD4",
      ocirc: "\xF4",
      ocir: "\u229A",
      Ocy: "\u041E",
      ocy: "\u043E",
      odash: "\u229D",
      Odblac: "\u0150",
      odblac: "\u0151",
      odiv: "\u2A38",
      odot: "\u2299",
      odsold: "\u29BC",
      OElig: "\u0152",
      oelig: "\u0153",
      ofcir: "\u29BF",
      Ofr: "\u{1D512}",
      ofr: "\u{1D52C}",
      ogon: "\u02DB",
      Ograve: "\xD2",
      ograve: "\xF2",
      ogt: "\u29C1",
      ohbar: "\u29B5",
      ohm: "\u03A9",
      oint: "\u222E",
      olarr: "\u21BA",
      olcir: "\u29BE",
      olcross: "\u29BB",
      oline: "\u203E",
      olt: "\u29C0",
      Omacr: "\u014C",
      omacr: "\u014D",
      Omega: "\u03A9",
      omega: "\u03C9",
      Omicron: "\u039F",
      omicron: "\u03BF",
      omid: "\u29B6",
      ominus: "\u2296",
      Oopf: "\u{1D546}",
      oopf: "\u{1D560}",
      opar: "\u29B7",
      OpenCurlyDoubleQuote: "\u201C",
      OpenCurlyQuote: "\u2018",
      operp: "\u29B9",
      oplus: "\u2295",
      orarr: "\u21BB",
      Or: "\u2A54",
      or: "\u2228",
      ord: "\u2A5D",
      order: "\u2134",
      orderof: "\u2134",
      ordf: "\xAA",
      ordm: "\xBA",
      origof: "\u22B6",
      oror: "\u2A56",
      orslope: "\u2A57",
      orv: "\u2A5B",
      oS: "\u24C8",
      Oscr: "\u{1D4AA}",
      oscr: "\u2134",
      Oslash: "\xD8",
      oslash: "\xF8",
      osol: "\u2298",
      Otilde: "\xD5",
      otilde: "\xF5",
      otimesas: "\u2A36",
      Otimes: "\u2A37",
      otimes: "\u2297",
      Ouml: "\xD6",
      ouml: "\xF6",
      ovbar: "\u233D",
      OverBar: "\u203E",
      OverBrace: "\u23DE",
      OverBracket: "\u23B4",
      OverParenthesis: "\u23DC",
      para: "\xB6",
      parallel: "\u2225",
      par: "\u2225",
      parsim: "\u2AF3",
      parsl: "\u2AFD",
      part: "\u2202",
      PartialD: "\u2202",
      Pcy: "\u041F",
      pcy: "\u043F",
      percnt: "%",
      period: ".",
      permil: "\u2030",
      perp: "\u22A5",
      pertenk: "\u2031",
      Pfr: "\u{1D513}",
      pfr: "\u{1D52D}",
      Phi: "\u03A6",
      phi: "\u03C6",
      phiv: "\u03D5",
      phmmat: "\u2133",
      phone: "\u260E",
      Pi: "\u03A0",
      pi: "\u03C0",
      pitchfork: "\u22D4",
      piv: "\u03D6",
      planck: "\u210F",
      planckh: "\u210E",
      plankv: "\u210F",
      plusacir: "\u2A23",
      plusb: "\u229E",
      pluscir: "\u2A22",
      plus: "+",
      plusdo: "\u2214",
      plusdu: "\u2A25",
      pluse: "\u2A72",
      PlusMinus: "\xB1",
      plusmn: "\xB1",
      plussim: "\u2A26",
      plustwo: "\u2A27",
      pm: "\xB1",
      Poincareplane: "\u210C",
      pointint: "\u2A15",
      popf: "\u{1D561}",
      Popf: "\u2119",
      pound: "\xA3",
      prap: "\u2AB7",
      Pr: "\u2ABB",
      pr: "\u227A",
      prcue: "\u227C",
      precapprox: "\u2AB7",
      prec: "\u227A",
      preccurlyeq: "\u227C",
      Precedes: "\u227A",
      PrecedesEqual: "\u2AAF",
      PrecedesSlantEqual: "\u227C",
      PrecedesTilde: "\u227E",
      preceq: "\u2AAF",
      precnapprox: "\u2AB9",
      precneqq: "\u2AB5",
      precnsim: "\u22E8",
      pre: "\u2AAF",
      prE: "\u2AB3",
      precsim: "\u227E",
      prime: "\u2032",
      Prime: "\u2033",
      primes: "\u2119",
      prnap: "\u2AB9",
      prnE: "\u2AB5",
      prnsim: "\u22E8",
      prod: "\u220F",
      Product: "\u220F",
      profalar: "\u232E",
      profline: "\u2312",
      profsurf: "\u2313",
      prop: "\u221D",
      Proportional: "\u221D",
      Proportion: "\u2237",
      propto: "\u221D",
      prsim: "\u227E",
      prurel: "\u22B0",
      Pscr: "\u{1D4AB}",
      pscr: "\u{1D4C5}",
      Psi: "\u03A8",
      psi: "\u03C8",
      puncsp: "\u2008",
      Qfr: "\u{1D514}",
      qfr: "\u{1D52E}",
      qint: "\u2A0C",
      qopf: "\u{1D562}",
      Qopf: "\u211A",
      qprime: "\u2057",
      Qscr: "\u{1D4AC}",
      qscr: "\u{1D4C6}",
      quaternions: "\u210D",
      quatint: "\u2A16",
      quest: "?",
      questeq: "\u225F",
      quot: '"',
      QUOT: '"',
      rAarr: "\u21DB",
      race: "\u223D\u0331",
      Racute: "\u0154",
      racute: "\u0155",
      radic: "\u221A",
      raemptyv: "\u29B3",
      rang: "\u27E9",
      Rang: "\u27EB",
      rangd: "\u2992",
      range: "\u29A5",
      rangle: "\u27E9",
      raquo: "\xBB",
      rarrap: "\u2975",
      rarrb: "\u21E5",
      rarrbfs: "\u2920",
      rarrc: "\u2933",
      rarr: "\u2192",
      Rarr: "\u21A0",
      rArr: "\u21D2",
      rarrfs: "\u291E",
      rarrhk: "\u21AA",
      rarrlp: "\u21AC",
      rarrpl: "\u2945",
      rarrsim: "\u2974",
      Rarrtl: "\u2916",
      rarrtl: "\u21A3",
      rarrw: "\u219D",
      ratail: "\u291A",
      rAtail: "\u291C",
      ratio: "\u2236",
      rationals: "\u211A",
      rbarr: "\u290D",
      rBarr: "\u290F",
      RBarr: "\u2910",
      rbbrk: "\u2773",
      rbrace: "}",
      rbrack: "]",
      rbrke: "\u298C",
      rbrksld: "\u298E",
      rbrkslu: "\u2990",
      Rcaron: "\u0158",
      rcaron: "\u0159",
      Rcedil: "\u0156",
      rcedil: "\u0157",
      rceil: "\u2309",
      rcub: "}",
      Rcy: "\u0420",
      rcy: "\u0440",
      rdca: "\u2937",
      rdldhar: "\u2969",
      rdquo: "\u201D",
      rdquor: "\u201D",
      rdsh: "\u21B3",
      real: "\u211C",
      realine: "\u211B",
      realpart: "\u211C",
      reals: "\u211D",
      Re: "\u211C",
      rect: "\u25AD",
      reg: "\xAE",
      REG: "\xAE",
      ReverseElement: "\u220B",
      ReverseEquilibrium: "\u21CB",
      ReverseUpEquilibrium: "\u296F",
      rfisht: "\u297D",
      rfloor: "\u230B",
      rfr: "\u{1D52F}",
      Rfr: "\u211C",
      rHar: "\u2964",
      rhard: "\u21C1",
      rharu: "\u21C0",
      rharul: "\u296C",
      Rho: "\u03A1",
      rho: "\u03C1",
      rhov: "\u03F1",
      RightAngleBracket: "\u27E9",
      RightArrowBar: "\u21E5",
      rightarrow: "\u2192",
      RightArrow: "\u2192",
      Rightarrow: "\u21D2",
      RightArrowLeftArrow: "\u21C4",
      rightarrowtail: "\u21A3",
      RightCeiling: "\u2309",
      RightDoubleBracket: "\u27E7",
      RightDownTeeVector: "\u295D",
      RightDownVectorBar: "\u2955",
      RightDownVector: "\u21C2",
      RightFloor: "\u230B",
      rightharpoondown: "\u21C1",
      rightharpoonup: "\u21C0",
      rightleftarrows: "\u21C4",
      rightleftharpoons: "\u21CC",
      rightrightarrows: "\u21C9",
      rightsquigarrow: "\u219D",
      RightTeeArrow: "\u21A6",
      RightTee: "\u22A2",
      RightTeeVector: "\u295B",
      rightthreetimes: "\u22CC",
      RightTriangleBar: "\u29D0",
      RightTriangle: "\u22B3",
      RightTriangleEqual: "\u22B5",
      RightUpDownVector: "\u294F",
      RightUpTeeVector: "\u295C",
      RightUpVectorBar: "\u2954",
      RightUpVector: "\u21BE",
      RightVectorBar: "\u2953",
      RightVector: "\u21C0",
      ring: "\u02DA",
      risingdotseq: "\u2253",
      rlarr: "\u21C4",
      rlhar: "\u21CC",
      rlm: "\u200F",
      rmoustache: "\u23B1",
      rmoust: "\u23B1",
      rnmid: "\u2AEE",
      roang: "\u27ED",
      roarr: "\u21FE",
      robrk: "\u27E7",
      ropar: "\u2986",
      ropf: "\u{1D563}",
      Ropf: "\u211D",
      roplus: "\u2A2E",
      rotimes: "\u2A35",
      RoundImplies: "\u2970",
      rpar: ")",
      rpargt: "\u2994",
      rppolint: "\u2A12",
      rrarr: "\u21C9",
      Rrightarrow: "\u21DB",
      rsaquo: "\u203A",
      rscr: "\u{1D4C7}",
      Rscr: "\u211B",
      rsh: "\u21B1",
      Rsh: "\u21B1",
      rsqb: "]",
      rsquo: "\u2019",
      rsquor: "\u2019",
      rthree: "\u22CC",
      rtimes: "\u22CA",
      rtri: "\u25B9",
      rtrie: "\u22B5",
      rtrif: "\u25B8",
      rtriltri: "\u29CE",
      RuleDelayed: "\u29F4",
      ruluhar: "\u2968",
      rx: "\u211E",
      Sacute: "\u015A",
      sacute: "\u015B",
      sbquo: "\u201A",
      scap: "\u2AB8",
      Scaron: "\u0160",
      scaron: "\u0161",
      Sc: "\u2ABC",
      sc: "\u227B",
      sccue: "\u227D",
      sce: "\u2AB0",
      scE: "\u2AB4",
      Scedil: "\u015E",
      scedil: "\u015F",
      Scirc: "\u015C",
      scirc: "\u015D",
      scnap: "\u2ABA",
      scnE: "\u2AB6",
      scnsim: "\u22E9",
      scpolint: "\u2A13",
      scsim: "\u227F",
      Scy: "\u0421",
      scy: "\u0441",
      sdotb: "\u22A1",
      sdot: "\u22C5",
      sdote: "\u2A66",
      searhk: "\u2925",
      searr: "\u2198",
      seArr: "\u21D8",
      searrow: "\u2198",
      sect: "\xA7",
      semi: ";",
      seswar: "\u2929",
      setminus: "\u2216",
      setmn: "\u2216",
      sext: "\u2736",
      Sfr: "\u{1D516}",
      sfr: "\u{1D530}",
      sfrown: "\u2322",
      sharp: "\u266F",
      SHCHcy: "\u0429",
      shchcy: "\u0449",
      SHcy: "\u0428",
      shcy: "\u0448",
      ShortDownArrow: "\u2193",
      ShortLeftArrow: "\u2190",
      shortmid: "\u2223",
      shortparallel: "\u2225",
      ShortRightArrow: "\u2192",
      ShortUpArrow: "\u2191",
      shy: "\xAD",
      Sigma: "\u03A3",
      sigma: "\u03C3",
      sigmaf: "\u03C2",
      sigmav: "\u03C2",
      sim: "\u223C",
      simdot: "\u2A6A",
      sime: "\u2243",
      simeq: "\u2243",
      simg: "\u2A9E",
      simgE: "\u2AA0",
      siml: "\u2A9D",
      simlE: "\u2A9F",
      simne: "\u2246",
      simplus: "\u2A24",
      simrarr: "\u2972",
      slarr: "\u2190",
      SmallCircle: "\u2218",
      smallsetminus: "\u2216",
      smashp: "\u2A33",
      smeparsl: "\u29E4",
      smid: "\u2223",
      smile: "\u2323",
      smt: "\u2AAA",
      smte: "\u2AAC",
      smtes: "\u2AAC\uFE00",
      SOFTcy: "\u042C",
      softcy: "\u044C",
      solbar: "\u233F",
      solb: "\u29C4",
      sol: "/",
      Sopf: "\u{1D54A}",
      sopf: "\u{1D564}",
      spades: "\u2660",
      spadesuit: "\u2660",
      spar: "\u2225",
      sqcap: "\u2293",
      sqcaps: "\u2293\uFE00",
      sqcup: "\u2294",
      sqcups: "\u2294\uFE00",
      Sqrt: "\u221A",
      sqsub: "\u228F",
      sqsube: "\u2291",
      sqsubset: "\u228F",
      sqsubseteq: "\u2291",
      sqsup: "\u2290",
      sqsupe: "\u2292",
      sqsupset: "\u2290",
      sqsupseteq: "\u2292",
      square: "\u25A1",
      Square: "\u25A1",
      SquareIntersection: "\u2293",
      SquareSubset: "\u228F",
      SquareSubsetEqual: "\u2291",
      SquareSuperset: "\u2290",
      SquareSupersetEqual: "\u2292",
      SquareUnion: "\u2294",
      squarf: "\u25AA",
      squ: "\u25A1",
      squf: "\u25AA",
      srarr: "\u2192",
      Sscr: "\u{1D4AE}",
      sscr: "\u{1D4C8}",
      ssetmn: "\u2216",
      ssmile: "\u2323",
      sstarf: "\u22C6",
      Star: "\u22C6",
      star: "\u2606",
      starf: "\u2605",
      straightepsilon: "\u03F5",
      straightphi: "\u03D5",
      strns: "\xAF",
      sub: "\u2282",
      Sub: "\u22D0",
      subdot: "\u2ABD",
      subE: "\u2AC5",
      sube: "\u2286",
      subedot: "\u2AC3",
      submult: "\u2AC1",
      subnE: "\u2ACB",
      subne: "\u228A",
      subplus: "\u2ABF",
      subrarr: "\u2979",
      subset: "\u2282",
      Subset: "\u22D0",
      subseteq: "\u2286",
      subseteqq: "\u2AC5",
      SubsetEqual: "\u2286",
      subsetneq: "\u228A",
      subsetneqq: "\u2ACB",
      subsim: "\u2AC7",
      subsub: "\u2AD5",
      subsup: "\u2AD3",
      succapprox: "\u2AB8",
      succ: "\u227B",
      succcurlyeq: "\u227D",
      Succeeds: "\u227B",
      SucceedsEqual: "\u2AB0",
      SucceedsSlantEqual: "\u227D",
      SucceedsTilde: "\u227F",
      succeq: "\u2AB0",
      succnapprox: "\u2ABA",
      succneqq: "\u2AB6",
      succnsim: "\u22E9",
      succsim: "\u227F",
      SuchThat: "\u220B",
      sum: "\u2211",
      Sum: "\u2211",
      sung: "\u266A",
      sup1: "\xB9",
      sup2: "\xB2",
      sup3: "\xB3",
      sup: "\u2283",
      Sup: "\u22D1",
      supdot: "\u2ABE",
      supdsub: "\u2AD8",
      supE: "\u2AC6",
      supe: "\u2287",
      supedot: "\u2AC4",
      Superset: "\u2283",
      SupersetEqual: "\u2287",
      suphsol: "\u27C9",
      suphsub: "\u2AD7",
      suplarr: "\u297B",
      supmult: "\u2AC2",
      supnE: "\u2ACC",
      supne: "\u228B",
      supplus: "\u2AC0",
      supset: "\u2283",
      Supset: "\u22D1",
      supseteq: "\u2287",
      supseteqq: "\u2AC6",
      supsetneq: "\u228B",
      supsetneqq: "\u2ACC",
      supsim: "\u2AC8",
      supsub: "\u2AD4",
      supsup: "\u2AD6",
      swarhk: "\u2926",
      swarr: "\u2199",
      swArr: "\u21D9",
      swarrow: "\u2199",
      swnwar: "\u292A",
      szlig: "\xDF",
      Tab: "	",
      target: "\u2316",
      Tau: "\u03A4",
      tau: "\u03C4",
      tbrk: "\u23B4",
      Tcaron: "\u0164",
      tcaron: "\u0165",
      Tcedil: "\u0162",
      tcedil: "\u0163",
      Tcy: "\u0422",
      tcy: "\u0442",
      tdot: "\u20DB",
      telrec: "\u2315",
      Tfr: "\u{1D517}",
      tfr: "\u{1D531}",
      there4: "\u2234",
      therefore: "\u2234",
      Therefore: "\u2234",
      Theta: "\u0398",
      theta: "\u03B8",
      thetasym: "\u03D1",
      thetav: "\u03D1",
      thickapprox: "\u2248",
      thicksim: "\u223C",
      ThickSpace: "\u205F\u200A",
      ThinSpace: "\u2009",
      thinsp: "\u2009",
      thkap: "\u2248",
      thksim: "\u223C",
      THORN: "\xDE",
      thorn: "\xFE",
      tilde: "\u02DC",
      Tilde: "\u223C",
      TildeEqual: "\u2243",
      TildeFullEqual: "\u2245",
      TildeTilde: "\u2248",
      timesbar: "\u2A31",
      timesb: "\u22A0",
      times: "\xD7",
      timesd: "\u2A30",
      tint: "\u222D",
      toea: "\u2928",
      topbot: "\u2336",
      topcir: "\u2AF1",
      top: "\u22A4",
      Topf: "\u{1D54B}",
      topf: "\u{1D565}",
      topfork: "\u2ADA",
      tosa: "\u2929",
      tprime: "\u2034",
      trade: "\u2122",
      TRADE: "\u2122",
      triangle: "\u25B5",
      triangledown: "\u25BF",
      triangleleft: "\u25C3",
      trianglelefteq: "\u22B4",
      triangleq: "\u225C",
      triangleright: "\u25B9",
      trianglerighteq: "\u22B5",
      tridot: "\u25EC",
      trie: "\u225C",
      triminus: "\u2A3A",
      TripleDot: "\u20DB",
      triplus: "\u2A39",
      trisb: "\u29CD",
      tritime: "\u2A3B",
      trpezium: "\u23E2",
      Tscr: "\u{1D4AF}",
      tscr: "\u{1D4C9}",
      TScy: "\u0426",
      tscy: "\u0446",
      TSHcy: "\u040B",
      tshcy: "\u045B",
      Tstrok: "\u0166",
      tstrok: "\u0167",
      twixt: "\u226C",
      twoheadleftarrow: "\u219E",
      twoheadrightarrow: "\u21A0",
      Uacute: "\xDA",
      uacute: "\xFA",
      uarr: "\u2191",
      Uarr: "\u219F",
      uArr: "\u21D1",
      Uarrocir: "\u2949",
      Ubrcy: "\u040E",
      ubrcy: "\u045E",
      Ubreve: "\u016C",
      ubreve: "\u016D",
      Ucirc: "\xDB",
      ucirc: "\xFB",
      Ucy: "\u0423",
      ucy: "\u0443",
      udarr: "\u21C5",
      Udblac: "\u0170",
      udblac: "\u0171",
      udhar: "\u296E",
      ufisht: "\u297E",
      Ufr: "\u{1D518}",
      ufr: "\u{1D532}",
      Ugrave: "\xD9",
      ugrave: "\xF9",
      uHar: "\u2963",
      uharl: "\u21BF",
      uharr: "\u21BE",
      uhblk: "\u2580",
      ulcorn: "\u231C",
      ulcorner: "\u231C",
      ulcrop: "\u230F",
      ultri: "\u25F8",
      Umacr: "\u016A",
      umacr: "\u016B",
      uml: "\xA8",
      UnderBar: "_",
      UnderBrace: "\u23DF",
      UnderBracket: "\u23B5",
      UnderParenthesis: "\u23DD",
      Union: "\u22C3",
      UnionPlus: "\u228E",
      Uogon: "\u0172",
      uogon: "\u0173",
      Uopf: "\u{1D54C}",
      uopf: "\u{1D566}",
      UpArrowBar: "\u2912",
      uparrow: "\u2191",
      UpArrow: "\u2191",
      Uparrow: "\u21D1",
      UpArrowDownArrow: "\u21C5",
      updownarrow: "\u2195",
      UpDownArrow: "\u2195",
      Updownarrow: "\u21D5",
      UpEquilibrium: "\u296E",
      upharpoonleft: "\u21BF",
      upharpoonright: "\u21BE",
      uplus: "\u228E",
      UpperLeftArrow: "\u2196",
      UpperRightArrow: "\u2197",
      upsi: "\u03C5",
      Upsi: "\u03D2",
      upsih: "\u03D2",
      Upsilon: "\u03A5",
      upsilon: "\u03C5",
      UpTeeArrow: "\u21A5",
      UpTee: "\u22A5",
      upuparrows: "\u21C8",
      urcorn: "\u231D",
      urcorner: "\u231D",
      urcrop: "\u230E",
      Uring: "\u016E",
      uring: "\u016F",
      urtri: "\u25F9",
      Uscr: "\u{1D4B0}",
      uscr: "\u{1D4CA}",
      utdot: "\u22F0",
      Utilde: "\u0168",
      utilde: "\u0169",
      utri: "\u25B5",
      utrif: "\u25B4",
      uuarr: "\u21C8",
      Uuml: "\xDC",
      uuml: "\xFC",
      uwangle: "\u29A7",
      vangrt: "\u299C",
      varepsilon: "\u03F5",
      varkappa: "\u03F0",
      varnothing: "\u2205",
      varphi: "\u03D5",
      varpi: "\u03D6",
      varpropto: "\u221D",
      varr: "\u2195",
      vArr: "\u21D5",
      varrho: "\u03F1",
      varsigma: "\u03C2",
      varsubsetneq: "\u228A\uFE00",
      varsubsetneqq: "\u2ACB\uFE00",
      varsupsetneq: "\u228B\uFE00",
      varsupsetneqq: "\u2ACC\uFE00",
      vartheta: "\u03D1",
      vartriangleleft: "\u22B2",
      vartriangleright: "\u22B3",
      vBar: "\u2AE8",
      Vbar: "\u2AEB",
      vBarv: "\u2AE9",
      Vcy: "\u0412",
      vcy: "\u0432",
      vdash: "\u22A2",
      vDash: "\u22A8",
      Vdash: "\u22A9",
      VDash: "\u22AB",
      Vdashl: "\u2AE6",
      veebar: "\u22BB",
      vee: "\u2228",
      Vee: "\u22C1",
      veeeq: "\u225A",
      vellip: "\u22EE",
      verbar: "|",
      Verbar: "\u2016",
      vert: "|",
      Vert: "\u2016",
      VerticalBar: "\u2223",
      VerticalLine: "|",
      VerticalSeparator: "\u2758",
      VerticalTilde: "\u2240",
      VeryThinSpace: "\u200A",
      Vfr: "\u{1D519}",
      vfr: "\u{1D533}",
      vltri: "\u22B2",
      vnsub: "\u2282\u20D2",
      vnsup: "\u2283\u20D2",
      Vopf: "\u{1D54D}",
      vopf: "\u{1D567}",
      vprop: "\u221D",
      vrtri: "\u22B3",
      Vscr: "\u{1D4B1}",
      vscr: "\u{1D4CB}",
      vsubnE: "\u2ACB\uFE00",
      vsubne: "\u228A\uFE00",
      vsupnE: "\u2ACC\uFE00",
      vsupne: "\u228B\uFE00",
      Vvdash: "\u22AA",
      vzigzag: "\u299A",
      Wcirc: "\u0174",
      wcirc: "\u0175",
      wedbar: "\u2A5F",
      wedge: "\u2227",
      Wedge: "\u22C0",
      wedgeq: "\u2259",
      weierp: "\u2118",
      Wfr: "\u{1D51A}",
      wfr: "\u{1D534}",
      Wopf: "\u{1D54E}",
      wopf: "\u{1D568}",
      wp: "\u2118",
      wr: "\u2240",
      wreath: "\u2240",
      Wscr: "\u{1D4B2}",
      wscr: "\u{1D4CC}",
      xcap: "\u22C2",
      xcirc: "\u25EF",
      xcup: "\u22C3",
      xdtri: "\u25BD",
      Xfr: "\u{1D51B}",
      xfr: "\u{1D535}",
      xharr: "\u27F7",
      xhArr: "\u27FA",
      Xi: "\u039E",
      xi: "\u03BE",
      xlarr: "\u27F5",
      xlArr: "\u27F8",
      xmap: "\u27FC",
      xnis: "\u22FB",
      xodot: "\u2A00",
      Xopf: "\u{1D54F}",
      xopf: "\u{1D569}",
      xoplus: "\u2A01",
      xotime: "\u2A02",
      xrarr: "\u27F6",
      xrArr: "\u27F9",
      Xscr: "\u{1D4B3}",
      xscr: "\u{1D4CD}",
      xsqcup: "\u2A06",
      xuplus: "\u2A04",
      xutri: "\u25B3",
      xvee: "\u22C1",
      xwedge: "\u22C0",
      Yacute: "\xDD",
      yacute: "\xFD",
      YAcy: "\u042F",
      yacy: "\u044F",
      Ycirc: "\u0176",
      ycirc: "\u0177",
      Ycy: "\u042B",
      ycy: "\u044B",
      yen: "\xA5",
      Yfr: "\u{1D51C}",
      yfr: "\u{1D536}",
      YIcy: "\u0407",
      yicy: "\u0457",
      Yopf: "\u{1D550}",
      yopf: "\u{1D56A}",
      Yscr: "\u{1D4B4}",
      yscr: "\u{1D4CE}",
      YUcy: "\u042E",
      yucy: "\u044E",
      yuml: "\xFF",
      Yuml: "\u0178",
      Zacute: "\u0179",
      zacute: "\u017A",
      Zcaron: "\u017D",
      zcaron: "\u017E",
      Zcy: "\u0417",
      zcy: "\u0437",
      Zdot: "\u017B",
      zdot: "\u017C",
      zeetrf: "\u2128",
      ZeroWidthSpace: "\u200B",
      Zeta: "\u0396",
      zeta: "\u03B6",
      zfr: "\u{1D537}",
      Zfr: "\u2128",
      ZHcy: "\u0416",
      zhcy: "\u0436",
      zigrarr: "\u21DD",
      zopf: "\u{1D56B}",
      Zopf: "\u2124",
      Zscr: "\u{1D4B5}",
      zscr: "\u{1D4CF}",
      zwj: "\u200D",
      zwnj: "\u200C",
    };
  });
  var Ep = U((Cx, Hw) => {
    Hw.exports = {
      Aacute: "\xC1",
      aacute: "\xE1",
      Acirc: "\xC2",
      acirc: "\xE2",
      acute: "\xB4",
      AElig: "\xC6",
      aelig: "\xE6",
      Agrave: "\xC0",
      agrave: "\xE0",
      amp: "&",
      AMP: "&",
      Aring: "\xC5",
      aring: "\xE5",
      Atilde: "\xC3",
      atilde: "\xE3",
      Auml: "\xC4",
      auml: "\xE4",
      brvbar: "\xA6",
      Ccedil: "\xC7",
      ccedil: "\xE7",
      cedil: "\xB8",
      cent: "\xA2",
      copy: "\xA9",
      COPY: "\xA9",
      curren: "\xA4",
      deg: "\xB0",
      divide: "\xF7",
      Eacute: "\xC9",
      eacute: "\xE9",
      Ecirc: "\xCA",
      ecirc: "\xEA",
      Egrave: "\xC8",
      egrave: "\xE8",
      ETH: "\xD0",
      eth: "\xF0",
      Euml: "\xCB",
      euml: "\xEB",
      frac12: "\xBD",
      frac14: "\xBC",
      frac34: "\xBE",
      gt: ">",
      GT: ">",
      Iacute: "\xCD",
      iacute: "\xED",
      Icirc: "\xCE",
      icirc: "\xEE",
      iexcl: "\xA1",
      Igrave: "\xCC",
      igrave: "\xEC",
      iquest: "\xBF",
      Iuml: "\xCF",
      iuml: "\xEF",
      laquo: "\xAB",
      lt: "<",
      LT: "<",
      macr: "\xAF",
      micro: "\xB5",
      middot: "\xB7",
      nbsp: "\xA0",
      not: "\xAC",
      Ntilde: "\xD1",
      ntilde: "\xF1",
      Oacute: "\xD3",
      oacute: "\xF3",
      Ocirc: "\xD4",
      ocirc: "\xF4",
      Ograve: "\xD2",
      ograve: "\xF2",
      ordf: "\xAA",
      ordm: "\xBA",
      Oslash: "\xD8",
      oslash: "\xF8",
      Otilde: "\xD5",
      otilde: "\xF5",
      Ouml: "\xD6",
      ouml: "\xF6",
      para: "\xB6",
      plusmn: "\xB1",
      pound: "\xA3",
      quot: '"',
      QUOT: '"',
      raquo: "\xBB",
      reg: "\xAE",
      REG: "\xAE",
      sect: "\xA7",
      shy: "\xAD",
      sup1: "\xB9",
      sup2: "\xB2",
      sup3: "\xB3",
      szlig: "\xDF",
      THORN: "\xDE",
      thorn: "\xFE",
      times: "\xD7",
      Uacute: "\xDA",
      uacute: "\xFA",
      Ucirc: "\xDB",
      ucirc: "\xFB",
      Ugrave: "\xD9",
      ugrave: "\xF9",
      uml: "\xA8",
      Uuml: "\xDC",
      uuml: "\xFC",
      Yacute: "\xDD",
      yacute: "\xFD",
      yen: "\xA5",
      yuml: "\xFF",
    };
  });
  var wo = U((xx, Gw) => {
    Gw.exports = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  });
  var Cp = U((Sx, Vw) => {
    Vw.exports = {
      0: 65533,
      128: 8364,
      130: 8218,
      131: 402,
      132: 8222,
      133: 8230,
      134: 8224,
      135: 8225,
      136: 710,
      137: 8240,
      138: 352,
      139: 8249,
      140: 338,
      142: 381,
      145: 8216,
      146: 8217,
      147: 8220,
      148: 8221,
      149: 8226,
      150: 8211,
      151: 8212,
      152: 732,
      153: 8482,
      154: 353,
      155: 8250,
      156: 339,
      158: 382,
      159: 376,
    };
  });
  var Sp = U((ri) => {
    "use strict";
    var Ww =
      (ri && ri.__importDefault) ||
      function (t) {
        return t && t.__esModule ? t : { default: t };
      };
    Object.defineProperty(ri, "__esModule", { value: !0 });
    var xp = Ww(Cp()),
      zw =
        String.fromCodePoint ||
        function (t) {
          var r = "";
          return (
            t > 65535 &&
              ((t -= 65536),
              (r += String.fromCharCode(((t >>> 10) & 1023) | 55296)),
              (t = 56320 | (t & 1023))),
            (r += String.fromCharCode(t)),
            r
          );
        };
    function jw(t) {
      return (t >= 55296 && t <= 57343) || t > 1114111
        ? "\uFFFD"
        : (t in xp.default && (t = xp.default[t]), zw(t));
    }
    ri.default = jw;
  });
  var Eo = U((Ge) => {
    "use strict";
    var $u =
      (Ge && Ge.__importDefault) ||
      function (t) {
        return t && t.__esModule ? t : { default: t };
      };
    Object.defineProperty(Ge, "__esModule", { value: !0 });
    Ge.decodeHTML = Ge.decodeHTMLStrict = Ge.decodeXML = void 0;
    var Do = $u(bo()),
      Jw = $u(Ep()),
      Kw = $u(wo()),
      Tp = $u(Sp()),
      Xw = /&(?:[a-zA-Z0-9]+|#[xX][\da-fA-F]+|#\d+);/g;
    Ge.decodeXML = qp(Kw.default);
    Ge.decodeHTMLStrict = qp(Do.default);
    function qp(t) {
      var r = Bp(t);
      return function (i) {
        return String(i).replace(Xw, r);
      };
    }
    var Lp = function (t, r) {
      return t < r ? 1 : -1;
    };
    Ge.decodeHTML = (function () {
      for (
        var t = Object.keys(Jw.default).sort(Lp),
          r = Object.keys(Do.default).sort(Lp),
          i = 0,
          u = 0;
        i < r.length;
        i++
      )
        t[u] === r[i] ? ((r[i] += ";?"), u++) : (r[i] += ";");
      var a = new RegExp(
          "&(?:" + r.join("|") + "|#[xX][\\da-fA-F]+;?|#\\d+;?)",
          "g",
        ),
        c = Bp(Do.default);
      function l(p) {
        return (p.substr(-1) !== ";" && (p += ";"), c(p));
      }
      return function (p) {
        return String(p).replace(a, l);
      };
    })();
    function Bp(t) {
      return function (i) {
        if (i.charAt(1) === "#") {
          var u = i.charAt(2);
          return u === "X" || u === "x"
            ? Tp.default(parseInt(i.substr(3), 16))
            : Tp.default(parseInt(i.substr(2), 10));
        }
        return t[i.slice(1, -1)] || i;
      };
    }
  });
  var xo = U((ue) => {
    "use strict";
    var Fp =
      (ue && ue.__importDefault) ||
      function (t) {
        return t && t.__esModule ? t : { default: t };
      };
    Object.defineProperty(ue, "__esModule", { value: !0 });
    ue.escapeUTF8 =
      ue.escape =
      ue.encodeNonAsciiHTML =
      ue.encodeHTML =
      ue.encodeXML =
        void 0;
    var Yw = Fp(wo()),
      Rp = Op(Yw.default),
      Ip = Mp(Rp);
    ue.encodeXML = Up(Rp);
    var Zw = Fp(bo()),
      Co = Op(Zw.default),
      Qw = Mp(Co);
    ue.encodeHTML = eD(Co, Qw);
    ue.encodeNonAsciiHTML = Up(Co);
    function Op(t) {
      return Object.keys(t)
        .sort()
        .reduce(function (r, i) {
          return ((r[t[i]] = "&" + i + ";"), r);
        }, {});
    }
    function Mp(t) {
      for (var r = [], i = [], u = 0, a = Object.keys(t); u < a.length; u++) {
        var c = a[u];
        c.length === 1 ? r.push("\\" + c) : i.push(c);
      }
      r.sort();
      for (var l = 0; l < r.length - 1; l++) {
        for (
          var p = l;
          p < r.length - 1 && r[p].charCodeAt(1) + 1 === r[p + 1].charCodeAt(1);
        )
          p += 1;
        var h = 1 + p - l;
        h < 3 || r.splice(l, h, r[l] + "-" + r[p]);
      }
      return (i.unshift("[" + r.join("") + "]"), new RegExp(i.join("|"), "g"));
    }
    var Np =
        /(?:[\x80-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/g,
      tD =
        String.prototype.codePointAt != null
          ? function (t) {
              return t.codePointAt(0);
            }
          : function (t) {
              return (
                (t.charCodeAt(0) - 55296) * 1024 +
                t.charCodeAt(1) -
                56320 +
                65536
              );
            };
    function Hu(t) {
      return (
        "&#x" +
        (t.length > 1 ? tD(t) : t.charCodeAt(0)).toString(16).toUpperCase() +
        ";"
      );
    }
    function eD(t, r) {
      return function (i) {
        return i
          .replace(r, function (u) {
            return t[u];
          })
          .replace(Np, Hu);
      };
    }
    var kp = new RegExp(Ip.source + "|" + Np.source, "g");
    function rD(t) {
      return t.replace(kp, Hu);
    }
    ue.escape = rD;
    function nD(t) {
      return t.replace(Ip, Hu);
    }
    ue.escapeUTF8 = nD;
    function Up(t) {
      return function (r) {
        return r.replace(kp, function (i) {
          return t[i] || Hu(i);
        });
      };
    }
  });
  var $p = U((it) => {
    "use strict";
    Object.defineProperty(it, "__esModule", { value: !0 });
    it.decodeXMLStrict =
      it.decodeHTML5Strict =
      it.decodeHTML4Strict =
      it.decodeHTML5 =
      it.decodeHTML4 =
      it.decodeHTMLStrict =
      it.decodeHTML =
      it.decodeXML =
      it.encodeHTML5 =
      it.encodeHTML4 =
      it.escapeUTF8 =
      it.escape =
      it.encodeNonAsciiHTML =
      it.encodeHTML =
      it.encodeXML =
      it.encode =
      it.decodeStrict =
      it.decode =
        void 0;
    var Gu = Eo(),
      Pp = xo();
    function iD(t, r) {
      return (!r || r <= 0 ? Gu.decodeXML : Gu.decodeHTML)(t);
    }
    it.decode = iD;
    function uD(t, r) {
      return (!r || r <= 0 ? Gu.decodeXML : Gu.decodeHTMLStrict)(t);
    }
    it.decodeStrict = uD;
    function sD(t, r) {
      return (!r || r <= 0 ? Pp.encodeXML : Pp.encodeHTML)(t);
    }
    it.encode = sD;
    var Or = xo();
    Object.defineProperty(it, "encodeXML", {
      enumerable: !0,
      get: function () {
        return Or.encodeXML;
      },
    });
    Object.defineProperty(it, "encodeHTML", {
      enumerable: !0,
      get: function () {
        return Or.encodeHTML;
      },
    });
    Object.defineProperty(it, "encodeNonAsciiHTML", {
      enumerable: !0,
      get: function () {
        return Or.encodeNonAsciiHTML;
      },
    });
    Object.defineProperty(it, "escape", {
      enumerable: !0,
      get: function () {
        return Or.escape;
      },
    });
    Object.defineProperty(it, "escapeUTF8", {
      enumerable: !0,
      get: function () {
        return Or.escapeUTF8;
      },
    });
    Object.defineProperty(it, "encodeHTML4", {
      enumerable: !0,
      get: function () {
        return Or.encodeHTML;
      },
    });
    Object.defineProperty(it, "encodeHTML5", {
      enumerable: !0,
      get: function () {
        return Or.encodeHTML;
      },
    });
    var vr = Eo();
    Object.defineProperty(it, "decodeXML", {
      enumerable: !0,
      get: function () {
        return vr.decodeXML;
      },
    });
    Object.defineProperty(it, "decodeHTML", {
      enumerable: !0,
      get: function () {
        return vr.decodeHTML;
      },
    });
    Object.defineProperty(it, "decodeHTMLStrict", {
      enumerable: !0,
      get: function () {
        return vr.decodeHTMLStrict;
      },
    });
    Object.defineProperty(it, "decodeHTML4", {
      enumerable: !0,
      get: function () {
        return vr.decodeHTML;
      },
    });
    Object.defineProperty(it, "decodeHTML5", {
      enumerable: !0,
      get: function () {
        return vr.decodeHTML;
      },
    });
    Object.defineProperty(it, "decodeHTML4Strict", {
      enumerable: !0,
      get: function () {
        return vr.decodeHTMLStrict;
      },
    });
    Object.defineProperty(it, "decodeHTML5Strict", {
      enumerable: !0,
      get: function () {
        return vr.decodeHTMLStrict;
      },
    });
    Object.defineProperty(it, "decodeXMLStrict", {
      enumerable: !0,
      get: function () {
        return vr.decodeXML;
      },
    });
  });
  var Hp = U((Fx, aD) => {
    aD.exports = {
      elementNames: {
        altglyph: "altGlyph",
        altglyphdef: "altGlyphDef",
        altglyphitem: "altGlyphItem",
        animatecolor: "animateColor",
        animatemotion: "animateMotion",
        animatetransform: "animateTransform",
        clippath: "clipPath",
        feblend: "feBlend",
        fecolormatrix: "feColorMatrix",
        fecomponenttransfer: "feComponentTransfer",
        fecomposite: "feComposite",
        feconvolvematrix: "feConvolveMatrix",
        fediffuselighting: "feDiffuseLighting",
        fedisplacementmap: "feDisplacementMap",
        fedistantlight: "feDistantLight",
        fedropshadow: "feDropShadow",
        feflood: "feFlood",
        fefunca: "feFuncA",
        fefuncb: "feFuncB",
        fefuncg: "feFuncG",
        fefuncr: "feFuncR",
        fegaussianblur: "feGaussianBlur",
        feimage: "feImage",
        femerge: "feMerge",
        femergenode: "feMergeNode",
        femorphology: "feMorphology",
        feoffset: "feOffset",
        fepointlight: "fePointLight",
        fespecularlighting: "feSpecularLighting",
        fespotlight: "feSpotLight",
        fetile: "feTile",
        feturbulence: "feTurbulence",
        foreignobject: "foreignObject",
        glyphref: "glyphRef",
        lineargradient: "linearGradient",
        radialgradient: "radialGradient",
        textpath: "textPath",
      },
      attributeNames: {
        definitionurl: "definitionURL",
        attributename: "attributeName",
        attributetype: "attributeType",
        basefrequency: "baseFrequency",
        baseprofile: "baseProfile",
        calcmode: "calcMode",
        clippathunits: "clipPathUnits",
        diffuseconstant: "diffuseConstant",
        edgemode: "edgeMode",
        filterunits: "filterUnits",
        glyphref: "glyphRef",
        gradienttransform: "gradientTransform",
        gradientunits: "gradientUnits",
        kernelmatrix: "kernelMatrix",
        kernelunitlength: "kernelUnitLength",
        keypoints: "keyPoints",
        keysplines: "keySplines",
        keytimes: "keyTimes",
        lengthadjust: "lengthAdjust",
        limitingconeangle: "limitingConeAngle",
        markerheight: "markerHeight",
        markerunits: "markerUnits",
        markerwidth: "markerWidth",
        maskcontentunits: "maskContentUnits",
        maskunits: "maskUnits",
        numoctaves: "numOctaves",
        pathlength: "pathLength",
        patterncontentunits: "patternContentUnits",
        patterntransform: "patternTransform",
        patternunits: "patternUnits",
        pointsatx: "pointsAtX",
        pointsaty: "pointsAtY",
        pointsatz: "pointsAtZ",
        preservealpha: "preserveAlpha",
        preserveaspectratio: "preserveAspectRatio",
        primitiveunits: "primitiveUnits",
        refx: "refX",
        refy: "refY",
        repeatcount: "repeatCount",
        repeatdur: "repeatDur",
        requiredextensions: "requiredExtensions",
        requiredfeatures: "requiredFeatures",
        specularconstant: "specularConstant",
        specularexponent: "specularExponent",
        spreadmethod: "spreadMethod",
        startoffset: "startOffset",
        stddeviation: "stdDeviation",
        stitchtiles: "stitchTiles",
        surfacescale: "surfaceScale",
        systemlanguage: "systemLanguage",
        tablevalues: "tableValues",
        targetx: "targetX",
        targety: "targetY",
        textlength: "textLength",
        viewbox: "viewBox",
        viewtarget: "viewTarget",
        xchannelselector: "xChannelSelector",
        ychannelselector: "yChannelSelector",
        zoomandpan: "zoomAndPan",
      },
    };
  });
  var zp = U((Rx, Wp) => {
    var Vu = Dp(),
      Gp = $p(),
      Wu = Hp();
    Wu.elementNames.__proto__ = null;
    Wu.attributeNames.__proto__ = null;
    var oD = {
      __proto__: null,
      style: !0,
      script: !0,
      xmp: !0,
      iframe: !0,
      noembed: !0,
      noframes: !0,
      plaintext: !0,
      noscript: !0,
    };
    function cD(t, r) {
      if (t) {
        var i = "",
          u;
        for (var a in t)
          ((u = t[a]),
            i && (i += " "),
            r.xmlMode === "foreign" && (a = Wu.attributeNames[a] || a),
            (i += a),
            ((u !== null && u !== "") || r.xmlMode) &&
              (i +=
                '="' +
                (r.decodeEntities
                  ? Gp.encodeXML(u)
                  : u.replace(/\"/g, "&quot;")) +
                '"'));
        return i;
      }
    }
    var lD = {
        __proto__: null,
        area: !0,
        base: !0,
        basefont: !0,
        br: !0,
        col: !0,
        command: !0,
        embed: !0,
        frame: !0,
        hr: !0,
        img: !0,
        input: !0,
        isindex: !0,
        keygen: !0,
        link: !0,
        meta: !0,
        param: !0,
        source: !0,
        track: !0,
        wbr: !0,
      },
      Vp = (Wp.exports = function (t, r) {
        (!Array.isArray(t) && !t.cheerio && (t = [t]), (r = r || {}));
        for (var i = "", u = 0; u < t.length; u++) {
          var a = t[u];
          a.type === "root"
            ? (i += Vp(a.children, r))
            : Vu.isTag(a)
              ? (i += hD(a, r))
              : a.type === Vu.Directive
                ? (i += pD(a))
                : a.type === Vu.Comment
                  ? (i += mD(a))
                  : a.type === Vu.CDATA
                    ? (i += gD(a))
                    : (i += dD(a, r));
        }
        return i;
      }),
      fD = [
        "mi",
        "mo",
        "mn",
        "ms",
        "mtext",
        "annotation-xml",
        "foreignObject",
        "desc",
        "title",
      ];
    function hD(t, r) {
      (r.xmlMode === "foreign" &&
        ((t.name = Wu.elementNames[t.name] || t.name),
        t.parent &&
          fD.indexOf(t.parent.name) >= 0 &&
          (r = Object.assign({}, r, { xmlMode: !1 }))),
        !r.xmlMode &&
          ["svg", "math"].indexOf(t.name) >= 0 &&
          (r = Object.assign({}, r, { xmlMode: "foreign" })));
      var i = "<" + t.name,
        u = cD(t.attribs, r);
      return (
        u && (i += " " + u),
        r.xmlMode && (!t.children || t.children.length === 0)
          ? (i += "/>")
          : ((i += ">"),
            t.children && (i += Vp(t.children, r)),
            (!lD[t.name] || r.xmlMode) && (i += "</" + t.name + ">")),
        i
      );
    }
    function pD(t) {
      return "<" + t.data + ">";
    }
    function dD(t, r) {
      var i = t.data || "";
      return (
        r.decodeEntities &&
          !(t.parent && t.parent.name in oD) &&
          (i = Gp.encodeXML(i)),
        i
      );
    }
    function gD(t) {
      return "<![CDATA[" + t.children[0].data + "]]>";
    }
    function mD(t) {
      return "<!--" + t.data + "-->";
    }
  });
  var Kp = U((Ix, Jp) => {
    var So = gn(),
      jp = zp(),
      _D = So.isTag;
    Jp.exports = { getInnerHTML: vD, getOuterHTML: jp, getText: zu };
    function vD(t, r) {
      return t.children
        ? t.children
            .map(function (i) {
              return jp(i, r);
            })
            .join("")
        : "";
    }
    function zu(t) {
      return Array.isArray(t)
        ? t.map(zu).join("")
        : _D(t)
          ? t.name === "br"
            ? `
`
            : zu(t.children)
          : t.type === So.CDATA
            ? zu(t.children)
            : t.type === So.Text
              ? t.data
              : "";
    }
  });
  var Xp = U((Mr) => {
    var yD = (Mr.getChildren = function (t) {
        return t.children;
      }),
      AD = (Mr.getParent = function (t) {
        return t.parent;
      });
    Mr.getSiblings = function (t) {
      var r = AD(t);
      return r ? yD(r) : [t];
    };
    Mr.getAttributeValue = function (t, r) {
      return t.attribs && t.attribs[r];
    };
    Mr.hasAttrib = function (t, r) {
      return !!t.attribs && hasOwnProperty.call(t.attribs, r);
    };
    Mr.getName = function (t) {
      return t.name;
    };
  });
  var Yp = U((_n) => {
    _n.removeElement = function (t) {
      if (
        (t.prev && (t.prev.next = t.next),
        t.next && (t.next.prev = t.prev),
        t.parent)
      ) {
        var r = t.parent.children;
        r.splice(r.lastIndexOf(t), 1);
      }
    };
    _n.replaceElement = function (t, r) {
      var i = (r.prev = t.prev);
      i && (i.next = r);
      var u = (r.next = t.next);
      u && (u.prev = r);
      var a = (r.parent = t.parent);
      if (a) {
        var c = a.children;
        c[c.lastIndexOf(t)] = r;
      }
    };
    _n.appendChild = function (t, r) {
      if (((r.parent = t), t.children.push(r) !== 1)) {
        var i = t.children[t.children.length - 2];
        ((i.next = r), (r.prev = i), (r.next = null));
      }
    };
    _n.append = function (t, r) {
      var i = t.parent,
        u = t.next;
      if (((r.next = u), (r.prev = t), (t.next = r), (r.parent = i), u)) {
        if (((u.prev = r), i)) {
          var a = i.children;
          a.splice(a.lastIndexOf(u), 0, r);
        }
      } else i && i.children.push(r);
    };
    _n.prepend = function (t, r) {
      var i = t.parent;
      if (i) {
        var u = i.children;
        u.splice(u.lastIndexOf(t), 0, r);
      }
      (t.prev && (t.prev.next = r),
        (r.parent = i),
        (r.prev = t.prev),
        (r.next = t),
        (t.prev = r));
    };
  });
  var ed = U((Nx, td) => {
    var To = gn().isTag;
    td.exports = {
      filter: bD,
      find: Lo,
      findOneChild: wD,
      findOne: Zp,
      existsOne: Qp,
      findAll: DD,
    };
    function bD(t, r, i, u) {
      return (
        Array.isArray(r) || (r = [r]),
        (typeof u != "number" || !isFinite(u)) && (u = 1 / 0),
        Lo(t, r, i !== !1, u)
      );
    }
    function Lo(t, r, i, u) {
      for (
        var a = [], c, l = 0, p = r.length;
        l < p &&
        !(
          (t(r[l]) && (a.push(r[l]), --u <= 0)) ||
          ((c = r[l].children),
          i &&
            c &&
            c.length > 0 &&
            ((c = Lo(t, c, i, u)), (a = a.concat(c)), (u -= c.length), u <= 0))
        );
        l++
      );
      return a;
    }
    function wD(t, r) {
      for (var i = 0, u = r.length; i < u; i++) if (t(r[i])) return r[i];
      return null;
    }
    function Zp(t, r) {
      for (var i = null, u = 0, a = r.length; u < a && !i; u++)
        if (To(r[u]))
          t(r[u])
            ? (i = r[u])
            : r[u].children.length > 0 && (i = Zp(t, r[u].children));
        else continue;
      return i;
    }
    function Qp(t, r) {
      for (var i = 0, u = r.length; i < u; i++)
        if (
          To(r[i]) &&
          (t(r[i]) || (r[i].children.length > 0 && Qp(t, r[i].children)))
        )
          return !0;
      return !1;
    }
    function DD(t, r) {
      for (var i = [], u = r.slice(); u.length;) {
        var a = u.shift();
        To(a) &&
          (a.children &&
            a.children.length > 0 &&
            u.unshift.apply(u, a.children),
          t(a) && i.push(a));
      }
      return i;
    }
  });
  var nd = U((kr) => {
    var ED = gn(),
      Nr = (kr.isTag = ED.isTag);
    kr.testElement = function (t, r) {
      for (var i in t)
        if (t.hasOwnProperty(i)) {
          if (i === "tag_name") {
            if (!Nr(r) || !t.tag_name(r.name)) return !1;
          } else if (i === "tag_type") {
            if (!t.tag_type(r.type)) return !1;
          } else if (i === "tag_contains") {
            if (Nr(r) || !t.tag_contains(r.data)) return !1;
          } else if (!r.attribs || !t[i](r.attribs[i])) return !1;
        }
      return !0;
    };
    var ju = {
      tag_name: function (t) {
        return typeof t == "function"
          ? function (r) {
              return Nr(r) && t(r.name);
            }
          : t === "*"
            ? Nr
            : function (r) {
                return Nr(r) && r.name === t;
              };
      },
      tag_type: function (t) {
        return typeof t == "function"
          ? function (r) {
              return t(r.type);
            }
          : function (r) {
              return r.type === t;
            };
      },
      tag_contains: function (t) {
        return typeof t == "function"
          ? function (r) {
              return !Nr(r) && t(r.data);
            }
          : function (r) {
              return !Nr(r) && r.data === t;
            };
      },
    };
    function rd(t, r) {
      return typeof r == "function"
        ? function (i) {
            return i.attribs && r(i.attribs[t]);
          }
        : function (i) {
            return i.attribs && i.attribs[t] === r;
          };
    }
    function CD(t, r) {
      return function (i) {
        return t(i) || r(i);
      };
    }
    kr.getElements = function (t, r, i, u) {
      var a = Object.keys(t).map(function (c) {
        var l = t[c];
        return c in ju ? ju[c](l) : rd(c, l);
      });
      return a.length === 0 ? [] : this.filter(a.reduce(CD), r, i, u);
    };
    kr.getElementById = function (t, r, i) {
      return (
        Array.isArray(r) || (r = [r]),
        this.findOne(rd("id", t), r, i !== !1)
      );
    };
    kr.getElementsByTagName = function (t, r, i, u) {
      return this.filter(ju.tag_name(t), r, i, u);
    };
    kr.getElementsByTagType = function (t, r, i, u) {
      return this.filter(ju.tag_type(t), r, i, u);
    };
  });
  var id = U((Ju) => {
    Ju.removeSubsets = function (t) {
      for (var r = t.length, i, u, a; --r > -1;) {
        for (i = u = t[r], t[r] = null, a = !0; u;) {
          if (t.indexOf(u) > -1) {
            ((a = !1), t.splice(r, 1));
            break;
          }
          u = u.parent;
        }
        a && (t[r] = i);
      }
      return t;
    };
    var ir = {
        DISCONNECTED: 1,
        PRECEDING: 2,
        FOLLOWING: 4,
        CONTAINS: 8,
        CONTAINED_BY: 16,
      },
      xD = (Ju.compareDocumentPosition = function (t, r) {
        var i = [],
          u = [],
          a,
          c,
          l,
          p,
          h,
          g;
        if (t === r) return 0;
        for (a = t; a;) (i.unshift(a), (a = a.parent));
        for (a = r; a;) (u.unshift(a), (a = a.parent));
        for (g = 0; i[g] === u[g];) g++;
        return g === 0
          ? ir.DISCONNECTED
          : ((c = i[g - 1]),
            (l = c.children),
            (p = i[g]),
            (h = u[g]),
            l.indexOf(p) > l.indexOf(h)
              ? c === r
                ? ir.FOLLOWING | ir.CONTAINED_BY
                : ir.FOLLOWING
              : c === t
                ? ir.PRECEDING | ir.CONTAINS
                : ir.PRECEDING);
      });
    Ju.uniqueSort = function (t) {
      var r = t.length,
        i,
        u;
      for (t = t.slice(); --r > -1;)
        ((i = t[r]), (u = t.indexOf(i)), u > -1 && u < r && t.splice(r, 1));
      return (
        t.sort(function (a, c) {
          var l = xD(a, c);
          return l & ir.PRECEDING ? -1 : l & ir.FOLLOWING ? 1 : 0;
        }),
        t
      );
    };
  });
  var ad = U((Px, sd) => {
    var ud = sd.exports;
    [Kp(), Xp(), Yp(), ed(), nd(), id()].forEach(function (t) {
      Object.keys(t).forEach(function (r) {
        ud[r] = t[r].bind(ud);
      });
    });
  });
  var cd = U(($x, od) => {
    od.exports = vn;
    function vn(t) {
      ((this._cbs = t || {}), (this.events = []));
    }
    var Ku = mn().EVENTS;
    Object.keys(Ku).forEach(function (t) {
      if (Ku[t] === 0)
        ((t = "on" + t),
          (vn.prototype[t] = function () {
            (this.events.push([t]), this._cbs[t] && this._cbs[t]());
          }));
      else if (Ku[t] === 1)
        ((t = "on" + t),
          (vn.prototype[t] = function (r) {
            (this.events.push([t, r]), this._cbs[t] && this._cbs[t](r));
          }));
      else if (Ku[t] === 2)
        ((t = "on" + t),
          (vn.prototype[t] = function (r, i) {
            (this.events.push([t, r, i]), this._cbs[t] && this._cbs[t](r, i));
          }));
      else throw Error("wrong number of arguments");
    });
    vn.prototype.onreset = function () {
      ((this.events = []), this._cbs.onreset && this._cbs.onreset());
    };
    vn.prototype.restart = function () {
      this._cbs.onreset && this._cbs.onreset();
      for (var t = 0, r = this.events.length; t < r; t++)
        if (this._cbs[this.events[t][0]]) {
          var i = this.events[t].length;
          i === 1
            ? this._cbs[this.events[t][0]]()
            : i === 2
              ? this._cbs[this.events[t][0]](this.events[t][1])
              : this._cbs[this.events[t][0]](
                  this.events[t][1],
                  this.events[t][2],
                );
        }
    };
  });
  var mn = U((Hx, ii) => {
    var Xu = sp(),
      Yu = mp();
    function ni(t, r) {
      return (delete ii.exports[t], (ii.exports[t] = r), r);
    }
    ii.exports = {
      Parser: Xu,
      Tokenizer: ho(),
      ElementType: gn(),
      DomHandler: Yu,
      get FeedHandler() {
        return ni("FeedHandler", Ap());
      },
      get ProxyHandler() {
        return ni("ProxyHandler", wp());
      },
      get DomUtils() {
        return ni("DomUtils", ad());
      },
      get CollectingHandler() {
        return ni("CollectingHandler", cd());
      },
      DefaultHandler: Yu,
      get RssHandler() {
        return ni("RssHandler", this.FeedHandler);
      },
      parseDOM: function (t, r) {
        var i = new Yu(r);
        return (new Xu(i, r).end(t), i.dom);
      },
      parseFeed: function (t, r) {
        var i = new ii.exports.FeedHandler(r);
        return (new Xu(i, r).end(t), i.dom);
      },
      createDomStream: function (t, r, i) {
        var u = new Yu(t, r, i);
        return new Xu(u, r);
      },
      EVENTS: {
        attribute: 2,
        cdatastart: 0,
        cdataend: 0,
        text: 1,
        processinginstruction: 2,
        comment: 1,
        commentend: 0,
        closetag: 1,
        opentag: 2,
        opentagname: 1,
        error: 1,
        end: 0,
      },
    };
  });
  var ui = U((Ur, ld) => {
    var SD = mn();
    Ur = ld.exports = function (t, r) {
      var i = Ur.evaluate(t, r),
        u = Ur.evaluate("<root></root>", r)[0];
      return ((u.type = "root"), Ur.update(i, u), u);
    };
    Ur.evaluate = function (t, r) {
      var i;
      return (typeof t == "string" ? (i = SD.parseDOM(t, r)) : (i = t), i);
    };
    Ur.update = function (t, r) {
      (Array.isArray(t) || (t = [t]), r ? (r.children = t) : (r = null));
      for (var i = 0; i < t.length; i++) {
        var u = t[i],
          a = u.parent || u.root,
          c = a && a.children;
        (c &&
          c !== t &&
          (c.splice(c.indexOf(u), 1),
          u.prev && (u.prev.next = u.next),
          u.next && (u.next.prev = u.prev)),
          r
            ? ((u.prev = t[i - 1] || null), (u.next = t[i + 1] || null))
            : (u.prev = u.next = null),
          r && r.type === "root"
            ? ((u.root = r), (u.parent = null))
            : ((u.root = null), (u.parent = r)));
      }
      return r;
    };
  });
  var si = U((Gx, fd) => {
    fd.exports = {
      Text: "text",
      Directive: "directive",
      Comment: "comment",
      Script: "script",
      Style: "style",
      Tag: "tag",
      CDATA: "cdata",
      Doctype: "doctype",
      isTag: function (t) {
        return t.type === "tag" || t.type === "script" || t.type === "style";
      },
    };
  });
  var vd = U((Zu) => {
    var Bo = pd(Ru()),
      TD = Fo(Bo);
    Zu.XML = _d(Bo, TD);
    var hd = pd(Fu()),
      LD = Fo(hd);
    Zu.HTML = _d(hd, LD);
    function pd(t) {
      return Object.keys(t)
        .sort()
        .reduce(function (r, i) {
          return ((r[t[i]] = "&" + i + ";"), r);
        }, {});
    }
    function Fo(t) {
      var r = [],
        i = [];
      return (
        Object.keys(t).forEach(function (u) {
          u.length === 1 ? r.push("\\" + u) : i.push(u);
        }),
        i.unshift("[" + r.join("") + "]"),
        new RegExp(i.join("|"), "g")
      );
    }
    var dd = /[^\0-\x7F]/g,
      gd = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
    function qo(t) {
      return "&#x" + t.charCodeAt(0).toString(16).toUpperCase() + ";";
    }
    function md(t) {
      var r = t.charCodeAt(0),
        i = t.charCodeAt(1),
        u = (r - 55296) * 1024 + i - 56320 + 65536;
      return "&#x" + u.toString(16).toUpperCase() + ";";
    }
    function _d(t, r) {
      function i(u) {
        return t[u];
      }
      return function (u) {
        return u.replace(r, i).replace(gd, md).replace(dd, qo);
      };
    }
    var qD = Fo(Bo);
    function BD(t) {
      return t.replace(qD, qo).replace(gd, md).replace(dd, qo);
    }
    Zu.escape = BD;
  });
  var Ed = U((Wx, Dd) => {
    var Ro = Fu(),
      FD = Za(),
      RD = Ru(),
      yd = Ya(),
      ID = bd(RD),
      OD = bd(Ro);
    function bd(t) {
      var r = Object.keys(t).join("|"),
        i = wd(t);
      r += "|#[xX][\\da-fA-F]+|#\\d+";
      var u = new RegExp("&(?:" + r + ");", "g");
      return function (a) {
        return String(a).replace(u, i);
      };
    }
    var MD = (function () {
      for (
        var t = Object.keys(FD).sort(Ad),
          r = Object.keys(Ro).sort(Ad),
          i = 0,
          u = 0;
        i < r.length;
        i++
      )
        t[u] === r[i] ? ((r[i] += ";?"), u++) : (r[i] += ";");
      var a = new RegExp(
          "&(?:" + r.join("|") + "|#[xX][\\da-fA-F]+;?|#\\d+;?)",
          "g",
        ),
        c = wd(Ro);
      function l(p) {
        return (p.substr(-1) !== ";" && (p += ";"), c(p));
      }
      return function (p) {
        return String(p).replace(a, l);
      };
    })();
    function Ad(t, r) {
      return t < r ? 1 : -1;
    }
    function wd(t) {
      return function (i) {
        return i.charAt(1) === "#"
          ? i.charAt(2) === "X" || i.charAt(2) === "x"
            ? yd(parseInt(i.substr(3), 16))
            : yd(parseInt(i.substr(2), 10))
          : t[i.slice(1, -1)];
      };
    }
    Dd.exports = { XML: ID, HTML: MD, HTMLStrict: OD };
  });
  var Cd = U(($t) => {
    var ai = vd(),
      Pr = Ed();
    $t.decode = function (t, r) {
      return (!r || r <= 0 ? Pr.XML : Pr.HTML)(t);
    };
    $t.decodeStrict = function (t, r) {
      return (!r || r <= 0 ? Pr.XML : Pr.HTMLStrict)(t);
    };
    $t.encode = function (t, r) {
      return (!r || r <= 0 ? ai.XML : ai.HTML)(t);
    };
    $t.encodeXML = ai.XML;
    $t.encodeHTML4 = $t.encodeHTML5 = $t.encodeHTML = ai.HTML;
    $t.decodeXML = $t.decodeXMLStrict = Pr.XML;
    $t.decodeHTML4 = $t.decodeHTML5 = $t.decodeHTML = Pr.HTML;
    $t.decodeHTML4Strict =
      $t.decodeHTML5Strict =
      $t.decodeHTMLStrict =
        Pr.HTMLStrict;
    $t.escape = ai.escape;
  });
  var ts = U((jx, Td) => {
    var Qu = si(),
      xd = Cd(),
      ND = {
        __proto__: null,
        style: !0,
        script: !0,
        xmp: !0,
        iframe: !0,
        noembed: !0,
        noframes: !0,
        plaintext: !0,
        noscript: !0,
      };
    function kD(t, r) {
      if (t) {
        var i = "",
          u;
        for (var a in t)
          ((u = t[a]),
            i && (i += " "),
            (i += a),
            ((u !== null && u !== "") || r.xmlMode) &&
              (i += '="' + (r.decodeEntities ? xd.encodeXML(u) : u) + '"'));
        return i;
      }
    }
    var UD = {
        __proto__: null,
        area: !0,
        base: !0,
        basefont: !0,
        br: !0,
        col: !0,
        command: !0,
        embed: !0,
        frame: !0,
        hr: !0,
        img: !0,
        input: !0,
        isindex: !0,
        keygen: !0,
        link: !0,
        meta: !0,
        param: !0,
        source: !0,
        track: !0,
        wbr: !0,
      },
      Sd = (Td.exports = function (t, r) {
        (!Array.isArray(t) && !t.cheerio && (t = [t]), (r = r || {}));
        for (var i = "", u = 0; u < t.length; u++) {
          var a = t[u];
          a.type === "root"
            ? (i += Sd(a.children, r))
            : Qu.isTag(a)
              ? (i += PD(a, r))
              : a.type === Qu.Directive
                ? (i += $D(a))
                : a.type === Qu.Comment
                  ? (i += VD(a))
                  : a.type === Qu.CDATA
                    ? (i += GD(a))
                    : (i += HD(a, r));
        }
        return i;
      });
    function PD(t, r) {
      t.name === "svg" &&
        (r = { decodeEntities: r.decodeEntities, xmlMode: !0 });
      var i = "<" + t.name,
        u = kD(t.attribs, r);
      return (
        u && (i += " " + u),
        r.xmlMode && (!t.children || t.children.length === 0)
          ? (i += "/>")
          : ((i += ">"),
            t.children && (i += Sd(t.children, r)),
            (!UD[t.name] || r.xmlMode) && (i += "</" + t.name + ">")),
        i
      );
    }
    function $D(t) {
      return "<" + t.data + ">";
    }
    function HD(t, r) {
      var i = t.data || "";
      return (
        r.decodeEntities &&
          !(t.parent && t.parent.name in ND) &&
          (i = xd.encodeXML(i)),
        i
      );
    }
    function GD(t) {
      return "<![CDATA[" + t.children[0].data + "]]>";
    }
    function VD(t) {
      return "<!--" + t.data + "-->";
    }
  });
  var yn = U(($r) => {
    var WD = ui(),
      zD = ts(),
      jD = { tag: !0, script: !0, style: !0 };
    $r.isTag = function (t) {
      return (t.type && (t = t.type), jD[t] || !1);
    };
    $r.camelCase = function (t) {
      return t.replace(/[_.-](\w|$)/g, function (r, i) {
        return i.toUpperCase();
      });
    };
    $r.cssCase = function (t) {
      return t.replace(/[A-Z]/g, "-$&").toLowerCase();
    };
    $r.domEach = function (t, r) {
      for (var i = 0, u = t.length; i < u && r.call(t, i, t[i]) !== !1;) ++i;
      return t;
    };
    $r.cloneDom = function (t, r) {
      return WD(zD(t, r), r).children;
    };
    var JD = /^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/;
    $r.isHtml = function (t) {
      if (
        t.charAt(0) === "<" &&
        t.charAt(t.length - 1) === ">" &&
        t.length >= 3
      )
        return !0;
      var r = JD.exec(t);
      return !!(r && r[1]);
    };
  });
  var yr = U((An, oi) => {
    (function () {
      var t,
        r = "4.18.1",
        i = 200,
        u = "Unsupported core-js use. Try https://npms.io/search?q=ponyfill.",
        a = "Expected a function",
        c = "Invalid `variable` option passed into `_.template`",
        l = "Invalid `imports` option passed into `_.template`",
        p = "__lodash_hash_undefined__",
        h = 500,
        g = "__lodash_placeholder__",
        _ = 1,
        v = 2,
        b = 4,
        w = 1,
        x = 2,
        C = 1,
        R = 2,
        T = 4,
        I = 8,
        G = 16,
        M = 32,
        P = 64,
        H = 128,
        O = 256,
        ut = 512,
        lt = 30,
        At = "...",
        Ft = 800,
        gt = 16,
        ht = 1,
        _t = 2,
        Dt = 3,
        ot = 1 / 0,
        Lt = 9007199254740991,
        Rt = 17976931348623157e292,
        ke = NaN,
        Ue = 4294967295,
        L2 = Ue - 1,
        q2 = Ue >>> 1,
        B2 = [
          ["ary", H],
          ["bind", C],
          ["bindKey", R],
          ["curry", I],
          ["curryRight", G],
          ["flip", ut],
          ["partial", M],
          ["partialRight", P],
          ["rearg", O],
        ],
        Kr = "[object Arguments]",
        Fi = "[object Array]",
        F2 = "[object AsyncFunction]",
        Ln = "[object Boolean]",
        qn = "[object Date]",
        R2 = "[object DOMException]",
        Ri = "[object Error]",
        Ii = "[object Function]",
        pc = "[object GeneratorFunction]",
        Se = "[object Map]",
        Bn = "[object Number]",
        I2 = "[object Null]",
        Je = "[object Object]",
        dc = "[object Promise]",
        O2 = "[object Proxy]",
        Fn = "[object RegExp]",
        Te = "[object Set]",
        Rn = "[object String]",
        Oi = "[object Symbol]",
        M2 = "[object Undefined]",
        In = "[object WeakMap]",
        N2 = "[object WeakSet]",
        On = "[object ArrayBuffer]",
        Xr = "[object DataView]",
        As = "[object Float32Array]",
        bs = "[object Float64Array]",
        ws = "[object Int8Array]",
        Ds = "[object Int16Array]",
        Es = "[object Int32Array]",
        Cs = "[object Uint8Array]",
        xs = "[object Uint8ClampedArray]",
        Ss = "[object Uint16Array]",
        Ts = "[object Uint32Array]",
        k2 = /\b__p \+= '';/g,
        U2 = /\b(__p \+=) '' \+/g,
        P2 = /(__e\(.*?\)|\b__t\)) \+\n'';/g,
        gc = /&(?:amp|lt|gt|quot|#39);/g,
        mc = /[&<>"']/g,
        $2 = RegExp(gc.source),
        H2 = RegExp(mc.source),
        G2 = /<%-([\s\S]+?)%>/g,
        V2 = /<%([\s\S]+?)%>/g,
        _c = /<%=([\s\S]+?)%>/g,
        W2 = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
        z2 = /^\w*$/,
        j2 =
          /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,
        Ls = /[\\^$.*+?()[\]{}|]/g,
        J2 = RegExp(Ls.source),
        qs = /^\s+/,
        K2 = /\s/,
        X2 = /\{(?:\n\/\* \[wrapped with .+\] \*\/)?\n?/,
        Y2 = /\{\n\/\* \[wrapped with (.+)\] \*/,
        Z2 = /,? & /,
        Q2 = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,
        vc = /[()=,{}\[\]\/\s]/,
        t0 = /\\(\\)?/g,
        e0 = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,
        yc = /\w*$/,
        r0 = /^[-+]0x[0-9a-f]+$/i,
        n0 = /^0b[01]+$/i,
        i0 = /^\[object .+?Constructor\]$/,
        u0 = /^0o[0-7]+$/i,
        s0 = /^(?:0|[1-9]\d*)$/,
        a0 = /[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g,
        Mi = /($^)/,
        o0 = /['\n\r\u2028\u2029\\]/g,
        Ni = "\\ud800-\\udfff",
        c0 = "\\u0300-\\u036f",
        l0 = "\\ufe20-\\ufe2f",
        f0 = "\\u20d0-\\u20ff",
        Ac = c0 + l0 + f0,
        bc = "\\u2700-\\u27bf",
        wc = "a-z\\xdf-\\xf6\\xf8-\\xff",
        h0 = "\\xac\\xb1\\xd7\\xf7",
        p0 = "\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",
        d0 = "\\u2000-\\u206f",
        g0 =
          " \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",
        Dc = "A-Z\\xc0-\\xd6\\xd8-\\xde",
        Ec = "\\ufe0e\\ufe0f",
        Cc = h0 + p0 + d0 + g0,
        Bs = "['\u2019]",
        m0 = "[" + Ni + "]",
        xc = "[" + Cc + "]",
        ki = "[" + Ac + "]",
        Sc = "\\d+",
        _0 = "[" + bc + "]",
        Tc = "[" + wc + "]",
        Lc = "[^" + Ni + Cc + Sc + bc + wc + Dc + "]",
        Fs = "\\ud83c[\\udffb-\\udfff]",
        v0 = "(?:" + ki + "|" + Fs + ")",
        qc = "[^" + Ni + "]",
        Rs = "(?:\\ud83c[\\udde6-\\uddff]){2}",
        Is = "[\\ud800-\\udbff][\\udc00-\\udfff]",
        Yr = "[" + Dc + "]",
        Bc = "\\u200d",
        Fc = "(?:" + Tc + "|" + Lc + ")",
        y0 = "(?:" + Yr + "|" + Lc + ")",
        Rc = "(?:" + Bs + "(?:d|ll|m|re|s|t|ve))?",
        Ic = "(?:" + Bs + "(?:D|LL|M|RE|S|T|VE))?",
        Oc = v0 + "?",
        Mc = "[" + Ec + "]?",
        A0 = "(?:" + Bc + "(?:" + [qc, Rs, Is].join("|") + ")" + Mc + Oc + ")*",
        b0 = "\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])",
        w0 = "\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])",
        Nc = Mc + Oc + A0,
        D0 = "(?:" + [_0, Rs, Is].join("|") + ")" + Nc,
        E0 = "(?:" + [qc + ki + "?", ki, Rs, Is, m0].join("|") + ")",
        C0 = RegExp(Bs, "g"),
        x0 = RegExp(ki, "g"),
        Os = RegExp(Fs + "(?=" + Fs + ")|" + E0 + Nc, "g"),
        S0 = RegExp(
          [
            Yr + "?" + Tc + "+" + Rc + "(?=" + [xc, Yr, "$"].join("|") + ")",
            y0 + "+" + Ic + "(?=" + [xc, Yr + Fc, "$"].join("|") + ")",
            Yr + "?" + Fc + "+" + Rc,
            Yr + "+" + Ic,
            w0,
            b0,
            Sc,
            D0,
          ].join("|"),
          "g",
        ),
        T0 = RegExp("[" + Bc + Ni + Ac + Ec + "]"),
        L0 =
          /[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,
        q0 = [
          "Array",
          "Buffer",
          "DataView",
          "Date",
          "Error",
          "Float32Array",
          "Float64Array",
          "Function",
          "Int8Array",
          "Int16Array",
          "Int32Array",
          "Map",
          "Math",
          "Object",
          "Promise",
          "RegExp",
          "Set",
          "String",
          "Symbol",
          "TypeError",
          "Uint8Array",
          "Uint8ClampedArray",
          "Uint16Array",
          "Uint32Array",
          "WeakMap",
          "_",
          "clearTimeout",
          "isFinite",
          "parseInt",
          "setTimeout",
        ],
        B0 = -1,
        Et = {};
      ((Et[As] =
        Et[bs] =
        Et[ws] =
        Et[Ds] =
        Et[Es] =
        Et[Cs] =
        Et[xs] =
        Et[Ss] =
        Et[Ts] =
          !0),
        (Et[Kr] =
          Et[Fi] =
          Et[On] =
          Et[Ln] =
          Et[Xr] =
          Et[qn] =
          Et[Ri] =
          Et[Ii] =
          Et[Se] =
          Et[Bn] =
          Et[Je] =
          Et[Fn] =
          Et[Te] =
          Et[Rn] =
          Et[In] =
            !1));
      var bt = {};
      ((bt[Kr] =
        bt[Fi] =
        bt[On] =
        bt[Xr] =
        bt[Ln] =
        bt[qn] =
        bt[As] =
        bt[bs] =
        bt[ws] =
        bt[Ds] =
        bt[Es] =
        bt[Se] =
        bt[Bn] =
        bt[Je] =
        bt[Fn] =
        bt[Te] =
        bt[Rn] =
        bt[Oi] =
        bt[Cs] =
        bt[xs] =
        bt[Ss] =
        bt[Ts] =
          !0),
        (bt[Ri] = bt[Ii] = bt[In] = !1));
      var F0 = {
          À: "A",
          Á: "A",
          Â: "A",
          Ã: "A",
          Ä: "A",
          Å: "A",
          à: "a",
          á: "a",
          â: "a",
          ã: "a",
          ä: "a",
          å: "a",
          Ç: "C",
          ç: "c",
          Ð: "D",
          ð: "d",
          È: "E",
          É: "E",
          Ê: "E",
          Ë: "E",
          è: "e",
          é: "e",
          ê: "e",
          ë: "e",
          Ì: "I",
          Í: "I",
          Î: "I",
          Ï: "I",
          ì: "i",
          í: "i",
          î: "i",
          ï: "i",
          Ñ: "N",
          ñ: "n",
          Ò: "O",
          Ó: "O",
          Ô: "O",
          Õ: "O",
          Ö: "O",
          Ø: "O",
          ò: "o",
          ó: "o",
          ô: "o",
          õ: "o",
          ö: "o",
          ø: "o",
          Ù: "U",
          Ú: "U",
          Û: "U",
          Ü: "U",
          ù: "u",
          ú: "u",
          û: "u",
          ü: "u",
          Ý: "Y",
          ý: "y",
          ÿ: "y",
          Æ: "Ae",
          æ: "ae",
          Þ: "Th",
          þ: "th",
          ß: "ss",
          Ā: "A",
          Ă: "A",
          Ą: "A",
          ā: "a",
          ă: "a",
          ą: "a",
          Ć: "C",
          Ĉ: "C",
          Ċ: "C",
          Č: "C",
          ć: "c",
          ĉ: "c",
          ċ: "c",
          č: "c",
          Ď: "D",
          Đ: "D",
          ď: "d",
          đ: "d",
          Ē: "E",
          Ĕ: "E",
          Ė: "E",
          Ę: "E",
          Ě: "E",
          ē: "e",
          ĕ: "e",
          ė: "e",
          ę: "e",
          ě: "e",
          Ĝ: "G",
          Ğ: "G",
          Ġ: "G",
          Ģ: "G",
          ĝ: "g",
          ğ: "g",
          ġ: "g",
          ģ: "g",
          Ĥ: "H",
          Ħ: "H",
          ĥ: "h",
          ħ: "h",
          Ĩ: "I",
          Ī: "I",
          Ĭ: "I",
          Į: "I",
          İ: "I",
          ĩ: "i",
          ī: "i",
          ĭ: "i",
          į: "i",
          ı: "i",
          Ĵ: "J",
          ĵ: "j",
          Ķ: "K",
          ķ: "k",
          ĸ: "k",
          Ĺ: "L",
          Ļ: "L",
          Ľ: "L",
          Ŀ: "L",
          Ł: "L",
          ĺ: "l",
          ļ: "l",
          ľ: "l",
          ŀ: "l",
          ł: "l",
          Ń: "N",
          Ņ: "N",
          Ň: "N",
          Ŋ: "N",
          ń: "n",
          ņ: "n",
          ň: "n",
          ŋ: "n",
          Ō: "O",
          Ŏ: "O",
          Ő: "O",
          ō: "o",
          ŏ: "o",
          ő: "o",
          Ŕ: "R",
          Ŗ: "R",
          Ř: "R",
          ŕ: "r",
          ŗ: "r",
          ř: "r",
          Ś: "S",
          Ŝ: "S",
          Ş: "S",
          Š: "S",
          ś: "s",
          ŝ: "s",
          ş: "s",
          š: "s",
          Ţ: "T",
          Ť: "T",
          Ŧ: "T",
          ţ: "t",
          ť: "t",
          ŧ: "t",
          Ũ: "U",
          Ū: "U",
          Ŭ: "U",
          Ů: "U",
          Ű: "U",
          Ų: "U",
          ũ: "u",
          ū: "u",
          ŭ: "u",
          ů: "u",
          ű: "u",
          ų: "u",
          Ŵ: "W",
          ŵ: "w",
          Ŷ: "Y",
          ŷ: "y",
          Ÿ: "Y",
          Ź: "Z",
          Ż: "Z",
          Ž: "Z",
          ź: "z",
          ż: "z",
          ž: "z",
          Ĳ: "IJ",
          ĳ: "ij",
          Œ: "Oe",
          œ: "oe",
          ŉ: "'n",
          ſ: "s",
        },
        R0 = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        },
        I0 = {
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#39;": "'",
        },
        O0 = {
          "\\": "\\",
          "'": "'",
          "\n": "n",
          "\r": "r",
          "\u2028": "u2028",
          "\u2029": "u2029",
        },
        M0 = parseFloat,
        N0 = parseInt,
        kc =
          typeof global == "object" &&
          global &&
          global.Object === Object &&
          global,
        k0 = typeof self == "object" && self && self.Object === Object && self,
        Nt = kc || k0 || Function("return this")(),
        Ms = typeof An == "object" && An && !An.nodeType && An,
        Dr = Ms && typeof oi == "object" && oi && !oi.nodeType && oi,
        Uc = Dr && Dr.exports === Ms,
        Ns = Uc && kc.process,
        _e = (function () {
          try {
            var D = Dr && Dr.require && Dr.require("util").types;
            return D || (Ns && Ns.binding && Ns.binding("util"));
          } catch (L) {}
        })(),
        Pc = _e && _e.isArrayBuffer,
        $c = _e && _e.isDate,
        Hc = _e && _e.isMap,
        Gc = _e && _e.isRegExp,
        Vc = _e && _e.isSet,
        Wc = _e && _e.isTypedArray;
      function ce(D, L, S) {
        switch (S.length) {
          case 0:
            return D.call(L);
          case 1:
            return D.call(L, S[0]);
          case 2:
            return D.call(L, S[0], S[1]);
          case 3:
            return D.call(L, S[0], S[1], S[2]);
        }
        return D.apply(L, S);
      }
      function U0(D, L, S, $) {
        for (var X = -1, ft = D == null ? 0 : D.length; ++X < ft;) {
          var It = D[X];
          L($, It, S(It), D);
        }
        return $;
      }
      function le(D, L) {
        for (
          var S = -1, $ = D == null ? 0 : D.length;
          ++S < $ && L(D[S], S, D) !== !1;
        );
        return D;
      }
      function P0(D, L) {
        for (var S = D == null ? 0 : D.length; S-- && L(D[S], S, D) !== !1;);
        return D;
      }
      function zc(D, L) {
        for (var S = -1, $ = D == null ? 0 : D.length; ++S < $;)
          if (!L(D[S], S, D)) return !1;
        return !0;
      }
      function ar(D, L) {
        for (
          var S = -1, $ = D == null ? 0 : D.length, X = 0, ft = [];
          ++S < $;
        ) {
          var It = D[S];
          L(It, S, D) && (ft[X++] = It);
        }
        return ft;
      }
      function Ui(D, L) {
        var S = D == null ? 0 : D.length;
        return !!S && Zr(D, L, 0) > -1;
      }
      function ks(D, L, S) {
        for (var $ = -1, X = D == null ? 0 : D.length; ++$ < X;)
          if (S(L, D[$])) return !0;
        return !1;
      }
      function xt(D, L) {
        for (var S = -1, $ = D == null ? 0 : D.length, X = Array($); ++S < $;)
          X[S] = L(D[S], S, D);
        return X;
      }
      function or(D, L) {
        for (var S = -1, $ = L.length, X = D.length; ++S < $;) D[X + S] = L[S];
        return D;
      }
      function Us(D, L, S, $) {
        var X = -1,
          ft = D == null ? 0 : D.length;
        for ($ && ft && (S = D[++X]); ++X < ft;) S = L(S, D[X], X, D);
        return S;
      }
      function $0(D, L, S, $) {
        var X = D == null ? 0 : D.length;
        for ($ && X && (S = D[--X]); X--;) S = L(S, D[X], X, D);
        return S;
      }
      function Ps(D, L) {
        for (var S = -1, $ = D == null ? 0 : D.length; ++S < $;)
          if (L(D[S], S, D)) return !0;
        return !1;
      }
      var H0 = $s("length");
      function G0(D) {
        return D.split("");
      }
      function V0(D) {
        return D.match(Q2) || [];
      }
      function jc(D, L, S) {
        var $;
        return (
          S(D, function (X, ft, It) {
            if (L(X, ft, It)) return (($ = ft), !1);
          }),
          $
        );
      }
      function Pi(D, L, S, $) {
        for (var X = D.length, ft = S + ($ ? 1 : -1); $ ? ft-- : ++ft < X;)
          if (L(D[ft], ft, D)) return ft;
        return -1;
      }
      function Zr(D, L, S) {
        return L === L ? rm(D, L, S) : Pi(D, Jc, S);
      }
      function W0(D, L, S, $) {
        for (var X = S - 1, ft = D.length; ++X < ft;) if ($(D[X], L)) return X;
        return -1;
      }
      function Jc(D) {
        return D !== D;
      }
      function Kc(D, L) {
        var S = D == null ? 0 : D.length;
        return S ? Gs(D, L) / S : ke;
      }
      function $s(D) {
        return function (L) {
          return L == null ? t : L[D];
        };
      }
      function Hs(D) {
        return function (L) {
          return D == null ? t : D[L];
        };
      }
      function Xc(D, L, S, $, X) {
        return (
          X(D, function (ft, It, vt) {
            S = $ ? (($ = !1), ft) : L(S, ft, It, vt);
          }),
          S
        );
      }
      function z0(D, L) {
        var S = D.length;
        for (D.sort(L); S--;) D[S] = D[S].value;
        return D;
      }
      function Gs(D, L) {
        for (var S, $ = -1, X = D.length; ++$ < X;) {
          var ft = L(D[$]);
          ft !== t && (S = S === t ? ft : S + ft);
        }
        return S;
      }
      function Vs(D, L) {
        for (var S = -1, $ = Array(D); ++S < D;) $[S] = L(S);
        return $;
      }
      function j0(D, L) {
        return xt(L, function (S) {
          return [S, D[S]];
        });
      }
      function Yc(D) {
        return D && D.slice(0, el(D) + 1).replace(qs, "");
      }
      function fe(D) {
        return function (L) {
          return D(L);
        };
      }
      function Ws(D, L) {
        return xt(L, function (S) {
          return D[S];
        });
      }
      function Mn(D, L) {
        return D.has(L);
      }
      function Zc(D, L) {
        for (var S = -1, $ = D.length; ++S < $ && Zr(L, D[S], 0) > -1;);
        return S;
      }
      function Qc(D, L) {
        for (var S = D.length; S-- && Zr(L, D[S], 0) > -1;);
        return S;
      }
      function J0(D, L) {
        for (var S = D.length, $ = 0; S--;) D[S] === L && ++$;
        return $;
      }
      var K0 = Hs(F0),
        X0 = Hs(R0);
      function Y0(D) {
        return "\\" + O0[D];
      }
      function Z0(D, L) {
        return D == null ? t : D[L];
      }
      function Qr(D) {
        return T0.test(D);
      }
      function Q0(D) {
        return L0.test(D);
      }
      function tm(D) {
        for (var L, S = []; !(L = D.next()).done;) S.push(L.value);
        return S;
      }
      function zs(D) {
        var L = -1,
          S = Array(D.size);
        return (
          D.forEach(function ($, X) {
            S[++L] = [X, $];
          }),
          S
        );
      }
      function tl(D, L) {
        return function (S) {
          return D(L(S));
        };
      }
      function cr(D, L) {
        for (var S = -1, $ = D.length, X = 0, ft = []; ++S < $;) {
          var It = D[S];
          (It === L || It === g) && ((D[S] = g), (ft[X++] = S));
        }
        return ft;
      }
      function $i(D) {
        var L = -1,
          S = Array(D.size);
        return (
          D.forEach(function ($) {
            S[++L] = $;
          }),
          S
        );
      }
      function em(D) {
        var L = -1,
          S = Array(D.size);
        return (
          D.forEach(function ($) {
            S[++L] = [$, $];
          }),
          S
        );
      }
      function rm(D, L, S) {
        for (var $ = S - 1, X = D.length; ++$ < X;) if (D[$] === L) return $;
        return -1;
      }
      function nm(D, L, S) {
        for (var $ = S + 1; $--;) if (D[$] === L) return $;
        return $;
      }
      function tn(D) {
        return Qr(D) ? um(D) : H0(D);
      }
      function Le(D) {
        return Qr(D) ? sm(D) : G0(D);
      }
      function el(D) {
        for (var L = D.length; L-- && K2.test(D.charAt(L)););
        return L;
      }
      var im = Hs(I0);
      function um(D) {
        for (var L = (Os.lastIndex = 0); Os.test(D);) ++L;
        return L;
      }
      function sm(D) {
        return D.match(Os) || [];
      }
      function am(D) {
        return D.match(S0) || [];
      }
      var om = function D(L) {
          L = L == null ? Nt : lr.defaults(Nt.Object(), L, lr.pick(Nt, q0));
          var S = L.Array,
            $ = L.Date,
            X = L.Error,
            ft = L.Function,
            It = L.Math,
            vt = L.Object,
            js = L.RegExp,
            cm = L.String,
            ve = L.TypeError,
            Hi = S.prototype,
            lm = ft.prototype,
            en = vt.prototype,
            Gi = L["__core-js_shared__"],
            Vi = lm.toString,
            pt = en.hasOwnProperty,
            fm = 0,
            rl = (function () {
              var e = /[^.]+$/.exec((Gi && Gi.keys && Gi.keys.IE_PROTO) || "");
              return e ? "Symbol(src)_1." + e : "";
            })(),
            Wi = en.toString,
            hm = Vi.call(vt),
            pm = Nt._,
            dm = js(
              "^" +
                Vi.call(pt)
                  .replace(Ls, "\\$&")
                  .replace(
                    /hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,
                    "$1.*?",
                  ) +
                "$",
            ),
            zi = Uc ? L.Buffer : t,
            fr = L.Symbol,
            ji = L.Uint8Array,
            nl = zi ? zi.allocUnsafe : t,
            Ji = tl(vt.getPrototypeOf, vt),
            il = vt.create,
            ul = en.propertyIsEnumerable,
            Ki = Hi.splice,
            sl = fr ? fr.isConcatSpreadable : t,
            Nn = fr ? fr.iterator : t,
            Er = fr ? fr.toStringTag : t,
            Xi = (function () {
              try {
                var e = Lr(vt, "defineProperty");
                return (e({}, "", {}), e);
              } catch (n) {}
            })(),
            gm = L.clearTimeout !== Nt.clearTimeout && L.clearTimeout,
            mm = $ && $.now !== Nt.Date.now && $.now,
            _m = L.setTimeout !== Nt.setTimeout && L.setTimeout,
            Yi = It.ceil,
            Zi = It.floor,
            Js = vt.getOwnPropertySymbols,
            vm = zi ? zi.isBuffer : t,
            al = L.isFinite,
            ym = Hi.join,
            Am = tl(vt.keys, vt),
            Ot = It.max,
            Ht = It.min,
            bm = $.now,
            wm = L.parseInt,
            ol = It.random,
            Dm = Hi.reverse,
            Ks = Lr(L, "DataView"),
            kn = Lr(L, "Map"),
            Xs = Lr(L, "Promise"),
            rn = Lr(L, "Set"),
            Un = Lr(L, "WeakMap"),
            Pn = Lr(vt, "create"),
            Qi = Un && new Un(),
            nn = {},
            Em = qr(Ks),
            Cm = qr(kn),
            xm = qr(Xs),
            Sm = qr(rn),
            Tm = qr(Un),
            tu = fr ? fr.prototype : t,
            $n = tu ? tu.valueOf : t,
            cl = tu ? tu.toString : t;
          function d(e) {
            if (Tt(e) && !Y(e) && !(e instanceof at)) {
              if (e instanceof ye) return e;
              if (pt.call(e, "__wrapped__")) return ff(e);
            }
            return new ye(e);
          }
          var un = (function () {
            function e() {}
            return function (n) {
              if (!St(n)) return {};
              if (il) return il(n);
              e.prototype = n;
              var s = new e();
              return ((e.prototype = t), s);
            };
          })();
          function eu() {}
          function ye(e, n) {
            ((this.__wrapped__ = e),
              (this.__actions__ = []),
              (this.__chain__ = !!n),
              (this.__index__ = 0),
              (this.__values__ = t));
          }
          ((d.templateSettings = {
            escape: G2,
            evaluate: V2,
            interpolate: _c,
            variable: "",
            imports: { _: d },
          }),
            (d.prototype = eu.prototype),
            (d.prototype.constructor = d),
            (ye.prototype = un(eu.prototype)),
            (ye.prototype.constructor = ye));
          function at(e) {
            ((this.__wrapped__ = e),
              (this.__actions__ = []),
              (this.__dir__ = 1),
              (this.__filtered__ = !1),
              (this.__iteratees__ = []),
              (this.__takeCount__ = Ue),
              (this.__views__ = []));
          }
          function Lm() {
            var e = new at(this.__wrapped__);
            return (
              (e.__actions__ = Yt(this.__actions__)),
              (e.__dir__ = this.__dir__),
              (e.__filtered__ = this.__filtered__),
              (e.__iteratees__ = Yt(this.__iteratees__)),
              (e.__takeCount__ = this.__takeCount__),
              (e.__views__ = Yt(this.__views__)),
              e
            );
          }
          function qm() {
            if (this.__filtered__) {
              var e = new at(this);
              ((e.__dir__ = -1), (e.__filtered__ = !0));
            } else ((e = this.clone()), (e.__dir__ *= -1));
            return e;
          }
          function Bm() {
            var e = this.__wrapped__.value(),
              n = this.__dir__,
              s = Y(e),
              o = n < 0,
              f = s ? e.length : 0,
              m = G_(0, f, this.__views__),
              y = m.start,
              A = m.end,
              E = A - y,
              q = o ? A : y - 1,
              B = this.__iteratees__,
              F = B.length,
              N = 0,
              W = Ht(E, this.__takeCount__);
            if (!s || (!o && f == E && W == E)) return Rl(e, this.__actions__);
            var K = [];
            t: for (; E-- && N < W;) {
              q += n;
              for (var Q = -1, j = e[q]; ++Q < F;) {
                var st = B[Q],
                  ct = st.iteratee,
                  de = st.type,
                  Jt = ct(j);
                if (de == _t) j = Jt;
                else if (!Jt) {
                  if (de == ht) continue t;
                  break t;
                }
              }
              K[N++] = j;
            }
            return K;
          }
          ((at.prototype = un(eu.prototype)), (at.prototype.constructor = at));
          function Cr(e) {
            var n = -1,
              s = e == null ? 0 : e.length;
            for (this.clear(); ++n < s;) {
              var o = e[n];
              this.set(o[0], o[1]);
            }
          }
          function Fm() {
            ((this.__data__ = Pn ? Pn(null) : {}), (this.size = 0));
          }
          function Rm(e) {
            var n = this.has(e) && delete this.__data__[e];
            return ((this.size -= n ? 1 : 0), n);
          }
          function Im(e) {
            var n = this.__data__;
            if (Pn) {
              var s = n[e];
              return s === p ? t : s;
            }
            return pt.call(n, e) ? n[e] : t;
          }
          function Om(e) {
            var n = this.__data__;
            return Pn ? n[e] !== t : pt.call(n, e);
          }
          function Mm(e, n) {
            var s = this.__data__;
            return (
              (this.size += this.has(e) ? 0 : 1),
              (s[e] = Pn && n === t ? p : n),
              this
            );
          }
          ((Cr.prototype.clear = Fm),
            (Cr.prototype.delete = Rm),
            (Cr.prototype.get = Im),
            (Cr.prototype.has = Om),
            (Cr.prototype.set = Mm));
          function Ke(e) {
            var n = -1,
              s = e == null ? 0 : e.length;
            for (this.clear(); ++n < s;) {
              var o = e[n];
              this.set(o[0], o[1]);
            }
          }
          function Nm() {
            ((this.__data__ = []), (this.size = 0));
          }
          function km(e) {
            var n = this.__data__,
              s = ru(n, e);
            if (s < 0) return !1;
            var o = n.length - 1;
            return (s == o ? n.pop() : Ki.call(n, s, 1), --this.size, !0);
          }
          function Um(e) {
            var n = this.__data__,
              s = ru(n, e);
            return s < 0 ? t : n[s][1];
          }
          function Pm(e) {
            return ru(this.__data__, e) > -1;
          }
          function $m(e, n) {
            var s = this.__data__,
              o = ru(s, e);
            return (
              o < 0 ? (++this.size, s.push([e, n])) : (s[o][1] = n),
              this
            );
          }
          ((Ke.prototype.clear = Nm),
            (Ke.prototype.delete = km),
            (Ke.prototype.get = Um),
            (Ke.prototype.has = Pm),
            (Ke.prototype.set = $m));
          function Xe(e) {
            var n = -1,
              s = e == null ? 0 : e.length;
            for (this.clear(); ++n < s;) {
              var o = e[n];
              this.set(o[0], o[1]);
            }
          }
          function Hm() {
            ((this.size = 0),
              (this.__data__ = {
                hash: new Cr(),
                map: new (kn || Ke)(),
                string: new Cr(),
              }));
          }
          function Gm(e) {
            var n = du(this, e).delete(e);
            return ((this.size -= n ? 1 : 0), n);
          }
          function Vm(e) {
            return du(this, e).get(e);
          }
          function Wm(e) {
            return du(this, e).has(e);
          }
          function zm(e, n) {
            var s = du(this, e),
              o = s.size;
            return (s.set(e, n), (this.size += s.size == o ? 0 : 1), this);
          }
          ((Xe.prototype.clear = Hm),
            (Xe.prototype.delete = Gm),
            (Xe.prototype.get = Vm),
            (Xe.prototype.has = Wm),
            (Xe.prototype.set = zm));
          function xr(e) {
            var n = -1,
              s = e == null ? 0 : e.length;
            for (this.__data__ = new Xe(); ++n < s;) this.add(e[n]);
          }
          function jm(e) {
            return (this.__data__.set(e, p), this);
          }
          function Jm(e) {
            return this.__data__.has(e);
          }
          ((xr.prototype.add = xr.prototype.push = jm),
            (xr.prototype.has = Jm));
          function qe(e) {
            var n = (this.__data__ = new Ke(e));
            this.size = n.size;
          }
          function Km() {
            ((this.__data__ = new Ke()), (this.size = 0));
          }
          function Xm(e) {
            var n = this.__data__,
              s = n.delete(e);
            return ((this.size = n.size), s);
          }
          function Ym(e) {
            return this.__data__.get(e);
          }
          function Zm(e) {
            return this.__data__.has(e);
          }
          function Qm(e, n) {
            var s = this.__data__;
            if (s instanceof Ke) {
              var o = s.__data__;
              if (!kn || o.length < i - 1)
                return (o.push([e, n]), (this.size = ++s.size), this);
              s = this.__data__ = new Xe(o);
            }
            return (s.set(e, n), (this.size = s.size), this);
          }
          ((qe.prototype.clear = Km),
            (qe.prototype.delete = Xm),
            (qe.prototype.get = Ym),
            (qe.prototype.has = Zm),
            (qe.prototype.set = Qm));
          function ll(e, n) {
            var s = Y(e),
              o = !s && Br(e),
              f = !s && !o && mr(e),
              m = !s && !o && !f && cn(e),
              y = s || o || f || m,
              A = y ? Vs(e.length, cm) : [],
              E = A.length;
            for (var q in e)
              (n || pt.call(e, q)) &&
                !(
                  y &&
                  (q == "length" ||
                    (f && (q == "offset" || q == "parent")) ||
                    (m &&
                      (q == "buffer" ||
                        q == "byteLength" ||
                        q == "byteOffset")) ||
                    Qe(q, E))
                ) &&
                A.push(q);
            return A;
          }
          function fl(e) {
            var n = e.length;
            return n ? e[aa(0, n - 1)] : t;
          }
          function t_(e, n) {
            return gu(Yt(e), Sr(n, 0, e.length));
          }
          function e_(e) {
            return gu(Yt(e));
          }
          function Ys(e, n, s) {
            ((s !== t && !Fe(e[n], s)) || (s === t && !(n in e))) &&
              Pe(e, n, s);
          }
          function Hn(e, n, s) {
            var o = e[n];
            (!(pt.call(e, n) && Fe(o, s)) || (s === t && !(n in e))) &&
              Pe(e, n, s);
          }
          function ru(e, n) {
            for (var s = e.length; s--;) if (Fe(e[s][0], n)) return s;
            return -1;
          }
          function r_(e, n, s, o) {
            return (
              hr(e, function (f, m, y) {
                n(o, f, s(f), y);
              }),
              o
            );
          }
          function hl(e, n) {
            return e && He(n, kt(n), e);
          }
          function n_(e, n) {
            return e && He(n, Qt(n), e);
          }
          function Pe(e, n, s) {
            n == "__proto__" && Xi
              ? Xi(e, n, {
                  configurable: !0,
                  enumerable: !0,
                  value: s,
                  writable: !0,
                })
              : (e[n] = s);
          }
          function Zs(e, n) {
            for (var s = -1, o = n.length, f = S(o), m = e == null; ++s < o;)
              f[s] = m ? t : Ra(e, n[s]);
            return f;
          }
          function Sr(e, n, s) {
            return (
              e === e &&
                (s !== t && (e = e <= s ? e : s),
                n !== t && (e = e >= n ? e : n)),
              e
            );
          }
          function Ae(e, n, s, o, f, m) {
            var y,
              A = n & _,
              E = n & v,
              q = n & b;
            if ((s && (y = f ? s(e, o, f, m) : s(e)), y !== t)) return y;
            if (!St(e)) return e;
            var B = Y(e);
            if (B) {
              if (((y = W_(e)), !A)) return Yt(e, y);
            } else {
              var F = Gt(e),
                N = F == Ii || F == pc;
              if (mr(e)) return Ml(e, A);
              if (F == Je || F == Kr || (N && !f)) {
                if (((y = E || N ? {} : ef(e)), !A))
                  return E ? I_(e, n_(y, e)) : R_(e, hl(y, e));
              } else {
                if (!bt[F]) return f ? e : {};
                y = z_(e, F, A);
              }
            }
            m || (m = new qe());
            var W = m.get(e);
            if (W) return W;
            (m.set(e, y),
              Bf(e)
                ? e.forEach(function (j) {
                    y.add(Ae(j, n, s, j, e, m));
                  })
                : Lf(e) &&
                  e.forEach(function (j, st) {
                    y.set(st, Ae(j, n, s, st, e, m));
                  }));
            var K = q ? (E ? va : _a) : E ? Qt : kt,
              Q = B ? t : K(e);
            return (
              le(Q || e, function (j, st) {
                (Q && ((st = j), (j = e[st])),
                  Hn(y, st, Ae(j, n, s, st, e, m)));
              }),
              y
            );
          }
          function i_(e) {
            var n = kt(e);
            return function (s) {
              return pl(s, e, n);
            };
          }
          function pl(e, n, s) {
            var o = s.length;
            if (e == null) return !o;
            for (e = vt(e); o--;) {
              var f = s[o],
                m = n[f],
                y = e[f];
              if ((y === t && !(f in e)) || !m(y)) return !1;
            }
            return !0;
          }
          function dl(e, n, s) {
            if (typeof e != "function") throw new ve(a);
            return Kn(function () {
              e.apply(t, s);
            }, n);
          }
          function Gn(e, n, s, o) {
            var f = -1,
              m = Ui,
              y = !0,
              A = e.length,
              E = [],
              q = n.length;
            if (!A) return E;
            (s && (n = xt(n, fe(s))),
              o
                ? ((m = ks), (y = !1))
                : n.length >= i && ((m = Mn), (y = !1), (n = new xr(n))));
            t: for (; ++f < A;) {
              var B = e[f],
                F = s == null ? B : s(B);
              if (((B = o || B !== 0 ? B : 0), y && F === F)) {
                for (var N = q; N--;) if (n[N] === F) continue t;
                E.push(B);
              } else m(n, F, o) || E.push(B);
            }
            return E;
          }
          var hr = $l($e),
            gl = $l(ta, !0);
          function u_(e, n) {
            var s = !0;
            return (
              hr(e, function (o, f, m) {
                return ((s = !!n(o, f, m)), s);
              }),
              s
            );
          }
          function nu(e, n, s) {
            for (var o = -1, f = e.length; ++o < f;) {
              var m = e[o],
                y = n(m);
              if (y != null && (A === t ? y === y && !pe(y) : s(y, A)))
                var A = y,
                  E = m;
            }
            return E;
          }
          function s_(e, n, s, o) {
            var f = e.length;
            for (
              s = Z(s),
                s < 0 && (s = -s > f ? 0 : f + s),
                o = o === t || o > f ? f : Z(o),
                o < 0 && (o += f),
                o = s > o ? 0 : Rf(o);
              s < o;
            )
              e[s++] = n;
            return e;
          }
          function ml(e, n) {
            var s = [];
            return (
              hr(e, function (o, f, m) {
                n(o, f, m) && s.push(o);
              }),
              s
            );
          }
          function Ut(e, n, s, o, f) {
            var m = -1,
              y = e.length;
            for (s || (s = J_), f || (f = []); ++m < y;) {
              var A = e[m];
              n > 0 && s(A)
                ? n > 1
                  ? Ut(A, n - 1, s, o, f)
                  : or(f, A)
                : o || (f[f.length] = A);
            }
            return f;
          }
          var Qs = Hl(),
            _l = Hl(!0);
          function $e(e, n) {
            return e && Qs(e, n, kt);
          }
          function ta(e, n) {
            return e && _l(e, n, kt);
          }
          function iu(e, n) {
            return ar(n, function (s) {
              return tr(e[s]);
            });
          }
          function Tr(e, n) {
            n = dr(n, e);
            for (var s = 0, o = n.length; e != null && s < o;)
              e = e[Be(n[s++])];
            return s && s == o ? e : t;
          }
          function vl(e, n, s) {
            var o = n(e);
            return Y(e) ? o : or(o, s(e));
          }
          function zt(e) {
            return e == null
              ? e === t
                ? M2
                : I2
              : Er && Er in vt(e)
                ? H_(e)
                : ev(e);
          }
          function ea(e, n) {
            return e > n;
          }
          function a_(e, n) {
            return e != null && pt.call(e, n);
          }
          function o_(e, n) {
            return e != null && n in vt(e);
          }
          function c_(e, n, s) {
            return e >= Ht(n, s) && e < Ot(n, s);
          }
          function ra(e, n, s) {
            for (
              var o = s ? ks : Ui,
                f = e[0].length,
                m = e.length,
                y = m,
                A = S(m),
                E = 1 / 0,
                q = [];
              y--;
            ) {
              var B = e[y];
              (y && n && (B = xt(B, fe(n))),
                (E = Ht(B.length, E)),
                (A[y] =
                  !s && (n || (f >= 120 && B.length >= 120))
                    ? new xr(y && B)
                    : t));
            }
            B = e[0];
            var F = -1,
              N = A[0];
            t: for (; ++F < f && q.length < E;) {
              var W = B[F],
                K = n ? n(W) : W;
              if (((W = s || W !== 0 ? W : 0), !(N ? Mn(N, K) : o(q, K, s)))) {
                for (y = m; --y;) {
                  var Q = A[y];
                  if (!(Q ? Mn(Q, K) : o(e[y], K, s))) continue t;
                }
                (N && N.push(K), q.push(W));
              }
            }
            return q;
          }
          function l_(e, n, s, o) {
            return (
              $e(e, function (f, m, y) {
                n(o, s(f), m, y);
              }),
              o
            );
          }
          function Vn(e, n, s) {
            ((n = dr(n, e)), (e = sf(e, n)));
            var o = e == null ? e : e[Be(we(n))];
            return o == null ? t : ce(o, e, s);
          }
          function yl(e) {
            return Tt(e) && zt(e) == Kr;
          }
          function f_(e) {
            return Tt(e) && zt(e) == On;
          }
          function h_(e) {
            return Tt(e) && zt(e) == qn;
          }
          function Wn(e, n, s, o, f) {
            return e === n
              ? !0
              : e == null || n == null || (!Tt(e) && !Tt(n))
                ? e !== e && n !== n
                : p_(e, n, s, o, Wn, f);
          }
          function p_(e, n, s, o, f, m) {
            var y = Y(e),
              A = Y(n),
              E = y ? Fi : Gt(e),
              q = A ? Fi : Gt(n);
            ((E = E == Kr ? Je : E), (q = q == Kr ? Je : q));
            var B = E == Je,
              F = q == Je,
              N = E == q;
            if (N && mr(e)) {
              if (!mr(n)) return !1;
              ((y = !0), (B = !1));
            }
            if (N && !B)
              return (
                m || (m = new qe()),
                y || cn(e) ? Zl(e, n, s, o, f, m) : P_(e, n, E, s, o, f, m)
              );
            if (!(s & w)) {
              var W = B && pt.call(e, "__wrapped__"),
                K = F && pt.call(n, "__wrapped__");
              if (W || K) {
                var Q = W ? e.value() : e,
                  j = K ? n.value() : n;
                return (m || (m = new qe()), f(Q, j, s, o, m));
              }
            }
            return N ? (m || (m = new qe()), $_(e, n, s, o, f, m)) : !1;
          }
          function d_(e) {
            return Tt(e) && Gt(e) == Se;
          }
          function na(e, n, s, o) {
            var f = s.length,
              m = f,
              y = !o;
            if (e == null) return !m;
            for (e = vt(e); f--;) {
              var A = s[f];
              if (y && A[2] ? A[1] !== e[A[0]] : !(A[0] in e)) return !1;
            }
            for (; ++f < m;) {
              A = s[f];
              var E = A[0],
                q = e[E],
                B = A[1];
              if (y && A[2]) {
                if (q === t && !(E in e)) return !1;
              } else {
                var F = new qe();
                if (o) var N = o(q, B, E, e, n, F);
                if (!(N === t ? Wn(B, q, w | x, o, F) : N)) return !1;
              }
            }
            return !0;
          }
          function Al(e) {
            if (!St(e) || X_(e)) return !1;
            var n = tr(e) ? dm : i0;
            return n.test(qr(e));
          }
          function g_(e) {
            return Tt(e) && zt(e) == Fn;
          }
          function m_(e) {
            return Tt(e) && Gt(e) == Te;
          }
          function __(e) {
            return Tt(e) && bu(e.length) && !!Et[zt(e)];
          }
          function bl(e) {
            return typeof e == "function"
              ? e
              : e == null
                ? te
                : typeof e == "object"
                  ? Y(e)
                    ? El(e[0], e[1])
                    : Dl(e)
                  : Wf(e);
          }
          function ia(e) {
            if (!Jn(e)) return Am(e);
            var n = [];
            for (var s in vt(e))
              pt.call(e, s) && s != "constructor" && n.push(s);
            return n;
          }
          function v_(e) {
            if (!St(e)) return tv(e);
            var n = Jn(e),
              s = [];
            for (var o in e)
              (o == "constructor" && (n || !pt.call(e, o))) || s.push(o);
            return s;
          }
          function ua(e, n) {
            return e < n;
          }
          function wl(e, n) {
            var s = -1,
              o = Zt(e) ? S(e.length) : [];
            return (
              hr(e, function (f, m, y) {
                o[++s] = n(f, m, y);
              }),
              o
            );
          }
          function Dl(e) {
            var n = Aa(e);
            return n.length == 1 && n[0][2]
              ? nf(n[0][0], n[0][1])
              : function (s) {
                  return s === e || na(s, e, n);
                };
          }
          function El(e, n) {
            return wa(e) && rf(n)
              ? nf(Be(e), n)
              : function (s) {
                  var o = Ra(s, e);
                  return o === t && o === n ? Ia(s, e) : Wn(n, o, w | x);
                };
          }
          function uu(e, n, s, o, f) {
            e !== n &&
              Qs(
                n,
                function (m, y) {
                  if ((f || (f = new qe()), St(m))) y_(e, n, y, s, uu, o, f);
                  else {
                    var A = o ? o(Ea(e, y), m, y + "", e, n, f) : t;
                    (A === t && (A = m), Ys(e, y, A));
                  }
                },
                Qt,
              );
          }
          function y_(e, n, s, o, f, m, y) {
            var A = Ea(e, s),
              E = Ea(n, s),
              q = y.get(E);
            if (q) {
              Ys(e, s, q);
              return;
            }
            var B = m ? m(A, E, s + "", e, n, y) : t,
              F = B === t;
            if (F) {
              var N = Y(E),
                W = !N && mr(E),
                K = !N && !W && cn(E);
              ((B = E),
                N || W || K
                  ? Y(A)
                    ? (B = A)
                    : qt(A)
                      ? (B = Yt(A))
                      : W
                        ? ((F = !1), (B = Ml(E, !0)))
                        : K
                          ? ((F = !1), (B = Nl(E, !0)))
                          : (B = [])
                  : Xn(E) || Br(E)
                    ? ((B = A),
                      Br(A) ? (B = If(A)) : (!St(A) || tr(A)) && (B = ef(E)))
                    : (F = !1));
            }
            (F && (y.set(E, B), f(B, E, o, m, y), y.delete(E)), Ys(e, s, B));
          }
          function Cl(e, n) {
            var s = e.length;
            if (s) return ((n += n < 0 ? s : 0), Qe(n, s) ? e[n] : t);
          }
          function xl(e, n, s) {
            n.length
              ? (n = xt(n, function (m) {
                  return Y(m)
                    ? function (y) {
                        return Tr(y, m.length === 1 ? m[0] : m);
                      }
                    : m;
                }))
              : (n = [te]);
            var o = -1;
            n = xt(n, fe(J()));
            var f = wl(e, function (m, y, A) {
              var E = xt(n, function (q) {
                return q(m);
              });
              return { criteria: E, index: ++o, value: m };
            });
            return z0(f, function (m, y) {
              return F_(m, y, s);
            });
          }
          function A_(e, n) {
            return Sl(e, n, function (s, o) {
              return Ia(e, o);
            });
          }
          function Sl(e, n, s) {
            for (var o = -1, f = n.length, m = {}; ++o < f;) {
              var y = n[o],
                A = Tr(e, y);
              s(A, y) && zn(m, dr(y, e), A);
            }
            return m;
          }
          function b_(e) {
            return function (n) {
              return Tr(n, e);
            };
          }
          function sa(e, n, s, o) {
            var f = o ? W0 : Zr,
              m = -1,
              y = n.length,
              A = e;
            for (e === n && (n = Yt(n)), s && (A = xt(e, fe(s))); ++m < y;)
              for (
                var E = 0, q = n[m], B = s ? s(q) : q;
                (E = f(A, B, E, o)) > -1;
              )
                (A !== e && Ki.call(A, E, 1), Ki.call(e, E, 1));
            return e;
          }
          function Tl(e, n) {
            for (var s = e ? n.length : 0, o = s - 1; s--;) {
              var f = n[s];
              if (s == o || f !== m) {
                var m = f;
                Qe(f) ? Ki.call(e, f, 1) : la(e, f);
              }
            }
            return e;
          }
          function aa(e, n) {
            return e + Zi(ol() * (n - e + 1));
          }
          function w_(e, n, s, o) {
            for (var f = -1, m = Ot(Yi((n - e) / (s || 1)), 0), y = S(m); m--;)
              ((y[o ? m : ++f] = e), (e += s));
            return y;
          }
          function oa(e, n) {
            var s = "";
            if (!e || n < 1 || n > Lt) return s;
            do (n % 2 && (s += e), (n = Zi(n / 2)), n && (e += e));
            while (n);
            return s;
          }
          function rt(e, n) {
            return Ca(uf(e, n, te), e + "");
          }
          function D_(e) {
            return fl(ln(e));
          }
          function E_(e, n) {
            var s = ln(e);
            return gu(s, Sr(n, 0, s.length));
          }
          function zn(e, n, s, o) {
            if (!St(e)) return e;
            n = dr(n, e);
            for (
              var f = -1, m = n.length, y = m - 1, A = e;
              A != null && ++f < m;
            ) {
              var E = Be(n[f]),
                q = s;
              if (E === "__proto__" || E === "constructor" || E === "prototype")
                return e;
              if (f != y) {
                var B = A[E];
                ((q = o ? o(B, E, A) : t),
                  q === t && (q = St(B) ? B : Qe(n[f + 1]) ? [] : {}));
              }
              (Hn(A, E, q), (A = A[E]));
            }
            return e;
          }
          var Ll = Qi
              ? function (e, n) {
                  return (Qi.set(e, n), e);
                }
              : te,
            C_ = Xi
              ? function (e, n) {
                  return Xi(e, "toString", {
                    configurable: !0,
                    enumerable: !1,
                    value: Ma(n),
                    writable: !0,
                  });
                }
              : te;
          function x_(e) {
            return gu(ln(e));
          }
          function be(e, n, s) {
            var o = -1,
              f = e.length;
            (n < 0 && (n = -n > f ? 0 : f + n),
              (s = s > f ? f : s),
              s < 0 && (s += f),
              (f = n > s ? 0 : (s - n) >>> 0),
              (n >>>= 0));
            for (var m = S(f); ++o < f;) m[o] = e[o + n];
            return m;
          }
          function S_(e, n) {
            var s;
            return (
              hr(e, function (o, f, m) {
                return ((s = n(o, f, m)), !s);
              }),
              !!s
            );
          }
          function su(e, n, s) {
            var o = 0,
              f = e == null ? o : e.length;
            if (typeof n == "number" && n === n && f <= q2) {
              for (; o < f;) {
                var m = (o + f) >>> 1,
                  y = e[m];
                y !== null && !pe(y) && (s ? y <= n : y < n)
                  ? (o = m + 1)
                  : (f = m);
              }
              return f;
            }
            return ca(e, n, te, s);
          }
          function ca(e, n, s, o) {
            var f = 0,
              m = e == null ? 0 : e.length;
            if (m === 0) return 0;
            n = s(n);
            for (
              var y = n !== n, A = n === null, E = pe(n), q = n === t;
              f < m;
            ) {
              var B = Zi((f + m) / 2),
                F = s(e[B]),
                N = F !== t,
                W = F === null,
                K = F === F,
                Q = pe(F);
              if (y) var j = o || K;
              else
                q
                  ? (j = K && (o || N))
                  : A
                    ? (j = K && N && (o || !W))
                    : E
                      ? (j = K && N && !W && (o || !Q))
                      : W || Q
                        ? (j = !1)
                        : (j = o ? F <= n : F < n);
              j ? (f = B + 1) : (m = B);
            }
            return Ht(m, L2);
          }
          function ql(e, n) {
            for (var s = -1, o = e.length, f = 0, m = []; ++s < o;) {
              var y = e[s],
                A = n ? n(y) : y;
              if (!s || !Fe(A, E)) {
                var E = A;
                m[f++] = y === 0 ? 0 : y;
              }
            }
            return m;
          }
          function Bl(e) {
            return typeof e == "number" ? e : pe(e) ? ke : +e;
          }
          function he(e) {
            if (typeof e == "string") return e;
            if (Y(e)) return xt(e, he) + "";
            if (pe(e)) return cl ? cl.call(e) : "";
            var n = e + "";
            return n == "0" && 1 / e == -ot ? "-0" : n;
          }
          function pr(e, n, s) {
            var o = -1,
              f = Ui,
              m = e.length,
              y = !0,
              A = [],
              E = A;
            if (s) ((y = !1), (f = ks));
            else if (m >= i) {
              var q = n ? null : k_(e);
              if (q) return $i(q);
              ((y = !1), (f = Mn), (E = new xr()));
            } else E = n ? [] : A;
            t: for (; ++o < m;) {
              var B = e[o],
                F = n ? n(B) : B;
              if (((B = s || B !== 0 ? B : 0), y && F === F)) {
                for (var N = E.length; N--;) if (E[N] === F) continue t;
                (n && E.push(F), A.push(B));
              } else f(E, F, s) || (E !== A && E.push(F), A.push(B));
            }
            return A;
          }
          function la(e, n) {
            n = dr(n, e);
            var s = -1,
              o = n.length;
            if (!o) return !0;
            for (; ++s < o;) {
              var f = Be(n[s]);
              if (
                (f === "__proto__" && !pt.call(e, "__proto__")) ||
                ((f === "constructor" || f === "prototype") && s < o - 1)
              )
                return !1;
            }
            var m = sf(e, n);
            return m == null || delete m[Be(we(n))];
          }
          function Fl(e, n, s, o) {
            return zn(e, n, s(Tr(e, n)), o);
          }
          function au(e, n, s, o) {
            for (
              var f = e.length, m = o ? f : -1;
              (o ? m-- : ++m < f) && n(e[m], m, e);
            );
            return s
              ? be(e, o ? 0 : m, o ? m + 1 : f)
              : be(e, o ? m + 1 : 0, o ? f : m);
          }
          function Rl(e, n) {
            var s = e;
            return (
              s instanceof at && (s = s.value()),
              Us(
                n,
                function (o, f) {
                  return f.func.apply(f.thisArg, or([o], f.args));
                },
                s,
              )
            );
          }
          function fa(e, n, s) {
            var o = e.length;
            if (o < 2) return o ? pr(e[0]) : [];
            for (var f = -1, m = S(o); ++f < o;)
              for (var y = e[f], A = -1; ++A < o;)
                A != f && (m[f] = Gn(m[f] || y, e[A], n, s));
            return pr(Ut(m, 1), n, s);
          }
          function Il(e, n, s) {
            for (var o = -1, f = e.length, m = n.length, y = {}; ++o < f;) {
              var A = o < m ? n[o] : t;
              s(y, e[o], A);
            }
            return y;
          }
          function ha(e) {
            return qt(e) ? e : [];
          }
          function pa(e) {
            return typeof e == "function" ? e : te;
          }
          function dr(e, n) {
            return Y(e) ? e : wa(e, n) ? [e] : lf(dt(e));
          }
          var T_ = rt;
          function gr(e, n, s) {
            var o = e.length;
            return ((s = s === t ? o : s), !n && s >= o ? e : be(e, n, s));
          }
          var Ol =
            gm ||
            function (e) {
              return Nt.clearTimeout(e);
            };
          function Ml(e, n) {
            if (n) return e.slice();
            var s = e.length,
              o = nl ? nl(s) : new e.constructor(s);
            return (e.copy(o), o);
          }
          function da(e) {
            var n = new e.constructor(e.byteLength);
            return (new ji(n).set(new ji(e)), n);
          }
          function L_(e, n) {
            var s = n ? da(e.buffer) : e.buffer;
            return new e.constructor(s, e.byteOffset, e.byteLength);
          }
          function q_(e) {
            var n = new e.constructor(e.source, yc.exec(e));
            return ((n.lastIndex = e.lastIndex), n);
          }
          function B_(e) {
            return $n ? vt($n.call(e)) : {};
          }
          function Nl(e, n) {
            var s = n ? da(e.buffer) : e.buffer;
            return new e.constructor(s, e.byteOffset, e.length);
          }
          function kl(e, n) {
            if (e !== n) {
              var s = e !== t,
                o = e === null,
                f = e === e,
                m = pe(e),
                y = n !== t,
                A = n === null,
                E = n === n,
                q = pe(n);
              if (
                (!A && !q && !m && e > n) ||
                (m && y && E && !A && !q) ||
                (o && y && E) ||
                (!s && E) ||
                !f
              )
                return 1;
              if (
                (!o && !m && !q && e < n) ||
                (q && s && f && !o && !m) ||
                (A && s && f) ||
                (!y && f) ||
                !E
              )
                return -1;
            }
            return 0;
          }
          function F_(e, n, s) {
            for (
              var o = -1,
                f = e.criteria,
                m = n.criteria,
                y = f.length,
                A = s.length;
              ++o < y;
            ) {
              var E = kl(f[o], m[o]);
              if (E) {
                if (o >= A) return E;
                var q = s[o];
                return E * (q == "desc" ? -1 : 1);
              }
            }
            return e.index - n.index;
          }
          function Ul(e, n, s, o) {
            for (
              var f = -1,
                m = e.length,
                y = s.length,
                A = -1,
                E = n.length,
                q = Ot(m - y, 0),
                B = S(E + q),
                F = !o;
              ++A < E;
            )
              B[A] = n[A];
            for (; ++f < y;) (F || f < m) && (B[s[f]] = e[f]);
            for (; q--;) B[A++] = e[f++];
            return B;
          }
          function Pl(e, n, s, o) {
            for (
              var f = -1,
                m = e.length,
                y = -1,
                A = s.length,
                E = -1,
                q = n.length,
                B = Ot(m - A, 0),
                F = S(B + q),
                N = !o;
              ++f < B;
            )
              F[f] = e[f];
            for (var W = f; ++E < q;) F[W + E] = n[E];
            for (; ++y < A;) (N || f < m) && (F[W + s[y]] = e[f++]);
            return F;
          }
          function Yt(e, n) {
            var s = -1,
              o = e.length;
            for (n || (n = S(o)); ++s < o;) n[s] = e[s];
            return n;
          }
          function He(e, n, s, o) {
            var f = !s;
            s || (s = {});
            for (var m = -1, y = n.length; ++m < y;) {
              var A = n[m],
                E = o ? o(s[A], e[A], A, s, e) : t;
              (E === t && (E = e[A]), f ? Pe(s, A, E) : Hn(s, A, E));
            }
            return s;
          }
          function R_(e, n) {
            return He(e, ba(e), n);
          }
          function I_(e, n) {
            return He(e, Ql(e), n);
          }
          function ou(e, n) {
            return function (s, o) {
              var f = Y(s) ? U0 : r_,
                m = n ? n() : {};
              return f(s, e, J(o, 2), m);
            };
          }
          function sn(e) {
            return rt(function (n, s) {
              var o = -1,
                f = s.length,
                m = f > 1 ? s[f - 1] : t,
                y = f > 2 ? s[2] : t;
              for (
                m = e.length > 3 && typeof m == "function" ? (f--, m) : t,
                  y && jt(s[0], s[1], y) && ((m = f < 3 ? t : m), (f = 1)),
                  n = vt(n);
                ++o < f;
              ) {
                var A = s[o];
                A && e(n, A, o, m);
              }
              return n;
            });
          }
          function $l(e, n) {
            return function (s, o) {
              if (s == null) return s;
              if (!Zt(s)) return e(s, o);
              for (
                var f = s.length, m = n ? f : -1, y = vt(s);
                (n ? m-- : ++m < f) && o(y[m], m, y) !== !1;
              );
              return s;
            };
          }
          function Hl(e) {
            return function (n, s, o) {
              for (var f = -1, m = vt(n), y = o(n), A = y.length; A--;) {
                var E = y[e ? A : ++f];
                if (s(m[E], E, m) === !1) break;
              }
              return n;
            };
          }
          function O_(e, n, s) {
            var o = n & C,
              f = jn(e);
            function m() {
              var y = this && this !== Nt && this instanceof m ? f : e;
              return y.apply(o ? s : this, arguments);
            }
            return m;
          }
          function Gl(e) {
            return function (n) {
              n = dt(n);
              var s = Qr(n) ? Le(n) : t,
                o = s ? s[0] : n.charAt(0),
                f = s ? gr(s, 1).join("") : n.slice(1);
              return o[e]() + f;
            };
          }
          function an(e) {
            return function (n) {
              return Us(Gf(Hf(n).replace(C0, "")), e, "");
            };
          }
          function jn(e) {
            return function () {
              var n = arguments;
              switch (n.length) {
                case 0:
                  return new e();
                case 1:
                  return new e(n[0]);
                case 2:
                  return new e(n[0], n[1]);
                case 3:
                  return new e(n[0], n[1], n[2]);
                case 4:
                  return new e(n[0], n[1], n[2], n[3]);
                case 5:
                  return new e(n[0], n[1], n[2], n[3], n[4]);
                case 6:
                  return new e(n[0], n[1], n[2], n[3], n[4], n[5]);
                case 7:
                  return new e(n[0], n[1], n[2], n[3], n[4], n[5], n[6]);
              }
              var s = un(e.prototype),
                o = e.apply(s, n);
              return St(o) ? o : s;
            };
          }
          function M_(e, n, s) {
            var o = jn(e);
            function f() {
              for (var m = arguments.length, y = S(m), A = m, E = on(f); A--;)
                y[A] = arguments[A];
              var q = m < 3 && y[0] !== E && y[m - 1] !== E ? [] : cr(y, E);
              if (((m -= q.length), m < s))
                return Jl(e, n, cu, f.placeholder, t, y, q, t, t, s - m);
              var B = this && this !== Nt && this instanceof f ? o : e;
              return ce(B, this, y);
            }
            return f;
          }
          function Vl(e) {
            return function (n, s, o) {
              var f = vt(n);
              if (!Zt(n)) {
                var m = J(s, 3);
                ((n = kt(n)),
                  (s = function (A) {
                    return m(f[A], A, f);
                  }));
              }
              var y = e(n, s, o);
              return y > -1 ? f[m ? n[y] : y] : t;
            };
          }
          function Wl(e) {
            return Ze(function (n) {
              var s = n.length,
                o = s,
                f = ye.prototype.thru;
              for (e && n.reverse(); o--;) {
                var m = n[o];
                if (typeof m != "function") throw new ve(a);
                if (f && !y && pu(m) == "wrapper") var y = new ye([], !0);
              }
              for (o = y ? o : s; ++o < s;) {
                m = n[o];
                var A = pu(m),
                  E = A == "wrapper" ? ya(m) : t;
                E &&
                Da(E[0]) &&
                E[1] == (H | I | M | O) &&
                !E[4].length &&
                E[9] == 1
                  ? (y = y[pu(E[0])].apply(y, E[3]))
                  : (y = m.length == 1 && Da(m) ? y[A]() : y.thru(m));
              }
              return function () {
                var q = arguments,
                  B = q[0];
                if (y && q.length == 1 && Y(B)) return y.plant(B).value();
                for (var F = 0, N = s ? n[F].apply(this, q) : B; ++F < s;)
                  N = n[F].call(this, N);
                return N;
              };
            });
          }
          function cu(e, n, s, o, f, m, y, A, E, q) {
            var B = n & H,
              F = n & C,
              N = n & R,
              W = n & (I | G),
              K = n & ut,
              Q = N ? t : jn(e);
            function j() {
              for (var st = arguments.length, ct = S(st), de = st; de--;)
                ct[de] = arguments[de];
              if (W)
                var Jt = on(j),
                  ge = J0(ct, Jt);
              if (
                (o && (ct = Ul(ct, o, f, W)),
                m && (ct = Pl(ct, m, y, W)),
                (st -= ge),
                W && st < q)
              ) {
                var Bt = cr(ct, Jt);
                return Jl(e, n, cu, j.placeholder, s, ct, Bt, A, E, q - st);
              }
              var Re = F ? s : this,
                rr = N ? Re[e] : e;
              return (
                (st = ct.length),
                A ? (ct = rv(ct, A)) : K && st > 1 && ct.reverse(),
                B && E < st && (ct.length = E),
                this && this !== Nt && this instanceof j && (rr = Q || jn(rr)),
                rr.apply(Re, ct)
              );
            }
            return j;
          }
          function zl(e, n) {
            return function (s, o) {
              return l_(s, e, n(o), {});
            };
          }
          function lu(e, n) {
            return function (s, o) {
              var f;
              if (s === t && o === t) return n;
              if ((s !== t && (f = s), o !== t)) {
                if (f === t) return o;
                (typeof s == "string" || typeof o == "string"
                  ? ((s = he(s)), (o = he(o)))
                  : ((s = Bl(s)), (o = Bl(o))),
                  (f = e(s, o)));
              }
              return f;
            };
          }
          function ga(e) {
            return Ze(function (n) {
              return (
                (n = xt(n, fe(J()))),
                rt(function (s) {
                  var o = this;
                  return e(n, function (f) {
                    return ce(f, o, s);
                  });
                })
              );
            });
          }
          function fu(e, n) {
            n = n === t ? " " : he(n);
            var s = n.length;
            if (s < 2) return s ? oa(n, e) : n;
            var o = oa(n, Yi(e / tn(n)));
            return Qr(n) ? gr(Le(o), 0, e).join("") : o.slice(0, e);
          }
          function N_(e, n, s, o) {
            var f = n & C,
              m = jn(e);
            function y() {
              for (
                var A = -1,
                  E = arguments.length,
                  q = -1,
                  B = o.length,
                  F = S(B + E),
                  N = this && this !== Nt && this instanceof y ? m : e;
                ++q < B;
              )
                F[q] = o[q];
              for (; E--;) F[q++] = arguments[++A];
              return ce(N, f ? s : this, F);
            }
            return y;
          }
          function jl(e) {
            return function (n, s, o) {
              return (
                o && typeof o != "number" && jt(n, s, o) && (s = o = t),
                (n = er(n)),
                s === t ? ((s = n), (n = 0)) : (s = er(s)),
                (o = o === t ? (n < s ? 1 : -1) : er(o)),
                w_(n, s, o, e)
              );
            };
          }
          function hu(e) {
            return function (n, s) {
              return (
                (typeof n == "string" && typeof s == "string") ||
                  ((n = De(n)), (s = De(s))),
                e(n, s)
              );
            };
          }
          function Jl(e, n, s, o, f, m, y, A, E, q) {
            var B = n & I,
              F = B ? y : t,
              N = B ? t : y,
              W = B ? m : t,
              K = B ? t : m;
            ((n |= B ? M : P), (n &= ~(B ? P : M)), n & T || (n &= ~(C | R)));
            var Q = [e, n, f, W, F, K, N, A, E, q],
              j = s.apply(t, Q);
            return (Da(e) && af(j, Q), (j.placeholder = o), of(j, e, n));
          }
          function ma(e) {
            var n = It[e];
            return function (s, o) {
              if (
                ((s = De(s)), (o = o == null ? 0 : Ht(Z(o), 292)), o && al(s))
              ) {
                var f = (dt(s) + "e").split("e"),
                  m = n(f[0] + "e" + (+f[1] + o));
                return (
                  (f = (dt(m) + "e").split("e")),
                  +(f[0] + "e" + (+f[1] - o))
                );
              }
              return n(s);
            };
          }
          var k_ =
            rn && 1 / $i(new rn([, -0]))[1] == ot
              ? function (e) {
                  return new rn(e);
                }
              : Ua;
          function Kl(e) {
            return function (n) {
              var s = Gt(n);
              return s == Se ? zs(n) : s == Te ? em(n) : j0(n, e(n));
            };
          }
          function Ye(e, n, s, o, f, m, y, A) {
            var E = n & R;
            if (!E && typeof e != "function") throw new ve(a);
            var q = o ? o.length : 0;
            if (
              (q || ((n &= ~(M | P)), (o = f = t)),
              (y = y === t ? y : Ot(Z(y), 0)),
              (A = A === t ? A : Z(A)),
              (q -= f ? f.length : 0),
              n & P)
            ) {
              var B = o,
                F = f;
              o = f = t;
            }
            var N = E ? t : ya(e),
              W = [e, n, s, o, f, B, F, m, y, A];
            if (
              (N && Q_(W, N),
              (e = W[0]),
              (n = W[1]),
              (s = W[2]),
              (o = W[3]),
              (f = W[4]),
              (A = W[9] = W[9] === t ? (E ? 0 : e.length) : Ot(W[9] - q, 0)),
              !A && n & (I | G) && (n &= ~(I | G)),
              !n || n == C)
            )
              var K = O_(e, n, s);
            else
              n == I || n == G
                ? (K = M_(e, n, A))
                : (n == M || n == (C | M)) && !f.length
                  ? (K = N_(e, n, s, o))
                  : (K = cu.apply(t, W));
            var Q = N ? Ll : af;
            return of(Q(K, W), e, n);
          }
          function Xl(e, n, s, o) {
            return e === t || (Fe(e, en[s]) && !pt.call(o, s)) ? n : e;
          }
          function Yl(e, n, s, o, f, m) {
            return (
              St(e) && St(n) && (m.set(n, e), uu(e, n, t, Yl, m), m.delete(n)),
              e
            );
          }
          function U_(e) {
            return Xn(e) ? t : e;
          }
          function Zl(e, n, s, o, f, m) {
            var y = s & w,
              A = e.length,
              E = n.length;
            if (A != E && !(y && E > A)) return !1;
            var q = m.get(e),
              B = m.get(n);
            if (q && B) return q == n && B == e;
            var F = -1,
              N = !0,
              W = s & x ? new xr() : t;
            for (m.set(e, n), m.set(n, e); ++F < A;) {
              var K = e[F],
                Q = n[F];
              if (o) var j = y ? o(Q, K, F, n, e, m) : o(K, Q, F, e, n, m);
              if (j !== t) {
                if (j) continue;
                N = !1;
                break;
              }
              if (W) {
                if (
                  !Ps(n, function (st, ct) {
                    if (!Mn(W, ct) && (K === st || f(K, st, s, o, m)))
                      return W.push(ct);
                  })
                ) {
                  N = !1;
                  break;
                }
              } else if (!(K === Q || f(K, Q, s, o, m))) {
                N = !1;
                break;
              }
            }
            return (m.delete(e), m.delete(n), N);
          }
          function P_(e, n, s, o, f, m, y) {
            switch (s) {
              case Xr:
                if (
                  e.byteLength != n.byteLength ||
                  e.byteOffset != n.byteOffset
                )
                  return !1;
                ((e = e.buffer), (n = n.buffer));
              case On:
                return !(
                  e.byteLength != n.byteLength || !m(new ji(e), new ji(n))
                );
              case Ln:
              case qn:
              case Bn:
                return Fe(+e, +n);
              case Ri:
                return e.name == n.name && e.message == n.message;
              case Fn:
              case Rn:
                return e == n + "";
              case Se:
                var A = zs;
              case Te:
                var E = o & w;
                if ((A || (A = $i), e.size != n.size && !E)) return !1;
                var q = y.get(e);
                if (q) return q == n;
                ((o |= x), y.set(e, n));
                var B = Zl(A(e), A(n), o, f, m, y);
                return (y.delete(e), B);
              case Oi:
                if ($n) return $n.call(e) == $n.call(n);
            }
            return !1;
          }
          function $_(e, n, s, o, f, m) {
            var y = s & w,
              A = _a(e),
              E = A.length,
              q = _a(n),
              B = q.length;
            if (E != B && !y) return !1;
            for (var F = E; F--;) {
              var N = A[F];
              if (!(y ? N in n : pt.call(n, N))) return !1;
            }
            var W = m.get(e),
              K = m.get(n);
            if (W && K) return W == n && K == e;
            var Q = !0;
            (m.set(e, n), m.set(n, e));
            for (var j = y; ++F < E;) {
              N = A[F];
              var st = e[N],
                ct = n[N];
              if (o) var de = y ? o(ct, st, N, n, e, m) : o(st, ct, N, e, n, m);
              if (!(de === t ? st === ct || f(st, ct, s, o, m) : de)) {
                Q = !1;
                break;
              }
              j || (j = N == "constructor");
            }
            if (Q && !j) {
              var Jt = e.constructor,
                ge = n.constructor;
              Jt != ge &&
                "constructor" in e &&
                "constructor" in n &&
                !(
                  typeof Jt == "function" &&
                  Jt instanceof Jt &&
                  typeof ge == "function" &&
                  ge instanceof ge
                ) &&
                (Q = !1);
            }
            return (m.delete(e), m.delete(n), Q);
          }
          function Ze(e) {
            return Ca(uf(e, t, df), e + "");
          }
          function _a(e) {
            return vl(e, kt, ba);
          }
          function va(e) {
            return vl(e, Qt, Ql);
          }
          var ya = Qi
            ? function (e) {
                return Qi.get(e);
              }
            : Ua;
          function pu(e) {
            for (
              var n = e.name + "", s = nn[n], o = pt.call(nn, n) ? s.length : 0;
              o--;
            ) {
              var f = s[o],
                m = f.func;
              if (m == null || m == e) return f.name;
            }
            return n;
          }
          function on(e) {
            var n = pt.call(d, "placeholder") ? d : e;
            return n.placeholder;
          }
          function J() {
            var e = d.iteratee || Na;
            return (
              (e = e === Na ? bl : e),
              arguments.length ? e(arguments[0], arguments[1]) : e
            );
          }
          function du(e, n) {
            var s = e.__data__;
            return K_(n) ? s[typeof n == "string" ? "string" : "hash"] : s.map;
          }
          function Aa(e) {
            for (var n = kt(e), s = n.length; s--;) {
              var o = n[s],
                f = e[o];
              n[s] = [o, f, rf(f)];
            }
            return n;
          }
          function Lr(e, n) {
            var s = Z0(e, n);
            return Al(s) ? s : t;
          }
          function H_(e) {
            var n = pt.call(e, Er),
              s = e[Er];
            try {
              e[Er] = t;
              var o = !0;
            } catch (m) {}
            var f = Wi.call(e);
            return (o && (n ? (e[Er] = s) : delete e[Er]), f);
          }
          var ba = Js
              ? function (e) {
                  return e == null
                    ? []
                    : ((e = vt(e)),
                      ar(Js(e), function (n) {
                        return ul.call(e, n);
                      }));
                }
              : Pa,
            Ql = Js
              ? function (e) {
                  for (var n = []; e;) (or(n, ba(e)), (e = Ji(e)));
                  return n;
                }
              : Pa,
            Gt = zt;
          ((Ks && Gt(new Ks(new ArrayBuffer(1))) != Xr) ||
            (kn && Gt(new kn()) != Se) ||
            (Xs && Gt(Xs.resolve()) != dc) ||
            (rn && Gt(new rn()) != Te) ||
            (Un && Gt(new Un()) != In)) &&
            (Gt = function (e) {
              var n = zt(e),
                s = n == Je ? e.constructor : t,
                o = s ? qr(s) : "";
              if (o)
                switch (o) {
                  case Em:
                    return Xr;
                  case Cm:
                    return Se;
                  case xm:
                    return dc;
                  case Sm:
                    return Te;
                  case Tm:
                    return In;
                }
              return n;
            });
          function G_(e, n, s) {
            for (var o = -1, f = s.length; ++o < f;) {
              var m = s[o],
                y = m.size;
              switch (m.type) {
                case "drop":
                  e += y;
                  break;
                case "dropRight":
                  n -= y;
                  break;
                case "take":
                  n = Ht(n, e + y);
                  break;
                case "takeRight":
                  e = Ot(e, n - y);
                  break;
              }
            }
            return { start: e, end: n };
          }
          function V_(e) {
            var n = e.match(Y2);
            return n ? n[1].split(Z2) : [];
          }
          function tf(e, n, s) {
            n = dr(n, e);
            for (var o = -1, f = n.length, m = !1; ++o < f;) {
              var y = Be(n[o]);
              if (!(m = e != null && s(e, y))) break;
              e = e[y];
            }
            return m || ++o != f
              ? m
              : ((f = e == null ? 0 : e.length),
                !!f && bu(f) && Qe(y, f) && (Y(e) || Br(e)));
          }
          function W_(e) {
            var n = e.length,
              s = new e.constructor(n);
            return (
              n &&
                typeof e[0] == "string" &&
                pt.call(e, "index") &&
                ((s.index = e.index), (s.input = e.input)),
              s
            );
          }
          function ef(e) {
            return typeof e.constructor == "function" && !Jn(e)
              ? un(Ji(e))
              : {};
          }
          function z_(e, n, s) {
            var o = e.constructor;
            switch (n) {
              case On:
                return da(e);
              case Ln:
              case qn:
                return new o(+e);
              case Xr:
                return L_(e, s);
              case As:
              case bs:
              case ws:
              case Ds:
              case Es:
              case Cs:
              case xs:
              case Ss:
              case Ts:
                return Nl(e, s);
              case Se:
                return new o();
              case Bn:
              case Rn:
                return new o(e);
              case Fn:
                return q_(e);
              case Te:
                return new o();
              case Oi:
                return B_(e);
            }
          }
          function j_(e, n) {
            var s = n.length;
            if (!s) return e;
            var o = s - 1;
            return (
              (n[o] = (s > 1 ? "& " : "") + n[o]),
              (n = n.join(s > 2 ? ", " : " ")),
              e.replace(
                X2,
                `{
/* [wrapped with ` +
                  n +
                  `] */
`,
              )
            );
          }
          function J_(e) {
            return Y(e) || Br(e) || !!(sl && e && e[sl]);
          }
          function Qe(e, n) {
            var s = typeof e;
            return (
              (n = n == null ? Lt : n),
              !!n &&
                (s == "number" || (s != "symbol" && s0.test(e))) &&
                e > -1 &&
                e % 1 == 0 &&
                e < n
            );
          }
          function jt(e, n, s) {
            if (!St(s)) return !1;
            var o = typeof n;
            return (
              o == "number" ? Zt(s) && Qe(n, s.length) : o == "string" && n in s
            )
              ? Fe(s[n], e)
              : !1;
          }
          function wa(e, n) {
            if (Y(e)) return !1;
            var s = typeof e;
            return s == "number" ||
              s == "symbol" ||
              s == "boolean" ||
              e == null ||
              pe(e)
              ? !0
              : z2.test(e) || !W2.test(e) || (n != null && e in vt(n));
          }
          function K_(e) {
            var n = typeof e;
            return n == "string" ||
              n == "number" ||
              n == "symbol" ||
              n == "boolean"
              ? e !== "__proto__"
              : e === null;
          }
          function Da(e) {
            var n = pu(e),
              s = d[n];
            if (typeof s != "function" || !(n in at.prototype)) return !1;
            if (e === s) return !0;
            var o = ya(s);
            return !!o && e === o[0];
          }
          function X_(e) {
            return !!rl && rl in e;
          }
          var Y_ = Gi ? tr : $a;
          function Jn(e) {
            var n = e && e.constructor,
              s = (typeof n == "function" && n.prototype) || en;
            return e === s;
          }
          function rf(e) {
            return e === e && !St(e);
          }
          function nf(e, n) {
            return function (s) {
              return s == null ? !1 : s[e] === n && (n !== t || e in vt(s));
            };
          }
          function Z_(e) {
            var n = yu(e, function (o) {
                return (s.size === h && s.clear(), o);
              }),
              s = n.cache;
            return n;
          }
          function Q_(e, n) {
            var s = e[1],
              o = n[1],
              f = s | o,
              m = f < (C | R | H),
              y =
                (o == H && s == I) ||
                (o == H && s == O && e[7].length <= n[8]) ||
                (o == (H | O) && n[7].length <= n[8] && s == I);
            if (!(m || y)) return e;
            o & C && ((e[2] = n[2]), (f |= s & C ? 0 : T));
            var A = n[3];
            if (A) {
              var E = e[3];
              ((e[3] = E ? Ul(E, A, n[4]) : A),
                (e[4] = E ? cr(e[3], g) : n[4]));
            }
            return (
              (A = n[5]),
              A &&
                ((E = e[5]),
                (e[5] = E ? Pl(E, A, n[6]) : A),
                (e[6] = E ? cr(e[5], g) : n[6])),
              (A = n[7]),
              A && (e[7] = A),
              o & H && (e[8] = e[8] == null ? n[8] : Ht(e[8], n[8])),
              e[9] == null && (e[9] = n[9]),
              (e[0] = n[0]),
              (e[1] = f),
              e
            );
          }
          function tv(e) {
            var n = [];
            if (e != null) for (var s in vt(e)) n.push(s);
            return n;
          }
          function ev(e) {
            return Wi.call(e);
          }
          function uf(e, n, s) {
            return (
              (n = Ot(n === t ? e.length - 1 : n, 0)),
              function () {
                for (
                  var o = arguments, f = -1, m = Ot(o.length - n, 0), y = S(m);
                  ++f < m;
                )
                  y[f] = o[n + f];
                f = -1;
                for (var A = S(n + 1); ++f < n;) A[f] = o[f];
                return ((A[n] = s(y)), ce(e, this, A));
              }
            );
          }
          function sf(e, n) {
            return n.length < 2 ? e : Tr(e, be(n, 0, -1));
          }
          function rv(e, n) {
            for (var s = e.length, o = Ht(n.length, s), f = Yt(e); o--;) {
              var m = n[o];
              e[o] = Qe(m, s) ? f[m] : t;
            }
            return e;
          }
          function Ea(e, n) {
            if (
              !(n === "constructor" && typeof e[n] == "function") &&
              n != "__proto__"
            )
              return e[n];
          }
          var af = cf(Ll),
            Kn =
              _m ||
              function (e, n) {
                return Nt.setTimeout(e, n);
              },
            Ca = cf(C_);
          function of(e, n, s) {
            var o = n + "";
            return Ca(e, j_(o, nv(V_(o), s)));
          }
          function cf(e) {
            var n = 0,
              s = 0;
            return function () {
              var o = bm(),
                f = gt - (o - s);
              if (((s = o), f > 0)) {
                if (++n >= Ft) return arguments[0];
              } else n = 0;
              return e.apply(t, arguments);
            };
          }
          function gu(e, n) {
            var s = -1,
              o = e.length,
              f = o - 1;
            for (n = n === t ? o : n; ++s < n;) {
              var m = aa(s, f),
                y = e[m];
              ((e[m] = e[s]), (e[s] = y));
            }
            return ((e.length = n), e);
          }
          var lf = Z_(function (e) {
            var n = [];
            return (
              e.charCodeAt(0) === 46 && n.push(""),
              e.replace(j2, function (s, o, f, m) {
                n.push(f ? m.replace(t0, "$1") : o || s);
              }),
              n
            );
          });
          function Be(e) {
            if (typeof e == "string" || pe(e)) return e;
            var n = e + "";
            return n == "0" && 1 / e == -ot ? "-0" : n;
          }
          function qr(e) {
            if (e != null) {
              try {
                return Vi.call(e);
              } catch (n) {}
              try {
                return e + "";
              } catch (n) {}
            }
            return "";
          }
          function nv(e, n) {
            return (
              le(B2, function (s) {
                var o = "_." + s[0];
                n & s[1] && !Ui(e, o) && e.push(o);
              }),
              e.sort()
            );
          }
          function ff(e) {
            if (e instanceof at) return e.clone();
            var n = new ye(e.__wrapped__, e.__chain__);
            return (
              (n.__actions__ = Yt(e.__actions__)),
              (n.__index__ = e.__index__),
              (n.__values__ = e.__values__),
              n
            );
          }
          function iv(e, n, s) {
            (s ? jt(e, n, s) : n === t) ? (n = 1) : (n = Ot(Z(n), 0));
            var o = e == null ? 0 : e.length;
            if (!o || n < 1) return [];
            for (var f = 0, m = 0, y = S(Yi(o / n)); f < o;)
              y[m++] = be(e, f, (f += n));
            return y;
          }
          function uv(e) {
            for (
              var n = -1, s = e == null ? 0 : e.length, o = 0, f = [];
              ++n < s;
            ) {
              var m = e[n];
              m && (f[o++] = m);
            }
            return f;
          }
          function sv() {
            var e = arguments.length;
            if (!e) return [];
            for (var n = S(e - 1), s = arguments[0], o = e; o--;)
              n[o - 1] = arguments[o];
            return or(Y(s) ? Yt(s) : [s], Ut(n, 1));
          }
          var av = rt(function (e, n) {
              return qt(e) ? Gn(e, Ut(n, 1, qt, !0)) : [];
            }),
            ov = rt(function (e, n) {
              var s = we(n);
              return (
                qt(s) && (s = t),
                qt(e) ? Gn(e, Ut(n, 1, qt, !0), J(s, 2)) : []
              );
            }),
            cv = rt(function (e, n) {
              var s = we(n);
              return (
                qt(s) && (s = t),
                qt(e) ? Gn(e, Ut(n, 1, qt, !0), t, s) : []
              );
            });
          function lv(e, n, s) {
            var o = e == null ? 0 : e.length;
            return o
              ? ((n = s || n === t ? 1 : Z(n)), be(e, n < 0 ? 0 : n, o))
              : [];
          }
          function fv(e, n, s) {
            var o = e == null ? 0 : e.length;
            return o
              ? ((n = s || n === t ? 1 : Z(n)),
                (n = o - n),
                be(e, 0, n < 0 ? 0 : n))
              : [];
          }
          function hv(e, n) {
            return e && e.length ? au(e, J(n, 3), !0, !0) : [];
          }
          function pv(e, n) {
            return e && e.length ? au(e, J(n, 3), !0) : [];
          }
          function dv(e, n, s, o) {
            var f = e == null ? 0 : e.length;
            return f
              ? (s && typeof s != "number" && jt(e, n, s) && ((s = 0), (o = f)),
                s_(e, n, s, o))
              : [];
          }
          function hf(e, n, s) {
            var o = e == null ? 0 : e.length;
            if (!o) return -1;
            var f = s == null ? 0 : Z(s);
            return (f < 0 && (f = Ot(o + f, 0)), Pi(e, J(n, 3), f));
          }
          function pf(e, n, s) {
            var o = e == null ? 0 : e.length;
            if (!o) return -1;
            var f = o - 1;
            return (
              s !== t &&
                ((f = Z(s)), (f = s < 0 ? Ot(o + f, 0) : Ht(f, o - 1))),
              Pi(e, J(n, 3), f, !0)
            );
          }
          function df(e) {
            var n = e == null ? 0 : e.length;
            return n ? Ut(e, 1) : [];
          }
          function gv(e) {
            var n = e == null ? 0 : e.length;
            return n ? Ut(e, ot) : [];
          }
          function mv(e, n) {
            var s = e == null ? 0 : e.length;
            return s ? ((n = n === t ? 1 : Z(n)), Ut(e, n)) : [];
          }
          function _v(e) {
            for (var n = -1, s = e == null ? 0 : e.length, o = {}; ++n < s;) {
              var f = e[n];
              Pe(o, f[0], f[1]);
            }
            return o;
          }
          function gf(e) {
            return e && e.length ? e[0] : t;
          }
          function vv(e, n, s) {
            var o = e == null ? 0 : e.length;
            if (!o) return -1;
            var f = s == null ? 0 : Z(s);
            return (f < 0 && (f = Ot(o + f, 0)), Zr(e, n, f));
          }
          function yv(e) {
            var n = e == null ? 0 : e.length;
            return n ? be(e, 0, -1) : [];
          }
          var Av = rt(function (e) {
              var n = xt(e, ha);
              return n.length && n[0] === e[0] ? ra(n) : [];
            }),
            bv = rt(function (e) {
              var n = we(e),
                s = xt(e, ha);
              return (
                n === we(s) ? (n = t) : s.pop(),
                s.length && s[0] === e[0] ? ra(s, J(n, 2)) : []
              );
            }),
            wv = rt(function (e) {
              var n = we(e),
                s = xt(e, ha);
              return (
                (n = typeof n == "function" ? n : t),
                n && s.pop(),
                s.length && s[0] === e[0] ? ra(s, t, n) : []
              );
            });
          function Dv(e, n) {
            return e == null ? "" : ym.call(e, n);
          }
          function we(e) {
            var n = e == null ? 0 : e.length;
            return n ? e[n - 1] : t;
          }
          function Ev(e, n, s) {
            var o = e == null ? 0 : e.length;
            if (!o) return -1;
            var f = o;
            return (
              s !== t &&
                ((f = Z(s)), (f = f < 0 ? Ot(o + f, 0) : Ht(f, o - 1))),
              n === n ? nm(e, n, f) : Pi(e, Jc, f, !0)
            );
          }
          function Cv(e, n) {
            return e && e.length ? Cl(e, Z(n)) : t;
          }
          var xv = rt(mf);
          function mf(e, n) {
            return e && e.length && n && n.length ? sa(e, n) : e;
          }
          function Sv(e, n, s) {
            return e && e.length && n && n.length ? sa(e, n, J(s, 2)) : e;
          }
          function Tv(e, n, s) {
            return e && e.length && n && n.length ? sa(e, n, t, s) : e;
          }
          var Lv = Ze(function (e, n) {
            var s = e == null ? 0 : e.length,
              o = Zs(e, n);
            return (
              Tl(
                e,
                xt(n, function (f) {
                  return Qe(f, s) ? +f : f;
                }).sort(kl),
              ),
              o
            );
          });
          function qv(e, n) {
            var s = [];
            if (!(e && e.length)) return s;
            var o = -1,
              f = [],
              m = e.length;
            for (n = J(n, 3); ++o < m;) {
              var y = e[o];
              n(y, o, e) && (s.push(y), f.push(o));
            }
            return (Tl(e, f), s);
          }
          function xa(e) {
            return e == null ? e : Dm.call(e);
          }
          function Bv(e, n, s) {
            var o = e == null ? 0 : e.length;
            return o
              ? (s && typeof s != "number" && jt(e, n, s)
                  ? ((n = 0), (s = o))
                  : ((n = n == null ? 0 : Z(n)), (s = s === t ? o : Z(s))),
                be(e, n, s))
              : [];
          }
          function Fv(e, n) {
            return su(e, n);
          }
          function Rv(e, n, s) {
            return ca(e, n, J(s, 2));
          }
          function Iv(e, n) {
            var s = e == null ? 0 : e.length;
            if (s) {
              var o = su(e, n);
              if (o < s && Fe(e[o], n)) return o;
            }
            return -1;
          }
          function Ov(e, n) {
            return su(e, n, !0);
          }
          function Mv(e, n, s) {
            return ca(e, n, J(s, 2), !0);
          }
          function Nv(e, n) {
            var s = e == null ? 0 : e.length;
            if (s) {
              var o = su(e, n, !0) - 1;
              if (Fe(e[o], n)) return o;
            }
            return -1;
          }
          function kv(e) {
            return e && e.length ? ql(e) : [];
          }
          function Uv(e, n) {
            return e && e.length ? ql(e, J(n, 2)) : [];
          }
          function Pv(e) {
            var n = e == null ? 0 : e.length;
            return n ? be(e, 1, n) : [];
          }
          function $v(e, n, s) {
            return e && e.length
              ? ((n = s || n === t ? 1 : Z(n)), be(e, 0, n < 0 ? 0 : n))
              : [];
          }
          function Hv(e, n, s) {
            var o = e == null ? 0 : e.length;
            return o
              ? ((n = s || n === t ? 1 : Z(n)),
                (n = o - n),
                be(e, n < 0 ? 0 : n, o))
              : [];
          }
          function Gv(e, n) {
            return e && e.length ? au(e, J(n, 3), !1, !0) : [];
          }
          function Vv(e, n) {
            return e && e.length ? au(e, J(n, 3)) : [];
          }
          var Wv = rt(function (e) {
              return pr(Ut(e, 1, qt, !0));
            }),
            zv = rt(function (e) {
              var n = we(e);
              return (qt(n) && (n = t), pr(Ut(e, 1, qt, !0), J(n, 2)));
            }),
            jv = rt(function (e) {
              var n = we(e);
              return (
                (n = typeof n == "function" ? n : t),
                pr(Ut(e, 1, qt, !0), t, n)
              );
            });
          function Jv(e) {
            return e && e.length ? pr(e) : [];
          }
          function Kv(e, n) {
            return e && e.length ? pr(e, J(n, 2)) : [];
          }
          function Xv(e, n) {
            return (
              (n = typeof n == "function" ? n : t),
              e && e.length ? pr(e, t, n) : []
            );
          }
          function Sa(e) {
            if (!(e && e.length)) return [];
            var n = 0;
            return (
              (e = ar(e, function (s) {
                if (qt(s)) return ((n = Ot(s.length, n)), !0);
              })),
              Vs(n, function (s) {
                return xt(e, $s(s));
              })
            );
          }
          function _f(e, n) {
            if (!(e && e.length)) return [];
            var s = Sa(e);
            return n == null
              ? s
              : xt(s, function (o) {
                  return ce(n, t, o);
                });
          }
          var Yv = rt(function (e, n) {
              return qt(e) ? Gn(e, n) : [];
            }),
            Zv = rt(function (e) {
              return fa(ar(e, qt));
            }),
            Qv = rt(function (e) {
              var n = we(e);
              return (qt(n) && (n = t), fa(ar(e, qt), J(n, 2)));
            }),
            t1 = rt(function (e) {
              var n = we(e);
              return (
                (n = typeof n == "function" ? n : t),
                fa(ar(e, qt), t, n)
              );
            }),
            e1 = rt(Sa);
          function r1(e, n) {
            return Il(e || [], n || [], Hn);
          }
          function n1(e, n) {
            return Il(e || [], n || [], zn);
          }
          var i1 = rt(function (e) {
            var n = e.length,
              s = n > 1 ? e[n - 1] : t;
            return ((s = typeof s == "function" ? (e.pop(), s) : t), _f(e, s));
          });
          function vf(e) {
            var n = d(e);
            return ((n.__chain__ = !0), n);
          }
          function u1(e, n) {
            return (n(e), e);
          }
          function mu(e, n) {
            return n(e);
          }
          var s1 = Ze(function (e) {
            var n = e.length,
              s = n ? e[0] : 0,
              o = this.__wrapped__,
              f = function (m) {
                return Zs(m, e);
              };
            return n > 1 ||
              this.__actions__.length ||
              !(o instanceof at) ||
              !Qe(s)
              ? this.thru(f)
              : ((o = o.slice(s, +s + (n ? 1 : 0))),
                o.__actions__.push({ func: mu, args: [f], thisArg: t }),
                new ye(o, this.__chain__).thru(function (m) {
                  return (n && !m.length && m.push(t), m);
                }));
          });
          function a1() {
            return vf(this);
          }
          function o1() {
            return new ye(this.value(), this.__chain__);
          }
          function c1() {
            this.__values__ === t && (this.__values__ = Ff(this.value()));
            var e = this.__index__ >= this.__values__.length,
              n = e ? t : this.__values__[this.__index__++];
            return { done: e, value: n };
          }
          function l1() {
            return this;
          }
          function f1(e) {
            for (var n, s = this; s instanceof eu;) {
              var o = ff(s);
              ((o.__index__ = 0),
                (o.__values__ = t),
                n ? (f.__wrapped__ = o) : (n = o));
              var f = o;
              s = s.__wrapped__;
            }
            return ((f.__wrapped__ = e), n);
          }
          function h1() {
            var e = this.__wrapped__;
            if (e instanceof at) {
              var n = e;
              return (
                this.__actions__.length && (n = new at(this)),
                (n = n.reverse()),
                n.__actions__.push({ func: mu, args: [xa], thisArg: t }),
                new ye(n, this.__chain__)
              );
            }
            return this.thru(xa);
          }
          function p1() {
            return Rl(this.__wrapped__, this.__actions__);
          }
          var d1 = ou(function (e, n, s) {
            pt.call(e, s) ? ++e[s] : Pe(e, s, 1);
          });
          function g1(e, n, s) {
            var o = Y(e) ? zc : u_;
            return (s && jt(e, n, s) && (n = t), o(e, J(n, 3)));
          }
          function m1(e, n) {
            var s = Y(e) ? ar : ml;
            return s(e, J(n, 3));
          }
          var _1 = Vl(hf),
            v1 = Vl(pf);
          function y1(e, n) {
            return Ut(_u(e, n), 1);
          }
          function A1(e, n) {
            return Ut(_u(e, n), ot);
          }
          function b1(e, n, s) {
            return ((s = s === t ? 1 : Z(s)), Ut(_u(e, n), s));
          }
          function yf(e, n) {
            var s = Y(e) ? le : hr;
            return s(e, J(n, 3));
          }
          function Af(e, n) {
            var s = Y(e) ? P0 : gl;
            return s(e, J(n, 3));
          }
          var w1 = ou(function (e, n, s) {
            pt.call(e, s) ? e[s].push(n) : Pe(e, s, [n]);
          });
          function D1(e, n, s, o) {
            ((e = Zt(e) ? e : ln(e)), (s = s && !o ? Z(s) : 0));
            var f = e.length;
            return (
              s < 0 && (s = Ot(f + s, 0)),
              wu(e) ? s <= f && e.indexOf(n, s) > -1 : !!f && Zr(e, n, s) > -1
            );
          }
          var E1 = rt(function (e, n, s) {
              var o = -1,
                f = typeof n == "function",
                m = Zt(e) ? S(e.length) : [];
              return (
                hr(e, function (y) {
                  m[++o] = f ? ce(n, y, s) : Vn(y, n, s);
                }),
                m
              );
            }),
            C1 = ou(function (e, n, s) {
              Pe(e, s, n);
            });
          function _u(e, n) {
            var s = Y(e) ? xt : wl;
            return s(e, J(n, 3));
          }
          function x1(e, n, s, o) {
            return e == null
              ? []
              : (Y(n) || (n = n == null ? [] : [n]),
                (s = o ? t : s),
                Y(s) || (s = s == null ? [] : [s]),
                xl(e, n, s));
          }
          var S1 = ou(
            function (e, n, s) {
              e[s ? 0 : 1].push(n);
            },
            function () {
              return [[], []];
            },
          );
          function T1(e, n, s) {
            var o = Y(e) ? Us : Xc,
              f = arguments.length < 3;
            return o(e, J(n, 4), s, f, hr);
          }
          function L1(e, n, s) {
            var o = Y(e) ? $0 : Xc,
              f = arguments.length < 3;
            return o(e, J(n, 4), s, f, gl);
          }
          function q1(e, n) {
            var s = Y(e) ? ar : ml;
            return s(e, Au(J(n, 3)));
          }
          function B1(e) {
            var n = Y(e) ? fl : D_;
            return n(e);
          }
          function F1(e, n, s) {
            (s ? jt(e, n, s) : n === t) ? (n = 1) : (n = Z(n));
            var o = Y(e) ? t_ : E_;
            return o(e, n);
          }
          function R1(e) {
            var n = Y(e) ? e_ : x_;
            return n(e);
          }
          function I1(e) {
            if (e == null) return 0;
            if (Zt(e)) return wu(e) ? tn(e) : e.length;
            var n = Gt(e);
            return n == Se || n == Te ? e.size : ia(e).length;
          }
          function O1(e, n, s) {
            var o = Y(e) ? Ps : S_;
            return (s && jt(e, n, s) && (n = t), o(e, J(n, 3)));
          }
          var M1 = rt(function (e, n) {
              if (e == null) return [];
              var s = n.length;
              return (
                s > 1 && jt(e, n[0], n[1])
                  ? (n = [])
                  : s > 2 && jt(n[0], n[1], n[2]) && (n = [n[0]]),
                xl(e, Ut(n, 1), [])
              );
            }),
            vu =
              mm ||
              function () {
                return Nt.Date.now();
              };
          function N1(e, n) {
            if (typeof n != "function") throw new ve(a);
            return (
              (e = Z(e)),
              function () {
                if (--e < 1) return n.apply(this, arguments);
              }
            );
          }
          function bf(e, n, s) {
            return (
              (n = s ? t : n),
              (n = e && n == null ? e.length : n),
              Ye(e, H, t, t, t, t, n)
            );
          }
          function wf(e, n) {
            var s;
            if (typeof n != "function") throw new ve(a);
            return (
              (e = Z(e)),
              function () {
                return (
                  --e > 0 && (s = n.apply(this, arguments)),
                  e <= 1 && (n = t),
                  s
                );
              }
            );
          }
          var Ta = rt(function (e, n, s) {
              var o = C;
              if (s.length) {
                var f = cr(s, on(Ta));
                o |= M;
              }
              return Ye(e, o, n, s, f);
            }),
            Df = rt(function (e, n, s) {
              var o = C | R;
              if (s.length) {
                var f = cr(s, on(Df));
                o |= M;
              }
              return Ye(n, o, e, s, f);
            });
          function Ef(e, n, s) {
            n = s ? t : n;
            var o = Ye(e, I, t, t, t, t, t, n);
            return ((o.placeholder = Ef.placeholder), o);
          }
          function Cf(e, n, s) {
            n = s ? t : n;
            var o = Ye(e, G, t, t, t, t, t, n);
            return ((o.placeholder = Cf.placeholder), o);
          }
          function xf(e, n, s) {
            var o,
              f,
              m,
              y,
              A,
              E,
              q = 0,
              B = !1,
              F = !1,
              N = !0;
            if (typeof e != "function") throw new ve(a);
            ((n = De(n) || 0),
              St(s) &&
                ((B = !!s.leading),
                (F = "maxWait" in s),
                (m = F ? Ot(De(s.maxWait) || 0, n) : m),
                (N = "trailing" in s ? !!s.trailing : N)));
            function W(Bt) {
              var Re = o,
                rr = f;
              return ((o = f = t), (q = Bt), (y = e.apply(rr, Re)), y);
            }
            function K(Bt) {
              return ((q = Bt), (A = Kn(st, n)), B ? W(Bt) : y);
            }
            function Q(Bt) {
              var Re = Bt - E,
                rr = Bt - q,
                zf = n - Re;
              return F ? Ht(zf, m - rr) : zf;
            }
            function j(Bt) {
              var Re = Bt - E,
                rr = Bt - q;
              return E === t || Re >= n || Re < 0 || (F && rr >= m);
            }
            function st() {
              var Bt = vu();
              if (j(Bt)) return ct(Bt);
              A = Kn(st, Q(Bt));
            }
            function ct(Bt) {
              return ((A = t), N && o ? W(Bt) : ((o = f = t), y));
            }
            function de() {
              (A !== t && Ol(A), (q = 0), (o = E = f = A = t));
            }
            function Jt() {
              return A === t ? y : ct(vu());
            }
            function ge() {
              var Bt = vu(),
                Re = j(Bt);
              if (((o = arguments), (f = this), (E = Bt), Re)) {
                if (A === t) return K(E);
                if (F) return (Ol(A), (A = Kn(st, n)), W(E));
              }
              return (A === t && (A = Kn(st, n)), y);
            }
            return ((ge.cancel = de), (ge.flush = Jt), ge);
          }
          var k1 = rt(function (e, n) {
              return dl(e, 1, n);
            }),
            U1 = rt(function (e, n, s) {
              return dl(e, De(n) || 0, s);
            });
          function P1(e) {
            return Ye(e, ut);
          }
          function yu(e, n) {
            if (typeof e != "function" || (n != null && typeof n != "function"))
              throw new ve(a);
            var s = function () {
              var o = arguments,
                f = n ? n.apply(this, o) : o[0],
                m = s.cache;
              if (m.has(f)) return m.get(f);
              var y = e.apply(this, o);
              return ((s.cache = m.set(f, y) || m), y);
            };
            return ((s.cache = new (yu.Cache || Xe)()), s);
          }
          yu.Cache = Xe;
          function Au(e) {
            if (typeof e != "function") throw new ve(a);
            return function () {
              var n = arguments;
              switch (n.length) {
                case 0:
                  return !e.call(this);
                case 1:
                  return !e.call(this, n[0]);
                case 2:
                  return !e.call(this, n[0], n[1]);
                case 3:
                  return !e.call(this, n[0], n[1], n[2]);
              }
              return !e.apply(this, n);
            };
          }
          function $1(e) {
            return wf(2, e);
          }
          var H1 = T_(function (e, n) {
              n =
                n.length == 1 && Y(n[0])
                  ? xt(n[0], fe(J()))
                  : xt(Ut(n, 1), fe(J()));
              var s = n.length;
              return rt(function (o) {
                for (var f = -1, m = Ht(o.length, s); ++f < m;)
                  o[f] = n[f].call(this, o[f]);
                return ce(e, this, o);
              });
            }),
            La = rt(function (e, n) {
              var s = cr(n, on(La));
              return Ye(e, M, t, n, s);
            }),
            Sf = rt(function (e, n) {
              var s = cr(n, on(Sf));
              return Ye(e, P, t, n, s);
            }),
            G1 = Ze(function (e, n) {
              return Ye(e, O, t, t, t, n);
            });
          function V1(e, n) {
            if (typeof e != "function") throw new ve(a);
            return ((n = n === t ? n : Z(n)), rt(e, n));
          }
          function W1(e, n) {
            if (typeof e != "function") throw new ve(a);
            return (
              (n = n == null ? 0 : Ot(Z(n), 0)),
              rt(function (s) {
                var o = s[n],
                  f = gr(s, 0, n);
                return (o && or(f, o), ce(e, this, f));
              })
            );
          }
          function z1(e, n, s) {
            var o = !0,
              f = !0;
            if (typeof e != "function") throw new ve(a);
            return (
              St(s) &&
                ((o = "leading" in s ? !!s.leading : o),
                (f = "trailing" in s ? !!s.trailing : f)),
              xf(e, n, { leading: o, maxWait: n, trailing: f })
            );
          }
          function j1(e) {
            return bf(e, 1);
          }
          function J1(e, n) {
            return La(pa(n), e);
          }
          function K1() {
            if (!arguments.length) return [];
            var e = arguments[0];
            return Y(e) ? e : [e];
          }
          function X1(e) {
            return Ae(e, b);
          }
          function Y1(e, n) {
            return ((n = typeof n == "function" ? n : t), Ae(e, b, n));
          }
          function Z1(e) {
            return Ae(e, _ | b);
          }
          function Q1(e, n) {
            return ((n = typeof n == "function" ? n : t), Ae(e, _ | b, n));
          }
          function ty(e, n) {
            return n == null || pl(e, n, kt(n));
          }
          function Fe(e, n) {
            return e === n || (e !== e && n !== n);
          }
          var ey = hu(ea),
            ry = hu(function (e, n) {
              return e >= n;
            }),
            Br = yl(
              (function () {
                return arguments;
              })(),
            )
              ? yl
              : function (e) {
                  return Tt(e) && pt.call(e, "callee") && !ul.call(e, "callee");
                },
            Y = S.isArray,
            ny = Pc ? fe(Pc) : f_;
          function Zt(e) {
            return e != null && bu(e.length) && !tr(e);
          }
          function qt(e) {
            return Tt(e) && Zt(e);
          }
          function iy(e) {
            return e === !0 || e === !1 || (Tt(e) && zt(e) == Ln);
          }
          var mr = vm || $a,
            uy = $c ? fe($c) : h_;
          function sy(e) {
            return Tt(e) && e.nodeType === 1 && !Xn(e);
          }
          function ay(e) {
            if (e == null) return !0;
            if (
              Zt(e) &&
              (Y(e) ||
                typeof e == "string" ||
                typeof e.splice == "function" ||
                mr(e) ||
                cn(e) ||
                Br(e))
            )
              return !e.length;
            var n = Gt(e);
            if (n == Se || n == Te) return !e.size;
            if (Jn(e)) return !ia(e).length;
            for (var s in e) if (pt.call(e, s)) return !1;
            return !0;
          }
          function oy(e, n) {
            return Wn(e, n);
          }
          function cy(e, n, s) {
            s = typeof s == "function" ? s : t;
            var o = s ? s(e, n) : t;
            return o === t ? Wn(e, n, t, s) : !!o;
          }
          function qa(e) {
            if (!Tt(e)) return !1;
            var n = zt(e);
            return (
              n == Ri ||
              n == R2 ||
              (typeof e.message == "string" &&
                typeof e.name == "string" &&
                !Xn(e))
            );
          }
          function ly(e) {
            return typeof e == "number" && al(e);
          }
          function tr(e) {
            if (!St(e)) return !1;
            var n = zt(e);
            return n == Ii || n == pc || n == F2 || n == O2;
          }
          function Tf(e) {
            return typeof e == "number" && e == Z(e);
          }
          function bu(e) {
            return typeof e == "number" && e > -1 && e % 1 == 0 && e <= Lt;
          }
          function St(e) {
            var n = typeof e;
            return e != null && (n == "object" || n == "function");
          }
          function Tt(e) {
            return e != null && typeof e == "object";
          }
          var Lf = Hc ? fe(Hc) : d_;
          function fy(e, n) {
            return e === n || na(e, n, Aa(n));
          }
          function hy(e, n, s) {
            return ((s = typeof s == "function" ? s : t), na(e, n, Aa(n), s));
          }
          function py(e) {
            return qf(e) && e != +e;
          }
          function dy(e) {
            if (Y_(e)) throw new X(u);
            return Al(e);
          }
          function gy(e) {
            return e === null;
          }
          function my(e) {
            return e == null;
          }
          function qf(e) {
            return typeof e == "number" || (Tt(e) && zt(e) == Bn);
          }
          function Xn(e) {
            if (!Tt(e) || zt(e) != Je) return !1;
            var n = Ji(e);
            if (n === null) return !0;
            var s = pt.call(n, "constructor") && n.constructor;
            return typeof s == "function" && s instanceof s && Vi.call(s) == hm;
          }
          var Ba = Gc ? fe(Gc) : g_;
          function _y(e) {
            return Tf(e) && e >= -Lt && e <= Lt;
          }
          var Bf = Vc ? fe(Vc) : m_;
          function wu(e) {
            return typeof e == "string" || (!Y(e) && Tt(e) && zt(e) == Rn);
          }
          function pe(e) {
            return typeof e == "symbol" || (Tt(e) && zt(e) == Oi);
          }
          var cn = Wc ? fe(Wc) : __;
          function vy(e) {
            return e === t;
          }
          function yy(e) {
            return Tt(e) && Gt(e) == In;
          }
          function Ay(e) {
            return Tt(e) && zt(e) == N2;
          }
          var by = hu(ua),
            wy = hu(function (e, n) {
              return e <= n;
            });
          function Ff(e) {
            if (!e) return [];
            if (Zt(e)) return wu(e) ? Le(e) : Yt(e);
            if (Nn && e[Nn]) return tm(e[Nn]());
            var n = Gt(e),
              s = n == Se ? zs : n == Te ? $i : ln;
            return s(e);
          }
          function er(e) {
            if (!e) return e === 0 ? e : 0;
            if (((e = De(e)), e === ot || e === -ot)) {
              var n = e < 0 ? -1 : 1;
              return n * Rt;
            }
            return e === e ? e : 0;
          }
          function Z(e) {
            var n = er(e),
              s = n % 1;
            return n === n ? (s ? n - s : n) : 0;
          }
          function Rf(e) {
            return e ? Sr(Z(e), 0, Ue) : 0;
          }
          function De(e) {
            if (typeof e == "number") return e;
            if (pe(e)) return ke;
            if (St(e)) {
              var n = typeof e.valueOf == "function" ? e.valueOf() : e;
              e = St(n) ? n + "" : n;
            }
            if (typeof e != "string") return e === 0 ? e : +e;
            e = Yc(e);
            var s = n0.test(e);
            return s || u0.test(e)
              ? N0(e.slice(2), s ? 2 : 8)
              : r0.test(e)
                ? ke
                : +e;
          }
          function If(e) {
            return He(e, Qt(e));
          }
          function Dy(e) {
            return e ? Sr(Z(e), -Lt, Lt) : e === 0 ? e : 0;
          }
          function dt(e) {
            return e == null ? "" : he(e);
          }
          var Ey = sn(function (e, n) {
              if (Jn(n) || Zt(n)) {
                He(n, kt(n), e);
                return;
              }
              for (var s in n) pt.call(n, s) && Hn(e, s, n[s]);
            }),
            Of = sn(function (e, n) {
              He(n, Qt(n), e);
            }),
            Mf = sn(function (e, n, s, o) {
              He(n, Qt(n), e, o);
            }),
            Fa = sn(function (e, n, s, o) {
              He(n, kt(n), e, o);
            }),
            Cy = Ze(Zs);
          function xy(e, n) {
            var s = un(e);
            return n == null ? s : hl(s, n);
          }
          var Sy = rt(function (e, n) {
              e = vt(e);
              var s = -1,
                o = n.length,
                f = o > 2 ? n[2] : t;
              for (f && jt(n[0], n[1], f) && (o = 1); ++s < o;)
                for (var m = n[s], y = Qt(m), A = -1, E = y.length; ++A < E;) {
                  var q = y[A],
                    B = e[q];
                  (B === t || (Fe(B, en[q]) && !pt.call(e, q))) &&
                    (e[q] = m[q]);
                }
              return e;
            }),
            Ty = rt(function (e) {
              return (e.push(t, Yl), ce(Nf, t, e));
            });
          function Ly(e, n) {
            return jc(e, J(n, 3), $e);
          }
          function qy(e, n) {
            return jc(e, J(n, 3), ta);
          }
          function By(e, n) {
            return e == null ? e : Qs(e, J(n, 3), Qt);
          }
          function Fy(e, n) {
            return e == null ? e : _l(e, J(n, 3), Qt);
          }
          function Ry(e, n) {
            return e && $e(e, J(n, 3));
          }
          function Iy(e, n) {
            return e && ta(e, J(n, 3));
          }
          function Oy(e) {
            return e == null ? [] : iu(e, kt(e));
          }
          function My(e) {
            return e == null ? [] : iu(e, Qt(e));
          }
          function Ra(e, n, s) {
            var o = e == null ? t : Tr(e, n);
            return o === t ? s : o;
          }
          function Ny(e, n) {
            return e != null && tf(e, n, a_);
          }
          function Ia(e, n) {
            return e != null && tf(e, n, o_);
          }
          var ky = zl(function (e, n, s) {
              (n != null && typeof n.toString != "function" && (n = Wi.call(n)),
                (e[n] = s));
            }, Ma(te)),
            Uy = zl(function (e, n, s) {
              (n != null && typeof n.toString != "function" && (n = Wi.call(n)),
                pt.call(e, n) ? e[n].push(s) : (e[n] = [s]));
            }, J),
            Py = rt(Vn);
          function kt(e) {
            return Zt(e) ? ll(e) : ia(e);
          }
          function Qt(e) {
            return Zt(e) ? ll(e, !0) : v_(e);
          }
          function $y(e, n) {
            var s = {};
            return (
              (n = J(n, 3)),
              $e(e, function (o, f, m) {
                Pe(s, n(o, f, m), o);
              }),
              s
            );
          }
          function Hy(e, n) {
            var s = {};
            return (
              (n = J(n, 3)),
              $e(e, function (o, f, m) {
                Pe(s, f, n(o, f, m));
              }),
              s
            );
          }
          var Gy = sn(function (e, n, s) {
              uu(e, n, s);
            }),
            Nf = sn(function (e, n, s, o) {
              uu(e, n, s, o);
            }),
            Vy = Ze(function (e, n) {
              var s = {};
              if (e == null) return s;
              var o = !1;
              ((n = xt(n, function (m) {
                return ((m = dr(m, e)), o || (o = m.length > 1), m);
              })),
                He(e, va(e), s),
                o && (s = Ae(s, _ | v | b, U_)));
              for (var f = n.length; f--;) la(s, n[f]);
              return s;
            });
          function Wy(e, n) {
            return kf(e, Au(J(n)));
          }
          var zy = Ze(function (e, n) {
            return e == null ? {} : A_(e, n);
          });
          function kf(e, n) {
            if (e == null) return {};
            var s = xt(va(e), function (o) {
              return [o];
            });
            return (
              (n = J(n)),
              Sl(e, s, function (o, f) {
                return n(o, f[0]);
              })
            );
          }
          function jy(e, n, s) {
            n = dr(n, e);
            var o = -1,
              f = n.length;
            for (f || ((f = 1), (e = t)); ++o < f;) {
              var m = e == null ? t : e[Be(n[o])];
              (m === t && ((o = f), (m = s)), (e = tr(m) ? m.call(e) : m));
            }
            return e;
          }
          function Jy(e, n, s) {
            return e == null ? e : zn(e, n, s);
          }
          function Ky(e, n, s, o) {
            return (
              (o = typeof o == "function" ? o : t),
              e == null ? e : zn(e, n, s, o)
            );
          }
          var Uf = Kl(kt),
            Pf = Kl(Qt);
          function Xy(e, n, s) {
            var o = Y(e),
              f = o || mr(e) || cn(e);
            if (((n = J(n, 4)), s == null)) {
              var m = e && e.constructor;
              f
                ? (s = o ? new m() : [])
                : St(e)
                  ? (s = tr(m) ? un(Ji(e)) : {})
                  : (s = {});
            }
            return (
              (f ? le : $e)(e, function (y, A, E) {
                return n(s, y, A, E);
              }),
              s
            );
          }
          function Yy(e, n) {
            return e == null ? !0 : la(e, n);
          }
          function Zy(e, n, s) {
            return e == null ? e : Fl(e, n, pa(s));
          }
          function Qy(e, n, s, o) {
            return (
              (o = typeof o == "function" ? o : t),
              e == null ? e : Fl(e, n, pa(s), o)
            );
          }
          function ln(e) {
            return e == null ? [] : Ws(e, kt(e));
          }
          function tA(e) {
            return e == null ? [] : Ws(e, Qt(e));
          }
          function eA(e, n, s) {
            return (
              s === t && ((s = n), (n = t)),
              s !== t && ((s = De(s)), (s = s === s ? s : 0)),
              n !== t && ((n = De(n)), (n = n === n ? n : 0)),
              Sr(De(e), n, s)
            );
          }
          function rA(e, n, s) {
            return (
              (n = er(n)),
              s === t ? ((s = n), (n = 0)) : (s = er(s)),
              (e = De(e)),
              c_(e, n, s)
            );
          }
          function nA(e, n, s) {
            if (
              (s && typeof s != "boolean" && jt(e, n, s) && (n = s = t),
              s === t &&
                (typeof n == "boolean"
                  ? ((s = n), (n = t))
                  : typeof e == "boolean" && ((s = e), (e = t))),
              e === t && n === t
                ? ((e = 0), (n = 1))
                : ((e = er(e)), n === t ? ((n = e), (e = 0)) : (n = er(n))),
              e > n)
            ) {
              var o = e;
              ((e = n), (n = o));
            }
            if (s || e % 1 || n % 1) {
              var f = ol();
              return Ht(e + f * (n - e + M0("1e-" + ((f + "").length - 1))), n);
            }
            return aa(e, n);
          }
          var iA = an(function (e, n, s) {
            return ((n = n.toLowerCase()), e + (s ? $f(n) : n));
          });
          function $f(e) {
            return Oa(dt(e).toLowerCase());
          }
          function Hf(e) {
            return ((e = dt(e)), e && e.replace(a0, K0).replace(x0, ""));
          }
          function uA(e, n, s) {
            ((e = dt(e)), (n = he(n)));
            var o = e.length;
            s = s === t ? o : Sr(Z(s), 0, o);
            var f = s;
            return ((s -= n.length), s >= 0 && e.slice(s, f) == n);
          }
          function sA(e) {
            return ((e = dt(e)), e && H2.test(e) ? e.replace(mc, X0) : e);
          }
          function aA(e) {
            return ((e = dt(e)), e && J2.test(e) ? e.replace(Ls, "\\$&") : e);
          }
          var oA = an(function (e, n, s) {
              return e + (s ? "-" : "") + n.toLowerCase();
            }),
            cA = an(function (e, n, s) {
              return e + (s ? " " : "") + n.toLowerCase();
            }),
            lA = Gl("toLowerCase");
          function fA(e, n, s) {
            ((e = dt(e)), (n = Z(n)));
            var o = n ? tn(e) : 0;
            if (!n || o >= n) return e;
            var f = (n - o) / 2;
            return fu(Zi(f), s) + e + fu(Yi(f), s);
          }
          function hA(e, n, s) {
            ((e = dt(e)), (n = Z(n)));
            var o = n ? tn(e) : 0;
            return n && o < n ? e + fu(n - o, s) : e;
          }
          function pA(e, n, s) {
            ((e = dt(e)), (n = Z(n)));
            var o = n ? tn(e) : 0;
            return n && o < n ? fu(n - o, s) + e : e;
          }
          function dA(e, n, s) {
            return (
              s || n == null ? (n = 0) : n && (n = +n),
              wm(dt(e).replace(qs, ""), n || 0)
            );
          }
          function gA(e, n, s) {
            return (
              (s ? jt(e, n, s) : n === t) ? (n = 1) : (n = Z(n)),
              oa(dt(e), n)
            );
          }
          function mA() {
            var e = arguments,
              n = dt(e[0]);
            return e.length < 3 ? n : n.replace(e[1], e[2]);
          }
          var _A = an(function (e, n, s) {
            return e + (s ? "_" : "") + n.toLowerCase();
          });
          function vA(e, n, s) {
            return (
              s && typeof s != "number" && jt(e, n, s) && (n = s = t),
              (s = s === t ? Ue : s >>> 0),
              s
                ? ((e = dt(e)),
                  e &&
                  (typeof n == "string" || (n != null && !Ba(n))) &&
                  ((n = he(n)), !n && Qr(e))
                    ? gr(Le(e), 0, s)
                    : e.split(n, s))
                : []
            );
          }
          var yA = an(function (e, n, s) {
            return e + (s ? " " : "") + Oa(n);
          });
          function AA(e, n, s) {
            return (
              (e = dt(e)),
              (s = s == null ? 0 : Sr(Z(s), 0, e.length)),
              (n = he(n)),
              e.slice(s, s + n.length) == n
            );
          }
          function bA(e, n, s) {
            var o = d.templateSettings;
            (s && jt(e, n, s) && (n = t), (e = dt(e)), (n = Fa({}, n, o, Xl)));
            var f = Fa({}, n.imports, o.imports, Xl),
              m = kt(f),
              y = Ws(f, m);
            le(m, function (j) {
              if (vc.test(j)) throw new X(l);
            });
            var A,
              E,
              q = 0,
              B = n.interpolate || Mi,
              F = "__p += '",
              N = js(
                (n.escape || Mi).source +
                  "|" +
                  B.source +
                  "|" +
                  (B === _c ? e0 : Mi).source +
                  "|" +
                  (n.evaluate || Mi).source +
                  "|$",
                "g",
              ),
              W =
                "//# sourceURL=" +
                (pt.call(n, "sourceURL")
                  ? (n.sourceURL + "").replace(/\s/g, " ")
                  : "lodash.templateSources[" + ++B0 + "]") +
                `
`;
            (e.replace(N, function (j, st, ct, de, Jt, ge) {
              return (
                ct || (ct = de),
                (F += e.slice(q, ge).replace(o0, Y0)),
                st &&
                  ((A = !0),
                  (F +=
                    `' +
__e(` +
                    st +
                    `) +
'`)),
                Jt &&
                  ((E = !0),
                  (F +=
                    `';
` +
                    Jt +
                    `;
__p += '`)),
                ct &&
                  (F +=
                    `' +
((__t = (` +
                    ct +
                    `)) == null ? '' : __t) +
'`),
                (q = ge + j.length),
                j
              );
            }),
              (F += `';
`));
            var K = pt.call(n, "variable") && n.variable;
            if (!K)
              F =
                `with (obj) {
` +
                F +
                `
}
`;
            else if (vc.test(K)) throw new X(c);
            ((F = (E ? F.replace(k2, "") : F)
              .replace(U2, "$1")
              .replace(P2, "$1;")),
              (F =
                "function(" +
                (K || "obj") +
                `) {
` +
                (K
                  ? ""
                  : `obj || (obj = {});
`) +
                "var __t, __p = ''" +
                (A ? ", __e = _.escape" : "") +
                (E
                  ? `, __j = Array.prototype.join;
function print() { __p += __j.call(arguments, '') }
`
                  : `;
`) +
                F +
                `return __p
}`));
            var Q = Vf(function () {
              return ft(m, W + "return " + F).apply(t, y);
            });
            if (((Q.source = F), qa(Q))) throw Q;
            return Q;
          }
          function wA(e) {
            return dt(e).toLowerCase();
          }
          function DA(e) {
            return dt(e).toUpperCase();
          }
          function EA(e, n, s) {
            if (((e = dt(e)), e && (s || n === t))) return Yc(e);
            if (!e || !(n = he(n))) return e;
            var o = Le(e),
              f = Le(n),
              m = Zc(o, f),
              y = Qc(o, f) + 1;
            return gr(o, m, y).join("");
          }
          function CA(e, n, s) {
            if (((e = dt(e)), e && (s || n === t)))
              return e.slice(0, el(e) + 1);
            if (!e || !(n = he(n))) return e;
            var o = Le(e),
              f = Qc(o, Le(n)) + 1;
            return gr(o, 0, f).join("");
          }
          function xA(e, n, s) {
            if (((e = dt(e)), e && (s || n === t))) return e.replace(qs, "");
            if (!e || !(n = he(n))) return e;
            var o = Le(e),
              f = Zc(o, Le(n));
            return gr(o, f).join("");
          }
          function SA(e, n) {
            var s = lt,
              o = At;
            if (St(n)) {
              var f = "separator" in n ? n.separator : f;
              ((s = "length" in n ? Z(n.length) : s),
                (o = "omission" in n ? he(n.omission) : o));
            }
            e = dt(e);
            var m = e.length;
            if (Qr(e)) {
              var y = Le(e);
              m = y.length;
            }
            if (s >= m) return e;
            var A = s - tn(o);
            if (A < 1) return o;
            var E = y ? gr(y, 0, A).join("") : e.slice(0, A);
            if (f === t) return E + o;
            if ((y && (A += E.length - A), Ba(f))) {
              if (e.slice(A).search(f)) {
                var q,
                  B = E;
                for (
                  f.global || (f = js(f.source, dt(yc.exec(f)) + "g")),
                    f.lastIndex = 0;
                  (q = f.exec(B));
                )
                  var F = q.index;
                E = E.slice(0, F === t ? A : F);
              }
            } else if (e.indexOf(he(f), A) != A) {
              var N = E.lastIndexOf(f);
              N > -1 && (E = E.slice(0, N));
            }
            return E + o;
          }
          function TA(e) {
            return ((e = dt(e)), e && $2.test(e) ? e.replace(gc, im) : e);
          }
          var LA = an(function (e, n, s) {
              return e + (s ? " " : "") + n.toUpperCase();
            }),
            Oa = Gl("toUpperCase");
          function Gf(e, n, s) {
            return (
              (e = dt(e)),
              (n = s ? t : n),
              n === t ? (Q0(e) ? am(e) : V0(e)) : e.match(n) || []
            );
          }
          var Vf = rt(function (e, n) {
              try {
                return ce(e, t, n);
              } catch (s) {
                return qa(s) ? s : new X(s);
              }
            }),
            qA = Ze(function (e, n) {
              return (
                le(n, function (s) {
                  ((s = Be(s)), Pe(e, s, Ta(e[s], e)));
                }),
                e
              );
            });
          function BA(e) {
            var n = e == null ? 0 : e.length,
              s = J();
            return (
              (e = n
                ? xt(e, function (o) {
                    if (typeof o[1] != "function") throw new ve(a);
                    return [s(o[0]), o[1]];
                  })
                : []),
              rt(function (o) {
                for (var f = -1; ++f < n;) {
                  var m = e[f];
                  if (ce(m[0], this, o)) return ce(m[1], this, o);
                }
              })
            );
          }
          function FA(e) {
            return i_(Ae(e, _));
          }
          function Ma(e) {
            return function () {
              return e;
            };
          }
          function RA(e, n) {
            return e == null || e !== e ? n : e;
          }
          var IA = Wl(),
            OA = Wl(!0);
          function te(e) {
            return e;
          }
          function Na(e) {
            return bl(typeof e == "function" ? e : Ae(e, _));
          }
          function MA(e) {
            return Dl(Ae(e, _));
          }
          function NA(e, n) {
            return El(e, Ae(n, _));
          }
          var kA = rt(function (e, n) {
              return function (s) {
                return Vn(s, e, n);
              };
            }),
            UA = rt(function (e, n) {
              return function (s) {
                return Vn(e, s, n);
              };
            });
          function ka(e, n, s) {
            var o = kt(n),
              f = iu(n, o);
            s == null &&
              !(St(n) && (f.length || !o.length)) &&
              ((s = n), (n = e), (e = this), (f = iu(n, kt(n))));
            var m = !(St(s) && "chain" in s) || !!s.chain,
              y = tr(e);
            return (
              le(f, function (A) {
                var E = n[A];
                ((e[A] = E),
                  y &&
                    (e.prototype[A] = function () {
                      var q = this.__chain__;
                      if (m || q) {
                        var B = e(this.__wrapped__),
                          F = (B.__actions__ = Yt(this.__actions__));
                        return (
                          F.push({ func: E, args: arguments, thisArg: e }),
                          (B.__chain__ = q),
                          B
                        );
                      }
                      return E.apply(e, or([this.value()], arguments));
                    }));
              }),
              e
            );
          }
          function PA() {
            return (Nt._ === this && (Nt._ = pm), this);
          }
          function Ua() {}
          function $A(e) {
            return (
              (e = Z(e)),
              rt(function (n) {
                return Cl(n, e);
              })
            );
          }
          var HA = ga(xt),
            GA = ga(zc),
            VA = ga(Ps);
          function Wf(e) {
            return wa(e) ? $s(Be(e)) : b_(e);
          }
          function WA(e) {
            return function (n) {
              return e == null ? t : Tr(e, n);
            };
          }
          var zA = jl(),
            jA = jl(!0);
          function Pa() {
            return [];
          }
          function $a() {
            return !1;
          }
          function JA() {
            return {};
          }
          function KA() {
            return "";
          }
          function XA() {
            return !0;
          }
          function YA(e, n) {
            if (((e = Z(e)), e < 1 || e > Lt)) return [];
            var s = Ue,
              o = Ht(e, Ue);
            ((n = J(n)), (e -= Ue));
            for (var f = Vs(o, n); ++s < e;) n(s);
            return f;
          }
          function ZA(e) {
            return Y(e) ? xt(e, Be) : pe(e) ? [e] : Yt(lf(dt(e)));
          }
          function QA(e) {
            var n = ++fm;
            return dt(e) + n;
          }
          var tb = lu(function (e, n) {
              return e + n;
            }, 0),
            eb = ma("ceil"),
            rb = lu(function (e, n) {
              return e / n;
            }, 1),
            nb = ma("floor");
          function ib(e) {
            return e && e.length ? nu(e, te, ea) : t;
          }
          function ub(e, n) {
            return e && e.length ? nu(e, J(n, 2), ea) : t;
          }
          function sb(e) {
            return Kc(e, te);
          }
          function ab(e, n) {
            return Kc(e, J(n, 2));
          }
          function ob(e) {
            return e && e.length ? nu(e, te, ua) : t;
          }
          function cb(e, n) {
            return e && e.length ? nu(e, J(n, 2), ua) : t;
          }
          var lb = lu(function (e, n) {
              return e * n;
            }, 1),
            fb = ma("round"),
            hb = lu(function (e, n) {
              return e - n;
            }, 0);
          function pb(e) {
            return e && e.length ? Gs(e, te) : 0;
          }
          function db(e, n) {
            return e && e.length ? Gs(e, J(n, 2)) : 0;
          }
          return (
            (d.after = N1),
            (d.ary = bf),
            (d.assign = Ey),
            (d.assignIn = Of),
            (d.assignInWith = Mf),
            (d.assignWith = Fa),
            (d.at = Cy),
            (d.before = wf),
            (d.bind = Ta),
            (d.bindAll = qA),
            (d.bindKey = Df),
            (d.castArray = K1),
            (d.chain = vf),
            (d.chunk = iv),
            (d.compact = uv),
            (d.concat = sv),
            (d.cond = BA),
            (d.conforms = FA),
            (d.constant = Ma),
            (d.countBy = d1),
            (d.create = xy),
            (d.curry = Ef),
            (d.curryRight = Cf),
            (d.debounce = xf),
            (d.defaults = Sy),
            (d.defaultsDeep = Ty),
            (d.defer = k1),
            (d.delay = U1),
            (d.difference = av),
            (d.differenceBy = ov),
            (d.differenceWith = cv),
            (d.drop = lv),
            (d.dropRight = fv),
            (d.dropRightWhile = hv),
            (d.dropWhile = pv),
            (d.fill = dv),
            (d.filter = m1),
            (d.flatMap = y1),
            (d.flatMapDeep = A1),
            (d.flatMapDepth = b1),
            (d.flatten = df),
            (d.flattenDeep = gv),
            (d.flattenDepth = mv),
            (d.flip = P1),
            (d.flow = IA),
            (d.flowRight = OA),
            (d.fromPairs = _v),
            (d.functions = Oy),
            (d.functionsIn = My),
            (d.groupBy = w1),
            (d.initial = yv),
            (d.intersection = Av),
            (d.intersectionBy = bv),
            (d.intersectionWith = wv),
            (d.invert = ky),
            (d.invertBy = Uy),
            (d.invokeMap = E1),
            (d.iteratee = Na),
            (d.keyBy = C1),
            (d.keys = kt),
            (d.keysIn = Qt),
            (d.map = _u),
            (d.mapKeys = $y),
            (d.mapValues = Hy),
            (d.matches = MA),
            (d.matchesProperty = NA),
            (d.memoize = yu),
            (d.merge = Gy),
            (d.mergeWith = Nf),
            (d.method = kA),
            (d.methodOf = UA),
            (d.mixin = ka),
            (d.negate = Au),
            (d.nthArg = $A),
            (d.omit = Vy),
            (d.omitBy = Wy),
            (d.once = $1),
            (d.orderBy = x1),
            (d.over = HA),
            (d.overArgs = H1),
            (d.overEvery = GA),
            (d.overSome = VA),
            (d.partial = La),
            (d.partialRight = Sf),
            (d.partition = S1),
            (d.pick = zy),
            (d.pickBy = kf),
            (d.property = Wf),
            (d.propertyOf = WA),
            (d.pull = xv),
            (d.pullAll = mf),
            (d.pullAllBy = Sv),
            (d.pullAllWith = Tv),
            (d.pullAt = Lv),
            (d.range = zA),
            (d.rangeRight = jA),
            (d.rearg = G1),
            (d.reject = q1),
            (d.remove = qv),
            (d.rest = V1),
            (d.reverse = xa),
            (d.sampleSize = F1),
            (d.set = Jy),
            (d.setWith = Ky),
            (d.shuffle = R1),
            (d.slice = Bv),
            (d.sortBy = M1),
            (d.sortedUniq = kv),
            (d.sortedUniqBy = Uv),
            (d.split = vA),
            (d.spread = W1),
            (d.tail = Pv),
            (d.take = $v),
            (d.takeRight = Hv),
            (d.takeRightWhile = Gv),
            (d.takeWhile = Vv),
            (d.tap = u1),
            (d.throttle = z1),
            (d.thru = mu),
            (d.toArray = Ff),
            (d.toPairs = Uf),
            (d.toPairsIn = Pf),
            (d.toPath = ZA),
            (d.toPlainObject = If),
            (d.transform = Xy),
            (d.unary = j1),
            (d.union = Wv),
            (d.unionBy = zv),
            (d.unionWith = jv),
            (d.uniq = Jv),
            (d.uniqBy = Kv),
            (d.uniqWith = Xv),
            (d.unset = Yy),
            (d.unzip = Sa),
            (d.unzipWith = _f),
            (d.update = Zy),
            (d.updateWith = Qy),
            (d.values = ln),
            (d.valuesIn = tA),
            (d.without = Yv),
            (d.words = Gf),
            (d.wrap = J1),
            (d.xor = Zv),
            (d.xorBy = Qv),
            (d.xorWith = t1),
            (d.zip = e1),
            (d.zipObject = r1),
            (d.zipObjectDeep = n1),
            (d.zipWith = i1),
            (d.entries = Uf),
            (d.entriesIn = Pf),
            (d.extend = Of),
            (d.extendWith = Mf),
            ka(d, d),
            (d.add = tb),
            (d.attempt = Vf),
            (d.camelCase = iA),
            (d.capitalize = $f),
            (d.ceil = eb),
            (d.clamp = eA),
            (d.clone = X1),
            (d.cloneDeep = Z1),
            (d.cloneDeepWith = Q1),
            (d.cloneWith = Y1),
            (d.conformsTo = ty),
            (d.deburr = Hf),
            (d.defaultTo = RA),
            (d.divide = rb),
            (d.endsWith = uA),
            (d.eq = Fe),
            (d.escape = sA),
            (d.escapeRegExp = aA),
            (d.every = g1),
            (d.find = _1),
            (d.findIndex = hf),
            (d.findKey = Ly),
            (d.findLast = v1),
            (d.findLastIndex = pf),
            (d.findLastKey = qy),
            (d.floor = nb),
            (d.forEach = yf),
            (d.forEachRight = Af),
            (d.forIn = By),
            (d.forInRight = Fy),
            (d.forOwn = Ry),
            (d.forOwnRight = Iy),
            (d.get = Ra),
            (d.gt = ey),
            (d.gte = ry),
            (d.has = Ny),
            (d.hasIn = Ia),
            (d.head = gf),
            (d.identity = te),
            (d.includes = D1),
            (d.indexOf = vv),
            (d.inRange = rA),
            (d.invoke = Py),
            (d.isArguments = Br),
            (d.isArray = Y),
            (d.isArrayBuffer = ny),
            (d.isArrayLike = Zt),
            (d.isArrayLikeObject = qt),
            (d.isBoolean = iy),
            (d.isBuffer = mr),
            (d.isDate = uy),
            (d.isElement = sy),
            (d.isEmpty = ay),
            (d.isEqual = oy),
            (d.isEqualWith = cy),
            (d.isError = qa),
            (d.isFinite = ly),
            (d.isFunction = tr),
            (d.isInteger = Tf),
            (d.isLength = bu),
            (d.isMap = Lf),
            (d.isMatch = fy),
            (d.isMatchWith = hy),
            (d.isNaN = py),
            (d.isNative = dy),
            (d.isNil = my),
            (d.isNull = gy),
            (d.isNumber = qf),
            (d.isObject = St),
            (d.isObjectLike = Tt),
            (d.isPlainObject = Xn),
            (d.isRegExp = Ba),
            (d.isSafeInteger = _y),
            (d.isSet = Bf),
            (d.isString = wu),
            (d.isSymbol = pe),
            (d.isTypedArray = cn),
            (d.isUndefined = vy),
            (d.isWeakMap = yy),
            (d.isWeakSet = Ay),
            (d.join = Dv),
            (d.kebabCase = oA),
            (d.last = we),
            (d.lastIndexOf = Ev),
            (d.lowerCase = cA),
            (d.lowerFirst = lA),
            (d.lt = by),
            (d.lte = wy),
            (d.max = ib),
            (d.maxBy = ub),
            (d.mean = sb),
            (d.meanBy = ab),
            (d.min = ob),
            (d.minBy = cb),
            (d.stubArray = Pa),
            (d.stubFalse = $a),
            (d.stubObject = JA),
            (d.stubString = KA),
            (d.stubTrue = XA),
            (d.multiply = lb),
            (d.nth = Cv),
            (d.noConflict = PA),
            (d.noop = Ua),
            (d.now = vu),
            (d.pad = fA),
            (d.padEnd = hA),
            (d.padStart = pA),
            (d.parseInt = dA),
            (d.random = nA),
            (d.reduce = T1),
            (d.reduceRight = L1),
            (d.repeat = gA),
            (d.replace = mA),
            (d.result = jy),
            (d.round = fb),
            (d.runInContext = D),
            (d.sample = B1),
            (d.size = I1),
            (d.snakeCase = _A),
            (d.some = O1),
            (d.sortedIndex = Fv),
            (d.sortedIndexBy = Rv),
            (d.sortedIndexOf = Iv),
            (d.sortedLastIndex = Ov),
            (d.sortedLastIndexBy = Mv),
            (d.sortedLastIndexOf = Nv),
            (d.startCase = yA),
            (d.startsWith = AA),
            (d.subtract = hb),
            (d.sum = pb),
            (d.sumBy = db),
            (d.template = bA),
            (d.times = YA),
            (d.toFinite = er),
            (d.toInteger = Z),
            (d.toLength = Rf),
            (d.toLower = wA),
            (d.toNumber = De),
            (d.toSafeInteger = Dy),
            (d.toString = dt),
            (d.toUpper = DA),
            (d.trim = EA),
            (d.trimEnd = CA),
            (d.trimStart = xA),
            (d.truncate = SA),
            (d.unescape = TA),
            (d.uniqueId = QA),
            (d.upperCase = LA),
            (d.upperFirst = Oa),
            (d.each = yf),
            (d.eachRight = Af),
            (d.first = gf),
            ka(
              d,
              (function () {
                var e = {};
                return (
                  $e(d, function (n, s) {
                    pt.call(d.prototype, s) || (e[s] = n);
                  }),
                  e
                );
              })(),
              { chain: !1 },
            ),
            (d.VERSION = r),
            le(
              [
                "bind",
                "bindKey",
                "curry",
                "curryRight",
                "partial",
                "partialRight",
              ],
              function (e) {
                d[e].placeholder = d;
              },
            ),
            le(["drop", "take"], function (e, n) {
              ((at.prototype[e] = function (s) {
                s = s === t ? 1 : Ot(Z(s), 0);
                var o = this.__filtered__ && !n ? new at(this) : this.clone();
                return (
                  o.__filtered__
                    ? (o.__takeCount__ = Ht(s, o.__takeCount__))
                    : o.__views__.push({
                        size: Ht(s, Ue),
                        type: e + (o.__dir__ < 0 ? "Right" : ""),
                      }),
                  o
                );
              }),
                (at.prototype[e + "Right"] = function (s) {
                  return this.reverse()[e](s).reverse();
                }));
            }),
            le(["filter", "map", "takeWhile"], function (e, n) {
              var s = n + 1,
                o = s == ht || s == Dt;
              at.prototype[e] = function (f) {
                var m = this.clone();
                return (
                  m.__iteratees__.push({ iteratee: J(f, 3), type: s }),
                  (m.__filtered__ = m.__filtered__ || o),
                  m
                );
              };
            }),
            le(["head", "last"], function (e, n) {
              var s = "take" + (n ? "Right" : "");
              at.prototype[e] = function () {
                return this[s](1).value()[0];
              };
            }),
            le(["initial", "tail"], function (e, n) {
              var s = "drop" + (n ? "" : "Right");
              at.prototype[e] = function () {
                return this.__filtered__ ? new at(this) : this[s](1);
              };
            }),
            (at.prototype.compact = function () {
              return this.filter(te);
            }),
            (at.prototype.find = function (e) {
              return this.filter(e).head();
            }),
            (at.prototype.findLast = function (e) {
              return this.reverse().find(e);
            }),
            (at.prototype.invokeMap = rt(function (e, n) {
              return typeof e == "function"
                ? new at(this)
                : this.map(function (s) {
                    return Vn(s, e, n);
                  });
            })),
            (at.prototype.reject = function (e) {
              return this.filter(Au(J(e)));
            }),
            (at.prototype.slice = function (e, n) {
              e = Z(e);
              var s = this;
              return s.__filtered__ && (e > 0 || n < 0)
                ? new at(s)
                : (e < 0 ? (s = s.takeRight(-e)) : e && (s = s.drop(e)),
                  n !== t &&
                    ((n = Z(n)), (s = n < 0 ? s.dropRight(-n) : s.take(n - e))),
                  s);
            }),
            (at.prototype.takeRightWhile = function (e) {
              return this.reverse().takeWhile(e).reverse();
            }),
            (at.prototype.toArray = function () {
              return this.take(Ue);
            }),
            $e(at.prototype, function (e, n) {
              var s = /^(?:filter|find|map|reject)|While$/.test(n),
                o = /^(?:head|last)$/.test(n),
                f = d[o ? "take" + (n == "last" ? "Right" : "") : n],
                m = o || /^find/.test(n);
              f &&
                (d.prototype[n] = function () {
                  var y = this.__wrapped__,
                    A = o ? [1] : arguments,
                    E = y instanceof at,
                    q = A[0],
                    B = E || Y(y),
                    F = function (st) {
                      var ct = f.apply(d, or([st], A));
                      return o && N ? ct[0] : ct;
                    };
                  B &&
                    s &&
                    typeof q == "function" &&
                    q.length != 1 &&
                    (E = B = !1);
                  var N = this.__chain__,
                    W = !!this.__actions__.length,
                    K = m && !N,
                    Q = E && !W;
                  if (!m && B) {
                    y = Q ? y : new at(this);
                    var j = e.apply(y, A);
                    return (
                      j.__actions__.push({ func: mu, args: [F], thisArg: t }),
                      new ye(j, N)
                    );
                  }
                  return K && Q
                    ? e.apply(this, A)
                    : ((j = this.thru(F)),
                      K ? (o ? j.value()[0] : j.value()) : j);
                });
            }),
            le(
              ["pop", "push", "shift", "sort", "splice", "unshift"],
              function (e) {
                var n = Hi[e],
                  s = /^(?:push|sort|unshift)$/.test(e) ? "tap" : "thru",
                  o = /^(?:pop|shift)$/.test(e);
                d.prototype[e] = function () {
                  var f = arguments;
                  if (o && !this.__chain__) {
                    var m = this.value();
                    return n.apply(Y(m) ? m : [], f);
                  }
                  return this[s](function (y) {
                    return n.apply(Y(y) ? y : [], f);
                  });
                };
              },
            ),
            $e(at.prototype, function (e, n) {
              var s = d[n];
              if (s) {
                var o = s.name + "";
                (pt.call(nn, o) || (nn[o] = []),
                  nn[o].push({ name: n, func: s }));
              }
            }),
            (nn[cu(t, R).name] = [{ name: "wrapper", func: t }]),
            (at.prototype.clone = Lm),
            (at.prototype.reverse = qm),
            (at.prototype.value = Bm),
            (d.prototype.at = s1),
            (d.prototype.chain = a1),
            (d.prototype.commit = o1),
            (d.prototype.next = c1),
            (d.prototype.plant = f1),
            (d.prototype.reverse = h1),
            (d.prototype.toJSON = d.prototype.valueOf = d.prototype.value = p1),
            (d.prototype.first = d.prototype.head),
            Nn && (d.prototype[Nn] = l1),
            d
          );
        },
        lr = om();
      typeof define == "function" && typeof define.amd == "object" && define.amd
        ? ((Nt._ = lr),
          define(function () {
            return lr;
          }))
        : Dr
          ? (((Dr.exports = lr)._ = lr), (Ms._ = lr))
          : (Nt._ = lr);
    }).call(An);
  });
  var Bd = U((Kx, qd) => {
    var Io = si(),
      Ld = ts(),
      KD = Io.isTag;
    qd.exports = { getInnerHTML: XD, getOuterHTML: Ld, getText: Oo };
    function XD(t, r) {
      return t.children
        ? t.children
            .map(function (i) {
              return Ld(i, r);
            })
            .join("")
        : "";
    }
    function Oo(t) {
      return Array.isArray(t)
        ? t.map(Oo).join("")
        : KD(t) || t.type === Io.CDATA
          ? Oo(t.children)
          : t.type === Io.Text
            ? t.data
            : "";
    }
  });
  var Fd = U((Hr) => {
    var YD = (Hr.getChildren = function (t) {
        return t.children;
      }),
      ZD = (Hr.getParent = function (t) {
        return t.parent;
      });
    Hr.getSiblings = function (t) {
      var r = ZD(t);
      return r ? YD(r) : [t];
    };
    Hr.getAttributeValue = function (t, r) {
      return t.attribs && t.attribs[r];
    };
    Hr.hasAttrib = function (t, r) {
      return !!t.attribs && hasOwnProperty.call(t.attribs, r);
    };
    Hr.getName = function (t) {
      return t.name;
    };
  });
  var Rd = U((bn) => {
    bn.removeElement = function (t) {
      if (
        (t.prev && (t.prev.next = t.next),
        t.next && (t.next.prev = t.prev),
        t.parent)
      ) {
        var r = t.parent.children;
        r.splice(r.lastIndexOf(t), 1);
      }
    };
    bn.replaceElement = function (t, r) {
      var i = (r.prev = t.prev);
      i && (i.next = r);
      var u = (r.next = t.next);
      u && (u.prev = r);
      var a = (r.parent = t.parent);
      if (a) {
        var c = a.children;
        c[c.lastIndexOf(t)] = r;
      }
    };
    bn.appendChild = function (t, r) {
      if (((r.parent = t), t.children.push(r) !== 1)) {
        var i = t.children[t.children.length - 2];
        ((i.next = r), (r.prev = i), (r.next = null));
      }
    };
    bn.append = function (t, r) {
      var i = t.parent,
        u = t.next;
      if (((r.next = u), (r.prev = t), (t.next = r), (r.parent = i), u)) {
        if (((u.prev = r), i)) {
          var a = i.children;
          a.splice(a.lastIndexOf(u), 0, r);
        }
      } else i && i.children.push(r);
    };
    bn.prepend = function (t, r) {
      var i = t.parent;
      if (i) {
        var u = i.children;
        u.splice(u.lastIndexOf(t), 0, r);
      }
      (t.prev && (t.prev.next = r),
        (r.parent = i),
        (r.prev = t.prev),
        (r.next = t),
        (t.prev = r));
    };
  });
  var kd = U((Zx, Nd) => {
    var Mo = si().isTag;
    Nd.exports = {
      filter: QD,
      find: No,
      findOneChild: tE,
      findOne: Id,
      existsOne: Od,
      findAll: Md,
    };
    function QD(t, r, i, u) {
      return (
        Array.isArray(r) || (r = [r]),
        (typeof u != "number" || !isFinite(u)) && (u = 1 / 0),
        No(t, r, i !== !1, u)
      );
    }
    function No(t, r, i, u) {
      for (
        var a = [], c, l = 0, p = r.length;
        l < p &&
        !(
          (t(r[l]) && (a.push(r[l]), --u <= 0)) ||
          ((c = r[l].children),
          i &&
            c &&
            c.length > 0 &&
            ((c = No(t, c, i, u)), (a = a.concat(c)), (u -= c.length), u <= 0))
        );
        l++
      );
      return a;
    }
    function tE(t, r) {
      for (var i = 0, u = r.length; i < u; i++) if (t(r[i])) return r[i];
      return null;
    }
    function Id(t, r) {
      for (var i = null, u = 0, a = r.length; u < a && !i; u++)
        if (Mo(r[u]))
          t(r[u])
            ? (i = r[u])
            : r[u].children.length > 0 && (i = Id(t, r[u].children));
        else continue;
      return i;
    }
    function Od(t, r) {
      for (var i = 0, u = r.length; i < u; i++)
        if (
          Mo(r[i]) &&
          (t(r[i]) || (r[i].children.length > 0 && Od(t, r[i].children)))
        )
          return !0;
      return !1;
    }
    function Md(t, r) {
      for (var i = [], u = 0, a = r.length; u < a; u++)
        Mo(r[u]) &&
          (t(r[u]) && i.push(r[u]),
          r[u].children.length > 0 && (i = i.concat(Md(t, r[u].children))));
      return i;
    }
  });
  var Pd = U((Vr) => {
    var eE = si(),
      Gr = (Vr.isTag = eE.isTag);
    Vr.testElement = function (t, r) {
      for (var i in t)
        if (t.hasOwnProperty(i)) {
          if (i === "tag_name") {
            if (!Gr(r) || !t.tag_name(r.name)) return !1;
          } else if (i === "tag_type") {
            if (!t.tag_type(r.type)) return !1;
          } else if (i === "tag_contains") {
            if (Gr(r) || !t.tag_contains(r.data)) return !1;
          } else if (!r.attribs || !t[i](r.attribs[i])) return !1;
        }
      return !0;
    };
    var es = {
      tag_name: function (t) {
        return typeof t == "function"
          ? function (r) {
              return Gr(r) && t(r.name);
            }
          : t === "*"
            ? Gr
            : function (r) {
                return Gr(r) && r.name === t;
              };
      },
      tag_type: function (t) {
        return typeof t == "function"
          ? function (r) {
              return t(r.type);
            }
          : function (r) {
              return r.type === t;
            };
      },
      tag_contains: function (t) {
        return typeof t == "function"
          ? function (r) {
              return !Gr(r) && t(r.data);
            }
          : function (r) {
              return !Gr(r) && r.data === t;
            };
      },
    };
    function Ud(t, r) {
      return typeof r == "function"
        ? function (i) {
            return i.attribs && r(i.attribs[t]);
          }
        : function (i) {
            return i.attribs && i.attribs[t] === r;
          };
    }
    function rE(t, r) {
      return function (i) {
        return t(i) || r(i);
      };
    }
    Vr.getElements = function (t, r, i, u) {
      var a = Object.keys(t).map(function (c) {
        var l = t[c];
        return c in es ? es[c](l) : Ud(c, l);
      });
      return a.length === 0 ? [] : this.filter(a.reduce(rE), r, i, u);
    };
    Vr.getElementById = function (t, r, i) {
      return (
        Array.isArray(r) || (r = [r]),
        this.findOne(Ud("id", t), r, i !== !1)
      );
    };
    Vr.getElementsByTagName = function (t, r, i, u) {
      return this.filter(es.tag_name(t), r, i, u);
    };
    Vr.getElementsByTagType = function (t, r, i, u) {
      return this.filter(es.tag_type(t), r, i, u);
    };
  });
  var $d = U((rs) => {
    rs.removeSubsets = function (t) {
      for (var r = t.length, i, u, a; --r > -1;) {
        for (i = u = t[r], t[r] = null, a = !0; u;) {
          if (t.indexOf(u) > -1) {
            ((a = !1), t.splice(r, 1));
            break;
          }
          u = u.parent;
        }
        a && (t[r] = i);
      }
      return t;
    };
    var ur = {
        DISCONNECTED: 1,
        PRECEDING: 2,
        FOLLOWING: 4,
        CONTAINS: 8,
        CONTAINED_BY: 16,
      },
      nE = (rs.compareDocumentPosition = function (t, r) {
        var i = [],
          u = [],
          a,
          c,
          l,
          p,
          h,
          g;
        if (t === r) return 0;
        for (a = t; a;) (i.unshift(a), (a = a.parent));
        for (a = r; a;) (u.unshift(a), (a = a.parent));
        for (g = 0; i[g] === u[g];) g++;
        return g === 0
          ? ur.DISCONNECTED
          : ((c = i[g - 1]),
            (l = c.children),
            (p = i[g]),
            (h = u[g]),
            l.indexOf(p) > l.indexOf(h)
              ? c === r
                ? ur.FOLLOWING | ur.CONTAINED_BY
                : ur.FOLLOWING
              : c === t
                ? ur.PRECEDING | ur.CONTAINS
                : ur.PRECEDING);
      });
    rs.uniqueSort = function (t) {
      var r = t.length,
        i,
        u;
      for (t = t.slice(); --r > -1;)
        ((i = t[r]), (u = t.indexOf(i)), u > -1 && u < r && t.splice(r, 1));
      return (
        t.sort(function (a, c) {
          var l = nE(a, c);
          return l & ur.PRECEDING ? -1 : l & ur.FOLLOWING ? 1 : 0;
        }),
        t
      );
    };
  });
  var wn = U((eS, Gd) => {
    var Hd = Gd.exports;
    [Bd(), Fd(), Rd(), kd(), Pd(), $d()].forEach(function (t) {
      Object.keys(t).forEach(function (r) {
        Hd[r] = t[r].bind(Hd);
      });
    });
  });
  var Wd = U((rS, Vd) => {
    Vd.exports = uE;
    var iE = /^([+\-]?\d*n)?\s*(?:([+\-]?)\s*(\d+))?$/;
    function uE(t) {
      if (((t = t.trim().toLowerCase()), t === "even")) return [2, 0];
      if (t === "odd") return [2, 1];
      var r = t.match(iE);
      if (!r)
        throw new SyntaxError("n-th rule couldn't be parsed ('" + t + "')");
      var i;
      return (
        r[1]
          ? ((i = parseInt(r[1], 10)),
            isNaN(i) && (r[1].charAt(0) === "-" ? (i = -1) : (i = 1)))
          : (i = 0),
        [i, r[3] ? parseInt((r[2] || "") + r[3], 10) : 0]
      );
    }
  });
  var Dn = U((nS, zd) => {
    zd.exports = {
      trueFunc: function () {
        return !0;
      },
      falseFunc: function () {
        return !1;
      },
    };
  });
  var Kd = U((iS, Jd) => {
    Jd.exports = oE;
    var jd = Dn(),
      sE = jd.trueFunc,
      aE = jd.falseFunc;
    function oE(t) {
      var r = t[0],
        i = t[1] - 1;
      if (i < 0 && r <= 0) return aE;
      if (r === -1)
        return function (a) {
          return a <= i;
        };
      if (r === 0)
        return function (a) {
          return a === i;
        };
      if (r === 1)
        return i < 0
          ? sE
          : function (a) {
              return a >= i;
            };
      var u = i % r;
      return (
        u < 0 && (u += r),
        r > 1
          ? function (a) {
              return a >= i && a % r === u;
            }
          : ((r *= -1),
            function (a) {
              return a <= i && a % r === u;
            })
      );
    }
  });
  var Zd = U((uS, ns) => {
    var Xd = Wd(),
      Yd = Kd();
    ns.exports = function (r) {
      return Yd(Xd(r));
    };
    ns.exports.parse = Xd;
    ns.exports.compile = Yd;
  });
  var ko = U((sS, rg) => {
    var eg = wn(),
      cE = eg.hasAttrib,
      se = eg.getAttributeValue,
      is = Dn().falseFunc,
      Qd = /[-[\]{}()*+?.,\\^$|#\s]/g,
      tg = {
        __proto__: null,
        equals: function (t, r) {
          var i = r.name,
            u = r.value;
          return r.ignoreCase
            ? ((u = u.toLowerCase()),
              function (c) {
                var l = se(c, i);
                return l != null && l.toLowerCase() === u && t(c);
              })
            : function (c) {
                return se(c, i) === u && t(c);
              };
        },
        hyphen: function (t, r) {
          var i = r.name,
            u = r.value,
            a = u.length;
          return r.ignoreCase
            ? ((u = u.toLowerCase()),
              function (l) {
                var p = se(l, i);
                return (
                  p != null &&
                  (p.length === a || p.charAt(a) === "-") &&
                  p.substr(0, a).toLowerCase() === u &&
                  t(l)
                );
              })
            : function (l) {
                var p = se(l, i);
                return (
                  p != null &&
                  p.substr(0, a) === u &&
                  (p.length === a || p.charAt(a) === "-") &&
                  t(l)
                );
              };
        },
        element: function (t, r) {
          var i = r.name,
            u = r.value;
          if (/\s/.test(u)) return is;
          u = u.replace(Qd, "\\$&");
          var a = "(?:^|\\s)" + u + "(?:$|\\s)",
            c = r.ignoreCase ? "i" : "",
            l = new RegExp(a, c);
          return function (h) {
            var g = se(h, i);
            return g != null && l.test(g) && t(h);
          };
        },
        exists: function (t, r) {
          var i = r.name;
          return function (a) {
            return cE(a, i) && t(a);
          };
        },
        start: function (t, r) {
          var i = r.name,
            u = r.value,
            a = u.length;
          return a === 0
            ? is
            : r.ignoreCase
              ? ((u = u.toLowerCase()),
                function (l) {
                  var p = se(l, i);
                  return (
                    p != null && p.substr(0, a).toLowerCase() === u && t(l)
                  );
                })
              : function (l) {
                  var p = se(l, i);
                  return p != null && p.substr(0, a) === u && t(l);
                };
        },
        end: function (t, r) {
          var i = r.name,
            u = r.value,
            a = -u.length;
          return a === 0
            ? is
            : r.ignoreCase
              ? ((u = u.toLowerCase()),
                function (l) {
                  var p = se(l, i);
                  return p != null && p.substr(a).toLowerCase() === u && t(l);
                })
              : function (l) {
                  var p = se(l, i);
                  return p != null && p.substr(a) === u && t(l);
                };
        },
        any: function (t, r) {
          var i = r.name,
            u = r.value;
          if (u === "") return is;
          if (r.ignoreCase) {
            var a = new RegExp(u.replace(Qd, "\\$&"), "i");
            return function (l) {
              var p = se(l, i);
              return p != null && a.test(p) && t(l);
            };
          }
          return function (l) {
            var p = se(l, i);
            return p != null && p.indexOf(u) >= 0 && t(l);
          };
        },
        not: function (t, r) {
          var i = r.name,
            u = r.value;
          return u === ""
            ? function (c) {
                return !!se(c, i) && t(c);
              }
            : r.ignoreCase
              ? ((u = u.toLowerCase()),
                function (c) {
                  var l = se(c, i);
                  return l != null && l.toLowerCase() !== u && t(c);
                })
              : function (c) {
                  return se(c, i) !== u && t(c);
                };
        },
      };
    rg.exports = {
      compile: function (t, r, i) {
        if (i && i.strict && (r.ignoreCase || r.action === "not"))
          throw SyntaxError("Unsupported attribute selector");
        return tg[r.action](t, r);
      },
      rules: tg,
    };
  });
  var as = U((aS, og) => {
    var Ar = wn(),
      xe = Ar.isTag,
      ng = Ar.getText,
      Uo = Ar.getParent,
      ig = Ar.getChildren,
      Ve = Ar.getSiblings,
      sr = Ar.hasAttrib,
      Vt = Ar.getName,
      ug = Ar.getAttributeValue,
      us = Zd(),
      lE = ko().rules.equals,
      ag = Dn(),
      ci = ag.trueFunc,
      li = ag.falseFunc;
    function fE(t) {
      for (var r = 0; t && r < t.length; r++) if (xe(t[r])) return t[r];
    }
    function Wr(t, r) {
      var i = { name: t, value: r };
      return function (a) {
        return lE(a, i);
      };
    }
    function ss(t) {
      return function (r) {
        return !!Uo(r) && t(r);
      };
    }
    var fi = {
        contains: function (t, r) {
          return function (u) {
            return t(u) && ng(u).indexOf(r) >= 0;
          };
        },
        icontains: function (t, r) {
          var i = r.toLowerCase();
          return function (a) {
            return t(a) && ng(a).toLowerCase().indexOf(i) >= 0;
          };
        },
        "nth-child": function (t, r) {
          var i = us(r);
          return i === li
            ? i
            : i === ci
              ? ss(t)
              : function (a) {
                  for (var c = Ve(a), l = 0, p = 0; l < c.length; l++)
                    if (xe(c[l])) {
                      if (c[l] === a) break;
                      p++;
                    }
                  return i(p) && t(a);
                };
        },
        "nth-last-child": function (t, r) {
          var i = us(r);
          return i === li
            ? i
            : i === ci
              ? ss(t)
              : function (a) {
                  for (var c = Ve(a), l = 0, p = c.length - 1; p >= 0; p--)
                    if (xe(c[p])) {
                      if (c[p] === a) break;
                      l++;
                    }
                  return i(l) && t(a);
                };
        },
        "nth-of-type": function (t, r) {
          var i = us(r);
          return i === li
            ? i
            : i === ci
              ? ss(t)
              : function (a) {
                  for (var c = Ve(a), l = 0, p = 0; p < c.length; p++)
                    if (xe(c[p])) {
                      if (c[p] === a) break;
                      Vt(c[p]) === Vt(a) && l++;
                    }
                  return i(l) && t(a);
                };
        },
        "nth-last-of-type": function (t, r) {
          var i = us(r);
          return i === li
            ? i
            : i === ci
              ? ss(t)
              : function (a) {
                  for (var c = Ve(a), l = 0, p = c.length - 1; p >= 0; p--)
                    if (xe(c[p])) {
                      if (c[p] === a) break;
                      Vt(c[p]) === Vt(a) && l++;
                    }
                  return i(l) && t(a);
                };
        },
        root: function (t) {
          return function (r) {
            return !Uo(r) && t(r);
          };
        },
        scope: function (t, r, i, u) {
          return !u || u.length === 0
            ? fi.root(t)
            : u.length === 1
              ? function (a) {
                  return u[0] === a && t(a);
                }
              : function (a) {
                  return u.indexOf(a) >= 0 && t(a);
                };
        },
        checkbox: Wr("type", "checkbox"),
        file: Wr("type", "file"),
        password: Wr("type", "password"),
        radio: Wr("type", "radio"),
        reset: Wr("type", "reset"),
        image: Wr("type", "image"),
        submit: Wr("type", "submit"),
      },
      hi = {
        empty: function (t) {
          return !ig(t).some(function (r) {
            return xe(r) || r.type === "text";
          });
        },
        "first-child": function (t) {
          return fE(Ve(t)) === t;
        },
        "last-child": function (t) {
          for (var r = Ve(t), i = r.length - 1; i >= 0; i--) {
            if (r[i] === t) return !0;
            if (xe(r[i])) break;
          }
          return !1;
        },
        "first-of-type": function (t) {
          for (var r = Ve(t), i = 0; i < r.length; i++)
            if (xe(r[i])) {
              if (r[i] === t) return !0;
              if (Vt(r[i]) === Vt(t)) break;
            }
          return !1;
        },
        "last-of-type": function (t) {
          for (var r = Ve(t), i = r.length - 1; i >= 0; i--)
            if (xe(r[i])) {
              if (r[i] === t) return !0;
              if (Vt(r[i]) === Vt(t)) break;
            }
          return !1;
        },
        "only-of-type": function (t) {
          for (var r = Ve(t), i = 0, u = r.length; i < u; i++)
            if (xe(r[i])) {
              if (r[i] === t) continue;
              if (Vt(r[i]) === Vt(t)) return !1;
            }
          return !0;
        },
        "only-child": function (t) {
          for (var r = Ve(t), i = 0; i < r.length; i++)
            if (xe(r[i]) && r[i] !== t) return !1;
          return !0;
        },
        link: function (t) {
          return sr(t, "href");
        },
        visited: li,
        selected: function (t) {
          if (sr(t, "selected")) return !0;
          if (Vt(t) !== "option") return !1;
          var r = Uo(t);
          if (!r || Vt(r) !== "select" || sr(r, "multiple")) return !1;
          for (var i = ig(r), u = !1, a = 0; a < i.length; a++)
            if (xe(i[a]))
              if (i[a] === t) u = !0;
              else if (u) {
                if (sr(i[a], "selected")) return !1;
              } else return !1;
          return u;
        },
        disabled: function (t) {
          return sr(t, "disabled");
        },
        enabled: function (t) {
          return !sr(t, "disabled");
        },
        checked: function (t) {
          return sr(t, "checked") || hi.selected(t);
        },
        required: function (t) {
          return sr(t, "required");
        },
        optional: function (t) {
          return !sr(t, "required");
        },
        parent: function (t) {
          return !hi.empty(t);
        },
        header: function (t) {
          var r = Vt(t);
          return (
            r === "h1" ||
            r === "h2" ||
            r === "h3" ||
            r === "h4" ||
            r === "h5" ||
            r === "h6"
          );
        },
        button: function (t) {
          var r = Vt(t);
          return (
            r === "button" || (r === "input" && ug(t, "type") === "button")
          );
        },
        input: function (t) {
          var r = Vt(t);
          return (
            r === "input" ||
            r === "textarea" ||
            r === "select" ||
            r === "button"
          );
        },
        text: function (t) {
          var r;
          return (
            Vt(t) === "input" &&
            (!(r = ug(t, "type")) || r.toLowerCase() === "text")
          );
        },
      };
    function sg(t, r, i) {
      if (i === null) {
        if (t.length > 1 && r !== "scope")
          throw new SyntaxError(
            "pseudo-selector :" + r + " requires an argument",
          );
      } else if (t.length === 1)
        throw new SyntaxError(
          "pseudo-selector :" + r + " doesn't have any arguments",
        );
    }
    var hE =
      /^(?:(?:nth|last|first|only)-(?:child|of-type)|root|empty|(?:en|dis)abled|checked|not)$/;
    og.exports = {
      compile: function (t, r, i, u) {
        var a = r.name,
          c = r.data;
        if (i && i.strict && !hE.test(a))
          throw SyntaxError(":" + a + " isn't part of CSS3");
        if (typeof fi[a] == "function")
          return (sg(fi[a], a, c), fi[a](t, c, i, u));
        if (typeof hi[a] == "function") {
          var l = hi[a];
          return (
            sg(l, a, c),
            t === ci
              ? l
              : function (h) {
                  return l(h, c) && t(h);
                }
          );
        } else throw new SyntaxError("unmatched pseudo-class :" + a);
      },
      filters: fi,
      pseudos: hi,
    };
  });
  var mg = U((oS, gg) => {
    "use strict";
    gg.exports = yE;
    var cg = /^(?:\\.|[\w\-\u00b0-\uFFFF])+/,
      pE = /\\([\da-f]{1,6}\s?|(\s)|.)/gi,
      dE =
        /^\s*((?:\\.|[\w\u00b0-\uFFFF\-])+)\s*(?:(\S?)=\s*(?:(['"])([^]*?)\3|(#?(?:\\.|[\w\u00b0-\uFFFF\-])*)|)|)\s*(i)?\]/,
      gE = {
        __proto__: null,
        undefined: "exists",
        "": "equals",
        "~": "element",
        "^": "start",
        $: "end",
        "*": "any",
        "!": "not",
        "|": "hyphen",
      },
      lg = {
        __proto__: null,
        ">": "child",
        "<": "parent",
        "~": "sibling",
        "+": "adjacent",
      },
      Po = {
        __proto__: null,
        "#": ["id", "equals"],
        ".": ["class", "element"],
      },
      mE = { __proto__: null, has: !0, not: !0, matches: !0 },
      _E = { __proto__: null, contains: !0, icontains: !0 },
      fg = { __proto__: null, '"': !0, "'": !0 };
    function vE(t, r, i) {
      var u = "0x" + r - 65536;
      return u !== u || i
        ? r
        : u < 0
          ? String.fromCharCode(u + 65536)
          : String.fromCharCode((u >> 10) | 55296, (u & 1023) | 56320);
    }
    function os(t) {
      return t.replace(pE, vE);
    }
    function hg(t) {
      return (
        t === " " ||
        t ===
          `
` ||
        t === "	" ||
        t === "\f" ||
        t === "\r"
      );
    }
    function yE(t, r) {
      var i = [];
      if (((t = dg(i, t + "", r)), t !== ""))
        throw new SyntaxError("Unmatched selector: " + t);
      return i;
    }
    function dg(t, r, i) {
      var u = [],
        a = !1,
        c,
        l,
        p,
        h;
      function g() {
        var C = r.match(cg)[0];
        return ((r = r.substr(C.length)), os(C));
      }
      function _(C) {
        for (; hg(r.charAt(C));) C++;
        r = r.substr(C);
      }
      function v(C) {
        for (var R = 0; r.charAt(--C) === "\\";) R++;
        return (R & 1) === 1;
      }
      for (_(0); r !== "";)
        if (((l = r.charAt(0)), hg(l))) ((a = !0), _(1));
        else if (l in lg) (u.push({ type: lg[l] }), (a = !1), _(1));
        else if (l === ",") {
          if (u.length === 0) throw new SyntaxError("empty sub-selector");
          (t.push(u), (u = []), (a = !1), _(1));
        } else if (
          (a && (u.length > 0 && u.push({ type: "descendant" }), (a = !1)),
          l === "*")
        )
          ((r = r.substr(1)), u.push({ type: "universal" }));
        else if (l in Po)
          ((r = r.substr(1)),
            u.push({
              type: "attribute",
              name: Po[l][0],
              action: Po[l][1],
              value: g(),
              ignoreCase: !1,
            }));
        else if (l === "[") {
          if (((r = r.substr(1)), (c = r.match(dE)), !c))
            throw new SyntaxError("Malformed attribute selector: " + r);
          ((r = r.substr(c[0].length)),
            (p = os(c[1])),
            (!i ||
              ("lowerCaseAttributeNames" in i
                ? i.lowerCaseAttributeNames
                : !i.xmlMode)) &&
              (p = p.toLowerCase()),
            u.push({
              type: "attribute",
              name: p,
              action: gE[c[2]],
              value: os(c[4] || c[5] || ""),
              ignoreCase: !!c[6],
            }));
        } else if (l === ":") {
          if (r.charAt(1) === ":") {
            ((r = r.substr(2)),
              u.push({ type: "pseudo-element", name: g().toLowerCase() }));
            continue;
          }
          if (
            ((r = r.substr(1)),
            (p = g().toLowerCase()),
            (c = null),
            r.charAt(0) === "(")
          )
            if (p in mE) {
              h = r.charAt(1);
              var b = h in fg;
              if (((r = r.substr(b + 1)), (c = []), (r = dg(c, r, i)), b)) {
                if (r.charAt(0) !== h)
                  throw new SyntaxError("unmatched quotes in :" + p);
                r = r.substr(1);
              }
              if (r.charAt(0) !== ")")
                throw new SyntaxError(
                  "missing closing parenthesis in :" + p + " " + r,
                );
              r = r.substr(1);
            } else {
              for (var w = 1, x = 1; x > 0 && w < r.length; w++)
                r.charAt(w) === "(" && !v(w)
                  ? x++
                  : r.charAt(w) === ")" && !v(w) && x--;
              if (x) throw new SyntaxError("parenthesis not matched");
              ((c = r.substr(1, w - 2)),
                (r = r.substr(w)),
                p in _E &&
                  ((h = c.charAt(0)),
                  h === c.slice(-1) && h in fg && (c = c.slice(1, -1)),
                  (c = os(c))));
            }
          u.push({ type: "pseudo", name: p, data: c });
        } else if (cg.test(r))
          ((p = g()),
            (!i || ("lowerCaseTags" in i ? i.lowerCaseTags : !i.xmlMode)) &&
              (p = p.toLowerCase()),
            u.push({ type: "tag", name: p }));
        else
          return (
            u.length && u[u.length - 1].type === "descendant" && u.pop(),
            pg(t, u),
            r
          );
      return (pg(t, u), r);
    }
    function pg(t, r) {
      if (t.length > 0 && r.length === 0)
        throw new SyntaxError("empty sub-selector");
      t.push(r);
    }
  });
  var Ag = U((cS, yg) => {
    var pi = wn(),
      $o = pi.isTag,
      _g = pi.getParent,
      AE = pi.getChildren,
      vg = pi.getSiblings,
      bE = pi.getName;
    yg.exports = {
      __proto__: null,
      attribute: ko().compile,
      pseudo: as().compile,
      tag: function (t, r) {
        var i = r.name;
        return function (a) {
          return bE(a) === i && t(a);
        };
      },
      descendant: function (t, r, i, u, a) {
        return function (l) {
          if (a && t(l)) return !0;
          for (var p = !1; !p && (l = _g(l));) p = t(l);
          return p;
        };
      },
      parent: function (t, r, i) {
        if (i && i.strict)
          throw SyntaxError("Parent selector isn't part of CSS3");
        return function (c) {
          return AE(c).some(u);
        };
        function u(a) {
          return $o(a) && t(a);
        }
      },
      child: function (t) {
        return function (i) {
          var u = _g(i);
          return !!u && t(u);
        };
      },
      sibling: function (t) {
        return function (i) {
          for (var u = vg(i), a = 0; a < u.length; a++)
            if ($o(u[a])) {
              if (u[a] === i) break;
              if (t(u[a])) return !0;
            }
          return !1;
        };
      },
      adjacent: function (t) {
        return function (i) {
          for (var u = vg(i), a, c = 0; c < u.length; c++)
            if ($o(u[c])) {
              if (u[c] === i) break;
              a = u[c];
            }
          return !!a && t(a);
        };
      },
      universal: function (t) {
        return t;
      },
    };
  });
  var Ho = U((lS, wE) => {
    wE.exports = {
      universal: 50,
      tag: 30,
      attribute: 1,
      pseudo: 0,
      descendant: -1,
      child: -1,
      parent: -1,
      sibling: -1,
      adjacent: -1,
    };
  });
  var Eg = U((fS, Dg) => {
    Dg.exports = DE;
    var Go = Ho(),
      bg = {
        __proto__: null,
        exists: 10,
        equals: 8,
        not: 7,
        start: 6,
        end: 6,
        any: 5,
        hyphen: 4,
        element: 4,
      };
    function DE(t) {
      for (var r = t.map(wg), i = 1; i < t.length; i++) {
        var u = r[i];
        if (!(u < 0))
          for (var a = i - 1; a >= 0 && u < r[a]; a--) {
            var c = t[a + 1];
            ((t[a + 1] = t[a]), (t[a] = c), (r[a + 1] = r[a]), (r[a] = u));
          }
      }
    }
    function wg(t) {
      var r = Go[t.type];
      if (r === Go.attribute)
        ((r = bg[t.action]),
          r === bg.equals && t.name === "id" && (r = 9),
          t.ignoreCase && (r >>= 1));
      else if (r === Go.pseudo)
        if (!t.data) r = 3;
        else if (t.name === "has" || t.name === "contains") r = 0;
        else if (t.name === "matches" || t.name === "not") {
          r = 0;
          for (var i = 0; i < t.data.length; i++)
            if (t.data[i].length === 1) {
              var u = wg(t.data[i][0]);
              if (u === 0) {
                r = 0;
                break;
              }
              u > r && (r = u);
            }
          t.data.length > 1 && r > 0 && (r -= 1);
        } else r = 1;
      return r;
    }
  });
  var Rg = U((hS, cs) => {
    cs.exports = TE;
    cs.exports.compileUnsafe = Tg;
    cs.exports.compileToken = mi;
    var EE = mg(),
      gi = wn(),
      zo = gi.isTag,
      CE = Ag(),
      xE = Eg(),
      xg = Dn(),
      di = xg.trueFunc,
      br = xg.falseFunc,
      SE = Ho();
    function TE(t, r, i) {
      var u = Tg(t, r, i);
      return Sg(u);
    }
    function Sg(t) {
      return function (i) {
        return zo(i) && t(i);
      };
    }
    function Tg(t, r, i) {
      var u = EE(t, r);
      return mi(u, r, i);
    }
    function Lg(t) {
      return (
        t.type === "pseudo" &&
        (t.name === "scope" ||
          (Array.isArray(t.data) &&
            t.data.some(function (r) {
              return r.some(Lg);
            })))
      );
    }
    var LE = { type: "descendant" },
      qE = { type: "pseudo", name: "scope" },
      qg = {},
      BE = gi.getParent;
    function FE(t, r) {
      var i =
        !!r &&
        !!r.length &&
        r.every(function (u) {
          return u === qg || !!BE(u);
        });
      t.forEach(function (u) {
        if (!(u.length > 0 && Bg(u[0]) && u[0].type !== "descendant"))
          if (i && !Lg(u)) u.unshift(LE);
          else return;
        u.unshift(qE);
      });
    }
    function mi(t, r, i) {
      ((t = t.filter(function (a) {
        return a.length > 0;
      })),
        t.forEach(xE));
      var u = Array.isArray(i);
      return (
        (i = (r && r.context) || i),
        i && !u && (i = [i]),
        FE(t, i),
        t
          .map(function (a) {
            return RE(a, r, i, u);
          })
          .reduce(IE, br)
      );
    }
    function Bg(t) {
      return SE[t.type] < 0;
    }
    function RE(t, r, i, u) {
      var a = u && t[0].name === "scope" && t[1].type === "descendant";
      return t.reduce(
        function (c, l, p) {
          return c === br ? c : CE[l.type](c, l, r, i, a && p === 1);
        },
        (r && r.rootFunc) || di,
      );
    }
    function IE(t, r) {
      return r === br || t === di
        ? t
        : t === br || r === di
          ? r
          : function (u) {
              return t(u) || r(u);
            };
    }
    var OE = as(),
      Wo = OE.filters,
      Cg = gi.existsOne,
      zo = gi.isTag,
      Vo = gi.getChildren;
    function Fg(t) {
      return t.some(Bg);
    }
    Wo.not = function (t, r, i, u) {
      var a = { xmlMode: !!(i && i.xmlMode), strict: !!(i && i.strict) };
      if (a.strict && (r.length > 1 || r.some(Fg)))
        throw new SyntaxError(
          "complex selectors in :not aren't allowed in strict mode",
        );
      var c = mi(r, a, u);
      return c === br
        ? t
        : c === di
          ? br
          : function (l) {
              return !c(l) && t(l);
            };
    };
    Wo.has = function (t, r, i) {
      var u = { xmlMode: !!(i && i.xmlMode), strict: !!(i && i.strict) },
        a = r.some(Fg) ? [qg] : null,
        c = mi(r, u, a);
      return c === br
        ? br
        : c === di
          ? function (l) {
              return Vo(l).some(zo) && t(l);
            }
          : ((c = Sg(c)),
            a
              ? function (p) {
                  return t(p) && ((a[0] = p), Cg(c, Vo(p)));
                }
              : function (p) {
                  return t(p) && Cg(c, Vo(p));
                });
    };
    Wo.matches = function (t, r, i, u) {
      var a = {
        xmlMode: !!(i && i.xmlMode),
        strict: !!(i && i.strict),
        rootFunc: t,
      };
      return mi(r, a, u);
    };
  });
  var Jo = U((pS, kg) => {
    "use strict";
    kg.exports = Oe;
    var Ig = as(),
      ls = wn(),
      ME = ls.findOne,
      NE = ls.findAll,
      kE = ls.getChildren,
      UE = ls.removeSubsets,
      Og = Dn().falseFunc,
      _i = Rg(),
      Mg = _i.compileUnsafe,
      PE = _i.compileToken;
    function Ng(t) {
      return function (i, u, a) {
        return (
          typeof i != "function" && (i = Mg(i, a, u)),
          Array.isArray(u) ? (u = UE(u)) : (u = kE(u)),
          t(i, u)
        );
      };
    }
    var jo = Ng(function (r, i) {
        return r === Og || !i || i.length === 0 ? [] : NE(r, i);
      }),
      $E = Ng(function (r, i) {
        return r === Og || !i || i.length === 0 ? null : ME(r, i);
      });
    function HE(t, r, i) {
      return (typeof r == "function" ? r : _i(r, i))(t);
    }
    function Oe(t, r, i) {
      return jo(t, r, i);
    }
    Oe.compile = _i;
    Oe.filters = Ig.filters;
    Oe.pseudos = Ig.pseudos;
    Oe.selectAll = jo;
    Oe.selectOne = $E;
    Oe.is = HE;
    Oe.parse = _i;
    Oe.iterate = jo;
    Oe._compileUnsafe = Mg;
    Oe._compileToken = PE;
  });
  var fs = U((We) => {
    var GE = Jo(),
      VE = ui(),
      WE = ts(),
      vi = yr();
    We.load = function (t, r) {
      var i = hs();
      r = vi.defaults(r || {}, i.prototype.options);
      var u = VE(t, r),
        a = function (c, l, p, h) {
          return this instanceof a
            ? ((h = vi.defaults(h || {}, r)), i.call(this, c, l, p || u, h))
            : new a(c, l, p, h);
        };
      return (
        (a.prototype = Object.create(i.prototype)),
        (a.prototype.constructor = a),
        (a.fn = a.prototype),
        (a.prototype._originalRoot = u),
        vi.merge(a, We),
        (a._root = u),
        (a._options = r),
        a
      );
    };
    function Ug(t, r, i) {
      if (r) typeof r == "string" && (r = GE(r, t._root, i));
      else if (t._root && t._root.children) r = t._root.children;
      else return "";
      return WE(r, i);
    }
    We.html = function (t, r) {
      var i = hs();
      return (
        Object.prototype.toString.call(t) === "[object Object]" &&
          !r &&
          !("length" in t) &&
          !("type" in t) &&
          ((r = t), (t = void 0)),
        (r = vi.defaults(r || {}, this._options, i.prototype.options)),
        Ug(this, t, r)
      );
    };
    We.xml = function (t) {
      var r = vi.defaults({ xmlMode: !0 }, this._options);
      return Ug(this, t, r);
    };
    We.text = function (t) {
      if (!t) return "";
      for (var r = "", i = t.length, u, a = 0; a < i; a++)
        ((u = t[a]),
          u.type === "text"
            ? (r += u.data)
            : u.children && u.type !== "comment" && (r += We.text(u.children)));
      return r;
    };
    We.parseHTML = function (t, r, i) {
      var u;
      return !t || typeof t != "string"
        ? null
        : (typeof r == "boolean" && (i = r),
          (u = this.load(t)),
          i || u("script").remove(),
          u.root()[0].children.slice());
    };
    We.root = function () {
      return this(this._root);
    };
    We.contains = function (t, r) {
      if (r === t) return !1;
      for (; r && r !== r.parent;) if (((r = r.parent), r === t)) return !0;
      return !1;
    };
  });
  var Vg = U((ae) => {
    var En = yr(),
      zE = fs(),
      ds = yn(),
      zr = ds.isTag,
      Me = ds.domEach,
      Ai = Object.prototype.hasOwnProperty,
      jE = ds.camelCase,
      JE = ds.cssCase,
      bi = /\s+/,
      ps = "data-",
      Pg = { null: null, true: !0, false: !1 },
      Yo =
        /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,
      KE = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
      wi = function (t, r) {
        if (!(!t || !zr(t))) {
          if ((t.attribs || (t.attribs = {}), !r)) return t.attribs;
          if (Ai.call(t.attribs, r)) return Yo.test(r) ? r : t.attribs[r];
          if (t.name === "option" && r === "value") return zE.text(t.children);
          if (
            t.name === "input" &&
            (t.attribs.type === "radio" || t.attribs.type === "checkbox") &&
            r === "value"
          )
            return "on";
        }
      },
      yi = function (t, r, i) {
        i === null ? Gg(t, r) : (t.attribs[r] = i + "");
      };
    ae.attr = function (t, r) {
      return typeof t == "object" || r !== void 0
        ? typeof r == "function"
          ? Me(this, function (i, u) {
              yi(u, t, r.call(u, i, u.attribs[t]));
            })
          : Me(this, function (i, u) {
              zr(u) &&
                (typeof t == "object"
                  ? En.each(t, function (a, c) {
                      yi(u, c, a);
                    })
                  : yi(u, t, r));
            })
        : wi(this[0], t);
    };
    var $g = function (t, r) {
        return t.hasOwnProperty(r)
          ? t[r]
          : Yo.test(r)
            ? wi(t, r) !== void 0
            : wi(t, r);
      },
      Ko = function (t, r, i) {
        t[r] = Yo.test(r) ? !!i : i;
      };
    ae.prop = function (t, r) {
      var i = 0,
        u;
      if (typeof t == "string" && r === void 0) {
        switch (t) {
          case "style":
            ((u = this.css()),
              En.each(u, function (a, c) {
                u[i++] = c;
              }),
              (u.length = i));
            break;
          case "tagName":
          case "nodeName":
            u = this[0].name.toUpperCase();
            break;
          default:
            u = $g(this[0], t);
        }
        return u;
      }
      if (typeof t == "object" || r !== void 0)
        return typeof r == "function"
          ? Me(this, function (a, c) {
              Ko(c, t, r.call(c, a, $g(c, t)));
            })
          : Me(this, function (a, c) {
              zr(c) &&
                (typeof t == "object"
                  ? En.each(t, function (l, p) {
                      Ko(c, p, l);
                    })
                  : Ko(c, t, r));
            });
    };
    var XE = function (t, r, i) {
        if ((t.data || (t.data = {}), typeof r == "object"))
          return En.extend(t.data, r);
        typeof r == "string" && i !== void 0
          ? (t.data[r] = i)
          : typeof r == "object" && En.exend(t.data, r);
      },
      Hg = function (t, r) {
        var i = arguments.length === 1,
          u,
          a,
          c,
          l,
          p,
          h,
          g;
        for (
          i
            ? ((u = Object.keys(t.attribs).filter(function (_) {
                return _.slice(0, ps.length) === ps;
              })),
              (c = u.map(function (_) {
                return jE(_.slice(ps.length));
              })))
            : ((u = [ps + JE(r)]), (c = [r])),
            h = 0,
            g = u.length;
          h < g;
          ++h
        )
          if (((a = u[h]), (l = c[h]), Ai.call(t.attribs, a))) {
            if (((p = t.attribs[a]), Ai.call(Pg, p))) p = Pg[p];
            else if (p === String(Number(p))) p = Number(p);
            else if (KE.test(p))
              try {
                p = JSON.parse(p);
              } catch (_) {}
            t.data[l] = p;
          }
        return i ? t.data : p;
      };
    ae.data = function (t, r) {
      var i = this[0];
      if (!(!i || !zr(i)))
        return (
          i.data || (i.data = {}),
          t
            ? typeof t == "object" || r !== void 0
              ? (Me(this, function (u, a) {
                  XE(a, t, r);
                }),
                this)
              : Ai.call(i.data, t)
                ? i.data[t]
                : Hg(i, t)
            : Hg(i)
        );
    };
    ae.val = function (t) {
      var r = arguments.length === 0,
        i = this[0];
      if (i)
        switch (i.name) {
          case "textarea":
            return this.text(t);
          case "input":
            return this.attr("type") === "radio"
              ? r
                ? this.attr("value")
                : (this.attr("value", t), this)
              : this.attr("value", t);
          case "select":
            var u = this.find("option:selected"),
              a;
            if (u === void 0) return;
            if (!r) {
              if (
                !this.attr().hasOwnProperty("multiple") &&
                typeof t == "object"
              )
                return this;
              (typeof t != "object" && (t = [t]),
                this.find("option").removeAttr("selected"));
              for (var c = 0; c < t.length; c++)
                this.find('option[value="' + t[c] + '"]').attr("selected", "");
              return this;
            }
            return (
              (a = u.attr("value")),
              this.attr().hasOwnProperty("multiple") &&
                ((a = []),
                Me(u, function (l, p) {
                  a.push(wi(p, "value"));
                })),
              a
            );
          case "option":
            return r ? this.attr("value") : (this.attr("value", t), this);
        }
    };
    var Gg = function (t, r) {
      !t.attribs || !Ai.call(t.attribs, r) || delete t.attribs[r];
    };
    ae.removeAttr = function (t) {
      return (
        Me(this, function (r, i) {
          Gg(i, t);
        }),
        this
      );
    };
    ae.hasClass = function (t) {
      return En.some(this, function (r) {
        var i = r.attribs,
          u = i && i.class,
          a = -1,
          c;
        if (u) {
          for (; (a = u.indexOf(t, a + 1)) > -1;)
            if (
              ((c = a + t.length),
              (a === 0 || bi.test(u[a - 1])) &&
                (c === u.length || bi.test(u[c])))
            )
              return !0;
        }
      });
    };
    ae.addClass = function (t) {
      if (typeof t == "function")
        return Me(this, function (g, _) {
          var v = _.attribs.class || "";
          ae.addClass.call([_], t.call(_, g, v));
        });
      if (!t || typeof t != "string") return this;
      for (var r = t.split(bi), i = this.length, u = 0; u < i; u++)
        if (zr(this[u])) {
          var a = wi(this[u], "class"),
            c,
            l;
          if (!a) yi(this[u], "class", r.join(" ").trim());
          else {
            ((l = " " + a + " "), (c = r.length));
            for (var p = 0; p < c; p++) {
              var h = r[p] + " ";
              l.indexOf(" " + h) < 0 && (l += h);
            }
            yi(this[u], "class", l.trim());
          }
        }
      return this;
    };
    var Xo = function (t) {
      return t ? t.trim().split(bi) : [];
    };
    ae.removeClass = function (t) {
      var r, i, u;
      return typeof t == "function"
        ? Me(this, function (a, c) {
            ae.removeClass.call([c], t.call(c, a, c.attribs.class || ""));
          })
        : ((r = Xo(t)),
          (i = r.length),
          (u = arguments.length === 0),
          Me(this, function (a, c) {
            if (zr(c))
              if (u) c.attribs.class = "";
              else {
                for (var l = Xo(c.attribs.class), p, h, g = 0; g < i; g++)
                  ((p = l.indexOf(r[g])),
                    p >= 0 && (l.splice(p, 1), (h = !0), g--));
                h && (c.attribs.class = l.join(" "));
              }
          }));
    };
    ae.toggleClass = function (t, r) {
      if (typeof t == "function")
        return Me(this, function (_, v) {
          ae.toggleClass.call([v], t.call(v, _, v.attribs.class || "", r), r);
        });
      if (!t || typeof t != "string") return this;
      for (
        var i = t.split(bi),
          u = i.length,
          a = typeof r == "boolean" ? (r ? 1 : -1) : 0,
          c = this.length,
          l,
          p,
          h = 0;
        h < c;
        h++
      )
        if (zr(this[h])) {
          l = Xo(this[h].attribs.class);
          for (var g = 0; g < u; g++)
            ((p = l.indexOf(i[g])),
              a >= 0 && p < 0
                ? l.push(i[g])
                : a <= 0 && p >= 0 && l.splice(p, 1));
          this[h].attribs.class = l.join(" ");
        }
      return this;
    };
    ae.is = function (t) {
      return t ? this.filter(t).length > 0 : !1;
    };
  });
  var Kg = U((et) => {
    var Wt = yr(),
      Cn = Jo(),
      Wg = yn(),
      zg = Wg.domEach,
      YE = mn().DomUtils.uniqueSort,
      ze = Wg.isTag;
    et.find = function (t) {
      var r = Wt.reduce(
          this,
          function (c, l) {
            return c.concat(Wt.filter(l.children, ze));
          },
          [],
        ),
        i = this.constructor.contains,
        u;
      if (t && typeof t != "string")
        return (
          t.cheerio ? (u = t.get()) : (u = [t]),
          this._make(
            u.filter(function (c) {
              var l, p;
              for (l = 0, p = this.length; l < p; ++l)
                if (i(this[l], c)) return !0;
            }, this),
          )
        );
      var a = { __proto__: this.options, context: this.toArray() };
      return this._make(Cn(t, r, a));
    };
    et.parent = function (t) {
      var r = [];
      return (
        zg(this, function (i, u) {
          var a = u.parent;
          a && r.indexOf(a) < 0 && r.push(a);
        }),
        arguments.length && (r = et.filter.call(r, t, this)),
        this._make(r)
      );
    };
    et.parents = function (t) {
      var r = [];
      return (
        this.get()
          .reverse()
          .forEach(function (i) {
            Jg(this, i.parent, t, 1 / 0).forEach(function (u) {
              r.indexOf(u) === -1 && r.push(u);
            });
          }, this),
        this._make(r)
      );
    };
    et.parentsUntil = function (t, r) {
      var i = [],
        u,
        a;
      return (
        typeof t == "string"
          ? (u = Cn(t, this.parents().toArray(), this.options)[0])
          : t && t.cheerio
            ? (a = t.toArray())
            : t && (u = t),
        this.toArray()
          .reverse()
          .forEach(function (c) {
            for (
              ;
              (c = c.parent) &&
              ((u && c !== u) || (a && a.indexOf(c) === -1) || (!u && !a));
            )
              ze(c) && i.indexOf(c) === -1 && i.push(c);
          }, this),
        this._make(r ? Cn(r, i, this.options) : i)
      );
    };
    et.closest = function (t) {
      var r = [];
      return t
        ? (zg(
            this,
            function (i, u) {
              var a = Jg(this, u, t, 1)[0];
              a && r.indexOf(a) < 0 && r.push(a);
            }.bind(this),
          ),
          this._make(r))
        : this._make(r);
    };
    et.next = function (t) {
      if (!this[0]) return this;
      var r = [];
      return (
        Wt.forEach(this, function (i) {
          for (; (i = i.next);)
            if (ze(i)) {
              r.push(i);
              return;
            }
        }),
        t ? et.filter.call(r, t, this) : this._make(r)
      );
    };
    et.nextAll = function (t) {
      if (!this[0]) return this;
      var r = [];
      return (
        Wt.forEach(this, function (i) {
          for (; (i = i.next);) ze(i) && r.indexOf(i) === -1 && r.push(i);
        }),
        t ? et.filter.call(r, t, this) : this._make(r)
      );
    };
    et.nextUntil = function (t, r) {
      if (!this[0]) return this;
      var i = [],
        u,
        a;
      return (
        typeof t == "string"
          ? (u = Cn(t, this.nextAll().get(), this.options)[0])
          : t && t.cheerio
            ? (a = t.get())
            : t && (u = t),
        Wt.forEach(this, function (c) {
          for (
            ;
            (c = c.next) &&
            ((u && c !== u) || (a && a.indexOf(c) === -1) || (!u && !a));
          )
            ze(c) && i.indexOf(c) === -1 && i.push(c);
        }),
        r ? et.filter.call(i, r, this) : this._make(i)
      );
    };
    et.prev = function (t) {
      if (!this[0]) return this;
      var r = [];
      return (
        Wt.forEach(this, function (i) {
          for (; (i = i.prev);)
            if (ze(i)) {
              r.push(i);
              return;
            }
        }),
        t ? et.filter.call(r, t, this) : this._make(r)
      );
    };
    et.prevAll = function (t) {
      if (!this[0]) return this;
      var r = [];
      return (
        Wt.forEach(this, function (i) {
          for (; (i = i.prev);) ze(i) && r.indexOf(i) === -1 && r.push(i);
        }),
        t ? et.filter.call(r, t, this) : this._make(r)
      );
    };
    et.prevUntil = function (t, r) {
      if (!this[0]) return this;
      var i = [],
        u,
        a;
      return (
        typeof t == "string"
          ? (u = Cn(t, this.prevAll().get(), this.options)[0])
          : t && t.cheerio
            ? (a = t.get())
            : t && (u = t),
        Wt.forEach(this, function (c) {
          for (
            ;
            (c = c.prev) &&
            ((u && c !== u) || (a && a.indexOf(c) === -1) || (!u && !a));
          )
            ze(c) && i.indexOf(c) === -1 && i.push(c);
        }),
        r ? et.filter.call(i, r, this) : this._make(i)
      );
    };
    et.siblings = function (t) {
      var r = this.parent(),
        i = Wt.filter(
          r ? r.children() : this.siblingsAndMe(),
          Wt.bind(function (u) {
            return ze(u) && !this.is(u);
          }, this),
        );
      return t !== void 0 ? et.filter.call(i, t, this) : this._make(i);
    };
    et.children = function (t) {
      var r = Wt.reduce(
        this,
        function (i, u) {
          return i.concat(Wt.filter(u.children, ze));
        },
        [],
      );
      return t === void 0 ? this._make(r) : et.filter.call(r, t, this);
    };
    et.contents = function () {
      return this._make(
        Wt.reduce(
          this,
          function (t, r) {
            return (t.push.apply(t, r.children), t);
          },
          [],
        ),
      );
    };
    et.each = function (t) {
      for (
        var r = 0, i = this.length;
        r < i && t.call(this[r], r, this[r]) !== !1;
      )
        ++r;
      return this;
    };
    et.map = function (t) {
      return this._make(
        Wt.reduce(
          this,
          function (r, i, u) {
            var a = t.call(i, u, i);
            return a == null ? r : r.concat(a);
          },
          [],
        ),
      );
    };
    var jg = function (t) {
      return function (r, i) {
        var u;
        return (
          (i = i || this),
          typeof r == "string"
            ? (u = Cn.compile(r, i.options))
            : typeof r == "function"
              ? (u = function (a, c) {
                  return r.call(a, c, a);
                })
              : r.cheerio
                ? (u = r.is.bind(r))
                : (u = function (a) {
                    return r === a;
                  }),
          i._make(t(this, u))
        );
      };
    };
    et.filter = jg(Wt.filter);
    et.not = jg(Wt.reject);
    et.has = function (t) {
      var r = this;
      return et.filter.call(this, function () {
        return r._make(this).find(t).length > 0;
      });
    };
    et.first = function () {
      return this.length > 1 ? this._make(this[0]) : this;
    };
    et.last = function () {
      return this.length > 1 ? this._make(this[this.length - 1]) : this;
    };
    et.eq = function (t) {
      return (
        (t = +t),
        t === 0 && this.length <= 1
          ? this
          : (t < 0 && (t = this.length + t),
            this[t] ? this._make(this[t]) : this._make([]))
      );
    };
    et.get = function (t) {
      return t == null
        ? Array.prototype.slice.call(this)
        : this[t < 0 ? this.length + t : t];
    };
    et.index = function (t) {
      var r, i;
      return (
        arguments.length === 0
          ? ((r = this.parent().children()), (i = this[0]))
          : typeof t == "string"
            ? ((r = this._make(t)), (i = this[0]))
            : ((r = this), (i = t.cheerio ? t[0] : t)),
        r.get().indexOf(i)
      );
    };
    et.slice = function () {
      return this._make([].slice.apply(this, arguments));
    };
    function Jg(t, r, i, u) {
      for (var a = []; r && a.length < u;)
        ((!i || et.filter.call([r], i, t).length) && a.push(r), (r = r.parent));
      return a;
    }
    et.end = function () {
      return this.prevObject || this._make([]);
    };
    et.add = function (t, r) {
      for (
        var i = this._make(t, r), u = YE(i.get().concat(this.get())), a = 0;
        a < u.length;
        ++a
      )
        i[a] = u[a];
      return ((i.length = u.length), i);
    };
    et.addBack = function (t) {
      return this.add(
        arguments.length ? this.prevObject.filter(t) : this.prevObject,
      );
    };
  });
  var Qg = U((Mt) => {
    var xn = yr(),
      Xg = ui(),
      jr = fs(),
      gs = Xg.update,
      Yg = Xg.evaluate,
      Qo = yn(),
      Ne = Qo.domEach,
      Zo = Qo.cloneDom,
      ZE = Qo.isHtml,
      tc = Array.prototype.slice;
    Mt._makeDomArray = function (r, i) {
      return r == null
        ? []
        : r.cheerio
          ? i
            ? Zo(r.get(), r.options)
            : r.get()
          : Array.isArray(r)
            ? xn.flatten(
                r.map(function (u) {
                  return this._makeDomArray(u, i);
                }, this),
              )
            : typeof r == "string"
              ? Yg(r, this.options)
              : i
                ? Zo([r])
                : [r];
    };
    var Zg = function (t) {
        return function () {
          var r = tc.call(arguments),
            i = this.length - 1;
          return Ne(this, function (u, a) {
            var c, l;
            (typeof r[0] == "function"
              ? (l = r[0].call(a, u, jr.html(a.children)))
              : (l = r),
              (c = this._makeDomArray(l, u < i)),
              t(c, a.children, a));
          });
        };
      },
      wr = function (t, r, i, u, a) {
        var c = [r, i].concat(u),
          l = t[r - 1] || null,
          p = t[r] || null,
          h,
          g,
          _,
          v,
          b;
        for (h = 0, g = u.length; h < g; ++h)
          ((v = u[h]),
            (b = v.parent || v.root),
            (_ = b && b.children.indexOf(u[h])),
            b &&
              _ > -1 &&
              (b.children.splice(_, 1), a === b && r > _ && c[0]--),
            (v.root = null),
            (v.parent = a),
            v.prev && (v.prev.next = v.next || null),
            v.next && (v.next.prev = v.prev || null),
            (v.prev = u[h - 1] || l),
            (v.next = u[h + 1] || p));
        return (
          l && (l.next = u[0]),
          p && (p.prev = u[u.length - 1]),
          t.splice.apply(t, c)
        );
      };
    Mt.appendTo = function (t) {
      return (
        t.cheerio ||
          (t = this.constructor.call(
            this.constructor,
            t,
            null,
            this._originalRoot,
          )),
        t.append(this),
        this
      );
    };
    Mt.prependTo = function (t) {
      return (
        t.cheerio ||
          (t = this.constructor.call(
            this.constructor,
            t,
            null,
            this._originalRoot,
          )),
        t.prepend(this),
        this
      );
    };
    Mt.append = Zg(function (t, r, i) {
      wr(r, r.length, 0, t, i);
    });
    Mt.prepend = Zg(function (t, r, i) {
      wr(r, 0, 0, t, i);
    });
    Mt.wrap = function (t) {
      var r = typeof t == "function" && t,
        i = this.length - 1;
      return (
        xn.forEach(
          this,
          xn.bind(function (u, a) {
            var c = u.parent || u.root,
              l = c.children,
              p,
              h;
            c &&
              (r && (t = r.call(u, a)),
              typeof t == "string" &&
                !ZE(t) &&
                (t = this.parents().last().find(t).clone()),
              (p = this._makeDomArray(t, a < i).slice(0, 1)),
              (h = l.indexOf(u)),
              gs([u], p[0]),
              wr(l, h, 0, p, c));
          }, this),
        ),
        this
      );
    };
    Mt.after = function () {
      var t = tc.call(arguments),
        r = this.length - 1;
      return (
        Ne(this, function (i, u) {
          var a = u.parent || u.root;
          if (a) {
            var c = a.children,
              l = c.indexOf(u),
              p,
              h;
            l < 0 ||
              (typeof t[0] == "function"
                ? (p = t[0].call(u, i, jr.html(u.children)))
                : (p = t),
              (h = this._makeDomArray(p, i < r)),
              wr(c, l + 1, 0, h, a));
          }
        }),
        this
      );
    };
    Mt.insertAfter = function (t) {
      var r = [],
        i = this;
      return (
        typeof t == "string" &&
          (t = this.constructor.call(
            this.constructor,
            t,
            null,
            this._originalRoot,
          )),
        (t = this._makeDomArray(t)),
        i.remove(),
        Ne(t, function (u, a) {
          var c = i._makeDomArray(i.clone()),
            l = a.parent || a.root;
          if (l) {
            var p = l.children,
              h = p.indexOf(a);
            h < 0 || (wr(p, h + 1, 0, c, l), r.push(c));
          }
        }),
        this.constructor.call(this.constructor, this._makeDomArray(r))
      );
    };
    Mt.before = function () {
      var t = tc.call(arguments),
        r = this.length - 1;
      return (
        Ne(this, function (i, u) {
          var a = u.parent || u.root;
          if (a) {
            var c = a.children,
              l = c.indexOf(u),
              p,
              h;
            l < 0 ||
              (typeof t[0] == "function"
                ? (p = t[0].call(u, i, jr.html(u.children)))
                : (p = t),
              (h = this._makeDomArray(p, i < r)),
              wr(c, l, 0, h, a));
          }
        }),
        this
      );
    };
    Mt.insertBefore = function (t) {
      var r = [],
        i = this;
      return (
        typeof t == "string" &&
          (t = this.constructor.call(
            this.constructor,
            t,
            null,
            this._originalRoot,
          )),
        (t = this._makeDomArray(t)),
        i.remove(),
        Ne(t, function (u, a) {
          var c = i._makeDomArray(i.clone()),
            l = a.parent || a.root;
          if (l) {
            var p = l.children,
              h = p.indexOf(a);
            h < 0 || (wr(p, h, 0, c, l), r.push(c));
          }
        }),
        this.constructor.call(this.constructor, this._makeDomArray(r))
      );
    };
    Mt.remove = function (t) {
      var r = this;
      return (
        t && (r = r.filter(t)),
        Ne(r, function (i, u) {
          var a = u.parent || u.root;
          if (a) {
            var c = a.children,
              l = c.indexOf(u);
            l < 0 ||
              (c.splice(l, 1),
              u.prev && (u.prev.next = u.next),
              u.next && (u.next.prev = u.prev),
              (u.prev = u.next = u.parent = u.root = null));
          }
        }),
        this
      );
    };
    Mt.replaceWith = function (t) {
      var r = this;
      return (
        Ne(this, function (i, u) {
          var a = u.parent || u.root;
          if (a) {
            var c = a.children,
              l = r._makeDomArray(typeof t == "function" ? t.call(u, i, u) : t),
              p;
            (gs(l, null),
              (p = c.indexOf(u)),
              wr(c, p, 1, l, a),
              (u.parent = u.prev = u.next = u.root = null));
          }
        }),
        this
      );
    };
    Mt.empty = function () {
      return (
        Ne(this, function (t, r) {
          (xn.each(r.children, function (i) {
            i.next = i.prev = i.parent = null;
          }),
            (r.children.length = 0));
        }),
        this
      );
    };
    Mt.html = function (t) {
      if (t === void 0)
        return !this[0] || !this[0].children
          ? null
          : jr.html(this[0].children, this.options);
      var r = this.options;
      return (
        Ne(this, function (i, u) {
          xn.each(u.children, function (c) {
            c.next = c.prev = c.parent = null;
          });
          var a = t.cheerio ? t.clone().get() : Yg("" + t, r);
          gs(a, u);
        }),
        this
      );
    };
    Mt.toString = function () {
      return jr.html(this, this.options);
    };
    Mt.text = function (t) {
      return t === void 0
        ? jr.text(this)
        : typeof t == "function"
          ? Ne(this, function (r, i) {
              var u = [i];
              return Mt.text.call(u, t.call(i, r, jr.text(u)));
            })
          : (Ne(this, function (r, i) {
              xn.each(i.children, function (a) {
                a.next = a.prev = a.parent = null;
              });
              var u = {
                data: "" + t,
                type: "text",
                parent: i,
                prev: null,
                next: null,
                children: [],
              };
              gs(u, i);
            }),
            this);
    };
    Mt.clone = function () {
      return this._make(Zo(this.get(), this.options));
    };
  });
  var n2 = U((r2) => {
    var QE = yr(),
      tC = yn().domEach,
      eC = Object.prototype.toString;
    r2.css = function (t, r) {
      return arguments.length === 2 || eC.call(t) === "[object Object]"
        ? tC(this, function (i, u) {
            t2(u, t, r, i);
          })
        : e2(this[0], t);
    };
    function t2(t, r, i, u) {
      if (typeof r == "string") {
        var a = e2(t);
        (typeof i == "function" && (i = i.call(t, u, a[r])),
          i === "" ? delete a[r] : i != null && (a[r] = i),
          (t.attribs.style = rC(a)));
      } else
        typeof r == "object" &&
          Object.keys(r).forEach(function (c) {
            t2(t, c, r[c]);
          });
    }
    function e2(t, r) {
      var i = nC(t.attribs.style);
      return typeof r == "string" ? i[r] : Array.isArray(r) ? QE.pick(i, r) : i;
    }
    function rC(t) {
      return Object.keys(t || {}).reduce(function (r, i) {
        return (r += (r ? " " : "") + i + ": " + t[i] + ";");
      }, "");
    }
    function nC(t) {
      return (
        (t = (t || "").trim()),
        t
          ? t.split(";").reduce(function (r, i) {
              var u = i.indexOf(":");
              return (
                u < 1 ||
                  u === i.length - 1 ||
                  (r[i.slice(0, u).trim()] = i.slice(u + 1).trim()),
                r
              );
            }, {})
          : {}
      );
    }
  });
  var a2 = U((s2) => {
    var iC = yr(),
      i2 = "input,select,textarea,keygen",
      u2 = /\r?\n/g;
    s2.serializeArray = function () {
      var t = this.constructor;
      return this.map(function () {
        var r = this,
          i = t(r);
        return r.name === "form"
          ? i.find(i2).toArray()
          : i.filter(i2).toArray();
      })
        .filter(
          '[name!=""]:not(:disabled):not(:submit, :button, :image, :reset, :file):matches([checked], :not(:checkbox, :radio))',
        )
        .map(function (r, i) {
          var u = t(i),
            a = u.attr("name"),
            c = u.val();
          return c == null
            ? null
            : Array.isArray(c)
              ? iC.map(c, function (l) {
                  return {
                    name: a,
                    value: l.replace(
                      u2,
                      `\r
`,
                    ),
                  };
                })
              : {
                  name: a,
                  value: c.replace(
                    u2,
                    `\r
`,
                  ),
                };
        })
        .get();
    };
  });
  var hs = U((AS, c2) => {
    var ec = ui(),
      o2 = yn().isHtml,
      Di = yr(),
      uC = [Vg(), Kg(), Qg(), n2(), a2()],
      oe = (c2.exports = function (t, r, i, u) {
        return this instanceof oe
          ? ((this.options = Di.defaults(u || {}, this.options)),
            t
              ? (i &&
                  (typeof i == "string" && (i = ec(i, this.options)),
                  (this._root = oe.call(this, i))),
                t.cheerio
                  ? t
                  : (sC(t) && (t = [t]),
                    Array.isArray(t)
                      ? (Di.forEach(
                          t,
                          Di.bind(function (a, c) {
                            this[c] = a;
                          }, this),
                        ),
                        (this.length = t.length),
                        this)
                      : typeof t == "string" && o2(t)
                        ? oe.call(this, ec(t, this.options).children)
                        : (r
                            ? typeof r == "string"
                              ? o2(r)
                                ? ((r = ec(r, this.options)),
                                  (r = oe.call(this, r)))
                                : ((t = [r, t].join(" ")), (r = this._root))
                              : r.cheerio || (r = oe.call(this, r))
                            : (r = this._root),
                          r ? r.find(t) : this)))
              : this)
          : new oe(t, r, i, u);
      });
    Di.extend(oe, fs());
    oe.prototype.cheerio = "[cheerio object]";
    oe.prototype.options = {
      withDomLvl1: !0,
      normalizeWhitespace: !1,
      xmlMode: !1,
      decodeEntities: !0,
    };
    oe.prototype.length = 0;
    oe.prototype.splice = Array.prototype.splice;
    oe.prototype._make = function (t, r) {
      var i = new this.constructor(t, r, this._root, this.options);
      return ((i.prevObject = this), i);
    };
    oe.prototype.toArray = function () {
      return this.get();
    };
    uC.forEach(function (t) {
      Di.extend(oe.prototype, t);
    });
    var sC = function (t) {
      return t.name || t.type === "text" || t.type === "comment";
    };
  });
  var l2 = U((bS, aC) => {
    aC.exports = {
      name: "cheerio-without-node-native",
      version: "0.20.2",
      description:
        "Cheerio build that excludes node native modules so that you can use it in platforms like React Native.",
      license: "MIT",
      keywords: [
        "htmlparser",
        "jquery",
        "selector",
        "scraper",
        "parser",
        "html",
      ],
      repository: {
        type: "git",
        url: "git://github.com/oyyd/cheerio-without-node-native",
      },
      main: "./index.js",
      files: ["index.js", "lib"],
      engines: { node: ">= 0.6" },
      dependencies: {
        "css-select": "~1.2.0",
        "dom-serializer": "~0.1.0",
        entities: "~1.1.1",
        "htmlparser2-without-node-native": "^3.9.0",
        lodash: "^4.1.0",
      },
      devDependencies: {
        benchmark: "~1.0.0",
        coveralls: "~2.10",
        "expect.js": "~0.3.1",
        istanbul: "~0.2",
        jshint: "~2.5.1",
        mocha: "*",
        xyz: "~0.5.0",
      },
      scripts: { test: "make test" },
      optionalDependencies: { jsdom: "^7.0.2" },
    };
  });
  var nc = U((rc, f2) => {
    rc = f2.exports = hs();
    rc.version = l2().version;
  });
  function Ei(t, r = 2, i = 0) {
    return V(this, null, function* () {
      for (let u = 0; u < r; u++) {
        if (i && Date.now() >= i) return null;
        let a = i ? i - Date.now() : 0,
          c = Math.min(8e3, Math.max(2e3, a)),
          l = yield nt(t, { timeout: c });
        if (l && l.ok) return l;
        u < r - 1 && (yield Ka(400));
      }
      return null;
    });
  }
  function h2(t) {
    let r = Sn.get(t);
    return r && Date.now() - r.ts < hC ? r.data : (r && Sn.delete(t), null);
  }
  function ic(t, r) {
    if (Sn.size >= pC) {
      let i = [...Sn.entries()]
        .sort((u, a) => u[1].ts - a[1].ts)
        .slice(0, 100)
        .map(([u]) => u);
      for (let u of i) Sn.delete(u);
    }
    Sn.set(t, { data: r, ts: Date.now() });
  }
  function Si(t) {
    return /^[\x00-\x7F\u00C0-\u024F\s\-,:!.'?&()0-9]+$/.test(t);
  }
  function dC(t) {
    return String(t).match(/^kitsu:(\d+)(?::(\d+))?$/);
  }
  function gC(t) {
    let r = String(t || "").match(
      /^(mal|anilist|anidb|tvdb):(\d+)(?::(\d+))?$/i,
    );
    return r
      ? {
          tracker: r[1].toLowerCase(),
          externalId: r[2],
          absEpisode: r[3] ? parseInt(r[3], 10) : null,
        }
      : null;
  }
  function mC(t) {
    return V(this, null, function* () {
      var a;
      if (!t || t.tracker === "anidb" || t.tracker === "tvdb") return null;
      let r = t.tracker === "anilist",
        i = r
          ? "query($id: Int){Media(id: $id, type: ANIME){idMal title{romaji english native}}}"
          : "query($idMal: Int){Media(idMal: $idMal, type: ANIME){idMal title{romaji english native}}}",
        u = r ? { id: Number(t.externalId) } : { idMal: Number(t.externalId) };
      if (!Number.isFinite((a = u.id) != null ? a : u.idMal)) return null;
      try {
        let c = yield nt("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "User-Agent": fC,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ query: i, variables: u }),
          timeout: 6e3,
        });
        if (!c || !c.ok) return null;
        let l = null;
        try {
          l = yield c.json();
        } catch (p) {
          return null;
        }
        return l && l.data && l.data.Media ? l.data.Media : null;
      } catch (c) {
        return null;
      }
    });
  }
  function _C(t, r, i) {
    return V(this, null, function* () {
      let u = yield mC(t);
      if (!u || !u.title)
        return (
          console.warn(
            `[Metadata] Tracker ${t.tracker}:${t.externalId} non r\xE9solu (0 requ\xEAte TMDB d\xE9pens\xE9e)`,
          ),
          []
        );
      let a = [u.title.english, u.title.romaji, u.title.native]
        .map((c) => (c || "").trim())
        .filter(Boolean);
      for (let c of a) {
        let l = yield sc(c, r);
        if (!l) continue;
        let p = yield ms(String(l), r, i);
        if (p && p.length > 0)
          return (
            console.log(
              `[Metadata] ${t.tracker}:${t.externalId} \u2192 TMDB ${l} via "${c}"`,
            ),
            p
          );
      }
      return (
        console.log(
          `[Metadata] AniList titles used directly for ${t.tracker}:${t.externalId}`,
        ),
        a
      );
    });
  }
  function vC(t, r) {
    return V(this, null, function* () {
      if (!/^tt\d+$/i.test(t)) return null;
      let i = `${xi}/find/${t}?api_key=${Ci}&external_source=imdb_id`,
        u = yield Ei(i, 1);
      if (!u) return null;
      let a = null;
      try {
        a = yield u.json();
      } catch (p) {
        return null;
      }
      let l = ((r === "movie" ? a && a.movie_results : a && a.tv_results) ||
        [])[0];
      return l && l.id ? String(l.id) : null;
    });
  }
  function sc(t, r) {
    return V(this, null, function* () {
      let i = r === "movie" ? "movie" : "tv",
        u = encodeURIComponent(t),
        a = `${xi}/search/${i}?api_key=${Ci}&query=${u}`,
        c = yield nt(a);
      if (!c) return null;
      let l;
      try {
        l = yield c.json();
      } catch (h) {
        return null;
      }
      let p = l == null ? void 0 : l.results;
      return !p || !p.length ? null : p[0].id;
    });
  }
  function p2(u, a) {
    return V(this, arguments, function* (t, r, i = {}) {
      var T, I, G, M, P, H;
      let c = `https://kitsu.io/api/edge/anime/${t}`,
        l = yield nt(c);
      if (!l)
        return (
          console.log(`[Metadata] Kitsu API error: failed to fetch ${t}`),
          []
        );
      let p;
      try {
        p = yield l.json();
      } catch (O) {
        return (
          console.log(`[Metadata] Kitsu API error: invalid JSON for ${t}`),
          []
        );
      }
      let h = (T = p == null ? void 0 : p.data) == null ? void 0 : T.attributes;
      if (!h)
        return (
          console.log(`[Metadata] Kitsu API error: no anime data for ${t}`),
          []
        );
      let g =
        (G = (I = h.titles) == null ? void 0 : I.en) == null
          ? void 0
          : G.trim();
      if (g) {
        let O = yield sc(g, r);
        if (O)
          return (
            console.log(`[Metadata] Kitsu ${t} -> TMDB ${O} via "${g}"`),
            yield ms(String(O), r, i)
          );
      }
      let _ = [],
        v = (M = h.canonicalTitle) == null ? void 0 : M.trim();
      (g && _.push(g),
        v && !_.some((O) => O.toLowerCase() === v.toLowerCase()) && _.push(v));
      let b =
        (H = (P = h.titles) == null ? void 0 : P.ja_jp) == null
          ? void 0
          : H.trim();
      b &&
        !_.some((O) => O.toLowerCase() === b.toLowerCase()) &&
        Si(b) &&
        _.push(b);
      let w = h.abbreviatedTitles || [];
      for (let O of w) {
        let ut = O == null ? void 0 : O.trim();
        ut &&
          !_.some((lt) => lt.toLowerCase() === ut.toLowerCase()) &&
          Si(ut) &&
          _.push(ut);
      }
      let x = i.season ? parseInt(i.season, 10) : null;
      if (x && x > 0) {
        let O = [g, v].filter(Boolean);
        for (let ut of O)
          for (let lt of uc) {
            let At = `${ut} ${lt(x)}`;
            _.some((Ft) => Ft.toLowerCase() === At.toLowerCase()) || _.push(At);
          }
      }
      let C = h.startDate,
        R =
          C && C.length >= 4 && /^\d{4}/.test(C)
            ? parseInt(C.substring(0, 4), 10)
            : null;
      return (
        (_._metadata = {
          isAnime: (h.originalLanguage || "") === "ja",
          name: h.canonicalTitle || "",
          originalLanguage: h.originalLanguage || "",
          year: R,
        }),
        console.log(
          `[Metadata] Kitsu fallback titles for ${t}: ${_.join(" | ")}`,
        ),
        _
      );
    });
  }
  function ms(u, a) {
    return V(this, arguments, function* (t, r, i = {}) {
      var w, x, C, R, T, I;
      let c = r === "movie" ? "movie" : "tv",
        l = i.season ? parseInt(i.season, 10) : null,
        p = `tmdb:${t}:${c}:${l || ""}`,
        h = h2(p);
      if (h) return (console.log(`[Metadata] Cache HIT for ${p}`), h);
      let g = [],
        _ = null;
      try {
        let G = `${xi}/${c}/${t}?api_key=${Ci}&language=en-US`,
          M = `${xi}/${c}/${t}/alternative_titles?api_key=${Ci}`,
          P = `${xi}/${c}/${t}/translations?api_key=${Ci}`,
          H = Date.now() + oC,
          O = yield Ei(G, 2, H),
          ut = () => H - Date.now(),
          lt = i.allowEnrichment !== !1,
          At = null,
          Ft = null;
        if (
          (lt && ut() > lC
            ? ([At, Ft] = yield Promise.all([Ei(M, 1, H), Ei(P, 1, H)]))
            : lt && ut() > cC && (Ft = yield Ei(P, 1, H)),
          O)
        ) {
          let gt = yield O.json(),
            ht = gt != null ? gt : {},
            _t =
              (w = c === "movie" ? ht.title : ht.name) == null
                ? void 0
                : w.trim(),
            Dt =
              (x = c === "movie" ? ht.original_title : ht.original_name) == null
                ? void 0
                : x.trim();
          if (ht) {
            let ot = c === "movie" ? ht.release_date : ht.first_air_date,
              Lt =
                ot && ot.length >= 4 && /^\d{4}/.test(ot)
                  ? parseInt(ot.substring(0, 4), 10)
                  : null;
            if (
              ((_ = {
                isAnime:
                  ht.original_language === "ja" ||
                  (ht.genres || []).some((Rt) => Rt.id === 16),
                name: ht.name || ht.title || "",
                originalLanguage: ht.original_language || "",
                year: Lt,
              }),
              c === "tv" && Array.isArray(ht.seasons))
            ) {
              let Rt = {};
              for (let ke of ht.seasons)
                ke &&
                  ke.season_number > 0 &&
                  ke.episode_count > 0 &&
                  (Rt[ke.season_number] = ke.episode_count);
              Object.keys(Rt).length > 0 && (_.seasonEpisodeCounts = Rt);
            }
          }
          if (
            (_t && g.push(_t),
            Dt && Dt !== _t && Si(Dt) && g.push(Dt),
            r === "tv" && i.season)
          ) {
            let ot = parseInt(i.season, 10);
            if (ot > 0 && _t)
              for (let Lt of uc) {
                let Rt = `${_t} ${Lt(ot)}`;
                g.includes(Rt) || g.push(Rt);
              }
            if (ot > 0 && Dt && Dt !== _t && Si(Dt))
              for (let Lt of uc) {
                let Rt = `${Dt} ${Lt(ot)}`;
                g.includes(Rt) || g.push(Rt);
              }
          }
        }
        if (At) {
          let gt = yield At.json(),
            ht = gt != null ? gt : {},
            _t = c === "movie" ? ht.titles : ht.results;
          _t &&
            Array.isArray(_t) &&
            _t.forEach((Dt) => {
              var Lt;
              let ot = (Lt = Dt.title) == null ? void 0 : Lt.trim();
              ot &&
                !g.some((Rt) => Rt.toLowerCase() === ot.toLowerCase()) &&
                Si(ot) &&
                g.push(ot);
            });
        }
        if (Ft) {
          let gt = yield Ft.json(),
            _t = ((gt != null ? gt : {}).translations || []).find(
              (ot) => ot.iso_639_1 === "fr",
            ),
            Dt =
              ((R =
                (C = _t == null ? void 0 : _t.data) == null
                  ? void 0
                  : C.name) == null
                ? void 0
                : R.trim()) ||
              ((I =
                (T = _t == null ? void 0 : _t.data) == null
                  ? void 0
                  : T.title) == null
                ? void 0
                : I.trim());
          if (
            (Dt &&
              !g.some((ot) => ot.toLowerCase() === Dt.toLowerCase()) &&
              g.splice(1, 0, Dt),
            r === "tv" && i.season && Dt)
          ) {
            let ot = parseInt(i.season, 10);
            if (ot > 0) {
              let Lt = `${Dt} Saison ${ot}`;
              if (!g.some((Rt) => Rt.toLowerCase() === Lt.toLowerCase())) {
                let Rt = g.indexOf(Dt);
                Rt !== -1 ? g.splice(Rt + 1, 0, Lt) : g.splice(2, 0, Lt);
              }
            }
          }
        }
      } catch (G) {
        console.error(`[Metadata] TMDB API error: ${G.message}`);
      }
      let v = new Set(),
        b = g.filter((G) => {
          let M = G.toLowerCase();
          return v.has(M) ? !1 : (v.add(M), !0);
        });
      return (
        _ && (b._metadata = _),
        (b.length > 0 || _) && ic(p, b),
        console.log(`[Metadata] Titles for ${t}: ${b.join(" | ")}`),
        b
      );
    });
  }
  function yC(t, r, i) {
    return V(this, null, function* () {
      var u, a, c, l, p, h;
      try {
        if (!t || t.length < 3) return [];
        let g = i.season ? parseInt(i.season, 10) : null,
          _ = `kitsu-fb:${t.toLowerCase()}:${r}:${g || ""}`,
          v = h2(_);
        if (v)
          return (
            console.log(`[Metadata] Kitsu fallback cache HIT for "${t}"`),
            v
          );
        let b = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(t)}&page[limit]=5`,
          w = yield nt(b);
        if (!w) return [];
        let x = yield w.json();
        if (!((u = x == null ? void 0 : x.data) != null && u.length)) return [];
        for (let C of x.data) {
          let R = C.attributes || {},
            T =
              (c = (a = R.titles) == null ? void 0 : a.ja_jp) == null
                ? void 0
                : c.trim(),
            I = (l = R.canonicalTitle) == null ? void 0 : l.trim(),
            G =
              ((h = (p = R.titles) == null ? void 0 : p.en) == null
                ? void 0
                : h.trim()) || I;
          if ((!T && R.originalLanguage !== "ja") || !G) continue;
          console.log(
            `[Metadata] Kitsu search: "${t}" \u2192 "${G}" (ja=${!!T})`,
          );
          let M = yield sc(G, r);
          if (M) {
            let H = yield ms(String(M), r, i),
              O = H._metadata;
            if (O && O.isAnime)
              return (
                console.log(
                  `[Metadata] Fallback success: TMDB ID ${M} for "${G}"`,
                ),
                ic(_, H),
                H
              );
          }
          console.log(
            `[Metadata] Fallback: using Kitsu titles directly for ${C.id}`,
          );
          let P = yield p2(C.id, r, i);
          return (ic(_, P), P);
        }
        return (
          console.log(`[Metadata] Kitsu search: no valid results for "${t}"`),
          []
        );
      } catch (g) {
        return (
          console.warn(`[Metadata] Kitsu fallback error: ${g.message}`),
          []
        );
      }
    });
  }
  function d2(u, a) {
    return V(this, arguments, function* (t, r, i = {}) {
      let c = (t == null ? "" : String(t).trim())
          .replace(/^tmdb[:/]/i, "")
          .replace(/^(?:movie|series)[:/]/i, ""),
        l = dC(c),
        p = i.season != null ? i.season : null;
      if (
        (console.log(
          `[Metadata] getTmdbTitles: id="${c}" type="${r}" season=${i.season}`,
        ),
        l)
      ) {
        let v = l[1],
          b = l[2] ? parseInt(l[2], 10) : null;
        ((p = i.season != null ? i.season : b),
          console.log(`[Metadata] Kitsu ID detected: ${v}, season=${p}`));
        let w = yield p2(v, r, wt(tt({}, i), { season: p }));
        return ((w.effectiveSeason = p), w);
      }
      if (!c) {
        console.error(`[Metadata] Invalid/null TMDB ID received: "${t}"`);
        let v = [];
        return ((v.effectiveSeason = p), v);
      }
      let h = gC(c);
      if (h) {
        i.season == null && h.absEpisode != null && (p = h.absEpisode);
        let v = yield _C(h, r, wt(tt({}, i), { season: p }));
        return ((v.effectiveSeason = p), v);
      }
      let g = c;
      if (!/^\d+$/.test(c)) {
        let v = /^tt\d+$/i.test(c) ? c : /^imdb:/i.test(c) ? c.slice(5) : null,
          b = v ? yield vC(v, r) : null;
        if (!b) {
          console.warn(
            `[Metadata] ID non-TMDB non r\xE9solu: "${c}" \u2192 aucun titre (\xE9chec rapide, 0 requ\xEAte TMDB)`,
          );
          let w = [];
          return ((w.effectiveSeason = p), w);
        }
        (console.log(`[Metadata] ID ${c} \u2192 TMDB ${b}`), (g = b));
      }
      let _ = yield ms(g, r, i);
      if (r === "tv" && _.length > 0 && _._metadata) {
        let v = _._metadata;
        if (v.isAnime)
          console.log(
            `[Metadata] \u2713 ID ${g}: "${v.name}" confirmed anime (${v.originalLanguage})`,
          );
        else {
          console.warn(
            `[Metadata] \u26A0 ID ${g} = "${v.name}" (${v.originalLanguage}) - not anime!`,
          );
          let b = /[\u3000-\u9FFF\uF900-\uFAFF]/.test(v.name || "");
          if (v.originalLanguage === "ja" || b) {
            let x = yield yC(_[0], r, i);
            if (x.length > 0)
              return (
                console.log(
                  `[Metadata] Fallback success: ${x.length} alternative titles`,
                ),
                (x.effectiveSeason = p),
                x
              );
            console.warn(
              `[Metadata] Kitsu fallback failed for "${v.name}", using original titles`,
            );
          } else
            console.log(
              `[Metadata] No anime indicators, skipping Kitsu fallback for "${v.name}"`,
            );
        }
      }
      return ((_.effectiveSeason = p), _);
    });
  }
  var Ci,
    xi,
    oC,
    cC,
    lC,
    fC,
    Sn,
    hC,
    pC,
    uc,
    g2 = Yn(() => {
      hn();
      ((Ci = "8265bd1679663a7ea12ac168da84d2e8"),
        (xi = "https://api.themoviedb.org/3"),
        (oC = 2e4),
        (cC = 4e3),
        (lC = 8e3),
        (fC = "Nuvio-Providers/1.0"));
      ((Sn = new Map()), (hC = 300 * 1e3), (pC = 500));
      uc = [(t) => `Season ${t}`, (t) => `Saison ${t}`, (t) => `S${t}`];
    });
  function ac(i) {
    return V(this, arguments, function* (t, r = {}) {
      try {
        return yield nt(t, r);
      } catch (u) {
        return (console.error(`[ArmSync] Fetch failed: ${t}`, u.message), null);
      }
    });
  }
  function CC(t, r) {
    return V(this, null, function* () {
      if (!t) return null;
      let i = yield ac(`${bC}/themoviedb?id=${t}`);
      if (i)
        try {
          let u = yield i.json(),
            a = u != null ? u : null,
            c = Array.isArray(a) ? a[0] : a;
          if (c && c.imdb) return c.imdb;
        } catch (u) {
          console.warn(
            `[ArmSync] JSON parse failed for getImdbId: ${u == null ? void 0 : u.message}`,
          );
        }
      return null;
    });
  }
  function xC(t, r) {
    let i = t.slice(0, r + 1),
      u = [],
      a = !1;
    for (let l = 0; l < i.length; l++) {
      let p = i[l];
      if (a) {
        if (p === "\\") {
          l++;
          continue;
        }
        p === '"' && (a = !1);
        continue;
      }
      if (p === '"') {
        a = !0;
        continue;
      }
      p === "["
        ? u.push("]")
        : p === "{"
          ? u.push("}")
          : (p === "]" || p === "}") && u.pop();
    }
    let c = i;
    for (; u.length;) c += u.pop();
    return c;
  }
  function m2(t) {
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch (r) {}
    for (let r = t.lastIndexOf("}"); r > 0; r = t.lastIndexOf("}", r - 1))
      try {
        return JSON.parse(xC(t, r));
      } catch (i) {
        continue;
      }
    return null;
  }
  function SC(t, r, i) {
    return V(this, null, function* () {
      let u = parseInt(r, 10),
        a = parseInt(i, 10);
      if (!t || !u || u <= 0) return null;
      let c = yield ac(`${EC}/tv/${t}?api_key=${DC}&language=en-US`);
      if (!c) return null;
      let l = m2(yield c.text()),
        p = l && Array.isArray(l.seasons) ? l.seasons : null;
      if (!p) return null;
      let h = 0;
      for (let g of p) {
        let _ = parseInt(g && g.season_number, 10);
        if (!(!isFinite(_) || _ <= 0)) {
          if (_ === u) {
            let v = h + a;
            return (
              console.log(`[ArmSync] TMDB: S${u}E${a} -> Absolute ${v}`),
              v
            );
          }
          _ < u && (h += parseInt(g.episode_count, 10) || 0);
        }
      }
      return null;
    });
  }
  function TC(t, r, i) {
    return V(this, null, function* () {
      var g;
      if (!t || r === 0) return null;
      let u = yield ac(`${wC}/meta/series/${t}.json`);
      if (!u) return null;
      let a = m2(yield u.text()) || {};
      if (!((g = a == null ? void 0 : a.meta) != null && g.videos)) return null;
      let c = a.meta.videos
          .filter((_) => _.season > 0 && _.episode > 0)
          .sort((_, v) => _.season - v.season || _.episode - v.episode),
        l = [],
        p = new Set();
      for (let _ of c) {
        let v = `${_.season}-${_.episode}`;
        p.has(v) || (p.add(v), l.push(_));
      }
      let h = l.findIndex((_) => _.season == r && _.episode == i);
      if (h !== -1) {
        let _ = h + 1;
        return (
          console.log(`[ArmSync] Resolved: S${r}E${i} -> Absolute ${_}`),
          _
        );
      }
      return null;
    });
  }
  function _s(t) {
    return (
      t &&
      (t
        .replace(/\s+(?:Season|Saison|Stagione|Temporada)\s+\d+\s*$/i, "")
        .replace(/\s+S\d+\s*$/i, "")
        .trim() ||
        t)
    );
  }
  function oc(t) {
    return (t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[':!.,?()\[\]\/–—"]/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
  function Ti(t) {
    return (t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[':!.,?()\[\]\/-]/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function cc(t, r) {
    let i = Ti(r),
      u = Ti(t);
    if (!i || !u || u === i) return !1;
    let a = (h, g) => g === 0 || h.charCodeAt(g - 1) === 32,
      c = (h, g) => g >= h.length || h.charCodeAt(g) === 32,
      l = (h) => h.length > 2 && !/^\d+$/.test(h) && !qC.has(h),
      p = u.indexOf(i);
    if (p !== -1) {
      if (!(a(u, p) && c(u, p + i.length))) return !0;
      let h = u.slice(0, p).trim().split(/\s+/).filter(Boolean);
      return h.length > 0 && h[h.length - 1] === "no" ? !1 : h.some(l);
    }
    if (((p = i.indexOf(u)), p !== -1)) {
      if (p === 0 && c(i, p + u.length)) return !1;
      let h = i.slice(0, p).trim().split(/\s+/).filter(Boolean);
      return !(h.length > 0 && h[h.length - 1] === "no");
    }
    return !1;
  }
  function _2(c, l, p, h) {
    return V(this, arguments, function* (t, r, i, u, a = {}) {
      let { startTime: g, budgetMs: _ = 45e3 } = a,
        v = parseInt(u) || 1;
      if (r !== "tv" || !t) return [v];
      if (i == null || i === "") return [v];
      let b = [v];
      if (g != null && ee(g, _)) return b;
      try {
        let w = null,
          x = yield CC(t, r);
        (x && (g == null || !ee(g, _)) && (w = yield TC(x, i, v)),
          !w && (g == null || !ee(g, _)) && (w = yield SC(t, i, v)),
          w && w !== v && b.push(w));
      } catch (w) {
        console.warn(`[ArmSync] Failed: ${w.message}`);
      }
      return b;
    });
  }
  var CS,
    bC,
    wC,
    DC,
    EC,
    LC,
    qC,
    lc = Yn(() => {
      CS = Kf(nc());
      hn();
      ((bC = "https://arm.haglund.dev/api/v2"),
        (wC = "https://v3-cinemeta.strem.io"),
        (DC = "8265bd1679663a7ea12ac168da84d2e8"),
        (EC = "https://api.themoviedb.org/3"));
      ((LC = new Set([
        "saison",
        "saisons",
        "season",
        "seasons",
        "partie",
        "part",
        "parties",
        "integrale",
        "integrales",
        "vol",
        "film",
        "films",
        "movie",
        "ova",
        "ona",
        "special",
        "specials",
        "the",
        "le",
        "la",
        "les",
        "des",
        "une",
        "de",
        "du",
        "et",
        "au",
        "aux",
        "vostfr",
        "vost",
        "vf",
        "vff",
        "vfq",
        "vo",
        "french",
        "streaming",
      ])),
        (qC = new Set([
          ...LC,
          "hd",
          "hd1",
          "hd2",
          "hd3",
          "hd4",
          "sd",
          "fhd",
          "4k",
          "saison",
          "season",
          "episode",
          "partie",
          "part",
          "2020",
          "2021",
          "2022",
          "2023",
          "2024",
          "2025",
          "2026",
        ])));
    });
  function RC(t) {
    return V(this, null, function* () {
      try {
        let r = yield fn(
            Bu(`${Bi}/template-php/defaut/fetch.php`, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: Bi,
              },
              body: `query=${encodeURIComponent(t)}`,
            }),
            8e3,
            `search ${t.slice(0, 30)}`,
          ),
          i = fc.default.load(r),
          u = [];
        return (
          i('a[href*="/catalogue/"]').each((a, c) => {
            let p = i(c)
              .attr("href")
              .match(/\/catalogue\/([^/]+)\/?/);
            if (!p) return;
            let h = p[1];
            if (u.some((b) => b.slug === h)) return;
            let g = i(c).find(".asn-search-result-title").text().trim(),
              _ = i(c).find(".asn-search-result-subtitle").text().trim(),
              v = IC(g, _, t);
            u.push({ slug: h, title: g, subtitle: _, score: v });
          }),
          u.sort((a, c) => c.score - a.score),
          u.filter((a) => a.score >= 15).map((a) => a.slug)
        );
      } catch (r) {
        return [];
      }
    });
  }
  function IC(t, r, i) {
    let u = i
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
      a = t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
      c = r
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
      l = 0;
    if (a === u) return 100;
    if ((a.includes(u) || u.includes(a)) && cc(a, u)) return 0;
    if (a.includes(u)) l += 60;
    else if (u.includes(a)) {
      let g = u.split(/[^a-z0-9]+/).filter((v) => v.length > 3).length,
        _ = a.split(/[^a-z0-9]+/).filter((v) => v.length > 3).length;
      g > 1 && _ <= 1 ? (l += 10) : (l += 50);
    }
    let p = u.split(/[^a-z0-9]+/).filter((g) => g.length > 3),
      h = a.split(/[^a-z0-9]+/).filter((g) => g.length > 3);
    for (let g of p) h.includes(g) && (l += 15);
    for (let g of p) c.includes(g) && !a.includes(g) && (l += 3);
    return (
      p.length >= 3 && h.length <= 1
        ? (l = Math.min(l, 5))
        : p.length >= 2 && h.length <= 1 && (l = Math.min(l, 10)),
      p.length === 1 && h.length > 1 && a !== u && (l = Math.min(l, 10)),
      l
    );
  }
  function y2(t, r) {
    if (!t || !r) return !1;
    let i = t.indexOf(r);
    for (; i !== -1;) {
      let u = i === 0 || t[i - 1] === " ",
        a = i + r.length >= t.length || t[i + r.length] === " ";
      if (u && a) return !0;
      i = t.indexOf(r, i + 1);
    }
    return !1;
  }
  function MC(t, r) {
    let i = Ti(r),
      u = Ti(t);
    return !i || !u
      ? 0
      : u === i
        ? 100
        : (y2(u, i) || y2(i, u)) && !cc(u, i)
          ? 80
          : 0;
  }
  function NC(t, r) {
    let i = 0;
    for (let u of r || []) {
      if (typeof u != "string" || !u) continue;
      let a = MC(t, u);
      if (a > i && ((i = a), i >= 100)) break;
    }
    return i;
  }
  function kC(t) {
    let r = [],
      i = /panneauAnime\(\s*["']([^"']*)["']\s*,\s*["']([^"']+)["']\s*\)/g,
      u;
    for (; (u = i.exec(t)) !== null;) {
      let a = u[2].replace(/^\/+|\/+$/g, "");
      !/\//.test(a) || a === "url" || r.includes(a) || r.push(a);
    }
    return r;
  }
  function hc(t) {
    return V(this, null, function* () {
      if (vs.has(t)) return vs.get(t);
      let r = null;
      try {
        r = yield Bu(`${Bi}/catalogue/${t}/`);
      } catch (u) {
        r = null;
      }
      let i = { title: null, paths: null };
      if (r && r.length >= 500 && !/acc[eè]s\s+introuvable/i.test(r)) {
        try {
          let a = fc.default.load(r),
            c = (
              a("#titreOeuvre").first().text() || a("h1").first().text()
            ).trim(),
            l = a("title").first().text().trim();
          i.title = c || (l ? l.split("|")[0].trim() : null);
        } catch (a) {}
        let u = kC(r);
        i.paths = u.length > 0 ? u : null;
      }
      return (vs.set(t, i), i);
    });
  }
  function UC(t) {
    return V(this, null, function* () {
      return (yield hc(t)).title;
    });
  }
  function PC(t, r, i) {
    let u = new RegExp(`^(saison${r}(?:-\\d+)?)/${i}$`, "i");
    return t.map((a) => (a.match(u) || [])[1]).filter(Boolean);
  }
  function D2(t, r, i) {
    let u = ["vostfr", "vf", "vf1", "vf2"];
    if (!t) return ["vostfr", "vf"];
    let a =
        i === "movie"
          ? /^film\d*\//
          : new RegExp(`^saison${r}(?:-\\d+)?/`, "i"),
      c = new Set(
        t.filter((l) => a.test(l)).map((l) => l.split("/").pop().toLowerCase()),
      );
    return u.filter((l) => c.has(l));
  }
  function A2(t, r, i, u) {
    return V(this, null, function* () {
      if (Xt(i) || ee(u, je)) return !1;
      let a = yield UC(t);
      if (!a)
        return (
          console.log(
            `[Anime-Sama] Slug ${t} rejet\xE9: page catalogue sans titre (404/soft-404)`,
          ),
          !1
        );
      let c = NC(a, r);
      return c < OC
        ? (console.log(
            `[Anime-Sama] Slug ${t} rejet\xE9: titre page "${a}" sans rapport (score ${c})`,
          ),
          !1)
        : (console.log(
            `[Anime-Sama] Slug ${t}: titre page "${a}" valid\xE9 (score ${c})`,
          ),
          !0);
    });
  }
  function b2(t, r) {
    let i = (r || "").toLowerCase();
    return i.includes("vidmoly") || i.includes("ansembed")
      ? "Vidmoly"
      : E2.some((u) => i.includes(u))
        ? "VOE"
        : C2.some((u) => i.includes(u))
          ? "Earnvids"
          : i.includes("uqload")
            ? "Uqload"
            : i.includes("oneupload")
              ? "OneUpload"
              : i.includes("sibnet")
                ? "Sibnet"
                : i.includes("sendvid")
                  ? "Sendvid"
                  : i.includes("vk.com") || i.includes("vkvideo")
                    ? "VK"
                    : i.includes("dailymotion")
                      ? "Dailymotion"
                      : i.includes("stape") || i.includes("streamtape")
                        ? "Streamtape"
                        : i.includes("dood")
                          ? "Doodstream"
                          : /embed4me|player4me|4meplayer/.test(i)
                            ? "Embed4me"
                            : "Player";
  }
  function Tn(t) {
    var a;
    let r = /var\s+([a-z0-9]+)\s*=\s*\[([\s\S]*?)\s*\];/gm,
      i = [],
      u;
    for (; (u = r.exec(t)) !== null;) {
      let c =
        ((a = u[2].match(/['"]([^'"]+)['"]/g)) == null
          ? void 0
          : a.map((l) => l.slice(1, -1))) || [];
      i.push({ varName: u[1], urls: c });
    }
    return i;
  }
  function Jr(t, r, i) {
    return V(this, null, function* () {
      if (ys) return null;
      let u = `${Bi}/catalogue/${t}${r ? "/" + r : ""}/${i}/episodes.js?filever=${Date.now()}`;
      try {
        return (
          (yield fn(
            Bu(u, { headers: { Referer: `${Bi}/catalogue/${t}${r ? "/" + r : ""}/${i}/` } }),
            8e3,
            `fetchJs ${t}`,
          )) || null
        );
      } catch (a) {
        return (
          /Cloudflare block/.test((a && a.message) || "") && (ys = !0),
          null
        );
      }
    });
  }
  function w2(t) {
    let r = t || "";
    for (let [i, u] of HC) if (i.test(r)) return u;
    return 4;
  }
  function GC(t) {
    return !t ||
      typeof t != "string" ||
      /acc[eè]s\s+introuvable/i.test(t) ||
      /<html/i.test(t)
      ? !1
      : /var\s+eps/i.test(t);
  }
  function VC(t) {
    return !t ||
      typeof t != "string" ||
      /acc[eè]s\s+introuvable/i.test(t) ||
      /<html/i.test(t)
      ? !1
      : Tn(t).length > 0 || /iframe|player|embed|https?:\/\//i.test(t);
  }
  function WC(t) {
    let r = (t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return /\b(le|la|les|de|des|du|un|une|et|au|aux|dans|pour|avec|sans|sous|sur|par|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs|je|tu|il|elle|nous|vous|ils|elles|qui|que|est|sont|film|nom|noms)\b/.test(
      r,
    );
  }
  function zC(t) {
    let r = (t || "").split(/[^A-Za-z0-9]+/).filter(Boolean);
    return r.length >= 1 && r.length <= 3;
  }
  function jC(t, r, i) {
    let u = new Set(),
      a = [],
      c = (g) => {
        if (!g) return;
        let _ = _s(g),
          v = _.toLowerCase();
        !_ || u.has(v) || (u.add(v), a.push(_));
      };
    if (i === "movie") for (let g of r) c(g);
    let l = [],
      p = [],
      h = [];
    for (let g of t) {
      let _ = _s(g),
        v = (_ || "").toLowerCase();
      !_ ||
        u.has(v) ||
        (u.add(v), WC(_) ? l.push(_) : zC(_) ? p.push(_) : h.push(_));
    }
    return a.concat(l, p, h);
  }
  function JC(t, r, i, u) {
    return V(this, null, function* () {
      for (let a of ["vostfr", "vf"]) {
        if (Xt(i) || ee(u, je)) return null;
        let c = yield Jr(t, `saison${r}`, a);
        if (GC(c)) return t;
      }
      return null;
    });
  }
  function KC(t, r, i) {
    return V(this, null, function* () {
      for (let u of ["film", "film2"])
        for (let a of ["vostfr", "vf"]) {
          if (Xt(r) || ee(i, je)) return null;
          let c = yield Jr(t, u, a);
          if (VC(c)) return t;
        }
      return null;
    });
  }
  function qi(t, r, i, u) {
    return V(this, null, function* () {
      let c = [],
        l = Date.now(),
        p = 12e3,
        h = t.slice().sort((g, _) => w2(g.urls[u] || "") - w2(_.urls[u] || ""));
      for (let { varName: g, urls: _ } of h) {
        if (c.length >= 2 || Date.now() - l > p) break;
        let v = _[u];
        if (!v || !v.startsWith("http") || $C.test(v)) continue;
        let b = i ? `Ep ${i} - ` : "";
        try {
          let w = yield fn(
            qu({
              name: `Anime-Sama (${r.toUpperCase()})`,
              title: `${b2(g, v)} - ${b}${r.toUpperCase()}`,
              url: v,
              quality: "HD",
              headers: { Referer: Bi },
            }),
            8e3,
            `AnimeSama player ${b2(g, v)}`,
          );
          w && c.push(w);
        } catch (w) {}
      }
      return c;
    });
  }
  function XC(p, h, g, _, v) {
    return V(this, arguments, function* (t, r, i, u, a, c = [], l = null) {
      let b = [u, ...c.filter((w) => w !== u)];
      if (a === "movie") {
        let w = l
          ? l
              .filter((x) => new RegExp(`^film\\d*/${r}$`, "i").test(x))
              .map((x) => x.split("/")[0])
          : ["film", "film2"];
        for (let x of w) {
          let C = yield Jr(t, x, r);
          if (!C) continue;
          let R = Tn(C);
          if (R.length === 0) continue;
          let T = yield qi(R, r, null, 0);
          if (T.length > 0) return T;
        }
        return [];
      }
      for (let w of b) {
        let x = l ? yield YC(t, r, PC(l, i, r), w) : yield ZC(t, r, i, w);
        if (x.length > 0) return x;
      }
      return [];
    });
  }
  function YC(t, r, i, u) {
    return V(this, null, function* () {
      let a = 0;
      for (let c of i) {
        let l = yield Jr(t, c, r);
        if (!l) return [];
        let p = Tn(l);
        if (p.length === 0) continue;
        let h = p[0].urls.length,
          g = u - a;
        if (g >= 1 && g <= h) return qi(p, r, u, g - 1);
        a += h;
      }
      return [];
    });
  }
  function ZC(t, r, i, u) {
    return V(this, null, function* () {
      let a = yield Jr(t, `saison${i}`, r);
      if (a) {
        let l = Tn(a);
        if (l.length > 0) {
          let p = l[0].urls.length;
          if (u >= 1 && u <= p) return qi(l, r, u, u - 1);
          let h = p,
            g = ["2", "3", "4", "5"];
          for (let _ of g) {
            let v = yield Jr(t, `saison${i}-${_}`, r);
            if (!v) continue;
            let b = Tn(v);
            if (b.length === 0) continue;
            let w = b[0].urls.length,
              x = u - h;
            if (x >= 1 && x <= w) return qi(b, r, u, x - 1);
            h += w;
          }
        }
      }
      let c = yield Jr(t, "", r);
      if (c) {
        let l = Tn(c);
        if (l.length > 0) {
          let p = u - 1;
          if (p >= 0 && p < l[0].urls.length) return qi(l, r, u, p);
        }
      }
      return [];
    });
  }
  function Li(t, r, i, u, a, c) {
    return V(this, null, function* () {
      let { title: l, paths: p } = yield hc(t);
      if (!l) return [];
      let h = [];
      for (let g of D2(p, r, u)) {
        if (h.length >= c) break;
        let _ = yield XC(t, g, r, i, u, a, p);
        h.push(..._);
      }
      return h;
    });
  }
  function x2(c, l, p, h) {
    return V(this, arguments, function* (t, r, i, u, a = {}) {
      let g = (a == null ? void 0 : a.signal) || null;
      if (Xt(g)) return [];
      (hh(g), vs.clear(), (ys = !1));
      let _ = yield d2(t, r, { season: i });
      if (_.length === 0) return [];
      let v = _.effectiveSeason != null ? _.effectiveSeason : i,
        b = Date.now(),
        w = yield _2(t, r, i, u, { startTime: b, budgetMs: je }),
        x = w.length > 1 ? [w[1]] : [],
        C = _[0],
        R = oc(C),
        T = [],
        I = 3,
        G = _.slice(0, BC).map((O) => _s(O));
      if (r === "movie")
        for (let O of [...G]) {
          let ut = O.replace(/\s*[-–:]?\s*(?:the\s+)?movie\b.*$/i, "")
            .replace(/\s*[-–:]?\s*(?:le\s+)?film\b.*$/i, "")
            .replace(/\s*[-–:]?\s*oav\b.*$/i, "")
            .trim();
          ut.length >= 3 && !G.includes(ut) && G.unshift(ut);
        }
      let M = new Set();
      if (
        (r !== "movie" &&
          !Xt(g) &&
          !ee(b, je) &&
          (M.add(R), T.push(...(yield Li(R, v, u, r, x, I)))),
        ys)
      )
        return (
          console.warn(
            "[Anime-Sama] episodes.js refus\xE9 par Cloudflare : arr\xEAt (0 flux, ce n'est pas un probl\xE8me de titre ni de saison)",
          ),
          []
        );
      if (T.length === 0 && v > 1 && !Xt(g) && !ee(b, je)) {
        let O = `${R}-saison-${v}`;
        (M.add(O), T.push(...(yield Li(O, v, u, r, x, I))));
      }
      if (T.length === 0 && v > 1 && !Xt(g) && !ee(b, je)) {
        let O = `${R}-${v}`;
        (M.add(O), T.push(...(yield Li(O, v, u, r, x, I))));
      }
      let P = [];
      if (T.length === 0 && !Xt(g) && !ee(b, je)) {
        for (let O of G) {
          let ut = yield RC(O);
          for (let lt of ut)
            if ((P.includes(lt) || P.push(lt), P.length >= v2)) break;
          if (P.length >= v2) break;
        }
        for (let O of P)
          if (!M.has(O)) {
            if ((M.add(O), T.length >= I)) break;
            (yield A2(O, _, g, b)) &&
              T.push(...(yield Li(O, v, u, r, x, I - T.length)));
          }
      }
      if (T.length === 0 && !Xt(g) && !ee(b, je)) {
        let O = new Set(M),
          ut = [];
        for (let lt of jC(_, G, r)) {
          if (ut.length >= FC) break;
          let At = oc(lt);
          At && !O.has(At) && (O.add(At), ut.push(At));
        }
        for (let lt of ut) {
          if (T.length >= I || Xt(g) || ee(b, je)) break;
          let { title: At, paths: Ft } = yield hc(lt);
          !At ||
            !(Ft
              ? D2(Ft, v, r).length > 0
              : r === "movie"
                ? yield KC(lt, g, b)
                : yield JC(lt, v, g, b)) ||
            ((yield A2(lt, _, g, b)) &&
              (console.log(`[Anime-Sama] Verified slug: ${lt}`),
              T.push(...(yield Li(lt, v, u, r, x, I - T.length)))));
        }
      }
      let H = T.filter((O) => O && O.isDirect);
      return (
        console.log(`[Anime-Sama] Total streams found: ${H.length}`),
        uh(H)
      );
    });
  }
  var fc,
    Bi,
    BC,
    v2,
    FC,
    je,
    OC,
    vs,
    E2,
    C2,
    ys,
    $C,
    HC,
    S2 = Yn(() => {
      ph();
      fc = Kf(nc());
      hn();
      g2();
      lc();
      lc();
      ((Bi = "https://anime-sama.to"),
        (BC = 5),
        (v2 = 2),
        (FC = 12),
        (je = 4e4));
      OC = 80;
      vs = new Map();
      ((E2 = [
        "voe.sx",
        "teresapoliticallearn",
        "megankiddifference",
        "jeremyparticipantanything",
        "jamesbornmain",
        "claireguessthousand",
        "derricknationtop",
      ]),
        (C2 = [
          "smoothpre",
          "morencius",
          "movearnpre",
          "earnvids",
          "minochinos",
        ]));
      ys = !1;
      (($C =
        /sibnet\.ru|oneupload\.|myvi\.|embed4me|player4me|4meplayer|sendvid/i),
        (HC = [
          [/vidmoly|ansembed/i, 0],
          [/uqload/i, 1],
          [new RegExp(E2.map((t) => t.replace(".", "\\.")).join("|"), "i"), 2],
          [new RegExp(C2.join("|"), "i"), 3],
        ]));
    });
  var QC = U((US, T2) => {
    S2();
    hn();
    T2.exports = {
      getStreams: sh("Anime-Sama", x2, {
        quality: { includeCodec: !0, includeFps: !0 },
      }),
    };
  });
  return QC();
})();
/*! Bundled license information:

eventemitter2/lib/eventemitter2.js:
  (*!
   * EventEmitter2
   * https://github.com/hij1nx/EventEmitter2
   *
   * Copyright (c) 2013 hij1nx
   * Licensed under the MIT license.
   *)

lodash/lodash.js:
  (**
   * @license
   * Lodash <https://lodash.com/>
   * Copyright OpenJS Foundation and other contributors <https://openjsf.org/>
   * Released under MIT license <https://lodash.com/license>
   * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
   * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
   *)
*/

if (typeof module !== "undefined" && module.exports) {
  module.exports = __provider;
}
if (__provider && __provider.getStreams) {
  if (typeof globalThis !== "undefined") {
    globalThis.getStreams = __provider.getStreams;
  }
  if (typeof global !== "undefined") {
    global.getStreams = __provider.getStreams;
  }
  if (typeof self !== "undefined") {
    self.getStreams = __provider.getStreams;
  }
}
