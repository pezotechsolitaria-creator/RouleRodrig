import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── Public: contact / enquiry submission ─────────────────────────────────────
// Moved server-side (was a direct client→Supabase insert) so we can rate-limit,
// validate and sanitise. Inserts only — never exposes other submissions.
export async function POST(req: NextRequest) {
  // Max 5 enquiries per minute per IP
  const limited = guard(req, "contact", 5, 60_000);
  if (limited) return limited;

  let body: {
    name?: string; email?: string; phone?: string;
    scooter?: string; dates?: string; message?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const clean = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) || null : null;

  const email = clean(body.email, 160);
  const message = clean(body.message, 2000);
  const name = clean(body.name, 120);

  // Require at least a way to reply + something to say
  if (!message && !name) {
    return NextResponse.json({ error: "Please add a message." }, { status: 400 });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const record = {
    name,
    email,
    phone: clean(body.phone, 40),
    scooter: clean(body.scooter, 120),
    dates: clean(body.dates, 120),
    message,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("contact_submissions").insert([record]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
