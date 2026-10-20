
const D = __DATA__;
const P = D.P;
const V = D.V;
const U = D.U;
const Z0 = D.Z0;
const RV = D.RV;
const GT = D.guideTip;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll("[data-step]")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const el = {
  channel: svg.querySelector('[data-part="channel"]'),
  front: svg.querySelector('[data-part="front-plaque"]'),
  needle: svg.querySelector('[data-part="needle"]'),
  plunger: svg.querySelector('[data-part="plunger"]'),
  float: svg.querySelector('[data-part="float"]'),
};
const at = (p) => iso(p, P);
const AX = G.frameOf([0, 0, Z0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- el procedimiento como función de u (0..6)
const WIRE_END = 116;
const PARK = -225; // balón dentro del catéter guía
const BAL_HALF = 100;
const STENT_HALF = (STENT_L * U) / 2;
const LES_HALF = (LESION_L * U) / 2;
function poseOf(u) {
  const wire = u < 1 ? lerp(GT + 4, WIRE_END, ease(u)) : WIRE_END;
  let c = PARK;
  if (u >= 1 && u < 2) c = lerp(PARK, 0, ease(u - 1));
  else if (u >= 2 && u < 4) c = 0;
  else if (u >= 4 && u < 5) c = lerp(0, PARK, ease(u - 4));
  let p = 0;
  if (u >= 2 && u < 3) p = P_DEPLOY * ease((u - 2) / 0.8);
  else if (u >= 3 && u < 4) p = P_DEPLOY * (1 - ease((u - 3) / 0.7));
  const bd = u >= 3 ? Math.max(D_FOLD, balloonD(p)) : balloonD(p);
  const sd = u < 2 ? D_CRIMP : u < 3 ? Math.max(D_CRIMP, balloonD(p)) : balloonD(P_DEPLOY);
  const sc = u < 2 ? c : 0;
  return { u, wire, c, p, br: (bd / 2) * U, sr: (sd / 2) * U, sc, deployed: u >= 2 };
}
const plaqueR = (x) => (Math.abs(x) >= LES_HALF ? RV : RV - (RV - 0.5) * Math.cos((Math.PI * x) / (2 * LES_HALF)) ** 2);
function devAt(s, x) {
  let dev = 0;
  let mesh = 0;
  if (x > GT && x < s.wire) dev = Math.max(dev, 1.8);
  if (x > GT && x < s.c - BAL_HALF) dev = Math.max(dev, 4);
  if (Math.abs(x - s.c) < BAL_HALF) {
    const t = Math.abs(x - s.c) > BAL_HALF - 10 ? (BAL_HALF - Math.abs(x - s.c)) / 10 : 1;
    dev = Math.max(dev, 4 + (s.br - 4) * t);
  }
  if (x > GT && Math.abs(x - s.sc) < STENT_HALF) mesh = s.sr;
  return { dev, mesh };
}
const lumenAt = (s, x) => {
  const { dev, mesh } = devAt(s, x);
  return Math.min(RV, Math.max(plaqueR(x), dev, mesh));
};
// la placa aplastada no desaparece: queda un 8 % de su grosor y la pared cede eso hacia fuera
const wallAt = (s, x) => Math.max(RV, lumenAt(s, x) + 0.08 * (RV - plaqueR(x)));
function flowFrom(s) {
  let least = Infinity;
  for (let x = -LES_HALF; x <= LES_HALF; x += 2) {
    const r = lumenAt(s, x);
    const { dev } = devAt(s, x);
    least = Math.min(least, Math.sqrt(Math.max(0, r * r - dev * dev)));
  }
  return { q: flowOf((2 * least) / U), dMin: (2 * least) / U };
}

// ---------- dibujo
const fmt = (v, d = 1) => v.toFixed(d).replace(".", ",");
const pt = (x, r, t) => [x, r * Math.cos(t), Z0 + r * Math.sin(t)];
const clipD = (() => {
  const pts = [];
  for (const x of [GT, 400]) for (let i = 0; i < 48; i++) pts.push(at(pt(x, 22, (i / 48) * Math.PI * 2)));
  return pathOf(G.dot3 ? hull(pts) : pts, true);
})();
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function quadsOf(s, from, to, step, all) {
  const cols = Math.max(1, Math.ceil((to - from) / step));
  const xs = Array.from({ length: cols + 1 }, (_, i) => from + ((to - from) * i) / cols);
  const rows = 16;
  const quads = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const r0 = all ? RV : lumenAt(s, x0);
    const r1 = all ? RV : lumenAt(s, x1);
    const mat = !all && RV - plaqueR((x0 + x1) / 2) > 0.6 ? "p" : "v";
    const slope = (r1 - r0) / (x1 - x0);
    for (let j = 0; j < rows; j++) {
      const t0 = Math.PI + (j / rows) * Math.PI;
      const t1 = Math.PI + ((j + 1) / rows) * Math.PI;
      const tm = (t0 + t1) / 2;
      const n = G.unit3([slope, -Math.cos(tm), -Math.sin(tm)]);
      if (G.dot3(n, V) <= 0) continue;
      const corners = [pt(x0, r0, t0), pt(x1, r1, t0), pt(x1, r1, t1), pt(x0, r0, t1)];
      const mid = pt((x0 + x1) / 2, (r0 + r1) / 2, tm);
      quads.push({ k: G.dot3(mid, V), d: pathOf(corners.map(at), true), s: G.toneOf(n, P), m: mat });
    }
  }
  quads.sort((a, b) => a.k - b.k);
  return quads.map((q) => `<path class="sd-q" data-m="${q.m}" data-s="${q.s}" d="${q.d}"/>`).join("");
}
const STATIC_LUMEN = quadsOf(null, D.blk.x0, -LES_HALF - 2, 5, true) + quadsOf(null, LES_HALF + 2, D.blk.x1, 5, true);
const lumenSvg = (s) => STATIC_LUMEN + quadsOf(s, -LES_HALF - 2, LES_HALF + 2, 3.5, false);
function wallStrip(sign) {
  const a = [D.blk.x0, sign * RV, Z0];
  const b = [D.blk.x1, sign * RV, Z0];
  const c = [D.blk.x1, sign * (RV + 3.2), Z0];
  const d = [D.blk.x0, sign * (RV + 3.2), Z0];
  return `<path class="sd-wall" d="${pathOf([a, b, c, d].map(at), true)}"/>` + lineSvg(pathOf([at(d), at(c)]), { tone: "faint" });
}
// marcas de sangre en el fondo del canal: se mueven con el caudal
function bloodSvg(s, phase) {
  let d = "";
  const dash = 7;
  const gap = 13;
  const period = dash + gap;
  const off = ((phase % period) + period) % period;
  for (const t of [1.36 * Math.PI, 1.5 * Math.PI, 1.64 * Math.PI]) {
    for (let x0 = D.blk.x0 + off - period; x0 < D.blk.x1; x0 += period) {
      const a = Math.max(D.blk.x0 + 2, x0);
      const b = Math.min(D.blk.x1 - 2, x0 + dash);
      if (b <= a) continue;
      const pts = [];
      for (let x = a; x <= b + 0.01; x += (b - a) / 3) {
        const r = lumenAt(s, x) - 0.3;
        if (r < 3) { pts.length = 0; break; }
        pts.push(at(pt(x, r, t)));
      }
      if (pts.length > 1) d += pathOf(pts);
    }
  }
  return lineSvg(d, { tone: "red", free: true });
}
function cutFace(s, sign) {
  const xs = [];
  for (let x = -LES_HALF; x <= LES_HALF + 0.01; x += 3.5) xs.push(x);
  const inner = xs.map((x) => [x, sign * lumenAt(s, x), Z0]);
  const outer = xs.map((x) => [x, sign * wallAt(s, x), Z0]).reverse();
  const area = inner.reduce((a, p, i) => a + (Math.abs(outer[outer.length - 1 - i][1]) - Math.abs(p[1])), 0);
  if (area < 1) return "";
  const face = pathOf([...inner, ...outer].map(at), true);
  const edge = pathOf(inner.map(at));
  return `<path class="sd-plaque" d="${face}"/>` + lineSvg(edge, { tone: "lo" }) + lineSvg(pathOf([at([-LES_HALF, sign * RV, Z0]), at([LES_HALF, sign * RV, Z0])]), { tone: "faint" });
}
function stentLines(s, front) {
  const rings = 12;
  const crowns = 8;
  const pitch = (2 * STENT_HALF) / rings;
  const amp = pitch * 0.32;
  let d = "";
  const seg = (a, b, tm) => {
    const n = [0, Math.cos(tm), Math.sin(tm)];
    const vis = G.dot3(n, V) > 0;
    if (vis === front) d += pathOf([at(a), at(b)]);
  };
  for (let i = 0; i < rings; i++) {
    const xr = s.sc - STENT_HALF + pitch * (i + 0.5);
    const n = crowns * 2;
    for (let j = 0; j < n; j++) {
      const t0 = (j / n) * Math.PI * 2;
      const t1 = ((j + 1) / n) * Math.PI * 2;
      seg(pt(xr + (j % 2 ? amp : -amp), s.sr, t0), pt(xr + ((j + 1) % 2 ? amp : -amp), s.sr, t1), (t0 + t1) / 2);
    }
    if (i < rings - 1) for (let j = 0; j < n; j += 4) {
      const t = (j / n) * Math.PI * 2;
      seg(pt(xr + amp, s.sr, t), pt(xr + pitch - amp, s.sr, t), t);
    }
  }
  return d;
}
function channelSvg(s) {
  let out = lumenSvg(s) + bloodSvg(s, state.blood) + wallStrip(-1) + cutFace(s, -1);
  let dev = lineSvg(stentLines(s, false), { tone: "lo" });
  // guía con punta radiopaca en espiral
  const tipF = AX;
  dev += solidSvg(G.disc(GT, s.wire, 1.8, AX, P, { steps: 16 }), { tone: "hi", crease: "none" });
  dev += fadedSvg(G.ribsOf(tipF, s.wire - 30, s.wire, 1.8, 10, P, { twist: 1.2, fade: [0.1, 0.55] }), { tone: "lo" });
  dev += solidSvg(G.sphereOf([s.wire, 0, Z0], 2.2, P, { steps: 20 }), { tone: "hi" });
  // catéter balón
  const b0 = s.c - BAL_HALF;
  const b1 = s.c + BAL_HALF;
  if (b0 > GT) dev += solidSvg(G.disc(GT, b0, 4, AX, P, { steps: 24 }), { tone: "mid", crease: "none" });
  if (b1 + 8 > GT) {
    const prof = [[b0, 4], [b0 + 10, s.br], [b1 - 10, s.br], [b1, 4], [b1, 3], [b1 + 8, 2.4]];
    dev += solidSvg(G.solidOf(prof, AX, P, { smooth: false }), { tone: "hi" });
    dev += lineSvg(G.arcOf(AX, s.c - STENT_HALF, s.br, P) + G.arcOf(AX, s.c + STENT_HALF, s.br, P), { tone: "faint" });
  }
  dev += lineSvg(stentLines(s, true), { tone: "lit" });
  out += `<g clip-path="url(#sd-clip)">${dev}</g>`;
  return out;
}

const NEEDLE = (p) => {
  const a = -Math.PI * 0.75 + (Math.PI * 1.5 * p) / 30;
  const { x, y, r, top } = D.gauge;
  return lineOnTop([x - Math.sin(a) * 3.5, y + Math.cos(a) * 3.5], [x + Math.sin(a) * (r - 5), y - Math.cos(a) * (r - 5)], top + 0.2, P);
};
function floatSvg(q) {
  const w = D.win;
  const z = w.z0 + 3 + q * (w.z1 - w.z0 - 11);
  const poly = [[w.x0 + 1, w.face + 0.2, z], [w.x1 - 1, w.face + 0.2, z], [w.x1 - 1, w.face + 0.2, z + 5], [w.x0 + 1, w.face + 0.2, z + 5]];
  return `<path class="sd-float" d="${pathOf(poly.map(at), true)}"/>` + lineSvg(pathOf(poly.map(at), true), { tone: "hi" });
}

const PHASES = ["arteria ocluida", "la guía cruza la oclusión", "el stent llega a la lesión", "inflado", "desinflado", "se retira el balón", "arteria abierta"];
function phaseOf(u) {
  if (u <= 0.001) return 0;
  return Math.min(6, Math.ceil(u - 1e-6));
}
function readoutOf(s, f) {
  const flow = `flujo ${Math.round(f.q * 100)} %`;
  const ph = phaseOf(s.u);
  if (ph === 0) return `arteria ocluida · ${flow}`;
  if (ph === 1) return s.u >= 1 ? `guía al otro lado · ${flow}` : `guía cruzando la oclusión · ${flow}`;
  if (ph === 2) return s.u >= 2 ? `stent sobre la lesión · ${flow}` : `stent hacia la lesión · ${flow}`;
  if (ph === 3) return `inflado · ${fmt(s.p)} atm · Ø ${fmt((2 * s.sr) / U, 2)} mm · ${flow}`;
  if (ph === 4) return `desinflado · ${fmt(s.p)} atm · ${flow}`;
  if (ph === 5) return `retirando el balón · luz ${fmt(f.dMin, 1)} mm · ${flow}`;
  return `abierta · luz ${fmt(f.dMin, 1)} mm · ${flow}`;
}

const DUR = [3.4, 3, 3.2, 2.4, 2.8, 3.2];
const state = { u: 0, target: 0, playing: !still.matches, q: 0, phase: -1, clock: 0, blood: 0 };
let lastKey = "";
svg.querySelector("defs") || svg.insertAdjacentHTML("afterbegin", "<defs></defs>");
svg.querySelector("defs").insertAdjacentHTML("beforeend", `<clipPath id="sd-clip"><path d="${clipD}"/></clipPath>`);

function draw() {
  const s = poseOf(state.u);
  const f = flowFrom(s);
  const key = [s.u.toFixed(4), state.blood.toFixed(1)].join();
  if (key !== lastKey) {
    el.channel.innerHTML = channelSvg(s);
    el.front.innerHTML = wallStrip(1) + cutFace(s, 1);
    lastKey = key;
  }
  el.needle.setAttribute("d", NEEDLE(s.p));
  const dx = -D.plungerMove * s.p;
  if (Math.abs(dx) < 0.01) el.plunger.removeAttribute("transform");
  else el.plunger.setAttribute("transform", translateAlong(P, [dx, 0, 0]));
  el.float.innerHTML = floatSvg(state.q);
  const text = readoutOf(s, f);
  if (readout.textContent !== text) readout.textContent = text;
  const phase = phaseOf(state.u);
  if (phase !== state.phase) {
    state.phase = phase;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.step) === phase)));
    stage.setAttribute("aria-valuetext", PHASES[phase]);
  }
  return f;
}

