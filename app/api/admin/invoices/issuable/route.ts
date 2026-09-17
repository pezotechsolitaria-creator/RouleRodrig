import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, failed } from "@/lib/admin/api-guard";
import { rideReference, RIDE_SERVICE_META, type RideService } from "@/lib/rides/model";
import { requestRef } from "@/lib/delivery/request-status";
import { KIND_LABEL, toRequestKind } from "@/lib/delivery/kind";
import type { IssuableSubject } from "@/lib/invoicing/types";

// ── WHAT CAN STILL BE INVOICED ──────────────────────────────────────────────
//
// Bookings, orders, rides, deliveries and place reservations that do not
// already have a live invoice. The exclusion matters: invoices_one_live_per_subject would reject a
// second one anyway, so offering it would be offering a button that always
// errors.
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

    const [bookings, orders, rides, deliveries, places] = await Promise.all([
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
      // ── ONLY DELIVER-ANYTHING DELIVERIES ────────────────────────────────
      // A delivery attached to a store ORDER is already billed: order_amounts()
      // returns p_subtotal + v_tax + v_fee and create_order() writes it into
      // orders.total, so the fee sits inside that order's invoice too. Offering
      // it here would be
      // offering to charge the same journey twice. invoice_issue() refuses it
      // by name; the picker does not raise the question.
      admin
        .from("deliveries")
        .select("id, status, customer_fee, request_id, created_at, delivered_at, payment_method, payment_verified_at")
        .is("order_id", null)
        // ONLY A DELIVERED JOB. The failed-delivery tracker tells the customer
        // "You have not been charged a delivery fee", and nothing ever zeroes
        // customer_fee, so every cancelled and failed row still carries one.
        .eq("status", "delivered")
        .gt("customer_fee", 0)
        .order("created_at", { ascending: false })
        .limit(100),
      // ── RESERVATIONS THE OWNER HAS ACCEPTED ─────────────────────────────
      // 'pending' means the owner has not said yes yet, so nothing is agreed
      // and place_bookings_approved_has_deadline has not even set a due date.
      // A zero or NULL price means a request-only listing — eight of the
      // sixteen live listings carry no price at all — and there is nothing to
      // put on a document. invoice_issue() refuses both; the picker does not
      // offer them.
      admin
        .from("place_bookings")
        .select("id, place_name, name, deposit_amount, start_date, end_date, status, payment_due_by")
        .in("status", ["approved", "confirmed", "completed"])
        .gt("deposit_amount", 0)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (bookings.error) return failed(bookings.error, "Could not load bookings.");
    if (orders.error) return failed(orders.error, "Could not load orders.");
    if (rides.error) return failed(rides.error, "Could not load rides.");
    if (deliveries.error) return failed(deliveries.error, "Could not load deliveries.");
    if (places.error) return failed(places.error, "Could not load reservations.");

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
    type DeliveryRow = {
      id: string; status: string; customer_fee: number; request_id: string;
      created_at: string; delivered_at: string | null;
      payment_method: string | null; payment_verified_at: string | null;
    };
    type PlaceRow = {
      id: string; place_name: string; name: string; deposit_amount: number;
      start_date: string; end_date: string; status: string;
      payment_due_by: string | null;
    };
    type RequestRow = {
      id: string; kind: string; contact_name: string;
      pickup_text: string; dropoff_text: string;
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

    // The customer's identity and the route live on the REQUEST, not on the
    // delivery. Fetched by id list rather than as an embedded select: an
    // explicit second query cannot be surprised by how PostgREST names an
    // embedded relation, and there are at most a hundred of them.
    const deliveryRows = (deliveries.data ?? []) as unknown as DeliveryRow[];
    const wanted = deliveryRows.filter((d) => !done.has(`delivery:${d.id}`));
    if (wanted.length > 0) {
      const reqs = await admin
        .from("delivery_requests")
        .select("id, kind, contact_name, pickup_text, dropoff_text")
        .in("id", wanted.map((d) => d.request_id));
      if (reqs.error) return failed(reqs.error, "Could not load the delivery requests.");

      const byId = new Map(
        ((reqs.data ?? []) as unknown as RequestRow[]).map((r) => [r.id, r]),
      );

      for (const d of wanted) {
        const r = byId.get(d.request_id);
        if (!r) continue; // No request row means no customer to bill.
        // KIND_LABEL, not a ternary. lib/delivery/kind.ts exists precisely
        // because the ternary spelling of this is correct for two kinds and
        // silently wrong for three, and a Record<RequestKind, …> makes the
        // fourth kind a compile error instead of a mislabelled job.
        const what = KIND_LABEL[toRequestKind(r.kind)];
        out.push({
          subjectType: "delivery",
          subjectId: d.id,
          // The reference the CUSTOMER holds is the request's, not the
          // delivery's — requestRef() is what they were shown and asked to keep.
          reference: requestRef(r.id),
          who: r.contact_name,
          what: `${what} — ${r.pickup_text} to ${r.dropoff_text}`,
          // deliveries.customer_fee is ALREADY CENTS, and it is the fee alone:
          // never max_budget, which is the customer's shopping money.
          totalCents: d.customer_fee,
          when: d.delivered_at ?? d.created_at,
          // ── THE MONEY IS USUALLY ALREADY IN ─────────────────────────────
          // A delivery only becomes invoiceable once it is delivered, and by
          // then the fee has been collected: cash into the driver's hand at
          // the door, or a transfer evidenced before the driver could leave
          // 'assigned'. Nothing RECORDS the cash, so the invoice is issued
          // unpaid and correctly so — but an operator who is not told this
          // hands a customer a document reading "Awaiting payment" for money
          // they have already paid. One sentence prevents that.
          note:
            d.payment_method === "bank_transfer"
              ? d.payment_verified_at
                ? "Paid by bank transfer, verified — record the payment after issuing."
                : "Paid by bank transfer, not yet verified — check before recording it."
              : "The driver was told to collect this at the door — record the payment after issuing.",
        });
      }
    }

    for (const p of (places.data ?? []) as unknown as PlaceRow[]) {
      if (done.has(`place_booking:${p.id}`)) continue;
      out.push({
        subjectType: "place_booking",
        subjectId: p.id,
        reference: `RR-${p.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        who: p.name,
        // Never "deposit": the column name is a fossil and the figure is the
        // whole price, paid in full to confirm.
        what: `${p.place_name} — ${p.start_date.slice(0, 10)}`,
        // place_bookings.deposit_amount is WHOLE RUPEES, like bookings. The
        // conversion here is only so the picker can show a figure;
        // invoice_issue() converts again from the source row and the
        // invoices_unit_provenance CHECK is what guarantees the document.
        totalCents: p.deposit_amount * 100,
        when: p.start_date,
        note:
          p.payment_due_by && p.status === "approved"
            ? `Due ${p.payment_due_by.slice(0, 10)} — the date the customer was already given.`
            : undefined,
      });
    }

    return NextResponse.json({ issuable: out });
  } catch (err) {
    return failed(err, "Could not load what can be invoiced.");
  }
}
