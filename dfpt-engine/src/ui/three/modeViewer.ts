import * as THREE from "three";
import { createViewer } from "./scene.ts";
import { buildCellGroup, ANGSTROM_TO_UNIT, type CellGroup } from "./cellGeometry.ts";
import { normalisedDisplacements, displacementAt, type ComplexVec3 } from "../../engine/displacement.ts";
import { MASS } from "../../engine/constants.ts";
import type { Mode } from "../../engine/dynamicalMatrix.ts";

const NCELLS = 4;
const AMPLITUDE_UNITS_DEFAULT = 0.5;

export interface ModeViewerHandle {
  showMode(mode: Mode, qFrac: [number, number, number], aAngstrom: number): void;
  setAmplitude(units: number): void;
  setPlaying(playing: boolean): void;
  dispose(): void;
}

/** Animated supercell (a small chain of replicated cells) driving a phonon eigenvector. */
export function mountModeViewer(container: HTMLElement): ModeViewerHandle {
  const viewer = createViewer(container);
  let cells: { cell: CellGroup; n: number }[] = [];
  let disp: ComplexVec3[] = [];
  let qComp = 0;
  let axis: 0 | 1 | 2 = 0;
  let omega = 1;
  let amplitude = AMPLITUDE_UNITS_DEFAULT;
  let t = 0;
  let playing = true;

  const stop = viewer.onFrame((dt) => {
    if (playing) t += dt;
    for (const { cell, n } of cells) {
      const cellPhase = 2 * Math.PI * qComp * n;
      for (const atom of cell.atoms) {
        const d = disp[atom.basisIndex];
        if (!d) continue;
        const [dx, dy, dz] = displacementAt(d, cellPhase - omega * t);
        const base = atom.mesh.userData.base as THREE.Vector3;
        atom.mesh.position.set(base.x + dx * amplitude, base.y + dy * amplitude, base.z + dz * amplitude);
      }
      cell.updateFaces();
    }
  });

  function rebuildCells(aAngstrom: number) {
    for (const { cell } of cells) viewer.scene.remove(cell.group);
    cells = [];
    const scale = aAngstrom * ANGSTROM_TO_UNIT;
    for (let n = 0; n < NCELLS; n++) {
      const cell = buildCellGroup(aAngstrom);
      cell.group.position.set(0, 0, 0);
      cell.group.position.setComponent(axis, n * scale);
      for (const atom of cell.atoms) {
        atom.mesh.userData.base = atom.mesh.position.clone();
      }
      viewer.scene.add(cell.group);
      cells.push({ cell, n });
    }
    const mid = ((NCELLS - 1) * scale) / 2;
    const center = new THREE.Vector3(scale / 2, scale / 2, scale / 2);
    center.setComponent(axis, mid);
    viewer.controls.target.copy(center);
    viewer.camera.position.set(center.x + scale * 2, center.y + scale * 1.4, center.z + scale * 2.2);
  }

  function showMode(mode: Mode, qFrac: [number, number, number], aAngstrom: number) {
    axis = (Math.abs(qFrac[0]) >= Math.abs(qFrac[1]) && Math.abs(qFrac[0]) >= Math.abs(qFrac[2])
      ? 0
      : Math.abs(qFrac[1]) >= Math.abs(qFrac[2])
        ? 1
        : 2) as 0 | 1 | 2;
    qComp = qFrac[axis];
    disp = normalisedDisplacements(mode, MASS);
    omega = 0.6 + 2.5 * Math.min(1, Math.abs(mode.freqCm) / 1000);
    t = 0;
    rebuildCells(aAngstrom);
  }

  return {
    showMode,
    setAmplitude(units: number) {
      amplitude = units;
    },
    setPlaying(p: boolean) {
      playing = p;
    },
    dispose() {
      stop();
      for (const { cell } of cells) viewer.scene.remove(cell.group);
      viewer.dispose();
    },
  };
}
