/* ARCH attribute frame — render engine */
"use strict";
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (x) => x - Math.floor(x);
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function hsh(a, b) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(((b | 0) + 0x632be5ab) | 0, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let t = (seed * 4294967296) >>> 0 || 1;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function rgb(hex) {
  hex = String(hex || "#000").replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const n = parseInt(hex.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mk(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  c.g = c.getContext("2d");
  return c;
}

/* ---------- data ---------- */
const RATIOS = { "16:9": [1920, 1080], "2:1": [2160, 1080], "3:1": [2400, 800], "4:3": [1440, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] };
const SLOT_R = { "3:4": 3 / 4, "4:5": 4 / 5, "2:3": 2 / 3, "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9, fill: 0 };
const ATTR_ORDER = ["fire", "water", "wind", "lightning", "ice", "grass", "neutral"];
const ATTRS = {
  fire: { en: "FIRE", kr: "불", dark: { main: "#FF6A2C", hi: "#FFC35E", core: "#FFF2CC", deep: "#C9341C" }, light: { main: "#D2452A", hi: "#EE8A3A", core: "#FFD9A0", deep: "#8E1F18" } },
  water: { en: "WATER", kr: "물", dark: { main: "#3A9BF0", hi: "#8FD3FF", core: "#E8F8FF", deep: "#1A5BB8" }, light: { main: "#2B7FD0", hi: "#5DB2F0", core: "#CDEBFF", deep: "#164C96" } },
  wind: { en: "WIND", kr: "바람", dark: { main: "#2CC0B0", hi: "#8AF0E2", core: "#EAFFFB", deep: "#0F7F78" }, light: { main: "#14968C", hi: "#3CC4B6", core: "#C6F2EC", deep: "#0B605B" } },
  lightning: { en: "LIGHTNING", kr: "번개", dark: { main: "#F0C040", hi: "#FFE58A", core: "#FFFDF0", deep: "#B07A10" }, light: { main: "#C8961E", hi: "#E8BC3C", core: "#FFF1B8", deep: "#7E5A0A" } },
  ice: { en: "ICE", kr: "얼음", dark: { main: "#7CC4F8", hi: "#CFEEFF", core: "#FFFFFF", deep: "#3F82C4" }, light: { main: "#4E9AD8", hi: "#8CC6F0", core: "#E4F4FF", deep: "#2C64A0" } },
  grass: { en: "GRASS", kr: "풀", dark: { main: "#7CC046", hi: "#C4EE84", core: "#F4FFE2", deep: "#3F7A1E" }, light: { main: "#5E9A2E", hi: "#8CC24E", core: "#E2F6C4", deep: "#355F16" } },
  neutral: { en: "NEUTRAL", kr: "무속성", dark: { main: "#BFC4CE", hi: "#E9ECF2", core: "#FFFFFF", deep: "#7A808C" }, light: { main: "#80868F", hi: "#A9AEB7", core: "#E8EAEE", deep: "#4E535B" } },
};
const TONES = {
  obsidian: { kr: "흑요석", dark: true, bg0: "#171A20", bg1: "#060709", smoke: "#C4CAD6", smokeA: 0.07, line: "rgba(214,220,232,", ink: "#ECEEF3", sub: "#9AA1AE", slot: "rgba(255,255,255,0.035)" },
  midnight: { kr: "심야", dark: true, bg0: "#141C36", bg1: "#04060D", smoke: "#9DB3E6", smokeA: 0.08, line: "rgba(196,210,240,", ink: "#E8EDFA", sub: "#93A0C2", slot: "rgba(200,215,255,0.04)" },
  album: { kr: "화이트", dark: false, bg0: "#FFFFFF", bg1: "#E6E8EC", smoke: "#2A2E36", smokeA: 0.05, line: "rgba(24,26,32,", ink: "#16181D", sub: "#5E636D", slot: "rgba(20,24,32,0.04)" },
};
const RANKS = ["F", "E", "D", "C", "B", "A", "S", "SS"];
function mixHex(a, b, t) { const A = rgb(a), B = rgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
function lumOf(hex) { const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const _ct = new Map();
function customTone(hex) {
  let t = _ct.get(hex);
  if (t) return t;
  const dark = lumOf(hex) < 0.3;
  t = dark
    ? { kr: "색", dark: true, bg0: mixHex(hex, "#FFFFFF", 0.1), bg1: mixHex(hex, "#000000", 0.62), smoke: mixHex(hex, "#FFFFFF", 0.65), smokeA: 0.08, line: "rgba(232,236,244,", ink: "#EEF1F6", sub: mixHex(hex, "#FFFFFF", 0.62), slot: "rgba(255,255,255,0.04)" }
    : { kr: "색", dark: false, bg0: mixHex(hex, "#FFFFFF", 0.45), bg1: mixHex(hex, "#000000", 0.1), smoke: mixHex(hex, "#000000", 0.65), smokeA: 0.06, line: "rgba(22,24,30,", ink: "#16181D", sub: mixHex(hex, "#000000", 0.55), slot: "rgba(0,0,0,0.04)" };
  _ct.set(hex, t);
  return t;
}
function attrTone(a, b, light) {
  const key = a + "|" + b + "|" + (light ? 1 : 0);
  let t = _ct.get(key);
  if (t) return t;
  const A = ATTRS[a] || ATTRS.neutral, B = ATTRS[b] || ATTRS.neutral;
  if (light) {
    const ca = mixHex(A.light.hi, "#FFFFFF", 0.7), cb = mixHex(B.light.hi, "#FFFFFF", 0.7);
    t = { kr: "속성", dark: false, bg0: "#FFFFFF", bg1: mixHex(mixHex(ca, cb, 0.5), "#D9DDE4", 0.5), smoke: "#2A2E36", smokeA: 0.045, line: "rgba(22,24,30,", ink: "#16181D", sub: "#59606B", slot: "rgba(0,0,0,0.04)",
      grad: { a: ca, b: cb, mid: mixHex(mixHex(ca, cb, 0.5), "#FFFFFF", 0.55), ga: A.light.hi, gb: B.light.hi } };
  } else {
    const ca = mixHex(A.dark.deep, "#05060A", 0.6), cb = mixHex(B.dark.deep, "#05060A", 0.6);
    t = { kr: "속성", dark: true, bg0: mixHex(mixHex(ca, cb, 0.5), "#1A1D24", 0.5), bg1: "#06070A", smoke: "#C9CFDA", smokeA: 0.06, line: "rgba(226,231,240,", ink: "#EEF1F6", sub: "#A3AAB7", slot: "rgba(255,255,255,0.04)",
      grad: { a: ca, b: cb, mid: mixHex(mixHex(ca, cb, 0.5), "#07080B", 0.55), ga: A.dark.main, gb: B.dark.main } };
  }
  _ct.set(key, t);
  return t;
}
function toneOf(st) {
  if (st.tone === "custom") return customTone(st.toneColor || "#1E2A44");
  if (st.tone === "attr") { const [a, b] = sideAttrs(st); return attrTone(a, b, st.attrBg === "light"); }
  return TONES[st.tone] || TONES.obsidian;
}
const FONTS = [
  { f: "Cinzel", w: [400, 500, 600, 700, 800, 900], c: "serif", kr: "시넬 · 고전 대문자" },
  { f: "Cormorant Garamond", w: [400, 500, 600, 700], c: "serif", kr: "코모란트 · 우아한 세리프" },
  { f: "Marcellus SC", w: [400], c: "serif", kr: "마르셀루스 · 새김 대문자" },
  { f: "Italiana", w: [400], c: "serif", kr: "이탈리아나 · 가는 장식체" },
  { f: "Michroma", w: [400], c: "sans", kr: "미크로마 · 넓은 기계체" },
  { f: "Syncopate", w: [400, 700], c: "sans", kr: "싱코페이트 · 넓은 대문자" },
  { f: "Tenor Sans", w: [400], c: "sans", kr: "테너 산스 · 단정한 고딕" },
  { f: "Oswald", w: [400, 500, 600, 700], c: "sans", kr: "오스왈드 · 좁은 제목체" },
  { f: "Bebas Neue", w: [400], c: "sans", kr: "베바스 · 좁은 대문자" },
  { f: "Hahmlet", w: [300, 400, 500, 600, 700, 800], c: "serif", kr: "함렛 · 날카로운 명조" },
  { f: "Noto Serif KR", w: [400, 600, 700, 900], c: "serif", kr: "본명조" },
  { f: "Gowun Batang", w: [400, 700], c: "serif", kr: "고운바탕" },
  { f: "Nanum Myeongjo", w: [400, 700, 800], c: "serif", kr: "나눔명조" },
  { f: "Song Myung", w: [400], c: "serif", kr: "송명 · 붓 명조" },
  { f: "IBM Plex Sans KR", w: [300, 400, 500, 600, 700], c: "sans", kr: "플렉스 산스" },
  { f: "Noto Sans KR", w: [300, 400, 500, 700, 900], c: "sans", kr: "본고딕" },
  { f: "Black Han Sans", w: [400], c: "sans", kr: "검은고딕 · 굵은 제목" },
  { f: "Do Hyeon", w: [400], c: "sans", kr: "도현" },
  { f: "Nanum Pen Script", w: [400], c: "hand", kr: "나눔손글씨 펜" },
  { f: "IBM Plex Mono", w: [400, 500, 600], c: "sans", kr: "플렉스 모노 · 숫자" },
];
const FONTMAP = Object.fromEntries(FONTS.map((f) => [f.f, f]));
function famStack(f) {
  const F = FONTMAP[f] || { c: "serif" };
  const fb = F.c === "sans" ? '"IBM Plex Sans KR", "Noto Sans KR", sans-serif' : F.c === "hand" ? '"Nanum Pen Script", cursive' : '"Hahmlet", "Noto Serif KR", serif';
  return `"${f}", ${fb}`;
}
function fontStr(f, w, px, it) { return `${it ? "italic " : ""}${w} ${Math.max(1, px).toFixed(2)}px ${famStack(f)}`; }

/* ---------- art (icons, marks) ---------- */
const ART = { m: {}, b: {}, bpad: {}, ready: false };
async function loadArt(assets) {
  const jobs = Object.entries(assets).map(([key, a]) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = mk(img.naturalWidth, img.naturalHeight);
      c.g.drawImage(img, 0, 0);
      ART.m[key] = c;
      if (key !== "logo_big") {
        const pad = Math.round(Math.max(c.width, c.height) * 0.28);
        const big = mk(c.width + pad * 2, c.height + pad * 2);
        big.g.drawImage(c, pad, pad);
        const s1 = mk(big.width * 0.16, big.height * 0.16);
        s1.g.imageSmoothingQuality = "high";
        s1.g.drawImage(big, 0, 0, s1.width, s1.height);
        const s2 = mk(big.width * 0.5, big.height * 0.5);
        s2.g.imageSmoothingQuality = "high";
        s2.g.drawImage(s1, 0, 0, s2.width, s2.height);
        const out = mk(big.width, big.height);
        out.g.imageSmoothingQuality = "high";
        out.g.drawImage(s2, 0, 0, out.width, out.height);
        out.g.globalAlpha = 0.6;
        out.g.drawImage(big, 0, 0);
        ART.b[key] = out; ART.bpad[key] = pad;
      }
      res();
    };
    img.onerror = () => res();
    img.src = a.data;
  }));
  await Promise.all(jobs);
  ART.ready = true;
}
const _tint = new Map();
function tinted(key, color, blurred) {
  const id = key + "|" + color + "|" + (blurred ? 1 : 0);
  let c = _tint.get(id);
  if (c) return c;
  const src = (blurred ? ART.b : ART.m)[key];
  if (!src) return null;
  c = mk(src.width, src.height);
  c.g.drawImage(src, 0, 0);
  c.g.globalCompositeOperation = "source-in";
  c.g.fillStyle = color;
  c.g.fillRect(0, 0, c.width, c.height);
  _tint.set(id, c);
  return c;
}
function metal(key, dark) {
  const id = key + "|metal|" + (dark ? 1 : 0);
  let c = _tint.get(id);
  if (c) return c;
  const src = ART.m[key];
  if (!src) return null;
  c = mk(src.width, src.height);
  c.g.drawImage(src, 0, 0);
  c.g.globalCompositeOperation = "source-in";
  const gr = c.g.createLinearGradient(0, 0, 0, c.height);
  const stops = dark
    ? [[0, "#FFFFFF"], [0.42, "#DCE0E8"], [0.52, "#8D94A1"], [0.7, "#E9ECF1"], [1, "#B3B9C4"]]
    : [[0, "#3A3E46"], [0.42, "#70757F"], [0.52, "#121418"], [0.75, "#3F434B"], [1, "#1A1C21"]];
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  c.g.fillStyle = gr;
  c.g.fillRect(0, 0, c.width, c.height);
  _tint.set(id, c);
  return c;
}
const _glow = new Map();
function glowSpr(hex) {
  let c = _glow.get(hex);
  if (c) return c;
  c = mk(64, 64);
  const gr = c.g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(hex, 1)); gr.addColorStop(0.28, rgba(hex, 0.45)); gr.addColorStop(0.6, rgba(hex, 0.12)); gr.addColorStop(1, rgba(hex, 0));
  c.g.fillStyle = gr; c.g.fillRect(0, 0, 64, 64);
  _glow.set(hex, c);
  return c;
}
const _flame = new Map();
function flameSpr(pal, inner) {
  const id = pal.main + pal.deep + pal.hi + (inner ? "i" : "o");
  let c = _flame.get(id);
  if (c) return c;
  c = mk(64, 160);
  const g = c.g;
  g.beginPath();
  g.moveTo(33, 0);
  g.bezierCurveTo(36, 40, 62, 84, 60, 122);
  g.bezierCurveTo(58, 150, 44, 160, 32, 160);
  g.bezierCurveTo(20, 160, 6, 150, 4, 122);
  g.bezierCurveTo(2, 92, 22, 60, 33, 0);
  g.closePath();
  const gr = g.createLinearGradient(0, 160, 0, 0);
  if (!inner) {
    gr.addColorStop(0, rgba(pal.hi, 0.9)); gr.addColorStop(0.18, rgba(pal.main, 0.9)); gr.addColorStop(0.5, rgba(pal.main, 0.6));
    gr.addColorStop(0.8, rgba(pal.deep, 0.25)); gr.addColorStop(1, rgba(pal.deep, 0));
  } else {
    gr.addColorStop(0, rgba(pal.core, 0.95)); gr.addColorStop(0.35, rgba(pal.hi, 0.7)); gr.addColorStop(1, rgba(pal.hi, 0));
  }
  g.fillStyle = gr; g.fill();
  _flame.set(id, c);
  return c;
}
let _noise = null;
function noiseTex() {
  if (_noise) return _noise;
  const w = 320, h = 180, c = mk(w, h), id = c.g.createImageData(w, h);
  const R = rng(0.4242);
  const G = 24, grid = [];
  for (let i = 0; i < (G + 1) * (G + 1); i++) grid.push(R());
  const v = (x, y) => {
    const xi = Math.floor(x) % G, yi = Math.floor(y) % G, xf = x - Math.floor(x), yf = y - Math.floor(y);
    const a = grid[yi * (G + 1) + xi], b = grid[yi * (G + 1) + xi + 1], cc = grid[(yi + 1) * (G + 1) + xi], d = grid[(yi + 1) * (G + 1) + xi + 1];
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    return lerp(lerp(a, b, sx), lerp(cc, d, sx), sy);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0, amp = 0.55, f = 1 / 40;
    for (let o = 0; o < 5; o++) { n += amp * v(x * f + o * 3.1, y * f + o * 1.7); amp *= 0.5; f *= 2.05; }
    let m = Math.abs(n - 0.5) * 2;
    m = Math.pow(1 - m, 3.2);
    const k = (y * w + x) * 4;
    id.data[k] = id.data[k + 1] = id.data[k + 2] = 255;
    id.data[k + 3] = Math.round(clamp(m, 0, 1) * 255);
  }
  c.g.putImageData(id, 0, 0);
  _noise = c;
  return c;
}

/* ---------- geometry ---------- */
function shapePoly(x, y, w, h, shape, u) {
  if (shape === "chamfer") {
    const c = Math.min(26 * u, w * 0.09, h * 0.09);
    return [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]];
  }
  if (shape === "round") {
    const r = Math.min(30 * u, w * 0.12, h * 0.12), pts = [];
    const arc = (cx, cy, a0) => { for (let k = 0; k <= 6; k++) { const a = a0 + (k / 6) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    arc(x + r, y + r, Math.PI); arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2);
    return pts;
  }
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}
const _paths = new Map();
function getPath(poly, step) {
  const key = step.toFixed(2) + ":" + poly.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(";");
  let P = _paths.get(key);
  if (P) return P;
  if (_paths.size > 60) _paths.clear();
  const N = poly.length, seg = [];
  let L = 0;
  for (let i = 0; i < N; i++) {
    const a = poly[i], b = poly[(i + 1) % N], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push({ a, b, len, L0: L }); L += len;
  }
  const n = Math.max(16, Math.round(L / step)), ds = L / n;
  const x = new Float32Array(n), y = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
  let si = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (si < seg.length - 1 && s > seg[si].L0 + seg[si].len) si++;
    const sg = seg[si], t = sg.len ? (s - sg.L0) / sg.len : 0;
    x[i] = lerp(sg.a[0], sg.b[0], t); y[i] = lerp(sg.a[1], sg.b[1], t);
  }
  const rtx = new Float32Array(n), rty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    let dx = x[b] - x[a], dy = y[b] - y[a];
    const d = Math.hypot(dx, dy) || 1;
    rtx[i] = dx / d; rty[i] = dy / d;
  }
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0;
    for (let k = -3; k <= 3; k++) { const j = (i + k + n) % n; sx += rtx[j]; sy += rty[j]; }
    const d = Math.hypot(sx, sy) || 1;
    tx[i] = sx / d; ty[i] = sy / d; nx[i] = ty[i]; ny[i] = -tx[i];
  }
  // corners: high turning
  const turn = new Float32Array(n), W = 4, corners = [];
  for (let i = 0; i < n; i++) {
    const a = (i - W + n) % n, b = (i + W) % n;
    turn[i] = Math.abs(Math.atan2(rtx[a] * rty[b] - rty[a] * rtx[b], rtx[a] * rtx[b] + rty[a] * rty[b]));
  }
  const used = new Uint8Array(n);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => turn[b] - turn[a]);
  const span = Math.max(6, Math.round(n * 0.02));
  for (const i of order) {
    if (turn[i] < 0.35 || corners.length >= 12) break;
    if (used[i]) continue;
    corners.push(i);
    for (let k = -span * 2; k <= span * 2; k++) used[(i + k + n) % n] = 1;
  }
  P = { x, y, tx, ty, nx, ny, n, L, step: ds, corners };
  _paths.set(key, P);
  return P;
}

