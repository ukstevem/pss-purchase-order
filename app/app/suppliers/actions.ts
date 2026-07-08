"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writesEnabled } from "@/lib/writes";

// Supplier add/modify (bead 9bq.17). No delete — rows are FK targets for
// delivery_contacts and purchase_orders. Duplicate-name protection is a
// soft warning (bead spec): the first create attempt reports near-matches;
// submitting again with force=true proceeds.

const TYPES = new Set(["supplier", "delivery", "both"]);

export interface SupplierPayload {
  name: string;
  type: string;
  addressLine1?: string;
  addressLine2?: string;
  postcode?: string;
  county?: string;
  country?: string;
}

export interface SaveSupplierResult {
  ok: boolean;
  id?: string;
  /** Near-duplicate names — resubmit with force to proceed. */
  duplicates?: string[];
  error?: string;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function validate(payload: SupplierPayload): { row: Record<string, string | null> } | { error: string } {
  const name = payload.name?.trim();
  if (!name) return { error: "Supplier name is required." };
  const type = payload.type?.trim().toLowerCase();
  if (!TYPES.has(type)) return { error: "Type must be supplier, delivery or both." };
  const opt = (v?: string) => (v?.trim() ? v.trim() : null);
  return {
    row: {
      name,
      type,
      address_line1: opt(payload.addressLine1),
      address_line2: opt(payload.addressLine2),
      postcode: opt(payload.postcode),
      county: opt(payload.county),
      country: opt(payload.country),
    },
  };
}

export async function createSupplier(
  payload: SupplierPayload,
  force = false
): Promise<SaveSupplierResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };
  const v = validate(payload);
  if ("error" in v) return { ok: false, error: v.error };

  const sb = getSupabaseAdmin();

  if (!force) {
    const { data, error } = await sb.from("suppliers").select("name").limit(2000);
    if (error) return { ok: false, error: error.message };
    const target = normalizeName(v.row.name!);
    const targetTokens = new Set(target.split(" "));
    const near = (data ?? [])
      .map((r) => String(r.name))
      .filter((existing) => {
        const n = normalizeName(existing);
        if (n === target) return true;
        const tokens = n.split(" ").filter((t) => t.length > 2);
        const overlap = tokens.filter((t) => targetTokens.has(t)).length;
        return tokens.length > 0 && overlap / tokens.length >= 0.6;
      })
      .slice(0, 5);
    if (near.length) return { ok: false, duplicates: near };
  }

  const { data, error } = await sb.from("suppliers").insert(v.row).select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: String(data?.[0]?.id) };
}

export async function updateSupplier(
  id: string,
  payload: SupplierPayload
): Promise<SaveSupplierResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };
  const v = validate(payload);
  if ("error" in v) return { ok: false, error: v.error };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("suppliers")
    .update({ ...v.row, modified_at: new Date().toISOString().replace(/\.\d+Z$/, "") })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Supplier not found." };
  return { ok: true, id };
}
