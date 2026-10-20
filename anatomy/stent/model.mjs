// Modelo de una angioplastia primaria con stent en un infarto (simplificado).
// Escala del dibujo: 1 mm = 10 unidades.
// Real: guía de 0,014" (0,36 mm), catéter guía 6 Fr (2 mm), stent premontado en balón
// semidistensible: ~3,0 mm a presión nominal (~8 atm) y presión de rotura ~16 atm.
// Ilustrativo: la forma de la lesión y el modelo de flujo (resistencias en serie, Poiseuille).

export const D_REF = 3.25; // mm, diámetro de referencia del vaso (descendente anterior proximal)
export const P_NOM = 8; // atm
export const D_NOM = 3.0; // mm a presión nominal
export const RBP = 16; // atm, presión de rotura nominal
export const COMPL = 0.05; // mm/atm por encima de la nominal (3,0 -> 3,4 entre 8 y 16 atm)
export const P_DEPLOY = 12; // atm de implante en el ejemplo
export const STENT_L = 18; // mm
export const LESION_L = 14; // mm
export const D_CRIMP = 1.1; // mm, perfil del stent montado
export const D_FOLD = 0.9; // mm, balón desinflado

// diámetro del balón (mm) según presión (atm): se despliega entre 2 y 6 atm y luego sigue la curva de distensibilidad
export function balloonD(p) {
  if (p <= 0) return D_CRIMP;
  const open = Math.min(1, Math.max(0, (p - 1.5) / 4.5));
  const smooth = open * open * (3 - 2 * open);
  const full = D_NOM + COMPL * (p - P_NOM);
  return D_CRIMP + (full - D_CRIMP) * smooth;
}

// fracción de flujo respecto al normal: lecho distal en serie con la lesión (r^4)
export function flowOf(dMin, lengthMm = LESION_L) {
  if (dMin <= 0.05) return 0;
  const rBed = 400; // resistencia del lecho en unidades de un segmento sano de la longitud de la lesión
  const rLes = Math.pow(D_REF / dMin, 4) * (lengthMm / LESION_L);
  return Math.min(1, (rBed + 1) / (rBed + rLes));
}
