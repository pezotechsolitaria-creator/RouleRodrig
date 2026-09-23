import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrepaymentOnlyFor, isPrepaymentOnlyForAll } from "./prepayment";

// ── CASH FOR ONE KITCHEN, NOT FOR THE PLATFORM (M201) ───────────────────────
//
// On 23 Sept 2026 the owner said "allow cash for chez banane". The platform
// switch (M89) stays ON; Chez Banane is exempted from it. These guards pin the
// three ways that could quietly go wrong later:
//
//   · the exemption leaking to other shops (the switch flipped instead, or a
//     table a merchant can write to — a shop granting itself cash);
//   · the database and the consoles disagreeing (a screen still asking the
//     PLATFORM question, hiding cash the trigger now accepts — or the reverse);
//   · a failed read being taken as "cash is fine".

const CHEZ_BANANE = "d522e765-78c3-43da-ab4e-db2b7977acaa";
const sql = readFileSync("supabase/migrations/20260923140000_m201_cash_for_one_kitchen.sql", "utf8")
  .replace(/\r\n/g, "\n");

describe("M201 exempts one store and loosens nothing else", () => {
  it("never touches the platform switch", () => {
    expect(sql).not.toMatch(/update\s+(public\.)?marketplace_settings/i);
    expect(sql).not.toMatch(/prepayment_only\s*=\s*false/i);
    // …and proves it is still on after running.
    expect(sql).toContain("if not prepayment_only() then");
  });

  it("names exactly one store: Chez Banane", () => {
    const inserts = sql.match(/insert\s+into\s+public\.store_cash_exemptions/gi) ?? [];
    expect(inserts).toHaveLength(1);
    // The whole statement, up to its ON CONFLICT — a second row slipped into
    // the VALUES list would show up here as a second id.
    const from = sql.search(/insert\s+into\s+public\.store_cash_exemptions/i);
    const stmt = sql.slice(from, sql.indexOf("on conflict", from));
    expect(stmt.match(/'[0-9a-f-]{36}'/g)).toEqual([`'${CHEZ_BANANE}'`]);
  });

  it("keeps the exemption where no merchant can write it", () => {
    // Its own table, RLS on, no policies, no client grants: only the owner (SQL
    // or an admin path) decides which shop takes cash.
    expect(sql).toContain("alter table public.store_cash_exemptions enable row level security;");
    expect(sql).toContain("revoke all on table public.store_cash_exemptions from public, anon, authenticated;");
    expect(sql).not.toMatch(/grant\s+[^;]*\bon\s+(table\s+)?(public\.)?store_cash_exemptions/i);
    expect(sql).not.toMatch(/create\s+policy[^;]*store_cash_exemptions/i);
    // And the proof block checks the grants on the live table, not just the text.
    expect(sql).toMatch(/has_table_privilege\('anon', 'public\.store_cash_exemptions'/);
  });

  it("only ever LOOSENS the rule for a store it names", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.prepayment_only_for"));
    // Built ON the platform answer, so switching M89 off still opens everything
    // and an unknown/null store can never be exempt.
    expect(fn).toMatch(/select prepayment_only\(\)\s+and not exists/);
    expect(sql).toContain("prepayment_only_for(null) is distinct from true");
  });

  it("rewrites the trigger — the real wall — per order's store", () => {
    expect(sql).toContain(
      "'if not prepayment_only_for((select o.store_id from orders o where o.id = new.order_id)) then'",
    );
  });

  it("refuses to rewrite a function whose shape changed since it was measured", () => {
    expect(sql).toMatch(/if v_n <> r\.expected then\s+raise exception/);
    // Anchored on the code around the call. A bare "prepayment_only()" needle
    // also matches the trigger's own NAME — the bug the first rehearsal caught.
    expect(sql).not.toMatch(/\(\s*'refuse_cash_when_prepayment_only',\s*'prepayment_only\(\)'/);
  });
});

describe("every screen about ONE store asks that store's question", () => {
  const screens: Record<string, string> = {
    "merchant order detail": "app/api/merchant/orders/[id]/route.ts",
    "merchant payment settings": "app/api/merchant/payment-settings/route.ts",
    "merchant home": "app/merchant/(app)/page.tsx",
  };
  for (const [name, file] of Object.entries(screens)) {
    it(name, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("isPrepaymentOnlyFor(supabase, storeId)");
      expect(src).not.toMatch(/isPrepaymentOnly\(supabase\)/);
    });
  }

  it("the kitchen board asks about the kitchens it is showing", () => {
    const src = readFileSync("app/api/kitchen/route.ts", "utf8");
    expect(src).toContain("isPrepaymentOnlyForAll(supabase, kitchenIds)");
    expect(src).not.toMatch(/isPrepaymentOnly\(supabase\)/);
  });
});

// A fake client that answers rpc() from a table, or fails.
function fakeClient(answers: Record<string, boolean | "error">): SupabaseClient {
  return {
    rpc: async (fn: string, args?: { p_store_id?: string }) => {
      const key = fn === "prepayment_only_for" ? `for:${args?.p_store_id}` : fn;
      const a = answers[key];
      if (a === "error" || a === undefined) return { data: null, error: { message: "boom" } };
      return { data: a, error: null };
    },
  } as unknown as SupabaseClient;
}

describe("the helper fails closed", () => {
  it("an exempt store: cash exists", async () => {
    const sb = fakeClient({ [`for:${CHEZ_BANANE}`]: false });
    expect(await isPrepaymentOnlyFor(sb, CHEZ_BANANE)).toBe(false);
  });

  it("a failed read is NOT permission for cash", async () => {
    const sb = fakeClient({ [`for:${CHEZ_BANANE}`]: "error" });
    expect(await isPrepaymentOnlyFor(sb, CHEZ_BANANE)).toBe(true);
  });

  it("no store → the platform answer", async () => {
    expect(await isPrepaymentOnlyFor(fakeClient({ prepayment_only: true }), null)).toBe(true);
    expect(await isPrepaymentOnlyFor(fakeClient({ prepayment_only: "error" }), undefined)).toBe(true);
  });

  it("several kitchens: cash only when EVERY one takes it", async () => {
    const sb = fakeClient({ [`for:${CHEZ_BANANE}`]: false, "for:other": true, "for:broken": "error" });
    expect(await isPrepaymentOnlyForAll(sb, [CHEZ_BANANE])).toBe(false);
    expect(await isPrepaymentOnlyForAll(sb, [CHEZ_BANANE, "other"])).toBe(true);
    expect(await isPrepaymentOnlyForAll(sb, [CHEZ_BANANE, "broken"])).toBe(true);
  });

  it("no kitchens → the platform answer, never an open door", async () => {
    expect(await isPrepaymentOnlyForAll(fakeClient({ prepayment_only: true }), [])).toBe(true);
  });
});
