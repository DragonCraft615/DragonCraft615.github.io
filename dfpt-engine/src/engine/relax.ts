import type { ForceConstants } from "./constants.ts";
import type { Supercell, Vec3 } from "./supercell.ts";

/**
 * Pairwise bond energy + forces on a supercell, geometrically exact in bond
 * *stretch* (so it's genuinely anharmonic — a rigid bond resists stretching,
 * which is exactly what stabilises a large-amplitude octahedral tilt) while
 * keeping the transverse/bending term harmonic, projected against the fixed
 * reference bond direction. At zero displacement this reduces exactly to the
 * existing linear (A, B) force-constant tensor used by the dynamical matrix,
 * so nothing already validated changes.
 */
export function bondEnergyForce(
  sc: Supercell,
  K: ForceConstants,
  positions: readonly Vec3[],
): { E: number; F: Vec3[] } {
  const F: Vec3[] = positions.map(() => [0, 0, 0]);
  let E = 0;

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

    const duDotN0 = du[0] * n0[0] + du[1] * n0[1] + du[2] * n0[2];
    const perp: Vec3 = [du[0] - duDotN0 * n0[0], du[1] - duDotN0 * n0[1], du[2] - duDotN0 * n0[2]];

    E += 0.5 * A * dr * dr + 0.5 * B * (perp[0] * perp[0] + perp[1] * perp[1] + perp[2] * perp[2]);

    const g: Vec3 = [A * dr * n[0] + B * perp[0], A * dr * n[1] + B * perp[1], A * dr * n[2] + B * perp[2]];
    F[i][0] += g[0]; F[i][1] += g[1]; F[i][2] += g[2];
    F[j][0] -= g[0]; F[j][1] -= g[1]; F[j][2] -= g[2];
  }

  return { E, F };
}

export interface RelaxStep {
  step: number;
  E: number;
  maxForce: number;
  positions: Vec3[];
}

export interface RelaxResult {
  positions: Vec3[];
  energyTrace: number[];
  maxForceTrace: number[];
  converged: boolean;
  steps: number;
}

/** Steepest descent with backtracking line search on the nonlinear bond energy. */
export function relax(
  sc: Supercell,
  K: ForceConstants,
  initialPositions: readonly Vec3[],
  opts?: { maxSteps?: number; relTol?: number; onStep?: (s: RelaxStep) => void },
): RelaxResult {
  const maxSteps = opts?.maxSteps ?? 400;
  const relTol = opts?.relTol ?? 1e-6;

  let positions: Vec3[] = initialPositions.map((p) => [...p] as Vec3);
  let { E, F } = bondEnergyForce(sc, K, positions);
  const maxForce = (f: Vec3[]) => Math.max(...f.map((v) => Math.hypot(v[0], v[1], v[2])));

  const AMax = Math.max(K.SiO[0], K.MgO[0], K.OO[0]);
  let alpha = 1e-3 / AMax;
  const initialMaxF = maxForce(F);

  const energyTrace: number[] = [];
  const maxForceTrace: number[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const mf = maxForce(F);
    energyTrace.push(E);
    maxForceTrace.push(mf);
    opts?.onStep?.({ step, E, maxForce: mf, positions });

    if (mf < Math.max(1e-20, relTol * initialMaxF)) {
      return { positions, energyTrace, maxForceTrace, converged: true, steps: step };
    }

    let accepted = false;
    for (let tries = 0; tries < 25; tries++) {
      const trial: Vec3[] = positions.map((p, k) => [
        p[0] + alpha * F[k][0],
        p[1] + alpha * F[k][1],
        p[2] + alpha * F[k][2],
      ]);
      const next = bondEnergyForce(sc, K, trial);
      if (next.E <= E) {
        positions = trial;
        E = next.E;
        F = next.F;
        alpha *= 1.1;
        accepted = true;
        break;
      }
      alpha *= 0.5;
    }
    if (!accepted) {
      return { positions, energyTrace, maxForceTrace, converged: false, steps: step };
    }
  }
  return { positions, energyTrace, maxForceTrace, converged: false, steps: maxSteps };
}
