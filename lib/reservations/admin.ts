import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deskCounts, inFilter, legalActions, type DeskFilter } from "./admin-actions";
import { paypalMode } from "@/lib/paypal";
import { DEFAULT_POLICIES, PRODUCT_TYPES, resolvePolicy, type PaymentPolicy, type ProductType } from "./policy";
import { todayMU } from "./server";
import type { PaymentStatus, ReservationStatus } from "./status";

// ── The Reservation Center's reads and settings writes ──────────────────────
//
// Every state change goes through reservation_admin (lib/reservations/server
// adminAction), never an UPDATE from here: the database holds the transition
// map, the capacity lock and the audit trail. This file only READS, and
// writes the two settings tables the owner edits (methods, policies).

const LIST_COLUMNS =
  "id, booking_reference, reservation_status, payment_status, payment_method, payment_reported_at, payment_reported_method, " +
  "customer_name, customer_phone, customer_email, customer_locale, product_id, product_type, product_snapshot, slot, party, seats, " +
  "slot_date, amount_mur, deposit_due_mur, balance_due_mur, amount_paid_mur, payment_deadline_at, requested_at, confirmed_at, updated_at";

export type DeskRow = {
  id: string;
  booking_reference: string;
  reservation_status: ReservationStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_reported_at: string | null;
  payment_reported_method: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_locale: string;
  product_id: string;
  product_type: ProductType;
  product_snapshot: { title?: string; provider?: string | null; capacity?: number; image?: string | null; meeting_point?: string | null };
  slot: { date?: string; start_time?: string | null; notes?: string | null };
  party: { adults: number; children: number; babies: number };
  seats: number;
  slot_date: string;
  amount_mur: number | null;
  deposit_due_mur: number | null;
  balance_due_mur: number | null;
  amount_paid_mur: number;
  payment_deadline_at: string | null;
  requested_at: string;
  confirmed_at: string | null;
  updated_at: string;
  actions: ReturnType<typeof legalActions>;
};

/**
 * The desk: the most recent 500 reservations, counted and filtered here.
 * At Roulé's volume that is months of bookings in one cheap query; when it
 * stops being, the filter moves into SQL and the shape stays the same.
 */
export async function listDesk(admin: SupabaseClient, filter: DeskFilter, q: string) {
  const { data, error } = await admin.from("reservations").select(LIST_COLUMNS).order("requested_at", { ascending: false }).limit(500);
  if (error) throw error;
  const today = todayMU();
  const all = (data ?? []) as unknown as Omit<DeskRow, "actions">[];
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((r) => inFilter(r, filter, today))
    .filter(
      (r) =>
        !needle ||
        r.booking_reference.toLowerCase().includes(needle) ||
        r.customer_name.toLowerCase().includes(needle) ||
        r.customer_phone.replace(/\s+/g, "").includes(needle.replace(/\s+/g, "")) ||
        (r.product_snapshot?.title ?? "").toLowerCase().includes(needle),
    )
    // Soonest first for what is coming; newest first for everything else.
    .sort((a, b) =>
      filter === "upcoming" || filter === "today" || filter === "awaiting_payment"
        ? a.slot_date.localeCompare(b.slot_date)
        : b.requested_at.localeCompare(a.requested_at),
    )
    .map((r) => ({ ...r, actions: legalActions(r) }));
  return { counts: deskCounts(all, today), rows, today };
}

export async function readReservation(admin: SupabaseClient, id: string) {
  const [res, events, info, payments, outbox] = await Promise.all([
    admin.from("reservations").select("*").eq("id", id).maybeSingle(),
    admin.from("reservation_events").select("id, at, actor, actor_label, type, payload").eq("reservation_id", id).order("at", { ascending: true }),
    admin.from("reservation_info_requests").select("id, fields, note, asked_at, answered_at, answer").eq("reservation_id", id).order("asked_at", { ascending: true }),
    admin.from("booking_payments").select("id, amount_rupees, method, received_at, note").eq("booking_kind", "reservation").eq("booking_id", id).order("received_at", { ascending: true }),
    admin.from("reservation_outbox").select("id, audience, channel, template, status, created_at, sent_at, error").eq("reservation_id", id).order("created_at", { ascending: true }),
  ]);
  for (const r of [res, events, info, payments, outbox]) if (r.error) throw r.error;
  if (!res.data) return null;
  const row = res.data as Record<string, unknown> & { reservation_status: ReservationStatus; payment_status: PaymentStatus };
  // The token hash and the idempotency key open the guest's page: the desk
  // never needs them, so they never leave the server.
  delete row.access_token_hash;
  delete row.idempotency_key;
  return {
    reservation: { ...row, actions: legalActions(row) },
    events: events.data ?? [],
    infoRequests: info.data ?? [],
    payments: payments.data ?? [],
    outbox: outbox.data ?? [],
  };
}

// ── Settings: payment methods and policies ──────────────────────────────────

export type MethodRow = {
  id: string;
  enabled: boolean;
  channel: "online" | "in_person";
  label_i18n: Record<string, string>;
  instructions_i18n: Record<string, string>;
  sort: number;
};

export async function readSettings(admin: SupabaseClient) {
  const [m, p] = await Promise.all([
    admin.from("reservation_payment_methods").select("id, enabled, channel, label_i18n, instructions_i18n, sort").order("sort"),
    admin.from("reservation_policies").select("scope_type, scope_id, policy, updated_at"),
  ]);
  if (m.error) throw m.error;
  if (p.error) throw p.error;
  const stored = (p.data ?? []) as { scope_type: string; scope_id: string; policy: Partial<PaymentPolicy> }[];
  // Every product type, with what applies today: the owner's row or the default.
  const types = PRODUCT_TYPES.map((t) => {
    const row = stored.find((r) => r.scope_type === "product_type" && r.scope_id === t);
    return { type: t, custom: Boolean(row), policy: resolvePolicy(t, row?.policy ?? null), defaults: DEFAULT_POLICIES[t] };
  });
  const products = stored.filter((r) => r.scope_type === "product");
  // "live" | "sandbox" | "off": card and PayPal take real money only when live.
  return { methods: (m.data ?? []) as MethodRow[], types, products, paypal: paypalMode() };
}

export async function saveMethod(
  admin: SupabaseClient,
  id: string,
  patch: { enabled?: boolean; label_i18n?: Record<string, string>; instructions_i18n?: Record<string, string>; sort?: number },
) {
  // Card is processed by PayPal (M242): it can be switched on, and the booking
  // page shows it only while PayPal is live.
  const { error } = await admin
    .from("reservation_payment_methods")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function savePolicy(admin: SupabaseClient, scopeType: "product_type" | "product", scopeId: string, policy: PaymentPolicy | null) {
  if (policy === null) {
    const { error } = await admin.from("reservation_policies").delete().eq("scope_type", scopeType).eq("scope_id", scopeId);
    if (error) throw error;
    return;
  }
  const { error } = await admin
    .from("reservation_policies")
    .upsert({ scope_type: scopeType, scope_id: scopeId, policy, updated_at: new Date().toISOString() }, { onConflict: "scope_type,scope_id" });
  if (error) throw error;
}
