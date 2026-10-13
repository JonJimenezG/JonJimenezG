
const D = __DATA__;
const P = D.P;
const V = D.V;
const MD = D.model;
const TS = 1 / 90;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll("[data-gear]")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const at = (p) => iso(p, P);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const spins = D.spins.map((s) => ({ ...s, el: svg.querySelector(`[data-spin="${s.id}"]`) }));
const tracks = { L: svg.querySelector('[data-track="L"]'), R: svg.querySelector('[data-track="R"]') };
const lever = svg.querySelector('[data-part="lever"]');
const swash = svg.querySelector('[data-part="swash"]');
const elems = {};
for (const g of svg.querySelectorAll("[data-el]")) (elems[g.dataset.el] ??= []).push(g);
const pistons = {};
for (const g of svg.querySelectorAll("[data-piston]")) pistons[g.dataset.piston] = g;

const N_INDEX = MD.gears.findIndex((g) => g.id === "N");
const state = { gear: N_INDEX, a: 0, aTarget: 0, wr: 0, lever: D.gateX[N_INDEX], push: {}, angle: {}, touring: !still.matches, clock: 0 };
for (const id of Object.keys(pistons)) state.push[id] = 0;
const ANG = ["e", "r", "z", "sL", "sR", "cL", "cR", "spL", "spR", "hm", "hp"];
for (const key of ANG) state.angle[key] = 0;

function speedsOf(wr, a) {
  const wz = a * MD.WS_MAX;
  const sL = wz;
  const sR = -wz;
  const cL = MD.KR * wr + MD.KS * sL;
  const cR = MD.KR * wr + MD.KS * sR;
  const kmh = (w) => (w / MD.I_F) * MD.R_SPR * 3.6;
  return { e: MD.WE, r: wr, z: wz, sL, sR, cL, cR, spL: cL / MD.I_F, spR: cR / MD.I_F, hm: wz * MD.hmRatio, hp: MD.WE * MD.hpRatio, vL: kmh(cL), vR: kmh(cR) };
}

const loopPoint = (L, p, r) => {
  const dy = L.y1 - L.y0;
  const total = 2 * dy + 2 * Math.PI * r;
  let q = ((p % total) + total) % total;
  const arc = Math.PI * r;
  if (q < arc) {
    const a = -Math.PI / 2 + q / r;
    return [L.y1 + r * Math.cos(a), L.z + r * Math.sin(a), Math.cos(a), Math.sin(a)];
  }
  q -= arc;
  if (q < dy) return [L.y1 - q, L.z + r, 0, 1];
  q -= dy;
  if (q < arc) {
    const a = Math.PI / 2 + q / r;
    return [L.y0 + r * Math.cos(a), L.z + r * Math.sin(a), Math.cos(a), Math.sin(a)];
  }
  q -= arc;
  return [L.y0 + q, L.z - r, 0, -1];
};

function drawTrack(side, phase) {
  const L = D.loops[side];
  const r = L.r;
  const total = 2 * (L.y1 - L.y0) + 2 * Math.PI * r;
  const count = Math.round(total / D.pitch);
  const step = total / count;
  const off = ((phase * r) % step + step) % step;
  const pins = [];
  const lines = [];
  for (let i = 0; i < count; i++) {
    const p = off + i * step;
    const [y, z, ny, nz] = loopPoint(L, p, r);
    pins.push(at([L.face, y, z]));
    const facing = ny * V[1] + nz * V[2];
    const alpha = G.fadeOf(facing, [0.04, 0.4]);
    if (alpha > 0.02) {
      const oy = L.y0 + 0, o = [y + ny * (L.ro - r), z + nz * (L.ro - r)];
      void oy;
      lines.push({ d: pathOf([at([L.x0, o[0], o[1]]), at([L.x1, o[0], o[1]])]), alpha });
    }
  }
  tracks[side].innerHTML = fadedSvg(lines, { tone: "lo" }) + dotsSvg(pins, { size: 0.75, tone: "mid" });
}

