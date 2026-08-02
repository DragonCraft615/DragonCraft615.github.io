/// <reference lib="webworker" />
import { stateAt, volume, type CellState } from "../../engine/state.ts";
import { freqs, solveModes } from "../../engine/dynamicalMatrix.ts";
import { gridFreqs } from "../../engine/grid.ts";
import { thermo } from "../../engine/thermo.ts";
import { seismic } from "../../engine/seismic.ts";
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
