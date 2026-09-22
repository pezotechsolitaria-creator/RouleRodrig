import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";

// ── HOW A CUSTOMER IS TOLD TO PAY ───────────────────────────────────────────
//
// One line, in the owner's own words, printed on every booking document:
// "MCB Juice: 58363401". It is a SETTING and not a literal in the source,
// because that number is the owner's own phone — which is what an MCB Juice
// account is — and because components/merchant/BankTransferDetails.tsx already
// shows what hard-coding an account number looks like a year later.
//
// It is snapshotted onto each document when the document is created, so
// changing it here never rewrites a document already sent.

export async function PATCH(req: NextRequest) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { payInstruction } = (body ?? {}) as { payInstruction?: unknown };

  if (payInstruction !== null && typeof payInstruction !== "string") {
    return NextResponse.json({ error: "That is not a payment line." }, { status: 400 });
  }
  const value =
    typeof payInstruction === "string" && payInstruction.trim() ? payInstruction.trim() : null;

  try {
    const { error } = await admin
      .from("invoice_settings")
      .update({ pay_instruction: value })
      .eq("id", "main");
    if (error) return failed(error, "Could not save it.");
    return NextResponse.json({ payInstruction: value });
  } catch (err) {
    return failed(err, "Could not save it.");
  }
}
