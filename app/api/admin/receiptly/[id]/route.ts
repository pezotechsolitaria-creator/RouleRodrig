import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { toSavedDoc } from "@/lib/receiptly/db";

// One saved document and its lines — everything the browser needs to redraw
// the page, reopen it for editing, or download the PDF again.
//
// Read fresh and never cached: the PDF is generated from THIS response, so a
// stale read would hand a customer a figure the register disagrees with.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;
  const { id } = await params;

  try {
    const [doc, lines] = await Promise.all([
      admin.from("receiptly_documents").select("*").eq("id", id).maybeSingle(),
      admin.from("receiptly_document_lines").select("*").eq("document_id", id).order("position"),
    ]);
    if (doc.error) return failed(doc.error, "Could not load the document.");
    if (!doc.data) return NextResponse.json({ error: "No such document." }, { status: 404 });
    if (lines.error) return failed(lines.error, "Could not load the lines.");

    return NextResponse.json({
      document: toSavedDoc(
        doc.data as Record<string, unknown>,
        (lines.data ?? []) as Record<string, unknown>[],
      ),
    });
  } catch (err) {
    return failed(err, "Could not load the document.");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;
  const { id } = await params;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { state } = (body ?? {}) as { state?: unknown };

  if (state !== "open" && state !== "cancelled") {
    return NextResponse.json({ error: "Unknown state." }, { status: 400 });
  }

  try {
    // Cancelled, never deleted. A document that was sent to somebody exists
    // whether or not it was a mistake, and its number is never reused.
    const { data, error } = await admin.rpc("receiptly_doc_set_state", {
      p_id: id, p_state: state,
    });
    if (error) return failed(error, "Could not update it.");

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return failed(null, "The document was not returned.");
    const saved = toSavedDoc(row);

    await audit(admin, {
      action: "receiptly.state",
      entityType: "receiptly_document",
      entityId: saved.id,
      diff: { number: saved.number, state: saved.state },
    });

    return NextResponse.json({ document: saved });
  } catch (err) {
    return failed(err, "Could not update it.");
  }
}
