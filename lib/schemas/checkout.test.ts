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
  it("rejects card/PayPal providers — marketplace is cash/bank/QR only", () => {
    for (const provider of ["paypal", "card", "credit_card", "stripe"]) {
      expect(
        checkoutSchema.safeParse({ ...base, provider }).success,
        `provider "${provider}" must never be accepted for a marketplace order`,
      ).toBe(false);
    }
  });

  it("accepts the three permitted marketplace providers", () => {
    for (const provider of ["cash", "mcb_juice", "manual"]) {
      expect(checkoutSchema.safeParse({ ...base, provider }).success, provider).toBe(true);
    }
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
