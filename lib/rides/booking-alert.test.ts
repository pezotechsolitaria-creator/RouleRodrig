import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const ROUTE = "app/api/rides/route.ts";
const MIG = "supabase/migrations/20260909180000_m195_taxi_alerts_reach_every_inbox.sql";

// ── A TAXI BOOKING TOLD ALMOST NOBODY ───────────────────────────────────────
//
// app/api/rides sent one email and stopped. No WhatsApp, no ntfy — nothing on
// the phone the owner carries. A request arrived and sat in /admin/rides until
// somebody thought to look.
//
// Everything needed already existed: a `rides` notification category, a worker
// that sends on whatsapp/ntfy/email, and three slots carrying `categories =
// '{}'` which enqueue_notification reads as "every category". They never fired
// because nothing raised the event.
//
// Verified against production, rolled back: the enqueue now produces 5 jobs —
// two CallMeBot numbers, one ntfy topic, two mailboxes — alongside the direct
// owner email, which is unchanged.

describe("booking a taxi raises an alert", () => {
  const src = read(ROUTE);

  it("it goes through the queue, on the rides category", () => {
    expect(src).toContain("enqueueNotification");
    expect(src).toMatch(/type: "ride\.requested"/);
    expect(src).toMatch(/category: "rides"/);
  });

  it("the email is still sent as well", () => {
    // It works — email_log shows it landing within a second of each of the last
    // two bookings — and it is the rich bilingual one. The queue adds channels;
    // it does not replace that.
    expect(src).toContain("sendRideEmails");
  });

  it("neither can fail the booking", () => {
    // The ride is committed and the reference minted before either runs. An
    // alert failing must not turn a successful request into an error on the
    // customer's screen.
    const after = src.slice(src.indexOf("await sendRideEmails"));
    expect(after).toMatch(/catch \{/);
    expect(after).toMatch(/catch \(err\) \{/);
  });

  it("one ride raises one alert per channel, however often it retries", () => {
    expect(src).toMatch(/dedupeKey: created\.reference/);
    expect(src).toMatch(/ride\.requested:\$\{created\.reference\}/);
  });

  it("the price comes from the SERVER and is formatted, not divided here", () => {
    // quoted_price is minor units. This repo has shipped a rupees-vs-cents bug
    // twice, so the shared formatter does the division.
    expect(src).toMatch(/formatRidePrice\(created\.price\)/);
    expect(src).not.toMatch(/created\.price \/ 100/);
    // v.price would be the CALLER's number. It must never reach an alert.
    expect(src).not.toMatch(/formatRidePrice\(v\.price\)/);
  });

  it("the alert carries what an admin needs to act", () => {
    const block = src.slice(src.indexOf('type: "ride.requested"'));
    for (const field of ["pickupLabel", "dropoffLabel", "v.name", "v.phone", "passengers"]) {
      expect(block, field).toContain(field);
    }
    // And a way straight to the desk.
    expect(block).toMatch(/\/admin\/rides/);
  });
});

describe("the two mailboxes that were getting nothing", () => {
  const sql = read(MIG);

  it("both are added as email slots", () => {
    expect(sql).toContain("bookings@roulerodrig.com");
    expect(sql).toContain("roulerodrig@gmail.com");
    expect(sql.match(/'email'/g) ?? []).toHaveLength(2);
  });

  it("they are scoped to rides, not to everything", () => {
    // An all-categories email slot would start mailing them every delivery,
    // order and payment event on the platform — which is how an alert channel
    // becomes noise somebody learns to ignore.
    expect(sql.match(/array\['rides'\]::notification_category\[\]/g) ?? []).toHaveLength(2);
    expect(sql).not.toMatch(/'\{\}'::notification_category/);
  });

  it("the owner's own inbox is deliberately NOT one of them", () => {
    // sendRideEmails already mails it directly. A slot would double-send.
    // Checked on the INSERT, not the whole file: the header names the address
    // while explaining why it is being left out.
    const values = sql.slice(sql.indexOf("insert into notification_slots"));
    expect(values).not.toContain("ninjaespion23");
    expect(sql).toContain("TWICE");
  });

  it("re-running it adds nothing", () => {
    expect(sql).toMatch(/on conflict do nothing/);
  });
});
