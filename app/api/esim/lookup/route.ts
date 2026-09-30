import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardShared } from "@/lib/rate-limit";
import { lookupOrder } from "@/lib/esim/service";

// "I lost my install link." Order number + email → the install page.
// The IP is the whole rate-limit key here (see guard() in lib/rate-limit.ts):
// this is a guessing path, and the budget IS the brute-force protection.

const body = z.object({
  ref: z.string().trim().min(6).max(12),
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "esim-lookup", 6, 10 * 60_000);
  if (limited) return limited;
  let parsed;
  try {
    parsed = body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the order number (ES-XXXXXX) and email." }, { status: 400 });
  }
  const url = await lookupOrder(parsed.data.ref, parsed.data.email);
  if (!url) {
    return NextResponse.json({ error: "No eSIM matches that order number and email." }, { status: 404 });
  }
  return NextResponse.json({ url });
}
