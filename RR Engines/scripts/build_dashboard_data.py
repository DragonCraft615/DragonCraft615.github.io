#!/usr/bin/env python3
"""Build dashboard JSON from local CSV database files.

Usage:
  python3 scripts/build_dashboard_data.py
  python3 scripts/build_dashboard_data.py --snapshot-date 2026-03-31
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUTPUT_FILE = DATA_DIR / "dashboard-data.json"
OUTPUT_JS_FILE = DATA_DIR / "dashboard-data.js"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def coerce_int(value: str) -> int | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def summarize_engines(registry_rows: list[dict[str, str]], operator_rows: list[dict[str, str]]) -> list[dict[str, object]]:
    operator_totals = defaultdict(int)
    for row in operator_rows:
        engines = coerce_int(row.get("estimated_engines_in_service", ""))
        family = row.get("engine_family", "").strip()
        if family and engines is not None:
            operator_totals[family] += engines

    summary = []
    for row in registry_rows:
        family = row["engine_family"]
        registry_est = coerce_int(row.get("in_service_estimate", ""))
        data = {
            **row,
            "in_service_estimate": registry_est,
            "operator_snapshot_estimate": operator_totals.get(family) or None,
        }
        summary.append(data)

    return summary


def summarize_segments(operator_rows: list[dict[str, str]]) -> list[dict[str, object]]:
    segment_totals: dict[str, dict[str, int]] = defaultdict(lambda: {"operators": 0, "aircraft": 0, "engines": 0})
    seen_pairs = set()

    for row in operator_rows:
        segment = row["segment"]
        operator = row["operator"]
        aircraft = coerce_int(row.get("aircraft_in_service", "")) or 0
        engines = coerce_int(row.get("estimated_engines_in_service", "")) or 0

        segment_totals[segment]["aircraft"] += aircraft
        segment_totals[segment]["engines"] += engines

        key = (segment, operator)
        if key not in seen_pairs:
            seen_pairs.add(key)
            segment_totals[segment]["operators"] += 1

    return [
        {
            "segment": segment,
            "operators": values["operators"],
            "aircraft": values["aircraft"],
            "engines": values["engines"],
        }
        for segment, values in sorted(segment_totals.items())
    ]


def build_payload(snapshot_date: str | None) -> dict[str, object]:
    registry_rows = read_csv(DATA_DIR / "engine_registry.csv")
    operator_rows = read_csv(DATA_DIR / "operator_fleet_snapshot.csv")
    lifecycle_rows = read_csv(DATA_DIR / "engine_lifecycle_meta.csv")
    lessor_rows = read_csv(DATA_DIR / "lessor_operator_links.csv")
    source_rows = read_csv(DATA_DIR / "source_catalog.csv")

    payload = {
        "meta": {
            "project": "RR Commercial Engines Dashboard",
            "generated_on": date.today().isoformat(),
            "snapshot_date": snapshot_date or max(row["snapshot_date"] for row in operator_rows),
            "update_cadence": "Monthly",
            "notes": [
                "Coverage prioritizes publicly visible operator-level data where engine-aircraft mapping is unambiguous.",
                "Some engine families remain in-service but do not publish reliable global active engine totals.",
            ],
        },
        "engine_registry": summarize_engines(registry_rows, operator_rows),
        "operator_snapshot": operator_rows,
        "engine_lifecycle_meta": lifecycle_rows,
        "lessor_operator_links": lessor_rows,
        "segment_summary": summarize_segments(operator_rows),
        "sources": source_rows,
    }

    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build RR engines dashboard data JSON")
    parser.add_argument(
        "--snapshot-date",
        help="Override snapshot date in output metadata, format YYYY-MM-DD",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_payload(args.snapshot_date)

    with OUTPUT_FILE.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")

    with OUTPUT_JS_FILE.open("w", encoding="utf-8") as handle:
        handle.write("window.RR_ENGINES_DATA = ")
        json.dump(payload, handle, indent=2)
        handle.write(";\n")

    print(f"Wrote {OUTPUT_FILE}")
    print(f"Wrote {OUTPUT_JS_FILE}")


if __name__ == "__main__":
    main()
