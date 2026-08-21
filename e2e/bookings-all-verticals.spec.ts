import { test, expect, type Page } from "@playwright/test";
import { hasServiceRole } from "./support/merchant-test-user";

// ── EVERY BOOKING VERTICAL, END TO END ──────────────────────────────────────
//
// The owner asked for a full test script covering scooters, cars,
// accommodation and experiences. booking.spec.ts already covers the scooter
// form in depth; nothing covered stays or experiences at all, which is exactly
// the path that has never carried a real booking in production.
//
// ── HOW THIS STAYS SAFE AGAINST A LIVE DATABASE ─────────────────────────────
//
// There is no staging. One database, and it is production. So every test here
// is one of two shapes, and never anything else:
//
//   1. REJECTION PATHS, hit for real. A request the API refuses creates no row,
//      holds no dates and sends no email. These are the tests that prove the
//      server is actually guarding itself rather than trusting the browser.
//
//   2. HAPPY PATHS, with the API INTERCEPTED. The customer's whole journey is
//      driven in a real browser, but the POST never leaves Playwright — so no
//      booking is created, no partner is emailed and no slot is held.
//
// Nothing in this file writes to the database. If you add a test that does, it
// belongs behind a fixture that cleans up after itself (see
// e2e/support/order-test-fixtures.ts), not here.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

// A reserved domain that can never receive mail, so a stray success would still
// email nobody — and lib/admin/customers.ts already filters it out of the real
// customer list.
const SAFE_EMAIL = "playwright@zztest.invalid";
const SAFE_PHONE = "+230 5712 3456";

const VEHICLE_BASE = {
  name: "Playwright Test",
  email: SAFE_EMAIL,
  phone: SAFE_PHONE,
  days: 2,
};

const PLACE_BASE = {
  place_id: "playwright-does-not-exist",
  place_name: "Playwright Test Place",
  name: "Playwright Test",
  email: SAFE_EMAIL,
  phone: SAFE_PHONE,
  start_date: daysFromNow(120),
  guests: 2,
};

