import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rate-limit";
import { viewOrder } from "@/lib/esim/service";

// What the install page polls while an eSIM is still being prepared. Each
// call also nudges provisioning (one query to the wholesaler), so a buyer
// watching the page is itself the retry loop — no cron needed (and this
// project is at Vercel's cron cap).
//
// POST, not GET: the key must not end up in access logs or a Referer.

export const maxDuration = 30;

const body = z.object({
  ref: z.string().trim().min(6).max(12),
  key: z.string().trim().length(32),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Per order, not per IP: mobile CGNAT puts many strangers behind one address
  // (see lib/rate-limit.ts), and a page polling every 4 s is legitimate.
  const limited = guard(req, "esim-order", 30, 60_000, parsed.data.ref);
  if (limited) return limited;

  const view = await viewOrder(parsed.data.ref, parsed.data.key, { refresh: true });
  if (!view) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
