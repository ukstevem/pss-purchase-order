import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { orderProjectItemRows, poDeliveryStatus, type Row } from "./po-logic";

// Data layer mirroring the legacy app/supabase_client.py fetchers one-to-one.
// Legacy line references point into C:\Dev\PSS\purchase_order (read-only
// reference system) so parity can be audited.

export interface ProjectPoSummary {
  project_id: string;
  draft: number;
  active: number;
}

/**
 * Dashboard summary. Project list comes from project_register (canonical —
 * the legacy PO-derived list surfaced deprecated project ids; bead 9bq.8);
 * PO counts still aggregate from active_po_list per the legacy rule
 * (fetch_project_po_summary, supabase_client.py:979). Projects with no POs
 * are included with zero counts.
 */
export async function fetchProjectPoSummary(): Promise<ProjectPoSummary[]> {
  const sb = getSupabaseAdmin();
  const projRes = await sb.from("project_register").select("projectnumber").limit(10000);
  if (projRes.error) throw new Error(`project_register failed: ${projRes.error.message}`);

  // Offset-loop past PostgREST's 1000-row cap (bead 9bq.9 — unpaginated,
  // the aggregation silently truncated and undercounted projects).
  const pageSize = 1000;
  let offset = 0;
  const poRows: Row[] = [];
  for (;;) {
    const { data, error } = await sb
      .from("active_po_list")
      .select("project_id,status")
      .order("po_number", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`active_po_list summary failed: ${error.message}`);
    const batch = (data ?? []) as Row[];
    poRows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const counts = new Map<string, { draft: number; active: number }>();
  for (const row of poRows) {
    const pn = String(row.project_id ?? "").trim();
    if (!pn) continue;
    const c = counts.get(pn) ?? { draft: 0, active: 0 };
    const status = String(row.status ?? "").toLowerCase();
    // Legacy counts every non-draft status (incl. cancelled/complete) as active.
    if (status === "draft") c.draft += 1;
    else c.active += 1;
    counts.set(pn, c);
  }

  const numbers = [
    ...new Set(
      (projRes.data ?? [])
        .map((r: Row) => String(r.projectnumber ?? "").trim())
        .filter(Boolean)
    ),
  ];
  return numbers.map((pn) => ({
    project_id: pn,
    draft: counts.get(pn)?.draft ?? 0,
    active: counts.get(pn)?.active ?? 0,
  }));
}

export interface PoListFilters {
  project?: string;
  supplier?: string;
  status?: string;
  /** Default status scope applied only when `status` is not set (gcc.12). */
  statusIn?: string[];
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  dir?: string;
}

/** Legacy sort whitelist + direction default (routes.py:163-167). */
export function normalizeSort(sort?: string, dir?: string): { sort: string; dir: "asc" | "desc" } {
  const s = sort === "updated_at" ? "updated_at" : "po_number";
  const d = String(dir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  return { sort: s, dir: d as "asc" | "desc" };
}

// Filter application shared by the list fetchers — semantics mirror legacy
// fetch_active_pos_from_view (supabase_client.py:546).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyPoFilters<T extends { ilike: any; eq: any; gte: any; lt: any; in: any }>(
  q: T,
  f: PoListFilters
): T {
  if (f.project) q = q.ilike("project_id", `%${f.project}%`);
  if (f.supplier) q = q.eq("supplier_name", f.supplier);
  if (f.status) q = q.eq("status", f.status);
  else if (f.statusIn?.length) q = q.in("status", f.statusIn);
  if (f.dateFrom) q = q.gte("updated_at", `${f.dateFrom}T00:00:00`);
  if (f.dateTo) q = q.lt("updated_at", `${f.dateTo}T00:00:00`);
  return q;
}

/** Legacy fetch_active_pos_from_view (supabase_client.py:546). */
export async function fetchActivePosFromView(f: PoListFilters): Promise<Row[]> {
  const { sort, dir } = normalizeSort(f.sort, f.dir);
  const sb = getSupabaseAdmin();
  const q = applyPoFilters(sb.from("active_po_list").select("*"), f);
  const { data, error } = await q.order(sort, { ascending: dir === "asc" });
  if (error) throw new Error(`active_po_list failed: ${error.message}`);
  return (data ?? []) as Row[];
}

export interface PoListPage {
  rows: Row[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Server-side paginated PO list (bead 9bq.16): exact count first (page
 * clamped to range), then a 50-row window. Supersedes the 1000-row
 * truncation of the unpaginated fetch (bead 9bq.10).
 */
export async function fetchActivePosPage(
  f: PoListFilters,
  page: number,
  pageSize = 50
): Promise<PoListPage> {
  const { sort, dir } = normalizeSort(f.sort, f.dir);
  const sb = getSupabaseAdmin();

  const countQ = applyPoFilters(
    sb.from("active_po_list").select("id", { count: "exact", head: true }),
    f
  );
  const { count, error: countError } = await countQ;
  if (countError) throw new Error(`active_po_list count failed: ${countError.message}`);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  if (total === 0) return { rows: [], total: 0, page: 1, totalPages: 1 };

  const from = (clamped - 1) * pageSize;
  const rowsQ = applyPoFilters(sb.from("active_po_list").select("*"), f);
  const { data, error } = await rowsQ
    .order(sort, { ascending: dir === "asc" })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`active_po_list page failed: ${error.message}`);

  return { rows: (data ?? []) as Row[], total, page: clamped, totalPages };
}

/** Legacy fetch_projects_map (supabase_client.py:375 — last definition wins). */
export async function fetchProjectOptions(): Promise<string[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("project_register")
    .select("projectnumber")
    .order("projectnumber", { ascending: true })
    .limit(10000);
  if (error) throw new Error(`project_register failed: ${error.message}`);
  const names = (data ?? []).map((r: Row) => String(r.projectnumber ?? "").trim()).filter(Boolean);
  return [...new Set(names)].sort();
}

/** Legacy fetch_suppliers (supabase_client.py:402 — last definition wins, names only). */
export async function fetchSupplierOptions(): Promise<string[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("suppliers")
    .select("name")
    .order("name", { ascending: true })
    .limit(10000);
  if (error) throw new Error(`suppliers failed: ${error.message}`);
  const names = (data ?? []).map((r: Row) => String(r.name ?? "").trim()).filter(Boolean);
  return [...new Set(names)].sort();
}

export interface ProjectItemOption {
  projectnumber: string;
  item_seq: number;
  line_desc: string | null;
}

/**
 * Create/edit form combo source (legacy routes.py:376-384), ordered per the
 * house rule (9bq.30): 0005/0006 sticky, then projects high→low, item_seq
 * ascending within each project.
 */
export async function fetchProjectItemOptions(): Promise<ProjectItemOption[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("project_register_items")
    .select("projectnumber,item_seq,line_desc")
    .limit(10000);
  if (error) throw new Error(`project_register_items failed: ${error.message}`);
  return orderProjectItemRows((data ?? []) as ProjectItemOption[]);
}

/** Legacy suppliers_as_objects — id + name (no type filter, parity). */
export async function fetchSuppliersAsObjects(): Promise<{ id: string; name: string }[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("suppliers")
    .select("id,name")
    .order("name", { ascending: true })
    .limit(10000);
  if (error) throw new Error(`suppliers failed: ${error.message}`);
  return (data ?? []) as { id: string; name: string }[];
}

/** Full supplier rows for the management UI (bead 9bq.17). */
export async function fetchSuppliersFull(): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("suppliers")
    .select("id,name,type,address_line1,address_line2,postcode,county,country,modified_at")
    .order("name", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`suppliers failed: ${error.message}`);
  return (data ?? []) as Row[];
}

/** Single supplier for the edit form (bead 9bq.17). */
export async function fetchSupplier(id: string): Promise<Row | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("suppliers")
    .select("id,name,type,address_line1,address_line2,postcode,county,country")
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(`supplier failed: ${error.message}`);
  return (data?.[0] as Row) ?? null;
}

