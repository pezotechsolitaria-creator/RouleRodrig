import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getEarnings } from "./earnings";

// ── THE BLOCK THAT MUST NEVER SAY "Rs 0.00" TO SOMEONE WHO HAS BEEN PAID ────
//
// getEarnings takes a Supabase client, so it is tested against a fake that
// records what was asked and answers what we tell it to. The behaviour under
// test is not arithmetic — it is the refusal to guess.

type Row = {
  merchant_net: number | null;
  commission_amount: number | null;
  commission_rate: number | string | null;
};

/**
 * Enough of the client for this one function: a filter chain that resolves to
 * `financials`, and a separate head-count chain that resolves to `paidCount`.
 */
function fakeClient(opts: {
  financials?: Row[];
  financialsError?: boolean;
  paidCount?: number;
  countError?: boolean;
}) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      if (table === "order_financials") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.not = self;
        chain.is = () =>
          opts.financialsError
            ? Promise.resolve({ data: null, error: { message: "denied" } })
            : Promise.resolve({ data: opts.financials ?? [], error: null });
        return chain;
      }
      // orders — the guard's head count
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.in = () =>
        opts.countError
          ? Promise.resolve({ count: null, error: { message: "denied" } })
          : Promise.resolve({ count: opts.paidCount ?? 0, error: null });
      return chain;
    },
  } as never;
}

describe("getEarnings", () => {
  it("sums what the merchant was paid and what they owe", async () => {
    const r = await getEarnings(
      fakeClient({
        financials: [
          { merchant_net: 22500, commission_amount: 2500, commission_rate: 0.1 },
          { merchant_net: 45000, commission_amount: 5000, commission_rate: 0.1 },
        ],
      }),
      "store-1",
    );
    expect(r).toEqual({
      ok: true,
      netCents: 67500,
      commissionCents: 7500,
      rate: 0.1,
      orderCount: 2,
    });
  });

  // THE GUARD. This is the whole reason the function returns a union.
  it("REFUSES to report zero when the store demonstrably has money", async () => {
    const r = await getEarnings(fakeClient({ financials: [], paidCount: 3 }), "store-1");
    expect(r).toEqual({ ok: false });
  });

  it("reports a true zero for a store that has genuinely never sold", async () => {
    const r = await getEarnings(fakeClient({ financials: [], paidCount: 0 }), "store-1");
    expect(r).toEqual({ ok: true, netCents: 0, commissionCents: 0, rate: null, orderCount: 0 });
  });

  it("fails rather than guesses when the financials read errors", async () => {
    expect(await getEarnings(fakeClient({ financialsError: true }), "s")).toEqual({ ok: false });
  });

  it("fails rather than guesses when the guard's own count errors", async () => {
    // Without this, a broken guard would fall through to "you earned nothing".
    expect(await getEarnings(fakeClient({ financials: [], countError: true }), "s")).toEqual({
      ok: false,
    });
  });

  it("does not run the guard when there are figures to show", async () => {
    const c = fakeClient({ financials: [{ merchant_net: 1, commission_amount: 0, commission_rate: 0 }] });
    await getEarnings(c, "s");
    expect((c as unknown as { calls: string[] }).calls).toEqual(["order_financials"]);
  });

  describe("the commission rate is read, never assumed", () => {
    it("reports the rate when every order carries the same one", async () => {
      const r = await getEarnings(
        fakeClient({ financials: [{ merchant_net: 9, commission_amount: 1, commission_rate: "0.10000" }] }),
        "s",
      );
      expect(r.ok && r.rate).toBe(0.1);
    });

    it("reports NO rate when orders span two rates", async () => {
      // Exactly what happens the week a platform changes its model, as this one
      // did. No single percentage would be true, so none is claimed.
      const r = await getEarnings(
        fakeClient({
          financials: [
            { merchant_net: 100, commission_amount: 0, commission_rate: 0 },
            { merchant_net: 90, commission_amount: 10, commission_rate: 0.1 },
          ],
        }),
        "s",
      );
      expect(r.ok && r.rate).toBeNull();
      expect(r.ok && r.commissionCents).toBe(10);
    });

    it("survives a null rate without inventing one", async () => {
      const r = await getEarnings(
        fakeClient({ financials: [{ merchant_net: 5, commission_amount: 0, commission_rate: null }] }),
        "s",
      );
      expect(r.ok && r.rate).toBeNull();
    });
  });

  it("treats null money as zero rather than NaN", async () => {
    const r = await getEarnings(
      fakeClient({ financials: [{ merchant_net: null, commission_amount: null, commission_rate: 0.1 }] }),
      "s",
    );
    expect(r.ok && r.netCents).toBe(0);
    expect(r.ok && r.commissionCents).toBe(0);
  });
});

/**
 * Comments explain WHY there is no payout, so they legitimately contain the
 * words the rendered page must never show. These assertions are about the code
 * and the copy, not the reasoning, so the reasoning is stripped first.
 */
function code(path: string[]): string {
  return readFileSync(join(process.cwd(), ...path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("what the block promises, asserted against the source", () => {
  const src = code(["lib", "merchant", "earnings.ts"]);
  const ui = code(["components", "merchant", "home", "Earnings.tsx"]);

  it("scopes to one STORE, not to the merchant", () => {
    // Every food kitchen on the island hangs off one platform merchant, so a
    // merchant-scoped aggregate would show a kitchen owner the whole island's
    // takings as their own.
    expect(src).toContain('.eq("orders.store_id", storeId)');
    expect(src).not.toContain("merchant_fee_summary");
  });

  it("excludes money that was never recognised or was reversed", () => {
    expect(src).toContain('.not("earned_at", "is", null)');
    expect(src).toContain('.is("reversed_at", null)');
  });

  it("never claims a payout, a balance or a schedule", () => {
    // The platform does not hold the money; the customer pays the merchant
    // directly. Any of these words would describe something that exists nowhere.
    for (const word of ["payout", "Payout", "balance", "Balance", "withdraw"]) {
      expect(ui, `the earnings block must not mention "${word}"`).not.toContain(word);
    }
  });

  it("renders no commission line at all when nothing is owed", () => {
    expect(ui).toContain("earnings.commissionCents > 0");
  });

  it("keeps money in cents all the way to the formatter", () => {
    expect(ui).toContain("centsToDecimalString(earnings.netCents)");
    expect(ui).toContain("centsToDecimalString(earnings.commissionCents)");
  });
});
