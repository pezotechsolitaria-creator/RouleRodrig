import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { toBookingDoc, type BookingDocPrefill } from "@/lib/booking-docs/types";
import { MAX_LINES } from "@/lib/booking-docs/model";

// ── THE DOCUMENTS HE COMPOSES ───────────────────────────────────────────────
//
// Unlike an invoice, this endpoint DOES take money: nothing in the database
// holds "Rs 1,800 per person for Îles aux Cocos", so the owner types it. What
// it does not take is any DERIVED figure — the line totals, the document
// total and the deposit are all computed by booking_doc_save() in SQL, from
// the typed inputs, once. A total that travelled over the wire is a total that
// can disagree with the page it is printed on.

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  try {
    const [docs, places, settings] = await Promise.all([
      admin
        .from("booking_documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      // ── WHAT A DOCUMENT CAN BE STARTED FROM ──────────────────────────────
      // Every reservation, not only the priced ones: the owner may well be
      // writing the document precisely because the listing is request-only and
      // the price was agreed by message. 'unavailable' is excluded — the owner
      // already told that guest the dates are not free.
      admin
        .from("place_bookings")
        .select("id, place_name, name, email, phone, start_date, end_date, guests, time_slot, deposit_amount, status")
        .neq("status", "unavailable")
        .order("created_at", { ascending: false })
        .limit(60),
      admin.from("invoice_settings").select("pay_instruction").eq("id", "main").maybeSingle(),
    ]);
    if (docs.error) return failed(docs.error, "Could not load the documents.");
    if (places.error) return failed(places.error, "Could not load the reservations.");

    type PlaceRow = {
      id: string; place_name: string; name: string;
      email: string | null; phone: string | null;
      start_date: string; end_date: string; guests: number | null;
      time_slot: string | null; deposit_amount: number | null; status: string;
    };

    const prefills: BookingDocPrefill[] = ((places.data ?? []) as unknown as PlaceRow[]).map((p) => ({
      placeBookingId: p.id,
      reference: `RR-${p.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      guestName: p.name,
      guestEmail: p.email,
      guestPhone: p.phone,
      placeName: p.place_name,
      startDate: p.start_date,
      endDate: p.end_date,
      guests: p.guests,
      timeSlot: p.time_slot,
      // place_bookings.deposit_amount is WHOLE RUPEES — and despite the name it
      // is the whole price. Converted here, at the edge, once.
      totalCents: (p.deposit_amount ?? 0) * 100,
    }));

    return NextResponse.json({
      documents: ((docs.data ?? []) as Record<string, unknown>[]).map(toBookingDoc),
      prefills,
      payInstruction:
        (settings.data as { pay_instruction?: string | null } | null)?.pay_instruction ?? null,
    });
  } catch (err) {
    return failed(err, "Could not load the documents.");
  }
}

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const {
    id, reference, guestName, guestEmail, guestPhone,
    details, lines, depositPct, receivedCents, note, placeBookingId,
  } = (body ?? {}) as Record<string, unknown>;

  if (typeof reference !== "string" || !reference.trim()) {
    return NextResponse.json({ error: "What reference should this carry?" }, { status: 400 });
  }
  if (typeof guestName !== "string" || !guestName.trim()) {
    return NextResponse.json({ error: "Who is this booking for?" }, { status: 400 });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "Add at least one line." }, { status: 400 });
  }
  if (lines.length > MAX_LINES) {
    return NextResponse.json(
      { error: `A document fits ${MAX_LINES} lines at most.` },
      { status: 400 },
    );
  }
  // The one place a human supplies money, so every figure is named for its
  // unit and a non-integer is rejected — a float here is somebody typing
  // rupees into a cents field.
  for (const l of lines as Record<string, unknown>[]) {
    const unit = l?.unitPriceCents;
    const qty = l?.qty;
    if (typeof unit !== "number" || !Number.isInteger(unit) || unit < 0) {
      return NextResponse.json(
        { error: "Each line needs a price in whole cents." },
        { status: 400 },
      );
    }
    if (typeof qty !== "number" || !(qty > 0)) {
      return NextResponse.json({ error: "Each line needs a quantity." }, { status: 400 });
    }
  }
  if (
    depositPct !== null && depositPct !== undefined &&
    (typeof depositPct !== "number" || !Number.isInteger(depositPct) || depositPct < 0 || depositPct > 100)
  ) {
    return NextResponse.json({ error: "The deposit must be a whole percentage." }, { status: 400 });
  }
  if (
    receivedCents !== undefined && receivedCents !== null &&
    (typeof receivedCents !== "number" || !Number.isInteger(receivedCents) || receivedCents < 0)
  ) {
    return NextResponse.json(
      { error: "The amount received must be a whole number of cents." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await admin.rpc("booking_doc_save", {
      p_id: typeof id === "string" && id ? id : null,
      p_reference: reference.trim(),
      p_guest_name: guestName.trim(),
      p_guest_email: typeof guestEmail === "string" && guestEmail.trim() ? guestEmail.trim() : null,
      p_guest_phone: typeof guestPhone === "string" && guestPhone.trim() ? guestPhone.trim() : null,
      p_details: Array.isArray(details) ? details : [],
      p_lines: lines,
      p_deposit_pct: typeof depositPct === "number" ? depositPct : null,
      p_received_cents: typeof receivedCents === "number" ? receivedCents : 0,
      p_note: typeof note === "string" && note.trim() ? note.trim() : null,
      p_place_booking_id:
        typeof placeBookingId === "string" && placeBookingId ? placeBookingId : null,
    });
    if (error) return failed(error, "Could not save the document.");

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return failed(null, "The document was not returned.");
    const doc = toBookingDoc(row);

    await audit(admin, {
      action: id ? "booking_doc.update" : "booking_doc.create",
      entityType: "booking_document",
      entityId: doc.id,
      diff: {
        number: doc.number,
        reference: doc.reference,
        totalCents: doc.totalCents,
        depositCents: doc.depositCents,
        receivedCents: doc.receivedCents,
      },
    });

    return NextResponse.json({ document: doc }, { status: id ? 200 : 201 });
  } catch (err) {
    return failed(err, "Could not save the document.");
  }
}
