import * as THREE from "three";
import { COLORS } from "./theme.ts";
import { ANGSTROM_TO_UNIT } from "./cellGeometry.ts";

export interface Phase4AtomInput {
  basisIndex: number;
  x: number;
  y: number;
  z: number;
}

export interface Phase4Group {
  group: THREE.Group;
  /** Replace all atom positions (Angstrom, same order/length as construction) and rebuild octahedra. */
  setPositions(atoms: { x: number; y: number; z: number }[]): void;
}

/** box: supercell dimensions, Angstrom. */

type Axis6 = "x+" | "x-" | "y+" | "y-" | "z+" | "z-";
const FACE_ORDER: [Axis6, Axis6, Axis6][] = (() => {
  const faces: [Axis6, Axis6, Axis6][] = [];
  for (const y of ["y-", "y+"] as Axis6[]) {
    for (const x of ["x-", "x+"] as Axis6[]) {
      for (const z of ["z-", "z+"] as Axis6[]) faces.push([y, x, z]);
    }
  }
  return faces;
})();

/**
 * Renders an arbitrary set of Mg/Si/O atoms (by basisIndex: 0=Mg, 1=Si,
 * 2/3/4=O) and dynamically identifies each Si's octahedron from its 6
 * nearest O neighbours, classified onto +/-x/y/z by the largest component
 * of the Si->O vector. Valid for the mild tilts this model actually
 * produces; a >45 degree rotation would confuse the classification.
 */
