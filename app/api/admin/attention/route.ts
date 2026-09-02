import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/api-guard";
import { loadAttention } from "@/lib/admin/attention-load";

// What needs a person right now, for the notification bell in the admin shell.
//
// The same list the command centre renders, from the same function — see
// lib/admin/attention-load.ts for why that matters. This endpoint exists only
// so the answer is reachable from every admin page instead of just /admin.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Attention");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  try {
    const items = await loadAttention(admin);
    return NextResponse.json({
      items,
      // Counted here rather than in the browser so the badge and the list can
      // never disagree about how many there are.
      total: items.reduce((sum, i) => sum + (i.count || 0), 0),
    });
  } catch (err) {
    console.error("attention load failed", err);
    // An empty list, not a 500: the bell is chrome on every admin page, and a
    // failing chrome element must not make the page look broken.
    return NextResponse.json({ items: [], total: 0, degraded: true });
  }
}
