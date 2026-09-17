import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, failed } from "@/lib/admin/api-guard";

// ── WHAT CAN STILL BE INVOICED ──────────────────────────────────────────────
//
// Bookings and orders that do not already have a live invoice. The exclusion
// matters: invoices_one_live_per_subject would reject a second one anyway, so
// offering it would be offering a button that always errors.
//
// A VOIDED invoice does not count — that subject is issuable again, which is
// how a cancelled document is reissued with a fresh number.
//
// Only the two subjects invoice_issue() handles today. The rest announce
// themselves through SUBJECTS[].pending rather than appearing here and failing.

type Issuable = {
  subjectType: "booking" | "order";
  subjectId: string;
  reference: string;
  who: string;
  what: string;
  /** Minor units, converted from whatever the source column holds. */
  totalCents: number;
  when: string | null;
};

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

    const [bookings, orders] = await Promise.all([
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
    ]);
    if (bookings.error) return failed(bookings.error, "Could not load bookings.");
    if (orders.error) return failed(orders.error, "Could not load orders.");

    type BookingRow = {
      id: string; name: string | null; scooter: string | null;
      days: number | null; total_amount: number; start_date: string | null;
    };
    type OrderRow = {
      id: string; order_number: string; customer_name: string | null;
      total: number; placed_at: string | null;
    };

    const out: Issuable[] = [];

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

    return NextResponse.json({ issuable: out });
  } catch (err) {
    return failed(err, "Could not load what can be invoiced.");
  }
}
