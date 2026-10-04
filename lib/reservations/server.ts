import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getContent } from "@/lib/content";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { isValidEmail, isValidPhone } from "@/lib/phone";
import type { RecommendedPlace } from "@/lib/defaults";
import { hashToken, isTokenShaped } from "./reference";
import { computeDue, computeTotal, partySize, resolvePolicy, type PaymentPolicy, type ProductType } from "./policy";
import { capacityOf, engineHandles, pricingOf, productTypeOf, slotKeyOf, snapshotOf, unitsFor } from "./listing";
import { holdsCapacity, isDueToExpire, type PaymentStatus, type ReservationStatus } from "./status";
import type { GuestView } from "./view";

// ── The reservation engine's server side ─────────────────────────────────────
//
// Guests reach their reservation through SECURITY DEFINER functions that take
// the raw token (M240b), so the booking page works with the anon key; create
// and every admin action need the service role.
//
// THE TOKEN is derived, not stored: HMAC(secret, idempotency key). The
// database keeps only its SHA-256, a double-submit can hand back the same
// link, and a later email (confirmed, paid, reminder) can rebuild the link
// from the row's idempotency key without the raw token ever being saved.
// Because the key therefore opens the booking, a repeated key returns the
// link ONLY when it comes with the same phone and product.

export class ReservationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

function tokenSecret(): string {
  const s =
    process.env.RESERVATION_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "";
  if (!s) throw new ReservationError(503, "unconfigured", "Reservations are not configured.");
  return s;
}

/** The guest's access token for a reservation, from its idempotency key. */
export function tokenFor(idempotencyKey: string): string {
  return createHmac("sha256", tokenSecret()).update(`reservation:${idempotencyKey}`).digest("base64url");
}

export function bookingPath(idempotencyKey: string): string {
  return `/booking/${tokenFor(idempotencyKey)}`;
}

// ── Create ───────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createSchema = z.object({
  idempotency_key: z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
  product_id: z.string().trim().min(1).max(120),
  date: z.string().regex(ISO_DATE),
  end_date: z.string().regex(ISO_DATE).optional().nullable(),
  time: z.string().trim().max(20).optional().nullable(),
  adults: z.number().int().min(0).max(60),
  children: z.number().int().min(0).max(60).default(0),
  babies: z.number().int().min(0).max(20).default(0),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().max(254).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  locale: z.enum(["en", "fr", "cr"]).default("en"),
});
export type CreateInput = z.infer<typeof createSchema>;

/** Today in Rodrigues, as YYYY-MM-DD. */
export function todayMU(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius" }).format(now);
}

/** The owner's policy for a product: product row, else type row, else the default. */
export async function policyFor(productId: string, type: ProductType): Promise<PaymentPolicy> {
  if (!hasServiceRole()) return resolvePolicy(type);
  const admin = await getPrivileged();
  // Plain equality filters: the id is never spliced into filter syntax.
  const { data } = await admin.from("reservation_policies").select("scope_type, scope_id, policy").in("scope_id", [productId, type]);
  const rows = (data ?? []) as { scope_type: string; scope_id: string; policy: Partial<PaymentPolicy> }[];
  const chosen =
    rows.find((r) => r.scope_type === "product" && r.scope_id === productId) ??
    rows.find((r) => r.scope_type === "product_type" && r.scope_id === type);
  return resolvePolicy(type, chosen?.policy ?? null);
}

export async function findListing(productId: string): Promise<RecommendedPlace | null> {
  const content = await getContent();
  return (content.recommended?.items ?? []).find((p) => p.id === productId) ?? null;
}

export async function createReservation(input: CreateInput): Promise<{ reference: string; token: string; existing: boolean }> {
  if (!isValidPhone(input.phone)) throw new ReservationError(400, "phone", "A valid phone number is required.");
  const email = input.email?.trim() || null;
  if (email && !isValidEmail(email)) throw new ReservationError(400, "email", "Please enter a valid email address.");
  if (input.date < todayMU()) throw new ReservationError(400, "date_past", "That date has already passed.");

  const listing = await findListing(input.product_id);
  if (!listing || listing.hidden) throw new ReservationError(404, "not_found", "This listing is no longer available.");
  if (!engineHandles(listing)) throw new ReservationError(400, "not_engine", "This listing is booked another way.");
  if (listing.bookable === false) throw new ReservationError(400, "not_bookable", "This listing isn't taking requests online.");

  const slots = (listing.timeSlots ?? []).filter(Boolean);
  const time = input.time?.trim() || null;
  if (slots.length > 0 && (!time || !slots.includes(time))) {
    throw new ReservationError(400, "slot", "Please choose a time.");
  }
  const party = { adults: input.adults, children: input.children ?? 0, babies: input.babies ?? 0 };
  const people = partySize(party);
  if (people < 1 || input.adults < 1) throw new ReservationError(400, "party", "At least one adult is needed.");
  const snapshot = snapshotOf(listing);
  if (people > snapshot.max_party) {
    throw new ReservationError(400, "too_many", `This can take at most ${snapshot.max_party} people at a time.`);
  }
  // Seats for a seated trip; one unit for a whole trip (capacityOf).
  const seats = unitsFor(capacityOf(listing), people);

  const type = productTypeOf(listing);
  const policy = await policyFor(listing.id, type);
  // The price is computed HERE, from the listing — never taken from the browser.
  const total = computeTotal(pricingOf(listing), party, 1);
  const due = computeDue(policy, total);
  const token = tokenFor(input.idempotency_key);

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("reservation_create", {
    p: {
      idempotency_key: input.idempotency_key,
      token_hash: hashToken(token),
      customer_name: input.name,
      customer_phone: input.phone,
      customer_email: email,
      customer_locale: input.locale,
      product_id: listing.id,
      product_type: type,
      product_snapshot: snapshot,
      slot: { date: input.date, start_time: time, end_time: null, units: 1, notes: input.notes ?? null },
      party,
      seats,
      slot_date: input.date,
      slot_end_date: null,
      slot_key: slotKeyOf(input.date, time),
      amount_mur: total,
      deposit_due_mur: due.deposit_due_mur,
      balance_due_mur: due.balance_due_mur,
      policy,
      customer_notes: input.notes ?? null,
      source: "web",
    },
  });
  if (error) {
    console.error("reservation_create failed", error);
    throw new ReservationError(500, "create_failed", "We couldn't send your request. Please try again.");
  }
  const res = data as { ok: boolean; existing: boolean; id: string; reference: string };

  if (res.existing) {
    // The key opens the booking, so a replay must prove it is the same guest.
    const { data: row } = await admin.from("reservations").select("customer_phone, product_id").eq("id", res.id).maybeSingle();
    if (!row || row.product_id !== listing.id || String(row.customer_phone).replace(/\s+/g, "") !== input.phone.replace(/\s+/g, "")) {
      throw new ReservationError(409, "key_reused", "Please refresh the page and try again.");
    }
  }
  return { reference: res.reference, token, existing: res.existing };
}

