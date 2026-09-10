import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ALERT_SAMPLES } from "./samples";
import { encodedLength, ALERT_LIMITS } from "./owner-alert";
import {
  deliveryStalledCopy,
  deliveryClosedCopy,
  requestExpiredCopy,
} from "@/lib/delivery/customer-copy";

const read = (p: string) => readFileSync(p, "utf8");

// ── THE TWO WAYS AN ALERT FAILS ─────────────────────────────────────────────
//
// It says too little to act on — "1 closed, 1 prices withdrawn. Somebody was
// quoted and never booked. Worth asking why", which names nobody, so the advice
// cannot be followed. Or it says so much it never leaves the process, because
// CallMeBot carries the whole message inside a URL.

describe("every sample alert can actually be delivered", () => {
  for (const sample of ALERT_SAMPLES) {
    it(`${sample.key} fits every channel`, () => {
      const m = sample.build();

      // CallMeBot: the URL is the limit, not the text.
      expect(encodedLength(m)).toBeLessThanOrEqual(ALERT_LIMITS.MAX_ENCODED_CHARS);
      // ntfy turns a body over 4096 bytes into an attachment that expires.
      expect(Buffer.byteLength(m, "utf8")).toBeLessThanOrEqual(ALERT_LIMITS.MAX_NTFY_BYTES);

      // ntfy strips the Title header to ASCII. A headline that does not
      // survive that arrives as a blank notification.
      const title = m.split("\n")[0];
      expect(title.replace(/[^\x20-\x7E]/g, "").trim().length).toBeGreaterThan(10);

      // The first line is the whole message on a lock screen and in an inbox
      // list, so it has to mean something on its own.
      expect(title.length).toBeLessThanOrEqual(ALERT_LIMITS.MAX_HEADLINE_CHARS);
    });

    it(`${sample.key} links somewhere real`, () => {
      const m = sample.build();
      // A relative path is dead text in WhatsApp and in an email client.
      expect(m).toMatch(/https:\/\//);
      expect(m).not.toContain("vercel.app");
      expect(m).not.toMatch(/\n[A-Za-z ]+: \/(?!\/)/);
    });
  }

  it("covers every family the owner actually receives", () => {
    const keys = ALERT_SAMPLES.map((s) => s.key);
    for (const family of ["delivery", "ride", "booking", "order", "driver", "system"]) {
      expect(keys.some((k) => k.startsWith(family)), `no sample for ${family}`).toBe(true);
    }
  });
});

describe("the expiry alert names the person", () => {
  const src = read("app/api/cron/notifications/route.ts");

  it("no longer reports bare counts", () => {
    // The exact sentences the owner quoted back. They said nothing he could
    // act on, and "worth asking why" named nobody to ask.
    expect(src).not.toContain("Somebody was quoted and never booked");
    expect(src).not.toContain("prices withdrawn.\n");
  });

  it("reads the jobs the sweep now returns", () => {
    expect(src).toContain("requestSweep.jobs");
    expect(src).toContain("contactName");
    expect(src).toContain("bestFeeCents");
  });

  it("prints money through the shared formatter", () => {
    // delivery_quotes.fee is CENTS. This platform has shipped rupees-for-cents
    // as a live money bug twice.
    expect(src).toContain("alertMoneyCents");
    expect(src).not.toMatch(/bestFeeCents\s*\/\s*100/);
  });

  it("the sweep migration returns the facts, not just counts", () => {
    const mig = read(
      "supabase/migrations/20260910200000_m198_the_expiry_alert_names_the_job.sql",
    );
    expect(mig).toContain("'jobs', v_jobs");
    expect(mig).toContain("contactPhone");
    // Read BEFORE the quotes are expired, or the best price is always null.
    expect(mig.indexOf("bestFeeCents")).toBeLessThan(
      mig.indexOf("update delivery_quotes set status = 'expired'"),
    );
    // Identical signature, so no second overload for PostgREST to refuse.
    expect(mig).toContain("sweep_delivery_requests is overloaded");
  });
});

describe("the customer is told something they can use", () => {
  const all = [
    deliveryStalledCopy({ what: "Glass", dropoff: "Baie aux Huîtres", kind: "no_driver" }),
    deliveryStalledCopy({ what: "Glass", dropoff: null, kind: "not_collected" }),
    deliveryStalledCopy({ what: "Glass", dropoff: "Mont Lubin", kind: "package_with_driver" }),
    deliveryClosedCopy({ what: "Glass", reason: null }),
    requestExpiredCopy({ what: "Glass", bestFeeCents: 2500 }),
  ];

  it("never leaves them without a next step", () => {
    // "We are sorry" on its own is worse than silence: it closes the
    // conversation without opening a door.
    for (const c of all) {
      expect(c.lines.length, c.title).toBeGreaterThanOrEqual(2);
      expect(c.lines.join(" ")).toMatch(
        /you can|we will|we are|post(?:ing)? it again|do not need|does not need/i,
      );
    }
  });

  it("never uses a status name at a person", () => {
    for (const c of all) {
      const text = `${c.title} ${c.lines.join(" ")}`.toLowerCase();
      for (const jargon of ["requires_admin", "driver_unresponsive", "failed_delivery", "null"]) {
        expect(text, c.title).not.toContain(jargon);
      }
    }
  });

  it("says money in rupees, from cents", () => {
    const c = requestExpiredCopy({ what: "Glass", bestFeeCents: 2500 });
    expect(c.lines.join(" ")).toContain("Rs 25");
    expect(c.lines.join(" ")).not.toContain("2500");
  });

  it("survives a request with no title and no price", () => {
    const c = requestExpiredCopy({ what: null, bestFeeCents: null });
    expect(c.title).toContain("your delivery");
    expect(c.lines.join(" ")).not.toContain("null");
    expect(c.lines.join(" ")).not.toContain("undefined");
  });

  it("tells someone whose goods a driver is holding that we know", () => {
    // The frightening case, and the one where silence is worst.
    const c = deliveryStalledCopy({ what: "Glass", dropoff: null, kind: "package_with_driver" });
    expect(`${c.title} ${c.lines.join(" ")}`).toMatch(/collected|driver/i);
    expect(c.lines.join(" ")).toMatch(/today|until it is delivered|returned/i);
  });
});

describe("the customer half is actually wired in", () => {
  it("a stalled job now tells the customer, not only the owner", () => {
    // Every one of the nine notifications for the 6 Sept guest job went to the
    // owner. This is the call that was missing.
    const src = read("lib/delivery/notify.ts");
    expect(src).toContain("notifyCustomerOfDeliveryProblem(deliveryId, settled)");
    // The owner's own email must still go first.
    expect(src.indexOf("sendDeliveryStallEmail")).toBeLessThan(
      src.indexOf("notifyCustomerOfDeliveryProblem(deliveryId, settled)"),
    );
  });

  it("an expired request tells the customer too", () => {
    const src = read("app/api/cron/notifications/route.ts");
    expect(src).toContain("notifyCustomerOfExpiry");
  });

  it("email is spent only where silence would be total", () => {
    // M41/M167: guest mail must not be spent on every quote in a bidding war,
    // because the free tier is shared with Supabase auth mail. A stall is at
    // most one message per job, so the rule is "push reached nobody, or there
    // is no account at all" — not "always".
    const src = read("lib/delivery/notify-requests.ts");
    expect(src).toContain("reached === 0 || !f.customerId");
    expect(src).toContain("pushToCustomer");
  });

  it("the preview endpoint invents no jobs", () => {
    // The whole point: read every message without putting fake work in front
    // of real drivers.
    const src = read("app/api/admin/alert-preview/route.ts");
    expect(src).toContain("ALERT_SAMPLES");
    expect(src).toContain("[SAMPLE]");
    for (const table of ["delivery_requests", "bookings", "orders", "deliveries"]) {
      expect(src, `preview touches ${table}`).not.toContain(`from("${table}")`);
    }
    // Admin cookie, and rate limited even behind it, because sending costs
    // real messages on a real number.
    expect(src).toContain("verifySession");
    expect(src).toContain("admin-alert-preview");
  });
});
