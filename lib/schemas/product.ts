import { z } from "zod";
import { toCents } from "@/lib/money";

// Single source of truth for "what is a valid product" — used by the React
// Hook Form resolver on the client AND re-validated server-side in the API
// route. Client-side validation is a UX convenience only; the server always
// re-runs this schema against the raw request body, since a client-side-only
// check is trivially bypassed by anyone hitting the API directly.
export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required.").max(200, "Keep it under 200 characters."),
  description: z.string().trim().max(2000, "Keep it under 2000 characters.").optional().or(z.literal("")),
  // Decimal string from the form (e.g. "9.99") — validated via the same
  // toCents() used for onboarding, so a value the form accepts is guaranteed
  // to convert cleanly server-side too.
  price: z.string().refine((v) => toCents(v) !== null, "Enter a valid price."),
  categoryId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  sku: z.string().trim().max(64, "Keep it under 64 characters.").optional().or(z.literal("")),
  stockQuantity: z.coerce
    .number({ error: "Enter a valid quantity." })
    .int("Quantity must be a whole number.")
    .min(0, "Quantity must be zero or greater."),
  // "draft" = hidden from the storefront, still fully editable; "active" =
  // live once the merchant is approved. Archiving (soft-delete) is a
  // separate action, not a status a merchant picks in this form.
  status: z.enum(["draft", "active"]),
});

export type ProductInput = z.infer<typeof productSchema>;

export function parsedPriceCents(input: ProductInput): number {
  const cents = toCents(input.price);
  if (cents === null) throw new Error("invariant: price already validated by productSchema");
  return cents;
}
