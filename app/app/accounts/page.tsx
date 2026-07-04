import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { FilterBar } from "@/components/FilterBar";
import { AccountsTable } from "@/components/AccountsTable";
import { fetchAccountsOverview } from "@/lib/data";
import { accountsIsCompleted, orderProjectOptions, type Row } from "@/lib/po-logic";
import { writesEnabled } from "@/lib/writes";

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
            searchable: true,
          },
        ]}
      />

      {error && <Alert variant="error">Failed to load accounts: {error}</Alert>}
      {!error && filtered.length === 0 && <EmptyState message="No purchase orders found." />}

      {filtered.length > 0 && <AccountsTable rows={filtered} writable={writesEnabled()} />}

      {filtered.length > 0 && !writesEnabled() && (
        <p className="mt-3 text-xs text-zinc-400">
          Read-only — completion flags and invoice references are edited in the legacy system
          until writes are enabled.
        </p>
      )}
    </div>
  );
}
