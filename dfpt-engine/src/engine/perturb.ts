import { normalisedDisplacements, displacementAt } from "./displacement.ts";
import type { Mode } from "./dynamicalMatrix.ts";
import type { Supercell, Vec3 } from "./supercell.ts";

/**
 * "Freeze in" a phonon mode as a static real-space distortion of the
 * supercell — the standard frozen-phonon trick: each primitive-cell replica
 * at integer offset R gets the mode's eigenvector rotated by the Bloch phase
 * exp(i 2*pi*q.R), scaled to a physical amplitude (metres). Requires q
 * commensurate with the supercell (q_x*nx, q_y*ny, q_z*nz all integers) or
 * the pattern won't close periodically across it.
 */
export function perturbedPositions(sc: Supercell, mode: Mode, qFrac: Vec3, amplitudeMetres: number): Vec3[] {
  const disp = normalisedDisplacements(mode);
  return sc.referencePositions.map((pos, idx) => {
    const basis = sc.basisIndex[idx];
    const R = sc.cellOffsets[idx];
    const phase = 2 * Math.PI * (qFrac[0] * R[0] + qFrac[1] * R[1] + qFrac[2] * R[2]);
    const [dx, dy, dz] = displacementAt(disp[basis], -phase);
    return [pos[0] + amplitudeMetres * dx, pos[1] + amplitudeMetres * dy, pos[2] + amplitudeMetres * dz] as Vec3;
  });
}