let frame = 0;
let last = 0;
let visible = false;
let idleTimer = 0;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (state.playing) {
    const i = Math.min(5, Math.floor(state.u));
    state.u += dt / DUR[i];
    if (state.u >= 6.6) state.u = 0;
    state.target = Math.min(6, state.u);
  } else if (calm) state.u = state.target;
  else {
    const rate = 1 / 2.4;
    const d = state.target - state.u;
    state.u = Math.abs(d) < rate * dt ? state.target : state.u + Math.sign(d) * rate * dt;
  }
  const uu = Math.min(6, state.u);
  const f = flowFrom(poseOf(uu));
  state.q = calm ? f.q : state.q + (f.q - state.q) * (1 - Math.exp(-dt / 0.35));
  if (!calm) state.blood += state.q * 26 * dt;
  const saved = state.u;
  state.u = uu;
  draw();
  state.u = saved;
  const settled = still.matches && !state.playing && state.u === state.target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
function takeOver() {
  state.playing = false;
  state.u = Math.min(6, state.u);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (still.matches) return;
    state.playing = true;
    if (state.u >= 6) state.u = 0;
    run();
  }, 9000);
  run();
}
function goTo(step) {
  state.target = clamp(step, 0, 6);
  if (status) status.textContent = PHASES[Math.round(state.target)];
  takeOver();
}
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("keydown", (event) => {
  const here = state.playing ? Math.min(6, state.u) : state.target;
  if (event.key === "ArrowRight") goTo(Math.floor(here + 1e-6) + 1);
  else if (event.key === "ArrowLeft") goTo(Math.ceil(here - 1e-6) - 1);
  else if (event.key === "Home") goTo(0);
  else if (event.key === "End") goTo(6);
  else if (event.key === " ") {
    state.playing = !state.playing;
    if (state.playing && state.u >= 6) state.u = 0;
    clearTimeout(idleTimer);
    run();
  } else return;
  event.preventDefault();
});
buttons.forEach((b) => b.addEventListener("click", () => goTo(Number(b.dataset.step))));
let drag = null;
stage.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, u: Math.min(6, state.u), id: event.pointerId, captured: false };
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
  state.target = clamp(drag.u + (dx / box.width) * 7, 0, 6);
  state.u = state.target;
  takeOver();
});
const release = (event) => {
  if (drag && drag.captured) stage.releasePointerCapture(event.pointerId);
  drag = null;
};
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("focus", () => {
  if (status) status.textContent = PHASES[phaseOf(state.u)];
});
if (still.matches) {
  state.playing = false;
  state.u = state.target = 6;
  state.q = 1;
}
draw();
