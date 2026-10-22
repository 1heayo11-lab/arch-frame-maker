/* ARCH attribute frame — GIF / MP4 / PNG export (ported from 무한루프 메인 메이커) */
"use strict";
(function () {
  const AE = window.ArchEngine;
  const LIMIT = { web: 15e6, app: 5e6 }, SAFE = 0.95, MAXF = 350;
  const FPSL = [{ fps: 25, cs: 4 }, { fps: 20, cs: 5 }, { fps: 100 / 6, cs: 6 }, { fps: 12.5, cs: 8 }, { fps: 10, cs: 10 }];
  const RUNGS = [[1280, 1], [1080, 1], [960, 1], [960, 2], [840, 2], [720, 2], [720, 3], [640, 3], [560, 3], [480, 3], [480, 4], [400, 4], [360, 4], [320, 4], [320, 4, 128], [320, 4, 64]];
  const even = (x) => Math.max(2, 2 * Math.round(x / 2));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function gifDims(ratio, size) {
    const [W, H] = AE.RATIOS[ratio], s = size / Math.max(W, H);
    const w = W * s, h = H * s, f = Math.min(1, 1280 / w, 1080 / h);
    return [even(w * f), even(h * f)];
  }
  function pickFps(T, maxFps) {
    const opts = FPSL.filter((o) => o.fps <= maxFps + 0.01);
    for (const o of opts) if (Math.round(T * o.fps) <= MAXF) return o;
    return FPSL[FPSL.length - 1];
  }
  function rungPlan(st, r) {
    const [w, h] = gifDims(st.ratio, r[0]), f = pickFps(st.loop, FPSL[r[1]].fps);
    return { w, h, cs: f.cs, fps: 100 / f.cs, frames: Math.max(2, Math.round((100 * st.loop) / f.cs)), colors: r[2] || 256, T: st.loop, dither: st.exp.dither };
  }
  function manualPlan(st) {
    const e = st.exp, [w, h] = gifDims(st.ratio, e.size), f = pickFps(st.loop, e.fps);
    return { w, h, cs: f.cs, fps: 100 / f.cs, frames: Math.max(2, Math.round((100 * st.loop) / f.cs)), colors: e.colors, T: st.loop, dither: e.dither };
  }
  const okBudget = (pl) => pl.w * pl.h * pl.frames <= 3e8 && pl.frames <= MAXF;
  let lib = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[data-src="${src}"]`)) return res();
      const s = document.createElement("script");
      s.src = src; s.async = true; s.dataset.src = src;
      s.onload = () => res(); s.onerror = () => rej(new Error("script"));
      document.head.appendChild(s);
    });
  }
  async function gifLib() {
    if (lib) return lib;
    try { lib = await import("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js"); return lib; } catch (e) { /* try UMD */ }
    try {
      const keep = window.exports; window.exports = {};
      await loadScript("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.js");
      const got = window.exports; window.exports = keep;
      if (got && got.GIFEncoder) { lib = got; return lib; }
    } catch (e) { /* fallthrough */ }
    throw new Error("GIF 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
  function dither(d, w, h, amp) {
    for (let y = 0; y < h; y++) {
      const row = (y & 3) * 4;
      let k = y * w * 4;
      for (let x = 0; x < w; x++, k += 4) { const t = BAYER[row + (x & 3)] * amp; d[k] += t; d[k + 1] += t; d[k + 2] += t; }
    }
  }
  const ditherAmp = (c) => (c >= 256 ? 9 : c >= 128 ? 14 : 22);
  function surface(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return { c, g: c.getContext("2d", { willReadFrequently: true }) }; }
  function paint(S, st, imgs, p) {
    const [W] = AE.RATIOS[st.ratio];
    S.g.setTransform(1, 0, 0, 1, 0, 0); S.g.clearRect(0, 0, S.c.width, S.c.height);
    AE.renderFrame(S.g, AE.RATIOS[st.ratio][0], AE.RATIOS[st.ratio][1], S.c.width / W, p, st, imgs, {});
  }
  async function palette(L, st, imgs, colors, w, h) {
    const sw = Math.max(48, Math.round(w / 3)), sh = Math.max(28, Math.round(h / 3)), S = surface(sw, sh), N = 12;
    const all = new Uint8ClampedArray(sw * sh * 4 * N);
    for (let i = 0; i < N; i++) { paint(S, st, imgs, (i + 0.5) / N); all.set(S.g.getImageData(0, 0, sw, sh).data, i * sw * sh * 4); if (i % 3 === 2) await tick(); }
    return L.quantize(all, colors - 1, { format: colors <= 64 ? "rgb444" : "rgb565" });
  }
  const depth = (n) => Math.max(2, Math.ceil(Math.log2(n)));
  async function estimate(st, imgs, stop) {
    const L = await gifLib(), T = st.loop, [w, h] = gifDims(st.ratio, 420);
    const pal = await palette(L, st, imgs, 256, w, h);
    if (stop()) return null;
    const S = surface(w, h), ti = pal.length, cd = depth(ti + 1);
    const idx = (p) => { paint(S, st, imgs, p); const d = S.g.getImageData(0, 0, w, h).data; if (st.exp.dither) dither(d, w, h, ditherAmp(256)); return L.applyPalette(d, pal, "rgb565"); };
    const enc = L.GIFEncoder();
    enc.writeFrame(idx(0.07), w, h, { palette: pal, delay: 50, repeat: 0, colorDepth: cd, dispose: 1 });
    const est = { key: enc.bytesView().length, mw: w, mh: h, delta: {} };
    const css = [...new Set(RUNGS.map((r) => pickFps(T, FPSL[r[1]].fps).cs))];
    for (const cs of css) {
      const F = Math.max(2, Math.round((100 * T) / cs)), dt = 1 / F;
      let tot = 0, cnt = 0;
      for (let q = 0; q < 5; q++) {
        const p = (q + 0.37) / 5, a = idx(p), b = idx(p + dt), d = new Uint8Array(b.length);
        let same = true;
        for (let i = 0; i < b.length; i++) if (b[i] === a[i]) d[i] = ti; else { d[i] = b[i]; same = false; }
        cnt++;
        if (same) continue;
        const before = enc.bytesView().length;
        enc.writeFrame(d, w, h, { delay: 50, transparent: true, transparentIndex: ti, colorDepth: cd, dispose: 1 });
        tot += enc.bytesView().length - before;
        await tick();
        if (stop()) return null;
      }
      est.delta[cs] = cnt ? tot / cnt : 0;
    }
    return est;
  }
  function predict(est, pl) {
    if (!est) return null;
    const area = ((pl.w * pl.h) / (est.mw * est.mh)) * 0.82, cf = pl.colors >= 256 ? 1 : pl.colors >= 128 ? 0.87 : 0.74;
    const dl = est.delta[pl.cs] != null ? est.delta[pl.cs] : est.key * 0.5;
    return Math.round((est.key + Math.max(0, pl.frames - 1) * dl) * area * cf + 900);
  }
  function autoPlan(st, est, limit) {
    let last = null;
    for (const r of RUNGS) {
      const pl = rungPlan(st, r);
      if (!okBudget(pl)) continue;
      pl.est = predict(est, pl); last = pl;
      if (pl.est == null || pl.est <= limit * 0.9) return pl;
    }
    return last;
  }
  function nextRung(st, cur) {
    const vol = cur.w * cur.h * cur.frames * (cur.colors / 256);
    for (const r of RUNGS) { const pl = rungPlan(st, r); if (okBudget(pl) && pl.w * pl.h * pl.frames * (pl.colors / 256) < vol * 0.9) return pl; }
    return null;
  }
  async function encodeGif(st, imgs, pl, onProg, stop, limit) {
    const L = await gifLib();
    onProg(0, "색을 고르는 중");
    const pal = await palette(L, st, imgs, pl.colors, pl.w, pl.h), ti = pal.length, cd = depth(ti + 1), fmt = pl.colors <= 64 ? "rgb444" : "rgb565";
    const S = surface(pl.w, pl.h), enc = L.GIFEncoder();
    let prev = null, pend = null, first = true;
    const flush = () => {
      if (!pend) return;
      enc.writeFrame(pend.idx, pl.w, pl.h, first ? { palette: pal, delay: pend.cs * 10, repeat: 0, colorDepth: cd, dispose: 1 } : { delay: pend.cs * 10, transparent: true, transparentIndex: ti, colorDepth: cd, dispose: 1 });
      first = false;
    };
    for (let f = 0; f < pl.frames; f++) {
      if (stop()) throw Object.assign(new Error("cancel"), { cancel: true });
      paint(S, st, imgs, f / pl.frames);
      const d = S.g.getImageData(0, 0, pl.w, pl.h).data;
      if (pl.dither) dither(d, pl.w, pl.h, ditherAmp(pl.colors));
      const ix = L.applyPalette(d, pal, fmt);
      if (prev) {
        let same = true;
        const dd = new Uint8Array(ix.length);
        for (let i = 0; i < ix.length; i++) if (ix[i] === prev[i]) dd[i] = ti; else { dd[i] = ix[i]; same = false; }
        if (same) pend.cs += pl.cs; else { flush(); pend = { idx: dd, cs: pl.cs }; }
      } else pend = { idx: ix, cs: pl.cs };
      prev = ix;
      if (limit && f % 4 === 3 && f + 1 >= Math.max(24, pl.frames * 0.4) && f + 1 < pl.frames) {
        const proj = (enc.bytesView().length / (f + 1)) * pl.frames;
        if (proj > limit * 1.15) throw Object.assign(new Error("over"), { over: true, proj });
      }
      if (f % 2 === 1 || f === pl.frames - 1) { onProg((f + 1) / pl.frames, `프레임 ${f + 1} / ${pl.frames}`); await tick(); }
    }
    flush();
    enc.finish();
    return new Blob([enc.bytes()], { type: "image/gif" });
  }
  async function makeGif(st, imgs, onProg, stop) {
    const limit = LIMIT[st.exp.target] || LIMIT.web;
    let pl;
    if (st.exp.auto) {
      onProg(0, "용량을 가늠하는 중");
      const est = await estimate(st, imgs, stop);
      if (stop()) throw Object.assign(new Error("cancel"), { cancel: true });
      pl = autoPlan(st, est, limit);
    } else pl = manualPlan(st);
    let blob = null, tries = 0;
    for (;;) {
      tries++;
      try {
        blob = await encodeGif(st, imgs, pl, (v, m) => onProg(v, tries > 1 ? `${m} · ${tries}번째 맞춤` : m), stop, st.exp.auto ? limit : 0);
      } catch (e) {
        if (e && e.over && st.exp.auto) { const nx = nextRung(st, pl); if (nx) { pl = nx; continue; } }
        throw e;
      }
      if (!st.exp.auto || blob.size <= limit * SAFE) break;
      const nx = nextRung(st, pl);
      if (!nx) break;
      pl = nx;
    }
    return { blob, plan: pl, ext: "gif", over: blob.size > limit * SAFE && st.exp.auto, limit };
  }
  // ---------- MP4 ----------
  const AVC = ["avc1.640033", "avc1.64002A", "avc1.640028", "avc1.4D4033", "avc1.4D0028", "avc1.42E033", "avc1.42E028", "avc1.420028", "avc1.42001f"];
  const VP9 = ["vp09.00.41.08", "vp09.00.40.08", "vp09.00.31.08"];
  function mp4Plan(st) {
    const [W, H] = AE.RATIOS[st.ratio], q = st.exp.mp4q === "720" ? 720 : 1080, cap = q === 1080 ? 1920 : 1280;
    let s = q / Math.min(W, H), w = W * s, h = H * s;
    const f = Math.min(1, cap / Math.max(w, h)); w = even(w * f); h = even(h * f);
    const fps = st.exp.mp4fps, per = Math.round(st.loop * fps), rep = Math.max(1, st.exp.repeat | 0);
    const bitrate = Math.min(16e6, Math.max(3e6, Math.round(w * h * fps * (q === 1080 ? 0.16 : 0.2))));
    return { w, h, fps, per, frames: per * rep, rep, T: st.loop, dur: (per * rep) / fps, bitrate };
  }
  function recMime(mp4) {
    if (typeof MediaRecorder === "undefined") return null;
    return (mp4 ? ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1", "video/mp4"] : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]).find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || null;
  }
  async function encodeWebCodecs(st, imgs, pl, codecs, kind, onProg, stop) {
    onProg(0, "영상 도구 불러오는 중");
    await loadScript("https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.js");
    const MM = window.Mp4Muxer;
    if (!MM) throw new Error("muxer");
    let cfg = null;
    for (const codec of codecs) {
      const c = { codec, width: pl.w, height: pl.h, bitrate: pl.bitrate, framerate: pl.fps };
      if (kind === "avc") c.avc = { format: "avc" };
      try { const r = await VideoEncoder.isConfigSupported(c); if (r && r.supported) { cfg = c; break; } } catch (e) { /* next */ }
    }
    if (!cfg) throw new Error("no " + kind);
    const mux = new MM.Muxer({ target: new MM.ArrayBufferTarget(), video: { codec: kind, width: pl.w, height: pl.h, frameRate: pl.fps }, fastStart: "in-memory" });
    let err = null;
    const enc = new VideoEncoder({ output: (ch, meta) => mux.addVideoChunk(ch, meta), error: (e) => { err = e; } });
    enc.configure(cfg);
    const S = surface(pl.w, pl.h);
    try {
      for (let f = 0; f < pl.frames; f++) {
        if (stop()) throw Object.assign(new Error("cancel"), { cancel: true });
        if (err) throw err;
        paint(S, st, imgs, (f % pl.per) / pl.per);
        const vf = new VideoFrame(S.c, { timestamp: Math.round((1e6 * f) / pl.fps), duration: Math.round(1e6 / pl.fps) });
        enc.encode(vf, { keyFrame: f % (2 * pl.fps) === 0 });
        vf.close();
        while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 4));
        if (f % 3 === 0 || f === pl.frames - 1) { onProg(((f + 1) / pl.frames) * 0.97, `프레임 ${f + 1} / ${pl.frames}`); await tick(); }
      }
      onProg(0.98, "마무리하는 중");
      await enc.flush();
      if (err) throw err;
      mux.finalize();
    } finally { try { enc.close(); } catch (e) { /* closed */ } }
    return { blob: new Blob([mux.target.buffer], { type: "video/mp4" }), ext: "mp4", note: kind === "vp9" ? "VP9 코덱이라 일부 기기 기본 앱에서는 열리지 않을 수 있어요." : "" };
  }
  async function encodeRecorder(st, imgs, pl, mime, onProg, stop) {
    const S = surface(pl.w, pl.h);
    paint(S, st, imgs, 0);
    const stream = S.c.captureStream(pl.fps), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: pl.bitrate }), parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const done = new Promise((r) => { rec.onstop = r; });
    rec.start(250);
    const t0 = performance.now();
    await new Promise((res, rej) => {
      const step = () => {
        if (stop()) { try { rec.stop(); } catch (e) { /* stopped */ } return rej(Object.assign(new Error("cancel"), { cancel: true })); }
        const t = (performance.now() - t0) / 1000;
        if (t >= pl.dur) return res();
        paint(S, st, imgs, (t % pl.T) / pl.T);
        onProg(t / pl.dur, `실시간 녹화 중 ${t.toFixed(1)} / ${pl.dur.toFixed(1)}초`);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    rec.stop(); await done;
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    return { blob: new Blob(parts, { type: mime.split(";")[0] }), ext, note: ext === "webm" ? "이 브라우저에서는 WebM으로 저장돼요. X에 올리려면 크롬이나 사파리 최신 버전에서 MP4로 만들어 주세요." : "" };
  }
  async function makeMp4(st, imgs, onProg, stop) {
    const pl = mp4Plan(st), wc = typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
    let out = null;
    if (wc) { try { out = await encodeWebCodecs(st, imgs, pl, AVC, "avc", onProg, stop); } catch (e) { if (e && e.cancel) throw e; } }
    if (!out) { const m = recMime(true); if (m) out = await encodeRecorder(st, imgs, pl, m, onProg, stop); }
    if (!out && wc) { try { out = await encodeWebCodecs(st, imgs, pl, VP9, "vp9", onProg, stop); } catch (e) { if (e && e.cancel) throw e; } }
    if (!out) { const m = recMime(false); if (!m) throw new Error("이 브라우저는 영상 저장을 지원하지 않아요. 크롬이나 사파리 최신 버전에서 열어 주세요."); out = await encodeRecorder(st, imgs, pl, m, onProg, stop); }
    return Object.assign(out, { plan: pl });
  }
  async function makePng(st, imgs, p) {
    const [W, H] = AE.RATIOS[st.ratio], sc = st.exp.png === 2 ? 2 : 1, S = surface(W * sc, H * sc);
    paint(S, st, imgs, p);
    const blob = await new Promise((res, rej) => S.c.toBlob((b) => (b ? res(b) : rej(new Error("PNG를 만들지 못했어요."))), "image/png"));
    return { blob, ext: "png", plan: { w: W * sc, h: H * sc } };
  }
  window.ArchExport = { LIMIT, SAFE, gifDims, manualPlan, mp4Plan, makeGif, makeMp4, makePng, FPSL };
})();
