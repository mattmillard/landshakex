#!/usr/bin/env python3
import json
import os
from pathlib import Path
from urllib import request, error

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data/processed/callaway_mo/callaway_parcels_for_supabase.ndjson"

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SERVICE_KEY:
    raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY")

REST_URL = SUPABASE_URL.rstrip("/") + "/rest/v1/parcels"
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}


def post_rows(rows):
    body = json.dumps(rows).encode("utf-8")
    req = request.Request(REST_URL, data=body, headers=HEADERS, method="POST")
    with request.urlopen(req, timeout=180) as r:
        return r.status


def main():
    # Optional cleanup existing dataset rows for idempotent reload
    delete_url = SUPABASE_URL.rstrip("/") + "/rest/v1/parcels?source_dataset=eq.callaway-mo-20260405"
    del_req = request.Request(
        delete_url,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Prefer": "return=minimal"
        },
        method="DELETE",
    )
    try:
        with request.urlopen(del_req, timeout=120):
            pass
    except Exception:
        pass

    batch = []
    inserted = 0

    with SRC.open() as f:
        for line in f:
            row = json.loads(line)
            row["geom"] = json.dumps(row["geom"])  # PostgREST expects geometry input as JSON text for PostGIS column
            batch.append(row)

            if len(batch) >= 250:
                post_rows(batch)
                inserted += len(batch)
                print(f"inserted {inserted}")
                batch = []

    if batch:
        post_rows(batch)
        inserted += len(batch)
        print(f"inserted {inserted}")

    print(f"done inserted={inserted}")


if __name__ == "__main__":
    main()
