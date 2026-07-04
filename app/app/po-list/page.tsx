import Link from "next/link";
import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { FilterBar } from "@/components/FilterBar";
import { PoTable } from "@/components/PoTable";
import {
  fetchActivePosPage,
  fetchProjectOptions,
  fetchSupplierOptions,
  normalizeSort,
  type PoListPage,
} from "@/lib/data";
import { orderProjectOptions } from "@/lib/po-logic";

export const dynamic = "force-dynamic";

// Legacy po_list() (routes.py:153) + server-side pagination (9bq.16).
// Status dropdown mirrors the legacy hardcoded list — `approved` is
// intentionally absent (parity; see survey).
const STATUS_OPTIONS = ["draft", "issued", "complete", "cancelled"];
const PAGE_SIZE = 50;

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
  const requestedPage = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  let result: PoListPage = { rows: [], total: 0, page: 1, totalPages: 1 };
  let projects: string[] = [];
  let suppliers: string[] = [];
  let error: string | null = null;
  try {
    [result, projects, suppliers] = await Promise.all([
      fetchActivePosPage(
        {
          project: selectedProject || undefined,
          supplier: selectedSupplier || undefined,
          status: selectedStatus || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          sort,
          dir,
        },
        requestedPage,
        PAGE_SIZE
      ),
      fetchProjectOptions(),
      fetchSupplierOptions(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const { rows, total, page, totalPages } = result;
  const startIndex = rows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endIndex = (page - 1) * PAGE_SIZE + rows.length;

  // Pagination links carry every active filter (9bq.16).
  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (selectedStatus) params.set("status", selectedStatus);
    if (selectedProject) params.set("project", selectedProject);
    if (selectedSupplier) params.set("supplier", selectedSupplier);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (sort !== "po_number") params.set("sort", sort);
    if (dir !== "desc") params.set("dir", dir);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/po-list/?${qs}` : "/po-list/";
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
            options: orderProjectOptions(projects).map((p) => ({ value: p, label: p })),
          },
          {
            name: "supplier",
            value: selectedSupplier,
            allLabel: "All suppliers",
            options: suppliers.map((s) => ({ value: s, label: s })),
            searchable: true,
          },
        ]}
        dates={{ from: dateFrom, to: dateTo }}
      />

      {error && <Alert variant="error">Failed to load POs: {error}</Alert>}
      {!error && rows.length === 0 && <EmptyState message="No purchase orders found." />}

      {rows.length > 0 && (
        <>
          <p className="mb-3 text-sm text-zinc-500">
            Showing {startIndex}–{endIndex} of {total.toLocaleString("en-GB")} POs
          </p>
          <PoTable rows={rows} />
          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              {page > 1 && (
                <Link
                  href={pageHref(page - 1)}
                  className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100"
                >
                  ← Prev
                </Link>
              )}
              <span className="text-zinc-500">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={pageHref(page + 1)}
                  className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100"
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
