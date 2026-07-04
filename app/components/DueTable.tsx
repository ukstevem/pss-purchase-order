import Link from "next/link";
import { formatPoNumber, shortDate } from "@/lib/format";
import type { DueLineItem } from "@/lib/data";

/** Compact "what's due" table above the expediting list (bead 9bq.21). */
export function DueTable({ title, rows }: { title: string; rows: DueLineItem[] }) {
  return (
    <div className="min-w-0 flex-1">
      <h2 className="mb-2 text-sm font-semibold text-zinc-700">{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-400">
          Nothing due.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
                <th className="px-3 py-1.5 font-medium">PO</th>
                <th className="px-3 py-1.5 font-medium">Project</th>
                <th className="px-3 py-1.5 font-medium">Supplier</th>
                <th className="px-3 py-1.5 font-medium">Description</th>
                <th className="px-3 py-1.5 text-center font-medium">Qty</th>
                <th className="px-3 py-1.5 text-center font-medium">Received</th>
                <th className="px-3 py-1.5 text-center font-medium">Expected</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-1.5 font-medium text-zinc-900">
                    <Link href={`/po/${r.po_id}/`} className="underline-offset-2 hover:underline">
                      {formatPoNumber(r.po_number)}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">{r.project_id ?? ""}</td>
                  <td className="px-3 py-1.5">{r.supplier_name ?? ""}</td>
                  <td className="max-w-xs truncate px-3 py-1.5" title={String(r.description ?? "")}>
                    {r.description ?? ""}
                  </td>
                  <td className="px-3 py-1.5 text-center">{Number(r.quantity ?? 0)}</td>
                  <td className="px-3 py-1.5 text-center">{Number(r.qty_received ?? 0)}</td>
                  <td className="px-3 py-1.5 text-center">{shortDate(r.exped_expected_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
