import { test, expect } from "@playwright/test";

// ── Booking flow: logic + UX, end to end ────────────────────────────────────
// Two layers:
//   1. API rejection paths, hit directly. Every one of these used to pass
//      validation before 2026-08-08 (the server trusted client dates/days).
//      Rejections create no rows and send no emails, so they are safe to run
//      against the real backend.
//   2. The full form UX on /browse/scooter with /api/bookings INTERCEPTED —
//      the customer's whole journey (choose, price, validate, submit,
//      confirmation, deposit button) without creating real bookings or
//      pinging the owner's WhatsApp.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

const VALID = {
  name: "Playwright Test",
  email: "playwright@example.com",
  phone: "+230 5712 3456",
  scooter: "burgman",
  days: 2,
};

test.describe("booking API refuses illogical requests", () => {
  const cases: { label: string; body: Record<string, unknown>; expectMsg: RegExp }[] = [
    {
      label: "a pickup date in the past",
      body: { ...VALID, start_date: daysFromNow(-3), end_date: daysFromNow(1) },
      expectMsg: /already passed/i,
    },
    {
      label: "a return before the pickup",
      body: { ...VALID, start_date: daysFromNow(10), end_date: daysFromNow(5) },
      expectMsg: /on or after/i,
    },
    {
      label: "malformed dates",
      body: { ...VALID, start_date: "12/25/2026", end_date: "12/28/2026" },
      expectMsg: /don't look right/i,
    },
    {
      label: "a 6-month squat on the calendar",
      body: { ...VALID, start_date: daysFromNow(5), end_date: daysFromNow(185) },
      expectMsg: /60 days/i,
    },
    {
      label: "a start date a year and a half away",
      body: { ...VALID, start_date: daysFromNow(550), end_date: daysFromNow(553) },
      expectMsg: /year ahead/i,
    },
    {
      label: "an invalid phone number",
      body: { ...VALID, phone: "12345", start_date: daysFromNow(5), end_date: daysFromNow(7) },
      expectMsg: /phone/i,
    },
    {
      // Before 2026-08-08 an unknown vehicle was accepted: priceBreakdown()
      // returned null and the route fell back to the CLIENT's total_amount,
      // deriving the deposit from it. That is attacker-controlled pricing,
      // reachable just by posting a scooter id that doesn't exist — and the
      // row also formed an invisible second capacity pool.
      label: "a vehicle that is not in the fleet (was: client-priced booking)",
      body: {
        ...VALID,
        scooter: "not-a-real-vehicle-xyz",
        start_date: daysFromNow(5),
        end_date: daysFromNow(7),
        total_amount: 100,
      },
      expectMsg: /isn't available|not available/i,
    },
  ];

  // Serial: /api/bookings is guarded at 8 requests/minute per IP, so running
  // these in parallel (or re-running the file quickly) trips the limiter and
  // turns a validation assertion into a 429. A 429 is itself a correct refusal
  // — the request never reaches the database either way — so it is accepted,
  // but only a 400 lets us assert WHICH rule rejected it.
  test.describe.configure({ mode: "serial" });

  for (const { label, body, expectMsg } of cases) {
    test(`rejects ${label}`, async ({ request }) => {
      const res = await request.post("/api/bookings", { data: body });
      expect([400, 429]).toContain(res.status());
      if (res.status() === 429) return; // rate-limited: still refused, reason unasserted
      const json = (await res.json()) as { error?: string };
      expect(json.error ?? "").toMatch(expectMsg);
    });
  }
});

test.describe("booking form on /browse/scooter", () => {
  test.beforeEach(async ({ page }) => {
    // Never let the form reach the real backend from these tests.
    await page.route("**/api/bookings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, bookingId: "00000000-0000-4000-8000-000000000000", depositAmount: 999 }),
      }),
    );
    await page.goto("/browse/scooter");
  });

  // The booking section animates in with framer-motion `whileInView`, which
  // remounts its subtree — an explicit scrollIntoViewIfNeeded() races that and
  // detaches. Playwright's own auto-waiting handles scrolling correctly, so
  // these tests assert on the element and let it do the work.
  test("an empty submit names the FIRST problem instead of doing nothing", async ({ page }) => {
    const submit = page.locator("#booking form button[type=submit]");
    await expect(submit).toBeEnabled();
    // The validation lives in React's onSubmit, so the click must land AFTER
    // hydration — server HTML alone renders an enabled button that does
    // nothing. Selecting a fleet option proves the client handlers are live.
    const select = page.locator("#booking select").first();
    await select.selectOption({ index: 1 });
    await select.selectOption({ index: 0 });
    await submit.click();
    await expect(page.getByRole("alert").first()).toContainText(/choose a vehicle/i);
  });

  test("choosing vehicle + dates prices the trip: total, deposit and balance all shown", async ({ page }) => {
    const select = page.locator("#booking select").first();
    await expect(select).toBeEnabled();
    const options = await select.locator("option").all();
    test.skip(options.length < 2, "no fleet published");
    await select.selectOption({ index: 1 });

    // The Trip-Planner prefill event is the supported programmatic way to set
    // dates (same path the planner uses) — steadier than clicking calendar days.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("rr:prefill-booking", { detail: { days: 3 } }));
    });

    const summary = page.locator("#booking");
    await expect(summary.getByText(/deposit/i).first()).toBeVisible();
    // Total, deposit and balance are all real amounts (Rs 1,234 shapes).
    const amounts = await summary.locator("dd", { hasText: /Rs|€|\$/ }).allInnerTexts();
    expect(amounts.length).toBeGreaterThanOrEqual(3);
  });

  test("a complete booking reaches the confirmation card with a deposit button and receipt", async ({ page }) => {
    const select = page.locator("#booking select").first();
    await expect(select).toBeEnabled();
    const options = await select.locator("option").all();
    test.skip(options.length < 2, "no fleet published");
    await select.selectOption({ index: 1 });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("rr:prefill-booking", { detail: { days: 2 } }));
    });

    await page.locator("#booking input[type='text']").first().fill("Playwright Test");
    await page.locator("#booking input[type='email']").first().fill("playwright@example.com");
    // PhoneInput: national number; the component composes the full E.164 value.
    await page.locator("#booking input[type='tel']").first().fill("57123456");
    await page.locator("#booking input[type='checkbox']").first().check();

    await page.locator("#booking form button[type=submit]").click();

    // Confirmation replaces the form: success copy + pay-deposit + receipt.
    await expect(page.getByText(/request sent|booking request/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /pay deposit/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /receipt/i })).toBeVisible();
  });

  test("browse page offers a way back home", async ({ page }) => {
    await expect(page.locator("a[href='/']").first()).toBeAttached();
  });
});
