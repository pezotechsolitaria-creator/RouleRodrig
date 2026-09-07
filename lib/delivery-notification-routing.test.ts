import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_TYPES } from "./email/types";

// ── DELIVERIES STOPPED SHOUTING (M164) ──────────────────────────────────────
//
// The owner, verbatim: "disable msg for callmebot for deliveries instead send
// emails ONLY when there is no drivers more simple".
//
// Measured before changing anything, from notification_jobs over a fortnight:
//
//   deliveries  34   <- more than everything else put together
//   rentals     30
//   admin       20
//   bookings     4
//
// And within deliveries, the breakdown said the noise was the marketplace
// WORKING: request_posted 12, quote_offered 8, quote_accepted 8. A person is
// not needed for any of those.
//
// So the routine three are silent, and the exceptions — a job nobody took, a
// package a driver is sitting on — became email instead. What must NOT change
// is the driver side: drivers learn about jobs by push AND WhatsApp precisely
// because push dies with the browser, and silencing that would take the supply
// side of a reverse auction offline.

const LIB = __dirname;
const read = (...p: string[]) => readFileSync(join(LIB, ...p), "utf8");
const REQUESTS = read("delivery", "notify-requests.ts");
const NOTIFY = read("delivery", "notify.ts");

describe("the owner is not told that things are working", () => {
  for (const routine of [
    "delivery.request_posted",
    "delivery.quote_offered",
    "delivery.quote_accepted",
  ]) {
    it(`no longer queues ${routine}`, () => {
      expect(REQUESTS).not.toContain(`type: "${routine}"`);
    });
  }

  it("stops importing the queue for owner alerts entirely", () => {
    // formatWhatsAppMessage stays — it still builds the DRIVER's message.
    expect(REQUESTS).not.toContain("enqueueNotification");
    expect(REQUESTS).toContain("formatWhatsAppMessage");
  });
});

describe("the drivers still hear everything", () => {
  it("keeps push and WhatsApp on a new job", () => {
    // The supply side of a reverse auction. Push dies with the browser —
    // cleared data, a declined permission — and WhatsApp does not.
    expect(REQUESTS).toContain("pushToDriverEndpoints");
    expect(REQUESTS).toContain("whatsappFan");
    expect(REQUESTS).toContain("request_whatsapp_targets");
  });

  it("still tells a driver they won, and that a job was cancelled", () => {
    expect(REQUESTS).toContain("driver_whatsapp_target_for_driver");
    expect(REQUESTS).toContain("notifyDriverOfCancellation");
  });
});

describe("an exception arrives by email", () => {
  it("a stalled delivery mails instead of queueing a WhatsApp", () => {
    expect(NOTIFY).toContain("sendDeliveryStallEmail({");
    const fn = NOTIFY.slice(NOTIFY.indexOf("export async function notifyOwnerDeliveryStalled"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).not.toContain("enqueueNotification");
  });

  it("passes the escalation's own words and key through unchanged", () => {
    // So the email and the delivery board can never describe one situation
    // two different ways, and one stall mails once.
    expect(NOTIFY).toContain("title: alert.title");
    expect(NOTIFY).toContain("lines: alert.lines");
    expect(NOTIFY).toContain("dedupeKey: alert.dedupeKey");
  });

  it("covers the no-driver case the owner actually asked for", () => {
    // `settled` is "no_driver" when nobody accepted, and it is passed as the
    // kind, so the email can say which situation this is.
    expect(NOTIFY).toContain("kind: settled");
    expect(NOTIFY).toContain('"no_driver"');
  });

  it("registers the email type, or send() would reject it", () => {
    expect(EMAIL_TYPES).toHaveProperty("owner_delivery_stall");
    expect(EMAIL_TYPES.owner_delivery_stall.priority).toBe("high");
  });
});
