"use client";

import { useRouter } from "next/navigation";
import { formatPoNumber, shortDate } from "@/lib/format";
import type { Row } from "@/lib/po-logic";

// Colour-coded pills (9bq.14 — improvement over legacy, which styled all
// statuses identically).
const STATUS_TONE: Record<string, string> = {
  draft: "bg-zinc-200 text-zinc-800",
  approved: "bg-blue-100 text-blue-800",
  issued: "bg-green-100 text-green-800",
  complete: "bg-zinc-300 text-zinc-900",
  cancelled: "bg-red-50 text-red-700 line-through",
};

/**
 * PO list table with fully-clickable rows (legacy po_list.html data-href +
 * keyboard activation).
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
            <th className="px-4 py-2 text-center font-medium">Status</th>
            <th className="px-4 py-2 text-center font-medium">Revision</th>
            <th className="px-4 py-2 text-center font-medium">Date</th>
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
                <td className="px-4 py-2 text-center">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${STATUS_TONE[st] ?? "bg-zinc-100 text-zinc-700"}`}
                  >
                    {st ? st.charAt(0).toUpperCase() + st.slice(1) : ""}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">{po.current_revision ?? ""}</td>
                <td className="px-4 py-2 text-center">{shortDate(po.last_release)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
