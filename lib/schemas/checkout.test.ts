import { describe, expect, it } from "vitest";
import { checkoutSchema, cartResolveSchema } from "./checkout";

const base = {
  storeId: "5a92bdf0-17c8-4181-886b-aa7cd5d1c353",
  items: [{ variantId: "06469e6e-5b9a-4444-bddc-250685197e85", quantity: 1 }],
  customerName: "Test",
  customerPhone: "+230 5000 0000",
  fulfillment: "pickup" as const,
  provider: "cash" as const,
};

describe("checkoutSchema", () => {
  it("accepts a well-formed order", () => {
    expect(checkoutSchema.safeParse(base).success).toBe(true);
  });

  // Quantity tampering — all of these were attempted live against the real
  // API during the M5 adversarial pass and rejected with 400.
  it("rejects zero, negative, fractional, and absurd quantities", () => {
    for (const quantity of [0, -5, 1.5, 101, 99999]) {
      const result = checkoutSchema.safeParse({ ...base, items: [{ ...base.items[0], quantity }] });
      expect(result.success, `quantity ${quantity} should be rejected`).toBe(false);
    }
  });

  it("rejects a non-UUID variant id", () => {
    expect(checkoutSchema.safeParse({ ...base, items: [{ variantId: "not-a-uuid", quantity: 1 }] }).success).toBe(false);
  });

  it("rejects an empty cart and an over-long cart", () => {
    expect(checkoutSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    const many = Array.from({ length: 51 }, () => base.items[0]);
    expect(checkoutSchema.safeParse({ ...base, items: many }).success).toBe(false);
  });

  it("rejects unknown payment providers and fulfillment modes", () => {
    expect(checkoutSchema.safeParse({ ...base, provider: "free" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, fulfillment: "teleport" }).success).toBe(false);
  });

  // Regression guard for the M5.1 P0. Marketplace orders take cash / bank
  // transfer / merchant QR only — PayPal and cards belong exclusively to the
  // vehicle-rental and place-booking flows. This is enforced in three places
  // (this schema, the create_order() RPC whitelist, and the checkout UI);
  // dropping the button alone would leave a hand-crafted POST working, which is
  // exactly the hole this test exists to keep closed.
  it("rejects card/PayPal providers — cards belong to vehicle rentals only", () => {
    for (const provider of ["paypal", "card", "credit_card", "stripe"]) {
      expect(
        checkoutSchema.safeParse({ ...base, provider }).success,
        `provider "${provider}" must never be accepted for a marketplace order`,
      ).toBe(false);
    }
  });

  // MCB Juice was removed as a merchant payment method by a later architecture
  // update; marketplace payments are Cash and Direct Bank Transfer only.
  it("rejects mcb_juice — removed as a merchant payment method", () => {
    expect(checkoutSchema.safeParse({ ...base, provider: "mcb_juice" }).success).toBe(false);
  });

  it("accepts the permitted marketplace providers", () => {
    for (const provider of ["cash", "bank_transfer", "manual"]) {
      expect(checkoutSchema.safeParse({ ...base, provider }).success, provider).toBe(true);
    }
  });

  // Rule 5: three delivery choices, and GPS is mandatory for both delivery
  // modes because the RR team and a customer's own driver both need it.
  // Since M7 rr_delivery additionally needs a zone, because the zone is what
  // sets the fee.
  const ZONE = "d23dd12a-a1fc-40be-832f-e38d9df88868";
  const gps = { deliveryLat: -19.7, deliveryLng: 63.4 };

  it("requires GPS for both delivery modes but not for pickup", () => {
    expect(checkoutSchema.safeParse({ ...base, fulfillment: "pickup" }).success).toBe(true);
    for (const fulfillment of ["customer_delivery", "rr_delivery"]) {
      const zone = fulfillment === "rr_delivery" ? { deliveryZoneId: ZONE } : {};
      expect(
        checkoutSchema.safeParse({ ...base, fulfillment, ...zone }).success,
        `${fulfillment} without GPS`,
      ).toBe(false);
      expect(
        checkoutSchema.safeParse({ ...base, fulfillment, ...zone, ...gps }).success,
        `${fulfillment} with GPS`,
      ).toBe(true);
    }
  });

  // A customer who never picks an area must not reach create_order at all: the
  // RPC would reject it anyway (RR005), but failing here gives a usable message
  // instead of a round-trip.
  it("requires a delivery zone for rr_delivery, and only for rr_delivery", () => {
    expect(checkoutSchema.safeParse({ ...base, fulfillment: "rr_delivery", ...gps }).success).toBe(false);
    expect(
      checkoutSchema.safeParse({ ...base, fulfillment: "rr_delivery", ...gps, deliveryZoneId: ZONE }).success,
    ).toBe(true);
    // Own driver and pickup are free, so no zone is needed.
    expect(checkoutSchema.safeParse({ ...base, fulfillment: "customer_delivery", ...gps }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...base, fulfillment: "pickup" }).success).toBe(true);
  });

  it("rejects a delivery zone that is not a uuid", () => {
    expect(
      checkoutSchema.safeParse({ ...base, fulfillment: "rr_delivery", ...gps, deliveryZoneId: "'; drop table--" })
        .success,
    ).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    const d = { fulfillment: "rr_delivery" as const, deliveryZoneId: ZONE };
    expect(checkoutSchema.safeParse({ ...base, ...d, deliveryLat: 91, deliveryLng: 0 }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, ...d, deliveryLat: 0, deliveryLng: 181 }).success).toBe(false);
  });

  it("strips a client-supplied delivery fee — the server derives it", () => {
    const parsed = checkoutSchema.parse({
      ...base, fulfillment: "rr_delivery", ...gps, deliveryZoneId: ZONE,
      deliveryFee: 0, delivery_fee: 0, total: 1,
    });
    expect(parsed).not.toHaveProperty("deliveryFee");
    expect(parsed).not.toHaveProperty("delivery_fee");
    expect(parsed).not.toHaveProperty("total");
  });

  it("requires a name and phone", () => {
    expect(checkoutSchema.safeParse({ ...base, customerName: "" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, customerPhone: "   " }).success).toBe(false);
  });

  // Price tampering: extra client-supplied price/total fields are simply not
  // part of the schema's output — create_order() re-derives every amount from
  // the DB, so an injected price can never reach the order.
  it("strips any client-supplied price or total fields", () => {
    const parsed = checkoutSchema.parse({ ...base, total: 1, subtotal: 1, items: [{ ...base.items[0], price: 1 }] });
    expect(parsed).not.toHaveProperty("total");
    expect(parsed).not.toHaveProperty("subtotal");
    expect(parsed.items[0]).not.toHaveProperty("price");
    expect(Object.keys(parsed.items[0])).toEqual(["variantId", "quantity"]);
  });
});

describe("cartResolveSchema", () => {
  it("accepts a valid cart and rejects a malformed one", () => {
    expect(cartResolveSchema.safeParse({ items: base.items }).success).toBe(true);
    expect(cartResolveSchema.safeParse({ items: [] }).success).toBe(false);
    expect(cartResolveSchema.safeParse({ items: [{ variantId: "x", quantity: 1 }] }).success).toBe(false);
  });
});
