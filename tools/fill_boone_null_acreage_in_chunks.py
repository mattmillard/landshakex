#!/usr/bin/env python3
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "data/processed/boone_mo/boone_acreage_fill_chunks_checkpoint.json"
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


def get_count(base_url: str, key: str, where_qs: str):
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact"}
    url = base_url.rstrip("/") + "/rest/v1/parcels?" + where_qs + "&limit=1"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        cr = r.headers.get("Content-Range", "")
    if "/" in cr:
        return int(cr.split("/")[-1])
    return None


def fetch_null_id_batch(base_url: str, key: str, batch_size: int):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    params = urllib.parse.urlencode(
        {
            "select": "id",
            "source_dataset": f"eq.{SOURCE_DATASET}",
            "acreage": "is.null",
            "order": "id.asc",
            "limit": str(batch_size),
        }
    )
    req = urllib.request.Request(base_url.rstrip("/") + "/rest/v1/parcels?" + params, headers=headers)
    return json.loads(urllib.request.urlopen(req, timeout=120).read().decode())


def patch_ids(base_url: str, key: str, ids):
    if not ids:
        return 0
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    id_list = ",".join(str(i) for i in ids)
    url = (
        base_url.rstrip("/")
        + f"/rest/v1/parcels?source_dataset=eq.{SOURCE_DATASET}&id=in.({id_list})"
    )
    req = urllib.request.Request(url, data=json.dumps({"acreage": 0.0}).encode(), headers=headers, method="PATCH")
    with urllib.request.urlopen(req, timeout=180) as r:
        body = json.loads(r.read().decode())
    return len(body)


def main():
    load_dotenv_local(ROOT / ".env.local")
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY")

    total_before = get_count(
        supabase_url,
        service_key,
        f"select=id&source_dataset=eq.{SOURCE_DATASET}&acreage=is.null",
    )
    print(f"null acreage before={total_before}")

    patched_total = 0
    loops = 0
    while True:
        rows = fetch_null_id_batch(supabase_url, service_key, batch_size=200)
        if not rows:
            break
        ids = [int(r["id"]) for r in rows]
        patched = patch_ids(supabase_url, service_key, ids)
        patched_total += patched
        loops += 1
        if loops % 10 == 0:
            print(f"loops={loops} patched_total={patched_total}")

    total_after = get_count(
        supabase_url,
        service_key,
        f"select=id&source_dataset=eq.{SOURCE_DATASET}&acreage=is.null",
    )
    nonnull_after = get_count(
        supabase_url,
        service_key,
        f"select=id&source_dataset=eq.{SOURCE_DATASET}&acreage=not.is.null",
    )
    total_rows = get_count(
        supabase_url,
        service_key,
        f"select=id&source_dataset=eq.{SOURCE_DATASET}",
    )

    ck = {
        "patched_total": patched_total,
        "null_before": total_before,
        "null_after": total_after,
        "nonnull_after": nonnull_after,
        "total_rows": total_rows,
    }
    CHECKPOINT.write_text(json.dumps(ck, indent=2))
    print(json.dumps(ck, indent=2))


if __name__ == "__main__":
    main()
