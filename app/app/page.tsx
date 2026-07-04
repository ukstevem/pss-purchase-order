import Link from "next/link";
import { PageHeader, Alert, EmptyState } from "@platform/ui";
import { fetchProjectPoSummary, type ProjectPoSummary } from "@/lib/data";
import { naturalCompare } from "@/lib/po-logic";

export const dynamic = "force-dynamic";

// Dashboard (bead 9bq.8): projects from project_register, descending by
// project number, with 0005/0006 pinned to the top of every page, paginated.
const STICKY_PROJECTS = ["0005", "0006"];
const PAGE_SIZE = 50;

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function SummaryRow({ row, sticky }: { row: ProjectPoSummary; sticky?: boolean }) {
  return (
    <tr className={`border-b border-zinc-100 last:border-0 ${sticky ? "bg-amber-50/60" : ""}`}>
      <td className="px-4 py-2">
        <Link
          href={`/po-list/?project=${encodeURIComponent(row.project_id)}`}
          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
        >
          {row.project_id}
        </Link>
        {sticky && <span className="ml-2 text-xs text-zinc-400">pinned</span>}
      </td>
      <td className="px-4 py-2 text-right">{row.draft}</td>
      <td className="px-4 py-2 text-right">{row.active}</td>
    </tr>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  let page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  let summary: ProjectPoSummary[] = [];
  let error: string | null = null;
  try {
    summary = await fetchProjectPoSummary();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const stickyRows = STICKY_PROJECTS.map((pn) =>
    summary.find((r) => r.project_id === pn)
  ).filter(Boolean) as ProjectPoSummary[];
  const rest = summary
    .filter((r) => !STICKY_PROJECTS.includes(r.project_id))
    .sort((a, b) => naturalCompare(b.project_id, a.project_id));

  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  page = Math.min(page, totalPages);
  const pageRows = rest.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Totals cover every project, not just the visible page.
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

      {!error && summary.length === 0 && <EmptyState message="No projects found." />}

      {summary.length > 0 && (
        <div className="max-w-2xl">
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
                  <th className="px-4 py-2 font-medium">Project</th>
                  <th className="px-4 py-2 text-right font-medium">Draft POs</th>
                  <th className="px-4 py-2 text-right font-medium">Active POs</th>
                </tr>
              </thead>
              <tbody>
                {stickyRows.map((row) => (
                  <SummaryRow key={row.project_id} row={row} sticky />
                ))}
                {pageRows.map((row) => (
                  <SummaryRow key={row.project_id} row={row} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                  <td className="px-4 py-2 text-right">Totals (all projects)</td>
                  <td className="px-4 py-2 text-right">{totalDraft}</td>
                  <td className="px-4 py-2 text-right">{totalActive}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              {page > 1 && (
                <Link
                  href={page - 1 > 1 ? `/?page=${page - 1}` : "/"}
                  className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100"
                >
                  ← Prev
                </Link>
              )}
              <span className="text-zinc-500">
                Page {page} of {totalPages} ({rest.length} projects)
              </span>
              {page < totalPages && (
                <Link
                  href={`/?page=${page + 1}`}
                  className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100"
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
