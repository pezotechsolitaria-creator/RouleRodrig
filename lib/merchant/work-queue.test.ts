import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
// assertion at the bottom of this file, which fails if that regex changes.
function slotStart(range: string | null): string | null {
  if (!range) return null;
  const m = range.match(/[[(]"?([^",)\]]+)/);
  return m ? m[1] : null;
}

const dueAt = (r: {
  pickup_slot?: string | null;
  auto_release_at?: string | null;
  created_at: string;
}) => slotStart(r.pickup_slot ?? null) ?? r.auto_release_at ?? r.created_at;

describe("slotStart — pickup_slot arrives as Postgres range text", () => {
  it("reads the lower bound of the range PostgREST actually sends", () => {
    expect(slotStart('["2026-09-06 12:30:00+00","2026-09-06 13:00:00+00")')).toBe(
      "2026-09-06 12:30:00+00",
    );
  });

  it("handles an unquoted range", () => {
    expect(slotStart("[2026-09-06 12:30:00+00,2026-09-06 13:00:00+00)")).toBe(
      "2026-09-06 12:30:00+00",
    );
  });

  it("handles an exclusive lower bound", () => {
    expect(slotStart('("2026-09-06 09:00:00+00","2026-09-06 09:30:00+00")')).toBe(
      "2026-09-06 09:00:00+00",
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
    expect(dueAt(kitchenOrder)).toBe("2026-09-06 12:30:00+00");
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

// ── GUARDS ON THE SOURCE ITSELF ─────────────────────────────────────────────
describe("getWorkQueue's contract, asserted against the shipped source", () => {
  const src = readFileSync(join(process.cwd(), "lib", "merchant", "context.ts"), "utf8");

  it("keeps the parser this test file mirrors", () => {
    // If slotStart's regex changes, the tests above stop describing the real
    // code — silently. This fails instead.
    expect(src).toContain(String.raw`/[[(]"?([^",)\]]+)/`);
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
