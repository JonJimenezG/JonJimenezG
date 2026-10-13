import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SKILL = "/root/.claude/skills/anatomy";
const k = await import(`${SKILL}/kit/iso-kit.mjs`);
const G = await import(`${SKILL}/kit/lathe.mjs`);
const { tubePieces, tubeSvg } = await import(`${SKILL}/kit/tube.mjs`);
const A = await import(`${SKILL}/kit/audit.mjs`);
const { kitScript } = await import(`${SKILL}/scripts/inline-kit.mjs`);
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 640;
const H = 400;

// ---- mundo: 1 unidad ≈ 1 cm; x a lo ancho del carro, y hacia delante, z arriba
const PLATE = { x: -236, y: -146, w: 472, d: 244, r: 10 };
const PLATE_H = 10;
const FOOT_H = 5;
const Z0 = 60; // plano de junta del cárter y altura de los ejes
const YA = -5; // eje principal (gama y trenes sumadores)
const YZ = -34; // eje cero (dirección)
const HS = [-45, 92]; // eje de la unidad hidrostática (y, z)
const IDL = [-19.5, 82]; // rueda loca del lado izquierdo (y, z)
const CASE = { x0: -150, x1: 150, y0: -55, y1: 45, zf: 8, zw: 16 };
const TRACK = { x0: 176, x1: 212, ri: 30, ro: 36, idlerY: -90 };
const IZ = 44; // altura del eje de entrada
const SUN_R = (YA - YZ) / 2; // engrane directo planetario-eje cero, 1:1

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, HS[0], HS[1] + 32], [-TRACK.x1, -5, Z0 + 40], [TRACK.x1, -5, Z0 + 40], [-TRACK.x1, TRACK.idlerY, Z0 + 40], [TRACK.x1, TRACK.idlerY, Z0 + 40]],
  W,
  H,
  { pad: 26, azimuth: 58, elevation: 33 },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);

const R = A.recorder(P);
const record = R.solid;
const put = (name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) => R.put({ name, at: ref, bias, svg, shapes, piece: "box", ...rest });

const FX = (y, z) => G.frameOf([0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]); // s = x
const FY = (x, z) => G.frameOf([x, 0, z], [0, 1, 0], [0, 0, 1], [1, 0, 0]); // s = y
const MAIN = FX(YA, Z0);
const ZERO = FX(YZ, Z0);
const HSF = FX(HS[0], HS[1]);
const IDF = FX(IDL[0], IDL[1]);

// ---- piezas que giran: el script de la página las redibuja cada fotograma
const SPINS = [];
const spin = (id, def) => {
  SPINS.push({ id, ...def });
  return `<g data-spin="${id}"></g>`;
};
const LIT = {}; // elementos de la gama -> nombres de items
const SPANS = { main: [], zero: [] };

