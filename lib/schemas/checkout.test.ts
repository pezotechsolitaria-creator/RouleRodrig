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
