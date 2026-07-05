import "server-only";
import { PSS_LOGO_DATA_URI } from "./logo";
import certsTable from "./certs-table.json";
import { formatPoNumber, formatDate, accounting, qtyFormat } from "@/lib/format";
import { sortPoLineItems, type Row } from "@/lib/po-logic";
import type { PoDetail } from "@/lib/data";

// PO print document composer — frozen v6 template approved by Steve
// (docs/po-pdf-template/approved-sample-v6.html, bead 9bq.31). Produces
// fully self-contained HTML for pss-pdf-service (JS disabled, external
// fetches blocked there): inline CSS, data-URI logo.

const VAT_RATE = 0.2; // legacy parity (gcc.6 tracks centralising further)

const CSS = `
* { box-sizing: border-box; }
body { font-family: 'Montserrat', Arial, sans-serif; font-size: 9pt; color: #1a1a1a; margin: 0; }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6mm; }
.head img { height: 92px; display: block; }
h1 { font-size: 14pt; color: rgb(6,27,55); margin: 0 0 2mm; }
.meta { font-size: 9pt; text-align: right; }
.blocks { display: flex; gap: 8mm; margin-bottom: 5mm; }
.block { flex: 1; border: 0.3mm solid #ccc; border-radius: 1mm; padding: 3mm; }
.block h2 { font-size: 8pt; text-transform: uppercase; color: #666; margin: 0 0 1.5mm; }
table.items { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
table.items th { background: rgb(6,27,55); color: #fff; font-size: 8pt; padding: 1.5mm; text-align: left; }
table.items td { border-bottom: 0.2mm solid #ddd; padding: 1.5mm; vertical-align: top; white-space: pre-line; }
td.c, th.c { text-align: center; } td.n, th.n { text-align: right; }
tr.tot td { border: none; font-weight: 600; text-align: right; padding: 1mm 1.5mm; white-space: normal; }
.certs-page { break-before: page; page-break-before: always; height: 265mm;
  display: flex; flex-direction: column; justify-content: flex-start; }
table.certs { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
table.certs th { border: 0.2mm solid rgba(6,27,55,.4); background: rgb(233,242,249); color: rgb(6,27,55); padding: 1mm; text-align: left; }
table.certs td { border: 0.2mm solid rgba(6,27,55,.25); padding: 1mm; }
.certs-title { font-size: 9pt; font-weight: 600; margin: 0 0 1.5mm; color: rgb(6,27,55); }
/* position:fixed repeats on every printed page in Chromium */
.watermark { position: fixed; top: 45%; left: 0; width: 100%; text-align: center;
  transform: rotate(-30deg); font-size: 34pt; font-weight: 700; letter-spacing: 2pt;
  color: rgba(180, 30, 30, 0.13); pointer-events: none; z-index: 999; }
`;

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addressLines(row: Row | null | undefined): string {
  if (!row) return "—";
  return [row.name, row.address_line1, row.address_line2, row.postcode]
    .filter((v) => v !== null && v !== undefined && String(v).trim())
    .map(esc)
    .join("<br>");
}

export interface PoPrintResult {
  html: string;
  footerLeft: string;
  fileName: string; // human-facing, e.g. "PO 007062 rev 1.pdf"
}

export interface PoPrintOptions {
  /** Diagonal per-page watermark; previews always set this, filing never does. */
  watermark?: string;
}

