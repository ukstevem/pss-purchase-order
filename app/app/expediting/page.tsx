import Link from "next/link";
import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { FilterBar } from "@/components/FilterBar";
import { ExpeditingTable } from "@/components/ExpeditingTable";
import { DueTable } from "@/components/DueTable";
import {
  fetchExpeditingPage,
  fetchDueLineItems,
  fetchProjectOptions,
  fetchSupplierOptions,
  normalizeSort,
  type ExpeditingPageData,
  type DueLineItem,
} from "@/lib/data";
import { addDays, endOfWorkWeek, orderProjectOptions, todayLondon } from "@/lib/po-logic";
import { writesEnabled } from "@/lib/writes";

export const dynamic = "force-dynamic";

// Expediting (beads 9bq.19/21): PO-list filters + pagination, a derived
// delivery filter, and due-soon tables above the list.
const STATUS_OPTIONS = ["draft", "issued", "complete", "cancelled"];
const DELIVERY_OPTIONS = [
  { value: "late", label: "Late" },
  { value: "partial", label: "In progress" },
  { value: "complete", label: "Complete" },
];
const PAGE_SIZE = 50;

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ExpeditingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const selectedStatus = first(sp.status).trim().toLowerCase();
  const selectedProject = first(sp.project).trim();
  const selectedSupplier = first(sp.supplier).trim();
  const selectedDelivery = first(sp.delivery).trim().toLowerCase();
  const dateFrom = first(sp.from);
  const dateTo = first(sp.to);
  const { sort, dir } = normalizeSort(first(sp.sort) || undefined, first(sp.dir) || undefined);
  const requestedPage = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  const today = todayLondon();
  const dueSoonEnd = addDays(today, 1);
  const weekStart = addDays(today, 2);
  const weekEnd = endOfWorkWeek(today);

  let result: ExpeditingPageData = { rows: [], itemsByPo: {}, total: 0, page: 1, totalPages: 1 };
  let due24: DueLineItem[] = [];
  let dueWeek: DueLineItem[] = [];
  let projects: string[] = [];
  let suppliers: string[] = [];
  let error: string | null = null;
  try {
    [result, due24, dueWeek, projects, suppliers] = await Promise.all([
      fetchExpeditingPage(
        {
          project: selectedProject || undefined,
          supplier: selectedSupplier || undefined,
          status: selectedStatus || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          sort,
          dir,
        },
        selectedDelivery || undefined,
        requestedPage,
        PAGE_SIZE
      ),
      fetchDueLineItems(today, dueSoonEnd),
      fetchDueLineItems(weekStart, weekEnd),
      fetchProjectOptions(),
      fetchSupplierOptions(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const { rows, itemsByPo, total, page, totalPages } = result;
  const startIndex = rows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endIndex = (page - 1) * PAGE_SIZE + rows.length;

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (selectedStatus) params.set("status", selectedStatus);
    if (selectedProject) params.set("project", selectedProject);
    if (selectedSupplier) params.set("supplier", selectedSupplier);
    if (selectedDelivery) params.set("delivery", selectedDelivery);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (sort !== "po_number") params.set("sort", sort);
    if (dir !== "desc") params.set("dir", dir);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/expediting/?${qs}` : "/expediting/";
  }

  return (
    <div className="p-8">
      <PageHeader title="Expediting" />

      {error && <Alert variant="error">Failed to load expediting data: {error}</Alert>}

      {!error && (
        <div className="mb-6 flex flex-col gap-4 xl:flex-row">
          <DueTable title="Due within 24 hours" rows={due24} />
          <DueTable title={`Due this work week (to ${weekEnd.slice(8, 10)}/${weekEnd.slice(5, 7)})`} rows={dueWeek} />
        </div>
      )}

      <FilterBar
        route="/expediting/"
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
          {
            name: "delivery",
            value: selectedDelivery,
            allLabel: "All deliveries",
            options: DELIVERY_OPTIONS,
          },
        ]}
        dates={{ from: dateFrom, to: dateTo }}
      />

      {!error && rows.length === 0 && <EmptyState message="No purchase orders found." />}

      {rows.length > 0 && (
        <>
          <p className="mb-3 text-sm text-zinc-500">
            Showing {startIndex}–{endIndex} of {total.toLocaleString("en-GB")} POs. Click a row to
            view line items{writesEnabled() ? " and edit receipt details" : ""}.
          </p>
          <ExpeditingTable rows={rows} itemsByPo={itemsByPo} writable={writesEnabled()} />
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
