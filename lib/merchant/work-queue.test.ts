import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSlotRange } from "@/lib/orders/slot";
import { slotDueLabel, slotRunningLate } from "./slot-label";

// ── THE ONE EXPRESSION THIS WHOLE FEATURE RESTS ON ──────────────────────────
//
// getWorkQueue ranks by dueAt = coalesce(pickup_slot lower bound,
// auto_release_at, created_at). That single line is what lets ONE component
// serve a shop, a kitchen and — later — a car wash, because it branches on a
// COLUMN rather than on what kind of business is looking at it.
//
// getWorkQueue itself needs a Supabase client, so these tests pin the two pure
// parts that decide whether it is correct: the tstzrange parser (pickup_slot
// arrives as literal Postgres range TEXT over PostgREST, not as an object) and
// the ordering rule those values feed.

// Mirrors slotStart() in lib/merchant/context.ts. Kept in step by the source
// assertion at the bottom of this file, which fails if that body changes.
//
// M216: it returns ISO now, through the shared reader. It used to return the
// raw bound ("2026-09-06 12:30:00+00"), and dueAt compares STRINGS — a space
// sorts before the "T" in auto_release_at, so on the same day a slot beat any
// deadline whatever the time. See "same-day" below.
function slotStart(range: string | null): string | null {
  return parseSlotRange(range)?.from.toISOString() ?? null;
}

const dueAt = (r: {
  pickup_slot?: string | null;
  auto_release_at?: string | null;
  created_at: string;
}) => slotStart(r.pickup_slot ?? null) ?? r.auto_release_at ?? r.created_at;

describe("slotStart — pickup_slot arrives as Postgres range text", () => {
  it("reads the lower bound of the range PostgREST actually sends", () => {
    expect(slotStart('["2026-09-06 12:30:00+00","2026-09-06 13:00:00+00")')).toBe(
      "2026-09-06T12:30:00.000Z",
    );
  });

  it("handles an unquoted range", () => {
    expect(slotStart("[2026-09-06 12:30:00+00,2026-09-06 13:00:00+00)")).toBe(
      "2026-09-06T12:30:00.000Z",
    );
  });

  it("handles an exclusive lower bound", () => {
    expect(slotStart('("2026-09-06 09:00:00+00","2026-09-06 09:30:00+00")')).toBe(
      "2026-09-06T09:00:00.000Z",
    );
  });

  it("returns null for no slot, so the deadline falls through to the hold", () => {
    expect(slotStart(null)).toBeNull();
  });

  it("returns null for an empty range rather than inventing a time", () => {
    expect(slotStart("empty")).toBeNull();
  });
});

