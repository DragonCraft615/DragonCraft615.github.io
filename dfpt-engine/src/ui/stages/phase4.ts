import { plotter, ticks, niceTicks, type Plotter } from "../plot.ts";
import type { EngineClient } from "../worker/client.ts";
import type { UIState } from "../state.ts";
import { mountPhase4Viewer, type Phase4ViewerHandle } from "../three/phase4Viewer.ts";
import { showProgress, hideProgress } from "../progress.ts";
import { MASS } from "../../engine/constants.ts";
import type { RelaxSupercellResponse, Phase4DispersionResponse } from "../worker/protocol.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
// 2x2x2: the minimal cell commensurate with R = (1/2,1/2,1/2), needed to
// combine two of R's three degenerate single-axis rotation modes (see
// worker's relaxSupercell handler). 40 atoms, not 60 -- 60 has no
// all-even factorisation, so it can't host an R-point distortion cleanly.
const NX = 2, NY = 2, NZ = 2;

let viewer: Phase4ViewerHandle | null = null;
let built = false;
let wired = false;
let lastResult: RelaxSupercellResponse | null = null;
let amplitude = 0.03;
let lastDispersion: Phase4DispersionResponse | null = null;
let dispPlot: Plotter | null = null;

export async function drawPhase4(client: EngineClient, ui: UIState): Promise<void> {
  wireControls(client, ui);
  if (!viewer) viewer = mountPhase4Viewer($("phase4-3d"));
  if (!built) {
    const res = await client.request({ type: "buildSupercell", P: ui.P, gamma: ui.gam, bOO: ui.boo, nx: NX, ny: NY, nz: NZ });
    viewer.setReference(res.atoms, res.box);
    built = true;
  }
}

function wireControls(client: EngineClient, ui: UIState): void {
  if (wired) return;
  wired = true;

  $<HTMLInputElement>("p4amp").addEventListener("input", (e) => {
    amplitude = +(e.target as HTMLInputElement).value;
    $("p4ampv").textContent = amplitude.toFixed(3) + " · a";
  });

  $("p4run").addEventListener("click", () => void runRelaxation(client, ui));
  $("p4gamma").addEventListener("click", () => void runGammaCheck(client, ui));
  $("p4disp").addEventListener("click", () => void runPhase4Dispersion(client, ui));

  const cv = $<HTMLCanvasElement>("p4DispCv");
  cv.style.cursor = "crosshair";
  cv.addEventListener("click", (ev) => void onDispersionClick(client, ui, ev, cv));
}

async function runRelaxation(client: EngineClient, ui: UIState): Promise<void> {
  const btn = $<HTMLButtonElement>("p4run");
  btn.disabled = true;
  $<HTMLButtonElement>("p4gamma").disabled = true;
  showProgress("perturbing & relaxing…");

  try {
    const res = await client.request(
      { type: "relaxSupercell", P: ui.P, gamma: ui.gam, bOO: ui.boo, nx: NX, ny: NY, nz: NZ, amplitudeFrac: amplitude, maxSteps: 300 },
      (done, total) => showProgress(`relaxing… step ${done}/${total}`),
    );
    lastResult = res;

    if (!viewer) viewer = mountPhase4Viewer($("phase4-3d"));
    viewer.playTrajectory(res.keyframes);

    drawConvergencePlot(res);

    $("p4_seed").textContent = res.seedFreqsCm.map((f) => f.toFixed(1)).join(" + ");
    $("p4_steps").textContent = String(res.steps);
    $("p4_converged").textContent = res.converged ? "converged" : "stopped (max steps)";
    const startE = res.energyTrace[0], endE = res.energyTrace[res.energyTrace.length - 1];
    // Signed multiple of the (small) initial kick energy, not a percentage —
    // the relaxed well is often much deeper than the initial nudge, so a
    // "% dropped" framing reads as nonsensical (e.g. ">100%").
    const drop = startE !== 0 ? (endE - startE) / Math.abs(startE) : 0;
    $("p4_denergy").textContent = (drop <= 0 ? "" : "+") + drop.toFixed(2) + "×";

    $<HTMLButtonElement>("p4gamma").disabled = false;
    $("p4gammaStatus").textContent = "";
    $<HTMLButtonElement>("p4disp").disabled = false;
    lastDispersion = null;
    $("p4d_hint").textContent = 'Run "Compute dispersion" above to see the relaxed structure\'s own band structure.';
    $("p4d_hint").style.display = "block";
  } finally {
    hideProgress();
    btn.disabled = false;
  }
}

