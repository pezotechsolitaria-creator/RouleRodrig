import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, failed } from "@/lib/admin/api-guard";
import { rideReference, RIDE_SERVICE_META, type RideService } from "@/lib/rides/model";
import type { IssuableSubject } from "@/lib/invoicing/types";

// ── WHAT CAN STILL BE INVOICED ──────────────────────────────────────────────
//
// Bookings, orders and rides that do not already have a live invoice. The
// exclusion matters: invoices_one_live_per_subject would reject a second one
// anyway, so offering it would be offering a button that always errors.
//
// A VOIDED invoice does not count — that subject is issuable again, which is
// how a cancelled document is reissued with a fresh number.
//
// Only the subjects invoice_issue() handles today. The rest announce
// themselves through SUBJECTS[].pending rather than appearing here and failing.

// The shape lives in lib/invoicing/types so the dialog reads the same one.

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  try {
    const { data: taken, error: tErr } = await admin
      .from("invoices")
      .select("subject_type, subject_id")
      .neq("state", "void");
    if (tErr) return failed(tErr, "Could not check which are already invoiced.");

    const done = new Set(
      ((taken ?? []) as { subject_type: string; subject_id: string }[]).map(
        (r) => `${r.subject_type}:${r.subject_id}`,
      ),
    );

    const [bookings, orders, rides] = await Promise.all([
      admin
        .from("bookings")
        .select("id, name, scooter, days, total_amount, start_date")
        .not("total_amount", "is", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("orders")
        .select("id, order_number, customer_name, total, placed_at")
        .not("total", "is", null)
        .order("created_at", { ascending: false })
        .limit(100),
      // A ride with no quote has nothing to invoice — four of nine live rides
      // never got one — and a cancelled ride is not a sale. invoice_issue()
      // would refuse both; the picker simply does not offer them.
      admin
        .from("ride_requests")
        .select("id, service, customer_name, quoted_price, pickup_label, dropoff_label, scheduled_at, created_at")
        .not("quoted_price", "is", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (bookings.error) return failed(bookings.error, "Could not load bookings.");
    if (orders.error) return failed(orders.error, "Could not load orders.");
    if (rides.error) return failed(rides.error, "Could not load rides.");

    type BookingRow = {
      id: string; name: string | null; scooter: string | null;
      days: number | null; total_amount: number; start_date: string | null;
    };
    type OrderRow = {
      id: string; order_number: string; customer_name: string | null;
      total: number; placed_at: string | null;
    };
    type RideRow = {
      id: string; service: string; customer_name: string;
      quoted_price: number; pickup_label: string; dropoff_label: string | null;
      scheduled_at: string | null; created_at: string;
    };

    const out: IssuableSubject[] = [];

    for (const b of (bookings.data ?? []) as unknown as BookingRow[]) {
      if (done.has(`booking:${b.id}`)) continue;
      out.push({
        subjectType: "booking",
        subjectId: b.id,
        reference: `RR-${b.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        who: b.name ?? "Customer",
        what: b.scooter ?? "Vehicle rental",
        // bookings.total_amount is WHOLE RUPEES. Converted here only so the
        // picker can show a figure; invoice_issue() converts again from the
        // source row and its CHECK is what actually guarantees the document.
        totalCents: b.total_amount * 100,
        when: b.start_date,
      });
    }

    for (const o of (orders.data ?? []) as unknown as OrderRow[]) {
      if (done.has(`order:${o.id}`)) continue;
      out.push({
        subjectType: "order",
        subjectId: o.id,
        reference: o.order_number,
        who: o.customer_name ?? "Customer",
        what: `Order ${o.order_number}`,
        // orders.total is ALREADY CENTS.
        totalCents: o.total,
        when: o.placed_at,
      });
    }

    for (const r of (rides.data ?? []) as unknown as RideRow[]) {
      if (done.has(`ride_request:${r.id}`)) continue;
      // The same words the invoice will carry, and the same reference the
      // customer already has from /taxi/track. Both come from lib/rides/model
      // rather than being spelled again here, so the picker and the document
      // cannot drift apart.
      const label = RIDE_SERVICE_META[r.service as RideService]?.label ?? "Transfer";
      out.push({
        subjectType: "ride_request",
        subjectId: r.id,
        reference: rideReference(r.id),
        who: r.customer_name,
        what: r.dropoff_label
          ? `${label} — ${r.pickup_label} to ${r.dropoff_label}`
          : `${label} — from ${r.pickup_label}`,
        // ride_requests.quoted_price is ALREADY CENTS.
        totalCents: r.quoted_price,
        when: r.scheduled_at ?? r.created_at,
      });
    }

    return NextResponse.json({ issuable: out });
  } catch (err) {
    return failed(err, "Could not load what can be invoiced.");
  }
}
