import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_LEGS } from "@/lib/delivery/request-status";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import {
  ACTION_RISK,
  accountStateOf,
  computeStats,
  describeAction,
  effectiveAvailability,
  isBulkAllowed,
  missingProfileFields,
  needsReason,
  onboardingOf,
  storeIsOpen,
  storedAccountValue,
  verificationOf,
  type AccountState,
  type PeopleAction,
  type PersonKind,
  capabilitiesOf,
  PERSON_KINDS,
  type PersonRow,
} from "@/lib/admin/people";

// ── The People & Operations desk, server side ───────────────────────────────
//
// Merchants and delivery partners live in different tables with different
// columns and the same OPERATIONS: look at them, filter them, change what they
// are allowed to do, and leave a trail. One route, because two routes doing the
// same four things is two places for the authorisation to differ.
//
// ── WHY THE WHOLE LIST IS LOADED AND FILTERED IN THE BROWSER ────────────────
// There are single digits of merchants and drivers on this platform, and the
// desk needs counters that describe the WHOLE population ("3 awaiting
// verification") next to a filtered table. Paging in SQL would mean a second
// round of aggregate queries to answer the counters, and a filter that changes
// the counts under the operator. Loading a few hundred rows once is faster,
// simpler and honest at this size. `PAGE_SIZE` and `paginate()` already exist
// for when it stops being true — the pure layer does not care where the rows
// came from.

const FEATURE = "The People & Operations desk";

