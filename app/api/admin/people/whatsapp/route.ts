import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/api-guard";
import { isUuid } from "@/lib/file-signature";

// ── WHATSAPP JOB ALERTS, SET UP BY THE OWNER ────────────────────────────────
//
// This used to live on the driver's own dashboard: message CallMeBot from your
// phone, wait for a key, paste it into a form. That is a lot to ask of somebody
// who has just been handed a login, and it occupied space on the one screen a
// driver opens when they are trying to work.
//
// The owner already onboards these people by hand, so the setup moves to where
// he is. Same table, same rules — admin_set_driver_whatsapp is a sibling of
// set_driver_whatsapp with the driver named rather than inferred from
// auth.uid(), so the clearing rule and the phone fallback cannot drift apart.
//
// THE KEY IS WRITE-ONLY. It is a credential for somebody else's WhatsApp: GET
// answers a boolean and nothing else, and no endpoint anywhere returns it.

export const dynamic = "force-dynamic";

/** Whether alerts are configured for one driver. Never the key itself. */
export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Driver WhatsApp alerts");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const driverId = (req.nextUrl.searchParams.get("driverId") ?? "").trim();
  if (!isUuid(driverId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // `head` would be cheaper, but the count is the answer and this reads plainly.
  const { data, error } = await admin
    .from("driver_contact_channels")
    .select("driver_id")
    .eq("driver_id", driverId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ configured: Boolean(data) });
}

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, "Driver WhatsApp alerts");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  let body: { driverId?: string; apiKey?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const driverId = (body.driverId ?? "").trim();
  if (!isUuid(driverId)) {
    return NextResponse.json({ error: "Pick a driver." }, { status: 400 });
  }

  // An empty key is not a mistake — it is how alerts are switched OFF, and the
  // function clears the row rather than storing a blank that looks configured.
  const apiKey = (body.apiKey ?? "").toString().trim().slice(0, 200);
  const phone = (body.phone ?? "").toString().trim().slice(0, 30);

  const { error } = await admin.rpc("admin_set_driver_whatsapp", {
    p_driver_id: driverId,
    p_api_key: apiKey,
    p_phone: phone || null,
  });

  if (error) {
    console.error("admin_set_driver_whatsapp", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, configured: apiKey.length > 0 });
}
