import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { ESCALATE_AFTER_HOURS, hoursWaited } from "@/lib/notifications/escalation";
import { slotReceives } from "@/lib/notifications/slot-match";

// ── One list of everything waiting on the owner's decision about money ──────
//
// The problem this solves is not that any single desk was missing — it is that
// there were four of them. A bank transfer for a scooter lands in Bookings, for
// a massage in Stay & Activity Bookings, for a shop in /admin/marketplace and
// for a dish in /admin/food. Nothing said "three people are waiting on you",
// so the answer to "has anyone paid?" was to open four screens and remember.
//
// Read-only and deliberately shallow: this tells the owner WHERE to act, and
// each desk keeps owning the action itself. Duplicating the confirm/reject
// buttons here would mean two code paths for the same state change, and the
// one that gets less use is the one that quietly rots.

export type MoneyRow = {
  kind: "vehicle" | "activity" | "order";
  id: string;
  reference: string;
  customer: string;
  item: string | null;
  amount: number | null;
  reportedAt: string | null;
  hasReceipt: boolean;
  /** Which desk deals with it, in the owner's own words. */
  desk: string;
};

const refOf = (id: string) => "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await getPrivileged();

  // Each source is fetched independently and a failure in one is logged and
  // skipped rather than emptying the whole page — a broken shop query must not
  // hide a rental someone has paid for.
  const rows: MoneyRow[] = [];

  const [vehicles, activities, orders] = await Promise.allSettled([
    supabase
      .from("bookings")
      .select("id, name, scooter, deposit_amount, payment_reported_at, payment_receipt_path, deposit_paid_at, status")
      .not("payment_reported_at", "is", null)
      .is("deposit_paid_at", null)
      // "approved" as well as "pending": after M91 a customer declares their
      // transfer against an APPROVED booking, which is the normal path now.
      // Listing only "pending" would have hidden every real one.
      .in("status", ["pending", "approved"])
      .order("payment_reported_at", { ascending: true })
      .limit(100),
    supabase
      .from("place_bookings")
      .select("id, name, place_name, deposit_amount, payment_reported_at, payment_receipt_path, deposit_paid_at, status")
      .not("payment_reported_at", "is", null)
      .is("deposit_paid_at", null)
      .in("status", ["pending"])
      .order("payment_reported_at", { ascending: true })
      .limit(100),
    // Orders have no payment_reported_at column; an uploaded receipt on an
    // unpaid order is the same signal.
    supabase
      .from("orders")
      .select("id, order_number, customer_name, total, payment_receipt_path, created_at, status")
      .not("payment_receipt_path", "is", null)
      .eq("status", "pending_payment")
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (vehicles.status === "fulfilled" && vehicles.value.data) {
    for (const b of vehicles.value.data as Record<string, unknown>[]) {
      rows.push({
        kind: "vehicle",
        id: b.id as string,
        reference: refOf(b.id as string),
        customer: (b.name as string) ?? "—",
        item: (b.scooter as string) ?? null,
        amount: typeof b.deposit_amount === "number" ? b.deposit_amount : null,
        reportedAt: (b.payment_reported_at as string) ?? null,
        hasReceipt: !!b.payment_receipt_path,
        desk: "Bookings",
      });
    }
  } else if (vehicles.status === "rejected") {
    console.error("money: vehicle bookings failed", vehicles.reason);
  }

  if (activities.status === "fulfilled" && activities.value.data) {
    for (const b of activities.value.data as Record<string, unknown>[]) {
      rows.push({
        kind: "activity",
        id: b.id as string,
        reference: refOf(b.id as string),
        customer: (b.name as string) ?? "—",
        item: (b.place_name as string) ?? null,
        amount: typeof b.deposit_amount === "number" ? b.deposit_amount : null,
        reportedAt: (b.payment_reported_at as string) ?? null,
        hasReceipt: !!b.payment_receipt_path,
        desk: "Stay & Activity Bookings",
      });
    }
  } else if (activities.status === "rejected") {
    console.error("money: place bookings failed", activities.reason);
  }

  if (orders.status === "fulfilled" && orders.value.data) {
    for (const o of orders.value.data as Record<string, unknown>[]) {
      rows.push({
        kind: "order",
        id: o.id as string,
        reference: (o.order_number as string) ?? "—",
        customer: (o.customer_name as string) ?? "—",
        item: null,
        amount: typeof o.total === "number" ? o.total : null,
        reportedAt: (o.created_at as string) ?? null,
        hasReceipt: !!o.payment_receipt_path,
        desk: "Shop & Food orders",
      });
    }
  } else if (orders.status === "rejected") {
    console.error("money: orders failed", orders.reason);
  }

  // Oldest first: the person who has been waiting longest is the one to answer.
  rows.sort((a, b) => (a.reportedAt ?? "").localeCompare(b.reportedAt ?? ""));

  // ── Is the phone escalation actually armed? (M93) ─────────────────────────
  //
  // The WhatsApp escalation only reaches a number that has an ACTIVE slot
  // subscribed to the "admin" category. A Command Centre that shows a queue but
  // not whether anyone will be told about it is how you end up believing you
  // are covered — the same failure as OWNER_EMAIL being unset for months.
  // Names and the threshold only: an api_key is a bearer credential and never
  // leaves the server (M43).
  let escalation: { armed: boolean; to: string[]; afterHours: number } = {
    armed: false,
    to: [],
    afterHours: ESCALATE_AFTER_HOURS,
  };
  try {
    const { data: slots } = await supabase
      .from("notification_slots")
      .select("name, phone, is_active, categories")
      .eq("is_active", true);
    const names = ((slots ?? []) as { name: string; phone: string; categories: string[] | null }[])
      // The recipient rule lives in lib/notifications/slot-match.ts and is
      // pinned against enqueue_notification()'s SQL. Re-implementing it inline
      // is what produced "nobody will be phoned" while the database was
      // queueing to two live numbers.
      .filter((s) => slotReceives(s, "admin"))
      // Last four digits only — enough for him to recognise the phone, not
      // enough to be a contact list if this response ever leaks.
      .map((s) => `${s.name} (…${(s.phone ?? "").slice(-4)})`);
    escalation = { armed: names.length > 0, to: names, afterHours: ESCALATE_AFTER_HOURS };
  } catch (e) {
    console.error("money: escalation status failed", e);
  }

  // How long the longest-waiting item has been sitting, so the desk can say
  // "this one has already triggered a call" rather than making him compare
  // timestamps himself.
  const oldestHours = rows.length ? hoursWaited(rows[0].reportedAt ?? new Date().toISOString()) : 0;

  return NextResponse.json({ rows, escalation, oldestHours });
}
