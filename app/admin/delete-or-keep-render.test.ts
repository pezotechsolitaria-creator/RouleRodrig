import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DeleteOrKeep from "./DeleteOrKeep";

// ── Which button the owner actually sees (architecture review 2026-09-30,
//    item 3) ──────────────────────────────────────────────────────────────────
//
// The desks cannot be driven locally (no service-role key), so this renders
// the real component the rentals and reservations cards end with, and reads
// back the button and the reason it carries.

const render = (row: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(DeleteOrKeep, {
      kind: "vehicle",
      row,
      busy: false,
      onDelete: () => {},
      onCancel: () => {},
      ...extra,
    }),
  ).replace(/<!-- -->/g, "");
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("the last button on a booking card", () => {
  it("offers Delete for an unpaid request", () => {
    const html = render({ status: "pending" });
    expect(text(html)).toBe("Delete");
    expect(html).toContain('title="Delete this booking permanently"');
  });

  it("offers Cancel instead for a confirmed booking, with the reason visible and on hover", () => {
    const html = render({ status: "confirmed" });
    // The reason is a visible line now (wave 1 review): a phone shows no tooltip.
    expect(text(html)).toBe(
      "Cancel instead This booking is confirmed, so it can't be deleted. Cancel it instead: it stays on file, marked cancelled.",
    );
    expect(text(html)).not.toContain("Delete");
    expect(html).toContain(
      "title=\"This booking is confirmed, so it can&#x27;t be deleted. Cancel it instead: it stays on file, marked cancelled.\"",
    );
  });

  it("offers no button at all for a booking that is over", () => {
    for (const row of [{ status: "completed" }, { status: "cancelled", no_show_at: "2026-09-02T10:00:00Z" }]) {
      const html = render(row);
      expect(html, JSON.stringify(row)).not.toContain("<button");
      expect(text(html), JSON.stringify(row)).toMatch(/^KEPT ON FILE This booking is .+, so it can't be deleted. It stays on file as it is.$/);
    }
  });

  it("does not offer Cancel on a declared transfer: it sends the owner to reconcile", () => {
    const html = render({ status: "approved", payment_reported_at: "2026-10-01T09:00:00Z" });
    expect(html).not.toContain("<button");
    expect(text(html)).toContain("KEPT ON FILE");
    expect(text(html)).toContain("Check your statement on the Money desk first.");
  });

  it("adds no second sentence when the server refused (its notice line already says why)", () => {
    const sentence = "Changed while you were looking.";
    expect(text(render({ status: "pending" }, { refusedByServer: sentence }))).toBe("Cancel instead");
  });

  it("turns Delete into Cancel once the route has refused a row it did not predict", () => {
    const sentence =
      "Money is recorded against this booking in the payments ledger, so it can't be deleted. Cancel it instead: it stays on file, marked cancelled.";
    const html = render({ status: "pending" }, { refusedByServer: sentence });
    expect(text(html)).toBe("Cancel instead");
  });

  it("uses the reservations desk's own word", () => {
    expect(render({ status: "pending" }, { kind: "place" })).toContain('title="Delete this reservation permanently"');
    expect(render({ status: "completed" }, { kind: "place" })).toContain("This reservation is completed");
  });
});
