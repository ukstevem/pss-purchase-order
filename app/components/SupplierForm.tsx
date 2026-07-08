"use client";

import { useState } from "react";
import { createSupplier, updateSupplier, type SupplierPayload } from "@/app/suppliers/actions";

// Shared supplier add/edit form (bead 9bq.17) — used by the standalone
// /suppliers pages and the in-PO-form modal. Duplicate handling is a soft
// confirm: first create attempt reports near-matches, "Create anyway"
// resubmits with force.

const TYPE_OPTIONS = [
  { value: "supplier", label: "Supplier — we buy from them" },
  { value: "delivery", label: "Delivery address — we ship to them" },
  { value: "both", label: "Both" },
];

export interface SupplierFormInitial extends SupplierPayload {
  id?: string;
}

interface SupplierFormProps {
  initial?: SupplierFormInitial;
  /** Called with the saved supplier's id + name after a successful save. */
  onSaved: (id: string, name: string) => void;
  onCancel?: () => void;
}

const inputCls = "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500";

export function SupplierForm({ initial, onSaved, onCancel }: SupplierFormProps) {
  const editing = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "supplier");
  const [addressLine1, setAddressLine1] = useState(initial?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(initial?.addressLine2 ?? "");
  const [postcode, setPostcode] = useState(initial?.postcode ?? "");
  const [county, setCounty] = useState(initial?.county ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<string[] | null>(null);

  async function save(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const payload: SupplierPayload = {
        name,
        type,
        addressLine1,
        addressLine2,
        postcode,
        county,
        country,
      };
      const result = editing
        ? await updateSupplier(initial!.id!, payload)
        : await createSupplier(payload, force);
      if (!result.ok) {
        if (result.duplicates?.length) {
          setDuplicates(result.duplicates);
        } else {
          setDuplicates(null);
          setError(result.error ?? "Save failed.");
        }
        return;
      }
      onSaved(result.id!, name.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
        }
      }}
      className="space-y-4"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {duplicates && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="mb-2 font-medium">Similar suppliers already exist:</p>
          <ul className="mb-3 list-inside list-disc">
            {duplicates.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
              className="rounded border border-amber-400 bg-white px-3 py-1 text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              Create anyway
            </button>
            <button
              type="button"
              onClick={() => setDuplicates(null)}
              className="rounded px-3 py-1 text-sm text-amber-800 hover:underline"
            >
              Go back
            </button>
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Name *</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className={labelCls}>Type *</label>
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Address Line 1</label>
          <input className={inputCls} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Address Line 2</label>
          <input className={inputCls} value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Postcode</label>
          <input className={inputCls} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>County</label>
          <input className={inputCls} value={county} onChange={(e) => setCounty(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Country</label>
          <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : editing ? "Save Supplier" : "Create Supplier"}
        </button>
      </div>
    </form>
  );
}
