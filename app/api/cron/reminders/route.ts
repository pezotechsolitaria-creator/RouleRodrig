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

  // ── Warn BEFORE the reservation lapses ────────────────────────────────
  // Every other message about the hold reports something already decided. This
  // is the only one sent while the customer can still act on it, and it is the
  // reason a guest-specific short expiry was rejected: an unpaid order is far
  // more often a forgotten one than an abusive one, and a reminder recovers the
  // sale where a shorter clock only loses it faster.
  //
  // BANK TRANSFER ONLY, deliberately. A cash customer owes nothing until
  // handover (M13) — chasing them for money that is not due is the exact false
  // alarm lib/orders/hold.ts exists to avoid. For cash, inaction is the
  // MERCHANT'S, and they already hold the order in their dashboard.
  let paymentRemindersSent = 0;
  try {
    const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const { data: dueSoon } = await supabase
      .from("orders")
      .select("id, payments(provider)")
      .eq("status", "pending_payment")
      .is("accepted_at", null)
      .is("expiry_reminded_at", null)
      .not("auto_release_at", "is", null)
      .gt("auto_release_at", new Date().toISOString())
      .lt("auto_release_at", soon)
      .limit(200);

    for (const o of (dueSoon ?? []) as { id: string; payments: { provider: string }[] | null }[]) {
      if (!(o.payments ?? []).some((p) => p.provider === "bank_transfer")) continue;
      // Stamp FIRST. A send that fails is one lost reminder; a stamp that fails
      // after a successful send is the same customer emailed every day until
      // the order expires, which is worse than silence.
      const { error: stampError } = await supabase
        .from("orders")
        .update({ expiry_reminded_at: new Date().toISOString() })
        .eq("id", o.id)
        .is("expiry_reminded_at", null);
      if (stampError) {
        console.error("expiry reminder stamp failed", o.id, stampError);
        continue;
      }
      try {
        if (await notifyOrderCustomer(o.id, "payment_due")) paymentRemindersSent++;
      } catch (err) {
        console.error("payment reminder failed", o.id, err);
      }
    }
  } catch (err) {
    console.error("payment reminder pass failed", err);
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

  // ── Email quota check (M41) ───────────────────────────────────────────
  // The router alerts as it crosses a threshold mid-send, which catches a busy
  // day as it happens. This pass catches the cases a send-time hook structurally
  // cannot: a month that is nearly spent while today is quiet, a provider whose
  // credentials broke since the last email, and a ticketing reserve that became
  // insufficient because an event went on sale rather than because mail was sent.
  let emailQuotaLevel: Record<string, string> = {};
  try {
    const { getEmailConfig } = await import("@/lib/email/config");
    const { getProviderUsage, getReserveState } = await import("@/lib/email/quota");
    const { alertQuotaLevel, alertReserveInsufficient } = await import("@/lib/email/alerts");
    const cfg = await getEmailConfig();
    const [resendUsage, brevoUsage, reserve] = await Promise.all([
      getProviderUsage("resend", cfg),
      getProviderUsage("brevo", cfg),
      getReserveState(cfg),
    ]);
    emailQuotaLevel = {
      resend: resendUsage.configured ? resendUsage.level : "unconfigured",
      brevo: brevoUsage.configured ? brevoUsage.level : "unconfigured",
    };
    // Both alerts are throttled to once per level per UTC day, so a persistent
    // warning does not become a daily nag the owner learns to ignore.
    for (const u of [resendUsage, brevoUsage]) {
      if (u.configured) await alertQuotaLevel(u);
    }
    await alertReserveInsufficient(reserve);
  } catch (err) {
    console.error("email quota check failed", err);
  }

  // ── Food day reset — the SAFETY NET, not the primary path ──────────────
  // Every dish goes back to its daily_capacity and yesterday's "sold out for
  // today" marks clear. Without something doing this, the first dish that ran
  // out yesterday is still sold out this morning and nobody notices — the
  // platform just quietly stops selling its best plate.
  //
  // TIMING, HONESTLY: this cron runs at 06:00 UTC, which is 10:00 in Rodrigues
  // — too late to be the reset that opens the day, and breakfast would already
  // have been unbuyable for hours. It is NOT moved earlier, because this same
  // run drives the pickup/return reminder emails whose timing is deliberate,
  // and a second cron entry is what broke the last deploy (see the revert in
  // the history above this file's lifetime).
  //
  // So the PRIMARY reset is the operator pressing "Start the day" in
  // /admin/food when the kitchens actually open — which is also the more
  // truthful model, since a kitchen's day starts when the cooker arrives, not
  // at a fixed hour. This run is what covers the morning nobody pressed it.
  //
  // food_restock_day() moves stock through the inventory ledger rather than
  // writing stock_quantity, so the count stays auditable, and it is idempotent:
  // running it after the operator already did changes nothing. A failure here
  // must never take the reminder emails down with it.
  let dishesRestocked = 0;
  try {
    const { data, error } = await supabase.rpc("food_restock_day", { p_store_id: null });
    if (error) console.error("food_restock_day failed", error);
    else dishesRestocked = (data as number) ?? 0;
  } catch (err) {
    console.error("food_restock_day threw", err);
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
      paymentRemindersSent,
      missesEmailed,
      dishesRestocked,
      backupSaved,
      emailFailures,
      emailQuotaLevel,
    },
    // Non-2xx when mail went undelivered, so the run shows up red in Vercel's
    // cron log. `ok: true` regardless of outcome meant the only signal that
    // customers had stopped receiving reminders was a customer complaining.
    { status: ok ? 200 : 500 },
  );
}
