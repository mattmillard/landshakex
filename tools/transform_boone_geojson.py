#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data/raw/boone_mo/boone_mo_parcels_geometry.geojson"
OUT = ROOT / "data/processed/boone_mo/boone_parcels_for_supabase.ndjson"
MANIFEST = ROOT / "docs/data/boone_mo_parcels_manifest.json"


def main():
    fc = json.loads(SRC.read_text())
    feats = fc.get("features", [])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)

    inserted = 0
    rejected = 0

    with OUT.open("w") as f:
      for feat in feats:
        geom = feat.get("geometry")
        props = feat.get("properties", {})

        if not geom:
          rejected += 1
          continue

        gtype = geom.get("type")
        if gtype == "Polygon":
          geom = {"type": "MultiPolygon", "coordinates": [geom.get("coordinates", [])]}
        elif gtype != "MultiPolygon":
          rejected += 1
          continue

        apn = props.get("ASSESSOR")

        row = {
          "source_dataset": "boone-mo-20260405",
          "apn": apn,
          "county": "Boone",
          "state": "MO",
          "owner_name": None,
          "acreage": None,
          "land_use": None,
          "zoning": None,
          "assessed_value": None,
          "metadata": props,
          "geom": geom,
        }

        f.write(json.dumps(row, separators=(",", ":")) + "\n")
        inserted += 1

    manifest = {
      "source": str(SRC.relative_to(ROOT)),
      "output": str(OUT.relative_to(ROOT)),
      "feature_count": len(feats),
      "insertable_count": inserted,
      "rejected_count": rejected,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
