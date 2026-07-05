-- Additive column: when the Outlook draft for this revision's issued PDF
-- was created (bead 9bq.7). Doubles as the fail-closed single-flight guard:
-- the draft action atomically claims it (UPDATE ... WHERE email_draft_at IS
-- NULL) before talking to Graph — legacy's file lock failed open (gcc.7).
-- Apply to CLONE during dev; apply to LIVE at write-cutover.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS email_draft_at timestamp;

COMMENT ON COLUMN public.purchase_orders.email_draft_at IS
  'When the Outlook draft was created for this revision''s issued PDF (null = no draft); also the single-flight claim';
