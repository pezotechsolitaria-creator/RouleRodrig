import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

// ── A customer booking a tradesperson ───────────────────────────────────────
//
// The owner: "now let customers book themselves from the storefront."
//
// The rules are in SQL — book_service_slot_public checks visibility, the
// online-bookings toggle, the three-per-phone cap, opening hours and capacity,
// the last under a row lock. These guard the wiring, and above all the
// decisions that would be silently wrong rather than loudly broken.

describe("a service is booked, never bought", () => {
  const sql = read("supabase/migrations/20260907040100_m179_duration_marks_a_bookable_service.sql");

  it("refuses booked time at the checkout itself", () => {
    // Without this, create_order would take money for a Rs 1,200 valet with no
    // appointment attached — a paid order and no time booked.
    expect(sql).toMatch(/create_order/);
    expect(sql).toMatch(/is booked, not bought/);
  });

  it("refuses it BEFORE the stock check", () => {
    // Service variants carry stock_quantity 0, so the stock check would fire
    // first with "Only 0 left of Full valet" — a sentence that sends a buyer to
    // ask a car wash to restock time.
    const guard = sql.indexOf("is booked, not bought");
    const stock = sql.lastIndexOf("stock_quantity < v_qty");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(stock);
  });

  it("does not stop a trade selling goods", () => {
    // A car wash may sell a bottle of wax. The guard is on the VARIANT having a
    // duration, not on the store being a trade.
    expect(sql).toMatch(/service_durations sd where sd\.variant_id = v_variant\.id/);
    expect(sql).not.toMatch(/trade_providers/);
  });
});

describe("one set of rules, two doors", () => {
  const sql = read("supabase/migrations/20260907040000_m179_customers_book_themselves.sql");

  it("shares the rules instead of copying them", () => {
    // Two copies of "does the whole job fit inside opening hours" is two copies
    // that drift, and the one that drifts is the one nobody is testing.
    expect(sql).toMatch(/create or replace function public\.service_booking_write/);
    const calls = sql.match(/service_booking_write\(p_store_id/g) ?? [];
    expect(calls).toHaveLength(2);
  });

  it("gives the shared function no rights of its own", () => {
    expect(sql).toMatch(/revoke all on function public\.service_booking_write[\s\S]{0,120}from public, anon, authenticated/);
  });

  // Comments stripped before asserting: the staff door's own comment says
  // "deliberately NOT gated on takes_online_bookings", and a bare search would
  // match that sentence and call the gate present. An assertion that passes on
  // prose is worse than no assertion.
  const code = (sql: string) =>
    sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

  it("lets a provider fill their own diary while the shop is still a draft", () => {
    // The public toggle is about the public door. A provider setting up on
    // Monday for a Saturday opening must still be able to write bookings in.
    const staffDoor = code(sql.slice(sql.indexOf("Door one"), sql.indexOf("Door two")));
    expect(staffDoor).toMatch(/is_store_staff/);
    expect(staffDoor).not.toMatch(/store_is_visible/);
    expect(staffDoor).not.toMatch(/takes_online_bookings/);
  });

  it("closes the public door on a shop nobody can see", () => {
    const publicDoor = code(sql.slice(sql.indexOf("Door two")));
    expect(publicDoor).toMatch(/if not store_is_visible/);
    expect(publicDoor).toMatch(/if not v_tp\.takes_online_bookings/);
  });

  it("caps one phone number, counting digits rather than spacing", () => {
    // The public door has no account behind it by design, so the phone is the
    // only identity — and "5789 1234" and "57891234" are one person.
    const publicDoor = sql.slice(sql.indexOf("Door two"));
    // Plain string, not a regex: the SQL contains a literal backslash and
    // escaping it twice through a pattern is how this assertion lies.
    expect(publicDoor).toContain("regexp_replace(b.customer_phone,");
    expect(publicDoor).toContain("= v_digits");
    expect(publicDoor).toMatch(/v_open >= 3/);
  });

  it("tells the provider a booking arrived", () => {
    // A booking nobody has seen is not a booking.
    expect(sql).toMatch(/insert into notifications/);
    expect(sql).toMatch(/'service_booked'/);
    expect(sql).toMatch(/merchant_staff ms on ms\.merchant_id = s\.merchant_id/);
  });
});

describe("the storefront asks the database what is bookable", () => {
  const store = read("app/shop/[storeSlug]/page.tsx");
  const product = read("app/shop/[storeSlug]/[productSlug]/page.tsx");

  it("uses one definition on both pages", () => {
    // A product must not be bookable on the shop page and buyable on its own.
    expect(store).toMatch(/store_bookable_services/);
    expect(product).toMatch(/store_bookable_services/);
  });

  it("keeps a service out of the basket on its own page", () => {
    expect(product).toMatch(/bookableIds/);
    expect(product).toMatch(/p\.variants\.filter\(\(v\) => !bookableIds\.has\(v\.id\)\)/);
  });

  it("does not show an empty-shop card under a working booking form", () => {
    // A trade with no goods on the shelf is not an empty shop — its whole
    // catalogue is the panel above.
    expect(store).toMatch(/products\.length === 0 && services\.length > 0 \? null/);
  });
});

describe("the public route is a carrier, not a decider", () => {
  const api = read("app/api/services/route.ts");

  it("never names a store from anywhere but the request it is answering", () => {
    // Unlike the merchant route this one MUST take a store id from the client —
    // it is a public page. Every rule that matters is therefore in the RPC.
    expect(api).toMatch(/rpc\("book_service_slot_public"/);
    expect(api).not.toMatch(/from\("service_bookings"\)/);
    expect(api).not.toMatch(/service_booking_write/);
  });

  it("rate-limits the door that writes into somebody's working day", () => {
    expect(api).toMatch(/guard\(req, "service-book", \d+, 60_000\)/);
    expect(api).toMatch(/guard\(req, "service-slots", \d+, 60_000\)/);
  });

  it("passes the refusal through as the sentence the RPC wrote", () => {
    expect(api).toMatch(/SPOKEN\.has\(error\.code\)/);
  });
});

describe("switching the public door off does not blank the page", () => {
  const panel = read("components/shop/BookService.tsx");

  it("still shows when they are free, and asks the customer to ring", () => {
    // "No online booking" and "no availability" are different sentences, and a
    // blank panel says the wrong one.
    expect(panel).toMatch(/takesOnlineBookings \? "Book a time" : "When they are free"/);
    expect(panel).toMatch(/Ring \{storeName\}/);
  });

  it("says how to cancel BEFORE the customer commits", () => {
    // There is no account, so there is no "my bookings" page to undo it from.
    const submitIdx = panel.indexOf("Pick a time");
    const noteIdx = panel.indexOf("To change or cancel afterwards");
    expect(noteIdx).toBeGreaterThan(submitIdx);
  });

  it("refetches the free times after a refusal", () => {
    // The slot may have gone while the form was open. The one thing worse than
    // a refusal is the same refusal twice.
    const catchBlock = panel.slice(panel.indexOf("} catch (e) {"));
    expect(catchBlock).toMatch(/setStartsAt\(null\)/);
    expect(catchBlock).toMatch(/\/api\/services\?store=/);
  });
});