describe("dueAt — the coalesce that makes one queue serve every kind", () => {
  const shopOrder = {
    // A shop order: no slot, a 48h bank-transfer hold.
    pickup_slot: null,
    auto_release_at: "2026-09-08T18:00:00+00:00",
    created_at: "2026-09-06T18:00:00+00:00",
  };
  const kitchenOrder = {
    // A kitchen order collected at 12:30 today.
    pickup_slot: '["2026-09-06 12:30:00+00","2026-09-06 13:00:00+00")',
    auto_release_at: "2026-09-08T10:00:00+00:00",
    created_at: "2026-09-06T10:00:00+00:00",
  };
  const bareOrder = {
    // Neither — falls back to when it was placed.
    pickup_slot: null,
    auto_release_at: null,
    created_at: "2026-09-05T08:00:00+00:00",
  };

  it("prefers the booked slot over the payment hold", () => {
    expect(dueAt(kitchenOrder)).toBe("2026-09-06T12:30:00.000Z");
  });

  it("ranks a same-day slot by its TIME against a deadline (M216)", () => {
    // 16:00 on the island (12:00 UTC) against a hold that lapses at 09:00
    // (05:00 UTC) the same day. With the raw "2026-09-06 12:00:00+00" the
    // space sorted before "T" and the 16:00 collection came first.
    const lateSlot = {
      pickup_slot: '["2026-09-06 12:00:00+00","2026-09-06 12:30:00+00")',
      auto_release_at: "2026-09-12T12:00:00+00:00",
      created_at: "2026-09-05T12:00:00+00:00",
    };
    const earlyHold = {
      pickup_slot: null,
      auto_release_at: "2026-09-06T05:00:00+00:00",
      created_at: "2026-09-04T05:00:00+00:00",
    };
    const ranked = [lateSlot, earlyHold]
      .map((o) => ({ o, d: dueAt(o) }))
      .sort((a, b) => a.d.localeCompare(b.d))
      .map((x) => x.o);
    expect(ranked).toEqual([earlyHold, lateSlot]);
  });

  it("falls back to the payment hold when nothing is booked", () => {
    expect(dueAt(shopOrder)).toBe("2026-09-08T18:00:00+00:00");
  });

  it("falls back to creation time when there is neither", () => {
    expect(dueAt(bareOrder)).toBe("2026-09-05T08:00:00+00:00");
  });

  it("sorts a shop order and a kitchen order into ONE list without a branch", () => {
    // This is the property the whole design depends on. The kitchen's 12:30
    // collection today outranks the shop's deadline in two days, and the oldest
    // untimed order outranks both — decided by the column, not by kind.
    const ranked = [shopOrder, kitchenOrder, bareOrder]
      .map((o) => ({ o, d: dueAt(o) }))
      .sort((a, b) => a.d.localeCompare(b.d))
      .map((x) => x.o);
    expect(ranked).toEqual([bareOrder, kitchenOrder, shopOrder]);
  });

  it("is stable when two orders share a deadline", () => {
    const a = { pickup_slot: null, auto_release_at: null, created_at: "2026-09-06T09:00:00+00:00" };
    const b = { pickup_slot: null, auto_release_at: null, created_at: "2026-09-06T09:00:00+00:00" };
    const ranked = [a, b].map((o) => ({ o, d: dueAt(o) })).sort((x, y) => x.d.localeCompare(y.d));
    expect(ranked.map((r) => r.o)).toEqual([a, b]);
  });
});

// ── THE LABEL ON EACH ROW (M216) ────────────────────────────────────────────
//
// WorkQueue.tsx used to parse pickup_slot itself: swap the space for a "T" and
// hand V8 "2026-09-25T08:00:00+00". An offset with no minutes is Invalid Date
// in V8, so the label came back null and every booked order fell through to
// the payment hold — a cash pre-order for Friday read "7 days to pay". These
// feed the EXACT string PostgREST sends.
describe("the row label reads the range text PostgREST actually sends", () => {
  const FRI_LUNCH = '["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")';
  const WED = new Date("2026-09-23T11:00:00Z"); // 15:00 on the island
  const THU = new Date("2026-09-24T06:00:00Z");
  const FRI = new Date("2026-09-25T05:00:00Z");

  it("the old parse really was Invalid Date — the bug this replaces", () => {
    expect(Number.isNaN(new Date("2026-09-25 08:00:00+00".replace(" ", "T")).getTime())).toBe(true);
  });

  it("parses it, in Rodrigues time", () => {
    const w = parseSlotRange(FRI_LUNCH);
    expect(w?.from.toISOString()).toBe("2026-09-25T08:00:00.000Z");
    expect(slotDueLabel(FRI_LUNCH, "pickup", FRI)).toBe("Collection today, 12:00–12:30");
  });

  it("names the day when it is not today", () => {
    expect(slotDueLabel(FRI_LUNCH, "pickup", THU)).toBe("Collection tomorrow, 12:00–12:30");
    expect(slotDueLabel(FRI_LUNCH, "pickup", WED)).toBe("Collection Fri 25 Sep, 12:00–12:30");
  });

  it("says Delivery for a delivery order — the slot is when the food leaves", () => {
    expect(slotDueLabel(FRI_LUNCH, "rr_delivery", THU)).toBe("Delivery tomorrow, 12:00–12:30");
    expect(slotDueLabel(FRI_LUNCH, null, THU)).toBe("Collection tomorrow, 12:00–12:30");
  });

  it("is null when nothing was booked, so the hold takes over", () => {
    expect(slotDueLabel(null, "pickup", THU)).toBeNull();
    expect(slotDueLabel("", "pickup", THU)).toBeNull();
  });

  it("does not shout about a pre-order two days out", () => {
    const w = parseSlotRange(FRI_LUNCH)!;
    expect(slotRunningLate(w, "pending_payment", false, WED)).toBe(false);
    // Two hours before an untaken slot, it does.
    expect(slotRunningLate(w, "pending_payment", false, new Date("2026-09-25T06:30:00Z"))).toBe(true);
  });

  it("WorkQueue.tsx uses the shared reader and no longer parses the range itself", () => {
    const wq = readFileSync(join(process.cwd(), "components", "merchant", "home", "WorkQueue.tsx"), "utf8");
    expect(wq).toContain("slotDueLabel(item.pickupSlot, item.fulfillment, now)");
    expect(wq).not.toMatch(/\.replace\(" ", "T"\)/);
    expect(wq).not.toContain("function slotWindow");
  });
});

