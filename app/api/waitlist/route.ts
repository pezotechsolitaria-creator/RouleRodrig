import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { sendWaitlistWelcome, upsertBrevoContact } from "@/lib/email";

// ── Public: join the waitlist ───────────────────────────────────────
export async function POST(req: NextRequest) {
  // 5 sign-ups per minute per IP
  const limited = guard(req, "waitlist", 5, 60_000);
  if (limited) return limited;

  let body: { email?: string; name?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  // simple email shape check
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const source = (body.source ?? "website").slice(0, 40);
  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({
    email: email.slice(0, 160),
    name: (body.name ?? "").trim().slice(0, 80) || null,
    source,
  });

  const isDuplicate = !!error && /duplicate|unique/i.test(error.message);
  // Duplicate email (unique index) → treat as success, they're already in
  if (error && !isDuplicate) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fire a friendly welcome email — only for genuinely new sign-ups, never
  // blocks the response, no-ops cleanly if email isn't configured yet.
  if (!isDuplicate) {
    try {
      await sendWaitlistWelcome(email, source);
    } catch {
      /* ignore email failures */
    }
    // Also sync into Brevo contacts/list for automations & campaigns.
    try {
      await upsertBrevoContact({ email, firstName: (body.name ?? "").trim() || null });
    } catch {
      /* best-effort */
    }
  }
  return NextResponse.json({ ok: true });
}
