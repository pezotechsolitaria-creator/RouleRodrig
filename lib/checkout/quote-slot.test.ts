import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ── A BOOKING IS PRICED FOR ITS DAY (M218) ──────────────────────────────────
//
// Found by driving the checkout at 00:20 on 24 Sept 2026, the night Chez
// Banane became pre-order only: a bookable Friday slot was chosen, and the
// summary said "This shop is closed right now." with a Retry. quote_order()
// judged opening hours NOW while the order was judged at its slot — so the
// price never arrived and the button never lit, whenever the kitchen was shut.

const sql = readFileSync(
  "supabase/migrations/20260923220000_m218_a_booking_is_priced_for_its_day.sql",
  "utf8",
).replace(/\r\n/g, "\n");
const route = readFileSync("app/api/checkout/quote/route.ts", "utf8");
const form = readFileSync("components/checkout/CheckoutForm.tsx", "utf8");

describe("the database prices a booking at its slot", () => {
  it("validates the window the same way the order does, then stamps it", () => {
    expect(sql).toContain("v_win := food_pickup_window(p_store_id, p_pickup_date, p_pickup_time, now());");
    expect(sql).toContain("perform set_config('rr.fulfil_at', lower(v_win)::text, true);");
  });

  it("wraps quote_order untouched — shop and event pricing are not rewritten", () => {
    expect(sql).toContain("from quote_order(p_store_id, p_items, p_fulfillment, p_zone_id) q;");
    expect(sql).not.toMatch(/create or replace function public\.quote_order\s*\(/);
  });

  it("is public, like the price it wraps", () => {
    expect(sql).toMatch(/grant execute on function public\.quote_food_order\([^)]*\) to anon, authenticated;/);
  });

  it("proves the wrapper moves the instant, never the maths", () => {
    expect(sql).toContain("M218: the wrapper changed the price");
  });
});

describe("the route asks for the slot's price", () => {
  it("accepts the slot in the same shapes as checkout", () => {
    expect(route).toContain("pickupDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional()");
    expect(route).toContain("pickupTime: z.string().regex(/^([01]\\d|2[0-3]):(00|30)$/).optional()");
  });

  it("prices a booking through quote_food_order, anything else as before", () => {
    expect(route).toMatch(/wantsSlot \? "quote_food_order" : "quote_order"/);
  });

  it("passes a refused slot back as a sentence, not a 500", () => {
    expect(route).toContain('const KITCHEN_NOTICE_CODE = "RR030";');
    expect(route).toMatch(/error\.code === KITCHEN_NOTICE_CODE\)/);
  });
});

describe("the form sends the slot and waits for it", () => {
  it("prices with the slot it will order with", () => {
    expect(form).toContain("pickupDate: quoteDate ?? undefined,");
    expect(form).toContain("pickupTime: quoteTime ?? undefined,");
    expect(form).toMatch(/\}, \[cart, fulfillment, zoneId, c, quoteDate, quoteTime\]\);/);
  });

  it("does not price a food order before the picker has answered", () => {
    expect(form).toContain(
      'const quoteWaitsForTime = isFood && (when.status !== "ready" || (timing.needsNotice && !sentSlot));',
    );
    expect(form).toContain("if (quoteWaitsForTime) return;");
  });

  it("computes the slot above the early returns (hooks cannot follow them)", () => {
    const slotAt = form.indexOf("const sentSlot = timing.slot;");
    const firstEarlyReturn = form.indexOf("if (!hydrated || loadingCart) {");
    expect(slotAt).toBeGreaterThan(-1);
    expect(firstEarlyReturn).toBeGreaterThan(-1);
    expect(slotAt).toBeLessThan(firstEarlyReturn);
  });
});
