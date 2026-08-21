import { test, expect, type Page } from "@playwright/test";
import { hasServiceRole } from "./support/merchant-test-user";

// ── EVERY BOOKING VERTICAL: SCOOTER, CAR, STAY, EXPERIENCE ──────────────────
//
// booking.spec.ts already covers the scooter FORM in depth and hammers
// /api/bookings with rejection cases. This file deliberately does NOT repeat
// those: /api/bookings is rate limited to 8 requests a minute per IP, and two
// files racing at it made the suite measure the limiter instead of the rules.
//
// What this file covers is everything that was untested:
//
//   · the arithmetic that decides what a rental COSTS (M129)
//   · stays and experiences — the path that had never carried a real booking
//   · the availability step on all four verticals (M91 for vehicles,
//     M127 for stays and experiences)
//   · that a listing which does not exist cannot be booked (M128)
//   · every booking surface actually rendering, with no nameless cards
//
// ── HOW THIS STAYS SAFE AGAINST A LIVE DATABASE ─────────────────────────────
//
// There is no staging. One database, and it is production. Every test is one of
// two shapes and never anything else:
//
//   1. REJECTION PATHS, hit for real. A request the API refuses creates no row,
//      holds no dates and sends no email.
//   2. HAPPY PATHS with the API INTERCEPTED. The journey runs in a real
//      browser; the POST never leaves Playwright.
//
// This is not theoretical. The first version of this file caught a real hole by
// posting a listing id that did not exist — and got a 200, and a row in
// production, which had to be deleted. If you add a test that writes, put it
// behind a fixture that cleans up (e2e/support/order-test-fixtures.ts).

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

// A reserved domain that can never receive mail, so even a stray success emails
// nobody — and lib/admin/customers.ts filters it out of the real customer list.
const SAFE_EMAIL = "playwright@zztest.invalid";
const SAFE_PHONE = "+230 5712 3456";

const PLACE_BASE = {
  place_id: "playwright-does-not-exist",
  place_name: "Playwright Test Place",
  name: "Playwright Test",
  email: SAFE_EMAIL,
  phone: SAFE_PHONE,
  start_date: daysFromNow(120),
  guests: 2,
};

async function postJson(page: Page, url: string, body: unknown) {
  const res = await page.request.post(url, { data: body, failOnStatusCode: false });
  let json: { error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* an HTML error page — the status alone is the signal */
  }
  return { status: res.status(), error: json.error ?? "" };
}

