import "server-only";

// Microsoft Graph client — port of legacy app/integrations/outlook_graph.py
// (bead 9bq.7): client-credentials token, create a DRAFT message in the
// shared mailbox, attach the PDF. Drafts only — nothing is ever sent.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET not configured");
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; error_description?: string } | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(`Graph token failed (${res.status}): ${body?.error_description ?? "no token"}`);
  }
  return body.access_token;
}

export interface DraftResult {
  id: string;
  webLink?: string;
}

export async function createDraftWithAttachment(opts: {
  mailbox: string;
  subject: string;
  bodyText: string;
  toRecipients: string[];
  attachmentName: string;
  attachmentBase64: string;
}): Promise<DraftResult> {
  const token = await getGraphToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const mailboxPath = `${GRAPH_BASE}/users/${encodeURIComponent(opts.mailbox)}`;

  // 1) Create the draft (subject + text body + recipients) — legacy parity.
  const createRes = await fetch(`${mailboxPath}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      subject: opts.subject,
      body: { contentType: "Text", content: opts.bodyText },
      toRecipients: opts.toRecipients.map((address) => ({ emailAddress: { address } })),
      importance: "Normal",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const message = (await createRes.json().catch(() => null)) as { id?: string; webLink?: string } | null;
  if (!createRes.ok || !message?.id) {
    throw new Error(`Create draft failed (${createRes.status}): ${JSON.stringify(message).slice(0, 300)}`);
  }

  // 2) Attach the PDF.
  const attachRes = await fetch(`${mailboxPath}/messages/${message.id}/attachments`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: opts.attachmentName,
      contentType: "application/pdf",
      contentBytes: opts.attachmentBase64,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!attachRes.ok) {
    const text = await attachRes.text().catch(() => "");
    throw new Error(`Attach failed (${attachRes.status}): ${text.slice(0, 300)}`);
  }

  return { id: message.id, webLink: message.webLink };
}

/** Legacy build_subject_and_body (services/po_email.py:43) — exact strings. */
export function buildSubjectAndBody(projectNumber: string, poNumStr: string): { subject: string; bodyText: string } {
  return {
    subject: `${projectNumber} PO ${poNumStr}`,
    bodyText:
      `Please find attached PO ${poNumStr} for previously quoted materials, ` +
      "please confirm as soon as possible and notify of any late or unavailable items.\n\n" +
      "Best Regards,",
  };
}

/** Legacy feature flag semantics (EMAIL_DRAFT_ON_PO), except default OFF. */
export function emailDraftEnabled(): boolean {
  return ["1", "true", "yes"].includes(String(process.env.EMAIL_DRAFT_ON_PO ?? "").toLowerCase());
}
