import {
  BedDouble,
  Bike,
  Camera,
  Car,
  CarTaxiFront,
  Compass,
  ConciergeBell,
  Crown,
  Fish,
  Flower2,
  Hammer,
  Heart,
  Landmark,
  Mountain,
  PlaneLanding,
  Sailboat,
  ShoppingBag,
  TreePalm,
  UtensilsCrossed,
  Waves,
} from "lucide-react";

// Quick-action icon keys, chosen from the same lucide set the rest of the app
// uses so nothing looks imported from a different design language.
//
// ── THE KEYS ARE STORED CONTENT ─────────────────────────────────────────────
// The admin saves the KEY, not the icon, so renaming one orphans whatever
// content refers to it. Add; never rename. `curated` is the one exception: it
// pointed at Sparkles, and a sparkle is now the universal "this was written by
// a machine" mark — the last thing to put on a page whose entire claim is that
// a person chose these things. It is a crown, which is what the owner drew.
export const CURATED_ICONS: Record<string, React.ElementType> = {
  // Where you sleep, eat, and are taken
  stay: BedDouble,
  experience: TreePalm,
  eat: UtensilsCrossed,
  dining: UtensilsCrossed,
  shop: ShoppingBag,
  transfer: PlaneLanding,
  taxi: CarTaxiFront,
  concierge: ConciergeBell,

  // What you rent — the core of this business, and missing from the first cut
  car: Car,
  scooter: Bike,

  // The island itself
  lagoon: Waves,
  hike: Mountain,
  fish: Fish,
  boat: Sailboat,
  view: Camera,
  village: Landmark,

  // Made and felt
  craft: Hammer,
  wellness: Flower2,
  loved: Heart,

  curated: Crown,
  compass: Compass,
};

export const CURATED_ICON_KEYS = Object.keys(CURATED_ICONS);

export function curatedIcon(key: string): React.ElementType {
  return CURATED_ICONS[key] ?? Compass;
}
