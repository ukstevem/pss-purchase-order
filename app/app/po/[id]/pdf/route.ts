import { NextResponse } from "next/server";
import { fetchPoDetail } from "@/lib/data";
import { buildPoPrintHtml } from "@/lib/pdf/po-print-html";
import { renderPreviewPdf } from "@/lib/pdf/clients";

export const dynamic = "force-dynamic";

// Ephemeral PDF preview (bead 9bq.31): compose the v6 print document and
// stream it via pss-pdf-service. Nothing is filed — filing happens only
// at issue time through doc-service /api/file-html.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const po = await fetchPoDetail(id);
    if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });

    const doc = buildPoPrintHtml(po);
    const pdf = await renderPreviewPdf(doc);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[purchase-order] pdf preview failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
