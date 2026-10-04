import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { vehicleName } from "@/lib/vehicle-name";
import { IN_PROGRESS_LEGS } from "@/lib/delivery/clear";
import {
  vehicleToActivity, placeToActivity,
  rideToActivity, deliveryToActivity, serviceToActivity,
  compareActivities, type Activity,
} from "@/lib/activity";

// Everything a SIGNED-IN customer has booked, from every backend except
// `orders`, as one list.
//
// ── NO ORDERS HERE (architecture review 2026-09-30, item 5) ────────────────
// This read `orders` too, with the service role, 50 rows on every /orders
// load — and its only caller, app/orders/page.tsx, threw every one away
// (`kind !== "order"`), because it lists orders itself on the customer's own
// session, paginated and searchable, under RLS. A privileged read nobody uses
// is a cost and a risk with no reader, so it is gone. A caller that ever wants
// orders in this feed should read them on the user's session, as that page does.
//
// ── WHY THIS IS SAFE HERE AND NOT ON THE GUEST PAGE ────────────────────────
// The guest lookup is deliberately two-factor and returns only the one item
// that matched, because an email address is not a secret. A signed-in customer
// is the opposite case: auth.uid() and the verified address on the session
// PROVE who they are, so showing everything is exactly right.
//
// The email is taken from the session — never from a query string, a form or a
// prop that a caller could have chosen. That is the whole security property of
// this module, and it is why the parameter is documented as "verified".
//
// ── WHY IT NEEDS THE SERVICE ROLE ──────────────────────────────────────────
// `bookings` and `place_bookings` are the original lead-gen tables: since M221
// only the service role writes them, and RLS lets no client read them. They
// have no customer_id column at all — they predate Supabase Auth on this project and
// are keyed by EMAIL. So there is no RLS policy that could express "this
// signed-in user's rentals", and weakening one to invent it would open those
// tables far wider than this page needs. Reading them with the service role,
// filtered by the session's verified email, is narrower than any policy that
// would have worked.
//
// ── A CLEAR ON /deliver MEANS THE SAME HERE (architecture review 2026-09-30,
//    item 1) ──────────────────────────────────────────────────────────────────
// M227 lets a customer clear a request from "Your requests" with a marker row
// in delivery_request_hidden; only my_delivery_requests() read it, so a request
// cleared there was still listed on this page. The marker is read here too and
// a cleared request is left out — EXCEPT while a delivery leg is in progress
// (lib/delivery/clear.ts, IN_PROGRESS_LEGS, the list M227's SQL refuses to
// clear): a job with a driver on it must never vanish from the customer who is
// waiting for it. Archived requests (M193 archived_at) are NOT filtered: this
// page is "the full history on this account", and archiving is housekeeping,
// not the customer's choice.

export type ActivityFeed = {
  activities: Activity[];
  /** True when a source could not be read — or a delivery's legs could not,
   *  so its stage may be behind — and the UI says so rather than implying the
   *  customer has no bookings, or that a finished job is still coming. */
  partial: boolean;
};

