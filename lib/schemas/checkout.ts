import { z } from "zod";

export const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
});

// Marketplace orders are Cash or Direct Bank Transfer only. PayPal, cards and
// MCB Juice are all absent by design — cards belong exclusively to the vehicle
// rental / place booking system, and Juice was removed as a merchant method.
// `manual` stays for a merchant recording an offline settlement themselves.
// This schema is one of THREE independent gates (with the create_order() RPC
// whitelist and a CHECK constraint on payments); the UI is not a gate at all.
export const PAYMENT_PROVIDERS = ["cash", "bank_transfer", "manual"] as const;

// pickup            — collect from the shop, no fee
// customer_delivery — the customer arranges their own driver, no fee
// rr_delivery       — the Roulé Rodrigues team delivers, platform fee applies
export const FULFILLMENT_METHODS = ["pickup", "customer_delivery", "rr_delivery"] as const;

export const checkoutSchema = z
  .object({
    storeId: z.string().uuid(),
    items: z.array(cartItemSchema).min(1, "Your cart is empty.").max(50, "Too many items in one order."),
    customerName: z.string().trim().min(1, "Your name is required.").max(200),
    customerPhone: z.string().trim().min(1, "A phone number is required.").max(40),
    fulfillment: z.enum(FULFILLMENT_METHODS),
    notes: z.string().trim().max(1000).optional(),
    provider: z.enum(PAYMENT_PROVIDERS),
    // GPS is the delivery address. Validated here for shape only — the RPC
    // re-checks presence and range, and is what actually decides.
    deliveryLat: z.number().min(-90).max(90).optional(),
    deliveryLng: z.number().min(-180).max(180).optional(),
    deliveryInstructions: z.string().trim().max(500).optional(),
    // Which region we are delivering to. Only the ID travels — the FEE is read
    // from delivery_zones server-side, so the client cannot price its own delivery.
    deliveryZoneId: z.string().uuid().optional(),
  })
  .refine(
    (v) => v.fulfillment === "pickup" || (v.deliveryLat !== undefined && v.deliveryLng !== undefined),
    { message: "Share your location so the order can be delivered.", path: ["deliveryLat"] },
  )
  .refine((v) => v.fulfillment !== "rr_delivery" || !!v.deliveryZoneId, {
    message: "Choose the area we are delivering to.",
    path: ["deliveryZoneId"],
  });

export const cartResolveSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(50),
});

// Merchants may only receive payments by Direct Bank Transfer (or cash in
// person). Bank details are required whenever bank transfer is switched on —
// mirrored by a CHECK constraint on store_payment_settings so the rule holds
// even if this route were bypassed.
export const paymentSettingsSchema = z
  .object({
    acceptsCash: z.boolean(),
    acceptsBankTransfer: z.boolean(),
    bankName: z.string().trim().max(120).optional().or(z.literal("")),
    accountHolder: z.string().trim().max(200).optional().or(z.literal("")),
    accountNumber: z.string().trim().max(64).optional().or(z.literal("")),
    paymentInstructions: z.string().trim().max(1000).optional().or(z.literal("")),
    requireReceipt: z.boolean(),
    // The platform owns the delivery FEE and ETA; a shop only chooses whether
    // it takes part in the Roulé Rodrigues delivery network at all.
    offersRrDelivery: z.boolean(),
  })
  .refine((v) => v.acceptsCash || v.acceptsBankTransfer, {
    message: "Enable at least one payment method.",
    path: ["acceptsCash"],
  })
  .refine(
    (v) => !v.acceptsBankTransfer || (!!v.bankName?.trim() && !!v.accountHolder?.trim() && !!v.accountNumber?.trim()),
    { message: "Bank name, account holder and account number are all required for bank transfer.", path: ["bankName"] },
  );

export const submitReceiptSchema = z.object({
  receiptPath: z.string().trim().max(300).optional(),
});
