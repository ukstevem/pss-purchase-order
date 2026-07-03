import Link from "next/link";
import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { fetchAccountsOverviewLatest, fetchLastIssuedDates } from "@/lib/data";
import { accounting, monthLabel } from "@/lib/format";
import { naturalCompare, type Row } from "@/lib/po-logic";

export const dynamic = "force-dynamic";

// Legacy spend_report (routes.py:1222) — rolling-12-month pivot of
// total_value by project, bucketed by the latest `issued` revision's
// updated_at month (Europe/London), current month last.

function currentMonthLondon(): { y: number; m: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const [y, m] = s.split("-").map(Number);
  return { y, m };
}

function monthKeys(): string[] {
  const { y, m } = currentMonthLondon();
  const keys: string[] = [];
  for (let back = 11; back >= 0; back--) {
    let yy = y;
    let mm = m - back;
    while (mm <= 0) {
      mm += 12;
      yy -= 1;
    }
    keys.push(`${yy}-${String(mm).padStart(2, "0")}-01`);
  }
  return keys; // oldest first, current month last
}

function nextMonthKey(mkey: string): string {
  let y = Number(mkey.slice(0, 4));
  let m = Number(mkey.slice(5, 7)) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export default async function SpendReportPage() {
  const months = monthKeys();

  const data = new Map<string, Map<string, number>>();
  let error: string | null = null;
  try {
    const aoRows = await fetchAccountsOverviewLatest();
    const byPoNumber = new Map<string, Row>();
    for (const r of aoRows) {
      if (r.po_number !== null && r.po_number !== undefined) {
        byPoNumber.set(String(r.po_number), r);
      }
    }
    const lastIssued = await fetchLastIssuedDates([...byPoNumber.keys()]);

    for (const [pn, issuedAt] of Object.entries(lastIssued)) {
      const ao = byPoNumber.get(pn);
      if (!ao) continue;
      const mkey = `${String(issuedAt).slice(0, 7)}-01`;
      if (!months.includes(mkey)) continue; // enforce 12-month window
      const project = String(ao.projectnumber ?? "") || "—";
      const totalVal = Number(ao.total_value ?? 0) || 0;
      const row = data.get(project) ?? new Map<string, number>();
      row.set(mkey, (row.get(mkey) ?? 0) + totalVal);
      data.set(project, row);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    data.clear();
  }

  const projects = [...data.keys()].sort(naturalCompare);
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  let grandTotal = 0;
  for (const proj of projects) {
    const spends = data.get(proj)!;
    let rowTotal = 0;
    for (const m of months) {
      const v = spends.get(m) ?? 0;
      rowTotal += v;
      colTotals.set(m, (colTotals.get(m) ?? 0) + v);
    }
    rowTotals.set(proj, rowTotal);
    grandTotal += rowTotal;
  }

  function drillHref(project: string | null, month: string | null): string {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    if (month) {
      params.set("from", month);
      params.set("to", nextMonthKey(month));
    }
    const qs = params.toString();
    return qs ? `/po-list/?${qs}` : "/po-list/";
  }

  return (
    <div className="p-8">
      <PageHeader title="Spend Report" />
      <p className="mb-4 text-sm text-zinc-500">
        Issued PO value by project over the last 12 months (approved / issued / complete POs,
        bucketed by latest issue date).
      </p>

      {error && <Alert variant="error">Failed to load spend report: {error}</Alert>}
      {!error && projects.length === 0 && <EmptyState message="No issued POs in the last 12 months." />}

      {projects.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
                <th className="sticky left-0 bg-zinc-50 px-4 py-2 font-medium">Project</th>
                {months.map((m) => (
                  <th key={m} className="px-3 py-2 text-right font-medium">
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((proj) => {
                const spends = data.get(proj)!;
                return (
                  <tr key={proj} className="border-b border-zinc-100 last:border-0">
                    <td className="sticky left-0 bg-white px-4 py-2 font-medium text-zinc-900">
                      {proj}
                    </td>
                    {months.map((m) => {
                      const v = spends.get(m) ?? 0;
                      return (
                        <td key={m} className="px-3 py-2 text-right">
                          {v !== 0 ? (
                            <Link
                              href={drillHref(proj, m)}
                              className="underline-offset-2 hover:underline"
                            >
                              {accounting(v)}
                            </Link>
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-medium">
                      <Link href={drillHref(proj, null)} className="underline-offset-2 hover:underline">
                        {accounting(rowTotals.get(proj))}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                <td className="sticky left-0 bg-zinc-50 px-4 py-2">Total</td>
                {months.map((m) => {
                  const v = colTotals.get(m) ?? 0;
                  return (
                    <td key={m} className="px-3 py-2 text-right">
                      {v !== 0 ? (
                        <Link href={drillHref(null, m)} className="underline-offset-2 hover:underline">
                          {accounting(v)}
                        </Link>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-right">{accounting(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
