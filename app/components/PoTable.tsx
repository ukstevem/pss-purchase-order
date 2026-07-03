"use client";

import { useRouter } from "next/navigation";
import { formatPoNumber, shortDate } from "@/lib/format";
import type { Row } from "@/lib/po-logic";

/**
 * PO list table with fully-clickable rows (legacy po_list.html data-href +
 * keyboard activation). Status tags carry status-specific classes for
 * future colouring; the legacy CSS styled all statuses identically.
 */
export function PoTable({ rows }: { rows: Row[] }) {
  const router = useRouter();

  function open(row: Row) {
    const poId = row.id ?? row.purchase_order_id;
    if (poId) router.push(`/po/${poId}/`);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
            <th className="px-4 py-2 font-medium">PO Number</th>
            <th className="px-4 py-2 font-medium">Project</th>
            <th className="px-4 py-2 font-medium">Supplier</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Revision</th>
            <th className="px-4 py-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((po, i) => {
            const st = String(po.status ?? "").toLowerCase();
            return (
              <tr
                key={String(po.id ?? po.purchase_order_id ?? i)}
                tabIndex={0}
                onClick={() => open(po)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(po);
                  }
                }}
                className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none"
              >
                <td className="px-4 py-2 font-medium text-zinc-900">
                  {formatPoNumber(po.po_number)}
                </td>
                <td className="px-4 py-2">{po.projectnumber ?? po.project_id ?? ""}</td>
                <td className="px-4 py-2">{po.supplier_name ?? ""}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700 status-${st}`}>
                    {st ? st.charAt(0).toUpperCase() + st.slice(1) : ""}
                  </span>
                </td>
                <td className="px-4 py-2">{po.current_revision ?? ""}</td>
                <td className="px-4 py-2">{shortDate(po.last_release)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
