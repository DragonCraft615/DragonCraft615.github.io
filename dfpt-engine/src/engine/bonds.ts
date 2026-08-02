import { FRAC, NAT, type BondKind } from "./constants.ts";

export interface Bond {
  i: number;
  j: number;
  /** Cartesian separation vector j -> i's periodic image, metres. */
  d: [number, number, number];
  kind: BondKind;
}

/**
 * Enumerate nearest-neighbour bonds (Si-O, Mg-O, O-O) within cutoff radii
 * scaled from the cubic lattice parameter `a` (metres), searching the 3x3x3
 * block of periodic images. Cutoffs mirror the 2009 prototype's fractions of `a`.
 */
export function buildBonds(a: number): Bond[] {
  const bonds: Bond[] = [];
  const cut = { SiO: a * 0.55, MgO: a * 0.75, OO: a * 0.75 };
  const pos = FRAC.map((f) => f.map((x) => x * a));

  for (let i = 0; i < NAT; i++) {
    for (let j = 0; j < NAT; j++) {
      for (let rx = -1; rx <= 1; rx++) {
        for (let ry = -1; ry <= 1; ry++) {
          for (let rz = -1; rz <= 1; rz++) {
            const d: [number, number, number] = [
              pos[j][0] + rx * a - pos[i][0],
              pos[j][1] + ry * a - pos[i][1],
              pos[j][2] + rz * a - pos[i][2],
            ];
            const r = Math.hypot(d[0], d[1], d[2]);
            if (r < a * 1e-3) continue;

            const si = i === 1, sj = j === 1;
            const oi = i >= 2, oj = j >= 2;

            if (((si && oj) || (oi && sj)) && r < cut.SiO) {
              bonds.push({ i, j, d, kind: "SiO" });
            } else if (((i === 0 && oj) || (oi && j === 0)) && r < cut.MgO) {
              bonds.push({ i, j, d, kind: "MgO" });
            } else if (oi && oj && r < cut.OO) {
              bonds.push({ i, j, d, kind: "OO" });
            }
          }
        }
      }
    }
  }
  return bonds;
}
