import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { getContent } from "@/lib/content";
import { sendPlaceBookingEmails } from "@/lib/email";
import { guard } from "@/lib/rate-limit";
import { isActiveHold } from "@/lib/holds";

// ── Public: create a Stay·Eat·Do reservation request + confirmation emails ──
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
    message?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const place_id = (body.place_id ?? "").trim();
  const name = (body.name ?? "").trim();
  const start_date = (body.start_date ?? "").trim();
  const end_date = (body.end_date ?? "").trim();

  if (!place_id || !name || !start_date || !end_date) {
    return NextResponse.json({ error: "Missing required reservation details." }, { status: 400 });
  }

  // Resolve the listing for a trusted name/category/capacity.
  let place_name = (body.place_name ?? place_id).toString().slice(0, 160);
  let category: string | null = null;
  let capacity = 1;
  try {
    const content = await getContent();
    const item = content.recommended.items.find((p) => p.id === place_id);
    if (item) {
      place_name = item.name;
      category = item.category;
      capacity = Math.max(1, item.capacity ?? 1);
    }
  } catch {
    /* fall back to provided name */
  }

  const guests =
    Number.isFinite(Number(body.guests)) && Number(body.guests) > 0
      ? Math.min(50, Math.round(Number(body.guests)))
      : null;

  const record = {
    place_id: place_id.slice(0, 80),
    place_name,
    category,
    name: name.slice(0, 120),
    email: (body.email ?? "")?.toString().trim() || null,
    phone: (body.phone ?? "")?.toString().trim() || null,
    start_date,
    end_date,
    guests,
    message: (body.message ?? "")?.toString().trim() || null,
    status: "pending" as const,
  };

  const supabase = await getPrivileged();

  // Capacity-aware guard so a fully-booked listing can't be over-reserved.
  try {
    const { data: active } = await supabase
      .from("place_bookings")
      .select("start_date, end_date, status, created_at")
      .eq("place_id", place_id)
      .in("status", ["pending", "confirmed"])
      .gte("end_date", start_date)
      .lte("start_date", end_date);
    const ranges = ((active ?? []) as { start_date: string; end_date: string; status: string; created_at: string }[])
      .filter((r) => isActiveHold(r));
    const heldOn = (day: string) =>
      ranges.reduce((n, r) => (day >= r.start_date && day <= r.end_date ? n + 1 : n), 0);
    for (let d = new Date(start_date); d <= new Date(end_date); d.setDate(d.getDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      if (heldOn(day) >= capacity) {
        return NextResponse.json(
          { error: "Those dates are no longer available. Please pick another range." },
          { status: 409 },
        );
      }
    }
  } catch {
    /* never block a reservation on the guard */
  }

  const { error } = await supabase.from("place_bookings").insert([record]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await sendPlaceBookingEmails(record);
  } catch {
    /* ignore email failures */
  }

  return NextResponse.json({ ok: true });
}
