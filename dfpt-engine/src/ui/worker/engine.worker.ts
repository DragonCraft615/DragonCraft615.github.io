/// <reference lib="webworker" />
import { stateAt, volume, type CellState } from "../../engine/state.ts";
import { freqs, solveModes } from "../../engine/dynamicalMatrix.ts";
import { gridFreqs } from "../../engine/grid.ts";
import { thermo } from "../../engine/thermo.ts";
import { seismic } from "../../engine/seismic.ts";
import { buildSupercell, type Supercell, type Vec3 } from "../../engine/supercell.ts";
import { relax } from "../../engine/relax.ts";
import { perturbedPositions } from "../../engine/perturb.ts";
import { gammaFrequencies } from "../../engine/gammaStability.ts";
import { supercellFreqs, supercellSolveModes } from "../../engine/supercellDynamics.ts";
import type {
  WorkerRequest,
  WorkerMessage,
  Conditions,
  CellResponse,
  DispersionResponse,
  GridResponse,
  ThermoCurveResponse,
  ThermoAtResponse,
  SeismicCurveResponse,
  SeismicAtResponse,
  DepthProfileResponse,
  ModesAtResponse,
  BuildSupercellResponse,
  RelaxSupercellResponse,
  GammaStabilityResponse,
  Phase4Atom,
  Phase4DispersionResponse,
  Phase4ModesAtResponse,
} from "./protocol.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const stateCache = new Map<string, CellState>();
function key(c: Conditions): string {
  return `${c.P}|${c.gamma}|${c.bOO}`;
}
function getState(c: Conditions): CellState {
  const k = key(c);
  let s = stateCache.get(k);
  if (!s) {
    s = stateAt(c.P, c.gamma, c.bOO);
    stateCache.set(k, s);
  }
  return s;
}

const gridCache = new Map<string, number[]>();
function getGrid(c: Conditions, mp: number): number[] {
  const k = `${key(c)}|${mp}`;
  let g = gridCache.get(k);
  if (!g) {
    const s = getState(c);
    g = gridFreqs(s.bonds, s.K, s.a, mp);
    gridCache.set(k, g);
  }
  return g;
}

const supercellCache = new Map<string, Supercell>();
function getSupercell(c: Conditions, nx: number, ny: number, nz: number): Supercell {
  const k = `${key(c)}|${nx}x${ny}x${nz}`;
  let sc = supercellCache.get(k);
  if (!sc) {
    const s = getState(c);
    sc = buildSupercell(s.a, nx, ny, nz);
    supercellCache.set(k, sc);
  }
  return sc;
}

function toAngstromAtoms(positions: readonly Vec3[]): { x: number; y: number; z: number }[] {
  return positions.map((p) => ({ x: p[0] * 1e10, y: p[1] * 1e10, z: p[2] * 1e10 }));
}

const PATH: { to: [number, number, number]; lab: string }[] = [
  { to: [0.5, 0, 0], lab: "X" },
  { to: [0.5, 0.5, 0], lab: "M" },
  { to: [0, 0, 0], lab: "Γ" },
  { to: [0.5, 0.5, 0.5], lab: "R" },
];

