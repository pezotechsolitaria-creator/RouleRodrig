import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";
import { normalizePickupCode } from "@/lib/orders/pickup";

// The read-only half of the scanned handoff (M30): who is this, what is in it,
// can I hand it over? Nothing here changes anything — preview_pickup_code() is
// STABLE and the migration's post-condition enforces that — so a merchant can
// scan to check without committing to a handover they have not made yet.
const NOT_FOUND_CODE = "RR021";

const schema = z.object({
  code: z
    .string()
    .trim()
    .max(32)
    .transform(normalizePickupCode)
    .refine((c) => c.length === 8, "That is not a pickup code."),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "pickup-preview", 40, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid code." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("preview_pickup_code", { p_code: parsed.data.code });
  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("preview_pickup_code unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data);
}
