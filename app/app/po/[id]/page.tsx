import { PageHeader, Alert } from "@platform/ui";
import { fetchPoDetail } from "@/lib/data";
import { formatPoNumber, formatDate, accounting, qtyFormat } from "@/lib/format";
import { sortPoLineItems, lineExpedStatus, type Row } from "@/lib/po-logic";

export const dynamic = "force-dynamic";

// Legacy po_preview (routes.py:218) + po_web.html.

const ROW_TONE: Record<string, string> = {
  delivered: "bg-green-50",
  partial: "bg-amber-50",
  late: "bg-red-50",
  none: "",
};

function AddressLines({ row }: { row: Row | null | undefined }) {
  if (!row) return <>—</>;
  return (
    <>
      {[row.name, row.address_line1, row.address_line2, row.postcode]
        .filter((v) => v !== null && v !== undefined && String(v).trim())
        .map((v, i) => (
          <div key={i}>{String(v)}</div>
        ))}
    </>
  );
}

export default async function PoPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
        <PageHeader title="Purchase Order" backHref="/po-list/" backLabel="Back to PO list" />
        <Alert variant="error">Failed to load PO: {error ?? "not found"}</Alert>
      </div>
    );
  }

  const mdList = (po.po_metadata ?? []) as Row[];
  const md: Row = mdList.length > 0 ? mdList[0] : {};
  const sup: Row = (po.suppliers as Row) ?? {};
  const dcont = po.delivery_contact;
  const items: Row[] = sortPoLineItems((po.line_items ?? []) as Row[]).map((item): Row => {
    const qty = Number(item.quantity ?? 0);
    const price = Number(item.unit_price ?? 0);
    return { ...item, total: qty * price, exped_status: lineExpedStatus(item) };
  });
  const totalValue = items.reduce((n, it) => n + Number(it.total ?? 0), 0);

  const poNumberDisplay = `${formatPoNumber(po.po_number)}-${po.projectnumber ?? po.project_id ?? ""}`;

  const contactName = dcont?.name ?? md.manual_contact_name;
  const contactPhone = dcont?.phone ?? md.manual_contact_phone;
  const contactEmail = dcont?.email ?? md.manual_contact_email;

  return (
    <div className="p-8">
      <PageHeader title="Purchase Order" backHref="/po-list/" backLabel="Back to PO list" />

      <div className="max-w-4xl rounded-lg border border-zinc-200 bg-white p-6">
        {/* Header block (po_web.html L48-63) */}
        <div className="mb-6 flex flex-wrap justify-between gap-4 border-b border-zinc-200 pb-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">PO Number</div>
            <div className="text-lg font-semibold text-zinc-900">{poNumberDisplay}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">PO Date</div>
            <div>{formatDate(po.updated_at)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Revision</div>
            <div>{po.current_revision ?? "-"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Status</div>
            <div className="capitalize">{String(po.status ?? "")}</div>
          </div>
        </div>

        {/* Supplier / delivery blocks (po_web.html L78-141) */}
        <div className="mb-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-700">Supplier</h2>
            <div className="text-sm text-zinc-800">
              <AddressLines row={sup} />
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              {md.supplier_reference_number ? (
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Ref:</dt>
                  <dd>{md.supplier_reference_number}</dd>
                </div>
              ) : null}
              {md.delivery_date ? (
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Delivery Date:</dt>
                  <dd>{formatDate(md.delivery_date)}</dd>
                </div>
              ) : null}
              {md.delivery_terms ? (
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Delivery Terms:</dt>
                  <dd className="whitespace-pre-line">{md.delivery_terms}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-700">Deliver To</h2>
            <div className="text-sm text-zinc-800">
              {po.manual_delivery_address ? (
                <div className="whitespace-pre-line">{po.manual_delivery_address}</div>
              ) : (
                <AddressLines row={po.delivery_address} />
              )}
            </div>
            {(contactName || contactPhone || contactEmail) && (
              <dl className="mt-3 space-y-1 text-sm">
                {contactName ? (
                  <div className="flex gap-2">
                    <dt className="text-zinc-500">Contact:</dt>
                    <dd>{contactName}</dd>
                  </div>
                ) : null}
                {contactPhone ? (
                  <div className="flex gap-2">
                    <dt className="text-zinc-500">Phone:</dt>
                    <dd>{contactPhone}</dd>
                  </div>
                ) : null}
                {contactEmail ? (
                  <div className="flex gap-2">
                    <dt className="text-zinc-500">Email:</dt>
                    <dd>{contactEmail}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </div>
        </div>

        {/* Line items (po_web.html) — row tone = expediting status */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr
                  key={String(item.id ?? i)}
                  className={`border-b border-zinc-100 last:border-0 ${ROW_TONE[item.exped_status] ?? ""}`}
                >
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 whitespace-pre-line">{item.description ?? ""}</td>
                  <td className="px-3 py-2 text-right">{qtyFormat(item.quantity)}</td>
                  <td className="px-3 py-2">{item.unit ?? ""}</td>
                  <td className="px-3 py-2 text-right">{accounting(item.unit_price)}</td>
                  <td className="px-3 py-2 text-right">{accounting(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                <td colSpan={5} className="px-3 py-2 text-right">
                  Total Value
                </td>
                <td className="px-3 py-2 text-right">{accounting(totalValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
