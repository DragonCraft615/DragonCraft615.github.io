import { CLIGHT, type ForceConstants } from "./constants.ts";
import { jacobiEigenvalues, jacobiEigen } from "./eigen.ts";
import type { Supercell, Vec3 } from "./supercell.ts";

/**
 * Dispersion of the *relaxed* supercell — treats the current (possibly
 * tilted) geometry as the new equilibrium lattice and asks for its own
 * phonons, at q expressed in the supercell's own (smaller, folded)
 * Brillouin zone. Same Bloch-phase dynamical-matrix construction as
 * engine/dynamicalMatrix.ts, generalised from the fixed 5-atom cell to
 * arbitrary NAT, and using the *current* bond geometry rather than the
 * fixed cubic reference.
 *
 * The force-constant tensor per bond is the Hessian of the same nonlinear
 * energy used for relaxation (engine/relax.ts), not just A*n0(x)n0 + B*(1-n0(x)n0):
 * bond stretch is geometrically exact, so a bond under residual tension/
 * compression after relaxation picks up extra transverse stiffness
 * (A*(dr/r)*(I - n(x)n)) beyond the along-bond term. At dr=0, n=n0 this
 * reduces exactly to the original (A, B) tensor.
 */

/** 3x3 symmetric force-constant tensor for one bond at its current geometry. */
function bondHessian3x3(A: number, B: number, n0: Vec3, n: Vec3, dr: number, r: number): number[][] {
  const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const t = dr / r;
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      const I = a === b ? 1 : 0;
      const nn = n[a] * n[b];
      const n0n0 = n0[a] * n0[b];
      H[a][b] = A * (nn + t * (I - nn)) + B * (I - n0n0);
    }
  }
  return H;
}

function buildMatrices(
  q: Vec3,
  sc: Supercell,
  K: ForceConstants,
  positions: readonly Vec3[],
): { Re: Float64Array[]; Im: Float64Array[]; N3: number } {
  const NAT = sc.NAT;
  const N3 = 3 * NAT;
  const Re = Array.from({ length: N3 }, () => new Float64Array(N3));
  const Im = Array.from({ length: N3 }, () => new Float64Array(N3));

  for (const { i, j, d0, kind } of sc.bonds) {
    const [A, B] = K[kind];
    const r0 = Math.hypot(d0[0], d0[1], d0[2]);
    const n0: Vec3 = [d0[0] / r0, d0[1] / r0, d0[2] / r0];

    const du: Vec3 = [
      positions[j][0] - sc.referencePositions[j][0] - (positions[i][0] - sc.referencePositions[i][0]),
      positions[j][1] - sc.referencePositions[j][1] - (positions[i][1] - sc.referencePositions[i][1]),
      positions[j][2] - sc.referencePositions[j][2] - (positions[i][2] - sc.referencePositions[i][2]),
    ];
    const d: Vec3 = [d0[0] + du[0], d0[1] + du[1], d0[2] + du[2]];
    const r = Math.hypot(d[0], d[1], d[2]);
    const n: Vec3 = [d[0] / r, d[1] / r, d[2] / r];
    const dr = r - r0;

    const H = bondHessian3x3(A, B, n0, n, dr, r);
    const invm = 1 / Math.sqrt(sc.masses[i] * sc.masses[j]);
    const phase = q[0] * d[0] + q[1] * d[1] + q[2] * d[2];
    const cp = Math.cos(phase), sp = Math.sin(phase);

    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const Hab = H[a][b];
        // i -> j, phase e^{-i q.d}
        Re[3 * i + a][3 * j + b] -= Hab * cp * invm;
        Im[3 * i + a][3 * j + b] -= Hab * sp * invm;
        // j -> i, conjugate phase (bonds list holds each unique pair once)
        Re[3 * j + a][3 * i + b] -= Hab * cp * invm;
        Im[3 * j + a][3 * i + b] += Hab * sp * invm;
        // onsite (diagonal) restoring terms from this bond, both atoms
        Re[3 * i + a][3 * i + b] += Hab / sc.masses[i];
        Re[3 * j + a][3 * j + b] += Hab / sc.masses[j];
      }
    }
  }
  return { Re, Im, N3 };
}

/** Signed frequencies (cm^-1), ascending, eigenvalues only (fast path for dispersion sampling). */
export function supercellFreqs(q: Vec3, sc: Supercell, K: ForceConstants, positions: readonly Vec3[]): number[] {
  const { Re, Im, N3 } = buildMatrices(q, sc, K, positions);
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
  const ev = jacobiEigenvalues(M, n2);
  const out: number[] = [];
  for (let k = 0; k < n2; k += 2) {
    const w2 = ev[k];
    out.push((Math.sign(w2) * Math.sqrt(Math.abs(w2))) / (2 * Math.PI * CLIGHT));
  }
  return out.sort((a, b) => a - b);
}

export interface SupercellMode {
  freqCm: number;
  vector: { re: number; im: number }[];
}

/** Full solve at q: frequencies + polarisation vectors (for click-to-animate). */
export function supercellSolveModes(
  q: Vec3,
  sc: Supercell,
  K: ForceConstants,
  positions: readonly Vec3[],
): SupercellMode[] {
  const { Re, Im, N3 } = buildMatrices(q, sc, K, positions);
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
  const { values, vectors } = jacobiEigen(M, n2);
  const modes: SupercellMode[] = [];
  for (let k = 0; k < n2; k += 2) {
    const w2 = values[k];
    const freqCm = (Math.sign(w2) * Math.sqrt(Math.abs(w2))) / (2 * Math.PI * CLIGHT);
    const col = vectors[k];
    const vector: { re: number; im: number }[] = [];
    for (let a = 0; a < N3; a++) vector.push({ re: col[a], im: col[a + N3] });
    modes.push({ freqCm, vector });
  }
  return modes.sort((a, b) => a.freqCm - b.freqCm);
}