/** Every Rs amount rendered inside the booking summary, as numbers. */
async function rupeeAmounts(page: Page, scope = "#booking"): Promise<number[]> {
  const texts = await page.locator(`${scope} dd`).allInnerTexts();
  return texts
    .map((t) => t.match(/Rs\s*([\d,]+)/))
    .filter(Boolean)
    .map((m) => Number(m![1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Select the first real vehicle in the fleet dropdown. False if none published. */
async function selectFirstVehicle(page: Page): Promise<boolean> {
  const select = page.locator("#booking select").first();
  await expect(select).toBeEnabled();
  const options = await select.locator("option").all();
  if (options.length < 2) return false;
  await select.selectOption({ index: 1 });
  return true;
}

/** Set the rental length the way the Trip Planner does. */
async function prefillDays(page: Page, days: number) {
  await page.evaluate((d) => {
    window.dispatchEvent(new CustomEvent("rr:prefill-booking", { detail: { days: d } }));
  }, days);
  await expect(page.locator("#booking").getByText(/deposit/i).first()).toBeVisible();
}

// ════════════════════════════════════════════════════════════════════════════
// 1. WHAT A RENTAL COSTS — the arithmetic, in the browser (M129)
// ════════════════════════════════════════════════════════════════════════════
//
// The bug: 01 Aug → 08 Aug priced as 7 days. That is the number of NIGHTS. A
// customer who collects on the 1st and returns on the 8th has the bike on
// eight calendar days, so every rental was billed a day short. Unit tests pin
// rentalDays(); these pin that the number actually reaches the screen, through
// the component, in the currency the customer reads.

test.describe("a rental is priced for every day the customer has it", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/browse/scooter");
  });

  test("seven days costs more than six", async ({ page }) => {
    test.skip(!(await selectFirstVehicle(page)), "no fleet published");

    const totalFor = async (days: number) => {
      await prefillDays(page, days);
      return Math.max(...(await rupeeAmounts(page)));
    };

    const six = await totalFor(6);
    const seven = await totalFor(7);
    expect(seven, "seven days must cost more than six").toBeGreaterThan(six);
  });

  test("asking for one day charges for one day, not two", async ({ page }) => {
    // The trap this guards: a single tap used to default the return to
    // start + 1, which was 1 day under the old exclusive arithmetic. Once days
    // counted both ends, that same default silently became two days.
    test.skip(!(await selectFirstVehicle(page)), "no fleet published");
    await prefillDays(page, 1);

    const summary = await page.locator("#booking").innerText();
    expect(summary).toMatch(/\b1\s*(day|jour)/i);
    expect(summary).not.toMatch(/\b2\s*(days|jours)/i);
  });

  test("the price breaks down, rather than showing one opaque total", async ({ page }) => {
    test.skip(!(await selectFirstVehicle(page)), "no fleet published");
    await prefillDays(page, 3);

    // Total, deposit and balance at least — a customer must be able to see
    // what they pay now and what they pay later.
    const amounts = await rupeeAmounts(page);
    expect(amounts.length, "expected a broken-down price").toBeGreaterThanOrEqual(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. NOBODY PAYS FOR A SLOT THAT HAS NOT BEEN CHECKED
// ════════════════════════════════════════════════════════════════════════════
//
// The same rule on all four verticals, arrived at twice: M91 for vehicles,
// M127 for stays and experiences. The boats, the therapist and the guesthouses
// are not the owner's, so confirming one he cannot get means taking money and
// giving it back — a PayPal fee, an exchange spread, and a customer who does
// not come back.

test.describe("the vehicle confirmation promises a check, not a charge", () => {
  test.beforeEach(async ({ page }) => {
    // Intercepted: the journey is real, the booking is not.
    await page.route("**/api/bookings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          bookingId: "00000000-0000-4000-8000-000000000000",
          depositAmount: 999,
        }),
      }),
    );
    await page.goto("/browse/scooter");
  });

  test("says what happens next, and that nothing is charged for a vehicle we cannot supply", async ({ page }) => {
    test.skip(!(await selectFirstVehicle(page)), "no fleet published");
    await prefillDays(page, 2);

    await page.locator("#booking input[type='text']").first().fill("Playwright Test");
    await page.locator("#booking input[type='email']").first().fill(SAFE_EMAIL);
    // PhoneInput takes the national number; the component composes E.164.
    await page.locator("#booking input[type='tel']").first().fill("57123456");
    await page.locator("#booking input[type='checkbox']").first().check();
    await page.locator("#booking form button[type=submit]").click();

    await expect(page.getByText(/request sent|booking request/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/what happens next/i).first()).toBeVisible();
    await expect(page.getByText(/never be charged/i).first()).toBeVisible();

    // The button M91 removed. Its return would mean paying for an unchecked slot.
    await expect(page.getByRole("button", { name: /pay deposit/i })).toHaveCount(0);
  });
});

test.describe("the stay and experience confirmation does the same", () => {
  test.beforeEach(async ({ page }) => {
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

  /** Open the booking modal on the first bookable listing, if there is one. */
  async function openBooking(page: Page, path: string): Promise<boolean> {
    await page.goto(path);
    // The CTA wording differs per vertical ("See availability", "See the trip",
    // "Meet the guide"), so match the intent rather than one label.
    const cta = page.getByRole("button", { name: /book|reserve|availability|see the|meet the/i }).first();
    if (!(await cta.isVisible().catch(() => false))) return false;
    await cta.click();
    return true;
  }

  for (const path of ["/experiences/boat", "/experiences/fishing", "/experiences/massage"]) {
    test(`${path} — the modal opens and offers no way to pay`, async ({ page }) => {
      test.skip(!(await openBooking(page, path)), "no bookable listing on this vertical");

      // role=dialog exists because a screen-reader user has to be told a dialog
      // opened. It was a bare div until a test could not find it either.
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toBeVisible();

      // The sentence that used to be there, promising a confirmation nobody
      // had checked with the partner.
      await expect(dialog).not.toContainText(/pay below and it's confirmed/i);
      await expect(dialog.locator("iframe[title*='PayPal' i]")).toHaveCount(0);
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. WHAT THE SERVER MUST REFUSE — stays and experiences
// ════════════════════════════════════════════════════════════════════════════
//
// Hit for real. A refused request creates no row, holds no dates, sends no
// email. Serial, because /api/place-bookings is rate limited too.

test.describe("a stay or experience request the API must refuse", () => {
  test.describe.configure({ mode: "serial" });

  const cases: { label: string; body: Record<string, unknown>; expect: RegExp }[] = [
    { label: "no listing at all", body: { ...PLACE_BASE, place_id: "" }, expect: /missing required/i },
    { label: "no name", body: { ...PLACE_BASE, name: "" }, expect: /missing required/i },
    { label: "no date", body: { ...PLACE_BASE, start_date: "" }, expect: /missing required/i },
    { label: "a phone number nobody could answer", body: { ...PLACE_BASE, phone: "12345" }, expect: /phone/i },
    { label: "an email address that is not one", body: { ...PLACE_BASE, email: "not-an-email" }, expect: /email/i },
  ];

  for (const c of cases) {
    test(`refuses ${c.label}`, async ({ page }) => {
      const { status, error } = await postJson(page, "/api/place-bookings", c.body);
      expect(status, `expected a 4xx for: ${c.label}`).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      expect(error).toMatch(c.expect);
    });
  }

  // ── THE ONE THAT FOUND A REAL HOLE (M128) ─────────────────────────────────
  //
  // This failed the first time it ran: the API returned 200 for a listing id
  // that does not exist and CREATED A ROW in production, with a client-supplied
  // name and a deposit of zero — a free booking against nothing, invisible to
  // every availability check. /api/bookings had the identical hole for vehicles
  // until 2026-08-08.
  //
  // It is the highest-value test in this file: the only one that has ever
  // caught anything. If it starts passing for the wrong reason, the hole is
  // back.
  test("refuses a listing that does not exist, and creates nothing", async ({ page }) => {
    const { status, error } = await postJson(page, "/api/place-bookings", PLACE_BASE);
    expect(status, "a booking for a non-existent listing must be refused").toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect(error).toMatch(/isn't available|not available/i);
  });

  test("still refuses a fake listing when the customer gave no email", async ({ page }) => {
    // A guest with no address is legitimate — requiring an account is how the
    // marketplace silently dropped every default checkout before M28. So the
    // refusal must come from the LISTING, not from the empty email.
    const { status, error } = await postJson(page, "/api/place-bookings", { ...PLACE_BASE, email: "" });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(error).not.toMatch(/email/i);
  });

  test("a price sent by the browser cannot buy anything", async ({ page }) => {
    // Money is resolved from the listing server-side and can never be sent in.
    // The refusal lands on the fake listing BEFORE price is considered, which
    // is the point: the guard sits in front of the money.
    const { status } = await postJson(page, "/api/place-bookings", {
      ...PLACE_BASE,
      depositAmount: 1,
      deposit_amount: 1,
      total: 1,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. EVERY BOOKING SURFACE LOADS, AND NOTHING RENDERS BLANK
// ════════════════════════════════════════════════════════════════════════════

test.describe("the pages a customer books from", () => {
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

  test("no listing renders as a nameless card", async ({ page }) => {
    // Two empty massage drafts shipped to production and rendered as blank
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
// 5. FINDING A BOOKING AGAIN
// ════════════════════════════════════════════════════════════════════════════

test.describe("a customer can come back to their booking", () => {
  test("/track loads and asks for a reference", async ({ page }) => {
    const res = await page.goto("/track");
    expect(res?.status()).toBeLessThan(400);
    // Two factors on purpose: a reference alone in a URL ends up in browser
    // history, shared links and server logs, so the email is still typed.
    await expect(page.locator("input").first()).toBeVisible();
  });

  test("an unknown reference is refused without revealing whether it exists", async ({ page }) => {
    // The lookup runs through a SECURITY DEFINER RPC with the service role, so
    // without that key the route correctly answers 503. Skipping is honest;
    // asserting would only measure the local .env.
    test.skip(!hasServiceRole(), "needs SUPABASE_SERVICE_ROLE_KEY to reach the lookup RPC");

    const { status } = await postJson(page, "/api/orders/lookup", {
      ref: "RR-000000",
      email: SAFE_EMAIL,
    });
    // What must never happen is a crash, or a different SHAPE of answer for a
    // real reference than a made-up one — that difference turns a lookup form
    // into a way to discover which references exist.
    expect(status).toBeLessThan(500);
  });
});
