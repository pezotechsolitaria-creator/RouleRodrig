import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── Public: a hotel/partner can look up their own referral performance with
//    just their code. No login required, and NO guest personal data is ever
//    returned — only the partner's own aggregates and masked booking rows
//    (scooter, dates, status, amount). This keeps partners motivated without
//    exposing customer PII or needing admin access. ─────────────────────────
export async function GET(req: NextRequest) {
  // 30 lookups per minute per IP — blocks code enumeration / scraping
  const limited = guard(req, "partner-stats", 30, 60_000);
  if (limited) return limited;

  const raw = req.nextUrl.searchParams.get("code") ?? "";
  const code = raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const supabase = await createClient();

  // Find the partner this code belongs to.
  const { data: partner, error: pErr } = await supabase
    .from("partners")
    .select("name, type, commission_pct, active")
    .eq("partner_code", code)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!partner) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Bookings attributed to this code (no PII columns selected).
  const { data: rows, error: bErr } = await supabase
    .from("bookings")
    .select("scooter, start_date, end_date, days, total_amount, status, created_at")
    .eq("partner_code", code)
    .order("created_at", { ascending: false });

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  const bookings = rows ?? [];
  // Cancelled bookings don't earn commission.
  const earning = bookings.filter((b) => b.status !== "cancelled");
  const totalRaw = earning.reduce((acc, b) => acc + (b.total_amount ?? 0), 0);
  const pct = partner.commission_pct ?? 10;
  const commission = Math.round((totalRaw * pct) / 100);

  return NextResponse.json({
    partner: {
      name: partner.name,
      type: partner.type,
      commission_pct: pct,
      active: partner.active,
    },
    stats: {
      total: bookings.length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      pending: bookings.filter((b) => b.status === "pending").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      totalValue: totalRaw,
      commission,
    },
    recent: bookings.slice(0, 20).map((b) => ({
      scooter: b.scooter,
      start_date: b.start_date,
      end_date: b.end_date,
      days: b.days,
      amount: b.total_amount,
      status: b.status,
      created_at: b.created_at,
    })),
  });
}
