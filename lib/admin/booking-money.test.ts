import { describe, it, expect } from "vitest";
import {
  owedAtHandover,
  moneyStrip,
  matchesDeskFilter,
  deskFilterCounts,
  revenueSplit,
  parseRupeesInput,
  checkCashAmount,
  methodPhrase,
  toldLine,
  fleetName,
  isCarBooking,
  reminderText,
  waHref,
  sortCashRows,
  countUnrecordedCash,
  islandToday,
  islandDayStartUtc,
  paymentOutcomeUnknown,
  isIslandDay,
  receivedAtFor,
  cashDateDefault,
  receiptByDefault,
  fleetUnits,
  confirmedClashes,
  type CashRow,
} from "./booking-money";

// ── THE OWNER'S DESK READS MONEY ONE WAY (M220) ─────────────────────────────
//
// "Accept a booking directly without paying on the website" — the owner, 29
// Sept 2026. The shapes below are the real ones on the day it shipped: four
// confirmed rentals and one activity, all confirmed with the old pill, all paid
// in person, none with a rupee recorded. RR-329D81 was told Rs 3,864 when
// Rs 5,152 was owed; these tests pin the figure the desk prints instead.

const TODAY = "2026-09-29";

const cashRental = {
  status: "confirmed",
  pay_in_person: true,
  total_amount: 5152,
  deposit_amount: 1288,
  amount_paid: null,
  start_date: "2026-09-08",
};

describe("owedAtHandover", () => {
  it("is the whole total for a cash rental with nothing recorded — not total minus a deposit nobody paid", () => {
    expect(owedAtHandover("vehicle", cashRental)).toBe(5152);
  });

  it("is what is left after a part-payment", () => {
    expect(owedAtHandover("vehicle", { ...cashRental, amount_paid: 2000 })).toBe(3152);
  });

  it("uses deposit_amount as the whole price of a place booking (M210)", () => {
    expect(owedAtHandover("place", { status: "confirmed", pay_in_person: true, deposit_amount: 1000 })).toBe(1000);
  });

  it("is the pickup balance for an online deposit that was recorded", () => {
    expect(
      owedAtHandover("vehicle", { status: "confirmed", pay_in_person: false, total_amount: 5997, amount_paid: 2999 }),
    ).toBe(2998);
  });

  it("refuses to guess for a transfer confirmed with the old pill and no amount written", () => {
    // Printing the whole price here would send the owner to charge a customer
    // who has already paid by bank transfer.
    expect(owedAtHandover("vehicle", { status: "confirmed", pay_in_person: false, total_amount: 5997 })).toBeNull();
  });

  it("owes nothing on a booking that is not on", () => {
    expect(owedAtHandover("vehicle", { ...cashRental, status: "pending" })).toBeNull();
    expect(owedAtHandover("vehicle", { ...cashRental, status: "cancelled" })).toBeNull();
  });
});

