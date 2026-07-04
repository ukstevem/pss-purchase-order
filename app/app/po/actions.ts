"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writesEnabled } from "@/lib/writes";
import {
  validatePoStatus,
  getNextRevision,
  coerceRevOnLeavingDraft,
  computeUpdatedRevision,
  shouldStampRelease,
} from "@/lib/po-logic";

// Create / edit PO write path (bead 9bq.26). Field handling mirrors legacy
// create_po (routes.py:279) / edit_po (routes.py:423) + parse_po_form
// (utils/forms.py:14); persistence goes through the atomic Postgres
// functions in db/po_write_functions.sql instead of legacy's sequential
// REST calls.

export interface PoFormItem {
  description: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
}

export interface PoFormPayload {
  projectId: string;
  itemSeq: string;
  supplierId: string;
  deliveryAddressId?: string;
  deliveryContactId?: string; // uuid | "manual" | ""
  manualContact?: { name?: string; phone?: string; email?: string };
  deliveryTerms: string;
  deliveryDate: string; // YYYY-MM-DD
  supplierRef?: string;
  testCertRequired: boolean;
  items: PoFormItem[];
  idempotencyKey?: string; // create only
}

export interface SavePoResult {
  ok: boolean;
  poId?: string;
  error?: string;
}

/** Legacy _to_float (forms.py:1-12): strips £/commas, 0.0 on invalid. */
function toNumber(v: number | string | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[£,]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Legacy parse_po_form line-item rules. */
function buildItems(payload: PoFormPayload): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const item of payload.items ?? []) {
    const desc = String(item.description ?? "").trim();
    if (!desc) continue; // skip blank rows
    if (desc.toLowerCase() === "test certificates") continue; // avoid duplicating the injected line
    items.push({
      description: desc,
      quantity: toNumber(item.quantity),
      unit: String(item.unit ?? ""),
      unit_price: toNumber(item.unitPrice),
      currency: "GBP",
      active: true,
    });
  }
  if (payload.testCertRequired) {
    items.push({
      description: "Test Certificates",
      quantity: 1.0,
      unit: "Set",
      unit_price: 0.0,
      currency: "GBP",
      active: true,
    });
  }
  for (const item of items) {
    // Legacy propagates the PO delivery date onto every line (forms.py:71-77).
    item.exped_expected_date = payload.deliveryDate || null;
  }
  return items;
}

interface ValidatedCommon {
  header: Record<string, unknown>;
  metadata: Record<string, unknown>;
  items: Record<string, unknown>[];
  manualContact: Record<string, unknown> | null;
}

function validateCommon(payload: PoFormPayload): ValidatedCommon | { error: string } {
  if (!payload.projectId?.trim() || !payload.itemSeq?.trim()) {
    return { error: "Please select a Project / Item." };
  }
  if (!payload.supplierId?.trim()) return { error: "Please select a supplier." };
  if (!payload.deliveryTerms?.trim()) return { error: "Delivery terms are required." };
  if (!payload.deliveryDate?.trim()) return { error: "Delivery date is required." };

  const contactId = (payload.deliveryContactId ?? "").trim();
  let manualContact: Record<string, unknown> | null = null;
  let deliveryContactId: string | null = null;

  if (contactId === "manual") {
    // Legacy: manual contact requires a structured address + a name.
    if (!payload.deliveryAddressId?.trim()) {
      return { error: "Manual contact requires a delivery address." };
    }
    if (!payload.manualContact?.name?.trim()) {
      return { error: "Manual contact requires a contact name." };
    }
    manualContact = {
      name: payload.manualContact.name.trim(),
      phone: payload.manualContact.phone?.trim() || null,
      email: payload.manualContact.email?.trim() || null,
      address_id: payload.deliveryAddressId.trim(),
    };
  } else if (contactId) {
    deliveryContactId = contactId;
  }

  return {
    header: {
      project_id: payload.projectId.trim(),
      item_seq: Number.parseInt(payload.itemSeq, 10),
      supplier_id: payload.supplierId.trim(),
      delivery_contact_id: deliveryContactId,
    },
    metadata: {
      delivery_terms: payload.deliveryTerms,
      delivery_date: payload.deliveryDate,
      supplier_reference_number: payload.supplierRef?.trim() || "",
      test_certificates_required: Boolean(payload.testCertRequired),
    },
    items: buildItems(payload),
    manualContact,
  };
}

