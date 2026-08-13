import { describe, expect, it } from "vitest";
import { bookingRef } from "./BookingReceiptUpload";

// The receipt upload proves itself with reference + email. The reference the
// customer holds comes from their confirmation email; the one this component
// sends is derived from the booking id in the browser. If those two ever
// disagree, every upload 404s with "we couldn't find a booking" on a booking
// that plainly exists — so the derivation is pinned here against the exact
// rules the server uses (app/api/bookings/lookup and lookup_booking: first six
// hex of the id with the dashes removed).
describe("bookingRef", () => {
  it("is the first six hex of the id, upper case, RR- prefixed", () => {
    expect(bookingRef("1a2b3c4d-5e6f-7788-99aa-bbccddeeff00")).toBe("RR-1A2B3C");
  });

  it("ignores the dashes rather than counting them as characters", () => {
    // "1a2b3c" must come from the hex, not from "1a2b3c4d".slice(0,6) of a
    // string that still contains separators.
    expect(bookingRef("12-34-5678-abcd")).toBe("RR-123456");
  });

  it("round-trips through the server's own normaliser", () => {
    // What /api/bookings/lookup and the RPC both do: lower-case, drop
    // everything that is not hex, take six. Applying it to what we send must
    // return the same six characters the database compares against.
    const norm = (ref: string) =>
      ref.trim().replace(/^rr-/i, "").replace(/[^0-9a-f]/gi, "").toLowerCase().slice(0, 6);
    for (const id of [
      "1a2b3c4d-5e6f-7788-99aa-bbccddeeff00",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "deadbeef-cafe-babe-f00d-0123456789ab",
    ]) {
      expect(norm(bookingRef(id))).toBe(id.replace(/-/g, "").slice(0, 6));
    }
  });

  it("is always the full six characters the server demands", () => {
    // The lookup refuses anything shorter — it shrank the guessable space from
    // 65,536 to 16,777,216 on purpose.
    expect(bookingRef("deadbeef-cafe-babe-f00d-0123456789ab")).toHaveLength(9); // "RR-" + 6
  });
});