export interface SupplierStats {
  poCount: number;
  totalSpend: number;
  lastPoDate: string | null;
}

/** Light per-supplier stats for the management page (bead 9bq.17). */
export async function fetchSupplierStats(supplierName: string): Promise<SupplierStats> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("accounts_overview")
    .select("total_value,po_number")
    .eq("supplier_name", supplierName)
    .limit(5000);
  if (error) throw new Error(`supplier stats failed: ${error.message}`);
  const rows = (data ?? []) as Row[];

  const { data: lastPo } = await sb
    .from("active_po_list")
    .select("last_release,updated_at")
    .eq("supplier_name", supplierName)
    .order("updated_at", { ascending: false })
    .limit(1);

  return {
    poCount: rows.length,
    totalSpend: rows.reduce((n, r) => n + (Number(r.total_value) || 0), 0),
    lastPoDate: (lastPo?.[0]?.last_release ?? lastPo?.[0]?.updated_at ?? null) as string | null,
  };
}

/** Legacy fetch_delivery_addresses — suppliers rows typed delivery/both. */
export async function fetchDeliveryAddresses(): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("suppliers")
    .select("id,name,address_line1,postcode,type")
    .in("type", ["delivery", "both"])
    .order("name", { ascending: true });
  if (error) throw new Error(`delivery addresses failed: ${error.message}`);
  return (data ?? []) as Row[];
}

