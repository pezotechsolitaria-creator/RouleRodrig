import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Public: list APPROVED reviews only ──────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const scooterId = req.nextUrl.searchParams.get("scooter");

  let query = supabase
    .from("product_reviews")
    .select("id, scooter_id, scooter_name, name, origin, rating, text, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (scooterId) query = query.eq("scooter_id", scooterId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ── Public: submit a review (always created as PENDING) ─────────────
export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    origin?: string;
    rating?: number;
    text?: string;
    scooter_id?: string;
    scooter_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const text = (body.text ?? "").trim();
  const rating = Number(body.rating);

  // Validation
  if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (text.length < 4) return NextResponse.json({ error: "Please write a short review." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return NextResponse.json({ error: "Please choose a rating from 1 to 5 stars." }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("product_reviews").insert({
    name: name.slice(0, 80),
    origin: (body.origin ?? "").trim().slice(0, 80) || null,
    rating,
    text: text.slice(0, 600),
    scooter_id: (body.scooter_id ?? "").trim().slice(0, 60) || null,
    scooter_name: (body.scooter_name ?? "").trim().slice(0, 80) || null,
    status: "pending", // enforced server-side — admin must approve
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
