import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_EMAIL_TYPES,
  EMAIL_TYPES,
  emailCategory,
  emailPriority,
  liveEmailTypes,
} from "./types";

// ── A RIDE HAS TO TELL SOMEBODY ─────────────────────────────────────────────
//
// Booking a taxi or an airport transfer was the one purchase on this platform
// that emailed nobody. /api/rides wrote the row and returned a reference: the
// customer who typed their address got no confirmation, and the owner learned
// about the job only if he happened to open /admin/rides. Bookings, place
// bookings and checkout all mailed somebody; this one did not, and nothing
// failed — which is exactly why it survived.
//
// So the assertions below are about the OUTCOME, not the plumbing: given a ride
// request, which emails leave, to whom, carrying what. Two of the three failure
// modes this guards against are invisible in production:
//
//   * the call being dropped from the route (silent — the ride still books)
//   * a type not registered in lib/email/types.ts (silent — emailTypeMeta()
//     answers operational/normal for a name that does not exist, so the mail
//     sends at the wrong quota priority rather than throwing)
//
// The router is mocked, so nothing here needs a provider, a database or a key.

type Captured = {
  type: string;
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
};

const sent: Captured[] = [];

vi.mock("./send", () => ({
  sendTransactionalEmail: async (input: Captured) => {
    sent.push(input);
    return { ok: true };
  },
}));

const ROOT = join(__dirname, "..", "..");

const RIDE = {
  reference: "RR-4F2A91",
  service: "airport" as const,
  whenKind: "scheduled",
  scheduledAt: "2026-09-03T10:30:00+04:00",
  pickup: "Plaine Corail Airport",
  dropoff: "Mourouk Ebony Hotel",
  passengers: 3,
  luggage: 2,
  price: 180000, // minor units, exactly as create_ride_request returns them
  flightRef: "MK 234",
  meetGreet: true,
  notes: "Two large cases",
  name: "Marie Perrine",
  phone: "+230 5123 4567",
  email: "marie@example.com",
};

const ofType = (type: string): Captured | undefined =>
  sent.find((s) => s.type === type);

beforeEach(() => {
  sent.length = 0;
});

describe("the emails a ride request sends", () => {
  it("confirms to the customer and alerts the owner", async () => {
    const { sendRideEmails } = await import("@/lib/email");
    const result = await sendRideEmails({ ...RIDE });
    expect(result.customer, "the customer gave an address and was not written to").toBe(true);
    expect(result.owner, "nobody told the owner a ride came in").toBe(true);
    expect(sent.map((s) => s.type).sort()).toEqual([
      "owner_ride_alert",
      "ride_request_confirmation",
    ]);
  });

  it("tells the customer what they asked for, and that it is not confirmed yet", async () => {
    const { sendRideEmails } = await import("@/lib/email");
    await sendRideEmails({ ...RIDE });
    const customer = ofType("ride_request_confirmation");
    expect(customer, "no customer confirmation was sent").toBeTruthy();
    expect(customer!.to).toBe(RIDE.email);
    // What was requested — the whole point of a confirmation is that they can
    // check it and tell us we got the address wrong.
    expect(customer!.html).toContain("RR-4F2A91");
    expect(customer!.html).toContain("Airport transfer");
    expect(customer!.html).toContain("Plaine Corail Airport");
    expect(customer!.html).toContain("Mourouk Ebony Hotel");
    expect(customer!.html).toContain("MK 234");
    expect(customer!.html).toMatch(/10:30/);
    expect(customer!.html).toContain("Rs 1,800");
    // A REQUEST, not a booked car, and how they will actually be reached.
    expect(customer!.html).toMatch(/request/i);
    expect(customer!.html).toContain("+230 5123 4567");
    // Bilingual like every other customer-facing email here.
    expect(customer!.html, "customer email is not bilingual").toContain("FRANÇAIS");
  });

  it("gives the owner everything needed to act, in English", async () => {
    const { sendRideEmails } = await import("@/lib/email");
    await sendRideEmails({ ...RIDE });
    const owner = ofType("owner_ride_alert");
    expect(owner, "no owner alert was sent").toBeTruthy();
    expect(owner!.to).not.toBe(RIDE.email);
    expect(owner!.html).toContain("Airport transfer");
    expect(owner!.html).toContain("Plaine Corail Airport");
    expect(owner!.html).toContain("Mourouk Ebony Hotel");
    expect(owner!.html).toMatch(/10:30/);
    expect(owner!.html).toContain("Rs 1,800");
    expect(owner!.html).toContain("Marie Perrine");
    expect(owner!.html).toContain("+230 5123 4567");
    expect(owner!.html).toContain("marie@example.com");
    expect(owner!.html).toContain("Two large cases");
    // Owner alerts are English only — see sendPaymentReportedAlert.
    expect(owner!.html, "the owner alert carries a French half").not.toContain("FRANÇAIS");
  });

  it("does not invent a customer email when the field was left blank", async () => {
    // The address is OPTIONAL on /taxi/book and most islanders leave it empty.
    // The owner must still hear about the ride.
    const { sendRideEmails } = await import("@/lib/email");
    const result = await sendRideEmails({ ...RIDE, email: null });
    expect(result.customer).toBe(false);
    expect(sent.map((s) => s.type)).toEqual(["owner_ride_alert"]);
  });

  it("keys both sends on the reference, so a retry cannot mail twice", async () => {
    const { sendRideEmails } = await import("@/lib/email");
    await sendRideEmails({ ...RIDE });
    expect(ofType("ride_request_confirmation")!.idempotencyKey).toBe(
      "ride_request_confirmation:RR-4F2A91",
    );
    expect(ofType("owner_ride_alert")!.idempotencyKey).toBe("owner_ride_alert:RR-4F2A91");
    // Support lookup: "show me every email about this ride".
    for (const s of sent) {
      expect(s.relatedType).toBe("ride");
      expect(s.relatedId).toBe("RR-4F2A91");
    }
  });

  it("describes a private day hire instead of printing null at it", async () => {
    // M98: `private` is the one service with genuinely nowhere to go, and an
    // unpriceable ride is still a ride worth taking.
    const { sendRideEmails } = await import("@/lib/email");
    await sendRideEmails({
      ...RIDE,
      service: "private",
      dropoff: null,
      price: null,
      flightRef: null,
      meetGreet: false,
    });
    const owner = ofType("owner_ride_alert")!;
    expect(owner.html).toContain("Private hire");
    expect(owner.html).toContain("no fixed destination");
    expect(owner.html).toContain("Price on request");
    expect(owner.html, "a missing field leaked into the email").not.toMatch(
      /\b(null|undefined|NaN)\b/,
    );
  });
});

