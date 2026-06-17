import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── Public: a scooter owner applies to list their vehicles ───────────────────
export async function POST(req: NextRequest) {
  const limited = guard(req, "owner-apply", 4, 60_000);
  if (limited) return limited;

  let body: {
    owner_name?: string; phone?: string; email?: string;
    location?: string; scooters?: string; message?: string;
    id_card?: string; insurance?: string; vehicle_photos?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const clean = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) || null : null;

  const owner_name = clean(body.owner_name, 120);
  const phone = clean(body.phone, 40);

  if (!owner_name || !phone) {
    return NextResponse.json({ error: "Please enter your name and phone number." }, { status: 400 });
  }
  const email = clean(body.email, 160);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  // Only accept storage paths (no URLs) for documents, capped at 12 photos.
  const isPath = (s: unknown): s is string =>
    typeof s === "string" && s.length > 0 && s.length < 200 && !/[:/\\]/.test(s);
  const vehicle_photos = Array.isArray(body.vehicle_photos)
    ? body.vehicle_photos.filter(isPath).slice(0, 12)
    : [];

  const record = {
    owner_name,
    phone,
    email,
    location: clean(body.location, 120),
    scooters: clean(body.scooters, 400),
    message: clean(body.message, 1000),
    id_card: isPath(body.id_card) ? body.id_card : null,
    insurance: isPath(body.insurance) ? body.insurance : null,
    vehicle_photos,
    status: "pending" as const,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("owner_applications").insert([record]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
