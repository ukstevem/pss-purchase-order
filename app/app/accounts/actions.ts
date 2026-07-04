"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writesEnabled } from "@/lib/writes";

// Legacy POST /accounts/update -> update_po_accounts_fields
// (supabase_client.py:1051): PATCH the base purchase_orders row with only
// the provided fields. Fails closed with a returned error.

export interface UpdateAccountsResult {
  ok: boolean;
  error?: string;
}

export async function updatePoAccounts(
  poId: string,
  fields: { acc_complete?: boolean; invoice_reference?: string }
): Promise<UpdateAccountsResult> {
  if (!writesEnabled()) {
    return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED is not set)." };
  }

  const payload: Record<string, unknown> = {};
  if (fields.acc_complete !== undefined) payload.acc_complete = Boolean(fields.acc_complete);
  if (fields.invoice_reference !== undefined) {
    payload.invoice_reference = String(fields.invoice_reference);
  }
  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "No editable fields provided." };
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("purchase_orders")
    .update(payload)
    .eq("id", poId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Update matched no rows." };
  return { ok: true };
}
