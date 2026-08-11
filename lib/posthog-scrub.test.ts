import { describe, it, expect } from "vitest";
import { scrubPostHogEvent, scrubValue, scrubUrl } from "./posthog-scrub";
import type { CaptureResult } from "posthog-js";

// The point of this suite is the guarantee in lib/posthog-scrub.ts: that a
// future `posthog.capture("checkout", { phone, email, address })` cannot
// silently become analytics data. Each test names the leak it prevents.

function event(properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}) {
  return {
    uuid: "test-uuid",
    event: "test_event",
    properties,
    ...extra,
  } as CaptureResult;
}

function scrub(properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}) {
  return scrubPostHogEvent(event(properties, extra))!;
}

describe("scrubPostHogEvent — contact details", () => {
  it("redacts the fields a careless checkout capture would send", () => {
    const out = scrub({
      email: "marie@example.com",
      phone: "+23058355588",
      customer_name: "Marie Perrine",
      address: "12 Rue de la Plage, Port Mathurin",
      postcode: "74301",
    });

    expect(out.properties.email).toBe("[redacted]");
    expect(out.properties.phone).toBe("[redacted]");
    expect(out.properties.customer_name).toBe("[redacted]");
    expect(out.properties.address).toBe("[redacted]");
    expect(out.properties.postcode).toBe("[redacted]");
  });

  it("redacts name variants without eating entity names", () => {
    const out = scrub({
      name: "Marie",
      first_name: "Marie",
      last_name: "Perrine",
      // These are legitimate marketplace analytics and must survive.
      store_name: "Chez Jeanine",
      product_name: "Scooter 125cc",
      event_name: "Fête de la Mer",
    });

    expect(out.properties.name).toBe("[redacted]");
    expect(out.properties.first_name).toBe("[redacted]");
    expect(out.properties.last_name).toBe("[redacted]");
    expect(out.properties.store_name).toBe("Chez Jeanine");
    expect(out.properties.product_name).toBe("Scooter 125cc");
    expect(out.properties.event_name).toBe("Fête de la Mer");
  });
});

describe("scrubPostHogEvent — money and credentials", () => {
  it("redacts bank, card and payment fields", () => {
    const out = scrub({
      account_number: "000123456789",
      account_holder: "M Perrine",
      iban: "MU17BOMM0101101030300200000MUR",
      card: "4111111111111111",
      cvv: "123",
      payment_instructions: "call me",
      receipt: "receipts/abc.png",
    });

    for (const key of Object.keys(out.properties)) {
      expect(out.properties[key]).toBe("[redacted]");
    }
  });

  it("redacts secrets and tokens", () => {
    const out = scrub({
      password: "hunter2",
      api_key: "sk-live-123",
      authorization: "Bearer abc",
      auth_token: "abc",
      otp: "445566",
      cookie: "sb-access=1",
      token: "abc",
    });

    for (const key of Object.keys(out.properties)) {
      expect(out.properties[key]).toBe("[redacted]");
    }
  });
});

describe("scrubPostHogEvent — precise location", () => {
  it("redacts delivery coordinates that would identify a home", () => {
    const out = scrub({
      delivery_lat: -19.6833,
      delivery_lng: 63.4272,
      delivery_instructions: "blue gate next to the church",
    });

    expect(out.properties.delivery_lat).toBe("[redacted]");
    expect(out.properties.delivery_lng).toBe("[redacted]");
    expect(out.properties.delivery_instructions).toBe("[redacted]");
  });
});

describe("scrubPostHogEvent — legitimate analytics survive", () => {
  it("passes through the real custom events unchanged", () => {
    // These are the exact property shapes the app sends today.
    const out = scrub({
      item_count: 3,
      fulfillment_method: "delivery",
      payment_method: "cash",
      is_guest_checkout: true,
      scooter_id: "sc_123",
      rental_days: 4,
      has_partner_referral: true,
      has_deposit: false,
      store_id: "st_9",
      variant_id: "v_1",
      quantity: 2,
      place_id: "pl_4",
      place_category: "beach",
      event_store_id: "ev_7",
      ticket_count: 2,
      ticket_type_count: 1,
      source: "website",
      // merchant side
      business_category: "restaurant",
      product_id: "pr_2",
      order_id: "or_5",
      status: "ready",
      image_count: 3,
    });

    expect(out.properties).toMatchObject({
      business_category: "restaurant",
      product_id: "pr_2",
      order_id: "or_5",
      status: "ready",
      image_count: 3,
      item_count: 3,
      fulfillment_method: "delivery",
      payment_method: "cash",
      is_guest_checkout: true,
      scooter_id: "sc_123",
      rental_days: 4,
      has_partner_referral: true,
      has_deposit: false,
      store_id: "st_9",
      variant_id: "v_1",
      quantity: 2,
      place_id: "pl_4",
      place_category: "beach",
      event_store_id: "ev_7",
      ticket_count: 2,
      ticket_type_count: 1,
      source: "website",
    });
  });

  it("keeps boolean presence flags even when the key contains a deny word", () => {
    // Regression: `has_receipt` contains "receipt" and was being redacted, which
    // destroyed a real merchant analytics property. A boolean flag reveals that
    // something exists, never what it contains.
    const out = scrub({
      has_receipt: true,
      has_deposit: false,
      has_partner_referral: true,
      is_guest_checkout: true,
      has_logo: true,
    });

    expect(out.properties.has_receipt).toBe(true);
    expect(out.properties.has_deposit).toBe(false);
    expect(out.properties.has_partner_referral).toBe(true);
    expect(out.properties.is_guest_checkout).toBe(true);
    expect(out.properties.has_logo).toBe(true);
  });

  it("does not extend the flag exemption to non-boolean values", () => {
    // `has_email: "marie@example.com"` is not a flag, it is the data.
    const out = scrub({ has_email: "marie@example.com", has_phone: "+23058355588" });

    expect(out.properties.has_email).toBe("[redacted]");
    expect(out.properties.has_phone).toBe("[redacted]");
  });

  it("does not let a short deny-word eat a longer innocent key", () => {
    const out = scrub({ panel_id: "p1", pin_location: "north", nid_display: "x" });

    expect(out.properties.panel_id).toBe("p1");
    expect(out.properties.pin_location).toBe("north");
    expect(out.properties.nid_display).toBe("x");
  });
});

