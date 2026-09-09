import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { canStartDelivery } from "./payment-state";

const read = (p: string) => readFileSync(p, "utf8");
const ROUTE = "app/api/delivery-requests/[id]/route.ts";

// ── A REFUSAL THAT TOLD THE CUSTOMER THE WRONG THING ────────────────────────
//
// Both accept wrappers raised P0001 for an ownership miss, and so does
// accept_delivery_quote() for about ten real refusals. The route could not tell
// them apart, so it retried EVERY refusal through the guest path — whose own
// ownership check then failed, because a request posted while signed in has no
// guest_email — and replaced the true reason with "That quote no longer
// exists."
//
// A customer whose driver went off duty was told their quote had vanished.
// Verified against production, rolled back:
//   wrong email     -> P0002  That quote no longer exists.
//   off-duty driver -> P0001  That driver is not available any more.
//   over cash cap   -> P0001  That is too much to settle in cash...

describe("the route tells the two apart", () => {
  const src = read(ROUTE);

  it("an ownership miss has its own code", () => {
    expect(src).toContain('const NOT_YOURS = "P0002"');
  });

  it("the retry fires ONLY on that", () => {
    // `error.code === SAFE_RPC_ERROR && v.email` swallowed every real refusal.
    expect(src).toMatch(/error\.code === NOT_YOURS && v\.email/);
    expect(src).not.toMatch(/error\.code === SAFE_RPC_ERROR && v\.email/);
  });

  it("a real refusal keeps its own words", () => {
    expect(src).toMatch(
      /error\.code === SAFE_RPC_ERROR \|\| error\.code === NOT_YOURS/,
    );
  });

  it("no branch can drop P0002 into a 500", () => {
    // A signed-out guest has no second identity to try, so an ownership miss
    // there is a final answer. Without the extra arm it fell through to a 500
    // and read as our fault.
    const accept = src.slice(src.indexOf("// ── accept ─"));
    const p0002Arms = accept.match(/NOT_YOURS/g) ?? [];
    expect(p0002Arms.length).toBeGreaterThanOrEqual(4);
  });

  it("the wording is unchanged, so nothing new is disclosed", () => {
    const sql = read(
      "supabase/migrations/20260908133000_m191_not_yours_is_not_the_same_as_no.sql",
    );
    // Counted on the raise statements only — the header prose quotes the same
    // sentence while explaining why it is not changing.
    const raises = sql.match(
      /raise exception 'That quote no longer exists\.' using errcode = 'P0002'/g,
    );
    expect(raises ?? []).toHaveLength(2);
  });
});

describe("the start gate reads the column the SQL tests", () => {
  const base = { status: "assigned", paymentMethod: "bank_transfer" as const };

  it("a path with no timestamp still opens the gate", () => {
    // advance_delivery() tests `payment_proof_path is null`. Reading the
    // timestamp instead held a driver whose receipt was on the row.
    expect(canStartDelivery({ ...base, hasProof: true, paymentProofAt: null })).toBe(true);
  });

  it("a timestamp with no path does NOT open it", () => {
    // The other direction is worse: the driver taps Start and the server
    // refuses with RR087 after they have already set off.
    expect(canStartDelivery({ ...base, hasProof: false, paymentProofAt: "2026-09-08T10:00:00Z" })).toBe(false);
  });

  it("an older payload still answers", () => {
    expect(canStartDelivery({ ...base, paymentProofAt: "2026-09-08T10:00:00Z" })).toBe(true);
    expect(canStartDelivery({ ...base, paymentProofAt: null })).toBe(false);
  });

  it("the same holds for the ID on a cash job", () => {
    const cash = { status: "assigned", paymentMethod: "cash" as const };
    expect(canStartDelivery({ ...cash, hasIdDocument: true, idDocumentAt: null })).toBe(true);
    expect(canStartDelivery({ ...cash, hasIdDocument: false, idDocumentAt: "x" })).toBe(false);
  });

  it("only the FIRST transition is gated", () => {
    expect(canStartDelivery({ status: "picked_up", paymentMethod: "bank_transfer", hasProof: false })).toBe(true);
  });
});
