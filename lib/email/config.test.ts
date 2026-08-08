import { describe, it, expect } from "vitest";
import { DEFAULT_EMAIL_CONFIG, mergeEmailConfig, routeFor } from "./config";
import { ALL_EMAIL_TYPES, EMAIL_TYPES, emailPriority, placeEmailType, vehicleEmailType } from "./types";

// ── Configuration and routing ───────────────────────────────────────────────

describe("provider routing", () => {
  it("sends every ticketing type to Resend by default, and everything else to Brevo", () => {
    const cfg = DEFAULT_EMAIL_CONFIG;
    for (const type of ALL_EMAIL_TYPES) {
      const expected = EMAIL_TYPES[type].category === "ticketing" ? "resend" : "brevo";
      expect(routeFor(cfg, type), `${type} should route to ${expected}`).toBe(expected);
    }
  });

  it("lets a single type be re-pointed without touching any other", () => {
    // The brief's explicit requirement: ticket_qr_delivery → Brevo must be a
    // config edit, not a code change.
    const cfg = mergeEmailConfig({ routing: { ticket_qr_delivery: "brevo" } });
    expect(routeFor(cfg, "ticket_qr_delivery")).toBe("brevo");
    expect(routeFor(cfg, "ticket_order_confirmation")).toBe("resend");
    expect(routeFor(cfg, "marketplace_order_confirmation")).toBe("brevo");
  });

  it("moves everything unlisted at once when the default provider changes", () => {
    const cfg = mergeEmailConfig({ defaultProvider: "resend" });
    expect(routeFor(cfg, "marketplace_order_confirmation")).toBe("resend");
    expect(routeFor(cfg, "scooter_booking_confirmation")).toBe("resend");
  });

  it("falls back to the default provider for an unknown type rather than inventing one", () => {
    expect(routeFor(DEFAULT_EMAIL_CONFIG, "something_we_have_not_built_yet")).toBe("brevo");
  });
});

