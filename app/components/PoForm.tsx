"use client";

import { useMemo, useState } from "react";
import { SearchSelect } from "@/components/SearchSelect";
import { accounting } from "@/lib/format";
import { allowedNextStatuses, type Row } from "@/lib/po-logic";
import { createPo, savePoEdit, type PoFormItem, type PoFormPayload } from "@/app/po/actions";

// Create/edit PO form (bead 9bq.26) — field-for-field port of legacy
// po_form.html. Manual delivery address intentionally absent (vault
// convention: delivery details go in line-item descriptions).

const INCOTERMS = [
  { value: "EXW", label: "EXW — Ex Works" },
  { value: "FCA", label: "FCA — Free Carrier" },
  { value: "CPT", label: "CPT — Carriage Paid To" },
  { value: "CIP", label: "CIP — Carriage and Insurance Paid To" },
  { value: "DAP", label: "DAP — Delivered At Place" },
  { value: "DPU", label: "DPU — Delivered at Place Unloaded" },
  { value: "DDP", label: "DDP — Delivered Duty Paid" },
  { value: "FAS", label: "FAS — Free Alongside Ship" },
  { value: "FOB", label: "FOB — Free On Board" },
  { value: "CFR", label: "CFR — Cost and Freight" },
  { value: "CIF", label: "CIF — Cost, Insurance & Freight" },
  { value: "Not Applicable", label: "Not Applicable" },
];

export interface PoFormOptions {
  projectItems: { projectnumber: string; item_seq: number; line_desc: string | null }[];
  suppliers: { id: string; name: string }[];
  addresses: Row[];
  contacts: Row[];
}

export interface PoFormInitial {
  poId: string;
  poNumberDisplay: string;
  expectedRevision: string;
  status: string;
  projectId: string;
  itemSeq: string;
  supplierId: string;
  deliveryAddressId: string;
  deliveryContactId: string;
  deliveryTerms: string;
  deliveryDate: string;
  supplierRef: string;
  testCertRequired: boolean;
  items: PoFormItem[];
}

interface PoFormProps {
  mode: "create" | "edit";
  options: PoFormOptions;
  initial?: PoFormInitial;
}

const inputCls = "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500";

/**
 * UUIDv4 without crypto.randomUUID — that API exists only in secure
 * contexts (HTTPS/localhost) and the gateway serves plain HTTP, which
 * crashed the form on 10.0.0.75. getRandomValues works everywhere.
 */
function uuid4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

