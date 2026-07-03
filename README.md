# pss-purchase-order

Standalone rewrite of the PSS purchase order system, following the PSS
standalone-app pattern (Next.js app behind the platform-portal nginx gateway,
Azure login via Supabase OAuth).

**Status: scaffolding.** The legacy system
([ukstevem/purchase_order](https://github.com/ukstevem/purchase_order),
`C:\Dev\PSS\purchase_order`) remains live and untouched while this version is
built and tested side by side against the same Supabase instance. RLS
conversion of the Supabase schema is deferred until this app is proven.

## Identity

| Property | Value |
|---|---|
| Port | **3017** (reserved "next standalone" slot in `platform-portal/docs/PORTS.md`) |
| Route / basePath | `/purchase-order/` |
| Service / container name | `purchase-order` |
| Image | `ghcr.io/ukstevem/pss-purchase-order` |

Not to be confused with **po-analysis** (`pss-purchase-order-analysis`, port 3013).

## Legacy feature set to reach parity with

- Dashboard (draft/active PO counts per project)
- PO list (filter by project/supplier/status/date)
- Create / edit PO with append-only revision snapshots (`a,b,c…` draft → `1,2,3…` released)
- PO web preview + WeasyPrint PDF generation, archive to network share
- "Issue PO" → Outlook draft via MS Graph (shared purchasing mailbox)
- Expediting (received qty, expected/completed dates)
- Accounts (invoice references, completion flags)
- Spend report (rolling 12-month pivot by project)

## Environment

Every variable the app reads is documented in [.env.example](.env.example).
Canonical shared secrets live with the gateway in `platform-portal/.env`.
Never commit `.env`.

## Issue tracking

Uses [beads](https://github.com/steveyegge/beads) (`bd ready`, `bd show <id>`).
Legacy-system defects found during the survey are logged as issues — they are
**not** fixed until the new system reaches feature parity.
