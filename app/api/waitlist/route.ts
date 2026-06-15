import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

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

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({
    email: email.slice(0, 160),
    name: (body.name ?? "").trim().slice(0, 80) || null,
    source: (body.source ?? "website").slice(0, 40),
  });

  // Duplicate email (unique index) → treat as success, they're already in
  if (error && !/duplicate|unique/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
