import { plotter, ticks, niceTicks } from "../plot.ts";
import type { EngineClient } from "../worker/client.ts";
import type { UIState } from "../state.ts";
import { showProgress, hideProgress } from "../progress.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export async function drawThermo(client: EngineClient, ui: UIState): Promise<void> {
  showProgress("sweeping thermodynamics…");
  const [curve, at] = await Promise.all([
    client.request({ type: "thermoCurve", P: ui.P, gamma: ui.gam, bOO: ui.boo, mp: ui.mp }),
    client.request({ type: "thermoAt", P: ui.P, gamma: ui.gam, bOO: ui.boo, mp: ui.mp, T: ui.T }),
  ]);
  hideProgress();

  const cv = $<HTMLCanvasElement>("thCv");
  const pl = plotter(cv);
  const DP = 15 * 8.314;
  const ymax = Math.max(DP * 1.12, Math.max(...curve.Ss) * 1.05);
  pl.setRange([0, 3000], [0, ymax]);
  pl.frame("Temperature (K)", "J K⁻¹ mol⁻¹", ticks(0, 3000, 6), niceTicks([0, ymax]), (t) => String(t), (t) => String(t));
  pl.line([0, 3000], [DP, DP], "#8A9096", 1.2, [6, 4]);
  pl.label(2100, DP, "Dulong–Petit 3NkB = 124.7", "#5A616C");
  pl.line(curve.Ts, curve.Cvs, "#1B1F26", 2);
  pl.line(curve.Ts, curve.Ss, "#2E5FA3", 2);
  pl.diamond(300, 78.3, "#DD9530");
  pl.label(300, 78.3, "thesis CV", "#B67318");
  pl.diamond(300, 56.2, "#DD9530");
  pl.label(300, 56.2, "thesis S", "#B67318");
  pl.label(2500, curve.Cvs[curve.Cvs.length - 1] - 9, "CV", "#1B1F26");
  pl.label(2500, curve.Ss[curve.Ss.length - 1] + 9, "S", "#2E5FA3");
  pl.vline(ui.T, "#DD9530");

  $("t_f").textContent = (at.F / 1000).toFixed(1);
  $("t_h").textContent = (at.H / 1000).toFixed(1);
  $("t_s").textContent = at.S.toFixed(1);
  $("t_c").textContent = at.Cv.toFixed(1);
}
