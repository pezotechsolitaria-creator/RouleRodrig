import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { toSavedDoc, toSaveArgs, toProfile, EMPTY_PROFILE } from "@/lib/receiptly/db";
import { reviveDoc } from "@/lib/receiptly/draft";
import { MAX_LINES, CURRENCIES, DOC_KINDS, type DocKind } from "@/lib/receiptly/model";

// ── THE DOCUMENTS RECEIPTLY HAS SAVED ───────────────────────────────────────
//
// Unlike the invoice register, this endpoint DOES take money: nothing in the
// database holds "Rs 1,800 per person for Îles aux Cocos", so the owner types
// it. What it never takes is a DERIVED figure — the line totals, the document
// total and the deposit are all computed by receiptly_doc_save() in SQL from
// the typed inputs. A total that arrived over the wire is a total that can
// disagree with the page it is printed on.

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  try {
    const [docs, places, settings] = await Promise.all([
      admin
        .from("receiptly_documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      // Every reservation the owner might write a document about. Not only the
      // priced ones: he may be writing it precisely because the listing is
      // request-only and the price was agreed by message.
      admin
        .from("place_bookings")
        .select("id, place_name, name, email, phone, start_date, end_date, guests, time_slot, deposit_amount, status")
        .neq("status", "unavailable")
        .order("created_at", { ascending: false })
        .limit(40),
      admin.from("invoice_settings").select("receiptly_profile").eq("id", "main").maybeSingle(),
    ]);
    if (docs.error) return failed(docs.error, "Could not load the documents.");
    if (places.error) return failed(places.error, "Could not load the reservations.");

    type PlaceRow = {
      id: string; place_name: string; name: string;
      email: string | null; phone: string | null;
      start_date: string; end_date: string; guests: number | null;
      time_slot: string | null; deposit_amount: number | null;
    };

    return NextResponse.json({
      documents: ((docs.data ?? []) as Record<string, unknown>[]).map((d) => toSavedDoc(d)),
      prefills: ((places.data ?? []) as unknown as PlaceRow[]).map((p) => ({
        placeBookingId: p.id,
        reference: `RR-${p.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        guestName: p.name,
        guestEmail: p.email,
        guestPhone: p.phone,
        placeName: p.place_name,
        startDate: p.start_date,
        guests: p.guests,
        timeSlot: p.time_slot,
        // place_bookings.deposit_amount is WHOLE RUPEES and, despite the name,
        // is the whole price. Converted here at the edge, once.
        totalMinor: (p.deposit_amount ?? 0) * 100,
      })),
      profile: toProfile(
        (settings.data as { receiptly_profile?: unknown } | null)?.receiptly_profile,
      ),
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
  const { id, doc: rawDoc, placeBookingId } = (body ?? {}) as Record<string, unknown>;

  // The document arrives as JSON from a browser and is run through the same
  // reviver a stored draft gets: every field checked, a logo that is not a
  // data URL dropped, an accent that is not a colour ignored. A request body
  // is user-controlled input even when the user is the owner.
  const doc = reviveDoc(rawDoc, new Date().toISOString().slice(0, 10));

  if (!doc.reference.trim()) {
    return NextResponse.json({ error: "What reference should this carry?" }, { status: 400 });
  }
  if (!doc.business.name.trim()) {
    return NextResponse.json({ error: "Add your business name." }, { status: 400 });
  }
  if (!doc.customerName.trim()) {
    return NextResponse.json({ error: "Who is this document for?" }, { status: 400 });
  }
  const usable = doc.lines.filter((l) => l.description.trim() !== "" && l.qty > 0);
  if (usable.length === 0) {
    return NextResponse.json({ error: "Add at least one line." }, { status: 400 });
  }
  if (usable.length > MAX_LINES) {
    return NextResponse.json(
      { error: `A document fits ${MAX_LINES} lines at most.` }, { status: 400 },
    );
  }
  if (!DOC_KINDS.includes(doc.kind as DocKind)) {
    return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
  }
  if (!CURRENCIES.some((c) => c.code === doc.currencyCode)) {
    return NextResponse.json({ error: "Unknown currency." }, { status: 400 });
  }

  try {
    const { data, error } = await admin.rpc(
      "receiptly_doc_save",
      toSaveArgs(
        doc,
        typeof id === "string" && id ? id : null,
        typeof placeBookingId === "string" && placeBookingId ? placeBookingId : null,
      ),
    );
    if (error) return failed(error, "Could not save the document.");

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return failed(null, "The document was not returned.");
    const saved = toSavedDoc(row);

    await audit(admin, {
      action: id ? "receiptly.update" : "receiptly.create",
      entityType: "receiptly_document",
      entityId: saved.id,
      diff: {
        number: saved.number,
        kind: saved.kind,
        reference: saved.reference,
        currency: saved.currencyCode,
        // The figures the DATABASE computed, not the ones the browser sent.
        totalMinor: row.total_minor,
        depositMinor: row.deposit_minor,
        receivedMinor: row.received_minor,
      },
    });

    return NextResponse.json({ document: saved }, { status: id ? 200 : 201 });
  } catch (err) {
    return failed(err, "Could not save the document.");
  }
}

export async function PATCH(req: NextRequest) {
  // The business profile: what a new document starts from. Snapshotted onto
  // each document at save, so changing it never rewrites one already sent.
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const profile = toProfile((body as { profile?: unknown } | null)?.profile);

  if (JSON.stringify(profile) === JSON.stringify(EMPTY_PROFILE)) {
    return NextResponse.json({ error: "There is nothing to save." }, { status: 400 });
  }

  try {
    const { error } = await admin
      .from("invoice_settings")
      .update({ receiptly_profile: profile })
      .eq("id", "main");
    if (error) return failed(error, "Could not save your details.");
    return NextResponse.json({ profile });
  } catch (err) {
    return failed(err, "Could not save your details.");
  }
}
