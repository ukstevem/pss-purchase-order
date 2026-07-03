"use client";

import { useRouter } from "next/navigation";

export interface SelectFilter {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  allLabel: string;
}

interface FilterBarProps {
  route: string; // app-relative, e.g. "/po-list/"
  selects: SelectFilter[];
  dates?: { from: string; to: string } | null;
  /** Params to carry through unchanged (e.g. sort/dir). */
  preserve?: Record<string, string>;
}

/** Legacy filter form (po_list.html / accounts.html) — auto-submits on change. */
export function FilterBar({ route, selects, dates, preserve }: FilterBarProps) {
  const router = useRouter();

  function navigate(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(preserve ?? {})) if (v) params.set(k, v);
    for (const s of selects) {
      const v = overrides[s.name] ?? s.value;
      if (v) params.set(s.name, v);
    }
    if (dates) {
      const from = overrides.from ?? dates.from;
      const to = overrides.to ?? dates.to;
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    const qs = params.toString();
    router.push(qs ? `${route}?${qs}` : route);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {selects.map((s) => (
        <select
          key={s.name}
          value={s.value}
          onChange={(e) => navigate({ [s.name]: e.target.value })}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">{s.allLabel}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {dates && (
        <>
          <label className="text-sm text-zinc-600">
            From{" "}
            <input
              type="date"
              value={dates.from}
              onChange={(e) => navigate({ from: e.target.value })}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-zinc-600">
            To{" "}
            <input
              type="date"
              value={dates.to}
              onChange={(e) => navigate({ to: e.target.value })}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </>
      )}
      <button
        type="button"
        onClick={() => router.push(route)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
      >
        Reset
      </button>
    </div>
  );
}
