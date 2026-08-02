import { CLIGHT, type ForceConstants } from "./constants.ts";
import { jacobiEigenvalues } from "./eigen.ts";
import { bondEnergyForce } from "./relax.ts";
import type { Supercell, Vec3 } from "./supercell.ts";

/**
 * Gamma-point (q=0) stability check on a relaxed supercell: the dynamical
 * matrix at q=0 is just the mass-weighted Hessian of the (nonlinear) bond
 * energy at the current geometry — real-valued, no complex embedding needed.
 * The Hessian is taken numerically (central differences on the analytic
 * forces) since a hand-derived analytic Hessian of the nonlinear stretch
 * term isn't worth the bug risk for an on-demand diagnostic.
 */
export function gammaFrequencies(sc: Supercell, K: ForceConstants, positions: readonly Vec3[]): number[] {
  const n = sc.NAT;
  const dof = 3 * n;
  const delta = 1e-13; // metres

  const flat = (p: readonly Vec3[]): Float64Array => {
    const out = new Float64Array(dof);
    p.forEach((v, i) => { out[3 * i] = v[0]; out[3 * i + 1] = v[1]; out[3 * i + 2] = v[2]; });
    return out;
  };
  const unflat = (arr: Float64Array): Vec3[] => {
    const out: Vec3[] = [];
    for (let i = 0; i < n; i++) out.push([arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]]);
    return out;
  };

  const x0 = flat(positions);
  const H = Array.from({ length: dof }, () => new Float64Array(dof));
  for (let b = 0; b < dof; b++) {
    const xp = x0.slice(); xp[b] += delta;
    const xm = x0.slice(); xm[b] -= delta;
    const Fp = bondEnergyForce(sc, K, unflat(xp)).F;
    const Fm = bondEnergyForce(sc, K, unflat(xm)).F;
    for (let a = 0; a < n; a++) {
      for (let c = 0; c < 3; c++) {
        const row = 3 * a + c;
        // F = -grad(E)  =>  Hessian = -dF/dx
        H[row][b] = -(Fp[a][c] - Fm[a][c]) / (2 * delta);
      }
    }
  }

  const D = Array.from({ length: dof }, () => new Float64Array(dof));
  for (let a = 0; a < n; a++) {
    for (let ca = 0; ca < 3; ca++) {
      const ia = 3 * a + ca;
      for (let bAtom = 0; bAtom < n; bAtom++) {
        for (let cb = 0; cb < 3; cb++) {
          const ib = 3 * bAtom + cb;
          const symmetrised = 0.5 * (H[ia][ib] + H[ib][ia]);
          D[ia][ib] = symmetrised / Math.sqrt(sc.masses[a] * sc.masses[bAtom]);
        }
      }
    }
  }

  const ev = jacobiEigenvalues(D, dof);
  return ev
    .map((w2) => (Math.sign(w2) * Math.sqrt(Math.abs(w2))) / (2 * Math.PI * CLIGHT))
    .sort((a, b) => a - b);
}
