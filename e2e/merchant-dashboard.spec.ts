import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createConfirmedMerchantUser, deleteTestUser, hasServiceRole, type TestUser } from "./support/merchant-test-user";

// ── Unauthenticated access — always run, no service role needed ────────────
// Every merchant dashboard/product route must redirect an unauthenticated
// visitor to sign in, never render (even partially) behind that gate.
test.describe("merchant dashboard — unauthenticated", () => {
  for (const path of ["/merchant", "/merchant/products", "/merchant/products/new"]) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL("**/merchant/login");
    });
  }

  test("product API routes reject with 401, not a redirect or a crash", async ({ request }) => {
    const list = await request.get("/api/merchant/products");
    expect(list.status()).toBe(401);
    const create = await request.post("/api/merchant/products", { data: { name: "x", price: "1", stockQuantity: 1, status: "draft" } });
    expect(create.status()).toBe(401);
  });
});

// ── Authenticated tests — need a real, pre-confirmed merchant account ──────
test.describe("merchant dashboard — authenticated", () => {
  test.skip(!hasServiceRole(), "requires SUPABASE_SERVICE_ROLE_KEY in the environment");

  async function signInAndOnboard(page: import("@playwright/test").Page, user: TestUser, shopName: string) {
    await page.goto("/merchant/login");
    await page.getByPlaceholder("you@email.com").fill(user.email);
    await page.getByPlaceholder("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/merchant/onboarding");

    const res = await page.request.post("/api/merchant/onboard", {
      data: {
        shopName, businessCategory: "Bakery", contactPhone: "+230 5600 0001",
        productName: "Seed Product", price: "10.00", quantity: "3",
      },
    });
    expect(res.status()).toBe(200);
    return (await res.json()) as { store_id: string; product_id: string };
  }

  let userA: TestUser;
  let userB: TestUser;

  test.beforeEach(async () => {
    userA = await createConfirmedMerchantUser("dashA");
    userB = await createConfirmedMerchantUser("dashB");
  });

  test.afterEach(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  });

  test("dashboard renders shop summary, stats, and recent products after onboarding", async ({ page }) => {
    await signInAndOnboard(page, userA, "Dashboard Test Shop");
    await page.goto("/merchant");

    await expect(page.getByRole("heading", { name: "Dashboard Test Shop" })).toBeVisible();
    await expect(page.getByText(/pending approval/i)).toBeVisible();
    await expect(page.getByText("Seed Product")).toBeVisible();
    // Stat cards: 1 product, 0 low stock (qty 3 is above the low-stock floor), 0 out of stock
    await expect(page.getByText("Products")).toBeVisible();
  });

  test("product creation rejects invalid input inline, never submits", async ({ page }) => {
    await signInAndOnboard(page, userA, "Validation Test Shop");
    await page.goto("/merchant/products/new");

    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByText("Product name is required.")).toBeVisible();

    await page.getByLabel("Product name *").fill("Bad Price Product");
    await page.getByLabel("Price (Rs) *").fill("not-a-number");
    await page.getByLabel("Stock quantity *").fill("5");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByText("Enter a valid price.")).toBeVisible();

    // Still on the create page — nothing was submitted.
    await expect(page).toHaveURL(/\/merchant\/products\/new$/);
  });

  test("price conversion: 9.995 stored and displayed as exactly Rs 10.00", async ({ page }) => {
    await signInAndOnboard(page, userA, "Price Test Shop");
    await page.goto("/merchant/products/new");

    await page.getByLabel("Product name *").fill("Boundary Price Item");
    await page.getByLabel("Price (Rs) *").fill("9.995");
    await page.getByLabel("Stock quantity *").fill("1");
    // Live preview reflects the same toCents() rounding the server uses.
    await expect(page.getByText("Rs 10.00")).toBeVisible();

    await page.getByRole("button", { name: "Create product" }).click();
    await page.waitForURL("**/merchant/products");
    await expect(page.getByText("Rs 10.00")).toBeVisible();
  });

  test("unauthorized product access (IDOR): merchant B cannot read, edit, or delete merchant A's product", async ({ page, browser }) => {
    const { product_id: productIdA } = await signInAndOnboard(page, userA, "Owner Shop");

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await signInAndOnboard(pageB, userB, "Attacker Shop");

    const getRes = await pageB.request.get(`/api/merchant/products/${productIdA}`);
    expect(getRes.status()).toBe(404);

    const patchRes = await pageB.request.patch(`/api/merchant/products/${productIdA}`, { data: { name: "PWNED" } });
    expect(patchRes.status()).toBe(404);

    const deleteRes = await pageB.request.delete(`/api/merchant/products/${productIdA}`);
    expect(deleteRes.status()).toBe(404);

    const listRes = await pageB.request.get("/api/merchant/products");
    const { products } = await listRes.json();
    expect(products.some((p: { id: string }) => p.id === productIdA)).toBe(false);

    await contextB.close();
  });

  test("upload restrictions: oversized and spoofed files are both rejected", async ({ page }) => {
    const { store_id: storeId, product_id: productId } = await signInAndOnboard(page, userA, "Upload Test Shop");

    const spoofed = await page.request.post("/api/merchant/media", {
      multipart: {
        storeId, target: "product_photo", productId,
        file: { name: "payload.png", mimeType: "image/png", buffer: Buffer.from("<script>evil()</script>") },
      },
    });
    expect(spoofed.status()).toBe(400);

    const oversized = await page.request.post("/api/merchant/media", {
      multipart: {
        storeId, target: "product_photo", productId,
        file: { name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024) }, // 5MB > 4MB limit
      },
    });
    expect(oversized.status()).toBe(400);
  });

  test("dashboard and products pages have no critical/serious axe violations", async ({ page }) => {
    await signInAndOnboard(page, userA, "A11y Test Shop");

    await page.goto("/merchant");
    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.goto("/merchant/products");
    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.goto("/merchant/products/new");
    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("keyboard navigation: product form is fully reachable and operable via Tab", async ({ page }) => {
    await signInAndOnboard(page, userA, "Keyboard Test Shop");
    await page.goto("/merchant/products/new");

    await page.getByLabel("Product name *").focus();
    await page.keyboard.type("Keyboard Product");
    await page.keyboard.press("Tab"); // description
    await page.keyboard.press("Tab"); // price
    await page.keyboard.type("7.00");
    await page.keyboard.press("Tab"); // stock
    await page.keyboard.type("2");

    await expect(page.getByLabel("Product name *")).toHaveValue("Keyboard Product");
    await expect(page.getByLabel("Price (Rs) *")).toHaveValue("7.00");
  });
});
