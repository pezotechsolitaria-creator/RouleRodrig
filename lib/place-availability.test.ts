import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isActiveHold, PAYMENT_WINDOW_HOURS } from "./holds";

// ── AVAILABILITY IS DECIDED BEFORE ANYBODY PAYS (M127) ──────────────────────
//
// The owner: "do like for vehicle, add a new step like AVAILABILITY then I
// confirm in the admin dashboard and if available they go to the payment step,
// if not send customers emails and propose them other suggestions."
//
// M91 did this for vehicles. These pin the same guarantees for stays and
// experiences, where the reason is identical: the boats, the therapist and the
// guesthouses are not his, so confirming one he cannot get means taking money
// and giving it back — a PayPal fee, an exchange spread and a lost customer.

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ADMIN_ROUTE = "app/api/admin/place-bookings/route.ts";
const MODAL = "components/PlaceBookingModal.tsx";

describe("the customer is no longer asked to pay before we have checked", () => {
  const modal = read(MODAL);

  it("does not promise the booking is confirmed on payment", () => {
    // The exact sentence that was live: it confirmed something nobody had
    // checked with the partner yet.
    expect(modal).not.toMatch(/pay below and it&apos;s confirmed/);
  });

  it("says plainly that nothing has been charged", () => {
    expect(modal).toMatch(/nothing has been charged/i);
  });

  it("takes payment out of the modal entirely", () => {
    // Payment happens after approval, from the link in the availability email.
    // Leaving the widget here would let a customer pay for an unchecked slot.
    expect(modal).not.toMatch(/<PayPalDeposit/);
    expect(modal).not.toMatch(/<BankTransferDetails/);
  });

  it("tells them what happens next, and when", () => {
    // "We are checking" with no idea when, or what then, is worse than simply
    // being asked to pay.
    expect(modal).toMatch(/We&apos;re checking with/);
    expect(modal).toMatch(/either way/);
  });
});

describe("the owner's decision is validated and acted on", () => {
  const route = read(ADMIN_ROUTE);

  it("no longer writes whatever string it is handed", () => {
    // It used to take `status` straight from the body. A typo created a
    // booking in a state nothing understands.
    expect(route).toMatch(/z\.enum\(\[/);
    expect(route).toMatch(/'approved'/);
    expect(route).toMatch(/'unavailable'/);
    expect(route).not.toMatch(/const \{ id, status \} = await req\.json\(\)/);
  });

  it("gives an approved booking a deadline", () => {
    // Without one the hold is open-ended, and a customer who never pays blocks
    // the calendar forever. The DB enforces this too.
    expect(route).toMatch(/payment_due_by/);
    expect(route).toMatch(/PAYMENT_WINDOW_HOURS/);
  });

  it("clears the deadline when declining, so no stale countdown shows", () => {
    const i = route.indexOf("status === 'unavailable'");
    expect(i).toBeGreaterThan(-1);
    expect(route.slice(i, i + 600)).toMatch(/payment_due_by = null/);
  });

  it("emails the customer on BOTH outcomes", () => {
    // Silence after "we are checking" is the failure this feature exists to
    // prevent — the decline email matters more than the approval one.
    expect(route).toMatch(/sendPlaceAvailabilityConfirmed/);
    expect(route).toMatch(/sendPlaceUnavailable/);
  });

  it("carries the owner's own words into the decline", () => {
    expect(route).toMatch(/note/);
    expect(route).toMatch(/unavailable_note/);
  });

  it("never lets a failed email roll back a decision already taken", () => {
    // He has already spoken to the partner. The status must stand.
    const i = route.indexOf("let emailed");
    expect(i).toBeGreaterThan(-1);
    expect(route.slice(i, i + 1400)).toMatch(/catch \(err\)/);
  });

  it("reports whether the customer could actually be reached", () => {
    // A guest who gave no address is normal, not a fault — but he has to know
    // to pick up the phone.
    expect(route).toMatch(/hasEmail/);
  });
});

describe("an approved stay or experience reserves the slot", () => {
  const future = new Date(Date.now() + 6 * 3600_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  it("holds while the payment window is open", () => {
    expect(isActiveHold({ status: "approved", payment_due_by: future, deposit_amount: 700 })).toBe(true);
  });

  it("stops holding the moment the deadline passes", () => {
    // No wait for a cron: the slot returns to the pool on the stroke.
    expect(isActiveHold({ status: "approved", payment_due_by: past, deposit_amount: 700 })).toBe(false);
  });

  it("never holds on an approval with no deadline at all", () => {
    // Belt and braces with the DB constraint: a row approved before the column
    // existed must not reserve anything forever.
    expect(isActiveHold({ status: "approved", payment_due_by: null, deposit_amount: 700 })).toBe(false);
  });

  it("gives a real window, not a token one", () => {
    expect(PAYMENT_WINDOW_HOURS).toBeGreaterThanOrEqual(12);
  });
});