export function PoForm({ mode, options, initial }: PoFormProps) {
  const [projectCombo, setProjectCombo] = useState(
    initial ? `${initial.projectId}:${initial.itemSeq}` : ""
  );
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [addressId, setAddressId] = useState(initial?.deliveryAddressId ?? "");
  const [contactId, setContactId] = useState(initial?.deliveryContactId ?? "");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState(initial?.deliveryTerms ?? "");
  const [deliveryDate, setDeliveryDate] = useState(initial?.deliveryDate ?? "");
  const [supplierRef, setSupplierRef] = useState(initial?.supplierRef ?? "");
  const [testCert, setTestCert] = useState(initial?.testCertRequired ?? false);
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [bump, setBump] = useState(false);
  const [items, setItems] = useState<PoFormItem[]>(
    initial?.items?.length
      ? initial.items
      : [{ description: "", quantity: "", unit: "", unitPrice: "" }]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => uuid4());

  const projectOptions = useMemo(
    () =>
      options.projectItems.map((pi) => ({
        value: `${pi.projectnumber}:${pi.item_seq}`,
        label: `${pi.projectnumber}-${pi.item_seq}${pi.line_desc ? ` - ${pi.line_desc}` : ""}`,
      })),
    [options.projectItems]
  );
  const supplierOptions = useMemo(
    () => options.suppliers.map((s) => ({ value: s.id, label: s.name })),
    [options.suppliers]
  );

  // Legacy filterContacts: contacts limited to the selected address.
  const visibleContacts = options.contacts.filter(
    (c) => addressId && String(c.address_id ?? "") === addressId
  );

  const net = items.reduce((n, item) => {
    const qty = Number(String(item.quantity).replace(/[£,]/g, "")) || 0;
    const price = Number(String(item.unitPrice).replace(/[£,]/g, "")) || 0;
    return n + qty * price;
  }, 0);

  function setItem(idx: number, patch: Partial<PoFormItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const [projectId, itemSeq] = projectCombo.split(":");
    const payload: PoFormPayload = {
      projectId: projectId ?? "",
      itemSeq: itemSeq ?? "",
      supplierId,
      deliveryAddressId: addressId || undefined,
      deliveryContactId: contactId || undefined,
      manualContact:
        contactId === "manual"
          ? { name: manualName, phone: manualPhone, email: manualEmail }
          : undefined,
      deliveryTerms,
      deliveryDate,
      supplierRef,
      testCertRequired: testCert,
      items,
      idempotencyKey,
    };

    try {
      const result =
        mode === "create"
          ? await createPo(payload)
          : await savePoEdit({
              ...payload,
              poId: initial!.poId,
              expectedRevision: initial!.expectedRevision,
              status,
              bumpRevision: bump,
            });
      if (!result.ok || !result.poId) {
        setError(result.error ?? "Save failed.");
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Full navigation — the Next router would re-prepend basePath.
      window.location.href = `/purchase-order/po/${result.poId}/`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const currentStatus = (initial?.status ?? "draft").toLowerCase();
  const showBump = mode === "edit" && ["approved", "issued"].includes(currentStatus);

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className={labelCls}>Project / Item *</label>
          <SearchSelect
            value={projectCombo}
            options={projectOptions}
            placeholder="Select project / item…"
            onSelect={setProjectCombo}
            className="w-full"
          />
        </div>
        <div>
          <label className={labelCls}>Supplier *{mode === "edit" ? " (fixed after creation)" : ""}</label>
          {mode === "edit" ? (
            <input
              className={`${inputCls} bg-zinc-100 text-zinc-500`}
              value={supplierOptions.find((s) => s.value === supplierId)?.label ?? ""}
              disabled
              title="Legacy parity: the supplier cannot be changed on edit"
            />
          ) : (
            <SearchSelect
              value={supplierId}
              options={supplierOptions}
              placeholder="Select supplier…"
              onSelect={setSupplierId}
              className="w-full"
            />
          )}
        </div>
        <div>
          <label className={labelCls}>Delivery Address</label>
          <select
            className={inputCls}
            value={addressId}
            onChange={(e) => {
              setAddressId(e.target.value);
              setContactId("");
            }}
          >
            <option value="">— Select address —</option>
            {options.addresses.map((a) => (
              <option key={String(a.id)} value={String(a.id)}>
                {String(a.name ?? "")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Delivery Contact</label>
          <select
            className={inputCls}
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            disabled={!addressId}
          >
            <option value="">— Select contact —</option>
            {visibleContacts.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {String(c.name ?? "")}
              </option>
            ))}
            <option value="manual">Manual…</option>
          </select>
        </div>
      </div>

      {contactId === "manual" && (
        <div className="grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Contact Name *</label>
            <input className={inputCls} value={manualName} onChange={(e) => setManualName(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className={labelCls}>Supplier Reference</label>
          <input className={inputCls} value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Delivery Date *</label>
          <input
            className={inputCls}
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Delivery Terms *</label>
          <select
            className={inputCls}
            value={deliveryTerms}
            onChange={(e) => setDeliveryTerms(e.target.value)}
            required
          >
            <option value="">-- Select Incoterm --</option>
            {INCOTERMS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Test Certificates</label>
          <select
            className={inputCls}
            value={testCert ? "1" : "0"}
            onChange={(e) => setTestCert(e.target.value === "1")}
          >
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">Line Items</h2>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, { description: "", quantity: "", unit: "", unitPrice: "" }])}
            className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
          >
            + Add line
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
                <th className="w-2/5 px-3 py-2 font-medium">Description *</th>
                <th className="px-3 py-2 text-center font-medium">Qty *</th>
                <th className="px-3 py-2 text-center font-medium">Unit *</th>
                <th className="px-3 py-2 text-center font-medium">Unit Price</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="w-10 px-1 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const qty = Number(String(item.quantity).replace(/[£,]/g, "")) || 0;
                const price = Number(String(item.unitPrice).replace(/[£,]/g, "")) || 0;
                return (
                  <tr key={idx} className="border-b border-zinc-100 align-top last:border-0">
                    <td className="px-3 py-2">
                      <textarea
                        className={`${inputCls} min-h-9`}
                        rows={1}
                        value={item.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={`${inputCls} text-center`}
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.quantity}
                        onChange={(e) => setItem(idx, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={`${inputCls} text-center`}
                        value={item.unit}
                        onChange={(e) => setItem(idx, { unit: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={`${inputCls} text-right`}
                        inputMode="decimal"
                        value={item.unitPrice}
                        onChange={(e) => setItem(idx, { unitPrice: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{accounting(qty * price)}</td>
                    <td className="px-1 py-2">
                      <button
                        type="button"
                        aria-label="Remove line"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="rounded px-2 py-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                <td colSpan={4} className="px-3 py-2 text-right">
                  Total (net)
                </td>
                <td className="px-3 py-2 text-right">{accounting(net)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {testCert && (
          <p className="mt-2 text-xs text-zinc-500">
            A "Test Certificates" line (1 Set, £0.00) is added automatically.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          {mode === "edit" && (
            <>
              <div>
                <label className={labelCls}>Status</label>
                <select
                  className={`${inputCls} w-44`}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {allowedNextStatuses(currentStatus).map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              {showBump && (
                <div>
                  <label className={labelCls}>Bump Revision</label>
                  <select
                    className={`${inputCls} w-44`}
                    value={bump ? "1" : "0"}
                    onChange={(e) => setBump(e.target.value === "1")}
                  >
                    <option value="0">No — save in place</option>
                    <option value="1">Yes — new revision</option>
                  </select>
                </div>
              )}
              {initial && (
                <span className="pb-1.5 text-sm text-zinc-500">
                  {initial.poNumberDisplay} — currently {currentStatus} rev {initial.expectedRevision}
                </span>
              )}
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {submitting
            ? "Saving…"
            : mode === "create"
              ? "Create PO (draft rev a)"
              : "Save PO"}
        </button>
      </div>
    </form>
  );
}
