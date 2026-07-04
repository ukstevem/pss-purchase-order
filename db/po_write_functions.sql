-- Atomic PO write path (bead 9bq.26, grill-me Q5 decision B).
-- Replaces the legacy app's non-transactional REST sequence
-- (deactivate -> insert header -> insert metadata -> insert items) with
-- all-or-nothing Postgres functions. ADDITIVE ONLY: nothing the legacy
-- app touches is altered. Applied to the CLONE (10.0.0.85) during stage-2
-- development; apply to live Supabase at write-cutover.
--
-- Revision semantics are computed app-side (exact legacy parity, see
-- app/lib/po-logic.ts); these functions enforce integrity: row locking,
-- stale-revision checks, and the ux_po_number_revision unique constraint.
--
-- po_number: assigned by the existing po_auto_number trigger
-- (nextval('po_number_seq')) when NULL on insert — po_create leaves it
-- NULL, po_new_revision carries the old number through.

BEGIN;

-- Shared helper: insert line items for a PO from a jsonb array.
-- NB: po_line_items.total is GENERATED (quantity * unit_price) — never set.
CREATE OR REPLACE FUNCTION public.po__insert_items(p_po_id uuid, p_items jsonb)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO po_line_items
    (po_id, description, quantity, unit, unit_price, currency, active, exped_expected_date)
  SELECT
    p_po_id,
    item.description,
    item.quantity,
    item.unit,
    item.unit_price,
    COALESCE(item.currency, 'GBP'),
    COALESCE(item.active, true),
    item.exped_expected_date
  FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb)) AS item(
    description text,
    quantity numeric,
    unit text,
    unit_price numeric,
    currency text,
    active boolean,
    exped_expected_date date
  );
$$;

