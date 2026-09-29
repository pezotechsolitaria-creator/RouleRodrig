import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PaymentStrip, DeskNoticeLine, InPersonConfirm, CashForm } from "./BookingMoney";

// ── WHAT THE OWNER ACTUALLY READS ON A CARD (M220) ──────────────────────────
//
// The admin desks cannot be driven locally (no service-role key, so every
// /api/admin route refuses), and green logic tests prove nothing about what a
// card prints. These render the real components to markup and read it back:
// the strip's figures, its badge, which buttons exist, and the phone prompt.

const TODAY = "2026-09-29";
const html = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(el).replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const strip = (row: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  html(createElement(PaymentStrip, { kind: "vehicle", id: "b1", row, today: TODAY, onChanged: () => {}, ...extra }));

describe("the payment strip", () => {
  it("prints the real amount owed for a cash rental confirmed with nothing paid", () => {
    const text = strip({ status: "confirmed", pay_in_person: true, total_amount: 5152, deposit_amount: 1288, start_date: "2026-09-08" });
    expect(text).toContain("Total Rs 5,152 · Paid Rs 0 · To collect Rs 5,152");
    expect(text).toContain("PAYS IN PERSON");
    expect(text).toContain("NOTHING RECORDED YET");
    expect(text).toContain("Cash received");
    expect(text).toContain("No-show");
    // Never the "total minus a deposit nobody paid" figure the reminders printed.
    expect(text).not.toContain("3,864");
  });

  it("offers nothing to press on a request that is not yet confirmed", () => {
    const text = strip({ status: "pending", total_amount: 3000 });
    expect(text).toContain("UNPAID");
    expect(text).not.toContain("Cash received");
    expect(text).not.toContain("No-show");
  });

  it("says a car's security deposit is separate, without quoting a figure", () => {
    const text = strip({ status: "pending", total_amount: 3000 }, { isCar: true });
    expect(text).toContain("security deposit is separate");
    expect(text).not.toContain("5,000");
  });

  it("says paid in full rather than 'To collect Rs 0'", () => {
    const text = strip({ status: "completed", pay_in_person: true, total_amount: 3000, amount_paid: 3000 });
    expect(text).toContain("PAID");
    expect(text).toContain("Nothing left to collect");
    expect(text).not.toContain("To collect Rs 0");
  });
});

describe("the cash form (M222)", () => {
  const form = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(CashForm, { kind: "vehicle", id: "b1", balance: 5152, today: TODAY, onDone: () => {}, onCancel: () => {}, ...props }),
    );

  it("asks the day, prefilled with a pickup that has passed, and leaves the receipt off for weeks-old cash", () => {
    const markup = form({ startDate: "2026-09-08" });
    expect(markup).toMatch(/type="date"[^>]*value="2026-09-08"/);
    expect(markup).toMatch(/max="2026-09-29"/);
    expect(markup).toContain("Email the customer a receipt");
    expect(markup).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it("defaults to today, with the receipt on, for a pickup still to come", () => {
    const markup = form({ startDate: "2026-11-14" });
    expect(markup).toMatch(/type="date"[^>]*value="2026-09-29"/);
    expect(markup).toMatch(/type="checkbox"[^>]*checked/);
  });

  it("offers cash on a price-less in-person booking, and says there is no ceiling", () => {
    const text = strip({ status: "confirmed", pay_in_person: true, total_amount: null, start_date: "2026-09-08" });
    expect(text).toContain("Cash received");
    expect(html(createElement(CashForm, { kind: "vehicle", id: "b1", balance: null, today: TODAY, onDone: () => {}, onCancel: () => {} }))).toContain(
      "no price on it, so any amount can be recorded",
    );
  });
});

describe("the availability panel says a declared transfer before he presses (M222)", () => {
  // AvailabilityDecision is private to the dashboard; these pin the code, not
  // its comments (a comment naming the fix would satisfy a prose match).
  const dash = readFileSync("app/admin/AdminDashboard.tsx", "utf8");

  it("disables 'pays in person' while a declared transfer is unchecked", () => {
    expect(dash).toContain("const transferDeclared = !!paymentReportedAt && !depositPaidAt;");
    expect(dash).toContain("disabled={disabled || transferDeclared}");
    expect(dash).toMatch(/\{transferDeclared && \(\s*<span[^>]*>\s*The customer says they sent a transfer — check it first\./);
  });

  it("is told it by both desks", () => {
    expect(dash.match(/paymentReportedAt=\{b\.payment_reported_at\}/g)).toHaveLength(2);
    expect(dash.match(/depositPaidAt=\{b\.deposit_paid_at\}/g)).toHaveLength(2);
  });
});

describe("the confirm-in-person panel", () => {
  it("tells the owner what will happen and what it will not record", () => {
    const text = html(
      createElement(InPersonConfirm, { kind: "vehicle", id: "b1", total: 5152, phone: null, onDone: () => {}, onCancel: () => {} }),
    );
    expect(text).toContain("they are emailed that they owe Rs 5,152");
    expect(text).toContain("Nothing counts as paid until you record the money");
    expect(text).toContain("Cash taken now (optional)");
    expect(text).toContain("Confirm — pays in person");
  });
});

describe("the notice a card keeps", () => {
  it("offers WhatsApp when the customer was not emailed", () => {
    const markup = renderToStaticMarkup(
      createElement(DeskNoticeLine, { notice: { tone: "warn", text: "No email on file — phone them.", phone: "+230 5 123 4567" } }),
    );
    expect(markup).toContain("https://wa.me/23051234567");
    expect(markup).toContain("WhatsApp them");
  });

  it("offers no link without a number", () => {
    const markup = renderToStaticMarkup(createElement(DeskNoticeLine, { notice: { tone: "good", text: "Customer emailed." } }));
    expect(markup).not.toContain("wa.me");
  });
});
