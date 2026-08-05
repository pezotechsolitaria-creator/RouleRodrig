import { z } from "zod";

export const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
});

export const checkoutSchema = z.object({
  storeId: z.string().uuid(),
  items: z.array(cartItemSchema).min(1, "Your cart is empty.").max(50, "Too many items in one order."),
  customerName: z.string().trim().min(1, "Your name is required.").max(200),
  customerPhone: z.string().trim().min(1, "A phone number is required.").max(40),
  fulfillment: z.enum(["pickup", "delivery"]),
  notes: z.string().trim().max(1000).optional(),
  // Marketplace orders are cash / bank transfer / merchant QR only. PayPal and
  // cards are reserved for vehicle rentals and place bookings and must never be
  // accepted here — dropping the button alone would not be enough, since this
  // schema and the create_order() RPC's own whitelist are what a hand-crafted
  // POST actually has to get past. `manual` stays for merchant-recorded
  // offline settlement; `mcb_juice` is the QR rail.
  provider: z.enum(["cash", "mcb_juice", "manual"]),
});

export const cartResolveSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(50),
});
