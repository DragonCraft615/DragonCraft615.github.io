import { FRAC, NAT, MASS, type BondKind } from "./constants.ts";

export type Vec3 = [number, number, number];

export interface SupercellBond {
  i: number;
  j: number;
  /** Reference (equilibrium) separation vector j -> i's nearest periodic image, metres. */
  d0: Vec3;
  kind: BondKind;
}

export interface Supercell {
  nx: number;
  ny: number;
  nz: number;
  NAT: number;
  /** Which of the 5 primitive-cell basis atoms (0=Mg,1=Si,2/3/4=O) each supercell atom is. */
  basisIndex: number[];
  /** Integer (cx,cy,cz) primitive-cell offset each supercell atom sits in. */
  cellOffsets: Vec3[];
  masses: number[];
  /** Reference (Phase-1, undistorted) real-space positions, metres. */
  referencePositions: Vec3[];
  bonds: SupercellBond[];
  /** Box dimensions Lx, Ly, Lz, metres. */
  box: Vec3;
}

/**
 * Build an (nx x ny x nz) replication of the 5-atom cubic cell — e.g. 2x2x3
 * gives the 60-atom orthorhombic-shaped supercell used for the Phase 4
 * relaxation. Reference geometry only (undistorted Phase-1 positions);
 * callers perturb and relax from here.
 */
export function buildSupercell(a: number, nx: number, ny: number, nz: number): Supercell {
  const basisIndex: number[] = [];
  const cellOffsets: Vec3[] = [];
  const masses: number[] = [];
  const referencePositions: Vec3[] = [];

  for (let cz = 0; cz < nz; cz++) {
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = 0; cx < nx; cx++) {
        for (let k = 0; k < NAT; k++) {
          basisIndex.push(k);
          cellOffsets.push([cx, cy, cz]);
          masses.push(MASS[k]);
          referencePositions.push([
            (cx + FRAC[k][0]) * a,
            (cy + FRAC[k][1]) * a,
            (cz + FRAC[k][2]) * a,
          ]);
        }
      }
    }
  }

  const box: Vec3 = [nx * a, ny * a, nz * a];
  const bonds = buildSupercellBonds(a, box, basisIndex, referencePositions);
  return {
    nx, ny, nz,
    NAT: basisIndex.length,
    basisIndex,
    cellOffsets,
    masses,
    referencePositions,
    bonds,
    box,
  };
}

function buildSupercellBonds(
  a: number,
  box: Vec3,
  basisIndex: number[],
  pos: Vec3[],
): SupercellBond[] {
  // i < j only: each physical bond (any periodic image) appears exactly once,
  // so a plain (1/2)k*x^2 energy sum with +/-F on (i,j) needs no double-count fixup.
  const bonds: SupercellBond[] = [];
  const cut = { SiO: a * 0.55, MgO: a * 0.75, OO: a * 0.75 };
  const n = basisIndex.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const si = basisIndex[i] === 1, sj = basisIndex[j] === 1;
      const oi = basisIndex[i] >= 2, oj = basisIndex[j] >= 2;
      const mi = basisIndex[i] === 0, mj = basisIndex[j] === 0;
      let kind: BondKind | null = null;
      if ((si && oj) || (oi && sj)) kind = "SiO";
      else if ((mi && oj) || (oi && mj)) kind = "MgO";
      else if (oi && oj) kind = "OO";
      if (!kind) continue;
      const cutoff = cut[kind];

      for (let rx = -1; rx <= 1; rx++) {
        for (let ry = -1; ry <= 1; ry++) {
          for (let rz = -1; rz <= 1; rz++) {
            const d: Vec3 = [
              pos[j][0] + rx * box[0] - pos[i][0],
              pos[j][1] + ry * box[1] - pos[i][1],
              pos[j][2] + rz * box[2] - pos[i][2],
            ];
            const r = Math.hypot(d[0], d[1], d[2]);
            if (r < a * 1e-3 || r >= cutoff) continue;
            bonds.push({ i, j, d0: d, kind });
          }
        }
      }
    }
  }
  return bonds;
}
