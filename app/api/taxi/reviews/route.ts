import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── A CODE, NOT A SENTENCE ───────────────────────────────────────────────────
//
// This route answered with finished English only — down to the raw Postgres
// message on a failed insert — and the review modal on /taxi rendered whatever
// arrived. So a reader who had chosen French or Kreol was handed English at the
// one moment they were already stuck, and a database fault described the schema
// to a customer.
//
// Same treatment as /api/rides/track: every failure carries a stable `code` and
// the client picks the words out of the dictionary (see reviewErrorMessage in
// app/taxi/page.tsx). `error` stays for anything still reading it — except
// where it used to be error.message, which must never leave the server.
function fail(code: string, error: string, status: number) {
  return NextResponse.json({ code, error }, { status });
}

const GENERIC = "Something went wrong. Please try again.";

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
  if (error) {
    console.error("taxi reviews list failed", error);
    return fail("server", GENERIC, 500);
  }
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
    return fail("invalid_request", "Invalid request", 400);
  }

  const name = (body.name ?? "").trim();
  const text = (body.text ?? "").trim();
  const rating = Number(body.rating);
  const driverId = (body.driver_id ?? "").trim();

  if (!driverId) return fail("driver_required", "Please choose a driver.", 400);
  if (name.length < 2) return fail("name_required", "Please enter your name.", 400);
  if (text.length < 4) return fail("text_required", "Please write a short review.", 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return fail("rating_required", "Please choose a rating from 1 to 5 stars.", 400);

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

  if (error) {
    // NOT error.message. It is English a traveller cannot read, and it names
    // the columns of taxi_driver_reviews to whoever asks for it.
    console.error("taxi review insert failed", error);
    return fail("server", GENERIC, 500);
  }
  return NextResponse.json({ ok: true });
}
