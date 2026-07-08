import { PageHeader, Alert } from "@platform/ui";
import { NewSupplierClient } from "@/components/SupplierPageClient";
import { writesEnabled } from "@/lib/writes";

export const dynamic = "force-dynamic";

export default function NewSupplierPage() {
  if (!writesEnabled()) {
    return (
      <div className="p-8">
        <PageHeader title="Add Supplier" backHref="/suppliers/" backLabel="Back to suppliers" />
        <Alert variant="info">Writes are disabled on this deployment (PO_WRITES_ENABLED is not set).</Alert>
      </div>
    );
  }
  return (
    <div className="p-8">
      <PageHeader title="Add Supplier" backHref="/suppliers/" backLabel="Back to suppliers" />
      <NewSupplierClient />
    </div>
  );
}