/* ---------- layout ---------- */
function computeLayout(W, H, st) {
  const u = Math.min(W, H) / 1080, M = 46 * u;
  const em = st.emblem, narrow = W / H < 1.25;
  const corner = em.show && em.place === "corner", cpos = em.corner || "straddle";
  const mr = 84 * u * em.size, fpad = 24 * u;
  let ew = 0;
  if (em.show && !corner) ew = Math.min(232 * u * em.size, W * (narrow ? 0.17 : 0.15));
  const capOn = st.caption.show === "below";
  let tb = (st.arch.submark ? 140 : 96) * u;
  let bb = (capOn ? 268 + 20 * st.frame.reach : 120 + 34 * st.frame.reach) * u;
  let hres = ew ? ew + 30 * u : 0;
  if (corner) {
    const ext = mr * (cpos === "outside" ? 1.91 : cpos === "straddle" ? 1.25 : 0.43);
    hres = Math.max(0, ext + 14 * u + fpad - M);
    tb = Math.max(tb, ext + 14 * u + fpad);
    bb = Math.max(bb, ext + 14 * u + fpad);
  }
  const ax0 = M + hres, ax1 = W - ax0, ay0 = tb, ay1 = H - bb;
  const aw = ax1 - ax0, ah = ay1 - ay0;
  const n = clamp(st.layout.count | 0, 1, 4), r = SLOT_R[st.layout.slotRatio] || 0;
  const gap = st.layout.gap * u, shape = st.layout.shape;
  const slots = [];
  let group, groupPoly, ownerAt, mode = st.layout.mode === "slant" && n > 1 ? "slant" : "side", bounds = [];
  const groupType = mode === "slant" || st.frame.mode !== "each";
  if (mode === "slant") {
    let gw, gh;
    if (r) { gw = Math.min(aw, ah * n * r); gh = gw / (n * r); } else { gw = aw; gh = ah; }
    const gx = ax0 + (aw - gw) / 2, gy = ay0 + (ah - gh) / 2;
    const sl = st.layout.slant * gh;
    for (let i = 1; i < n; i++) { const xc = gx + (gw * i) / n; bounds.push({ xt: xc + sl / 2, xb: xc - sl / 2 }); }
    const g2 = Math.max(1.5 * u, gap * 0.12);
    for (let i = 0; i < n; i++) {
      const lb = i ? bounds[i - 1] : { xt: gx - 80 * u, xb: gx - 80 * u }, rb = i < n - 1 ? bounds[i] : { xt: gx + gw + 80 * u, xb: gx + gw + 80 * u };
      const lo = i ? g2 : 0, ro = i < n - 1 ? g2 : 0;
      const poly = [[lb.xt + lo, gy - 4], [rb.xt - ro, gy - 4], [rb.xb - ro, gy + gh + 4], [lb.xb + lo, gy + gh + 4]];
      const bx0 = Math.max(gx, Math.min(lb.xt, lb.xb)), bx1 = Math.min(gx + gw, Math.max(rb.xt, rb.xb));
      const capX = clamp(((i ? lb.xb : gx) + (i < n - 1 ? rb.xb : gx + gw)) / 2, gx + 60 * u, gx + gw - 60 * u);
      slots.push({ poly, bx0, by0: gy, bx1, by1: gy + gh, capX, bottom: gy + gh + (8 + 30 * st.frame.reach) * u, cx: (bx0 + bx1) / 2, cy: gy + gh / 2, row: 0 });
    }
    group = { x: gx, y: gy, w: gw, h: gh };
    groupPoly = shapePoly(gx, gy, gw, gh, shape, u);
    ownerAt = (x, y) => { const t = (y - gy) / gh; let o = 0; for (const b of bounds) if (x > lerp(b.xt, b.xb, t)) o++; return o; };
  } else {
    // pick 1 row or 2 rows, whichever gives the larger photos
    const capGap = capOn ? 150 * u : 0;
    let best = null;
    for (const rows of n > 1 ? [1, 2] : [1]) {
      const cols = Math.ceil(n / rows), rowH = (ah - (rows - 1) * (gap + capGap)) / rows;
      let sw, sh;
      if (r) { sw = Math.min((aw - (cols - 1) * gap) / cols, rowH * r); sh = sw / r; } else { sw = (aw - (cols - 1) * gap) / cols; sh = rowH; }
      if (sw <= 0 || sh <= 0) continue;
      const score = sw * sh * (rows === 1 ? 1.08 : 1);
      if (!best || score > best.score) best = { rows, cols, sw, sh, score };
    }
    const { rows, cols, sw, sh } = best;
    const totalH = rows * sh + (rows - 1) * (gap + capGap);
    const y0 = ay0 + (ah - totalH) / 2;
    for (let i = 0; i < n; i++) {
      const rr = Math.floor(i / cols), inRow = Math.min(cols, n - rr * cols), cc = i - rr * cols;
      const rowW = inRow * sw + (inRow - 1) * gap, x = ax0 + (aw - rowW) / 2 + cc * (sw + gap), y = y0 + rr * (sh + gap + capGap);
      slots.push({ poly: shapePoly(x, y, sw, sh, shape, u), bx0: x, by0: y, bx1: x + sw, by1: y + sh, capX: x + sw / 2, bottom: y + sh, cx: x + sw / 2, cy: y + sh / 2, row: rr });
    }
    const pad = groupType ? fpad : n > 1 ? Math.min(18 * u, gap * 0.45) + 6 * u : 14 * u;
    const gx0 = Math.min(...slots.map((q) => q.bx0)), gx1 = Math.max(...slots.map((q) => q.bx1)), gy0 = slots[0].by0, gy1 = Math.max(...slots.map((q) => q.by1));
    group = { x: gx0 - pad, y: gy0 - pad, w: gx1 - gx0 + pad * 2, h: gy1 - gy0 + pad * 2 };
    groupPoly = shapePoly(group.x, group.y, group.w, group.h, shape, u);
    ownerAt = (x, y) => { let o = 0, bd = Infinity; slots.forEach((q, i) => { const d = ((x - q.cx) / (q.bx1 - q.bx0)) ** 2 + ((y - q.cy) / (q.by1 - q.by0)) ** 2; if (d < bd) { bd = d; o = i; } }); return o; };
    if (groupType) slots.forEach((q) => { if (q.row === rows - 1) q.bottom = group.y + group.h + (8 + 30 * st.frame.reach) * u; });
  }
  const ey = H * em.y;
  const es = Math.min(ew * 0.84, 196 * u * em.size);
  let emblems = [], medals = [];
  if (em.show && !corner) emblems = [{ x: M + ew / 2, y: ey, s: es }, { x: W - M - ew / 2, y: ey, s: es }];
  if (corner) {
    const last = slots[slots.length - 1];
    const tl = groupType ? [group.x, group.y] : [slots[0].bx0, slots[0].by0];
    const br = groupType ? [group.x + group.w, group.y + group.h] : [last.bx1, last.by1];
    const off = cpos === "inside" ? mr * 0.82 : cpos === "outside" ? -mr * 0.66 : 0;
    medals = [{ x: tl[0] + off, y: tl[1] + off, r: mr, ex: tl[0], ey: tl[1] }, { x: br[0] - off, y: br[1] - off, r: mr, ex: br[0], ey: br[1] }];
    emblems = medals.map((m) => ({ x: m.x, y: m.y, s: m.r * 2 }));
  }
  const frameRect = groupType ? group : { x: slots[0].bx0, y: slots[0].by0, w: slots[slots.length - 1].bx1 - slots[0].bx0, h: slots[slots.length - 1].by1 - slots[0].by0 };
  return { W, H, u, M, ew, tb, bb, slots, group, groupPoly, ownerAt, mode, bounds, emblems, medals, corner, groupType, frameRect, area: { ax0, ay0, aw, ah } };
}

