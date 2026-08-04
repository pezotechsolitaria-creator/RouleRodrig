import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createConfirmedMerchantUser, deleteTestUser, hasServiceRole, type TestUser } from "./support/merchant-test-user";

// ── Tests that need no auth at all — always run ─────────────────────────────
// A missing/expired session both resolve to supabase.auth.getUser() === null
// server-side, so "no cookies at all" is a faithful stand-in for "expired
// session mid-wizard" without needing to fabricate token expiry.
test.describe("merchant API — unauthenticated / expired session", () => {
  test("onboard route rejects with 401, not a redirect or a crash", async ({ request }) => {
    const res = await request.post("/api/merchant/onboard", {
      data: { shopName: "x", productName: "x", price: "1", quantity: "1" },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toMatch(/not signed in/i);
  });

  test("media route rejects with 401", async ({ request }) => {
    const res = await request.post("/api/merchant/media", {
      multipart: { storeId: "00000000-0000-0000-0000-000000000000", target: "store_logo" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("merchant login page accessibility", () => {
  test("has no critical/serious axe violations", async ({ page }) => {
    await page.goto("/merchant/login");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

// ── Tests that need a real, pre-confirmed merchant account ──────────────────
// Requires SUPABASE_SERVICE_ROLE_KEY in the environment (not present in local
// .env.local by design — see e2e/support/merchant-test-user.ts). Skips
// cleanly rather than failing when it isn't configured.
test.describe("merchant onboarding — authenticated", () => {
  test.skip(!hasServiceRole(), "requires SUPABASE_SERVICE_ROLE_KEY in the environment");

  let user: TestUser;

  test.beforeEach(async () => {
    user = await createConfirmedMerchantUser("onboard");
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/merchant/login");
    await page.getByPlaceholder("you@email.com").fill(user.email);
    await page.getByPlaceholder("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/merchant/onboarding");
  }

  test("full wizard: shop + product creates a real shop and redirects to the dashboard", async ({ page }) => {
    await signIn(page);

    await page.getByLabel("Shop name *").fill("E2E Test Shop");
    await page.getByLabel("Business category *").selectOption("Bakery");
    await page.getByLabel("Contact number *").fill("+230 5000 1111");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Add your first product" })).toBeVisible();
    await page.getByLabel("Product name *").fill("E2E Test Product");
    await page.getByLabel("Price (Rs) *").fill("19.99");
    await page.getByLabel("Quantity *").fill("5");
    await page.getByRole("button", { name: "Create my shop" }).click();

    await page.waitForURL("**/merchant", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "E2E Test Shop" })).toBeVisible();
    await expect(page.getByText("1 product listed")).toBeVisible();
    await expect(page.getByText(/pending approval/i)).toBeVisible();
  });

  test("onboarding page redirects an already-onboarded merchant to the dashboard", async ({ page }) => {
    await signIn(page);
    await page.getByLabel("Shop name *").fill("Already Onboarded Shop");
    await page.getByLabel("Business category *").selectOption("Bakery");
    await page.getByLabel("Contact number *").fill("+230 5000 2222");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Product name *").fill("Product");
    await page.getByLabel("Price (Rs) *").fill("5.00");
    await page.getByLabel("Quantity *").fill("1");
    await page.getByRole("button", { name: "Create my shop" }).click();
    await page.waitForURL("**/merchant");

    // The page-load guard, not the race guard — proves the redirect wiring.
    await page.goto("/merchant/onboarding");
    await page.waitForURL("**/merchant");
  });

  test("duplicate onboard API call (bypassing the page guard) returns the friendly 409, never raw Postgres text", async ({ page }) => {
    await signIn(page);
    const payload = {
      shopName: "Race Shop", businessCategory: "Bakery", contactPhone: "+230 5000 3333",
      productName: "Race Product", price: "10.00", quantity: "1",
    };

    const first = await page.request.post("/api/merchant/onboard", { data: payload });
    expect(first.status()).toBe(200);

    // Simulates the double-tab race hitting the API a second time for the
    // same authenticated user — this is the actual constraint proven
    // manually against the RPC during the M2 review; this test proves the
    // API layer maps it to a clean message instead of leaking SQLSTATE text.
    const second = await page.request.post("/api/merchant/onboard", {
      data: { ...payload, shopName: "Race Shop B", productName: "Race Product B" },
    });
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body.code).toBe("RR001");
    expect(body.error).not.toMatch(/postgres|sql|constraint|duplicate key/i);
    expect(body.error).toMatch(/already have a shop/i);
  });

  test("uploading a spoofed file (HTML labeled image/png) is rejected by magic-byte validation", async ({ page }) => {
    await signIn(page);
    const create = await page.request.post("/api/merchant/onboard", {
      data: {
        shopName: "Upload Test Shop", businessCategory: "Bakery", contactPhone: "+230 5000 4444",
        productName: "Upload Test Product", price: "1.00", quantity: "1",
      },
    });
    const { store_id } = await create.json();

    const res = await page.request.post("/api/merchant/media", {
      multipart: {
        storeId: store_id,
        target: "store_logo",
        file: {
          name: "payload.png",
          mimeType: "image/png", // spoofed — actual bytes are HTML below
          buffer: Buffer.from("<script>alert(document.domain)</script>"),
        },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/jpg|png|webp/i);
  });

  test("onboarding wizard has no critical/serious axe violations at either step", async ({ page }) => {
    await signIn(page);
    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.getByLabel("Shop name *").fill("A11y Shop");
    await page.getByLabel("Business category *").selectOption("Bakery");
    await page.getByLabel("Contact number *").fill("+230 5000 5555");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Add your first product" })).toBeVisible();

    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
