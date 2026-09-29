import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { audit } from "@/lib/admin/audit";

// ── The box office ──────────────────────────────────────────────────────────
//
// What was missing, and why it mattered more than it looks: a ticket exists only
// once its order reaches 'paid' (the orders_sync_tickets trigger issues them),
// and the only function that makes that transition for a manual payment,
// confirm_order_payment(), starts with `if auth.uid() is null then raise`. /admin
// has a cookie session and no Supabase user, so it could never call it. For an
// event the platform runs itself — no organiser account — a bank transfer or a
// cash payment left the order at awaiting_payment_confirmation forever: no
// ticket row, no email, no way forward.
//
// M70 adds the admin-shaped RPCs. This route is their door, plus the resend the
// support case actually needs.

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

const postSchema = z.object({
  orderId: z.string().uuid(),
  // "hold" (M220): the buyer pays at the door; keep the reservation alive.
  action: z.enum(["confirm", "reject", "resend_tickets", "hold"]),
  reason: z.string().trim().max(300).optional(),
});

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Admin backend is not configured (service role missing)." }, { status: 503 });
  }

  const storeId = new URL(req.url).searchParams.get("storeId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  const admin = await getPrivileged();
  const [{ data, error }, holds] = await Promise.all([
    admin.rpc("admin_event_orders", { p_store_id: storeId }),
    // M220 · whether each order is held, and until when. admin_event_orders
    // (M70) predates the hold and does not return it; reading two columns
    // here beats a migration to add them. Scoped to the same store the RPC
    // already proved is an event.
    admin.from("orders").select("id, accepted_at, auto_release_at").eq("store_id", storeId).limit(5000),
  ]);
  if (error) {
    if (error.code === "RR003") return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("admin_event_orders failed", error);
    return NextResponse.json({ error: "Could not load orders for that event." }, { status: 500 });
  }

  const payload = (data ?? { orders: [], totals: {} }) as { orders?: Record<string, unknown>[] };
  if (holds.error) {
    // The box office still opens; it just cannot say which orders are held.
    console.error("event order holds failed", holds.error);
  } else if (Array.isArray(payload.orders)) {
    const byId = new Map(
      ((holds.data ?? []) as { id: string; accepted_at: string | null; auto_release_at: string | null }[]).map(
        (h) => [h.id, h],
      ),
    );
    payload.orders = payload.orders.map((o) => {
      const h = byId.get(o.id as string);
      return { ...o, acceptedAt: h?.accepted_at ?? null, autoReleaseAt: h?.auto_release_at ?? null };
    });
  }
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Admin backend is not configured (service role missing)." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { orderId, action, reason } = parsed.data;
  const admin = await getPrivileged();

  // ── Resend ────────────────────────────────────────────────────────────────
  // Its own branch because it touches no state — it is the answer to "the email
  // never arrived", and the normal send is idempotent per order, which would
  // make a plain retry a silent no-op reported as success.
  if (action === "resend_tickets") {
    const { data: order } = await admin
      .from("orders")
      .select("order_number, status, store_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const { data: isEvent } = await admin
      .from("events")
      .select("store_id")
      .eq("store_id", order.store_id as string)
      .maybeSingle();
    if (!isEvent) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const { count } = await admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    if (!count) {
      // Nothing to resend, and saying so is more useful than an empty success:
      // it means the payment was never confirmed.
      return NextResponse.json(
        { error: "This order has no tickets yet — confirm the payment first." },
        { status: 409 },
      );
    }

    const { notifyTicketsIssued } = await import("@/lib/notifications/ticket-delivery");
    // A distinguishing token per send, so the idempotency guard does not swallow
    // it. Timestamped rather than random so the audit trail reads in order.
    const sent = await notifyTicketsIssued(orderId, String(Date.now()));
    await audit(admin, {
      action: "event.tickets_resent",
      entityType: "order",
      entityId: orderId,
      diff: { orderNumber: order.order_number, tickets: count, delivered: sent },
    });
    if (!sent) {
      return NextResponse.json(
        { error: "The email did not go out. Check the email provider quota." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, resent: count });
  }

  // ── Hold — pays at the door (M220) ────────────────────────────────────────
  // A cash "pay at the door" order is released after 168h unless somebody
  // accepts it (expire_order skips an order with accepted_at). For a concert
  // three weeks out, the buyer's reservation lapsed long before the door
  // opened, and the only button that saved it was "Money received — issue
  // tickets", which records money nobody had handed over.
  //
  // admin_accept_order() (M217, body M219) is the honest answer: it sets
  // accepted_at and clears the hold, and touches NO payment — the migration
  // asserts it never mentions the payments table. Service role only, so it
  // runs through the privileged client after this route's session check.
  // Tickets are still issued only by "Money received", at the door.
  if (action === "hold") {
    const { data: order } = await admin
      .from("orders")
      .select("order_number, status, store_id, accepted_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    // Events only: this route must not become a way to accept a shop's order.
    const { data: isEvent } = await admin
      .from("events")
      .select("store_id")
      .eq("store_id", order.store_id as string)
      .maybeSingle();
    if (!isEvent) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const { data: held, error: holdErr } = await admin
      .rpc("admin_accept_order", { p_order_id: orderId })
      .single();
    if (holdErr) {
      if (holdErr.code === "RR003") return NextResponse.json({ error: holdErr.message }, { status: 404 });
      if (holdErr.code === "RR004") return NextResponse.json({ error: holdErr.message }, { status: 409 });
      console.error("admin_accept_order (event hold) failed", holdErr);
      return NextResponse.json({ error: "That did not work." }, { status: 500 });
    }

    // Idempotent like the RPC: a second tap changes nothing and logs nothing.
    const firstTime = !order.accepted_at;
    if (firstTime) {
      await audit(admin, {
        action: "event.order_held",
        entityType: "order",
        entityId: orderId,
        diff: { orderNumber: order.order_number, status: order.status, payAtDoor: true },
      });
    }
    const acceptedAt =
      (held as { accepted_at?: string | null } | null)?.accepted_at ?? (order.accepted_at as string | null) ?? null;
    return NextResponse.json({ ok: true, acceptedAt, alreadyHeld: !firstTime });
  }

  // ── Confirm / reject ──────────────────────────────────────────────────────
  const rpc = action === "confirm" ? "admin_confirm_event_payment" : "admin_reject_event_payment";
  const args =
    action === "confirm"
      ? { p_order_id: orderId }
      : { p_order_id: orderId, p_reason: reason ?? null };

  const { data, error } = await admin.rpc(rpc, args);
  if (error) {
    if (error.code === "RR003") return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === "RR004") return NextResponse.json({ error: error.message }, { status: 409 });
    console.error(`${rpc} failed`, error);
    return NextResponse.json({ error: "That did not work." }, { status: 500 });
  }

  // The tickets exist now. Telling the buyer is the last step of the promise the
  // checkout made, and it is BEST EFFORT on purpose: the payment is committed,
  // so a mail provider having a bad minute must not turn the operator's click
  // into an error or undo anything.
  if (action === "confirm") {
    try {
      const { notifyTicketsIssued } = await import("@/lib/notifications/ticket-delivery");
      await notifyTicketsIssued(orderId);
    } catch (err) {
      console.error("ticket email after admin confirm failed", err);
    }
  }

  return NextResponse.json(data ?? { ok: true });
}
