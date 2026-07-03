import Link from "next/link";
import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { fetchProjectPoSummary, type ProjectPoSummary } from "@/lib/data";

export const dynamic = "force-dynamic";

// Legacy index() (routes.py:132) — "Purchase Orders by Project" summary table.
export default async function Dashboard() {
  let summary: ProjectPoSummary[] = [];
  let error: string | null = null;
  try {
    summary = await fetchProjectPoSummary();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const totalDraft = summary.reduce((n, r) => n + r.draft, 0);
  const totalActive = summary.reduce((n, r) => n + r.active, 0);

  return (
    <div className="p-8">
      <PageHeader title="Purchase Orders by Project">
        <Link
          href="/po-list/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          📋 View All POs
        </Link>
      </PageHeader>

      {error && <Alert variant="error">Failed to load dashboard: {error}</Alert>}

      {!error && summary.length === 0 && <EmptyState message="No purchase orders found." />}

      {summary.length > 0 && (
        <div className="max-w-2xl overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 text-right font-medium">Draft POs</th>
                <th className="px-4 py-2 text-right font-medium">Active POs</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.project_id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/po-list/?project=${encodeURIComponent(row.project_id)}`}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                    >
                      {row.project_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right">{row.draft}</td>
                  <td className="px-4 py-2 text-right">{row.active}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                <td className="px-4 py-2 text-right">Totals</td>
                <td className="px-4 py-2 text-right">{totalDraft}</td>
                <td className="px-4 py-2 text-right">{totalActive}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