export function buildPhase4Group(atoms: Phase4AtomInput[], box: [number, number, number]): Phase4Group {
  const group = new THREE.Group();
  const scale = ANGSTROM_TO_UNIT;
  const boxScene = new THREE.Vector3(box[0] * scale, box[1] * scale, box[2] * scale);

  // Minimum-image relative vector b - a, wrapped by the periodic box — needed
  // because only one copy of the supercell is rendered, so an atom's true
  // nearest neighbour can sit just across the boundary rather than inside it.
  function wrappedRel(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    const d = b.clone().sub(a);
    for (const axis of ["x", "y", "z"] as const) {
      const L = boxScene[axis];
      if (d[axis] > L / 2) d[axis] -= L;
      else if (d[axis] < -L / 2) d[axis] += L;
    }
    return d;
  }

  const mgGeo = new THREE.SphereGeometry(0.16, 16, 12);
  const siGeo = new THREE.SphereGeometry(0.11, 16, 12);
  const oGeo = new THREE.SphereGeometry(0.13, 16, 12);
  const mgMat = new THREE.MeshStandardMaterial({ color: COLORS.mg, roughness: 0.5 });
  const siMat = new THREE.MeshStandardMaterial({ color: COLORS.si, roughness: 0.5 });
  const oMat = new THREE.MeshStandardMaterial({ color: COLORS.o, roughness: 0.5 });

  const meshes: THREE.Mesh[] = atoms.map((a) => {
    const geo = a.basisIndex === 0 ? mgGeo : a.basisIndex === 1 ? siGeo : oGeo;
    const mat = a.basisIndex === 0 ? mgMat : a.basisIndex === 1 ? siMat : oMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(a.x * scale, a.y * scale, a.z * scale);
    group.add(mesh);
    return mesh;
  });

  const siIndices: number[] = [];
  const oIndices: number[] = [];
  const mgIndices: number[] = [];
  atoms.forEach((a, i) => {
    if (a.basisIndex === 0) mgIndices.push(i);
    else if (a.basisIndex === 1) siIndices.push(i);
    else oIndices.push(i);
  });

  // Guide lines between neighbouring Mg atoms (thesis-figure style cell
  // outline) -- each Mg's 6 nearest Mg neighbours, wrapped through the
  // periodic box so edges crossing the boundary still draw (as a short
  // "ghost" segment poking outside the box, same convention as the
  // octahedra below).
  const MG_NEIGHBOURS = 6;
  const guideGeo = new THREE.BufferGeometry();
  const guidePositions = new Float32Array(mgIndices.length * MG_NEIGHBOURS * 2 * 3);
  guideGeo.setAttribute("position", new THREE.BufferAttribute(guidePositions, 3));
  const guideLines = new THREE.LineSegments(
    guideGeo,
    new THREE.LineBasicMaterial({ color: 0xb9bfc7, transparent: true, opacity: 0.8 }),
  );
  group.add(guideLines);

  function rebuildGuideLines() {
    const pos = guideGeo.attributes.position as THREE.BufferAttribute;
    let v = 0;
    for (const mgIdx of mgIndices) {
      const sp = meshes[mgIdx].position;
      const neighbours = mgIndices
        .filter((i) => i !== mgIdx)
        .map((i) => ({ i, d: wrappedRel(sp, meshes[i].position).lengthSq() }))
        .sort((a, b) => a.d - b.d)
        .slice(0, MG_NEIGHBOURS);
      for (const { i } of neighbours) {
        const ghost = sp.clone().add(wrappedRel(sp, meshes[i].position));
        pos.setXYZ(v++, sp.x, sp.y, sp.z);
        pos.setXYZ(v++, ghost.x, ghost.y, ghost.z);
      }
    }
    // zero out any unused tail (shouldn't happen: mgIndices.length is fixed)
    for (; v < guidePositions.length / 3; v++) pos.setXYZ(v, 0, 0, 0);
    pos.needsUpdate = true;
  }
  rebuildGuideLines();

  const matA = new THREE.MeshStandardMaterial({
    color: COLORS.octahedron[0], transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.6,
  });
  const matB = new THREE.MeshStandardMaterial({
    color: COLORS.octahedron[1], transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.6,
  });
  const octGeoms: THREE.BufferGeometry[] = [];
  for (let k = 0; k < siIndices.length; k++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(8 * 3 * 3), 3));
    geo.clearGroups();
    for (let f = 0; f < 8; f++) geo.addGroup(f * 3, 3, f % 2);
    const mesh = new THREE.Mesh(geo, [matA, matB]);
    group.add(mesh);
    octGeoms.push(geo);
  }

  function nearestSixO(siIdx: number): number[] {
    const sp = meshes[siIdx].position;
    return oIndices
      .map((oi) => ({ oi, d: wrappedRel(sp, meshes[oi].position).lengthSq() }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .map((x) => x.oi);
  }

  function classify(siIdx: number, oIdxs: number[]): Partial<Record<Axis6, number>> {
    const sp = meshes[siIdx].position;
    const bins: Partial<Record<Axis6, { idx: number; score: number }>> = {};
    for (const oi of oIdxs) {
      const rel = wrappedRel(sp, meshes[oi].position);
      let axis: "x" | "y" | "z" = "x";
      let val = Math.abs(rel.x);
      if (Math.abs(rel.y) > val) { axis = "y"; val = Math.abs(rel.y); }
      if (Math.abs(rel.z) > val) { axis = "z"; val = Math.abs(rel.z); }
      const sign = axis === "x" ? rel.x : axis === "y" ? rel.y : rel.z;
      const binKey = (axis + (sign >= 0 ? "+" : "-")) as Axis6;
      if (!bins[binKey] || val > bins[binKey]!.score) bins[binKey] = { idx: oi, score: val };
    }
    const out: Partial<Record<Axis6, number>> = {};
    (Object.keys(bins) as Axis6[]).forEach((k) => { out[k] = bins[k]!.idx; });
    return out;
  }

  function rebuildOctahedra() {
    siIndices.forEach((siIdx, k) => {
      const bins = classify(siIdx, nearestSixO(siIdx));
      if (FACE_ORDER.some(([a, b, c]) => bins[a] === undefined || bins[b] === undefined || bins[c] === undefined)) {
        return; // degenerate neighbour set this frame; leave the last good geometry in place
      }
      const geo = octGeoms[k];
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const sp = meshes[siIdx].position;
      // Draw each vertex at Si + (wrapped relative vector), not the O mesh's
      // raw position -- for a neighbour whose true image is across the
      // periodic boundary, this places a "ghost" copy right next to Si
      // (extending outside the drawn box), instead of a face stretching
      // across the whole cell to the wrong, far-away copy.
      FACE_ORDER.forEach(([a, b, c], f) => {
        const va = sp.clone().add(wrappedRel(sp, meshes[bins[a]!].position));
        const vb = sp.clone().add(wrappedRel(sp, meshes[bins[b]!].position));
        const vc = sp.clone().add(wrappedRel(sp, meshes[bins[c]!].position));
        pos.setXYZ(f * 3 + 0, va.x, va.y, va.z);
        pos.setXYZ(f * 3 + 1, vb.x, vb.y, vb.z);
        pos.setXYZ(f * 3 + 2, vc.x, vc.y, vc.z);
      });
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    });
  }
  rebuildOctahedra();

  function setPositions(newAtoms: { x: number; y: number; z: number }[]) {
    newAtoms.forEach((a, i) => meshes[i].position.set(a.x * scale, a.y * scale, a.z * scale));
    rebuildOctahedra();
    rebuildGuideLines();
  }

  return { group, setPositions };
}
