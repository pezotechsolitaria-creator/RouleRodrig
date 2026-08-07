import { NextRequest, NextResponse } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/cron-auth";
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
import { notifyOrderCustomer } from "@/lib/notifications/order-events";

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
  // Requires CRON_SECRET (Vercel Cron sends it automatically). Fails CLOSED when
  // it is unset — see lib/cron-auth.ts for why that matters here specifically.
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Without a service-role key getPrivileged() quietly degrades to the anon
  // client, RLS then hides every booking, and this job reports a cheerful
  // "0 reminders sent" while doing nothing at all — the worst kind of failure,
  // because the dashboard looks healthy. Refuse instead.
  if (!hasServiceRole()) {
    return NextResponse.json(
      { ok: false, error: "Not configured: SUPABASE_SERVICE_ROLE_KEY is required for the reminder job." },
      { status: 503 },
    );
  }

  const today = islandDate(0);
  const tomorrow = islandDate(1);
  const yesterday = islandDate(-1);
  const supabase = await getPrivileged();

  let pickupSent = 0;
  let returnSent = 0;
  let feedbackSent = 0;
  let holdsReleased = 0;
  // Sends that were attempted and failed. Reported, and turns the run red — a
  // job that silently swallows delivery failures is indistinguishable from one
  // with nothing to do.
  let emailFailures = 0;

  // ── Pickups tomorrow → remind the customer and the owner ──
  const { data: pickups } = await supabase
    .from("bookings")
    .select("*")
    .eq("start_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .eq("pickup_reminded", false);

  for (const b of (pickups ?? []) as Booking[]) {
    const sent = b.email ? await sendPickupReminder(b) : false;
    if (sent) pickupSent++;
    await sendAdminPickupReminder(b);
    // Only record "reminded" when we actually reminded them. Flagging a failed
    // send buries it for good: the row drops out of tomorrow's query and that
    // customer simply never hears from us. Having no address on file is a real
    // end state, so that still flags.
    if (sent || !b.email) {
      await supabase.from("bookings").update({ pickup_reminded: true }).eq("id", b.id);
    } else {
      emailFailures++;
    }
  }

  // ── Returns tomorrow → remind the customer and the owner (day before) ──
  const { data: returns } = await supabase
    .from("bookings")
    .select("*")
    .eq("end_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .eq("return_reminded", false);

  for (const b of (returns ?? []) as Booking[]) {
    const sent = b.email ? await sendReturnReminder(b) : false;
    if (sent) returnSent++;
    await sendAdminReturnReminder(b);
    if (sent || !b.email) {
      await supabase.from("bookings").update({ return_reminded: true }).eq("id", b.id);
    } else {
      emailFailures++;
    }
  }

  // ── Feedback request the day after the return ──
  const { data: feedbacks } = await supabase
    .from("bookings")
    .select("*")
    .eq("end_date", yesterday)
    .in("status", ["confirmed", "completed"])
    .eq("feedback_reminded", false);

  for (const b of (feedbacks ?? []) as Booking[]) {
    const sent = b.email ? await sendFeedbackRequest(b) : false;
    if (sent) feedbackSent++;
    if (sent || !b.email) {
      await supabase.from("bookings").update({ feedback_reminded: true }).eq("id", b.id);
    } else {
      emailFailures++;
    }
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

  // ── Release expired MARKETPLACE orders ────────────────────────────────
  // Both parties are shown a hard deadline — the customer reads "your items
  // are reserved until X" (lib/orders/hold.ts) and the merchant "confirm
  // within X or the stock returns to your shelf". Nothing enforced it: the
  // only sweep lived inside create_order() and covered only the variants
  // somebody else happened to be buying right now, so a lapsed reservation on
  // an unpopular item held its stock indefinitely and the deadline was a
  // promise the system could not keep. This makes it real, once a day.
  let ordersExpired = 0;
  try {
    const { data: lapsed } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "pending_payment")
      .is("accepted_at", null)
      .not("auto_release_at", "is", null)
      .lt("auto_release_at", new Date().toISOString())
      .limit(200);

    for (const o of (lapsed ?? []) as { id: string }[]) {
      // expire_order() cancels the order and returns its reserved stock in one
      // transaction; the route only decides WHICH orders are due.
      const { error } = await supabase.rpc("expire_order", { p_order_id: o.id });
      if (error) {
        console.error("expire_order failed", o.id, error);
        continue;
      }
      ordersExpired++;
      // Expiry was the one lifecycle event that reached the customer through
      // no channel at all. Best-effort — a failed email must not stop the sweep.
      try {
        await notifyOrderCustomer(o.id, "expired");
      } catch (err) {
        console.error("expiry notification failed", o.id, err);
      }
    }
  } catch (err) {
    console.error("orders expiry sweep failed", err);
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
    const sent = b.email ? await sendPlaceReminder(b) : false;
    if (sent) placeRemindersSent++;
    await sendAdminPlaceReminder(b);
    if (sent || !b.email) {
      await supabase.from("place_bookings").update({ reminded: true }).eq("id", b.id);
    } else {
      emailFailures++;
    }
  }

  const { data: placeDone } = await supabase
    .from("place_bookings")
    .select("*")
    .eq("end_date", yesterday)
    .in("status", ["confirmed", "completed"])
    .eq("feedback_reminded", false);
  for (const b of (placeDone ?? []) as PlaceBooking[]) {
    const sent = b.email ? await sendPlaceFeedbackRequest(b) : false;
    if (sent) placeFeedbackSent++;
    if (sent || !b.email) {
      await supabase.from("place_bookings").update({ feedback_reminded: true }).eq("id", b.id);
    } else {
      emailFailures++;
    }
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

  const ok = emailFailures === 0;
  return NextResponse.json(
    {
      ok,
      date: today,
      pickupEmailsSent: pickupSent,
      returnEmailsSent: returnSent,
      feedbackEmailsSent: feedbackSent,
      placeRemindersSent,
      placeFeedbackSent,
      holdsReleased,
      ordersExpired,
      missesEmailed,
      backupSaved,
      emailFailures,
    },
    // Non-2xx when mail went undelivered, so the run shows up red in Vercel's
    // cron log. `ok: true` regardless of outcome meant the only signal that
    // customers had stopped receiving reminders was a customer complaining.
    { status: ok ? 200 : 500 },
  );
}
