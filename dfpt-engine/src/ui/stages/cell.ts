import type { EngineClient } from "../worker/client.ts";
import type { UIState } from "../state.ts";
import { mountStructureViewer, type StructureViewer } from "../three/structureViewer.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let viewer: StructureViewer | null = null;

export async function drawCell(client: EngineClient, ui: UIState): Promise<void> {
  const res = await client.request({ type: "cell", P: ui.P, gamma: ui.gam, bOO: ui.boo });

  if (!viewer) viewer = mountStructureViewer($("cell3d"));
  viewer.setLatticeParameter(res.a * 1e10);

  drawCompressionInset(res.compression, ui.P);

  $("c_a").textContent = (res.a * 1e10).toFixed(3);
  $("c_v").textContent = (res.V * 1e30).toFixed(2);
  $("c_r").textContent = (res.rho / 1000).toFixed(2);
  $("c_s").textContent = "×" + res.sc.toFixed(2);
}

function drawCompressionInset(compression: { p: number[]; v: number[] }, currentP: number): void {
  const cv = $<HTMLCanvasElement>("compCv");
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cv.width, cv.height);

  const M = { L: 44, R: 16, T: 30, B: 46 };
  const XX = (p: number) => M.L + (p / 120) * (cv.width - M.L - M.R);
  const YY = (v: number) => cv.height - M.B - ((v - 29) / 13) * (cv.height - M.T - M.B);

  ctx.strokeStyle = "#D5D9D4";
  ctx.font = "10.5px ui-monospace,monospace";
  ctx.fillStyle = "#5A616C";
  for (const t of [30, 34, 38, 42]) {
    ctx.beginPath();
    ctx.moveTo(M.L, YY(t) + 0.5);
    ctx.lineTo(cv.width - M.R, YY(t) + 0.5);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(String(t), M.L - 6, YY(t) + 4);
  }
  for (const t of [0, 40, 80, 120]) {
    ctx.textAlign = "center";
    ctx.fillText(String(t), XX(t), cv.height - M.B + 16);
  }
  ctx.strokeStyle = "#1B1F26";
  ctx.strokeRect(M.L + 0.5, M.T + 0.5, cv.width - M.L - M.R - 1, cv.height - M.T - M.B - 1);
  ctx.fillStyle = "#1B1F26";
  ctx.textAlign = "center";
  ctx.fillText("Pressure (GPa)", (M.L + cv.width - M.R) / 2, cv.height - 16);
  ctx.fillText("V (Å³) — fig 4.8", (M.L + cv.width - M.R) / 2, 18);

  ctx.strokeStyle = "#2E5FA3";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  compression.p.forEach((p, i) => {
    const v = compression.v[i];
    i ? ctx.lineTo(XX(p), YY(v)) : ctx.moveTo(XX(p), YY(v));
  });
  ctx.stroke();

  const curP = compression.p.reduce((best, p) => (Math.abs(p - currentP) < Math.abs(best - currentP) ? p : best));
  const curV = compression.v[compression.p.indexOf(curP)];
  ctx.fillStyle = "#DD9530";
  ctx.beginPath();
  ctx.arc(XX(currentP), YY(curV), 4.5, 0, 7);
  ctx.fill();
}
