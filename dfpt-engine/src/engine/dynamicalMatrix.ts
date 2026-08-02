import { MASS, N3, CLIGHT, type ForceConstants } from "./constants.ts";
import type { Bond } from "./bonds.ts";
import { jacobiEigenvalues, jacobiEigen } from "./eigen.ts";

export type Vec3 = readonly [number, number, number];

/**
 * Build the complex Hermitian dynamical matrix D(q) (mass-weighted), split
 * into its real and imaginary N3 x N3 parts.
 */
function buildDynamicalMatrix(
  q: Vec3,
  bonds: readonly Bond[],
  K: ForceConstants,
): { Re: Float64Array[]; Im: Float64Array[] } {
  const Re = Array.from({ length: N3 }, () => new Float64Array(N3));
  const Im = Array.from({ length: N3 }, () => new Float64Array(N3));

  for (const { i, j, d, kind } of bonds) {
    const [A, B] = K[kind];
    const r = Math.hypot(d[0], d[1], d[2]);
    const n = [d[0] / r, d[1] / r, d[2] / r];
    const ph = q[0] * d[0] + q[1] * d[1] + q[2] * d[2];
    const cp = Math.cos(ph), sp = Math.sin(ph);
    const invm = 1 / Math.sqrt(MASS[i] * MASS[j]);

    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const Kab = A * n[a] * n[b] + B * ((a === b ? 1 : 0) - n[a] * n[b]);
        Re[3 * i + a][3 * j + b] -= Kab * cp * invm;
        Im[3 * i + a][3 * j + b] -= Kab * sp * invm;
        Re[3 * i + a][3 * i + b] += Kab / MASS[i];
      }
    }
  }
  return { Re, Im };
}

/** Real symmetric 2N x 2N embedding of a complex Hermitian N x N matrix. */
function embed(Re: Float64Array[], Im: Float64Array[]): Float64Array[] {
  const n2 = 2 * N3;
  const M = Array.from({ length: n2 }, () => new Float64Array(n2));
  for (let a = 0; a < N3; a++) {
    for (let b = 0; b < N3; b++) {
      M[a][b] = Re[a][b];
      M[a][b + N3] = -Im[a][b];
      M[a + N3][b] = Im[a][b];
      M[a + N3][b + N3] = Re[a][b];
    }
  }
  return M;
}

/**
 * Signed phonon frequencies (cm^-1) at wavevector q, ascending. Negative
 * values denote imaginary (dynamically unstable) branches. Eigenvalues-only —
 * the fast path used for dispersion curves and Monkhorst-Pack grid sampling.
 */
export function freqs(q: Vec3, bonds: readonly Bond[], K: ForceConstants): number[] {
  const { Re, Im } = buildDynamicalMatrix(q, bonds, K);
  const M = embed(Re, Im);
  const ev = jacobiEigenvalues(M, 2 * N3);
  const out: number[] = [];
  for (let k = 0; k < 2 * N3; k += 2) {
    const w2 = ev[k];
    out.push((Math.sign(w2) * Math.sqrt(Math.abs(w2))) / (2 * Math.PI * CLIGHT));
  }
  return out;
}

export interface Mode {
  /** Signed frequency, cm^-1 (negative = imaginary/unstable). */
  freqCm: number;
  /**
   * Mass-weighted complex polarisation vector, one [re, im] pair per
   * (atom, cartesian) degree of freedom, length N3. Real-space ionic
   * displacement is this divided by sqrt(mass) (already folded in here
   * since the dynamical matrix itself is mass-weighted).
   */
  vector: { re: number; im: number }[];
}

/**
 * Full solve at wavevector q: signed frequencies AND polarisation vectors,
 * ascending by frequency. Used on-demand (e.g. a UI click on one dispersion
 * branch) — heavier than `freqs` because it accumulates eigenvectors.
 */
export function solveModes(q: Vec3, bonds: readonly Bond[], K: ForceConstants): Mode[] {
  const { Re, Im } = buildDynamicalMatrix(q, bonds, K);
  const M = embed(Re, Im);
  const { values, vectors } = jacobiEigen(M, 2 * N3);

  const modes: Mode[] = [];
  for (let k = 0; k < 2 * N3; k += 2) {
    const w2 = values[k];
    const freqCm = (Math.sign(w2) * Math.sqrt(Math.abs(w2))) / (2 * Math.PI * CLIGHT);
    const col = vectors[k];
    const vector: { re: number; im: number }[] = [];
    for (let a = 0; a < N3; a++) vector.push({ re: col[a], im: col[a + N3] });
    modes.push({ freqCm, vector });
  }
  return modes;
}