/** Merchants, with the shops that tell us whether they are actually trading. */
async function loadMerchants(admin: Awaited<ReturnType<typeof getAdmin>>): Promise<PersonRow[]> {
  const { data: merchants, error } = await admin
    .from("merchants")
    .select(
      "id, display_name, legal_name, contact_email, contact_phone, status, kyc_status, created_at, system_key, owner_id, invite_email, invited_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  const ids = (merchants ?? []).map((m) => m.id as string);
  const { data: stores } = ids.length
    ? await admin.from("stores").select("id, merchant_id, status, category_hint").in("merchant_id", ids)
    : { data: [] as { merchant_id: string; status: string; category_hint: string | null }[] };

  return (merchants ?? [])
    // The platform's own merchant — the one M40 created so event stores have an
    // owner — is machinery, not a person. Showing it invites somebody to
    // suspend it and take every event off sale.
    .filter((m) => !m.system_key)
    .map((m) => {
      const account = accountStateOf("merchant", m.status as string);
      const mine = (stores ?? []).filter((s) => s.merchant_id === m.id);
      const verification = verificationOf(m.kyc_status as string);
      const email = (m.contact_email as string) ?? "";
      const phone = (m.contact_phone as string) ?? "";
      const segment = mine.find((s) => s.category_hint)?.category_hint ?? "";
      return {
        id: m.id as string,
        kind: "merchant" as const,
        name: (m.display_name as string) ?? "",
        subtitle: (m.legal_name as string) ?? "",
        email,
        phone,
        account,
        verification,
        segment,
        storesTotal: mine.length,
        storesOpen: mine.filter((s) => storeIsOpen(account, s.status)).length,
        joinedAt: (m.created_at as string) ?? "",
        // owner_id is the whole test for "has a real person taken this over?".
        // Before M108 it could not be null, so every merchant was claimed by
        // definition and the question did not exist.
        claimed: !!m.owner_id,
        inviteEmail: (m.invite_email as string) ?? null,
        invitedAt: (m.invited_at as string) ?? null,
        onboarding: onboardingOf({
          claimed: !!m.owner_id,
          inviteEmail: m.invite_email as string | null,
          profileComplete: missingProfileFields("merchant", { email, phone, segment }).length === 0,
          verification,
        }),
      };
    });
}

/**
 * Delivery partners.
 *
 * A driver has no KYC enum, so verification is DERIVED from what the schema
 * really records: a licence reference means they submitted something, and
 * `approved_at` means a human checked it. Inventing a column would have been
 * the easier route and would have left two sources of truth for the same fact.
 */
async function loadDrivers(admin: Awaited<ReturnType<typeof getAdmin>>): Promise<PersonRow[]> {
  const { data, error } = await admin
    .from("delivery_drivers")
    .select(
      "id, full_name, phone, vehicle_type, vehicle_details, licence_reference, status, availability, approved_at, created_at, user_id, invite_email, invited_at, can_deliver, can_run_errands",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((d) => {
    const account = accountStateOf("driver", d.status as string);
    const hasLicence = !!(d.licence_reference as string | null)?.trim();
    const verification = d.approved_at
      ? ("verified" as const)
      : hasLicence
        ? ("submitted" as const)
        : ("unsubmitted" as const);
    // A driver has no email column of its own — the address only exists while
    // the invitation is outstanding, and after that it lives on auth.users.
    const email = ((d.invite_email as string) ?? "").trim();
    const phone = (d.phone as string) ?? "";
    const segment = (d.vehicle_type as string) ?? "";
    return {
      id: d.id as string,
      kind: "driver" as const,
      name: (d.full_name as string) ?? "",
      subtitle: (d.vehicle_details as string) ?? "",
      email,
      phone,
      account,
      verification,
      segment,
      availability: effectiveAvailability(account, d.availability as string),
      // Deliveries and errands are CAPABILITIES of one person, not two kinds of
      // person — so they ride on the row as chips rather than splitting the
      // same human across two tabs where an admin could approve one half.
      capabilities: capabilitiesOf({
        canDeliver: d.can_deliver as boolean | null,
        canRunErrands: d.can_run_errands as boolean | null,
      }),
      joinedAt: (d.created_at as string) ?? "",
      claimed: !!d.user_id,
      inviteEmail: (d.invite_email as string) ?? null,
      invitedAt: (d.invited_at as string) ?? null,
      onboarding: onboardingOf({
        claimed: !!d.user_id,
        inviteEmail: d.invite_email as string | null,
        // An email address is not required of a driver who signed themselves
        // up, so it is not counted as missing for one.
        profileComplete: missingProfileFields("driver", { email: email || "n/a", phone, segment }).length === 0,
        verification,
      }),
    };
  });
}

/**
 * Restaurants.
 *
 * A kitchen hangs off a STORE, and every kitchen on the island hangs off the
 * one platform merchant — so the merchant list cannot show them (it filters
 * system_key out, correctly, because that merchant is machinery). They were
 * therefore invisible to this desk entirely.
 *
 * The person here is the STORE: its name is the restaurant's name, its owner is
 * the cook, and its status is what decides whether it trades.
 */
async function loadKitchens(admin: Awaited<ReturnType<typeof getAdmin>>): Promise<PersonRow[]> {
  const { data, error } = await admin
    .from("food_kitchens")
    .select(
      "store_id, pickup_hint, created_at, stores!inner(id, name, status, phone, whatsapp, created_at)",
    );
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((k) => {
    const store = (Array.isArray(k.stores) ? k.stores[0] : k.stores) as Record<string, unknown>;
    const account = accountStateOf("merchant", store?.status as string);
    const phone = ((store?.phone as string) ?? (store?.whatsapp as string) ?? "").trim();
    const segment = ((k.pickup_hint as string) ?? "").trim();
    return {
      id: k.store_id as string,
      kind: "kitchen" as const,
      name: (store?.name as string) ?? "",
      subtitle: segment,
      email: "",
      phone,
      account,
      // A kitchen carries no KYC of its own: the merchant it hangs off does.
      verification: "verified" as const,
      segment,
      joinedAt: (store?.created_at as string) ?? (k.created_at as string) ?? "",
      claimed: true,
      inviteEmail: null,
      invitedAt: null,
      onboarding: onboardingOf({
        claimed: true,
        inviteEmail: null,
        profileComplete:
          missingProfileFields("kitchen", { email: "n/a", phone, segment }).length === 0,
        verification: "verified",
      }),
    };
  });
}

/** Event organisers. Their own table, their own invitation flow, and until now
 *  no row on the desk that manages everybody else. */
async function loadOrganizers(admin: Awaited<ReturnType<typeof getAdmin>>): Promise<PersonRow[]> {
  const { data, error } = await admin
    .from("event_organizers")
    // The real column names. event_organizers has display_name and
    // contact_phone — there is no `name`, no `contact_email` and no
    // `invited_at`, and a select naming them fails at runtime where TypeScript
    // cannot see it.
    .select("id, display_name, contact_phone, status, created_at, user_id, invite_email, is_test")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[])
    .filter((o) => !o.is_test)
    .map((o) => {
      const account = accountStateOf("merchant", o.status as string);
      // An organiser's address exists only while the invitation is
      // outstanding, exactly like a driver's.
      const email = ((o.invite_email as string) ?? "").trim();
      const phone = ((o.contact_phone as string) ?? "").trim();
      return {
        id: o.id as string,
        kind: "organizer" as const,
        name: (o.display_name as string) ?? "",
        subtitle: "",
        email,
        phone,
        account,
        verification: "verified" as const,
        segment: "",
        joinedAt: (o.created_at as string) ?? "",
        claimed: !!o.user_id,
        inviteEmail: (o.invite_email as string) ?? null,
        // No invited_at column on this table; the row is created BY the
        // invitation, so its creation IS when they were invited.
        invitedAt: (o.created_at as string) ?? null,
        onboarding: onboardingOf({
          claimed: !!o.user_id,
          inviteEmail: o.invite_email as string | null,
          profileComplete:
            missingProfileFields("organizer", { email: email || "n/a", phone, segment: "n/a" })
              .length === 0,
          verification: "verified",
        }),
      };
    });
}

async function getAdmin() {
  const { getPrivileged } = await import("@/lib/supabase/admin");
  return getPrivileged();
}

function kindOf(v: unknown): PersonKind | null {
  // Read from the single list rather than a hand-written OR chain, which is how
  // two new kinds could have been added to the model and silently rejected here.
  return PERSON_KINDS.includes(v as PersonKind) ? (v as PersonKind) : null;
}


// ── One person, in depth ────────────────────────────────────────────────────
//
// ── ONLY WHAT IS REALLY MEASURED ───────────────────────────────────────────
// Every number below is counted from a table that exists. Nothing is estimated
// and nothing defaults to zero: a metric with no source is returned as `null`
// and the screen says "not measured" rather than "0", because a confident zero
// is worse than an honest gap — it looks like a merchant who sold nothing.
type PersonDetail = {
  operations: Record<string, unknown>;
  performance: Record<string, number | null>;
  activity: { id: string; action: string; at: string; diff: unknown }[];
};

async function loadDetail(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  kind: PersonKind,
  id: string,
): Promise<PersonDetail> {
  // The trail for this person. Best-effort: a detail panel that fails because
  // the log is unreadable is worse than one without a timeline.
  let activity: PersonDetail["activity"] = [];
  try {
    const { data } = await admin
      .from("audit_logs")
      .select("id, action, created_at, diff")
      .eq("entity_type", kind)
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(40);
    activity = (data ?? []).map((a) => ({
      id: String(a.id),
      action: a.action as string,
      at: a.created_at as string,
      diff: a.diff,
    }));
  } catch {
    /* timeline unavailable */
  }

  if (kind === "driver") {
    const { data: m } = await admin
      .from("driver_metrics")
      .select("offers_received, offers_accepted, deliveries_completed, deliveries_failed, driver_cancellations, on_time_deliveries, rating_sum, rating_count")
      .eq("driver_id", id)
      .maybeSingle();
    const { data: live } = await admin
      .from("deliveries")
      .select("id, status, created_at")
      .eq("driver_id", id)
      .in("status", [...ACTIVE_LEGS])
      .limit(5);

    // No metrics row means nothing has been measured yet — NOT zero of
    // everything. A driver who has never been offered a job has no completion
    // rate, and showing 0% would read as a failing one.
    const completed = m?.deliveries_completed ?? null;
    const offers = m?.offers_received ?? null;
    const ratings = m?.rating_count ?? 0;
    return {
      operations: { activeAssignments: live ?? [] },
      performance: {
        completed,
        failed: m?.deliveries_failed ?? null,
        cancellations: m?.driver_cancellations ?? null,
        acceptanceRate:
          offers && offers > 0 && m ? Math.round((m.offers_accepted / offers) * 100) : null,
        onTimeRate:
          completed && completed > 0 && m ? Math.round((m.on_time_deliveries / completed) * 100) : null,
        rating: ratings > 0 && m ? Math.round((m.rating_sum / ratings) * 10) / 10 : null,
        ratingCount: ratings || null,
      },
      activity,
    };
  }

  // Merchants: what they own, and what has actually been ordered from them.
  const { data: stores } = await admin
    .from("stores")
    .select("id, name, slug, status, category_hint")
    .eq("merchant_id", id);
  const storeIds = (stores ?? []).map((s) => s.id as string);

  let orders: { status: string }[] = [];
  let products: number | null = null;
  if (storeIds.length) {
    const { data: o } = await admin.from("orders").select("status").in("store_id", storeIds);
    orders = (o ?? []) as { status: string }[];
    const { count } = await admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .in("store_id", storeIds);
    products = count ?? null;
  } else {
    // No shops is a real answer, and zero products is true rather than unknown.
    products = 0;
  }

  const { data: sub } = await admin
    .from("merchant_subscriptions")
    .select("plan, status, current_period_end")
    .eq("merchant_id", id)
    .maybeSingle();

  return {
    operations: { stores: stores ?? [], subscription: sub ?? null },
    performance: {
      orders: orders.length,
      completed: orders.filter((o) => o.status === "completed" || o.status === "fulfilled").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      products,
    },
    activity,
  };
}

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, FEATURE);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const kind = kindOf(req.nextUrl.searchParams.get("kind") ?? "merchant");
  if (!kind) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });

  // ?id=… asks for one person in depth rather than the list.
  const detailId = req.nextUrl.searchParams.get("id");

  try {
    if (detailId) {
      return NextResponse.json(await loadDetail(admin, kind, detailId));
    }
    // One loader per kind, chosen by an exhaustive record rather than a chain
    // of ternaries — a fifth kind then fails the build here rather than
    // silently falling through to merchants.
    const LOADERS: Record<PersonKind, (a: typeof admin) => Promise<PersonRow[]>> = {
      merchant: loadMerchants,
      driver: loadDrivers,
      kitchen: loadKitchens,
      organizer: loadOrganizers,
    };
    const rows = await LOADERS[kind](admin);
    return NextResponse.json({ rows, stats: computeStats(rows, kind) });
  } catch (err) {
    return failed(err, `Could not load ${kind === "merchant" ? "merchants" : "delivery partners"}.`);
  }
}

