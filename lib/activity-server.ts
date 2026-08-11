import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { vehicleName } from "@/lib/vehicle-name";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import {
  vehicleToActivity, placeToActivity, orderToActivity,
  compareActivities, type Activity,
} from "@/lib/activity";

// Everything a SIGNED-IN customer has booked or ordered, from all three
// backends, as one list.
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
// `bookings` and `place_bookings` are the original lead-gen tables: anon may
// INSERT and nobody may SELECT. They have no customer_id column at all — they
// predate Supabase Auth on this project and are keyed by EMAIL. So there is no
// RLS policy that could express "this signed-in user's rentals", and weakening
// one to invent it would open those tables far wider than this page needs.
// Reading them with the service role, filtered by the session's verified email,
// is narrower than any policy that would have worked.

export type ActivityFeed = {
  activities: Activity[];
  /** True when the rental/place tables could not be read, so the UI can say so
   *  rather than implying the customer has no bookings. */
  partial: boolean;
};

export async function listActivitiesForCustomer(opts: {
  /** From auth.getUser(). NEVER from a request parameter. */
  verifiedEmail: string | null;
  /** auth.uid(), used for the orders table which does have customer_id. */
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

  const [vehicles, places, orders] = await Promise.all([
    email
      ? admin
          .from("bookings")
          .select("id, scooter, start_date, end_date, status, amount_paid, deposit_amount, email")
          .ilike("email", email)
          .order("start_date", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    email
      ? admin
          .from("place_bookings")
          .select("id, place_name, category, start_date, end_date, status, deposit_paid_at, amount_paid, deposit_amount, email")
          .ilike("email", email)
          .order("start_date", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("orders")
      .select("id, order_number, status, total, currency, placed_at, created_at, stores(name)")
      .eq("customer_id", opts.userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (vehicles.error) { console.error("activity feed: bookings failed", vehicles.error); partial = true; }
  if (places.error) { console.error("activity feed: place_bookings failed", places.error); partial = true; }
  if (orders.error) { console.error("activity feed: orders failed", orders.error); partial = true; }

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
        },
        today,
      ),
    );
  }

  for (const row of (orders.data ?? []) as Record<string, unknown>[]) {
    const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    activities.push(
      orderToActivity(
        {
          id: String(row.id),
          order_number: row.order_number as string | null,
          status: row.status as string | null,
          total: row.total as number | null,
          currency: row.currency as string | null,
          placed_at: row.placed_at as string | null,
          created_at: row.created_at as string | null,
          storeName: (store as { name?: string } | null)?.name ?? null,
        },
        STATUS_LABEL[row.status as OrderStatus],
      ),
    );
  }

  return { activities: activities.sort(compareActivities), partial };
}
