import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { guard } from "@/lib/rate-limit";

// ── What this shop owes back, and marking it sent (M90) ────────────────────
//
// Roulé Rodrigues never holds the money — customers transfer straight into the
// merchant's own account — so the platform cannot issue a refund. It records
// the obligation, shows the destination, and takes the proof. The shop does
// the sending.
//
// store_id comes from the session via getOwnStoreId, never from the body, and
// store_refunds()/refund_mark_sent() re-check is_store_staff() independently.
// That check covers merchant staff and kitchen OWNERS but not cooks — money is
// the owner's business, which is the same line M81 drew for the dashboard.

const patchSchema = z.object({
  refundId: z.string().uuid(),
  // The transfer receipt, already uploaded to the private bucket. Optional
  // here rather than required because a merchant who has genuinely sent the
  // money should never be blocked from recording it by a failed upload — an
  // unproven refund is still far better than an unrecorded one.
  proofPath: z.string().trim().max(300).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function GET(req: NextRequest) {
  const limited = guard(req, "merchant-refunds", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  const { data, error } = await supabase.rpc("store_refunds", { p_store_id: storeId });
  if (error) {
    console.error("store_refunds failed", error);
    return NextResponse.json({ error: "Could not load refunds." }, { status: 500 });
  }
  return NextResponse.json({ refunds: data ?? [] });
}

export async function POST(req: NextRequest) {
  const limited = guard(req, "merchant-refund-send", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { error } = await supabase.rpc("refund_mark_sent", {
    p_refund_id: parsed.data.refundId,
    p_proof_path: parsed.data.proofPath ?? null,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    const status = error.code === "RR003" ? 404 : error.code === "RR004" ? 409 : 500;
    if (status === 500) console.error("refund_mark_sent failed", error);
    return NextResponse.json(
      { error: status === 500 ? "That didn't work. Try again." : error.message },
      { status },
    );
  }
  return NextResponse.json({ ok: true });
}
