import { describe, it, expect } from "vitest";
import { buildSupercell } from "./supercell.ts";
import { stateAt } from "./state.ts";
import { solveModes } from "./dynamicalMatrix.ts";
import { perturbedPositions } from "./perturb.ts";
import { relax } from "./relax.ts";
import { gammaFrequencies } from "./gammaStability.ts";
import { supercellFreqs, supercellSolveModes } from "./supercellDynamics.ts";

describe("supercellFreqs at q=0 matches the independent numerical-Hessian Gamma check", () => {
  it("agrees on the undistorted reference geometry", () => {
    const s = stateAt(0, 1.4, 3.0);
    const sc = buildSupercell(s.a, 2, 2, 2);
    const analytic = supercellFreqs([0, 0, 0], sc, s.K, sc.referencePositions);
    const numerical = gammaFrequencies(sc, s.K, sc.referencePositions);
    expect(analytic).toHaveLength(numerical.length);
    for (let i = 0; i < analytic.length; i++) expect(analytic[i]).toBeCloseTo(numerical[i], 2);
  });

  it("agrees on a relaxed (tilted, anharmonic) geometry", () => {
    const s = stateAt(0, 1.4, -15);
    const sc = buildSupercell(s.a, 2, 2, 2);
    const qFrac: [number, number, number] = [0.5, 0.5, 0.5];
    const qR: [number, number, number] = [Math.PI / s.a, Math.PI / s.a, Math.PI / s.a];
    const unstable = solveModes(qR, s.bonds, s.K)
      .sort((a, b) => a.freqCm - b.freqCm)
      .filter((m) => m.freqCm < -1)
      .slice(0, 2);
    const start = perturbedPositions(sc, unstable.map((mode) => ({ mode, qFrac, amplitudeMetres: 0.03 * s.a })));
    const result = relax(sc, s.K, start, { maxSteps: 200 });

    const analytic = supercellFreqs([0, 0, 0], sc, s.K, result.positions);
    const numerical = gammaFrequencies(sc, s.K, result.positions);
    expect(analytic).toHaveLength(numerical.length);
    for (let i = 0; i < analytic.length; i++) expect(analytic[i]).toBeCloseTo(numerical[i], 1);
  });
});

describe("supercellFreqs acoustic sum rule", () => {
  it("3 acoustic modes vanish at the supercell's own q=0, any geometry", () => {
    const s = stateAt(0, 1.4, 3.0);
    const sc = buildSupercell(s.a, 2, 2, 2);
    const freqs = supercellFreqs([0, 0, 0], sc, s.K, sc.referencePositions);
    for (let k = 0; k < 3; k++) expect(Math.abs(freqs[k])).toBeLessThan(1);
  });
});

describe("supercellSolveModes", () => {
  it("eigenvalues match supercellFreqs at the same q", () => {
    const s = stateAt(0, 1.4, 3.0);
    const sc = buildSupercell(s.a, 2, 2, 2);
    const q: [number, number, number] = [Math.PI / (2 * s.a), 0, 0];
    const freqsOnly = supercellFreqs(q, sc, s.K, sc.referencePositions);
    const modes = supercellSolveModes(q, sc, s.K, sc.referencePositions);
    expect(modes.map((m) => m.freqCm)).toHaveLength(freqsOnly.length);
    for (let i = 0; i < freqsOnly.length; i++) expect(modes[i].freqCm).toBeCloseTo(freqsOnly[i], 6);
  });
});
