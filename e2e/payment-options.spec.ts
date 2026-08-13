import { test, expect } from "@playwright/test";

// ── A customer must be able to see how to pay ──────────────────────────────
//
// Reported as "bank number does not display", and proven on the live site: an
// event with accepts_cash = FALSE and accepts_bank_transfer = TRUE offered CASH
// at checkout and never showed the transfer details.
//
// TWO independent faults, either of which alone caused it (M83, M83b):
//
//   1. NO ROLE HELD `select` on store_payment_settings. Postgres checks the
//      table privilege BEFORE row security, so the customer_read policy had
//      never once run — anon and authenticated both got 42501.
//   2. That policy was `TO authenticated`. A guest matches no permissive SELECT
//      policy, and no policy means denied — so fixing only the grant would have
//      repaired signed-in customers and left every guest broken. Guests are the
//      DEFAULT path here: checkout says "no account needed".
//
// /api/cart/resolve turns the failure into `pay = null` and falls back to
// documented defaults (cash on, bank off), so the symptom was a confident WRONG
// answer rather than an error — invisible to types, build and unit tests.
//
// This lives in Playwright, not vitest, because vitest.config.ts is explicitly
// hermetic ("no dev server, no network") and this must query as the real role a
// visitor's browser holds.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

test.describe("payment options are visible to a customer", () => {
  test.skip(!SUPABASE_URL || !ANON, "needs NEXT_PUBLIC_SUPABASE_URL and the anon/publishable key");

  const headers = () => ({ apikey: ANON!, Authorization: `Bearer ${ANON!}` });

  test("a GUEST can read the payment methods of a live shop", async ({ request }) => {
    const stores = await request.get(
      `${SUPABASE_URL}/rest/v1/stores?status=eq.active&is_test=eq.false&select=id,name&limit=1`,
      { headers: headers(), failOnStatusCode: false },
    );
    expect(stores.status(), "a guest must be able to list live shops").toBe(200);
    const live = (await stores.json()) as { id: string; name: string }[];
    test.skip(live.length === 0, "no live shop to assert against");

    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/store_payment_settings?store_id=eq.${live[0].id}&select=accepts_cash,accepts_bank_transfer`,
      { headers: headers(), failOnStatusCode: false },
    );

    // 401 / 42501 here means the GRANT went missing again (the M83 half).
    expect(res.status(), `guest was refused store_payment_settings for ${live[0].name}`).toBe(200);

    // A 200 with an empty array means the SELECT policy stopped covering `anon`
    // (the M83b half). From the checkout screen the two are indistinguishable —
    // both show "Cash" whatever the shop actually accepts.
    const rows = (await res.json()) as unknown[];
    expect(
      rows.length,
      "guest read succeeded but returned no row — the SELECT policy no longer covers anon",
    ).toBeGreaterThan(0);
  });

  test("a hidden shop's bank details stay private", async ({ request }) => {
    // The other side of the same policy: widening access to fix the above must
    // not publish a draft or test shop's bank account to the world.
    const hidden = await request.get(
      `${SUPABASE_URL}/rest/v1/stores?is_test=eq.true&select=id&limit=1`,
      { headers: headers(), failOnStatusCode: false },
    );
    const list = hidden.status() === 200 ? ((await hidden.json()) as { id: string }[]) : [];
    test.skip(list.length === 0, "guests cannot even list test shops, which is stricter and fine");

    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/store_payment_settings?store_id=eq.${list[0].id}&select=accepts_cash`,
      { headers: headers(), failOnStatusCode: false },
    );
    const rows = res.status() === 200 ? ((await res.json()) as unknown[]) : [];
    expect(rows.length, "a hidden shop's payment settings leaked to the public").toBe(0);
  });
});
