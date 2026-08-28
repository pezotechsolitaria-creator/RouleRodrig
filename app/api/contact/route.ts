import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";
import { sendEnquiryAck, sendOwnerEnquiryAlert } from "@/lib/email";
import { isValidPhone } from "@/lib/phone";

// ── Public: contact / enquiry submission ─────────────────────────────────────
// Moved server-side (was a direct client→Supabase insert) so we can rate-limit,
// validate and sanitise. Inserts only — never exposes other submissions.
export async function POST(req: NextRequest) {
  // Max 5 enquiries per minute per IP
  const limited = await guardShared(req, "contact", 5, 60_000);
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
  const phone = clean(body.phone, 40);
  if (phone && !isValidPhone(phone)) {
    return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
  }

  const record = {
    name,
    email,
    phone,
    scooter: clean(body.scooter, 120),
    dates: clean(body.dates, 120),
    message,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("contact_submissions").insert([record]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Instant branded auto-reply so the customer knows we got it (never blocks)
  if (email) {
    try {
      await sendEnquiryAck(email, name);
    } catch {
      /* ignore email failures */
    }
  }

  // And tell the owner, which nothing did until now: the acknowledgement above
  // promises a reply from a real person within a few hours, while the enquiry
  // itself was visible only as a badge in /admin. Sent even when no email was
  // given — a phone-only enquiry is still a lead, and one nobody can chase.
  // Never blocks: the submission is already saved.
  try {
    await sendOwnerEnquiryAlert(record);
  } catch {
    /* ignore email failures */
  }

  return NextResponse.json({ ok: true });
}