describe("moneyStrip", () => {
  it("reads a backfilled cash rental: pays in person, the full total to collect, overdue, no-show allowed", () => {
    const s = moneyStrip("vehicle", cashRental, TODAY);
    expect(s).toMatchObject({
      total: 5152,
      paid: 0,
      toCollect: 5152,
      badge: "in_person",
      canRecordPayment: true,
      canMarkNoShow: true,
      overdue: true,
    });
  });

  it("does not offer a no-show before the day has come", () => {
    const s = moneyStrip("vehicle", { ...cashRental, start_date: "2026-11-14" }, TODAY);
    expect(s.canMarkNoShow).toBe(false);
    expect(s.overdue).toBe(false);
    expect(s.canRecordPayment).toBe(true);
  });

  it("wears PAID once the whole total is recorded, even for a cash booking, and offers nothing more", () => {
    const s = moneyStrip("vehicle", { ...cashRental, amount_paid: 5152 }, TODAY);
    expect(s.badge).toBe("paid");
    expect(s.toCollect).toBe(0);
    expect(s.canRecordPayment).toBe(false);
    expect(s.overdue).toBe(false);
  });

  it("calls an unpaid request unpaid, and offers no cash button before it is confirmed", () => {
    const s = moneyStrip("vehicle", { status: "pending", total_amount: 3000 }, TODAY);
    expect(s.badge).toBe("unpaid");
    expect(s.canRecordPayment).toBe(false);
    expect(s.canMarkNoShow).toBe(false);
  });

  it("marks part-paid when an online deposit is recorded", () => {
    const s = moneyStrip("vehicle", { status: "confirmed", total_amount: 5997, amount_paid: 2999 }, TODAY);
    expect(s.badge).toBe("part_paid");
    expect(s.toCollect).toBe(2998);
    // Not an in-person promise: the no-show button is not this one's answer.
    expect(s.canMarkNoShow).toBe(false);
  });

  it("says the amount was never recorded instead of calling a transfer-confirmed booking unpaid", () => {
    const s = moneyStrip("vehicle", { status: "confirmed", total_amount: 5997 }, TODAY);
    expect(s.badge).toBe("unrecorded");
    expect(s.toCollect).toBeNull();
    expect(s.canRecordPayment).toBe(false);
  });

  it("shows a no-show as such, with nothing to collect", () => {
    const s = moneyStrip("vehicle", { ...cashRental, status: "cancelled", no_show_at: "2026-09-10T08:00:00Z" }, TODAY);
    expect(s.badge).toBe("no_show");
    expect(s.toCollect).toBeNull();
    expect(s.canRecordPayment).toBe(false);
    expect(s.canMarkNoShow).toBe(false);
  });

  it("reads a reinstated no-show as the live booking it now is", () => {
    // Nothing clears no_show_at; the status is what is true now.
    const s = moneyStrip("vehicle", { ...cashRental, no_show_at: "2026-09-10T08:00:00Z" }, TODAY);
    expect(s.badge).toBe("in_person");
    expect(s.toCollect).toBe(5152);
  });

  it("puts no badge on a cancelled booking that never took money", () => {
    expect(moneyStrip("place", { status: "unavailable", deposit_amount: 800 }, TODAY).badge).toBeNull();
    expect(moneyStrip("vehicle", { status: "cancelled", total_amount: 800 }, TODAY).badge).toBeNull();
  });

  it("offers cash with no ceiling on a live pay-in-person booking that has no price", () => {
    // The RPC takes any amount when the total is null; the desk used to hide
    // the button because there was no figure to print.
    const s = moneyStrip("place", { status: "confirmed", pay_in_person: true, deposit_amount: null }, TODAY);
    expect(s.canRecordPayment).toBe(true);
    expect(s.toCollect).toBeNull();
    expect(s.badge).toBe("in_person");
    // …and still not for a price-less booking that is not paid in person, or not yet on.
    expect(moneyStrip("place", { status: "confirmed", deposit_amount: null }, TODAY).canRecordPayment).toBe(false);
    expect(moneyStrip("place", { status: "pending", pay_in_person: true }, TODAY).canRecordPayment).toBe(false);
    expect(checkCashAmount("123456", null)).toEqual({ ok: true, amount: 123456 });
  });

  it("still offers cash on a completed booking whose money was never recorded", () => {
    const s = moneyStrip("vehicle", { ...cashRental, status: "completed" }, TODAY);
    expect(s.canRecordPayment).toBe(true);
    // A completed rental cannot become a no-show.
    expect(s.canMarkNoShow).toBe(false);
  });
});

describe("desk filters", () => {
  const rows = [
    { status: "pending" },
    { status: "approved" },
    { status: "approved" },
    { status: "confirmed", pay_in_person: true },
    { status: "confirmed", pay_in_person: false },
    { status: "cancelled", pay_in_person: true },
  ];

  it("has an Approved pill that finds the held bookings", () => {
    expect(rows.filter((r) => matchesDeskFilter(r, "approved"))).toHaveLength(2);
  });

  it("puts only live cash bookings under Pays in person — a no-show has nothing left to collect", () => {
    expect(rows.filter((r) => matchesDeskFilter(r, "in_person"))).toEqual([{ status: "confirmed", pay_in_person: true }]);
  });

  it("counts every pill from the same rule the list uses", () => {
    expect(deskFilterCounts(rows, ["all", "approved", "confirmed", "in_person"])).toEqual({
      all: 6,
      approved: 2,
      confirmed: 2,
      in_person: 1,
    });
  });
});

