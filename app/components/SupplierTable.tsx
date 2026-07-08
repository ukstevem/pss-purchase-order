"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Row } from "@/lib/po-logic";

const TYPE_LABEL: Record<string, string> = {
  supplier: "Supplier",
  delivery: "Delivery address",
  both: "Both",
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Filterable supplier list (bead 9bq.17). */
export function SupplierTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");

  const tokens = normalize(filter).split(" ").filter(Boolean);
  const visible = tokens.length
    ? rows.filter((r) => {
        const n = normalize(String(r.name ?? ""));
        return tokens.every((t) => n.includes(t));
      })
    : rows;

  return (
    <div>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter suppliers… (e.g. rob steel)"
        className="mb-4 w-72 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
      />
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Address</th>
              <th className="px-4 py-2 font-medium">Postcode</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr
                key={String(s.id)}
                onClick={() => router.push(`/suppliers/${s.id}/`)}
                className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
              >
                <td className="px-4 py-2 font-medium text-zinc-900">{String(s.name ?? "")}</td>
                <td className="px-4 py-2">{TYPE_LABEL[String(s.type)] ?? String(s.type ?? "")}</td>
                <td className="px-4 py-2">
                  {[s.address_line1, s.address_line2].filter(Boolean).join(", ")}
                </td>
                <td className="px-4 py-2">{String(s.postcode ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        {visible.length} of {rows.length} suppliers
      </p>
    </div>
  );
}
