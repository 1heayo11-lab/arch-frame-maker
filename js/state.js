/* ARCH attribute frame — default state & samples */
"use strict";
let _tid = 0;
function newTextId() { _tid += 1; return "t" + Date.now().toString(36) + _tid; }
function newText(o) {
  return Object.assign({
    id: newTextId(), show: true, text: "TEXT", font: "Cinzel", weight: 600, italic: false, size: 40, spacing: 0.2, lh: 1.25,
    color: "metal", custom: "#FFFFFF", glow: 0.4, deco: "none", decoLen: 1, anim: "none", align: "center", x: 0.5, y: 0.5,
  }, o || {});
}
const TEXT_PRESETS = {
  title: { label: "타이틀", o: { text: "ARCANE PAIR", font: "Cinzel", weight: 700, size: 64, spacing: 0.24, glow: 0.6, anim: "shine", y: 0.5 } },
  label: { label: "작은 라벨", o: { text: "FILE No. 07 — CLASSIFIED", font: "Michroma", weight: 400, size: 15, spacing: 0.42, color: "sub", glow: 0, y: 0.5 } },
  kr: { label: "한글 명조", o: { text: "우리는 지키고, 다스리고, 견딘다", font: "Hahmlet", weight: 500, size: 30, spacing: 0.12, glow: 0.3, y: 0.5 } },
  tagline: { label: "선 장식 문구", o: { text: "WE PROTECT. WE CONTROL. WE ENDURE.", font: "Cinzel", weight: 600, size: 18, spacing: 0.3, color: "tone", glow: 0, deco: "rule", y: 0.5 } },
};
function defaultState() {
  return {
    v: 5,
    ratio: "16:9", tone: "obsidian", toneColor: "#1E2A44", attrBg: "dark", loop: 4, tempo: 1,
    layout: { mode: "side", count: 2, slotRatio: "3:4", gap: 76, shape: "chamfer", slant: 0.16 },
    frame: { mode: "blend", blend: 0.6, bloom: 1, intensity: 1, reach: 1, base: true, brackets: true, inner: true },
    slots: [
      { attr: "fire", attr2: null, name: "RABBIT", cls: "sentinel", rank: "S", zoom: 1, ox: 0, oy: 0, duo: false, p2: { attr: "ice", name: "EDEN", cls: "guide", rank: "SS" } },
      { attr: "ice", attr2: null, name: "EDEN", cls: "guide", rank: "SS", zoom: 1, ox: 0, oy: 0 },
      { attr: "wind", attr2: null, name: "SANTA", cls: "sentinel", rank: "A", zoom: 1, ox: 0, oy: 0 },
      { attr: "lightning", attr2: null, name: "PEACH", cls: "guide", rank: "B", zoom: 1, ox: 0, oy: 0 },
    ],
    caption: { show: "inside", font: "Oswald", weight: 600, size: 50, spacing: 0.06, attrLine: true, cls: true, rank: true, shade: true, style: "auto" },
    emblem: { show: true, place: "corner", corner: "straddle", left: "auto", right: "auto", style: "ring", size: 1, y: 0.5, label: "both", spin: true, rank: true },
    arch: { submark: true, compass: true, beam: true, watermark: true, wordmark: false, opacity: 1 },
    texts: [
      newText({ text: "ARCANE  RESPONSE  CONTROL  HUB", font: "Michroma", weight: 400, size: 15, spacing: 0.5, color: "sub", glow: 0, y: 0.03 }),
      newText({ text: "WE PROTECT. WE CONTROL. WE ENDURE.", font: "Cinzel", weight: 600, size: 17, spacing: 0.32, color: "tone", glow: 0, deco: "rule", y: 0.962 }),
    ],
    exp: { fmt: "gif", target: "web", auto: true, size: 960, fps: 20, colors: 256, dither: true, mp4q: "1080", mp4fps: 30, repeat: 1, png: 1 },
  };
}
/* example photos, clearly labelled as examples */
function sampleImage(kind) {
  const w = 900, h = 1200, c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  const R = (() => { let s = kind === "fire" ? 7 : 19; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const warm = kind === "fire";
  let gr = g.createLinearGradient(0, 0, 0, h);
  if (warm) { gr.addColorStop(0, "#1B0B10"); gr.addColorStop(0.45, "#5B1A1C"); gr.addColorStop(0.8, "#C2552C"); gr.addColorStop(1, "#F2A05A"); }
  else { gr.addColorStop(0, "#050B1A"); gr.addColorStop(0.5, "#1B3560"); gr.addColorStop(0.85, "#6E9CCB"); gr.addColorStop(1, "#C9E3F6"); }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const moon = g.createRadialGradient(w * 0.62, h * 0.3, 0, w * 0.62, h * 0.3, w * 0.55);
  moon.addColorStop(0, warm ? "rgba(255,200,140,.55)" : "rgba(220,240,255,.55)"); moon.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = moon; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = R() * w, y = R() * h, r = 4 + R() * 22;
    const b = g.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, warm ? "rgba(255,190,110,.5)" : "rgba(210,235,255,.5)"); b.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // silhouette
  g.fillStyle = warm ? "#12070A" : "#040812";
  g.beginPath(); g.ellipse(w * 0.5, h * 0.47, w * 0.13, h * 0.11, 0, 0, Math.PI * 2); g.fill();
  g.beginPath();
  g.moveTo(w * 0.42, h * 0.56); g.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.58, h * 0.56);
  g.quadraticCurveTo(w * 0.62, h * 0.63, w * 0.82, h * 0.7); g.quadraticCurveTo(w * 0.96, h * 0.76, w, h * 0.9); g.lineTo(w, h);
  g.lineTo(0, h); g.lineTo(0, h * 0.9); g.quadraticCurveTo(w * 0.04, h * 0.76, w * 0.18, h * 0.7); g.quadraticCurveTo(w * 0.38, h * 0.63, w * 0.42, h * 0.56);
  g.fill();
  g.strokeStyle = warm ? "rgba(255,170,90,.55)" : "rgba(190,225,255,.55)"; g.lineWidth = 3;
  g.beginPath(); g.ellipse(w * 0.5, h * 0.47, w * 0.13, h * 0.11, 0, -1.9, -0.2); g.stroke();
  g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 30px 'IBM Plex Mono', monospace"; g.textAlign = "left";
  g.fillText("SAMPLE · 예시", 40, 70);
  return { src: c, w, h, name: warm ? "예시 사진 1" : "예시 사진 2", sample: true };
}
window.ArchState = { newText, defaultState, sampleImage, TEXT_PRESETS };
