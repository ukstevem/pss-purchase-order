---
name: verify
description: Verify pss-purchase-order changes by running the app against live Supabase and driving pages over HTTP. Use before committing nontrivial changes to app/.
---

# Verifying pss-purchase-order

## Build & launch

```bash
cd /c/Dev/PSS/pss-purchase-order/app
# env: copy the five runtime vars from the canonical platform-portal env
grep -E "^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_URL|SUPABASE_SECRET_KEY|NEXT_PUBLIC_APP_URL)=" \
  /c/Dev/PSS/platform-portal/.env > .env.local   # MUST land in app/, not app/app/
npm run dev   # port 3017, basePath /purchase-order — run in background
```

Wait for `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3017/purchase-order/` → 200.

## Gotchas

- **`.env.local` location**: the shell cwd often already sits in `app/`; writing
  `app/.env.local` from there lands in `app/app/` and Next silently ignores it →
  "supabase-admin requires SUPABASE_URL…" in every page.
- **AuthGate hides SSR HTML**: pages SSR as a spinner (auth resolves client-side).
  Rendered tables are NOT in the HTML — evidence lives in the embedded RSC flight
  payload. Unescape it first: `sed 's/\\"/"/g' page.html > page.txt`, then grep for
  `"children":"…"` (rendered server-component text) and raw prop JSON like
  `"status":"issued"` (client-component props).
- **Port cleanup**: TaskStop on the npm wrapper can leave the node child on 3017 →
  EADDRINUSE. Kill via PowerShell: `Get-NetTCPConnection -LocalPort 3017 -State Listen |
  % { Stop-Process -Id $_.OwningProcess -Force }`.
- Reads hit the **live production Supabase** (side-by-side testing is sanctioned,
  writes are NOT until phase 2) — keep verification read-only.

## Flows worth driving

- `/purchase-order/` dashboard → project drill-down links `po-list/?project=NNNN`.
- `/purchase-order/po-list/` → expect ~1000 rows (PostgREST cap, legacy parity);
  probe `?status=draft` (all rows draft in payload).
- `/purchase-order/po/<uuid>/` (grab an id from po-list payload: `\"id\":\"…\"`).
  PO number renders `NNNNNN-project`. Probe a garbage id → "Failed to load PO" alert.
- `/purchase-order/expediting/` → `"qty_received":N` values in payload prove the
  line-item subfetch; probe `?page=9999` (clamps, 200).
- `/purchase-order/accounts/` and `/purchase-order/spend-report/` (12 month columns
  ending current month, Europe/London).

Full browser check (Azure login, AuthGate, sidebar) needs a human session — curl
can't OAuth.
