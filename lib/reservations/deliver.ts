import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";
import { sendReservationGuestEmail, sendReservationOwnerEmail } from "@/lib/email";
import { enqueueNotification } from "@/lib/notifications/queue";
import { ADMIN_ALERT, EMAIL_COPY, HUB_COPY, NOTIFY, type ResLang } from "./copy";
import { formatMur } from "./policy";
import { bookingPath } from "./server";

// ── The reservation engine's jobs, run by the minute worker ─────────────────
//
// /api/cron/notifications calls runReservationJobs() every minute (an external
// pinger — the three Vercel cron slots are taken). Three things, in order:
//
//   1. expire   — confirmed holds whose payment deadline passed: released,
//                 audited, the guest told (reservation_expire_due).
//   2. remind   — the day before, from 08:00 Rodrigues time, once
//                 (reservation_due_reminders).
//   3. deliver  — drain reservation_outbox: guest emails in the guest's own
//                 language with the link to their page, and the owner's alert
//                 by email + the WhatsApp queue.
//
// The database wrote every outbox row in the same transaction as the change
// it reports, so a message can be late but never describe something that
// did not happen. Each send is keyed on the outbox row, so a worker that runs
// twice — or a pinger that retries — still sends once.

const MAX_ATTEMPTS = 5;

type OutboxRow = {
  id: number;
  reservation_id: string;
  audience: "guest" | "admin";
  channel: string;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type Res = {
  id: string;
  booking_reference: string;
  idempotency_key: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_locale: string;
  product_snapshot: { title?: string; meeting_point?: string | null };
  slot: { start_time?: string | null };
  slot_date: string;
  party: { adults: number; children: number; babies: number };
  amount_mur: number | null;
  deposit_due_mur: number | null;
  amount_paid_mur: number;
  payment_deadline_at: string | null;
  payment_reported_method: string | null;
};

const LOCALE: Record<ResLang, string> = { en: "en-GB", fr: "fr-FR", cr: "fr-FR" };
const METHOD: Record<string, string> = { mcb_juice: "MCB Juice", bank_transfer: "bank transfer", paypal: "PayPal", cash_in_person: "cash" };

const lang = (l: string): ResLang => (l === "fr" || l === "cr" ? l : "en");

function dayText(iso: string, l: ResLang): string {
  return new Intl.DateTimeFormat(LOCALE[l], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

function momentText(ts: string, l: ResLang): string {
  return new Intl.DateTimeFormat(LOCALE[l], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Indian/Mauritius" }).format(new Date(ts));
}

export function guestEmailType(template: string): "reservation_update" | "reservation_payment_confirmation" | "reservation_reminder" {
  if (template === "paid") return "reservation_payment_confirmation";
  if (template === "reminder") return "reservation_reminder";
  return "reservation_update";
}

async function deliverGuest(admin: SupabaseClient, row: OutboxRow, r: Res): Promise<"sent" | "skipped" | "failed"> {
  if (!r.customer_email) return "skipped";
  const l = lang(r.customer_locale);
  const c = HUB_COPY[l];
  const render = NOTIFY[l][row.template] ?? NOTIFY.en[row.template];
  const subject = EMAIL_COPY[l].subject[row.template];
  if (!render || !subject) return "skipped";

  let field: string | undefined;
  if (row.template === "needs_info") {
    const { data } = await admin
      .from("reservation_info_requests")
      .select("fields")
      .eq("reservation_id", r.id)
      .is("answered_at", null)
      .order("asked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    field = ((data?.fields as string[] | undefined) ?? []).map((f) => c.fields[f] ?? f).join(", ").toLowerCase() || undefined;
  }

  const date = dayText(r.slot_date, l);
  const time = r.slot?.start_time ?? undefined;
  const product = r.product_snapshot?.title ?? "";
  const sentence = render({
    ref: r.booking_reference,
    product,
    name: r.customer_name,
    date,
    time,
    deadline: r.payment_deadline_at ? momentText(r.payment_deadline_at, l) : undefined,
    place: r.product_snapshot?.meeting_point ?? undefined,
    field,
  });

  const details: [string, string][] = [
    [c.details, product],
    [c.when, time ? `${date} · ${time}` : date],
    [c.people, c.party(r.party?.adults ?? 0, r.party?.children ?? 0, r.party?.babies ?? 0)],
  ];
  if (r.amount_mur != null) details.push([c.total, formatMur(r.amount_mur)]);
  if (row.template === "confirmed") {
    const due = Math.max(0, (r.deposit_due_mur ?? r.amount_mur ?? 0) - r.amount_paid_mur);
    if (due > 0) details.push([c.deposit, formatMur(due)]);
  }
  if (row.template === "reminder" && r.product_snapshot?.meeting_point) details.push([c.meeting, r.product_snapshot.meeting_point]);

  const ok = await sendReservationGuestEmail({
    outboxId: row.id,
    reservationId: r.id,
    to: r.customer_email,
    type: guestEmailType(row.template),
    reference: r.booking_reference,
    subject,
    eyebrow: EMAIL_COPY[l].eyebrow,
    sentence,
    details,
    // Rebuilt from the idempotency key: the raw token was never stored.
    link: `${SITE_URL}${bookingPath(r.idempotency_key)}`,
    cta: EMAIL_COPY[l].cta,
  });
  return ok ? "sent" : "failed";
}

async function deliverAdmin(row: OutboxRow, r: Res): Promise<"sent" | "skipped" | "failed"> {
  const render = ADMIN_ALERT[row.template];
  if (!render) return "skipped";
  const date = `${dayText(r.slot_date, "en")}${r.slot?.start_time ? ` ${r.slot.start_time}` : ""}`;
  const line = render({
    ref: r.booking_reference,
    product: r.product_snapshot?.title ?? "",
    name: r.customer_name,
    date,
    method: r.payment_reported_method ? METHOD[r.payment_reported_method] ?? r.payment_reported_method : undefined,
  });
  const subject =
    row.template === "new_request"
      ? "New request to book"
      : row.template === "payment_reported"
        ? "Guest says they paid"
        : row.template === "cash_chosen"
          ? "Guest will pay cash"
          : "Guest answered";
  // WhatsApp first: it is how the owner actually hears. One line, no "Call
  // them" after a line break (CallMeBot's firewall refuses that shape).
  await enqueueNotification({
    type: `reservation.${row.template}`,
    category: "bookings",
    message: `${line} ${SITE_URL}/admin/reservations`,
    dedupeKey: `reservation.${row.template}:${row.id}`,
  }).catch((e) => console.error("reservation whatsapp enqueue failed", e));
  const ok = await sendReservationOwnerEmail({
    outboxId: row.id,
    reservationId: r.id,
    reference: r.booking_reference,
    subject,
    line,
    details: [
      ["Guest", r.customer_name],
      ["Phone", r.customer_phone],
      ["When", date],
      ["Total", formatMur(r.amount_mur)],
    ],
    phone: r.customer_phone,
    name: r.customer_name,
  });
  return ok ? "sent" : "failed";
}

/** Drain up to `limit` pending outbox rows, stopping at `deadline` (epoch ms). */
export async function deliverReservationOutbox(
  admin: SupabaseClient,
  opts: { limit?: number; deadline?: number } = {},
): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const { data, error } = await admin
    .from("reservation_outbox")
    .select("id, reservation_id, audience, channel, template, payload, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 10);
  if (error) {
    console.error("reservation outbox read failed", error);
    return out;
  }
  for (const row of (data ?? []) as OutboxRow[]) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    // Claim by bumping attempts from the value we read: a second worker that
    // read the same row finds nothing to update and moves on.
    const { data: claimed } = await admin
      .from("reservation_outbox")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("attempts", row.attempts)
      .select("id");
    if (!claimed?.length) continue;

    let result: "sent" | "skipped" | "failed" = "failed";
    let err: string | null = null;
    try {
      const { data: r } = await admin
        .from("reservations")
        .select(
          "id, booking_reference, idempotency_key, customer_name, customer_phone, customer_email, customer_locale, product_snapshot, slot, slot_date, party, amount_mur, deposit_due_mur, amount_paid_mur, payment_deadline_at, payment_reported_method",
        )
        .eq("id", row.reservation_id)
        .maybeSingle();
      if (!r) result = "skipped";
      else result = row.audience === "guest" ? await deliverGuest(admin, row, r as Res) : await deliverAdmin(row, r as Res);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      console.error("reservation outbox delivery threw", { id: row.id, err });
    }
    out[result] += 1;
    const final = result === "failed" && row.attempts + 1 < MAX_ATTEMPTS ? null : result;
    await admin
      .from("reservation_outbox")
      .update(
        final
          ? { status: final, sent_at: final === "sent" ? new Date().toISOString() : null, error: err ?? (final === "failed" ? "send failed" : null) }
          : { error: err ?? "send failed — will retry" },
      )
      .eq("id", row.id);
  }
  return out;
}

/** Everything the reservation engine needs from the minute worker. Never throws. */
export async function runReservationJobs(admin: SupabaseClient, opts: { deadline?: number } = {}) {
  const result: { expired: unknown; reminders: unknown; delivered: { sent: number; skipped: number; failed: number } | null } = {
    expired: null,
    reminders: null,
    delivered: null,
  };
  try {
    const { data, error } = await admin.rpc("reservation_expire_due", { p_limit: 100 });
    if (error) console.error("reservation_expire_due failed", error);
    else result.expired = data;
  } catch (e) {
    console.error("reservation_expire_due threw", e);
  }
  try {
    const { data, error } = await admin.rpc("reservation_due_reminders", { p_limit: 50 });
    if (error) console.error("reservation_due_reminders failed", error);
    else result.reminders = data;
  } catch (e) {
    console.error("reservation_due_reminders threw", e);
  }
  try {
    result.delivered = await deliverReservationOutbox(admin, { limit: 10, deadline: opts.deadline });
  } catch (e) {
    console.error("reservation outbox threw", e);
  }
  return result;
}
