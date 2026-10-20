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
const AUTO = process.argv.includes("--auto");
const W = 640;
const H = 420;

// ---- mundo: 1 mm = 10 unidades; la arteria va a lo largo de x, cortada por su eje (z = Z0)
const U = 10;
const Z0 = 40;
const RV = (M.D_REF / 2) * U; // radio de la luz sana
const BLK = { x0: -125, x1: 125, y0: -32, y1: 34 };
const GUIDE_TIP = -110; // boca del catéter guía (ostium)
const GUIDE_R = 10; // 6 Fr = 2 mm
const PLATE = { x: -215, y: -52, w: 430, d: 186, r: 10 };
const PLATE_H = 10;
const FOOT_H = 5;
const IND = { y: 116, z: 18, r: 14, x0: -112, x1: -40 }; // inflador
const ROT = { x0: 166, x1: 184, y0: -10, y1: 10, z0: 14, z1: 110 }; // caudalímetro

const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [ROT.x1, ROT.y0, ROT.z1 + 6]], W, H, { pad: 14, azimuth: 66, elevation: 52 });
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
const put = (name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) => R.put({ name, at: ref, bias, svg, shapes, piece: "rig", ...rest });

const FX = (y, z) => G.frameOf([0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const AXIS = FX(0, Z0);

function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.6, steps = 3, bevel = 0, extra = "", inner = "", bias = 0, owner, ground } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name, owner, ground }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, owner, smooth, bevel = 0, rims } = {}) {
  const opts = { bevel, ...(smooth !== undefined ? { smooth } : {}), ...(rims ? { rims } : {}) };
  const paths = G.solidOf(profile, F, P, opts);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name, owner, radius: smooth && smooth.radius ? smooth.radius : null }));
  put(name, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
const disc = (name, F, s0, s1, r, style = {}, options = {}) => turned(name, F, [[s0, r], [s1, r]], style, options);

// prisma de cualquier polígono (también cóncavo) a lo largo de F.a
const signed = (poly) => poly.reduce((a, [x, y], i) => {
  const [x2, y2] = poly[(i + 1) % poly.length];
  return a + x * y2 - x2 * y;
}, 0);
const screenOriented = (pts) => (signed(pts) < 0 ? [...pts].reverse() : pts);
function runs(flags, want) {
  const count = flags.length;
  const out = [];
  const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
  if (start < 0) return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
  let run = null;
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    if (flags[index] === want) {
      if (!run) run = [index];
      run.push((index + 1) % count);
    } else if (run) {
      out.push(run);
      run = null;
    }
  }
  if (run) out.push(run);
  return out;
}
function prismPaths(F, poly, s0, s1) {
  const ring = signed(poly) > 0 ? poly : [...poly].reverse();
  const n = ring.length;
  const W3 = (s, [x, y]) => [F.o[0] + F.a[0] * s + F.u[0] * x + F.v[0] * y, F.o[1] + F.a[1] * s + F.u[1] * x + F.v[1] * y, F.o[2] + F.a[2] * s + F.u[2] * x + F.v[2] * y];
  const capNear = G.dot3(F.a, V) > 0;
  const [nearS, farS] = capNear ? [s1, s0] : [s0, s1];
  const near = ring.map((p) => at(W3(nearS, p)));
  const far = ring.map((p) => at(W3(farS, p)));
  const normals = ring.map(([x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % n];
    return G.unit3(G.add3(G.mul3(F.u, y1 - y0), G.mul3(F.v, -(x1 - x0))));
  });
  const facing = normals.map((m) => G.dot3(m, V) > 1e-9);
  const outline = [];
  const crease = [];
  for (const run of runs(facing, false)) outline.push(k.pathOf(run.map((i) => near[i])));
  for (const run of runs(facing, true)) {
    crease.push(k.pathOf(run.map((i) => near[i])));
    outline.push(k.pathOf(run.map((i) => far[i])));
  }
  for (let i = 0; i < n; i++) if (facing[(i + n - 1) % n] !== facing[i]) outline.push(k.pathOf([near[i], far[i]]));
  const parts = [k.pathOf(screenOriented(near), true), k.pathOf(screenOriented(far), true)];
  const buckets = [[], [], [], [], []];
  for (let i = 0; i < n; i++) {
    if (!facing[i]) continue;
    const quad = screenOriented([near[i], near[(i + 1) % n], far[(i + 1) % n], far[i]]);
    parts.push(k.pathOf(quad, true));
    buckets[normals[i][2] > 0.999 ? 4 : G.toneOf(normals[i], P)].push(k.pathOf(quad, true));
  }
  buckets[G.toneOf(capNear ? F.a : G.mul3(F.a, -1), P)].push(k.pathOf(screenOriented(near), true));
  return { fill: parts.join(""), outline: outline.join(""), crease: crease.join(""), top: buckets[4].join(""), shades: buckets.slice(0, 4).map((b) => b.join("")) };
}