export async function listActivitiesForCustomer(opts: {
  /** From auth.getUser(). NEVER from a request parameter. */
  verifiedEmail: string | null;
  /** auth.uid(): delivery requests and trade appointments carry it. */
  userId: string;
}): Promise<ActivityFeed> {
  const today = new Date().toISOString().split("T")[0];
  const activities: Activity[] = [];
  let partial = false;

  if (!hasServiceRole()) {
    // Without the key the two legacy tables are unreadable. Say so upstream
    // rather than rendering "no bookings" at a customer who has three.
    return { activities, partial: true };
  }

  const admin = await getPrivileged();
  const email = opts.verifiedEmail?.trim().toLowerCase() ?? "";

  const [vehicles, places, rides, deliveriesMine, deliveriesGuest, bookings] =
    await Promise.all([
    email
      ? admin
          .from("bookings")
          // total_amount + pay_in_person (M220): a booking paid in person shows
          // what is still to pay, not an unpaid deposit as if it were paid.
          .select("id, scooter, start_date, end_date, status, amount_paid, deposit_amount, total_amount, pay_in_person, email")
          .ilike("email", email)
          .order("start_date", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    email
      ? admin
          .from("place_bookings")
          .select("id, place_name, category, start_date, end_date, status, deposit_paid_at, amount_paid, deposit_amount, pay_in_person, email")
          .ilike("email", email)
          .order("start_date", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    // ── THE TWO THAT MADE PEOPLE TYPE A REFERENCE ──────────────────────────
    // A taxi and a delivery are as much "a thing I booked" as a scooter is,
    // and both were absent here — so a signed-in customer was sent to a lookup
    // box to key in a reference for something the site already knew was theirs.
    //
    // Rides are keyed by email only: ride_requests predates accounts here and
    // has no customer_id, exactly like bookings and place_bookings above.
    email
      ? admin
          .from("ride_requests")
          .select("id, service, pickup_label, dropoff_label, scheduled_at, created_at, quoted_price, currency, status, customer_email")
          .ilike("customer_email", email)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    // Deliveries can be claimed two ways, and BOTH must be asked for: a
    // customer who requested one while signed in has customer_id, and one who
    // requested it as a guest before signing up has only guest_email. Matching
    // on the id alone would hide a customer's own earlier requests from them.
    // expires_at: an open request past it is expired, whatever the sweep did.
    admin
      .from("delivery_requests")
      .select("id, what, pickup_text, dropoff_text, created_at, status, expires_at")
      .eq("customer_id", opts.userId)
      .order("created_at", { ascending: false })
      .limit(50),
    // The guest half, as its OWN query rather than an .or() string. Building
    // `guest_email.ilike.${email}` would splice a value into PostgREST filter
    // SYNTAX, where a comma ends the term — the same class of mistake this file
    // already documents for M11. Two queries and a de-duplicate cost one round
    // trip and leave nothing to escape.
    email
      ? admin
          .from("delivery_requests")
          .select("id, what, pickup_text, dropoff_text, created_at, status, expires_at")
          .ilike("guest_email", email)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    // ── APPOINTMENTS WITH A TRADE (M179) ───────────────────────────────
    // Matched on created_by ALONE, and there is no guest half to add: the
    // public booking door deliberately takes no email and no account, so a
    // guest booking is keyed only by a telephone number. Matching on a phone
    // would mean showing one person's appointment to whoever typed the same
    // number, which is a worse failure than not listing it — and the
    // confirmation screen already tells a guest to ring the provider.
    admin
      .from("service_bookings")
      .select("id, service_name, starts_at, status, stores(name, slug)")
      .eq("created_by", opts.userId)
      .order("starts_at", { ascending: false })
      .limit(50),
  ]);

  if (vehicles.error) { console.error("activity feed: bookings failed", vehicles.error); partial = true; }
  if (places.error) { console.error("activity feed: place_bookings failed", places.error); partial = true; }
  if (rides.error) { console.error("activity feed: ride_requests failed", rides.error); partial = true; }
  if (deliveriesMine.error) { console.error("activity feed: delivery_requests (account) failed", deliveriesMine.error); partial = true; }
  if (deliveriesGuest.error) { console.error("activity feed: delivery_requests (guest) failed", deliveriesGuest.error); partial = true; }
  if (bookings.error) { console.error("activity feed: service_bookings failed", bookings.error); partial = true; }

  // `ilike` with a plain address is an exact match — the string carries no
  // wildcards. It is used rather than `eq` only to be case-insensitive, and the
  // value is the session's own email, so there is no caller-controlled pattern
  // here (contrast M11, where a caller-supplied '%' matched every row).
  for (const row of (vehicles.data ?? []) as Record<string, unknown>[]) {
    activities.push(
      vehicleToActivity(
        {
          id: String(row.id),
          scooter: row.scooter as string | null,
          vehicleLabel: await vehicleName(String(row.scooter ?? "")),
          start_date: row.start_date as string | null,
          end_date: row.end_date as string | null,
          status: row.status as string | null,
          amount_paid: row.amount_paid as number | null,
          deposit_amount: row.deposit_amount as number | null,
          total_amount: row.total_amount as number | null,
          pay_in_person: row.pay_in_person as boolean | null,
        },
        today,
      ),
    );
  }

  for (const row of (places.data ?? []) as Record<string, unknown>[]) {
    activities.push(
      placeToActivity(
        {
          id: String(row.id),
          place_name: row.place_name as string | null,
          category: row.category as string | null,
          start_date: row.start_date as string | null,
          end_date: row.end_date as string | null,
          status: row.status as string | null,
          deposit_paid_at: row.deposit_paid_at as string | null,
          amount_paid: row.amount_paid as number | null,
          deposit_amount: row.deposit_amount as number | null,
          pay_in_person: row.pay_in_person as boolean | null,
        },
        today,
      ),
    );
  }

  for (const row of (rides.data ?? []) as Record<string, unknown>[]) {
    activities.push(
      rideToActivity({
        id: String(row.id),
        service: row.service as string | null,
        pickup_label: row.pickup_label as string | null,
        dropoff_label: row.dropoff_label as string | null,
        scheduled_at: row.scheduled_at as string | null,
        created_at: row.created_at as string | null,
        quoted_price: row.quoted_price as number | null,
        currency: row.currency as string | null,
        status: row.status as string | null,
      }),
    );
  }

  // The two delivery queries can return the SAME request — somebody who asked
  // as a guest and later signed up with that address matches both. Keyed by id
  // so it appears once.
  const deliveryRows = new Map<string, Record<string, unknown>>();
  for (const list of [deliveriesMine.data ?? [], deliveriesGuest.data ?? []]) {
    for (const row of list as Record<string, unknown>[]) {
      deliveryRows.set(String(row.id), row);
    }
  }
  const facts = await readDeliveryFacts(admin, [...deliveryRows.keys()]);
  // The customer is told the list may be behind rather than shown "Driver
  // booked" on a job that has ended, with nothing to say it could be stale.
  // Only accepted requests have legs, so only they can be behind.
  const anyAccepted = [...deliveryRows.values()].some((r) => r.status === "accepted");
  if (!facts.legsKnown && anyAccepted) partial = true;

  for (const row of deliveryRows.values()) {
    const id = String(row.id);
    if (clearedAndIdle(id, row.status as string | null, facts)) continue;
    const legs = facts.legs.get(id);
    activities.push(
      deliveryToActivity({
        id,
        what: row.what as string | null,
        pickup_text: row.pickup_text as string | null,
        dropoff_text: row.dropoff_text as string | null,
        created_at: row.created_at as string | null,
        status: row.status as string | null,
        expires_at: row.expires_at as string | null,
        // Newest first (see readDeliveryFacts), as my_delivery_requests()
        // picks it: `order by d.created_at desc limit 1`.
        delivery_status: legs?.[0] ?? null,
      }),
    );
  }

  for (const row of (bookings.data ?? []) as Record<string, unknown>[]) {
    const store = (Array.isArray(row.stores) ? row.stores[0] : row.stores) as
      | { name?: string; slug?: string }
      | null;
    activities.push(
      serviceToActivity({
        id: String(row.id),
        service_name: row.service_name as string | null,
        starts_at: row.starts_at as string | null,
        status: row.status as string | null,
        store_name: store?.name ?? null,
        store_slug: store?.slug ?? null,
      }),
    );
  }

  return { activities: activities.sort(compareActivities), partial };
}

// ── The two facts a delivery row does not carry ─────────────────────────────
// Whether the customer cleared it (M227's marker), and where its deliveries
// are (every leg, newest first). One round trip for both, and none at all for
// a customer who has never asked for a delivery.
type DeliveryFacts = {
  hidden: Set<string>;
  /** request id -> its deliveries.status values, newest first. */
  legs: Map<string, string[]>;
  /** False when the legs could not be read: nothing is known to be over. */
  legsKnown: boolean;
};

async function readDeliveryFacts(admin: SupabaseClient, ids: string[]): Promise<DeliveryFacts> {
  const facts: DeliveryFacts = { hidden: new Set(), legs: new Map(), legsKnown: true };
  if (ids.length === 0) return facts;

  const [marks, legs] = await Promise.all([
    // Service role only: the table has RLS on, no policies and no client
    // grants (M227), exactly as it should stay.
    admin.from("delivery_request_hidden").select("request_id").in("request_id", ids),
    admin
      .from("deliveries")
      .select("request_id, status, created_at")
      .in("request_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  if (marks.error) {
    // Fails OPEN: a cleared request shows again, which is the old behaviour
    // and loses nothing. Hiding on a failed read could hide a live job.
    console.error("activity feed: delivery_request_hidden failed", marks.error);
  } else {
    for (const m of (marks.data ?? []) as { request_id: string }[]) facts.hidden.add(String(m.request_id));
  }

  if (legs.error) {
    console.error("activity feed: deliveries failed", legs.error);
    facts.legsKnown = false;
  } else {
    for (const d of (legs.data ?? []) as { request_id: string; status: string }[]) {
      const list = facts.legs.get(String(d.request_id)) ?? [];
      list.push(String(d.status));
      facts.legs.set(String(d.request_id), list);
    }
  }
  return facts;
}

/**
 * Cleared by the customer, and nobody is on it. ANY leg in progress keeps it
 * listed — the same test set_delivery_request_hidden() applies before it
 * accepts a clear, so a request that was cleared while open and accepted later
 * (the tracker link still works) comes back the moment a driver has it.
 */
function clearedAndIdle(id: string, status: string | null, facts: DeliveryFacts): boolean {
  if (!facts.hidden.has(id)) return false;
  // Legs unknown: only an accepted request can have a driver on it, so only
  // that one stays listed on doubt.
  if (!facts.legsKnown) return status !== "accepted";
  const legs = facts.legs.get(id) ?? [];
  return !legs.some((s) => (IN_PROGRESS_LEGS as readonly string[]).includes(s));
}
