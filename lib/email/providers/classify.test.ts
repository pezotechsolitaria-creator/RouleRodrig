import { describe, it, expect } from "vitest";
import { classifyHttp, classifyThrown, parseFrom } from "./types";

// ── Failure classification ──────────────────────────────────────────────────
// The distinction these tests protect is the one that decides whether a customer
// receives one ticket or two. `unknown` must never be treated as a failure that
// can be retried or failed over.

describe("classifyHttp", () => {
  it("treats 5xx as transient — the same provider will probably work in a moment", () => {
    expect(classifyHttp(500, "").failure).toBe("transient");
    expect(classifyHttp(502, "bad gateway").failure).toBe("transient");
    expect(classifyHttp(503, "").failure).toBe("transient");
  });

  it("treats a bare 429 as a rate limit, so it is retried rather than failed over", () => {
    expect(classifyHttp(429, "Too many requests").failure).toBe("transient");
  });

  it("treats a 429 that mentions quota as an exhausted allowance", () => {
    // Waiting will not clear this today, but the OTHER provider can take it.
    expect(classifyHttp(429, "Daily limit reached for your plan").failure).toBe("quota");
    expect(classifyHttp(429, "You have exceeded your monthly limit").failure).toBe("quota");
    expect(classifyHttp(429, "Not enough credits").failure).toBe("quota");
  });

  it("treats Brevo's 402 as an exhausted allowance", () => {
    expect(classifyHttp(402, "Payment required").failure).toBe("quota");
  });

  it("treats 401/403 as an auth fault the other provider cannot fix", () => {
    expect(classifyHttp(401, "unauthorized").failure).toBe("auth");
    expect(classifyHttp(403, "forbidden: sender not verified").failure).toBe("auth");
  });

  it("separates an undeliverable address from a malformed request", () => {
    expect(classifyHttp(422, "Invalid email address").failure).toBe("invalid");
    expect(classifyHttp(400, "recipient is invalid").failure).toBe("invalid");
    expect(classifyHttp(422, "missing required field: subject").failure).toBe("permanent");
  });

  it("treats an unrecognised status as permanent rather than retrying forever", () => {
    expect(classifyHttp(418, "").failure).toBe("permanent");
    expect(classifyHttp(404, "").failure).toBe("permanent");
  });

  it("never echoes the provider's response body into the reason", () => {
    // The reason is written to email_log and shown in the admin dashboard; a
    // provider error payload can quote the request back at us.
    const secretish = "key=xkeysib-abc123 to=customer@example.com";
    expect(classifyHttp(400, secretish).reason).not.toContain("xkeysib");
    expect(classifyHttp(400, secretish).reason).not.toContain("customer@example.com");
  });

  it("tolerates a missing body", () => {
    expect(() => classifyHttp(500, "")).not.toThrow();
    expect(classifyHttp(500, undefined as unknown as string).failure).toBe("transient");
  });
});

describe("classifyThrown", () => {
  const withCause = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

  it("marks errors that prove nothing was sent as transient — retrying is free", () => {
    expect(classifyThrown(withCause("ENOTFOUND")).failure).toBe("transient");
    expect(classifyThrown(withCause("ECONNREFUSED")).failure).toBe("transient");
    expect(classifyThrown(withCause("EAI_AGAIN")).failure).toBe("transient");
    expect(classifyThrown(withCause("UND_ERR_CONNECT_TIMEOUT")).failure).toBe("transient");
  });

  it("marks a connection lost MID-request as unknown, never transient", () => {
    // The provider may already have accepted and delivered it. This is the
    // single most important classification in the file.
    expect(classifyThrown(withCause("ECONNRESET")).failure).toBe("unknown");
    expect(classifyThrown(withCause("ETIMEDOUT")).failure).toBe("unknown");
    expect(classifyThrown(withCause("UND_ERR_HEADERS_TIMEOUT")).failure).toBe("unknown");
    expect(classifyThrown(withCause("UND_ERR_BODY_TIMEOUT")).failure).toBe("unknown");
  });

  it("marks an abort or timeout as unknown", () => {
    expect(classifyThrown(Object.assign(new Error("aborted"), { name: "AbortError" })).failure).toBe("unknown");
    expect(classifyThrown(Object.assign(new Error("timeout"), { name: "TimeoutError" })).failure).toBe("unknown");
  });

  it("defaults an unrecognised error to unknown, the safe direction", () => {
    // Guessing "transient" costs a duplicate email; guessing "unknown" costs one
    // retry that did not happen. The cheaper mistake wins.
    expect(classifyThrown(new Error("something odd")).failure).toBe("unknown");
    expect(classifyThrown(null).failure).toBe("unknown");
    expect(classifyThrown(undefined).failure).toBe("unknown");
    expect(classifyThrown("a string").failure).toBe("unknown");
  });
});

describe("parseFrom", () => {
  it("splits a display-name sender", () => {
    expect(parseFrom("Roule Rodrigues <bookings@roulerodrig.com>")).toEqual({
      name: "Roule Rodrigues",
      email: "bookings@roulerodrig.com",
    });
  });

  it("handles a bare address", () => {
    expect(parseFrom("bookings@roulerodrig.com")).toEqual({
      name: "Roule Rodrigues",
      email: "bookings@roulerodrig.com",
    });
  });

  it("trims stray whitespace inside the angle brackets", () => {
    expect(parseFrom("  Name  < a@b.com >  ").email).toBe("a@b.com");
  });
});