function drawConvergencePlot(res: RelaxSupercellResponse): void {
  const cv = $<HTMLCanvasElement>("p4Cv");
  const pl = plotter(cv);
  const steps = res.energyTrace.map((_, i) => i);
  const E0 = res.energyTrace[0] || 1;
  const relE = res.energyTrace.map((e) => e / Math.abs(E0));
  const maxF0 = res.maxForceTrace[0] || 1;
  const relF = res.maxForceTrace.map((f) => f / maxF0);

  pl.setRange([0, Math.max(1, steps.length - 1)], [0, 1.05]);
  pl.frame(
    "relaxation step",
    "relative to start",
    ticks(0, Math.max(1, steps.length - 1), 5),
    niceTicks([0, 1.05]),
    (t) => t.toFixed(0),
    (t) => t.toFixed(1),
  );
  pl.line(steps, relE, "#1B1F26", 2);
  pl.line(steps, relF, "#C0392B", 2);
  pl.label(steps[steps.length - 1] * 0.7, relE[Math.floor(steps.length * 0.7)] + 0.06, "energy", "#1B1F26");
  pl.label(steps[steps.length - 1] * 0.7, relF[Math.floor(steps.length * 0.7)] + 0.06, "max |force|", "#C0392B");
}

async function runGammaCheck(client: EngineClient, ui: UIState): Promise<void> {
  if (!lastResult) return;
  const btn = $<HTMLButtonElement>("p4gamma");
  btn.disabled = true;
  const dof = 3 * (NX * NY * NZ * 5);
  $("p4gammaStatus").textContent = `diagonalising ${dof}×${dof} Hessian…`;

  try {
    const finalPositions = lastResult.keyframes[lastResult.keyframes.length - 1];
    const res = await client.request({
      type: "gammaStability", P: ui.P, gamma: ui.gam, bOO: ui.boo, nx: NX, ny: NY, nz: NZ, positions: finalPositions,
    });
    const pct = (100 * res.imFraction).toFixed(1);
    $("p4gammaStatus").textContent =
      res.imFraction === 0
        ? "0 imaginary modes at Γ — fully stable"
        : `${pct}% imaginary modes remain at Γ (deeper relaxation or a larger cell may be needed)`;
  } finally {
    btn.disabled = false;
  }
}

async function runPhase4Dispersion(client: EngineClient, ui: UIState): Promise<void> {
  if (!lastResult) return;
  const btn = $<HTMLButtonElement>("p4disp");
  btn.disabled = true;
  showProgress("computing relaxed-structure dispersion…");

  try {
    const finalPositions = lastResult.keyframes[lastResult.keyframes.length - 1];
    const res = await client.request(
      { type: "phase4Dispersion", P: ui.P, gamma: ui.gam, bOO: ui.boo, nx: NX, ny: NY, nz: NZ, positions: finalPositions },
      (done, total) => showProgress(`computing dispersion… ${Math.round((100 * done) / total)}%`),
    );
    lastDispersion = res;
    drawPhase4DispersionPlot(res);
    $("p4d_max").textContent = res.vmax.toFixed(0);
    $("p4d_im").textContent = (100 * res.imFraction).toFixed(1) + " %";
    $("p4d_hint").style.display = "none";
  } finally {
    hideProgress();
    btn.disabled = false;
  }
}

