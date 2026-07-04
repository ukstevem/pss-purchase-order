import { PageHeader, Alert } from "@platform/ui";
import { PoForm } from "@/components/PoForm";
import {
  fetchProjectItemOptions,
  fetchSuppliersAsObjects,
  fetchDeliveryAddresses,
  fetchDeliveryContacts,
} from "@/lib/data";
import { writesEnabled } from "@/lib/writes";

export const dynamic = "force-dynamic";

// Legacy create_po GET (routes.py:363) — new PO starts draft rev 'a'.
export default async function NewPoPage() {
  if (!writesEnabled()) {
    return (
      <div className="p-8">
        <PageHeader title="Create Purchase Order" backHref="/po-list/" backLabel="Back to PO list" />
        <Alert variant="info">
          Writes are disabled on this deployment (PO_WRITES_ENABLED is not set). Create POs in the
          legacy system.
        </Alert>
      </div>
    );
  }

  const [projectItems, suppliers, addresses, contacts] = await Promise.all([
    fetchProjectItemOptions(),
    fetchSuppliersAsObjects(),
    fetchDeliveryAddresses(),
    fetchDeliveryContacts(),
  ]);

  return (
    <div className="p-8">
      <PageHeader title="Create Purchase Order" backHref="/po-list/" backLabel="Back to PO list" />
      <PoForm mode="create" options={{ projectItems, suppliers, addresses, contacts }} />
    </div>
  );
}
