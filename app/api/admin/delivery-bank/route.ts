import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// ── WHERE A DELIVER-ANYTHING TRANSFER ACTUALLY GOES ─────────────────────────
//
// M190 gave delivery_settings four bank columns and taught
// delivery_request_view() to read them. It never built a way to WRITE them, so
// the only route in was a hand-typed SQL update against production — and all
// four sat NULL, which is why "bank transfer" was never offered on /deliver at
// all. The customer's only option was cash.
//
// This is the platform's OWN account, and it is not the same thing as
// /admin/payment-methods, which sets each SHOP's details in
// store_payment_settings. A shop is paid for goods; this is paid the delivery
// FEE. They share a screen because an admin holding a bank statement wants one
// place to look, and nothing else.
//
// AUTH, as on every /admin route here: the console authenticates with a signed
// password cookie and has NO Supabase user, so is_platform_admin() can never be
// true for it. delivery_settings grants writes to nobody but the service role,
// so the cookie check below IS the security boundary.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function unconfigured() {
  return NextResponse.json(
    { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

const COLUMNS = "bank_account_name, bank_name, bank_account_number, bank_note";

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return unconfigured();

  const admin = await getPrivileged();
  const { data, error } = await admin
    .from("delivery_settings")
    .select(COLUMNS)
    .eq("id", "main")
    .maybeSingle();

  if (error) {
    console.error("delivery-bank read failed", error);
    return NextResponse.json({ error: "Couldn't load the details." }, { status: 500 });
  }

  return NextResponse.json({ bank: data ?? null });
}

// Everything optional and everything trimmed. Blanking a field is a real
// intention — it is how the owner turns the option back OFF — so "" is stored
// as NULL rather than rejected.
const schema = z.object({
  accountName: z.string().trim().max(120),
  bankName: z.string().trim().max(120),
  accountNumber: z.string().trim().max(64),
  note: z.string().trim().max(400),
});

const orNull = (v: string) => (v.length > 0 ? v : null);

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return unconfigured();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check those details." },
      { status: 400 },
    );
  }
  const v = parsed.data;

  // ── THE HALF-FILLED ACCOUNT IS THE FAILURE MODE ──────────────────────────
  // delivery_request_view() switches the whole option on from the account NAME
  // alone. Saving a name with no number would therefore OFFER a bank transfer
  // and then show the customer nowhere to send it — which is the exact bug
  // M190 existed to fix, reintroduced from the admin side.
  //
  // So the two are refused unless they travel together. Clearing both is
  // always allowed: that is how the option is switched off.
  const hasName = v.accountName.length > 0;
  const hasNumber = v.accountNumber.length > 0;
  if (hasName !== hasNumber) {
    return NextResponse.json(
      {
        error: hasName
          ? "Add the account number too — an account name on its own offers customers a transfer with nowhere to send it."
          : "Add the account name too — the number alone will not switch bank transfer on.",
      },
      { status: 400 },
    );
  }

  const admin = await getPrivileged();
  const { error } = await admin
    .from("delivery_settings")
    .update({
      bank_account_name: orNull(v.accountName),
      bank_name: orNull(v.bankName),
      bank_account_number: orNull(v.accountNumber),
      bank_note: orNull(v.note),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "main");

  if (error) {
    console.error("delivery-bank write failed", error);
    return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, live: hasName && hasNumber });
}
