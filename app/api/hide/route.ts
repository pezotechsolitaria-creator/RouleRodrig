import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { HIDE_KINDS, type HideRefusal } from "@/lib/hide/kinds";

// ── CLEAR AN ITEM FROM MY OWN LIST (M234) ──────────────────────────────────
//
// Calls set_my_item_hidden with the customer's OWN session, never the service
// role: the function identifies the owner from auth.uid() and the session's
// email, so nothing in this request body can claim somebody else's record.
// Signed-in only — a guest has no account list to clear (guests clear
// /deliver requests through M227 instead).

const schema = z.object({
  kind: z.enum(HIDE_KINDS),
  id: z.string().uuid(),
  hidden: z.boolean().default(true),
});

const STATUS: Record<HideRefusal, number> = { signed_out: 401, not_found: 404, still_live: 409 };

export async function POST(req: NextRequest) {
  const limited = guard(req, "hide-item", 60, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 401 });

  const { data, error } = await supabase.rpc("set_my_item_hidden", {
    p_kind: parsed.data.kind,
    p_id: parsed.data.id,
    p_hidden: parsed.data.hidden,
  });
  if (error) {
    console.error("set_my_item_hidden failed", error);
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
  const r = data as { ok?: boolean; hidden?: boolean; reason?: HideRefusal } | null;
  if (!r?.ok) {
    const reason = r?.reason ?? "not_found";
    return NextResponse.json({ ok: false, reason }, { status: STATUS[reason] ?? 400 });
  }
  return NextResponse.json({ ok: true, hidden: r.hidden === true });
}

export async function GET(req: NextRequest) {
  const limited = guard(req, "hide-list", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });

  const { data, error } = await supabase.rpc("my_hidden_items");
  if (error) {
    console.error("my_hidden_items failed", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