describe("scrubPostHogEvent — PostHog internal properties", () => {
  it("keeps $-prefixed keys so sessions and funnels keep working", () => {
    const out = scrub({
      $session_id: "sess_abc",
      $device_id: "dev_abc",
      $browser: "Chrome",
      $os: "Windows",
    });

    expect(out.properties.$session_id).toBe("sess_abc");
    expect(out.properties.$device_id).toBe("dev_abc");
    expect(out.properties.$browser).toBe("Chrome");
  });

  it("still sanitises the VALUES of internal properties", () => {
    const out = scrub({
      $current_url: "https://roulerodrig.com/manage-booking?email=marie@example.com",
      $elements_chain: 'a:attr__href="mailto:marie@example.com"text="Marie Perrine +23058355588"',
    });

    expect(String(out.properties.$current_url)).not.toContain("marie@example.com");
    expect(String(out.properties.$elements_chain)).not.toContain("marie@example.com");
    expect(String(out.properties.$elements_chain)).not.toContain("+23058355588");
  });

  it("redacts a booking reference wherever it appears", () => {
    const out = scrub({ $current_url: "https://roulerodrig.com/orders/track?ref=RR-A1B2C3" });
    expect(String(out.properties.$current_url)).not.toContain("RR-A1B2C3");
  });
});

describe("scrubPostHogEvent — person properties", () => {
  it("scrubs $set and $set_once, which persist against the profile", () => {
    const out = scrub({}, {
      $set: { email: "marie@example.com", plan: "free" },
      $set_once: { phone: "+23058355588", first_seen: "2026-01-01" },
    });

    expect(out.$set!.email).toBe("[redacted]");
    expect(out.$set!.plan).toBe("free");
    expect(out.$set_once!.phone).toBe("[redacted]");
    expect(out.$set_once!.first_seen).toBe("2026-01-01");
  });
});

describe("scrubPostHogEvent — nested and hostile payloads", () => {
  it("reaches sensitive keys nested inside objects and arrays", () => {
    const out = scrub({
      cart: { items: [{ sku: "abc", buyer: { email: "marie@example.com" } }] },
    });

    expect(JSON.stringify(out.properties)).not.toContain("marie@example.com");
    expect(JSON.stringify(out.properties)).toContain("abc");
  });

  it("strips query strings from hrefs nested in autocapture's $elements", () => {
    const out = scrub({
      $elements: [
        { tag_name: "a", attr__href: "https://roulerodrig.com/orders/track?ref=RR-A1B2C3" },
        { tag_name: "a", attr__href: "https://roulerodrig.com/login?token=sup3rsecret" },
      ],
    });

    const serialised = JSON.stringify(out.properties);
    expect(serialised).not.toContain("RR-A1B2C3");
    expect(serialised).not.toContain("sup3rsecret");
    // The route itself is still there — that is the analytics value.
    expect(serialised).toContain("/orders/track");
    expect(serialised).toContain("/login");
  });

  it("survives a deeply nested payload without hanging", () => {
    let deep: Record<string, unknown> = { email: "marie@example.com" };
    for (let i = 0; i < 40; i++) deep = { nested: deep };

    const out = scrub({ deep });
    expect(JSON.stringify(out.properties)).not.toContain("marie@example.com");
  });

  it("returns null for a null event", () => {
    expect(scrubPostHogEvent(null)).toBeNull();
  });
});

describe("scrubValue", () => {
  it("removes emails, international numbers, JWTs and booking refs", () => {
    expect(scrubValue("write to marie@example.com")).not.toContain("marie@example.com");
    expect(scrubValue("call +230 5835 5588")).not.toContain("5835");
    expect(scrubValue("RR-A1B2C3 confirmed")).toBe("RR-[redacted] confirmed");
    expect(
      scrubValue("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r"),
    ).toBe("[redacted]");
  });

  it("leaves ordinary analytics text alone", () => {
    expect(scrubValue("scooter_booking_requested")).toBe("scooter_booking_requested");
    expect(scrubValue("/explore")).toBe("/explore");
  });
});

describe("scrubUrl", () => {
  it("redacts sensitive query parameters but keeps the route", () => {
    const out = scrubUrl("https://roulerodrig.com/login?token=abc123&next=/orders");

    expect(out).toContain("/login");
    expect(out).toContain("next=");
    expect(out).not.toContain("abc123");
  });

  it("keeps a plain path untouched", () => {
    expect(scrubUrl("/explore")).toBe("/explore");
  });

  it("does not throw on an unparseable value", () => {
    expect(() => scrubUrl("::::")).not.toThrow();
  });
});
