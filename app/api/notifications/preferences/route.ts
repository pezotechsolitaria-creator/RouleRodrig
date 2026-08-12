import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { mutableCategories } from "@/lib/notifications/registry";

// A user's own notification preferences.
//
// The set of categories that CAN be muted is derived from the registry, not
// accepted from the client: mutableCategories() excludes anything whose events
// are critical. So a hand-made request cannot mute failed payments even though
// the table would happily store the row — the check is here, and
// emit_notification() ignores mutes at critical priority regardless.

const schema = z.object({
  category: z.string().trim().min(1).max(40),
  muted: z.boolean(),
});

export async function GET(req: NextRequest) {
  const limited = guard(req, "notif-prefs-read", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS scopes this to the caller; the filter is belt and braces.
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("category, muted_all")
    .eq("user_id", user.id);

  if (error) {
    console.error("read notification preferences failed", error);
    return NextResponse.json({ error: "Could not load preferences." }, { status: 500 });
  }

  const muted = new Set((data ?? []).filter((r) => r.muted_all).map((r) => r.category as string));
  return NextResponse.json({
    // Opt-out model: a category with no row is ON. Sending the full list means
    // the UI never has to guess what exists.
    categories: mutableCategories().map((c) => ({ category: c, enabled: !muted.has(c) })),
  });
}

export async function PATCH(req: NextRequest) {
  const limited = guard(req, "notif-prefs-write", 30, 60_000);
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // The real gate: a category that carries critical events is not mutable, and
  // no client may claim otherwise.
  if (!mutableCategories().includes(parsed.data.category as never)) {
    return NextResponse.json(
      { error: "That category can't be turned off — it carries essential updates." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      category: parsed.data.category,
      muted_all: parsed.data.muted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,category" },
  );

  if (error) {
    console.error("write notification preference failed", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
