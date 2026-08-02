# MgSiO3 Lattice-Dynamics Engine

Interactive lattice-dynamics engine for MgSiO3 (bridgmanite) — modernises the
downstream half of Jackson (2009), "Ab Initio Calculations of the Structural,
Thermodynamic and Seismic Properties of MgSiO3 Perovskite in the Lower Mantle"
(Durham MPhys). Dynamical matrix -> phonons -> quantum-harmonic thermodynamics
-> seismic velocities -> lower-mantle depth profile, all running live in the
browser, with force constants calibrated to reproduce the thesis's Table 8.1
results at ambient conditions.

## Files

- `index.html` + `assets/`: the built static site — open this directly, no
  server or build step required.
- `src/`: full TypeScript source (Vite project) for future development —
  `engine/` (pure physics, unit-tested against the thesis's validation
  targets) and `ui/` (six-stage interface + Three.js phonon-mode viewer).
- `src/reference/`: the original 2009-lineage single-file prototype and the
  brief this v2 was built from.

## Run locally / rebuild

```bash
cd dfpt-engine/src
npm install
npm run dev      # dev server
npm test         # engine validation tests
npm run build    # rebuild the static output, then copy dist/* back into
                 # dfpt-engine/ (index.html + assets/) to update the live page
```
