"use client";

import { useRef, useState } from "react";
import { formatPoNumber, accountingNumber } from "@/lib/format";
import type { Row } from "@/lib/po-logic";
import { updatePoAccounts } from "@/app/accounts/actions";

// Legacy accounts.html semantics (bead 9bq.25): checkbox saves immediately;
// invoice reference debounced 500 ms on input plus a forced save on blur.
// Fails closed with a visible banner (legacy swallowed failures — gcc.7).

export function AccountsTable({ rows, writable = false }: { rows: Row[]; writable?: boolean }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSaved = useRef<Record<string, string>>({});

  async function save(poId: string, fields: { acc_complete?: boolean; invoice_reference?: string }) {
    setSaveError(null);
    try {
      const result = await updatePoAccounts(poId, fields);
      if (!result.ok) setSaveError(result.error ?? "Save failed.");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  function saveInvoiceRef(poId: string, value: string, immediate: boolean) {
    if (timers.current[poId]) clearTimeout(timers.current[poId]);
    const run = () => {
      if (lastSaved.current[poId] === value) return;
      lastSaved.current[poId] = value;
      void save(poId, { invoice_reference: value });
    };
    if (immediate) run();
    else timers.current[poId] = setTimeout(run, 500);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      {saveError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Save failed: {saveError}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
            <th className="px-4 py-2 font-medium">PO Number</th>
            <th className="px-4 py-2 font-medium">Project Number</th>
            <th className="px-4 py-2 font-medium">Supplier</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Total Value</th>
            <th className="px-4 py-2 text-center font-medium">Complete</th>
            <th className="px-4 py-2 font-medium">Invoice Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((po, i) => {
            const poId = String(po.id ?? i);
            return (
              <tr key={poId} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-2 font-medium text-zinc-900">{formatPoNumber(po.po_number)}</td>
                <td className="px-4 py-2">{po.projectnumber ?? ""}</td>
                <td className="px-4 py-2">{po.supplier_name ?? ""}</td>
                <td className="px-4 py-2 capitalize">{String(po.status ?? "")}</td>
                <td className="px-4 py-2 text-right">{accountingNumber(po.total_value)}</td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    defaultChecked={Boolean(po.acc_complete)}
                    disabled={!writable}
                    onChange={(e) => void save(poId, { acc_complete: e.target.checked })}
                  />
                </td>
                <td className="px-4 py-2">
                  {writable ? (
                    <input
                      type="text"
                      defaultValue={String(po.invoice_reference ?? "")}
                      onChange={(e) => saveInvoiceRef(poId, e.target.value, false)}
                      onBlur={(e) => saveInvoiceRef(poId, e.target.value, true)}
                      className="w-full max-w-xs rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
                    />
                  ) : (
                    po.invoice_reference ?? ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
