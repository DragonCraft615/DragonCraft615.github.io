export const FRAC: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [0.5, 0.5, 0.5],
  [0.5, 0.5, 0],
  [0.5, 0, 0.5],
  [0, 0.5, 0.5],
];

export const AMU = 1.66054e-27; // kg
export const ATOMIC_MASSES_U = [24.305, 28.086, 15.999, 15.999, 15.999] as const; // Mg, Si, O, O, O
export const MASS = ATOMIC_MASSES_U.map((m) => m * AMU); // kg

export const NAT = 5; // atoms per cell
export const N3 = 15; // 3 * NAT degrees of freedom

export const HBAR = 1.0546e-34; // J s
export const KB = 1.3807e-23; // J/K
export const N_AV = 6.022e23; // 1/mol
export const CLIGHT = 2.998e10; // cm/s

export const MCELL = MASS.reduce((a, b) => a + b, 0); // kg per formula unit

/** Zero-pressure cell volume (m^3), thesis §4.5 fit. */
export const V0 = 41.67e-30;

export type BondKind = "SiO" | "MgO" | "OO";

/** Longitudinal/transverse force constants at zero pressure (N/m), thesis Table 8.1 calibration. */
export const K0: Record<BondKind, [number, number]> = {
  SiO: [320, 12.8],
  MgO: [25, 3.75],
  OO: [10, 3.0],
};

export type ForceConstants = Record<BondKind, [number, number]>;
