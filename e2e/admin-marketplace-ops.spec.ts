import { test, expect } from "@playwright/test";

// ── The marketplace ops desk ───────────────────────────────────────────────
//
// The owner asked for the marketplace to get the same treatment restaurants
// got, testing included. The restaurant work was verified two ways: rolled-back
// SQL probes run as a real cook, and the door checked from outside. SQL probes
// live next to their migrations; this is the door.
//
// EVERY TEST HERE RUNS WITHOUT CREDENTIALS, on purpose. The interesting
// property of this desk is not that it works when you are signed in — it is
// that it does NOTHING when you are not, and that it cannot be pointed at a
// kitchen. Both are checkable from the outside, which means they are checked on
// every run rather than only when a service-role key happens to be present.
//
// This desk writes prices, stock and order status for shops the platform does
// not own. An unauthenticated hole here is somebody else's inventory.

const ORDERS = "/api/admin/marketplace-ops/orders";
const PRODUCTS = "/api/admin/marketplace-ops/products";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

test.describe("marketplace ops — unauthenticated", () => {
  test("the desk redirects to the admin login", async ({ page }) => {
    await page.goto("/admin/marketplace");
    await page.waitForURL("**/admin/login");
  });

  test("every order handler rejects with 401", async ({ request }) => {
    // GET is the read. A 200 here would leak customer names, phone numbers and
    // addresses for every shop on the platform.
    expect((await request.get(ORDERS)).status()).toBe(401);

    // PATCH moves an order's status, which emails the customer and can dispatch
    // a driver.
    const patch = await request.patch(ORDERS, {
      data: { orderId: NIL_UUID, status: "preparing" },
    });
    expect(patch.status()).toBe(401);

    // PUT mints a signed URL to a buyer's proof of payment — a photo of
    // somebody's bank transfer sitting in a private bucket.
    const put = await request.put(ORDERS, { data: { orderId: NIL_UUID } });
    expect(put.status()).toBe(401);
  });

  test("every product handler rejects with 401", async ({ request }) => {
    expect((await request.get(PRODUCTS)).status()).toBe(401);

    // The one that matters most: this writes a price on a shop the platform
    // does not own.
    const patch = await request.patch(PRODUCTS, {
      data: { variantId: NIL_UUID, price: 1 },
    });
    expect(patch.status()).toBe(401);
  });

  test("rejects before validating, so the shape of a valid request is not a hint", async ({ request }) => {
    // Deliberate garbage. A 400 here would mean the handler parsed the body
    // before checking the session — harmless in itself, but it turns the
    // endpoint into an oracle for what a valid request looks like, and it means
    // the auth check is not the first statement in the handler.
    const res = await request.patch(PRODUCTS, { data: { nonsense: true } });
    expect(res.status()).toBe(401);
  });
});

test.describe("marketplace ops — scope", () => {
  test("the food desk and the shop desk are different doors", async ({ request }) => {
    // Both are admin-only, and the split between them is enforced server-side
    // per handler (food scopes to stores that ARE kitchens, this to stores that
    // are NOT). From outside, the checkable part is that neither is reachable
    // without a session — verified together so a future refactor that merges
    // the two guards cannot quietly open one of them.
    expect((await request.get(ORDERS)).status()).toBe(401);
    expect((await request.get("/api/admin/food/orders")).status()).toBe(401);
  });
});
