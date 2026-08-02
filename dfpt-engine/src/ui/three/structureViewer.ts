import { createViewer } from "./scene.ts";
import { buildCellGroup, ANGSTROM_TO_UNIT, type CellGroup } from "./cellGeometry.ts";

export interface StructureViewer {
  setLatticeParameter(aAngstrom: number): void;
  dispose(): void;
}

/** Static 3D perovskite cell for the Structure stage — replaces the 2D isometric canvas drawing. */
export function mountStructureViewer(container: HTMLElement): StructureViewer {
  const viewer = createViewer(container);
  let cell: CellGroup = buildCellGroup(3.467);
  viewer.scene.add(cell.group);
  viewer.controls.target.set(1.05, 1.05, 1.05);
  viewer.controls.update();

  const stop = viewer.onFrame((dt) => {
    cell.group.rotation.y += dt * 0.15; // slow auto-rotate so depth reads even without dragging
  });

  function setLatticeParameter(aAngstrom: number) {
    const scale = aAngstrom * ANGSTROM_TO_UNIT;
    for (const atom of cell.atoms) {
      atom.mesh.position.set(atom.frac[0] * scale, atom.frac[1] * scale, atom.frac[2] * scale);
    }
    cell.updateFaces();
    viewer.controls.target.set(scale / 2, scale / 2, scale / 2);
  }

  return {
    setLatticeParameter,
    dispose() {
      stop();
      viewer.scene.remove(cell.group);
      viewer.dispose();
    },
  };
}
