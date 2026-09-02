import { describe, it, expect } from "vitest";
import { retryAfterSeconds, isRateLimited } from "./resend-confirmation";

describe("retryAfterSeconds", () => {
  it("reads the wait out of Supabase's own sentence", () => {
    expect(
      retryAfterSeconds(
        "For security purposes, you can only request this after 47 seconds.",
      ),
    ).toBe(47);
  });

  it("copes with the singular and with loose spacing", () => {
    expect(retryAfterSeconds("try again after 1 second")).toBe(1);
    expect(retryAfterSeconds("after 12  seconds")).toBe(12);
  });

  it("returns null rather than inventing a countdown", () => {
    // A made-up number would disable the button for a wait nobody asked for.
    for (const m of [
      null,
      undefined,
      "",
      "Something went wrong",
      "after some seconds",
      "after 0 seconds",
    ]) {
      expect(retryAfterSeconds(m), String(m)).toBeNull();
    }
  });
});

describe("isRateLimited", () => {
  it("recognises the limiter even when it names no number", () => {
    expect(isRateLimited("Email rate limit exceeded")).toBe(true);
    expect(isRateLimited("Too many requests")).toBe(true);
    expect(isRateLimited("you can only request this after 30 seconds")).toBe(true);
  });

  it("does not mistake a real failure for a cooldown", () => {
    // These must reach the customer as errors, not as "wait a moment".
    expect(isRateLimited("Invalid email address")).toBe(false);
    expect(isRateLimited("Network error")).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});
