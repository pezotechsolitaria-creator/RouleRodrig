import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { getContent } from "@/lib/content";
import { sendBookingEmails, upsertBrevoContact } from "@/lib/email";
import { enqueueNotification } from "@/lib/notifications/queue";
import { guardShared } from "@/lib/rate-limit";
import { isActiveHold, HOLDING_STATUSES } from "@/lib/holds";
import { isValidPhone, isValidEmail } from "@/lib/phone";
import {
  priceBreakdown,
  rentalDays,
  validateRentalWindow,
} from "@/lib/booking-pricing";
import {
  blocksOverlapping,
  blockedOn,
  blockedAssetIds,
} from "@/lib/availability/blocks";

// Owner-friendly date for the WhatsApp alert: 2026-01-01 → 01/JAN/2026.
const WA_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
function waDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${WA_MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}
// ── Public: create a booking request + send confirmation emails ─────
export async function POST(req: NextRequest) {
  // 8 booking requests per minute per IP
  const limited = await guardShared(req, "bookings", 8, 60_000);
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

  if (!name || !scooter || !start_date || !end_date) {
    return NextResponse.json(
      { error: "Missing required booking details." },
      { status: 400 },
    );
  }
  // The window is validated and the day count derived HERE — a client cannot
  // book the past, a malformed string, or a year-long hold, and cannot lie
  // about the rental length the price is computed from.
  const windowError = validateRentalWindow(start_date, end_date);
  if (windowError) {
    return NextResponse.json({ error: windowError }, { status: 400 });
  }
  const days = rentalDays(start_date, end_date);

  // A valid, reachable phone is required (blocks typos + fake/troll numbers)
  const phone = (body.phone ?? "").toString().trim();
  if (!isValidPhone(phone)) {
    return NextResponse.json(
      { error: "A valid phone number is required." },
      { status: 400 },
    );
  }
  const email = (body.email ?? "").toString().trim();
  if (email && !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  // ── Resolve the fleet model for capacity + asset tracking ──
  let units = 1;
  let activeAssets: { id: string; label: string; color?: string }[] = [];
  // The booking form posts the fleet ID ("burgman"), and the DB column must keep
  // it — availability and asset assignment match on it. But customers must never
  // see an internal slug, so emails/WhatsApp use the display name instead.
  let scooterName = scooter;
  // The resolved fleet item is ALSO the price authority: every rupee stored on
  // this booking is recomputed from it below, never taken from the client.
  // `id` is needed as well as the price fields: it is the canonical value
  // stored on the booking, and every capacity query matches on it.
  let fleetItem: { id: string; price: string; category?: string } | undefined;
  // Delivery is priced from the owner's categories, not a constant. Declared
  // out here because the resolution below is inside a try: leaving it in scope
  // there would mean a content read that half-failed still priced the rental,
  // silently, with the fallback fee instead of the owner's.
  let vehicleCategories: { id: string; deliveryFee?: number }[] | undefined;
  try {
    const content = await getContent();
    vehicleCategories = content.vehicleCategories;
    const item = content.fleet.find(
      (f) => f.id === scooter || f.name === scooter,
    );
    if (item?.name) scooterName = item.name;
    fleetItem = item;
    activeAssets = (item?.assets ?? [])
      .filter((a) => a.active !== false)
      .map((a) => ({ id: a.id, label: a.label, color: a.color }));
    // Capacity = number of physical units (assets) if tracked, else the unit count.
    units =
      activeAssets.length > 0
        ? activeAssets.length
        : Math.max(1, item?.units ?? 1);
  } catch (err) {
    // getContent() swallows DB failures and returns DEFAULT_CONTENT, so a
    // Supabase outage makes every real vehicle "unresolvable" rather than
    // throwing. Either way the booking is refused below rather than priced
    // from client input — but log it, because this is also the signal that
    // content reads are failing.
    console.error("bookings: fleet resolution failed", err);
  }

  // The vehicle MUST resolve to a real fleet item. Two reasons:
  //
  //  * MONEY — if it doesn't, priceBreakdown() returns null and the route used
  //    to fall back to the CLIENT's total_amount and derive the deposit from
  //    it. That is exactly the attacker-controlled pricing lib/booking-pricing
  //    was written to eliminate, reachable simply by posting an unknown
  //    `scooter` value (which was never validated — only checked non-empty).
  //  * AVAILABILITY — every capacity query matches `scooter` exactly, so a
  //    value that isn't the canonical fleet id creates a second, invisible
  //    capacity pool for the same physical vehicle and bypasses the
  //    double-booking guard entirely.
  //
  // Refusing costs one malformed request. Accepting costs a mispriced booking
  // on a vehicle nobody knows is taken.
  if (!fleetItem) {
    return NextResponse.json(
      {
        error:
          "That vehicle isn't available right now. Please pick another from the list.",
      },
      { status: 400 },
    );
  }

  let asset_id: string | null = null;
  let asset_label: string | null = null;

  // ── Double-booking guard + auto-assign a free physical unit ──
  try {
    const priv = await getPrivileged();
    const { data: active, error: availabilityError } = await priv
      .from("bookings")
      .select(
        "start_date, end_date, status, created_at, asset_id, deposit_paid_at, payment_due_by",
      )
      .eq("scooter", scooter)
      .in("status", [...HOLDING_STATUSES])
      .gte("end_date", start_date)
      .lte("start_date", end_date);
    // Deliberately fail OPEN here, but never SILENTLY. A request is unpaid, and
    // per lib/holds.ts an unpaid request reserves nothing — so letting it
    // through costs nobody the vehicle, and the authoritative check runs again
    // at payment time in isVehicleFree(), which fails CLOSED. What was wrong
    // before is that this error vanished entirely: if the availability query
    // started failing, every booking would sail past the guard with no signal
    // anywhere that the check had stopped working.
    if (availabilityError) {
      console.error(
        `bookings: availability query failed for ${scooter} ${start_date}..${end_date} — request allowed through, payment-time check still applies`,
        availabilityError,
      );
    }
    const ranges = (
      (active ?? []) as {
        start_date: string;
        end_date: string;
        status: string;
        created_at: string;
        asset_id: string | null;
        deposit_paid_at: string | null;
      }[]
    ).filter((r) => isActiveHold(r));
    // Dates the owner took out by hand. A block occupies a unit exactly as a
    // held booking does, so it simply joins the per-day count.
    //
    // Unlike the bookings query above this does NOT fail open: a block exists
    // because the vehicle is genuinely gone, and letting a request through on a
    // blocked date is how the customer ends up at the counter for a scooter
    // that was lent out last week. isVehicleFree() would catch it at payment
    // time, but by then they have chosen their dates and told their friends.
    const blocks = await blocksOverlapping(start_date, end_date, scooter);
    if (blocks === null) {
      return NextResponse.json(
        {
          error:
            "We can't confirm availability right now. Please try again in a moment.",
        },
        { status: 503 },
      );
    }

    const heldOn = (day: string) =>
      ranges.reduce(
        (n, r) => (day >= r.start_date && day <= r.end_date ? n + 1 : n),
        0,
      );
    for (
      let d = new Date(start_date);
      d <= new Date(end_date);
      d.setDate(d.getDate() + 1)
    ) {
      const day = d.toISOString().slice(0, 10);
      if (heldOn(day) + blockedOn(blocks, day) >= units) {
        return NextResponse.json(
          { error: "Those dates were just taken. Please pick another range." },
          { status: 409 },
        );
      }
    }
    // Assign the first physical unit that isn't already taken for these dates.
    if (activeAssets.length > 0) {
      const busy = new Set(
        ranges.map((r) => r.asset_id).filter(Boolean) as string[],
      );
      // A unit named in a block is out too — otherwise the guard passes on
      // capacity and then hands the customer the exact bike that is away.
      for (const id of blockedAssetIds(blocks)) busy.add(id);
      const free = activeAssets.find((a) => !busy.has(a.id));
      if (free) {
        asset_id = free.id;
        asset_label = free.color ? `${free.label} · ${free.color}` : free.label;
      }
    }
  } catch (err) {
    // Same reasoning as above — an unpaid request holds nothing, so a crashed
    // guard must not stop a customer booking. But it is logged, because a
    // permanently-throwing guard would otherwise be invisible.
    console.error(
      "bookings: double-booking guard threw — request allowed through",
      err,
    );
  }

  // ── Server-authoritative money ──
  // Every figure is recomputed from the owner's own fleet content and the
  // server-derived day count. The client's total_amount is ONLY a cross-check;
  // a mismatch is logged and the server figure always wins.
  //
  // There is deliberately NO client-priced fallback. It used to fall back when
  // priceBreakdown() returned null, which meant an unpriceable vehicle — or a
  // content outage — silently handed pricing back to the request body, the
  // exact hole this module exists to close.
  const serverBreakdown = priceBreakdown(fleetItem, days, vehicleCategories);
  if (!serverBreakdown) {
    console.error(
      `bookings: cannot price ${scooter} (price="${fleetItem.price}", days=${days}) — refusing rather than trusting the client`,
    );
    return NextResponse.json(
      {
        error:
          "We couldn't price that rental. Please contact us on WhatsApp and we'll sort it out.",
      },
      { status: 409 },
    );
  }
  const clientTotal =
    typeof body.total_amount === "number" &&
    Number.isFinite(body.total_amount) &&
    body.total_amount >= 0
      ? Math.round(body.total_amount)
      : null;
  if (clientTotal !== null && clientTotal !== serverBreakdown.total) {
    console.warn(
      `booking price mismatch for ${scooter}: client sent Rs ${clientTotal}, server derived Rs ${serverBreakdown.total} — server figure stored`,
    );
  }
  const total_amount = serverBreakdown.total;
  const delivery_fee = serverBreakdown.delivery;
  const depositPct = serverBreakdown.pct;
  const deposit_amount = serverBreakdown.deposit;

  // Generate the id here so we KNOW it without reading the row back. The public
  // client can INSERT bookings but RLS forbids it from SELECTing them, so an
  // `.insert().select()` (INSERT ... RETURNING) fails the SELECT policy and
  // breaks the whole booking. Providing the id up-front avoids the read entirely
  // and still lets us hand it to the PayPal deposit flow.
  const id = crypto.randomUUID();
  const record = {
    id,
    name: name.slice(0, 120),
    email: email || null,
    phone,
    // The CANONICAL fleet id, not whatever the client posted. The lookup above
    // accepts either the id or the display name, but every capacity query
    // (`.eq("scooter", …)` in this route, lib/availability.ts and
    // /api/availability) matches this column exactly — so a row stored under
    // the display name formed a second, invisible capacity pool for the same
    // physical vehicle and was skipped by the double-booking guard.
    scooter: (fleetItem.id || scooter).slice(0, 120),
    start_date,
    end_date,
    pickup_time:
      (body.pickup_time ?? "")?.toString().trim().slice(0, 10) || null,
    return_time:
      (body.return_time ?? "")?.toString().trim().slice(0, 10) || null,
    days,
    // Display string kept consistent with the authoritative number.
    total_price:
      total_amount != null
        ? `Rs ${total_amount.toLocaleString("en-US")}`
        : (body.total_price ?? null),
    total_amount,
    delivery_fee,
    deposit_amount,
    deposit_pct: total_amount != null ? depositPct : null,
    message: (body.message ?? "")?.toString().trim() || null,
    status: "pending" as const,
    partner_code:
      (body.partner_code ?? "")?.toString().trim().toUpperCase() || null,
    asset_id,
    asset_label,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("bookings").insert([record]);
  if (error) {
    // ── NEVER SHOW THE DATABASE TO A CUSTOMER ────────────────────────────
    // This returned error.message, so when a signed-in visitor hit a missing
    // RLS policy the form printed "new row violates row-level security policy
    // for table bookings" in red, above the button, on a phone. It told the
    // person who wanted to give us money nothing they could act on, and told
    // anybody reading it the table name and that we use row-level security.
    //
    // The detail belongs in the log, where it is what actually found the bug.
    console.error("booking insert failed", { scooter, start_date, end_date }, error);
    return NextResponse.json(
      {
        error:
          "We could not save that booking just now. Please try again, or message us on WhatsApp and we will do it for you.",
      },
      { status: 500 },
    );
  }

  // Booking reference (RR-XXXXXX, derived from the id) — shown in the
  // confirmation email and used by the guest Manage-Booking lookup. One format
  // everywhere so the customer can always find their booking.
  const bookingRef = "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

  // Fire emails — never block or fail the booking on email errors
  try {
    await sendBookingEmails({
      ...record,
      scooter: scooterName,
      ref: bookingRef,
    });
  } catch {
    /* ignore email failures */
  }

  // Sync the customer into Brevo with full booking details so the owner's Brevo
  // automations — confirmation, instructions, pre-trip reminder, return reminder
  // — render real data. Best-effort.
  //
  // TRANSACTIONAL, explicitly (M41). This covers BOTH scooters and cars: they
  // share this route and this table. Renting a vehicle is consent to be told
  // about that rental, not consent to receive campaigns — so this joins the
  // lifecycle list, never the marketing audience. When a consent checkbox is
  // added to the booking form, that is the only thing that may pass "marketing".
  if (record.email) {
    try {
      await upsertBrevoContact({
        list: "transactional",
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
    // rentalDays(), not a local copy: this number is read off the owner's phone
    // and must be the SAME number the price was calculated from. Three separate
    // implementations of "how many days" is how they drift apart.
    const nights = rentalDays(record.start_date, record.end_date);
    // Queued, not sent inline (M44): a rental confirmation must not depend
    // on CallMeBot being up, and `rentals` is a category the owner can route
    // to a different phone than deliveries or payments.
    await enqueueNotification({
      type: "booking.created",
      category: "rentals",
      bookingId: record.id,
      dedupeKey: `booking.created:${record.id}`,
      message:
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
        (record.phone ? `\n📞 ${record.phone}` : "") +
        // ── WHERE TO TAKE IT (M159) ──────────────────────────────────────
        // The delivery address arrives in the customer own note — "Amener le
        // scooter a La villa ALLAMANDA, Saint-Francois..." — and the
        // confirmation EMAIL printed it while this WhatsApp alert did not.
        // The owner reads the alert on his phone and then had to open the
        // email to find out where he was driving to.
        //
        // Last, and on its own line, because it is the longest field and the
        // one he is looking for. Trimmed at 300 characters: CallMeBot sends
        // over a URL, and a customer who pastes an essay would silently lose
        // the whole message rather than the tail of one field.
        (record.message
          ? `\n\u{1F4CD} ${
              record.message.length > 300
                ? `${record.message.slice(0, 297)}…`
                : record.message
            }`
          : ""),
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    ok: true,
    bookingId: id,
    depositAmount: deposit_amount,
  });
}
