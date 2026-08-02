import { normalisedDisplacements, displacementAt } from "./displacement.ts";
import { MASS } from "./constants.ts";
import type { Mode } from "./dynamicalMatrix.ts";
import type { Supercell, Vec3 } from "./supercell.ts";

export interface Seed {
  mode: Mode;
  qFrac: Vec3;
  amplitudeMetres: number;
}

/**
 * "Freeze in" one or more phonon modes as a static real-space distortion of
 * the supercell — the standard frozen-phonon trick: each primitive-cell
 * replica at integer offset R gets each mode's eigenvector rotated by its
 * Bloch phase exp(i 2*pi*q.R), scaled to a physical amplitude (metres) and
 * summed. Requires every seed's q commensurate with the supercell
 * (q_x*nx, q_y*ny, q_z*nz all integers) or the pattern won't close
 * periodically across it.
 *
 * Combining two seeds at the same q but different (degenerate) eigenvectors
 * is exactly how two independent octahedral-rotation axes combine into the
 * real Pbnm-type ground state (thesis fig 4.6: Phase 2 + Phase 3 -> Phase 4).
 */
export function perturbedPositions(sc: Supercell, seeds: Seed[]): Vec3[] {
  const dispBySeed = seeds.map((s) => normalisedDisplacements(s.mode, MASS));
  return sc.referencePositions.map((pos, idx) => {
    const basis = sc.basisIndex[idx];
    const R = sc.cellOffsets[idx];
    let dx = 0, dy = 0, dz = 0;
    seeds.forEach((seed, si) => {
      const phase = 2 * Math.PI * (seed.qFrac[0] * R[0] + seed.qFrac[1] * R[1] + seed.qFrac[2] * R[2]);
      const [ddx, ddy, ddz] = displacementAt(dispBySeed[si][basis], -phase);
      dx += seed.amplitudeMetres * ddx;
      dy += seed.amplitudeMetres * ddy;
      dz += seed.amplitudeMetres * ddz;
    });
    return [pos[0] + dx, pos[1] + dy, pos[2] + dz] as Vec3;
  });
}