/** Legacy fetch_delivery_contacts. */
export async function fetchDeliveryContacts(): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("delivery_contacts")
    .select("id,name,email,phone,address_id")
    .order("name", { ascending: true });
  if (error) throw new Error(`delivery_contacts failed: ${error.message}`);
  return (data ?? []) as Row[];
}

/**
 * Browser-openable URL of a filed document (bead 9bq.31). The registry row
 * carries filed_path; the public base differs from the server-side
 * DOC_SERVICE_URL when the app runs in a container.
 */
export async function fetchFiledDocUrl(docId: string): Promise<string | null> {
  const base = process.env.DOC_SERVICE_PUBLIC_URL ?? process.env.DOC_SERVICE_URL;
  if (!base) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("document_incoming_scan")
    .select("filed_path")
    .eq("id", docId)
    .limit(1);
  if (error || !data?.[0]?.filed_path) return null;
  return `${base.replace(/\/$/, "")}${data[0].filed_path}`;
}

export interface PoDetail extends Row {
  suppliers?: Row | null;
  po_metadata?: Row[] | null;
  line_items?: Row[];
  project_register?: Row | null;
  delivery_contact?: Row | null;
  delivery_address?: Row | null;
}

/** Legacy fetch_po_detail (supabase_client.py:827) — full composition. */
export async function fetchPoDetail(poId: string): Promise<PoDetail | null> {
  const sb = getSupabaseAdmin();

  const { data: poRows, error } = await sb
    .from("purchase_orders")
    .select("*, suppliers(*), po_metadata(*)")
    .eq("id", poId)
    .eq("po_metadata.active", true);
  if (error) throw new Error(`purchase_orders failed: ${error.message}`);
  const po = (poRows ?? [])[0] as PoDetail | undefined;
  if (!po) return null;
  po.projectnumber = po.project_id;
  // po_metadata.po_id is UNIQUE, so PostgREST embeds it as a single object;
  // normalise to an array so downstream code has one shape.
  if (po.po_metadata && !Array.isArray(po.po_metadata)) {
    po.po_metadata = [po.po_metadata as unknown as Row];
  }

  if (po.projectnumber) {
    const { data } = await sb
      .from("project_register")
      .select("*")
      .eq("projectnumber", po.projectnumber)
      .limit(1);
    po.project_register = data?.[0] ?? null;
  }

  const { data: items, error: liError } = await sb
    .from("po_line_items")
    .select("*")
    .eq("po_id", poId)
    .eq("active", true);
  if (liError) throw new Error(`po_line_items failed: ${liError.message}`);
  po.line_items = (items ?? []) as Row[];

  if (po.delivery_contact_id) {
    const { data } = await sb
      .from("delivery_contacts")
      .select("*")
      .eq("id", po.delivery_contact_id);
    po.delivery_contact = data?.[0] ?? null;
  }

  // Delivery addresses live in `suppliers` (type delivery/both) — legacy L877-888.
  if (po.manual_delivery_address === null || po.manual_delivery_address === undefined) {
    let addressId = po.delivery_address_id;
    if (!addressId && po.delivery_contact) addressId = po.delivery_contact.address_id;
    if (addressId) {
      const { data } = await sb.from("suppliers").select("*").eq("id", addressId);
      po.delivery_address = data?.[0] ?? null;
    }
  }

  return po;
}

