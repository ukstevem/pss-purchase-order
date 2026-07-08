import { PageHeader, Alert } from "@platform/ui";
import { EditSupplierClient } from "@/components/SupplierPageClient";
import { fetchSupplier, fetchSupplierStats, type SupplierStats } from "@/lib/data";
import { accounting, shortDate } from "@/lib/format";
import { writesEnabled } from "@/lib/writes";

export const dynamic = "force-dynamic";

// Supplier edit + light stats (bead 9bq.17) — the stats block is the seed
// for the future supplier-analysis work (9bq.18).
export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supplier: Awaited<ReturnType<typeof fetchSupplier>> = null;
  let stats: SupplierStats | null = null;
  let error: string | null = null;
  try {
    supplier = await fetchSupplier(id);
    if (supplier) stats = await fetchSupplierStats(String(supplier.name));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !supplier) {
    return (
      <div className="p-8">
        <PageHeader title="Supplier" backHref="/suppliers/" backLabel="Back to suppliers" />
        <Alert variant="error">Failed to load supplier: {error ?? "not found"}</Alert>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader
        title={String(supplier.name)}
        backHref="/suppliers/"
        backLabel="Back to suppliers"
      />

      {stats && (
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white px-5 py-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Purchase Orders</div>
            <div className="text-xl font-semibold text-zinc-900">{stats.poCount}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-5 py-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Total Spend</div>
            <div className="text-xl font-semibold text-zinc-900">{accounting(stats.totalSpend)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-5 py-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Last Order</div>
            <div className="text-xl font-semibold text-zinc-900">
              {stats.lastPoDate ? shortDate(stats.lastPoDate) : "—"}
            </div>
          </div>
        </div>
      )}

      {writesEnabled() ? (
        <EditSupplierClient
          initial={{
            id: String(supplier.id),
            name: String(supplier.name ?? ""),
            type: String(supplier.type ?? "supplier"),
            addressLine1: String(supplier.address_line1 ?? ""),
            addressLine2: String(supplier.address_line2 ?? ""),
            postcode: String(supplier.postcode ?? ""),
            county: String(supplier.county ?? ""),
            country: String(supplier.country ?? ""),
          }}
        />
      ) : (
        <Alert variant="info">Writes are disabled — supplier details are read-only.</Alert>
      )}
    </div>
  );
}
