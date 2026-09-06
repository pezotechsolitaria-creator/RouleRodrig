import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { audit } from "@/lib/admin/audit";

// ── SETTING A SHOP'S PAYMENT METHODS FOR THEM ───────────────────────────────
//
// Some merchants here will never complete a settings form. They read their bank
// details down a phone or send them on WhatsApp, and somebody at Roulé
// Rodrigues types them in — which is how the rest of this platform's onboarding
// already works.
//
// AUTH, as every /admin route on this platform: the console carries a signed
// password cookie and NO Supabase user, so is_platform_admin() can never be true
// for it. The cookie check below IS the boundary, the service-role client is how
// the write lands, and admin_set_store_payment_settings was explicitly revoked
// from anon in M179 because a REVOKE FROM PUBLIC does not remove this project's
// default-privilege grant.

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function noBackend() {
  return NextResponse.json(
    { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return noBackend();

  const admin = await getPrivileged();
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");

  // One shop, in full — including the bank details, which is the whole point of
  // this screen and the reason it is admin-only.
  if (storeId) {
    const [{ data: row }, { data: store }] = await Promise.all([
      admin
        .from("store_payment_settings")
        .select(
          "accepts_cash, accepts_bank_transfer, require_receipt, offers_pickup, offers_customer_delivery, offers_rr_delivery, bank_name, account_holder, account_number, payment_instructions",
        )
        .eq("store_id", storeId)
        .maybeSingle(),
      admin.from("stores").select("id, name, slug, status").eq("id", storeId).maybeSingle(),
    ]);
    if (!store) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    return NextResponse.json({ store, settings: row ?? null });
  }

  // The list. `configured` is the number that matters: a shop with no method
  // switched on cannot take a single order, and nothing else on this platform
  // says so out loud.
  const [{ data: stores }, { data: settings }] = await Promise.all([
    // No 'archived' in store_status (draft|active|paused|holiday|closed):
    // filtering on it made Postgres reject the query outright.
    admin.from("stores").select("id, name, slug, status").order("name"),
    admin
      .from("store_payment_settings")
      .select("store_id, accepts_cash, accepts_bank_transfer, bank_name, account_number"),
  ]);

  const byStore = new Map(
    ((settings ?? []) as Record<string, unknown>[]).map((s) => [s.store_id as string, s]),
  );

  return NextResponse.json({
    stores: ((stores ?? []) as Record<string, unknown>[]).map((s) => {
      const row = byStore.get(s.id as string);
      const cash = !!row?.accepts_cash;
      const bank = !!row?.accepts_bank_transfer;
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: s.status,
        acceptsCash: cash,
        acceptsBankTransfer: bank,
        // Whether the details exist at all, never the details themselves — a
        // list of every shop's account number is exactly what M8 withheld.
        hasBankDetails: !!(row?.bank_name && row?.account_number),
        canBePaid: cash || bank,
      };
    }),
  });
}

const Body = z.object({
  storeId: z.string().uuid(),
  patch: z.object({
    accepts_cash: z.boolean().optional(),
    accepts_bank_transfer: z.boolean().optional(),
    require_receipt: z.boolean().optional(),
    offers_pickup: z.boolean().optional(),
    offers_customer_delivery: z.boolean().optional(),
    offers_rr_delivery: z.boolean().optional(),
    bank_name: z.string().trim().max(120).optional(),
    account_holder: z.string().trim().max(120).optional(),
    account_number: z.string().trim().max(60).optional(),
    payment_instructions: z.string().trim().max(500).optional(),
  }),
});

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return noBackend();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const admin = await getPrivileged();
  const { error } = await admin.rpc("admin_set_store_payment_settings", {
    p_store_id: parsed.data.storeId,
    p_patch: parsed.data.patch,
  });

  if (error) {
    // The table's own constraints speak here — bank_details_present_when_enabled
    // refuses bank transfer without an account number, and at_least_one_method
    // refuses switching everything off. Relay them: they are the most useful
    // thing this endpoint can say.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await audit(admin, {
    action: "admin.set_payment_methods",
    entityType: "store",
    entityId: parsed.data.storeId,
    // The FLAGS are recorded; the bank details are not. The trail has to answer
    // "who switched this shop's payments on", not reprint an account number into
    // a second table.
    diff: {
      flags: Object.fromEntries(
        Object.entries(parsed.data.patch).filter(([, v]) => typeof v === "boolean"),
      ),
      bankDetailsTouched: ["bank_name", "account_holder", "account_number"].some(
        (k) => k in parsed.data.patch,
      ),
    },
  });

  return NextResponse.json({ ok: true });
}
