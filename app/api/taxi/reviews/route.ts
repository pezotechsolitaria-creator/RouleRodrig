import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── Public: list APPROVED reviews for a driver ───────────────────────────────
export async function GET(req: NextRequest) {
  const driver = req.nextUrl.searchParams.get("driver");
  const supabase = await createClient();

  let query = supabase
    .from("taxi_driver_reviews")
    .select("id, driver_id, driver_name, name, origin, rating, text, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (driver) query = query.eq("driver_id", driver);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ── Public: submit a driver review (always created PENDING) ──────────────────
export async function POST(req: NextRequest) {
  const limited = guard(req, "taxi-reviews", 5, 60_000);
  if (limited) return limited;

  let body: { driver_id?: string; driver_name?: string; name?: string; origin?: string; rating?: number; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const text = (body.text ?? "").trim();
  const rating = Number(body.rating);
  const driverId = (body.driver_id ?? "").trim();

  if (!driverId) return NextResponse.json({ error: "Please choose a driver." }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (text.length < 4) return NextResponse.json({ error: "Please write a short review." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return NextResponse.json({ error: "Please choose a rating from 1 to 5 stars." }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("taxi_driver_reviews").insert({
    driver_id: driverId,
    driver_name: (body.driver_name ?? "").trim().slice(0, 120) || null,
    name: name.slice(0, 80),
    origin: (body.origin ?? "").trim().slice(0, 80) || null,
    rating,
    text: text.slice(0, 600),
    status: "pending", // enforced server-side — admin must approve
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
