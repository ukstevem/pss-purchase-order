"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { formatPoNumber, shortDate } from "@/lib/format";
import {
  poDeliveryStatus,
  expedLineRowStatus,
  todayLondon,
  type Row,
} from "@/lib/po-logic";

// Legacy expediting.html — PO rows with a delivery flag and expandable
// line-item detail. Read-only in phase 1: the legacy inline editing of
// qty_received / expected / completed dates arrives with phase 2 writes.

const FLAG_TONE: Record<string, string> = {
  late: "bg-red-100 text-red-800",
  complete: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  unknown: "bg-zinc-100 text-zinc-500",
};

const FLAG_LABEL: Record<string, string> = {
  late: "Late",
  complete: "Complete",
  partial: "In progress",
  unknown: "—",
};

const LINE_TONE: Record<string, string> = {
  complete: "bg-green-50",
  late: "bg-red-50",
  none: "",
};

export function ExpeditingTable({
  rows,
  itemsByPo,
}: {
  rows: Row[];
  itemsByPo: Record<string, Row[]>;
}) {
  const [openPo, setOpenPo] = useState<string | null>(null);
  const today = todayLondon();

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
            <th className="px-4 py-2 font-medium">PO Number</th>
            <th className="px-4 py-2 font-medium">Project</th>
            <th className="px-4 py-2 font-medium">Supplier</th>
            <th className="px-4 py-2 font-medium">Delivery</th>
            <th className="px-4 py-2 font-medium">Revision</th>
            <th className="px-4 py-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((po, i) => {
            const poId = String(po.id ?? po.purchase_order_id ?? i);
            const items = itemsByPo[poId] ?? [];
            const flag = poDeliveryStatus(items, today);
            const isOpen = openPo === poId;
            return (
              <Fragment key={poId}>
                <tr
                  onClick={() => setOpenPo(isOpen ? null : poId)}
                  className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50"
                >
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    <span className="mr-2 inline-block w-3 text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                    <Link
                      href={`/po/${poId}/`}
                      onClick={(e) => e.stopPropagation()}
                      className="underline-offset-2 hover:underline"
                    >
                      {formatPoNumber(po.po_number)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{po.projectnumber ?? po.project_id ?? ""}</td>
                  <td className="px-4 py-2">{po.supplier_name ?? ""}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${FLAG_TONE[flag]}`}>
                      {FLAG_LABEL[flag]}
                    </span>
                  </td>
                  <td className="px-4 py-2">{po.current_revision ?? ""}</td>
                  <td className="px-4 py-2">{shortDate(po.last_release ?? po.updated_at ?? po.created)}</td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-zinc-100 bg-zinc-50/50">
                    <td colSpan={6} className="px-6 py-3">
                      {items.length === 0 ? (
                        <div className="text-sm text-zinc-500">No line items.</div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-zinc-500">
                              <th className="px-2 py-1 font-medium">Description</th>
                              <th className="px-2 py-1 text-right font-medium">Qty</th>
                              <th className="px-2 py-1 text-right font-medium">Received</th>
                              <th className="px-2 py-1 font-medium">Expected</th>
                              <th className="px-2 py-1 font-medium">Completed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item, j) => (
                              <tr
                                key={String(item.id ?? j)}
                                className={LINE_TONE[expedLineRowStatus(item, today)]}
                              >
                                <td className="px-2 py-1 whitespace-pre-line">{item.description ?? ""}</td>
                                <td className="px-2 py-1 text-right">{Number(item.quantity ?? 0)}</td>
                                <td className="px-2 py-1 text-right">{Number(item.qty_received ?? 0)}</td>
                                <td className="px-2 py-1">{shortDate(item.exped_expected_date)}</td>
                                <td className="px-2 py-1">{shortDate(item.exped_completed_date)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
