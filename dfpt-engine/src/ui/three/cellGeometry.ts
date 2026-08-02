import * as THREE from "three";
import { COLORS } from "./theme.ts";

/** 1 Angstrom = this many Three.js scene units (keeps cells nicely framed regardless of `a`). */
export const ANGSTROM_TO_UNIT = 0.6;

export interface AtomSite {
  mesh: THREE.Mesh;
  /** 0 = Mg, 1 = Si, 2/3/4 = the three symmetry-distinct O basis atoms. */
  basisIndex: 0 | 1 | 2 | 3 | 4;
  /** Local fractional position within this cell (may extend to 1 for face/corner copies). */
  frac: [number, number, number];
}

export interface CellGroup {
  group: THREE.Group;
  atoms: AtomSite[];
  /** Call after moving atom meshes to rebuild the octahedron face geometry. */
  updateFaces(): void;
}

const MG_CORNERS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) out.push([x, y, z]);
  return out;
})();

// Matches engine FRAC O ordering (indices 2,3,4) plus their +1 periodic mirrors.
const O_SITES: { frac: [number, number, number]; basisIndex: 2 | 3 | 4 }[] = [
  { frac: [0.5, 0.5, 0], basisIndex: 2 },
  { frac: [0.5, 0, 0.5], basisIndex: 3 },
  { frac: [0, 0.5, 0.5], basisIndex: 4 },
  { frac: [0.5, 0.5, 1], basisIndex: 2 },
  { frac: [0.5, 1, 0.5], basisIndex: 3 },
  { frac: [1, 0.5, 0.5], basisIndex: 4 },
];

// Octahedron faces: one O from each mirror pair {0,3}, {1,4}, {2,5} of O_SITES.
const FACE_TRIPLES: [number, number, number][] = [];
for (const i of [1, 4]) for (const j of [2, 5]) for (const k of [0, 3]) FACE_TRIPLES.push([i, j, k]);

/** Build one perovskite cell (corner Mg x8, face-centred O x6, body-centred Si) as a Three.js group. */
export function buildCellGroup(aAngstrom: number): CellGroup {
  const group = new THREE.Group();
  const scale = aAngstrom * ANGSTROM_TO_UNIT;
  const atoms: AtomSite[] = [];

  const mgGeo = new THREE.SphereGeometry(0.16, 20, 16);
  const mgMat = new THREE.MeshStandardMaterial({ color: COLORS.mg, roughness: 0.5 });
  for (const frac of MG_CORNERS) {
    const mesh = new THREE.Mesh(mgGeo, mgMat);
    mesh.position.set(frac[0] * scale, frac[1] * scale, frac[2] * scale);
    group.add(mesh);
    atoms.push({ mesh, basisIndex: 0, frac });
  }

  const siGeo = new THREE.SphereGeometry(0.11, 20, 16);
  const siMat = new THREE.MeshStandardMaterial({ color: COLORS.si, roughness: 0.5 });
  const siFrac: [number, number, number] = [0.5, 0.5, 0.5];
  const siMesh = new THREE.Mesh(siGeo, siMat);
  siMesh.position.set(siFrac[0] * scale, siFrac[1] * scale, siFrac[2] * scale);
  group.add(siMesh);
  atoms.push({ mesh: siMesh, basisIndex: 1, frac: siFrac });

  const oGeo = new THREE.SphereGeometry(0.13, 20, 16);
  const oMat = new THREE.MeshStandardMaterial({ color: COLORS.o, roughness: 0.5 });
  const oMeshes: THREE.Mesh[] = [];
  for (const site of O_SITES) {
    const mesh = new THREE.Mesh(oGeo, oMat);
    mesh.position.set(site.frac[0] * scale, site.frac[1] * scale, site.frac[2] * scale);
    group.add(mesh);
    oMeshes.push(mesh);
    atoms.push({ mesh, basisIndex: site.basisIndex, frac: site.frac });
  }

  const faceGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(FACE_TRIPLES.length * 3 * 3);
  faceGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  faceGeo.computeVertexNormals();
  const faceMatA = new THREE.MeshStandardMaterial({
    color: COLORS.octahedron[0],
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  const faceMatB = new THREE.MeshStandardMaterial({
    color: COLORS.octahedron[1],
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
  // groups alternate material per triangle, matching the original i%2 fill alternation
  faceGeo.addGroup(0, Infinity, 0);
  const facesMesh = new THREE.Mesh(faceGeo, [faceMatA, faceMatB]);
  // assign per-triangle material index via groups instead (multi-material needs explicit ranges)
  faceGeo.clearGroups();
  FACE_TRIPLES.forEach((_, i) => faceGeo.addGroup(i * 3, 3, i % 2));
  group.add(facesMesh);

  function updateFaces() {
    const pos = faceGeo.attributes.position as THREE.BufferAttribute;
    FACE_TRIPLES.forEach(([i, j, k], f) => {
      const a = oMeshes[i].position, b = oMeshes[j].position, c = oMeshes[k].position;
      pos.setXYZ(f * 3 + 0, a.x, a.y, a.z);
      pos.setXYZ(f * 3 + 1, b.x, b.y, b.z);
      pos.setXYZ(f * 3 + 2, c.x, c.y, c.z);
    });
    pos.needsUpdate = true;
    faceGeo.computeVertexNormals();
  }
  updateFaces();

  return { group, atoms, updateFaces };
}
