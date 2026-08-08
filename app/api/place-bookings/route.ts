import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { getContent } from "@/lib/content";
import { sendPlaceBookingEmails, upsertBrevoContact } from "@/lib/email";
import { sendOwnerWhatsApp } from "@/lib/whatsapp";
import { guard } from "@/lib/rate-limit";
import { isActiveHold } from "@/lib/holds";
import { isValidPhone, isValidEmail } from "@/lib/phone";

// ── Public: create a Stay·Eat·Do reservation request + confirmation emails ──
// Category-aware capacity:
//   • hotel      → counts rooms (quantity) per night vs total rooms
//   • restaurant → counts covers (quantity) per date + time slot vs seats/slot
//   • activity   → counts people (quantity) per date (+ slot) vs spots
export async function POST(req: NextRequest) {
  const limited = guard(req, "place-bookings", 8, 60_000);
  if (limited) return limited;

  let body: {
    place_id?: string;
    place_name?: string;
    name?: string;
    email?: string | null;
    phone?: string | null;
    start_date?: string;
    end_date?: string;
    guests?: number | null;
    quantity?: number | null;
    time_slot?: string | null;
    message?: string | null;
    arrival?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const place_id = (body.place_id ?? "").trim();
  const name = (body.name ?? "").trim();
  const start_date = (body.start_date ?? "").trim();

  if (!place_id || !name || !start_date) {
    return NextResponse.json({ error: "Missing required reservation details." }, { status: 400 });
  }

  const phone = (body.phone ?? "").toString().trim();
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
  }
  const email = (body.email ?? "").toString().trim();
  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // Resolve the listing for a trusted name/category/capacity/slots.
  let place_name = (body.place_name ?? place_id).toString().slice(0, 160);
  let category: string | null = null;
  let capacity = 1;
  let slots: string[] = [];
  // Owner-set deposit (Rs) to reserve. Resolved server-side from the listing so
  // the client can never lower it. >0 → deposit-to-confirm (PayPal/bank); 0 →
  // request-only (unchanged behaviour). Flat per reservation, like a hold fee.
  let depositAmount = 0;
  try {
    const content = await getContent();
    const item = content.recommended.items.find((p) => p.id === place_id);
    if (item) {
      place_name = item.name;
      category = item.category;
      capacity = Math.max(1, item.capacity ?? 1);
      slots = Array.isArray(item.timeSlots) ? item.timeSlots : [];
      depositAmount = Number.isFinite(Number(item.depositAmount))
        ? Math.max(0, Math.round(Number(item.depositAmount)))
        : 0;
    }
  } catch {
    /* fall back to provided name */
  }

  const isStay = category === "hotel";
  // Hotels book a date range; restaurants/activities a single day.
  const end_date = isStay ? (body.end_date ?? "").trim() || start_date : start_date;

  // A time slot is required for restaurants/activities that define slots.
  const time_slot =
    !isStay && slots.length > 0
      ? (body.time_slot ?? "").toString().trim().slice(0, 40) || null
      : null;
  if (!isStay && slots.length > 0 && !time_slot) {
    return NextResponse.json({ error: "Please choose a time." }, { status: 400 });
  }

  // quantity = rooms (hotel) / covers (restaurant) / people (activity)
  const quantity = Math.min(
    capacity,
    Math.max(1, Number.isFinite(Number(body.quantity)) ? Math.round(Number(body.quantity)) : 1),
  );

  const guests =
    Number.isFinite(Number(body.guests)) && Number(body.guests) > 0
      ? Math.min(99, Math.round(Number(body.guests)))
      : null;

  // Stays: capture when/how the guest arrives (there was no way to know before).
  // Folded into the stored message so the owner email + record both carry it.
  const arrival = (body.arrival ?? "").toString().trim().slice(0, 200);
  const message =
    [arrival ? `Arrival: ${arrival}` : "", (body.message ?? "").toString().trim()].filter(Boolean).join("\n") || null;

  // Generate the id server-side (anon can't SELECT rows, so INSERT…RETURNING
  // would trip the RLS SELECT policy — same lesson as vehicle bookings). This
  // lets us hand the id straight back for the PayPal deposit.
  const id = crypto.randomUUID();
  const deposit_amount = depositAmount > 0 ? depositAmount : null;
  const record = {
    id,
    place_id: place_id.slice(0, 80),
    place_name,
    category,
    name: name.slice(0, 120),
    email: email || null,
    phone,
    start_date,
    end_date,
    guests,
    quantity,
    time_slot,
    message,
    deposit_amount,
    status: "pending" as const,
  };

  const supabase = await getPrivileged();

  // Capacity-aware guard (sums quantity, not booking count).
  try {
    const { data: active } = await supabase
      .from("place_bookings")
      .select("start_date, end_date, status, created_at, quantity, time_slot, deposit_paid_at, deposit_amount")
      .eq("place_id", place_id)
      .in("status", ["pending", "confirmed"])
      .gte("end_date", start_date)
      .lte("start_date", end_date);
    const rows = ((active ?? []) as {
      start_date: string; end_date: string; status: string; created_at: string; quantity: number; time_slot: string | null; deposit_paid_at: string | null; deposit_amount: number | null;
    }[]).filter((r) => isActiveHold(r));

    if (isStay) {
      // Rooms used must not exceed total rooms on any night of the stay.
      const usedOn = (day: string) =>
        rows.reduce((n, r) => (day >= r.start_date && day <= r.end_date ? n + (r.quantity ?? 1) : n), 0);
      for (let d = new Date(start_date); d <= new Date(end_date); d.setDate(d.getDate() + 1)) {
        const day = d.toISOString().slice(0, 10);
        if (usedOn(day) + quantity > capacity) {
          return NextResponse.json(
            { error: "Not enough rooms left for those dates. Please adjust your dates or rooms." },
            { status: 409 },
          );
        }
      }
    } else {
      // Covers/spots used for this date (and slot, if any) must fit capacity.
      const used = rows.reduce(
        (n, r) => (r.start_date === start_date && (r.time_slot ?? null) === time_slot ? n + (r.quantity ?? 1) : n),
        0,
      );
      if (used + quantity > capacity) {
        return NextResponse.json(
          { error: "That date/time is fully booked. Please pick another." },
          { status: 409 },
        );
      }
    }
  } catch {
    /* never block a reservation on the guard */
  }

  const { error } = await supabase.from("place_bookings").insert([record]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Booking reference (RR-XXXXXX, derived from the id) — one format everywhere,
  // shown in the confirmation email and used by the guest Manage-Booking lookup.
  const bookingRef = "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

  try {
    await sendPlaceBookingEmails({ ...record, ref: bookingRef });
  } catch {
    /* ignore email failures */
  }

  // Sync into Brevo so the owner's automations can fire.
  //
  // TRANSACTIONAL, explicitly (M41). Covers BOTH accommodation and activities —
  // they share this route and the place_bookings table. Reserving a room or a
  // boat trip is not consent to be marketed to; see app/api/bookings/route.ts
  // for the same reasoning on vehicles.
  if (record.email) {
    try {
      await upsertBrevoContact({
        list: "transactional",
        email: record.email,
        firstName: record.name.split(/\s+/)[0],
        phone: record.phone,
        vehicle: record.place_name,
        bookingId: bookingRef,
        pickupDate: record.start_date,
        pickupTime: record.time_slot,
        returnDate: record.end_date,
      });
    } catch {
      /* best-effort */
    }
  }

  // Free owner WhatsApp alert (CallMeBot) — owner only, best-effort
  try {
    await sendOwnerWhatsApp(
      `🌴 New reservation\n${record.name} — ${record.place_name}` +
        `\n${record.start_date}` +
        (record.time_slot ? ` · ${record.time_slot}` : "") +
        (record.guests ? ` · ${record.guests} guests` : "") +
        (arrival ? `\n🛬 Arrival: ${arrival}` : "") +
        (record.phone ? `\n📞 ${record.phone}` : ""),
    );
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, bookingId: id, depositAmount: deposit_amount, placeName: record.place_name });
}
