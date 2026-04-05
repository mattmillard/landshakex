#!/usr/bin/env python3
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "data/processed/boone_mo/boone_owner_acreage_patch_checkpoint.json"


def load_dotenv_local(path: Path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip()
        if v.startswith('"') and v.endswith('"'):
            v = v[1:-1]
        v = v.replace("\\n", "").strip()
        os.environ.setdefault(k, v)


def fetch_json(url: str, timeout: int = 240):
    req = urllib.request.Request(url, headers={"User-Agent": "LandShakeX/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def fetch_paginated(endpoint: str, page_size: int = 5000):
    base = f"https://report.boonecountymo.org/mrcjava/rest/REST_MP/{endpoint}/get"
    last = 0
    out = []
    seen = set()
    page = 0

    while True:
        params = urllib.parse.urlencode(
            {
                "max_rows": str(page_size),
                "rls_PARCELID": "GT",
                "val_PARCELID": str(last),
            }
        )
        batch = fetch_json(f"{base}?{params}")
        if not batch:
            print(f"{endpoint}: stop empty")
            break

        page += 1
        ids = []
        new_rows = 0

        for r in batch:
            pid = str(r.get("PARCELID", "")).strip()
            if not pid.isdigit():
                continue
            ipid = int(pid)
            ids.append(ipid)
            if ipid in seen:
                continue
            seen.add(ipid)
            out.append(r)
            new_rows += 1

        max_id = max(ids) if ids else last
        print(f"{endpoint}: page={page} rows={len(batch)} new={new_rows} max_pid={max_id}")

        if not ids or max_id <= last:
            break
        last = max_id

        if len(batch) < page_size:
            break

        time.sleep(0.05)

    return out


def fetch_supabase_boone_rows(base_url: str, key: str):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows = []
    offset = 0

    while True:
        params = urllib.parse.urlencode(
            {
                "select": "id,apn,owner_name,acreage",
                "source_dataset": "eq.boone-mo-20260405",
                "limit": "2000",
                "offset": str(offset),
                "order": "id.asc",
            }
        )
        url = base_url.rstrip("/") + "/rest/v1/parcels?" + params
        req = urllib.request.Request(url, headers=headers)
        batch = json.loads(urllib.request.urlopen(req, timeout=120).read().decode())
        if not batch:
            break
        rows.extend(batch)
        offset += len(batch)
        print(f"supabase boone rows fetched={offset}")
        if len(batch) < 2000:
            break

    return rows


def upsert_rows(base_url: str, key: str, rows):
    if not rows:
        return

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    url = base_url.rstrip("/") + "/rest/v1/parcels?on_conflict=id"
    payload = json.dumps(rows).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=180):
            return
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"POST upsert failed ({e.code}): {body}")

    # Fallback: patch each id row-by-row to avoid on_conflict issues in this project schema.
    for row in rows:
        rid = row.get("id")
        if rid is None:
            continue
        patch_headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        patch_url = base_url.rstrip("/") + f"/rest/v1/parcels?id=eq.{int(rid)}"
        patch_data = json.dumps({k: v for k, v in row.items() if k != "id"}).encode("utf-8")
        req = urllib.request.Request(patch_url, data=patch_data, headers=patch_headers, method="PATCH")
        with urllib.request.urlopen(req, timeout=120):
            pass


def main():
    load_dotenv_local(ROOT / ".env.local")
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY")

    print("fetching Boone owners (I01160s)...")
    i1160 = fetch_paginated("I01160s")
    print("fetching Boone acreage (I01130s)...")
    i1130 = fetch_paginated("I01130s")

    owner_by_apn16 = {}
    apn16_from_14 = {}
    for r in i1160:
        apn16 = str(r.get("CALCULA001", "")).strip()
        apn14 = str(r.get("PARCEL__X4", "")).strip()
        owner = (r.get("OWNER") or "").strip()

        if apn16 and owner:
            owner_by_apn16[apn16] = owner
        if apn14 and apn16:
            apn16_from_14[apn14] = apn16

    acres_by_apn16 = {}
    for r in i1130:
        apn14 = str(r.get("PARCEL__X4", "")).strip()
        if not apn14:
            continue

        apn16 = apn16_from_14.get(apn14) or (apn14 + "01")

        val = r.get("CALCACRES")
        if val in (None, ""):
            val = r.get("DEEDACRES")

        try:
            acres = float(val) if val is not None and str(val).strip() else None
        except Exception:
            acres = None

        if acres is not None:
            acres_by_apn16[apn16] = acres

    print("loading Boone rows from Supabase...")
    boone_rows = fetch_supabase_boone_rows(supabase_url, service_key)

    patch_payload = []
    owner_hits = 0
    acres_hits = 0

    for r in boone_rows:
        apn = str(r.get("apn", "")).strip()
        if not apn:
            continue

        owner = owner_by_apn16.get(apn)
        acres = acres_by_apn16.get(apn)
        if owner is None and acres is None:
            continue

        row = {"id": int(r["id"])}
        if owner is not None:
            row["owner_name"] = owner
            owner_hits += 1
        if acres is not None:
            row["acreage"] = acres
            acres_hits += 1

        patch_payload.append(row)

    print(f"prepared patch rows={len(patch_payload)} owner_hits={owner_hits} acres_hits={acres_hits}")

    done = 0
    for i in range(0, len(patch_payload), 500):
        batch = patch_payload[i : i + 500]
        upsert_rows(supabase_url, service_key, batch)
        done += len(batch)
        print(f"upserted {done}")

    verify_apn = "1271500000060001"
    vurl = (
        supabase_url.rstrip("/")
        + "/rest/v1/parcels?select=apn,owner_name,acreage,county,state"
        + "&source_dataset=eq.boone-mo-20260405"
        + "&apn=eq."
        + urllib.parse.quote(verify_apn)
    )
    req = urllib.request.Request(vurl, headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"})
    verification = json.loads(urllib.request.urlopen(req, timeout=120).read().decode())

    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT.write_text(
        json.dumps(
            {
                "patched_rows": done,
                "owner_hits": owner_hits,
                "acres_hits": acres_hits,
                "i1160_rows": len(i1160),
                "i1130_rows": len(i1130),
                "verify": verification,
                "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            },
            indent=2,
        )
    )
    print(f"Wrote checkpoint: {CHECKPOINT}")


if __name__ == "__main__":
    main()
