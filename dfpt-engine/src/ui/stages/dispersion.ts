import { plotter, niceTicks, type Plotter } from "../plot.ts";
import type { EngineClient } from "../worker/client.ts";
import type { UIState } from "../state.ts";
import { mountModeViewer, type ModeViewerHandle } from "../three/modeViewer.ts";
import type { DispersionResponse } from "../worker/protocol.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const AXIS_NAME = ["a", "b", "c"];

let modeViewer: ModeViewerHandle | null = null;
let currentPlot: Plotter | null = null;
let lastResponse: DispersionResponse | null = null;
let clickWired = false;
let playing = true;

export async function drawDisp(client: EngineClient, ui: UIState): Promise<void> {
  const res = await client.request({ type: "dispersion", P: ui.P, gamma: ui.gam, bOO: ui.boo });
  lastResponse = res;
  const cv = $<HTMLCanvasElement>("dispCv");
  const pl = plotter(cv);
  currentPlot = pl;

  const ylo = Math.min(res.vmin * 1.1, -40);
  const yhi = res.vmax * 1.08;
  pl.setRange([0, 4], [ylo, yhi]);
  pl.frame(
    "wavevector path",
    "ν (cm⁻¹)  —  imaginary shown negative",
    res.marks.map((m) => m[0]),
    niceTicks([ylo, yhi]),
    (t) => res.marks.find((m) => m[0] === t)?.[1] ?? "",
    (t) => t.toFixed(0),
  );
  if (ylo < 0) pl.band(ylo, 0, "rgba(192,57,46,0.08)");
  pl.line([0, 4], [0, 0], "#8A9096", 1, [3, 4]);
  res.branches.forEach((br, i) => {
    const anyIm = br.some((v) => v < -1);
    pl.line(res.xs, br, anyIm ? "#C0392B" : i < 3 ? "#2E5FA3" : "#4A5568", i < 3 ? 1.8 : 1.1);
  });

  $("d_max").textContent = res.vmax.toFixed(0);
  $("d_im").textContent = (100 * res.imFraction).toFixed(1) + " %";
  const bad = res.imFraction > 0;
  $("saddle").classList.toggle("show", bad);
  $("stable").classList.toggle("show", !bad);

  wireInteraction(client, ui, cv);
}

function wireInteraction(client: EngineClient, ui: UIState, cv: HTMLCanvasElement): void {
  if (clickWired) return;
  clickWired = true;

  cv.style.cursor = "crosshair";
  cv.addEventListener("click", (ev) => {
    if (!currentPlot || !lastResponse) return;
    const rect = cv.getBoundingClientRect();
    const scaleX = cv.width / rect.width, scaleY = cv.height / rect.height;
    const px = (ev.clientX - rect.left) * scaleX;
    const py = (ev.clientY - rect.top) * scaleY;
    const dataX = currentPlot.invX(px);
    const dataY = currentPlot.invY(py);

    const { xs, branches, qs, aAngstrom } = lastResponse;
    let sample = 0, bestDx = Infinity;
    xs.forEach((x, i) => {
      const dx = Math.abs(x - dataX);
      if (dx < bestDx) { bestDx = dx; sample = i; }
    });
    let branch = 0, bestDy = Infinity;
    branches.forEach((br, b) => {
      const dy = Math.abs(br[sample] - dataY);
      if (dy < bestDy) { bestDy = dy; branch = b; }
    });

    currentPlot.diamond(xs[sample], branches[branch][sample], "#16233F", 4.5);

    void selectMode(client, ui, qs[sample], branch, branches[branch][sample], aAngstrom);
  });

  $("modeAmp").addEventListener("input", (e) => {
    modeViewer?.setAmplitude(+(e.target as HTMLInputElement).value);
  });
  $("modePlay").addEventListener("click", () => {
    playing = !playing;
    modeViewer?.setPlaying(playing);
    $("modePlay").textContent = playing ? "⏸" : "▶";
  });
}

async function selectMode(
  client: EngineClient,
  ui: UIState,
  q: [number, number, number],
  branchGuess: number,
  freqGuess: number,
  aAngstrom: number,
): Promise<void> {
  const res = await client.request({ type: "modesAt", P: ui.P, gamma: ui.gam, bOO: ui.boo, q });
  // pick the mode whose frequency is closest to the branch we clicked, in case
  // solveModes' ordering diverges from freqs' ordering at a near-degenerate point.
  let branch = branchGuess;
  if (Math.abs(res.modes[branchGuess]?.freqCm - freqGuess) > 5) {
    let best = Infinity;
    res.modes.forEach((m, i) => {
      const d = Math.abs(m.freqCm - freqGuess);
      if (d < best) { best = d; branch = i; }
    });
  }
  const mode = res.modes[branch];

  if (!modeViewer) modeViewer = mountModeViewer($("mode3d"));
  modeViewer.showMode(mode, q, aAngstrom);
  playing = true;
  $("modePlay").textContent = "⏸";

  $("modePanel").style.display = "block";
  $("modeHint").style.display = "none";
  const axis = Math.abs(q[0]) >= Math.abs(q[1]) && Math.abs(q[0]) >= Math.abs(q[2]) ? 0 : Math.abs(q[1]) >= Math.abs(q[2]) ? 1 : 2;
  const stability = mode.freqCm < -1 ? "imaginary — dynamically unstable" : "stable";
  $("modeInfo").textContent =
    `branch ${branch + 1}/15 · ν = ${mode.freqCm.toFixed(1)} cm⁻¹ · q = (${q.map((v) => v.toFixed(2)).join(", ")}) · propagating along ${AXIS_NAME[axis]} · ${stability}`;
}
