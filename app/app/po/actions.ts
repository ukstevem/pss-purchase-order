"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writesEnabled } from "@/lib/writes";
import {
  validatePoStatus,
  getNextRevision,
  coerceRevOnLeavingDraft,
  computeUpdatedRevision,
  shouldStampRelease,
} from "@/lib/po-logic";
import { fetchPoDetail } from "@/lib/data";
import { buildPoPrintHtml } from "@/lib/pdf/po-print-html";
import { fileHtmlDocument } from "@/lib/pdf/clients";
import {
  createDraftWithAttachment,
  buildSubjectAndBody,
  emailDraftEnabled,
} from "@/lib/email/graph";
import { formatPoNumber } from "@/lib/format";

// Create / edit PO write path (bead 9bq.26). Field handling mirrors legacy
// create_po (routes.py:279) / edit_po (routes.py:423) + parse_po_form
// (utils/forms.py:14); persistence goes through the atomic Postgres
// functions in db/po_write_functions.sql instead of legacy's sequential
// REST calls.

export interface PoFormItem {
  description: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
}

export interface PoFormPayload {
  projectId: string;
  itemSeq: string;
  supplierId: string;
  deliveryAddressId?: string;
  deliveryContactId?: string; // uuid | "manual" | ""
  manualContact?: { name?: string; phone?: string; email?: string };
  deliveryTerms: string;
  deliveryDate: string; // YYYY-MM-DD
  supplierRef?: string;
  testCertRequired: boolean;
  items: PoFormItem[];
  idempotencyKey?: string; // create only
}

export interface SavePoResult {
  ok: boolean;
  poId?: string;
  error?: string;
}

/** Legacy _to_float (forms.py:1-12): strips £/commas, 0.0 on invalid. */
function toNumber(v: number | string | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[£,]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Legacy parse_po_form line-item rules. */
function buildItems(payload: PoFormPayload): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const item of payload.items ?? []) {
    const desc = String(item.description ?? "").trim();
    if (!desc) continue; // skip blank rows
    if (desc.toLowerCase() === "test certificates") continue; // avoid duplicating the injected line
    items.push({
      description: desc,
      quantity: toNumber(item.quantity),
      unit: String(item.unit ?? ""),
      unit_price: toNumber(item.unitPrice),
      currency: "GBP",
      active: true,
    });
  }
  if (payload.testCertRequired) {
    items.push({
      description: "Test Certificates",
      quantity: 1.0,
      unit: "Set",
      unit_price: 0.0,
      currency: "GBP",
      active: true,
    });
  }
  for (const item of items) {
    // Legacy propagates the PO delivery date onto every line (forms.py:71-77).
    item.exped_expected_date = payload.deliveryDate || null;
  }
  return items;
}

interface ValidatedCommon {
  header: Record<string, unknown>;
  metadata: Record<string, unknown>;
  items: Record<string, unknown>[];
  manualContact: Record<string, unknown> | null;
}

function validateCommon(payload: PoFormPayload): ValidatedCommon | { error: string } {
  if (!payload.projectId?.trim() || !payload.itemSeq?.trim()) {
    return { error: "Please select a Project / Item." };
  }
  if (!payload.supplierId?.trim()) return { error: "Please select a supplier." };
  if (!payload.deliveryTerms?.trim()) return { error: "Delivery terms are required." };
  if (!payload.deliveryDate?.trim()) return { error: "Delivery date is required." };

  const contactId = (payload.deliveryContactId ?? "").trim();
  let manualContact: Record<string, unknown> | null = null;
  let deliveryContactId: string | null = null;

  if (contactId === "manual") {
    // Legacy: manual contact requires a structured address + a name.
    if (!payload.deliveryAddressId?.trim()) {
      return { error: "Manual contact requires a delivery address." };
    }
    if (!payload.manualContact?.name?.trim()) {
      return { error: "Manual contact requires a contact name." };
    }
    manualContact = {
      name: payload.manualContact.name.trim(),
      phone: payload.manualContact.phone?.trim() || null,
      email: payload.manualContact.email?.trim() || null,
      address_id: payload.deliveryAddressId.trim(),
    };
  } else if (contactId) {
    deliveryContactId = contactId;
  }

  return {
    header: {
      project_id: payload.projectId.trim(),
      item_seq: Number.parseInt(payload.itemSeq, 10),
      supplier_id: payload.supplierId.trim(),
      delivery_contact_id: deliveryContactId,
    },
    metadata: {
      delivery_terms: payload.deliveryTerms,
      delivery_date: payload.deliveryDate,
      supplier_reference_number: payload.supplierRef?.trim() || "",
      test_certificates_required: Boolean(payload.testCertRequired),
    },
    items: buildItems(payload),
    manualContact,
  };
}

