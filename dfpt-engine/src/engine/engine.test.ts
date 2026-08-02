import { describe, it, expect } from "vitest";
import { stateAt } from "./state.ts";
import { freqs } from "./dynamicalMatrix.ts";
import { gridFreqs } from "./grid.ts";
import { thermo } from "./thermo.ts";
import { seismic } from "./seismic.ts";
import { N3 } from "./constants.ts";

// Validation targets from CLAUDE_CODE_BRIEF.md — must hold before any UI work.

describe("ambient-condition seismic velocities (thesis Table 8.1)", () => {
  const s = stateAt(0, 1.4, 3.0); // 0 GPa, default gamma, default B(O-O)
  const { vP, vS } = seismic(s.bonds, s.K, s.a);

  it("vP is within thesis band", () => {
    expect(vP / 1000).toBeGreaterThanOrEqual(10.0);
    expect(vP / 1000).toBeLessThanOrEqual(10.4);
  });

  it("vS is within thesis band", () => {
    expect(vS / 1000).toBeGreaterThanOrEqual(6.2);
    expect(vS / 1000).toBeLessThanOrEqual(6.6);
  });
});

describe("heat capacity", () => {
  const s = stateAt(0, 1.4, 3.0);
  const n = 6;
  const gw = gridFreqs(s.bonds, s.K, s.a, n);
  const nq = n * n * n;

  it("Cv(300K) sits in the 78-84 J/K/mol band", () => {
    const { Cv } = thermo(gw, nq, 300);
    expect(Cv).toBeGreaterThanOrEqual(78);
    expect(Cv).toBeLessThanOrEqual(84);
  });

  it("Cv(T -> large) approaches Dulong-Petit 3N*kB = 124.7 J/K/mol within 2%", () => {
    const { Cv } = thermo(gw, nq, 6000);
    const dulongPetit = 124.7;
    expect(Math.abs(Cv - dulongPetit) / dulongPetit).toBeLessThan(0.02);
  });
});

describe("acoustic sum rule at Gamma", () => {
  it("three acoustic branches vanish as q -> 0", () => {
    const s = stateAt(0, 1.4, 3.0);
    const qtiny = (1e-4 * 2 * Math.PI) / s.a;
    const w = freqs([qtiny, 0, 0], s.bonds, s.K).sort((a, b) => Math.abs(a) - Math.abs(b));
    expect(w).toHaveLength(N3);
    // lowest three |freq| should be the acoustic branches, essentially zero
    for (let k = 0; k < 3; k++) expect(Math.abs(w[k])).toBeLessThan(1);
  });
});

describe("saddle-point signature (thesis fig 4.2b)", () => {
  it("B(O-O) <= -12 N/m produces imaginary modes at X", () => {
    const s = stateAt(0, 1.4, -12);
    const w = freqs([Math.PI / s.a, 0, 0], s.bonds, s.K); // X = (0.5,0,0)*2pi/a
    expect(w.some((v) => v < -1)).toBe(true);
  });

  it("the default B(O-O) = 3 N/m stays dynamically stable at X", () => {
    const s = stateAt(0, 1.4, 3.0);
    const w = freqs([Math.PI / s.a, 0, 0], s.bonds, s.K);
    expect(w.every((v) => v > -1)).toBe(true);
  });
});
