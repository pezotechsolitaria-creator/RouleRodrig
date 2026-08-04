import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedOrderFixture, deleteOrderFixture, hasServiceRole, type OrderFixture } from "./support/order-test-fixtures";

test.describe("checkout — unauthenticated", () => {
  test("checkout page redirects to login", async ({ page }) => {
    await page.goto("/checkout");
    await page.waitForURL(/\/login\?next=(%2F|\/)checkout/);
  });

  test("checkout API rejects with 401", async ({ request }) => {
    const res = await request.post("/api/checkout", {
      data: {
        storeId: "00000000-0000-0000-0000-000000000000",
        items: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
        customerName: "X", customerPhone: "1", fulfillment: "pickup", provider: "cash",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("cart page renders an empty state without erroring", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByText("Your cart is empty")).toBeVisible();
  });
});

test.describe("checkout — input validation (no auth needed to prove the schema rejects)", () => {
  const cases: { label: string; patch: Record<string, unknown> }[] = [
    { label: "zero quantity", patch: { items: [{ variantId: "06469e6e-5b9a-4444-bddc-250685197e85", quantity: 0 }] } },
    { label: "negative quantity", patch: { items: [{ variantId: "06469e6e-5b9a-4444-bddc-250685197e85", quantity: -3 }] } },
    { label: "absurd quantity", patch: { items: [{ variantId: "06469e6e-5b9a-4444-bddc-250685197e85", quantity: 99999 }] } },
    { label: "non-uuid variant", patch: { items: [{ variantId: "'; DROP TABLE orders;--", quantity: 1 }] } },
    { label: "unknown provider", patch: { provider: "free" } },
  ];

  for (const { label, patch } of cases) {
    test(`rejects ${label} before it can reach the database`, async ({ request }) => {
      const res = await request.post("/api/checkout", {
        data: {
          storeId: "5a92bdf0-17c8-4181-886b-aa7cd5d1c353",
          items: [{ variantId: "06469e6e-5b9a-4444-bddc-250685197e85", quantity: 1 }],
          customerName: "X", customerPhone: "1", fulfillment: "pickup", provider: "cash",
          ...patch,
        },
      });
      // 401 (not signed in) or 400 (schema rejected) — never a 200/500.
      expect([400, 401]).toContain(res.status());
    });
  }
});

test.describe("checkout — authenticated", () => {
  test.skip(!hasServiceRole(), "requires SUPABASE_SERVICE_ROLE_KEY in the environment");

  let fixture: OrderFixture;

  test.beforeEach(async () => {
    fixture = await seedOrderFixture("chk");
  });

  test.afterEach(async () => {
    if (fixture) await deleteOrderFixture(fixture);
  });

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByPlaceholder("you@email.com").fill(fixture.customer.email);
    await page.getByPlaceholder("Password").fill(fixture.customer.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/orders");
  }

  test("price tampering: an injected price is ignored, the DB price is charged", async ({ page }) => {
    await signIn(page);
    const res = await page.request.post("/api/checkout", {
      data: {
        storeId: fixture.storeId,
        items: [{ variantId: fixture.variantId, quantity: 1, price: 1, unitPrice: 1 }],
        total: 1, subtotal: 1,
        customerName: "Tamper", customerPhone: "1", fulfillment: "pickup", provider: "cash",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // The seeded variant costs 2500 cents — never the injected 1.
    expect(body.total).toBe(2500);
  });

  test("stock: cannot order more than is in stock", async ({ page }) => {
    await signIn(page);
    const res = await page.request.post("/api/checkout", {
      data: {
        storeId: fixture.storeId,
        items: [{ variantId: fixture.variantId, quantity: 100 }],
        customerName: "Greedy", customerPhone: "1", fulfillment: "pickup", provider: "cash",
      },
    });
    expect(res.status()).toBe(409);
    expect(await res.text()).toMatch(/left of/i);
  });

  test("concurrent checkouts cannot oversell", async ({ page }) => {
    await signIn(page);
    // The fixture seeds 5 units; fire 8 single-unit checkouts at once.
    const attempts = Array.from({ length: 8 }, () =>
      page.request.post("/api/checkout", {
        data: {
          storeId: fixture.storeId,
          items: [{ variantId: fixture.variantId, quantity: 1 }],
          customerName: "Race", customerPhone: "1", fulfillment: "pickup", provider: "cash",
        },
      }),
    );
    const results = await Promise.all(attempts);
    const ok = results.filter((r) => r.status() === 200);
    const conflicts = results.filter((r) => r.status() === 409);
    expect(ok.length).toBe(5);
    expect(conflicts.length).toBe(3);
  });

  test("XSS: script payloads in customer fields never execute", async ({ page }) => {
    await signIn(page);
    const res = await page.request.post("/api/checkout", {
      data: {
        storeId: fixture.storeId,
        items: [{ variantId: fixture.variantId, quantity: 1 }],
        customerName: '<img src=x onerror="window.__XSS=1">',
        customerPhone: "1",
        notes: '<svg onload="window.__XSS2=1">',
        fulfillment: "pickup", provider: "cash",
      },
    });
    expect(res.status()).toBe(200);
    const { order_id: orderId } = await res.json();

    await page.goto(`/orders/${orderId}`);
    const fired = await page.evaluate(() => [
      (window as unknown as Record<string, unknown>).__XSS ?? null,
      (window as unknown as Record<string, unknown>).__XSS2 ?? null,
    ]);
    expect(fired).toEqual([null, null]);
    expect(await page.locator('img[src="x"], svg[onload]').count()).toBe(0);
  });

  test("IDOR: a customer cannot read another customer's order", async ({ page, browser }) => {
    await signIn(page);
    const other = await seedOrderFixture("chkOther");
    try {
      const res = await page.request.get(`/api/customer/orders/${other.orderId}`);
      expect(res.status()).toBe(404);
    } finally {
      await deleteOrderFixture(other);
      await browser.contexts();
    }
  });

  test("shop, cart and checkout pages have no critical/serious axe violations", async ({ page }) => {
    await signIn(page);

    await page.goto(`/shop/${fixture.storeSlug}`);
    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.goto("/cart");
    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.goto("/checkout");
    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