describe("mergeEmailConfig", () => {
  it("returns the defaults for missing, null or non-object input", () => {
    expect(mergeEmailConfig(null)).toEqual(DEFAULT_EMAIL_CONFIG);
    expect(mergeEmailConfig(undefined)).toEqual(DEFAULT_EMAIL_CONFIG);
    expect(mergeEmailConfig("garbage")).toEqual(DEFAULT_EMAIL_CONFIG);
    expect(mergeEmailConfig(42)).toEqual(DEFAULT_EMAIL_CONFIG);
  });

  it("applies a partial patch without dropping unrelated fields", () => {
    const cfg = mergeEmailConfig({ providers: { brevo: { dailyLimit: 500 } } });
    expect(cfg.providers.brevo.dailyLimit).toBe(500);
    expect(cfg.providers.brevo.enabled).toBe(true);
    expect(cfg.providers.resend.dailyLimit).toBe(100);
    expect(cfg.thresholds).toEqual(DEFAULT_EMAIL_CONFIG.thresholds);
  });

  it("accepts an explicit null limit as 'no ceiling' (a paid plan)", () => {
    const cfg = mergeEmailConfig({ providers: { brevo: { dailyLimit: null } } });
    expect(cfg.providers.brevo.dailyLimit).toBeNull();
  });

  it("rejects nonsense values rather than producing NaN that would disable quota checks", () => {
    // This is the failure mode the explicit merge exists to prevent: a
    // dailyLimit of undefined/NaN compares false in every direction, silently
    // turning every quota check off.
    const cfg = mergeEmailConfig({
      providers: { brevo: { dailyLimit: "lots", enabled: "yes" } },
      thresholds: { warning: "high" },
      retry: { maxAttempts: 0 },
    });
    expect(cfg.providers.brevo.dailyLimit).toBe(300);
    expect(cfg.providers.brevo.enabled).toBe(true);
    expect(cfg.thresholds.warning).toBe(80);
    // maxAttempts 0 would stop all mail; clamped to at least one attempt.
    expect(cfg.retry.maxAttempts).toBe(1);
  });

  it("refuses a negative limit", () => {
    expect(mergeEmailConfig({ providers: { resend: { dailyLimit: -5 } } }).providers.resend.dailyLimit).toBe(100);
  });

  it("ignores a routing entry naming a provider that does not exist", () => {
    const cfg = mergeEmailConfig({ routing: { marketplace_order_confirmation: "mailchimp" } });
    expect(routeFor(cfg, "marketplace_order_confirmation")).toBe("brevo");
  });

  it("lets an explicit null clear a routing override back to the default", () => {
    const cfg = mergeEmailConfig({ routing: { ticket_qr_delivery: null } });
    expect(routeFor(cfg, "ticket_qr_delivery")).toBe("brevo");
  });

  it("keeps a saved config stable through a save/reload round trip", () => {
    const once = mergeEmailConfig({ reserves: { ticketing: { daily: 25, monthly: 250 } } });
    const twice = mergeEmailConfig(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(twice.reserves.ticketing.daily).toBe(25);
    expect(twice.reserves.ticketing.monthly).toBe(250);
  });

  it("supports the owner's stated starting point of a 300 reserve", () => {
    const cfg = mergeEmailConfig({ reserves: { ticketing: { monthly: 300 } } });
    expect(cfg.reserves.ticketing.monthly).toBe(300);
  });
});

describe("email type registry", () => {
  it("gives every type a category and a priority", () => {
    for (const type of ALL_EMAIL_TYPES) {
      expect(EMAIL_TYPES[type].category, type).toBeTruthy();
      expect(EMAIL_TYPES[type].priority, type).toBeTruthy();
    }
  });

  it("keeps the emails a customer cannot recover from at critical", () => {
    // A ticket QR IS the admission and a password reset is the only way back
    // into an account. If either is ever demoted, quota pressure could throttle
    // it — so the invariant is asserted, not merely intended.
    expect(emailPriority("ticket_qr_delivery")).toBe("critical");
    expect(emailPriority("password_reset")).toBe("critical");
    expect(emailPriority("email_verification")).toBe("critical");
    expect(emailPriority("marketplace_payment_confirmation")).toBe("critical");
  });

  it("keeps marketing at the bottom so it is throttled first", () => {
    expect(emailPriority("newsletter")).toBe("low");
    expect(emailPriority("promotion")).toBe("low");
    expect(emailPriority("campaign")).toBe("low");
  });

  it("routes an unknown type to safe defaults instead of throwing inside a send", () => {
    expect(emailPriority("not_a_real_type")).toBe("normal");
  });
});

describe("domain resolution", () => {
  it("splits cars from scooters, defaulting to scooter exactly as pricing does", () => {
    expect(vehicleEmailType("booking_confirmation", "car")).toBe("car_booking_confirmation");
    expect(vehicleEmailType("booking_confirmation", "scooter")).toBe("scooter_booking_confirmation");
    expect(vehicleEmailType("booking_confirmation", null)).toBe("scooter_booking_confirmation");
    expect(vehicleEmailType("booking_confirmation", undefined)).toBe("scooter_booking_confirmation");
    expect(vehicleEmailType("pickup_reminder", "car")).toBe("car_pickup_reminder");
  });

  it("splits accommodation from activities on the place category", () => {
    expect(placeEmailType("booking_confirmation", "hotel")).toBe("accommodation_booking_confirmation");
    expect(placeEmailType("booking_confirmation", "restaurant")).toBe("activity_booking_confirmation");
    expect(placeEmailType("booking_confirmation", null)).toBe("activity_booking_confirmation");
    // Accommodation names its reminder after the check-in it is reminding about.
    expect(placeEmailType("reminder", "hotel")).toBe("accommodation_checkin_reminder");
    expect(placeEmailType("reminder", "boat")).toBe("activity_reminder");
  });

  it("only produces types that exist in the registry", () => {
    const produced = [
      vehicleEmailType("booking_confirmation", "car"),
      vehicleEmailType("feedback_request", "scooter"),
      vehicleEmailType("booking_status", "car"),
      placeEmailType("booking_confirmation", "hotel"),
      placeEmailType("reminder", "hotel"),
      placeEmailType("status", "restaurant"),
      placeEmailType("feedback_request", "hotel"),
    ];
    for (const t of produced) expect(ALL_EMAIL_TYPES, t).toContain(t);
  });
});
