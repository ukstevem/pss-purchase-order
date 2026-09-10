-- Dashboard aggregate: per-project draft/active PO counts (bead
-- pss-purchase-order-i7w). Replaces the JS aggregation in
-- fetchProjectPoSummary(), which fetched all 313 project_register rows plus
-- all 1,544 active_po_list rows on every render — ~26k Supabase requests/day,
-- 53% of the estate's traffic, almost all of it monitors rather than users.
--
-- READ-ONLY AND ADDITIVE: creates one view, touches nothing the legacy Flask
-- app (C:\Dev\PSS\purchase_order) reads or writes. Unlike the other files in
-- db/, this one applies to LIVE now — the dashboard reads it during the
-- read-only phase, so it is not gated on write-cutover.
--
-- BEHAVIOUR IS FROZEN (Steve, 2026-09-10): active = count(status != 'draft'),
-- which still counts cancelled and complete as active. That is legacy
-- behaviour, it is wrong, and it is corrected separately in bead
-- pss-purchase-order-k7n. The counts this view returns must match what the
-- dashboard rendered before it existed, so the trim/lower/blank handling
-- below mirrors the old JS exactly rather than tidying it up:
--
--   pn     = String(row.project_id ?? "").trim()   -- blank ids skipped
--   status = String(row.status ?? "").toLowerCase()
--   status === "draft" ? draft++ : active++        -- null status => active
--
-- Projects with no POs appear with zero counts, and POs whose project_id is
-- not in project_register are excluded from both the rows and the footer
-- totals — both are properties of the old code that the dashboard relies on.

CREATE OR REPLACE VIEW public.project_po_summary
WITH (security_invoker = true) AS
WITH po AS (
  SELECT btrim(project_id)             AS project_id,
         lower(coalesce(status, ''))   AS status
  FROM public.active_po_list
  WHERE btrim(coalesce(project_id, '')) <> ''
),
counts AS (
  SELECT project_id,
         count(*) FILTER (WHERE status =  'draft') AS draft,
         count(*) FILTER (WHERE status <> 'draft') AS active
  FROM po
  GROUP BY project_id
),
projects AS (
  SELECT DISTINCT btrim(projectnumber) AS project_id
  FROM public.project_register
  WHERE btrim(coalesce(projectnumber, '')) <> ''
)
SELECT p.project_id,
       coalesce(c.draft,  0)::int AS draft,
       coalesce(c.active, 0)::int AS active
FROM projects p
LEFT JOIN counts c USING (project_id);

COMMENT ON VIEW public.project_po_summary IS
  'Per-project draft/active PO counts for the purchase-order dashboard (bead pss-purchase-order-i7w). active counts every non-draft status incl. cancelled/complete — legacy parity, see bead pss-purchase-order-k7n.';

-- Only the server-side admin client reads this (app/lib/supabase-admin.ts).
-- Supabase's default privileges would hand anon and authenticated full DML on
-- a new public view, as they hold today on active_po_list and
-- accounts_overview; don't add a third one for the RLS epic (bead hra) to
-- unpick. security_invoker above keeps the view honest once RLS does land.
REVOKE ALL ON public.project_po_summary FROM anon, authenticated;
GRANT SELECT ON public.project_po_summary TO service_role;
