import { describe, it, expect, vi } from "vitest";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ── /order TOLD EVERY VISITOR THEY PAY BY BANK TRANSFER (audit C9) ──────────
//
// The hub is in the tab bar on every page, and it said "you pay by bank
// transfer" while the one kitchen on /food takes cash only (M201), and the
// Tickets door promised a transfer when each organiser chooses cash or a
// transfer to their own account (lib/events/copy.i18n.ts). Rendered, not
// grepped: the comment explaining the fix quotes the old sentence.

vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("./OrderHubBaskets", () => ({ default: () => null }));

describe("the order hub", async () => {
  const { default: OrderHubPage } = await import("./page");
  const text = renderToStaticMarkup(OrderHubPage() as ReactElement)
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

  it("promises no payment method for the three doors", () => {
    expect(text).not.toMatch(/bank transfer/i);
    expect(text).toContain("each shows how its seller takes payment before you order");
  });

  it("tells a ticket buyer to pay the organiser the way the event shows", () => {
    expect(text).toContain("Pay the organiser the way the event shows, then show your code at the gate.");
  });

  it("still opens all three doors", () => {
    for (const door of ["Food", "Marketplace", "Tickets"]) expect(text).toContain(door);
  });
});
