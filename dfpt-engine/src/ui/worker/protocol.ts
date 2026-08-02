export interface Conditions {
  P: number; // GPa
  gamma: number;
  bOO: number; // N/m, pre-scaling
}

export interface CellRequest extends Conditions {
  type: "cell";
}
export interface CellResponse {
  a: number;
  V: number;
  rho: number;
  sc: number;
  compression: { p: number[]; v: number[] };
}

export interface DispersionRequest extends Conditions {
  type: "dispersion";
}
export interface DispersionResponse {
  xs: number[];
  branches: number[][];
  marks: [number, string][];
  vmax: number;
  vmin: number;
  imFraction: number;
  /** Fractional-coordinate q at each xs sample, for on-demand mode solves. */
  qs: [number, number, number][];
  /** Lattice parameter, Angstrom — for scaling the mode viewer. */
  aAngstrom: number;
}

export interface GridRequest extends Conditions {
  type: "grid";
  mp: number;
}
export interface GridResponse {
  freqs: number[];
  nq: number;
}

export interface ThermoCurveRequest extends Conditions {
  type: "thermoCurve";
  mp: number;
}
export interface ThermoCurveResponse {
  Ts: number[];
  Cvs: number[];
  Ss: number[];
}

export interface ThermoAtRequest extends Conditions {
  type: "thermoAt";
  mp: number;
  T: number;
}
export interface ThermoAtResponse {
  F: number;
  U: number;
  S: number;
  Cv: number;
  H: number;
}

export interface SeismicCurveRequest {
  type: "seismicCurve";
  gamma: number;
  bOO: number;
  T: number;
}
export interface SeismicCurveResponse {
  Ps: number[];
  vP: number[];
  vS: number[];
  Z: number[];
}

export interface SeismicAtRequest {
  type: "seismicAt";
  P: number;
  gamma: number;
  bOO: number;
  T: number;
}
export interface SeismicAtResponse {
  vP: number;
  vS: number;
  rho: number;
}

export interface DepthProfileRequest {
  type: "depthProfile";
  gamma: number;
  bOO: number;
}
export interface DepthProfileResponse {
  ds: number[];
  vP: number[];
  vS: number[];
  rho: number[];
  Z: number[];
}

export interface ModesAtRequest {
  type: "modesAt";
  P: number;
  gamma: number;
  bOO: number;
  q: [number, number, number];
}
export interface ModesAtResponse {
  modes: { freqCm: number; vector: { re: number; im: number }[] }[];
}

export interface Phase4Atom {
  basisIndex: number;
  x: number;
  y: number;
  z: number;
}
export interface BuildSupercellRequest extends Conditions {
  type: "buildSupercell";
  nx: number;
  ny: number;
  nz: number;
}
export interface BuildSupercellResponse {
  atoms: Phase4Atom[];
  box: [number, number, number];
  aAngstrom: number;
}

export interface RelaxSupercellRequest extends Conditions {
  type: "relaxSupercell";
  nx: number;
  ny: number;
  nz: number;
  /** Perturbation amplitude as a fraction of the lattice parameter. */
  amplitudeFrac: number;
  maxSteps: number;
}
export interface RelaxSupercellResponse {
  box: [number, number, number];
  basisIndex: number[];
  /** Reference (undistorted) atom positions, Angstrom. */
  referenceAtoms: { x: number; y: number; z: number }[];
  /** Sampled keyframes of the relaxation trajectory, Angstrom. */
  keyframes: { x: number; y: number; z: number }[][];
  energyTrace: number[];
  maxForceTrace: number[];
  converged: boolean;
  steps: number;
  /** Frequency of each seed mode combined into the perturbation (cm^-1). */
  seedFreqsCm: number[];
  qUsed: [number, number, number];
}

export interface GammaStabilityRequest extends Conditions {
  type: "gammaStability";
  nx: number;
  ny: number;
  nz: number;
  /** Positions to check, Angstrom — normally the relaxed result. */
  positions: { x: number; y: number; z: number }[];
}
export interface GammaStabilityResponse {
  freqs: number[];
  imFraction: number;
}

export interface Phase4DispersionRequest extends Conditions {
  type: "phase4Dispersion";
  nx: number;
  ny: number;
  nz: number;
  /** Geometry to compute the dispersion of, Angstrom — normally the relaxed result. */
  positions: { x: number; y: number; z: number }[];
}
export interface Phase4DispersionResponse {
  xs: number[];
  /** Fractional q (supercell's own reduced coordinates) at each xs sample. */
  qs: [number, number, number][];
  branches: number[][];
  marks: [number, string][];
  vmax: number;
  vmin: number;
  imFraction: number;
}

export interface Phase4ModesAtRequest extends Conditions {
  type: "phase4ModesAt";
  nx: number;
  ny: number;
  nz: number;
  positions: { x: number; y: number; z: number }[];
  /** Fractional q, supercell's own reduced coordinates. */
  q: [number, number, number];
}
export interface Phase4ModesAtResponse {
  modes: { freqCm: number; vector: { re: number; im: number }[] }[];
}

export type WorkerRequestBody =
  | CellRequest
  | DispersionRequest
  | GridRequest
  | ThermoCurveRequest
  | ThermoAtRequest
  | SeismicCurveRequest
  | SeismicAtRequest
  | DepthProfileRequest
  | ModesAtRequest
  | BuildSupercellRequest
  | RelaxSupercellRequest
  | GammaStabilityRequest
  | Phase4DispersionRequest
  | Phase4ModesAtRequest;

export type ResponseFor<T extends WorkerRequestBody["type"]> = T extends "cell"
  ? CellResponse
  : T extends "dispersion"
    ? DispersionResponse
    : T extends "grid"
      ? GridResponse
      : T extends "thermoCurve"
        ? ThermoCurveResponse
        : T extends "thermoAt"
          ? ThermoAtResponse
          : T extends "seismicCurve"
            ? SeismicCurveResponse
            : T extends "seismicAt"
              ? SeismicAtResponse
              : T extends "depthProfile"
                ? DepthProfileResponse
                : T extends "modesAt"
                  ? ModesAtResponse
                  : T extends "buildSupercell"
                    ? BuildSupercellResponse
                    : T extends "relaxSupercell"
                      ? RelaxSupercellResponse
                      : T extends "gammaStability"
                        ? GammaStabilityResponse
                        : T extends "phase4Dispersion"
                          ? Phase4DispersionResponse
                          : T extends "phase4ModesAt"
                            ? Phase4ModesAtResponse
                            : never;

export interface WorkerRequest {
  id: number;
  body: WorkerRequestBody;
}

export interface WorkerProgressMessage {
  kind: "progress";
  id: number;
  done: number;
  total: number;
}
export interface WorkerResultMessage {
  kind: "result";
  id: number;
  result: unknown;
}
export interface WorkerErrorMessage {
  kind: "error";
  id: number;
  message: string;
}
export type WorkerMessage = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;
