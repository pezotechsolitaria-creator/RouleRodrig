import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";

// ── The customer's side of a refund (M90) ──────────────────────────────────
//
// Two identities, because guests are the default checkout path here: a
// signed-in buyer proves it with their session, a guest with order number +
// email through the privileged client — the same credential lookup_order and
// guest_report_payment already use.
//
// The guest RPCs are service_role only and check the email INSIDE the function,
// so this route cannot widen them by forgetting a condition. A wrong email and
// a wrong order number give the same answer, so neither can be used to confirm
// that an order exists.

const NOT_FOUND = "RR003";
const BAD_STATE = "RR004";
const BAD_INPUT = "RR005";

const guestId = z.object({
  orderNumber: z.string().trim().min(3).max(40),
  email: z.string().trim().toLowerCase().email().max(254),
});

const bodySchema = z.union([
  // Where to send it. Only meaningful while the refund is still owed.
  z
    .object({
      refundId: z.string().uuid(),
      bankName: z.string().trim().max(120).optional(),
      accountHolder: z.string().trim().min(1).max(200),
      accountNumber: z.string().trim().min(1).max(64),
    })
    .and(z.union([z.object({ orderId: z.string().uuid() }), guestId])),
  // "It arrived." Only the customer can say this.
  z
    .object({ refundId: z.string().uuid(), confirm: z.literal(true) })
    .and(z.union([z.object({ orderId: z.string().uuid() }), guestId])),
]);

function statusFor(code: string | undefined): number {
  return code === NOT_FOUND ? 404 : code === BAD_STATE ? 409 : code === BAD_INPUT ? 400 : 500;
}

export async function GET(req: NextRequest) {
  const limited = guard(req, "refunds-read", 60, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  const orderNumber = url.searchParams.get("orderNumber");
  const email = url.searchParams.get("email");

  if (orderId) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("order_refunds", { p_order_id: orderId });
    if (error) {
      console.error("order_refunds failed", error);
      return NextResponse.json({ error: "Could not load your refund." }, { status: 500 });
    }
    return NextResponse.json({ refunds: data ?? [] });
  }

  const parsed = guestId.safeParse({ orderNumber, email });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("guest_refunds", {
    p_order_number: parsed.data.orderNumber,
    p_email: parsed.data.email,
  });
  if (error) {
    console.error("guest_refunds failed", error);
    return NextResponse.json({ error: "Could not load your refund." }, { status: 500 });
  }
  return NextResponse.json({ refunds: data ?? [] });
}

export async function POST(req: NextRequest) {
  const limited = guard(req, "refunds-write", 20, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const isGuest = !("orderId" in input);

  if (!isGuest) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { error } =
      "confirm" in input
        ? await supabase.rpc("refund_confirm_received", { p_refund_id: input.refundId })
        : await supabase.rpc("refund_set_destination", {
            p_refund_id: input.refundId,
            p_bank_name: input.bankName ?? null,
            p_account_holder: input.accountHolder,
            p_account_number: input.accountNumber,
          });
    if (error) {
      const status = statusFor(error.code);
      if (status === 500) console.error("refund action failed", error);
      return NextResponse.json(
        { error: status === 500 ? "That didn't work. Try again." : error.message },
        { status },
      );
    }
    return NextResponse.json({ ok: true });
  }

  const admin = await getPrivileged();
  const { error } = await admin.rpc("guest_refund_action", {
    p_order_number: input.orderNumber,
    p_email: input.email,
    p_refund_id: input.refundId,
    p_bank_name: "bankName" in input ? (input.bankName ?? null) : null,
    p_account_holder: "accountHolder" in input ? input.accountHolder : null,
    p_account_number: "accountNumber" in input ? input.accountNumber : null,
    p_confirm: "confirm" in input,
  });
  if (error) {
    const status = statusFor(error.code);
    if (status === 500) console.error("guest_refund_action failed", error);
    return NextResponse.json(
      { error: status === 500 ? "That didn't work. Try again." : error.message },
      { status },
    );
  }
  return NextResponse.json({ ok: true });
}