function drawSpin(s, phase) {
  let html = "";
  if (s.kind === "ribs") html = fadedSvg(G.ribsOf(s.F, s.s0, s.s1, s.r, s.n, P, { phase, fade: [0.1, 0.55] }), { tone: s.tone || "lo" });
  else if (s.kind === "dots") html = dotsSvg(G.dotsOf(s.F, s.s, s.r, s.n, P, s.all ? { phase, all: true } : { phase, fade: s.fade || [0.05, 0.4] }), { size: s.size || 0.5, tone: s.tone || "mid" });
  else if (s.kind === "holes") {
    let d = "";
    for (let i = 0; i < s.n; i++) {
      const t = phase + (i / s.n) * Math.PI * 2;
      const c = G.pointOf(s.F, s.s, s.r, t);
      const F = G.frameOf(c, s.F.a, s.F.u, s.F.v);
      d += G.circleOf(F, 0, s.rr, P, 20);
    }
    html = `<path class="cd-cavity" d="${d}"/>` + lineSvg(d, { tone: "lo" });
  } else if (s.kind === "spokes") html = lineSvg(G.spokesOf(s.F, s.s, s.r0, s.r1, s.n, P, { phase }), { tone: "lo" });
  s.el.innerHTML = html;
}

function drawSwash(a) {
  const beta = a * (Math.PI / 6);
  const dir = [Math.sin(beta), 0, Math.cos(beta)];
  const F = G.frameOf(D.swash.o, dir, [Math.cos(beta), 0, -Math.sin(beta)], [0, 1, 0]);
  const tip = G.add3(D.swash.o, G.mul3(dir, D.swash.len));
  swash.innerHTML = solidSvg(G.disc(0, D.swash.len, 0.9, F, P, { steps: 16 }), { tone: "hi", crease: "none" }) + solidSvg(G.sphereOf(tip, 2.3, P, { steps: 28 }), { tone: "hi" });
}

const comma = (v, d = 1) => v.toFixed(d).replace(".", ",").replace(/^-0(,0+)?$/, "0$1").replace("-", "−");
const gearName = (g) => (/^\d$/.test(g.id) ? `${g.id}ª` : g.id);
function readoutOf(sp) {
  const g = MD.gears[state.gear];
  const vL = sp.vL;
  const vR = sp.vR;
  const fmt = (v) => comma(v, 1);
  if (Math.abs(vL) < 0.05 && Math.abs(vR) < 0.05) return `${gearName(g)} · parado`;
  if (Math.abs(vL - vR) < 0.05) return `${gearName(g)} · ${fmt((vL + vR) / 2)} km/h · recto`;
  if (Math.abs(vL + vR) < 0.1) return `${gearName(g)} · sobre sí mismo · ±${fmt(Math.abs(vL))} km/h`;
  const d = vL - vR;
  const radius = Math.abs((MD.B / 2) * (vL + vR) / d);
  return `${gearName(g)} · izq ${fmt(vL)} · der ${fmt(vR)} km/h · R ${comma(radius, 1)} m`;
}

function describe() {
  const g = MD.gears[state.gear];
  stage.setAttribute("aria-valuetext", `Marcha ${gearName(g)}, aplicados ${g.on.join(" y ")}`);
  if (status) status.textContent = `Marcha ${gearName(g)}: ${g.on.join(" y ")} aplicados`;
  buttons.forEach((b, i) => b.setAttribute("aria-pressed", i === state.gear ? "true" : "false"));
}

function applyLit() {
  const on = new Set(MD.gears[state.gear].on);
  for (const [id, list] of Object.entries(elems)) for (const item of list) for (const solid of item.querySelectorAll(".iso-solid")) on.has(id) ? solid.setAttribute("data-lit", "") : solid.removeAttribute("data-lit");
}

function draw(sp) {
  for (const s of spins) {
    const phase = (state.angle[s.src] ?? state.angle[s.src.replace(/^c(?=[LR])/, "c")] ?? 0) * (s.k ?? 1);
    drawSpin(s, phase);
  }
  drawTrack("L", state.angle.spL);
  drawTrack("R", state.angle.spR);
  lever.setAttribute("transform", translateAlong(P, [state.lever, 0, 0]));
  for (const [id, g] of Object.entries(pistons)) {
    const x = -1.5 * state.push[id];
    if (Math.abs(x) < 1e-3) g.removeAttribute("transform");
    else g.setAttribute("transform", translateAlong(P, [x, 0, 0]));
  }
  drawSwash(state.a);
  const text = readoutOf(sp);
  if (readout.textContent !== text) readout.textContent = text;
}

