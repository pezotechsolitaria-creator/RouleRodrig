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
const EVENTS = { id: "44444444-4444-4444-4444-444444444444", name: "Summer Fest Rodrigues" };
// A trade: the fourth kind (M177). Reached the same way as the others, so a
// console that resolved it as "shop" would look identical to the M172 bug.
const SERVICE = { id: "55555555-5555-5555-5555-555555555555", name: "Roule Test Services" };
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
          // All three reachable this way — the branch that used to name every
          // one of them "shop".
          return chain([
            { merchant_id: MERCHANT_ID, merchants: { stores: [SHOP, KITCHEN, EVENTS, SERVICE] } },
          ]);
        case "stores":
          return chain([
            { ...KITCHEN, merchant_id: MERCHANT_ID },
            { ...SHOP, merchant_id: MERCHANT_ID },
            { ...EVENTS, merchant_id: MERCHANT_ID },
          ]);
        case "merchants":
          return chain([{ id: MERCHANT_ID, display_name: "Roulé Rodrigues Kitchen", status: "approved" }]);
        case "products":
          return chain([{ status: "active" }, { status: "archived" }]);
        // M172: kind is derived POSITIVELY from these two, and the merchant
        // console asks them in bulk. KITCHEN is reachable BOTH ways in this
        // fixture — through my_kitchen_owner_ids and, since it shares
        // MERCHANT_ID, through merchant_staff — which is precisely the tie the
        // old code resolved as "shop".
        case "food_kitchens":
          return chain([{ store_id: KITCHEN.id }]);
        case "events":
          return chain([{ store_id: EVENTS.id }]);
        case "trade_providers":
          return chain([{ store_id: SERVICE.id }]);
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

// ── KIND TRAVELS WITH THE STORE (M172) ─────────────────────────────────────
//
// The same invariant one level deeper. It is not enough that both resolvers
// name the same store: they must agree on what KIND of business it is, because
// the nav's third tab, the header badge and the home screen's blocks are all
// chosen from it. Every case below fails against the pre-M172 resolver, which
// stamped "shop" on anything reached through merchant_staff and deduped the
// kitchen branch against that list.

describe("kind is decided by what a store IS, not by which query found it", () => {
  beforeEach(() => {
    cookieValue = undefined;
    vi.resetModules();
  });

  it("calls a kitchen a kitchen even when merchant_staff reaches it first", async () => {
    // THE REGRESSION. This store is reachable both ways and shop used to win.
    cookieValue = KITCHEN.id;
    const { getMerchantDashboard } = await import("./context");
    const dashboard = await getMerchantDashboard(fakeSupabase() as never);
    expect(dashboard?.store?.kind).toBe("kitchen");
  });

  it("calls a box office a box office, not a shop", async () => {
    // Three of the platform owner's five real stores are event stores, and all
    // three were labelled "shop" in production.
    cookieValue = EVENTS.id;
    const { getMerchantDashboard } = await import("./context");
    const dashboard = await getMerchantDashboard(fakeSupabase() as never);
    expect(dashboard?.store?.kind).toBe("events");
  });

  it("leaves a plain shop as a shop", async () => {
    cookieValue = SHOP.id;
    const { getMerchantDashboard } = await import("./context");
    const dashboard = await getMerchantDashboard(fakeSupabase() as never);
    expect(dashboard?.store?.kind).toBe("shop");
  });

  it("labels every accessible store, and each one only once", async () => {
    const { getAccessibleStores } = await import("./context");
    const stores = await getAccessibleStores(fakeSupabase() as never);
    expect(stores).toHaveLength(4);
    expect(new Set(stores.map((s) => s.id)).size).toBe(4);
    expect(
      Object.fromEntries(stores.map((s) => [s.name, s.kind])),
    ).toEqual({
      "M4 Test Shop": "shop",
      "Ti Kitchen (DEMO)": "kitchen",
      "Summer Fest Rodrigues": "events",
      // The fourth kind. Reached through merchant_staff exactly like the shop,
      // so a resolver that stamped a kind on the branch that FOUND the store
      // would call this one "shop" — the M172 bug, in a new place.
      "Roule Test Services": "service",
    });
  });

  it("agrees with getOwnStoreId about the store AND its kind", async () => {
    cookieValue = KITCHEN.id;
    const { getOwnStoreId, getMerchantDashboard, getAccessibleStores } = await import("./context");
    const db = fakeSupabase() as never;
    const resolved = await getOwnStoreId(db);
    const dashboard = await getMerchantDashboard(db);
    const listed = (await getAccessibleStores(db)).find((s) => s.id === resolved);
    expect(dashboard?.store?.id).toBe(resolved);
    expect(dashboard?.store?.kind).toBe(listed?.kind);
  });
});
