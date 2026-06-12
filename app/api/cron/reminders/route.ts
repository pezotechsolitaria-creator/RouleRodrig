import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPickupReminder, sendReturnReminder } from "@/lib/email";
import type { Booking } from "@/lib/supabase/types";

// Runs once a day (Vercel Cron). Sends "pickup tomorrow" and "return today"
// reminder emails, and marks each booking so it's never reminded twice.

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
  const supabase = await createClient();

  let pickupSent = 0;
  let returnSent = 0;

  // ── Pickups tomorrow ──
  const { data: pickups } = await supabase
    .from("bookings")
    .select("*")
    .eq("start_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .eq("pickup_reminded", false);

  for (const b of (pickups ?? []) as Booking[]) {
    if (b.email) {
      const ok = await sendPickupReminder(b);
      if (ok) pickupSent++;
    }
    await supabase.from("bookings").update({ pickup_reminded: true }).eq("id", b.id);
  }

  // ── Returns today ──
  const { data: returns } = await supabase
    .from("bookings")
    .select("*")
    .eq("end_date", today)
    .in("status", ["pending", "confirmed"])
    .eq("return_reminded", false);

  for (const b of (returns ?? []) as Booking[]) {
    if (b.email) {
      const ok = await sendReturnReminder(b);
      if (ok) returnSent++;
    }
    await supabase.from("bookings").update({ return_reminded: true }).eq("id", b.id);
  }

  return NextResponse.json({
    ok: true,
    date: today,
    pickupsProcessed: pickups?.length ?? 0,
    returnsProcessed: returns?.length ?? 0,
    pickupEmailsSent: pickupSent,
    returnEmailsSent: returnSent,
  });
}