/** Legacy fetch_accounts_overview (supabase_client.py:1020) — 1000-row offset loop. */
export async function fetchAccountsOverview(): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const pageSize = 1000;
  let offset = 0;
  const rows: Row[] = [];
  for (;;) {
    const { data, error } = await sb
      .from("accounts_overview")
      .select("id,po_number,status,total_value,acc_complete,invoice_reference,projectnumber,supplier_name")
      .order("po_number", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      // Legacy returns [] on a failed page.
      console.error("[purchase-order] accounts_overview failed:", error.message);
      return [];
    }
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

/** Legacy fetch_accounts_overview_latest (supabase_client.py:492). */
export async function fetchAccountsOverviewLatest(
  statuses: string[] = ["approved", "issued", "complete"]
): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("accounts_overview")
    .select("id,po_number,status,projectnumber,supplier_name,total_value")
    .in("status", statuses)
    .order("po_number", { ascending: true })
    .limit(100000);
  if (error) throw new Error(`accounts_overview failed: ${error.message}`);
  return (data ?? []) as Row[];
}

/** Legacy fetch_last_issued_dates_any (supabase_client.py:624) — latest issued updated_at per po_number. */
export async function fetchLastIssuedDates(
  poNumbers: (string | number)[]
): Promise<Record<string, string>> {
  if (!poNumbers.length) return {};
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("purchase_orders")
    .select("po_number,updated_at")
    .in("po_number", poNumbers)
    .eq("status", "issued")
    .order("po_number", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(100000);
  if (error) throw new Error(`purchase_orders issued dates failed: ${error.message}`);
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as Row[]) {
    const pn = String(r.po_number);
    if (!(pn in map)) map[pn] = String(r.updated_at);
  }
  return map;
}

/**
 * Legacy _fetch_line_items_for_po (blueprints/expediting.py:128), batched
 * with po_id=in.(...) — chunked so large id sets (delivery-filter path,
 * bead 9bq.19) don't overflow the request URL.
 */
export async function fetchLineItemsForPos(poIds: string[]): Promise<Record<string, Row[]>> {
  const map: Record<string, Row[]> = {};
  if (!poIds.length) return map;
  const sb = getSupabaseAdmin();
  const CHUNK = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < poIds.length; i += CHUNK) chunks.push(poIds.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((ids) =>
      sb
        .from("po_line_items")
        .select("id,po_id,description,quantity,qty_received,exped_expected_date,exped_completed_date")
        .in("po_id", ids)
        .eq("active", true)
        .order("id", { ascending: true })
    )
  );
  for (const { data, error } of results) {
    if (error) throw new Error(`po_line_items failed: ${error.message}`);
    for (const r of (data ?? []) as Row[]) {
      const k = String(r.po_id);
      (map[k] ??= []).push(r);
    }
  }
  return map;
}