// tubos (catéteres, alargadera, conexiones)
function line(name, points, r, { tone = "mid", bend = 6, maxLength = 22, bias = 0.05, owner, touch } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  R.route(name, route, r, { piece: "rig", owner, touch });
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.6, r)) }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias }),
  );
  return route;
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
const LABEL = { x: 40, y: 96, w: 70, d: 26, r: 1.4 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 2), 0.8, P, 4), { tone: "faint" }));
back.push(Ln([[8, 50], [8, 38], [8, 44]].map(([x0, w], i) => k.lineOnTop([LABEL.x + x0, LABEL.y + 7 + i * 5], [LABEL.x + x0 + w, LABEL.y + 7 + i * 5], 0.8, P)).join(""), { tone: "lo", free: true }));
back.push(Dots([at([LABEL.x + 4, LABEL.y + LABEL.d / 2, 0.8]), at([LABEL.x + LABEL.w - 4, LABEL.y + LABEL.d / 2, 0.8])], { size: 0.45 }));

// =========================================================== bloque con la arteria fresada (cortada por su eje)
const ARC = (from, to, n = 20) => Array.from({ length: n + 1 }, (_, i) => {
  const t = from + ((to - from) * i) / n;
  return [RV * Math.cos(t), Z0 + RV * Math.sin(t)];
});
const BX = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
{
  const backPoly = [[BLK.y0, 0], [0, 0], ...ARC(-Math.PI / 2, -Math.PI), [BLK.y0, Z0]];
  const frontPoly = [[0, 0], [BLK.y1, 0], [BLK.y1, Z0], ...ARC(0, -Math.PI / 2)];
  const screws = (y) => Array.from({ length: 6 }, (_, i) => at([BLK.x0 + 15 + i * 44, y, Z0]));
  void 0;
  const backShape = record(A.box([BLK.x0, BLK.y0, 0], [BLK.x1, -RV, Z0], { name: "block.back" }));
  put("block.back", [0, -26, 20], S(prismPaths(BX, backPoly, BLK.x0, BLK.x1), { tone: "mid", crease: "faint" }) + Dots(screws(-25), { size: 0.55, tone: "mid" }) + Ln(screws(-25).map(([x, y]) => `M${(x - 1.6).toFixed(1)} ${y.toFixed(1)}a1.6 1 0 1 0 3.2 0a1.6 1 0 1 0 -3.2 0`).join(""), { tone: "lo" }), [backShape]);
  const frontShape = record(A.box([BLK.x0, RV, 0], [BLK.x1, BLK.y1, Z0], { name: "block.front" }));
  // regla milimetrada en la cara superior delantera
  const strip = { x: -110, y: 25, w: 220, d: 6, r: 0.8 };
  const t = k.topTicks(strip.x, strip.x + strip.w, U, 5, strip.y, Z0 + 0.5, [2, 3.6], P);
  const ruler = S(k.slabOf(strip, Z0, 0.5, P, 2), { tone: "lo", crease: "none" }) + Ln(t.minor, { tone: "lo" }) + Ln(t.major, { tone: "mid" });
  put("block.front", [0, 28, 20], `<g data-part="front-plaque"></g>` + S(prismPaths(BX, frontPoly, BLK.x0, BLK.x1), { tone: "mid", crease: "faint" }) + Dots(screws(20.5), { size: 0.55, tone: "mid" }) + ruler, [frontShape], { bias: 2 });
  // puerto de entrada de líquido por detrás, con su línea al conector del borde
  const PF = G.frameOf([-100, BLK.y0, 24], [0, -1, 0], [1, 0, 0], [0, 0, 1]);
  turned("inlet.port", PF, [[0, 7], [3, 7], [3, 5], [8, 5]], { tone: "mid" });
  box("inlet.bulkhead", [-113, PLATE.y + 4, 0], [-87, PLATE.y + 12, 34], { tone: "mid" }, { bevel: 0.5, extra: Dots([at([-109, PLATE.y + 12, 30]), at([-91, PLATE.y + 12, 30])], { size: 0.45 }) });
  line("inlet.line", [[-100, BLK.y0 - 8, 24], [-100, PLATE.y + 12, 24]], 3.2, { tone: "mid" });
}

