import "server-only";

// Thin clients for the two PDF-path services (bead 9bq.31).
// - pss-pdf-service /render: ephemeral previews, nothing stored
// - pss-document-service /api/file-html: render + file at issue time

export interface RenderOptions {
  html: string;
  footerLeft: string;
}

export async function renderPreviewPdf(opts: RenderOptions): Promise<Buffer> {
  const url = process.env.PDF_SERVICE_URL;
  const key = process.env.PDF_SERVICE_API_KEY;
  if (!url || !key) throw new Error("PDF_SERVICE_URL / PDF_SERVICE_API_KEY not configured");

  const res = await fetch(`${url.replace(/\/$/, "")}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify({
      html: opts.html,
      footer: { left: opts.footerLeft },
      page: { format: "A4", orientation: "portrait" },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`pdf-service render failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export interface FileHtmlResult {
  id: string;
  doc_number: string;
  url: string;
  file_name: string;
}

export interface FileHtmlOptions extends RenderOptions {
  projectNumber: string;
  originalFileName: string;
}

export async function fileHtmlDocument(opts: FileHtmlOptions): Promise<FileHtmlResult> {
  const url = process.env.DOC_SERVICE_URL;
  const key = process.env.DOC_SERVICE_API_KEY;
  if (!url || !key) throw new Error("DOC_SERVICE_URL / DOC_SERVICE_API_KEY not configured");
  const isoDescriptionId = Number(process.env.PO_ISO_DESCRIPTION_ID ?? 53); // 53 = ORDER (subclass CD)

  const res = await fetch(`${url.replace(/\/$/, "")}/api/file-html`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify({
      html: opts.html,
      footer: { left: opts.footerLeft },
      page: { format: "A4", orientation: "portrait" },
      iso_description_id: isoDescriptionId,
      // Doc-service requires a 5-digit reference and rejects 4-digit
      // (Steve, 2026-07-05): "0005" files as "00005". Our own data keeps
      // the unpadded form everywhere else.
      project_number: opts.projectNumber.padStart(5, "0"),
      original_file_name: opts.originalFileName,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => null)) as
    | (FileHtmlResult & { status?: string; error_code?: string; error_message?: string })
    | null;
  if (!res.ok || !body || body.status === "error") {
    throw new Error(
      `doc-service file-html failed (${res.status}): ${body?.error_code ?? ""} ${body?.error_message ?? ""}`.trim()
    );
  }
  return body;
}
