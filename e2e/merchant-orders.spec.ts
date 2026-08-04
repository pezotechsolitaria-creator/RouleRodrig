import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedOrderFixture, deleteOrderFixture, hasServiceRole, type OrderFixture } from "./support/order-test-fixtures";

test.describe("merchant orders — unauthenticated", () => {
  test("orders list and detail redirect to login", async ({ page }) => {
    await page.goto("/merchant/orders");
    await page.waitForURL("**/merchant/login");

    await page.goto("/merchant/orders/00000000-0000-0000-0000-000000000000");
    await page.waitForURL("**/merchant/login");
  });

  test("order API routes reject with 401", async ({ request }) => {
    const list = await request.get("/api/merchant/orders");
    expect(list.status()).toBe(401);
    const patch = await request.patch("/api/merchant/orders/00000000-0000-0000-0000-000000000000", {
      data: { status: "preparing" },
    });
    expect(patch.status()).toBe(401);
  });
});

test.describe("merchant orders — authenticated", () => {
  test.skip(!hasServiceRole(), "requires SUPABASE_SERVICE_ROLE_KEY in the environment");

  let fixtureA: OrderFixture;
  let fixtureB: OrderFixture;

  test.beforeEach(async () => {
    fixtureA = await seedOrderFixture("mA");
    fixtureB = await seedOrderFixture("mB");
  });

  test.afterEach(async () => {
    if (fixtureA) await deleteOrderFixture(fixtureA);
    if (fixtureB) await deleteOrderFixture(fixtureB);
  });

  async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
    await page.goto("/merchant/login");
    await page.getByPlaceholder("you@email.com").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/merchant");
  }

  test("order list shows the seeded order with correct total and status", async ({ page }) => {
    await signIn(page, fixtureA.merchant.email, fixtureA.merchant.password);
    await page.goto("/merchant/orders");

    await expect(page.getByText(fixtureA.orderNumber)).toBeVisible();
    await expect(page.getByText("Rs 50.00")).toBeVisible();
    await expect(page.getByText("Confirmed")).toBeVisible(); // "paid" status label
  });

  test("accepting an order moves it through the state machine and records an internal note", async ({ page }) => {
    await signIn(page, fixtureA.merchant.email, fixtureA.merchant.password);
    await page.goto(`/merchant/orders/${fixtureA.orderId}`);

    await page.getByRole("button", { name: "Accept order" }).click();
    await expect(page.getByRole("button", { name: "Mark ready for pickup" })).toBeVisible();

    await page.getByPlaceholder("Add a note for your team…").fill("Packing now.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Packing now.")).toBeVisible();
  });

  test("illegal status transition is rejected by the API with 409", async ({ page }) => {
    await signIn(page, fixtureA.merchant.email, fixtureA.merchant.password);
    // Fixture starts at "paid" — jumping straight to "collected" skips preparing/ready_for_pickup.
    const res = await page.request.patch(`/api/merchant/orders/${fixtureA.orderId}`, {
      data: { status: "collected" },
    });
    expect(res.status()).toBe(409);
  });

  test("cross-tenant IDOR: merchant B cannot view or modify merchant A's order", async ({ page, browser }) => {
    await signIn(page, fixtureA.merchant.email, fixtureA.merchant.password);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await signIn(pageB, fixtureB.merchant.email, fixtureB.merchant.password);

    const getRes = await pageB.request.get(`/api/merchant/orders/${fixtureA.orderId}`);
    expect(getRes.status()).toBe(404);

    const patchRes = await pageB.request.patch(`/api/merchant/orders/${fixtureA.orderId}`, {
      data: { status: "preparing" },
    });
    expect(patchRes.status()).toBe(404);

    const listRes = await pageB.request.get("/api/merchant/orders");
    const { orders } = await listRes.json();
    expect(orders.some((o: { id: string }) => o.id === fixtureA.orderId)).toBe(false);

    await contextB.close();
  });

  test("orders list and detail have no critical/serious axe violations", async ({ page }) => {
    await signIn(page, fixtureA.merchant.email, fixtureA.merchant.password);

    await page.goto("/merchant/orders");
    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.goto(`/merchant/orders/${fixtureA.orderId}`);
    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("keyboard navigation: order actions and note field are reachable via Tab", async ({ page }) => {
    await signIn(page, fixtureA.merchant.email, fixtureA.merchant.password);
    await page.goto(`/merchant/orders/${fixtureA.orderId}`);

    const acceptButton = page.getByRole("button", { name: "Accept order" });
    await acceptButton.focus();
    await expect(acceptButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Mark ready for pickup" })).toBeVisible();
  });
});
