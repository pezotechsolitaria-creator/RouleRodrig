import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/file-signature";

// ── Let the owner actually LOOK at the proof (M83) ─────────────────────────
//
// M78 exists because a receipt was uploaded, stored, and never shown: "I cannot
// read the proof of payment and I cannot see it again — seriously, I did not
// see it." Adding an upload without this endpoint would repeat that exactly,
// one service over.
//
// The bucket is private and carries no storage policies, so this hands out a
// short-lived signed URL instead. Five minutes: long enough to open on a phone,
// short enough that a URL pasted into a chat stops working.
const TTL_SECONDS = 300;

export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const id = (body.id ?? "").toString();
  // A vehicle booking and an activity live in different tables; reading the
  // wrong one would report "no receipt" for a booking that has one.
  const table = body.kind === "place" ? "place_bookings" : "bookings";
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await getPrivileged();
  const { data: row } = await supabase
    .from(table)
    .select("payment_receipt_path")
    .eq("id", id)
    .maybeSingle();

  const path = (row as { payment_receipt_path?: string | null } | null)?.payment_receipt_path;
  if (!path) return NextResponse.json({ error: "No receipt was uploaded." }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("booking-receipts")
    .createSignedUrl(path, TTL_SECONDS);

  if (error || !signed?.signedUrl) {
    console.error("sign booking receipt failed", error);
    return NextResponse.json({ error: "Could not open that receipt." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
