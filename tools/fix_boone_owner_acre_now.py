#!/usr/bin/env python3
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/boone_mo"
CHECKPOINT = ROOT / "data/processed/boone_mo/boone_owner_acre_fix_now_checkpoint.json"
SOURCE_DATASET = "boone-mo-20260405"


def load_dotenv_local(path: Path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        v = v.strip().strip('"').replace("\\n", "").strip()
        os.environ.setdefault(k, v)


def apn_digits(v):
    return re.sub(r"\D", "", str(v or ""))


def parse_float(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def read_rows(path: Path):
    if not path.exists():
        return []
    return json.loads(path.read_text())


def fetch_boone_rows(base_url: str, key: str):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    out = []
    offset = 0
    limit = 1000

    while True:
        params = urllib.parse.urlencode(
            {
                "select": "id,apn,owner_name,acreage",
                "source_dataset": f"eq.{SOURCE_DATASET}",
                "order": "id.asc",
                "limit": str(limit),
                "offset": str(offset),
            }
        )
        req = urllib.request.Request(base_url.rstrip("/") + "/rest/v1/parcels?" + params, headers=headers)
        batch = json.loads(urllib.request.urlopen(req, timeout=120).read().decode())
        if not batch:
            break
        out.extend(batch)
        offset += len(batch)
        print(f"supabase rows fetched={offset}")

    return out


def patch_row(base_url: str, key: str, rid: int, payload: dict, retries: int = 5):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    url = base_url.rstrip("/") + f"/rest/v1/parcels?id=eq.{rid}&source_dataset=eq.{SOURCE_DATASET}"

    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="PATCH")
            with urllib.request.urlopen(req, timeout=120):
                return True
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read().decode(errors='replace')[:240]}"
        except Exception as e:
            last = str(e)
        time.sleep(min(8, 2 ** i))

    print(f"patch failed id={rid} err={last}")
    return False


def get_count(base_url: str, key: str, query: str):
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact"}
    req = urllib.request.Request(base_url.rstrip("/") + "/rest/v1/parcels?" + query, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        cr = r.headers.get("Content-Range", "")
    if "/" in cr:
        return int(cr.split("/")[-1])
    return None


def main():
    load_dotenv_local(ROOT / ".env.local")
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY")

    # Prefer full dumps if present, fall back to base files.
    i1160 = read_rows(RAW / "i01160s_full.json") or read_rows(RAW / "i01160s.json")
    i1130 = read_rows(RAW / "i01130s_full.json") or read_rows(RAW / "i01130s.json")
    if not i1160 or not i1130:
        raise SystemExit("Missing i01160s/i01130s source files")

    owner_by_16 = {}
    owner_by_14 = {}
    for r in i1160:
        a16 = apn_digits(r.get("CALCULA001"))
        a14 = apn_digits(r.get("PARCEL__X4"))
        owner = (r.get("OWNER") or "").strip()
        if not owner:
            continue
        if len(a16) >= 16:
            owner_by_16[a16[:16]] = owner
        if len(a14) >= 14:
            owner_by_14[a14[:14]] = owner

    acres_by_14 = {}
    for r in i1130:
        a14 = apn_digits(r.get("PARCEL__X4"))
        if len(a14) < 14:
            continue
        acres = parse_float(r.get("CALCACRES"))
        if acres is None:
            acres = parse_float(r.get("DEEDACRES"))
        if acres is None:
            acres = 0.0
        acres_by_14[a14[:14]] = acres

    print(f"owner map16={len(owner_by_16)} owner map14={len(owner_by_14)} acreage map14={len(acres_by_14)}")

    rows = fetch_boone_rows(supabase_url, service_key)
    print(f"boone rows total={len(rows)}")

    updates = []
    owner_target_hits = 0
    acre_target_hits = 0

    for r in rows:
        apn = apn_digits(r.get("apn"))
        if len(apn) < 14:
            continue
        a16 = apn[:16] if len(apn) >= 16 else apn
        a14 = apn[:14]

        new_owner = owner_by_16.get(a16) or owner_by_14.get(a14)
        new_acre = acres_by_14.get(a14)

        payload = {}

        if new_owner:
            owner_target_hits += 1
            cur_owner = (r.get("owner_name") or "").strip()
            if cur_owner != new_owner:
                payload["owner_name"] = new_owner

        if new_acre is not None:
            acre_target_hits += 1
            cur = r.get("acreage")
            try:
                curf = float(cur) if cur is not None else None
            except Exception:
                curf = None
            if curf is None or abs(curf - new_acre) > 1e-9:
                payload["acreage"] = new_acre

        if payload:
            updates.append((int(r["id"]), payload))

    print(f"prepared updates={len(updates)} owner_targets={owner_target_hits} acreage_targets={acre_target_hits}")

    ok = 0
    fail = 0
    for i, (rid, payload) in enumerate(updates, 1):
        if patch_row(supabase_url, service_key, rid, payload):
            ok += 1
        else:
            fail += 1
        if i % 500 == 0:
            print(f"patched {i}/{len(updates)} ok={ok} fail={fail}")

    total = get_count(supabase_url, service_key, f"select=id&source_dataset=eq.{SOURCE_DATASET}&limit=1")
    owner_nonempty = get_count(
        supabase_url,
        service_key,
        "select=id&source_dataset=eq.boone-mo-20260405&owner_name=not.is.null&owner_name=neq.&limit=1",
    )
    acre_nonnull = get_count(
        supabase_url,
        service_key,
        "select=id&source_dataset=eq.boone-mo-20260405&acreage=not.is.null&limit=1",
    )
    acre_gt0 = get_count(
        supabase_url,
        service_key,
        "select=id&source_dataset=eq.boone-mo-20260405&acreage=gt.0&limit=1",
    )

    ck = {
        "source_i1160_rows": len(i1160),
        "source_i1130_rows": len(i1130),
        "boone_rows": len(rows),
        "prepared_updates": len(updates),
        "patched_ok": ok,
        "patched_fail": fail,
        "counts": {
            "total": total,
            "owner_nonempty": owner_nonempty,
            "acreage_nonnull": acre_nonnull,
            "acreage_gt0": acre_gt0,
        },
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT.write_text(json.dumps(ck, indent=2))
    print(json.dumps(ck, indent=2))


if __name__ == "__main__":
    main()
