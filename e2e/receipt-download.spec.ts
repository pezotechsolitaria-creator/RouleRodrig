import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// ── Booking receipt download ─────────────────────────────────────────────────
//
// "Download receipt" used to open a print dialog and hope the customer found
// "Save as PDF" — it never downloaded anything, and in an installed PWA there
// is often no print UI at all. It now builds a real PDF in the browser
// (lib/receipt-pdf.ts) and saves it. This test drives that whole path in a real
// browser and inspects the bytes that land on disk.
//
// NO BOOKING IS CREATED. The receipt is reachable only by submitting the form —
// `lastBooking` and formState are set inside the submit handler, so a seeded
// database row cannot surface the button at all — so the POST to /api/bookings
// is intercepted and answered with the shape the client expects. That keeps the
// test hermetic, free of a service-role key, and safe to run against production:
// the request never reaches the server.
//
// The unit tests in lib/receipt-pdf.test.ts already prove the PDF's internal
// structure (xref offsets, stream length, escaping). What they cannot prove is
// that a browser actually saves a file when the button is clicked. That is this.

const BOOKING_ID = "e2e0000-aaaa-bbbb-cccc-000000000001";
// receiptFilename() derives this: dashes stripped, first 6 chars, uppercased.
const EXPECTED_FILENAME = "RR-E2E000.pdf";
const CUSTOMER = "E2E Receipt Tester";

async function submitBooking(page: Page) {
  await page.goto("/browse/scooter");

  // Scoped to the booking form so the field selectors below say what they mean.
  //
  // `.first()` is a cheap guard, not a workaround: an earlier version of this
  // comment claimed the page rendered the form twice with duplicate ids. That
  // was wrong — measured again, the source defines one <form> and seven bk-*
  // ids, each exactly once, with seven matching htmlFor labels, and both the
  // server HTML and the hydrated DOM contain exactly one of each. The "two
  // forms" reading came from a reused browser tab, not from the site.
  const form = page.locator("form").filter({ has: page.locator("#bk-vehicle") }).first();
  await expect(form).toBeVisible();

  // A real vehicle from the live fleet — index 1 skips the "Choose a vehicle…"
  // placeholder.
  //
  // Both the wait and the retry are load-bearing. The fleet arrives
  // asynchronously, so selecting immediately picks from a list that is still
  // just the placeholder, and the re-render that follows discards the choice.
  // The form then refuses with "Please choose a vehicle." and the failure only
  // surfaces much later as a missing receipt button. One selectOption was
  // enough against production and not against a dev server — exactly the kind
  // of difference that makes a suite flaky rather than wrong.
  const vehicle = form.locator("#bk-vehicle");
  await expect(vehicle.locator("option")).not.toHaveCount(1);
  await expect(async () => {
    await vehicle.selectOption({ index: 1 });
    await expect(vehicle).not.toHaveValue("");
  }, "vehicle selection never stuck").toPass({ timeout: 20_000 });

  // Dates come from what the calendar actually offers rather than a fixed
  // offset: availability depends on existing bookings and on how far ahead the
  // vehicle can be reserved, so any hardcoded day would eventually land on a
  // disabled button and fail for a reason that is not a regression.
  //
  // They are then clicked BY DATE, not by index. Choosing a start date
  // re-renders the calendar and re-orders which buttons are enabled, so an
  // index-based second click can land back on the start day — giving a zero-day
  // rental, which the form rejects with "Return must be after pickup".
  const openDays = form.locator('button[aria-label^="20"]:not([disabled])');
  await expect(openDays.first()).toBeEnabled();
  const available: string[] = await openDays.evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label") ?? "").filter(Boolean),
  );
  expect(available.length, "calendar offered no bookable dates").toBeGreaterThan(1);

  const start = available[0];
  const end = available[Math.min(2, available.length - 1)];
  expect(end > start, `end ${end} must be after start ${start}`).toBe(true);

  await form.locator(`button[aria-label="${start}"]`).click();
  await form.locator(`button[aria-label="${end}"]`).click();

  await form.locator("#bk-name").fill(CUSTOMER);
  await form.locator("#bk-email").fill("e2e.receipt@example.test");
  await form.locator('input[type="tel"]').fill("5251 2345");

  // Terms — the submit is refused without it.
  await form.locator('input[type="checkbox"]').first().check();

  await form.getByRole("button", { name: /request booking/i }).click();

  // Page-scoped, NOT form-scoped: on success the card replaces the form rather
  // than rendering inside it, so a locator rooted at <form> can never find it.
  //
  // The wait also surfaces the form's own refusals ("Please choose a vehicle.",
  // "Return must be after pickup") in the failure snapshot, which turns a
  // mysterious "Download receipt was never visible" into the actual reason.
  const success = page.getByRole("button", { name: /download receipt/i }).first();
  await expect(success, "booking did not reach the success state").toBeVisible({
    timeout: 20_000,
  });
}

test.describe("booking receipt", () => {
  test.beforeEach(async ({ page }) => {
    // A successful submit fires posthog.capture("scooter_booking_requested"),
    // so without this every run would post a fake booking into real product
    // analytics — and this suite is meant to be safe to point at production.
    await page.route(/posthog\.com/, (route) => route.abort());

    await page.route("**/api/bookings", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bookingId: BOOKING_ID, depositAmount: 0 }),
      });
    });
  });

  test("the button saves a real PDF", async ({ page }) => {
    await submitBooking(page);

    const button = page.getByRole("button", { name: /download receipt/i }).first();
    await expect(button).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);

    expect(download.suggestedFilename()).toBe(EXPECTED_FILENAME);

    const file = await download.path();
    expect(file).toBeTruthy();
    const bytes = readFileSync(file!);

    // A real PDF, not an HTML page with a .pdf name.
    expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(bytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  test("the PDF carries this booking's details", async ({ page }) => {
    await submitBooking(page);

    const button = page.getByRole("button", { name: /download receipt/i }).first();
    await expect(button).toBeVisible({ timeout: 15_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);

    const text = readFileSync((await download.path())!).toString("latin1");

    expect(text).toContain(CUSTOMER);
    expect(text).toContain("RR-E2E000");
    expect(text).toContain("BOOKING RECEIPT");
    // Helvetica is a base-14 font, so nothing has to be embedded — that is what
    // keeps the file ~2 KB and openable everywhere.
    expect(text).toContain("Helvetica");
  });
});