function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.6, steps = 3, bevel = 0, extra = "", inner = "", bias = 0, owner, ground } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name, owner, ground }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, owner, smooth, bevel = 0, ref, rims } = {}) {
  const opts = { bevel, ...(smooth !== undefined ? { smooth } : {}), ...(rims ? { rims } : {}) };
  const paths = G.solidOf(profile, F, P, opts);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name, owner, radius: smooth && smooth.radius ? smooth.radius : null }));
  if (F === MAIN || F.o[1] === YA && F.o[2] === Z0 && F.a[0] === 1) SPANS.main.push([profile[0][0], profile[profile.length - 1][0]]);
  if (F === ZERO) SPANS.zero.push([profile[0][0], profile[profile.length - 1][0]]);
  put(name, ref ?? G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
const disc = (name, F, s0, s1, r, style = {}, options = {}) => turned(name, F, [[s0, r], [s1, r]], style, options);
function ringPart(name, F, s0, s1, rIn, rOut, style = {}, { extra = "", inner = "", bias = 0, owner } = {}) {
  const shape = record(A.ring(F, s0, s1, rIn, rOut, { name, owner }));
  put(name, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(G.ringBand(s0, s1, rIn, rOut, F, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function prism(name, F, poly, s0, s1, style = {}, { extra = "", inner = "", bias = 0, owner, ref } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, { name, owner }));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const centre = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(name, ref ?? centre, S(G.prismOf(F, poly, s0, s1, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
const seam = (F, s, r) => Ln(G.arcOf(F, s, r, P), { tone: "faint" });

// engranaje sobre un eje x: cuerpo, dientes que giran y cubo
const pitch = 3.1;
function gear(name, F, s0, s1, r, src, mult, { owner, hub = 0.45, tone = "mid", bias = 0 } = {}) {
  const n = Math.max(12, Math.round((2 * Math.PI * r) / pitch));
  const face = s1;
  const extra = Ln(G.circleOf(F, face, r * hub, P), { tone: "faint" }) + spin(`${name}.bolts`, { kind: "dots", F, s: face, r: r * (hub + 1) / 2, n: 6, src, k: mult, all: true });
  return disc(name, F, s0, s1, r, { tone }, { extra, owner, bias, inner: spin(name, { kind: "ribs", F, s0, s1, r, n, src, k: mult, tone: "lo" }) });
}

// =========================================================== banco
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
  back.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
back.push(Ln(k.planOutline(k.insetPlan(PLATE, 6), 0, P), { tone: "lo" }));
const plateScrews = k.corners(PLATE, 11);
back.push(Ln(plateScrews.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(plateScrews.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
// regla en el borde delantero
const STRIP = { x: PLATE.x + 160, y: PLATE.y + PLATE.d - 13, w: PLATE.w - 176, d: 6, r: 1 };
back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
const ticks = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 5, 5, STRIP.y, 0.6, [1.8, 3.4], P);
back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
back.push(Dots([at([STRIP.x + 2, STRIP.y + 3, 0.6]), at([STRIP.x + STRIP.w - 2, STRIP.y + 3, 0.6])], { size: 0.45 }));
// placa de características
const LABEL = { x: PLATE.x + 18, y: PLATE.y + PLATE.d - 34, w: 46, d: 20, r: 1.2 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.8), 0.8, P, 4), { tone: "faint" }));
back.push(Ln([[6, 34], [6, 26], [6, 30]].map(([x0, w], i) => k.lineOnTop([LABEL.x + x0, LABEL.y + 6 + i * 4], [LABEL.x + x0 + w, LABEL.y + 6 + i * 4], 0.8, P)).join(""), { tone: "lo", free: true }));
back.push(Dots([at([LABEL.x + 3, LABEL.y + LABEL.d / 2, 0.8]), at([LABEL.x + LABEL.w - 3, LABEL.y + LABEL.d / 2, 0.8])], { size: 0.45 }));

// =========================================================== cárter inferior (el superior está quitado)
const { x0: CX0, x1: CX1, y0: CY0, y1: CY1, zf: ZF, zw: ZW } = CASE;
for (const [x, y] of [[CX0 + 18, CY0 + 14], [CX1 - 18, CY0 + 14], [CX0 + 18, CY1 - 14], [CX1 - 18, CY1 - 14]]) {
  turned(`case.foot.${x}.${y}`, G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]), [[0, 9], [1.6, 9], [1.6, 7], [ZF, 7]], { tone: "lo" }, { owner: "case", extra: Dots([at([x, y + 4.5, 1.6])], { size: 0.45 }) });
}
box("case.sump", [CX0, CY0, ZF], [CX1, CY1, ZW], { tone: "mid" }, { r: 4, steps: 4, bevel: 0.8, owner: "case", inner: Ln(k.sideSeam({ x: CX0, y: CY0, w: CX1 - CX0, d: CY1 - CY0, r: 4 }, 12, P, 4), { tone: "faint" }) });
box("case.wall.back", [CX0, CY0, ZW], [CX1, CY0 + 6, Z0], { tone: "mid" }, { owner: "case", bevel: 0.5 });
box("case.wall.left", [CX0, CY0 + 6, ZW], [CX0 + 8, CY1 - 6, Z0], { tone: "mid" }, { owner: "case", bevel: 0.5 });
box("case.wall.right", [CX1 - 8, CY0 + 6, ZW], [CX1, CY1 - 6, Z0], { tone: "mid" }, { owner: "case", bevel: 0.5 });
for (const [side, x] of [["left", -102], ["right", 96]]) {
  box(`case.web.${side}`, [x, -20, ZW], [x + 4, CY1 - 6, Z0 - 6], { tone: "lo" }, { owner: "case" });
  box(`case.web.${side}.rib`, [x, CY0 + 6, ZW], [x + 4, -20, 36], { tone: "lo" }, { owner: "case" });
}
// pared delantera con la brida de la junta, tornillos y mirilla de aceite
{
  const plan = { x: CX0, y: CY1 - 6, w: CX1 - CX0, d: 6, r: 0.6 };
  const flange = { x: CX0 - 3, y: CY1 - 6, w: CX1 - CX0 + 6, d: 9, r: 1.2 };
  const bolts = Array.from({ length: 13 }, (_, i) => CX0 + 6 + i * 24.0);
  box("case.wall.front", [CX0, CY1 - 6, ZW], [CX1, CY1, Z0 - 6], { tone: "mid" }, { owner: "case", bevel: 0.5 });
  box("case.flange.front", [flange.x, flange.y, Z0 - 6], [flange.x + flange.w, flange.y + flange.d, Z0], { tone: "mid" }, { owner: "case", r: 1.2, bevel: 0.6, extra: Dots(bolts.map((x) => at([x, CY1 - 0.5, Z0])), { size: 0.55, tone: "mid" }) + Ln(bolts.map((x) => k.ring(x, CY1 - 0.5, 1.7, Z0, P, 14)).join(""), { tone: "lo" }) });
  void plan;
  const SG = G.frameOf([60, CY1, 30], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  disc("case.sightglass", SG, 0, 1.6, 6, { tone: "mid" }, { owner: "case", extra: Ln(G.circleOf(SG, 1.6, 4.2, P), { tone: "lo" }) + Ln(k.pathOf([at([56.5, CY1 + 1.6, 30]), at([63.5, CY1 + 1.6, 30])]), { tone: "faint" }) });
  const DR = G.frameOf([-20, CY1, 22], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  turned("case.drain", DR, [[0, 4.2], [1.4, 4.2], [1.4, 3], [3.4, 3]], { tone: "mid" }, { owner: "case" });
}
for (const x of [-140, -30, 20, 100, 140]) box(`case.rib.${x}`, [x - 1.6, CY1, ZW], [x + 1.6, CY1 + 3, Z0 - 6], { tone: "mid" }, { owner: "case", r: 0.4, bevel: 0.3 });
box("case.flange.back", [CX0 - 3, CY0 - 3, Z0 - 6], [CX1 + 3, CY0 + 6, Z0], { tone: "mid" }, { owner: "case", r: 1.2, bevel: 0.6, extra: Dots(Array.from({ length: 13 }, (_, i) => at([CX0 + 6 + i * 24, CY0 - 1, Z0])), { size: 0.5, tone: "mid" }) });
// cáncamos de elevación en las paredes de los extremos
for (const x of [CX0 + 4, CX1 - 4]) {
  const F = G.frameOf([x, 20, Z0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  prism(`case.eye.${x}`, F, [[-5, 0], [5, 0], [3, 7], [-3, 7]], -2.5, 2.5, { tone: "mid" }, { owner: "case", extra: Ln(G.circleOf(F, x > 0 ? 2.5 : -2.5, 2, P), { tone: "lo" }) });
}

// rodamientos en las paredes y almas
const bearing = (name, F, s0, s1, r, rb) => disc(name, F, s0, s1, rb, { tone: "lo" }, { owner: "case", extra: Ln(G.circleOf(F, s1, r + 0.6, P), { tone: "faint" }) + Dots(G.dotsOf(F, s1, (r + rb) / 2 + 0.6, 10, P, { all: true }), { size: 0.4, tone: "lo" }) });
// tapas de rodamiento por fuera de las paredes de los extremos
const cap = (name, F, s0, s1, r, rb, outFace) => disc(name, F, s0, s1, rb, { tone: "lo" }, { owner: "case", extra: Ln(G.circleOf(F, outFace, r + 0.6, P), { tone: "faint" }) + Dots(G.dotsOf(F, outFace, (r + rb) / 2 + 0.6, 8, P, { all: true }), { size: 0.4, tone: "lo" }) });
cap("brg.main.left", MAIN, CX0 - 4, CX0, 6, 13, CX0 - 4);
cap("brg.main.right", MAIN, CX1, CX1 + 4, 6, 13, CX1 + 4);
cap("brg.zero.left", ZERO, CX0 - 3, CX0, 3.5, 8, CX0 - 3);
cap("brg.zero.right", ZERO, CX1, CX1 + 3, 3.5, 8, CX1 + 3);

// =========================================================== eje principal

// trenes sumadores (corona = salida de la gama, planetario = dirección, portasatélites = salida)
function summing(side, s0, s1, sunGear) {
  const sign = side === "L" ? -1 : 1;
  const name = `sum.${side}`;
  const teeth = spin(`${name}.ring`, { kind: "ribs", F: MAIN, s0: s0 + 3, s1: s1 - 3, r: 25, n: 44, src: "r", k: 1, tone: "lo" });
  const extra =
    spin(`${name}.lugs`, { kind: "dots", F: MAIN, s: side === "L" ? s1 : s0, r: 22.5, n: 8, src: "r", k: 1, all: true });
  turned(name, MAIN, [[s0, 22], [s0, 23], [s0 + 3, 23], [s0 + 3, 25], [s1 - 3, 25], [s1 - 3, 23], [s1, 23], [s1, 22]], { tone: "hi" }, { owner: "main", extra, inner: teeth + seam(MAIN, s0 + 3, 25) + seam(MAIN, s1 - 3, 25) });
  // portasatélites que sale hacia la pared
  const cs0 = side === "L" ? s0 - 4 : s1;
  const cs1 = side === "L" ? s0 : s1 + 4;
  SPANS.main.push([s0, s1], [cs0, cs1], [sunGear[0], sunGear[1]]);
  disc(`${name}.carrier`, MAIN, cs0, cs1, 17, { tone: "mid" }, { owner: "main", extra: spin(`${name}.carrier.pins`, { kind: "dots", F: MAIN, s: cs1, r: 12, n: 3, src: side === "L" ? "cL" : "cR", k: 1, all: true, size: 0.9, tone: "hi" }) });
  gear(`${name}.sungear`, MAIN, sunGear[0], sunGear[1], sunGear[2], side === "L" ? "sL" : "sR", 1, { owner: "main", tone: "hi" });
  void sign;
}
summing("L", -138, -114, [-111, -103, 14]);
summing("R", 114, 138, [103, 111, SUN_R]);
disc("sum.L.sunshaft", MAIN, -114, -111, 7.5, { tone: "mid" }, { owner: "main" });
disc("sum.R.sunshaft", MAIN, 111, 114, 7.5, { tone: "mid" }, { owner: "main" });

// paquetes de embrague (K, giran) y freno (B, anclados al cárter)
function pack(id, s0, s1, r, brake) {
  const name = `pack.${id}`;
  const plates = Array.from({ length: Math.round((s1 - s0 - 4) / 1.6) }, (_, i) => s0 + 3 + i * 1.6).filter((s) => s < s1 - 2);
  const inner = Ln(plates.map((s) => G.arcOf(MAIN, s, r, P)).join(""), { tone: "lo" });
  const extra = brake ? "" : spin(`${name}.lugs`, { kind: "dots", F: MAIN, s: s0 + 1.2, r, n: 18, src: "e", k: 1, fade: [0.05, 0.4], size: 0.55, tone: "mid" });
  disc(name, MAIN, s0, s1, r, { tone: "mid" }, { owner: "main", inner, extra, bias: 0.05 });
  // pistón: anillo que avanza 1,5 al aplicar
  const piston = `${name}.piston`;
  const pshape = record(A.ring(MAIN, s1, s1 + 2.2, 5.5, r - 2, { name: piston, owner: "main" }));
  SPANS.main.push([s1, s1 + 2.2]);
  put(piston, G.add3(MAIN.o, G.mul3(MAIN.a, s1 + 1.1)), `<g data-piston="${id}">${S(G.ringBand(s1, s1 + 2.2, 5.5, r - 2, MAIN, P), { tone: "hi" })}</g>`, [pshape], { bias: 0.1 });
  LIT[id] = [...(LIT[id] ?? []), name, piston];
  if (brake) {
    // pata de anclaje al fondo del cárter
    box(`${name}.anchor`, [s0 + 2, YA - 4, ZW], [s1 - 2, YA + 4, Z0 - r + 0.2], { tone: "lo" }, { owner: "main" });
  }
}
// gama: frenos a la izquierda del convertidor, embragues a la derecha
pack("B3", -94, -82, 24, true);
disc("range.P1", MAIN, -79, -69, 25, { tone: "mid" }, { owner: "main", inner: spin("range.P1.teeth", { kind: "ribs", F: MAIN, s0: -79, s1: -69, r: 25, n: 50, src: "r", k: 0.6, tone: "lo" }) });
pack("B2", -68, -56, 24, true);
disc("range.P2", MAIN, -53, -43, 25, { tone: "mid" }, { owner: "main", inner: spin("range.P2.teeth", { kind: "ribs", F: MAIN, s0: -53, s1: -43, r: 25, n: 50, src: "r", k: 0.8, tone: "lo" }) });
pack("B1", -42, -30, 24, true);
// convertidor de par
{
  const half = 18;
  const rad = (s) => 9 + 15 * Math.sqrt(Math.max(0, 1 - (s / 19) ** 2));
  const slope = (s) => (-15 * (s / 361)) / Math.sqrt(Math.max(1e-6, 1 - (s / 19) ** 2));
  const prof = Array.from({ length: 25 }, (_, i) => {
    const s = -half + (i / 24) * 2 * half;
    return [s, rad(s), 1];
  });
  const F = G.frameOf([0, YA, Z0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const profile = [[-half, 9], ...prof, [half, 9]];
  const extra = spin("conv.bolts", { kind: "dots", F, s: half, r: 13.5, n: 12, src: "e", k: 1, all: true, size: 0.55, tone: "mid" }) + spin("conv.weld", { kind: "dots", F, s: 0, r: 24, n: 20, src: "e", k: 1, fade: [0.05, 0.45], size: 0.45, tone: "lo" });
  turned("conv", F, profile, { tone: "mid" }, { owner: "main", extra, smooth: { slope, radius: rad }, inner: Ln(G.arcOf(F, 0, 24, P), { tone: "faint" }) });
  disc("conv.hubL", MAIN, -27, -18, 9, { tone: "mid" }, { owner: "main" });
}
gear("pump.drive", MAIN, 22, 30, 24, "e", 1, { owner: "main", tone: "mid" });
disc("conv.hubR", MAIN, 18, 22, 9, { tone: "mid" }, { owner: "main" });
pack("K1", 34, 46, 24, false);
disc("range.P3", MAIN, 50, 60, 25, { tone: "mid" }, { owner: "main", inner: spin("range.P3.teeth", { kind: "ribs", F: MAIN, s0: 50, s1: 60, r: 25, n: 50, src: "r", k: 1, tone: "lo" }) });
pack("K2", 62, 74, 24, false);
pack("KR", 78, 90, 24, false);

// =========================================================== eje cero y su tren

gear("zero.gear.L", ZERO, -111, -103, 14, "z", 1, { owner: "zero", tone: "hi" });
gear("zero.gear.R", ZERO, 103, 111, SUN_R, "z", 1, { owner: "zero", tone: "hi" });
// rueda loca izquierda sobre un soporte atornillado a la pared trasera
{
  const idR = Math.hypot(IDL[0] - YA, IDL[1] - Z0) - 14;
  gear("idler.L", IDF, -111, -103, idR, "z", -14 / idR, { owner: "idler", tone: "hi" });
  disc("idler.L.pin", IDF, -113, -111, 4, { tone: "mid" }, { owner: "idler" });
  box("idler.L.leg", [-113.6, CY0, Z0], [-111, CY0 + 6, IDL[1] + 6], { tone: "mid" }, { owner: "idler", bevel: 0.3, extra: Dots([at([-111, CY0 + 3, Z0 + 4])], { size: 0.45 }) });
  box("idler.L.arm", [-113.6, CY0 + 6, IDL[1] - 6], [-113, IDL[0] + 6, IDL[1] + 6], { tone: "mid" }, { owner: "idler", bevel: 0.3 });
}

// =========================================================== unidad hidrostática (bomba variable + motor)
for (const x of [44, 84]) box(`hs.pillar.${x}`, [x, CY0 - 1, Z0], [x + 6, HS[0] + 1, HS[1] - 13], { tone: "lo" }, { owner: "hs", bevel: 0.4, extra: Dots([at([x + 3, CY0 + 2, HS[1] - 13])], { size: 0.45 }) });
const HM_R = Math.hypot(HS[0] - YZ, HS[1] - Z0) - SUN_R;
gear("hs.pump.gear", HSF, 22, 30, Math.hypot(HS[0] - YA, HS[1] - Z0) - 24, "hp", 1, { owner: "hs", tone: "mid" });
disc("hs.pump.neck", HSF, 30, 34, 6, { tone: "mid" }, { owner: "hs" });
turned("hs.pump", HSF, [[34, 10], [36, 13], [62, 13], [64, 10]], { tone: "mid" }, { owner: "hs", extra: Faded(G.ribsOf(HSF, 40, 58, 13, 30, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
box("hs.portblock", [64, HS[0] - 12, HS[1] - 11], [76, HS[0] + 12, HS[1] + 12], { tone: "mid" }, { owner: "hs", bevel: 0.5, extra: Dots([[67, HS[0] + 9], [73, HS[0] + 9], [67, HS[0] - 9], [73, HS[0] - 9]].map(([x, y]) => at([x, y, HS[1] + 12])), { size: 0.45 }) });
turned("hs.motor", HSF, [[76, 10], [78, 12], [98, 12], [100, 10]], { tone: "mid" }, { owner: "hs", extra: Faded(G.ribsOf(HSF, 82, 94, 12, 28, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
disc("hs.motor.neck", HSF, 100, 103, 6, { tone: "mid" }, { owner: "hs" });
gear("hs.motor.gear", HSF, 103, 111, HM_R, "hm", 1, { owner: "hs" });
// cuadrante de la palanca de la placa basculante, sobre la bomba
{
  const QY = HS[0];
  const QZ = HS[1] + 13;
  box("hs.quadrant.base", [41, QY - 3, QZ - 0.4], [57, QY + 3, QZ + 1.4], { tone: "mid" }, { owner: "hs", bevel: 0.3 });
  const QF = G.frameOf([49, QY + 3, QZ + 1.4], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  prism("hs.quadrant", G.frameOf([49, QY - 1.2, QZ + 1.4], [0, 1, 0], [1, 0, 0], [0, 0, 1]), Array.from({ length: 9 }, (_, i) => {
    const t = Math.PI * (0.25 + (i / 8) * 0.5);
    return [Math.cos(t) * 16 * (i === 0 || i === 8 ? 1 : 1), Math.sin(t) * 16];
  }).concat([[0, 0]]), 0, 2.4, { tone: "mid" }, { owner: "hs" });
  const QT = Array.from({ length: 9 }, (_, i) => {
    const t = Math.PI * (0.25 + (i / 8) * 0.5);
    const a = [49 + Math.cos(t) * 15.6, QY + 1.2, QZ + 1.4 + Math.sin(t) * 15.6];
    const b = [49 + Math.cos(t) * (i % 4 === 0 ? 12.4 : 13.8), QY + 1.2, QZ + 1.4 + Math.sin(t) * (i % 4 === 0 ? 12.4 : 13.8)];
    return k.pathOf([at(a), at(b)]);
  });
  put("hs.quadrant.ticks", [49, QY + 1.3, QZ + 14], Ln(QT.join(""), { tone: "lo" }), [record(A.box([41, QY + 1.2, QZ + 12], [57, QY + 1.3, QZ + 17], { name: "hs.quadrant.ticks", owner: "hs" }))], { bias: 0.2 });
  void QF;
}

// =========================================================== entrada del motor (desde delante)
{
  const IF = FY(0, IZ);
  box("input.bevelcase", [-10, 28, IZ - 12], [10, CY1 - 6, IZ + 12], { tone: "mid" }, { owner: "input", bevel: 0.4 });
  disc("input.boss", IF, CY1, CY1 + 4, 9, { tone: "mid" }, { owner: "input", extra: Dots(G.dotsOf(IF, CY1 + 4, 7, 6, P, { all: true }), { size: 0.45 }) });
  for (const [a, b] of [[CY1 + 4, 52], [56, 64], [74, 76]]) disc(`input.shaft.${a}`, IF, a, b, 3.6, { tone: "mid" }, { owner: "input" });
  disc("input.flange", IF, 52, 56, 12, { tone: "mid" }, { owner: "input", extra: spin("input.flange.bolts", { kind: "dots", F: IF, s: 56, r: 9, n: 6, src: "e", k: 1, all: true, size: 0.6, tone: "hi" }), inner: spin("input.flange.ribs", { kind: "ribs", F: IF, s0: 52, s1: 56, r: 12, n: 24, src: "e", k: 1, tone: "lo" }) });
  // soporte de rodamiento (chumacera) y brida al motor fuera de cuadro
  box("input.pillow.base", [-14, 64, 0], [14, 74, 6], { tone: "lo" }, { owner: "input", bevel: 0.4, extra: Dots([at([-10, 69, 6]), at([10, 69, 6])], { size: 0.5 }) });
  box("input.pillow", [-7, 64, 6], [7, 74, IZ - 6], { tone: "mid" }, { owner: "input", bevel: 0.4 });
  disc("input.pillow.cap", IF, 64, 74, 8, { tone: "mid" }, { owner: "input", inner: seam(IF, 69, 8) });
  disc("input.end", IF, 76, 80, 12, { tone: "mid" }, { owner: "input", extra: spin("input.end.bolts", { kind: "dots", F: IF, s: 80, r: 9, n: 6, src: "e", k: 1, all: true, size: 0.6, tone: "hi" }), inner: spin("input.end.ribs", { kind: "ribs", F: IF, s0: 76, s1: 80, r: 12, n: 24, src: "e", k: 1, tone: "lo" }) });
}

// =========================================================== bloque de válvulas y selector de marchas
const SEL = { x0: -128, x1: -40, y0: CY1 + 3, y1: CY1 + 16, z0: 20, z1: 50 };
const GATE_X = (i) => -118 + i * 11.5;
{
  box("valve.body", [SEL.x0, CY1, SEL.z0], [SEL.x1, SEL.y1, SEL.z1], { tone: "mid" }, { owner: "valve", bevel: 0.6, r: 1.4, inner: Ln(k.sideSeam({ x: SEL.x0, y: CY1, w: SEL.x1 - SEL.x0, d: SEL.y1 - CY1, r: 1.4 }, 30, P, 3), { tone: "faint" }), extra: Dots([SEL.x0 + 4, SEL.x1 - 4].flatMap((x) => [at([x, SEL.y1, 24]), at([x, SEL.y1, 46])]), { size: 0.5 }) });
  M.ELEMENTS.forEach((id, i) => {
    const x = SEL.x0 + 12 + i * 12.8;
    const F = G.frameOf([x, SEL.y1, 31], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    const name = `valve.sol.${id}`;
    turned(name, F, [[0, 4.2], [1.2, 4.2], [1.2, 3.4], [6, 3.4], [6, 2.4], [7.4, 2.4]], { tone: "mid" }, { owner: "valve", bevel: 0.2, extra: Dots([at([x, SEL.y1 + 7.4, 31])], { size: 0.5, tone: "lo" }) });
    LIT[id] = [...(LIT[id] ?? []), name];
  });
  for (const x of [SEL.x0 + 14, SEL.x1 - 14]) box(`valve.lug.${x}`, [x - 3, CY1 - 0.01, 50], [x + 3, CY1 + 4, 54], { tone: "lo" }, { owner: "valve" });
  const gate = { x: GATE_X(0) - 7, y: SEL.y0, w: GATE_X(6) - GATE_X(0) + 14, d: 10, r: 2 };
  box("valve.gate", [gate.x, gate.y, SEL.z1], [gate.x + gate.w, gate.y + gate.d, SEL.z1 + 2], { tone: "lo" }, { owner: "valve", r: 2, extra: Ln(k.planOutline({ x: GATE_X(0) - 1.6, y: gate.y + 3.4, w: GATE_X(6) - GATE_X(0) + 3.2, d: 3.2, r: 1.6 }, SEL.z1 + 2, P, 3), { tone: "mid" }) + Ln(Array.from({ length: 7 }, (_, i) => k.lineOnTop([GATE_X(i), gate.y + 6.6], [GATE_X(i), gate.y + 9], SEL.z1 + 2, P)).join(""), { tone: "lo" }) });
}
// palanca del selector: se dibuja en la posición 0 y se traslada en x
const LEVER_REST = GATE_X(0);
const leverSvg = (() => {
  const F = G.frameOf([LEVER_REST, SEL.y0 + 5, SEL.z1 + 2], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  return S(G.disc(-1, 20, 1.3, F, P, { steps: 18 }), { tone: "hi", crease: "none" }) + S(G.sphereOf([LEVER_REST, SEL.y0 + 5, SEL.z1 + 24], 3.4, P, { steps: 32 }), { tone: "hi" });
})();

// =========================================================== salidas, reducciones finales, ruedas motrices y orugas
function track(side) {
  const sx = side === "L" ? -1 : 1;
  const name = `track.${side}`;
  const flange = side === "L" ? [CX0 - 14, CX0 - 4] : [CX1 + 4, CX1 + 14];
  const fd = side === "L" ? [-TRACK.x0, CX0 - 14] : [CX1 + 14, TRACK.x0];
  const tr = side === "L" ? [-TRACK.x1, -TRACK.x0] : [TRACK.x0, TRACK.x1];
  const outFace = side === "L" ? tr[0] : tr[1];
  const inFace = side === "L" ? tr[1] : tr[0];
  const visFace = side === "L" ? inFace : outFace; // la que mira a +x
  disc(`out.${side}.flange`, MAIN, flange[0], flange[1], 15, { tone: "hi" }, { owner: name, extra: spin(`out.${side}.bolts`, { kind: "dots", F: MAIN, s: Math.max(...flange), r: 11, n: 8, src: `c${side}`, k: 1, all: true, size: 0.6, tone: "hi" }) });
  turned(`fd.${side}`, MAIN, side === "L" ? [[fd[0], 16], [fd[0] + 3, 21], [fd[1] - 2, 21], [fd[1], 18]] : [[fd[0], 18], [fd[0] + 2, 21], [fd[1] - 3, 21], [fd[1], 16]], { tone: "mid" }, { owner: name, inner: seam(MAIN, (fd[0] + fd[1]) / 2, 21), extra: Dots(G.dotsOf(MAIN, side === "L" ? fd[0] + 3 : fd[1] - 3, 19, 10, P, { all: true }), { size: 0.45 }) });
  // soporte de la reducción final al banco
  box(`fd.${side}.stand`, [Math.min(...fd) + 3, YA - 9, 0], [Math.max(...fd) - 3, YA + 9, Z0 - 21 + 0.2], { tone: "lo" }, { owner: name, bevel: 0.4, ground: true, extra: Dots([at([(fd[0] + fd[1]) / 2, YA + 9, 4])], { size: 0.5 }) });
  // banda de la oruga (estadio en y-z, a lo largo de x)
  const TF = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const stad = (r, n = 24) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = -Math.PI / 2 + (i / n) * Math.PI;
      pts.push([YA + Math.cos(t) * r, Z0 + Math.sin(t) * r]);
    }
    for (let i = 0; i <= n; i++) {
      const t = Math.PI / 2 + (i / n) * Math.PI;
      pts.push([TRACK.idlerY + Math.cos(t) * r, Z0 + Math.sin(t) * r]);
    }
    return pts;
  };
  const outer = stad(TRACK.ro);
  const innerPoly = stad(TRACK.ri, 28);
  const holeD = path3(innerPoly.map(([y, z]) => [visFace, y, z]), true);
  const beltShape = record(A.prism(TF, outer, tr[0], tr[1], { name, owner: name }));
  const belt = S(G.prismOf(TF, outer, tr[0], tr[1], P), { tone: "mid" });
  const cavity = `<path class="cd-cavity" d="${holeD}"/><path class="iso-line" data-tone="lo" d="${holeD}"/>`;
  // ruedas dentro del lazo, enrasadas con la cara visible
  const wheelS = side === "L" ? [visFace - 30, visFace] : [visFace - 30, visFace];
  const SPF = FX(YA, Z0);
  const IDLF = FX(TRACK.idlerY, Z0);
  // de las ruedas sólo se ve la cara enrasada con el canto de la oruga
  const faceS = side === "L" ? [visFace, visFace + 0.6] : [visFace - 0.6, visFace];
  const sprocket = S(G.disc(faceS[0], faceS[1], TRACK.ri - 0.3, SPF, P), { tone: "hi" });
  const idler = S(G.disc(faceS[0], faceS[1], TRACK.ri - 0.3, IDLF, P), { tone: "mid" });
  const hubS = [visFace, visFace + 4];
  const hubs = side === "R";
  const sprHub = hubs ? S(G.disc(hubS[0], hubS[1], 13, SPF, P, { bevel: 0.4 }), { tone: "hi" }) : "";
  const idlHub = S(G.disc(hubs ? hubS[0] : hubS[0] - 4, hubs ? hubS[1] : hubS[0], 10, IDLF, P, { bevel: 0.4 }), { tone: "mid" });
  const loop = { y0: TRACK.idlerY, y1: YA, z: Z0, r: (TRACK.ri + TRACK.ro) / 2, ro: TRACK.ro, x0: tr[0], x1: tr[1], face: visFace };
  const svg =
    belt +
    cavity +
    sprocket +
    idler +
    spin(`${name}.sprocket.holes`, { kind: "holes", F: SPF, s: visFace, r: 21, rr: 4.2, n: 6, src: `sp${side}`, k: 1 }) +
    spin(`${name}.sprocket.teeth`, { kind: "spokes", F: SPF, s: visFace, r0: 27.2, r1: TRACK.ri, n: 13, src: `sp${side}`, k: 1 }) +
    spin(`${name}.idler.holes`, { kind: "holes", F: IDLF, s: visFace, r: 20, rr: 4.2, n: 5, src: `sp${side}`, k: 1 }) +
    sprHub +
    (hubs ? spin(`${name}.hub.bolts`, { kind: "dots", F: SPF, s: hubS[1], r: 9.5, n: 10, src: `sp${side}`, k: 1, all: true, size: 0.55, tone: "hi" }) : "") +
    idlHub +
    (hubs ? Dots([at([hubS[1], TRACK.idlerY, Z0])], { size: 1.2, tone: "mid" }) : "") +
    `<g data-track="${side}"></g>`;
  const sprShape = record(A.disc(SPF, wheelS[0], hubs ? hubS[1] : wheelS[1], TRACK.ri, { name: `${name}.sprocket`, owner: name }));
  const idlShape = record(A.disc(IDLF, wheelS[0], hubs ? hubS[1] : wheelS[1], TRACK.ri, { name: `${name}.idler`, owner: name }));
  put(name, [(tr[0] + tr[1]) / 2, (YA + TRACK.idlerY) / 2, Z0], svg, [beltShape, sprShape, idlShape]);
  // rodillos del banco bajo el ramal inferior
  for (const y of [-25, -70]) {
    const RF = FX(y, 16);
    const cshape = record(A.slab({ x: tr[0] + 2, y: y - 8, w: tr[1] - tr[0] - 4, d: 16, r: 1 }, 0, 8, { name: `${name}.cradle.${y}`, owner: name, ground: true }));
    put(`${name}.cradle.${y}`, [(tr[0] + tr[1]) / 2, y, 4], S(k.slabOf({ x: tr[0] + 2, y: y - 8, w: tr[1] - tr[0] - 4, d: 16, r: 1 }, 0, 8, P, 3, 0.4), { tone: "lo" }), [cshape]);
    disc(`${name}.roller.${y}`, RF, tr[0] + 1, tr[1] - 1, 8, { tone: "mid" }, { owner: name, inner: spin(`${name}.roller.${y}.ribs`, { kind: "ribs", F: RF, s0: tr[0] + 1, s1: tr[1] - 1, r: 8, n: 16, src: `sp${side}`, k: -TRACK.ro / 8, tone: "lo" }) });
  }
  // soporte del eje de la rueda tensora por fuera
  const post = side === "L" ? [-TRACK.x1 - 8, -TRACK.x1] : [TRACK.x1 + 4, TRACK.x1 + 12];
  box(`${name}.post`, [post[0], TRACK.idlerY - 6, 0], [post[1], TRACK.idlerY + 6, Z0 + 6], { tone: "lo" }, { owner: name, ground: true, bevel: 0.4, extra: Dots([at([(post[0] + post[1]) / 2, TRACK.idlerY + 6, Z0 + 2])], { size: 0.5 }) });
  return loop;
}
const LOOPS = { L: track("L"), R: track("R") };

// tramos de eje visibles entre piezas
function shaftFill(key, F, from, to, r, owner) {
  let index = 0;
  const piece = (a, b) => {
    const n = Math.max(1, Math.ceil((b - a) / 26));
    for (let i = 0; i < n; i++) disc(`${key}.shaft.${index++}`, F, a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n, r, { tone: "mid", crease: "none" }, { owner, rims: n === 1 ? "all" : i === 0 ? "first" : i === n - 1 ? "last" : "none" });
  };
  const spans = SPANS[key].map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((p, q) => p[0] - q[0]);
  let x = from;
  for (const [a, b] of spans) {
    if (b <= x) continue;
    if (a > x + 0.05 && a <= to) piece(x, Math.min(a, to));
    x = Math.max(x, b);
    if (x >= to) break;
  }
  if (x < to - 0.05) piece(x, to);
}
SPANS.main.push([CX0, CX0 + 8], [CX1 - 8, CX1]);
SPANS.zero.push([CX0, CX0 + 8], [CX1 - 8, CX1]);
shaftFill("main", MAIN, CX0 - 14, CX1 + 14, 5.5, "main");
shaftFill("zero", ZERO, CX0, CX1, 3.5, "zero");

// =========================================================== orden y página
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const leverIndex = R.items.findIndex((item) => item.name === "valve.gate");
const quadIndex = R.items.findIndex((item) => item.name === "hs.quadrant.ticks");
const slots = new Map();
slots.set(leverIndex, `<g data-part="lever">${leverSvg}</g>`);
slots.set(quadIndex, `<g data-part="swash"></g>`);
const litNames = new Map(Object.entries(LIT).flatMap(([id, names]) => names.map((n) => [n, id])));
const groups = R.items.map((item, index) => `<g class="it" data-name="${item.name}"${litNames.has(item.name) ? ` data-el="${litNames.get(item.name)}"` : ""}>${item.svg}</g>${slots.get(index) ?? ""}`);

const LABEL_TEXT =
  "Caja de cambios cross-drive de un carro de combate sobre un banco de pruebas, con la mitad superior del cárter quitada. En el eje principal: los paquetes de frenos y embragues de la gama, el convertidor de par en el centro y un tren epicicloidal sumador en cada extremo. Detrás, el eje cero de la dirección movido por una unidad hidrostática de bomba y motor. Cada salida mueve una rueda motriz con un tramo de oruga sobre rodillos.";
const svg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: [...back, `<g class="cd-box">${groups.join("")}</g>`] });

const DATA = {
  P,
  V,
  spins: SPINS,
  loops: LOOPS,
  gateX: Array.from({ length: 7 }, (_, i) => GATE_X(i) - LEVER_REST),
  swash: { o: [49, HS[0] + 1.2 + 1.2, HS[1] + 14.4], len: 13 },
  pitch: 10,
  model: { NE: M.NE, WE: M.WE, KR: M.KR, KS: M.KS, I_F: M.I_F, R_SPR: M.R_SPR, B: M.B, WS_MAX: M.WS_MAX, gears: M.GEARS.map((g) => ({ ...g, wr: M.wrOf(g.v) })), hpRatio: -24 / (Math.hypot(HS[0] - YA, HS[1] - Z0) - 24), hmRatio: -SUN_R / HM_R },
};

const CSS = `
.cd-cavity{fill:var(--anatomy-shade-0)}
.iso[data-theme="light"] .cd-cavity{fill:#d9d9d6}
.cd-stage{touch-action:pan-y;cursor:ew-resize;outline:none}
.cd-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:2px;border-radius:4px}
@media (max-width:520px){.cd-stage{overflow:hidden;margin:0 -12px}.cd-stage>svg{transform:scale(1.13);transform-origin:50% 55%}}
.cd-gears{display:flex;gap:6px;justify-content:center;margin:10px 0 2px;flex-wrap:wrap}
.cd-gears button{font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;min-width:38px;padding:7px 8px;border-radius:6px;border:1px solid var(--anatomy-lo);background:transparent;color:var(--anatomy-text);cursor:pointer}
.cd-gears button[aria-pressed="true"]{border-color:var(--anatomy-hi);color:var(--anatomy-strong)}
.cd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
`;
const latheSource = readFileSync(`${SKILL}/kit/lathe.mjs`, "utf8").replace(/^import .*$/m, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {${latheSource}\nreturn { viewOf, scaleOf, frameOf, pointOf, disc, sphereOf, circleOf, arcOf, ribsOf, dotsOf, spokesOf, dot3, add3, mul3, unit3, fadeOf };})();\n`;
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const gearsHtml = `<div class="cd-gears" role="group" aria-label="Marcha">${M.GEARS.map((g, i) => `<button type="button" data-gear="${i}" aria-pressed="${g.id === "N" ? "true" : "false"}">${g.id}</button>`).join("")}</div>`;
const body =
  `<style>${CSS}</style>` +
  k.plateHtml({
    fig: "Fig 1",
    title: "Cross-drive, cárter abierto",
    hint: "↑↓ marcha · ←→ o arrastra: dirección",
    readout: "N · parado",
    keys: [
      { mark: "lit", label: "Frenos y embragues aplicados en la marcha elegida" },
      { mark: "raised", label: "Trenes sumadores: la corona trae la marcha, el planetario la dirección" },
      { mark: "edge", label: "Eje cero: lleva la dirección a los dos lados con sentidos opuestos" },
    ],
    caption: `Cross-drive del tipo de la RENK HSWL 354 del Leopard 2, simplificada: 4 marchas adelante y 2 atrás, convertidor de par y dirección hidrostática superpuesta. Cada salida es un tren epicicloidal: la corona gira con la gama, el planetario con el eje cero y el portasatélites suma los dos (${M.ZR} y ${M.ZS} dientes) y mueve la rueda motriz. Como el eje cero llega a un lado por una rueda loca y al otro directo, la dirección acelera una oruga y frena la otra lo mismo: ±${M.VS_MAX} km/h con la palanca a tope en cualquier marcha, así que el radio de giro crece con la velocidad, y en punto muerto, con la gama bloqueada por dos frenos, el carro gira sobre sí mismo. Motor a ${M.NE} rpm; el movimiento va a 1/90 de la velocidad real. La tabla de embragues, las relaciones y los radios son ilustrativos, no los del fabricante.`,
    body: `<div class="iso-stage cd-stage" tabindex="0" role="group" aria-label="Caja cross-drive. Flechas arriba y abajo cambian de marcha; izquierda y derecha mueven la palanca de dirección; Inicio la centra. También puedes arrastrar en horizontal sobre la figura para girar.">${svg}<span class="cd-sr" role="status" aria-live="polite" data-status></span></div>${gearsHtml}`,
  });

const AUTO = process.argv.includes("--auto");
const themeScript = AUTO ? `document.body.dataset.theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";\n` : "";
const page = k.pageHtml({ title: "Cross-drive de carro de combate", theme: THEME, body, script: themeScript + kitScript() + latheScript + LIVE, width: 700 }).replace('<html lang="en">', '<html lang="es">');
const name = AUTO ? "index.html" : THEME === "light" ? "cross-drive-light.html" : "cross-drive.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${SPINS.length} spins`, `scale ${KS.toFixed(3)}`);
A.auditOrExit(R, P, {});