describe("revenueSplit", () => {
  it("counts collected money and money still to collect separately", () => {
    const split = revenueSplit("vehicle", [
      cashRental,
      { ...cashRental, amount_paid: 1000 },
      { status: "confirmed", total_amount: 5997, amount_paid: 2999 },
      // Transfer confirmed with no amount: neither collected nor owed again.
      { status: "confirmed", total_amount: 4000 },
      // A pending request is a promise, not revenue.
      { status: "pending", total_amount: 9000 },
    ]);
    expect(split).toEqual({ collected: 1000 + 2999, toCollect: 5152 + 4152 + 2998 });
  });

  it("collects only money that stayed: completed counts, a cancelled booking's does not, a no-show's cash does", () => {
    const split = revenueSplit("vehicle", [
      { status: "completed", total_amount: 3000, amount_paid: 3000 },
      // Cancelled after an online deposit: that money is a refund question.
      { status: "cancelled", total_amount: 5000, amount_paid: 1500 },
      // A no-show keeps what was handed over (M220) — cancelled, and still counted.
      { status: "cancelled", pay_in_person: true, total_amount: 4000, amount_paid: 800, no_show_at: "2026-09-10T08:00:00Z" },
      // Nothing recorded can sit on a request; if it ever does, it is not takings.
      { status: "approved", total_amount: 2000, amount_paid: 500 },
    ]);
    expect(split.collected).toBe(3000 + 800);
    expect(split.toCollect).toBe(0);
  });
});

describe("the cash form", () => {
  it("reads the figure the way it is printed above the field", () => {
    expect(parseRupeesInput("5152")).toBe(5152);
    expect(parseRupeesInput("Rs 5,152")).toBe(5152);
    expect(parseRupeesInput(" 5 152 ")).toBe(5152);
  });

  it("refuses decimals, negatives, zero and words — the ledger is whole rupees", () => {
    for (const bad of ["51.52", "-100", "0", "", "abc", "12abc"]) expect(parseRupeesInput(bad)).toBeNull();
  });

  it("refuses more than is owed before anything is sent", () => {
    const r = checkCashAmount("6000", 5152);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Rs 5,152");
    expect(checkCashAmount("5152", 5152)).toEqual({ ok: true, amount: 5152 });
  });

  it("repeats the method back in plain words", () => {
    expect(methodPhrase("cash", "Cash")).toBe("in cash");
    expect(methodPhrase("mcb_juice", "MCB Juice")).toBe("by MCB Juice");
  });

  it("never says 'nothing was saved' when the payment may have committed", () => {
    // A dropped line (0) or a server fault (5xx) can come after the RPC wrote the row.
    expect(paymentOutcomeUnknown(0)).toBe(true);
    expect(paymentOutcomeUnknown(500)).toBe(true);
    expect(paymentOutcomeUnknown(504)).toBe(true);
    // Refusals happen before anything is written.
    for (const s of [400, 401, 404, 409]) expect(paymentOutcomeUnknown(s)).toBe(false);
  });

  it("says whether the customer heard, and when to pick up the phone", () => {
    expect(toldLine({ emailed: true, hasEmail: true })).toBe("Customer emailed.");
    expect(toldLine({ emailed: false, hasEmail: true })).toMatch(/phone them/);
    expect(toldLine({ emailed: false, hasEmail: false })).toBe("No email on file — phone them.");
  });
});

