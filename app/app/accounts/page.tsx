import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { FilterBar } from "@/components/FilterBar";
import { fetchAccountsOverview } from "@/lib/data";
import { formatPoNumber, accountingNumber } from "@/lib/format";
import { accountsIsCompleted, orderProjectOptions, type Row } from "@/lib/po-logic";

export const dynamic = "force-dynamic";

// Legacy accounts blueprint (blueprints/accounts.py:13). Read-only in
// phase 1 — the complete-checkbox and invoice-reference edits (POST
// /accounts/update → PATCH purchase_orders) arrive with phase 2 writes.

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const completed = (first(sp.completed).trim().toLowerCase() || "all") as
    | "all"
    | "only"
    | "exclude";
  const selectedProject = first(sp.project).trim();
  const selectedSupplier = first(sp.supplier).trim();

  let poList: Row[] = [];
  let error: string | null = null;
  try {
    poList = await fetchAccountsOverview();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const projectOptions = [...new Set(poList.map((r) => String(r.projectnumber ?? "")).filter(Boolean))].sort();
  const supplierOptions = [...new Set(poList.map((r) => String(r.supplier_name ?? "")).filter(Boolean))].sort();

  const filtered = poList.filter((row) => {
    const done = accountsIsCompleted(row);
    if (completed === "only" && !done) return false;
    if (completed === "exclude" && done) return false;
    if (selectedProject && String(row.projectnumber ?? "") !== selectedProject) return false;
    if (selectedSupplier && String(row.supplier_name ?? "") !== selectedSupplier) return false;
    return true;
  });

  return (
    <div className="p-8">
      <PageHeader title="Accounts" />

      <FilterBar
        route="/accounts/"
        selects={[
          {
            name: "completed",
            value: completed === "all" ? "" : completed,
            allLabel: "All POs",
            options: [
              { value: "only", label: "Completed only" },
              { value: "exclude", label: "Exclude completed" },
            ],
          },
          {
            name: "project",
            value: selectedProject,
            allLabel: "All projects",
            options: orderProjectOptions(projectOptions).map((p) => ({ value: p, label: p })),
          },
          {
            name: "supplier",
            value: selectedSupplier,
            allLabel: "All suppliers",
            options: supplierOptions.map((s) => ({ value: s, label: s })),
          },
        ]}
      />

      {error && <Alert variant="error">Failed to load accounts: {error}</Alert>}
      {!error && filtered.length === 0 && <EmptyState message="No purchase orders found." />}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
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
              {filtered.map((po, i) => (
                <tr key={String(po.id ?? i)} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-zinc-900">{formatPoNumber(po.po_number)}</td>
                  <td className="px-4 py-2">{po.projectnumber ?? ""}</td>
                  <td className="px-4 py-2">{po.supplier_name ?? ""}</td>
                  <td className="px-4 py-2 capitalize">{String(po.status ?? "")}</td>
                  <td className="px-4 py-2 text-right">{accountingNumber(po.total_value)}</td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={Boolean(po.acc_complete)} disabled readOnly />
                  </td>
                  <td className="px-4 py-2">{po.invoice_reference ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <p className="mt-3 text-xs text-zinc-400">
          Read-only preview — completion flags and invoice references are edited in the legacy
          system until phase 2 writes are enabled.
        </p>
      )}
    </div>
  );
}
