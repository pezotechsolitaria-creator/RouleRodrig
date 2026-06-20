import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import {
  sendPickupReminder,
  sendReturnReminder,
  sendFeedbackRequest,
  sendAdminPickupReminder,
  sendAdminReturnReminder,
  sendPlaceReminder,
  sendPlaceFeedbackRequest,
  sendAdminPlaceReminder,
} from "@/lib/email";
import type { Booking, PlaceBooking } from "@/lib/supabase/types";

// Runs once a day (Vercel Cron). Drives the booking "bots":
//  • Customer: pickup reminder (day before), return reminder (day before),
//    feedback request (day after return).
//  • Owner: deliver-tomorrow and collect-tomorrow alerts.
//  • Housekeeping: releases abandoned holds (pending requests whose pickup
//    day has already passed without being confirmed).
// Each booking is flagged so it's never reminded twice.

// Rodrigues is UTC+4 — compute dates in island local time.
function islandDate(offsetDays = 0): string {
  const now = new Date(Date.now() + 4 * 3600 * 1000 + offsetDays * 86400000);
  return now.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  // If CRON_SECRET is configured, require it (Vercel Cron sends it automatically)
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = islandDate(0);
  const tomorrow = islandDate(1);
  const yesterday = islandDate(-1);
  const supabase = await getPrivileged();

  let pickupSent = 0;
  let returnSent = 0;
  let feedbackSent = 0;
  let holdsReleased = 0;

  // ── Pickups tomorrow → remind the customer and the owner ──
  const { data: pickups } = await supabase
    .from("bookings")
    .select("*")
    .eq("start_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .eq("pickup_reminded", false);

  for (const b of (pickups ?? []) as Booking[]) {
    if (b.email && (await sendPickupReminder(b))) pickupSent++;
    await sendAdminPickupReminder(b);
    await supabase.from("bookings").update({ pickup_reminded: true }).eq("id", b.id);
  }

  // ── Returns tomorrow → remind the customer and the owner (day before) ──
  const { data: returns } = await supabase
    .from("bookings")
    .select("*")
    .eq("end_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .eq("return_reminded", false);

  for (const b of (returns ?? []) as Booking[]) {
    if (b.email && (await sendReturnReminder(b))) returnSent++;
    await sendAdminReturnReminder(b);
    await supabase.from("bookings").update({ return_reminded: true }).eq("id", b.id);
  }

  // ── Feedback request the day after the return ──
  const { data: feedbacks } = await supabase
    .from("bookings")
    .select("*")
    .eq("end_date", yesterday)
    .in("status", ["confirmed", "completed"])
    .eq("feedback_reminded", false);

  for (const b of (feedbacks ?? []) as Booking[]) {
    if (b.email && (await sendFeedbackRequest(b))) feedbackSent++;
    await supabase.from("bookings").update({ feedback_reminded: true }).eq("id", b.id);
  }

  // ── Release abandoned holds: still "pending" but the pickup day has passed ──
  const { data: stale } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "pending")
    .lt("start_date", today);

  for (const b of (stale ?? []) as { id: string }[]) {
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
    holdsReleased++;
  }

  // ── Stay·Eat·Do reservations: same bot treatment ──────────────────────
  let placeRemindersSent = 0;
  let placeFeedbackSent = 0;

  const { data: placeSoon } = await supabase
    .from("place_bookings")
    .select("*")
    .eq("start_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .eq("reminded", false);
  for (const b of (placeSoon ?? []) as PlaceBooking[]) {
    if (b.email && (await sendPlaceReminder(b))) placeRemindersSent++;
    await sendAdminPlaceReminder(b);
    await supabase.from("place_bookings").update({ reminded: true }).eq("id", b.id);
  }

  const { data: placeDone } = await supabase
    .from("place_bookings")
    .select("*")
    .eq("end_date", yesterday)
    .in("status", ["confirmed", "completed"])
    .eq("feedback_reminded", false);
  for (const b of (placeDone ?? []) as PlaceBooking[]) {
    if (b.email && (await sendPlaceFeedbackRequest(b))) placeFeedbackSent++;
    await supabase.from("place_bookings").update({ feedback_reminded: true }).eq("id", b.id);
  }

  const { data: placeStale } = await supabase
    .from("place_bookings")
    .select("id")
    .eq("status", "pending")
    .lt("start_date", today);
  for (const b of (placeStale ?? []) as { id: string }[]) {
    await supabase.from("place_bookings").update({ status: "cancelled" }).eq("id", b.id);
    holdsReleased++;
  }

  return NextResponse.json({
    ok: true,
    date: today,
    pickupEmailsSent: pickupSent,
    returnEmailsSent: returnSent,
    feedbackEmailsSent: feedbackSent,
    placeRemindersSent,
    placeFeedbackSent,
    holdsReleased,
  });
}
