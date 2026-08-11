import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_TYPES, liveEmailTypes, emailPriority } from "./types";

// The events checkout tells the buyer, in as many words, that their ticket
// arrives by email. That sentence is a promise, and three separate things have
// to stay true for it to be kept. Each has already been false once:
//
//   * M41 registered ticket_qr_delivery as `planned` — declared, never emitted.
//   * M35 issued tickets into a table nothing could read (fixed in M56).
//   * the checkout copy shipped before the email did (fixed in M57).
//
// So this asserts the contract rather than trusting three files to agree.

const ROOT = join(__dirname, "..", "..");

describe("the ticket email the checkout promises", () => {
  it("is registered and no longer merely planned", () => {
    const meta = EMAIL_TYPES.ticket_qr_delivery;
    expect(meta, "ticket_qr_delivery was removed from the registry").toBeTruthy();
    expect(
      "planned" in meta && (meta as { planned?: true }).planned,
      "ticket_qr_delivery is marked planned, so the checkout's promise is not kept",
    ).toBeFalsy();
    expect(liveEmailTypes()).toContain("ticket_qr_delivery");
  });

  it("is critical — it IS the admission, and support cannot repair it at the door", () => {
    expect(emailPriority("ticket_qr_delivery")).toBe("critical");
  });

  it("has code that actually sends it", () => {
    // A registry entry with no emitter is exactly the state M41 left behind.
    const sender = readFileSync(join(ROOT, "lib", "notifications", "ticket-delivery.ts"), "utf8");
    expect(sender).toContain("ticket_qr_delivery");
    // Exactly-once, or an organiser double-tapping Confirm mails the buyer twice.
    expect(sender, "the ticket email must be idempotent per order").toContain("idempotencyKey");
  });

  it("is wired into the moment tickets come into existence", () => {
    // confirm_order_payment sets 'paid', which is what issues the tickets. If
    // this call is ever dropped, the buyer is never told they have one.
    const route = readFileSync(join(ROOT, "app", "api", "organizer", "payments", "route.ts"), "utf8");
    expect(route).toContain("notifyTicketsIssued");
  });

  it("keeps the checkout copy honest", () => {
    // If somebody removes the email, this fails and points at the sentence that
    // becomes a lie — rather than the buyer discovering it at a venue.
    const checkout = readFileSync(join(ROOT, "components", "events", "EventCheckout.tsx"), "utf8");
    const promisesEmail = /your ticket goes here/i.test(checkout);
    if (promisesEmail) {
      expect(
        liveEmailTypes(),
        "EventCheckout promises the ticket arrives by email, so ticket_qr_delivery must be live",
      ).toContain("ticket_qr_delivery");
    }
  });
});
