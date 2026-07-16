import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { vehicleName } from "@/lib/vehicle-name";
import {
  sendPickupReminder,
  sendReturnReminder,
  sendFeedbackRequest,
  sendAdminPickupReminder,
  sendAdminReturnReminder,
  sendPlaceReminder,
  sendPlaceFeedbackRequest,
  sendAdminPlaceReminder,
  sendTiRouleMissesDigest,
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
      for (const b of pk) lines.push(`• ${b.name} — ${await vehicleName(b.scooter)}${b.asset_label ? ` (${b.asset_label})` : ""}${b.pickup_time ? ` at ${b.pickup_time}` : ""}${b.phone ? ` — ${b.phone}` : ""}`);
    }
    if (rt.length) {
      lines.push(`↩️ Collect tomorrow (${rt.length}):`);
      for (const b of rt) lines.push(`• ${b.name} — ${await vehicleName(b.scooter)}${b.return_time ? ` at ${b.return_time}` : ""}${b.phone ? ` — ${b.phone}` : ""}`);
    }
    if (ci.length) {
      lines.push(`🌴 Stay·Eat·Do tomorrow (${ci.length}):`);
      for (const b of ci) lines.push(`• ${b.name} — ${b.place_name}${b.time_slot ? ` at ${b.time_slot}` : ""}${b.phone ? ` — ${b.phone}` : ""}`);
    }
    if (lines.length) await sendOwnerWhatsApp(`Roule Rodrigues — tomorrow\n${lines.join("\n")}`);
  } catch {
    /* ignore */
  }

  // ── Weekly (Mondays): email the owner the questions Ti Roulé couldn't answer ──
  let missesEmailed = 0;
  try {
    if (new Date().getUTCDay() === 1) {
      const ownerEmail = process.env.OWNER_EMAIL;
      if (ownerEmail) {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: misses } = await supabase
          .from("lead_events")
          .select("target_name")
          .eq("kind", "tiroule_miss")
          .gte("created_at", weekAgo);
        const counts = new Map<string, number>();
        for (const m of (misses ?? []) as { target_name: string }[]) {
          const q = (m.target_name ?? "").trim();
          if (q) counts.set(q, (counts.get(q) ?? 0) + 1);
        }
        const rows = [...counts.entries()]
          .map(([question, count]) => ({ question, count }))
          .sort((a, b) => b.count - a.count);
        if (rows.length && (await sendTiRouleMissesDigest(ownerEmail, rows))) missesEmailed = rows.length;
      }
    }
  } catch {
    /* ignore */
  }

  // ── Nightly content backup — snapshot site_content when it has changed ──
  let backupSaved = false;
  try {
    const { data: cur } = await supabase.from("site_content").select("data").eq("id", "main").maybeSingle();
    if (cur?.data) {
      const { data: last } = await supabase
        .from("site_content_history")
        .select("data")
        .eq("content_id", "main")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (JSON.stringify(last?.data) !== JSON.stringify(cur.data)) {
        await supabase.from("site_content_history").insert({ content_id: "main", data: cur.data });
        backupSaved = true;
      }
      // Keep ~90 days of history
      const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString();
      await supabase.from("site_content_history").delete().lt("created_at", cutoff90);
    }
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
    missesEmailed,
    backupSaved,
  });
}
