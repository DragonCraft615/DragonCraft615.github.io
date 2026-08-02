import type { Bond } from "./bonds.ts";
import { CLIGHT, type ForceConstants } from "./constants.ts";
import { freqs } from "./dynamicalMatrix.ts";

export interface SeismicResult {
  /** Compressional wave velocity, m/s. */
  vP: number;
  /** Shear wave velocity, m/s. */
  vS: number;
}

/**
 * Orientation-averaged acoustic-branch slopes at Gamma (thesis §3.5.3-3.5.4):
 * sample a small-|q| step along [100], [110], [111], take the acoustic
 * triplet's group velocities, and average.
 */
export function seismic(bonds: readonly Bond[], K: ForceConstants, a: number): SeismicResult {
  const dirs: [number, number, number][] = [
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ];
  const acc = [0, 0, 0];
  for (const d of dirs) {
    const nr = Math.hypot(...d);
    const qm = (0.02 * 2 * Math.PI) / a;
    const q: [number, number, number] = [(d[0] / nr) * qm, (d[1] / nr) * qm, (d[2] / nr) * qm];
    const w = freqs(q, bonds, K)
      .sort((x, y) => x - y)
      .slice(0, 3)
      .map((wv) => (wv * 2 * Math.PI * CLIGHT) / qm); // wv is cm^-1; branch slope -> m/s
    for (let k = 0; k < 3; k++) acc[k] += w[k] / dirs.length;
  }
  return { vP: acc[2], vS: (acc[0] + acc[1]) / 2 };
}
