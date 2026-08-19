import { z } from "zod";
import { DIETARY_TAGS, MEAL_TIMES } from "@/lib/food/types";

// Validation for the Food Operations admin.
//
// Everything the operator can write passes through here before it reaches the
// service-role client. The database has its own CHECK constraints on the same
// facts (prep ranges, spice bounds, the availability-window pair, the sold-out
// reason) — this is the layer that produces a SENTENCE instead of a Postgres
// error string, not the layer that makes the rule true.

/** Money arrives from the form in rupees and is stored in minor units. */
export const priceMinorSchema = z
  .number()
  .int("Use whole cents.")
  .min(0, "A price cannot be negative.")
  // Rs 100,000 for one dish is a slipped decimal, not a menu item.
  .max(10_000_000, "That price looks wrong — check the decimal point.");

/**
 * Slugs are generated from the name, but the operator can override them, and an
 * override becomes a permanent public URL. Restricted to what survives a URL,
 * an email and a WhatsApp message unescaped.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "A web address needs at least two characters.")
  .max(80, "That web address is too long.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and single hyphens only.");

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 07:30.");

// ── Kitchens ────────────────────────────────────────────────────────────────
// A kitchen is a store plus a cooker. The two halves are written together here
// and land in two tables: the public half in stores/food_kitchens, the cooker's
// name and number in food_kitchen_ops, which no public policy can reach.
// The FIELDS, with no cross-field rules attached.
//
// Zod refuses `.partial()` on a schema carrying refinements, and a PATCH must
// be partial — so the shape and the rules are kept apart deliberately. The
// create schema is this plus its rules; the patch schema is this partial, with
// the same rules re-applied but only when both halves of a pair are actually
// present. Writing the fields twice would be the alternative, and the second
// copy is where they drift.
const kitchenFields = z.object({
    name: z.string().trim().min(2, "The kitchen needs a name.").max(120),
    slug: slugSchema.optional(),
    tagline: z.string().trim().max(160).optional().or(z.literal("")),
    address: z.string().trim().max(300).optional().or(z.literal("")),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    // M95 — the PUBLIC number a customer messages. Distinct from cookerPhone,
    // which is operational and lives in the RLS-protected ops table.
    whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
    lat: z.number().min(-90).max(90).optional().nullable(),
    lng: z.number().min(-180).max(180).optional().nullable(),

    prepMinutesMin: z.number().int().min(0).max(480),
    prepMinutesMax: z.number().int().min(0).max(480),
    pickupHint: z.string().trim().max(300).optional().or(z.literal("")),
    position: z.number().int().min(0).max(999).optional(),

    // Operational half — never rendered to a customer.
    cookerName: z.string().trim().max(120).optional().or(z.literal("")),
    cookerPhone: z.string().trim().max(40).optional().or(z.literal("")),
    cookerNotes: z.string().trim().max(2000).optional().or(z.literal("")),

    // draft hides the whole kitchen and every dish in it in one move — the
    // "the cooker is ill today" button.
  status: z.enum(["draft", "active", "paused"]).optional(),
  offersRrDelivery: z.boolean().optional(),

  // Halal is a property of the KITCHEN, not of a recipe — the surfaces, the
  // oil, the knives, what else this cook prepares. The dish-level `halal`
  // dietary tag describes an ingredient list; this attests to a place, and it
  // is attested BY somebody. See checkKitchenPairs and the matching database
  // CHECK: certified is not a thing you can be anonymously.
  halalCertified: z.boolean().optional(),
  halalCertifier: z.string().trim().max(160).optional().or(z.literal("")),
});

/** The cross-field rules, applied only when both halves are present. */
function checkKitchenPairs(
  v: {
    prepMinutesMin?: number;
    prepMinutesMax?: number;
    lat?: number | null;
    lng?: number | null;
    halalCertified?: boolean;
    halalCertifier?: string;
  },
  ctx: z.RefinementCtx,
) {
  // "Certified" with nobody behind it is not a certification, it is the word.
  // The database refuses this too — the rule is here as well so the operator
  // gets a sentence in the form rather than a constraint violation.
  if (v.halalCertified === true && !(v.halalCertifier ?? "").trim()) {
    ctx.addIssue({
      code: "custom",
      message: "Name who certified this kitchen — a certification with no issuer is only a claim.",
      path: ["halalCertifier"],
    });
  }

  if (
    v.prepMinutesMin !== undefined &&
    v.prepMinutesMax !== undefined &&
    v.prepMinutesMax < v.prepMinutesMin
  ) {
    ctx.addIssue({
      code: "custom",
      message: "The longest prep time must not be shorter than the shortest.",
      path: ["prepMinutesMax"],
    });
  }
  // A GPS pin is either complete or absent; half a coordinate points at the
  // Gulf of Guinea.
  if (v.lat !== undefined && v.lng !== undefined && (v.lat == null) !== (v.lng == null)) {
    ctx.addIssue({
      code: "custom",
      message: "Set both latitude and longitude, or neither.",
      path: ["lat"],
    });
  }
}

export const kitchenSchema = kitchenFields.superRefine(checkKitchenPairs);

export const kitchenPatchSchema = kitchenFields
  .partial()
  .extend({ storeId: z.string().uuid() })
  .superRefine(checkKitchenPairs);

// ── Categories ──────────────────────────────────────────────────────────────
export const foodCategorySchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, "The category needs a name.").max(60),
  nameFr: z.string().trim().max(60).optional().or(z.literal("")),
  nameCr: z.string().trim().max(60).optional().or(z.literal("")),
  emoji: z.string().trim().max(8).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  position: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const foodCategoryPatchSchema = z
  .object({ id: z.string().uuid() })
  .and(foodCategorySchema.partial());