export async function createPo(payload: PoFormPayload): Promise<SavePoResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };

  const v = validateCommon(payload);
  if ("error" in v) return { ok: false, error: v.error };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc("po_create", {
    p_header: { ...v.header, idempotency_key: payload.idempotencyKey || null },
    p_metadata: v.metadata,
    p_items: v.items,
    p_manual_contact: v.manualContact,
  });
  if (error) {
    if (error.message.includes("ux_po_idempotency_key")) {
      return { ok: false, error: "This form was already submitted." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, poId: String(data) };
}

export interface EditPoPayload extends PoFormPayload {
  poId: string;
  expectedRevision: string; // revision the form loaded with (stale guard)
  status: string;
  bumpRevision: boolean;
}

export async function savePoEdit(payload: EditPoPayload): Promise<SavePoResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };

  const sb = getSupabaseAdmin();
  const { data: poRows, error: fetchError } = await sb
    .from("purchase_orders")
    .select("id,status,current_revision,po_number,last_release")
    .eq("id", payload.poId)
    .limit(1);
  if (fetchError) return { ok: false, error: fetchError.message };
  const po = poRows?.[0];
  if (!po) return { ok: false, error: "PO not found." };

  const currentStatus = String(po.status ?? "draft").toLowerCase();
  const currentRev = String(po.current_revision ?? "a").trim();

  // Legacy guards (routes.py:569-588).
  if (currentStatus === "complete" || currentStatus === "cancelled") {
    return { ok: false, error: `This PO is ${currentStatus} and cannot be edited.` };
  }
  if (currentRev !== payload.expectedRevision.trim()) {
    return {
      ok: false,
      error: `Stale revision: PO is at '${currentRev}', your form loaded '${payload.expectedRevision}'. Reload and retry.`,
    };
  }
  let newStatus: string;
  try {
    newStatus = validatePoStatus(payload.status || currentStatus);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (currentStatus !== "draft" && newStatus === "draft") {
    return { ok: false, error: "You cannot revert an approved PO back to draft." };
  }

  const v = validateCommon(payload);
  if ("error" in v) return { ok: false, error: v.error };

  // Legacy decision matrix (routes.py:643-743).
  const alwaysBump = currentStatus === "draft";
  const bumpFlag = payload.bumpRevision === true;
  const bumpAllowedAfterRelease = newStatus === "approved" || newStatus === "issued";

  try {
    if (!alwaysBump && bumpAllowedAfterRelease && !bumpFlag) {
      // Branch B — in-place, same revision, same row.
      const { data, error } = await sb.rpc("po_update_in_place", {
        p_po_id: payload.poId,
        p_expected_revision: currentRev,
        p_status: newStatus,
        p_header: v.header,
        p_metadata: v.metadata,
        p_items: v.items,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, poId: String(data) };
    }

    // Branches A & C — new snapshot.
    let targetRev: string;
    if (alwaysBump) {
      targetRev = coerceRevOnLeavingDraft(getNextRevision(currentRev), currentStatus, newStatus);
    } else {
      targetRev = bumpFlag
        ? getNextRevision(currentRev)
        : computeUpdatedRevision(currentRev, currentStatus, newStatus);
      targetRev = coerceRevOnLeavingDraft(targetRev, currentStatus, newStatus);
    }

    const lastRelease = shouldStampRelease(currentRev, targetRev)
      ? new Date().toISOString().replace(/\.\d+Z$/, "") // timestamp-without-tz, UTC (legacy utcnow)
      : null; // function carries the old value forward

    const { data, error } = await sb.rpc("po_new_revision", {
      p_old_po_id: payload.poId,
      p_expected_revision: currentRev,
      p_status: newStatus,
      p_revision: targetRev,
      p_last_release: lastRelease,
      p_header: v.header,
      p_metadata: v.metadata,
      p_items: v.items,
      p_manual_contact: v.manualContact,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, poId: String(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