// ── Guest (anon key, by token) ───────────────────────────────────────────────

export type { GuestView } from "./view";

export async function viewByToken(token: string): Promise<GuestView | null> {
  if (!isTokenShaped(token)) return null;
  const { data, error } = await createAnonClient().rpc("reservation_view", { p_token: token });
  if (error) {
    console.error("reservation_view failed", error);
    throw new ReservationError(500, "view_failed");
  }
  return (data as GuestView | null) ?? null;
}

export async function guestAction(
  token: string,
  action: "answer" | "report_payment" | "choose_cash" | "message_opened",
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!isTokenShaped(token)) return { ok: false, error: "not_found" };
  const sb = createAnonClient();
  const call =
    action === "answer"
      ? sb.rpc("reservation_guest_answer", { p_token: token, p_answer: body.answer ?? {} })
      : action === "report_payment"
        ? sb.rpc("reservation_guest_report_payment", { p_token: token, p_method: String(body.method ?? "") })
        : action === "choose_cash"
          ? sb.rpc("reservation_guest_choose_cash", { p_token: token })
          : sb.rpc("reservation_guest_message_opened", { p_token: token });
  const { data, error } = await call;
  if (error) {
    console.error(`reservation guest ${action} failed`, error);
    return { ok: false, error: "failed" };
  }
  return action === "message_opened" ? { ok: true } : ((data as { ok: boolean; error?: string }) ?? { ok: false });
}

// ── Admin (service role) ─────────────────────────────────────────────────────

export const ADMIN_ACTIONS = ["review", "confirm", "request_info", "decline", "cancel", "mark_paid", "allow_cash", "ready", "start", "complete", "note"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export async function adminAction(id: string, action: AdminAction, payload: Record<string, unknown>) {
  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("reservation_admin", { p_id: id, p_action: action, p: payload });
  if (error) {
    console.error("reservation_admin failed", { action, error });
    throw new ReservationError(500, "action_failed");
  }
  return data as { ok: boolean; error?: string; [k: string]: unknown };
}

// ── Capacity, for the public calendar ───────────────────────────────────────

export type HoldRange = { place: string; start: string; end: string; confirmed: true; quantity: number; slot: string | null };

/**
 * The seats the engine holds, shaped like /api/place-availability's ranges.
 * Confirmed and later hold; a request never does; a confirmed hold whose
 * payment deadline has passed stops holding at once, before the sweep runs.
 * No personal data leaves this function.
 */
export async function engineHoldRanges(productId: string | null, now = new Date()): Promise<HoldRange[]> {
  if (!hasServiceRole()) return [];
  const admin = await getPrivileged();
  let q = admin
    .from("reservations")
    .select("product_id, slot_date, slot_end_date, slot, seats, reservation_status, payment_status, payment_deadline_at, payment_reported_at")
    .in("reservation_status", ["confirmed", "ready", "in_progress"])
    .gte("slot_date", todayMU(now));
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) {
    console.error("engine hold ranges", error);
    return [];
  }
  type Row = {
    product_id: string;
    slot_date: string;
    slot_end_date: string | null;
    slot: { start_time?: string | null } | null;
    seats: number;
    reservation_status: ReservationStatus;
    payment_status: PaymentStatus;
    payment_deadline_at: string | null;
    payment_reported_at: string | null;
  };
  return ((data ?? []) as Row[])
    .filter((r) => holdsCapacity(r.reservation_status) && !isDueToExpire(r, now))
    .map((r) => ({
      place: r.product_id,
      start: r.slot_date,
      end: r.slot_end_date ?? r.slot_date,
      confirmed: true as const,
      quantity: r.seats,
      slot: r.slot?.start_time ?? null,
    }));
}