export function buildPoPrintHtml(po: PoDetail, options: PoPrintOptions = {}): PoPrintResult {
  const mdList = (po.po_metadata ?? []) as Row[];
  const md: Row = mdList.length > 0 ? mdList[0] : {};
  const sup: Row = (po.suppliers as Row) ?? {};
  const dcont = po.delivery_contact;

  const items = sortPoLineItems((po.line_items ?? []) as Row[]);
  let net = 0;
  const itemRows = items
    .map((item, i) => {
      const qty = Number(item.quantity ?? 0);
      const price = Number(item.unit_price ?? 0);
      const total = qty * price;
      net += total;
      return `<tr><td class="c">${i + 1}</td><td>${esc(item.description)}</td><td class="c">${qtyFormat(qty)}</td><td class="c">${esc(item.unit)}</td><td class="n">${accounting(price)}</td><td class="n">${accounting(total)}</td></tr>`;
    })
    .join("");
  const vat = net * VAT_RATE;

  const poNo = formatPoNumber(po.po_number);
  const rev = String(po.current_revision ?? "-");
  const project = String(po.projectnumber ?? po.project_id ?? "");

  const contactName = dcont?.name ?? md.manual_contact_name;
  const contactPhone = dcont?.phone ?? md.manual_contact_phone;
  const contactEmail = dcont?.email ?? md.manual_contact_email;
  const contactBits = [
    contactName ? `<strong>Contact:</strong> ${esc(contactName)}` : "",
    contactPhone ? `<strong>Phone:</strong> ${esc(contactPhone)}` : "",
    contactEmail ? `<strong>Email:</strong> ${esc(contactEmail)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");

  const supplierBits = [
    md.supplier_reference_number ? `<strong>Ref:</strong> ${esc(md.supplier_reference_number)}` : "",
    md.delivery_date ? `<strong>Delivery Date:</strong> ${esc(formatDate(md.delivery_date))}` : "",
    md.delivery_terms ? `<strong>Delivery Terms:</strong> ${esc(md.delivery_terms)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");

  // Certs table always included (Steve, 2026-07-05 — legacy parity).
  const certRows = (certsTable as { product?: string; standard?: string; documentation?: string }[])
    .map((c) => `<tr><td>${esc(c.product)}</td><td>${esc(c.standard)}</td><td>${esc(c.documentation)}</td></tr>`)
    .join("");

  const watermark = options.watermark
    ? `<div class="watermark">${esc(options.watermark)}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
${watermark}<div class="head">
  <div><img src="${PSS_LOGO_DATA_URI}" alt="PSS"></div>
  <div class="meta">
    <h1>Purchase Order</h1>
    <div><strong>PO Number:</strong> ${esc(poNo)}-${esc(project)}</div>
    <div><strong>Date:</strong> ${esc(formatDate(po.updated_at))}</div>
    <div><strong>Revision:</strong> ${esc(rev)}</div>
  </div>
</div>
<div class="blocks">
  <div class="block"><h2>Supplier</h2>${addressLines(sup)}${supplierBits ? `<br><br>${supplierBits}` : ""}</div>
  <div class="block"><h2>Deliver To</h2>${po.manual_delivery_address ? esc(po.manual_delivery_address) : addressLines(po.delivery_address)}${contactBits ? `<br><br>${contactBits}` : ""}</div>
</div>
<table class="items">
  <thead><tr><th class="c">Line</th><th>Description</th><th class="c">Qty</th><th class="c">Unit</th><th class="n">Unit Price</th><th class="n">Total</th></tr></thead>
  <tbody>${itemRows}
    <tr class="tot"><td colspan="5">Net Total</td><td class="n">${accounting(net)}</td></tr>
    <tr class="tot"><td colspan="5">VAT</td><td class="n">${accounting(vat)}</td></tr>
    <tr class="tot"><td colspan="5"><strong>Grand Total</strong></td><td class="n"><strong>${accounting(net + vat)}</strong></td></tr>
  </tbody>
</table>
<div class="certs-page">
  <div class="certs-title">Material Certification Requirements</div>
  <table class="certs">
    <thead><tr><th>Product</th><th>Standard</th><th>Documentation</th></tr></thead>
    <tbody>${certRows}</tbody>
  </table>
</div>
</body></html>`;

  return {
    html,
    footerLeft: `PO ${poNo} • Rev ${rev}`,
    fileName: `PO ${poNo} rev ${rev}.pdf`,
  };
}
