import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GOOGLE_REVIEW_LINK, REVIEW_ASK, REVIEW_CTA, reviewUrl } from "./reviews";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const EMAIL = read("lib", "email.ts");
const TYPES = read("lib", "email", "types.ts");
const RIDES_ROUTE = read("app", "api", "admin", "rides", "route.ts");

// ── THE FUNNEL POINTED AT ITSELF FOR A YEAR ─────────────────────────────────
//
// Every "Leave a review" button this platform has sent went to
// `process.env.GOOGLE_REVIEW_URL || SITE_URL + "/#contact"`, and that variable
// has never been set anywhere. So the whole review funnel dropped customers on
// the business's own homepage, on a site whose reviews section reads "Be the
// first to leave a review".
//
// These tests exist so it cannot happen again silently.

describe("where a review actually goes", () => {
  const saved = process.env.GOOGLE_REVIEW_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.GOOGLE_REVIEW_URL;
    else process.env.GOOGLE_REVIEW_URL = saved;
  });

  it("is the owner's Google Business Profile, not a page of our own", () => {
    delete process.env.GOOGLE_REVIEW_URL;
    expect(reviewUrl()).toBe("https://share.google/YljFB8HExNjCmKL5K");
    expect(GOOGLE_REVIEW_LINK).toBe(reviewUrl());
    // The old destination, named so a regression says what it is.
    expect(reviewUrl()).not.toContain("#contact");
    expect(reviewUrl()).not.toContain("roulerodrig.com");
  });

  it("is read at call time, so a warm cron picks up a change", () => {
    process.env.GOOGLE_REVIEW_URL = "https://example.com/r";
    expect(reviewUrl()).toBe("https://example.com/r");
  });

  it("falls back to the real link rather than to a guess", () => {
    // The env var is an escape hatch now, not the only route. Unset, the
    // fallback still has to be somewhere a review can be left.
    process.env.GOOGLE_REVIEW_URL = "";
    expect(reviewUrl()).toBe(GOOGLE_REVIEW_LINK);
  });
});

describe("every review button reads the shared module", () => {
  it("nothing rebuilds the old expression", () => {
    // Two senders each carried their own copy of it, twelve lines of comment
    // and all. A third copy is how two of them end up disagreeing.
    expect(EMAIL).not.toContain("GOOGLE_REVIEW_URL");
    expect(EMAIL).not.toContain("/#contact`");
  });

  it("every review button is the shared call and the shared label", () => {
    const buttons = [...EMAIL.matchAll(/primaryButton\(([^,]+), *([^)]+)\)/g)]
      .filter((mm) => /review/i.test(mm[0]) || /reviewUrl/.test(mm[1]));
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const b of buttons) {
      expect(b[1].trim(), b[0]).toBe("reviewUrl()");
      expect(b[2].trim(), b[0]).toBe("REVIEW_CTA");
    }
  });

  it("asks in both languages, with one set of words", () => {
    expect(REVIEW_CTA).toContain("Leave a review");
    expect(REVIEW_CTA).toContain("Laisser un avis");
    expect(REVIEW_ASK.en).toMatch(/30 seconds/);
    expect(REVIEW_ASK.fr).toMatch(/30 secondes/);
    // Retyped per sender it drifts into three slightly different asks.
    expect(EMAIL).not.toContain("means the world to a small island business — it takes");
  });
});

// ── EVERY FEATURE THAT FINISHES SOMETHING NOW ASKS ──────────────────────────
describe("which features ask", () => {
  const asks = (fn: string) => {
    const at = EMAIL.indexOf(`export async function ${fn}`);
    expect(at, fn).toBeGreaterThan(-1);
    const next = EMAIL.indexOf("\nexport async function ", at + 10);
    return EMAIL.slice(at, next === -1 ? undefined : next);
  };

  it("the scooter and the car, after the return", () => {
    expect(asks("sendFeedbackRequest")).toContain("reviewUrl()");
  });

  it("the stay and the experience, the day after", () => {
    expect(asks("sendPlaceFeedbackRequest")).toContain("reviewUrl()");
  });

  it("the taxi, which used to ask nobody anything", () => {
    // A ride ended in silence: a confirmation at the start, nothing at the
    // end, from the customer most likely to have just spent forty minutes
    // with somebody from the island.
    const body = asks("sendRideFeedbackRequest");
    expect(body).toContain("reviewUrl()");
    expect(body).toContain('type: "ride_feedback_request"');
    // And it is a registered type, not a string nothing routes.
    const line = TYPES.split("\n").find((l) => l.trim().startsWith("ride_feedback_request:"));
    expect(line).toBeTruthy();
    expect(line, "marked planned but code sends it").not.toContain("planned");
    expect(line).toContain('"low"');
  });

  it("the shop and the kitchen, when the order is collected", () => {
    // Decided by the email's TYPE rather than by each caller: three routes
    // emit this one, and a rule living at three call sites is a rule two of
    // them eventually miss.
    expect(EMAIL).toContain('const asksForReview = o.type === "marketplace_order_completed"');
  });

  it("the ride email fires on the completion, not from the nightly cron", () => {
    // A ride finishes in an afternoon. Asking tomorrow morning is asking
    // about something already half-forgotten.
    expect(RIDES_ROUTE).toContain('if (p.status === "completed")');
    expect(RIDES_ROUTE).toContain("sendRideFeedbackRequest");
    // After the status write, never in front of it.
    expect(RIDES_ROUTE.indexOf("admin_set_ride_status"))
      .toBeLessThan(RIDES_ROUTE.indexOf("sendRideFeedbackRequest"));
  });
});

describe("a review request never outranks something that matters", () => {
  it("is the first mail the quota engine drops", () => {
    for (const t of [
      "scooter_feedback_request", "car_feedback_request",
      "accommodation_feedback_request", "activity_feedback_request",
      "ride_feedback_request",
    ]) {
      const line = TYPES.split("\n").find((l) => l.trim().startsWith(`${t}:`));
      expect(line, t).toBeTruthy();
      expect(line, t).toContain('priority: "low"');
    }
  });
});
