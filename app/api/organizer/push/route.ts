import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { pushIsConfigured } from "@/lib/push/send";

// An organiser subscribing their phone to their own ticket sales.
//
// ── THE HALF THAT WAS MISSING ──────────────────────────────────────────────
// M125 built the SEND and wired it: organizer_push_targets() resolves
// organisers through event_organizer_assignments, pushToOrganizer() wraps it,
// and lib/notifications/order-placed.ts calls it on every ticket sale. There
// was simply no way to SUBSCRIBE — no route, no control on /organizer — so the
// targets query returned nobody and a send to zero targets returns 0 and looks
// exactly like success. Fully built, fully wired, and silent.
//
// Authorisation lives in the RPC, not here: register_organizer_push() writes
// against auth.uid() and refuses anyone who is not an ACTIVE organiser with an
// assignment. The event is never accepted from the body — targeting resolves
// the store at send time, so one subscription covers every event they are
// given.

const schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function POST(req: NextRequest) {
  const limited = guard(req, "organizer-push", 20, 60_000);
  if (limited) return limited;

  // Subscribing against a server that cannot send is a silent dead end — the
  // switch would say "on" and nothing would ever arrive, which is the exact
  // failure this route exists to end.
  if (!pushIsConfigured()) {
    return NextResponse.json({ error: "Alerts are not available yet." }, { status: 503 });
  }

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
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("register_organizer_push", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: req.headers.get("user-agent") ?? null,
  });

  if (error) {
    console.error("register_organizer_push failed", error);
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 500 });
  }
  if (data !== true) {
    // An `invited` organiser lands here, and that is correct: an unclaimed
    // invitation is not yet a person to send somebody's ticket sales to.
    return NextResponse.json(
      { error: "This account is not an active organiser for any event yet." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
