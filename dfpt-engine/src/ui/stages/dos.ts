import { plotter, niceTicks } from "../plot.ts";
import type { EngineClient } from "../worker/client.ts";
import type { UIState } from "../state.ts";
import { showProgress, hideProgress } from "../progress.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export async function drawDos(client: EngineClient, ui: UIState): Promise<void> {
  showProgress("sampling MP grid…");
  const res = await client.request(
    { type: "grid", P: ui.P, gamma: ui.gam, bOO: ui.boo, mp: ui.mp },
    (done, total) => showProgress(`sampling MP grid… ${Math.round((100 * done) / total)}%`),
  );
  hideProgress();

  const gw = res.freqs;
  const cv = $<HTMLCanvasElement>("dosCv");
  const pl = plotter(cv);
  const lo = Math.min(-60, Math.min(...gw) * 1.1);
  const hi = Math.max(...gw) * 1.08;
  const NB = 160, dw = (hi - lo) / NB, sm = dw * 1.4;
  const g = new Float64Array(NB);
  const xsv: number[] = [];
  for (let b = 0; b < NB; b++) xsv.push(lo + (b + 0.5) * dw);
  for (const w of gw) {
    for (let b = 0; b < NB; b++) {
      const d = (xsv[b] - w) / sm;
      g[b] += Math.exp(-d * d) / (sm * Math.sqrt(Math.PI));
    }
  }
  const gmax = Math.max(...g);
  pl.setRange([lo, hi], [0, gmax * 1.1]);
  pl.frame("ν (cm⁻¹)", "g(ν) (arb.)", niceTicks([lo, hi]), [], (t) => t.toFixed(0));

  const c = pl.ctx;
  c.save();
  c.beginPath();
  c.rect(pl.P.L, pl.P.T, pl.X(0) - pl.P.L, cv.height - pl.P.T - pl.P.B);
  c.clip();
  c.fillStyle = "rgba(192,57,46,0.10)";
  c.fillRect(pl.P.L, pl.P.T, pl.X(0) - pl.P.L, cv.height - pl.P.T - pl.P.B);
  pl.line(xsv, [...g], "#C0392B", 1.8);
  c.restore();
  c.save();
  c.beginPath();
  c.rect(pl.X(0), pl.P.T, cv.width - pl.P.R - pl.X(0), cv.height - pl.P.T - pl.P.B);
  c.clip();
  pl.line(xsv, [...g], "#1B1F26", 1.8);
  c.restore();
  pl.vline(0, "#8A9096");

  $("mpN").textContent = `${ui.mp}³ = ${ui.mp ** 3}`;
}
