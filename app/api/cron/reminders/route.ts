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
  brevoRemindersEnabled,
} from "@/lib/email";
import type { Booking, PlaceBooking } from "@/lib/supabase/types";
import { holdCutoffMs } from "@/lib/holds";
import { sendOwnerWhatsApp } from "@/lib/whatsapp";

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

  // When Brevo automations handle the customer pickup/return reminders, skip
  // the built-in customer emails (owner alerts still fire) to avoid duplicates.
  const brevoReminders = await brevoRemindersEnabled();

  // ── Pickups tomorrow → remind the customer and the owner ──
  const { data: pickups } = await supabase
    .from("bookings")
    .select("*")
    .eq("start_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .eq("pickup_reminded", false);

  for (const b of (pickups ?? []) as Booking[]) {
    if (!brevoReminders && b.email && (await sendPickupReminder(b))) pickupSent++;
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
    if (!brevoReminders && b.email && (await sendReturnReminder(b))) returnSent++;
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

  // ── Release abandoned holds ──
  // A pending request is cancelled once it's older than the expiry window
  // (default 48h, HOLD_EXPIRY_HOURS) OR its pickup day has already passed.
  const holdCutoff = holdCutoffMs();
  const { data: stale } = await supabase
    .from("bookings")
    .select("id, start_date, created_at")
    .eq("status", "pending");

  for (const b of (stale ?? []) as { id: string; start_date: string; created_at: string }[]) {
    const expired = new Date(b.created_at).getTime() < holdCutoff || b.start_date < today;
    if (!expired) continue;
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
    .select("id, start_date, created_at")
    .eq("status", "pending");
  for (const b of (placeStale ?? []) as { id: string; start_date: string; created_at: string }[]) {
    const expired = new Date(b.created_at).getTime() < holdCutoff || b.start_date < today;
    if (!expired) continue;
    await supabase.from("place_bookings").update({ status: "cancelled" }).eq("id", b.id);
    holdsReleased++;
  }

  // ── One daily WhatsApp digest to the owner (CallMeBot — owner only) ──
  try {
    const lines: string[] = [];
    const pk = (pickups ?? []) as Booking[];
    const rt = (returns ?? []) as Booking[];
    const ci = (placeSoon ?? []) as PlaceBooking[];
    if (pk.length) {
      lines.push(`🛵 Deliver tomorrow (${pk.length}):`);
      for (const b of pk) lines.push(`• ${b.name} — ${b.scooter}${b.asset_label ? ` (${b.asset_label})` : ""}${b.pickup_time ? ` at ${b.pickup_time}` : ""}${b.phone ? ` — ${b.phone}` : ""}`);
    }
    if (rt.length) {
      lines.push(`↩️ Collect tomorrow (${rt.length}):`);
      for (const b of rt) lines.push(`• ${b.name} — ${b.scooter}${b.return_time ? ` at ${b.return_time}` : ""}${b.phone ? ` — ${b.phone}` : ""}`);
    }
    if (ci.length) {
      lines.push(`🌴 Stay·Eat·Do tomorrow (${ci.length}):`);
      for (const b of ci) lines.push(`• ${b.name} — ${b.place_name}${b.time_slot ? ` at ${b.time_slot}` : ""}${b.phone ? ` — ${b.phone}` : ""}`);
    }
    if (lines.length) await sendOwnerWhatsApp(`Roule Rodrigues — tomorrow\n${lines.join("\n")}`);
  } catch {
    /* ignore */
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
