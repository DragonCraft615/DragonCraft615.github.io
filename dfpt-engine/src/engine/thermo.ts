import { HBAR, KB, CLIGHT, N_AV } from "./constants.ts";

export interface ThermoResult {
  /** Helmholtz free energy, J/mol (includes zero-point). */
  F: number;
  /** Internal energy, J/mol (includes zero-point). */
  U: number;
  /** Entropy, J/K/mol. */
  S: number;
  /** Heat capacity at constant volume, J/K/mol. */
  Cv: number;
}

/**
 * Exact per-mode quantum harmonic oscillator partition function, summed over
 * a sampled frequency grid (cm^-1, signed — imaginary modes excluded) and
 * normalised per mole of formula units. Analytic S and Cv (no finite
 * differences), recovering the Dulong-Petit limit 3N*kB exactly as T -> inf.
 */
export function thermo(gridFreqsCm: readonly number[], nq: number, T: number): ThermoResult {
  let F = 0, U = 0, Cv = 0;
  for (const wcm of gridFreqsCm) {
    if (wcm <= 1) continue; // skip imaginary/acoustic-at-Gamma numerical noise
    const w = wcm * 2 * Math.PI * CLIGHT;
    const x = (HBAR * w) / (KB * T);
    const em = Math.expm1(x);
    F += (HBAR * w) / 2 + KB * T * Math.log(-Math.expm1(-x));
    U += (HBAR * w) / 2 + (HBAR * w) / em;
    Cv += (KB * x * x * Math.exp(x)) / (em * em);
  }
  const per = N_AV / nq;
  return { F: F * per, U: U * per, S: ((U - F) * per) / T, Cv: Cv * per };
}
