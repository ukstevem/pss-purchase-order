// Domain logic ported from the legacy system (routes.py, expediting.html JS).
// Pure functions — safe for both server and client components.

export type Row = Record<string, any>;

/** Today's date key (YYYY-MM-DD) in Europe/London. */
export function todayLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateKey(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export type LineExpedStatus = "delivered" | "partial" | "late" | "none";

/**
 * Per-line expediting status for the PO preview (legacy routes.py:246-264).
 * NOTE: the legacy code read misspelled columns (`qty_recevied`,
 * `exped_ccompleted_date`) so delivered/partial never fired from receipt
 * data — intent preserved here with the correct names (bead
 * pss-purchase-order-gcc.1 tracks confirming the true DB spelling).
 */
export function lineExpedStatus(item: Row, today = todayLondon()): LineExpedStatus {
  const qty = Number(item.quantity ?? 0);
  const received = Number(item.qty_received ?? 0);
  const completed = dateKey(item.exped_completed_date);
  const expected = dateKey(item.exped_expected_date);

  if (completed || (qty > 0 && received >= qty)) return "delivered";
  if (received > 0 && received < qty) return "partial";
  if (expected && expected < today) return "late";
  return "none";
}

export type PoDeliveryStatus = "late" | "complete" | "partial" | "unknown";

/** Per-PO delivery flag (legacy expediting.html computeStatusFromItems). */
export function poDeliveryStatus(items: Row[], today = todayLondon()): PoDeliveryStatus {
  if (!items.length) return "unknown";
  let anyLate = false;
  let allComplete = true;
  for (const item of items) {
    const qty = Number(item.quantity ?? 0);
    const received = Number(item.qty_received ?? 0);
    const expected = dateKey(item.exped_expected_date);
    const isComplete = qty > 0 && received >= qty;
    if (!isComplete && expected && expected < today) anyLate = true;
    if (!isComplete) allComplete = false;
  }
  if (anyLate) return "late";
  if (allComplete) return "complete";
  return "partial";
}

/** Per-line row highlight on the expediting page (legacy updateRowStatus). */
export function expedLineRowStatus(item: Row, today = todayLondon()): "complete" | "late" | "none" {
  const qty = Number(item.quantity ?? 0);
  const received = Number(item.qty_received ?? 0);
  const expected = dateKey(item.exped_expected_date);
  const isComplete = qty > 0 && received >= qty;
  if (isComplete) return "complete";
  if (expected && expected < today) return "late";
  return "none";
}

const TEST_CERT_RE = /\btest\s*cert/i;

function lineItemText(item: Row): string {
  for (const key of ["description", "item_description", "item_desc", "line_desc", "name", "details", "code"]) {
    const v = item[key];
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return "";
}

function isTestCert(item: Row): boolean {
  const text = lineItemText(item).toLowerCase();
  return text.includes("test certificate") || TEST_CERT_RE.test(text);
}

function naturalKey(s: string): (string | number)[] {
  const parts = s.toLowerCase().match(/\d+|\D+/g) ?? [];
  return parts.map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

export function naturalCompare(a: string, b: string): number {
  const ka = naturalKey(a);
  const kb = naturalKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const x = ka[i];
    const y = kb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

/**
 * Line-item ordering for the PO preview (legacy routes.py sort_po_line_items):
 * test-cert or zero-value lines float to the top (test-cert first), then
 * natural sort by description, then original index.
 */
export function sortPoLineItems<T extends Row>(items: T[]): T[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const aCert = isTestCert(a.item);
      const bCert = isTestCert(b.item);
      const aZero = Number(a.item.quantity ?? 0) * Number(a.item.unit_price ?? 0) === 0;
      const bZero = Number(b.item.quantity ?? 0) * Number(b.item.unit_price ?? 0) === 0;
      const aTop = aCert || aZero;
      const bTop = bCert || bZero;
      if (aTop !== bTop) return aTop ? -1 : 1;
      if (aCert !== bCert) return aCert ? -1 : 1;
      const byText = naturalCompare(lineItemText(a.item), lineItemText(b.item));
      if (byText !== 0) return byText;
      return a.idx - b.idx;
    })
    .map((x) => x.item);
}

/** Add n days to a YYYY-MM-DD key. */
export function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Friday of the current work week for a YYYY-MM-DD key; on Sat/Sun this is
 * the *coming* Friday (bead 9bq.21).
 */
export function endOfWorkWeek(dateKey: string): string {
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const toFriday = dow <= 5 ? 5 - dow : 6;
  return addDays(dateKey, toFriday);
}

/** Projects pinned to the top of dashboards and pick-lists (Steve, 2026-07-04). */
export const STICKY_PROJECTS = ["0005", "0006"];

/**
 * Project pick-list ordering (beads 9bq.8/9bq.11): 0005/0006 first, then
 * the rest descending (highest project number first).
 */
export function orderProjectOptions(projects: string[]): string[] {
  const sticky = STICKY_PROJECTS.filter((p) => projects.includes(p));
  const rest = projects
    .filter((p) => !STICKY_PROJECTS.includes(p))
    .sort((a, b) => naturalCompare(b, a));
  return [...sticky, ...rest];
}

/** Legacy accounts is_completed(row) (blueprints/accounts.py:40-48). */
export function accountsIsCompleted(row: Row): boolean {
  const v = row.acc_complete;
  if (v !== undefined && v !== null) {
    if (typeof v === "boolean") return v;
    return ["1", "true", "t", "yes", "y"].includes(String(v).trim().toLowerCase());
  }
  const status = String(row.status ?? "").trim().toLowerCase();
  return ["issued", "complete", "completed", "closed", "paid"].includes(status);
}
