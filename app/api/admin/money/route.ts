import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { ESCALATE_AFTER_HOURS, hoursWaited } from "@/lib/notifications/escalation";
import { slotReceives } from "@/lib/notifications/slot-match";
import { rupeesToCents } from "@/lib/money";
import { vehicleName } from "@/lib/vehicle-name";
import {
  amountPaidRupees,
  bookingTotalRupees,
  cashOverdue,
  cashToCollect,
  type MoneyRow as BookingMoney,
} from "@/lib/bookings/in-person";
import { islandDayStartUtc, islandToday, sortCashRows, type CashRow } from "@/lib/admin/booking-money";

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
  /**
   * ALWAYS CENTS. The name carries the unit because the previous name did not,
   * and this desk is where that cost the owner: `bookings.deposit_amount` is
   * whole RUPEES and `orders.total` is CENTS, and both were packed into one
   * field called `amount` and rendered as `Rs {amount}` with no division. A
   * Rs 1,710.00 shop order printed as "Rs 171,000" on the money desk — 100x —
   * while the scooter deposit beside it was right, so nothing looked broken.
   * Rupee sources are converted here, at the edge, exactly once.
   */
  amountCents: number | null;
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
  const today = islandToday();

  const [vehicles, activities, orders, cashVehicles, cashPlaces, paidToday] = await Promise.allSettled([
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
      // "approved" too, for the reason given on the vehicle query: since M127
      // a place booking is approved with a pay-by deadline BEFORE the
      // customer sends the transfer, so that is where declarations land.
      .in("status", ["pending", "approved"])
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
    // ── M220 · cash the owner agreed to take by hand ─────────────────────
    // The other half of "has anyone paid?": bookings confirmed as paid in
    // person with money still owed. "Still owed" is a column-to-column
    // comparison PostgREST cannot express, so the in-person rows come back
    // and lib/bookings/in-person.ts decides — the same rule the desk cards
    // and the reminders use.
    supabase
      .from("bookings")
      .select("id, name, scooter, start_date, status, pay_in_person, total_amount, amount_paid")
      .eq("pay_in_person", true)
      .in("status", ["confirmed", "completed"])
      .order("start_date", { ascending: true })
      .limit(1000),
    supabase
      .from("place_bookings")
      .select("id, name, place_name, start_date, status, pay_in_person, deposit_amount, amount_paid")
      .eq("pay_in_person", true)
      .in("status", ["confirmed", "completed"])
      .order("start_date", { ascending: true })
      .limit(1000),
    // What was recorded as received today, island time (the ledger is
    // admin-only; this route is behind the admin session).
    supabase
      .from("booking_payments")
      .select("amount_rupees")
      .gte("received_at", islandDayStartUtc(today))
      .limit(1000),
  ]);

  if (vehicles.status === "fulfilled" && vehicles.value.data) {
    for (const b of vehicles.value.data as Record<string, unknown>[]) {
      rows.push({
        kind: "vehicle",
        id: b.id as string,
        reference: refOf(b.id as string),
        customer: (b.name as string) ?? "—",
        item: (b.scooter as string) ?? null,
        // bookings.deposit_amount is whole rupees — convert at the edge.
        amountCents: rupeesToCents(b.deposit_amount),
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
        // place_bookings.deposit_amount is whole rupees — convert at the edge.
        amountCents: rupeesToCents(b.deposit_amount),
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
        // orders.total is already cents.
        amountCents: typeof o.total === "number" ? o.total : null,
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

  // ── Cash to collect (M220) ────────────────────────────────────────────────
  // WHOLE RUPEES, never converted: this list never shares a field with the
  // cents above, which is exactly how the 100x bug happened last time.
  const cash: CashRow[] = [];
  if (cashVehicles.status === "fulfilled" && cashVehicles.value.data) {
    for (const b of cashVehicles.value.data as (BookingMoney & Record<string, unknown>)[]) {
      const due = cashToCollect("vehicle", b);
      if (!due) continue;
      cash.push({
        kind: "vehicle",
        id: b.id as string,
        reference: refOf(b.id as string),
        customer: (b.name as string) ?? "—",
        // The NAME, not the fleet id ("veh-1788973628068").
        item: (await vehicleName((b.scooter as string) ?? "")) || null,
        startDate: (b.start_date as string) ?? null,
        totalRupees: bookingTotalRupees("vehicle", b),
        paidRupees: amountPaidRupees(b),
        toCollectRupees: due,
        overdue: cashOverdue("vehicle", b, today),
        desk: "Bookings",
      });
    }
  } else if (cashVehicles.status === "rejected") {
    console.error("money: cash rentals failed", cashVehicles.reason);
  }

  if (cashPlaces.status === "fulfilled" && cashPlaces.value.data) {
    for (const b of cashPlaces.value.data as (BookingMoney & Record<string, unknown>)[]) {
      const due = cashToCollect("place", b);
      if (!due) continue;
      cash.push({
        kind: "place",
        id: b.id as string,
        reference: refOf(b.id as string),
        customer: (b.name as string) ?? "—",
        item: (b.place_name as string) ?? null,
        startDate: (b.start_date as string) ?? null,
        totalRupees: bookingTotalRupees("place", b),
        paidRupees: amountPaidRupees(b),
        toCollectRupees: due,
        overdue: cashOverdue("place", b, today),
        desk: "Stay & Activity Bookings",
      });
    }
  } else if (cashPlaces.status === "rejected") {
    console.error("money: cash place bookings failed", cashPlaces.reason);
  }

  // null, not zero, when the ledger could not be read: "Rs 0 today" is an
  // answer, and the server did not give it.
  let paymentsToday: { rupees: number; count: number } | null = null;
  if (paidToday.status === "fulfilled" && !paidToday.value.error) {
    const list = (paidToday.value.data ?? []) as { amount_rupees: number }[];
    paymentsToday = { rupees: list.reduce((s, p) => s + (p.amount_rupees ?? 0), 0), count: list.length };
  } else {
    console.error("money: today's payments failed", paidToday.status === "rejected" ? paidToday.reason : paidToday.value.error);
  }

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

  return NextResponse.json({ rows, escalation, oldestHours, cash: sortCashRows(cash), paymentsToday });
}