// ── Mutations ───────────────────────────────────────────────────────────────

type Mutation = { kind: unknown; ids: unknown; action: unknown; reason?: unknown };

/** Apply one action to one person. Returns the audit diff, or throws. */
async function applyOne(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  kind: PersonKind,
  id: string,
  action: PeopleAction,
  reason: string,
): Promise<Record<string, unknown>> {
  const table = kind === "merchant" ? "merchants" : "delivery_drivers";
  const statusColumn = "status";

  // Read BEFORE, so the trail records what actually changed rather than what
  // was requested. "suspend" applied to somebody already suspended should read
  // as a no-op in the log, not as a change.
  const { data: before, error: readErr } = await admin
    .from(table)
    .select(kind === "merchant" ? "id, status, kyc_status" : "id, status, approved_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!before) throw new Error("That record no longer exists.");

  if (action === "verify" || action === "reject_verification") {
    if (kind === "merchant") {
      const next = action === "verify" ? "approved" : "rejected";
      const { error } = await admin.from("merchants").update({ kyc_status: next }).eq("id", id);
      if (error) throw error;
      return { kyc_status: { from: (before as { kyc_status?: string }).kyc_status, to: next } };
    }
    // A driver's verification IS the approval timestamp — see loadDrivers.
    const next = action === "verify" ? new Date().toISOString() : null;
    const { error } = await admin.from("delivery_drivers").update({ approved_at: next }).eq("id", id);
    if (error) throw error;
    return { approved_at: { from: (before as { approved_at?: string }).approved_at, to: next } };
  }

  const nextState: AccountState =
    action === "activate" ? "active" : action === "suspend" ? "suspended" : "deactivated";
  const stored = storedAccountValue(kind, nextState);

  const patch: Record<string, unknown> = { [statusColumn]: stored };
  // Drivers carry the reason on the row, which is what the driver themselves is
  // shown. Merchants have no such column, so the reason lives in the audit
  // trail only — recorded either way, never dropped.
  if (kind === "driver") patch.status_reason = reason || null;

  const { error } = await admin.from(table).update(patch).eq("id", id);
  if (error) throw error;

  return {
    status: { from: (before as { status?: string }).status, to: stored },
    ...(reason ? { reason } : {}),
  };
}

/** One person, one action. */
export async function PATCH(req: NextRequest) {
  const gate = await guardAdminApi(req, FEATURE);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { kind: rawKind, ids, action: rawAction, reason } = (body ?? {}) as Mutation;

  const kind = kindOf(rawKind);
  const action = rawAction as PeopleAction;
  const id = Array.isArray(ids) ? String(ids[0] ?? "") : String(ids ?? "");
  if (!kind || !id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (!(action in ACTION_RISK) || action === "delete") {
    // Deleting is not this route's job. It has its own, with a dependency check
    // and a typed confirmation — see lib/admin/merchant-delete.ts.
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const why = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (needsReason(action) && !why) {
    return NextResponse.json(
      { error: "This action needs a reason. It is recorded in the audit trail." },
      { status: 422 },
    );
  }

  try {
    const diff = await applyOne(admin, kind, id, action, why);
    await audit(admin, { action: `people.${action}`, entityType: kind, entityId: id, diff });
    return NextResponse.json({ success: true });
  } catch (err) {
    return failed(err, "That change could not be saved.");
  }
}

/**
 * Many people, one action.
 *
 * ── WHAT THIS REFUSES ─────────────────────────────────────────────────────
 * `isBulkAllowed` is checked HERE and not only in the screen that hides the
 * button. A bulk delete is the shape of mistake that ends a marketplace, and a
 * front-end that omits a button is not a security control.
 *
 * Failures are per-person and reported, not rolled back. Suspending eight
 * merchants where the third no longer exists should suspend seven and say so —
 * an all-or-nothing transaction would leave the operator with nothing done and
 * no idea which row was the problem.
 */
export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, FEATURE);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { kind: rawKind, ids, action: rawAction, reason } = (body ?? {}) as Mutation;

  const kind = kindOf(rawKind);
  const action = String(rawAction ?? "");
  if (!kind) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
  if (!isBulkAllowed(action)) {
    return NextResponse.json(
      { error: "That action cannot be applied to more than one person at a time." },
      { status: 400 },
    );
  }

  const list = Array.isArray(ids) ? ids.map((v) => String(v)).filter(Boolean).slice(0, 200) : [];
  if (!list.length) return NextResponse.json({ error: "Nobody was selected." }, { status: 400 });

  const why = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (needsReason(action as PeopleAction) && !why) {
    return NextResponse.json(
      { error: "This action needs a reason. It is recorded in the audit trail." },
      { status: 422 },
    );
  }

  let done = 0;
  const failures: { id: string; error: string }[] = [];
  for (const id of list) {
    try {
      const diff = await applyOne(admin, kind, id, action as PeopleAction, why);
      await audit(admin, { action: `people.${action}`, entityType: kind, entityId: id, diff });
      done += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "failed" });
    }
  }

  // One summary line for the trail as well, so "who suspended eight merchants
  // on Tuesday" is answerable without reading eight rows.
  await audit(admin, {
    action: `people.bulk.${action}`,
    entityType: kind,
    entityId: null,
    diff: { requested: list.length, applied: done, failed: failures.length, ...(why ? { reason: why } : {}) },
  });

  return NextResponse.json({
    success: failures.length === 0,
    applied: done,
    failed: failures,
    summary: describeAction(action as PeopleAction, kind, done).title,
  });
}