describe("the enquiry the owner never heard about", () => {
  it("alerts the owner even when the enquiry left no email address", async () => {
    // A phone-only enquiry is still a lead — and the one nobody can chase from
    // an inbox, so it is the last one that should be dropped.
    const { sendOwnerEnquiryAlert } = await import("@/lib/email");
    const ok = await sendOwnerEnquiryAlert({
      name: "Jean Baptiste",
      email: null,
      phone: "+230 5999 0000",
      message: "Do you have a car for Saturday?",
    });
    expect(ok).toBe(true);
    const alert = ofType("owner_enquiry_alert");
    expect(alert, "the owner was not told about the enquiry").toBeTruthy();
    expect(alert!.html).toContain("Jean Baptiste");
    expect(alert!.html).toContain("+230 5999 0000");
    expect(alert!.html).toContain("Do you have a car for Saturday?");
    expect(alert!.html).not.toContain("FRANÇAIS");
  });

  it("does not let a second, different enquiry share the first one's key", async () => {
    // The idempotency key is what Postgres enforces, so a key collision is a
    // dropped lead that reports success. enquiry_ack keys on address + day,
    // which is right for an auto-reply and wrong here: two different questions
    // the same afternoon are two things the owner has to answer.
    const { sendOwnerEnquiryAlert } = await import("@/lib/email");
    const base = { name: "Jean", email: "jean@example.com", phone: null };
    await sendOwnerEnquiryAlert({ ...base, message: "A car for Saturday?" });
    await sendOwnerEnquiryAlert({ ...base, message: "And a boat trip on Sunday?" });
    await sendOwnerEnquiryAlert({ ...base, message: "A car for Saturday?" });
    const keys = sent
      .filter((s) => s.type === "owner_enquiry_alert")
      .map((s) => s.idempotencyKey);
    expect(keys[0], "two different enquiries collapsed into one alert").not.toBe(keys[1]);
    // ...while the same form submitted twice is still one alert.
    expect(keys[2], "a double-tapped Send would mail the owner twice").toBe(keys[0]);
  });
});

describe("the new types are wired end to end, not just declared", () => {
  const NEW_TYPES = [
    "ride_request_confirmation",
    "owner_ride_alert",
    "owner_enquiry_alert",
  ] as const;

  it("registers each one with a category and a priority, and not as planned", () => {
    for (const t of NEW_TYPES) {
      expect(ALL_EMAIL_TYPES, `${t} is missing from the registry`).toContain(t);
      expect(EMAIL_TYPES[t].category, t).toBeTruthy();
      expect(EMAIL_TYPES[t].priority, t).toBeTruthy();
      expect("planned" in EMAIL_TYPES[t], `${t} is marked planned but code sends it`).toBe(false);
      expect(liveEmailTypes(), `${t} is not reported as live`).toContain(t);
    }
  });

  it("resolves to the meta chosen for it rather than the unknown-type fallback", () => {
    // emailTypeMeta() answers operational/normal for a name nobody registered,
    // so a missing entry does not throw — it silently routes the mail at the
    // wrong priority. These are the values chosen on purpose.
    expect(emailCategory("ride_request_confirmation")).toBe("ride");
    expect(emailPriority("ride_request_confirmation")).toBe("high");
    expect(emailPriority("owner_ride_alert")).toBe("high");
    expect(emailPriority("owner_enquiry_alert")).toBe("high");
  });
});

describe("the routes still send", () => {
  it("has /api/rides calling sendRideEmails after the ride is created", () => {
    // The regression this file exists for: the ride books, the reference comes
    // back, the customer sees a success screen, and nobody is emailed.
    const route = readFileSync(join(ROOT, "app", "api", "rides", "route.ts"), "utf8");
    expect(route, "/api/rides no longer emails anybody").toContain("sendRideEmails");
  });

  it("never lets a mail provider fail a taxi request", () => {
    const route = readFileSync(join(ROOT, "app", "api", "rides", "route.ts"), "utf8");
    expect(route, "the ride email is not wrapped in try/catch").toMatch(
      /try\s*\{\s*await sendRideEmails/,
    );
  });

  it("has /api/contact telling the owner as well as the customer", () => {
    const route = readFileSync(join(ROOT, "app", "api", "contact", "route.ts"), "utf8");
    expect(route).toContain("sendEnquiryAck");
    expect(route, "an enquiry is acknowledged but the owner is never told").toContain(
      "sendOwnerEnquiryAlert",
    );
  });
});
