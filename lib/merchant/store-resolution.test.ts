import { describe, it, expect, vi, beforeEach } from "vitest";

// ── The dashboard must agree with itself about which store it is showing ───
//
// The bug this pins, reported with a screenshot: the store switcher read
// "Ti Kitchen (DEMO)" while the page below it showed "M4 Test Shop — your shop
// is live", M4's orders, and M4's expired-subscription banner.
//
// Cause: TWO resolvers. getOwnStoreId() honoured the switcher's cookie and
// getMerchantDashboard() did not — it re-queried merchant_staff and took the
// first row. So the nav, the Menu tab and the order queue moved while the
// header, the shop name and the subscription warning stayed on the old store.
//
// Nothing local could catch that. Both functions were individually correct;
// the defect was that they disagreed. So the invariant is asserted directly:
// whatever getOwnStoreId() resolves, getMerchantDashboard() must describe.

const COOKIE = "rr_merchant_store";
const SHOP = { id: "11111111-1111-1111-1111-111111111111", name: "M4 Test Shop" };
const KITCHEN = { id: "22222222-2222-2222-2222-222222222222", name: "Ti Kitchen (DEMO)" };
const MERCHANT_ID = "33333333-3333-3333-3333-333333333333";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === COOKIE && cookieValue ? { value: cookieValue } : undefined) }),
}));
vi.mock("server-only", () => ({}));

/**
 * A Supabase stand-in that answers only what these two functions ask.
 *
 * Deliberately hand-written rather than a deep mock: it fails loudly on an
 * unexpected table, so a future refactor that starts reading somewhere new
 * cannot silently fall through to `undefined` and pass.
 */
function fakeSupabase() {
  // The chain RECORDS .eq() and applies it. An earlier version ignored filters
  // and returned the first row whatever was asked — which made this whole file
  // pass against the exact bug it exists to catch, because both code paths
  // ended up reading the same row. A mock that cannot tell two queries apart
  // cannot prove two code paths agree.
  const chain = (rows: Record<string, unknown>[]) => {
    let filtered = rows;
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.in = () => self;
    self.order = () => self;
    self.limit = () => self;
    self.eq = (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return self;
    };
    self.maybeSingle = async () => ({ data: filtered[0] ?? null, error: null });
    self.then = (res: (v: { data: unknown; error: null }) => unknown) => res({ data: filtered, error: null });
    return self;
  };

  return {
    from(table: string) {
      switch (table) {
        case "merchant_staff":
          return chain([{ merchant_id: MERCHANT_ID, merchants: { stores: [SHOP] } }]);
        case "stores":
          return chain([
            { ...KITCHEN, merchant_id: MERCHANT_ID },
            { ...SHOP, merchant_id: MERCHANT_ID },
          ]);
        case "merchants":
          return chain([{ id: MERCHANT_ID, display_name: "Roulé Rodrigues Kitchen", status: "approved" }]);
        case "products":
          return chain([{ status: "active" }, { status: "archived" }]);
        default:
          throw new Error(`fakeSupabase: unexpected table "${table}"`);
      }
    },
    rpc: async (fn: string) => {
      if (fn === "my_kitchen_owner_ids") return { data: [KITCHEN.id], error: null };
      throw new Error(`fakeSupabase: unexpected rpc "${fn}"`);
    },
  };
}

describe("the dashboard resolves ONE store", () => {
  beforeEach(() => {
    cookieValue = undefined;
    vi.resetModules();
  });

  it("getMerchantDashboard describes whatever getOwnStoreId resolved", async () => {
    cookieValue = KITCHEN.id;
    const { getOwnStoreId, getMerchantDashboard } = await import("./context");
    const db = fakeSupabase() as never;

    const resolved = await getOwnStoreId(db);
    const dashboard = await getMerchantDashboard(db);

    // The exact assertion that would have failed before the fix.
    expect(resolved).toBe(KITCHEN.id);
    expect(dashboard?.store?.id).toBe(resolved);
  });

  it("names the STORE, not the merchant — every kitchen shares one merchant", async () => {
    cookieValue = KITCHEN.id;
    const { getMerchantDashboard } = await import("./context");
    const dashboard = await getMerchantDashboard(fakeSupabase() as never);

    // "Roulé Rodrigues Kitchen" is the platform merchant behind EVERY
    // restaurant, so using it would label them all identically.
    expect(dashboard?.displayName).not.toBe("Roulé Rodrigues Kitchen");
  });

  it("ignores a cookie naming a store this person cannot act for", async () => {
    cookieValue = "99999999-9999-9999-9999-999999999999";
    const { getOwnStoreId } = await import("./context");

    // The cookie is a PREFERENCE, never a permission. A hand-crafted one must
    // not turn the dashboard into a store picker for the whole platform.
    expect(await getOwnStoreId(fakeSupabase() as never)).not.toBe(cookieValue);
  });
});
