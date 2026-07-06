"""Backfill legacy PO PDFs into the document registry (bead 9bq.32).

Approach A (Steve, 2026-07-05): ingest the ORIGINAL artifacts from the share
via the doc-service multipart /api/file (bytes preserved), then stamp
issued_doc_id/issued_doc_number on the matching purchase_orders revision row.
Letter-revision drafts are skipped (Steve, 2026-07-06 — they stay on the
share). DUPLICATE_EXACT responses are treated as already-ingested and the
row is stamped from the existing registry entry, so re-runs are safe.

Usage:
  python scripts/backfill_po_pdfs.py --target clone --limit 5   # rehearsal
  python scripts/backfill_po_pdfs.py --target live              # the real run
  python scripts/backfill_po_pdfs.py --target live --dry        # match only
"""

import argparse
import json
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

SHARE = Path(r"\\pss-dc02\cad_iot\Purchase Orders")
ISO_DESCRIPTION_ID = 53  # ORDER / subclass CD

TARGETS = {
    "clone": {
        "env": r"C:\Dev\PSS\pss-purchase-order\local\.env",
        "supabase_url_key": ("SUPABASE_URL", "SUPABASE_SECRET_KEY"),
        "doc_service": "http://localhost:8090",
        "doc_key_var": "DOC_SERVICE_API_KEY",
    },
    "live": {
        "env": r"C:\Dev\PSS\platform-portal\.env.production",
        "supabase_url_key": ("SUPABASE_URL", "SUPABASE_SECRET_KEY"),
        "doc_service": "http://10.0.0.74:3000",
        "doc_key_var": "DOC_SERVICE_API_KEY",
    },
}


def load_env(path):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.split("#", 1)[0].strip()
    return env


def rest(base, key, method, path, payload=None, headers=None):
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    if headers:
        h.update(headers)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{base}/rest/v1/{path}", data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
        return json.loads(body) if body else None


def fetch_all_pos(base, key):
    rows, offset = [], 0
    while True:
        batch = rest(base, key, "GET",
                     f"purchase_orders?select=id,po_number,current_revision,project_id,issued_doc_id&order=po_number&limit=1000&offset={offset}")
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        offset += 1000


def multipart_file(doc_base, doc_key, filename, blob, project_number, filed_date):
    boundary = "----backfill" + str(int(time.time() * 1000))
    parts = []
    for name, value in [
        ("iso_description_id", str(ISO_DESCRIPTION_ID)),
        ("project_number", project_number),
        ("original_file_name", filename),
        # Historical filing date (share mtime = legacy archive moment) so
        # documents land in their true year/week folders.
        ("filed_date", filed_date),
    ]:
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        f"Content-Type: application/pdf\r\n\r\n".encode() + blob + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(
        f"{doc_base}/api/file",
        data=body,
        headers={"X-API-Key": doc_key, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        try:
            return None, json.load(e)
        except Exception:
            return None, {"error_code": f"HTTP_{e.code}", "error_message": e.read().decode(errors="replace")[:200]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", choices=TARGETS, required=True)
    ap.add_argument("--limit", type=int, default=0, help="ingest at most N files (0 = all)")
    ap.add_argument("--dry", action="store_true", help="match and report only")
    args = ap.parse_args()

    t = TARGETS[args.target]
    env = load_env(t["env"])
    sb_url = env[t["supabase_url_key"][0]].rstrip("/")
    sb_key = env[t["supabase_url_key"][1]]
    doc_key = env[t["doc_key_var"]]

    print(f"target={args.target} supabase={sb_url[:40]}... doc-service={t['doc_service']}")
    pos = fetch_all_pos(sb_url, sb_key)
    by_key = {(int(p["po_number"]), str(p["current_revision"]).strip()): p
              for p in pos if p["po_number"] is not None}

    work = []
    skipped = {"letter_rev": 0, "no_row": 0, "already_stamped": 0}
    for f in sorted(SHARE.glob("*.pdf")):
        m = re.match(r"^(\d{6})-([0-9a-z]+)\.pdf$", f.name)
        if not m:
            continue
        num, rev = int(m.group(1)), m.group(2)
        if rev.isalpha():
            skipped["letter_rev"] += 1
            continue
        row = by_key.get((num, rev))
        if not row:
            skipped["no_row"] += 1
            continue
        if row["issued_doc_id"]:
            skipped["already_stamped"] += 1
            continue
        work.append((f, row))

    print(f"rows={len(pos)} work={len(work)} skipped={skipped}")
    if args.dry:
        return
    if args.limit:
        work = work[: args.limit]
        print(f"limited to {len(work)}")

    ok, failed = 0, []
    consecutive_failures = 0
    for f, row in work:
        blob = f.read_bytes()
        project = str(row["project_id"] or "").rjust(5, "0")
        filed_date = time.strftime("%Y-%m-%d", time.localtime(f.stat().st_mtime))
        resp, err = multipart_file(t["doc_service"], doc_key, f.name, blob, project, filed_date)

        if err and err.get("error_code") == "DUPLICATE_EXACT":
            existing = err.get("existing") or {}
            resp = {"id": existing.get("id"), "doc_number": existing.get("doc_number"), "duplicate": True}
            err = None
        if err or not resp or not resp.get("id"):
            failed.append((f.name, err))
            consecutive_failures += 1
            print(f"FAIL {f.name}: {err}")
            if consecutive_failures >= 3:
                print("3 consecutive failures — stopping.")
                break
            continue
        consecutive_failures = 0

        rest(sb_url, sb_key, "PATCH",
             f"purchase_orders?id=eq.{row['id']}&issued_doc_id=is.null",
             {"issued_doc_id": resp["id"], "issued_doc_number": resp["doc_number"]})
        ok += 1
        tag = " (dup->stamped)" if resp.get("duplicate") else ""
        print(f"ok {f.name} -> {resp['doc_number']}{tag}")

    print(f"\ndone: {ok} ingested/stamped, {len(failed)} failed, {len(work) - ok - len(failed)} unprocessed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
