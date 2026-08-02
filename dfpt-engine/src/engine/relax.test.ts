import { describe, it, expect } from "vitest";
import { buildSupercell } from "./supercell.ts";
import { bondEnergyForce, relax } from "./relax.ts";
import { perturbedPositions } from "./perturb.ts";
import { gammaFrequencies } from "./gammaStability.ts";
import { stateAt } from "./state.ts";
import { solveModes } from "./dynamicalMatrix.ts";
import { N3 } from "./constants.ts";

describe("bondEnergyForce", () => {
  it("analytic force matches a numerical gradient of the energy", () => {
    const a = 3.467e-10;
    const sc = buildSupercell(a, 2, 2, 1);
    const K = stateAt(0, 1.4, 3.0).K;

    // small random-ish displacement away from the reference geometry
    const positions = sc.referencePositions.map((p, i) => {
      const s = ((i * 37 + 11) % 13) - 6; // deterministic pseudo-random in [-6,6]
      const eps = 0.01 * a;
      return [p[0] + eps * Math.sin(s), p[1] + eps * Math.cos(s * 1.3), p[2] + eps * Math.sin(s * 0.7)] as [number, number, number];
    });

    const { F } = bondEnergyForce(sc, K, positions);
    const delta = a * 1e-6;

    for (const idx of [0, 5, 12, sc.NAT - 1]) {
      for (let c = 0; c < 3; c++) {
        const pp = positions.map((p) => [...p] as [number, number, number]);
        pp[idx][c] += delta;
        const pm = positions.map((p) => [...p] as [number, number, number]);
        pm[idx][c] -= delta;
        const Ep = bondEnergyForce(sc, K, pp).E;
        const Em = bondEnergyForce(sc, K, pm).E;
        const numericalForce = -(Ep - Em) / (2 * delta); // F = -dE/dx
        expect(F[idx][c]).toBeCloseTo(numericalForce, 6);
      }
    }
  });

  it("vanishes at the reference (undistorted) geometry", () => {
    const a = 3.467e-10;
    const sc = buildSupercell(a, 2, 2, 1);
    const K = stateAt(0, 1.4, 3.0).K;
    const { E, F } = bondEnergyForce(sc, K, sc.referencePositions);
    expect(E).toBeCloseTo(0, 10);
    for (const f of F) for (const c of f) expect(Math.abs(c)).toBeLessThan(1e-15);
  });
});

describe("perturb + relax", () => {
  it("relaxing an unstable supercell lowers energy and shrinks the max force", () => {
    const s = stateAt(0, 1.4, -15); // unstable B(O-O), matches the dispersion-stage saddle-point demo
    const a = s.a;
    const sc = buildSupercell(a, 2, 2, 3); // 60 atoms
    const qX: [number, number, number] = [Math.PI / a, 0, 0];
    const modes = solveModes(qX, s.bonds, s.K);
    const unstable = modes.reduce((worst, m) => (m.freqCm < worst.freqCm ? m : worst));
    expect(unstable.freqCm).toBeLessThan(-1); // sanity: X really is unstable here

    const qFrac: [number, number, number] = [0.5, 0, 0];
    const start = perturbedPositions(sc, unstable, qFrac, 0.03 * a);
    const startState = bondEnergyForce(sc, s.K, start);

    const result = relax(sc, s.K, start, { maxSteps: 300 });
    const endState = bondEnergyForce(sc, s.K, result.positions);

    expect(endState.E).toBeLessThan(startState.E);
    expect(result.maxForceTrace[result.maxForceTrace.length - 1]).toBeLessThan(result.maxForceTrace[0] * 0.1);
  });
});

describe("gammaFrequencies", () => {
  it("the undistorted 60-atom supercell reproduces primitive-cell Gamma acoustic behaviour", () => {
    const s = stateAt(0, 1.4, 3.0); // stable conditions
    const sc = buildSupercell(s.a, 2, 2, 3);
    const freqs = gammaFrequencies(sc, s.K, sc.referencePositions);
    expect(freqs).toHaveLength(3 * sc.NAT);
    // 3 acoustic modes must vanish at Gamma regardless of cell size
    for (let k = 0; k < 3; k++) expect(Math.abs(freqs[k])).toBeLessThan(1);
    // stable conditions: nothing meaningfully imaginary
    expect(freqs.filter((f) => f < -1)).toHaveLength(0);
  });

  it("matches the primitive cell's own zone-boundary check: unstable K(O-O) shows up as imaginary at Gamma once folded into the supercell", () => {
    const s = stateAt(0, 1.4, -15);
    const sc = buildSupercell(s.a, 2, 2, 3);
    const freqs = gammaFrequencies(sc, s.K, sc.referencePositions);
    expect(freqs.some((f) => f < -1)).toBe(true);
  });
});

// sanity: N3 still 15 for the primitive cell (unrelated to supercell work, guards against accidental edits)
describe("regression guard", () => {
  it("primitive cell degrees of freedom unchanged", () => {
    expect(N3).toBe(15);
  });
});
