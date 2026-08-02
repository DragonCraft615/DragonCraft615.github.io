import { createViewer } from "./scene.ts";
import { buildPhase4Group, type Phase4AtomInput, type Phase4Group } from "./phase4Geometry.ts";
import { ANGSTROM_TO_UNIT } from "./cellGeometry.ts";

export interface Phase4ViewerHandle {
  setReference(atoms: Phase4AtomInput[], box: [number, number, number]): void;
  /** Play a recorded relaxation trajectory (Angstrom keyframes) back and forth. */
  playTrajectory(keyframes: { x: number; y: number; z: number }[][]): void;
  setPlaying(playing: boolean): void;
  dispose(): void;
}

export function mountPhase4Viewer(container: HTMLElement): Phase4ViewerHandle {
  const viewer = createViewer(container);
  let phase4: Phase4Group | null = null;
  let keyframes: { x: number; y: number; z: number }[][] = [];
  let t = 0;
  let playing = true;
  const FRAME_SECONDS = 0.35;

  const stop = viewer.onFrame((dt) => {
    if (!playing || keyframes.length < 2) return;
    t += dt / FRAME_SECONDS;
    const span = keyframes.length - 1;
    // ping-pong through the trajectory so it reads as "perturb -> relax -> hold -> replay"
    const cycle = span * 2;
    let phase = t % cycle;
    if (phase < 0) phase += cycle;
    const idx = phase <= span ? phase : cycle - phase;
    const lo = Math.floor(idx), hi = Math.min(lo + 1, span);
    const frac = idx - lo;
    const a = keyframes[lo], b = keyframes[hi];
    const interp = a.map((p, i) => ({
      x: p.x + (b[i].x - p.x) * frac,
      y: p.y + (b[i].y - p.y) * frac,
      z: p.z + (b[i].z - p.z) * frac,
    }));
    phase4?.setPositions(interp);
  });

  function setReference(atoms: Phase4AtomInput[], box: [number, number, number]) {
    if (phase4) viewer.scene.remove(phase4.group);
    phase4 = buildPhase4Group(atoms);
    viewer.scene.add(phase4.group);
    const center = box.map((L) => (L * ANGSTROM_TO_UNIT) / 2) as [number, number, number];
    viewer.controls.target.set(center[0], center[1], center[2]);
    const maxDim = Math.max(...box) * ANGSTROM_TO_UNIT;
    viewer.camera.position.set(center[0] + maxDim * 0.9, center[1] + maxDim * 0.7, center[2] + maxDim * 1.1);
    keyframes = [];
    t = 0;
  }

  function playTrajectory(kf: { x: number; y: number; z: number }[][]) {
    keyframes = kf;
    t = 0;
    playing = true;
  }

  return {
    setReference,
    playTrajectory,
    setPlaying(p: boolean) { playing = p; },
    dispose() {
      stop();
      if (phase4) viewer.scene.remove(phase4.group);
      viewer.dispose();
    },
  };
}
