# RR Engines Dashboard

Interactive static dashboard for Rolls-Royce commercial aero engines.

## Files

- `RR-Engines.html`: main dashboard page.
- `data/engine_registry.csv`: commercial engine-type registry (XWB, 7000, 1000, 900, 700).
- `data/operator_fleet_snapshot.csv`: operator mappings by engine type.
- `data/engine_lifecycle_meta.csv`: lifecycle metadata used by the bubble chart.
- `data/lessor_operator_links.csv`: lessor-operator relationship estimates used by the chord-style network.
- `data/source_catalog.csv`: source index with links.
- `data/dashboard-data.json`: generated data consumed by the dashboard.
- `data/dashboard-data.js`: generated JS fallback for opening `RR-Engines.html` directly from disk.
- `scripts/build_dashboard_data.py`: rebuild script.

## Run locally

```bash
cd "/Users/josephjackson/GPT Code/RR Engines"
python3 scripts/build_dashboard_data.py
python3 -m http.server 8000
```

Open:

- `http://localhost:8000/RR-Engines.html`

You can also open `RR-Engines.html` directly (without a server) after generating data, because the dashboard now reads `data/dashboard-data.js` as a local fallback.

## Monthly update workflow

1. Update rows in:
   - `data/engine_registry.csv`
   - `data/operator_fleet_snapshot.csv`
   - `data/source_catalog.csv`
2. Rebuild generated JSON:

```bash
python3 scripts/build_dashboard_data.py --snapshot-date YYYY-MM-DD
```

3. Commit updated CSV + JSON + HTML changes to GitHub.

## Data model notes

- This project only stores publicly accessible figures.
- Where official active engine counts are not disclosed, rows are marked `not_disclosed` and confidence is reduced.
- Operator-level rows are strongest where aircraft-engine pairing is unambiguous (for example, A330neo + Trent 7000 and A350 + XWB).
- Lessor/operator network rows are currently inference-grade and intended for management scenario framing, not tail-level audit.
