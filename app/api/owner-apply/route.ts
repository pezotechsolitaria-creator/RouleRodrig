import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// The categories a partner can apply to list. Kept in sync with the DB CHECK
// constraint (owner_applications_listing_type_check) — a value outside this set
// is rejected here AND by the database, so a crafted request can't store junk.
//
// taxi / event / delivery (M47) are the categories that cannot be created by
// the applicant ANYWHERE in the product: taxi_drivers is admin-insert-only,
// event organisers are minted by admin_create_organizer(), and M45 makes driver
// approval an explicit admin act. Accepting one of these values still only ever
// writes an application row with status 'pending' — it grants nothing and
// creates nothing downstream. Approval stays a human decision taken with the
// existing admin tools.
const LISTING_TYPES = [
  "vehicle", "restaurant", "stay", "activity", "experience",
  "taxi", "event", "delivery",
] as const;
type ListingType = (typeof LISTING_TYPES)[number];

// ── Public: a partner applies to list a vehicle / restaurant / stay / … ──────
export async function POST(req: NextRequest) {
  const limited = guard(req, "owner-apply", 4, 60_000);
  if (limited) return limited;

  let body: {
    owner_name?: string; phone?: string; email?: string;
    location?: string; scooters?: string; message?: string;
    id_card?: string; insurance?: string; vehicle_photos?: unknown;
    listing_type?: string; business_name?: string; details?: string;
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

  // Default to 'vehicle' so an old scooter-only client (or a missing field)
  // still behaves exactly as before.
  const listing_type: ListingType = LISTING_TYPES.includes(body.listing_type as ListingType)
    ? (body.listing_type as ListingType)
    : "vehicle";

  // Only accept storage paths (no URLs) for documents/photos, capped at 12.
  const isPath = (s: unknown): s is string =>
    typeof s === "string" && s.length > 0 && s.length < 200 && !/[:/\\]/.test(s);
  const vehicle_photos = Array.isArray(body.vehicle_photos)
    ? body.vehicle_photos.filter(isPath).slice(0, 12)
    : [];

  const record = {
    owner_name,
    phone,
    email,
    listing_type,
    business_name: clean(body.business_name, 160),
    location: clean(body.location, 120),
    // `details` is the generic "what you're listing" field; `scooters` is kept
    // for backward-compat and mirrors it when a vehicle listing fills it in.
    details: clean(body.details, 600) ?? clean(body.scooters, 600),
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
