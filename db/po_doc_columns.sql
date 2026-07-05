-- Additive columns stamping the filed PO PDF onto the revision row
-- (bead 9bq.31; doc-service registry has no metadata search, so the PO row
-- is the authoritative link — their session's recommendation (b)).
-- Apply to the CLONE during stage-2 dev; apply to LIVE at write-cutover.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS issued_doc_id uuid,
  ADD COLUMN IF NOT EXISTS issued_doc_number text;

COMMENT ON COLUMN public.purchase_orders.issued_doc_id IS
  'pss-document-service registry id of the filed PO PDF for this revision (null = not filed)';
COMMENT ON COLUMN public.purchase_orders.issued_doc_number IS
  'ISO 61355 doc number of the filed PO PDF (display/forensics; id is the FK-ish link)';
