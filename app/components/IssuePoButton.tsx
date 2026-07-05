"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { issuePo } from "@/app/po/actions";

/** One-click issue from the preview (bead 9bq.31): status → issued, PDF filed. */
export function IssuePoButton({ poId, poLabel }: { poId: string; poLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm(`Issue ${poLabel}? This files the PDF in the document registry.`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await issuePo(poId);
      if (!result.ok) {
        setError(result.error ?? "Issue failed.");
        return;
      }
      if (result.poId && result.poId !== poId) {
        // Issuing a draft creates a new revision row — navigate to it.
        window.location.href = `/purchase-order/po/${result.poId}/`;
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
        className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
      >
        {busy ? "Issuing…" : "🚀 Issue PO"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
