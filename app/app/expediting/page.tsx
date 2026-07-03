import Link from "next/link";
import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { ExpeditingTable } from "@/components/ExpeditingTable";
import { fetchActivePosFromView, fetchLineItemsForPos, normalizeSort } from "@/lib/data";
import type { Row } from "@/lib/po-logic";

export const dynamic = "force-dynamic";

// Legacy expediting blueprint (blueprints/expediting.py:27) — fetch all
// matching POs, paginate in memory at 50/page, delivery flags per PO.
const PO_PAGE_SIZE = 50;

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ExpeditingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  // Legacy reads the same filter params as po-list (status NOT lowercased here).
  const selectedStatus = first(sp.status).trim();
  const selectedProject = first(sp.project).trim();
  const selectedSupplier = first(sp.supplier).trim();
  const dateFrom = first(sp.from);
  const dateTo = first(sp.to);
  const { sort, dir } = normalizeSort(first(sp.sort) || undefined, first(sp.dir) || undefined);
  let page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  let allPos: Row[] = [];
  let error: string | null = null;
  try {
    allPos = await fetchActivePosFromView({
      project: selectedProject || undefined,
      supplier: selectedSupplier || undefined,
      status: selectedStatus || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sort,
      dir,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const totalPos = allPos.length;
  const totalPages = Math.max(1, Math.ceil(totalPos / PO_PAGE_SIZE));
  page = Math.min(page, totalPages);
  const startIdx = (page - 1) * PO_PAGE_SIZE;
  const poList = allPos.slice(startIdx, startIdx + PO_PAGE_SIZE);
  const startIndex = poList.length > 0 ? startIdx + 1 : 0;
  const endIndex = Math.min(startIdx + PO_PAGE_SIZE, totalPos);

  let itemsByPo: Record<string, Row[]> = {};
  if (poList.length > 0 && !error) {
    try {
      itemsByPo = await fetchLineItemsForPos(
        poList.map((po) => String(po.id ?? po.purchase_order_id)).filter(Boolean)
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (selectedStatus) params.set("status", selectedStatus);
    if (selectedProject) params.set("project", selectedProject);
    if (selectedSupplier) params.set("supplier", selectedSupplier);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/expediting/?${qs}` : "/expediting/";
  }

  return (
    <div className="p-8">
      <PageHeader title="Expediting" />

      {error && <Alert variant="error">Failed to load expediting data: {error}</Alert>}
      {!error && poList.length === 0 && <EmptyState message="No purchase orders found." />}

      {poList.length > 0 && (
        <>
          <p className="mb-3 text-sm text-zinc-500">
            Showing {startIndex}–{endIndex} of {totalPos} POs. Click a row to view line items.
          </p>
          <ExpeditingTable rows={poList} itemsByPo={itemsByPo} />
          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100">
                  ← Prev
                </Link>
              )}
              <span className="text-zinc-500">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link href={pageHref(page + 1)} className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100">
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
