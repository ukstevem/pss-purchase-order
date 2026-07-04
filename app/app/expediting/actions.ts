"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writesEnabled } from "@/lib/writes";
import type { Row } from "@/lib/po-logic";

// Legacy expediting_update_line_item (blueprints/expediting.py:175) parity:
// whitelisted fields, received clamped to 0..quantity server-side. Fails
// CLOSED with a returned error (legacy swallowed some failures — gcc.7).

const ALLOWED_FIELDS = new Set(["qty_received", "exped_expected_date", "exped_completed_date"]);

export interface UpdateLineItemResult {
  ok: boolean;
  error?: string;
  item?: Row | null;
}

export async function updateLineItem(
  itemId: string,
  fields: Record<string, unknown>
): Promise<UpdateLineItemResult> {
  if (!writesEnabled()) {
    return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED is not set)." };
  }

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k)) payload[k] = v === "" ? null : v;
  }
  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "No editable fields provided." };
  }

  const sb = getSupabaseAdmin();

  if ("qty_received" in payload) {
    const { data: itemRows, error: fetchError } = await sb
      .from("po_line_items")
      .select("id,quantity")
      .eq("id", itemId)
      .limit(1);
    if (fetchError) return { ok: false, error: fetchError.message };
    if (!itemRows?.length) return { ok: false, error: "Line item not found." };
    const qty = Number(itemRows[0].quantity ?? 0);
    const received = Number(payload.qty_received ?? 0);
    payload.qty_received = Math.min(Math.max(0, Number.isFinite(received) ? received : 0), qty);
  }

  const { data, error } = await sb
    .from("po_line_items")
    .update(payload)
    .eq("id", itemId)
    .select();
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Update matched no rows." };
  return { ok: true, item: data[0] as Row };
}