function drawPhase4DispersionPlot(res: Phase4DispersionResponse): void {
  const cv = $<HTMLCanvasElement>("p4DispCv");
  const pl = plotter(cv);
  dispPlot = pl;

  const ylo = Math.min(res.vmin * 1.1, -40);
  const yhi = res.vmax * 1.08;
  pl.setRange([0, 4], [ylo, yhi]);
  pl.frame(
    "wavevector path (supercell's own zone)",
    "ν (cm⁻¹) — imaginary shown negative",
    res.marks.map((m) => m[0]),
    niceTicks([ylo, yhi]),
    (t) => res.marks.find((m) => m[0] === t)?.[1] ?? "",
    (t) => t.toFixed(0),
  );
  if (ylo < 0) pl.band(ylo, 0, "rgba(192,57,46,0.08)");
  pl.line([0, 4], [0, 0], "#8A9096", 1, [3, 4]);
  res.branches.forEach((br) => {
    const anyIm = br.some((v) => v < -1);
    pl.line(res.xs, br, anyIm ? "rgba(192,57,46,0.55)" : "rgba(74,85,104,0.35)", 1);
  });
}

async function onDispersionClick(client: EngineClient, ui: UIState, ev: MouseEvent, cv: HTMLCanvasElement): Promise<void> {
  if (!dispPlot || !lastDispersion || !lastResult) return;
  const rect = cv.getBoundingClientRect();
  const scaleX = cv.width / rect.width, scaleY = cv.height / rect.height;
  const px = (ev.clientX - rect.left) * scaleX;
  const py = (ev.clientY - rect.top) * scaleY;
  const dataX = dispPlot.invX(px);
  const dataY = dispPlot.invY(py);

  const { xs, branches, qs } = lastDispersion;
  let sample = 0, bestDx = Infinity;
  xs.forEach((x, i) => { const dx = Math.abs(x - dataX); if (dx < bestDx) { bestDx = dx; sample = i; } });
  let branch = 0, bestDy = Infinity;
  branches.forEach((br, b) => { const dy = Math.abs(br[sample] - dataY); if (dy < bestDy) { bestDy = dy; branch = b; } });

  dispPlot.diamond(xs[sample], branches[branch][sample], "#16233F", 4.5);
  await selectPhase4Mode(client, ui, qs[sample], branch, branches[branch][sample]);
}

async function selectPhase4Mode(
  client: EngineClient,
  ui: UIState,
  q: [number, number, number],
  branchGuess: number,
  freqGuess: number,
): Promise<void> {
  if (!lastResult) return;
  const finalPositions = lastResult.keyframes[lastResult.keyframes.length - 1];
  const res = await client.request({
    type: "phase4ModesAt", P: ui.P, gamma: ui.gam, bOO: ui.boo, nx: NX, ny: NY, nz: NZ, positions: finalPositions, q,
  });

  let branch = branchGuess;
  if (Math.abs(res.modes[branchGuess]?.freqCm - freqGuess) > 5) {
    let best = Infinity;
    res.modes.forEach((m, i) => { const d = Math.abs(m.freqCm - freqGuess); if (d < best) { best = d; branch = i; } });
  }
  const mode = res.modes[branch];
  const masses = lastResult.basisIndex.map((bi) => MASS[bi]);

  if (!viewer) viewer = mountPhase4Viewer($("phase4-3d"));
  viewer.playMode(finalPositions, mode, masses, 0.35);

  const stability = mode.freqCm < -1 ? "imaginary — still unstable" : "stable";
  $("p4d_hint").style.display = "block";
  $("p4d_hint").textContent =
    `branch ${branch + 1}/${res.modes.length} · ν = ${mode.freqCm.toFixed(1)} cm⁻¹ · q = (${q.map((v) => v.toFixed(2)).join(", ")}) · ${stability} — animating on the structure above.`;
}
