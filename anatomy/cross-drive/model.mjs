// Modelo de una cross-drive tipo RENK HSWL 354, simplificado.
// Real: la corona del tren sumador recibe la marcha y el planetario la dirección
// hidrostática, con giro opuesto a cada lado; el portasatélites mueve la rueda motriz.
// Ilustrativo: la tabla de embragues, las relaciones y los radios concretos.

export const NE = 2600; // rpm del motor, régimen nominal
export const WE = (NE * 2 * Math.PI) / 60; // rad/s
export const ZS = 28; // dientes del planetario (sol) del tren sumador
export const ZR = 88; // dientes de la corona
export const KR = ZR / (ZR + ZS); // peso de la corona en el portasatélites
export const KS = ZS / (ZR + ZS); // peso del planetario
export const I_F = 4.2; // reducción final
export const R_SPR = 0.33; // m, radio primitivo de la rueda motriz
export const B = 3.12; // m, distancia entre centros de orugas
export const VS_MAX = 6; // km/h que la dirección suma o resta a cada oruga con la palanca a tope

export const GEARS = [
  { id: "R2", v: -31, on: ["KR", "B2"] },
  { id: "R1", v: -12, on: ["KR", "B3"] },
  { id: "N", v: 0, on: ["B2", "B3"] },
  { id: "1", v: 12, on: ["K1", "B3"] },
  { id: "2", v: 23, on: ["K1", "B2"] },
  { id: "3", v: 40, on: ["K1", "B1"] },
  { id: "4", v: 68, on: ["K1", "K2"] },
];
export const ELEMENTS = ["B3", "B2", "B1", "K1", "K2", "KR"];

const kmh = (w) => (w / I_F) * R_SPR * 3.6; // portasatélites rad/s -> km/h de oruga
export const wrOf = (v) => (v / 3.6) * I_F / (KR * R_SPR); // corona rad/s para v km/h en recta
export const WS_MAX = (VS_MAX / 3.6) * I_F / (KS * R_SPR); // planetario rad/s con la palanca a tope

// wr: velocidad de la salida de la gama (coronas); a: palanca de dirección -1..1 (+ = gira a la derecha)
export function speeds(wr, a) {
  const wz = a * WS_MAX; // eje cero
  const sL = wz; // izquierda: eje cero -> rueda loca -> planetario (mismo sentido)
  const sR = -wz; // derecha: engrane directo (sentido opuesto)
  const cL = KR * wr + KS * sL;
  const cR = KR * wr + KS * sR;
  return { wr, wz, sL, sR, cL, cR, vL: kmh(cL), vR: kmh(cR), spL: cL / I_F, spR: cR / I_F };
}

// radio de giro del centro del carro, m (Infinity en recta, 0 sobre sí mismo)
export function radiusOf(vL, vR) {
  const d = vL - vR;
  if (Math.abs(d) < 0.05) return Infinity;
  return Math.abs((B / 2) * (vL + vR) / d);
}
