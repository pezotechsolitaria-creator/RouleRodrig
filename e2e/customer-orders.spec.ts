import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedOrderFixture, deleteOrderFixture, hasServiceRole, type OrderFixture } from "./support/order-test-fixtures";

test.describe("customer orders — unauthenticated", () => {
  test("orders list and detail redirect to /login with a next param", async ({ page }) => {
    await page.goto("/orders");
    await page.waitForURL(/\/login\?next=(%2F|\/)orders/);

    await page.goto("/orders/00000000-0000-0000-0000-000000000000");
    await page.waitForURL(/\/login\?next=/);
  });

  test("customer order API routes reject with 401", async ({ request }) => {
    const list = await request.get("/api/customer/orders");
    expect(list.status()).toBe(401);
    const detail = await request.get("/api/customer/orders/00000000-0000-0000-0000-000000000000");
    expect(detail.status()).toBe(401);
  });
});

test.describe("customer orders — authenticated", () => {
  test.skip(!hasServiceRole(), "requires SUPABASE_SERVICE_ROLE_KEY in the environment");

  let fixtureA: OrderFixture;
  let fixtureB: OrderFixture;

  test.beforeEach(async () => {
    fixtureA = await seedOrderFixture("cA");
    fixtureB = await seedOrderFixture("cB");
  });

  test.afterEach(async () => {
    if (fixtureA) await deleteOrderFixture(fixtureA);
    if (fixtureB) await deleteOrderFixture(fixtureB);
  });

  async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByPlaceholder("you@email.com").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/orders");
  }

  test("customer sees their own order with items, total, and payment status", async ({ page }) => {
    await signIn(page, fixtureA.customer.email, fixtureA.customer.password);
    await page.goto(`/orders/${fixtureA.orderId}`);

    await expect(page.getByText(fixtureA.orderNumber)).toBeVisible();
    await expect(page.getByText("E2E Test Product")).toBeVisible();
    await expect(page.getByText("Rs 50.00")).toBeVisible();
    await expect(page.getByText(/captured/)).toBeVisible();
    // Internal notes are merchant-only — never rendered on the customer page.
    await expect(page.getByText("Only visible to your shop staff")).toHaveCount(0);
  });

  test("cross-tenant IDOR: customer B cannot view customer A's order", async ({ page, browser }) => {
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await signIn(pageB, fixtureB.customer.email, fixtureB.customer.password);

    const detailRes = await pageB.request.get(`/api/customer/orders/${fixtureA.orderId}`);
    expect(detailRes.status()).toBe(404);

    const pageRes = await pageB.goto(`/orders/${fixtureA.orderId}`);
    expect(pageRes?.status()).toBe(404);

    const listRes = await pageB.request.get("/api/customer/orders");
    const { orders } = await listRes.json();
    expect(orders.some((o: { id: string }) => o.id === fixtureA.orderId)).toBe(false);

    await contextB.close();
  });

  test("orders list and detail have no critical/serious axe violations", async ({ page }) => {
    await signIn(page, fixtureA.customer.email, fixtureA.customer.password);

    await page.goto("/orders");
    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.goto(`/orders/${fixtureA.orderId}`);
    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
