"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPoEmailDraft } from "@/app/po/actions";

/** Create the Outlook draft for an issued, filed PO (bead 9bq.7). */
export function EmailDraftButton({ poId }: { poId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await createPoEmailDraft(poId);
      if (!result.ok) {
        setError(result.error ?? result.skipped ?? "Draft creation failed.");
        return;
      }
      // No webLink open — drafts are reviewed in desktop Outlook (Steve).
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
        className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
      >
        {busy ? "Creating…" : "✉ Email Draft"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
