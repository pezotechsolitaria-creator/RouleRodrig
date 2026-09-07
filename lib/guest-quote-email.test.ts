import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_TYPES } from "./email/types";
import { quoteArrivedLines } from "./delivery/request-copy";

// ── THE GUEST HEARD NOTHING (M167) ──────────────────────────────────────────
//
// A signed-in customer gets a push when a driver prices their delivery. A
// guest has no account and no push subscription, so the first price on their
// request reached them NOWHERE — it existed only on the request page, which
// they had to think to reopen. On a surface whose entire value arrives minutes
// after they leave it, that is the product failing quietly.
//
// The reason it was not already wired is written into notify-requests.ts as a
// standing warning: a bidding war is many quotes on one request, and mailing
// every one of them spends a shared sending budget that password resets also
// draw on (M41). So: the FIRST price only, and only to a guest.

const LIB = __dirname;
const NOTIFY = readFileSync(join(LIB, "delivery", "notify-requests.ts"), "utf8");
const EMAIL = readFileSync(join(LIB, "email.ts"), "utf8");

describe("only a guest, and only the first price", () => {
  it("requires a guest email, no account, and quoteCount 1", () => {
    expect(NOTIFY).toContain(
      "q.request.guestEmail && !q.request.customerId && q.request.quoteCount === 1",
    );
  });

  it("does nothing when the condition fails", () => {
    // Not an early return: this sits inside Promise.allSettled beside the push,
    // so the branch has to resolve rather than skip the whole array.
    expect(NOTIFY).toContain("Promise.resolve(false)");
  });

  it("never mails a signed-in customer", () => {
    // They have push. Mailing them too is two notifications for one event and
    // spends the budget this guard exists to protect.
    expect(NOTIFY).toContain("!q.request.customerId");
  });
});

describe("the mail says exactly what the push says", () => {
  it("passes the queue's own title and lines through", () => {
    const start = NOTIFY.indexOf("sendGuestQuoteEmail({");
    expect(start).toBeGreaterThan(-1);
    // Bounded to the call itself — slicing to end-of-file would sweep in every
    // other template literal in the module and prove nothing.
    const call = NOTIFY.slice(start, NOTIFY.indexOf("})", start) + 2);
    expect(call).toContain("title,");
    expect(call).toContain("lines,");
    // Passed through, not rebuilt: no `title: \`...\`` of its own.
    expect(call).not.toMatch(/title:\s*`/);
    expect(call).not.toMatch(/lines:\s*\[/);
  });

  it("carries the one line that must survive", () => {
    // request-copy.ts appends this unconditionally and calls it the line that
    // has to survive the lock screen. It is the difference between a customer
    // waiting for a driver nobody sent and one who knows to choose.
    const lines = quoteArrivedLines({
      fee: 40000,
      driverName: "A driver",
      what: "a box",
      quoteCount: 1,
    });
    expect(lines.at(-1)).toBe("Nobody is on the way until you choose a price.");
  });

  it("links absolutely, because an email has no origin", () => {
    expect(NOTIFY).toContain("`${SITE_URL}${customerPath(q.request.id)}`");
  });
});

describe("one request mails once", () => {
  it("dedupes on the request, not the quote", () => {
    // Five drivers quoting must not produce five emails, and a driver who
    // lowers their price keeps the same quote id — so the request is the key.
    expect(EMAIL).toContain('keyFor("customer_quote_arrived", input.requestId)');
  });

  it("is a registered email type, or send() would reject it", () => {
    expect(EMAIL_TYPES).toHaveProperty("customer_quote_arrived");
    expect(EMAIL_TYPES.customer_quote_arrived.priority).toBe("high");
    // Filed where the quota dashboard can attribute it honestly.
    expect(EMAIL_TYPES.customer_quote_arrived.category).toBe("marketplace");
  });
});