-- Shared helper: optionally mint a delivery_contacts row for the manual
-- contact path (legacy insert_delivery_contact, supabase_client.py:50).
CREATE OR REPLACE FUNCTION public.po__ensure_contact(
  p_delivery_contact_id uuid,
  p_manual_contact jsonb
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_delivery_contact_id IS NOT NULL THEN
    RETURN p_delivery_contact_id;
  END IF;
  -- Legacy parity: manual contact only persisted when an address exists.
  IF p_manual_contact IS NULL
     OR NULLIF(p_manual_contact->>'name', '') IS NULL
     OR NULLIF(p_manual_contact->>'address_id', '') IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO delivery_contacts (id, name, email, phone, address_id)
  VALUES (
    gen_random_uuid(),
    p_manual_contact->>'name',
    NULLIF(p_manual_contact->>'email', ''),
    NULLIF(p_manual_contact->>'phone', ''),
    (p_manual_contact->>'address_id')::uuid
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Shared helper: insert the metadata row (legacy insert_po_bundle step 2).
CREATE OR REPLACE FUNCTION public.po__insert_metadata(p_po_id uuid, p_metadata jsonb)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO po_metadata
    (po_id, delivery_terms, delivery_date, supplier_contact_name,
     supplier_reference_number, test_certificates_required, active)
  VALUES (
    p_po_id,
    COALESCE(p_metadata->>'delivery_terms', ''),
    NULLIF(p_metadata->>'delivery_date', '')::date,
    COALESCE(p_metadata->>'supplier_contact_name', ''),
    COALESCE(p_metadata->>'supplier_reference_number', ''),
    COALESCE((p_metadata->>'test_certificates_required')::boolean, false),
    true
  );
$$;

-- CREATE: new PO, status draft, revision 'a', po_number trigger-assigned.
-- p_header: {project_id, item_seq, supplier_id, delivery_contact_id?, idempotency_key?}
-- Duplicate submits collide on ux_po_idempotency_key and raise.
CREATE OR REPLACE FUNCTION public.po_create(
  p_header jsonb,
  p_metadata jsonb,
  p_items jsonb,
  p_manual_contact jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_po_id uuid;
  v_contact_id uuid;
BEGIN
  v_contact_id := po__ensure_contact(
    NULLIF(p_header->>'delivery_contact_id', '')::uuid,
    p_manual_contact
  );

  INSERT INTO purchase_orders
    (project_id, item_seq, supplier_id, status, current_revision,
     delivery_contact_id, idempotency_key)
  VALUES (
    p_header->>'project_id',
    (p_header->>'item_seq')::integer,
    NULLIF(p_header->>'supplier_id', '')::uuid,
    'draft',
    'a',
    v_contact_id,
    NULLIF(p_header->>'idempotency_key', '')::uuid
  )
  RETURNING id INTO v_po_id;

  PERFORM po__insert_metadata(v_po_id, p_metadata);
  PERFORM po__insert_items(v_po_id, p_items);
  RETURN v_po_id;
END;
$$;

-- NEW REVISION snapshot (legacy edit branches A & C): lock the old row,
-- stale-check, deactivate old metadata/items, insert the new snapshot
-- sharing po_number. Old purchase_orders row is untouched (legacy parity —
-- "latest" is the row with an active po_metadata child / revision ranking).
-- p_last_release: pass a timestamp to stamp, NULL to carry the old value.
CREATE OR REPLACE FUNCTION public.po_new_revision(
  p_old_po_id uuid,
  p_expected_revision text,
  p_status text,
  p_revision text,
  p_last_release timestamp,
  p_header jsonb,
  p_metadata jsonb,
  p_items jsonb,
  p_manual_contact jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old purchase_orders%ROWTYPE;
  v_po_id uuid;
  v_contact_id uuid;
BEGIN
  SELECT * INTO v_old FROM purchase_orders WHERE id = p_old_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO % not found', p_old_po_id;
  END IF;
  IF v_old.current_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'stale revision: PO is at %, form loaded at % — reload and retry',
      v_old.current_revision, p_expected_revision;
  END IF;

  v_contact_id := po__ensure_contact(
    NULLIF(p_header->>'delivery_contact_id', '')::uuid,
    p_manual_contact
  );

  UPDATE po_metadata   SET active = false WHERE po_id = p_old_po_id;
  UPDATE po_line_items SET active = false WHERE po_id = p_old_po_id;

  INSERT INTO purchase_orders
    (project_id, item_seq, supplier_id, status, current_revision,
     delivery_contact_id, po_number, last_release)
  VALUES (
    COALESCE(NULLIF(p_header->>'project_id', ''), v_old.project_id),
    COALESCE((NULLIF(p_header->>'item_seq', ''))::integer, v_old.item_seq),
    v_old.supplier_id,          -- legacy parity: supplier never changes on edit
    p_status,
    p_revision,
    COALESCE(v_contact_id, v_old.delivery_contact_id),
    v_old.po_number,
    COALESCE(p_last_release, v_old.last_release)
  )
  RETURNING id INTO v_po_id;

  PERFORM po__insert_metadata(v_po_id, p_metadata);
  PERFORM po__insert_items(v_po_id, p_items);
  RETURN v_po_id;
END;
$$;

-- IN-PLACE update (legacy edit branch B — approved/issued, bump=No): same
-- row, same revision. Header update limited to project/item/status (legacy
-- parity: supplier, contact, po_number, revision untouched); metadata
-- patched; line items hard-deleted and reinserted (legacy _replace_line_items).
CREATE OR REPLACE FUNCTION public.po_update_in_place(
  p_po_id uuid,
  p_expected_revision text,
  p_status text,
  p_header jsonb,
  p_metadata jsonb,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO % not found', p_po_id;
  END IF;
  IF v_old.current_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'stale revision: PO is at %, form loaded at % — reload and retry',
      v_old.current_revision, p_expected_revision;
  END IF;

  UPDATE purchase_orders SET
    project_id = COALESCE(NULLIF(p_header->>'project_id', ''), v_old.project_id),
    item_seq   = COALESCE((NULLIF(p_header->>'item_seq', ''))::integer, v_old.item_seq),
    status     = p_status
  WHERE id = p_po_id;

  UPDATE po_metadata SET
    delivery_terms             = COALESCE(p_metadata->>'delivery_terms', delivery_terms),
    delivery_date              = COALESCE(NULLIF(p_metadata->>'delivery_date', '')::date, delivery_date),
    supplier_reference_number  = COALESCE(p_metadata->>'supplier_reference_number', supplier_reference_number),
    test_certificates_required = COALESCE((p_metadata->>'test_certificates_required')::boolean, test_certificates_required)
  WHERE po_id = p_po_id AND active = true;

  DELETE FROM po_line_items WHERE po_id = p_po_id;
  PERFORM po__insert_items(p_po_id, p_items);
  RETURN p_po_id;
END;
$$;

-- Lock down: service-role only until the RLS phase defines proper policies.
REVOKE ALL ON FUNCTION public.po__insert_items(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.po__ensure_contact(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.po__insert_metadata(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.po_create(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.po_new_revision(uuid, text, text, text, timestamp, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.po_update_in_place(uuid, text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.po_create(jsonb, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.po_new_revision(uuid, text, text, text, timestamp, jsonb, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.po_update_in_place(uuid, text, text, jsonb, jsonb, jsonb) TO service_role;

COMMIT;
