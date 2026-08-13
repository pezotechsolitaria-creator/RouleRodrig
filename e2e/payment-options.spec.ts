import { test, expect } from "@playwright/test";

// ── A customer must see HOW to pay, and nobody may harvest bank accounts ───
//
// Two invariants that pull against each other, which is why both are pinned
// here. Fixing either one alone broke the other during this work.
//
// THE BUG (M83/M84). Reported as "bank number does not display": an event with
// accepts_cash = FALSE and accepts_bank_transfer = TRUE offered CASH at
// checkout. /api/cart/resolve could not read store_payment_settings, turned the
// failure into `pay = null`, and fell back to documented defaults — cash on,
// bank off. Every customer, across events, food and marketplace, was shown a
// confident WRONG answer rather than an error.
//
// THE WRONG FIX, briefly live. Granting anon SELECT on that table made the
// checkout correct and published every live shop's bank_name, account_holder
// and account_number to unauthenticated callers — the exact
// marketplace-wide harvesting M8 removed the grant to prevent, and wider,
// because M8's hole at least required a signed-in user.
//
// THE RIGHT SHAPE. No table access; store_payment_options() returns the three
// booleans a customer needs to choose, and store_bank_details() releases the
// account only to somebody who already has an order with that shop.
//
// This lives in Playwright, not vitest, because vitest.config.ts is
// deliberately hermetic ("no dev server, no network") and these must be asked
// as the role a visitor's browser actually holds. playwright.config loads
// .env.local so they cannot silently skip.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

test.describe("payment options", () => {
  test.skip(!SUPABASE_URL || !ANON, "needs NEXT_PUBLIC_SUPABASE_URL and the anon/publishable key");

  const headers = () => ({ apikey: ANON!, Authorization: `Bearer ${ANON!}`, "Content-Type": "application/json" });

  test("a stranger cannot read anybody's bank account", async ({ request }) => {
    // The one that matters most. A 200 here means every live shop's account
    // number is public, which is what an impersonation scam needs and nothing
    // else does.
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/store_payment_settings?select=bank_name,account_holder,account_number`,
      { headers: headers(), failOnStatusCode: false },
    );
    expect(
      res.status(),
      "store_payment_settings is readable without a session — bank accounts are exposed",
    ).toBe(401);
  });

  test("a GUEST can still learn which methods a live shop accepts", async ({ request }) => {
    const stores = await request.get(
      `${SUPABASE_URL}/rest/v1/stores?status=eq.active&is_test=eq.false&select=id,name&limit=1`,
      { headers: headers(), failOnStatusCode: false },
    );
    expect(stores.status()).toBe(200);
    const live = (await stores.json()) as { id: string; name: string }[];
    test.skip(live.length === 0, "no live shop to assert against");

    const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/store_payment_options`, {
      headers: headers(),
      data: { p_store_id: live[0].id },
      failOnStatusCode: false,
    });
    expect(res.status(), `guest was refused store_payment_options for ${live[0].name}`).toBe(200);

    const rows = (await res.json()) as { accepts_cash?: boolean; accepts_bank_transfer?: boolean }[];
    // Empty means the function stopped answering guests, and the checkout would
    // silently fall back to "cash on, bank off" — the original bug returning.
    expect(rows.length, "store_payment_options returned nothing for a live shop").toBeGreaterThan(0);
    expect(typeof rows[0].accepts_cash).toBe("boolean");
    expect(typeof rows[0].accepts_bank_transfer).toBe("boolean");
  });

  test("the options accessor leaks no bank details", async ({ request }) => {
    const stores = await request.get(
      `${SUPABASE_URL}/rest/v1/stores?status=eq.active&is_test=eq.false&select=id&limit=1`,
      { headers: headers(), failOnStatusCode: false },
    );
    const live = (await stores.json()) as { id: string }[];
    test.skip(live.length === 0, "no live shop to assert against");

    const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/store_payment_options`, {
      headers: headers(),
      data: { p_store_id: live[0].id },
      failOnStatusCode: false,
    });
    const raw = await res.text();
    // Belt and braces: if somebody widens the RETURNS TABLE later, this catches
    // it before the account number is on the public internet again.
    for (const forbidden of ["bank_name", "account_holder", "account_number"]) {
      expect(raw, `store_payment_options now returns ${forbidden}`).not.toContain(forbidden);
    }
  });

  test("a hidden shop's configuration stays private", async ({ request }) => {
    const hidden = await request.get(
      `${SUPABASE_URL}/rest/v1/stores?is_test=eq.true&select=id&limit=1`,
      { headers: headers(), failOnStatusCode: false },
    );
    const list = hidden.status() === 200 ? ((await hidden.json()) as { id: string }[]) : [];
    test.skip(list.length === 0, "guests cannot even list test shops, which is stricter and fine");

    const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/store_payment_options`, {
      headers: headers(),
      data: { p_store_id: list[0].id },
      failOnStatusCode: false,
    });
    const rows = res.status() === 200 ? ((await res.json()) as unknown[]) : [];
    expect(rows.length, "a hidden shop's payment configuration is visible to the public").toBe(0);
  });
});
