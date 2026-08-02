import { plotter, ticks, niceTicks } from "../plot.ts";
import type { EngineClient } from "../worker/client.ts";
import type { UIState } from "../state.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export async function drawSeismic(client: EngineClient, ui: UIState): Promise<void> {
  const [curve, at] = await Promise.all([
    client.request({ type: "seismicCurve", gamma: ui.gam, bOO: ui.boo, T: ui.T }),
    client.request({ type: "seismicAt", P: ui.P, gamma: ui.gam, bOO: ui.boo, T: ui.T }),
  ]);

  const cv = $<HTMLCanvasElement>("seiCv");
  const pl = plotter(cv);
  const ymax = Math.max(...curve.Z, ...curve.vP) * 1.15;
  pl.setRange([0, 120], [0, ymax]);
  pl.frame(
    "Pressure (GPa) — at current T",
    "km/s   ·   Z₀ (thesis units)",
    ticks(0, 120, 6),
    niceTicks([0, ymax]),
    (t) => String(t),
    (t) => String(t),
  );
  pl.line(curve.Ps, curve.vP, "#2E5FA3", 2);
  pl.label(100, curve.vP[17] + 2, "VP", "#2E5FA3");
  pl.line(curve.Ps, curve.vS, "#C0392B", 2);
  pl.label(100, curve.vS[17] + 2, "VS", "#C0392B");
  pl.line(curve.Ps, curve.Z, "#1B1F26", 2);
  pl.label(100, curve.Z[17] + 3, "Z0", "#1B1F26");
  pl.diamond(0, 10.1, "#DD9530");
  pl.diamond(0, 6.32, "#DD9530");
  pl.diamond(0, 44, "#DD9530");
  pl.label(2, 44, "thesis Table 8.1", "#B67318");
  pl.vline(ui.P, "#DD9530");

  $("s_p").textContent = (at.vP / 1000).toFixed(2);
  $("s_s").textContent = (at.vS / 1000).toFixed(2);
  $("s_z").textContent = ((at.rho / 1000) * (at.vP / 1000)).toFixed(1);
}
