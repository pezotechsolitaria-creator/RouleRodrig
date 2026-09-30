import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";

// POST /api/delivery-requests/hide — "Clear" a request from the customer's own
// list, or undo that (M227).
//
// It hides; it never deletes. set_delivery_request_hidden() writes a marker row
// beside the request, which only my_delivery_requests() reads: the admin board,
// the tracker link and every record keep the untouched request.
//
// Runs on the CALLER'S OWN SESSION, unlike /lookup: a signed-in customer is
// identified by auth.uid(), a guest by the pair (request id, email). The id is
// a full uuid here, not the six-character reference /lookup takes, so the pair
// cannot be guessed into a match — the rate limit is hygiene, not the ceiling.
//
// A job in progress (a driver on it) is refused in SQL; the list does not
// offer the button for one either (lib/delivery/clear.ts).

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().uuid(),
  hidden: z.boolean(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "delivery-request-hide", 30, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_delivery_request_hidden", {
    p_id: parsed.data.id,
    p_hidden: parsed.data.hidden,
    p_email: parsed.data.email ?? null,
  });
  if (error) {
    console.error("set_delivery_request_hidden failed", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  const res = (data ?? {}) as { ok?: boolean; error?: string };
  if (res.ok) return NextResponse.json({ ok: true });
  // "not_found" covers "not yours" too — which one it was is not the caller's
  // business. "in_progress" is the owner's own job, so they may know why.
  return NextResponse.json({ error: res.error ?? "failed" }, { status: res.error === "in_progress" ? 409 : 404 });
}