export async function createPo(payload: PoFormPayload): Promise<SavePoResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };

  const v = validateCommon(payload);
  if ("error" in v) return { ok: false, error: v.error };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc("po_create", {
    p_header: { ...v.header, idempotency_key: payload.idempotencyKey || null },
    p_metadata: v.metadata,
    p_items: v.items,
    p_manual_contact: v.manualContact,
  });
  if (error) {
    if (error.message.includes("ux_po_idempotency_key")) {
      return { ok: false, error: "This form was already submitted." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, poId: String(data) };
}

export interface FilePoResult {
  ok: boolean;
  docNumber?: string;
  alreadyFiled?: boolean;
  error?: string;
}

/**
 * Render + file the issued PO PDF via doc-service /api/file-html and stamp
 * the registry reference on the revision row (bead 9bq.31). Skips when a
 * doc is already stamped — the doc-service dedup never fires for rendered
 * bytes, so the guard lives here.
 */
export async function filePoPdf(poId: string): Promise<FilePoResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };

  const sb = getSupabaseAdmin();
  try {
    const po = await fetchPoDetail(poId);
    if (!po) return { ok: false, error: "PO not found." };
    if (String(po.status ?? "").toLowerCase() !== "issued") {
      return { ok: false, error: "Only issued POs are filed. Use Preview PDF for drafts." };
    }
    if (po.issued_doc_id) {
      return { ok: true, alreadyFiled: true, docNumber: String(po.issued_doc_number ?? "") };
    }

    const doc = buildPoPrintHtml(po);
    const filed = await fileHtmlDocument({
      html: doc.html,
      footerLeft: doc.footerLeft,
      projectNumber: String(po.project_id ?? ""),
      originalFileName: doc.fileName,
    });

    const { error } = await sb
      .from("purchase_orders")
      .update({ issued_doc_id: filed.id, issued_doc_number: filed.doc_number })
      .eq("id", poId);
    if (error) {
      // Filed but not stamped — surface loudly; doc_number in the message
      // lets it be reconciled by hand.
      return {
        ok: false,
        error: `PDF filed as ${filed.doc_number} but stamping the PO failed: ${error.message}. Retry will re-file; reconcile manually.`,
      };
    }

    // Legacy issue flow created the Outlook draft alongside the PDF —
    // best-effort here too; the preview's Email Draft button is the retry.
    const draft = await createPoEmailDraft(poId);
    if (!draft.ok && !draft.skipped) {
      console.error("[purchase-order] auto email draft failed:", draft.error);
    }

    return { ok: true, docNumber: filed.doc_number };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface EmailDraftResult {
  ok: boolean;
  skipped?: string; // disabled/unconfigured — not an error for the auto path
  webLink?: string;
  error?: string;
}

/**
 * Outlook draft with the FILED artifact attached (bead 9bq.7 — legacy
 * try_create_po_draft parity: draft only, never sent; subject/body exact).
 * Fail-closed single-flight: atomically claims email_draft_at before
 * talking to Graph (legacy's file lock failed open — gcc.7).
 */
export async function createPoEmailDraft(poId: string): Promise<EmailDraftResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };
  if (!emailDraftEnabled()) return { ok: false, skipped: "EMAIL_DRAFT_ON_PO is not enabled." };
  const mailbox = process.env.MS_OUTLOOK_MAILBOX;
  if (!mailbox) return { ok: false, skipped: "MS_OUTLOOK_MAILBOX is not set." };

  const sb = getSupabaseAdmin();
  const po = await fetchPoDetail(poId);
  if (!po) return { ok: false, error: "PO not found." };
  if (String(po.status ?? "").toLowerCase() !== "issued" || !po.issued_doc_id) {
    return { ok: false, error: "Drafts are created only for issued, filed POs." };
  }
  if (po.email_draft_at) return { ok: false, error: "A draft was already created for this revision." };

  // Atomic claim — the single-flight guard.
  const claimTs = new Date().toISOString().replace(/\.\d+Z$/, "");
  const { data: claim, error: claimError } = await sb
    .from("purchase_orders")
    .update({ email_draft_at: claimTs })
    .eq("id", poId)
    .is("email_draft_at", null)
    .select("id");
  if (claimError) return { ok: false, error: claimError.message };
  if (!claim?.length) return { ok: false, error: "A draft was already created for this revision." };

  try {
    const { data: docRows, error: docError } = await sb
      .from("document_incoming_scan")
      .select("filed_path")
      .eq("id", po.issued_doc_id)
      .limit(1);
    if (docError || !docRows?.[0]?.filed_path) {
      throw new Error(docError?.message ?? "Filed document not found in the registry.");
    }
    const base = process.env.DOC_SERVICE_URL;
    if (!base) throw new Error("DOC_SERVICE_URL not configured");
    const pdfRes = await fetch(`${base.replace(/\/$/, "")}${docRows[0].filed_path}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!pdfRes.ok) throw new Error(`Fetching filed PDF failed (${pdfRes.status})`);
    const attachmentBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString("base64");

    const poNumStr = formatPoNumber(po.po_number);
    const project = String(po.projectnumber ?? po.project_id ?? "UNKNOWN-PROJECT");
    const { subject, bodyText } = buildSubjectAndBody(project, poNumStr);
    const supplierEmail = String((po.suppliers as Record<string, unknown>)?.email ?? "").trim();

    const draft = await createDraftWithAttachment({
      mailbox,
      subject,
      bodyText,
      toRecipients: supplierEmail ? [supplierEmail] : [],
      attachmentName: `PO ${poNumStr} rev ${po.current_revision ?? ""}.pdf`,
      attachmentBase64,
    });
    return { ok: true, webLink: draft.webLink };
  } catch (e) {
    // Release the claim so a retry is possible — fail closed, not stuck.
    await sb.from("purchase_orders").update({ email_draft_at: null }).eq("id", poId);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface EditPoPayload extends PoFormPayload {
  poId: string;
  expectedRevision: string; // revision the form loaded with (stale guard)
  status: string;
  bumpRevision: boolean;
}

/**
 * One-click issue from the preview page (bead 9bq.31 — legacy parity: the
 * old system had an explicit Issue PO action). Re-saves the PO exactly as
 * it stands with status=issued, running the normal revision matrix
 * (approved: in-place; draft: new snapshot coerced to rev 1) and the
 * auto-file hook.
 */
export async function issuePo(poId: string): Promise<SavePoResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };
  const po = await fetchPoDetail(poId);
  if (!po) return { ok: false, error: "PO not found." };

  const mdList = (po.po_metadata ?? []) as Record<string, unknown>[];
  const md = (mdList[0] ?? {}) as Record<string, unknown>;
  const items = ((po.line_items ?? []) as Record<string, unknown>[]).map((item) => ({
    description: String(item.description ?? ""),
    quantity: Number(item.quantity ?? 0),
    unit: String(item.unit ?? ""),
    unitPrice: Number(item.unit_price ?? 0),
  }));

  return savePoEdit({
    poId,
    expectedRevision: String(po.current_revision ?? "a"),
    status: "issued",
    bumpRevision: false,
    projectId: String(po.project_id ?? ""),
    itemSeq: String(po.item_seq ?? ""),
    supplierId: String(po.supplier_id ?? ""),
    deliveryAddressId: String(po.delivery_address?.id ?? po.delivery_contact?.address_id ?? "") || undefined,
    deliveryContactId: String(po.delivery_contact_id ?? "") || undefined,
    deliveryTerms: String(md.delivery_terms ?? ""),
    deliveryDate: String(md.delivery_date ?? "").slice(0, 10),
    supplierRef: String(md.supplier_reference_number ?? ""),
    testCertRequired: Boolean(md.test_certificates_required),
    items,
  });
}

export async function savePoEdit(payload: EditPoPayload): Promise<SavePoResult> {
  if (!writesEnabled()) return { ok: false, error: "Writes are disabled (PO_WRITES_ENABLED)." };

  const sb = getSupabaseAdmin();
  const { data: poRows, error: fetchError } = await sb
    .from("purchase_orders")
    .select("id,status,current_revision,po_number,last_release")
    .eq("id", payload.poId)
    .limit(1);
  if (fetchError) return { ok: false, error: fetchError.message };
  const po = poRows?.[0];
  if (!po) return { ok: false, error: "PO not found." };

  const currentStatus = String(po.status ?? "draft").toLowerCase();
  const currentRev = String(po.current_revision ?? "a").trim();

  // Legacy guards (routes.py:569-588).
  if (currentStatus === "complete" || currentStatus === "cancelled") {
    return { ok: false, error: `This PO is ${currentStatus} and cannot be edited.` };
  }
  if (currentRev !== payload.expectedRevision.trim()) {
    return {
      ok: false,
      error: `Stale revision: PO is at '${currentRev}', your form loaded '${payload.expectedRevision}'. Reload and retry.`,
    };
  }
  // Superseded rows keep their revision but lose their active metadata —
  // that's how the snapshot model marks "a newer revision exists".
  const { data: activeMeta, error: metaError } = await sb
    .from("po_metadata")
    .select("id")
    .eq("po_id", payload.poId)
    .eq("active", true)
    .limit(1);
  if (metaError) return { ok: false, error: metaError.message };
  if (!activeMeta?.length) {
    return {
      ok: false,
      error: `Stale revision: a newer revision of PO ${po.po_number} already exists. Reload and retry.`,
    };
  }
  let newStatus: string;
  try {
    newStatus = validatePoStatus(payload.status || currentStatus);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (currentStatus !== "draft" && newStatus === "draft") {
    return { ok: false, error: "You cannot revert an approved PO back to draft." };
  }

  const v = validateCommon(payload);
  if ("error" in v) return { ok: false, error: v.error };

  // Legacy decision matrix (routes.py:643-743).
  const alwaysBump = currentStatus === "draft";
  const bumpFlag = payload.bumpRevision === true;
  const bumpAllowedAfterRelease = newStatus === "approved" || newStatus === "issued";

  try {
    if (!alwaysBump && bumpAllowedAfterRelease && !bumpFlag) {
      // Branch B — in-place, same revision, same row.
      const { data, error } = await sb.rpc("po_update_in_place", {
        p_po_id: payload.poId,
        p_expected_revision: currentRev,
        p_status: newStatus,
        p_header: v.header,
        p_metadata: v.metadata,
        p_items: v.items,
      });
      if (error) return { ok: false, error: error.message };
      await autoFileIfIssued(String(data), newStatus);
      return { ok: true, poId: String(data) };
    }

    // Branches A & C — new snapshot.
    let targetRev: string;
    if (alwaysBump) {
      targetRev = coerceRevOnLeavingDraft(getNextRevision(currentRev), currentStatus, newStatus);
    } else {
      targetRev = bumpFlag
        ? getNextRevision(currentRev)
        : computeUpdatedRevision(currentRev, currentStatus, newStatus);
      targetRev = coerceRevOnLeavingDraft(targetRev, currentStatus, newStatus);
    }

    // Same revision = a second (po_number, revision) row, which
    // ux_po_number_revision rightly forbids. Legacy attempted the insert
    // anyway and always failed (latent bug — issued→cancelled/complete was
    // impossible there). Status-only transitions update in place instead.
    if (targetRev === currentRev) {
      const { data, error } = await sb.rpc("po_update_in_place", {
        p_po_id: payload.poId,
        p_expected_revision: currentRev,
        p_status: newStatus,
        p_header: v.header,
        p_metadata: v.metadata,
        p_items: v.items,
      });
      if (error) return { ok: false, error: error.message };
      await autoFileIfIssued(String(data), newStatus);
      return { ok: true, poId: String(data) };
    }

    const lastRelease = shouldStampRelease(currentRev, targetRev)
      ? new Date().toISOString().replace(/\.\d+Z$/, "") // timestamp-without-tz, UTC (legacy utcnow)
      : null; // function carries the old value forward

    const { data, error } = await sb.rpc("po_new_revision", {
      p_old_po_id: payload.poId,
      p_expected_revision: currentRev,
      p_status: newStatus,
      p_revision: targetRev,
      p_last_release: lastRelease,
      p_header: v.header,
      p_metadata: v.metadata,
      p_items: v.items,
      p_manual_contact: v.manualContact,
    });
    if (error) return { ok: false, error: error.message };
    await autoFileIfIssued(String(data), newStatus);
    return { ok: true, poId: String(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Best-effort auto-filing when a save lands on issued (bead 9bq.31). A
 * failure never fails the save — the PO preview shows a "File PDF" retry
 * button whenever a PO is issued with no stamped document.
 */
async function autoFileIfIssued(poId: string, newStatus: string): Promise<void> {
  if (newStatus !== "issued") return;
  const filed = await filePoPdf(poId);
  if (!filed.ok) {
    console.error("[purchase-order] auto-filing after issue failed:", filed.error);
  }
}
