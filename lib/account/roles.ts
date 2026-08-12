import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── WHICH DOORS DOES THIS ACCOUNT HAVE? ──────────────────────────────────────
//
// The owner: "I want everyone to be able to have their account everytime on
// their website if they have an account — for everyone like clients, merchants,
// restaurants, drivers, etc. It will be found on settings. It can fix the
// problem of '/'."
//
// He has diagnosed it correctly. The platform grew a console per role — /merchant,
// /driver, /organizer, /partner, /admin — and the ONLY way to reach yours was to
// know its URL. Nothing on the site listed them. A merchant who forgot the word
// "merchant" had no path back into their own shop, and the slashes he keeps
// running into are those addresses.
//
// The fix is not better URLs, it is not having to know them: one page that reads
// your account and shows the doors you actually have. This module answers that
// question and nothing else.
//
// ── WHY /admin IS NOT IN HERE ────────────────────────────────────────────────
// /admin is not an account. It is one shared password behind a signed cookie
// with no Supabase user at all, so there is nothing about a signed-in person
// that could reveal it — see the two-admin-identities note. Listing it would
// mean either showing it to everybody or inventing a rule; both are worse than
// the operator knowing their own address.

export type AccountRole = {
  key: "merchant" | "driver" | "organizer";
  /** What the person is, in their own words. */
  title: string;
  /** What they can do there. */
  blurb: string;
  href: string;
  /** Their name/shop as this role, when there is one worth showing. */
  label?: string | null;
  /**
   * Whether this door is OPEN yet. A driver whose application is pending has the
   * role and cannot work — saying so is the whole point of showing it.
   */
  status: "active" | "pending" | "blocked";
  statusNote?: string;
};

/**
 * Every console this user can reach, read from the tables that actually grant
 * access — not from a role column that could drift out of step with them.
 *
 * Runs on the USER's own client, so RLS is the filter: a person can only ever
 * discover their own doors, and a bug here cannot widen that.
 */
export async function rolesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountRole[]> {
  const out: AccountRole[] = [];

  const [staff, owned, driver, organizer] = await Promise.all([
    // system_key is null on both: "Roulé Rodrigues Kitchen" and "Roulé
    // Rodrigues Events" are platform infrastructure that happen to carry
    // merchant_staff rows for the operator. Without this filter a staff member
    // would be told "My shop — Roulé Rodrigues Kitchen" and sent to /merchant,
    // which is not their shop and not where that work happens.
    supabase
      .from("merchant_staff")
      .select("merchant_id, role, merchants!inner(display_name, status, system_key)")
      .eq("user_id", userId)
      .is("merchants.system_key", null),
    supabase.from("merchants").select("id, display_name, status").eq("owner_id", userId).is("system_key", null),
    supabase.from("delivery_drivers").select("id, full_name, status").eq("user_id", userId).maybeSingle(),
    supabase.from("event_organizers").select("id, display_name, status").eq("user_id", userId).maybeSingle(),
  ]);

  const one = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : v);

  // A merchant can be reached two ways — the owner_id column and a merchant_staff
  // row — and most owners have both. Deduped by merchant id so a shop is one door.
  const merchants = new Map<string, { name: string; status: string }>();
  for (const m of (owned.data ?? []) as Record<string, unknown>[]) {
    merchants.set(String(m.id), { name: String(m.display_name ?? "Your shop"), status: String(m.status ?? "") });
  }
  for (const s of (staff.data ?? []) as Record<string, unknown>[]) {
    const m = one(s.merchants) as { display_name?: string; status?: string } | null;
    const id = String(s.merchant_id);
    if (!merchants.has(id)) {
      merchants.set(id, { name: m?.display_name ?? "Your shop", status: String(m?.status ?? "") });
    }
  }

  for (const [, m] of merchants) {
    out.push({
      key: "merchant",
      title: "My shop",
      blurb: "Products, orders, opening hours and payment details.",
      href: "/merchant",
      label: m.name,
      status: m.status === "approved" ? "active" : m.status === "pending" ? "pending" : "blocked",
      statusNote:
        m.status === "pending"
          ? "Waiting for Roulé Rodrigues to approve your shop — you can set it up in the meantime."
          : m.status === "suspended"
            ? "Your shop is paused. Contact Roulé Rodrigues to reopen it."
            : m.status === "rejected"
              ? "This shop was not approved."
              : undefined,
    });
  }

  const d = driver.data as { full_name?: string; status?: string } | null;
  if (d) {
    out.push({
      key: "driver",
      title: "My deliveries",
      blurb: "Jobs offered to you, your current run and your delivery history.",
      href: "/driver",
      label: d.full_name ?? null,
      // driver_status is pending | approved | suspended | rejected | inactive.
      status: d.status === "approved" ? "active" : d.status === "pending" ? "pending" : "blocked",
      statusNote:
        d.status === "pending"
          ? "Your driver application is being reviewed."
          : d.status === "suspended"
            ? "Your driver account is paused. Contact Roulé Rodrigues."
            : d.status === "rejected"
              ? "This application was not approved."
              : d.status === "inactive"
                ? "You are marked inactive — contact Roulé Rodrigues to start again."
                : undefined,
    });
  }

  const o = organizer.data as { display_name?: string; status?: string } | null;
  if (o) {
    out.push({
      key: "organizer",
      title: "My events",
      blurb: "Ticket packages, sales, and checking people in at the door.",
      href: "/organizer",
      label: o.display_name ?? null,
      status: o.status === "active" ? "active" : o.status === "invited" ? "pending" : "blocked",
      statusNote:
        o.status === "invited"
          ? "You have been invited as an organiser — open it to finish setting up."
          : o.status === "suspended"
            ? "Your organiser access is paused."
            : undefined,
    });
  }

  return out;
}
