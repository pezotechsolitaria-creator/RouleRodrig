import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_TYPES } from "./email/types";
import { quoteArrivedLines } from "./delivery/request-copy";

// ── THE GUEST HEARD NOTHING (M167) ──────────────────────────────────────────
//
// A signed-in customer gets a push when a driver prices their delivery. A guest
// has no account and no push subscription, so the first price reached them
// NOWHERE — it existed only on the request page, which they had to think to
// reopen. On a surface whose entire value arrives minutes after they leave, the
// product was failing silently for everybody without an account.
//
// FIRST price only. notify-requests.ts has carried the reason as a standing
// warning since it was written: a bidding war is many quotes on one request,
// and mailing every one spends a shared sending budget that password resets
// draw on too (M41).

const SRC = readFileSync(
  join(__dirname, "delivery", "notify-requests.ts"),
  "utf8",
);

describe("only a guest, and only the first price", () => {
  it("requires a guest email, no account, and quoteCount 1", () => {
    expect(SRC).toContain(
      "q.request.guestEmail && !q.request.customerId && q.request.quoteCount === 1",
    );
  });

  it("does nothing when the condition is not met", () => {
    // A signed-in customer with an email on file must not get push AND mail
    // for one event, and the second driver to quote must not mail at all.
    expect(SRC).toContain("Promise.resolve(false)");
  });

  it("sends an absolute link — an email cannot follow a relative path", () => {
    expect(SRC).toContain("`${SITE_URL}${customerPath(q.request.id)}`");
  });
});

describe("the mail says exactly what the push says", () => {
  it("reuses the queue's own title and lines", () => {
    // Not re-worded. Two descriptions of one event is how a push and an email
    // start disagreeing about what happened.
    const call = SRC.slice(SRC.indexOf("sendGuestQuoteEmail({"));
    expect(call).toContain("title,");
    expect(call).toContain("lines,");
  });

  it("carries the line that must survive everything", () => {
    // request-copy.ts appends this unconditionally and calls it the one line
    // that has to survive the lock screen. It is the whole difference between
    // a quote marketplace and an order.
    const lines = quoteArrivedLines({
      fee: 40000,
      driverName: "Test Driver",
      what: "A box",
      quoteCount: 1,
    });
    expect(lines.at(-1)).toBe("Nobody is on the way until you choose a price.");
  });
});

describe("it is a real, registered email type", () => {
  it("would not be rejected by send()", () => {
    expect(EMAIL_TYPES).toHaveProperty("customer_quote_arrived");
    expect(EMAIL_TYPES.customer_quote_arrived.priority).toBe("high");
  });

  it("dedupes per REQUEST, not per quote", () => {
    // Belt and braces behind the quoteCount check: even if that ever changed,
    // one request must still mail once.
    const email = readFileSync(join(__dirname, "email.ts"), "utf8");
    expect(email).toContain('keyFor("customer_quote_arrived", input.requestId)');
  });
});
