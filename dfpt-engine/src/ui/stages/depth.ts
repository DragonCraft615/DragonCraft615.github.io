import { plotter, niceTicks } from "../plot.ts";
import type { EngineClient } from "../worker/client.ts";
import type { UIState } from "../state.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export async function drawDepth(client: EngineClient, ui: UIState): Promise<void> {
  const res = await client.request({ type: "depthProfile", gamma: ui.gam, bOO: ui.boo });

  const cv = $<HTMLCanvasElement>("depCv");
  const pl = plotter(cv);
  const ymax = Math.max(...res.Z) * 1.12;
  pl.setRange([670, 2891], [0, ymax]);
  pl.frame(
    "Depth BML (km)",
    "km/s · g/cm³ · Z₀ (thesis units)",
    [670, 1200, 1700, 2200, 2700],
    niceTicks([0, ymax]),
    (t) => String(t),
    (t) => String(t),
  );
  pl.line(res.ds, res.vP, "#2E5FA3", 2);
  pl.label(2650, res.vP[24] + 2, "VP", "#2E5FA3");
  pl.line(res.ds, res.vS, "#C0392B", 2);
  pl.label(2650, res.vS[24] + 2, "VS", "#C0392B");
  pl.line(res.ds, res.rho, "#3E8E5A", 2);
  pl.label(2650, res.rho[24] + 2, "ρ", "#3E8E5A");
  pl.line(res.ds, res.Z, "#1B1F26", 2);
  pl.label(2650, res.Z[24] + 3, "Z0", "#1B1F26");

  const pct = (a: number[]) => "+" + (((100 * (a[a.length - 1] - a[0])) / a[0]).toFixed(0)) + " %";
  $("dp_p").textContent = pct(res.vP);
  $("dp_s").textContent = pct(res.vS);
  $("dp_z").textContent = pct(res.Z);
  $("dp_r").textContent = pct(res.rho);
}
