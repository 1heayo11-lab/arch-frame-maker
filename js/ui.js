/* ARCH attribute frame — editor UI */
"use strict";
(function () {
  const AE = window.ArchEngine, AS = window.ArchState, AX = window.ArchExport;
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const clamp = AE.clamp;
  let st = AS.defaultState();
  let imgs = [null, null, null, null];
  let selText = null;
  const view = $("#view"), vctx = view.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let playing = !reduce, tNow = 0, last = performance.now(), dirty = true, hits = [], lastL = null;

  /* ---------- helpers ---------- */
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v; else if (k === "style") e.style.cssText = v; else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (k === "value" || k === "checked") e[k] = v; else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  let toastT = 0;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2800); }
  const get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), st);
  function set(path, v) { const ks = path.split("."); let o = st; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
  const ICONS = {
    up: '<svg viewBox="0 0 14 14"><path d="M3 8.5 7 4.5l4 4"/></svg>', down: '<svg viewBox="0 0 14 14"><path d="M3 5.5 7 9.5l4-4"/></svg>',
    x: '<svg viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg>', copy: '<svg viewBox="0 0 14 14"><rect x="4.5" y="4.5" width="7" height="7"/><path d="M2.5 9.5v-7h7"/></svg>',
    eye: '<svg viewBox="0 0 14 14"><path d="M1.5 7S3.5 3 7 3s5.5 4 5.5 4-2 4-5.5 4S1.5 7 1.5 7z"/><circle cx="7" cy="7" r="1.6"/></svg>',
    eyeOff: '<svg viewBox="0 0 14 14"><path d="M2 2l10 10M5.2 3.4C5.8 3.1 6.4 3 7 3c3.5 0 5.5 4 5.5 4s-.6 1.2-1.8 2.3M8.8 10.6c-.6.3-1.2.4-1.8.4-3.5 0-5.5-4-5.5-4s.6-1.2 1.8-2.3"/></svg>',
    play: '<svg viewBox="0 0 14 14"><path d="M3.5 1.8v10.4L12 7z"/></svg>', pause: '<svg viewBox="0 0 14 14"><rect x="2.5" y="1.8" width="3.2" height="10.4"/><rect x="8.3" y="1.8" width="3.2" height="10.4"/></svg>',
  };
  const ib = (icon, label, fn, dis) => el("button", { class: "ib", type: "button", "aria-label": label, title: label, disabled: dis, html: ICONS[icon], onclick: (e) => { e.stopPropagation(); fn(); } });
  const fmt = (v, f) => f === "px" ? Math.round(v) + "" : f === "pct" ? Math.round(v * 100) + "%" : f === "x" ? "×" + (+v).toFixed(2) : f === "s" ? (+v).toFixed(1) + "초" : f === "em" ? (+v).toFixed(2) : String(v);
  function rangeFill(r) { const a = +r.min, b = +r.max, v = +r.value; r.style.setProperty("--fill", ((v - a) / (b - a)) * 100 + "%"); }

  /* ---------- icons as CSS masks ---------- */
  for (const a of AE.ATTR_ORDER) document.documentElement.style.setProperty("--ic-" + a, `url("${ASSETS[a].data}")`);
  $("#brandLogo").src = ASSETS.logo_mono.data;
  const swatch = (a) => AE.ATTRS[a].light.main;

  function attrPicker(cur, onPick, extra) {
    const box = el("div", { class: "attrs", role: "radiogroup" });
    if (extra) box.append(el("button", { class: "attr txt", type: "button", "aria-pressed": String(cur === extra.v), onclick: () => onPick(extra.v) }, extra.label));
    for (const a of AE.ATTR_ORDER) {
      const A = AE.ATTRS[a];
      box.append(el("button", { class: "attr", type: "button", title: A.en + " · " + A.kr, "aria-label": A.kr + " 속성", "aria-pressed": String(cur === a), style: `--ac:${swatch(a)};--ic:var(--ic-${a})`, onclick: () => onPick(a) }, el("i")));
    }
    return box;
  }

  /* ---------- fonts ---------- */
  const fontOpts = (sel, cur) => {
    sel.replaceChildren(...AE.FONTS.map((F) => el("option", { value: F.f, selected: F.f === cur }, `${F.f} — ${F.kr}`)));
  };
  const usedFonts = () => {
    const out = new Map();
    const add = (f, w, txt) => out.set(f + "|" + w, { f, w, txt: (out.get(f + "|" + w) || { txt: "" }).txt + txt });
    st.texts.forEach((t) => add(t.font, t.weight, t.text));
    add(st.caption.font, st.caption.weight, st.slots.map((s) => s.name + (s.p2 ? s.p2.name : "")).join(""));
    add("Cinzel", 600, "FIREWATERINDLGHTCSGRAUNO"); add("Cinzel", 700, "FEDCBAS"); add("Hahmlet", 500, "불물바람번개얼음풀무속성"); add("IBM Plex Sans KR", 500, "1234번사진");
    add("Tenor Sans", 400, "FIREWATERWINDLIGHTNINGICEGRASSNEUTRALSENTINELGUIDERANK");
    return [...out.values()];
  };
  let fontTimer = 0;
  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const jobs = usedFonts().map((u) => document.fonts.load(AE.fontStr(u.f, u.w, 40), u.txt || "A가").catch(() => null));
    return Promise.all(jobs).then(() => { dirty = true; });
  }
  function fontsSoon() { clearTimeout(fontTimer); fontTimer = setTimeout(ensureFonts, 120); }
  if (document.fonts) document.fonts.addEventListener("loadingdone", () => { dirty = true; });

  /* ---------- generic bindings ---------- */
  function bindControls(root) {
    root.querySelectorAll(".seg[data-k]").forEach((seg) => {
      if (seg._b) return; seg._b = 1;
      seg.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-v]"); if (!b) return;
        let v = b.dataset.v;
        if (seg.hasAttribute("data-num")) v = +v; else if (v === "true" || v === "false") v = v === "true";
        set(seg.dataset.k, v); changed(seg.dataset.k);
      });
    });
    root.querySelectorAll("input[type=range][data-k]").forEach((r) => {
      if (r._b) return; r._b = 1;
      r.addEventListener("input", () => { set(r.dataset.k, +r.value); const o = r.parentElement.querySelector("output"); if (o) o.textContent = fmt(+r.value, r.dataset.fmt); rangeFill(r); changed(r.dataset.k, true); });
    });
    root.querySelectorAll("input[type=checkbox][data-k]").forEach((c) => {
      if (c._b) return; c._b = 1;
      c.addEventListener("change", () => { set(c.dataset.k, c.checked); changed(c.dataset.k); });
    });
    root.querySelectorAll("input[type=color][data-k]").forEach((c) => {
      if (c._b) return; c._b = 1;
      c.addEventListener("input", () => { set(c.dataset.k, c.value); if (c.dataset.k === "toneColor") st.tone = "custom"; markSwatches(); changed(c.dataset.k, true); });
      c.addEventListener("change", () => changed(c.dataset.k));
    });
    root.querySelectorAll("select[data-k]").forEach((s) => {
      if (s._b) return; s._b = 1;
      s.addEventListener("change", () => { set(s.dataset.k, s.hasAttribute("data-num") ? +s.value : s.value); changed(s.dataset.k); });
    });
  }
  function syncControls() {
    $$(".seg[data-k]").forEach((seg) => { const v = String(get(seg.dataset.k)); seg.querySelectorAll("button[data-v]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v))); });
    $$("input[type=range][data-k]").forEach((r) => { const v = get(r.dataset.k); if (v != null) r.value = v; const o = r.parentElement.querySelector("output"); if (o) o.textContent = fmt(+r.value, r.dataset.fmt); rangeFill(r); });
    $$("input[type=checkbox][data-k]").forEach((c) => (c.checked = !!get(c.dataset.k)));
    $$("input[type=color][data-k]").forEach((c) => { const v = get(c.dataset.k); if (v) c.value = v; });
    $("#rowToneColor").hidden = st.tone !== "custom";
    $("#rowShade").hidden = st.caption.show !== "inside";
    $("#rowPStyle").hidden = st.caption.show !== "inside";
    $("#rowAttrBg").hidden = st.tone !== "attr";
    markSwatches();
    $$("select[data-k]").forEach((s) => { const v = get(s.dataset.k); if (v != null) { s.value = String(v); if (s.value !== String(v) && s.hasAttribute("data-num")) { const best = [...s.options].reduce((a, o) => (Math.abs(+o.value - v) < Math.abs(+a.value - v) ? o : a)); s.value = best.value; } } });
    const slant = st.layout.mode === "slant" && st.layout.count > 1;
    $("#rowSlant").hidden = !slant;
    $("#s-fmode").querySelectorAll("button").forEach((b) => (b.disabled = slant && b.dataset.v === "each"));
    const fm = st.frame.mode;
    $("#frameNote").textContent = fm === "blend" || (slant && fm === "each") ? "큰 틀 하나를 왼쪽 위 속성과 오른쪽 아래 속성으로 반반 칠하고, 나머지 두 모서리에서 그라데이션처럼 섞어요." : fm === "each" ? "사진마다 자기 속성 틀을 따로 둘러요." : "큰 틀 하나를 사진 속성대로 나눠 칠해요. 3장 이상일 때 잘 어울려요.";
    $("#rowBlend").hidden = !(fm === "blend" || (slant && fm === "each"));
    const corner = st.emblem.place === "corner";
    $("#rowCorner").hidden = !corner; $("#rowEmStyle").hidden = corner; $("#rowEmY").hidden = corner;
    $("#kEmL").textContent = corner ? "왼쪽 위" : "왼쪽"; $("#kEmR").textContent = corner ? "오른쪽 아래" : "오른쪽";
    ["#emL", "#emR"].forEach((id, s) => {
      const key = s ? "right" : "left";
      $(id).replaceWith(Object.assign(attrPicker(st.emblem[key], (a) => { st.emblem[key] = a; changed("emblem." + key); }, { v: "auto", label: "사진 따라" }), { id: id.slice(1) }));
    });
    $("#gifOpts").hidden = st.exp.fmt !== "gif"; $("#mp4Opts").hidden = st.exp.fmt !== "mp4"; $("#pngOpts").hidden = st.exp.fmt !== "png";
    $("#makeBtn").textContent = st.exp.fmt === "gif" ? "MAKE GIF" : st.exp.fmt === "mp4" ? "MAKE MP4" : "MAKE PNG";
    $("#gifManual").style.opacity = st.exp.auto ? ".55" : "1";
    badges(); planLine();
  }
  const SWATCHES = [["#1E2A44", "네이비"], ["#2B1E3E", "자두"], ["#3A1820", "버건디"], ["#14322C", "숲"], ["#3A3024", "브론즈"], ["#0B0B0D", "칠흑"], ["#DCE3EC", "안개"], ["#E6D8C6", "모래"], ["#EAD6DC", "장미"]];
  function renderSwatches() {
    $("#toneSwatches").replaceChildren(...SWATCHES.map(([c, n]) => el("button", { class: "swatch", type: "button", title: n, "aria-label": "바탕 " + n, "data-c": c, style: "--c:" + c, onclick: () => { st.tone = "custom"; st.toneColor = c; changed("toneColor"); } })));
  }
  function markSwatches() { $$("#toneSwatches .swatch").forEach((b) => b.setAttribute("aria-pressed", String(st.tone === "custom" && b.dataset.c.toLowerCase() === String(st.toneColor).toLowerCase()))); }
  function badges() {
    const n = st.layout.count, at = st.slots.slice(0, n).map((s) => AE.ATTRS[s.attr].kr + (s.rank ? " " + s.rank : ""));
    if (n === 1 && st.slots[0].duo && st.slots[0].p2) at.push(AE.ATTRS[st.slots[0].p2.attr].kr + " " + st.slots[0].p2.rank);
    $("#bPhotos").textContent = `${n}장 · ${at.join(" / ")}`;
    $("#bFrame").textContent = (st.layout.mode === "slant" && n > 1 ? "사선 · " : "") + ({ blend: "반반 섞기", each: "사진마다", group: "사진별로 나누기" }[st.frame.mode] || "");
    const sa = AE.sideAttrs(st);
    $("#bEmblem").textContent = st.emblem.show ? `${AE.ATTRS[sa[0]].kr} · ${AE.ATTRS[sa[1]].kr}` : "꺼짐";
    $("#bText").textContent = st.texts.filter((t) => t.show).length + "개";
    const A = st.arch; $("#bMark").textContent = [A.submark && "서브마크", A.compass && "링", A.beam && "빛줄기", A.watermark && "로고", A.wordmark && "코너"].filter(Boolean).length + "개 켜짐";
    $("#bCanvas").textContent = `${{ obsidian: "다크", album: "화이트", custom: "색", attr: "속성" }[st.tone] || "다크"} · ${st.ratio} · ${st.loop.toFixed(1)}초`;
    $("#bExport").textContent = st.exp.fmt.toUpperCase();
  }
  function planLine() {
    const e = st.exp;
    let s = "";
    if (e.fmt === "gif") {
      if (e.auto) { const [w, h] = AX.gifDims(st.ratio, 1280); s = `최대 ${w}×${h}부터 시작 · ${e.target === "web" ? "15MB" : "5MB"} 안으로 자동 맞춤 · 루프 ${st.loop.toFixed(1)}초`; }
      else { const p = AX.manualPlan(st); s = `${p.w}×${p.h} · ${(+p.fps.toFixed(1))}fps · ${p.frames}프레임 · ${p.colors}색 · 루프 ${st.loop.toFixed(1)}초`; }
    } else if (e.fmt === "mp4") { const p = AX.mp4Plan(st); s = `${p.w}×${p.h} · ${p.fps}fps · ${p.dur.toFixed(1)}초 (루프 ${st.loop.toFixed(1)}초 ×${p.rep})`; }
    else { const [W, H] = AE.RATIOS[st.ratio], k = e.png === 2 ? 2 : 1; s = `${W * k}×${H * k} PNG · 현재 장면 ${(tNow).toFixed(1)}초`; }
    $("#planLine").textContent = s;
  }
  let slotSig = "";
  function changed(k, soft) {
    dirty = true;
    if (k === "loop") tNow = tNow % st.loop;
    if (k === "ratio") fitView();
    if (k && k.startsWith("caption")) fontsSoon();
    const sig = st.layout.count + "|" + st.slots.map((s) => s.attr + s.cls + s.rank + (s.duo && s.p2 ? "d" + s.p2.attr + s.p2.cls + s.p2.rank : "")).join(",") + "|" + imgs.map((m) => (m ? m.id : 0)).join(",");
    if (!soft) { syncControls(); if (sig !== slotSig) renderSlots(); }
    else { badges(); if (k && k.startsWith("exp")) planLine(); }
    if (k === "layout.count") renderSlots();
    scheduleSave();
    clearResult();
  }

  /* ---------- slots ---------- */
  let imgSeq = 0;
  function thumbOf(m) {
    const c = document.createElement("canvas"); c.width = 152; c.height = 200;
    const g = c.getContext("2d"), sc = Math.max(152 / m.w, 200 / m.h);
    g.drawImage(m.src, (152 - m.w * sc) / 2, (200 - m.h * sc) / 2, m.w * sc, m.h * sc);
    return c;
  }
  function segOf(obj, key, opts, cls) {
    const seg = el("div", { class: "seg " + (cls || ""), role: "group" });
    opts.forEach(([v, label]) => seg.append(el("button", { type: "button", "aria-pressed": String(obj[key] === v), onclick: () => { obj[key] = v; changed("slot"); } }, label)));
    return seg;
  }
  function duoToggle(s) {
    const seg = el("div", { class: "seg", role: "group", "aria-label": "사진 속 인물 수" });
    [[false, "한 명"], [true, "두 명 (투샷)"]].forEach(([v, label]) => seg.append(el("button", { type: "button", "aria-pressed": String(!!s.duo === v), onclick: () => {
      s.duo = v;
      if (!s.p2) s.p2 = { attr: "ice", name: "EDEN", cls: "guide", rank: "SS" };
      s.attr2 = null;
      if (v && ["3:4", "4:5", "2:3"].includes(st.layout.slotRatio)) { st.layout.slotRatio = "4:3"; toast("두 사람이 들어가게 사진 비율을 4:3으로 바꿨어요"); }
      changed("slot"); fontsSoon();
    } }, label)));
    return el("div", { class: "duo-pick" }, el("span", null, "사진 속 인물"), seg);
  }
  function personCard(s) {
    const p = s.p2;
    return el("div", { class: "duo" },
      el("div", { class: "duo-head" }, el("span", { class: "attr-name" }, "RIGHT · 오른쪽 인물 · " + AE.ATTRS[p.attr].kr), el("button", { class: "btn line sm", type: "button", onclick: () => swapDuo(s) }, "⇄ 좌우 바꾸기")),
      attrPicker(p.attr, (a) => { p.attr = a; changed("slot"); }),
      el("input", { type: "text", id: "slot-name-p2", value: p.name, placeholder: "오른쪽 인물 코드네임", "aria-label": "오른쪽 인물 코드네임", oninput: (e) => { p.name = e.target.value; dirty = true; fontsSoon(); scheduleSave(); } }),
      el("div", { class: "slot-sub" }, segOf(p, "cls", [["sentinel", "센티넬"], ["guide", "가이드"], ["none", "없음"]], ""), segOf(p, "rank", AE.RANKS.map((r) => [r, r]), "mono tight")));
  }
  /* reorder: move a photo (with its attribute, profile and framing) to another position */
  function moveSlot(from, to) {
    const n = st.layout.count;
    if (to < 0 || to >= n || from === to) return;
    const s = st.slots.splice(from, 1)[0], m = imgs.splice(from, 1)[0];
    st.slots.splice(to, 0, s); imgs.splice(to, 0, m);
    // keep the two-person setting with the first card when there is a single photo
    changed("slot"); renderSlots();
    toast(`${from + 1}번 사진을 ${to + 1}번 자리로 옮겼어요`);
  }
  function swapDuo(s) {
    const p = s.p2;
    for (const k of ["attr", "name", "cls", "rank"]) { const t = s[k]; s[k] = p[k]; p[k] = t; }
    changed("slot"); renderSlots(); toast("왼쪽과 오른쪽 인물을 바꿨어요");
  }
  let dragFrom = -1;
  function renderSlots() {
    const list = $("#slotList"), n = st.layout.count;
    slotSig = n + "|" + st.slots.map((s) => s.attr + s.cls + s.rank + (s.duo && s.p2 ? "d" + s.p2.attr + s.p2.cls + s.p2.rank : "")).join(",") + "|" + imgs.map((m) => (m ? m.id : 0)).join(",");
    const cards = [];
    for (let i = 0; i < n; i++) {
      const s = st.slots[i], m = imgs[i];
      const th = el("div", { class: "thumb", title: i + 1 + "번 사진 넣기", onclick: () => pickOne(i) },
        m ? thumbOf(m) : el("span", { class: "ph" }, "비어 있음"), m && m.sample ? el("span", { class: "tag" }, "예시") : null);
      const name = el("input", { type: "text", id: "slot-name-" + i, value: s.name, placeholder: n === 1 && s.duo ? "왼쪽 인물 코드네임" : "코드네임", "aria-label": i + 1 + "번 사진 코드네임", oninput: (e) => { s.name = e.target.value; dirty = true; fontsSoon(); scheduleSave(); } });
      const zr = el("input", { type: "range", id: "slot-zoom-" + i, min: 1, max: 4, step: 0.01, value: s.zoom, "aria-label": "확대" });
      const zo = el("output", null, "×" + s.zoom.toFixed(2));
      zr.addEventListener("input", () => { s.zoom = +zr.value; zo.textContent = "×" + s.zoom.toFixed(2); rangeFill(zr); dirty = true; scheduleSave(); });
      rangeFill(zr);
      const main = el("div", { class: "slot-main" },
        el("div", { class: "slot-head" },
          n > 1 ? el("span", { class: "order" },
            el("span", { class: "grip", draggable: "true", title: "끌어서 순서 바꾸기", "aria-hidden": "true", html: '<svg viewBox="0 0 10 16"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></svg>' }),
            ib("up", i + 1 + "번 사진을 앞으로", () => moveSlot(i, i - 1), i === 0),
            ib("down", i + 1 + "번 사진을 뒤로", () => moveSlot(i, i + 1), i === n - 1)) : null,
          el("b", null, i + 1 + "번 사진"), el("span", { class: "fname" }, m ? m.name : ""),
          el("span", { class: "acts" },
            el("button", { class: "btn sm", type: "button", onclick: () => pickOne(i) }, m ? "바꾸기" : "사진 넣기"),
            m ? el("button", { class: "btn line sm", type: "button", onclick: () => { imgs[i] = null; changed("img"); } }, "빼기") : null)),
        el("div", { class: "attr-name" }, (n === 1 && s.duo ? "LEFT · 왼쪽 인물 · " : "ATTRIBUTE · ") + AE.ATTRS[s.attr].kr),
        attrPicker(s.attr, (a) => { s.attr = a; changed("slot"); }),
        name,
        el("div", { class: "slot-sub" }, segOf(s, "cls", [["sentinel", "센티넬"], ["guide", "가이드"], ["none", "없음"]], ""),
          segOf(s, "rank", AE.RANKS.map((r) => [r, r]), "mono tight")),
        el("div", { class: "mini" }, el("span", null, "확대"), zr, el("button", { class: "btn line sm", type: "button", onclick: () => { s.zoom = 1; s.ox = 0; s.oy = 0; zr.value = 1; zo.textContent = "×1.00"; rangeFill(zr); dirty = true; scheduleSave(); } }, "맞춤")),
        n === 1 ? duoToggle(s) : null,
        n === 1 && s.duo ? personCard(s) : null);
      const card = el("div", { class: "slot", "data-i": i }, th, main);
      if (n > 1) {
        const grip = card.querySelector(".grip");
        grip.addEventListener("dragstart", (e) => { dragFrom = i; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "slot:" + i); try { e.dataTransfer.setDragImage(card, 20, 20); } catch (err) { /* optional */ } });
        grip.addEventListener("dragend", () => { dragFrom = -1; card.classList.remove("dragging"); $$(".slot.drop-target").forEach((c) => c.classList.remove("drop-target")); });
        card.addEventListener("dragover", (e) => { if (dragFrom < 0 || dragFrom === i) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; card.classList.add("drop-target"); });
        card.addEventListener("dragleave", (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove("drop-target"); });
        card.addEventListener("drop", (e) => { if (dragFrom < 0) return; e.preventDefault(); card.classList.remove("drop-target"); const f = dragFrom; dragFrom = -1; moveSlot(f, i); });
      }
      cards.push(card);
    }
    list.replaceChildren(...cards);
    $("#clearSamples").hidden = !imgs.some((m) => m && m.sample);
  }
  /* image loading */
  async function decode(file) {
    let src, w, h;
    try {
      const bmp = await createImageBitmap(file);
      w = bmp.width; h = bmp.height; src = bmp;
    } catch (e) {
      const url = URL.createObjectURL(file);
      try {
        const im = new Image(); im.src = url; await im.decode();
        w = im.naturalWidth; h = im.naturalHeight; src = im;
      } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
    }
    const cap = 2400, s = Math.min(1, cap / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    return { src: c, w: c.width, h: c.height, name: file.name || "사진", blob: file, id: ++imgSeq };
  }
  async function putFiles(files, start) {
    files = [...files].filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(f.name || "")).slice(0, 4);
    if (!files.length) { toast("이미지 파일만 넣을 수 있어요"); return; }
    start = start || 0;
    let placed = 0;
    for (let k = 0; k < files.length && start + k < 4; k++) {
      try { const m = await decode(files[k]); imgs[start + k] = m; st.slots[start + k].zoom = 1; st.slots[start + k].ox = 0; st.slots[start + k].oy = 0; placed++; }
      catch (e) { toast("이 사진은 열 수 없어요. PNG나 JPG로 다시 시도해 주세요"); }
    }
    if (start + placed > st.layout.count) st.layout.count = Math.min(4, start + placed);
    changed("img"); renderSlots();
    if (placed) toast(placed > 1 ? `${placed}장을 넣었어요` : `${start + 1}번 사진을 넣었어요`);
  }
  let pickTarget = 0;
  function pickOne(i) { pickTarget = i; $("#fileOne").value = ""; $("#fileOne").click(); }
  $("#fileOne").addEventListener("change", (e) => { if (e.target.files.length) putFiles([e.target.files[0]], pickTarget); });
  $("#addMany").addEventListener("click", () => { $("#fileMany").value = ""; $("#fileMany").click(); });
  $("#fileMany").addEventListener("change", (e) => {
    const f = [...e.target.files];
    if (!f.length) return;
    imgs = imgs.map((m, i) => (i < f.length ? m : m && m.sample ? null : m));
    st.layout.count = clamp(f.length, 1, 4);
    putFiles(f, 0);
  });
  $("#clearSamples").addEventListener("click", () => { imgs = imgs.map((m) => (m && m.sample ? null : m)); changed("img"); renderSlots(); });

  /* ---------- text layers ---------- */
  function renderPresets() {
    const box = $("#presets");
    box.replaceChildren(...Object.entries(AS.TEXT_PRESETS).map(([k, p]) => el("button", { class: "btn line sm", type: "button", onclick: () => {
      const t = AS.newText(Object.assign({}, p.o, { y: 0.5 + ((st.texts.length % 4) - 1.5) * 0.06 }));
      st.texts.push(t); selText = t.id; renderTexts(); changed("text"); fontsSoon();
    } }, "+ " + p.label)));
  }
  function segFor(t, key, opts, after) {
    const seg = el("div", { class: "seg" });
    opts.forEach(([v, label]) => seg.append(el("button", { type: "button", "aria-pressed": String(t[key] === v), onclick: () => { t[key] = v; seg.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(opts[i][0] === v))); dirty = true; scheduleSave(); if (after) after(); } }, label)));
    return seg;
  }
  function rangeFor(t, key, min, max, step, f, id) {
    const r = el("input", { type: "range", id, min, max, step, value: t[key] }), o = el("output", null, fmt(t[key], f));
    r.addEventListener("input", () => { t[key] = +r.value; o.textContent = fmt(+r.value, f); rangeFill(r); dirty = true; scheduleSave(); });
    rangeFill(r);
    return el("label", { class: "rng" }, r, o);
  }
  const row = (k, ...v) => el("div", { class: "row" }, el("span", { class: "k" }, k), el("div", { class: "v" }, ...v));
  function textEditor(t) {
    const ta = el("textarea", { id: "tx-" + t.id, rows: 2, "aria-label": "글자 내용", value: t.text, oninput: (e) => { t.text = e.target.value; dirty = true; fontsSoon(); scheduleSave(); const n = e.target.closest(".tl-item").querySelector(".tl-name"); n.textContent = t.text.split("\n")[0] || "(빈 글자)"; } });
    const fsel = el("select", { id: "tf-" + t.id, "aria-label": "글꼴" });
    fontOpts(fsel, t.font);
    const wbox = el("div");
    const weights = () => { const F = AE.FONTMAP[t.font]; if (F && !F.w.includes(t.weight)) t.weight = F.w.reduce((a, b) => (Math.abs(b - t.weight) < Math.abs(a - t.weight) ? b : a)); wbox.replaceChildren(segFor(t, "weight", (F ? F.w : [400]).map((w) => [w, String(w)]))); };
    fsel.addEventListener("change", () => { t.font = fsel.value; weights(); dirty = true; fontsSoon(); scheduleSave(); });
    weights();
    const col = el("input", { type: "color", id: "tc-" + t.id, value: t.custom, "aria-label": "직접 고른 색", oninput: (e) => { t.custom = e.target.value; t.color = "custom"; colSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === "직접"))); dirty = true; scheduleSave(); } });
    const colSeg = segFor(t, "color", [["metal", "메탈"], ["attrL", "왼쪽 속성"], ["attrR", "오른쪽 속성"], ["tone", "기본"], ["sub", "흐리게"], ["custom", "직접"]]);
    return el("div", { class: "tl-body" },
      ta,
      row("글꼴", fsel), row("굵기", wbox),
      row("크기", rangeFor(t, "size", 10, 180, 1, "px", "ts-" + t.id)),
      row("글자 간격", rangeFor(t, "spacing", -0.05, 0.8, 0.01, "em", "tsp-" + t.id)),
      row("색", colSeg, col),
      row("빛 번짐", rangeFor(t, "glow", 0, 1.5, 0.05, "x", "tg-" + t.id)),
      row("장식", segFor(t, "deco", [["none", "없음"], ["rule", "양옆 선"], ["stars", "양옆 별"]])),
      row("움직임", segFor(t, "anim", [["none", "없음"], ["shine", "빛 스윕"], ["breath", "숨쉬기"], ["flicker", "깜빡임"]])),
      row("정렬", segFor(t, "align", [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]])),
      row("가로 위치", rangeFor(t, "x", 0, 1, 0.005, "pct", "tx2-" + t.id)),
      row("세로 위치", rangeFor(t, "y", 0, 1, 0.005, "pct", "ty2-" + t.id)));
  }
  function renderTexts() {
    const list = $("#textList");
    const items = st.texts.map((t, i) => {
      const on = selText === t.id;
      const nameBtn = el("button", { class: "tl-name" + (t.show ? "" : " off"), type: "button", "aria-expanded": String(on), onclick: () => { selText = on ? null : t.id; renderTexts(); dirty = true; } }, t.text.split("\n")[0] || "(빈 글자)");
      const head = el("div", { class: "tl-head" },
        ib(t.show ? "eye" : "eyeOff", t.show ? "숨기기" : "보이기", () => { t.show = !t.show; renderTexts(); changed("text"); }),
        nameBtn,
        ib("up", "위로", () => { st.texts.splice(i, 1); st.texts.splice(i - 1, 0, t); renderTexts(); changed("text"); }, i === 0),
        ib("down", "아래로", () => { st.texts.splice(i, 1); st.texts.splice(i + 1, 0, t); renderTexts(); changed("text"); }, i === st.texts.length - 1),
        ib("copy", "복제", () => { const c = AS.newText(Object.assign({}, t, { id: undefined, y: clamp(t.y + 0.05, 0, 1) })); st.texts.splice(i + 1, 0, c); selText = c.id; renderTexts(); changed("text"); }),
        ib("x", "삭제", () => { st.texts.splice(i, 1); if (selText === t.id) selText = null; renderTexts(); changed("text"); }));
      return el("div", { class: "tl-item" + (on ? " on" : "") }, head, on ? textEditor(t) : null);
    });
    if (!items.length) items.push(el("p", { class: "note" }, "위 버튼으로 글자를 추가해 보세요."));
    list.replaceChildren(...items);
    badges();
  }

  /* ---------- preview ---------- */
  function fitView() {
    const box = $("#stage"), [W, H] = AE.RATIOS[st.ratio];
    const cs = getComputedStyle(box), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const narrow = innerWidth <= 980;
    const maxW = Math.max(160, box.clientWidth - padX), maxH = Math.max(180, innerHeight * (narrow ? 0.36 : 0.66));
    let cw = maxW, ch = (cw * H) / W;
    if (ch > maxH) { ch = maxH; cw = (ch * W) / H; }
    view.style.width = Math.round(cw) + "px"; view.style.height = Math.round(ch) + "px";
    const dpr = Math.min(2, devicePixelRatio || 1);
    view.width = Math.round(cw * dpr); view.height = Math.round(ch * dpr);
    dirty = true;
  }
  new ResizeObserver(() => fitView()).observe($("#stage"));
  addEventListener("resize", fitView);
  function draw() {
    const [W, H] = AE.RATIOS[st.ratio];
    hits = [];
    lastL = AE.renderFrame(vctx, W, H, view.width / W, (tNow % st.loop) / st.loop, st, imgs, { hits, sel: selText });
    $("#timeTxt").innerHTML = `<b>${tNow.toFixed(1)}</b> / ${st.loop.toFixed(1)}초`;
    const sc = $("#scrub"); sc.value = Math.round((tNow / st.loop) * 1000); rangeFill(sc);
  }
  function frame(now) {
    if (playing && !exporting) { tNow = (tNow + Math.min(0.1, (now - last) / 1000)) % st.loop; dirty = true; }
    last = now;
    if (dirty && AE.ART.ready) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  function setPlay(v) { playing = v; $("#playBtn").innerHTML = v ? ICONS.pause : ICONS.play; $("#playBtn").setAttribute("aria-label", v ? "멈춤" : "재생"); if (!v && st.exp.fmt === "png") planLine(); }
  $("#playBtn").addEventListener("click", () => setPlay(!playing));
  $("#scrub").addEventListener("input", (e) => { setPlay(false); tNow = (+e.target.value / 1000) * st.loop; dirty = true; planLine(); });
  $("#toSave").addEventListener("click", () => { const s = $("#secExport"); s.open = true; s.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); });

  /* ---------- pointer: drag images / text, zoom ---------- */
  const toBase = (e) => { const r = view.getBoundingClientRect(), [W, H] = AE.RATIOS[st.ratio]; return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  function inPoly(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) c = !c; } return c; }
  function slotAt(pt) { if (!lastL) return -1; for (let i = 0; i < lastL.slots.length; i++) { const s = lastL.slots[i]; if (pt.x >= s.bx0 && pt.x <= s.bx1 && pt.y >= s.by0 && pt.y <= s.by1 && inPoly(pt, s.poly)) return i; } return -1; }
  function over(i) { const s = lastL.slots[i], m = imgs[i], z = st.slots[i].zoom, bw = s.bx1 - s.bx0, bh = s.by1 - s.by0, sc = Math.max(bw / m.w, bh / m.h) * z; return { ox: m.w * sc - bw, oy: m.h * sc - bh }; }
  const ptrs = new Map();
  let drag = null;
  view.addEventListener("pointerdown", (e) => {
    const pt = toBase(e);
    ptrs.set(e.pointerId, pt);
    if (ptrs.size === 2 && drag && drag.type === "img") {
      const [a, b] = [...ptrs.values()];
      drag = { type: "pinch", i: drag.i, d0: Math.hypot(a.x - b.x, a.y - b.y), z0: st.slots[drag.i].zoom };
      return;
    }
    const h = [...hits].reverse().find((q) => pt.x >= q.x0 && pt.x <= q.x1 && pt.y >= q.y0 && pt.y <= q.y1);
    if (h) {
      const t = st.texts.find((q) => q.id === h.id);
      if (t) { drag = { type: "text", t, sx: pt.x, sy: pt.y, ox: t.x, oy: t.y }; if (selText !== t.id) { selText = t.id; renderTexts(); } }
    } else {
      const i = slotAt(pt);
      if (i >= 0 && imgs[i]) drag = { type: "img", i, sx: pt.x, sy: pt.y, ox: st.slots[i].ox, oy: st.slots[i].oy };
      else if (selText) { selText = null; renderTexts(); dirty = true; }
    }
    if (drag) { view.setPointerCapture(e.pointerId); view.classList.add("dragging"); }
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const pt = toBase(e), [W, H] = AE.RATIOS[st.ratio];
    ptrs.set(e.pointerId, pt);
    if (drag.type === "text") { drag.t.x = clamp(drag.ox + (pt.x - drag.sx) / W, 0, 1); drag.t.y = clamp(drag.oy + (pt.y - drag.sy) / H, 0, 1); }
    else if (drag.type === "img") {
      const o = over(drag.i), s = st.slots[drag.i];
      if (o.ox > 1) s.ox = clamp(drag.ox + (2 * (pt.x - drag.sx)) / o.ox, -1, 1);
      if (o.oy > 1) s.oy = clamp(drag.oy + (2 * (pt.y - drag.sy)) / o.oy, -1, 1);
    } else if (drag.type === "pinch" && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      st.slots[drag.i].zoom = clamp((drag.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, drag.d0), 1, 4);
    }
    dirty = true;
  });
  const endDrag = (e) => {
    ptrs.delete(e.pointerId);
    if (!drag) return;
    if (ptrs.size && drag.type === "pinch") return;
    const was = drag; drag = null; view.classList.remove("dragging");
    if (was.type === "text") renderTexts(); else renderSlots();
    scheduleSave();
  };
  view.addEventListener("pointerup", endDrag); view.addEventListener("pointercancel", endDrag);
  view.addEventListener("wheel", (e) => {
    const i = slotAt(toBase(e));
    if (i < 0 || !imgs[i]) return;
    e.preventDefault();
    const s = st.slots[i]; s.zoom = clamp(s.zoom * Math.exp(-e.deltaY * 0.0015), 1, 4); dirty = true; scheduleSave();
    clearTimeout(view._wt); view._wt = setTimeout(renderSlots, 250);
  }, { passive: false });
  view.addEventListener("dblclick", (e) => { const i = slotAt(toBase(e)); if (i >= 0) pickOne(i); });
  const stage = $("#stage");
  stage.addEventListener("dragover", (e) => { if ([...(e.dataTransfer.types || [])].includes("Files")) { e.preventDefault(); $("#drop").hidden = false; } });
  stage.addEventListener("dragleave", (e) => { if (!stage.contains(e.relatedTarget)) $("#drop").hidden = true; });
  stage.addEventListener("drop", (e) => {
    e.preventDefault(); $("#drop").hidden = true;
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    let i = slotAt(toBase(e));
    if (i < 0) i = files.length > 1 ? 0 : Math.max(0, imgs.slice(0, st.layout.count).findIndex((m) => !m || m.sample));
    putFiles(files, i);
  });

  /* ---------- persistence (this browser only) ---------- */
  const DB = "arch-frame-maker", STORE = "p";
  let dbp = null;
  const idb = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  let saveT = 0;
  function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(saveNow, 700); }
  async function saveNow() {
    try {
      const db = await idb();
      const rec = { st, imgs: imgs.map((m) => (m && !m.sample && m.blob ? { blob: m.blob, name: m.name } : null)), samples: imgs.map((m) => !!(m && m.sample)) };
      await new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(rec, "cur"); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (e) { /* storage unavailable: keep working without it */ }
  }
  function mergeDefaults(base, saved) {
    if (!saved || typeof saved !== "object") return base;
    for (const k of Object.keys(base)) {
      if (!(k in saved)) continue;
      const b = base[k], s = saved[k];
      if (Array.isArray(b)) base[k] = Array.isArray(s) ? (k === "slots" ? b.map((d, i) => Object.assign(d, s[i] || {})) : k === "texts" ? s.map((t) => AS.newText(t)) : s) : b;
      else if (b && typeof b === "object") base[k] = mergeDefaults(b, s);
      else if (typeof s === typeof b) base[k] = s;
    }
    return base;
  }
  async function loadSaved() {
    try {
      const db = await idb();
      const rec = await new Promise((res, rej) => { const tx = db.transaction(STORE, "readonly"), q = tx.objectStore(STORE).get("cur"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      if (!rec || !rec.st) return false;
      st = mergeDefaults(AS.defaultState(), rec.st);
      if ((rec.st.v || 1) < 2) { st.frame.mode = "blend"; st.frame.blend = 0.6; st.emblem.place = "corner"; st.emblem.corner = "straddle"; st.v = 2; }
      if ((rec.st.v || 1) < 4) { const s0 = st.slots[0]; if (s0.attr2) { s0.duo = true; s0.p2 = Object.assign({ name: "", cls: "guide", rank: "S" }, s0.p2 || {}, { attr: s0.attr2 }); s0.attr2 = null; } }
      if ((rec.st.v || 1) < 3) { st.caption = AS.defaultState().caption; st.emblem.rank = true; if (st.tone === "midnight") { st.tone = "custom"; st.toneColor = "#141C36"; } st.v = 3; }
      st.texts.forEach((t) => { if (!t.id) t.id = AS.newText().id; });
      for (let i = 0; i < 4; i++) {
        const r = rec.imgs && rec.imgs[i];
        if (r && r.blob) { try { const m = await decode(r.blob); m.name = r.name || m.name; imgs[i] = m; } catch (e) { imgs[i] = null; } }
        else if (rec.samples && rec.samples[i]) imgs[i] = sample(i);
        else imgs[i] = null;
      }
      return true;
    } catch (e) { return false; }
  }
  function sample(i) { const m = AS.sampleImage(i % 2 ? "ice" : "fire"); m.id = ++imgSeq; return m; }
  let resetArm = 0;
  $("#resetAll").addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (!resetArm) { resetArm = setTimeout(() => { resetArm = 0; b.textContent = "처음 상태로"; b.classList.remove("warn"); }, 3200); b.textContent = "한 번 더 누르면 초기화"; b.classList.add("warn"); return; }
    clearTimeout(resetArm); resetArm = 0; b.textContent = "처음 상태로"; b.classList.remove("warn");
    st = AS.defaultState(); imgs = [sample(0), sample(1), null, null]; selText = null; tNow = 0;
    fullSync(); fitView(); scheduleSave(); toast("처음 상태로 돌렸어요");
  });

  /* ---------- export ---------- */
  let exporting = false, cancelFlag = false, result = null;
  function clearResult() { if (exporting) return; if (result) { if (result.url) URL.revokeObjectURL(result.url); result = null; $("#result").hidden = true; } }
  function prog(v, msg) { $("#progBar").style.width = Math.round(clamp(v, 0, 1) * 100) + "%"; $("#progTxt").textContent = msg; }
  const mb = (b) => (b / 1e6).toFixed(b >= 1e7 ? 1 : 2) + "MB";
  $("#cancelBtn").addEventListener("click", () => { cancelFlag = true; prog(1, "취소하는 중"); });
  $("#makeBtn").addEventListener("click", async () => {
    if (exporting) return;
    clearResult();
    exporting = true; cancelFlag = false;
    const btn = $("#makeBtn"); btn.disabled = true;
    $("#prog").hidden = false; prog(0, "준비 중");
    const snap = JSON.parse(JSON.stringify(st)), useImgs = imgs.slice();
    try {
      await ensureFonts();
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const stop = () => cancelFlag;
      let out;
      const stamp = new Date(), ds = `${stamp.getFullYear() % 100}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
      if (snap.exp.fmt === "gif") out = await AX.makeGif(snap, useImgs, prog, stop);
      else if (snap.exp.fmt === "mp4") out = await AX.makeMp4(snap, useImgs, prog, stop);
      else out = await AX.makePng(snap, useImgs, (tNow % snap.loop) / snap.loop);
      const name = `arch-${snap.slots.slice(0, snap.layout.count).map((s) => s.attr).join("-")}-${ds}.${out.ext}`;
      const url = URL.createObjectURL(out.blob);
      result = { blob: out.blob, name, url };
      const media = $("#resMedia");
      media.replaceChildren(out.ext === "png" || out.ext === "gif" ? el("img", { src: url, alt: "만든 결과 미리보기" }) : el("video", { src: url, autoplay: true, loop: true, muted: true, playsinline: true, controls: true }));
      const v = media.querySelector("video"); if (v) { v.muted = true; v.play().catch(() => {}); }
      const pl = out.plan || {};
      $("#resName").textContent = name;
      $("#resMeta").textContent = [pl.w && `${pl.w}×${pl.h}`, pl.fps && `${(+pl.fps).toFixed(pl.fps % 1 ? 1 : 0)}fps`, pl.frames && out.ext === "gif" && `${pl.frames}프레임`, mb(out.blob.size)].filter(Boolean).join(" · ");
      const warn = $("#resWarn");
      warn.hidden = !(out.over || out.note);
      warn.textContent = out.over ? `${mb(out.blob.size)}라서 목표(${mb(out.limit)})보다 커요. 루프를 짧게 하거나 MP4로 저장해 보세요.` : out.note || "";
      $("#result").hidden = false;
      prog(1, "완료");
      setTimeout(() => { if (!exporting) $("#prog").hidden = true; }, 600);
    } catch (e) {
      $("#prog").hidden = true;
      if (e && e.cancel) toast("만들기를 취소했어요");
      else toast((e && e.message && /[가-힣]/.test(e.message)) ? e.message : "만들지 못했어요. 다시 눌러 주세요");
      console.warn(e);
    } finally { exporting = false; btn.disabled = false; }
  });
  let dl = null;
  async function saveFile(blob, name) {
    const d = await (dl || (dl = window.claude && typeof window.claude.use === "function" ? Promise.resolve(window.claude.use("downloads")).catch(() => null) : Promise.resolve(null)));
    if (d) {
      try { await d.save({ filename: name, data: blob }); toast("저장했어요"); return; }
      catch (e) {
        const c = e && e.code;
        if (c === "declined") return toast("저장을 취소했어요");
        if (c === "rate_limited") return toast("잠시 후 다시 눌러 주세요");
        if (c === "too_large") return toast("파일이 너무 커요. 크기를 줄여 주세요");
        if (c && !["unavailable", "not_granted", "capability_disabled", "capability_removed"].includes(c)) return toast("저장하지 못했어요 (" + c + ")");
      }
    }
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  $("#saveBtn").addEventListener("click", () => { if (result) saveFile(result.blob, result.name); });

  /* ---------- boot ---------- */
  function fullSync() {
    fontOpts($("#sel-capfont"), st.caption.font);
    renderSwatches();
    syncControls(); renderSlots(); renderTexts(); renderPresets();
    setPlay(playing); fontsSoon(); dirty = true;
  }
  bindControls(document);
  (async () => {
    setPlay(playing);
    fitView();
    await AE.loadArt(ASSETS);
    const had = await loadSaved();
    if (!had) imgs = [sample(0), sample(1), null, null];
    fullSync();
    requestAnimationFrame(frame);
  })();
  window.__arch = { get st() { return st; }, get imgs() { return imgs; }, draw: () => { dirty = true; } };
})();