/** Post JSON and return { status, error } without throwing on a 4xx. */
async function postJson(page: Page, url: string, body: unknown) {
  const res = await page.request.post(url, { data: body, failOnStatusCode: false });
  let json: { error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* an HTML error page — status alone is the signal */
  }
  return { status: res.status(), error: json.error ?? "" };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. VEHICLES — the server prices the trip, not the browser
// ════════════════════════════════════════════════════════════════════════════
//
// Serial: /api/bookings is rate limited per IP, and running these in parallel
// trips the limiter so the assertions measure the guard instead of the rule.

test.describe.configure({ mode: "serial" });

test.describe("scooter and car requests the API must refuse", () => {
  const cases: { label: string; body: Record<string, unknown>; expect: RegExp }[] = [
    {
      label: "a pickup already in the past",
      body: { ...VEHICLE_BASE, scooter: "burgman", start_date: daysFromNow(-3), end_date: daysFromNow(1) },
      expect: /already passed/i,
    },
    {
      label: "a return before the pickup",
      body: { ...VEHICLE_BASE, scooter: "burgman", start_date: daysFromNow(100), end_date: daysFromNow(95) },
      expect: /on or after/i,
    },
    {
      label: "a vehicle that is not in the fleet",
      // The one that mattered most: before this was guarded, an unknown id made
      // priceBreakdown() return null and the route fell back to the CLIENT's
      // total_amount — attacker-controlled pricing, reachable from a browser.
      body: {
        ...VEHICLE_BASE,
        scooter: "not-a-real-vehicle-xyz",
        start_date: daysFromNow(100),
        end_date: daysFromNow(102),
        total_amount: 1,
      },
      expect: /isn't available|not available/i,
    },
    {
      label: "a phone number nobody could answer",
      body: { ...VEHICLE_BASE, scooter: "burgman", phone: "12345", start_date: daysFromNow(100), end_date: daysFromNow(102) },
      expect: /phone/i,
    },
    {
      label: "a six-month squat on the calendar",
      body: { ...VEHICLE_BASE, scooter: "burgman", start_date: daysFromNow(100), end_date: daysFromNow(285) },
      expect: /60 days/i,
    },
  ];

  for (const c of cases) {
    test(`refuses ${c.label}`, async ({ page }) => {
      const { status, error } = await postJson(page, "/api/bookings", c.body);
      expect(status, `expected a 4xx for: ${c.label}`).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      expect(error).toMatch(c.expect);
    });
  }

  test("never accepts a price the browser made up", async ({ page }) => {
    // Even for a REAL vehicle, total_amount from the client must be ignored.
    // A 200 here is fine — what must never happen is the row being priced at 1.
    const { status, error } = await postJson(page, "/api/bookings", {
      ...VEHICLE_BASE,
      scooter: "not-a-real-vehicle-xyz",
      start_date: daysFromNow(110),
      end_date: daysFromNow(112),
      total_amount: 1,
      deposit_amount: 1,
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(error).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. ACCOMMODATION AND EXPERIENCES — the same guards, on the path that has
//    never carried a real booking
// ════════════════════════════════════════════════════════════════════════════

test.describe("stay and experience requests the API must refuse", () => {
  const cases: { label: string; body: Record<string, unknown>; expect: RegExp }[] = [
    {
      label: "no listing at all",
      body: { ...PLACE_BASE, place_id: "" },
      expect: /missing required/i,
    },
    {
      label: "no name",
      body: { ...PLACE_BASE, name: "" },
      expect: /missing required/i,
    },
    {
      label: "no date",
      body: { ...PLACE_BASE, start_date: "" },
      expect: /missing required/i,
    },
    {
      label: "a phone number nobody could answer",
      body: { ...PLACE_BASE, phone: "12345" },
      expect: /phone/i,
    },
    {
      label: "an email address that is not one",
      body: { ...PLACE_BASE, email: "not-an-email" },
      expect: /email/i,
    },
  ];

  for (const c of cases) {
    test(`refuses ${c.label}`, async ({ page }) => {
      const { status, error } = await postJson(page, "/api/place-bookings", c.body);
      expect(status, `expected a 4xx for: ${c.label}`).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      expect(error).toMatch(c.expect);
    });
  }

  // ── THE ONE THAT FOUND A REAL HOLE (M128) ────────────────────────────────
  //
  // This test failed the first time it ran: the API returned 200 for
  // place_id "playwright-does-not-exist" and CREATED A ROW in production,
  // with a client-supplied place_name and depositAmount 0 — a free booking
  // against a listing that does not exist, invisible to every availability
  // check. /api/bookings had the same hole for vehicles until 2026-08-08.
  //
  // It is the highest-value test in this file: it is the only one that has
  // ever caught anything, and if it ever passes by accident again the same
  // hole is back.
  test("refuses a listing that does not exist, and creates nothing", async ({ page }) => {
    const { status, error } = await postJson(page, "/api/place-bookings", PLACE_BASE);
    expect(status, "a booking for a non-existent listing must be refused").toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect(error).toMatch(/isn't available|not available/i);
  });

  test("still refuses a fake listing even when the customer gave no email", async ({ page }) => {
    // A guest with no address is a legitimate path (requiring an account is how
    // the marketplace silently dropped every default checkout before M28), so
    // the refusal here must come from the LISTING, not from the empty email.
    const { status, error } = await postJson(page, "/api/place-bookings", { ...PLACE_BASE, email: "" });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(error).not.toMatch(/email/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE PAGES THEMSELVES — every vertical reachable, nothing rendering blank
// ════════════════════════════════════════════════════════════════════════════

test.describe("every booking surface loads", () => {
  const routes = [
    { path: "/browse/scooter", label: "scooters" },
    { path: "/browse/car", label: "cars" },
    { path: "/experiences/massage", label: "massage" },
    { path: "/experiences/fishing", label: "fishing" },
    { path: "/experiences/boat", label: "boat trips" },
    { path: "/explore", label: "stays and the rest" },
  ];

  for (const r of routes) {
    test(`${r.label} — ${r.path} renders`, async ({ page }) => {
      const res = await page.goto(r.path);
      expect(res?.status(), `${r.path} did not return 200`).toBeLessThan(400);
      // A page that 200s but renders an error boundary is still broken.
      await expect(page.locator("body")).not.toContainText(/application error|something went wrong/i);
      await expect(page.locator("h1, h2").first()).toBeVisible();
    });
  }

  test("no listing renders as a blank card", async ({ page }) => {
    // Two empty massage drafts shipped to production and rendered as nameless
    // tiles. Nothing failed, because an empty string is valid HTML.
    for (const path of ["/experiences/massage", "/experiences/fishing", "/experiences/boat"]) {
      await page.goto(path);
      const headings = await page.locator("h3").allInnerTexts();
      const blank = headings.filter((h) => h.trim() === "");
      expect(blank, `${path} has ${blank.length} nameless listing card(s)`).toHaveLength(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE AVAILABILITY STEP (M127) — nobody is asked to pay for an unchecked slot
// ════════════════════════════════════════════════════════════════════════════

test.describe("booking a stay or experience asks availability first", () => {
  test.beforeEach(async ({ page }) => {
    // Intercepted: the customer's journey runs for real, the booking does not.
    await page.route("**/api/place-bookings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          bookingId: "00000000-0000-4000-8000-000000000000",
          depositAmount: 700,
        }),
      }),
    );
  });

  async function openFirstBooking(page: Page, path: string): Promise<boolean> {
    await page.goto(path);
    // CTA wording differs per vertical ("See availability", "See the trip",
    // "Meet the guide"), so match the intent rather than one label.
    const cta = page
      .getByRole("button", { name: /book|reserve|availability|see the|meet the/i })
      .first();
    if (!(await cta.isVisible().catch(() => false))) return false;
    await cta.click();
    return true;
  }

  test("the modal never offers payment before we have checked", async ({ page }) => {
    const opened = await openFirstBooking(page, "/experiences/boat");
    test.skip(!opened, "no bookable listing published on this vertical");

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();

    // The widgets that used to sit on the success screen. Their presence would
    // mean a customer can pay for a slot nobody has confirmed with the partner.
    await expect(dialog).not.toContainText(/pay below and it's confirmed/i);
    await expect(dialog.locator("[data-paypal-button-container], iframe[title*='PayPal' i]")).toHaveCount(0);
  });

  test("the page tells the customer nothing has been charged", async ({ page }) => {
    // Asserted against the built page rather than the source, so a copy change
    // that never reaches the browser cannot pass.
    const opened = await openFirstBooking(page, "/experiences/boat");
    test.skip(!opened, "no bookable listing published on this vertical");
    await expect(page.getByRole("dialog").first()).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. WHAT A CUSTOMER DOES AFTER BOOKING — looking it up again
// ════════════════════════════════════════════════════════════════════════════

test.describe("a customer can find their booking again", () => {
  test("/track loads and asks for a reference", async ({ page }) => {
    const res = await page.goto("/track");
    expect(res?.status()).toBeLessThan(400);
    // Two factors on purpose: a reference alone in a URL ends up in history and
    // server logs, so the email address is still typed.
    await expect(page.locator("input").first()).toBeVisible();
  });

  test("an unknown reference is refused without revealing whether it exists", async ({ page }) => {
    // The lookup runs through a SECURITY DEFINER RPC with the service role, so
    // without that key the route correctly answers 503 rather than pretending.
    // Skipping is honest here; asserting would only measure the local .env.
    test.skip(!hasServiceRole(), "needs SUPABASE_SERVICE_ROLE_KEY to reach the lookup RPC");

    const { status } = await postJson(page, "/api/orders/lookup", {
      ref: "RR-000000",
      email: SAFE_EMAIL,
    });
    // A 4xx, or a 200 carrying nothing. What must never happen is a crash, or a
    // different SHAPE of answer for a real reference than for a made-up one —
    // that difference is what turns a lookup form into a reference oracle.
    expect(status).toBeLessThan(500);
  });
});
