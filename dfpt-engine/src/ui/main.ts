import { EngineClient } from "./worker/client.ts";
import { ui } from "./state.ts";
import { drawCell } from "./stages/cell.ts";
import { drawDisp } from "./stages/dispersion.ts";
import { drawDos } from "./stages/dos.ts";
import { drawThermo } from "./stages/thermodynamics.ts";
import { drawSeismic } from "./stages/seismic.ts";
import { drawDepth } from "./stages/depth.ts";
import { drawPhase4 } from "./stages/phase4.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const client = new EngineClient();

const STAGES: [string, string][] = [
  ["PHASE 01", "Structure"],
  ["PHASE 02", "Dispersion"],
  ["PHASE 03", "Density of states"],
  ["PHASE 04", "Thermodynamics"],
  ["PHASE 05", "Seismic"],
  ["PHASE 06", "Depth profile"],
  ["PHASE 07", "Phase 4 supercell"],
];
let active = 1;
const nav = $("nav");
STAGES.forEach(([ph, nm], i) => {
  const b = document.createElement("button");
  b.innerHTML = `<span class="ph">${ph}</span><span class="nm">${nm}</span>`;
  b.onclick = () => {
    active = i;
    syncNav();
    render();
  };
  nav.appendChild(b);
  if (i < STAGES.length - 1) {
    const f = document.createElement("div");
    f.className = "flow";
    f.textContent = "↓";
    nav.appendChild(f);
  }
});
function syncNav() {
  [...nav.querySelectorAll("button")].forEach((b, i) => b.classList.toggle("on", i === active));
  [...document.querySelectorAll(".stage")].forEach((s, i) => s.classList.toggle("on", i === active));
}

async function updateCond() {
  const res = await client.request({ type: "cell", P: ui.P, gamma: ui.gam, bOO: ui.boo });
  $("Pv").textContent = ui.P + " GPa";
  $("Tv").textContent = ui.T + " K";
  $("aV").textContent = (res.a * 1e10).toFixed(3) + " Å";
  $("vV").textContent = (res.V * 1e30).toFixed(2) + " Å³";
  $("rV").textContent = (res.rho / 1000).toFixed(2) + " g/cm³";
}

const DRAW = [drawCell, drawDisp, drawDos, drawThermo, drawSeismic, drawDepth, drawPhase4];
let renderToken = 0;
function render() {
  const token = ++renderToken;
  void updateCond();
  void DRAW[active](client, ui).catch((err) => {
    if (token === renderToken) console.error(err);
  });
}

$<HTMLInputElement>("P").addEventListener("input", (e) => {
  ui.P = +(e.target as HTMLInputElement).value;
  render();
});
$<HTMLInputElement>("T").addEventListener("input", (e) => {
  ui.T = +(e.target as HTMLInputElement).value;
  render();
});
$<HTMLInputElement>("gam").addEventListener("input", (e) => {
  ui.gam = +(e.target as HTMLInputElement).value;
  $("gamv").textContent = ui.gam.toFixed(2);
  render();
});
$<HTMLInputElement>("boo").addEventListener("input", (e) => {
  ui.boo = +(e.target as HTMLInputElement).value;
  $("boov").textContent = ui.boo.toFixed(2) + " N/m";
  render();
});
$<HTMLSelectElement>("mp").addEventListener("change", (e) => {
  ui.mp = +(e.target as HTMLSelectElement).value;
  render();
});

syncNav();
render();