describe("the agenda", () => {
  const fleet = [
    { id: "veh-1788973628068", name: "Suzuki Swift (Latest Gen) ", category: "car" },
    { id: "burgman", name: "BURGMAN 125cc", category: "scooter" },
  ];

  it("names the vehicle instead of printing its fleet id", () => {
    expect(fleetName(fleet, "veh-1788973628068")).toBe("Suzuki Swift (Latest Gen)");
    expect(fleetName(fleet, "burgman")).toBe("BURGMAN 125cc");
    // Unknown ids fall back to themselves rather than to nothing.
    expect(fleetName(fleet, "gone")).toBe("gone");
    expect(fleetName(undefined, "burgman")).toBe("burgman");
  });

  it("knows a car from a scooter", () => {
    expect(isCarBooking(fleet, "veh-1788973628068")).toBe(true);
    expect(isCarBooking(fleet, "burgman")).toBe(false);
  });

  it("asks a cash customer to bring the real amount", () => {
    const text = reminderText("tomorrow", "Alex", "Suzuki Swift", 5152);
    expect(text).toContain("pickup is tomorrow");
    expect(text).toContain("Please bring Rs 5,152 in cash.");
  });

  it("says today on the Deliver today card, and asks for no cash when none is owed", () => {
    const text = reminderText("today", "Alex", "Suzuki Swift", null);
    expect(text).toContain("pickup is today");
    expect(text).not.toContain("bring");
    expect(reminderText("return", "Alex", "Suzuki Swift", 0)).not.toContain("bring");
  });

  it("builds a WhatsApp link only when there is a number", () => {
    expect(waHref("+230 5 123 4567", "hi there")).toBe("https://wa.me/23051234567?text=hi%20there");
    expect(waHref(null)).toBeNull();
    expect(waHref("  ")).toBeNull();
  });
});