// catéter guía: dentro del canal hasta el ostium y por fuera hasta la válvula hemostática
disc("guide.in", AXIS, BLK.x0, GUIDE_TIP, GUIDE_R, { tone: "mid" }, { extra: Ln(G.circleOf(AXIS, GUIDE_TIP, GUIDE_R - 2.2, P), { tone: "lo" }) });
const YC = { x: -178, y0: 52, y1: 78 };
line("guide.out", [[BLK.x0, 0, Z0], [-150, 0, Z0], [YC.x, 24, Z0], [YC.x, YC.y0, Z0]], GUIDE_R, { tone: "mid", bend: 20, touch: ["cradle*"] });
for (const [x, y] of [[-140, 0], [YC.x, 38]]) {
  box(`cradle.${x}`, [x - 8, y - 6, 0], [x + 8, y + 6, Z0 - GUIDE_R], { tone: "lo" }, { bevel: 0.4, extra: Dots([at([x, y + 6, 4])], { size: 0.45 }) });
}
// válvula hemostática en Y con su llave de tres pasos
{
  const F = G.frameOf([YC.x, 0, Z0], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
  turned("yvalve", F, [[YC.y0, 11], [YC.y0 + 3, 11], [YC.y1 - 6, 11], [YC.y1 - 6, 12.5], [YC.y1 + 6, 12.5], [YC.y1 + 6, 8], [YC.y1 + 10, 6]], { tone: "hi" }, { extra: Faded(G.ribsOf(F, YC.y1 - 6, YC.y1 + 6, 12.5, 40, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  const SF = G.frameOf([YC.x - 11, YC.y0 + 12, Z0], [-1, 0, 0], [0, 1, 0], [0, 0, 1]);
  turned("yvalve.arm", SF, [[0, 4], [16, 4], [16, 6], [24, 6]], { tone: "mid" });
  box("stopcock", [YC.x - 44, YC.y0 + 4, Z0 - 6], [YC.x - 35, YC.y0 + 20, Z0 + 6], { tone: "mid" }, { bevel: 0.4, extra: Dots([at([YC.x - 39.5, YC.y0 + 12, Z0 + 6])], { size: 0.6, tone: "hi" }) });
  box("stopcock.lever", [YC.x - 42, YC.y0 + 11, Z0 + 6], [YC.x - 37, YC.y0 + 30, Z0 + 8], { tone: "hi" }, { bevel: 0.3 });
}
// catéter balón: tramo proximal, conector y alargadera al inflador
const HUB = { x0: -160, x1: -141, y: 98 };
line("balloon.shaft.out", [[YC.x, YC.y1 + 10, Z0], [YC.x, HUB.y, Z0], [HUB.x0, HUB.y, Z0]], 2.4, { tone: "hi", bend: 12 });
{
  const F = FX(HUB.y, Z0);
  turned("balloon.hub", F, [[HUB.x0, 3.4], [HUB.x0 + 6, 5.5], [HUB.x1 - 4, 5.5], [HUB.x1 - 4, 7], [HUB.x1, 7]], { tone: "hi" }, { extra: Faded(G.ribsOf(F, HUB.x1 - 4, HUB.x1, 7, 20, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
  box("hub.stand", [HUB.x0 + 2, HUB.y - 6, 0], [HUB.x0 + 12, HUB.y + 6, Z0 - 5.4], { tone: "lo" }, { bevel: 0.4 });
}
line("extension", [[HUB.x1, HUB.y, Z0], [-130, HUB.y, Z0], [-126, IND.y, IND.z], [IND.x0 - 12, IND.y, IND.z]], 2.6, { tone: "mid", bend: 8 });

// =========================================================== inflador con manómetro
const IF = FX(IND.y, IND.z);
turned("ind.nose", IF, [[IND.x0 - 12, 3], [IND.x0 - 8, 5], [IND.x0, 10]], { tone: "mid" });
turned("ind.barrel", IF, [[IND.x0, IND.r - 1], [IND.x0 + 2, IND.r], [IND.x1 - 2, IND.r], [IND.x1, IND.r - 1]], { tone: "mid" }, { extra: Ln(Array.from({ length: 6 }, (_, i) => G.arcOf(IF, IND.x0 + 12 + i * 10, IND.r, P)).join(""), { tone: "faint" }) });
turned("ind.cap", IF, [[IND.x1, 10], [IND.x1 + 6, 10]], { tone: "mid" }, { extra: Faded(G.ribsOf(IF, IND.x1, IND.x1 + 6, 10, 26, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
for (const x of [IND.x0 + 14, IND.x1 - 14]) box(`ind.cradle.${x}`, [x - 6, IND.y - 9, 0], [x + 6, IND.y + 9, IND.z - IND.r + 0.3], { tone: "lo" }, { bevel: 0.4 });
const GAUGE = { x: IND.x0 + 22, y: IND.y, r: 19, z0: IND.z + IND.r + 4, h: 9 };
GAUGE.top = GAUGE.z0 + GAUGE.h;
box("ind.neck", [GAUGE.x - 4, IND.y - 4, IND.z + IND.r - 0.4], [GAUGE.x + 4, IND.y + 4, GAUGE.z0], { tone: "mid" });
{
  const { x, y, r, z0, h, top } = GAUGE;
  const ticks = k.radialTicks(x, y, r - 3, 30, 5, top, [1.4, 3], P, -Math.PI * 0.75, Math.PI * 1.5);
  const face = S(k.cylinder(x, y, r, z0, h, P, 64, 0.8), { tone: "hi", crease: "lo" }) + Ln(k.knurl(x, y, r, top - 3, top, 80, P, 0.3), { tone: "lo" }) + Ln(k.sideArc(x, y, r, top - 3, P, 40), { tone: "faint" }) + Ln(k.ring(x, y, r - 2.2, top, P, 64), { tone: "lo" }) + Ln(ticks.minor, { tone: "lo" }) + Ln(ticks.major, { tone: "mid" }) + k.faceTextSvg(k.topMatrix([x, y + 8], top, P, "x"), "atm", { size: 3, tone: "lo", anchor: "middle" });
  put("ind.gauge", [x, y, z0 + h / 2], face + `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.2" d=""/>` + Ln(k.ring(x, y, 1.6, top, P, 16), { tone: "mid" }), [record(A.cylinder(x, y, r, z0, h, { name: "ind.gauge" }))]);
}
// émbolo roscado y mango en T: se dibuja en reposo y se traslada con la presión
const plungerSvg = (() => {
  const s0 = IND.x1 + 6;
  return (
    S(G.disc(s0 - 30, s0 + 34, 4.2, IF, P), { tone: "mid", crease: "none" }) +
    Faded(G.ribsOf(IF, s0 + 1, s0 + 34, 4.2, 22, P, { fade: [0.1, 0.55], twist: 0.6, seams: true }), { tone: "lo" }) +
    S(G.disc(s0 + 34, s0 + 40, 6, IF, P, { bevel: 0.3 }), { tone: "mid" }) +
    S(G.prismOf(G.frameOf([s0 + 44, IND.y, IND.z], [1, 0, 0], [0, 1, 0], [0, 0, 1]), [[-22, -3.4], [22, -3.4], [22, 3.4], [-22, 3.4]], -4, 4, P), { tone: "hi" })
  );
})();
const plungerShapes = [
  record(A.solid(IF, [[IND.x1 + 6, 4.2], [IND.x1 + 40, 4.2]], { name: "ind.plunger" })),
  record(A.solid(IF, [[IND.x1 + 40, 6], [IND.x1 + 46, 6]], { name: "ind.plunger.knob" })),
  record(A.box([IND.x1 + 46, IND.y - 22, IND.z - 3.4], [IND.x1 + 54, IND.y + 22, IND.z + 3.4], { name: "ind.plunger.handle" })),
];
const plClip = k.pathOf(G.hullOf([IND.x1 + 6, IND.x1 + 70].flatMap((x) => Array.from({ length: 48 }, (_, i) => at([x, IND.y + 26 * Math.cos((i / 48) * Math.PI * 2), IND.z + 26 * Math.sin((i / 48) * Math.PI * 2)])))), true);
put("ind.plunger", [IND.x1 + 26, IND.y, IND.z], `<clipPath id="sd-plclip"><path d="${plClip}"/></clipPath><g clip-path="url(#sd-plclip)"><g data-part="plunger">${plungerSvg}</g></g>`, plungerShapes);

// =========================================================== salida y caudalímetro de flotador
box("rot.base", [ROT.x0 - 6, ROT.y0 - 8, 0], [ROT.x1 + 6, ROT.y1 + 8, ROT.z0], { tone: "lo" }, { bevel: 0.6, extra: Dots([[ROT.x0 - 3, ROT.y1 + 5], [ROT.x1 + 3, ROT.y1 + 5]].map(([x, y]) => at([x, y, ROT.z0])), { size: 0.5 }) });
const WIN = { x0: ROT.x0 + 4, x1: ROT.x0 + 11, z0: ROT.z0 + 12, z1: ROT.z1 - 12 };
{
  const plan = { x: ROT.x0, y: ROT.y0, w: ROT.x1 - ROT.x0, d: ROT.y1 - ROT.y0, r: 1.2 };
  const face = ROT.y1;
  const slot = path3([[WIN.x0, face, WIN.z0], [WIN.x1, face, WIN.z0], [WIN.x1, face, WIN.z1], [WIN.x0, face, WIN.z1]], true);
  const scaleX = WIN.x1 + 2.5;
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const z = WIN.z0 + 4 + (i / 10) * (WIN.z1 - WIN.z0 - 8);
    return path3([[scaleX, face + 0.6, z], [scaleX + (i % 5 === 0 ? 3.6 : 2), face + 0.6, z]]);
  }).join("");
  const strip = S(k.slabOf({ x: scaleX - 0.8, y: face, w: 0.8, d: 0.6, r: 0.1 }, WIN.z0, WIN.z1 - WIN.z0, P, 1), { tone: "lo", crease: "none" });
  put("rot.body", [(ROT.x0 + ROT.x1) / 2, 0, (ROT.z0 + ROT.z1) / 2], S(k.slabOf(plan, ROT.z0, ROT.z1 - ROT.z0, P, 3, 0.6), { tone: "mid" }) + `<path class="sd-glass" d="${slot}"/>` + Ln(slot, { tone: "lo" }) + `<g data-part="float"></g>` + strip + Ln(ticks, { tone: "lo" }), [record(A.slab(plan, ROT.z0, ROT.z1 - ROT.z0, { name: "rot.body" }, 3))]);
  const CF = G.frameOf([(ROT.x0 + ROT.x1) / 2, 0, ROT.z1], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  turned("rot.cap", CF, [[0, 9], [5, 9], [5, 5], [9, 5]], { tone: "mid" }, { extra: Faded(G.ribsOf(CF, 0, 5, 9, 30, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }) });
}
const OUT_Z = ROT.z0 + 8;
line("outlet", [[BLK.x1, 0, Z0], [146, 0, Z0], [146, 0, OUT_Z], [ROT.x0, 0, OUT_Z]], 4.2, { tone: "mid", bend: 9 });
disc("outlet.in", AXIS, BLK.x1 - 12, BLK.x1, 6, { tone: "mid" });

// =========================================================== orden
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const bi = R.items.findIndex((item) => item.name === "block.back");
const fi = R.items.findIndex((item) => item.name === "block.front");
if (fi < bi) throw new Error("el bloque delantero debe ir después del trasero");
const slots = new Map([[bi, `<g data-part="channel"></g>`]]);
const groups = R.items.map((item, index) => `<g class="it" data-name="${item.name}">${item.svg}</g>${slots.get(index) ?? ""}`);

const LABEL_TEXT =
  "Banco de entrenamiento de angioplastia: un bloque con una arteria coronaria de 3,25 mm fresada y abierta por su eje, con una placa que la ocluye en el centro. Por la izquierda entra el catéter guía hasta el ostium; dentro avanzan la guía y el balón con el stent. Delante, un inflador con manómetro en atmósferas; a la derecha, un caudalímetro de flotador.";
const svg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: [...back, `<g class="sd-rig">${groups.join("")}</g>`] });

const DATA = {
  P,
  V,
  U,
  Z0,
  RV,
  guideTip: GUIDE_TIP,
  guideR: GUIDE_R,
  blk: BLK,
  gauge: GAUGE,
  win: { ...WIN, face: ROT.y1 },
  plungerMove: 0.6,
  model: { P_NOM: M.P_NOM, D_NOM: M.D_NOM, COMPL: M.COMPL, P_DEPLOY: M.P_DEPLOY, STENT_L: M.STENT_L, LESION_L: M.LESION_L, D_CRIMP: M.D_CRIMP, D_FOLD: M.D_FOLD, D_REF: M.D_REF },
};

const CSS = `
.sd-glass{fill:var(--anatomy-shade-0)}
.iso[data-theme="light"] .sd-glass{fill:#e4e4e1}
.sd-plaque{fill:var(--sd-plaque)}
.iso{--sd-plaque:#3b3327;--sd-p0:#1d1914;--sd-p1:#241f18;--sd-p2:#2b251d;--sd-p3:#332c22;--sd-p4:#3b3327;--sd-float:#e6e6e6}
.iso[data-theme="light"]{--sd-plaque:#efe2c6;--sd-p0:#cbbb99;--sd-p1:#d6c6a4;--sd-p2:#e0d0af;--sd-p3:#e8d9b9;--sd-p4:#efe2c6;--sd-float:#1a1a1a}
.sd-q{stroke-width:.5;stroke-linejoin:round}
.iso{--sd-v0:#1c1213;--sd-v1:#221617;--sd-v2:#291a1b;--sd-v3:#301e1f;--sd-v4:#382324;--sd-wall:#4a2a2b}
.iso[data-theme="light"]{--sd-v0:#d9b8b4;--sd-v1:#e2c4c0;--sd-v2:#e9cfcb;--sd-v3:#efd9d6;--sd-v4:#f4e3e0;--sd-wall:#d99a94}
.sd-wall{fill:var(--sd-wall)}
.sd-q[data-m="v"][data-s="0"]{fill:var(--sd-v0);stroke:var(--sd-v0)}
.sd-q[data-m="v"][data-s="1"]{fill:var(--sd-v1);stroke:var(--sd-v1)}
.sd-q[data-m="v"][data-s="2"]{fill:var(--sd-v2);stroke:var(--sd-v2)}
.sd-q[data-m="v"][data-s="3"]{fill:var(--sd-v3);stroke:var(--sd-v3)}
.sd-q[data-m="v"][data-s="4"]{fill:var(--sd-v4);stroke:var(--sd-v4)}
.sd-q[data-s="0"]{fill:var(--sd-p0);stroke:var(--sd-p0)}
.sd-q[data-s="1"]{fill:var(--sd-p1);stroke:var(--sd-p1)}
.sd-q[data-s="2"]{fill:var(--sd-p2);stroke:var(--sd-p2)}
.sd-q[data-s="3"]{fill:var(--sd-p3);stroke:var(--sd-p3)}
.sd-q[data-s="4"]{fill:var(--sd-p4);stroke:var(--sd-p4)}
.sd-float{fill:var(--sd-float)}
.sd-stage{touch-action:pan-y;cursor:ew-resize;outline:none}
.sd-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:2px;border-radius:4px}
.sd-steps{display:flex;gap:6px;justify-content:center;margin:10px 0 2px;flex-wrap:wrap}
.sd-steps button{font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:7px 9px;border-radius:6px;border:1px solid var(--anatomy-lo);background:transparent;color:var(--anatomy-text);cursor:pointer}
.sd-steps button[aria-pressed="true"]{border-color:var(--anatomy-hi);color:var(--anatomy-strong)}
.sd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (max-width:520px){.sd-stage{overflow:hidden;margin:0 -12px}.sd-stage>svg{transform:scale(1.12);transform-origin:50% 50%}}
`;
const latheSource = readFileSync(`${SKILL}/kit/lathe.mjs`, "utf8").replace(/^import .*$/m, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {${latheSource}\nreturn { viewOf, scaleOf, frameOf, pointOf, disc, lathe, solidOf, sphereOf, circleOf, arcOf, ribsOf, dotsOf, dot3, add3, mul3, unit3, fadeOf, toneOf };})();\n`;
const modelScript = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const STEPS = ["Guía", "Stent", "Inflar", "Desinflar", "Retirar"];
const stepsHtml = `<div class="sd-steps" role="group" aria-label="Pasos">${STEPS.map((s, i) => `<button type="button" data-step="${i + 1}" aria-pressed="false">${i + 1} · ${s}</button>`).join("")}</div>`;
const body =
  `<style>${CSS}</style>` +
  k.plateHtml({
    fig: "Fig 2",
    title: "Stent coronario en un infarto",
    hint: "← → pasos · espacio · arrastra",
    readout: "arteria ocluida · flujo 0 %",
    keys: [
      { mark: "lit", label: "El stent: malla metálica montada sobre el balón que queda en la arteria" },
      { mark: "raised", label: "La placa con el trombo que tapa la arteria y causa el infarto" },
      { mark: "edge", label: "Guía de 0,014\" (0,36 mm), el raíl por el que avanza todo" },
      { mark: "red", label: "Sangre: quieta mientras la arteria está tapada, corre al abrirla" },
    ],
    caption: `Modelo de banco a escala ×10 (la regla marca milímetros) de una angioplastia primaria. 1) Por un catéter guía de 6 Fr (2 mm) que llega al origen de la coronaria, normalmente desde la arteria radial de la muñeca, se pasa una guía de 0,014" a través de la oclusión. 2) Sobre la guía avanza un balón con el stent plegado encima (${M.D_CRIMP.toFixed(1).replace(".", ",")} mm de perfil) hasta cubrir la lesión. 3) El inflador sube la presión: el balón semidistensible da unos ${M.D_NOM.toFixed(1).replace(".", ",")} mm a ${M.P_NOM} atm (nominal) y algo más por encima; aquí se implanta a ${M.P_DEPLOY} atm durante unos segundos, con el flujo cortado mientras dura. 4) Al desinflar, la malla metálica se queda abierta contra la pared y aplasta la placa. 5) Se retira el balón y la sangre vuelve a pasar. El caudal sale de un modelo simple de resistencias en serie (ley de Poiseuille), no de un paciente; la forma de la lesión es ilustrativa. Esto es una explicación divulgativa, no una guía clínica.`,
    body: `<div class="iso-stage sd-stage" tabindex="0" role="group" aria-label="Implante de un stent coronario. Flechas izquierda y derecha avanzan o retroceden un paso; espacio reproduce o pausa; también puedes arrastrar en horizontal sobre la figura.">${svg}<span class="sd-sr" role="status" aria-live="polite" data-status></span></div>${stepsHtml}`,
  });

const themeScript = AUTO ? `document.body.dataset.theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";\n` : "";
const page = k.pageHtml({ title: "Stent coronario", theme: THEME, body, script: themeScript + kitScript() + latheScript + modelScript + LIVE, width: 700 }).replace('<html lang="en">', '<html lang="es">');
const name = AUTO ? "index.html" : THEME === "light" ? "stent-light.html" : "stent.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `scale ${KS.toFixed(3)}`);
A.auditOrExit(R, P, {});
