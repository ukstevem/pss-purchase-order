"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { filePoPdf } from "@/app/po/actions";

/** Retry filing for an issued PO with no stamped document (bead 9bq.31). */
export function FilePdfButton({ poId }: { poId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await filePoPdf(poId);
      if (!result.ok) {
        setError(result.error ?? "Filing failed.");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {busy ? "Filing…" : "📄 File PDF"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