describe("the Money desk", () => {
  const row = (id: string, startDate: string, overdue: boolean): CashRow => ({
    kind: "vehicle", id, reference: id, customer: "x", item: null, startDate,
    totalRupees: 1, paidRupees: 0, toCollectRupees: 1, overdue, desk: "Bookings",
  });

  it("lists overdue cash first, then the soonest", () => {
    const sorted = sortCashRows([row("a", "2026-11-14", false), row("b", "2026-09-20", true), row("c", "2026-10-01", false), row("d", "2026-09-08", true)]);
    expect(sorted.map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("counts the pickups that came and went with no payment recorded", () => {
    expect(
      countUnrecordedCash(
        "vehicle",
        [
          cashRental,
          { ...cashRental, start_date: "2026-11-14" },
          { ...cashRental, amount_paid: 5152 },
          { ...cashRental, pay_in_person: false, amount_paid: 1000 },
        ],
        TODAY,
      ),
    ).toBe(1);
  });
});

describe("island time", () => {
  it("is UTC+4 — 21:00 UTC is already tomorrow on Rodrigues", () => {
    expect(islandToday(Date.parse("2026-09-29T21:00:00Z"))).toBe("2026-09-30");
    expect(islandToday(Date.parse("2026-09-29T19:59:00Z"))).toBe("2026-09-29");
    expect(islandToday(Date.parse("2026-09-29T12:00:00Z"), 1)).toBe("2026-09-30");
  });

  it("starts an island day at 20:00 UTC the evening before", () => {
    expect(islandDayStartUtc("2026-09-29")).toBe("2026-09-28T20:00:00.000Z");
  });
});

describe("the day the cash changed hands (M222)", () => {
  const NOW = Date.parse("2026-09-29T10:00:00Z"); // 14:00 on Rodrigues

  it("knows a real calendar day from a typo", () => {
    expect(isIslandDay("2026-09-08")).toBe(true);
    for (const bad of ["2026-02-30", "2026-9-8", "08/09/2026", "", "2026-09-08T00:00"]) expect(isIslandDay(bad)).toBe(false);
  });

  it("stores noon on the island for a past day, so the receipt prints that day everywhere", () => {
    expect(receivedAtFor("2026-09-08", NOW)).toEqual({ ok: true, at: "2026-09-08T08:00:00.000Z" });
  });

  it("never dates today's cash later than now — the RPC refuses the future", () => {
    // 07:00 on the island: noon has not come yet.
    const early = Date.parse("2026-09-29T03:00:00Z");
    expect(receivedAtFor("2026-09-29", early)).toEqual({ ok: true, at: "2026-09-29T03:00:00.000Z" });
    expect(receivedAtFor("2026-09-29", NOW)).toEqual({ ok: true, at: "2026-09-29T08:00:00.000Z" });
  });

  it("refuses tomorrow on the island's calendar, and a malformed day", () => {
    const r = receivedAtFor("2026-09-30", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("The payment date cannot be in the future.");
    // 21:00 UTC is already the 30th on Rodrigues.
    expect(receivedAtFor("2026-09-30", Date.parse("2026-09-29T21:00:00Z")).ok).toBe(true);
    expect(receivedAtFor("2026-02-30", NOW).ok).toBe(false);
  });

  it("prefills the booking's start day once it has passed, otherwise today", () => {
    expect(cashDateDefault("2026-09-08", TODAY)).toBe("2026-09-08");
    expect(cashDateDefault("2026-11-14", TODAY)).toBe(TODAY);
    expect(cashDateDefault(TODAY, TODAY)).toBe(TODAY);
    expect(cashDateDefault(null, TODAY)).toBe(TODAY);
    expect(cashDateDefault("2026-09-08T00:00:00+00:00", TODAY)).toBe("2026-09-08");
  });

  it("emails a receipt by default only for money received in the last week", () => {
    expect(receiptByDefault(TODAY, TODAY)).toBe(true);
    expect(receiptByDefault("2026-09-22", TODAY)).toBe(true);
    expect(receiptByDefault("2026-09-21", TODAY)).toBe(false);
    expect(receiptByDefault("2026-08-15", TODAY)).toBe(false);
  });
});

describe("two confirmed bookings on a one-unit vehicle", () => {
  const fleet = [
    { id: "veh-swift", name: "Suzuki Swift", units: 1 },
    { id: "burgman", name: "BURGMAN 125cc", units: 3 },
    { id: "avenis", name: "Avenis", assets: [{ active: true }, { active: false }] },
  ];
  const b = (id: string, scooter: string, start_date: string, end_date: string, status = "confirmed") => ({
    id, scooter, start_date, end_date, status,
  });

  it("flags both halves of the live duplicate pair, and names each other", () => {
    const c = confirmedClashes(
      [b("87e663", "veh-swift", "2026-10-02", "2026-10-06"), b("befca8", "veh-swift", "2026-10-04", "2026-10-09")],
      fleet,
    );
    expect(c.get("87e663")).toEqual(["befca8"]);
    expect(c.get("befca8")).toEqual(["87e663"]);
  });

  it("counts a same-day return and pickup as a clash, as isVehicleFree does", () => {
    const c = confirmedClashes(
      [b("a", "veh-swift", "2026-10-01", "2026-10-03"), b("b", "veh-swift", "2026-10-03", "2026-10-05")],
      fleet,
    );
    expect(c.size).toBe(2);
  });

  it("stays quiet for separate dates, several units, a pending request, or a cancelled duplicate", () => {
    expect(confirmedClashes([b("a", "veh-swift", "2026-10-01", "2026-10-02"), b("b", "veh-swift", "2026-10-03", "2026-10-05")], fleet).size).toBe(0);
    expect(confirmedClashes([b("a", "burgman", "2026-10-01", "2026-10-05"), b("b", "burgman", "2026-10-01", "2026-10-05")], fleet).size).toBe(0);
    expect(confirmedClashes([b("a", "veh-swift", "2026-10-01", "2026-10-05"), b("b", "veh-swift", "2026-10-01", "2026-10-05", "pending")], fleet).size).toBe(0);
    expect(confirmedClashes([b("a", "veh-swift", "2026-10-01", "2026-10-05"), b("b", "veh-swift", "2026-10-01", "2026-10-05", "cancelled")], fleet).size).toBe(0);
  });

  it("counts units the way availability does — active assets first", () => {
    expect(fleetUnits(fleet, "avenis")).toBe(1);
    expect(fleetUnits(fleet, "burgman")).toBe(3);
    expect(fleetUnits(fleet, "BURGMAN 125cc")).toBe(3);
    // Unknown model: one, as isVehicleFree assumes.
    expect(fleetUnits(fleet, "gone")).toBe(1);
    expect(confirmedClashes([b("a", "avenis", "2026-10-01", "2026-10-05"), b("b", "avenis", "2026-10-02", "2026-10-03")], fleet).size).toBe(2);
  });

  it("flags nothing before the fleet has loaded, rather than every scooter", () => {
    expect(confirmedClashes([b("a", "burgman", "2026-10-01", "2026-10-05"), b("b", "burgman", "2026-10-01", "2026-10-05")], undefined).size).toBe(0);
  });
});
