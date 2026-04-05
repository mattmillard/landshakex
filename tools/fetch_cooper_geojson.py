#!/usr/bin/env python3
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/raw/cooper_mo"
PROC_DIR = ROOT / "data/processed/cooper_mo"
DOC_DIR = ROOT / "docs/data"
RAW_DIR.mkdir(parents=True, exist_ok=True)
PROC_DIR.mkdir(parents=True, exist_ok=True)
DOC_DIR.mkdir(parents=True, exist_ok=True)


def get_cooper_service_and_token():
    cfg = "https://coopergis.integritygis.com/Geocortex/Essentials/REST/sites/Cooper_County_MO/map/mapServices?f=pjson"
    obj = json.loads(urllib.request.urlopen(cfg, timeout=60).read().decode())
    assessor = [s for s in obj.get("mapServices", []) if s.get("displayName") == "Assessor Data"][0]
    cs = assessor["connectionString"]
    url = re.search(r"url=([^;]+)", cs).group(1)
    token = re.search(r"token=([^;]+)", cs).group(1)
    return url, token


def fetch_count(base_url, token):
    params = {
        "f": "json",
        "token": token,
        "where": "1=1",
        "returnCountOnly": "true",
    }
    u = f"{base_url}/11/query?" + urllib.parse.urlencode(params)
    return json.loads(urllib.request.urlopen(u, timeout=60).read().decode())["count"]


def fetch_page(base_url, token, offset, size=2000):
    params = {
        "f": "geojson",
        "token": token,
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "true",
        "orderByFields": "OBJECTID ASC",
        "resultOffset": offset,
        "resultRecordCount": size,
    }
    u = f"{base_url}/11/query?" + urllib.parse.urlencode(params)
    return json.loads(urllib.request.urlopen(u, timeout=180).read().decode())


def main():
    base_url, token = get_cooper_service_and_token()
    total = fetch_count(base_url, token)

    features = []
    offset = 0
    size = 2000

    while True:
        page = fetch_page(base_url, token, offset, size)
        batch = page.get("features", [])
        if not batch:
            break
        features.extend(batch)
        offset += len(batch)
        print(f"fetched {offset}")
        if len(batch) < size:
            break

    fc = {"type": "FeatureCollection", "features": features}
    raw_geojson = RAW_DIR / "cooper_parcels.geojson"
    raw_geojson.write_text(json.dumps(fc, separators=(",", ":")))

    ndjson_out = PROC_DIR / "cooper_parcels_for_supabase.ndjson"
    inserted = 0
    rejected = 0

    with ndjson_out.open("w") as f:
        for feat in features:
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

            owner = " ".join(filter(None, [
                str(props.get("name") or "").strip(),
                str(props.get("name2") or "").strip(),
                str(props.get("name3") or "").strip(),
            ])).strip() or None

            acreage = props.get("GIS_ACRES")
            try:
                acreage = float(acreage) if acreage is not None and str(acreage).strip() else None
            except Exception:
                acreage = None

            row = {
                "source_dataset": "cooper-mo-20260405",
                "apn": props.get("PID") or props.get("parcel_no") or props.get("accountno"),
                "county": "Cooper",
                "state": "MO",
                "owner_name": owner,
                "acreage": acreage,
                "land_use": props.get("land_use") if "land_use" in props else None,
                "zoning": None,
                "assessed_value": None,
                "metadata": props,
                "geom": geom,
            }

            f.write(json.dumps(row, separators=(",", ":"), default=str) + "\n")
            inserted += 1

    manifest = {
        "service_url": base_url,
        "source": str(raw_geojson.relative_to(ROOT)),
        "output": str(ndjson_out.relative_to(ROOT)),
        "feature_count_reported": total,
        "feature_count_downloaded": len(features),
        "insertable_count": inserted,
        "rejected_count": rejected,
    }
    (DOC_DIR / "cooper_mo_parcels_manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