const TOUR = [
  ["N", 0, 1.4], ["N", -1, 3.2], ["N", 0, 1.2], ["1", 0, 2.6], ["1", 0.8, 2.8], ["2", 0, 2.4], ["3", -0.6, 3], ["4", 0, 3], ["4", 0.7, 2.8], ["N", 0, 1.6], ["R1", 0, 2.6], ["R2", 0.4, 2.8],
];
const TOUR_LEN = TOUR.reduce((a, s) => a + s[2], 0);
function tourAt(t) {
  let u = t % TOUR_LEN;
  for (const step of TOUR) {
    if (u < step[2]) return step;
    u -= step[2];
  }
  return TOUR[0];
}

let frame = 0;
let last = 0;
let visible = false;
let idleTimer = 0;
function setGear(index) {
  index = clamp(index, 0, MD.gears.length - 1);
  if (index === state.gear) return;
  state.gear = index;
  applyLit();
  describe();
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (state.touring) {
    state.clock += dt;
    const [id, a] = tourAt(state.clock);
    const index = MD.gears.findIndex((g) => g.id === id);
    if (index !== state.gear) {
      state.gear = index;
      applyLit();
      buttons.forEach((b, i) => b.setAttribute("aria-pressed", i === state.gear ? "true" : "false"));
    }
    state.aTarget = a;
  }
  const g = MD.gears[state.gear];
  const ease = (x, target, tau) => (calm ? target : x + (target - x) * (1 - Math.exp(-dt / tau)));
  state.wr = ease(state.wr, g.wr, 0.45);
  state.a = ease(state.a, state.aTarget, 0.3);
  state.lever = ease(state.lever, D.gateX[state.gear], 0.18);
  const on = new Set(g.on);
  for (const id of Object.keys(pistons)) state.push[id] = ease(state.push[id], on.has(id) ? 1 : 0, 0.12);
  if (Math.abs(state.wr - g.wr) < 1e-3) state.wr = g.wr;
  if (Math.abs(state.a - state.aTarget) < 1e-4) state.a = state.aTarget;
  const sp = speedsOf(state.wr, state.a);
  if (!calm) for (const key of ANG) state.angle[key] -= sp[key] * TS * dt;
  draw(sp);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
function takeOver() {
  state.touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    state.touring = !still.matches;
    state.clock = 0;
    run();
  }, 3600);
  run();
}
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

stage.addEventListener("keydown", (event) => {
  let handled = true;
  const step = event.shiftKey ? 0.5 : 0.25;
  if (event.key === "ArrowUp") setGear(state.gear + 1);
  else if (event.key === "ArrowDown") setGear(state.gear - 1);
  else if (event.key === "ArrowRight") state.aTarget = clamp(Math.round(((state.touring ? state.a : state.aTarget) + step) * 4) / 4, -1, 1);
  else if (event.key === "ArrowLeft") state.aTarget = clamp(Math.round(((state.touring ? state.a : state.aTarget) - step) * 4) / 4, -1, 1);
  else if (event.key === "Home") state.aTarget = 0;
  else if (/^[1-4]$/.test(event.key)) setGear(MD.gears.findIndex((g) => g.id === event.key));
  else if (event.key === "n" || event.key === "N") setGear(N_INDEX);
  else if (event.key === "r" || event.key === "R") setGear(state.gear === 1 ? 0 : 1);
  else handled = false;
  if (!handled) return;
  event.preventDefault();
  takeOver();
});
buttons.forEach((b, i) =>
  b.addEventListener("click", () => {
    setGear(i);
    takeOver();
  }),
);
let drag = null;
stage.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, a: state.aTarget, id: event.pointerId, captured: false };
});
stage.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  if (!drag.captured && Math.abs(dx) > 4) {
    stage.setPointerCapture(event.pointerId);
    drag.captured = true;
  }
  if (!drag.captured) return;
  const box = svg.getBoundingClientRect();
  state.aTarget = clamp(drag.a + (dx / box.width) * 3, -1, 1);
  takeOver();
});
const release = (event) => {
  if (drag && drag.captured) stage.releasePointerCapture(event.pointerId);
  drag = null;
};
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("focus", describe);
if (still.matches) state.touring = false;
applyLit();
stage.setAttribute("aria-valuetext", "Marcha N");
draw(speedsOf(0, 0));
