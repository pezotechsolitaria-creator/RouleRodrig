import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── Counting interest in a place ────────────────────────────────────────────
//
// The map's Popular layer needs a signal that does not exist yet on this site:
// there is no page-view table, place_bookings is empty and 42 places sit in a
// CMS blob joined to nothing. This route is where that signal starts.
//
// ── ANONYMOUS ON PURPOSE ───────────────────────────────────────────────────
// The people worth counting are tourists reading a guide on a phone. Requiring
// an account would count only the handful who have one and would make the whole
// ranking a portrait of the wrong population. So: no session, no cookie, no
// visitor id, nothing stored but a per-day tally per place.
//
// That is also why the abuse story is deliberately mild. There is no money
// here; the worst a determined faker achieves is promoting a beach. The IP
// window below stops a loop, and bump_place_event() ignores anything that is
// not one of four known kinds.

const Body = z.object({
  // A CMS id, so the shape is the owner's, not ours. Length-capped here and
  // again in SQL.
  placeId: z.string().trim().min(1).max(120),
  kind: z.enum(["view", "directions", "save", "share"]),
});

export async function POST(req: NextRequest) {
  // 40/minute covers a visitor browsing the map briskly — pins open popups as
  // fast as a thumb moves — while stopping a script from inventing a landmark.
  const limited = guard(req, "place-event", 40, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  // 204 even on junk: this endpoint is fire-and-forget from a popup and its
  // response is never read. Returning an error shape nobody looks at would only
  // invite somebody to start looking.
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("bump_place_event", {
      p_place_id: parsed.data.placeId,
      p_kind: parsed.data.kind,
    });
    if (error) console.error("bump_place_event failed", error);
  } catch (err) {
    console.error("bump_place_event threw", err);
  }

  // Always 204. A counter must never be able to fail a page.
  return new NextResponse(null, { status: 204 });
}
