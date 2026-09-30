import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { handleWebhook } from "@/lib/esim/service";

// The wholesaler's doorbell: /api/esim/webhook/esimaccess.
//
// eSIM Access does not sign its webhooks (their docs offer only a list of
// sender IPs). So the body is used for exactly one thing — WHICH order to
// look at — and the order's state is then re-read through the signed API.
// A forged call can at worst make us check an order early. It cannot deliver
// an eSIM, mark anything paid, or change a price.
//
// Must answer 200 quickly: registering the URL sends a CHECK_HEALTH first,
// and a non-200 means the URL is not saved.

export const maxDuration = 30;

// Published by eSIM Access (docs "Webhooks → IP whitelist"). Used to decide
// whether a webhook's USAGE figures may be written as-is; order lookups run
// regardless, because they are re-verified anyway.
const ESIMACCESS_IPS = new Set([
  "3.1.131.226",
  "54.254.74.88",
  "18.136.190.97",
  "18.136.60.197",
  "18.136.19.137",
  "54.151.164.206",
  "52.76.129.149",
  "18.142.83.98",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: "not json" });
  }
  const ip = clientIp(req);
  const trustedSender = provider !== "esimaccess" || ESIMACCESS_IPS.has(ip);
  try {
    const r = await handleWebhook(provider, body, { trustedSender });
    return NextResponse.json(r);
  } catch (e) {
    // 500 so the wholesaler retries; the event row (if written) keeps the payload.
    console.error(`[esim] webhook ${provider} from ${ip}`, e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Some wholesalers probe the URL with GET/HEAD before saving it.
export async function GET() {
  return NextResponse.json({ ok: true });
}
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