// ── Dishes ──────────────────────────────────────────────────────────────────
const variantSchema = z.object({
  // Present when editing an existing size; absent when adding one.
  id: z.string().uuid().optional(),
  // Null/empty is the DEFAULT variant — a dish that is simply a dish.
  name: z.string().trim().max(80).optional().or(z.literal("")),
  price: priceMinorSchema,
  // Today's portions. Separate from daily_capacity because the operator often
  // wants "there are four left right now" without changing what tomorrow's
  // reset will restock to.
  stock: z.number().int().min(0).max(100_000),
  position: z.number().int().min(0).max(99).optional(),
  isActive: z.boolean().optional(),
});

// Same split as the kitchen above: the FIELDS here, the cross-field rules
// below, so the patch schema can be `.partial()` without losing them.
const foodItemFields = z.object({
    kitchenId: z.string().uuid("Choose which kitchen cooks this."),
    name: z.string().trim().min(2, "The dish needs a name.").max(140),
    slug: slugSchema.optional(),
    descriptor: z.string().trim().max(160).optional().or(z.literal("")),
    descriptorFr: z.string().trim().max(160).optional().or(z.literal("")),
    descriptorCr: z.string().trim().max(160).optional().or(z.literal("")),
    description: z.string().trim().max(4000).optional().or(z.literal("")),
    allergens: z.string().trim().max(500).optional().or(z.literal("")),

    categories: z.array(z.string().trim().max(80)).max(6, "Six categories is plenty.").optional(),
    dietary: z.array(z.enum(DIETARY_TAGS)).max(8).optional(),
    mealTimes: z.array(z.enum(MEAL_TIMES)).max(4).optional(),

    spiceLevel: z.number().int().min(0).max(3).optional(),
    serves: z.number().int().min(1).max(20).optional().nullable(),

    // Null on BOTH means "inherit the kitchen" — which is why they are validated
    // as a pair rather than defaulted here. Defaulting them would silently
    // freeze this dish at today's kitchen estimate.
    prepMinutesMin: z.number().int().min(0).max(480).optional().nullable(),
    prepMinutesMax: z.number().int().min(0).max(480).optional().nullable(),

    isSignature: z.boolean().optional(),
    position: z.number().int().min(0).max(9999).optional(),

    // 0 = Sunday, matching store_hours.weekday and Postgres extract(dow).
    availableDays: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
    availableFrom: timeSchema.optional().nullable(),
    availableUntil: timeSchema.optional().nullable(),

    dailyCapacity: z.number().int().min(0).max(100_000).optional().nullable(),

    status: z.enum(["draft", "active", "archived"]).optional(),
    // At least one. A dish with no variant has no price and cannot be bought.
    variants: z.array(variantSchema).min(1, "A dish needs at least one price.").max(12),
  images: z.array(z.string().trim().max(500)).max(8).optional(),
});

type DishPairs = {
  prepMinutesMin?: number | null;
  prepMinutesMax?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  variants?: { name?: string }[];
};

/**
 * The cross-field rules, written once and applied to both the create and the
 * patch schema.
 *
 * Each pair is only checked when BOTH sides are present in the payload —
 * otherwise a PATCH that only touches the dish's name would be rejected for not
 * also restating its serving window.
 */
function checkDishPairs(v: DishPairs, ctx: z.RefinementCtx) {
  const prepTouched = v.prepMinutesMin !== undefined || v.prepMinutesMax !== undefined;
  if (prepTouched) {
    // Null on BOTH means "inherit the kitchen", which is why this is a pair and
    // not two independent optional numbers.
    if ((v.prepMinutesMin ?? null) === null !== ((v.prepMinutesMax ?? null) === null)) {
      ctx.addIssue({
        code: "custom",
        message: "Set both prep times, or leave both blank to use the kitchen's.",
        path: ["prepMinutesMin"],
      });
    } else if (
      v.prepMinutesMin != null &&
      v.prepMinutesMax != null &&
      v.prepMinutesMax < v.prepMinutesMin
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The longest prep time must not be shorter than the shortest.",
        path: ["prepMinutesMax"],
      });
    }
  }

  const windowTouched = v.availableFrom !== undefined || v.availableUntil !== undefined;
  if (windowTouched && ((v.availableFrom ?? null) === null) !== ((v.availableUntil ?? null) === null)) {
    ctx.addIssue({
      code: "custom",
      message: "Set both a start and an end time, or leave both blank to serve it all day.",
      path: ["availableFrom"],
    });
  }

  // Named sizes or a single unnamed one — never a mix. "Large" sitting beside a
  // nameless variant gives the customer a chooser with a blank option in it.
  if (v.variants && v.variants.length > 1 && !v.variants.every((x) => (x.name ?? "").trim().length > 0)) {
    ctx.addIssue({
      code: "custom",
      message: "Give every size a name when a dish has more than one.",
      path: ["variants"],
    });
  }
}

export const foodItemSchema = foodItemFields.superRefine(checkDishPairs);

export const foodItemPatchSchema = foodItemFields
  .partial()
  .extend({ productId: z.string().uuid() })
  .superRefine(checkDishPairs);

// ── The two one-tap operational actions ─────────────────────────────────────
// These exist as their own tiny endpoints rather than as a corner of the full
// dish form because they are used mid-service, on a phone, by someone standing
// up: "we've run out" and "we've made more".
export const soldOutSchema = z.object({
  productId: z.string().uuid(),
  // Null clears the mark. Otherwise a timestamp — sold-out is a fact with an
  // end, so it switches itself back on and nobody has to remember.
  until: z.string().datetime().nullable(),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});

export const restockSchema = z.object({
  // Absent = every kitchen. Present = just this one, for a cooker who arrived
  // late and whose dishes should not have been reset with everyone else's.
  storeId: z.string().uuid().optional(),
});