export interface ExpeditingPageData {
  rows: Row[];
  itemsByPo: Record<string, Row[]>;
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Expediting list (bead 9bq.19). Without a delivery filter this is the same
 * count+range pagination as the PO list, with line items fetched only for
 * the visible page. A delivery filter needs flags for every matching PO
 * (they're derived from line items, not stored), so that path fetches all
 * matching POs + line items, filters, then paginates in memory.
 */
export async function fetchExpeditingPage(
  f: PoListFilters,
  delivery: string | undefined,
  page: number,
  pageSize = 50
): Promise<ExpeditingPageData> {
  const poId = (po: Row) => String(po.id ?? po.purchase_order_id ?? "");

  if (!delivery) {
    const res = await fetchActivePosPage(f, page, pageSize);
    const itemsByPo = await fetchLineItemsForPos(res.rows.map(poId).filter(Boolean));
    return { rows: res.rows, itemsByPo, total: res.total, page: res.page, totalPages: res.totalPages };
  }

  const { sort, dir } = normalizeSort(f.sort, f.dir);
  const sb = getSupabaseAdmin();
  const all: Row[] = [];
  const batch = 1000;
  let offset = 0;
  for (;;) {
    const q = applyPoFilters(sb.from("active_po_list").select("*"), f);
    const { data, error } = await q
      .order(sort, { ascending: dir === "asc" })
      .range(offset, offset + batch - 1);
    if (error) throw new Error(`active_po_list failed: ${error.message}`);
    const rows = (data ?? []) as Row[];
    all.push(...rows);
    if (rows.length < batch) break;
    offset += batch;
  }

  const itemsAll = await fetchLineItemsForPos(all.map(poId).filter(Boolean));
  const matching = all.filter((po) => poDeliveryStatus(itemsAll[poId(po)] ?? []) === delivery);

  const total = matching.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const rows = matching.slice((clamped - 1) * pageSize, clamped * pageSize);
  const itemsByPo: Record<string, Row[]> = {};
  for (const po of rows) itemsByPo[poId(po)] = itemsAll[poId(po)] ?? [];

  return { rows, itemsByPo, total, page: clamped, totalPages };
}

export interface DueLineItem extends Row {
  po_number?: number | string;
  project_id?: string;
  supplier_name?: string;
}

/**
 * Outstanding line items due in a date window (bead 9bq.21): active, no
 * completed date, not fully received, on approved/issued POs. Window keys
 * are inclusive YYYY-MM-DD.
 */
export async function fetchDueLineItems(fromKey: string, toKey: string): Promise<DueLineItem[]> {
  if (fromKey > toKey) return [];
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("po_line_items")
    .select(
      "id,po_id,description,quantity,qty_received,exped_expected_date," +
        "purchase_orders!inner(id,po_number,project_id,status,suppliers(name))"
    )
    .eq("active", true)
    .is("exped_completed_date", null)
    .gte("exped_expected_date", fromKey)
    .lte("exped_expected_date", toKey)
    .in("purchase_orders.status", ["approved", "issued"])
    .order("exped_expected_date", { ascending: true });
  if (error) throw new Error(`due line items failed: ${error.message}`);

  return ((data ?? []) as Row[])
    .filter((r) => {
      const qty = Number(r.quantity ?? 0);
      const received = Number(r.qty_received ?? 0);
      return !(qty > 0 && received >= qty); // drop fully-received lines
    })
    .map((r) => {
      const po = Array.isArray(r.purchase_orders) ? r.purchase_orders[0] : r.purchase_orders;
      const sup = po && (Array.isArray(po.suppliers) ? po.suppliers[0] : po.suppliers);
      return {
        ...r,
        po_number: po?.po_number,
        project_id: po?.project_id,
        supplier_name: sup?.name ?? "",
      } as DueLineItem;
    });
}
