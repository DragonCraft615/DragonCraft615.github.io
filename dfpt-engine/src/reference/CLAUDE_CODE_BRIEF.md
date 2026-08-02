# Project brief: MgSiO₃ Lattice-Dynamics Engine v2
### For Claude Code — extending the single-file prototype into a real application

## Context
This project modernises Jackson (2009), "Ab Initio Calculations of the Structural,
Thermodynamic and Seismic Properties of MgSiO₃ Perovskite in the Lower Mantle"
(Durham MPhys). A working single-file prototype exists (`dfpt_engine.html`) containing:

- A validated JS lattice-dynamics engine: axially-symmetric force-constant model of the
  5-atom cubic perovskite cell → complex Hermitian dynamical matrix D(q) (real 2N
  embedding, Jacobi eigensolver) → signed phonon frequencies.
- Modernised thermodynamics: exact per-mode QHO partition function, analytic S and C_V
  (recovers Dulong–Petit 3NkB = 124.7 J/K/mol; the 2009 code could not).
- Seismic extraction: orientation-averaged acoustic slopes at Γ (thesis §3.5.3–3.5.4),
  semi-empirical T-softening (eqs 3.10–3.11), Z₀ in the thesis's unit convention.
- Six-stage UI mirroring thesis fig 3.7: Structure → Dispersion → DoS → Thermodynamics
  → Seismic → Depth profile. Signature interaction: B(O–O) slider < ~−10 N/m produces
  imaginary branches at X (matches thesis fig 4.2(b)).
- Calibrated constants (N/m, [longitudinal, transverse]):
  SiO [320, 12.8], MgO [25, 3.75], OO [10, 3.0] — reproduce thesis Table 8.1 within ~6%
  (vP 10.2 vs 10.1 km/s, vS 6.45 vs 6.32, C_V(300K) 83 vs 78).
- Reference data: `thesis_corrected.md` (full transcription), original Fortran
  (pzt.f90 / sos.f90) in `fortran_resurrected.zip`.

## v2 goals (in priority order)
1. **Restructure** into a Vite + TypeScript project: `engine/` (pure, tested physics),
   `ui/` (framework-light components), keep zero heavy dependencies for the engine.
2. **Web Worker** the engine; move dispersion/DoS/thermo off the main thread; add a
   proper progress state. Target: 12³ MP grids interactive.
3. **Eigenvectors**, not just eigenvalues: return polarisation vectors, animate the
   selected phonon mode on the 3D cell (replace the canvas isometric drawing with
   Three.js). Clicking a dispersion branch shows its ion motion — including the
   octahedral rotation mode as it softens.
4. **Phase 4 supercell**: generalise the cell builder to the 2×2×√-style 60-atom
   orthorhombic supercell (thesis §4.4); implement the perturb-and-reoptimise loop
   (steepest descent on the model energy) so the saddle-point → ground-state story of
   thesis ch.4 runs end-to-end.
5. **Real DFPT backend (optional, ambitious)**: an adapter that reads Quantum ESPRESSO
   / phonopy `FORCE_CONSTANTS` or CASTEP `.phonon` files (format documented in
   sos.f90's read section) so genuine ab-initio force constants can replace the model.
6. **Exports**: thermodynamics.csv (same columns as pzt.f90 wrote), dispersion SVG,
   shareable URL state.

## Validation targets (must hold)
- vP(0 GPa, 300 K) ≈ 10.1–10.3 km/s; vS ≈ 6.3–6.5; C_V(300K) 78–84 J/K/mol.
- C_V(T→∞) → 124.7 J/K/mol within 2%.
- Acoustic modes → 0 at Γ (< 1 cm⁻¹ at |q| = 1e-4·2π/a).
- B_OO ≤ −12 N/m at 0 GPa ⇒ imaginary modes at X.
- Engine unit tests should reproduce these before any UI work.

## Design system (keep)
Navy #16233F / deep #0E1729, cool paper #EEF0EE, amber #DD9530 (octahedra), red
#C0392B (imaginary modes), green #3E8E5A (Mg), blue #2E5FA3. Serif display
(Georgia-class) with letterspaced mono eyebrows; mono for all numerals. The
imaginary-mode red shading below ν = 0 is the identity of the app — preserve it.
