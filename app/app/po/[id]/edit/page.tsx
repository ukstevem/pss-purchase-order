import { PageHeader, Alert } from "@platform/ui";
import { PoForm, type PoFormInitial } from "@/components/PoForm";
import {
  fetchPoDetail,
  fetchProjectItemOptions,
  fetchSuppliersAsObjects,
  fetchDeliveryAddresses,
  fetchDeliveryContacts,
} from "@/lib/data";
import { formatPoNumber } from "@/lib/format";
import { writesEnabled } from "@/lib/writes";
import type { Row } from "@/lib/po-logic";
import type { PoFormItem } from "@/app/po/actions";

export const dynamic = "force-dynamic";

// Legacy edit_po GET (routes.py:751) — revision-snapshot editing.
export default async function EditPoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!writesEnabled()) {
    return (
      <div className="p-8">
        <PageHeader title="Edit Purchase Order" backHref={`/po/${id}/`} backLabel="Back to PO" />
        <Alert variant="info">
          Writes are disabled on this deployment (PO_WRITES_ENABLED is not set). Edit POs in the
          legacy system.
        </Alert>
      </div>
    );
  }

  let po: Awaited<ReturnType<typeof fetchPoDetail>> = null;
  let error: string | null = null;
  try {
    po = await fetchPoDetail(id);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !po) {
    return (
      <div className="p-8">
        <PageHeader title="Edit Purchase Order" backHref="/po-list/" backLabel="Back to PO list" />
        <Alert variant="error">Failed to load PO: {error ?? "not found"}</Alert>
      </div>
    );
  }

  const status = String(po.status ?? "draft").toLowerCase();
  if (status === "complete" || status === "cancelled") {
    return (
      <div className="p-8">
        <PageHeader title="Edit Purchase Order" backHref={`/po/${id}/`} backLabel="Back to PO" />
        <Alert variant="info">This PO is {status} and can no longer be edited.</Alert>
      </div>
    );
  }

  const [projectItems, suppliers, addresses, contacts] = await Promise.all([
    fetchProjectItemOptions(),
    fetchSuppliersAsObjects(),
    fetchDeliveryAddresses(),
    fetchDeliveryContacts(),
  ]);

  const mdList = (po.po_metadata ?? []) as Row[];
  const md: Row = mdList.length > 0 ? mdList[0] : {};
  const items: PoFormItem[] = ((po.line_items ?? []) as Row[]).map((item) => ({
    description: String(item.description ?? ""),
    quantity: item.quantity ?? "",
    unit: String(item.unit ?? ""),
    unitPrice: item.unit_price ?? "",
  }));

  const addressId = String(
    po.delivery_address?.id ?? po.delivery_contact?.address_id ?? ""
  );

  const initial: PoFormInitial = {
    poId: String(po.id),
    poNumberDisplay: `${formatPoNumber(po.po_number)}-${po.projectnumber ?? ""}`,
    expectedRevision: String(po.current_revision ?? "a"),
    status,
    projectId: String(po.project_id ?? ""),
    itemSeq: String(po.item_seq ?? ""),
    supplierId: String(po.supplier_id ?? ""),
    deliveryAddressId: addressId,
    deliveryContactId: String(po.delivery_contact_id ?? ""),
    deliveryTerms: String(md.delivery_terms ?? ""),
    deliveryDate: String(md.delivery_date ?? "").slice(0, 10),
    supplierRef: String(md.supplier_reference_number ?? ""),
    testCertRequired: Boolean(md.test_certificates_required),
    items,
  };

  return (
    <div className="p-8">
      <PageHeader
        title={`Edit ${initial.poNumberDisplay}`}
        backHref={`/po/${id}/`}
        backLabel="Back to PO"
      />
      <PoForm mode="edit" options={{ projectItems, suppliers, addresses, contacts }} initial={initial} />
    </div>
  );
}
