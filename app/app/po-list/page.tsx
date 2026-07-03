import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { FilterBar } from "@/components/FilterBar";
import { PoTable } from "@/components/PoTable";
import {
  fetchActivePosFromView,
  fetchProjectOptions,
  fetchSupplierOptions,
  normalizeSort,
} from "@/lib/data";
import type { Row } from "@/lib/po-logic";

export const dynamic = "force-dynamic";

// Legacy po_list() (routes.py:153). Status dropdown mirrors the legacy
// hardcoded list — `approved` is intentionally absent (parity; see survey).
const STATUS_OPTIONS = ["draft", "issued", "complete", "cancelled"];

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function PoListPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const selectedStatus = first(sp.status).trim().toLowerCase();
  const selectedProject = first(sp.project).trim();
  const selectedSupplier = first(sp.supplier).trim();
  const dateFrom = first(sp.from);
  const dateTo = first(sp.to);
  const { sort, dir } = normalizeSort(first(sp.sort) || undefined, first(sp.dir) || undefined);

  let rows: Row[] = [];
  let projects: string[] = [];
  let suppliers: string[] = [];
  let error: string | null = null;
  try {
    [rows, projects, suppliers] = await Promise.all([
      fetchActivePosFromView({
        project: selectedProject || undefined,
        supplier: selectedSupplier || undefined,
        status: selectedStatus || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sort,
        dir,
      }),
      fetchProjectOptions(),
      fetchSupplierOptions(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="p-8">
      <PageHeader title="Purchase Orders" />

      <FilterBar
        route="/po-list/"
        preserve={{ sort, dir }}
        selects={[
          {
            name: "status",
            value: selectedStatus,
            allLabel: "All statuses",
            options: STATUS_OPTIONS.map((s) => ({
              value: s,
              label: s.charAt(0).toUpperCase() + s.slice(1),
            })),
          },
          {
            name: "project",
            value: selectedProject,
            allLabel: "All projects",
            options: projects.map((p) => ({ value: p, label: p })),
          },
          {
            name: "supplier",
            value: selectedSupplier,
            allLabel: "All suppliers",
            options: suppliers.map((s) => ({ value: s, label: s })),
          },
        ]}
        dates={{ from: dateFrom, to: dateTo }}
      />

      {error && <Alert variant="error">Failed to load POs: {error}</Alert>}
      {!error && rows.length === 0 && <EmptyState message="No purchase orders found." />}
      {rows.length > 0 && <PoTable rows={rows} />}
    </div>
  );
}
