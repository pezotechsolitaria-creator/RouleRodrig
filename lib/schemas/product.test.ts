import { describe, expect, it } from "vitest";
import { productSchema } from "./product";

const valid = {
  name: "Wild Honey 500g",
  description: "Raw local honey",
  price: "19.99",
  categoryId: null,
  sku: "",
  stockQuantity: 5,
  status: "active" as const,
};

describe("productSchema", () => {
  it("accepts a well-formed product", () => {
    expect(productSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty name", () => {
    const r = productSchema.safeParse({ ...valid, name: "  " });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid price (reuses the exact review-flagged boundary case)", () => {
    expect(productSchema.safeParse({ ...valid, price: "not-a-number" }).success).toBe(false);
    expect(productSchema.safeParse({ ...valid, price: "-5" }).success).toBe(false);
  });

  it("accepts the exact float-precision boundary value from the M2 review", () => {
    // Confirms the schema delegates to toCents(), not a naive parseFloat.
    const r = productSchema.safeParse({ ...valid, price: "9.995" });
    expect(r.success).toBe(true);
  });

  it("rejects negative or non-integer stock quantity", () => {
    expect(productSchema.safeParse({ ...valid, stockQuantity: -1 }).success).toBe(false);
    expect(productSchema.safeParse({ ...valid, stockQuantity: 1.5 }).success).toBe(false);
  });

  it("rejects an invalid status value (only draft/active are user-settable)", () => {
    expect(productSchema.safeParse({ ...valid, status: "archived" }).success).toBe(false);
    expect(productSchema.safeParse({ ...valid, status: "published" }).success).toBe(false);
  });

  it("rejects a malformed categoryId", () => {
    expect(productSchema.safeParse({ ...valid, categoryId: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts an empty/null categoryId (category is optional)", () => {
    expect(productSchema.safeParse({ ...valid, categoryId: null }).success).toBe(true);
    expect(productSchema.safeParse({ ...valid, categoryId: "" }).success).toBe(true);
  });
});
