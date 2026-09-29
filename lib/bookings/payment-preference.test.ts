import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePaymentPreference, paymentPreferenceSchema, PAYMENT_PREFERENCES } from "./payment-preference";

// M220 — the customer can SAY how they would like to pay. Optional, null by
// default, and nothing outside the table's CHECK gets through.

describe("the payment preference a request may carry", () => {
  it("accepts the two values the table allows", () => {
    expect(parsePaymentPreference("online")).toEqual({ ok: true, value: "online" });
    expect(parsePaymentPreference("in_person")).toEqual({ ok: true, value: "in_person" });
  });

  it("is optional: absent or null is stored as null, not as 'online'", () => {
    // Every request sent before M220, and any client that never learns the
    // field, must go through exactly as it did.
    expect(parsePaymentPreference(undefined)).toEqual({ ok: true, value: null });
    expect(parsePaymentPreference(null)).toEqual({ ok: true, value: null });
  });

  it("refuses junk with a sentence, not a 500 from the CHECK", () => {
    for (const junk of ["cash", "IN_PERSON", "", " online", 1, true, {}, ["online"]]) {
      const r = parsePaymentPreference(junk);
      expect(r.ok, JSON.stringify(junk)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/how you would like to pay/);
    }
  });

  it("matches the migration's CHECK exactly", () => {
    const sql = readFileSync(
      join(__dirname, "..", "..", "supabase", "migrations", "20260928213059_m220_a_booking_paid_in_person.sql"),
      "utf8",
    );
    expect(sql).toContain("payment_preference in ('online', 'in_person')");
    expect([...PAYMENT_PREFERENCES]).toEqual(["online", "in_person"]);
    expect(paymentPreferenceSchema.safeParse("in_person").success).toBe(true);
  });
});

describe("both request routes validate it and store what was said", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", ...p), "utf8");

  for (const route of [
    ["app", "api", "bookings", "route.ts"],
    ["app", "api", "place-bookings", "route.ts"],
  ]) {
    const file = route.join("/");
    it(file, () => {
      const src = read(...route);
      expect(src).toContain('import { parsePaymentPreference } from "@/lib/bookings/payment-preference"');
      expect(src).toContain("parsePaymentPreference(body.payment_preference)");
      expect(src).toMatch(/if \(!preference\.ok\) \{\s*return NextResponse\.json\(\{ error: preference\.error \}, \{ status: 400 \}\)/);
      expect(src).toContain("payment_preference: preference.value,");
      // Refused before anything is read or written.
      expect(src.indexOf("parsePaymentPreference(body.payment_preference)")).toBeLessThan(
        src.indexOf(".insert([record])"),
      );
    });
  }

  it("the forms send it, online by default", () => {
    const rental = read("components", "BookingSection.tsx");
    expect(rental).toContain('payment_preference: "online" as PaymentPreference');
    expect(rental).toContain("payment_preference: form.payment_preference,");
    const place = read("components", "PlaceBookingModal.tsx");
    expect(place).toContain('useState<PaymentPreference>("online")');
    expect(place).toContain("payment_preference: hasPrice ? payment : null,");
  });

  it("keeps the lock-it-in-now PayPal for online, not for a cash request", () => {
    const rental = read("components", "BookingSection.tsx");
    expect(rental).toMatch(
      /!depositPaid && lastBooking\?\.bookingId && \(lastBooking\.deposit \?\? 0\) > 0 && !lastBooking\.inPerson/,
    );
  });

  it("carries every new word in all three languages", async () => {
    const { default: translations } = await import("../i18n");
    for (const lang of ["en", "fr", "cr"] as const) {
      const b = translations[lang].booking;
      const p = translations[lang].placeBooking;
      for (const v of [b.payChoiceLabel, b.payChoiceOnline, b.payChoiceInPerson, b.successDescInPerson, p.payChoiceOnline, p.payChoiceInPerson, p.inPersonNote, p.totalInPerson, p.successInPerson]) {
        expect(typeof v === "string" && v.trim().length > 0, `${lang}: ${v}`).toBe(true);
      }
    }
    // A request, not an outcome: the owner may still ask for the deposit (M220).
    expect(translations.en.booking.successDescInPerson).toBe(
      "Thanks — we'll tell you whether you can pay in person or need to pay online.",
    );
  });
});
