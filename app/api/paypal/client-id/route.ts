import { NextResponse } from "next/server";
import { paypalPublicClientId } from "@/lib/paypal";

// GET /api/paypal/client-id — the PayPal Client ID for the browser's PayPal
// script, read from the server's settings at run time (lib/paypal.ts).
//
// Public by design: PayPal's own script tag puts it in every visitor's page.
// null while PayPal is not live in production, so no button is drawn that
// cannot take real money. Briefly cached; a new deployment clears the cache.

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { clientId: paypalPublicClientId() },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