// ── GUARDS ON THE SOURCE ITSELF ─────────────────────────────────────────────
describe("getWorkQueue's contract, asserted against the shipped source", () => {
  const src = readFileSync(join(process.cwd(), "lib", "merchant", "context.ts"), "utf8");

  it("keeps the parser this test file mirrors", () => {
    // If slotStart's body changes, the tests above stop describing the real
    // code — silently. This fails instead.
    expect(src).toContain("return parseSlotRange(range)?.from.toISOString() ?? null;");
    expect(src).toMatch(/import \{ parseSlotRange \} from "@\/lib\/orders\/slot";/);
  });

  it("still ranks on the coalesce, not on kind", () => {
    expect(src).toMatch(/dueAt:\s*slotStart\([^)]*\)\s*\?\?\s*r\.auto_release_at\s*\?\?\s*r\.created_at/);
  });

  it("never branches on what kind of merchant is looking at it", () => {
    const fn = src.slice(src.indexOf("export async function getWorkQueue"));
    const body = fn.slice(0, fn.indexOf("\nfunction slotStart"));
    expect(body).not.toMatch(/\bkitchen\b|\bisKitchen\b|\bkind\b/);
  });

  it("distinguishes a failed read from an empty queue", () => {
    // PostgREST answers an RLS denial with [] and no error. Without the ok:false
    // arm, losing the server renders identically to a quiet evening.
    expect(src).toContain("{ ok: false }");
    expect(src).toContain('console.error("getWorkQueue failed"');
  });

  it("uses the single shared definition of an open order", () => {
    expect(src).toContain('OPEN_ORDER_STATUSES');
    expect(src).not.toMatch(/"pending_payment",\s*\n\s*"awaiting_payment_confirmation"/);
  });

  it("no longer ships the lifetime order count it replaced", () => {
    expect(src).not.toContain("export async function getOrderCount");
  });
});

describe("OPEN_ORDER_STATUSES is defined once", () => {
  it("is exported from attention-load and not retyped in admin", () => {
    const attention = readFileSync(
      join(process.cwd(), "lib", "admin", "attention-load.ts"),
      "utf8",
    );
    const admin = readFileSync(join(process.cwd(), "app", "admin", "page.tsx"), "utf8");
    expect(attention).toContain("export const OPEN_ORDER_STATUSES");
    expect(admin).toContain("OPEN_ORDER_STATUSES");
    expect(admin).not.toContain("const OPEN_ORDER_STATUSES = [");
  });
});
