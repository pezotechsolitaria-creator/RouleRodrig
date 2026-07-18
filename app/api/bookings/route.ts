import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { getContent } from "@/lib/content";
import { sendBookingEmails, upsertBrevoContact } from "@/lib/email";
import { sendOwnerWhatsApp } from "@/lib/whatsapp";
import { guard } from "@/lib/rate-limit";
import { isActiveHold } from "@/lib/holds";
import { isValidPhone, isValidEmail } from "@/lib/phone";

// Owner-friendly date for the WhatsApp alert: 2026-01-01 → 01/JAN/2026.
const WA_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function waDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${WA_MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}
// Days booked between two ISO dates (same-day pickup/return counts as 1).
function bookedDays(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.max(1, Math.round((b - a) / 86400000));
}

// ── Public: create a booking request + send confirmation emails ─────
export async function POST(req: NextRequest) {
  // 8 booking requests per minute per IP
  const limited = guard(req, "bookings", 8, 60_000);
  if (limited) return limited;

  let body: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    scooter?: string;
    start_date?: string;
    end_date?: string;
    pickup_time?: string | null;
    return_time?: string | null;
    days?: number;
    total_price?: string | null;
    total_amount?: number | null;
    delivery_fee?: number | null;
    message?: string | null;
    partner_code?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Validation
  const name = (body.name ?? "").trim();
  const scooter = (body.scooter ?? "").trim();
  const start_date = (body.start_date ?? "").trim();
  const end_date = (body.end_date ?? "").trim();
  const days = Number(body.days);

  if (!name || !scooter || !start_date || !end_date || !Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "Missing required booking details." }, { status: 400 });
  }

  // A valid, reachable phone is required (blocks typos + fake/troll numbers)
  const phone = (body.phone ?? "").toString().trim();
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
  }
  const email = (body.email ?? "").toString().trim();
  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // ── Resolve the fleet model for capacity + asset tracking ──
  let units = 1;
  let activeAssets: { id: string; label: string; color?: string }[] = [];
  // The booking form posts the fleet ID ("burgman"), and the DB column must keep
  // it — availability and asset assignment match on it. But customers must never
  // see an internal slug, so emails/WhatsApp use the display name instead.
  let scooterName = scooter;
  try {
    const content = await getContent();
    const item = content.fleet.find((f) => f.id === scooter || f.name === scooter);
    if (item?.name) scooterName = item.name;
    activeAssets = (item?.assets ?? [])
      .filter((a) => a.active !== false)
      .map((a) => ({ id: a.id, label: a.label, color: a.color }));
    // Capacity = number of physical units (assets) if tracked, else the unit count.
    units = activeAssets.length > 0 ? activeAssets.length : Math.max(1, item?.units ?? 1);
  } catch {
    /* fall back to 1 unit */
  }

  let asset_id: string | null = null;
  let asset_label: string | null = null;

  // ── Double-booking guard + auto-assign a free physical unit ──
  try {
    const priv = await getPrivileged();
    const { data: active } = await priv
      .from("bookings")
      .select("start_date, end_date, status, created_at, asset_id")
      .eq("scooter", scooter)
      .in("status", ["pending", "confirmed"])
      .gte("end_date", start_date)
      .lte("start_date", end_date);
    const ranges = ((active ?? []) as { start_date: string; end_date: string; status: string; created_at: string; asset_id: string | null }[])
      .filter((r) => isActiveHold(r));
    const heldOn = (day: string) =>
      ranges.reduce((n, r) => (day >= r.start_date && day <= r.end_date ? n + 1 : n), 0);
    for (let d = new Date(start_date); d <= new Date(end_date); d.setDate(d.getDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      if (heldOn(day) >= units) {
        return NextResponse.json(
          { error: "Those dates were just taken. Please pick another range." },
          { status: 409 },
        );
      }
    }
    // Assign the first physical unit that isn't already taken for these dates.
    if (activeAssets.length > 0) {
      const busy = new Set(ranges.map((r) => r.asset_id).filter(Boolean) as string[]);
      const free = activeAssets.find((a) => !busy.has(a.id));
      if (free) {
        asset_id = free.id;
        asset_label = free.color ? `${free.label} · ${free.color}` : free.label;
      }
    }
  } catch {
    /* if the check fails, don't block the booking */
  }

  const record = {
    name: name.slice(0, 120),
    email: email || null,
    phone,
    scooter: scooter.slice(0, 120),
    start_date,
    end_date,
    pickup_time: (body.pickup_time ?? "")?.toString().trim().slice(0, 10) || null,
    return_time: (body.return_time ?? "")?.toString().trim().slice(0, 10) || null,
    days,
    total_price: body.total_price ?? null,
    total_amount: body.total_amount ?? null,
    // Delivery fee (scooter = Rs 400, car = 0). Trust it only if it's a sane
    // non-negative integer; otherwise store null rather than a bad value.
    delivery_fee:
      typeof body.delivery_fee === "number" && Number.isFinite(body.delivery_fee) && body.delivery_fee >= 0
        ? Math.round(body.delivery_fee)
        : null,
    message: (body.message ?? "")?.toString().trim() || null,
    status: "pending" as const,
    partner_code: (body.partner_code ?? "")?.toString().trim().toUpperCase() || null,
    asset_id,
    asset_label,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("bookings").insert([record]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire emails — never block or fail the booking on email errors
  try {
    await sendBookingEmails({ ...record, scooter: scooterName });
  } catch {
    /* ignore email failures */
  }

  // Sync the customer into Brevo (contact + list) with full booking details so
  // the owner's Brevo automations — confirmation, instructions, pre-trip
  // reminder, return reminder — render real data. Best-effort.
  if (record.email) {
    try {
      const bookingRef = "RR-" + Date.now().toString(36).toUpperCase().slice(-6);
      await upsertBrevoContact({
        email: record.email,
        firstName: record.name.split(/\s+/)[0],
        phone: record.phone,
        vehicle: scooterName,
        bookingId: bookingRef,
        pickupDate: record.start_date,
        pickupTime: record.pickup_time,
        returnDate: record.end_date,
        returnTime: record.return_time,
      });
    } catch {
      /* best-effort */
    }
  }

  // Free owner WhatsApp alert (CallMeBot) — owner only, best-effort
  try {
    const nights = bookedDays(record.start_date, record.end_date);
    await sendOwnerWhatsApp(
      `🛵 New booking\n${record.name} — ${scooterName}` +
        (record.asset_label ? ` (${record.asset_label})` : "") +
        `\n${waDate(record.start_date)} → ${waDate(record.end_date)}` +
        (nights ? ` (${nights} ${nights === 1 ? "day" : "days"})` : "") +
        (record.pickup_time ? `\n🕘 Pickup ${record.pickup_time}` : "") +
        (typeof record.total_amount === "number"
          ? `\n💰 Rs ${Math.round(record.total_amount).toLocaleString("en-US")}`
          : record.total_price
            ? `\n💰 ${record.total_price}`
            : "") +
        (record.phone ? `\n📞 ${record.phone}` : ""),
    );
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}
