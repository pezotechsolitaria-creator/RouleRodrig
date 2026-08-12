import { describe, it, expect } from "vitest";
import { channelsForStatus, earnsEmail } from "./email-policy";

// This file exists because "preparing" WAS emailing. It fell through to a
// generic status email, so every step of every order spent from a ~400/day
// ceiling shared with Supabase auth mail — the quota whose exhaustion silently
// stops password resets. These tests make that regression fail in CI instead of
// in production, where it is invisible until someone cannot sign in.

describe("which statuses earn an email", () => {
  it("never emails routine progress", () => {
    for (const status of ["paid", "preparing", "pending_payment", "awaiting_payment_confirmation"]) {
      expect(earnsEmail(status), `${status} must not email`).toBe(false);
      expect(channelsForStatus(status), `${status} channels`).toEqual(["web-push"]);
    }
  });

  it("emails the three that leave something needed later", () => {
    // ready_for_pickup carries the pickup code, collected is the receipt,
    // cancelled is a change to money and expectations.
    for (const status of ["ready_for_pickup", "collected", "cancelled"]) {
      expect(earnsEmail(status), `${status} must email`).toBe(true);
      expect(channelsForStatus(status)).toContain("email");
    }
  });

  it("always pushes, whatever else it does", () => {
    // Push is free and instant; there is no status where the customer should
    // learn nothing at all.
    for (const status of ["paid", "preparing", "ready_for_pickup", "collected", "cancelled"]) {
      expect(channelsForStatus(status), `${status} must push`).toContain("web-push");
    }
  });

  it("treats an unknown status as push-only — fails closed on the quota", () => {
    // A status added later must not start emailing by accident. Silence costs
    // nothing; an unnoticed email leak costs password resets.
    expect(channelsForStatus("some_future_status")).toEqual(["web-push"]);
  });
});