function seismicAt(P: number, gamma: number, bOO: number, T: number): SeismicAtResponse {
  const st = getState({ P, gamma, bOO });
  const v = seismic(st.bonds, st.K, st.a);
  const fP = Math.exp((-2.0e-5 * T) / 2);
  const fS = Math.exp((-0.8e-5 * T) / 2);
  return { vP: v.vP * fP, vS: v.vS * fS, rho: st.rho };
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, body } = ev.data;
  try {
    switch (body.type) {
      case "cell": {
        const s = getState(body);
        const p: number[] = [], v: number[] = [];
        for (let P = 0; P <= 120; P += 2) {
          p.push(P);
          v.push(volume(P) * 1e30);
        }
        const res: CellResponse = { a: s.a, V: s.V, rho: s.rho, sc: s.sc, compression: { p, v } };
        post(id, res);
        break;
      }
      case "dispersion": {
        const s = getState(body);
        const NPT = 24;
        const xs: number[] = [];
        const qs: [number, number, number][] = [];
        const branches: number[][] = Array.from({ length: 15 }, () => []);
        let from: [number, number, number] = [0, 0, 0];
        let x = 0;
        const marks: [number, string][] = [[0, "Γ"]];
        for (const seg of PATH) {
          for (let k = 1; k <= NPT; k++) {
            const f: [number, number, number] = [
              from[0] + (seg.to[0] - from[0]) * (k / NPT),
              from[1] + (seg.to[1] - from[1]) * (k / NPT),
              from[2] + (seg.to[2] - from[2]) * (k / NPT),
            ];
            const q: [number, number, number] = [
              (f[0] * 2 * Math.PI) / s.a,
              (f[1] * 2 * Math.PI) / s.a,
              (f[2] * 2 * Math.PI) / s.a,
            ];
            const w = freqs(q, s.bonds, s.K).sort((a, b) => a - b);
            xs.push(x + k / NPT);
            qs.push(f);
            w.forEach((val, b) => branches[b].push(val));
          }
          x += 1;
          marks.push([x, seg.lab]);
          from = seg.to;
        }
        let vmax = 0, vmin = 0, nim = 0, ntot = 0;
        for (const br of branches) {
          for (const v of br) {
            vmax = Math.max(vmax, v);
            vmin = Math.min(vmin, v);
            ntot++;
            if (v < -1) nim++;
          }
        }
        const res: DispersionResponse = {
          xs,
          qs,
          branches,
          marks,
          vmax,
          vmin,
          imFraction: ntot ? nim / ntot : 0,
          aAngstrom: s.a * 1e10,
        };
        post(id, res);
        break;
      }
      case "grid": {
        const s = getState(body);
        const g = gridFreqs(s.bonds, s.K, s.a, body.mp, (done, total) => {
          ctx.postMessage({ kind: "progress", id, done, total } satisfies WorkerMessage);
        });
        gridCache.set(`${key(body)}|${body.mp}`, g);
        const res: GridResponse = { freqs: g, nq: body.mp ** 3 };
        post(id, res);
        break;
      }
      case "thermoCurve": {
        const gw = getGrid(body, body.mp);
        const nq = body.mp ** 3;
        const Ts: number[] = [], Cvs: number[] = [], Ss: number[] = [];
        for (let T = 20; T <= 3000; T += 40) {
          const t = thermo(gw, nq, T);
          Ts.push(T);
          Cvs.push(t.Cv);
          Ss.push(t.S);
        }
        const res: ThermoCurveResponse = { Ts, Cvs, Ss };
        post(id, res);
        break;
      }
      case "thermoAt": {
        const gw = getGrid(body, body.mp);
        const nq = body.mp ** 3;
        const s = getState(body);
        const t = thermo(gw, nq, body.T);
        const H = t.U + body.P * 1e9 * s.V * 6.022e23;
        const res: ThermoAtResponse = { F: t.F, U: t.U, S: t.S, Cv: t.Cv, H };
        post(id, res);
        break;
      }
      case "seismicCurve": {
        const Ps: number[] = [], vP: number[] = [], vS: number[] = [], Z: number[] = [];
        for (let p = 0; p <= 120; p += 6) {
          const r = seismicAt(p, body.gamma, body.bOO, body.T);
          Ps.push(p);
          vP.push(r.vP / 1000);
          vS.push(r.vS / 1000);
          Z.push((r.rho / 1000) * (r.vP / 1000));
        }
        const res: SeismicCurveResponse = { Ps, vP, vS, Z };
        post(id, res);
        break;
      }
      case "seismicAt": {
        const res = seismicAt(body.P, body.gamma, body.bOO, body.T);
        post(id, res);
        break;
      }
      case "depthProfile": {
        const ds: number[] = [], vP: number[] = [], vS: number[] = [], rho: number[] = [], Z: number[] = [];
        for (let d = 670; d <= 2891; d += 90) {
          const P = 24 + (136 - 24) * ((d - 670) / 2221);
          const T = 1900 + (1000 * (d - 670)) / 2221;
          const r = seismicAt(P, body.gamma, body.bOO, T);
          ds.push(d);
          vP.push(r.vP / 1000);
          vS.push(r.vS / 1000);
          rho.push(r.rho / 1000);
          Z.push((r.rho / 1000) * (r.vP / 1000));
        }
        const res: DepthProfileResponse = { ds, vP, vS, rho, Z };
        post(id, res);
        break;
      }
      case "modesAt": {
        const s = getState(body);
        const q: [number, number, number] = [
          (body.q[0] * 2 * Math.PI) / s.a,
          (body.q[1] * 2 * Math.PI) / s.a,
          (body.q[2] * 2 * Math.PI) / s.a,
        ];
        const modes = solveModes(q, s.bonds, s.K);
        const res: ModesAtResponse = { modes };
        post(id, res);
        break;
      }
      case "buildSupercell": {
        const s = getState(body);
        const sc = getSupercell(body, body.nx, body.ny, body.nz);
        const atoms: Phase4Atom[] = sc.referencePositions.map((p, i) => ({
          basisIndex: sc.basisIndex[i],
          x: p[0] * 1e10,
          y: p[1] * 1e10,
          z: p[2] * 1e10,
        }));
        const res: BuildSupercellResponse = {
          atoms,
          box: [sc.box[0] * 1e10, sc.box[1] * 1e10, sc.box[2] * 1e10],
          aAngstrom: s.a * 1e10,
        };
        post(id, res);
        break;
      }
      case "relaxSupercell": {
        const s = getState(body);
        const sc = getSupercell(body, body.nx, body.ny, body.nz);
        // Condense two of R's three degenerate rotation modes (rotations
        // about two different cubic axes) — this model's own R-point
        // instability is a clean triplet of pure single-axis octahedral
        // rotations, and combining two of them is exactly how the thesis's
        // Phase 2 + Phase 3 -> Phase 4 combination works (fig 4.6): two
        // independent tilt axes condensed together, not one mode alone.
        const qFrac: [number, number, number] = [0.5, 0.5, 0.5];
        const qR: [number, number, number] = [
          (qFrac[0] * 2 * Math.PI) / s.a,
          (qFrac[1] * 2 * Math.PI) / s.a,
          (qFrac[2] * 2 * Math.PI) / s.a,
        ];
        const modesAtR = solveModes(qR, s.bonds, s.K).sort((a, b) => a.freqCm - b.freqCm);
        const unstable = modesAtR.filter((m) => m.freqCm < -1);
        const chosen = unstable.length >= 2 ? unstable.slice(0, 2) : modesAtR.slice(0, 1);
        const amplitude = body.amplitudeFrac * s.a;
        const seeds = chosen.map((mode) => ({ mode, qFrac, amplitudeMetres: amplitude }));

        const start = perturbedPositions(sc, seeds);
        const KEYFRAME_STRIDE = 8;
        const keyframes: { x: number; y: number; z: number }[][] = [toAngstromAtoms(start)];
        const result = relax(sc, s.K, start, {
          maxSteps: body.maxSteps,
          onStep: (st) => {
            if (st.step % KEYFRAME_STRIDE === 0) keyframes.push(toAngstromAtoms(st.positions));
            if (st.step % 4 === 0) {
              ctx.postMessage({ kind: "progress", id, done: st.step, total: body.maxSteps } satisfies WorkerMessage);
            }
          },
        });
        keyframes.push(toAngstromAtoms(result.positions));

        const res: RelaxSupercellResponse = {
          box: [sc.box[0] * 1e10, sc.box[1] * 1e10, sc.box[2] * 1e10],
          basisIndex: sc.basisIndex,
          referenceAtoms: toAngstromAtoms(sc.referencePositions),
          keyframes,
          energyTrace: result.energyTrace,
          maxForceTrace: result.maxForceTrace,
          converged: result.converged,
          steps: result.steps,
          seedFreqsCm: chosen.map((m) => m.freqCm),
          qUsed: qFrac,
        };
        post(id, res);
        break;
      }
      case "gammaStability": {
        const s = getState(body);
        const sc = getSupercell(body, body.nx, body.ny, body.nz);
        const positions: Vec3[] = body.positions.map((p) => [p.x * 1e-10, p.y * 1e-10, p.z * 1e-10]);
        const freqsGamma = gammaFrequencies(sc, s.K, positions);
        const nim = freqsGamma.filter((f) => f < -1).length;
        const res: GammaStabilityResponse = { freqs: freqsGamma, imFraction: nim / freqsGamma.length };
        post(id, res);
        break;
      }
      case "phase4Dispersion": {
        const sc = getSupercell(body, body.nx, body.ny, body.nz);
        const s = getState(body);
        const positions: Vec3[] = body.positions.map((p) => [p.x * 1e-10, p.y * 1e-10, p.z * 1e-10]);
        const [Lx, Ly, Lz] = sc.box;
        const NPT = 8;
        const total = PATH.length * NPT;
        const xs: number[] = [];
        const qs: [number, number, number][] = [];
        const branches: number[][] = Array.from({ length: 3 * sc.NAT }, () => []);
        let from: [number, number, number] = [0, 0, 0];
        let x = 0;
        let done = 0;
        const marks: [number, string][] = [[0, "Γ"]];
        for (const seg of PATH) {
          for (let k = 1; k <= NPT; k++) {
            const f: [number, number, number] = [
              from[0] + (seg.to[0] - from[0]) * (k / NPT),
              from[1] + (seg.to[1] - from[1]) * (k / NPT),
              from[2] + (seg.to[2] - from[2]) * (k / NPT),
            ];
            const q: [number, number, number] = [
              (f[0] * 2 * Math.PI) / Lx,
              (f[1] * 2 * Math.PI) / Ly,
              (f[2] * 2 * Math.PI) / Lz,
            ];
            const w = supercellFreqs(q, sc, s.K, positions);
            xs.push(x + k / NPT);
            qs.push(f);
            w.forEach((val, b) => branches[b].push(val));
            done++;
            ctx.postMessage({ kind: "progress", id, done, total } satisfies WorkerMessage);
          }
          x += 1;
          marks.push([x, seg.lab]);
          from = seg.to;
        }
        let vmax = 0, vmin = 0, nim = 0, ntot = 0;
        for (const br of branches) {
          for (const v of br) {
            vmax = Math.max(vmax, v);
            vmin = Math.min(vmin, v);
            ntot++;
            if (v < -1) nim++;
          }
        }
        const res: Phase4DispersionResponse = { xs, qs, branches, marks, vmax, vmin, imFraction: ntot ? nim / ntot : 0 };
        post(id, res);
        break;
      }
      case "phase4ModesAt": {
        const sc = getSupercell(body, body.nx, body.ny, body.nz);
        const s = getState(body);
        const positions: Vec3[] = body.positions.map((p) => [p.x * 1e-10, p.y * 1e-10, p.z * 1e-10]);
        const [Lx, Ly, Lz] = sc.box;
        const q: [number, number, number] = [
          (body.q[0] * 2 * Math.PI) / Lx,
          (body.q[1] * 2 * Math.PI) / Ly,
          (body.q[2] * 2 * Math.PI) / Lz,
        ];
        const modes = supercellSolveModes(q, sc, s.K, positions);
        const res: Phase4ModesAtResponse = { modes };
        post(id, res);
        break;
      }
    }
  } catch (err) {
    ctx.postMessage({
      kind: "error",
      id,
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerMessage);
  }
};

function post(id: number, result: unknown) {
  ctx.postMessage({ kind: "result", id, result } satisfies WorkerMessage);
}
