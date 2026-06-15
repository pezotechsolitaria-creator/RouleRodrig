import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBookingEmails } from "@/lib/email";
import { guard } from "@/lib/rate-limit";

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
    days?: number;
    total_price?: string | null;
    total_amount?: number | null;
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

  const record = {
    name: name.slice(0, 120),
    email: (body.email ?? "")?.toString().trim() || null,
    phone: (body.phone ?? "")?.toString().trim() || null,
    scooter: scooter.slice(0, 120),
    start_date,
    end_date,
    days,
    total_price: body.total_price ?? null,
    total_amount: body.total_amount ?? null,
    message: (body.message ?? "")?.toString().trim() || null,
    status: "pending" as const,
    partner_code: (body.partner_code ?? "")?.toString().trim().toUpperCase() || null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("bookings").insert([record]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire emails — never block or fail the booking on email errors
  try {
    await sendBookingEmails(record);
  } catch {
    /* ignore email failures */
  }

  return NextResponse.json({ ok: true });
}