/* ---------- segments ---------- */
function runsOf(Pp, owner, attrs, id) {
  const n = Pp.n;
  let start = -1;
  for (let i = 0; i < n; i++) if (owner[i] !== owner[(i - 1 + n) % n]) { start = i; break; }
  if (start < 0) return [{ P: Pp, i0: 0, m: n, closed: true, attr: attrs[owner[0]] || attrs[0], id }];
  const out = [], ov = 10;
  let i0 = start, k = 0;
  while (k < n) {
    const o = owner[(start + k) % n];
    let len = 0;
    while (k < n && owner[(start + k) % n] === o) { len++; k++; }
    out.push({ P: Pp, i0: i0 - ov, m: len + ov * 2, closed: false, attr: attrs[o] || attrs[0], id: id * 10 + out.length });
    i0 += len;
  }
  return out;
}
function frameSegments(L, st, holes, sides) {
  const step = 4 * L.u, n = L.slots.length, segs = [], frames = [];
  const s0 = st.slots[0];
  const a2 = n === 1 && s0.duo && s0.p2 ? s0.p2.attr : null;
  const split1 = !!a2 && a2 !== s0.attr;
  const maskOf = (Pp) => {
    if (!holes || !holes.length) return null;
    const w = new Float32Array(Pp.n);
    for (let i = 0; i < Pp.n; i++) w[i] = holeMask(Pp.x[i], Pp.y[i], holes, L.u);
    return w;
  };
  const mul = (a, b) => { if (!a) return b; if (!b) return a; const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * b[i]; return o; };
  if (L.groupType) {
    const Pp = getPath(L.groupPoly, step), mk = maskOf(Pp);
    frames.push(Pp);
    if (st.frame.mode === "blend" || st.frame.mode === "each") {
      const [A, B] = sides;
      if (A === B) segs.push({ P: Pp, i0: 0, m: Pp.n, closed: true, attr: A, id: 1, w: mk });
      else {
        const g = L.group, bw = clamp(st.frame.blend, 0.05, 1), wa = new Float32Array(Pp.n), wb = new Float32Array(Pp.n);
        for (let i = 0; i < Pp.n; i++) {
          const d = (Pp.x[i] - g.x) / g.w + (Pp.y[i] - g.y) / g.h - 1, tB = sstep((d + bw) / (2 * bw)), m = mk ? mk[i] : 1;
          wa[i] = (1 - tB) * m; wb[i] = tB * m;
        }
        segs.push({ P: Pp, i0: 0, m: Pp.n, closed: true, attr: A, id: 1, w: wa }, { P: Pp, i0: 0, m: Pp.n, closed: true, attr: B, id: 2, w: wb });
      }
    } else {
      const attrs = split1 ? [s0.attr, a2] : st.slots.slice(0, n).map((q) => q.attr);
      const cx = L.group.x + L.group.w / 2, own = new Int8Array(Pp.n);
      for (let i = 0; i < Pp.n; i++) own[i] = split1 ? (Pp.x[i] > cx ? 1 : 0) : L.ownerAt(Pp.x[i], Pp.y[i]);
      runsOf(Pp, own, attrs, 1).forEach((S) => { S.w = mk; segs.push(S); });
    }
  } else {
    L.slots.forEach((sl, i) => {
      const Pp = getPath(sl.poly, step), mk = maskOf(Pp);
      frames.push(Pp);
      if (split1) {
        const own = new Int8Array(Pp.n);
        for (let q = 0; q < Pp.n; q++) own[q] = Pp.x[q] > sl.cx ? 1 : 0;
        runsOf(Pp, own, [s0.attr, a2], 2).forEach((S) => { S.w = mk; segs.push(S); });
      } else segs.push({ P: Pp, i0: 0, m: Pp.n, closed: true, attr: st.slots[i].attr, id: 3 + i, w: mk });
    });
  }
  for (const S of segs) {
    S.len = S.m * S.P.step;
    S.kf = (wl) => (TAU * Math.max(1, Math.round(S.P.L / (wl * L.u)))) / S.P.L;
  }
  return { segs, frames, mul };
}
const IX = (S, j) => { const n = S.P.n; return (((S.i0 + Math.floor(j)) % n) + n) % n; };
const TAP = (S, j) => {
  let w = S.w ? S.w[IX(S, j)] : 1;
  if (!S.closed) { const tw = Math.min(30, S.m / 3); w *= sstep(j / tw) * sstep((S.m - j) / tw); }
  return w;
};
function holeMask(x, y, holes, u) {
  let m = 1;
  for (const h of holes) {
    if (h.c) m *= sstep((Math.hypot(x - h.x, y - h.y) - h.r) / (18 * u));
    else { const dx = Math.max(h.x0 - x, 0, x - h.x1), dy = Math.max(h.y0 - y, 0, y - h.y1); m *= sstep(Math.hypot(dx, dy) / (16 * u)); }
    if (m < 0.001) return 0;
  }
  return m;
}
function strokeAlong(ctx, S, dFn, width, color, aMul, chunk) {
  const Pp = S.P;
  chunk = chunk || 6;
  ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (S.closed && !S.w) {
    ctx.globalAlpha = aMul;
    ctx.beginPath();
    for (let j = 0; j <= S.m; j++) {
      const i = IX(S, j), d = dFn(j, i), X = Pp.x[i] + Pp.nx[i] * d, Y = Pp.y[i] + Pp.ny[i] * d;
      j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.stroke();
  } else {
    for (let j0 = 0; j0 < S.m; j0 += chunk) {
      const a = TAP(S, j0 + chunk / 2) * aMul;
      if (a < 0.01) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      const je = Math.min(S.m, j0 + chunk);
      for (let j = j0; j <= je; j++) {
        const i = IX(S, j), d = dFn(j, i), X = Pp.x[i] + Pp.nx[i] * d, Y = Pp.y[i] + Pp.ny[i] * d;
        j === j0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
function star4(ctx, x, y, rx, ry, w) {
  ry = ry || rx; w = w == null ? 0.1 : w;
  ctx.beginPath();
  ctx.moveTo(x, y - ry);
  ctx.quadraticCurveTo(x + rx * w, y - ry * w, x + rx, y);
  ctx.quadraticCurveTo(x + rx * w, y + ry * w, x, y + ry);
  ctx.quadraticCurveTo(x - rx * w, y + ry * w, x - rx, y);
  ctx.quadraticCurveTo(x - rx * w, y - ry * w, x, y - ry);
  ctx.closePath();
}
function diamond(ctx, x, y, a, b, ang) {
  const ca = Math.cos(ang || 0), sa = Math.sin(ang || 0);
  ctx.beginPath();
  ctx.moveTo(x + ca * a, y + sa * a); ctx.lineTo(x - sa * b, y + ca * b);
  ctx.lineTo(x - ca * a, y - sa * a); ctx.lineTo(x + sa * b, y - ca * b);
  ctx.closePath();
}
function flashAt(p, T) {
  const steps = Math.max(8, Math.round(T * 12)), s = Math.floor(p * steps) % steps;
  let f = 0, id = -1;
  [Math.round(steps * 0.17), Math.round(steps * 0.61)].forEach((s0, q) => { const d = (s - s0 + steps) % steps; if (d < 3) { const v = 1 - d / 3; if (v > f) { f = v; id = q; } } });
  return { f, id, step: s, steps };
}
const beat = (x) => Math.exp(-(((x - 0.08) / 0.04) ** 2)) + 0.55 * Math.exp(-(((x - 0.24) / 0.05) ** 2));

/* ---------- effects (refined, ornamental) ---------- */
const FX = {};
function ribbonPts(ctx, pts, wfn) {
  const n = pts.length;
  if (n < 2) return false;
  const Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
    const w = Math.max(0, wfn(i / (n - 1))) / 2;
    Lf.push([pts[i][0] - ty * w, pts[i][1] + tx * w]); Rt.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  ctx.beginPath();
  ctx.moveTo(Lf[0][0], Lf[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(Lf[i][0], Lf[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rt[i][0], Rt[i][1]);
  ctx.closePath();
  return true;
}
function sparkle(ctx, x, y, r, col, a) {
  if (a < 0.01) return;
  ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = col;
  star4(ctx, x, y, r * 0.5, r, 0.05); ctx.fill();
}
function along(S, j0, j1, dFn, dj) {
  const Pp = S.P, pts = [];
  dj = dj || 1;
  for (let j = j0; j <= j1 + 1e-6; j += dj) {
    const i = IX(S, j), d = dFn(j, i);
    pts.push([Pp.x[i] + Pp.nx[i] * d, Pp.y[i] + Pp.ny[i] * d]);
  }
  return pts;
}
/* evenly spaced motifs on the whole loop; only the ones this segment owns are drawn */
function motifs(S, G, u, fn, shift) {
  const n = S.P.n, Nq = Math.max(1, Math.round(S.P.L / (G * u))), sp = n / Nq;
  for (let q = 0; q < Nq; q++) {
    const gi = Math.floor(((q + (shift || 0)) * sp) % n), jl = (((gi - S.i0) % n) + n) % n;
    if (jl > S.m) continue;
    const w = TAP(S, jl);
    if (w < 0.02) continue;
    fn(gi, jl, w, q, Nq);
  }
}
/* frame-local transform: x along the frame, y outward */
function local(ctx, k, Pp, i, X, Y) { ctx.setTransform(k * Pp.tx[i], k * Pp.ty[i], k * Pp.nx[i], k * Pp.ny[i], k * X, k * Y); }
function drop(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - 2 * s);
  ctx.bezierCurveTo(x + 1.2 * s, y - 0.4 * s, x + 1.1 * s, y + s, x, y + s);
  ctx.bezierCurveTo(x - 1.1 * s, y + s, x - 1.2 * s, y - 0.4 * s, x, y - 2 * s);
  ctx.closePath();
}

FX.water = (ctx, S, E) => {
  const { u, I, R, pal, p, dark, k } = E, Pp = S.P, st = Pp.step;
  ctx.globalCompositeOperation = E.add ? "lighter" : "source-over";
  const k1 = S.kf(150), c1 = E.c(0.3), c2 = E.c(0.5), A = u * R * 6.5, base = u * R * 9;
  const ph = (i) => i * st * k1 - TAU * c1 * p;
  strokeAlong(ctx, S, () => 0, 1.1 * u, dark ? pal.hi : pal.main, 0.75);
  strokeAlong(ctx, S, (j, i) => base + A * Math.sin(ph(i)), 1.7 * u, dark ? pal.hi : pal.main, 0.95);
  strokeAlong(ctx, S, (j, i) => base - A * Math.sin(ph(i)), 1.1 * u, dark ? pal.main : pal.deep, 0.85);
  const k3 = S.kf(95);
  strokeAlong(ctx, S, (j, i) => base + A + 9 * u * R + 2 * u * Math.sin(i * st * k3 + TAU * c2 * p), 0.7 * u, pal.main, 0.5);
  // crossing nodes of the braid
  const M = Math.round((k1 * Pp.L) / Math.PI);
  ctx.fillStyle = dark ? pal.core : pal.deep;
  for (let m = 0; m < M; m++) {
    const s = ((((m * Math.PI + TAU * c1 * p) / k1) % Pp.L) + Pp.L) % Pp.L, gi = Math.floor(s / st) % Pp.n;
    const jl = (((gi - S.i0) % Pp.n) + Pp.n) % Pp.n;
    if (jl > S.m) continue;
    const w = TAP(S, jl);
    if (w < 0.03) continue;
    ctx.globalAlpha = w;
    diamond(ctx, Pp.x[gi] + Pp.nx[gi] * base, Pp.y[gi] + Pp.ny[gi] * base, (m % 2 ? 3.2 : 5) * u, (m % 2 ? 1.8 : 2.6) * u, Math.atan2(Pp.ty[gi], Pp.tx[gi]));
    ctx.fill();
  }
  // droplet ornaments with breathing ripple arcs
  motifs(S, 210, u, (gi, jl, w, q) => {
    const d = base + A + 26 * u * R, X = Pp.x[gi] + Pp.nx[gi] * d, Y = Pp.y[gi] + Pp.ny[gi] * d;
    local(ctx, k, Pp, gi, X, Y);
    const s = 4.2 * u * R;
    ctx.globalAlpha = w * 0.28; ctx.fillStyle = pal.main; drop(ctx, 0, 0, s); ctx.fill();
    ctx.globalAlpha = w; ctx.strokeStyle = dark ? pal.hi : pal.main; ctx.lineWidth = 1.1 * u; drop(ctx, 0, 0, s); ctx.stroke();
    ctx.lineWidth = 1 * u; ctx.lineCap = "round";
    for (let r = 0; r < 2; r++) {
      const life = frac(p * E.c(0.4) + r * 0.5 + hsh(q, 5)), rad = s * (2.4 + 2.6 * life);
      ctx.globalAlpha = w * (1 - life) * 0.9;
      ctx.beginPath(); ctx.arc(0, -s * 0.2, rad, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.2, rad, -Math.PI * 0.38, Math.PI * 0.38); ctx.stroke();
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
  }, 0.5);
  // drips from downward edges
  const D = Math.round((S.len / (180 * u)) * I);
  for (let d = 0; d < D; d++) {
    const r1 = hsh(d, S.id * 17 + 1), r2 = hsh(d, S.id * 17 + 2), r3 = hsh(d, S.id * 17 + 3);
    const j = r1 * S.m, i = IX(S, j);
    if (Pp.ny[i] < 0.6) continue;
    const w0 = TAP(S, j);
    if (w0 < 0.05) continue;
    const life = frac(r2 + p * E.c(0.25 + 0.15 * r3));
    let X = Pp.x[i], Y = Pp.y[i] + base, s, a;
    if (life < 0.4) { s = u * (0.8 + (2.4 * life) / 0.4); a = 0.9; } else { const t = (life - 0.4) / 0.6; Y += t * t * u * R * 110; s = u * 3.2; a = 1 - t; }
    ctx.globalAlpha = w0 * a * 0.85; ctx.fillStyle = dark ? pal.hi : pal.main; drop(ctx, X, Y, s); ctx.fill();
    ctx.globalAlpha = w0 * a; ctx.fillStyle = dark ? pal.core : "#FFFFFF"; ctx.fillRect(X - s * 0.18, Y - s * 0.1, s * 0.32, s * 0.32);
  }
  // rising rings at the sides
  const B = Math.round((S.len / (120 * u)) * I);
  ctx.strokeStyle = dark ? pal.hi : pal.main; ctx.lineWidth = 0.9 * u;
  for (let b = 0; b < B; b++) {
    const r1 = hsh(b, S.id * 19 + 1), r2 = hsh(b, S.id * 19 + 2), r3 = hsh(b, S.id * 19 + 3), r4 = hsh(b, S.id * 19 + 4);
    const j = r1 * S.m, i = IX(S, j);
    if (Math.abs(Pp.nx[i]) < 0.6) continue;
    const life = frac(r2 + p * E.c(0.25 + 0.2 * r4)), dd = u * R * (18 + 36 * r3);
    ctx.globalAlpha = Math.sin(Math.PI * life) * 0.75 * TAP(S, j);
    ctx.beginPath(); ctx.arc(Pp.x[i] + Pp.nx[i] * dd + Math.sin(TAU * (life * 2 + r4)) * 4 * u, Pp.y[i] - life * u * R * 110, u * (1.4 + 2.6 * r4), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
};

/* fire: flame line-art in the style of the FIRE sigil — outlined tongues in mirrored clusters */
function cubicPts(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    out.push([m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
function flameGlyph(ctx, X, Y, ang, h, w, sway, pal, a, u, dark, lean) {
  // local: lx across the frame, ly outward; ang is the outward direction
  const ox = Math.cos(ang), oy = Math.sin(ang), px = -oy, py = ox;
  const M = (q) => [X + px * q[0] + ox * q[1], Y + py * q[0] + oy * q[1]];
  const s = sway * h, tip = [s * 0.42 + lean * h, h];
  const left = cubicPts([-w, 0], [-w * 1.15, h * 0.4], [-w * 0.2 + s * 0.35, h * 0.66], tip, 18).map(M);
  const right = cubicPts([w, 0], [w * 1.05, h * 0.32], [w * 0.62 + s * 0.2, h * 0.56], tip, 18).map(M);
  const inner = cubicPts([w * 0.34, h * 0.04], [-w * 0.62, h * 0.26], [-w * 0.12 + s * 0.25, h * 0.46], [w * 0.1 + s * 0.3, h * 0.64], 14).map(M);
  const base = M([0, 0]), top = M(tip);
  // haze
  const hz = ctx.createLinearGradient(base[0], base[1], top[0], top[1]);
  hz.addColorStop(0, rgba(pal.hi, dark ? 0.26 : 0.3)); hz.addColorStop(0.45, rgba(pal.main, dark ? 0.12 : 0.1)); hz.addColorStop(1, rgba(pal.main, 0));
  ctx.globalAlpha = a; ctx.fillStyle = hz;
  ctx.beginPath(); left.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]); ctx.closePath(); ctx.fill();
  // outline strokes
  const gr = ctx.createLinearGradient(base[0], base[1], top[0], top[1]);
  if (dark) { gr.addColorStop(0, pal.core); gr.addColorStop(0.35, pal.hi); gr.addColorStop(0.8, pal.main); gr.addColorStop(1, rgba(pal.main, 0.2)); }
  else { gr.addColorStop(0, pal.deep); gr.addColorStop(0.4, pal.main); gr.addColorStop(1, rgba(pal.hi, 0.35)); }
  ctx.fillStyle = gr;
  const lw = Math.max(1.1, Math.min(2.2, h / (34 * u))) * u;
  ribbonPts(ctx, left, (t) => lw * (1.15 - t * 0.95)); ctx.fill();
  ribbonPts(ctx, right, (t) => lw * (1 - t * 0.85)); ctx.fill();
  ribbonPts(ctx, inner, (t) => lw * 0.85 * Math.sin(Math.PI * (0.12 + 0.88 * t))); ctx.fill();
  return top;
}
FX.fire = (ctx, S, E) => {
  const { u, I, R, pal, p, dark } = E, Pp = S.P, st = Pp.step, n = Pp.n;
  ctx.globalCompositeOperation = E.add ? "lighter" : "source-over";
  ctx.lineCap = "round";
  // heat line
  if (dark) strokeAlong(ctx, S, () => 0, 12 * u, pal.main, 0.07);
  strokeAlong(ctx, S, () => 0, 1.3 * u, dark ? pal.core : pal.main, 0.95);
  strokeAlong(ctx, S, () => -3.5 * u, 0.6 * u, dark ? pal.hi : pal.deep, 0.55);
  // a heat pulse runs along the frame and lifts the flames it passes
  const pulse = frac(p * E.c(0.18) + (S.id % 5) * 0.21) * n;
  const lift = (i) => { let d = Math.abs(i - pulse); d = Math.min(d, n - d) * st; return Math.exp(-((d / (170 * u)) ** 2)); };
  const c1 = E.c(0.55), c2 = E.c(0.35), H0 = 74 * u * R * (0.75 + 0.25 * Math.min(1.4, I));
  const out = (gi, bias) => { let dx = Pp.nx[gi], dy = Pp.ny[gi] - bias; const dl = Math.hypot(dx, dy) || 1; return Math.atan2(dy / dl, dx / dl); };
  const low = (gi) => (Pp.ny[gi] > 0.5 ? 0.42 : 0.8 + 0.2 * -Pp.ny[gi]);
  // small sprouts between clusters
  motifs(S, 170, u, (gi, jl, w, q) => {
    const ph = hsh(q, 31) * TAU, h = H0 * 0.34 * low(gi) * (0.85 + 0.15 * Math.sin(TAU * c1 * p + ph)) * (1 + 0.3 * lift(gi));
    flameGlyph(ctx, Pp.x[gi], Pp.y[gi], out(gi, 0.25), h, h * 0.3, 0.2 * Math.sin(TAU * c2 * p + ph), pal, w * 0.85, u, dark, 0);
  }, 0.5);
  // mirrored clusters: one tall tongue between two leaning ones
  const tips = [];
  motifs(S, 170, u, (gi, jl, w, q) => {
    const ph = hsh(q, 17) * TAU, lf = lift(gi), br = 0.86 + 0.14 * Math.sin(TAU * c1 * p + ph);
    const h = H0 * br * (1 + 0.35 * lf) * low(gi);
    const a0 = out(gi, 0.3), sw = 0.22 * Math.sin(TAU * c2 * p + ph);
    const tx = Pp.tx[gi], ty = Pp.ty[gi], off = h * 0.36;
    for (const sgn of [-1, 1]) {
      const X = Pp.x[gi] + tx * off * sgn, Y = Pp.y[gi] + ty * off * sgn;
      flameGlyph(ctx, X, Y, a0 + sgn * 0.2, h * 0.6, h * 0.17, sw * 0.8 + sgn * 0.08, pal, w * 0.9, u, dark, sgn * 0.04);
    }
    tips.push([flameGlyph(ctx, Pp.x[gi], Pp.y[gi], a0, h, h * 0.24, sw, pal, w, u, dark, 0), w, q]);
    // ember node on the line
    ctx.globalAlpha = w; ctx.fillStyle = dark ? pal.core : pal.deep;
    diamond(ctx, Pp.x[gi], Pp.y[gi], 4 * u, 2 * u, Math.atan2(Pp.ty[gi], Pp.tx[gi])); ctx.fill();
  });
  // the pulse itself
  {
    const gi = Math.floor(pulse) % n, jl = (((gi - S.i0) % n) + n) % n;
    if (jl <= S.m) {
      const w = TAP(S, jl), g = glowSpr(pal.hi);
      ctx.globalAlpha = w * (dark ? 0.75 : 0.35); ctx.drawImage(g, Pp.x[gi] - 30 * u, Pp.y[gi] - 30 * u, 60 * u, 60 * u);
      sparkle(ctx, Pp.x[gi], Pp.y[gi], 11 * u, dark ? pal.core : pal.main, w);
    }
  }
  // sparks lifting off the tall tongues
  for (const [tp, w, q] of tips) {
    for (let e = 0; e < 2; e++) {
      const r1 = hsh(q, 60 + e), life = frac(r1 + p * E.c(0.3 + 0.2 * hsh(q, 70 + e)));
      const s = Math.sin(Math.PI * life);
      const X = tp[0] + Math.sin(TAU * (life + r1)) * 8 * u, Y = tp[1] - life * 46 * u * R;
      sparkle(ctx, X, Y, u * (3 + 3 * hsh(q, 80 + e)) * (0.4 + 0.6 * s), dark ? pal.core : pal.main, w * Math.pow(s, 1.3) * 0.9);
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
};

/* wind: bundles of long tapered strands sweeping along the frame, over a quiet flow line */
FX.wind = (ctx, S, E) => {
  const { u, I, R, pal, p, dark } = E, Pp = S.P, st = Pp.step, n = Pp.n;
  ctx.globalCompositeOperation = E.add ? "lighter" : "source-over";
  const col = dark ? pal.hi : pal.main, core = dark ? pal.core : pal.deep;
  const kq = S.kf(520), cw = TAU * E.c(0.2) * p;
  strokeAlong(ctx, S, () => 0, 1.1 * u, col, 0.85);
  strokeAlong(ctx, S, (j, i) => u * R * (16 + 3 * Math.sin(i * st * kq + cw)), 0.6 * u, pal.main, 0.45);
  // flow beads on the quiet line
  motifs(S, 64, u, (gi, jl, w, q) => {
    const f = frac(p * E.c(0.4) + q / 3);
    const j = clamp(jl + f * Math.round((64 * u) / st), 0, S.m), i = IX(S, j), d = u * R * (16 + 3 * Math.sin(i * st * kq + cw));
    ctx.globalAlpha = TAP(S, j) * Math.sin(Math.PI * f) * 0.9; ctx.fillStyle = core;
    diamond(ctx, Pp.x[i] + Pp.nx[i] * d, Pp.y[i] + Pp.ny[i] * d, 3 * u, 1.3 * u, Math.atan2(Pp.ty[i], Pp.tx[i])); ctx.fill();
  });
  // strand bundles
  const K = Math.max(3, Math.round((S.len / (230 * u)) * I));
  const k2 = S.kf(380);
  for (let g = 0; g < K; g++) {
    const r1 = hsh(g, S.id * 23 + 1), r2 = hsh(g, S.id * 23 + 2), r3 = hsh(g, S.id * 23 + 3), r4 = hsh(g, S.id * 23 + 4);
    const laps = E.c(0.2 + 0.12 * r3), Lmax = Math.max(16, Math.round((u * R * (240 + 220 * r2)) / st));
    const head = S.closed ? frac(r1 + p * laps) * S.m : frac(r1 + p * laps) * (S.m + Lmax);
    const base = 7 + 18 * r4, a = TAP(S, clamp(head, 0, S.m));
    if (a < 0.03) continue;
    for (let k = 0; k < 3; k++) {
      const Lk = Math.round(Lmax * (1 - k * 0.27)), hk = head - k * Math.round((14 * u) / st);
      let j0 = hk - Lk, j1 = hk;
      if (!S.closed) { j0 = Math.max(0, j0); j1 = Math.min(S.m, j1); }
      if (j1 - j0 < 6) continue;
      const span = hk - (hk - Lk), dk = base + k * 5.5;
      const pts = along(S, j0, j1, (j, i) => {
        const t = clamp((j - (hk - Lk)) / span, 0, 1), rise = k === 0 ? Math.pow(Math.max(0, t - 0.82) / 0.18, 2) * 9 : 0;
        return u * R * (dk + rise + 2.5 * Math.sin(i * st * k2 + r1 * TAU + cw));
      }, 2);
      if (pts.length < 3) continue;
      const A0 = pts[0], A1 = pts[pts.length - 1], gr = ctx.createLinearGradient(A0[0], A0[1], A1[0], A1[1]);
      gr.addColorStop(0, rgba(k ? pal.main : col, 0)); gr.addColorStop(0.75, rgba(k ? pal.main : col, 0.85)); gr.addColorStop(1, rgba(k ? col : core, 1));
      ctx.globalAlpha = a * (1 - k * 0.22); ctx.fillStyle = gr;
      const wk = u * (2.1 - k * 0.5);
      ribbonPts(ctx, pts, (t) => wk * Math.pow(t, 1.2) * (t > 0.93 ? (1 - t) / 0.07 : 1) + 0.15 * u);
      ctx.fill();
      if (k === 0 && j1 === hk) sparkle(ctx, A1[0], A1[1], 6 * u, core, a * 0.9);
    }
  }
  // wind sigil at the free corners: three thin crescents turning slowly
  for (const ci of Pp.corners) {
    const jl = (((ci - S.i0) % n) + n) % n;
    if (jl > S.m) continue;
    const w = TAP(S, jl);
    if (w < 0.15) continue;
    const X = Pp.x[ci] + Pp.nx[ci] * u * R * 30, Y = Pp.y[ci] + Pp.ny[ci] * u * R * 30;
    const rot = TAU * p * E.c(0.12) * (hsh(ci, S.id) < 0.5 ? 1 : -1);
    ctx.fillStyle = col;
    for (let a2 = 0; a2 < 3; a2++) {
      const rr = u * R * 15, s0 = rot + (a2 * TAU) / 3, pts = [];
      for (let t = 0; t <= 1.0001; t += 1 / 16) { const an = s0 + t * 1.9, rad = rr * (1.15 - t * 0.55); pts.push([X + Math.cos(an) * rad, Y + Math.sin(an) * rad]); }
      ctx.globalAlpha = w * 0.9;
      ribbonPts(ctx, pts, (t) => u * 2.2 * Math.sin(Math.PI * Math.min(1, 0.08 + t))); ctx.fill();
    }
    ctx.globalAlpha = w; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(X, Y, 1.8 * u, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
};
/* angular bolt in frame-local coords (x along, y outward) */
const BOLT = [[0, 0], [5, 20], [-5, 27], [7, 52], [-3, 58], [8, 86]];
function boltLocal(ctx, k, Pp, i, X, Y, s, flip, pal, a, u, dark) {
  local(ctx, k, Pp, i, X, Y);
  const pts = BOLT.map(([x, y]) => [x * s * flip, y * s]);
  ctx.globalAlpha = a;
  const gr = ctx.createLinearGradient(0, 0, 0, 86 * s);
  gr.addColorStop(0, dark ? pal.core : pal.main); gr.addColorStop(0.5, dark ? pal.hi : pal.main); gr.addColorStop(1, rgba(pal.main, 0.2));
  ctx.fillStyle = gr;
  ribbonPts(ctx, pts, (t) => u * 3.6 * (1 - t * 0.8));
  ctx.fill();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return pts;
}
FX.lightning = (ctx, S, E) => {
  const { u, I, R, pal, p, dark, k } = E, Pp = S.P, st = Pp.step, n = Pp.n;
  ctx.globalCompositeOperation = E.add ? "lighter" : "source-over";
  ctx.lineCap = "round"; ctx.lineJoin = "miter";
  const F = flashAt(p, E.T), fl = F.f;
  strokeAlong(ctx, S, () => 0, 1.4 * u, dark ? pal.hi : pal.main, 0.85 + 0.15 * fl);
  // circuit ticks
  ctx.strokeStyle = dark ? pal.main : pal.deep; ctx.lineWidth = 0.9 * u;
  motifs(S, 30, u, (gi, jl, w, q) => {
    const L2 = (q % 4 === 0 ? 8 : 4) * u * R;
    ctx.globalAlpha = w * 0.7;
    ctx.beginPath(); ctx.moveTo(Pp.x[gi], Pp.y[gi]); ctx.lineTo(Pp.x[gi] + Pp.nx[gi] * L2, Pp.y[gi] + Pp.ny[gi] * L2); ctx.stroke();
  });
  // zigzag charge band
  const zz = Math.max(2, Math.round((13 * u) / st)), lo = 6 * u * R, hiD = 16 * u * R;
  const verts = [];
  for (let j = 0; j <= S.m; j += zz) { const i = IX(S, j), d = (Math.round(j / zz) % 2 ? hiD : lo); verts.push([Pp.x[i] + Pp.nx[i] * d, Pp.y[i] + Pp.ny[i] * d, j, i]); }
  const pulses = [0, 1, 2].map((q) => frac(hsh(q, S.id * 3 + 1) + p * E.c(0.45) * (q === 1 ? 1 : 1)) * n);
  const glow = (i) => { let b = 0; for (const pp of pulses) { let d = Math.abs(i - pp); d = Math.min(d, n - d) * st; b = Math.max(b, Math.exp(-((d / (80 * u)) ** 2))); } return b; };
  for (let v = 0; v < verts.length - 1; v++) {
    const a = verts[v], b = verts[v + 1], w = TAP(S, (a[2] + b[2]) / 2);
    if (w < 0.02) continue;
    const g = Math.max(glow(a[3]), fl);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.globalAlpha = w * (0.45 + 0.2 * g); ctx.strokeStyle = dark ? pal.main : pal.deep; ctx.lineWidth = 0.9 * u; ctx.stroke();
    if (g > 0.05) { ctx.globalAlpha = w * g; ctx.strokeStyle = dark ? pal.core : pal.main; ctx.lineWidth = 2 * u; ctx.stroke(); }
  }
  // flicker bolts: change every step
  const rr = rng(hsh(F.step, S.id * 7 + 3)), nb = Math.max(1, Math.round((S.len / (520 * u)) * I));
  for (let b = 0; b < nb; b++) {
    const j = rr() * S.m, w = TAP(S, j), on = rr();
    if (w < 0.25 || on < 0.35) continue;
    const i = IX(S, j), s = u * R * (0.32 + 0.22 * rr());
    const pts = boltLocal(ctx, k, Pp, i, Pp.x[i] + Pp.nx[i] * lo, Pp.y[i] + Pp.ny[i] * lo, s, rr() < 0.5 ? 1 : -1, pal, w * 0.95, u * 0.6, dark);
    const tip = pts[pts.length - 1];
    sparkle(ctx, Pp.x[i] + Pp.nx[i] * (lo + tip[1]) + Pp.tx[i] * tip[0], Pp.y[i] + Pp.ny[i] * (lo + tip[1]) + Pp.ty[i] * tip[0], 6 * u, dark ? pal.core : pal.main, w * 0.9);
  }
  // strike
  if (fl > 0 && F.id >= 0) {
    const r2 = rng(hsh(F.id, S.id * 11 + 9));
    let j = r2() * S.m;
    for (let t = 0; t < 6 && TAP(S, j) < 0.5; t++) j = r2() * S.m;
    const w = TAP(S, j);
    if (w > 0.3) {
      const i = IX(S, j), s = u * R * 1.15;
      boltLocal(ctx, k, Pp, i, Pp.x[i], Pp.y[i], s, r2() < 0.5 ? 1 : -1, pal, w * fl, u * 1.3, dark);
      const g = glowSpr(pal.hi);
      ctx.globalAlpha = w * fl * (dark ? 0.9 : 0.4); ctx.drawImage(g, Pp.x[i] - 50 * u, Pp.y[i] - 50 * u, 100 * u, 100 * u);
      sparkle(ctx, Pp.x[i], Pp.y[i], 16 * u * fl, dark ? pal.core : pal.main, w * fl);
    }
  }
  // twinkles
  motifs(S, 160, u, (gi, jl, w, q) => {
    const tw = Math.pow(0.5 + 0.5 * Math.sin(TAU * (E.c(0.5) * p + hsh(q, S.id))), 6);
    sparkle(ctx, Pp.x[gi] + Pp.nx[gi] * hiD, Pp.y[gi] + Pp.ny[gi] * hiD, u * (4 + 6 * tw), dark ? pal.core : pal.main, w * tw);
  }, 0.25);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.lineJoin = "round";
};

function facet(ctx, X, Y, ang, len, bw, pal, a, shine, u, dark) {
  const ca = Math.cos(ang), sa = Math.sin(ang), tx = X + ca * len, ty = Y + sa * len;
  const mx = X + ca * len * 0.32, my = Y + sa * len * 0.32;
  const lx = mx - sa * bw * 0.5, ly = my + ca * bw * 0.5, rx = mx + sa * bw * 0.5, ry = my - ca * bw * 0.5;
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(lx, ly); ctx.lineTo(tx, ty); ctx.closePath();
  ctx.globalAlpha = a * (dark ? 0.36 + 0.64 * shine : 0.55 + 0.45 * shine); ctx.fillStyle = shine > 0.6 && dark ? pal.core : pal.hi; ctx.fill();
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(rx, ry); ctx.lineTo(tx, ty); ctx.closePath();
  ctx.globalAlpha = a * (dark ? 0.22 + 0.3 * shine : 0.45 + 0.3 * shine); ctx.fillStyle = pal.main; ctx.fill();
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(lx, ly); ctx.lineTo(tx, ty); ctx.lineTo(rx, ry); ctx.closePath();
  ctx.globalAlpha = a * (0.6 + 0.4 * shine); ctx.strokeStyle = dark ? pal.core : pal.deep; ctx.lineWidth = 0.75 * u; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(tx, ty);
  ctx.globalAlpha = a * (0.25 + 0.75 * shine); ctx.strokeStyle = dark ? pal.core : "#FFFFFF"; ctx.lineWidth = (0.6 + 0.6 * shine) * u; ctx.stroke();
  if (shine > 0.3 && len > 14 * u) { ctx.globalAlpha = a * (shine - 0.3) * 1.4; ctx.fillStyle = dark ? pal.core : pal.deep; star4(ctx, tx, ty, 3 * u + len * 0.06, 6 * u + len * 0.14, 0.05); ctx.fill(); }
}
FX.ice = (ctx, S, E) => {
  const { u, I, R, pal, p, dark } = E, Pp = S.P, st = Pp.step, n = Pp.n;
  ctx.globalCompositeOperation = E.add ? "lighter" : "source-over";
  ctx.lineJoin = "miter";
  const glI = frac(p * E.c(0.22)) * n, glJ = (glI + n / 2) % n;
  const flash = 0.7 * Math.pow(0.5 + 0.5 * Math.sin(TAU * E.c(0.25) * p + 1), 14);
  const near = (i, g) => { let d = Math.abs(i - g); d = Math.min(d, n - d) * st; return Math.exp(-((d / (190 * u)) ** 2)); };
  const shineAt = (i) => Math.min(1, Math.max(near(i, glI), near(i, glJ)) + flash);
  const breath = (h) => 0.94 + 0.06 * Math.sin(TAU * (E.c(0.25) * p + h));
  strokeAlong(ctx, S, () => 0, 1.3 * u, dark ? pal.hi : pal.main, 0.95);
  strokeAlong(ctx, S, () => 6 * u * R, 0.7 * u, dark ? pal.core : pal.deep, 0.5);
  // diamond chain
  ctx.fillStyle = dark ? pal.core : pal.deep;
  motifs(S, 22, u, (gi, jl, w, q) => {
    const big = q % 3 === 0;
    ctx.globalAlpha = w * (0.7 + 0.3 * shineAt(gi));
    diamond(ctx, Pp.x[gi] + Pp.nx[gi] * 6 * u * R, Pp.y[gi] + Pp.ny[gi] * 6 * u * R, (big ? 5 : 3) * u, (big ? 2.4 : 1.6) * u, Math.atan2(Pp.ty[gi], Pp.tx[gi]));
    ctx.fill();
  });
  // frost teeth between fans
  motifs(S, 33, u, (gi, jl, w, q) => {
    if (q % 4 === 0) return;
    const out = Math.atan2(Pp.ny[gi], Pp.nx[gi]), len = u * R * (9 + (q % 2 ? 0 : 6)) * breath(q * 0.13);
    facet(ctx, Pp.x[gi], Pp.y[gi], out, len, len * 0.42, pal, w * 0.85, shineAt(gi), u, dark);
  }, 0.5);
  // symmetric crystal fans
  motifs(S, 132, u, (gi, jl, w, q) => {
    const out = Math.atan2(Pp.ny[gi], Pp.nx[gi]), sh = shineAt(gi), b = breath(q * 0.37);
    const L0 = u * R * 42 * b * (0.75 + 0.25 * Math.min(1.4, I));
    facet(ctx, Pp.x[gi], Pp.y[gi], out - 0.52, L0 * 0.52, L0 * 0.24, pal, w, sh, u, dark);
    facet(ctx, Pp.x[gi], Pp.y[gi], out + 0.52, L0 * 0.52, L0 * 0.24, pal, w, sh, u, dark);
    facet(ctx, Pp.x[gi], Pp.y[gi], out, L0, L0 * 0.3, pal, w, sh, u, dark);
    const tw = Math.pow(0.5 + 0.5 * Math.sin(TAU * (E.c(0.5) * p + hsh(q, 9))), 6);
    sparkle(ctx, Pp.x[gi] + Pp.nx[gi] * L0, Pp.y[gi] + Pp.ny[gi] * L0, u * (4 + 6 * Math.max(tw, sh)), dark ? pal.core : pal.deep, w * Math.max(tw, sh));
  });
  // corner bursts
  for (const ci of Pp.corners) {
    const jl = (((ci - S.i0) % n) + n) % n;
    if (jl > S.m) continue;
    const w = TAP(S, jl);
    if (w < 0.05) continue;
    const out = Math.atan2(Pp.ny[ci], Pp.nx[ci]), sh = shineAt(ci), b = breath(ci * 0.01);
    [[-0.85, 0.42], [-0.42, 0.66], [0, 1], [0.42, 0.66], [0.85, 0.42]].forEach(([da, lm]) => {
      const L0 = u * R * 64 * lm * b;
      facet(ctx, Pp.x[ci], Pp.y[ci], out + da, L0, L0 * 0.28, pal, w, sh, u, dark);
    });
  }
  // two traveling glints with a lens flare
  for (const gg of [glI, glJ]) {
    const gi = Math.floor(gg) % n, jl = (((gi - S.i0) % n) + n) % n;
    if (jl > S.m) continue;
    const w = TAP(S, jl);
    if (w < 0.03) continue;
    const X = Pp.x[gi] + Pp.nx[gi] * 6 * u * R, Y = Pp.y[gi] + Pp.ny[gi] * 6 * u * R, g = glowSpr(pal.hi);
    ctx.globalAlpha = w * (dark ? 0.9 : 0.5); ctx.drawImage(g, X - 44 * u, Y - 44 * u, 88 * u, 88 * u);
    ctx.globalAlpha = w * 0.85; ctx.fillStyle = dark ? pal.core : pal.deep;
    star4(ctx, X, Y, 46 * u, 3.4 * u, 0.05); ctx.fill();
    star4(ctx, X, Y, 3.4 * u, 22 * u, 0.05); ctx.fill();
    sparkle(ctx, X, Y, 20 * u, dark ? pal.core : pal.deep, w);
  }
  // frost motes
  const N = Math.round((S.len / (90 * u)) * I);
  for (let e = 0; e < N; e++) {
    const r1 = hsh(e, S.id * 37 + 1), r2 = hsh(e, S.id * 37 + 2), r3 = hsh(e, S.id * 37 + 3), r4 = hsh(e, S.id * 37 + 4);
    const j = r1 * S.m, i = IX(S, j), life = frac(r2 + p * E.c(0.18 + 0.12 * r3)), d = u * R * (10 + 56 * r3);
    const X = Pp.x[i] + Pp.nx[i] * d + Math.sin(TAU * (life + r4)) * 8 * u, Y = Pp.y[i] + Pp.ny[i] * d + life * u * R * 90;
    const s = Math.sin(Math.PI * life);
    if (r4 > 0.6) sparkle(ctx, X, Y, u * (3 + 3 * r4) * s, dark ? pal.core : pal.main, TAP(S, j) * s);
    else { ctx.globalAlpha = TAP(S, j) * s * 0.8; ctx.fillStyle = dark ? pal.core : pal.main; ctx.beginPath(); ctx.arc(X, Y, u * (0.9 + 1.2 * r4), 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.lineJoin = "round";
};

function leaf(ctx, k, X, Y, ang, len, pal, a, u, dark) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  ctx.setTransform(k * ca, k * sa, -k * sa, k * ca, k * X, k * Y);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.25, -len * 0.42, len * 0.75, -len * 0.3, len, 0); ctx.bezierCurveTo(len * 0.7, len * 0.28, len * 0.25, len * 0.36, 0, 0);
  ctx.globalAlpha = a * 0.95; ctx.fillStyle = dark ? pal.main : pal.main; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.25, -len * 0.42, len * 0.75, -len * 0.3, len, 0); ctx.closePath();
  ctx.globalAlpha = a * 0.55; ctx.fillStyle = dark ? pal.hi : pal.core; ctx.fill();
  ctx.beginPath(); ctx.moveTo(len * 0.04, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.04, len * 0.92, 0);
  ctx.globalAlpha = a * 0.7; ctx.strokeStyle = pal.deep; ctx.lineWidth = 0.6 * u; ctx.stroke();
  ctx.setTransform(k, 0, 0, k, 0, 0);
}
FX.grass = (ctx, S, E) => {
  const { u, I, R, pal, p, k, dark } = E, Pp = S.P, st = Pp.step;
  ctx.globalCompositeOperation = "source-over";
  const k1 = S.kf(176), k2 = S.kf(70), sw = TAU * E.c(0.3) * p;
  const vine = (sg) => (j, i) => { const s = i * st; return u * R * (8 + 4.5 * sg * Math.sin(s * k1 + 0.6)) + 1.2 * u * Math.sin(sw + s * k2); };
  strokeAlong(ctx, S, vine(1), 2 * u, pal.deep, 0.95);
  strokeAlong(ctx, S, vine(1), 0.7 * u, dark ? pal.hi : pal.main, 0.7);
  strokeAlong(ctx, S, vine(-1), 1 * u, pal.main, 0.8);
  // paired leaves (sprout sigil)
  const rh = [1, 0.62, 0.82, 0.58];
  motifs(S, 42 / Math.max(0.7, Math.min(1.3, I)), u, (gi, jl, w, q) => {
    const d = vine(1)(jl, gi), X = Pp.x[gi] + Pp.nx[gi] * d, Y = Pp.y[gi] + Pp.ny[gi] * d;
    const out = Math.atan2(Pp.ny[gi], Pp.nx[gi]), s = 0.08 * Math.sin(sw + gi * st * 0.012 + q);
    const len = u * R * 21 * rh[q % 4];
    leaf(ctx, k, X, Y, out - 0.66 + s, len, pal, w, u, dark);
    leaf(ctx, k, X, Y, out + 0.66 + s, len * 0.9, pal, w, u, dark);
    if (q % 4 === 0) { ctx.globalAlpha = w; ctx.fillStyle = dark ? pal.core : pal.deep; ctx.beginPath(); ctx.arc(X + Pp.nx[gi] * len * 0.55, Y + Pp.ny[gi] * len * 0.55, 1.8 * u, 0, TAU); ctx.fill(); }
  });
  // tapered tendrils
  ctx.fillStyle = pal.main;
  motifs(S, 126, u, (gi, jl, w, q) => {
    const d = vine(-1)(jl, gi);
    let x = Pp.x[gi] + Pp.nx[gi] * d, y = Pp.y[gi] + Pp.ny[gi] * d;
    const dirS = q % 2 ? 1 : -1;
    let ang = Math.atan2(Pp.ny[gi], Pp.nx[gi]) - dirS * 0.5;
    const pts = [[x, y]];
    for (let t = 0; t < 20; t++) { const sl = u * R * 2.5 * (1 - t / 24); ang += dirS * (0.12 + t * 0.02) + 0.01 * Math.sin(sw); x += Math.cos(ang) * sl; y += Math.sin(ang) * sl; pts.push([x, y]); }
    ctx.globalAlpha = w * 0.9;
    ribbonPts(ctx, pts, (t) => u * 1.6 * (1 - t * 0.85));
    ctx.fill();
    ctx.fillStyle = dark ? pal.core : pal.hi; ctx.beginPath(); ctx.arc(x, y, 1.6 * u, 0, TAU); ctx.fill(); ctx.fillStyle = pal.main;
  }, 0.5);
  // blossoms at corners
  for (const ci of Pp.corners) {
    const n = Pp.n, jl = (((ci - S.i0) % n) + n) % n;
    if (jl > S.m) continue;
    const w = TAP(S, jl);
    if (w < 0.05) continue;
    for (let b = -1; b <= 1; b += 2) {
      const X = Pp.x[ci] + Pp.nx[ci] * 14 * u * R + Pp.tx[ci] * b * 15 * u, Y = Pp.y[ci] + Pp.ny[ci] * 14 * u * R + Pp.ty[ci] * b * 15 * u;
      const rs = u * R * (b > 0 ? 6.5 : 5), rot = sw * 0.25 + b + ci;
      for (let pt = 0; pt < 5; pt++) {
        const a = rot + (pt * TAU) / 5;
        ctx.globalAlpha = w * 0.95; ctx.fillStyle = dark ? pal.core : "#FFFFFF";
        ctx.beginPath(); ctx.ellipse(X + Math.cos(a) * rs * 0.9, Y + Math.sin(a) * rs * 0.9, rs * 0.72, rs * 0.4, a, 0, TAU); ctx.fill();
        if (!dark) { ctx.strokeStyle = pal.main; ctx.lineWidth = 0.6 * u; ctx.stroke(); }
      }
      ctx.fillStyle = dark ? pal.hi : pal.main; ctx.beginPath(); ctx.arc(X, Y, rs * 0.38, 0, TAU); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = E.add ? "lighter" : "source-over";
  // motes rising
  const N = Math.round((S.len / (110 * u)) * I);
  for (let e = 0; e < N; e++) {
    const r1 = hsh(e, S.id * 41 + 1), r2 = hsh(e, S.id * 41 + 2), r3 = hsh(e, S.id * 41 + 3), r4 = hsh(e, S.id * 41 + 4);
    const j = r1 * S.m, i = IX(S, j), life = frac(r2 + p * E.c(0.2 + 0.2 * r3)), d = u * R * (12 + 50 * r3);
    const s = Math.sin(Math.PI * life);
    sparkle(ctx, Pp.x[i] + Pp.nx[i] * d + Math.sin(TAU * (life + r4)) * 8 * u, Pp.y[i] + Pp.ny[i] * d - life * u * R * 80, u * (2.5 + 3 * r4) * s, dark ? pal.core : pal.main, TAP(S, j) * s * 0.8);
  }
  ctx.globalCompositeOperation = "source-over";
  // a few drifting leaves
  const FL = Math.round((S.len / (420 * u)) * I);
  for (let e = 0; e < FL; e++) {
    const r1 = hsh(e, S.id * 43 + 1), r2 = hsh(e, S.id * 43 + 2), r3 = hsh(e, S.id * 43 + 3), r4 = hsh(e, S.id * 43 + 4);
    const j = r1 * S.m, i = IX(S, j), life = frac(r2 + p * E.c(0.16 + 0.08 * r3)), d = u * R * (24 + 40 * r3);
    leaf(ctx, k, Pp.x[i] + Pp.nx[i] * d + Math.sin(TAU * (life * 1.4 + r4)) * 14 * u, Pp.y[i] + Pp.ny[i] * d + life * u * R * 120, TAU * life * (r4 < 0.5 ? 0.6 : -0.6) + r1 * TAU, u * 9 * R, pal, Math.sin(Math.PI * life) * 0.8 * TAP(S, j), u, dark);
  }
  ctx.globalAlpha = 1;
};

function heart(ctx, X, Y, s) {
  ctx.beginPath();
  ctx.moveTo(X, Y + s * 0.9);
  ctx.bezierCurveTo(X - s * 1.4, Y - s * 0.1, X - s * 0.7, Y - s * 1.1, X, Y - s * 0.35);
  ctx.bezierCurveTo(X + s * 0.7, Y - s * 1.1, X + s * 1.4, Y - s * 0.1, X, Y + s * 0.9);
  ctx.closePath();
}
FX.neutral = (ctx, S, E) => {
  const { u, I, R, pal, p, dark } = E, Pp = S.P, st = Pp.step, n = Pp.n;
  ctx.globalCompositeOperation = E.add ? "lighter" : "source-over";
  const b = beat(frac(p * E.c(0.6))), dOut = u * R * 12, lc = dark ? pal.hi : pal.deep;
  strokeAlong(ctx, S, () => 0, 1.5 * u, lc, 0.75 + 0.25 * b);
  strokeAlong(ctx, S, () => dOut, 0.9 * u, lc, 0.65);
  strokeAlong(ctx, S, () => dOut + 16 * u * R, 0.6 * u, lc, 0.3);
  // scale ticks drifting one notch at a time
  const Nt = Math.max(8, Math.round((n * st) / (13 * u))), spx = n / Nt, sh = p * E.c(1);
  ctx.strokeStyle = lc; ctx.lineWidth = 1 * u;
  for (let q = 0; q < Nt; q++) {
    const gi = Math.floor((((q + sh) * spx) % n + n) % n), jl = (((gi - S.i0) % n) + n) % n;
    if (jl > S.m) continue;
    const w = TAP(S, jl);
    if (w < 0.02) continue;
    const len = (q % 6 === 0 ? 15 : 6) * u * R;
    ctx.globalAlpha = 0.8 * w;
    ctx.beginPath(); ctx.moveTo(Pp.x[gi] + Pp.nx[gi] * dOut, Pp.y[gi] + Pp.ny[gi] * dOut); ctx.lineTo(Pp.x[gi] + Pp.nx[gi] * (dOut + len), Pp.y[gi] + Pp.ny[gi] * (dOut + len)); ctx.stroke();
  }
  // heart sigils pulsing on the beat
  ctx.strokeStyle = lc; ctx.lineWidth = 1.1 * u;
  motifs(S, 260, u, (gi, jl, w, q) => {
    const d = dOut + 30 * u * R, s = u * R * 5 * (1 + 0.18 * b);
    ctx.globalAlpha = w * (0.7 + 0.3 * b);
    heart(ctx, Pp.x[gi] + Pp.nx[gi] * d, Pp.y[gi] + Pp.ny[gi] * d, s); ctx.stroke();
    sparkle(ctx, Pp.x[gi] + Pp.nx[gi] * (d - 12 * u), Pp.y[gi] + Pp.ny[gi] * (d - 12 * u), 3 * u, dark ? pal.core : pal.deep, w);
  }, 0.5);
  // comets
  const g = glowSpr(pal.hi);
  for (let c = 0; c < 2; c++) {
    const trail = Math.round((100 * u) / st);
    const head = S.closed ? frac(hsh(c, S.id) + p * E.c(0.22)) * S.m : frac(hsh(c, S.id) + p * E.c(0.22)) * (S.m + trail);
    let j0 = head - trail, j1 = head;
    if (!S.closed) { j0 = Math.max(0, j0); j1 = Math.min(S.m, j1); }
    if (j1 - j0 >= 4) {
      const pts = along(S, j0, j1, () => 0, 2), a0 = TAP(S, clamp(head, 0, S.m));
      const gr = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]);
      gr.addColorStop(0, rgba(dark ? pal.core : pal.deep, 0)); gr.addColorStop(1, rgba(dark ? pal.core : pal.deep, 1));
      ctx.globalAlpha = a0; ctx.fillStyle = gr;
      ribbonPts(ctx, pts, (t) => u * 2.6 * t); ctx.fill();
    }
    if (S.closed || (head >= 0 && head <= S.m)) {
      const i = IX(S, clamp(head, 0, S.m)), a0 = TAP(S, clamp(head, 0, S.m));
      ctx.globalAlpha = a0 * (E.add ? 0.7 : 0.35); ctx.drawImage(g, Pp.x[i] - 18 * u, Pp.y[i] - 18 * u, 36 * u, 36 * u);
      sparkle(ctx, Pp.x[i], Pp.y[i], 12 * u * R, dark ? pal.core : pal.deep, a0);
    }
  }
  // corner compass stars
  for (const ci of Pp.corners) {
    const jl = (((ci - S.i0) % n) + n) % n;
    if (jl > S.m) continue;
    sparkle(ctx, Pp.x[ci] + Pp.nx[ci] * 22 * u * R, Pp.y[ci] + Pp.ny[ci] * 22 * u * R, 10 * u * (1 + 0.3 * b), dark ? pal.core : pal.deep, 0.9 * TAP(S, jl));
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
};

/* ---------- text ---------- */
function runWidth(ctx, str, sp) {
  const ch = Array.from(str);
  let w = 0;
  for (const c of ch) w += ctx.measureText(c).width;
  return w + sp * Math.max(0, ch.length - 1);
}
function drawRun(ctx, str, x, y, sp, align) {
  const ch = Array.from(str), w = runWidth(ctx, str, sp);
  let cx = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of ch) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sp; }
  ctx.textAlign = prev;
  return w;
}
const METAL_STOPS = {
  dark: [[0, "#FFFFFF"], [0.45, "#DDE1E8"], [0.55, "#8E95A2"], [0.8, "#EEF0F4"], [1, "#B9BFC9"]],
  light: [[0, "#3A3E46"], [0.45, "#6E737D"], [0.55, "#111317"], [0.8, "#3B3F47"], [1, "#22252B"]],
};
function textFill(ctx, mode, custom, y0, y1, E, attrs) {
  if (mode === "metal") {
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    METAL_STOPS[E.dark ? "dark" : "light"].forEach(([o, c]) => gr.addColorStop(o, c));
    return gr;
  }
  if (mode === "attrL" || mode === "attrR") {
    const pal = palOf(mode === "attrL" ? attrs[0] : attrs[1], E.dark);
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, E.dark ? pal.core : pal.main); gr.addColorStop(0.55, E.dark ? pal.hi : pal.deep); gr.addColorStop(1, E.dark ? pal.main : pal.deep);
    return gr;
  }
  if (mode === "sub") return E.tone.sub;
  if (mode === "custom") return custom || E.tone.ink;
  return E.tone.ink;
}
function palOf(attr, dark) { const A = ATTRS[attr] || ATTRS.neutral; return dark ? A.dark : A.light; }

let _txc = null;
function drawText(ctx, t, L, E, attrs, hits) {
  if (!t.show || !t.text) return;
  const { u, W, H } = L, px = t.size * u, sp = t.spacing * px;
  const lines = String(t.text).split("\n"), lh = px * (t.lh || 1.25);
  ctx.font = fontStr(t.font, t.weight, px, t.italic);
  ctx.textBaseline = "alphabetic";
  const widths = lines.map((ln) => runWidth(ctx, ln, sp));
  const maxW = Math.max(1, ...widths);
  const X = t.x * W, Ytop = t.y * H - (lh * lines.length) / 2;
  const x0 = t.align === "left" ? X : t.align === "right" ? X - maxW : X - maxW / 2;
  const box = { x0: x0 - 10 * u, y0: Ytop - 6 * u, x1: x0 + maxW + 10 * u, y1: Ytop + lh * lines.length + 6 * u };
  if (hits) hits.push({ type: "text", id: t.id, ...box });
  const p = E.p;
  let alpha = 1, glowMul = 1;
  if (t.anim === "breath") { const b = 0.5 + 0.5 * Math.sin(TAU * E.c(0.35) * p); glowMul = 0.35 + 0.9 * b; alpha = 0.82 + 0.18 * b; }
  if (t.anim === "flicker") {
    const f = frac(p * E.c(0.25));
    if ((f > 0.1 && f < 0.12) || (f > 0.62 && f < 0.635)) alpha = 0.25; else if (f > 0.14 && f < 0.155) alpha = 0.6;
  }
  const glowCol = t.color === "attrL" ? palOf(attrs[0], E.dark).main : t.color === "attrR" ? palOf(attrs[1], E.dark).main : E.dark ? "#DDE6FF" : "#8A93A6";
  // decoration
  const lineCol = E.tone.line;
  if (t.deco && t.deco !== "none") {
    const gap = Math.max(16 * u, px * 0.9), rl = (t.decoLen || 1) * Math.max(120 * u, px * 4);
    const ya = Ytop + (lh * lines.length) / 2;
    ctx.globalAlpha = alpha;
    const l0 = x0 - gap, r0 = x0 + maxW + gap;
    if (t.deco === "rule") {
      for (const [a, b, dir] of [[l0, l0 - rl, -1], [r0, r0 + rl, 1]]) {
        const gr = ctx.createLinearGradient(a, 0, b, 0);
        gr.addColorStop(0, lineCol + "0.75)"); gr.addColorStop(1, lineCol + "0)");
        ctx.strokeStyle = gr; ctx.lineWidth = Math.max(1, px * 0.045);
        ctx.beginPath(); ctx.moveTo(a, ya); ctx.lineTo(b, ya); ctx.stroke();
        ctx.fillStyle = lineCol + "0.85)";
        diamond(ctx, a + dir * px * 0.12, ya, px * 0.16, px * 0.07, 0); ctx.fill();
      }
    } else if (t.deco === "stars") {
      ctx.fillStyle = E.dark ? "#F2F4F8" : "#2A2D33";
      star4(ctx, l0 - px * 0.1, ya, px * 0.2, px * 0.34, 0.1); ctx.fill();
      star4(ctx, r0 + px * 0.1, ya, px * 0.2, px * 0.34, 0.1); ctx.fill();
    }
  }
  const paint = (c) => {
    c.font = ctx.font;
    c.fillStyle = textFill(c, t.color, t.custom, Ytop, Ytop + lh * lines.length, E, attrs);
    lines.forEach((ln, li) => {
      const y = Ytop + lh * li + lh / 2 + px * 0.36;
      drawRun(c, ln, t.align === "left" ? x0 : t.align === "right" ? x0 + maxW : x0 + maxW / 2, y, sp, t.align);
    });
  };
  ctx.globalAlpha = alpha;
  if (t.glow > 0) {
    ctx.save();
    ctx.shadowColor = rgba(glowCol, Math.min(1, 0.85 * glowMul));
    ctx.shadowBlur = px * 0.55 * t.glow * glowMul * E.k;
    paint(ctx);
    ctx.restore();
  }
  ctx.globalAlpha = alpha;
  paint(ctx);
  if (t.anim === "shine") {
    const f = frac(p * E.c(0.3)), bx = lerp(x0 - maxW * 0.4, x0 + maxW * 1.4, f), bw = Math.max(maxW * 0.22, px * 1.2);
    const pad = 4 * u, cw = (maxW + pad * 2) * E.k, chh = (lh * lines.length + pad * 2) * E.k;
    if (!_txc || _txc.width < cw || _txc.height < chh) _txc = mk(Math.max(cw, _txc ? _txc.width : 0), Math.max(chh, _txc ? _txc.height : 0));
    const c = _txc.g;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, _txc.width, _txc.height);
    c.setTransform(E.k, 0, 0, E.k, -(x0 - pad) * E.k, -(Ytop - pad) * E.k);
    c.globalCompositeOperation = "source-over";
    paint(c);
    c.globalCompositeOperation = "source-in";
    const gr = c.createLinearGradient(bx - bw, Ytop, bx + bw, Ytop + lh * lines.length);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, E.dark ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.85)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gr; c.fillRect(x0 - pad, Ytop - pad, maxW + pad * 2, lh * lines.length + pad * 2);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha * Math.sin(Math.PI * clamp((f - 0.02) / 0.96, 0, 1)) ** 0.5;
    ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
    ctx.drawImage(_txc, 0, 0, cw, chh, (x0 - pad) * E.k, (Ytop - pad) * E.k, cw, chh);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------- pieces ---------- */
function clipPoly(ctx, poly) { ctx.beginPath(); poly.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.clip(); }
function pathPoly(ctx, poly) { ctx.beginPath(); poly.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); }
function drawBackground(ctx, L, E, st) {
  const { W, H, u } = L, tone = E.tone;
  if (tone.grad) {
    const G = tone.grad, lg = ctx.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, G.a); lg.addColorStop(0.5, G.mid); lg.addColorStop(1, G.b);
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    // soft blooms of each attribute in its own corner, slowly breathing
    const br = 0.85 + 0.15 * Math.sin(TAU * E.c(0.2) * E.p);
    [[G.ga, W * 0.12, H * 0.1], [G.gb, W * 0.88, H * 0.9]].forEach(([c, x, y]) => {
      const g = glowSpr(c), r = Math.max(W, H) * 0.62;
      ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
      ctx.globalAlpha = (E.dark ? 0.2 : 0.22) * br;
      ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
    });
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, rgba(tone.bg1, 0)); vg.addColorStop(1, rgba(tone.bg1, E.dark ? 0.6 : 0.35));
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  } else {
    const gr = ctx.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.5, Math.hypot(W, H) * 0.58);
    gr.addColorStop(0, tone.bg0); gr.addColorStop(1, tone.bg1);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  const nz = tinted("__noise", tone.smoke) || (() => { ART.m.__noise = noiseTex(); return tinted("__noise", tone.smoke); })();
  ctx.globalAlpha = tone.smokeA * 2.2; ctx.drawImage(nz, 0, 0, W, H);
  ctx.globalAlpha = tone.smokeA * 1.2; ctx.drawImage(nz, W, 0, -W * 1.4, H * 1.3);
  ctx.globalAlpha = 1;
  // attribute ambience
  if ((st.emblem.show || st.frame.ambient) && !tone.grad) {
    const at = E.sideAttrs;
    [[0, L.emblems[0] ? L.emblems[0].x : W * 0.12], [1, L.emblems[1] ? L.emblems[1].x : W * 0.88]].forEach(([s, x]) => {
      const pal = palOf(at[s], E.dark), g = glowSpr(pal.main);
      ctx.globalCompositeOperation = E.dark ? "lighter" : "multiply";
      ctx.globalAlpha = E.dark ? 0.12 : 0.05;
      const r = H * 0.62;
      const yy = L.emblems[s] ? L.emblems[s].y : H * st.emblem.y;
      ctx.drawImage(g, x - r, yy - r, r * 2, r * 2);
    });
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }
  void u;
}
function drawArchBack(ctx, L, E, st) {
  const { W, H, u, M } = L, A = st.arch, op = A.opacity, line = E.tone.line, p = E.p;
  const cy = L.group.y + L.group.h / 2, cx = W / 2;
  if (A.watermark && ART.m.logo_big) {
    const lg = metal("logo_big", E.dark), w = Math.min(W * 0.82, H * 2.1), h = (w * lg.height) / lg.width;
    ctx.globalAlpha = (E.dark ? 0.07 : 0.06) * op;
    ctx.drawImage(lg, cx - w / 2, cy - h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  if (A.compass) {
    const R = Math.min(H * 0.44, W * 0.3), a = (E.dark ? 0.2 : 0.16) * op;
    ctx.strokeStyle = line + a + ")"; ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    const nT = 180, rot = (TAU / nT) * E.c(0.4) * p;
    ctx.beginPath();
    for (let t = 0; t < nT; t++) {
      const ang = rot + (t * TAU) / nT, long = t % 15 === 0, r0 = R * (long ? 0.955 : 0.975);
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    }
    ctx.lineWidth = 0.8 * u; ctx.stroke();
    ctx.strokeStyle = line + a * 0.9 + ")";
    ctx.beginPath(); ctx.moveTo(cx, cy - R * 1.12); ctx.lineTo(cx, cy + R * 1.12); ctx.stroke();
    ctx.fillStyle = line + Math.min(1, a * 3.2) + ")";
    star4(ctx, cx, cy - R * 1.12, 6 * u, 14 * u, 0.08); ctx.fill();
    star4(ctx, cx, cy + R * 1.12, 6 * u, 14 * u, 0.08); ctx.fill();
  }
  if (A.beam) {
    const y = st.emblem.show && !L.corner ? H * st.emblem.y : cy, a = (E.dark ? 0.5 : 0.4) * op;
    const gr = ctx.createLinearGradient(M, 0, W - M, 0);
    gr.addColorStop(0, line + "0)"); gr.addColorStop(0.2, line + a * 0.6 + ")"); gr.addColorStop(0.5, line + a + ")"); gr.addColorStop(0.8, line + a * 0.6 + ")"); gr.addColorStop(1, line + "0)");
    ctx.strokeStyle = gr; ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
    const f = frac(p * E.c(0.2)), x = lerp(M, W - M, f), al = Math.sin(Math.PI * f) * op;
    const g = glowSpr(E.dark ? "#FFFFFF" : "#8E96A6");
    ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
    ctx.globalAlpha = al * (E.dark ? 0.7 : 0.35); ctx.drawImage(g, x - 40 * u, y - 40 * u, 80 * u, 80 * u);
    ctx.globalAlpha = al; ctx.fillStyle = E.dark ? "#FFFFFF" : "#2A2D33";
    star4(ctx, x, y, 34 * u, 8 * u, 0.06); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
}
function drawArchFront(ctx, L, E, st) {
  const { W, H, u, M } = L, A = st.arch, op = A.opacity, line = E.tone.line;
  if (A.submark && ART.m.submark && L.crest) {
    const sm = metal("submark", E.dark), cx = L.frameRect.x + L.frameRect.w / 2, y = L.frameRect.y, r = 34 * u;
    const dg = ctx.createRadialGradient(cx, y - r * 0.3, r * 0.1, cx, y, r);
    dg.addColorStop(0, rgba(E.tone.bg0, 0.98)); dg.addColorStop(1, rgba(E.tone.bg1, 0.98));
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(cx, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = line + "0.7)"; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(cx, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = line + "0.28)"; ctx.lineWidth = 0.8 * u; ctx.beginPath(); ctx.arc(cx, y, r * 1.18, 0, TAU); ctx.stroke();
    const at = E.sideAttrs, pa = palOf(at[0], E.dark), pb = palOf(at[1], E.dark);
    ctx.fillStyle = rgba(E.dark ? pa.hi : pa.main, 0.95); diamond(ctx, cx - r * 1.18, y, 5 * u, 2.2 * u, 0); ctx.fill();
    ctx.fillStyle = rgba(E.dark ? pb.hi : pb.main, 0.95); diamond(ctx, cx + r * 1.18, y, 5 * u, 2.2 * u, 0); ctx.fill();
    const h = 40 * u, w = (h * sm.width) / sm.height;
    if (E.dark) { const gl = tinted("submark", "#FFFFFF", true), pad = (ART.bpad.submark * h) / sm.height; ctx.globalAlpha = 0.3 * op; ctx.drawImage(gl, cx - w / 2 - pad, y - h / 2 - pad, w + pad * 2, h + pad * 2); }
    ctx.globalAlpha = Math.min(1, op); ctx.drawImage(sm, cx - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
    const by = L.frameRect.y + L.frameRect.h, br = 16 * u;
    const bg2 = ctx.createRadialGradient(cx, by, 0, cx, by, br);
    bg2.addColorStop(0, rgba(E.tone.bg0, 0.98)); bg2.addColorStop(1, rgba(E.tone.bg1, 0.98));
    ctx.fillStyle = bg2; diamond(ctx, cx, by, br, br, Math.PI / 4); ctx.fill();
    ctx.strokeStyle = line + "0.7)"; ctx.lineWidth = 1 * u; diamond(ctx, cx, by, br, br, Math.PI / 4); ctx.stroke();
    ctx.fillStyle = E.dark ? "#F4F6FA" : E.tone.ink; star4(ctx, cx, by, 6 * u, 11 * u, 0.06); ctx.fill();
  } else if (A.submark && ART.m.submark) {
    const sm = metal("submark", E.dark), h = 50 * u, w = (h * sm.width) / sm.height, y = L.tb * 0.6, cx = W / 2;
    if (E.dark) { const gl = tinted("submark", "#FFFFFF", true), pad = (ART.bpad.submark * h) / sm.height; ctx.globalAlpha = 0.28 * op; ctx.drawImage(gl, cx - w / 2 - pad, y - h / 2 - pad, w + pad * 2, h + pad * 2); }
    ctx.globalAlpha = Math.min(1, op);
    ctx.drawImage(sm, cx - w / 2, y - h / 2, w, h);
    const g0 = w / 2 + 16 * u, len = Math.min(300 * u, L.group.w * 0.3);
    for (const dir of [-1, 1]) {
      const a = cx + dir * g0, b = cx + dir * (g0 + len);
      const gr = ctx.createLinearGradient(a, 0, b, 0);
      gr.addColorStop(0, line + 0.8 * op + ")"); gr.addColorStop(1, line + "0)");
      ctx.strokeStyle = gr; ctx.lineWidth = 1.2 * u;
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
      ctx.fillStyle = line + Math.min(1, 0.9 * op) + ")";
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(a + dir * 9 * u, y - 3 * u); ctx.lineTo(a + dir * 9 * u, y + 3 * u); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (A.wordmark && ART.m.logo_mono) {
    const lg = metal("logo_mono", E.dark), h = 30 * u, w = (h * lg.width) / lg.height;
    ctx.globalAlpha = 0.9 * Math.min(1, op);
    ctx.drawImage(lg, W - M - w, M * 0.55, w, h);
    ctx.globalAlpha = 1;
  }
}
function drawSlotImage(ctx, L, i, st, img, E) {
  const s = L.slots[i], sl = st.slots[i], tone = E.tone, u = L.u;
  ctx.save();
  if (L.mode === "slant") clipPoly(ctx, L.groupPoly);
  clipPoly(ctx, s.poly);
  const bw = s.bx1 - s.bx0, bh = s.by1 - s.by0;
  if (img) {
    const sc = Math.max(bw / img.w, bh / img.h) * sl.zoom, dw = img.w * sc, dh = img.h * sc;
    const x = s.bx0 + (bw - dw) / 2 + sl.ox * (dw - bw) / 2, y = s.by0 + (bh - dh) / 2 + sl.oy * (dh - bh) / 2;
    ctx.drawImage(img.src, x, y, dw, dh);
  } else {
    ctx.fillStyle = tone.slot; ctx.fillRect(s.bx0, s.by0, bw, bh);
    ctx.strokeStyle = tone.line + "0.07)"; ctx.lineWidth = 1 * u;
    ctx.beginPath();
    for (let d = -bh; d < bw; d += 22 * u) { ctx.moveTo(s.bx0 + d, s.by1); ctx.lineTo(s.bx0 + d + bh, s.by0); }
    ctx.stroke();
    const ic = tinted(sl.attr, tone.line + "0.22)");
    if (ic) { const h = Math.min(bw, bh) * 0.26, w = (h * ic.width) / ic.height; ctx.drawImage(ic, s.cx - w / 2, s.cy - h / 2 - 18 * u, w, h); }
    ctx.fillStyle = tone.sub; ctx.font = fontStr("IBM Plex Sans KR", 500, 22 * u); ctx.textAlign = "center";
    ctx.fillText(i + 1 + "번 사진", s.cx, s.cy + Math.min(bw, bh) * 0.13 + 14 * u);
    ctx.textAlign = "left";
  }
  if (st.caption.show === "inside" && st.caption.shade) {
    const lightP = profileLight(st, E), pd = palOf(sl.attr, true), top = s.by1 - bh * 0.6;
    const sg = ctx.createLinearGradient(0, top, 0, s.by1);
    if (lightP) { sg.addColorStop(0, "rgba(250,251,253,0)"); sg.addColorStop(0.5, "rgba(248,249,252,0.55)"); sg.addColorStop(1, "rgba(246,247,250,0.92)"); }
    else { sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(0.55, "rgba(4,5,8,0.5)"); sg.addColorStop(1, "rgba(4,5,8,0.86)"); }
    ctx.fillStyle = sg; ctx.fillRect(s.bx0, top, bw, s.by1 - top);
    const duo = L.slots.length === 1 && sl.duo && sl.p2;
    const halves = duo ? [[sl.attr, s.bx0, bw / 2], [sl.p2.attr, s.bx0 + bw / 2, bw / 2]] : [[sl.attr, s.bx0, bw]];
    for (const [at, hx, hw] of halves) {
      const pdd = palOf(at, !lightP), tc = lightP ? pdd.hi : pdd.deep, ta = lightP ? 0.34 : 0.42;
      ctx.save();
      ctx.translate(hx + hw / 2, s.by1); ctx.scale(hw * (duo ? 0.62 : 0.75), bh * 0.42);
      const tg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      tg.addColorStop(0, rgba(tc, ta)); tg.addColorStop(0.6, rgba(tc, ta * 0.4)); tg.addColorStop(1, rgba(tc, 0));
      ctx.fillStyle = tg; ctx.fillRect(-1.2, -1.05, 2.4, 1.05);
      ctx.restore();
    }
    void pd;
  }
  if (st.frame.inner) {
    const pal = palOf(sl.attr, E.dark);
    pathPoly(ctx, s.poly);
    ctx.lineWidth = 30 * u; ctx.strokeStyle = rgba(E.dark ? "#000000" : pal.deep, E.dark ? 0.35 : 0.12); ctx.stroke();
    ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
    ctx.lineWidth = 8 * u; ctx.strokeStyle = rgba(pal.hi, E.dark ? 0.3 : 0.25); ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
}
function drawDividers(ctx, L, E, st) {
  if (L.mode !== "slant") return;
  const { group: g, u } = L;
  L.bounds.forEach((b, k) => {
    const pa = palOf(st.slots[k].attr, E.dark), pb = palOf(st.slots[k + 1].attr, E.dark);
    ctx.save(); clipPoly(ctx, L.groupPoly);
    ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
    const line = (off, col, w, a) => { ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(b.xt + off, g.y); ctx.lineTo(b.xb + off, g.y + g.h); ctx.stroke(); };
    line(-3 * u, pa.main, 6 * u, 0.35); line(3 * u, pb.main, 6 * u, 0.35);
    line(-1.2 * u, pa.hi, 1.6 * u, 0.9); line(1.2 * u, pb.hi, 1.6 * u, 0.9);
    line(0, E.dark ? "#FFFFFF" : E.tone.ink, 0.9 * u, 0.9);
    ctx.restore();
    const my = g.y + g.h / 2, mx = (b.xt + b.xb) / 2;
    ctx.fillStyle = E.dark ? "#FFFFFF" : E.tone.ink;
    star4(ctx, mx, my, 9 * u, 18 * u, 0.08); ctx.fill();
  });
}
function drawFrameBase(ctx, L, E, st, frames, holes) {
  const u = L.u, line = E.tone.line;
  for (const Pp of frames) {
    const mk = holes.length ? (i) => holeMask(Pp.x[i], Pp.y[i], holes, u) : () => 1;
    if (st.frame.base) {
      ctx.strokeStyle = line + (E.dark ? 0.55 : 0.6) + ")"; ctx.lineWidth = 1.2 * u;
      for (let j0 = 0; j0 < Pp.n; j0 += 8) {
        const a = mk((j0 + 4) % Pp.n);
        if (a < 0.02) continue;
        ctx.globalAlpha = a; ctx.beginPath();
        for (let j = j0; j <= j0 + 8; j++) { const i = j % Pp.n; j === j0 ? ctx.moveTo(Pp.x[i], Pp.y[i]) : ctx.lineTo(Pp.x[i], Pp.y[i]); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (st.frame.brackets) {
      const span = Math.round((34 * u) / Pp.step), off = 15 * u;
      ctx.strokeStyle = line + (E.dark ? 0.85 : 0.8) + ")"; ctx.lineWidth = 1.6 * u; ctx.lineCap = "square";
      for (const ci of Pp.corners) {
        if (mk(ci) < 0.5) continue;
        ctx.beginPath();
        for (let k = -span; k <= span; k++) {
          const i = (ci + k + Pp.n) % Pp.n, X = Pp.x[i] + Pp.nx[i] * off, Y = Pp.y[i] + Pp.ny[i] * off;
          k === -span ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
    }
  }
  if (L.groupType) {
    // hairline around each photo inside the shared frame
    ctx.strokeStyle = line + (E.dark ? 0.32 : 0.4) + ")"; ctx.lineWidth = 1 * u;
    L.slots.forEach((sl) => { if (L.mode === "slant") return; pathPoly(ctx, sl.poly); ctx.stroke(); });
    // ornaments in the gaps between photos
    if (L.mode !== "slant") {
      for (let i = 0; i < L.slots.length - 1; i++) {
        const a = L.slots[i], b = L.slots[i + 1];
        if (a.row !== b.row || b.bx0 - a.bx1 < 14 * u) continue;
        const x = (a.bx1 + b.bx0) / 2, y0 = Math.max(a.by0, b.by0) + 10 * u, y1 = Math.min(a.by1, b.by1) - 10 * u, cy = (y0 + y1) / 2;
        const gr = ctx.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, line + "0)"); gr.addColorStop(0.5, line + (E.dark ? 0.55 : 0.6) + ")"); gr.addColorStop(1, line + "0)");
        ctx.strokeStyle = gr; ctx.lineWidth = 1 * u;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, cy - 22 * u); ctx.moveTo(x, cy + 22 * u); ctx.lineTo(x, y1); ctx.stroke();
        ctx.fillStyle = E.dark ? "#F4F6FA" : E.tone.ink;
        star4(ctx, x, cy, 6 * u, 14 * u, 0.06); ctx.fill();
        ctx.fillStyle = line + "0.8)";
        diamond(ctx, x, cy - 34 * u, 2.4 * u, 2.4 * u, Math.PI / 4); ctx.fill();
        diamond(ctx, x, cy + 34 * u, 2.4 * u, 2.4 * u, Math.PI / 4); ctx.fill();
      }
    }
  }
}
function iconAnim(attr, p, E, st, u, sc) {
  let rot = 0, sx = 1, sy = 1, dy = 0, bright = 1, pivot = 0, trail = 0, spark = 0;
  switch (attr) {
    case "fire": sy = 1 + 0.045 * Math.sin(TAU * E.c(1.6) * p); bright = 0.85 + 0.2 * Math.sin(TAU * E.c(2.3) * p); break;
    case "water": dy = -5 * u * sc * Math.sin(TAU * E.c(0.5) * p); break;
    case "wind": { const f = frac(p * E.c(0.4)); rot = -TAU * (f - (0.55 * Math.sin(TAU * f)) / TAU); trail = 1; break; }
    case "lightning": { const f = flashAt(p, E.T).f; bright = 1 + f * 0.9; sx = sy = 1 + f * 0.05; break; }
    case "ice": { rot = (TAU / 4) * p * E.c(0.15); const fl = Math.pow(0.5 + 0.5 * Math.sin(TAU * E.c(0.5) * p), 10); bright = 1 + 1.1 * fl; sx = sy = 1 + 0.04 * fl; spark = 1; break; }
    case "grass": rot = 0.08 * Math.sin(TAU * E.c(0.35) * p); pivot = 0.42; break;
    case "neutral": { const b = beat(frac(p * E.c(0.6))); sx = sy = 1 + 0.07 * b; bright = 1 + 0.5 * b; break; }
  }
  if (!st.emblem.spin && (attr === "wind" || attr === "ice")) { rot = 0; trail = 0; }
  return { rot, sx, sy, dy, bright, pivot, trail, spark, p };
}
function drawAttrIcon(ctx, attr, X, Y, ih, E, an) {
  const mask = ART.m[attr];
  if (!mask) return;
  const pal = palOf(attr, E.dark), iw = (ih * mask.width) / mask.height;
  ctx.save();
  ctx.translate(X, Y + an.dy);
  if (an.pivot) { ctx.translate(0, ih * an.pivot); ctx.rotate(an.rot); ctx.translate(0, -ih * an.pivot); } else ctx.rotate(an.rot);
  ctx.scale(an.sx, an.sy);
  const gl = tinted(attr, pal.main, true), pad = (ART.bpad[attr] * ih) / mask.height;
  if (gl) {
    ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
    ctx.globalAlpha = (E.dark ? 0.95 : 0.35) * Math.min(1.6, an.bright);
    ctx.drawImage(gl, -iw / 2 - pad, -ih / 2 - pad, iw + pad * 2, ih + pad * 2);
    ctx.globalCompositeOperation = "source-over";
  }
  if (an.trail) {
    // afterimages trailing behind the spin
    const tc = tinted(attr, pal.main);
    for (let k = 4; k >= 1; k--) {
      ctx.save(); ctx.rotate(k * 0.17);
      ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
      ctx.globalAlpha = 0.34 / k; ctx.drawImage(tc, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(tinted(attr, E.dark ? pal.hi : pal.main), -iw / 2, -ih / 2, iw, ih);
  if (an.bright > 1.02) { ctx.globalAlpha = Math.min(1, an.bright - 1); ctx.drawImage(tinted(attr, pal.core), -iw / 2, -ih / 2, iw, ih); }
  if (an.spark) {
    // twinkles on the crystal tips
    const tips = [[0, -0.46], [0, 0.46], [-0.46, 0], [0.46, 0], [-0.3, -0.3], [0.3, 0.3], [0.3, -0.3], [-0.3, 0.3]];
    const g = glowSpr(pal.hi);
    tips.forEach(([tx, ty], k) => {
      const tw = Math.pow(0.5 + 0.5 * Math.sin(TAU * (E.c(0.6) * an.p + k / tips.length)), 6);
      if (tw < 0.04) return;
      const x = tx * iw * (k >= 4 ? 1.08 : 1), y = ty * ih, r = ih * 0.11 * (0.5 + tw);
      ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
      ctx.globalAlpha = tw * (E.dark ? 0.8 : 0.4); ctx.drawImage(g, x - r * 2, y - r * 2, r * 4, r * 4);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = tw; ctx.fillStyle = E.dark ? pal.core : pal.deep;
      star4(ctx, x, y, r * 0.5, r, 0.05); ctx.fill();
    });
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
/* medallion set into a frame corner */
function drawMedallion(ctx, m, attr, side, L, E, st) {
  const u = L.u, pal = palOf(attr, E.dark), tone = E.tone, line = tone.line, p = E.p, { x, y, r } = m, sc = r / (84 * u);
  const g = glowSpr(pal.main);
  ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
  ctx.globalAlpha = E.dark ? 0.4 : 0.16; ctx.drawImage(g, x - r * 2.3, y - r * 2.3, r * 4.6, r * 4.6);
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  const dg = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r * 1.05);
  dg.addColorStop(0, rgba(tone.bg0, 0.98)); dg.addColorStop(1, rgba(tone.bg1, 0.98));
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, TAU); ctx.fill();
  ctx.strokeStyle = line + "0.75)"; ctx.lineWidth = 1.3 * u; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = line + "0.3)"; ctx.lineWidth = 0.8 * u; ctx.beginPath(); ctx.arc(x, y, r * 1.15, 0, TAU); ctx.stroke();
  const rg = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  rg.addColorStop(0, rgba(pal.hi, 0.9)); rg.addColorStop(0.5, rgba(pal.main, 0.35)); rg.addColorStop(1, rgba(pal.hi, 0.9));
  ctx.strokeStyle = rg; ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.arc(x, y, r * 0.93, 0, TAU); ctx.stroke();
  const nT = 60, spin = st.emblem.spin ? (TAU / nT) * E.c(0.5) * p * (side ? -1 : 1) : 0;
  ctx.beginPath();
  for (let t = 0; t < nT; t++) {
    const a = spin + (t * TAU) / nT, r0 = r * (t % 5 === 0 ? 0.76 : 0.81), r1 = r * 0.86;
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  ctx.strokeStyle = rgba(pal.main, E.dark ? 0.6 : 0.75); ctx.lineWidth = 0.9 * u; ctx.stroke();
  ctx.fillStyle = line + "0.95)";
  star4(ctx, x, y - r * 1.15, 4 * u * sc, 10 * u * sc, 0.08); ctx.fill();
  star4(ctx, x, y + r * 1.15, 4 * u * sc, 10 * u * sc, 0.08); ctx.fill();
  star4(ctx, x - r * 1.15, y, 10 * u * sc, 4 * u * sc, 0.08); ctx.fill();
  star4(ctx, x + r * 1.15, y, 10 * u * sc, 4 * u * sc, 0.08); ctx.fill();
  const dir = side ? -1 : 1, d45 = Math.SQRT1_2;
  drawAttrIcon(ctx, attr, x, y, r * 1.34, E, iconAnim(attr, p, E, st, u, sc));
  ctx.fillStyle = rgba(E.dark ? pal.hi : pal.main, 0.95); diamond(ctx, x + dir * d45 * r * 1.15, y + dir * d45 * r * 1.15, 7 * u * sc, 2.6 * u * sc, Math.PI / 4); ctx.fill();
}
/* attribute name set into the frame line next to a medallion */
function legendOf(ctx, m, attr, side, L, st) {
  const s0 = st.slots[0], lab = st.emblem.label, slot = side ? (st.layout.count === 1 && s0.duo && s0.p2 ? s0.p2 : st.slots[st.layout.count - 1]) : s0;
  const rank = st.emblem.rank && slot && slot.rank ? slot.rank : "";
  if ((lab === "none" && !rank) || !L.corner) return null;
  const u = L.u, sc = m.r / (84 * u), A = ATTRS[attr];
  const pe = 16 * u * sc, pk = 16 * u * sc, bs = rank ? 20 * u * sc : 0;
  const y = side ? L.frameRect.y + L.frameRect.h : L.frameRect.y;
  // room along the frame line between the medallion and the crest (or the far end)
  const crest = st.arch.submark && L.groupType, cx = L.frameRect.x + L.frameRect.w / 2;
  const lo = side ? (crest ? cx + 30 * u : L.frameRect.x + 20 * u) : m.x + m.r * 1.3 + 14 * u;
  const hi = side ? m.x - m.r * 1.3 - 14 * u : crest ? cx - 46 * u : L.frameRect.x + L.frameRect.w - 20 * u;
  const room = hi - lo;
  const tries = [[lab === "kr" || lab === "none" ? "" : A.en, lab === "en" || lab === "none" ? "" : A.kr], [lab === "none" ? "" : A.en, ""], ["", ""]];
  let out = null;
  for (const [en, kr] of tries) {
    ctx.font = fontStr("Cinzel", 600, pe); const we = en ? runWidth(ctx, en, pe * 0.34) : 0;
    ctx.font = fontStr("Hahmlet", 500, pk); const wk = kr ? runWidth(ctx, kr, pk * 0.16) : 0;
    const gap = en && kr ? 22 * u * sc : 0, rgap = rank && (en || kr) ? 16 * u * sc : 0, w = we + gap + wk + rgap + bs * 2 + 30 * u * sc;
    if (!en && !kr && !rank) return null;
    out = { w, en, kr, we, wk, gap, rgap };
    if (w <= room) break;
  }
  const x0 = side ? Math.max(lo, hi - out.w) : Math.min(lo, Math.max(L.frameRect.x + 20 * u, hi - out.w));
  return { x0, x1: x0 + out.w, y, en: out.en, kr: out.kr, pe, pk, we: out.we, wk: out.wk, gap: out.gap, sc, attr, rank, bs, rgap: out.rgap };
}
function drawLegend(ctx, lg, E) {
  const pal = palOf(lg.attr, E.dark), tone = E.tone, u = lg.pe / 16 / lg.sc;
  const h = Math.max(lg.pe, lg.pk) * 1.9;
  const gr = ctx.createLinearGradient(lg.x0, 0, lg.x1, 0);
  gr.addColorStop(0, rgba(tone.bg1, 0)); gr.addColorStop(0.12, rgba(tone.bg1, E.dark ? 0.82 : 0.7)); gr.addColorStop(0.88, rgba(tone.bg1, E.dark ? 0.82 : 0.7)); gr.addColorStop(1, rgba(tone.bg1, 0));
  ctx.fillStyle = gr; ctx.fillRect(lg.x0, lg.y - h / 2, lg.x1 - lg.x0, h);
  let x = lg.x0 + 15 * u * lg.sc;
  ctx.fillStyle = rgba(E.dark ? pal.hi : pal.main, 0.95);
  diamond(ctx, lg.x0 + 5 * u * lg.sc, lg.y, 4 * u * lg.sc, 2 * u * lg.sc, 0); ctx.fill();
  diamond(ctx, lg.x1 - 5 * u * lg.sc, lg.y, 4 * u * lg.sc, 2 * u * lg.sc, 0); ctx.fill();
  if (lg.en) { ctx.font = fontStr("Cinzel", 600, lg.pe); ctx.fillStyle = tone.ink; drawRun(ctx, lg.en, x, lg.y + lg.pe * 0.36, lg.pe * 0.34, "left"); x += lg.we; }
  if (lg.en && lg.kr) { ctx.fillStyle = tone.line + "0.7)"; ctx.fillRect(x + lg.gap / 2 - 0.6 * u, lg.y - lg.pe * 0.35, 1.2 * u, lg.pe * 0.7); x += lg.gap; }
  if (lg.kr) { ctx.font = fontStr("Hahmlet", 500, lg.pk); ctx.fillStyle = E.dark ? pal.hi : pal.deep; drawRun(ctx, lg.kr, x, lg.y + lg.pk * 0.36, lg.pk * 0.16, "left"); x += lg.wk; }
  if (lg.rank) rankBadge(ctx, x + lg.rgap + lg.bs, lg.y, lg.bs, lg.rank, pal, E);
}
function drawEmblem(ctx, em, attr, side, L, E, st) {
  const u = L.u, pal = palOf(attr, E.dark), tone = E.tone, p = E.p, X = em.x, Y = em.y, S = em.s, r = S / 2;
  const style = st.emblem.style, sc = S / (176 * u), line = tone.line;
  const an = iconAnim(attr, p, E, st, u, sc), bright = an.bright;

  const g = glowSpr(pal.main);
  ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over";
  ctx.globalAlpha = (E.dark ? 0.32 : 0.14) * Math.min(1.5, bright);
  ctx.drawImage(g, X - r * 1.8, Y - r * 1.8, r * 3.6, r * 3.6);
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  if (style === "ring") {
    const dg = ctx.createRadialGradient(X, Y, r * 0.3, X, Y, r);
    dg.addColorStop(0, rgba(tone.bg1, 0)); dg.addColorStop(1, rgba(tone.bg1, E.dark ? 0.55 : 0.25));
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = line + "0.62)"; ctx.lineWidth = 1.2 * u;
    ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = line + "0.24)"; ctx.lineWidth = 0.8 * u;
    ctx.beginPath(); ctx.arc(X, Y, r * 1.1, 0, TAU); ctx.stroke();
    const nT = 72, spin = st.emblem.spin ? ((TAU / nT) * E.c(0.6) * p) * (side ? -1 : 1) : 0;
    ctx.beginPath();
    for (let t = 0; t < nT; t++) {
      const a = spin + (t * TAU) / nT, r0 = r * (t % 6 === 0 ? 0.8 : 0.865), r1 = r * 0.91;
      ctx.moveTo(X + Math.cos(a) * r0, Y + Math.sin(a) * r0); ctx.lineTo(X + Math.cos(a) * r1, Y + Math.sin(a) * r1);
    }
    ctx.strokeStyle = rgba(pal.main, E.dark ? 0.55 : 0.7); ctx.lineWidth = 0.9 * u; ctx.stroke();
    ctx.fillStyle = line + "0.9)";
    star4(ctx, X, Y - r, 5 * u * sc, 12 * u * sc, 0.1); ctx.fill();
    star4(ctx, X, Y + r, 5 * u * sc, 12 * u * sc, 0.1); ctx.fill();
    diamond(ctx, X - r, Y, 6 * u * sc, 3 * u * sc, 0); ctx.fill();
    diamond(ctx, X + r, Y, 6 * u * sc, 3 * u * sc, 0); ctx.fill();
    ctx.strokeStyle = line + "0.4)"; ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.moveTo(X, Y - r - 14 * u * sc); ctx.lineTo(X, Y - r - 64 * u * sc); ctx.stroke();
    ctx.fillStyle = line + "0.75)"; diamond(ctx, X, Y - r - 68 * u * sc, 3 * u * sc, 5 * u * sc, Math.PI / 2); ctx.fill();
  } else if (style === "badge") {
    const R2 = r * 1.06;
    for (const [k, a] of [[1, 0.6], [0.88, 0.3]]) {
      ctx.strokeStyle = line + a + ")"; ctx.lineWidth = 1.2 * u;
      ctx.beginPath(); ctx.moveTo(X, Y - R2 * k); ctx.lineTo(X + R2 * k, Y); ctx.lineTo(X, Y + R2 * k); ctx.lineTo(X - R2 * k, Y); ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = rgba(pal.main, 0.95);
    for (const [dx, dyy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { diamond(ctx, X + dx * R2, Y + dyy * R2, 4 * u * sc, 4 * u * sc, Math.PI / 4); ctx.fill(); }
  }
  drawAttrIcon(ctx, attr, X, Y, S * (style === "simple" ? 0.9 : style === "badge" ? 0.66 : 0.68), E, an);
  const lab = st.emblem.label;
  if (lab !== "none") {
    const A = ATTRS[attr];
    let ly = Y + r * (style === "simple" ? 0.62 : style === "badge" ? 1.2 : 1.1) + 34 * u * sc;
    if (lab === "both" || lab === "en") {
      const px = 19 * u * sc;
      ctx.font = fontStr("Cinzel", 600, px); ctx.fillStyle = tone.ink; ctx.globalAlpha = 0.95;
      drawRun(ctx, A.en, X, ly, px * 0.34, "center");
      ly += px * 0.5;
      ctx.fillStyle = rgba(pal.main, 0.9);
      diamond(ctx, X, ly + 6 * u * sc, 4 * u * sc, 2 * u * sc, 0); ctx.fill();
      ly += 14 * u * sc;
    }
    if (lab === "both" || lab === "kr") {
      const px = 17 * u * sc;
      ctx.font = fontStr("Hahmlet", 500, px); ctx.fillStyle = tone.sub; ctx.globalAlpha = 0.95;
      drawRun(ctx, A.kr, X, ly + px * 0.9, px * 0.2, "center");
    }
    ctx.globalAlpha = 1;
  }
}
function profileLight(st, E) { const m = st.caption.style || "auto"; return m === "light" || (m === "auto" && !E.dark); }
function rankFill(ctx, rank, y0, y1, pal, dk, E) {
  const gr = ctx.createLinearGradient(0, y0, 0, y1);
  if (rank === "SS") { if (dk) { gr.addColorStop(0, "#FFF6D6"); gr.addColorStop(0.5, "#F0C463"); gr.addColorStop(1, "#C38A2C"); } else { gr.addColorStop(0, "#D9A23C"); gr.addColorStop(0.55, "#B07A1E"); gr.addColorStop(1, "#7A4E0E"); } return gr; }
  if (rank === "S") { if (dk) { gr.addColorStop(0, "#FFFFFF"); gr.addColorStop(0.55, "#DCE1EA"); gr.addColorStop(1, "#9AA2B0"); } else { gr.addColorStop(0, "#4A4F58"); gr.addColorStop(1, "#121418"); } return gr; }
  if (rank === "A") { gr.addColorStop(0, dk ? pal.core : pal.main); gr.addColorStop(1, dk ? pal.hi : pal.deep); return gr; }
  if (rank === "B" || rank === "C") return dk ? "#E4E8EF" : E.tone.ink;
  return dk ? "rgba(214,220,230,0.7)" : E.tone.sub;
}
const RANK_GLOW = { SS: "#F0C463", S: "#FFFFFF" };
/* profile block per photo: attribute sigil, attribute, codename, class, rank */
function drawCaptions(ctx, L, E, st) {
  const cap = st.caption;
  if (cap.show === "none") return;
  const u = L.u, inside = cap.show === "inside";
  L.slots.forEach((s, i) => {
    const s0 = st.slots[i], bw = s.bx1 - s.bx0;
    const people = i === 0 && L.slots.length === 1 && s0.duo && s0.p2 ? [[s0, s.bx0 + bw * 0.27, bw * 0.46], [s0.p2, s.bx0 + bw * 0.73, bw * 0.46]] : [[s0, s.capX, bw]];
    for (const [sl, cx, sw] of people) {
    const dk = inside ? !profileLight(st, E) : E.dark, pal = palOf(sl.attr, dk), A = ATTRS[sl.attr];
    const fit = clamp(sw / (380 * u), 0.5, 1.15);
    const px = cap.size * u * fit, sp = 13.5 * u * Math.max(0.72, fit);
    const ink = dk ? "#F2F4F8" : E.tone.ink;
    const lines = [], hasCls = cap.cls && sl.cls && sl.cls !== "none", hasRank = cap.rank && sl.rank;
    if (inside) {
      if (cap.attrLine) { lines.push({ t: "icon", h: sp * 3.4 }); lines.push({ t: "attr", h: sp * 1.9 }); }
      if (sl.name) lines.push({ t: "name", h: px * 1.12 });
      if (hasCls) lines.push({ t: "cls", h: sp * 1.7 });
      if (hasRank) lines.push({ t: "rank", h: sp * 2 });
    } else {
      if (cap.attrLine) lines.push({ t: "attrInline", h: sp * 2.4 });
      if (sl.name) lines.push({ t: "name", h: px * 1.12 });
      if (hasCls || hasRank) lines.push({ t: "clsRank", h: sp * 2.1, cls: hasCls, rank: hasRank });
    }
    if (!lines.length) continue;
    const total = lines.reduce((a, l) => a + l.h, 0);
    let y = inside ? s.by1 - 24 * u * fit - total : s.bottom + 14 * u;
    for (const l of lines) {
      const yc = y + l.h / 2;
      if (l.t === "icon") {
        if (ART.m[sl.attr]) {
          const Ed = Object.assign({}, E, { dark: dk });
          drawAttrIcon(ctx, sl.attr, cx, yc, l.h * 0.94, Ed, iconAnim(sl.attr, E.p, Ed, st, u, (l.h * 0.94) / (110 * u)));
        }
      } else if (l.t === "attrInline") {
        const ic = tinted(sl.attr, dk ? pal.hi : pal.main);
        ctx.font = fontStr("Tenor Sans", 400, sp);
        const tw = runWidth(ctx, A.en, sp * 0.32), ih = sp * 2, iw = ic ? (ih * ic.width) / ic.height : 0, g = 8 * u, x0 = cx - (iw + g + tw) / 2;
        if (ic) ctx.drawImage(ic, x0, yc - ih / 2, iw, ih);
        ctx.fillStyle = dk ? pal.hi : pal.deep;
        drawRun(ctx, A.en, x0 + iw + g, yc + sp * 0.36, sp * 0.32, "left");
      } else if (l.t === "clsRank") {
        const ct = l.cls ? (sl.cls === "guide" ? "GUIDE" : "SENTINEL") : "", rp = sp * 1.45;
        ctx.font = fontStr("Tenor Sans", 400, sp);
        const cw = ct ? runWidth(ctx, ct, sp * 0.32) : 0, dot = ct && l.rank ? sp * 2 : 0, lw = l.rank ? runWidth(ctx, "RANK", sp * 0.32) : 0;
        ctx.font = fontStr("Cinzel", 700, rp);
        const rw = l.rank ? runWidth(ctx, sl.rank, rp * 0.04) : 0, g = l.rank ? sp * 0.7 : 0;
        let x = cx - (cw + dot + lw + g + rw) / 2;
        ctx.font = fontStr("Tenor Sans", 400, sp); ctx.fillStyle = ink;
        if (ct) { drawRun(ctx, ct, x, yc + sp * 0.36, sp * 0.32, "left"); x += cw; }
        if (dot) { ctx.fillStyle = rgba(pal.main, 0.9); diamond(ctx, x + dot / 2, yc, sp * 0.28, sp * 0.28, Math.PI / 4); ctx.fill(); x += dot; ctx.fillStyle = ink; }
        if (l.rank) {
          drawRun(ctx, "RANK", x, yc + sp * 0.36, sp * 0.32, "left"); x += lw + g;
          ctx.font = fontStr("Cinzel", 700, rp); ctx.fillStyle = rankFill(ctx, sl.rank, yc - rp * 0.5, yc + rp * 0.4, pal, dk, E);
          drawRun(ctx, sl.rank, x, yc + rp * 0.36, rp * 0.04, "left");
        }
      } else if (l.t === "attr") {
        ctx.font = fontStr("Tenor Sans", 400, sp); ctx.fillStyle = ink; ctx.globalAlpha = 0.92;
        drawRun(ctx, A.en, cx, yc + sp * 0.36, sp * 0.32, "center"); ctx.globalAlpha = 1;
      } else if (l.t === "name") {
        ctx.font = fontStr(cap.font, cap.weight, px);
        const gr = ctx.createLinearGradient(0, yc - px * 0.5, 0, yc + px * 0.5);
        if (dk) { gr.addColorStop(0, pal.core); gr.addColorStop(0.45, pal.hi); gr.addColorStop(1, pal.main); } else { gr.addColorStop(0, pal.main); gr.addColorStop(1, pal.deep); }
        ctx.fillStyle = gr;
        if (dk) { ctx.save(); ctx.shadowColor = rgba(pal.main, 0.7); ctx.shadowBlur = px * 0.45 * E.k; drawRun(ctx, sl.name, cx, yc + px * 0.36, px * cap.spacing, "center"); ctx.restore(); }
        drawRun(ctx, sl.name, cx, yc + px * 0.36, px * cap.spacing, "center");
      } else if (l.t === "cls") {
        ctx.font = fontStr("Tenor Sans", 400, sp); ctx.fillStyle = ink;
        drawRun(ctx, sl.cls === "guide" ? "GUIDE" : "SENTINEL", cx, yc + sp * 0.36, sp * 0.32, "center");
      } else if (l.t === "rank") {
        ctx.font = fontStr("Tenor Sans", 400, sp);
        const lw = runWidth(ctx, "RANK", sp * 0.32), rp = sp * 1.5;
        ctx.font = fontStr("Cinzel", 700, rp);
        const rw = runWidth(ctx, sl.rank, rp * 0.04), gap = sp * 0.75, x0 = cx - (lw + gap + rw) / 2;
        ctx.font = fontStr("Tenor Sans", 400, sp); ctx.fillStyle = ink;
        drawRun(ctx, "RANK", x0, yc + sp * 0.36, sp * 0.32, "left");
        ctx.font = fontStr("Cinzel", 700, rp); ctx.fillStyle = rankFill(ctx, sl.rank, yc - rp * 0.5, yc + rp * 0.4, pal, dk, E);
        if (RANK_GLOW[sl.rank] && dk) { ctx.save(); ctx.shadowColor = rgba(RANK_GLOW[sl.rank], 0.75); ctx.shadowBlur = rp * 0.5 * E.k; drawRun(ctx, sl.rank, x0 + lw + gap, yc + rp * 0.36, rp * 0.04, "left"); ctx.restore(); }
        drawRun(ctx, sl.rank, x0 + lw + gap, yc + rp * 0.36, rp * 0.04, "left");
      }
      y += l.h;
    }
    }
  });
}
/* rank badge hung on a medallion */
function rankBadge(ctx, x, y, s, rank, pal, E) {
  const tone = E.tone, line = tone.line, dk = E.dark;
  const bg = ctx.createRadialGradient(x, y - s * 0.3, 0, x, y, s);
  bg.addColorStop(0, rgba(tone.bg0, 0.98)); bg.addColorStop(1, rgba(tone.bg1, 0.98));
  ctx.fillStyle = bg; diamond(ctx, x, y, s, s, 0); ctx.fill();
  ctx.strokeStyle = line + "0.8)"; ctx.lineWidth = s * 0.07; diamond(ctx, x, y, s, s, 0); ctx.stroke();
  const tier = rank === "SS" ? "#F0C463" : rank === "S" ? (dk ? "#E6EAF1" : "#2A2D33") : dk ? pal.hi : pal.main;
  ctx.strokeStyle = rgba(tier, 0.85); ctx.lineWidth = s * 0.05; diamond(ctx, x, y, s * 0.8, s * 0.8, 0); ctx.stroke();
  if (RANK_GLOW[rank] && dk) { const g = glowSpr(RANK_GLOW[rank]); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35; ctx.drawImage(g, x - s * 1.6, y - s * 1.6, s * 3.2, s * 3.2); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
  const fp = s * (rank.length > 1 ? 0.62 : 0.86);
  ctx.font = fontStr("Cinzel", 700, fp);
  ctx.fillStyle = rankFill(ctx, rank, y - fp * 0.5, y + fp * 0.4, pal, dk, E);
  drawRun(ctx, rank, x, y + fp * 0.36, fp * 0.02, "center");
}
/* ---------- main render ---------- */
function sideAttrs(st) {
  const n = st.layout.count, s0 = st.slots[0];
  const autoL = s0.attr, autoR = n === 1 ? (s0.duo && s0.p2 ? s0.p2.attr : s0.attr) : st.slots[n - 1].attr;
  return [st.emblem.left === "auto" ? autoL : st.emblem.left, st.emblem.right === "auto" ? autoR : st.emblem.right];
}
const _layers = new Map();
function layer(name, w, h) {
  const key = name + w + "x" + h;
  let c = _layers.get(key);
  if (!c) {
    if (_layers.size > 24) _layers.clear();
    c = mk(w, h); _layers.set(key, c);
  }
  return c;
}
function bloom(ctx, src, E, amt) {
  if (amt <= 0) return;
  const w = src.width, h = src.height;
  let prev = src;
  const lv = [];
  for (let d = 2; d <= 16; d *= 2) {
    const c = layer("b" + d, Math.max(2, Math.round(w / d)), Math.max(2, Math.round(h / d)));
    c.g.setTransform(1, 0, 0, 1, 0, 0); c.g.globalCompositeOperation = "copy"; c.g.imageSmoothingQuality = "high";
    c.g.drawImage(prev, 0, 0, c.width, c.height);
    c.g.globalCompositeOperation = "source-over";
    lv.push(c); prev = c;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingQuality = "high";
  if (E.dark) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, 0.7 * amt); ctx.drawImage(lv[1], 0, 0, w, h);
    ctx.globalAlpha = Math.min(1, 0.85 * amt); ctx.drawImage(lv[3], 0, 0, w, h);
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = Math.min(1, 0.4 * amt); ctx.drawImage(lv[2], 0, 0, w, h);
    ctx.globalAlpha = Math.min(1, 0.3 * amt); ctx.drawImage(lv[3], 0, 0, w, h);
  }
  ctx.restore();
}
function renderFrame(ctx, W, H, k, p, st, imgs, opt) {
  opt = opt || {};
  const L = computeLayout(W, H, st), tone = toneOf(st);
  const T = st.loop, tempo = st.tempo || 1;
  const E = {
    p, T, u: L.u, k, tone, dark: tone.dark, add: tone.dark,
    I: st.frame.intensity, R: st.frame.reach * 1.3,
    c: (rate) => Math.max(1, Math.round(rate * T * tempo)),
  };
  E.sideAttrs = sideAttrs(st);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  drawBackground(ctx, L, E, st);
  drawArchBack(ctx, L, E, st);
  for (let i = 0; i < L.slots.length; i++) drawSlotImage(ctx, L, i, st, imgs[i], E);
  drawDividers(ctx, L, E, st);
  // holes in the frame for medallions and their legends
  const holes = [], legends = [];
  if (L.corner) {
    L.medals.forEach((m, s) => {
      holes.push({ c: 1, x: m.x, y: m.y, r: m.r * 1.2 });
      const lg = legendOf(ctx, m, E.sideAttrs[s], s, L, st);
      if (lg) { legends.push(lg); holes.push({ x0: lg.x0, y0: lg.y - 4 * L.u, x1: lg.x1, y1: lg.y + 4 * L.u }); }
    });
  }
  const crest = st.arch.submark && L.corner && L.groupType;
  if (crest) {
    holes.push({ c: 1, x: L.frameRect.x + L.frameRect.w / 2, y: L.frameRect.y, r: 40 * L.u });
    holes.push({ c: 1, x: L.frameRect.x + L.frameRect.w / 2, y: L.frameRect.y + L.frameRect.h, r: 22 * L.u });
  }
  L.crest = crest;
  const { segs, frames } = frameSegments(L, st, holes, E.sideAttrs);
  drawFrameBase(ctx, L, E, st, frames, holes);
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const fx = layer("fx", cw, ch), fg = fx.g;
  fg.setTransform(1, 0, 0, 1, 0, 0); fg.globalAlpha = 1; fg.globalCompositeOperation = "source-over"; fg.clearRect(0, 0, cw, ch);
  fg.setTransform(k, 0, 0, k, 0, 0);
  for (const S of segs) {
    const f = FX[S.attr];
    if (!f) continue;
    E.pal = palOf(S.attr, E.dark);
    fg.save(); f(fg, S, E); fg.restore();
    fg.setTransform(k, 0, 0, k, 0, 0);
  }
  bloom(ctx, fx, E, st.frame.bloom == null ? 1 : st.frame.bloom);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = E.dark ? "lighter" : "source-over"; ctx.globalAlpha = 1;
  ctx.drawImage(fx, 0, 0);
  if (E.dark) { ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 0.35; ctx.drawImage(fx, 0, 0); }
  ctx.restore();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (st.emblem.show) {
    if (L.corner) { L.medals.forEach((m, s) => drawMedallion(ctx, m, E.sideAttrs[s], s, L, E, st)); legends.forEach((lg) => drawLegend(ctx, lg, E)); }
    else L.emblems.forEach((em, s) => drawEmblem(ctx, em, E.sideAttrs[s], s, L, E, st));
  }
  drawCaptions(ctx, L, E, st);
  drawArchFront(ctx, L, E, st);
  const hits = opt.hits || null;
  for (const t of st.texts) drawText(ctx, t, L, E, E.sideAttrs, hits);
  if (opt.sel && hits) {
    const h = hits.find((q) => q.id === opt.sel);
    if (h) {
      ctx.setLineDash([6 * L.u, 5 * L.u]); ctx.strokeStyle = E.dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)"; ctx.lineWidth = 1.4 * L.u;
      ctx.strokeRect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0); ctx.setLineDash([]);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return L;
}
window.ArchEngine = { RANKS, customTone, toneOf, RATIOS, SLOT_R, ATTRS, ATTR_ORDER, TONES, FONTS, FONTMAP, famStack, fontStr, loadArt, ART, tinted, renderFrame, computeLayout, sideAttrs, palOf, rgba, mk, clamp, lerp, frac, TAU };
