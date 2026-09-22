import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, failed } from "@/lib/admin/api-guard";
import { toBookingDoc, toBookingDocLine } from "@/lib/booking-docs/types";

// One document and its lines — what the browser needs to draw the PDF.
// Read fresh and never cached: the page renders the document from THIS
// response, so a stale read would hand a customer a figure the register
// disagrees with.

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
      admin.from("booking_documents").select("*").eq("id", id).maybeSingle(),
      admin.from("booking_document_lines").select("*").eq("document_id", id).order("position"),
    ]);
    if (doc.error) return failed(doc.error, "Could not load the document.");
    if (!doc.data) return NextResponse.json({ error: "No such document." }, { status: 404 });
    if (lines.error) return failed(lines.error, "Could not load the lines.");

    return NextResponse.json({
      document: toBookingDoc(doc.data as Record<string, unknown>),
      lines: ((lines.data ?? []) as Record<string, unknown>[]).map(toBookingDocLine),
    });
  } catch (err) {
    return failed(err, "Could not load the document.");
  }
}
