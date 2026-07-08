import Link from "next/link";
import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { SupplierTable } from "@/components/SupplierTable";
import { fetchSuppliersFull } from "@/lib/data";
import { writesEnabled } from "@/lib/writes";
import type { Row } from "@/lib/po-logic";

export const dynamic = "force-dynamic";

// Supplier management (bead 9bq.17) — list + add; rows edit on click.
export default async function SuppliersPage() {
  let suppliers: Row[] = [];
  let error: string | null = null;
  try {
    suppliers = await fetchSuppliersFull();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="p-8">
      <PageHeader title="Suppliers">
        {writesEnabled() && (
          <Link
            href="/suppliers/new/"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            ＋ Add Supplier
          </Link>
        )}
      </PageHeader>

      {error && <Alert variant="error">Failed to load suppliers: {error}</Alert>}
      {!error && suppliers.length === 0 && <EmptyState message="No suppliers found." />}
      {suppliers.length > 0 && <SupplierTable rows={suppliers} />}
    </div>
  );
}
