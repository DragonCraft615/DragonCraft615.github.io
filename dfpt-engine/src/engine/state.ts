import { K0, MCELL, V0, type ForceConstants } from "./constants.ts";
import { buildBonds, type Bond } from "./bonds.ts";

/** Quadratic P -> V compression fit (thesis fig 4.8), returns volume in m^3. */
export function volume(P: number): number {
  return (41.67 - 0.155 * P + 0.00045 * P * P) * 1e-30;
}

export interface CellState {
  /** Cubic lattice parameter, metres. */
  a: number;
  /** Cell volume, m^3. */
  V: number;
  /** Density, kg/m^3. */
  rho: number;
  bonds: Bond[];
  K: ForceConstants;
  /** Force-constant scaling factor applied at this pressure, (V0/V)^2gamma. */
  sc: number;
}

/**
 * Assemble bonds + pressure-scaled force constants at pressure P (GPa),
 * mode-Gruneisen gamma, and an optional override for the octahedral
 * shear stiffness B(O-O) (N/m, pre-scaling) used to probe dynamical stability.
 */
export function stateAt(P: number, gamma: number, bOO?: number | null): CellState {
  const V = volume(P);
  const a = Math.cbrt(V);
  const sc = Math.pow(V0 / V, 2 * gamma);

  const K = {} as ForceConstants;
  for (const k of Object.keys(K0) as (keyof ForceConstants)[]) {
    K[k] = [K0[k][0] * sc, K0[k][1] * sc];
  }
  if (bOO !== null && bOO !== undefined) {
    K.OO = [K.OO[0], bOO * sc];
  }

  return { a, V, rho: MCELL / V, bonds: buildBonds(a), K, sc };
}
