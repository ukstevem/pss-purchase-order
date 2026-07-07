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
import { updateLineItem } from "@/app/expediting/actions";

// Legacy expediting.html — PO rows with a delivery flag and expandable
// line-item detail. With PO_WRITES_ENABLED (bead 9bq.24) the expansion rows
// are editable with legacy JS parity: received clamped 0..qty, completed
// date auto-stamped when fully received and cleared when reduced.

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

interface ExpeditingTableProps {
  rows: Row[];
  itemsByPo: Record<string, Row[]>;
  writable?: boolean;
}

export function ExpeditingTable({ rows, itemsByPo, writable = false }: ExpeditingTableProps) {
  const [openPo, setOpenPo] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Row[]>>(itemsByPo);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const today = todayLondon();

  async function save(poId: string, item: Row, fields: Record<string, unknown>) {
    const itemId = String(item.id);
    setSavingId(itemId);
    setSaveError(null);
    try {
      const result = await updateLineItem(itemId, fields);
      if (!result.ok || !result.item) {
        setSaveError(result.error ?? "Save failed.");
        return;
      }
      const saved = result.item;
      setItems((prev) => ({
        ...prev,
        [poId]: (prev[poId] ?? []).map((it) => (String(it.id) === itemId ? { ...it, ...saved } : it)),
      }));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  /**
   * Auto-stamp/clear completed date on full receipt (legacy parity).
   * Over-receipt is allowed in the new system (deliberate divergence,
   * Steve 2026-07-04) — floor at 0 only.
   */
  function saveReceived(poId: string, item: Row, raw: string) {
    const qty = Number(item.quantity ?? 0);
    let received = Number(raw);
    if (!Number.isFinite(received)) received = 0;
    received = Math.max(0, received);

    const fields: Record<string, unknown> = { qty_received: received };
    const fullyReceived = qty > 0 && received >= qty;
    if (fullyReceived && !item.exped_completed_date) {
      fields.exped_completed_date = today;
    } else if (!fullyReceived && item.exped_completed_date) {
      fields.exped_completed_date = null;
    }
    void save(poId, item, fields);
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
            <th className="px-4 py-2 font-medium">Project</th>
            <th className="px-4 py-2 font-medium">Supplier</th>
            <th className="px-4 py-2 text-center font-medium">Delivery</th>
            <th className="px-4 py-2 text-center font-medium">Revision</th>
            <th className="px-4 py-2 text-center font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((po, i) => {
            const poId = String(po.id ?? po.purchase_order_id ?? i);
            const poItems = items[poId] ?? [];
            const poStatus = String(po.status ?? "").toLowerCase();
            // Delivery states are meaningless for cancelled/draft POs (gcc.12)
            const flag =
              poStatus === "cancelled" || poStatus === "draft"
                ? "unknown"
                : poDeliveryStatus(poItems, today);
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
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${FLAG_TONE[flag]}`}>
                      {FLAG_LABEL[flag]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">{po.current_revision ?? ""}</td>
                  <td className="px-4 py-2 text-center">{shortDate(po.last_release ?? po.updated_at ?? po.created)}</td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-zinc-100 bg-zinc-50/50">
                    <td colSpan={6} className="px-6 py-3">
                      {poItems.length === 0 ? (
                        <div className="text-sm text-zinc-500">No line items.</div>
                      ) : (
                        <table className="w-full table-fixed text-xs">
                          <thead>
                            <tr className="text-zinc-500">
                              <th className="w-2/5 px-2 py-1 text-left font-medium">Description</th>
                              <th className="px-2 py-1 text-center font-medium">Qty</th>
                              <th className="px-2 py-1 text-center font-medium">Received</th>
                              <th className="px-2 py-1 text-center font-medium">Expected</th>
                              <th className="px-2 py-1 text-center font-medium">Completed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {poItems.map((item, j) => {
                              const itemId = String(item.id ?? j);
                              const saving = savingId === itemId;
                              return (
                                <tr
                                  key={itemId}
                                  className={`${LINE_TONE[expedLineRowStatus(item, today)]} ${saving ? "opacity-50" : ""}`}
                                >
                                  <td className="px-2 py-1 whitespace-pre-line">{item.description ?? ""}</td>
                                  <td className="px-2 py-1 text-center">{Number(item.quantity ?? 0)}</td>
                                  <td className="px-2 py-1 text-center">
                                    {writable ? (
                                      <input
                                        key={`r-${item.qty_received ?? 0}`}
                                        type="number"
                                        min={0}
                                        defaultValue={Number(item.qty_received ?? 0)}
                                        disabled={saving}
                                        onBlur={(e) => {
                                          if (Number(e.target.value) !== Number(item.qty_received ?? 0)) {
                                            saveReceived(poId, item, e.target.value);
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        }}
                                        className="w-20 rounded border border-zinc-300 bg-white px-2 py-0.5 text-center"
                                      />
                                    ) : (
                                      Number(item.qty_received ?? 0)
                                    )}
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    {writable ? (
                                      <input
                                        key={`e-${item.exped_expected_date ?? ""}`}
                                        type="date"
                                        defaultValue={String(item.exped_expected_date ?? "").slice(0, 10)}
                                        disabled={saving}
                                        onChange={(e) =>
                                          void save(poId, item, { exped_expected_date: e.target.value || null })
                                        }
                                        className="rounded border border-zinc-300 bg-white px-2 py-0.5"
                                      />
                                    ) : (
                                      shortDate(item.exped_expected_date)
                                    )}
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    {writable ? (
                                      <input
                                        key={`c-${item.exped_completed_date ?? ""}`}
                                        type="date"
                                        defaultValue={String(item.exped_completed_date ?? "").slice(0, 10)}
                                        disabled={saving}
                                        onChange={(e) =>
                                          void save(poId, item, { exped_completed_date: e.target.value || null })
                                        }
                                        className="rounded border border-zinc-300 bg-white px-2 py-0.5"
                                      />
                                    ) : (
                                      shortDate(item.exped_completed_date)
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
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
