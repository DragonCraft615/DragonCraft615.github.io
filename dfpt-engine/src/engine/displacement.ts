import { MASS, AMU } from "./constants.ts";
import type { Mode } from "./dynamicalMatrix.ts";

export interface ComplexVec3 {
  re: [number, number, number];
  im: [number, number, number];
}

/**
 * Un-mass-weight a mode's polarisation vector into per-atom complex
 * displacement directions, then normalise so the most-displaced atom moves
 * by exactly 1 unit — callers scale by a visual or physical amplitude.
 */
export function normalisedDisplacements(mode: Mode): ComplexVec3[] {
  const raw: ComplexVec3[] = [];
  for (let atom = 0; atom < 5; atom++) {
    const invSqrtM = 1 / Math.sqrt(MASS[atom] / AMU); // relative mass units cancel in normalisation
    const re: [number, number, number] = [0, 0, 0];
    const im: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const comp = mode.vector[3 * atom + c];
      re[c] = comp.re * invSqrtM;
      im[c] = comp.im * invSqrtM;
    }
    raw.push({ re, im });
  }
  let maxMag = 0;
  for (const v of raw) {
    const mag = Math.sqrt(v.re.reduce((a, x) => a + x * x, 0) + v.im.reduce((a, x) => a + x * x, 0));
    maxMag = Math.max(maxMag, mag);
  }
  if (maxMag < 1e-30) return raw;
  return raw.map((v) => ({
    re: v.re.map((x) => x / maxMag) as [number, number, number],
    im: v.im.map((x) => x / maxMag) as [number, number, number],
  }));
}

/** Real displacement of a basis atom in cell `n` at phase `phase = 2*pi*dot(qFrac,n) - omega*t`. */
export function displacementAt(d: ComplexVec3, phase: number): [number, number, number] {
  const c = Math.cos(phase), s = Math.sin(phase);
  return [
    d.re[0] * c - d.im[0] * s,
    d.re[1] * c - d.im[1] * s,
    d.re[2] * c - d.im[2] * s,
  ];
}
