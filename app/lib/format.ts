// Display formatting mirroring the legacy Jinja filters (app/utils/filters.py)
// and inline template formatting in C:\Dev\PSS\purchase_order.

/** Legacy `"%06d"|format(pn|int)` — zero-pad digit strings to 6, else raw. */
export function formatPoNumber(pn: unknown): string {
  if (pn === null || pn === undefined) return "";
  const s = String(pn).trim();
  if (s && /^\d+$/.test(s)) return s.padStart(6, "0");
  return s;
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/[,£]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Legacy `accounting` filter: £1,234.56, negatives as (£1,234.56). */
export function accounting(value: unknown, symbol = "£", dashForZero = false): string {
  const n = parseAmount(value);
  if (n === null) return "";
  if (dashForZero && n === 0) return "—";
  const abs = Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${symbol}${abs})` : `${symbol}${abs}`;
}

/** Legacy `accounting_number` filter: as accounting but without the symbol. */
export function accountingNumber(value: unknown, dashForZero = false): string {
  return accounting(value, "", dashForZero);
}

/** Legacy `format_date` filter: UTC-assumed → Europe/London, "dd Mon YYYY". */
export function formatDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  let d: Date | null = null;
  if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value);
    const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
    const parsed = new Date(iso.replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) d = parsed;
    else {
      const short = new Date(`${s.slice(0, 10)}T00:00:00Z`);
      if (!Number.isNaN(short.getTime())) d = short;
    }
  }
  if (!d) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(d);
}

/** Legacy list-page date cells: dd/mm/yy sliced from an ISO string. */
export function shortDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value);
  if (s.length >= 10 && s.includes("-")) {
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
  }
  return s;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Spend-report column header: "YYYY-MM-01" → "Mon YYYY". */
export function monthLabel(monthKey: string): string {
  const y = monthKey.slice(0, 4);
  const m = Number(monthKey.slice(5, 7));
  return `${MONTH_NAMES[m - 1] ?? "?"} ${y}`;
}

/** Numeric cell: legacy `{:,.2f}`. */
export function qtyFormat(value: unknown): string {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
